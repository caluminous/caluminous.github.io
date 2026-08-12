/* Cast — location, venue discovery and weather.

   Three keyless, no-account data sources, and nothing else leaves the device:
     postcodes.io      postcode / place search and reverse geocoding (which country am I in)
     Overpass / OSM    real water features near the angler
     Open-Meteo        forecast, temperature and barometric pressure

   Every call is cached in localStorage so the app keeps working on a bank with no signal. */
(function (G) {
  'use strict';

  const MILES_PER_KM = 0.621371;
  /* Several mirrors, because these are free shared services that rate-limit and queue.
     One being busy should not mean the angler sees an empty map. */
  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
  ];

  /* ------------------------------------------------------------------ distance */

  function haversineMiles(a, b) {
    const R = 6371; /* km */
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const la1 = toRad(a.lat), la2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)) * MILES_PER_KM;
  }

  /* Deliberately crude, and labelled as an estimate everywhere it is shown: straight-line
     distance padded for real roads, at an average that suits mixed A-road and lane driving. */
  function driveMinutes(miles) {
    return Math.max(3, Math.round((miles * 1.3) / 32 * 60) + 4);
  }

  /* -------------------------------------------------------------------- fetch */

  async function getJson(url, { timeout = 12000, method = 'GET', body = null } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method, body, signal: ctrl.signal,
        headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
      });
      if (!res.ok) throw new Error(url + ' returned ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* Serve from cache when it is fresh; fall back to a stale copy when the network fails,
     and tell the caller it is stale so the UI can say so rather than lying. */
  async function cached(key, ttlMs, fetcher) {
    const hit = G.store.cacheRead(key);
    if (hit && !hit.stale) return { value: hit.value, stale: false, fromCache: true };
    try {
      const value = await fetcher();
      G.store.cacheWrite(key, value, ttlMs);
      return { value, stale: false, fromCache: false };
    } catch (err) {
      if (hit) return { value: hit.value, stale: true, fromCache: true, error: err };
      throw err;
    }
  }

  /* --------------------------------------------------------------- where am I */

  const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
  const OUTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

  function currentPosition({ timeout = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This device has no location support.'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          label: 'Where you are now'
        }),
        (err) => reject(new Error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was refused. Type a postcode instead.'
            : 'Could not get a location fix. Type a postcode instead.'
        )),
        { enableHighAccuracy: true, timeout, maximumAge: 120000 }
      );
    });
  }

  /* Which country the angler is standing in decides which licence rules apply, so this
     is a legal question, not a cosmetic one. postcodes.io answers it for the whole UK. */
  async function countryAt(lat, lon) {
    const key = `country:${lat.toFixed(2)},${lon.toFixed(2)}`;
    try {
      const { value } = await cached(key, 30 * 24 * 3600e3, async () => {
        const j = await getJson(`https://api.postcodes.io/postcodes?lon=${lon}&lat=${lat}&limit=1&radius=20000`);
        return (j.result && j.result[0] && j.result[0].country) || null;
      });
      return value;
    } catch (e) {
      /* Offline, or an offshore mark with no postcode nearby. Fall back to a rough
         geographic guess and let the UI flag that it is unconfirmed. */
      if (lat > 55.9 || (lat > 54.9 && lon < -2.2)) return 'Scotland';
      if (lat > 54.0 && lat < 55.4 && lon < -5.4) return 'Northern Ireland';
      if (lon < -2.65 && lat > 51.3 && lat < 53.5) return 'Wales';
      return 'England';
    }
  }

  async function search(query) {
    const q = String(query || '').trim();
    if (!q) throw new Error('Type a postcode or a place name.');

    if (POSTCODE_RE.test(q)) {
      const j = await getJson('https://api.postcodes.io/postcodes/' + encodeURIComponent(q.replace(/\s+/g, '')));
      const r = j.result;
      return { lat: r.latitude, lon: r.longitude, label: r.postcode, country: r.country };
    }
    if (OUTCODE_RE.test(q)) {
      const j = await getJson('https://api.postcodes.io/outcodes/' + encodeURIComponent(q));
      const r = j.result;
      return { lat: r.latitude, lon: r.longitude, label: r.outcode, country: (r.country || [])[0] || null };
    }
    const j = await getJson('https://api.postcodes.io/places?q=' + encodeURIComponent(q) + '&limit=1');
    const r = (j.result || [])[0];
    if (!r) throw new Error(`Nothing found for “${q}”. Try a postcode.`);
    return { lat: r.latitude, lon: r.longitude, label: r.name_1, country: r.country };
  }

  /* -------------------------------------------------- discovering real waters */

  /* Overpass gives genuine coverage anywhere in the country, which a hand-written list
     never could. What it cannot tell us is whether you are allowed to fish there — so
     everything from here is flagged unverified and the UI must keep saying so. */
  /* `out center 200` and not `out center tags 200`: the "tags" verbosity prints ids and
     tags but NO coordinates, which silently drops every node — and a great many fishing
     spots in OSM are nodes. Plain body verbosity gives nodes their lat/lon and ways a
     computed centre, which is exactly what the map needs. */
  /* Split deliberately into two queries rather than one.

     Phase 1 asks only for things explicitly tagged as fished. That tag set is tiny, so it
     comes back fast even when the free Overpass servers are busy — and it is the phase that
     actually answers "where can I fish". Phase 2 adds every named water, reservoir, river
     and canal, which is a far heavier spatial query over a 50 km radius.

     Running them separately means a slow or rate-limited phase 2 no longer takes the
     fisheries down with it. */
  function fishingQuery(lat, lon, radiusM) {
    const r = Math.round(radiusM);
    return `[out:json][timeout:60];
(
  nwr["leisure"="fishing"](around:${r},${lat},${lon});
  nwr["fishing"="yes"](around:${r},${lat},${lon});
  nwr["shop"="fishing"](around:${r},${lat},${lon});
);
out center 200;`;
  }

  function waterQuery(lat, lon, radiusM) {
    const r = Math.round(radiusM);
    return `[out:json][timeout:90];
(
  nwr["natural"="water"]["water"~"^(lake|pond|reservoir|lagoon|oxbow|basin)$"](around:${r},${lat},${lon});
  nwr["natural"="water"]["name"](around:${r},${lat},${lon});
  nwr["landuse"="reservoir"](around:${r},${lat},${lon});
  way["waterway"~"^(river|canal)$"]["name"](around:${r},${lat},${lon});
);
out center 250;`;
  }

  /* Name search. Restricting by a water/fishing tag first keeps this cheap even over a
     whole-UK bounding box, because those tag sets are small compared with the name index. */
  function overpassNameQuery(term) {
    const safe = term.replace(/[\\"\[\]{}()*+?.^$|]/g, '\\$&');
    const UK = '49.8,-8.7,61.0,2.1';
    return `[out:json][timeout:80][bbox:${UK}];
(
  nwr["leisure"="fishing"]["name"~"${safe}",i];
  nwr["fishing"="yes"]["name"~"${safe}",i];
  nwr["natural"="water"]["name"~"${safe}",i];
  nwr["landuse"="reservoir"]["name"~"${safe}",i];
  way["waterway"~"^(river|canal)$"]["name"~"${safe}",i];
);
out center 60;`;
  }

  function classifyOsm(tags) {
    if (tags.waterway === 'canal') return 'canal';
    if (tags.waterway === 'river') return 'river';
    if (tags.water === 'reservoir' || tags.landuse === 'reservoir') return 'reservoir';
    return 'stillwater';
  }

  const WATER_WORD = { canal: 'Canal', river: 'River', reservoir: 'Reservoir', stillwater: 'Water' };

  /* Turns raw Overpass elements into venues. Unnamed features are kept only when OSM
     explicitly says they are fished — an unnamed farm pond is noise, but an unnamed peg
     tagged leisure=fishing is exactly what an angler is looking for. */
  function toVenues(elements) {
    const seen = new Set();
    const venues = [];

    for (const el of (elements || [])) {
      const tags = el.tags || {};
      const pt = el.center || el;
      if (typeof pt.lat !== 'number' || typeof pt.lon !== 'number') continue;

      const type = classifyOsm(tags);
      const explicitlyFished = tags.leisure === 'fishing' || tags.fishing === 'yes';
      let name = tags.name || tags['name:en'] || null;
      if (!name) {
        if (!explicitlyFished) continue;
        name = 'Fishing spot' + (tags.operator ? ' — ' + tags.operator : '');
      }

      /* One canal is many OSM ways. Collapse by name, but only within roughly the same
         place, so two genuinely different "Mill Pond"s miles apart both survive. */
      const key = name.toLowerCase() + '@' + pt.lat.toFixed(1) + ',' + pt.lon.toFixed(1);
      if (seen.has(key)) continue;
      seen.add(key);

      venues.push({
        id: 'osm-' + el.type + el.id,
        name,
        type,
        lat: pt.lat,
        lon: pt.lon,
        ticket: null,
        rating: null,
        breakdown: null,
        species: [],
        facilities: tags['amenity'] === 'parking' ? ['parking'] : [],
        notes: [
          tags.operator ? 'Operated by ' + tags.operator + '.' : null,
          explicitlyFished ? 'Tagged as fishable in OpenStreetMap.' : `${WATER_WORD[type]} from OpenStreetMap — nobody has recorded whether it can be fished.`
        ].filter(Boolean).join(' '),
        url: tags.website || tags['contact:website'] || null,
        source: 'osm',
        fished: explicitlyFished,
        osmTags: tags,
        checked: null
      });
    }
    return venues;
  }

  /* Find waters by name across the whole UK — "Twynersh", "Bluebell Lakes", "River Wye". */
  async function searchByName(term) {
    const q = String(term || '').trim();
    if (q.length < 3) return [];
    const key = 'name:' + q.toLowerCase();
    const result = await cached(key, 7 * 24 * 3600e3,
      () => runOverpass(overpassNameQuery(q), 90000, {}));
    return toVenues(result.value.elements).filter((v) => v.name !== 'Fishing spot');
  }

  /* Try every mirror in turn, and report which one answered and how long it took, so a
     failure can be shown to the angler instead of vanishing into an empty list. */
  async function runOverpass(query, timeout, diag) {
    const body = 'data=' + encodeURIComponent(query);
    let lastErr;
    for (const endpoint of OVERPASS) {
      const started = Date.now();
      try {
        const json = await getJson(endpoint, { method: 'POST', body, timeout });
        diag.endpoint = endpoint.replace('https://', '').split('/')[0];
        diag.ms = Date.now() - started;
        return json;
      } catch (e) {
        lastErr = e;
        diag.tried = (diag.tried || []).concat(
          `${endpoint.replace('https://', '').split('/')[0]}: ${e.name === 'AbortError' ? 'timed out' : e.message}`
        );
      }
    }
    throw lastErr;
  }

  /* Phase 1 (fishing-tagged) and phase 2 (all named water) are fetched and cached
     independently. `onPartial` fires as soon as phase 1 lands so the list can paint
     before the slower query finishes — or instead of it, if it never does. */
  async function discoverVenues(lat, lon, radiusMiles, { onPartial } = {}) {
    /* Capped: an `around` search over water tags gets expensive fast, and Overpass is a
       free shared service. Beyond this the seed list carries the distance. */
    const radiusM = Math.min(radiusMiles / MILES_PER_KM * 1000, 50000);
    const at = `${lat.toFixed(2)},${lon.toFixed(2)}:${Math.round(radiusM / 1000)}`;
    const diag = { fishing: {}, water: {}, at, radiusKm: Math.round(radiusM / 1000) };

    let venues = [];
    let stale = false;
    let fromCache = false;

    /* The client abort MUST be longer than the server-side [timeout:] in the query.
       Aborting first means the server was never given the time its own query asked for. */
    try {
      const res = await cached('osmfish:' + at, 7 * 24 * 3600e3,
        () => runOverpass(fishingQuery(lat, lon, radiusM), 70000, diag.fishing));
      venues = toVenues(res.value.elements);
      stale = stale || res.stale;
      fromCache = fromCache || res.fromCache;
      diag.fishing.count = venues.length;
      diag.fishing.ok = true;
      if (onPartial && venues.length) onPartial({ venues, stale, fromCache, diag });
    } catch (e) {
      diag.fishing.ok = false;
      diag.fishing.error = e.name === 'AbortError' ? 'timed out' : e.message;
    }

    try {
      const res = await cached('osmwater:' + at, 7 * 24 * 3600e3,
        () => runOverpass(waterQuery(lat, lon, radiusM), 100000, diag.water));
      const more = toVenues(res.value.elements);
      const seen = new Set(venues.map((v) => v.id));
      venues = venues.concat(more.filter((v) => !seen.has(v.id)));
      stale = stale || res.stale;
      fromCache = fromCache || res.fromCache;
      diag.water.count = more.length;
      diag.water.ok = true;
    } catch (e) {
      diag.water.ok = false;
      diag.water.error = e.name === 'AbortError' ? 'timed out' : e.message;
    }

    if (!diag.fishing.ok && !diag.water.ok) {
      const err = new Error('Overpass did not answer: ' + (diag.fishing.error || diag.water.error));
      err.diag = diag;
      throw err;
    }
    return { venues, stale, fromCache, diag };
  }

  /* ------------------------------------------------------------------ weather */

  async function forecast(lat, lon) {
    const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
      + '&hourly=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,surface_pressure'
      + '&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min'
      + '&forecast_days=3&past_days=1&timezone=auto';

    const result = await cached(key, 90 * 60e3, () => getJson(url));
    return { data: result.value, stale: result.stale, fromCache: result.fromCache };
  }

  G.geo = {
    haversineMiles, driveMinutes, currentPosition, countryAt, search, searchByName,
    discoverVenues, forecast, getJson, MILES_PER_KM, POSTCODE_RE, OUTCODE_RE
  };
})(window.Cast = window.Cast || {});

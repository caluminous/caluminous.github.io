/* Cast — views and wiring. */
(function (G) {
  'use strict';

  const { h, esc, icon, starsHtml, starPicker, scoreRing, rigCard, facilityRow, bandClass, toast } = G.ui;
  const store = G.store;
  const T = G.tactics;
  const money = T.money;

  /* Runtime state. Anything worth keeping between visits lives in the store instead. */
  const A = {
    location: null,       /* { lat, lon, label, country } */
    forecast: null,
    conditions: null,
    osm: [],
    osmStale: false,
    osmError: null,
    loading: false,
    weatherStale: false,
    mapMode: false,
    selected: null,
    mapFitKey: null,
    view: null
  };

  let mapApi = null;
  let mapHost = null;

  const app = () => document.getElementById('app');

  /* ------------------------------------------------------------- venue list */

  function withOverrides(v) {
    const o = store.state.overrides[v.id];
    return o ? Object.assign({}, v, o) : v;
  }

  /* An OSM way called "Grand Union Canal" 400 m from the seeded entry for the same canal
     is the same water. Drop the duplicate rather than showing both. */
  function dedupe(seedList, osmList) {
    const tokens = (s) => new Set(String(s).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
    return osmList.filter((o) => !seedList.some((s) => {
      if (G.geo.haversineMiles(o, s) > 1.2) return false;
      const a = tokens(o.name), b = tokens(s.name);
      for (const t of a) if (b.has(t)) return true;
      return false;
    }));
  }

  function allVenues() {
    const seeds = G.data.VENUES.map(withOverrides);
    const custom = store.state.customVenues.map(withOverrides);
    const base = seeds.concat(custom);
    const osm = store.state.filters.includeOsm ? dedupe(base, A.osm).map(withOverrides) : [];
    const hidden = new Set(store.state.hiddenVenues);
    return base.concat(osm).filter((v) => !hidden.has(v.id));
  }

  function decorate(v) {
    const country = A.location && A.location.country || 'England';
    const closed = T.closeSeason(v, country);
    const dist = A.location ? G.geo.haversineMiles(A.location, v) : null;
    return Object.assign({}, v, {
      distance: dist,
      drive: dist == null ? null : G.geo.driveMinutes(dist),
      closed,
      fishable: !closed.closed
    });
  }

  function visibleVenues() {
    const f = store.state.filters;
    let list = allVenues().map(decorate);

    if (A.location) list = list.filter((v) => v.distance <= store.state.radiusMiles + 0.01);
    if (f.types.length) list = list.filter((v) => f.types.includes(v.type));
    if (f.maxPrice != null) list = list.filter((v) => v.ticket != null && v.ticket <= f.maxPrice);
    if (f.minRating) list = list.filter((v) => (T.ratingFor(v).display || 0) >= f.minRating);
    if (f.facilities.length) list = list.filter((v) => f.facilities.every((id) => (v.facilities || []).includes(id)));
    if (f.fishableOnly) list = list.filter((v) => v.fishable);

    const sort = store.state.sortBy;
    list.sort((a, b) => {
      if (sort === 'rating') return (T.ratingFor(b).display || 0) - (T.ratingFor(a).display || 0);
      if (sort === 'price') {
        const pa = a.ticket == null ? 1e6 : a.ticket, pb = b.ticket == null ? 1e6 : b.ticket;
        return pa - pb;
      }
      if (a.distance == null || b.distance == null) return 0;
      return a.distance - b.distance;
    });
    return list;
  }

  function topSpecies(venue, n = 3) {
    return T.rankSpecies(venue, A.conditions).filter((r) => r.score > 0).slice(0, n);
  }

  /* ------------------------------------------------------------- data loads */

  async function useLocation(loc, { refresh = true } = {}) {
    A.location = loc;
    store.patch({ lastLocation: Object.assign({}, loc, { at: Date.now() }) });
    if (!loc.country) {
      loc.country = await G.geo.countryAt(loc.lat, loc.lon).catch(() => 'England');
      store.patch({ lastLocation: Object.assign({}, loc, { at: Date.now() }) });
    }
    if (refresh) {
      render();
      await Promise.all([loadWeather(), loadOsm()]);
      render();
    }
  }

  async function locateMe() {
    A.loading = true; render();
    try {
      const pos = await G.geo.currentPosition();
      await useLocation(pos);
      toast('Found you. Showing waters near here.', 'good');
    } catch (err) {
      toast(err.message, 'warn');
      render();
    } finally {
      A.loading = false; render();
    }
  }

  async function searchPlace(query) {
    A.loading = true; render();
    try {
      const loc = await G.geo.search(query);
      await useLocation(loc);
      toast(`Showing waters near ${loc.label}.`, 'good');
    } catch (err) {
      toast(err.message || 'Could not find that place.', 'warn');
    } finally {
      A.loading = false; render();
    }
  }

  async function loadWeather() {
    if (!A.location) return;
    try {
      const { data, stale } = await G.geo.forecast(A.location.lat, A.location.lon);
      A.forecast = data;
      A.weatherStale = stale;
      A.conditions = T.readConditions(data);
    } catch (e) {
      A.forecast = null;
      A.conditions = T.readConditions(null);
    }
  }

  async function loadOsm() {
    if (!A.location || !store.state.filters.includeOsm) return;
    try {
      const res = await G.geo.discoverVenues(A.location.lat, A.location.lon, store.state.radiusMiles);
      A.osm = res.venues;
      A.osmStale = res.stale;
      A.osmError = null;
    } catch (e) {
      A.osm = [];
      A.osmError = 'Could not reach OpenStreetMap — showing the built-in venues only.';
    }
  }

  /* ------------------------------------------------------------------ router */

  function route() {
    const raw = (location.hash || '#/nearby').slice(2);
    const [path, queryString] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const query = new URLSearchParams(queryString || '');
    return { name: parts[0] || 'nearby', id: parts[1] ? decodeURIComponent(parts[1]) : null, query };
  }

  function go(hash) { location.hash = hash; }

  function render() {
    const r = route();
    A.view = r.name;
    const root = app();

    /* Keep the live map element out of the teardown so tiles are not refetched. */
    if (mapHost && mapHost.parentNode) mapHost.parentNode.removeChild(mapHost);
    root.innerHTML = '';

    const views = { nearby, venue: venueView, species: speciesView, rigs: rigsView, log: logView, you: youView };
    (views[r.name] || nearby)(root, r);

    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === (r.name === 'venue' || r.name === 'species' ? 'nearby' : r.name));
    });
    root.scrollTop = 0;
  }

  /* ------------------------------------------------------------ view: nearby */

  function nearby(root) {
    root.appendChild(locationBar());

    if (!A.location) {
      root.appendChild(welcome());
      return;
    }

    /* In map mode the map is the point, so the conditions card shrinks to one line
       rather than pushing the map below the fold. */
    root.appendChild(A.mapMode ? conditionsPill() : conditionsStrip());
    root.appendChild(controlsBar());

    const list = visibleVenues();
    const banner = staleBanner();
    if (banner) root.appendChild(banner);

    if (A.mapMode) {
      root.appendChild(mapSection(list));
    }

    if (!list.length) {
      root.appendChild(h('div', { class: 'empty' }, [
        h('p', { text: 'Nothing matches inside that radius.' }),
        h('p', { class: 'muted', text: 'Widen the search, clear a filter, or add a water you know about yourself.' }),
        h('button', { class: 'btn', text: 'Add a venue', onclick: () => go('#/you?add=1') })
      ]));
      return;
    }

    const head = h('div', { class: 'list-head' }, [
      h('span', { text: `${list.length} water${list.length === 1 ? '' : 's'} within ${store.state.radiusMiles} miles` }),
      h('span', { class: 'muted small', text: A.conditions && A.conditions.known ? T.PHASE_LABEL[A.conditions.phase] : '' })
    ]);
    root.appendChild(head);

    const ul = h('div', { class: 'venue-list' });
    list.slice(0, 80).forEach((v) => ul.appendChild(venueRow(v)));
    root.appendChild(ul);
    root.appendChild(provenanceNote());
  }

  function welcome() {
    const box = h('section', { class: 'card welcome' });
    box.innerHTML = `
      <h2>Where can I fish today?</h2>
      <p>Cast finds waters near you, works out what a day there legally costs, and tells you what to
         put on the end of the line.</p>
      <ul class="tick">
        <li>Real rod licence prices and close-season rules</li>
        <li>Species likelihood from the month, temperature and pressure</li>
        <li>Rig diagrams and ranked baits for every fish</li>
      </ul>`;
    const row = h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn primary', text: 'Use my location', onclick: locateMe }),
      h('button', { class: 'btn', text: 'Type a postcode', onclick: () => document.getElementById('placeInput').focus() })
    ]);
    box.appendChild(row);
    box.appendChild(h('p', { class: 'fineprint', text: 'Nothing is uploaded. Your location is used on this device to search OpenStreetMap and a weather forecast, and nothing else.' }));
    return box;
  }

  function locationBar() {
    const wrap = h('form', {
      class: 'location-bar',
      onsubmit: (e) => { e.preventDefault(); searchPlace(document.getElementById('placeInput').value); }
    });
    wrap.innerHTML = `
      <input id="placeInput" type="search" inputmode="search" autocomplete="postal-code"
             placeholder="Postcode or place" aria-label="Search by postcode or place"
             value="${esc(A.location && A.location.label && A.location.label !== 'Where you are now' ? A.location.label : '')}">
      <button type="submit" class="icon-btn" aria-label="Search">${icon('map', 18)}</button>
      <button type="button" id="locateBtn" class="icon-btn" aria-label="Use my location">${icon('pin', 18)}</button>`;
    wrap.querySelector('#locateBtn').addEventListener('click', locateMe);
    if (A.loading) wrap.classList.add('is-loading');
    return wrap;
  }

  function conditionsStrip() {
    const c = A.conditions;
    const bite = T.biteScore(c);
    const strip = h('section', { class: 'card conditions' });
    const bits = [];
    if (c && c.known) {
      if (c.tempC != null) bits.push(`${Math.round(c.tempC)} °C`);
      if (c.wind != null) bits.push(`${Math.round(c.wind)} km/h wind`);
      if (c.cloud != null) bits.push(`${Math.round(c.cloud)}% cloud`);
      if (c.pressure != null) {
        const tr = c.pressureTrend;
        const arrow = tr == null ? '' : tr <= -0.5 ? ' ↓' : tr >= 0.5 ? ' ↑' : ' →';
        bits.push(`${Math.round(c.pressure)} mb${arrow}`);
      }
    }
    strip.innerHTML = `
      <div class="cond-main">
        ${scoreRing(bite.score, 'bite score')}
        <div class="cond-text">
          <h3>${esc(bite.band)}</h3>
          <p class="muted small">${esc(bits.join(' · ') || 'No forecast loaded')}</p>
          ${bite.reasons[0] ? `<p class="cond-reason">${esc(bite.reasons[0].text)}</p>` : ''}
        </div>
      </div>`;
    const det = h('details', { class: 'cond-more' });
    det.appendChild(h('summary', { text: 'Why that score' }));
    const ul = h('ul', { class: 'reason-list' });
    bite.reasons.forEach((r) => {
      ul.appendChild(h('li', { class: r.sign > 0 ? 'up' : r.sign < 0 ? 'down' : 'flat', text: r.text }));
    });
    det.appendChild(ul);
    det.appendChild(h('p', { class: 'fineprint', text: 'Air temperature stands in for water temperature — water lags behind the air by days, so treat cold snaps and heatwaves as slower to bite than this suggests.' }));
    strip.appendChild(det);
    return strip;
  }

  function conditionsPill() {
    const c = A.conditions;
    const bite = T.biteScore(c);
    const bits = [];
    if (c && c.known) {
      if (c.tempC != null) bits.push(`${Math.round(c.tempC)} °C`);
      if (c.pressure != null) bits.push(`${Math.round(c.pressure)} mb`);
      bits.push(T.PHASE_LABEL[c.phase]);
    }
    return h('button', {
      class: 'cond-pill tone-' + bandClass(bite.band),
      'aria-label': 'Switch to the list to see the full conditions breakdown',
      onclick: () => { A.mapMode = false; render(); },
      html: `<strong>${bite.score == null ? '?' : bite.score}</strong>
             <span>${esc(bite.band)}</span>
             <span class="muted small">${esc(bits.join(' · ') || 'no forecast')}</span>`
    });
  }

  function controlsBar() {
    const bar = h('div', { class: 'controls' });

    const toggle = h('div', { class: 'seg', role: 'group', 'aria-label': 'List or map' }, [
      h('button', { class: 'seg-btn' + (!A.mapMode ? ' is-on' : ''), html: icon('list', 16) + '<span>List</span>',
        onclick: () => { A.mapMode = false; render(); } }),
      h('button', { class: 'seg-btn' + (A.mapMode ? ' is-on' : ''), html: icon('map', 16) + '<span>Map</span>',
        onclick: () => { A.mapMode = true; render(); } })
    ]);
    bar.appendChild(toggle);

    const sort = h('select', {
      class: 'select', 'aria-label': 'Sort by',
      onchange: (e) => { store.patch({ sortBy: e.target.value }); render(); }
    });
    [['distance', 'Nearest'], ['rating', 'Best rated'], ['price', 'Cheapest']].forEach(([v, l]) => {
      sort.appendChild(h('option', { value: v, text: l, selected: store.state.sortBy === v }));
    });
    bar.appendChild(sort);

    bar.appendChild(h('button', {
      class: 'btn small', html: icon('filter', 15) + `<span>Filters${activeFilterCount() ? ' (' + activeFilterCount() + ')' : ''}</span>`,
      onclick: openFilters
    }));
    return bar;
  }

  function activeFilterCount() {
    const f = store.state.filters;
    return f.types.length + f.facilities.length + (f.maxPrice != null ? 1 : 0) + (f.minRating ? 1 : 0) + (f.fishableOnly ? 1 : 0);
  }

  function staleBanner() {
    const msgs = [];
    if (A.osmError) msgs.push(A.osmError);
    if (A.osmStale) msgs.push('Showing cached OpenStreetMap results — you appear to be offline.');
    if (A.weatherStale) msgs.push('Forecast is from an earlier cache and may be out of date.');
    if (!msgs.length) return null;
    return h('div', { class: 'banner', html: icon('info', 16) + '<span>' + msgs.map(esc).join(' ') + '</span>' });
  }

  function provenanceNote() {
    return h('p', { class: 'fineprint prov' , html:
      'Day-ticket prices and star ratings on built-in venues are <strong>indicative editorial values</strong>, not quotes and not ' +
      'real review scores — always confirm with the fishery. Waters found on OpenStreetMap are marked unverified: ' +
      'their presence on a map is not permission to fish. Check local byelaws before you cast.' });
  }

  /* ------------------------------------------------------------------- map */

  function mapSection(list) {
    const section = h('section', { class: 'map-section' });
    if (!mapHost) {
      mapHost = h('div', { id: 'mapHost' });
      section.appendChild(mapHost);
      mapApi = G.createMap(mapHost, {
        lat: A.location.lat, lon: A.location.lon, zoom: 11,
        onSelect: (id) => { A.selected = id; renderPreview(section, list); },
        onLocate: locateMe
      });
    } else {
      section.appendChild(mapHost);
    }
    mapApi.setVenues(list);

    /* Re-frame whenever the results themselves change — a new search, a different radius,
       a filter — but never on a pan, zoom or pin tap, which would fight the angler. */
    const fitKey = (A.location.lat.toFixed(3) + ',' + A.location.lon.toFixed(3) + '|' +
                    store.state.radiusMiles + '|' + list.map((v) => v.id).join(','));
    if (fitKey !== A.mapFitKey) {
      A.mapFitKey = fitKey;
      /* Frame the nearest handful rather than the whole radius, so the map opens on
         something useful instead of a county-wide view of clustered dots. */
      mapApi.fit([{ lat: A.location.lat, lon: A.location.lon }].concat(list.slice(0, 6)));
    }
    mapApi.setUser({ lat: A.location.lat, lon: A.location.lon });
    mapApi.setRadius(store.state.radiusMiles);
    mapApi.setSelected(A.selected);
    requestAnimationFrame(() => mapApi.invalidate());

    renderPreview(section, list);
    return section;
  }

  function renderPreview(section, list) {
    const existing = section.querySelector('.map-preview');
    if (existing) existing.remove();
    if (!A.selected) return;
    const v = list.find((x) => x.id === A.selected);
    if (!v) return;

    const rating = T.ratingFor(v);
    const cost = T.costToday(v, A.location.country);
    const top = topSpecies(v, 3);
    const type = G.data.WATER_TYPES[v.type] || {};

    const sheet = h('div', { class: 'map-preview' });
    sheet.innerHTML = `
      <button class="preview-close" aria-label="Close">${icon('close', 16)}</button>
      <h3>${esc(v.name)}</h3>
      <div class="preview-meta">
        <span class="chip" style="--chip:${type.colour}">${esc(type.label || v.type)}</span>
        ${starsHtml(rating.display)}
        ${v.distance != null ? `<span class="muted small">${v.distance.toFixed(1)} mi · about ${v.drive} min</span>` : ''}
      </div>
      <div class="preview-cost">
        <strong>${cost.unknown && cost.total === 0 ? 'Cost not recorded' : money(cost.total) + (cost.unknown ? '+' : '') + ' today'}</strong>
        ${cost.unknown ? '<span class="muted small">plus costs we could not confirm</span>' : ''}
      </div>
      ${v.closed.closed ? `<p class="warn-line">${icon('warn', 14)} ${esc(v.closed.reason)}</p>` : ''}
      <div class="preview-species">
        ${top.length ? top.map((s) => `<span class="lk lk-${bandClass(s.band)}">${esc(s.species.name)} <em>${s.score}</em></span>`).join('')
                     : '<span class="muted small">No species recorded for this water.</span>'}
      </div>
      ${facilityRow(v.facilities, { max: 5 })}`;

    sheet.appendChild(h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn primary', text: 'Full details', onclick: () => go('#/venue/' + encodeURIComponent(v.id)) }),
      h('a', { class: 'btn', href: directionsUrl(v), target: '_blank', rel: 'noopener',
        html: icon('directions', 15) + '<span>Directions</span>' })
    ]));
    sheet.querySelector('.preview-close').addEventListener('click', () => {
      A.selected = null;
      mapApi.setSelected(null);
      renderPreview(section, list);
    });
    section.appendChild(sheet);
  }

  function directionsUrl(v) {
    return `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`;
  }

  /* --------------------------------------------------------------- rows */

  function venueRow(v) {
    const rating = T.ratingFor(v);
    const cost = T.costToday(v, (A.location && A.location.country) || 'England');
    const type = G.data.WATER_TYPES[v.type] || {};
    const top = topSpecies(v, 2);

    const row = h('button', {
      class: 'venue-row' + (v.closed.closed ? ' is-closed' : ''),
      onclick: () => go('#/venue/' + encodeURIComponent(v.id))
    });
    row.innerHTML = `
      <span class="row-bar" style="background:${type.colour || '#888'}"></span>
      <span class="row-main">
        <span class="row-title">
          <span class="row-name">${esc(v.name)}</span>
          ${v.source === 'osm' ? '<span class="tag tag-osm" title="Found on OpenStreetMap — access unverified">OSM</span>' : ''}
          ${v.source === 'own' ? '<span class="tag tag-own">Yours</span>' : ''}
        </span>
        <span class="row-sub">
          ${starsHtml(rating.display, { size: 12 })}
          <span class="dot">·</span>
          <span>${esc(type.short || v.type)}</span>
          ${v.distance != null ? `<span class="dot">·</span><span>${v.distance.toFixed(1)} mi</span>` : ''}
          ${v.drive != null ? `<span class="dot">·</span><span>${v.drive} min</span>` : ''}
        </span>
        <span class="row-species">
          ${top.map((s) => `<span class="lk lk-${bandClass(s.band)}">${esc(s.species.name)}</span>`).join('')}
          ${v.source === 'osm' ? '<span class="muted small">likely, unconfirmed</span>' : ''}
        </span>
      </span>
      <span class="row-cost">
        <strong>${cost.unknown && !cost.total ? '—' : money(cost.total) + (cost.unknown ? '+' : '')}</strong>
        <span class="muted small">${v.closed.closed ? 'closed' : cost.unknown ? 'known costs' : 'today'}</span>
      </span>`;
    return row;
  }

  /* ------------------------------------------------------------ view: venue */

  function findVenue(id) {
    return allVenues().map(decorate).find((v) => v.id === id) || null;
  }

  function venueView(root, r) {
    const v = findVenue(r.id);
    if (!v) {
      root.appendChild(h('div', { class: 'empty', text: 'That venue is no longer in the list.' }));
      root.appendChild(h('button', { class: 'btn', text: 'Back to nearby', onclick: () => go('#/nearby') }));
      return;
    }
    const country = (A.location && A.location.country) || 'England';
    const rating = T.ratingFor(v);
    const cost = T.costToday(v, country);
    const type = G.data.WATER_TYPES[v.type] || {};

    root.appendChild(backBar(v.name));

    /* header */
    const head = h('section', { class: 'card venue-head' });
    head.innerHTML = `
      <div class="vh-top">
        <div>
          <h2>${esc(v.name)}</h2>
          <p class="muted small">
            <span class="chip" style="--chip:${type.colour}">${esc(type.label || v.type)}</span>
            ${v.distance != null ? `${v.distance.toFixed(1)} miles away · about ${v.drive} minutes` : ''}
          </p>
        </div>
        <div class="vh-rating">
          ${starsHtml(rating.display, { size: 16 })}
          <span class="muted small">${rating.displayIsMine ? 'your rating' : rating.seed != null ? 'indicative' : 'not rated'}</span>
        </div>
      </div>`;
    if (v.notes) head.appendChild(h('p', { class: 'venue-notes', text: v.notes }));
    head.appendChild(h('div', { class: 'btn-row' }, [
      h('a', { class: 'btn', href: directionsUrl(v), target: '_blank', rel: 'noopener', html: icon('directions', 15) + '<span>Directions</span>' }),
      v.url ? h('a', { class: 'btn', href: v.url, target: '_blank', rel: 'noopener', text: 'Fishery website' }) : null,
      h('button', { class: 'btn', text: 'Log a catch', onclick: () => go('#/log?venue=' + encodeURIComponent(v.id)) })
    ].filter(Boolean)));
    root.appendChild(head);

    /* close season */
    if (v.closed.closed) {
      root.appendChild(h('div', { class: 'banner warn', html:
        icon('warn', 16) + `<span><strong>${esc(v.closed.reason)}</strong> ${esc(v.closed.note || '')}</span>` }));
    }

    /* cost */
    const costCard = h('section', { class: 'card cost-card' });
    costCard.innerHTML = `<h3>Before you cast</h3>
      <p class="licence-headline">${icon('badge', 16)} <strong>${esc(cost.licence.headline)}</strong></p>
      <p class="muted small">${esc(cost.licence.detail)}</p>`;
    const table = h('div', { class: 'cost-lines' });
    cost.lines.forEach((line) => {
      table.appendChild(h('div', { class: 'cost-line' , html:
        `<span class="cl-label">${esc(line.label)}</span>
         <span class="cl-amount">${line.amount == null ? '—' : money(line.amount)}</span>
         <span class="cl-note muted small">${esc(line.note || '')}</span>` }));
    });
    costCard.appendChild(table);
    costCard.appendChild(h('div', { class: 'cost-total', html:
      `<span>Total for today</span><strong>${money(cost.total)}${cost.unknown ? '<span class="muted small"> + unconfirmed</span>' : ''}</strong>` }));

    if (cost.licence.kind === 'ea') {
      const P = T.prices();
      const det = h('details', { class: 'licence-detail' });
      det.appendChild(h('summary', { text: 'Rod licence prices in full' }));
      const tbl = h('table', { class: 'price-table' });
      tbl.innerHTML = `<thead><tr><th>Licence</th><th>1 day</th><th>8 day</th><th>Year</th><th>Concession</th></tr></thead>
        <tbody>${P.types.map((t) => `<tr><td>${esc(t.label)}</td><td>${money(t.day)}</td><td>${money(t.week)}</td><td>${money(t.year)}</td><td>${money(t.concession)}</td></tr>`).join('')}</tbody>`;
      det.appendChild(tbl);
      P.notes.forEach((n) => det.appendChild(h('p', { class: 'fineprint', text: n })));
      det.appendChild(h('p', { class: 'fineprint', text: `Prices last checked ${P.checked}. They are reviewed every April — if these look wrong you can correct them in You → Licence prices.` }));
      det.appendChild(h('div', { class: 'btn-row' }, [
        h('a', { class: 'btn primary', href: P.buyUrl, target: '_blank', rel: 'noopener', text: 'Buy a rod licence' }),
        h('a', { class: 'btn', href: P.freeDayUrl, target: '_blank', rel: 'noopener', text: 'Free one-day licence scheme' })
      ]));
      costCard.appendChild(det);
    }
    root.appendChild(costCard);

    /* species */
    const ranked = T.rankSpecies(v, A.conditions);
    const spCard = h('section', { class: 'card' });
    spCard.appendChild(h('h3', { text: 'What is biting here today' }));
    if (!ranked.length) {
      spCard.appendChild(h('p', { class: 'muted', text: 'No species recorded for this water. Once you log a catch here it will show up in your own records.' }));
    } else {
      if (!ranked[0].confident) {
        spCard.appendChild(h('p', { class: 'fineprint', text: 'This water has no recorded stock list, so this is what a water of this type could plausibly hold — not a confirmed list.' }));
      }
      const wrap = h('div', { class: 'species-list' });
      ranked.slice(0, 10).forEach((res) => {
        const b = h('button', {
          class: 'species-row',
          onclick: () => go(`#/species/${res.species.id}?venue=${encodeURIComponent(v.id)}`)
        });
        b.innerHTML = `
          <span class="sp-name">${esc(res.species.name)}</span>
          <span class="sp-bar"><span class="sp-fill lk-${bandClass(res.band)}" style="width:${Math.max(3, res.score)}%"></span></span>
          <span class="sp-band lk-${bandClass(res.band)}">${esc(res.band)}</span>`;
        wrap.appendChild(b);
      });
      spCard.appendChild(wrap);
    }
    root.appendChild(spCard);

    /* facilities + rating + your history */
    const extra = h('section', { class: 'card' });
    extra.appendChild(h('h3', { text: 'The water' }));
    if (v.facilities && v.facilities.length) extra.appendChild(h('div', { html: facilityRow(v.facilities) }));
    else extra.appendChild(h('p', { class: 'muted small', text: 'No facilities recorded.' }));

    if (rating.breakdown) {
      const bd = h('div', { class: 'breakdown' });
      Object.entries({ stock: 'Stock', access: 'Access', facilities: 'Facilities', value: 'Value' }).forEach(([k, label]) => {
        const val = rating.breakdown[k];
        bd.appendChild(h('div', { class: 'bd-row', html:
          `<span>${label}</span><span class="bd-bar"><span style="width:${val / 5 * 100}%"></span></span><span class="muted small">${val}/5</span>` }));
      });
      extra.appendChild(bd);
      extra.appendChild(h('p', { class: 'fineprint', text: 'An editorial starting point, not real angler reviews.' }));
    }

    extra.appendChild(h('h4', { text: 'Your rating' }));
    extra.appendChild(starPicker(store.state.ratings[v.id] || 0, (stars) => { store.rate(v.id, stars); render(); }));

    const mine = store.catchesAt(v.id);
    if (mine.length) {
      extra.appendChild(h('p', { class: 'muted small', text:
        `You have logged ${mine.length} fish here across ${rating.mySessions} session${rating.mySessions === 1 ? '' : 's'}` +
        (rating.myBest && rating.myBest.weightLb ? `, best ${rating.myBest.weightLb} lb ${esc(rating.myBest.species || '')}.` : '.') }));
    }
    root.appendChild(extra);

    /* corrections */
    const fix = h('details', { class: 'card' });
    fix.appendChild(h('summary', { text: 'Something wrong here? Fix it' }));
    const form = h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const price = fd.get('ticket');
      store.override(v.id, {
        ticket: price === '' ? null : Number(price),
        notes: fd.get('notes') || v.notes
      });
      toast('Saved on this device.', 'good');
      render();
    } });
    form.innerHTML = `
      <label>Day ticket (£, blank for unknown)
        <input name="ticket" type="number" step="0.5" min="0" value="${v.ticket == null ? '' : v.ticket}">
      </label>
      <label>Notes
        <textarea name="notes" rows="3">${esc(v.notes || '')}</textarea>
      </label>`;
    form.appendChild(h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn primary', type: 'submit', text: 'Save correction' }),
      h('button', { class: 'btn', type: 'button', text: 'Hide this venue', onclick: () => {
        store.patch({ hiddenVenues: store.state.hiddenVenues.concat(v.id) });
        toast('Hidden. Undo in You → Hidden venues.', 'info');
        go('#/nearby');
      } })
    ]));
    fix.appendChild(form);
    fix.appendChild(h('p', { class: 'fineprint', text:
      v.source === 'osm' ? 'This water came from OpenStreetMap. It is a real water, but nobody has checked whether you may fish it.'
                         : `Built-in entry, last looked at ${v.checked || 'unknown'}. Corrections stay on this device.` }));
    root.appendChild(fix);
  }

  /* ---------------------------------------------------------- view: species */

  function speciesView(root, r) {
    const s = G.data.species(r.id);
    if (!s) { root.appendChild(h('div', { class: 'empty', text: 'Unknown species.' })); return; }
    const venueId = r.query.get('venue');
    const v = venueId ? findVenue(venueId) : null;

    root.appendChild(backBar(s.name, v ? '#/venue/' + encodeURIComponent(v.id) : '#/nearby'));

    const head = h('section', { class: 'card' });
    const res = v ? T.likelihood(s, v, A.conditions) : null;
    head.innerHTML = `
      <div class="sp-head">
        <div>
          <h2>${esc(s.name)}</h2>
          <p class="muted small"><em>${esc(s.latin)}</em></p>
        </div>
        ${res ? scoreRing(res.score, 'right now') : ''}
      </div>
      ${res ? `<p class="band-line lk-${bandClass(res.band)}">${esc(res.band)}${v ? ' at ' + esc(v.name) : ''}</p>` : ''}`;
    if (res) {
      const ul = h('ul', { class: 'reason-list' });
      res.reasons.forEach((x) => ul.appendChild(h('li', { class: x.sign > 0 ? 'up' : x.sign < 0 ? 'down' : 'flat', text: x.text })));
      head.appendChild(ul);
      if (!res.confident) head.appendChild(h('p', { class: 'fineprint', text: 'This water has no recorded stock list — treat the species as plausible rather than confirmed.' }));
    }
    root.appendChild(head);

    const tac = T.tacticsFor(s, A.conditions);

    /* tackle */
    const tackle = h('section', { class: 'card' });
    tackle.innerHTML = `<h3>Terminal tackle</h3>
      <dl class="kv">
        <div><dt>Hook</dt><dd>${esc(s.hook)}</dd></div>
        <div><dt>Mainline</dt><dd>${esc(s.mainline)}</dd></div>
        <div><dt>Hooklength</dt><dd>${esc(s.hooklength)}</dd></div>
        <div><dt>Where</dt><dd>${esc(s.depth)}</dd></div>
      </dl>
      <p class="how">${esc(s.how)}</p>`;
    root.appendChild(tackle);

    /* baits */
    const baits = h('section', { class: 'card' });
    baits.appendChild(h('h3', { text: 'Baits, best first' }));
    const bl = h('ol', { class: 'bait-list' });
    s.baits.forEach(([name, why]) => {
      bl.appendChild(h('li', {}, [
        h('strong', { text: name }),
        h('span', { class: 'muted small', text: why })
      ]));
    });
    baits.appendChild(bl);
    root.appendChild(baits);

    /* conditions notes */
    if (tac.notes.length) {
      const notes = h('section', { class: 'card' });
      notes.appendChild(h('h3', { text: 'Right now' }));
      tac.notes.forEach((n) => {
        notes.appendChild(h('div', { class: 'note' + (n.warn ? ' note-warn' : ''), html:
          `${icon(n.warn ? 'warn' : 'info', 15)}<span><strong>${esc(n.tag)}.</strong> ${esc(n.text)}</span>` }));
      });
      root.appendChild(notes);
    }

    /* rigs */
    const rigs = h('section', { class: 'card' });
    rigs.appendChild(h('h3', { text: 'Rigs' }));
    tac.rigs.forEach((rg, i) => rigs.appendChild(rigCard(rg, { open: i === 0 })));
    root.appendChild(rigs);

    root.appendChild(h('div', { class: 'btn-row pad' }, [
      h('button', { class: 'btn primary', text: 'Log a catch',
        onclick: () => go('#/log?species=' + s.id + (v ? '&venue=' + encodeURIComponent(v.id) : '')) })
    ]));
  }

  /* ------------------------------------------------------------- view: rigs */

  function rigsView(root) {
    root.appendChild(h('h2', { class: 'page-title', text: 'Rigs' }));
    root.appendChild(h('p', { class: 'muted pad-x', text: 'Every rig the app recommends, drawn the same way so you can compare them.' }));

    const search = h('input', { class: 'search', type: 'search', placeholder: 'Search rigs', 'aria-label': 'Search rigs' });
    root.appendChild(search);

    const listWrap = h('div', { class: 'card' });
    root.appendChild(listWrap);

    function paint(term) {
      listWrap.innerHTML = '';
      const t = (term || '').toLowerCase();
      const rigs = G.data.RIGS.filter((rg) => !t || rg.name.toLowerCase().includes(t) || rg.use.toLowerCase().includes(t));
      if (!rigs.length) { listWrap.appendChild(h('p', { class: 'muted', text: 'No rigs match that.' })); return; }
      rigs.forEach((rg) => listWrap.appendChild(rigCard(rg)));
    }
    search.addEventListener('input', () => paint(search.value));
    paint('');
  }

  /* -------------------------------------------------------------- view: log */

  function logView(root, r) {
    root.appendChild(h('h2', { class: 'page-title', text: 'Catch log' }));

    const catches = store.state.catches;
    const form = h('details', { class: 'card', open: catches.length === 0 || r.query.has('venue') || r.query.has('species') });
    form.appendChild(h('summary', { text: 'Log a catch' }));

    const f = h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const venueId = fd.get('venue');
      const venue = venueId ? findVenue(venueId) : null;
      store.addCatch({
        date: fd.get('date'),
        species: fd.get('species'),
        venueId: venueId || null,
        venueName: venue ? venue.name : (fd.get('venueName') || ''),
        weightLb: fd.get('weight') ? Number(fd.get('weight')) : null,
        bait: fd.get('bait') || '',
        rig: fd.get('rig') || '',
        notes: fd.get('notes') || '',
        conditions: A.conditions && A.conditions.known ? {
          tempC: A.conditions.tempC, pressure: A.conditions.pressure,
          cloud: A.conditions.cloud, wind: A.conditions.wind, phase: A.conditions.phase
        } : null
      });
      toast('Logged.', 'good');
      go('#/log');
      render();
    } });

    const venues = visibleVenues();
    const preVenue = r.query.get('venue') || '';
    const preSpecies = r.query.get('species') || '';

    f.innerHTML = `
      <label>Date<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
      <label>Species
        <select name="species" required>
          ${G.data.SPECIES.map((s) => `<option value="${s.name}" ${s.id === preSpecies ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          <option value="Other">Other</option>
        </select>
      </label>
      <label>Venue
        <select name="venue">
          <option value="">— not listed —</option>
          ${venues.map((v) => `<option value="${esc(v.id)}" ${v.id === preVenue ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
        </select>
      </label>
      <label>Weight (lb)<input name="weight" type="number" step="0.01" min="0" inputmode="decimal"></label>
      <label>Bait<input name="bait" type="text" placeholder="e.g. double red maggot"></label>
      <label>Rig
        <select name="rig">
          <option value="">—</option>
          ${G.data.RIGS.map((rg) => `<option value="${esc(rg.name)}">${esc(rg.name)}</option>`).join('')}
        </select>
      </label>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>`;
    f.appendChild(h('button', { class: 'btn primary', type: 'submit', text: 'Save catch' }));
    form.appendChild(f);
    root.appendChild(form);

    if (!catches.length) {
      root.appendChild(h('p', { class: 'muted pad-x', text: 'Nothing logged yet. Once you have a few entries the app can show what is actually working for you.' }));
      return;
    }

    /* what is working for this angler */
    const byBait = {};
    catches.forEach((c) => { if (c.bait) byBait[c.bait] = (byBait[c.bait] || 0) + 1; });
    const bestBaits = Object.entries(byBait).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const heaviest = catches.reduce((b, c) => (c.weightLb && (!b || c.weightLb > b.weightLb) ? c : b), null);

    const stats = h('section', { class: 'card' });
    stats.innerHTML = `<h3>Your record</h3>
      <div class="stat-row">
        <div><strong>${catches.length}</strong><span>fish logged</span></div>
        <div><strong>${new Set(catches.map((c) => c.venueName || c.venueId)).size}</strong><span>waters</span></div>
        <div><strong>${heaviest && heaviest.weightLb ? heaviest.weightLb + ' lb' : '—'}</strong><span>best fish</span></div>
      </div>
      ${bestBaits.length ? `<p class="muted small">Your most productive baits: ${bestBaits.map(([b, n]) => `${esc(b)} (${n})`).join(', ')}.</p>` : ''}`;
    root.appendChild(stats);

    const list = h('div', { class: 'card' });
    catches.forEach((c) => {
      const item = h('div', { class: 'log-item' });
      item.innerHTML = `
        <div class="log-main">
          <strong>${esc(c.species)}${c.weightLb ? ' · ' + c.weightLb + ' lb' : ''}</strong>
          <span class="muted small">${esc(c.venueName || 'Unrecorded water')} · ${esc(c.date)}</span>
          ${c.bait || c.rig ? `<span class="muted small">${esc([c.bait, c.rig].filter(Boolean).join(' · '))}</span>` : ''}
          ${c.notes ? `<span class="log-notes">${esc(c.notes)}</span>` : ''}
          ${c.conditions ? `<span class="muted small">${Math.round(c.conditions.tempC)} °C · ${Math.round(c.conditions.pressure)} mb · ${esc(T.PHASE_LABEL[c.conditions.phase] || '')}</span>` : ''}
        </div>`;
      item.appendChild(h('button', { class: 'icon-btn', 'aria-label': 'Delete entry', html: icon('close', 15),
        onclick: () => { store.removeCatch(c.id); render(); } }));
      list.appendChild(item);
    });
    root.appendChild(list);
  }

  /* -------------------------------------------------------------- view: you */

  function youView(root, r) {
    root.appendChild(h('h2', { class: 'page-title', text: 'You' }));
    const p = store.state.profile;

    /* licence */
    const lic = h('section', { class: 'card' });
    lic.appendChild(h('h3', { text: 'Your rod licence' }));
    lic.appendChild(h('p', { class: 'muted small', text: 'Save it here and the cost panel stops charging you for a day licence you already hold.' }));
    const lf = h('form', { class: 'form', onchange: (e) => {
      const fd = new FormData(e.currentTarget);
      store.patchProfile({
        licenceType: fd.get('type'),
        licenceExpiry: fd.get('expiry') || null,
        concession: fd.get('concession') === 'on',
        junior: fd.get('junior') === 'on',
        under13: fd.get('under13') === 'on'
      });
      render();
    } });
    lf.innerHTML = `
      <label>Licence held
        <select name="type">
          <option value="none" ${p.licenceType === 'none' ? 'selected' : ''}>None</option>
          ${G.data.LICENCE.types.map((t) => `<option value="${t.id}" ${p.licenceType === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>
      </label>
      <label>Expires<input name="expiry" type="date" value="${p.licenceExpiry || ''}"></label>
      <label class="check"><input type="checkbox" name="concession" ${p.concession ? 'checked' : ''}> Concession (66+ or registered disabled)</label>
      <label class="check"><input type="checkbox" name="junior" ${p.junior ? 'checked' : ''}> Aged 13–16 (free licence, still needs registering)</label>
      <label class="check"><input type="checkbox" name="under13" ${p.under13 ? 'checked' : ''}> Under 13 (no licence needed)</label>`;
    lic.appendChild(lf);
    const held = T.hasValidLicence(p);
    lic.appendChild(h('p', { class: held.covered ? 'ok-line' : 'muted small', text: held.why || 'No licence saved — day-licence cost will be included in venue totals.' }));
    root.appendChild(lic);

    /* search settings */
    const set = h('section', { class: 'card' });
    set.appendChild(h('h3', { text: 'Search' }));
    const radius = h('label', { class: 'range-label' }, [
      h('span', { text: `Radius: ${store.state.radiusMiles} miles` })
    ]);
    const slider = h('input', { type: 'range', min: '2', max: '60', step: '1', value: String(store.state.radiusMiles),
      oninput: (e) => { radius.firstChild.textContent = `Radius: ${e.target.value} miles`; },
      onchange: async (e) => {
        store.patch({ radiusMiles: Number(e.target.value) });
        await loadOsm();
        render();
      } });
    radius.appendChild(slider);
    set.appendChild(radius);
    set.appendChild(h('label', { class: 'check' }, [
      h('input', { type: 'checkbox', checked: store.state.filters.includeOsm,
        onchange: async (e) => { store.patchFilters({ includeOsm: e.target.checked }); await loadOsm(); render(); } }),
      h('span', { text: 'Include waters found on OpenStreetMap (unverified access)' })
    ]));
    root.appendChild(set);

    /* add a venue */
    const add = h('details', { class: 'card', open: r.query.has('add') });
    add.appendChild(h('summary', { text: 'Add a water yourself' }));
    const af = h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const lat = Number(fd.get('lat')), lon = Number(fd.get('lon'));
      if (!isFinite(lat) || !isFinite(lon)) { toast('Need a valid latitude and longitude.', 'warn'); return; }
      store.addVenue({
        name: fd.get('name'), type: fd.get('type'), lat, lon,
        ticket: fd.get('ticket') === '' ? null : Number(fd.get('ticket')),
        rating: null, breakdown: null,
        species: fd.getAll('species'),
        facilities: [], notes: fd.get('notes') || null, url: null, checked: new Date().toISOString().slice(0, 10)
      });
      toast('Added to your list.', 'good');
      e.target.reset();
      render();
    } });
    af.innerHTML = `
      <label>Name<input name="name" required></label>
      <label>Type
        <select name="type">${Object.entries(G.data.WATER_TYPES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}</select>
      </label>
      <div class="two-up">
        <label>Latitude<input name="lat" type="number" step="0.00001" required value="${A.location ? A.location.lat.toFixed(5) : ''}"></label>
        <label>Longitude<input name="lon" type="number" step="0.00001" required value="${A.location ? A.location.lon.toFixed(5) : ''}"></label>
      </div>
      <label>Day ticket (£, blank if unknown)<input name="ticket" type="number" step="0.5" min="0"></label>
      <label>Species present
        <select name="species" multiple size="6">${G.data.SPECIES.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      </label>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>`;
    af.appendChild(h('button', { class: 'btn primary', type: 'submit', text: 'Add water' }));
    add.appendChild(af);
    if (store.state.customVenues.length) {
      const list = h('div', { class: 'own-list' });
      store.state.customVenues.forEach((v) => {
        list.appendChild(h('div', { class: 'own-row' }, [
          h('span', { text: v.name }),
          h('button', { class: 'btn small', text: 'Remove', onclick: () => { store.removeVenue(v.id); render(); } })
        ]));
      });
      add.appendChild(list);
    }
    root.appendChild(add);

    /* hidden venues */
    if (store.state.hiddenVenues.length) {
      const hid = h('details', { class: 'card' });
      hid.appendChild(h('summary', { text: `Hidden venues (${store.state.hiddenVenues.length})` }));
      store.state.hiddenVenues.forEach((id) => {
        const v = G.data.VENUES.find((x) => x.id === id) || store.state.customVenues.find((x) => x.id === id);
        hid.appendChild(h('div', { class: 'own-row' }, [
          h('span', { text: v ? v.name : id }),
          h('button', { class: 'btn small', text: 'Unhide', onclick: () => {
            store.patch({ hiddenVenues: store.state.hiddenVenues.filter((x) => x !== id) });
            render();
          } })
        ]));
      });
      root.appendChild(hid);
    }

    /* licence price override */
    const pr = h('details', { class: 'card' });
    pr.appendChild(h('summary', { text: 'Licence prices' }));
    const P = T.prices();
    pr.appendChild(h('p', { class: 'muted small', text: `Built in from the published Environment Agency rates, last checked ${G.data.LICENCE.checked}. They change every April — if they are out of date, correct them here.` }));
    const pf = h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const next = JSON.parse(JSON.stringify(G.data.LICENCE));
      next.types.forEach((t) => {
        ['day', 'week', 'year', 'concession'].forEach((k) => {
          const raw = fd.get(`${t.id}-${k}`);
          t[k] = raw === '' ? null : Number(raw);
        });
      });
      next.checked = new Date().toISOString().slice(0, 10) + ' (edited by you)';
      store.patch({ licencePrices: next });
      toast('Prices updated on this device.', 'good');
      render();
    } });
    P.types.forEach((t) => {
      pf.appendChild(h('fieldset', { class: 'price-fields', html:
        `<legend>${esc(t.label)}</legend>
         <label>1 day<input name="${t.id}-day" type="number" step="0.05" value="${t.day == null ? '' : t.day}"></label>
         <label>8 day<input name="${t.id}-week" type="number" step="0.05" value="${t.week == null ? '' : t.week}"></label>
         <label>Year<input name="${t.id}-year" type="number" step="0.05" value="${t.year == null ? '' : t.year}"></label>
         <label>Concession<input name="${t.id}-concession" type="number" step="0.05" value="${t.concession == null ? '' : t.concession}"></label>` }));
    });
    pf.appendChild(h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn primary', type: 'submit', text: 'Save prices' }),
      store.state.licencePrices ? h('button', { class: 'btn', type: 'button', text: 'Reset to built-in', onclick: () => { store.patch({ licencePrices: null }); render(); } }) : null
    ].filter(Boolean)));
    pr.appendChild(pf);
    root.appendChild(pr);

    /* data */
    const dat = h('section', { class: 'card' });
    dat.appendChild(h('h3', { text: 'Your data' }));
    dat.appendChild(h('p', { class: 'muted small', text: 'Everything is stored in this browser. Nothing is uploaded, and there is no account.' }));
    dat.appendChild(h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn', text: 'Export backup', onclick: () => {
        const blob = new Blob([store.exportJson()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'cast-backup.json' });
        document.body.appendChild(a); a.click(); a.remove();
      } }),
      h('label', { class: 'btn' }, [
        h('span', { text: 'Import backup' }),
        h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try { store.importJson(await file.text()); toast('Backup restored.', 'good'); render(); }
          catch (err) { toast(err.message, 'warn'); }
        } })
      ]),
      h('button', { class: 'btn danger', text: 'Reset everything', onclick: () => {
        if (confirm('Delete all your ratings, corrections, added waters and catch log on this device?')) {
          store.reset(); toast('Reset.', 'info'); render();
        }
      } })
    ]));
    root.appendChild(dat);

    /* about */
    const about = h('section', { class: 'card' });
    about.innerHTML = `<h3>About Cast</h3>
      <p class="muted small">Built to answer one question: where can I fish today, what does it legally cost, and what should I put on the hook.</p>
      <h4>Where the data comes from</h4>
      <ul class="src-list">
        <li><strong>Rod licence prices and rules</strong> — published Environment Agency rates, last checked ${esc(G.data.LICENCE.checked)}. Reviewed every April.</li>
        <li><strong>Nearby waters</strong> — OpenStreetMap via the Overpass API. Real waters, but their presence on a map is not permission to fish.</li>
        <li><strong>Postcodes and places</strong> — postcodes.io.</li>
        <li><strong>Forecast and pressure</strong> — Open-Meteo.</li>
        <li><strong>Built-in venues</strong> — a hand-written seed list. Prices and star ratings are indicative editorial values, not quotes and not real review scores.</li>
      </ul>
      <p class="fineprint"><strong>This app is not legal advice.</strong> Licence requirements, close seasons, size limits and
      byelaws change, and vary by water and by region. Always check with the fishery, the club, and the current
      byelaws for the water you are fishing before you cast.</p>`;
    root.appendChild(about);
  }

  /* ------------------------------------------------------------- fragments */

  function backBar(title, target = '#/nearby') {
    const bar = h('div', { class: 'back-bar' });
    bar.appendChild(h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('back', 20), onclick: () => go(target) }));
    bar.appendChild(h('span', { class: 'back-title', text: title }));
    return bar;
  }

  /* ------------------------------------------------------------ filter sheet */

  function openFilters() {
    const f = store.state.filters;
    const sheet = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === sheet) close(); } });
    const panel = h('div', { class: 'sheet' });
    const close = () => sheet.remove();

    panel.appendChild(h('div', { class: 'sheet-head' }, [
      h('h3', { text: 'Filters' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('close', 18), onclick: close })
    ]));

    const body = h('div', { class: 'sheet-body' });

    body.appendChild(h('h4', { text: 'Water type' }));
    const types = h('div', { class: 'chip-row' });
    Object.entries(G.data.WATER_TYPES).forEach(([k, t]) => {
      const on = f.types.includes(k);
      types.appendChild(h('button', {
        class: 'chip-btn' + (on ? ' is-on' : ''), text: t.label, style: `--chip:${t.colour}`,
        onclick: (e) => {
          const next = on ? f.types.filter((x) => x !== k) : f.types.concat(k);
          store.patchFilters({ types: next });
          e.target.classList.toggle('is-on');
          render();
        }
      }));
    });
    body.appendChild(types);

    body.appendChild(h('h4', { text: 'Facilities' }));
    const facs = h('div', { class: 'chip-row' });
    G.data.FACILITIES.forEach((fac) => {
      const on = f.facilities.includes(fac.id);
      facs.appendChild(h('button', {
        class: 'chip-btn' + (on ? ' is-on' : ''), html: icon(fac.icon, 14) + '<span>' + esc(fac.label) + '</span>',
        onclick: (e) => {
          const next = on ? f.facilities.filter((x) => x !== fac.id) : f.facilities.concat(fac.id);
          store.patchFilters({ facilities: next });
          e.currentTarget.classList.toggle('is-on');
          render();
        }
      }));
    });
    body.appendChild(facs);

    body.appendChild(h('h4', { text: 'Maximum day ticket' }));
    const priceRow = h('div', { class: 'chip-row' });
    [[null, 'Any'], [0, 'Free only'], [10, '£10'], [15, '£15'], [25, '£25'], [40, '£40']].forEach(([val, label]) => {
      priceRow.appendChild(h('button', {
        class: 'chip-btn' + (f.maxPrice === val ? ' is-on' : ''), text: label,
        onclick: () => { store.patchFilters({ maxPrice: val }); close(); render(); openFilters(); }
      }));
    });
    body.appendChild(priceRow);

    body.appendChild(h('h4', { text: 'Minimum rating' }));
    const ratingRow = h('div', { class: 'chip-row' });
    [[0, 'Any'], [3, '3+'], [3.5, '3.5+'], [4, '4+'], [4.5, '4.5+']].forEach(([val, label]) => {
      ratingRow.appendChild(h('button', {
        class: 'chip-btn' + (f.minRating === val ? ' is-on' : ''), text: label,
        onclick: () => { store.patchFilters({ minRating: val }); close(); render(); openFilters(); }
      }));
    });
    body.appendChild(ratingRow);

    body.appendChild(h('label', { class: 'check' }, [
      h('input', { type: 'checkbox', checked: f.fishableOnly, onchange: (e) => { store.patchFilters({ fishableOnly: e.target.checked }); render(); } }),
      h('span', { text: 'Hide waters I cannot fish today' })
    ]));

    panel.appendChild(body);
    panel.appendChild(h('div', { class: 'btn-row sheet-foot' }, [
      h('button', { class: 'btn', text: 'Clear all', onclick: () => {
        store.patchFilters({ types: [], facilities: [], maxPrice: null, minRating: 0, fishableOnly: false });
        close(); render();
      } }),
      h('button', { class: 'btn primary', text: 'Done', onclick: () => { close(); render(); } })
    ]));

    sheet.appendChild(panel);
    document.body.appendChild(sheet);
  }

  /* --------------------------------------------------------------- startup */

  async function init() {
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.addEventListener('click', () => go('#/' + b.dataset.view));
    });
    window.addEventListener('hashchange', () => {
      A.selected = null;
      render();
    });

    const saved = store.state.lastLocation;
    if (saved && Date.now() - (saved.at || 0) < 30 * 24 * 3600e3) {
      A.location = saved;
      render();
      await Promise.all([loadWeather(), loadOsm()]);
    }
    render();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus, not a requirement */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.Cast = window.Cast || {});

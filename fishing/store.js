/* Cast — persistence. Everything lives in localStorage on this device: no accounts,
   no server, nothing leaves the phone except the three anonymous data lookups. */
(function (G) {
  'use strict';

  const KEY = 'cast-fishing-v1';
  const CACHE_KEY = 'cast-cache-v1';

  const DEFAULTS = {
    profile: {
      /* The angler's own rod licence, so the cost panel can stop charging them for one. */
      licenceType: 'none',      /* none | coarse2 | coarse3 | salmon */
      licenceExpiry: null,      /* ISO date */
      concession: false,        /* 66+ or registered disabled */
      junior: false,            /* 13–16: licence is free */
      under13: false
    },
    radiusMiles: 25,
    sortBy: 'distance',         /* distance | rating | price */
    filters: {
      types: [],                /* empty = all */
      maxPrice: null,
      minRating: 0,
      intent: null,             /* null | numbers | specimen | wild | game */
      facilities: [],
      fishableOnly: false,
      includeOsm: true
    },
    ratings: {},                /* venueId -> 1..5 from this angler */
    overrides: {},              /* venueId -> { name, ticket, notes } corrections */
    customVenues: [],           /* venues the angler added themselves */
    hiddenVenues: [],
    catches: [],
    licencePrices: null,        /* optional override of the built-in EA price table */
    lastLocation: null,         /* { lat, lon, label, country, at } */
    seenIntro: false
  };

  let state = load();
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const saved = JSON.parse(raw);
      /* Shallow-merge so a new default added in a later version appears for existing users. */
      const merged = Object.assign(structuredClone(DEFAULTS), saved);
      merged.profile = Object.assign(structuredClone(DEFAULTS.profile), saved.profile || {});
      merged.filters = Object.assign(structuredClone(DEFAULTS.filters), saved.filters || {});
      return merged;
    } catch (e) {
      console.warn('Cast: could not read saved data, starting fresh.', e);
      return structuredClone(DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Cast: could not save.', e);
    }
  }

  function emit() {
    listeners.forEach((fn) => {
      try { fn(state); } catch (e) { console.error(e); }
    });
  }

  /* ------------------------------------------------------------- network cache */

  /* Overpass and Open-Meteo answers are cached so the app still works on the bank
     with no signal. Each entry carries its own time-to-live. */
  function cacheRead(key) {
    try {
      const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      const hit = all[key];
      if (!hit) return null;
      return { value: hit.v, age: Date.now() - hit.t, stale: Date.now() - hit.t > hit.ttl };
    } catch (e) { return null; }
  }

  function cacheWrite(key, value, ttlMs) {
    try {
      const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      all[key] = { v: value, t: Date.now(), ttl: ttlMs };
      /* Keep the cache from growing without bound: drop the oldest once it gets big. */
      const keys = Object.keys(all);
      if (keys.length > 60) {
        keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 60)
            .forEach((k) => delete all[k]);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (e) { /* a full quota is not worth breaking the app over */ }
  }

  G.store = {
    get state() { return state; },

    patch(partial) {
      Object.assign(state, partial);
      save(); emit();
    },

    patchProfile(partial) {
      Object.assign(state.profile, partial);
      save(); emit();
    },

    patchFilters(partial) {
      Object.assign(state.filters, partial);
      save(); emit();
    },

    rate(venueId, stars) {
      if (stars) state.ratings[venueId] = stars;
      else delete state.ratings[venueId];
      save(); emit();
    },

    override(venueId, fields) {
      state.overrides[venueId] = Object.assign(state.overrides[venueId] || {}, fields);
      save(); emit();
    },

    addVenue(venue) {
      venue.id = 'own-' + Date.now().toString(36);
      venue.source = 'own';
      state.customVenues.push(venue);
      save(); emit();
      return venue;
    },

    removeVenue(id) {
      state.customVenues = state.customVenues.filter((v) => v.id !== id);
      save(); emit();
    },

    addCatch(entry) {
      entry.id = 'c' + Date.now().toString(36);
      state.catches.unshift(entry);
      save(); emit();
      return entry;
    },

    removeCatch(id) {
      state.catches = state.catches.filter((c) => c.id !== id);
      save(); emit();
    },

    catchesAt(venueId) {
      return state.catches.filter((c) => c.venueId === venueId);
    },

    subscribe(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },

    reset() { state = structuredClone(DEFAULTS); save(); emit(); },

    exportJson() {
      return JSON.stringify({ app: 'cast', version: 1, exported: new Date().toISOString(), state }, null, 2);
    },

    importJson(text) {
      const parsed = JSON.parse(text);
      if (!parsed || parsed.app !== 'cast' || !parsed.state) throw new Error('Not a Cast backup file.');
      state = Object.assign(structuredClone(DEFAULTS), parsed.state);
      save(); emit();
    },

    cacheRead, cacheWrite
  };
})(window.Cast = window.Cast || {});

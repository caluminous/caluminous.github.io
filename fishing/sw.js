/* Cast — service worker. Riverbanks have no signal, so the shell is cached hard and
   map tiles are kept in a separate, capped cache that survives going offline. */

const SHELL = 'cast-shell-v2';
const TILES = 'cast-tiles-v1';
const TILE_LIMIT = 400;

const SHELL_FILES = [
  './',
  'index.html',
  'style.css',
  'data.js',
  'store.js',
  'geo.js',
  'tactics.js',
  'ui.js',
  'map.js',
  'app.js',
  'icon.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  if (keys.length <= TILE_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Map tiles: serve from cache first, then fill in behind. */
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) { cache.put(req, res.clone()); trimTiles(); }
        return res;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  /* The live data APIs are never served from here — geo.js does its own caching in
     localStorage, so it can tell the angler when a figure is stale. */
  if (url.hostname.includes('overpass') || url.hostname.includes('open-meteo') || url.hostname.includes('postcodes.io')) {
    return;
  }

  /* App shell: cache first, refresh in the background. */
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await network) || cache.match('index.html');
    })());
  }
});

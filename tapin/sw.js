/* Tap In service worker — the app has to work in a gym basement with no
   signal, so the whole shell is precached and served cache-first, with a
   background refresh so updates still land. */

const CACHE = 'tapin-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './data.js',
  './store.js',
  './nfc.js',
  './track.js',
  './session.js',
  './ui.js',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    /* Ignoring the query and hash matters here: a tag opens the app at
       #m=<id>, and that must still hit the cached shell. */
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const network = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || caches.match('./index.html'));
      return hit || network;
    })
  );
});

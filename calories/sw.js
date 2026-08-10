/* Fuel service worker — full offline support.
   Strategy: precache the shell, then serve from cache while refreshing in the
   background, so the app opens instantly offline but still picks up updates. */

const CACHE = 'fuel-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './data.js',
  './calc.js',
  './store.js',
  './notify.js',
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

/* Tapping a reminder focuses the app if it is already open, rather than
   stacking up another copy of it. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/calories') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
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

      // Cached copy first when we have one; the fetch above refreshes it for next time.
      return hit || network;
    })
  );
});

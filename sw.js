// Bump CACHE_NAME whenever a file in the list changes, so installed copies update.
const CACHE_NAME = 'go-game-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './go.js',
  './ai.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './fonts/fonts.css',
  './fonts/outfit.woff2',
  './fonts/playfair-display.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Cache first: the game must work with no network at all.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(event.request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

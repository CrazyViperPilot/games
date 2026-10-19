// Relative Pfade: funktioniert in jedem Unterordner (GitHub Pages: /<repo>/sudoku/).
const CACHE_NAME = 'sudoku-glamour-v4';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './sudoku.js',
  './lang.js',
  './manifest.json',
  './background.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Network-first for navigation requests so HTML updates are picked up
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  // Cache-first for other assets
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Nur eigene alte Caches löschen – andere Spiele derselben Domain nicht anfassen.
          if (cacheName.startsWith('sudoku-') && cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fruhno Service Worker: network-first for the app shell, cache only as offline fallback.
// API calls are never cached. Bump CACHE_VERSION when files change.
const CACHE_VERSION = 'fruhno-v5';
const CACHE_PREFIX = 'fruhno-';
const ASSETS = ['./', './index.html', './manifest.json', './css/style.css', './js/cards.js', './js/api.js', './js/main.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req)));
});

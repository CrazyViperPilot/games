// Schiffe-versenken Service Worker: network-first for the app shell, cache only as offline fallback.
// API calls are never cached. Bump CACHE_VERSION when files change.
const CACHE_VERSION = 'schiffeversenken-v2';
const CACHE_PREFIX = 'schiffeversenken-';
const ASSETS = ['./', './index.html', './manifest.json', './css/style.css', './js/i18n.js', './js/draw.js', './js/api.js', './js/main.js',
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
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('.php')) return;
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req)));
});

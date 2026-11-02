// Simfurt Service Worker: network-first, Cache nur als Offline-Fallback. Eigener Cache (Präfix simfurt-).
// Bei Änderungen an Dateien CACHE_NAME hochzählen. API-Aufrufe (anderer Ursprung) werden nie gecacht.
const CACHE_PREFIX = 'simfurt-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const ASSETS = ['./', './index.html', './style.css', './manifest.json', './js/main.js', './js/sim.js', './js/data.js', './js/render.js', './js/save.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});

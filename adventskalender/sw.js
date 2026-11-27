// Adventskalender Service Worker (für kira/ und lea/): network-first, Cache nur als Offline-Fallback.
// Bei Änderungen an Dateien CACHE_VERSION erhöhen.
const CACHE_PREFIX = 'adventskalender-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const ASSETS = ['./style.css', './art.js', './logic.js', './content.js', './app.js',
  './kira/', './kira/index.html', './kira/manifest.json', './lea/', './lea/index.html', './lea/manifest.json',
  './icons/kira.svg', './icons/kira-192.png', './icons/kira-512.png',
  './icons/lea.svg', './icons/lea-192.png', './icons/lea-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

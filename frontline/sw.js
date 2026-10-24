// Frontline Service Worker: network-first (immer die neueste Version), Cache nur als Offline-Fallback.
// Bei Änderungen an Dateien CACHE_VERSION erhöhen, damit Clients die neue Version laden.
const CACHE_VERSION = 'frontline-v13';
const CACHE_PREFIX = 'frontline-';
const CACHE_NAME = CACHE_VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/core/loop.js',
  './js/core/rng.js',
  './js/data/balance.js',
  './js/data/units.js',
  './js/data/buildings.js',
  './js/game/map.js',
  './js/game/grid.js',
  './js/game/pathfinding.js',
  './js/game/entities.js',
  './js/game/game.js',
  './js/game/economy.js',
  './js/game/movement.js',
  './js/game/combat.js',
  './js/game/logistics.js',
  './js/game/construction.js',
  './js/game/zone.js',
  './js/game/hotzone.js',
  './js/game/fog.js',
  './js/ai/ai.js',
  './js/render/camera.js',
  './js/render/iso.js',
  './js/render/terrain.js',
  './js/render/sprites.js',
  './js/render/renderer.js',
  './js/render/minimap.js',
  './js/ui/controller.js',
  './js/ui/input.js',
  './js/ui/hud.js',
  './js/ui/menu.js',
  './js/ui/status.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Einzelne Fehler (z. B. fehlende Datei) brechen die Installation nicht ab.
    // cache: 'reload' umgeht den HTTP-Cache des Browsers, sonst landen veraltete Dateien im neuen Cache.
    await Promise.allSettled(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Nur eigene Caches löschen (Präfix), die Offline-Daten der anderen Spiele bleiben.
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok && res.type === 'basic') {
        // Ohne Query-String ablegen, damit ?debug=1 keine eigenen Cache-Einträge erzeugt.
        const key = new URL(req.url);
        key.search = '';
        cache.put(key.href, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      // Offline: aus dem Cache, Navigation fällt auf die Spiel-Shell zurück.
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});

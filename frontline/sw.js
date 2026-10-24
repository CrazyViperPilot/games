// Frontline Service Worker: network-first (immer die neueste Version), Cache nur als Offline-Fallback.
// Bei Änderungen an Dateien CACHE_VERSION erhöhen, damit Clients die neue Version laden.
const CACHE_VERSION = 'frontline-v16';
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
  './js/render/isobuild.js',
  './js/render/terrain.js',
  './js/render/sprites.js',
  './js/render/renderer.js',
  './js/render/isosprites.js',
  './assets/iso/buildings/b002.png',
  './assets/iso/buildings/b003.png',
  './assets/iso/buildings/b004.png',
  './assets/iso/buildings/b009.png',
  './assets/iso/buildings/b010.png',
  './assets/iso/buildings/b011.png',
  './assets/iso/buildings/b012.png',
  './assets/iso/buildings/b014.png',
  './assets/iso/buildings/b017.png',
  './assets/iso/buildings/b018.png',
  './assets/iso/buildings/b019.png',
  './assets/iso/buildings/b020.png',
  './assets/iso/buildings/b021.png',
  './assets/iso/buildings/b025.png',
  './assets/iso/buildings/b026.png',
  './assets/iso/buildings/b027.png',
  './assets/iso/buildings/b028.png',
  './assets/iso/buildings/b029.png',
  './assets/iso/buildings/b033.png',
  './assets/iso/buildings/b034.png',
  './assets/iso/buildings/b035.png',
  './assets/iso/buildings/b040.png',
  './assets/iso/buildings/b041.png',
  './assets/iso/buildings/b046.png',
  './assets/iso/buildings/b093.png',
  './assets/iso/buildings/b101.png',
  './assets/iso/buildings/b108.png',
  './assets/iso/buildings/b109.png',
  './assets/iso/buildings/b116.png',
  './assets/iso/buildings/b117.png',
  './assets/iso/buildings/b123.png',
  './assets/iso/buildings/b124.png',
  './assets/iso/buildings/b125.png',
  './assets/iso/trees/tree.png',
  './assets/iso/vehicles/pickup-blue-e.png',
  './assets/iso/vehicles/pickup-blue-n.png',
  './assets/iso/vehicles/pickup-blue-ne.png',
  './assets/iso/vehicles/pickup-blue-nw.png',
  './assets/iso/vehicles/pickup-blue-s.png',
  './assets/iso/vehicles/pickup-blue-se.png',
  './assets/iso/vehicles/pickup-blue-sw.png',
  './assets/iso/vehicles/pickup-blue-w.png',
  './assets/iso/vehicles/pickup-red-e.png',
  './assets/iso/vehicles/pickup-red-n.png',
  './assets/iso/vehicles/pickup-red-ne.png',
  './assets/iso/vehicles/pickup-red-nw.png',
  './assets/iso/vehicles/pickup-red-s.png',
  './assets/iso/vehicles/pickup-red-se.png',
  './assets/iso/vehicles/pickup-red-sw.png',
  './assets/iso/vehicles/pickup-red-w.png',
  './assets/iso/vehicles/truck-blue-e.png',
  './assets/iso/vehicles/truck-blue-n.png',
  './assets/iso/vehicles/truck-blue-ne.png',
  './assets/iso/vehicles/truck-blue-nw.png',
  './assets/iso/vehicles/truck-blue-s.png',
  './assets/iso/vehicles/truck-blue-se.png',
  './assets/iso/vehicles/truck-blue-sw.png',
  './assets/iso/vehicles/truck-blue-w.png',
  './assets/iso/vehicles/truck-red-e.png',
  './assets/iso/vehicles/truck-red-n.png',
  './assets/iso/vehicles/truck-red-ne.png',
  './assets/iso/vehicles/truck-red-nw.png',
  './assets/iso/vehicles/truck-red-s.png',
  './assets/iso/vehicles/truck-red-se.png',
  './assets/iso/vehicles/truck-red-sw.png',
  './assets/iso/vehicles/truck-red-w.png',
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

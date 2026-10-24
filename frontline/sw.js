// Frontline Service Worker: network-first (immer die neueste Version), Cache nur als Offline-Fallback.
// Bei Änderungen an Dateien CACHE_VERSION erhöhen, damit Clients die neue Version laden.
const CACHE_VERSION = 'frontline-v23';
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
  './js/render/isodata.js',
  './assets/iso/train/container-r0.png',
  './assets/iso/train/container-r1.png',
  './assets/iso/train/container-r2.png',
  './assets/iso/train/container-r3.png',
  './assets/iso/train/loco-r0.png',
  './assets/iso/train/loco-r1.png',
  './assets/iso/train/loco-r2.png',
  './assets/iso/train/loco-r3.png',
  './assets/iso/train/tank-r0.png',
  './assets/iso/train/tank-r1.png',
  './assets/iso/train/tank-r2.png',
  './assets/iso/train/tank-r3.png',
  './assets/iso/buildings/com_building-a.png',
  './assets/iso/buildings/com_building-b.png',
  './assets/iso/buildings/com_building-c.png',
  './assets/iso/buildings/com_building-d.png',
  './assets/iso/buildings/com_building-e.png',
  './assets/iso/buildings/com_building-h.png',
  './assets/iso/buildings/com_building-k.png',
  './assets/iso/buildings/ind_building-a.png',
  './assets/iso/buildings/ind_building-b.png',
  './assets/iso/buildings/ind_building-c.png',
  './assets/iso/buildings/ind_building-d.png',
  './assets/iso/buildings/ind_building-e.png',
  './assets/iso/buildings/ind_building-f.png',
  './assets/iso/buildings/ind_building-g.png',
  './assets/iso/buildings/ind_building-h.png',
  './assets/iso/buildings/ind_building-i.png',
  './assets/iso/buildings/ind_building-j.png',
  './assets/iso/buildings/ind_building-k.png',
  './assets/iso/buildings/ind_building-l.png',
  './assets/iso/buildings/ind_building-m.png',
  './assets/iso/buildings/ind_building-n.png',
  './assets/iso/buildings/ind_building-o.png',
  './assets/iso/buildings/ind_building-p.png',
  './assets/iso/buildings/ind_building-q.png',
  './assets/iso/buildings/ind_building-r.png',
  './assets/iso/buildings/ind_building-s.png',
  './assets/iso/buildings/ind_building-t.png',
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

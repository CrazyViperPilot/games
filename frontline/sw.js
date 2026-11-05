// Frontline Service Worker: network-first (immer die neueste Version), Cache nur als Offline-Fallback.
// Bei Änderungen an Dateien CACHE_VERSION erhöhen, damit Clients die neue Version laden.
const CACHE_VERSION = 'frontline-v148';
const CACHE_PREFIX = 'frontline-';
const CACHE_NAME = CACHE_VERSION;

const ASSETS = [
  './',
  './index.html',
  './editor.html',
  './manifest.json',
  './css/style.css',
  './css/editor.css',
  './js/editor/editor.js',
  './js/game/mapdata.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/audio/sound.js',
  './js/core/loop.js',
  './js/core/rng.js',
  './js/core/snapshot.js',
  './js/game/savegame.js',
  './js/ui/saves.js',
  './js/data/balance.js',
  './js/data/units.js',
  './js/data/buildings.js',
  './js/data/ai.js',
  './js/data/mapgen.js',
  './js/game/map.js',
  './js/game/relief.js',
  './js/game/landscape.js',
  './js/game/grid.js',
  './js/game/pathfinding.js',
  './js/game/entities.js',
  './js/game/game.js',
  './js/game/economy.js',
  './js/game/movement.js',
  './js/game/combat.js',
  './js/game/logistics.js',
  './js/game/construction.js',
  './js/game/garrison.js',
  './js/game/tower.js',
  './js/game/crates.js',
  './js/game/scars.js',
  './js/game/animals.js',
  './js/game/formation.js',
  './js/game/commander.js',
  './js/game/radio.js',
  './js/game/city.js',
  './js/data/city.js',
  './js/data/research.js',
  './js/ui/citypanel.js',
  './js/ui/researchpanel.js',
  './js/ui/flowpanel.js',
  './js/render/citylayer.js',
  './js/game/weather.js',
  './js/game/research.js',
  './js/game/flow.js',
  './js/game/transport.js',
  './js/game/abilities.js',
  './js/game/river.js',
  './js/game/roads.js',
  './js/game/aircraft.js',
  './js/game/zone.js',
  './js/game/hotzone.js',
  './js/game/fog.js',
  './js/ai/ai.js',
  './js/render/camera.js',
  './js/render/iso.js',
  './js/render/isobuild.js',
  './js/render/university.js',
  './js/render/works.js',
  './js/render/townhouses.js',
  './js/render/spritecache.js',
  './js/render/unitpaint.js',
  './js/render/nature.js',
  './js/render/ways.js',
  './js/render/fx.js',
  './js/render/isokit.js',
  './js/render/milbuild.js',
  './js/render/airport.js',
  './js/render/maptown.js',
  './js/render/bigbuild.js',
  './js/render/cityhall.js',
  './js/render/terrain.js',
  './js/render/ground.js',
  './js/render/reliefimg.js',
  './js/render/sprites.js',
  './js/render/renderer.js',
  './js/render/isosprites.js',
  './js/render/season.js',
  './js/render/weatherfx.js',
  './js/render/mood.js',
  './js/render/bridge.js',
  './assets/iso/buildings/tower-r0.png',
  './assets/iso/buildings/tower-r1.png',
  './assets/iso/buildings/tower-r2.png',
  './assets/iso/buildings/tower-r3.png',
  './assets/iso/cars/cars.png',
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

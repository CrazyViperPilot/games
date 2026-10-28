// Mario Craft Service Worker: network-first (immer die neueste Version), Cache nur als Offline-Fallback.
// Bei Änderungen an Dateien CACHE_VERSION erhöhen, damit Clients die neue Version laden.
const CACHE_VERSION = 'mariocraft-v11';
const CACHE_PREFIX = 'mariocraft-';
const CACHE_NAME = CACHE_VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './js/core/audio.js',
  './js/core/i18n.js',
  './js/core/input.js',
  './js/core/loop.js',
  './js/core/save.js',
  './js/data/levels/index.js',
  './js/data/levels/w1-1.js',
  './js/data/levels/w1-2.js',
  './js/data/levels/w1-3.js',
  './js/data/levels/w1-4.js',
  './js/data/levels/w1-5.js',
  './js/data/levels/w1-6.js',
  './js/data/levels/w1-7.js',
  './js/data/levels/w1-8.js',
  './js/data/levels/w1-9.js',
  './js/data/levels/w1-10.js',
  './js/data/levels/w1-11.js',
  './js/data/levels/w1-12.js',
  './js/data/levels/w1-13.js',
  './js/data/levels/w1-14.js',
  './js/data/levels/w1-15.js',
  './js/data/levels/w1-16.js',
  './js/data/levels/w1-17.js',
  './js/data/levels/w1-18.js',
  './js/data/levels/w1-19.js',
  './js/data/levels/w1-20.js',
  './js/data/levels/w1-21.js',
  './js/data/levels/w1-22.js',
  './js/data/levels/w1-23.js',
  './js/data/levels/w1-24.js',
  './js/data/levels/w1-25.js',
  './js/data/levels/w1-26.js',
  './js/data/levels/w1-27.js',
  './js/data/levels/w1-28.js',
  './js/data/levels/w1-29.js',
  './js/data/levels/w1-30.js',
  './js/data/levels/w1-31.js',
  './js/data/levels/w1-32.js',
  './js/data/levels/w1-33.js',
  './js/data/levels/w2-1.js',
  './js/data/levels/w2-2.js',
  './js/data/levels/w2-3.js',
  './js/data/levels/w2-4.js',
  './js/data/levels/w2-5.js',
  './js/data/levels/w2-6.js',
  './js/data/levels/w2-7.js',
  './js/data/levels/w2-8.js',
  './js/data/levels/w2-9.js',
  './js/data/levels/w2-10.js',
  './js/data/levels/w2-11.js',
  './js/data/levels/w2-12.js',
  './js/data/levels/w2-13.js',
  './js/data/levels/w2-14.js',
  './js/data/levels/w2-15.js',
  './js/data/levels/w2-16.js',
  './js/data/levels/w2-17.js',
  './js/data/levels/w2-18.js',
  './js/data/levels/w2-19.js',
  './js/data/levels/w2-20.js',
  './js/data/levels/w2-21.js',
  './js/data/levels/w2-22.js',
  './js/data/levels/w2-23.js',
  './js/data/levels/w2-24.js',
  './js/data/levels/w2-25.js',
  './js/data/levels/w2-26.js',
  './js/data/levels/w2-27.js',
  './js/data/levels/w2-28.js',
  './js/data/levels/w2-29.js',
  './js/data/levels/w2-30.js',
  './js/data/levels/w2-31.js',
  './js/data/levels/w2-32.js',
  './js/data/levels/w2-33.js',
  './js/data/levels/w3-1.js',
  './js/data/levels/w3-2.js',
  './js/data/levels/w3-3.js',
  './js/data/levels/w3-4.js',
  './js/data/levels/w3-5.js',
  './js/data/levels/w3-6.js',
  './js/data/levels/w3-7.js',
  './js/data/levels/w3-8.js',
  './js/data/levels/w3-9.js',
  './js/data/levels/w3-10.js',
  './js/data/levels/w3-11.js',
  './js/data/levels/w3-12.js',
  './js/data/levels/w3-13.js',
  './js/data/levels/w3-14.js',
  './js/data/levels/w3-15.js',
  './js/data/levels/w3-16.js',
  './js/data/levels/w3-17.js',
  './js/data/levels/w3-18.js',
  './js/data/levels/w3-19.js',
  './js/data/levels/w3-20.js',
  './js/data/levels/w3-21.js',
  './js/data/levels/w3-22.js',
  './js/data/levels/w3-23.js',
  './js/data/levels/w3-24.js',
  './js/data/levels/w3-25.js',
  './js/data/levels/w3-26.js',
  './js/data/levels/w3-27.js',
  './js/data/levels/w3-28.js',
  './js/data/levels/w3-29.js',
  './js/data/levels/w3-30.js',
  './js/data/levels/w3-31.js',
  './js/data/levels/w3-32.js',
  './js/data/levels/w3-33.js',
  './js/data/levels/w4-1.js',
  './js/data/levels/w4-2.js',
  './js/data/levels/w4-3.js',
  './js/data/levels/w4-4.js',
  './js/data/levels/w4-5.js',
  './js/data/levels/w4-6.js',
  './js/data/levels/w4-7.js',
  './js/data/levels/w4-8.js',
  './js/data/levels/w4-9.js',
  './js/data/levels/w4-10.js',
  './js/data/levels/w4-11.js',
  './js/data/levels/w4-12.js',
  './js/data/levels/w4-13.js',
  './js/data/levels/w4-14.js',
  './js/data/levels/w4-15.js',
  './js/data/levels/w4-16.js',
  './js/data/levels/w4-17.js',
  './js/data/levels/w4-18.js',
  './js/data/levels/w4-19.js',
  './js/data/levels/w4-20.js',
  './js/data/levels/w4-21.js',
  './js/data/levels/w4-22.js',
  './js/data/levels/w4-23.js',
  './js/data/levels/w4-24.js',
  './js/data/levels/w4-25.js',
  './js/data/levels/w4-26.js',
  './js/data/levels/w4-27.js',
  './js/data/levels/w4-28.js',
  './js/data/levels/w4-29.js',
  './js/data/levels/w4-30.js',
  './js/data/levels/w4-31.js',
  './js/data/levels/w4-32.js',
  './js/data/levels/w4-33.js',
  './js/data/mobs.js',
  './js/data/physics.js',
  './js/data/strings.js',
  './js/data/tiles.js',
  './js/game/bosses.js',
  './js/game/collide.js',
  './js/game/dig.js',
  './js/game/explode.js',
  './js/game/game.js',
  './js/game/items.js',
  './js/game/level.js',
  './js/game/light.js',
  './js/game/mobs.js',
  './js/game/player.js',
  './js/game/projectiles.js',
  './js/main.js',
  './js/render/art/blocks.js',
  './js/render/art/bosses.js',
  './js/render/art/hero.js',
  './js/render/art/items.js',
  './js/render/art/mobs.js',
  './js/render/hud.js',
  './js/render/renderer.js',
  './js/render/sprites.js',
  './js/render/tilecache.js',
  './js/ui/menu.js',
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

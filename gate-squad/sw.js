// Gate Squad Service Worker: cache-first mit Hintergrund-Update (stale-while-revalidate).
// Bei Änderungen an Dateien CACHE_VERSION erhöhen, damit Clients die neue Version laden.
const CACHE_VERSION = 'gatesquad-v1';
const CACHE_PREFIX = 'gatesquad-';
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
  './js/main.js',
  './js/config.js',
  './js/core/loop.js',
  './js/core/input.js',
  './js/core/audio.js',
  './js/core/haptics.js',
  './js/core/pool.js',
  './js/core/rng.js',
  './js/core/save.js',
  './js/data/balance.js',
  './js/data/weapons.js',
  './js/data/attachments.js',
  './js/data/enemies.js',
  './js/data/upgrades.js',
  './js/data/levels.js',
  './js/data/procgen.js',
  './js/game/game.js',
  './js/game/levelRunner.js',
  './js/game/bot.js',
  './js/entities/squad.js',
  './js/entities/projectiles.js',
  './js/entities/enemies.js',
  './js/entities/gates.js',
  './js/entities/crates.js',
  './js/entities/boss.js',
  './js/entities/particles.js',
  './js/render/renderer.js',
  './js/render/sprites.js',
  './js/render/background.js',
  './js/render/hud.js',
  './js/ui/ui.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Einzelne Fehler (z. B. fehlende Datei) brechen die Installation nicht ab.
    await Promise.allSettled(ASSETS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
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
    const cached = await cache.match(req, { ignoreSearch: true });

    // Netzwerk im Hintergrund holen und Cache aktualisieren.
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          // Ohne Query-String ablegen, damit ?debug=1 keine eigenen Cache-Einträge erzeugt.
          const key = new URL(req.url);
          key.search = '';
          cache.put(key.href, res.clone()).catch(() => {});
        }
        return res;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(network);
      return cached;
    }

    const fresh = await network;
    if (fresh) return fresh;

    // Offline ohne Cache-Treffer: Navigation → Spiel-Shell.
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html', { ignoreSearch: true });
      if (shell) return shell;
    }
    return Response.error();
  })());
});

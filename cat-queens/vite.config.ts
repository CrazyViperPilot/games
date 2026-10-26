import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Alle Dateien unter dir (rekursiv), relativ zu dir. */
function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full, root) : [relative(root, full).split('\\').join('/')];
  });
}

/**
 * Schreibt nach dem Build dist/sw.js: lädt beim Installieren alle Dateien in den Cache
 * (Cache-Präfix catqueens-, Version = Hash aller Dateien) und löscht nur eigene alte Caches.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'catqueens-sw',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    closeBundle() {
      const files = listFiles(outDir).filter((f) => f !== 'sw.js');
      const assets = ['./', ...files.map((f) => './' + f)];
      const template = `// Katzen-Queens Service Worker (beim Build erzeugt, siehe vite.config.ts)
const CACHE_PREFIX = 'catqueens-';
const CACHE_NAME = CACHE_PREFIX + '__VERSION__';
const ASSETS = ${JSON.stringify(assets)};

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
  if (e.request.mode === 'navigate') {
    // Seite: Netz zuerst (Updates), offline aus dem Cache.
    e.respondWith(fetch(e.request).catch(() => caches.match('./index.html', { ignoreSearch: true, ignoreVary: true })));
    return;
  }
  // Dateien mit Hash im Namen ändern sich nie: Cache zuerst.
  e.respondWith(caches.match(e.request, { ignoreSearch: true, ignoreVary: true }).then((r) => r || fetch(e.request)));
});
`;
      // Version = Hash über alle Dateien und den Service Worker selbst.
      const hash = createHash('sha256').update(template);
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      writeFileSync(join(outDir, 'sw.js'), template.replace('__VERSION__', hash.digest('hex').slice(0, 12)));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  test: { include: ['test/**/*.test.ts'] },
} as Parameters<typeof defineConfig>[0]);

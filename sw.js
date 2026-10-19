// Ersatz für den früheren Sudoku-Service-Worker an der Wurzel (Sudoku liegt jetzt in ./sudoku/).
// Bestehende Installationen laden diese Datei beim nächsten Update, räumen ihren alten Cache auf
// und melden sich ab. Die Spiele haben eigene Service Worker in ihren Ordnern.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k === 'sudoku-glamour-v3' || k === 'sudoku-glamour-v2' || k === 'sudoku-glamour-v1').map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});

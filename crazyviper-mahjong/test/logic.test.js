// Ausführen: node crazyviper-mahjong/test/logic.test.js
const assert = require('assert');
const L = require('../logic.js');

let dead = 0;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

for (const layout of L.LAYOUTS) {
  const n = L.positions(layout).length;
  assert.strictEqual(n % 2, 0, layout.id + ': ungerade Kachelzahl ' + n);
  const seen = new Set();
  L.positions(layout).forEach((p) => { const k = p.x + ',' + p.y + ',' + p.z; assert(!seen.has(k), layout.id + ' doppelt ' + k); seen.add(k); });
  for (let game = 0; game < 40; game++) {
    const tiles = L.deal(layout, 36, rnd);
    const counts = {};
    tiles.forEach((t) => { counts[t.type] = (counts[t.type] || 0) + 1; });
    Object.values(counts).forEach((c) => assert.strictEqual(c % 2, 0));
    // Lösbarkeit: zufällig spielen, bei Sackgasse mischen (darf nur an Mischen scheitern, nie unlösbar)
    let guard = 0;
    while (tiles.some((t) => !t.removed)) {
      const moves = L.findMoves(tiles);
      if (!moves.length) {
        // Zufälliges Spielen kann geometrisch in eine Sackgasse laufen (z. B. zwei übereinander liegende Kacheln).
        if (!L.reshuffle(tiles, rnd)) { dead++; break; }
        assert(L.findMoves(tiles).length > 0, 'nach Mischen kein Zug');
      }
      else { const m = moves[Math.floor(rnd() * moves.length)]; m[0].removed = m[1].removed = true; }
      assert(++guard < 1000);
    }
  }
  console.log('OK', layout.id, n, 'Kacheln, Sackgassen bei Zufallsspiel:', dead); dead = 0;
}

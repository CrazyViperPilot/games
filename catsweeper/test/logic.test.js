// node catsweeper/test/logic.test.js
const assert = require('assert');
const L = require('../logic.js');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

for (const lv of Object.keys(L.LEVELS)) {
  const g = L.newGame(lv);
  const mid = (g.rows >> 1) * g.cols + (g.cols >> 1);
  L.reveal(g, mid, rnd);
  assert.strictEqual(g.state === 'lost', false, 'erster Zug ist sicher');
  assert.strictEqual(g.cat.reduce((a, b) => a + b, 0), g.catCount, 'Katzenzahl');
  assert.ok(g.open[mid] && g.count[mid] === 0, 'Startzelle ist eine 0');
  L.neighbors(g, mid).forEach((n) => assert.ok(g.open[n], 'Nachbarn offen'));
}

// Gewinnen: alle Nicht-Katzen aufdecken
{
  const g = L.newGame('easy'); L.reveal(g, 0, rnd);
  for (let i = 0; i < g.cat.length; i++) if (!g.cat[i]) L.reveal(g, i, rnd);
  assert.strictEqual(g.state, 'won');
  assert.strictEqual(L.flagsLeft(g), 0);
}
// Verlieren
{
  const g = L.newGame('easy'); L.reveal(g, 0, rnd);
  const c = g.cat.indexOf(1); L.reveal(g, c, rnd);
  assert.strictEqual(g.state, 'lost'); assert.strictEqual(g.hit, c);
}
// Flaggen blockieren Aufdecken, Chord
{
  const g = L.newGame('easy'); L.reveal(g, 0, rnd);
  const c = g.cat.indexOf(1); L.toggleFlag(g, c); L.reveal(g, c, rnd);
  assert.strictEqual(g.state, 'play'); assert.strictEqual(g.open[c], 0);
  for (let i = 0; i < g.cat.length; i++) if (g.open[i] && g.count[i]) {
    const nb = L.neighbors(g, i);
    nb.forEach((n) => { if (g.cat[n]) g.flag[n] = 1; });
    L.chord(g, i, rnd);
    nb.forEach((n) => { if (!g.cat[n]) assert.ok(g.open[n]); });
    break;
  }
}
// Hinweise liegen nie falsch
for (let t = 0; t < 30; t++) {
  const g = L.newGame('medium'); L.reveal(g, 40, rnd);
  for (let k = 0; k < 20 && g.state === 'play'; k++) {
    const h = L.hint(g); if (!h) break;
    if (h.type === 'safe') { assert.strictEqual(g.cat[h.cell], 0); L.reveal(g, h.cell, rnd); }
    else if (h.type === 'cat') { assert.strictEqual(g.cat[h.cell], 1); L.toggleFlag(g, h.cell); }
    else break;
  }
}
console.log('catsweeper logic: ok');

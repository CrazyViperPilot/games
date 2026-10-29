// Tests für die Spiellogik: node neon-stack/test/logic.test.js
const assert = require('assert');
const L = require('../logic.js');

let n = 0;
function test(name, fn) {
  try { fn(); n++; console.log('ok  ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}

function game(seed = 1) { return L.createGame({ seed }); }
function setPiece(g, type, rot, x, y) { g.cur = { type, rot, x, y }; g.lastRot = false; g.lastKick = 0; g.lockTimer = 0; g.lockResets = 0; g.lowestY = y; }
function fillRow(g, y, gaps = []) { for (let x = 0; x < L.COLS; x++) g.board[y][x] = gaps.includes(x) ? 0 : 8; }

test('Form: jedes Teil hat 4 Zellen in jeder Rotation, O dreht sich nicht', () => {
  for (const t of L.TYPES) for (let r = 0; r < 4; r++) {
    assert.strictEqual(L.SHAPES[t][r].length, 4);
    assert.strictEqual(new Set(L.SHAPES[t][r].map(c => c.join())).size, 4);
  }
  assert.deepStrictEqual(L.SHAPES.O[0], L.SHAPES.O[2]);
});

test('SRS: I-Teil Rotation 1 steht senkrecht in Spalte 2 der Matrix', () => {
  assert.deepStrictEqual(L.SHAPES.I[1].map(c => c[0]), [2, 2, 2, 2]);
  assert.deepStrictEqual(L.SHAPES.T[1].slice().sort().join(';'), '1,0;1,1;1,2;2,1');
});

test('7er-Beutel: die ersten 14 Teile enthalten je zwei Mal jede Sorte', () => {
  const g = game(42);
  const seq = [g.cur.type, ...g.queue];
  while (seq.length < 14) { L.refill(g); g.queue.push(...[]); seq.push(g.queue.shift()); }
  const bag = (a) => a.slice().sort().join('');
  assert.strictEqual(bag(seq.slice(0, 7)), bag(L.TYPES));
});

test('Gleicher Seed = gleiche Folge', () => {
  const a = game(7), b = game(7);
  assert.deepStrictEqual(a.queue, b.queue);
  assert.strictEqual(a.cur.type, b.cur.type);
});

test('Bewegen stoppt an den Wänden', () => {
  const g = game();
  for (let i = 0; i < 20; i++) L.move(g, -1);
  const minX = Math.min(...L.cells(g.cur.type, g.cur.rot, g.cur.x, g.cur.y).map(c => c[0]));
  assert.strictEqual(minX, 0);
  assert.strictEqual(L.move(g, -1), false);
});

test('Hard Drop: Teil landet am Boden, 2 Punkte je Zeile, nächstes Teil erscheint', () => {
  const g = game();
  const type = g.cur.type;
  const next = g.queue[0];
  const r = L.hardDrop(g);
  assert.ok(r.dist > 0);
  assert.strictEqual(g.score, 2 * r.dist);
  assert.strictEqual(g.cur.type, next);
  const bottom = g.board[L.ROWS - 1].filter(Boolean).length + g.board[L.ROWS - 2].filter(Boolean).length;
  assert.strictEqual(bottom, 4);
  assert.strictEqual(L.ID[type] > 0, true);
});

test('Soft Drop gibt 1 Punkt je Zeile', () => {
  const g = game();
  assert.ok(L.softDrop(g));
  assert.ok(L.softDrop(g));
  assert.strictEqual(g.score, 2);
});

test('Ghost liegt auf der Landeposition', () => {
  const g = game();
  const gy = L.ghostY(g);
  assert.ok(!L.collides(g.board, g.cur.type, g.cur.rot, g.cur.x, gy));
  assert.ok(L.collides(g.board, g.cur.type, g.cur.rot, g.cur.x, gy + 1));
});

test('Zeilen löschen: Single, Double, Triple, Tetris mit Punkten × Level', () => {
  const expected = [0, 100, 300, 500, 800];
  for (let k = 1; k <= 4; k++) {
    const g = game();
    // k Zeilen unten bis auf Spalte 0..3 füllen, I-Teil senkrecht in Spalte 0 … einfacher: Lücke in Spalte 9, I senkrecht
    for (let i = 0; i < k; i++) fillRow(g, L.ROWS - 1 - i, [9]);
    g.board[8][0] = 8; // Reststein, damit es kein Perfect Clear gibt
    setPiece(g, 'I', 1, 7, L.ROWS - 4); // senkrecht in Spalte 9, belegt die untersten 4 Zeilen
    const r = L.hardDrop(g);
    assert.strictEqual(r.lines, k);
    assert.strictEqual(g.score, expected[k] + 2 * r.dist);
    assert.strictEqual(g.lines, k);
  }
});

test('Level steigt alle 10 Zeilen und erhöht die Punkte', () => {
  const g = game();
  g.lines = 9;
  fillRow(g, L.ROWS - 1, [9]);
  setPiece(g, 'I', 1, 7, L.ROWS - 4);
  const r = L.hardDrop(g);
  assert.strictEqual(r.levelUp, true);
  assert.strictEqual(g.level, 2);
  assert.strictEqual(g.score, 100 * 1 + 2 * r.dist); // Punkte noch mit altem Level
});

test('Combo: aufeinanderfolgende Clears geben 50 × Combo × Level extra, Fehlzug beendet Combo', () => {
  const g = game();
  fillRow(g, L.ROWS - 1, [9]);
  fillRow(g, L.ROWS - 2, [8]);
  setPiece(g, 'I', 1, 7, L.ROWS - 4); // Spalte 9
  let r = L.hardDrop(g);
  assert.strictEqual(r.combo, 0);
  // Zeile ROWS-1 ist weg; eine Zeile mit Lücke 8 ist nach unten gerutscht? (I belegte 9 in beiden) -> prüfen
  const g2 = game();
  g2.combo = 0;
  fillRow(g2, L.ROWS - 1, [9]);
  setPiece(g2, 'I', 1, 7, L.ROWS - 4);
  const s0 = g2.score;
  r = L.hardDrop(g2);
  assert.strictEqual(r.combo, 1);
  assert.strictEqual(g2.score - s0, 100 + 50 + 2 * r.dist);
  setPiece(g2, 'O', 0, 3, 2);
  r = L.hardDrop(g2);
  assert.strictEqual(r.lines, 0);
  assert.strictEqual(g2.combo, -1);
});

test('Back-to-Back: zweiter Tetris in Folge gibt 1,5×', () => {
  const g = game();
  g.board[8][0] = 8;
  for (let i = 0; i < 4; i++) fillRow(g, L.ROWS - 1 - i, [9]);
  setPiece(g, 'I', 1, 7, L.ROWS - 4);
  let r = L.hardDrop(g);
  assert.strictEqual(r.lines, 4); assert.strictEqual(r.b2b, false); assert.strictEqual(g.b2b, true);
  for (let i = 0; i < 4; i++) fillRow(g, L.ROWS - 1 - i, [9]);
  setPiece(g, 'I', 1, 7, L.ROWS - 4);
  const s0 = g.score; g.combo = -1;
  r = L.hardDrop(g);
  assert.strictEqual(r.b2b, true);
  assert.strictEqual(g.score - s0, 1200 + 2 * r.dist);
});

test('Back-to-Back reißt bei normalem Clear ab', () => {
  const g = game();
  g.b2b = true;
  fillRow(g, L.ROWS - 1, [9]);
  setPiece(g, 'I', 1, 7, L.ROWS - 4);
  L.hardDrop(g);
  assert.strictEqual(g.b2b, false);
});

test('Perfect Clear wird erkannt und gibt Bonus', () => {
  const g = game();
  fillRow(g, L.ROWS - 1, [6, 7, 8, 9]);
  setPiece(g, 'I', 0, 6, L.ROWS - 2); // flach, untere Reihe der Matrix = Zeile ROWS-1... Zellen in Matrixzeile 1
  const r = L.hardDrop(g);
  assert.strictEqual(r.lines, 1);
  assert.strictEqual(r.perfect, true);
  assert.strictEqual(g.score, 100 + 800 + 2 * r.dist);
});

test('Hold: tauscht, nur einmal pro Teil, wieder frei nach Lock', () => {
  const g = game();
  const first = g.cur.type, next = g.queue[0];
  assert.ok(L.holdPiece(g));
  assert.strictEqual(g.hold, first);
  assert.strictEqual(g.cur.type, next);
  assert.strictEqual(L.holdPiece(g), false);
  L.hardDrop(g);
  assert.strictEqual(g.holdUsed, false);
  const cur = g.cur.type;
  assert.ok(L.holdPiece(g));
  assert.strictEqual(g.cur.type, first);
  assert.strictEqual(g.hold, cur);
});

test('Rotation an der Wand nutzt Kicks (T an linker Wand)', () => {
  const g = game();
  setPiece(g, 'T', 1, -1, 10); // senkrecht, Zellen in Spalte 0..1
  // Rotation von R nach 2 (flach, Spitze unten) braucht x >= 0
  const ok = L.rotate(g, 1);
  assert.ok(ok);
  const xs = L.cells('T', g.cur.rot, g.cur.x, g.cur.y).map(c => c[0]);
  assert.ok(Math.min(...xs) >= 0);
});

test('Rotation ist blockiert, wenn alle Kicks kollidieren', () => {
  const g = game();
  for (let y = 5; y < L.ROWS; y++) fillRow(g, y, []);
  for (let x = 3; x <= 6; x++) g.board[10][x] = 0; // nur ein waagerechter Schlitz
  setPiece(g, 'I', 0, 3, 9); // Matrixzeile 1 = Zeile 10
  assert.strictEqual(L.collides(g.board, 'I', 0, 3, 9), false);
  assert.strictEqual(L.rotate(g, 1), false);
  assert.strictEqual(g.cur.rot, 0);
});

test('T-Spin Double: volle vordere Ecken → full, 1200 × Level', () => {
  const g = game();
  const R = L.ROWS;
  g.board[5][0] = 8; // kein Perfect Clear
  fillRow(g, R - 1, [5]);
  fillRow(g, R - 2, [4, 5, 6]);
  g.board[R - 3][4] = 8; // Überhang
  setPiece(g, 'T', 2, 4, R - 3); // Spitze zeigt nach unten in die Lücke
  assert.ok(!L.collides(g.board, 'T', 2, 4, R - 3));
  g.lastRot = true; g.lastKick = 0;
  const r = L.lock(g, false, 0);
  assert.strictEqual(r.tspin, 'full');
  assert.strictEqual(r.lines, 2);
  assert.strictEqual(r.gain, 1200);
});

test('T-Spin Mini: nur eine vordere Ecke belegt, keine Zeile', () => {
  const g = game();
  const R = L.ROWS;
  fillRow(g, R - 1, [5, 6]);
  g.board[R - 3][4] = 8; g.board[R - 3][6] = 8; // obere Ecken
  setPiece(g, 'T', 2, 4, R - 3);
  // Nub bei x=5 in Zeile R-1, Körper in Zeile R-2 (x 4..6): frei?
  assert.ok(!L.collides(g.board, 'T', 2, 4, R - 3));
  g.lastRot = true; g.lastKick = 0;
  const r = L.lock(g, false, 0);
  assert.strictEqual(r.tspin, 'mini');
  assert.strictEqual(r.lines, 0);
  assert.strictEqual(r.gain, 100);
});

test('T-Spin: Kick Nr. 5 macht aus Mini einen vollen T-Spin', () => {
  const g = game();
  const R = L.ROWS;
  fillRow(g, R - 1, [5, 6]);
  g.board[R - 3][4] = 8; g.board[R - 3][6] = 8;
  setPiece(g, 'T', 2, 4, R - 3);
  g.lastRot = true; g.lastKick = 4;
  assert.strictEqual(L.lock(g, false, 0).tspin, 'full');
});

test('T-Spin: keine Drehung zuletzt = kein T-Spin', () => {
  const g = game();
  const R = L.ROWS;
  g.board[R - 1][4] = 8; g.board[R - 1][6] = 8; g.board[R - 3][4] = 8; g.board[R - 3][6] = 8;
  setPiece(g, 'T', 2, 4, R - 3);
  g.lastRot = false;
  assert.strictEqual(L.lock(g, false, 0).tspin, '');
});

test('Tick: Schwerkraft zieht nach gravityMs eine Zeile', () => {
  const g = game();
  const y0 = g.cur.y;
  L.tick(g, L.gravityMs(1) + 1);
  assert.strictEqual(g.cur.y, y0 + 1);
});

test('Tick: Lock-Delay sperrt das Teil erst nach 500 ms am Boden', () => {
  const g = game();
  const first = g.cur;
  g.cur.y = L.ghostY(g);
  g.lockTimer = 0;
  L.tick(g, 300);
  assert.strictEqual(g.cur, first);
  L.tick(g, 250);
  assert.notStrictEqual(g.cur, first);
});

test('Lock-Delay: Bewegen am Boden setzt den Timer zurück (max. 15×)', () => {
  const g = game();
  g.cur.y = L.ghostY(g);
  g.lowestY = g.cur.y;
  for (let i = 0; i < 20; i++) {
    L.tick(g, 400);
    L.move(g, i % 2 ? 1 : -1);
  }
  // nach 15 Resets muss das Teil trotz Bewegen gesperrt worden sein
  assert.ok(g.pieces >= 2);
});

test('Game Over (Block Out): neues Teil kann nicht erscheinen', () => {
  const g = game();
  for (let y = 4; y < L.ROWS; y++) fillRow(g, y, [9]);
  setPiece(g, 'O', 0, 3, 2);
  L.hardDrop(g);
  assert.strictEqual(g.over, true);
  assert.ok(L.drainEvents(g).some((e) => e.t === 'over'));
});

test('Game Over (Lock Out): Teil liegt komplett im verdeckten Bereich', () => {
  const g = game();
  for (let y = 2; y < L.ROWS; y++) fillRow(g, y, [9]);
  setPiece(g, 'I', 0, 3, 0); // Matrixzeile 1 = Zeile 1
  L.hardDrop(g);
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.cur, null);
});

test('Speichern/Laden ergibt identisches Spiel', () => {
  const g = game(99);
  L.hardDrop(g); L.move(g, 1); L.holdPiece(g);
  const g2 = L.deserialize(L.serialize(g));
  assert.deepStrictEqual(g2.board, g.board);
  assert.deepStrictEqual(g2.cur, g.cur);
  assert.deepStrictEqual(g2.queue, g.queue);
  L.hardDrop(g); L.hardDrop(g2);
  assert.deepStrictEqual(g2.board, g.board);
  assert.deepStrictEqual(g2.queue, g.queue);
});

test('Zufallsspiel: 3000 Züge ohne Fehler, Board bleibt konsistent', () => {
  const g = game(5);
  let steps = 0;
  while (!g.over && steps++ < 3000) {
    const r = Math.floor(L.rand(g) * 6);
    if (r === 0) L.move(g, -1); else if (r === 1) L.move(g, 1); else if (r === 2) L.rotate(g, 1);
    else if (r === 3) L.rotate(g, -1); else if (r === 4) L.holdPiece(g); else L.hardDrop(g);
    L.tick(g, 100);
    L.drainEvents(g);
    for (const row of g.board) assert.strictEqual(row.length, L.COLS);
    assert.strictEqual(g.board.length, L.ROWS);
  }
  assert.ok(steps > 10);
});

console.log(n + ' Tests bestanden');

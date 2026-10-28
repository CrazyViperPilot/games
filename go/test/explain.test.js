const test = require('node:test');
const assert = require('node:assert/strict');
const go = require('../go.js');
Object.assign(globalThis, go);

const app = require('../app.js');

function fromDiagram(rows, toMove = go.GO_BLACK) {
    const size = rows.length;
    const g = go.goCreate(size);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
        g.board[y * size + x] = ch === 'X' ? go.GO_BLACK : ch === 'O' ? go.GO_WHITE : go.GO_EMPTY;
    }));
    return { ...g, toMove };
}

test('posLabel computes correct standard Go board coordinates skipping I', () => {
    // 9x9 board:
    // row 0 is top (rank 9), row 8 is bottom (rank 1)
    // col 0 is A, col 7 is H, col 8 is J (skips I)
    assert.equal(app.posLabel(0, 9), 'A9');           // top-left
    assert.equal(app.posLabel(8, 9), 'J9');           // top-right
    assert.equal(app.posLabel(8 * 9 + 0, 9), 'A1');   // bottom-left
    assert.equal(app.posLabel(8 * 9 + 8, 9), 'J1');   // bottom-right
    assert.equal(app.posLabel(4 * 9 + 4, 9), 'E5');   // tengen (center)
});

test('generateExplanation returns initial message when no move was played', () => {
    const expl = app.generateExplanation(null, null);
    assert.match(expl, /Noch kein Zug gespielt/);
});

test('generateExplanation describes a standard opening move with liberties', () => {
    const g0 = go.goCreate(9);
    // Human plays center (4,4) = 40 (E5)
    const g1 = go.goPlay(g0, 4 * 9 + 4);

    const expl = app.generateExplanation(g1, g0);
    assert.match(expl, /Du \(Schwarz\) spielst E5/);
    assert.match(expl, /der Stein hat 4 Freiheiten/);
});

test('generateExplanation describes computer pass correctly', () => {
    const g0 = { ...go.goCreate(9), toMove: go.GO_WHITE };
    const g1 = go.goPass(g0);

    const expl = app.generateExplanation(g1, g0);
    assert.match(expl, /Der Computer \(Weiß\) hat gepasst/);
    assert.match(expl, /keinen nützlichen Zug mehr/);
});

test('generateExplanation describes human pass correctly', () => {
    const g0 = { ...go.goCreate(9), toMove: go.GO_BLACK };
    const g1 = go.goPass(g0);

    const expl = app.generateExplanation(g1, g0);
    assert.match(expl, /Du \(Schwarz\) hast gepasst/);
});

test('generateExplanation explains normal captures', () => {
    const g0 = fromDiagram([
        '.O.',
        'OX.',
        '.O.',
    ], go.GO_WHITE);
    // White captures black at (1,1) by playing at (2,1) = index 5
    const g1 = go.goPlay(g0, 1 * 3 + 2);

    const expl = app.generateExplanation(g1, g0);
    assert.match(expl, /Der Computer \(Weiß\) spielt/);
    assert.match(expl, /fängt 1 Stein/);
    assert.match(expl, /keine Freiheiten mehr/);
});

test('generateExplanation explains apparent suicide capture with full rule context', () => {
    // Board where black ring surrounds a single spot (2,2) and has NO outside liberties.
    // White plays at (2,2). It is surrounded completely by black, but captures the black ring!
    const g0 = fromDiagram([
        'OOOOO',
        'OXXXO',
        'OX.XO',
        'OXXXO',
        'OOOOO',
    ], go.GO_WHITE);

    const centerIdx = 2 * 5 + 2;
    const g1 = go.goPlay(g0, centerIdx);

    const expl = app.generateExplanation(g1, g0);
    assert.match(expl, /Der Computer \(Weiß\) spielt C3 und fängt 8 Steine/);
    assert.match(expl, /Das sieht aus wie Selbstmord, ist es aber nicht/);
    assert.match(expl, /Die umgebende Gruppe hatte nur noch diese eine Freiheit/);
    assert.match(expl, /Der gesetzte Stein lebt, weil durch das Schlagen Freiheiten entstehen/);
});

test('generateExplanation explains Ko rule when active', () => {
    const g0 = fromDiagram([
        '.OX.',
        'OX.X',
        '.OX.',
        '....',
    ], go.GO_WHITE);

    // White captures at (2,1) = 1 * 4 + 2
    const g1 = go.goPlay(g0, 1 * 4 + 2);
    assert.ok(g1.ko >= 0, 'ko should be set');

    const expl = app.generateExplanation(g1, g0);
    assert.match(expl, /Ko-Regel/);
    assert.match(expl, /darf im nächsten Zug nicht direkt zurückgeschlagen werden/);
});

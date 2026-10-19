const test = require('node:test');
const assert = require('node:assert/strict');
const go = require('../go.js');
// ai.js expects the rule functions as globals, the same way the browser loads them.
Object.assign(globalThis, go);
const ai = require('../ai.js');

// Builds a square board from a text diagram: X = black, O = white, . = empty.
function fromDiagram(rows, toMove = go.GO_BLACK) {
    const size = rows.length;
    const g = go.goCreate(size);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
        g.board[y * size + x] = ch === 'X' ? go.GO_BLACK : ch === 'O' ? go.GO_WHITE : go.GO_EMPTY;
    }));
    return { ...g, toMove };
}

test('a stone with no liberties left is captured', () => {
    const g = fromDiagram([
        '.O.',
        'OX.',
        '.O.',
    ], go.GO_WHITE);
    const after = go.goPlay(g, 1 * 3 + 2); // white takes the last liberty at (2,1)
    assert.ok(after, 'move should be legal');
    assert.equal(after.board[1 * 3 + 1], go.GO_EMPTY);
    assert.equal(after.captures[go.GO_WHITE], 1);
});

test('suicide is rejected', () => {
    const g = fromDiagram([
        '.X.',
        'X.X',
        '.X.',
    ], go.GO_WHITE);
    assert.equal(go.goPlay(g, 1 * 3 + 1), null);
});

test('simple ko blocks immediate recapture', () => {
    const g = fromDiagram([
        '.OX.',
        'OX.X',
        '.OX.',
        '....',
    ], go.GO_WHITE);
    const afterCapture = go.goPlay(g, 1 * 4 + 2); // white takes the black stone at (1,1)
    assert.ok(afterCapture, 'capture should be legal');
    assert.equal(afterCapture.board[1 * 4 + 1], go.GO_EMPTY);
    assert.equal(go.goPlay(afterCapture, 1 * 4 + 1), null, 'recapture must be blocked by ko');
});

test('two passes in a row move the game to scoring', () => {
    let g = go.goCreate(9);
    g = go.goPass(g);
    assert.equal(g.phase, 'play');
    g = go.goPass(g);
    assert.equal(g.phase, 'score');
    assert.equal(g.dead.length, 81);
});

test('area scoring counts stones and territory, plus komi for white', () => {
    const g = fromDiagram([
        'XX...',
        'XX...',
        'XX...',
        'XX...',
        'XX...',
    ]);
    const s = go.goScore(g);
    assert.equal(s.black, 25);            // 10 stones + 15 empty points touching only black
    assert.equal(s.white, go.GO_KOMI);
    assert.equal(s.winner, go.GO_BLACK);
});

test('marking a group dead moves its points out of the white total', () => {
    const g = fromDiagram([
        'XXXXX',
        'XOOOX',
        'XXXXX',
        '.....',
        '.....',
    ]);
    const scoring = { ...g, phase: 'score', dead: new Array(25).fill(false) };
    const before = go.goScore(scoring);
    const after = go.goScore(go.goToggleDead(scoring, 1 * 5 + 1));
    assert.equal(before.white, 3 + go.GO_KOMI);
    assert.equal(after.white, go.GO_KOMI);
});

test('easy AI always returns a legal move or a pass', () => {
    let g = go.goCreate(9);
    for (let turn = 0; turn < 40 && g.phase === 'play'; turn++) {
        const idx = ai.goAiChoose(g, 'easy');
        const next = idx < 0 ? go.goPass(g) : go.goPlay(g, idx);
        assert.ok(next, `easy produced an illegal move at ${idx}`);
        g = next;
    }
});

test('medium AI returns a legal move within its time budget', () => {
    const g = go.goCreate(9);
    const start = Date.now();
    const idx = ai.goAiChoose(g, 'medium');
    assert.ok(go.goPlay(g, idx), 'medium produced an illegal move');
    assert.ok(Date.now() - start < 3000, 'medium took too long');
});

test('computer keeps playing after a human pass while space is still open', () => {
    const g = { ...go.goCreate(9), passes: 1, toMove: go.GO_WHITE };
    assert.notEqual(ai.goAiChoose(g, 'easy'), -1);
});

test('computer passes after a human pass when it leads and the board is settled', () => {
    const g = fromDiagram([
        'XOOOO',
        'XOOOO',
        'XOOOO',
        'XOOOO',
        'XOOOO',
    ], go.GO_WHITE);
    const settled = { ...g, passes: 1 };
    assert.equal(go.goScore(settled).neutral, 0);
    assert.equal(ai.goAiChoose(settled, 'easy'), -1);
});

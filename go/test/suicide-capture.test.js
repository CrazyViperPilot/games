const test = require('node:test');
const assert = require('node:assert/strict');
const go = require('../go.js');
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

// ================================================================
// Test 1: True suicide – white plays into a single-point gap
// surrounded entirely by black, where the black groups all have
// OTHER liberties too. No capture happens → must be rejected.
// ================================================================
//
//   . X .
//   X . X    ← white tries to play at center (1,1)
//   . X .
//
// All four black stones have 2+ liberties each, so white can't
// capture any of them. White's stone at (1,1) would have 0 liberties.
// → goPlay must return null.
test('suicide into single gap surrounded by black with healthy groups is rejected', () => {
    const g = fromDiagram([
        '.X.',
        'X.X',
        '.X.',
    ], go.GO_WHITE);

    const result = go.goPlay(g, 1 * 3 + 1); // center
    assert.equal(result, null, 'white playing into a surrounded single point with no captures should be suicide');
});

// ================================================================
// Test 2: Playing into a surrounded point that CAPTURES an opponent
// group in atari – this is legal in standard Go rules.
// ================================================================
//
//   O X .
//   X . X    ← white plays at (1,1): this is the last liberty
//   . X .      of the black stone at (0,0)... wait, (0,0) is O.
//
// Better scenario for a capture:
//   X X .
//   X . X    ← The black stone at (0,1) has liberties at (0,0)
//   . X .      already filled. Let's design a clearer case.
//
// Let me design a case where a black group is in atari and white
// plays into their last liberty, capturing them:
//
//   O O .        Black groups: single stone at (1,0) with liberty at (2,0)
//   O X O        ... no that's wrong, X is black.
//   . O .
//
// Re-think: The user scenario is "area with only black stones, white
// plays into the single free spot". Let's model a clear case:
//
// 5x5 board with a fully enclosed region by black containing one free spot
//
//   . . . . .
//   . X X X .
//   . X . X .    ← white tries to play at (2,2)
//   . X X X .
//   . . . . .
//
// All black stones around (2,2) have external liberties. White playing
// at (2,2) captures nothing and has 0 liberties → suicide → illegal.
test('suicide: white plays into enclosed single point in center of black wall (5x5)', () => {
    const g = fromDiagram([
        '.....',
        '.XXX.',
        '.X.X.',
        '.XXX.',
        '.....',
    ], go.GO_WHITE);

    const result = go.goPlay(g, 2 * 5 + 2); // center at (2,2)
    assert.equal(result, null, 'white playing into fully enclosed single point should be suicide');
});

// ================================================================
// Test 3: Same shape but black has NO outside liberties – white
// playing there CAPTURES the black group. This IS legal.
// ================================================================
//
//   O O O O O
//   O X X X O
//   O X . X O    ← white plays at (2,2), captures all 8 black stones
//   O X X X O
//   O O O O O
//
// The black ring has no outside liberties (all surrounded by white).
// The only liberty the black group has is (2,2) itself.
// White places at (2,2) → black group has 0 liberties → captured.
// Then white's stone at (2,2) has 4 liberties from the captured spots.
// → Legal move!
test('playing into surrounded point that captures the enclosing group IS legal', () => {
    const g = fromDiagram([
        'OOOOO',
        'OXXXO',
        'OX.XO',
        'OXXXO',
        'OOOOO',
    ], go.GO_WHITE);

    const result = go.goPlay(g, 2 * 5 + 2); // center
    assert.ok(result, 'white playing at center should capture all black stones – legal move');
    // All 8 black stones should be captured
    assert.equal(result.captures[go.GO_WHITE], 8);
    // The center should now be white
    assert.equal(result.board[2 * 5 + 2], go.GO_WHITE);
    // All the former black positions should be empty
    for (const pos of [1*5+1, 1*5+2, 1*5+3, 2*5+1, 2*5+3, 3*5+1, 3*5+2, 3*5+3]) {
        assert.equal(result.board[pos], go.GO_EMPTY, `position ${pos} should be empty after capture`);
    }
});

// ================================================================
// Test 4: Single black stone in atari – white captures it by
// filling its last liberty. The white stone ends up with liberties
// from the now-empty spot. Legal.
// ================================================================
//
//   . O .
//   O X O    ← black at (1,1) has only one liberty: none! Wait...
//   . O .
//
// Actually black at (1,1) has 0 liberties in this diagram – that's
// an already-captured state. Let me use:
//
//   . . .
//   . X O    ← black at (1,1) has liberties at (0,1), (1,0), (1,2)
//   . O .      ... no, (1,2) is O.
//
// Clearer:
//   . O .
//   O X .    ← black at (1,1) has one liberty at (2,1)
//   . O .
//
// White plays at (2,1): captures black stone at (1,1). Legal.
test('white captures a single black stone in atari by filling its last liberty', () => {
    const g = fromDiagram([
        '.O.',
        'OX.',
        '.O.',
    ], go.GO_WHITE);

    // Black at (1,1) has one liberty at (2,1)
    const blackGroup = go.goGroup(g.board, g.size, 1 * 3 + 1);
    assert.equal(blackGroup.liberties.size, 1, 'black should have exactly 1 liberty');
    assert.ok(blackGroup.liberties.has(1 * 3 + 2), 'that liberty should be at (2,1)');

    const result = go.goPlay(g, 1 * 3 + 2); // white plays at (2,1)
    assert.ok(result, 'capturing a stone in atari should be legal');
    assert.equal(result.board[1 * 3 + 1], go.GO_EMPTY, 'black stone should be captured');
    assert.equal(result.captures[go.GO_WHITE], 1);
});

// ================================================================
// Test 5: The exact user scenario – "area with only black stones,
// single free spot" where black stones have other liberties.
// This tests a larger, more realistic board region.
// ================================================================
//
//   . . . . . . . . .
//   . . . . . . . . .
//   . . X X X X X . .
//   . . X X X X X . .
//   . . X X . X X . .    ← single free spot at (4,4) on 9x9
//   . . X X X X X . .
//   . . X X X X X . .
//   . . . . . . . . .
//   . . . . . . . . .
//
// White plays at (4,4). All surrounding black stones have outside
// liberties. No capture. White stone has 0 liberties → suicide.
test('realistic 9x9: white cannot play into single gap in large black territory', () => {
    const g = fromDiagram([
        '.........',
        '.........',
        '..XXXXX..',
        '..XXXXX..',
        '..XX.XX..',
        '..XXXXX..',
        '..XXXXX..',
        '.........',
        '.........',
    ], go.GO_WHITE);

    const result = go.goPlay(g, 4 * 9 + 4); // center at (4,4)
    assert.equal(result, null, 'white cannot play into surrounded single point in black territory');
});

// ================================================================
// Test 6: AI should NOT choose to play into a suicide spot.
// Give the AI a position where the only "interesting" spot is a
// suicide point, ensure it doesn't pick it.
// ================================================================
test('AI does not include true suicide moves as candidates', () => {
    // 5x5 board: gap at (2,2) is true suicide for white — all surrounding
    // black stones have outside liberties, so no capture happens.
    const g = fromDiagram([
        '.....',
        '.XXX.',
        '.X.X.',
        '.XXX.',
        '.....',
    ], go.GO_WHITE);

    const candidates = ai.goCandidates(g, go.GO_WHITE);
    // The center (2,2) = index 12 should NOT be in the candidate list
    assert.ok(!candidates.includes(2 * 5 + 2), 'true suicide point should not be a candidate');
});

test('AI DOES include capture-that-looks-like-suicide as candidate', () => {
    // 3x3 board fully surrounded by black: playing center captures all 8 stones.
    // This is legal, so the AI should include it.
    const g = fromDiagram([
        'XXX',
        'X.X',
        'XXX',
    ], go.GO_WHITE);

    const candidates = ai.goCandidates(g, go.GO_WHITE);
    assert.ok(candidates.includes(1 * 3 + 1), 'capture move should be a valid candidate');
});

// ================================================================
// Test 7: Multi-stone suicide – a white group that would have
// zero liberties after placement. Should be rejected.
// ================================================================
//
//   X X X X
//   X O . X    ← white plays at (2,1), forming a 2-stone white
//   X X X X      group O at (1,1) and (2,1), both fully enclosed.
//
// The existing white stone at (1,1) has 1 liberty at (2,1).
// If white plays at (2,1), the white group {(1,1),(2,1)} has 0 liberties.
// No black group is in atari from this move. → Suicide, rejected.
test('multi-stone suicide is also rejected', () => {
    const g = fromDiagram([
        'XXXX',
        'XO.X',
        'XXXX',
    ], go.GO_WHITE);

    const result = go.goPlay(g, 1 * 4 + 2); // white plays at (2,1)
    assert.equal(result, null, 'multi-stone suicide should be rejected');
});

// ================================================================
// Test 8: Verify that a "capture-then-live" move is correctly legal.
// White plays into a spot surrounded by black, but one of the
// adjacent black groups is in atari. White captures it and lives.
// ================================================================
//
//   X X X
//   X . X    ← white plays at (1,1).
//   X X .      Black group connected to (2,2) = empty at (2,2).
//              But the WHOLE black wall is one connected group with
//              liberty at (2,2) and (1,1). After white plays at (1,1),
//              the black group still has liberty at (2,2). No capture.
//              White at (1,1) has 0 liberties. Suicide. Rejected.
//
// Hmm, that doesn't create a capture. Let me design properly:
//
//   O X .
//   X . X    ← white plays at (1,1).
//   . X .      Adjacent opponent (black) stones: (0,1)=X, (1,0)=X,
//              (1,2)=X, (2,1)=X.
//              (0,1) is connected with (0,0)? No, (0,0) is O (white).
//              (0,1) = X: neighbors are (0,0)=O, (0,2)=., (1,1)=.(will be O).
//              So X at (0,1) has liberties: (0,2). After O placed at (1,1),
//              X at (0,1) still has liberty (0,2). Not captured.
//              Similarly for others. White at (1,1) has 0 liberties → suicide.
//
// For a proper capture scenario with surrounding black stones:
//   . X .
//   X . X    ← (1,1) is empty. White to play.
//   . X .      If white plays at (1,1), can it capture anything?
//              Adjacent: (0,1)=X, (1,0)=X, (1,2)=X, (2,1)=X
//              Each X has 2 liberties (one is (1,1), one is a corner).
//              After white places at (1,1), each X loses the (1,1) liberty.
//              (0,1) has liberties: was {(0,0),(0,2),(1,1)} → {(0,0),(0,2)}.
//              Still 2 liberties. No capture. White suicide. Correct.
//
// To make a capture-then-live scenario on 3x3:
//
//   O X O      ← Let's recheck: The X at (0,1) has neighbors
//   X . X        (0,0)=O, (0,2)=O, (1,1)=empty.
//   O X O        After white plays (1,1): X at (0,1) neighbors
//                (0,0)=O, (0,2)=O, (1,1)=O → 0 liberties! Captured!
//                Same for all 4 X stones: each is isolated, each has
//                only (1,1) as liberty → all captured.
//                After capture, white at (1,1) has 4 liberties. Legal!
test('capture-then-live: white captures 4 isolated black stones at once', () => {
    const g = fromDiagram([
        'OXO',
        'X.X',
        'OXO',
    ], go.GO_WHITE);

    const result = go.goPlay(g, 1 * 3 + 1); // white plays center
    assert.ok(result, 'should be legal: white captures all 4 black stones');
    assert.equal(result.captures[go.GO_WHITE], 4);
    assert.equal(result.board[0 * 3 + 1], go.GO_EMPTY); // top
    assert.equal(result.board[1 * 3 + 0], go.GO_EMPTY); // left
    assert.equal(result.board[1 * 3 + 2], go.GO_EMPTY); // right
    assert.equal(result.board[2 * 3 + 1], go.GO_EMPTY); // bottom
});

// ================================================================
// Test 9: Edge case – suicide on the board edge.
// ================================================================
//
//   X .       ← white plays at (0,1). Neighbors of (0,1): (0,0)=X, (1,1)=.
//   . .         X at (0,0) has liberties (1,0) and (0,1). After white plays
//               at (0,1), X at (0,0) has liberty (1,0). Not captured.
//               White at (0,1) has liberties (1,1). Has a liberty! Legal.
//
// That's not suicide. Let me make a real edge suicide:
//   X X
//   X .    ← white plays at (1,1). Neighbors: (0,1)=X, (1,0)=X.
//            X at (0,1) has liberties from (0,0)=X... wait, (0,0)=X so
//            the whole thing is one group {(0,0),(0,1),(1,0)} with
//            liberties {(1,1)}. After white plays (1,1), that group
//            has 0 liberties → captured! White lives. Legal.
//
// Actual edge suicide:
//   O X
//   X .    ← white plays at (1,1). (0,0)=O, (0,1)=X, (1,0)=X.
//            Neighbors of (1,1): (0,1)=X, (1,0)=X.
//            X at (0,1): group = {(0,1)}, liberties from neighbors
//            (0,0)=O → not liberty, (1,1)=will be O → not liberty.
//            0 liberties → captured!
//            X at (1,0): group = {(1,0)}, neighbors (0,0)=O, (1,1)=will be O.
//            0 liberties → captured!
//            After captures: white at (1,1) has liberties. Legal!
//
// Hmm it's hard to make edge suicide in 2x2. Let me try corner:
//   X
//   .  ← 1x2 is too small. Let me do:
//
//   X X X
//   X . X   ← on a 3x2 board? No, boards are square in this game.
//
// Let me just do a clean 3x3 corner suicide:
//   . X .
//   X . .
//   . . .
// White plays (0,0). Neighbors: (0,1)=X, (1,0)=X. Both have other
// liberties. White at (0,0) has 0 liberties → suicide.
test('corner suicide is rejected', () => {
    const g = fromDiagram([
        '.X.',
        'X..',
        '...',
    ], go.GO_WHITE);

    const result = go.goPlay(g, 0); // white plays at (0,0)
    assert.equal(result, null, 'playing into a corner surrounded by opponent should be suicide');
});

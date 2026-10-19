// =============================================================
// Go rules – 9x9 / 13x13, simple ko, area scoring (Chinese rules)
// Every function returns a new game object; nothing is mutated.
// =============================================================
const GO_EMPTY = 0;
const GO_BLACK = 1;
const GO_WHITE = 2;
const GO_KOMI = 6.5;

function goCreate(size) {
    return {
        size,
        board: new Array(size * size).fill(GO_EMPTY),
        toMove: GO_BLACK,
        ko: -1,
        passes: 0,
        captures: { [GO_BLACK]: 0, [GO_WHITE]: 0 },
        lastMove: -1,
        phase: 'play',  // 'play' | 'score' | 'over'
        dead: null,     // per-cell flags, only used while scoring
        result: null    // set when phase === 'over'
    };
}

const goNeighborTables = {};

function goNeighbors(size, idx) {
    if (!goNeighborTables[size]) {
        const table = [];
        for (let i = 0; i < size * size; i++) {
            const x = i % size;
            const y = (i - x) / size;
            const list = [];
            if (x > 0) list.push(i - 1);
            if (x < size - 1) list.push(i + 1);
            if (y > 0) list.push(i - size);
            if (y < size - 1) list.push(i + size);
            table.push(list);
        }
        goNeighborTables[size] = table;
    }
    return goNeighborTables[size][idx];
}

// Flood-fills the connected stones of the same color as `start`.
function goGroup(board, size, start) {
    const color = board[start];
    const stones = [start];
    const seen = new Set(stones);
    const liberties = new Set();
    for (let i = 0; i < stones.length; i++) {
        for (const n of goNeighbors(size, stones[i])) {
            if (board[n] === GO_EMPTY) liberties.add(n);
            else if (board[n] === color && !seen.has(n)) {
                seen.add(n);
                stones.push(n);
            }
        }
    }
    return { stones, liberties };
}

// A point is an "eye" if all its neighbours are our own stones.
// The AI avoids filling these so it doesn't throw away its own territory.
function goIsOwnEye(game, idx, color) {
    return goNeighbors(game.size, idx).every(n => game.board[n] === color);
}

// Returns the game after `idx` is played by the side to move, or null if illegal.
function goPlay(game, idx) {
    if (game.phase !== 'play' || game.board[idx] !== GO_EMPTY || idx === game.ko) return null;

    const me = game.toMove;
    const opp = 3 - me;
    const board = game.board.slice();
    board[idx] = me;

    const captured = [];
    for (const n of goNeighbors(game.size, idx)) {
        if (board[n] !== opp) continue;  // already removed in this move
        const group = goGroup(board, game.size, n);
        if (group.liberties.size === 0) {
            for (const s of group.stones) {
                board[s] = GO_EMPTY;
                captured.push(s);
            }
        }
    }

    const own = goGroup(board, game.size, idx);
    if (own.liberties.size === 0) return null;  // suicide

    const koCapture = captured.length === 1 && own.stones.length === 1 && own.liberties.size === 1;
    return {
        ...game,
        board,
        toMove: opp,
        ko: koCapture ? captured[0] : -1,
        passes: 0,
        captures: { ...game.captures, [me]: game.captures[me] + captured.length },
        lastMove: idx
    };
}

// Two passes in a row end the playing phase and start scoring.
function goPass(game) {
    if (game.phase !== 'play') return null;
    const passes = game.passes + 1;
    const scoring = passes >= 2;
    return {
        ...game,
        passes,
        toMove: 3 - game.toMove,
        ko: -1,
        lastMove: -1,
        phase: scoring ? 'score' : 'play',
        dead: scoring ? new Array(game.size * game.size).fill(false) : null
    };
}

// While scoring, tapping a stone marks its whole group as dead (or alive again).
function goToggleDead(game, idx) {
    if (game.phase !== 'score' || game.board[idx] === GO_EMPTY) return null;
    const dead = game.dead.slice();
    const mark = !dead[idx];
    for (const s of goGroup(game.board, game.size, idx).stones) dead[s] = mark;
    return { ...game, dead };
}

function goResign(game, color) {
    return { ...game, phase: 'over', result: { winner: 3 - color, resigned: true } };
}

function goFinish(game) {
    return { ...game, phase: 'over', result: { ...goScore(game), resigned: false } };
}

// Area score: stones plus empty regions touched by only one color.
// Dead stones are treated as empty, so their territory counts for the opponent.
function goScore(game) {
    const { size } = game;
    const board = game.board.map((c, i) => (game.dead && game.dead[i] ? GO_EMPTY : c));
    const area = { [GO_BLACK]: 0, [GO_WHITE]: 0 };
    const seen = new Array(size * size).fill(false);
    let neutral = 0;

    for (let i = 0; i < board.length; i++) {
        if (board[i] !== GO_EMPTY) {
            area[board[i]]++;
            continue;
        }
        if (seen[i]) continue;

        const region = [i];
        seen[i] = true;
        let borders = 0;  // bitmask: 1 = touches black, 2 = touches white
        for (let k = 0; k < region.length; k++) {
            for (const n of goNeighbors(size, region[k])) {
                if (board[n] === GO_EMPTY) {
                    if (!seen[n]) {
                        seen[n] = true;
                        region.push(n);
                    }
                } else {
                    borders |= board[n];
                }
            }
        }
        if (borders === GO_BLACK) area[GO_BLACK] += region.length;
        else if (borders === GO_WHITE) area[GO_WHITE] += region.length;
        else neutral += region.length;  // untouched or contested space
    }

    const black = area[GO_BLACK];
    const white = area[GO_WHITE] + GO_KOMI;
    return { black, white, neutral, winner: black > white ? GO_BLACK : GO_WHITE };
}

if (typeof module !== 'undefined') {
    module.exports = {
        GO_EMPTY, GO_BLACK, GO_WHITE, GO_KOMI,
        goCreate, goNeighbors, goGroup, goIsOwnEye,
        goPlay, goPass, goToggleDead, goResign, goFinish, goScore
    };
}

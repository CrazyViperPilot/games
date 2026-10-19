// =============================================================
// Computer opponent
//   easy:   one-ply heuristic (captures, liberties, no self-atari) plus noise
//   medium: flat Monte Carlo – random playouts per candidate, time-limited
// Returns a board index, or -1 to pass.
// =============================================================
const GO_AI_TIME_MS = 1200;
const GO_AI_MAX_ROUNDS = 400;
const GO_AI_SHORTLIST = 24;

function goAiChoose(game, level) {
    const color = game.toMove;
    // After the opponent passed, end the game if we lead and no neutral space is left.
    if (game.passes > 0) {
        const score = goScore(game);
        if (score.neutral === 0 && score.winner === color) return -1;
    }
    const candidates = goCandidates(game, color);
    if (candidates.length === 0) return -1;
    return level === 'medium'
        ? goAiMedium(game, candidates, color)
        : goAiEasy(game, candidates, color);
}

function goCandidates(game, color) {
    const moves = [];
    for (let i = 0; i < game.board.length; i++) {
        if (game.board[i] !== GO_EMPTY || goIsOwnEye(game, i, color)) continue;
        if (goPlay(game, i)) moves.push(i);
    }
    return moves;
}

// Quick one-ply score: captures, liberties, no self-atari, prefer the center.
function goHeuristic(game, idx, color) {
    const next = goPlay(game, idx);
    const captured = next.captures[color] - game.captures[color];
    const liberties = goGroup(next.board, game.size, idx).liberties.size;
    const c = (game.size - 1) / 2;
    const x = idx % game.size;
    const y = (idx - x) / game.size;
    return captured * 10
        + Math.min(liberties, 4) * 2
        - (liberties === 1 ? 8 : 0)
        - 0.3 * (Math.abs(x - c) + Math.abs(y - c));
}

function goAiEasy(game, candidates, color) {
    // A quarter of the time, play at random so the easy level stays beatable
    if (Math.random() < 0.25) return candidates[Math.floor(Math.random() * candidates.length)];

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const idx of candidates) {
        const score = goHeuristic(game, idx, color) + Math.random() * 3;
        if (score > bestScore) {
            bestScore = score;
            best = idx;
        }
    }
    return best;
}

function goAiMedium(game, candidates, color) {
    // Only the best-looking points get playouts; that gives each one enough samples.
    const shortlist = candidates
        .map(idx => ({ idx, score: goHeuristic(game, idx, color) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, GO_AI_SHORTLIST);
    const stats = shortlist.map(({ idx }) => ({ idx, next: goPlay(game, idx), wins: 0, runs: 0 }));
    const deadline = Date.now() + GO_AI_TIME_MS;

    // Round-robin so every candidate gets the same number of playouts when time runs out.
    for (let round = 0; round < GO_AI_MAX_ROUNDS && Date.now() < deadline; round++) {
        for (const s of stats) {
            if (Date.now() >= deadline) break;
            if (goPlayout(s.next, color)) s.wins++;
            s.runs++;
        }
    }

    let best = stats[0];
    for (const s of stats) {
        if (s.runs === 0) continue;
        if (s.wins / s.runs > best.wins / best.runs) best = s;
    }
    return best.idx;
}

// Plays random (non-eye-filling) moves to the end and reports whether `color` wins.
function goPlayout(game, color) {
    let g = game;
    const limit = g.size * g.size * 2;
    for (let n = 0; n < limit; n++) {
        const idx = goRandomMove(g);
        if (idx < 0) break;
        g = goPlay(g, idx);
    }
    return goScore(g).winner === color;
}

function goRandomMove(game) {
    const total = game.board.length;
    const color = game.toMove;
    // Cheap path first: random points, most of which are legal early in the game.
    for (let tries = 0; tries < 30; tries++) {
        const idx = Math.floor(Math.random() * total);
        if (game.board[idx] === GO_EMPTY && !goIsOwnEye(game, idx, color) && goPlay(game, idx)) {
            return idx;
        }
    }
    // Fallback for crowded boards: scan for any legal move.
    const moves = goCandidates(game, color);
    return moves.length ? moves[Math.floor(Math.random() * moves.length)] : -1;
}

if (typeof module !== 'undefined') {
    module.exports = { goAiChoose, goCandidates, goPlayout };
}

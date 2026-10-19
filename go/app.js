// =============================================================
// Go – game flow, board drawing and persistence
// =============================================================
const STORAGE_KEY = 'goGameState';
const DEFAULT_SIZE = 9;
const BOARD_MAX_PX = 480;
const MAX_HISTORY = 300;
const STAR_POINTS = {
    9: [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]],
    13: [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]]
};

const el = {
    board: document.getElementById('board'),
    status: document.getElementById('status'),
    captures: document.getElementById('captures'),
    btnPass: document.getElementById('btnPass'),
    btnUndo: document.getElementById('btnUndo'),
    btnResign: document.getElementById('btnResign'),
    btnScoreDone: document.getElementById('btnScoreDone'),
    btnNewGame: document.getElementById('btnNewGame'),
    confirmModal: document.getElementById('confirmModal'),
    confirmText: document.getElementById('confirmText'),
    confirmYes: document.getElementById('confirmYes'),
    confirmNo: document.getElementById('confirmNo'),
    confirmOverlay: document.querySelector('.confirm-overlay')
};

let game = null;
let history = [];       // states before each human move, for undo
let level = 'easy';
let aiThinking = false;
let notice = '';        // one-off message, e.g. an illegal move
let layout = null;      // board geometry in CSS pixels
let pendingConfirm = null;

// =============================================================
// Persistence (per-device convenience only)
// =============================================================

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, history, level }));
    } catch {
        // Storage can be unavailable (private mode); the game still works.
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const state = JSON.parse(raw);
        if (!state.game || state.game.board.length !== state.game.size ** 2) return false;
        game = state.game;
        history = state.history || [];
        level = state.level || 'easy';
        return true;
    } catch {
        return false;
    }
}

// =============================================================
// Game flow
// =============================================================

function startGame(size) {
    game = goCreate(size);
    history = [];
    notice = '';
    commit();
}

// Every state change goes through here: save, redraw, and let the computer answer.
function commit() {
    saveState();
    render();
    if (game.phase === 'play' && game.toMove === GO_WHITE && !aiThinking) aiTurn();
}

function aiTurn() {
    aiThinking = true;
    render();
    // Wait a frame so "denkt nach" is painted before the search blocks the thread.
    requestAnimationFrame(() => setTimeout(() => {
        const idx = goAiChoose(game, level);
        game = idx < 0 ? goPass(game) : goPlay(game, idx);
        aiThinking = false;
        commit();
    }, 30));
}

function onBoardTap(event) {
    if (aiThinking || pendingConfirm) return;
    const idx = pointToIndex(event.clientX, event.clientY);
    if (idx < 0) return;

    if (game.phase === 'score') {
        if (game.board[idx] !== GO_EMPTY) {
            game = goToggleDead(game, idx);
            commit();
        }
        return;
    }
    if (game.phase !== 'play' || game.toMove !== GO_BLACK) return;

    const next = goPlay(game, idx);
    if (!next) {
        notice = 'Dieser Zug ist nicht erlaubt (Selbstmord oder Ko).';
        render();
        return;
    }
    history.push(game);
    if (history.length > MAX_HISTORY) history.shift();
    game = next;
    notice = '';
    commit();
}

function onPass() {
    if (aiThinking || game.phase !== 'play' || game.toMove !== GO_BLACK) return;
    history.push(game);
    game = goPass(game);
    notice = '';
    commit();
}

// Takes back your last move together with the computer's reply.
function onUndo() {
    if (aiThinking || game.phase !== 'play' || history.length === 0) return;
    game = history.pop();
    notice = '';
    commit();
}

function askBeforeReset(action) {
    const hasStones = game.board.some(c => c !== GO_EMPTY);
    if (game.phase === 'over' || !hasStones) action();
    else showConfirm('Die aktuelle Partie geht verloren. Fortfahren?', action);
}

// =============================================================
// Board geometry and input
// =============================================================

function layoutBoard() {
    const px = Math.min(el.board.parentElement.clientWidth, BOARD_MAX_PX);
    const dpr = window.devicePixelRatio || 1;
    el.board.style.width = px + 'px';
    el.board.style.height = px + 'px';
    el.board.width = Math.round(px * dpr);
    el.board.height = Math.round(px * dpr);
    const pad = px * 0.06;
    layout = { px, dpr, pad, spacing: (px - 2 * pad) / (game.size - 1) };
}

// Maps a tap to the nearest intersection; taps just outside the grid still count.
function pointToIndex(clientX, clientY) {
    const rect = el.board.getBoundingClientRect();
    const n = game.size;
    const x = (clientX - rect.left - layout.pad) / layout.spacing;
    const y = (clientY - rect.top - layout.pad) / layout.spacing;
    if (x < -0.5 || y < -0.5 || x > n - 0.5 || y > n - 0.5) return -1;
    const col = Math.min(n - 1, Math.max(0, Math.round(x)));
    const row = Math.min(n - 1, Math.max(0, Math.round(y)));
    return row * n + col;
}

// =============================================================
// Drawing
// =============================================================

function drawBoard() {
    const ctx = el.board.getContext('2d');
    const { px, dpr, pad, spacing } = layout;
    const n = game.size;
    const end = pad + (n - 1) * spacing;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, px, px);

    // Board surface: dark emerald with a gold frame, like the Sudoku grid
    const surface = ctx.createLinearGradient(0, 0, px, px);
    surface.addColorStop(0, '#1d2e20');
    surface.addColorStop(1, '#0c140d');
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.roundRect(2, 2, px - 4, px - 4, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(229, 178, 51, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(229, 178, 51, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const p = pad + i * spacing;
        ctx.moveTo(pad, p);
        ctx.lineTo(end, p);
        ctx.moveTo(p, pad);
        ctx.lineTo(p, end);
    }
    ctx.stroke();

    ctx.fillStyle = '#e5b233';
    for (const [col, row] of STAR_POINTS[n] || []) {
        ctx.beginPath();
        ctx.arc(pad + col * spacing, pad + row * spacing, spacing * 0.09, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < n * n; i++) {
        const color = game.board[i];
        if (color === GO_EMPTY) continue;
        const x = pad + (i % n) * spacing;
        const y = pad + Math.floor(i / n) * spacing;
        drawStone(ctx, x, y, spacing * 0.46, color);
        if (game.dead && game.dead[i]) drawDeadMark(ctx, x, y, spacing * 0.22);
        if (i === game.lastMove) {
            ctx.fillStyle = color === GO_BLACK ? '#f9d976' : '#b3821a';
            ctx.beginPath();
            ctx.arc(x, y, spacing * 0.14, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawStone(ctx, x, y, r, color) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = r * 0.35;
    ctx.shadowOffsetY = r * 0.15;
    const shade = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    if (color === GO_BLACK) {
        shade.addColorStop(0, '#6b6b6b');
        shade.addColorStop(1, '#0b0b0b');
    } else {
        shade.addColorStop(0, '#ffffff');
        shade.addColorStop(1, '#cfc7b0');
    }
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawDeadMark(ctx, x, y, d) {
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d);
    ctx.lineTo(x - d, y + d);
    ctx.stroke();
}

// =============================================================
// Text and controls
// =============================================================

function formatPoints(value) {
    return value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function resultText() {
    const r = game.result;
    const winner = r.winner === GO_BLACK ? 'Du (Schwarz)' : 'Der Computer (Weiß)';
    if (r.resigned) {
        return r.winner === GO_BLACK
            ? `${winner} gewinnt. Der Computer hat aufgegeben.`
            : `${winner} gewinnt. Du hast aufgegeben.`;
    }
    const margin = formatPoints(Math.abs(r.black - r.white));
    return `${winner} gewinnt mit ${margin} Punkten (Schwarz ${r.black}, Weiß ${formatPoints(r.white)}).`;
}

function statusText() {
    if (notice) return notice;
    if (game.phase === 'over') return resultText();
    if (game.phase === 'score') {
        const s = goScore(game);
        return `Tote Steine antippen. Stand: Schwarz ${s.black}, Weiß ${formatPoints(s.white)} (inkl. ${formatPoints(GO_KOMI)} Komi).`;
    }
    if (aiThinking) return 'Der Computer denkt nach …';
    return game.toMove === GO_BLACK ? 'Du bist am Zug (Schwarz).' : 'Der Computer ist am Zug.';
}

function render() {
    layoutBoard();
    drawBoard();

    el.status.textContent = statusText();
    el.captures.textContent = `Gefangen: du ${game.captures[GO_BLACK]} · Computer ${game.captures[GO_WHITE]}`;

    const playing = game.phase === 'play';
    el.btnPass.hidden = !playing;
    el.btnUndo.hidden = !playing;
    el.btnResign.hidden = !playing;
    el.btnScoreDone.hidden = game.phase !== 'score';
    el.btnPass.disabled = aiThinking || game.toMove !== GO_BLACK;
    el.btnUndo.disabled = aiThinking || history.length === 0;
    el.btnResign.disabled = aiThinking;

    document.querySelectorAll('[data-level]').forEach(b => {
        b.classList.toggle('active', b.dataset.level === level);
    });
    document.querySelectorAll('[data-size]').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.size) === game.size);
    });
}

// =============================================================
// Confirmation modal
// =============================================================

function showConfirm(text, action) {
    el.confirmText.textContent = text;
    pendingConfirm = action;
    el.confirmModal.classList.remove('hidden');
}

function closeConfirm() {
    el.confirmModal.classList.add('hidden');
    pendingConfirm = null;
}

// =============================================================
// Init
// =============================================================

function init() {
    if (!loadState()) startGame(DEFAULT_SIZE);

    el.board.addEventListener('click', onBoardTap);
    el.btnPass.addEventListener('click', onPass);
    el.btnUndo.addEventListener('click', onUndo);
    el.btnScoreDone.addEventListener('click', () => {
        game = goFinish(game);
        commit();
    });
    el.btnResign.addEventListener('click', () => {
        if (aiThinking) return;
        showConfirm('Partie aufgeben?', () => {
            game = goResign(game, GO_BLACK);
            commit();
        });
    });
    el.btnNewGame.addEventListener('click', () => {
        if (!aiThinking) askBeforeReset(() => startGame(game.size));
    });
    document.querySelectorAll('[data-size]').forEach(b => {
        b.addEventListener('click', () => {
            const size = Number(b.dataset.size);
            if (aiThinking || size === game.size) return;
            askBeforeReset(() => startGame(size));
        });
    });
    document.querySelectorAll('[data-level]').forEach(b => {
        b.addEventListener('click', () => {
            level = b.dataset.level;
            saveState();
            render();
        });
    });

    el.confirmYes.addEventListener('click', () => {
        const action = pendingConfirm;
        closeConfirm();
        if (action) action();
    });
    el.confirmNo.addEventListener('click', closeConfirm);
    el.confirmOverlay.addEventListener('click', closeConfirm);
    window.addEventListener('resize', render);

    render();
    // Resume a computer move that was interrupted by closing the app.
    if (game.phase === 'play' && game.toMove === GO_WHITE) aiTurn();
}

init();

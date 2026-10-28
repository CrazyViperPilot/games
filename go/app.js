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

const el = typeof document !== 'undefined' ? {
    board: document.getElementById('board'),
    status: document.getElementById('status'),
    captures: document.getElementById('captures'),
    btnPass: document.getElementById('btnPass'),
    btnUndo: document.getElementById('btnUndo'),
    btnResign: document.getElementById('btnResign'),
    btnExplain: document.getElementById('btnExplain'),
    btnScoreDone: document.getElementById('btnScoreDone'),
    btnNewGame: document.getElementById('btnNewGame'),
    confirmModal: document.getElementById('confirmModal'),
    confirmText: document.getElementById('confirmText'),
    confirmYes: document.getElementById('confirmYes'),
    confirmNo: document.getElementById('confirmNo'),
    confirmOverlay: document.querySelector('.confirm-overlay')
} : {};

let game = null;
let history = [];       // states before each human move, for undo
let prevGame = null;    // state before the last move (human or AI), for Erklaeren
let level = 'easy';
let currentLang = 'de';

function getTexts() {
    const dict = typeof I18N !== 'undefined' ? I18N : (typeof require !== 'undefined' ? require('./lang.js').I18N : null);
    return (dict && dict[currentLang]) ? dict[currentLang] : (dict ? dict.de : {});
}
let aiThinking = false;
let notice = '';        // one-off message, e.g. an illegal move
let layout = null;      // board geometry in CSS pixels
let pendingConfirm = null;

// =============================================================
// Persistence (per-device convenience only)
// =============================================================

function saveState() {
    try {
        try { localStorage.setItem('goLang', currentLang); } catch {} 
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, history, level, prevGame, lang: currentLang }));
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
        prevGame = state.prevGame || null;
        currentLang = state.lang || localStorage.getItem('goLang') || 'de';
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
    prevGame = null;
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
        prevGame = game;
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
        notice = getTexts().illegalMove;
        render();
        return;
    }
    history.push({ game, prevGame });
    prevGame = game;
    if (history.length > MAX_HISTORY) history.shift();
    game = next;
    notice = '';
    commit();
}

function onPass() {
    if (aiThinking || game.phase !== 'play' || game.toMove !== GO_BLACK) return;
    history.push({ game, prevGame });
    prevGame = game;
    game = goPass(game);
    notice = '';
    commit();
}

// Takes back your last move together with the computer's reply.
function onUndo() {
    if (aiThinking || game.phase !== 'play' || history.length === 0) return;
    const entry = history.pop();
    if (entry && entry.board) {
        game = entry;
        prevGame = null;
    } else if (entry) {
        game = entry.game;
        prevGame = entry.prevGame;
    }
    notice = '';
    commit();
}

function askBeforeReset(action) {
    const hasStones = game.board.some(c => c !== GO_EMPTY);
    if (game.phase === 'over' || !hasStones) action();
    else showConfirm(getTexts().confirmReset, action);
}

// Formats a board index as a human-readable coordinate (e.g. 'D5').
function posLabel(idx, size) {
    const col = idx % size;
    const row = Math.floor(idx / size);
    // Standard Go labelling: letters skip 'I', rows count from bottom.
    const letter = String.fromCharCode(65 + col + (col >= 8 ? 1 : 0));
    return letter + (size - row);
}

// Generates an explanation of the last move in the active language.
function generateExplanation(cur = game, prev = prevGame, lang = currentLang) {
    const dict = typeof I18N !== 'undefined' ? I18N : (typeof require !== 'undefined' ? require('./lang.js').I18N : null);
    const t = (dict && dict[lang]) ? dict[lang] : (dict ? dict.de : {});

    if (!prev || !cur) return t.explainNoMove || 'Noch kein Zug gespielt. Schwarz beginnt.';

    const player = prev.toMove;
    const isHuman = player === GO_BLACK;
    const subject = isHuman ? t.subjectHuman : t.subjectAi;
    const verbPlay = isHuman ? t.verbPlayHuman : t.verbPlayAi;
    const verbCap = isHuman ? t.verbCapHuman : t.verbCapAi;
    const size = cur.size;

    // Pass
    if (cur.lastMove < 0) {
        return isHuman ? t.explainPassHuman : t.explainPassAi;
    }

    const idx = cur.lastMove;
    const pos = posLabel(idx, size);
    const captured = cur.captures[player] - prev.captures[player];

    // Check whether the played spot was fully surrounded by opponent stones.
    const opp = 3 - player;
    const neighbors = goNeighbors(size, idx);
    const allNeighborsWereOpponent = neighbors.every(n => prev.board[n] === opp);

    let text = '';
    if (captured > 0) {
        const stoneWord = t.stoneWord(captured);
        if (allNeighborsWereOpponent) {
            text = t.explainApparentSuicide(subject, verbPlay, pos, verbCap, captured, stoneWord);
        } else {
            text = t.explainCapture(subject, verbPlay, pos, verbCap, captured, stoneWord);
        }
    } else {
        // No captures - explain liberties
        const group = goGroup(cur.board, size, idx);
        const libs = group.liberties.size;
        const libWord = t.libertyWord(libs);

        if (group.stones.length > 1) {
            text = t.explainMoveGroup(subject, verbPlay, pos, libs, libWord);
        } else {
            text = t.explainMoveSingle(subject, verbPlay, pos, libs, libWord);
        }
    }

    // Mention ko if set
    if (cur.ko >= 0) {
        text += t.explainKo(posLabel(cur.ko, size));
    }

    return text;
}

function onExplain() {
    if (aiThinking) return;
    const expl = generateExplanation();
    notice = notice === expl ? '' : expl;
    render();
}

function setLanguage(lang) {
    if (!['de', 'en', 'pl'].includes(lang)) lang = 'de';
    currentLang = lang;
    if (typeof document !== 'undefined') {
        document.documentElement.lang = lang;
    }
    if (notice && prevGame) {
        notice = generateExplanation(game, prevGame, currentLang);
    } else if (notice) {
        notice = '';
    }
    saveState();
    render();
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

function formatPoints(value, lang = currentLang) {
    const locale = lang === 'en' ? 'en-US' : lang === 'pl' ? 'pl-PL' : 'de-DE';
    return value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function resultText() {
    const t = getTexts();
    const r = game.result;
    const winner = r.winner === GO_BLACK ? t.winnerBlack : t.winnerWhite;
    if (r.resigned) {
        return r.winner === GO_BLACK ? t.resignedBlack : t.resignedWhite;
    }
    const margin = formatPoints(Math.abs(r.black - r.white), currentLang);
    const black = formatPoints(r.black, currentLang);
    const white = formatPoints(r.white, currentLang);
    return t.scoreResult(winner, margin, black, white);
}

function statusText() {
    const t = getTexts();
    if (notice) return notice;
    if (game.phase === 'over') return resultText();
    if (game.phase === 'score') {
        const s = goScore(game);
        const black = formatPoints(s.black, currentLang);
        const white = formatPoints(s.white, currentLang);
        const komi = formatPoints(GO_KOMI, currentLang);
        return t.scoringHelp(black, white, komi);
    }
    if (aiThinking) return t.aiThinking;
    return game.toMove === GO_BLACK ? t.turnBlack : t.turnWhite;
}

function updateLocalizedUI() {
    const t = getTexts();
    if (el.btnPass) el.btnPass.textContent = t.btnPass;
    if (el.btnScoreDone) el.btnScoreDone.textContent = t.btnScoreDone;
    if (el.btnUndo) el.btnUndo.textContent = t.btnUndo;
    if (el.btnResign) el.btnResign.textContent = t.btnResign;
    if (el.btnExplain) el.btnExplain.textContent = t.btnExplain;
    if (el.btnNewGame) el.btnNewGame.textContent = t.btnNewGame;
    if (el.labelOpponent) el.labelOpponent.textContent = t.labelOpponent;
    if (el.labelBoard) el.labelBoard.textContent = t.labelBoard;
    if (el.labelLang) el.labelLang.textContent = t.labelLang;
    if (el.btnEasy) el.btnEasy.textContent = t.diffEasy;
    if (el.btnMedium) el.btnMedium.textContent = t.diffMedium;
    if (el.confirmYes) el.confirmYes.textContent = t.confirmYes;
    if (el.confirmNo) el.confirmNo.textContent = t.confirmNo;
}

function render() {
    layoutBoard();
    drawBoard();

    updateLocalizedUI();

    const t = getTexts();
    el.status.textContent = statusText();
    el.captures.textContent = t.captures(game.captures[GO_BLACK], game.captures[GO_WHITE]);

    const playing = game.phase === 'play';
    el.btnPass.hidden = !playing;
    el.btnUndo.hidden = !playing;
    el.btnResign.hidden = !playing;
    el.btnScoreDone.hidden = game.phase !== 'score';
    el.btnPass.disabled = aiThinking || game.toMove !== GO_BLACK;
    el.btnUndo.disabled = aiThinking || history.length === 0;
    el.btnResign.disabled = aiThinking;
    el.btnExplain.hidden = !playing;
    el.btnExplain.disabled = aiThinking || !prevGame;

    document.querySelectorAll('[data-level]').forEach(b => {
        b.classList.toggle('active', b.dataset.level === level);
    });
    document.querySelectorAll('[data-size]').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.size) === game.size);
    });
    document.querySelectorAll('[data-lang]').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === currentLang);
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
    el.btnExplain.addEventListener('click', onExplain);
    el.btnScoreDone.addEventListener('click', () => {
        game = goFinish(game);
        commit();
    });
    el.btnResign.addEventListener('click', () => {
        if (aiThinking) return;
        showConfirm(getTexts().confirmResign, () => {
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
    document.querySelectorAll('[data-lang]').forEach(b => {
        b.addEventListener('click', () => {
            const lang = b.dataset.lang;
            if (lang === currentLang) return;
            setLanguage(lang);
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

if (typeof window !== 'undefined') {
    init();
}
if (typeof module !== 'undefined') {
    module.exports = { posLabel, generateExplanation, setLanguage, getTexts, formatPoints };
}

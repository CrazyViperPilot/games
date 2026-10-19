const sudokuGen = new SudokuGenerator();
let currentPuzzle = [];
let currentSolution = [];
let userBoard = [];
let selectedCell = null;
let currentDifficulty = 'easy';
let toastTimer = null;
let gameWon = false;
let undoStack = [];
let timerInterval = null;
let elapsedSeconds = 0;

// =============================================================
// Game State Persistence
// =============================================================

function saveGameState() {
    const state = {
        userBoard,
        currentPuzzle,
        currentSolution,
        currentDifficulty,
        elapsedSeconds,
        gameWon
    };
    localStorage.setItem('sudokuGameState', JSON.stringify(state));
}

function loadGameState() {
    const raw = localStorage.getItem('sudokuGameState');
    if (!raw) return false;
    try {
        const state = JSON.parse(raw);
        if (!state.userBoard || !state.currentPuzzle || !state.currentSolution) return false;
        userBoard = state.userBoard;
        currentPuzzle = state.currentPuzzle;
        currentSolution = state.currentSolution;
        currentDifficulty = state.currentDifficulty || 'easy';
        elapsedSeconds = state.elapsedSeconds || 0;
        gameWon = state.gameWon || false;
        return true;
    } catch {
        return false;
    }
}

// =============================================================
// Timer
// =============================================================

function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
        elapsedSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    const hours = Math.floor(elapsedSeconds / 3600);
    const mins = Math.floor((elapsedSeconds % 3600) / 60)
        .toString()
        .padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
    const display = hours > 0 ? `${hours}:${mins}:${secs}` : `${mins}:${secs}`;
    document.getElementById('timer').textContent = display;
}

// =============================================================
// Toast / Love-Messages
// =============================================================

/**
 * Displays a temporary Glassmorphism toast overlay at the bottom
 * of the screen. Disappears automatically after 2 seconds.
 * pointer-events: none so it never blocks gameplay.
 * @param {string} message  - The text to display
 * @param {number} [duration=2000] - Visible duration in ms
 */
function showToast(message, duration = 2000) {
    // Cancel any in-flight toast to avoid stacking
    if (toastTimer) {
        clearTimeout(toastTimer);
        const old = document.getElementById('love-toast');
        if (old) old.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'love-toast';
    toast.className = 'love-toast';
    toast.textContent = message;

    document.body.appendChild(toast);

    // Trigger enter animation on the next frame
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('love-toast--visible'));
    });

    toastTimer = setTimeout(() => {
        toast.classList.remove('love-toast--visible');
        // Remove from DOM after CSS transition finishes (300 ms)
        toast.addEventListener('transitionend', () => toast.remove(), {
            once: true,
        });
        toastTimer = null;
    }, duration);
}

// =============================================================
// Confirmation Modal
// =============================================================

let pendingConfirmResolve = null;

function showConfirmModal() {
    document.getElementById('confirmModal').classList.remove('hidden');
    return new Promise((resolve) => {
        pendingConfirmResolve = resolve;
    });
}

function hideConfirmModal(result) {
    document.getElementById('confirmModal').classList.add('hidden');
    if (pendingConfirmResolve) {
        pendingConfirmResolve(result);
        pendingConfirmResolve = null;
    }
}

// =============================================================
// Button Feedback
// =============================================================

function shakeButton(btnEl) {
    btnEl.classList.add('btn-shake');
    btnEl.addEventListener(
        'animationend',
        () => btnEl.classList.remove('btn-shake'),
        { once: true }
    );
}

// =============================================================
// DOM References
// =============================================================

const boardEl = document.getElementById('board');
const numpadEl = document.getElementById('numpad');
const btnNewGame = document.getElementById('btnNewGame');
const btnHint = document.getElementById('btnHint');
const btnErase = document.getElementById('btnErase');
const btnUndo = document.getElementById('btnUndo');

// =============================================================
// Init
// =============================================================

function initGame() {
    createNumpad();

    // Bind difficulty buttons
    document.querySelectorAll('.diff-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            document
                .querySelectorAll('.diff-btn')
                .forEach((b) => b.classList.remove('active'));
            e.target.classList.add('active');
            currentDifficulty = e.target.dataset.level;
            requestNewGame();
        });
    });

    btnNewGame.addEventListener('click', requestNewGame);
    btnErase.addEventListener('click', eraseCell);
    btnHint.addEventListener('click', giveHint);
    btnUndo.addEventListener('click', undoLastMove);

    // Confirmation modal buttons
    document
        .getElementById('confirmYes')
        .addEventListener('click', () => hideConfirmModal(true));
    document
        .getElementById('confirmNo')
        .addEventListener('click', () => hideConfirmModal(false));

    // Keyboard support
    document.addEventListener('keydown', handleKeyboard);

    // Restore saved game or start fresh
    if (loadGameState()) {
        // Sync difficulty selector with restored state
        document
            .querySelectorAll('.diff-btn')
            .forEach((b) => b.classList.remove('active'));
        const activeBtn = document.querySelector(
            `.diff-btn[data-level="${currentDifficulty}"]`
        );
        if (activeBtn) activeBtn.classList.add('active');
        renderBoard();
        updateTimerDisplay();
        updateNumpadIndicators();
        if (!gameWon) startTimer();
    } else {
        startNewGame();
    }
}

// =============================================================
// Game Flow
// =============================================================

function hasProgress() {
    if (gameWon) return false;
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (currentPuzzle[r][c] === 0 && userBoard[r][c] !== 0) return true;
        }
    }
    return false;
}

async function requestNewGame() {
    if (hasProgress()) {
        const confirmed = await showConfirmModal();
        if (!confirmed) return;
    }
    startNewGame();
}

function startNewGame() {
    const { puzzle, solution } = sudokuGen.generate(currentDifficulty);
    currentPuzzle = puzzle;
    currentSolution = solution;
    userBoard = puzzle.map((row) => [...row]);
    selectedCell = null;
    gameWon = false;
    undoStack = [];
    elapsedSeconds = 0;

    renderBoard();
    updateTimerDisplay();
    updateNumpadIndicators();
    startTimer();
    saveGameState();
}

// =============================================================
// Board Rendering
// =============================================================

function renderBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.r = r;
            cell.dataset.c = c;

            if (currentPuzzle[r][c] !== 0) {
                cell.classList.add('fixed');
            }

            renderCellContent(cell, r, c);
            cell.addEventListener('click', () => selectCell(r, c));
            boardEl.appendChild(cell);
        }
    }
    updateHighlights();
}

function renderCellContent(cellEl, r, c) {
    const val = userBoard[r][c];
    cellEl.textContent = val !== 0 ? val : '';
}

// =============================================================
// Cell Selection & Highlighting
// =============================================================

function selectCell(r, c) {
    if (gameWon) return;
    if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
        selectedCell = null;
    } else {
        selectedCell = { r, c };
    }
    updateHighlights();
}

function updateHighlights() {
    const cells = document.querySelectorAll('.cell');
    const selectedValue = selectedCell
        ? userBoard[selectedCell.r][selectedCell.c]
        : 0;

    cells.forEach((cell) => {
        cell.classList.remove('selected', 'highlight', 'same-number');
        const cr = parseInt(cell.dataset.r);
        const cc = parseInt(cell.dataset.c);

        if (selectedCell) {
            if (cr === selectedCell.r && cc === selectedCell.c) {
                cell.classList.add('selected');
            } else if (
                cr === selectedCell.r ||
                cc === selectedCell.c ||
                (Math.floor(cr / 3) === Math.floor(selectedCell.r / 3) &&
                    Math.floor(cc / 3) === Math.floor(selectedCell.c / 3))
            ) {
                cell.classList.add('highlight');
            }

            // Same-number highlighting
            if (
                selectedValue !== 0 &&
                userBoard[cr][cc] === selectedValue &&
                !(cr === selectedCell.r && cc === selectedCell.c)
            ) {
                cell.classList.add('same-number');
            }
        }
    });
}

// =============================================================
// Numpad
// =============================================================

function createNumpad() {
    numpadEl.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
        const btn = document.createElement('button');
        btn.className = 'num-btn';
        btn.textContent = i;
        btn.addEventListener('click', () => fillNumber(i));
        numpadEl.appendChild(btn);
    }
}

function updateNumpadIndicators() {
    const counts = Array(10).fill(0);
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (userBoard[r][c] !== 0) counts[userBoard[r][c]]++;
        }
    }

    numpadEl.querySelectorAll('.num-btn').forEach((btn) => {
        const num = parseInt(btn.textContent);
        if (counts[num] >= 9) {
            btn.classList.add('completed');
        } else {
            btn.classList.remove('completed');
        }
    });
}



// =============================================================
// Fill / Erase / Hint / Undo
// =============================================================

function fillNumber(num) {
    if (gameWon || !selectedCell) return;
    const { r, c } = selectedCell;
    if (currentPuzzle[r][c] !== 0) return;

    const cellEl = document.querySelector(
        `.cell[data-r="${r}"][data-c="${c}"]`
    );

    // Wrong number
    if (currentSolution[r][c] !== num) {
        cellEl.classList.add('error');
        setTimeout(() => cellEl.classList.remove('error'), 400);
        return;
    }

    // Correct number – push undo entry
    undoStack.push({ r, c, previousValue: userBoard[r][c] });
    userBoard[r][c] = num;

    renderCellContent(cellEl, r, c);

    // Pop-in animation
    cellEl.classList.add('pop-in');
    cellEl.addEventListener(
        'animationend',
        () => cellEl.classList.remove('pop-in'),
        { once: true }
    );

    updateHighlights();
    updateNumpadIndicators();
    saveGameState();

    // Check milestones before win (win overrides these toasts)
    if (!checkWin()) {
        const rowDone = checkRowComplete(r);
        const colDone = checkColComplete(c);
        const boxDone = checkBoxComplete(r, c);
        if (rowDone || colDone || boxDone) {
            showToast(getRandomLoveMessage(window.currentLang));
        }
    }
}

/**
 * Returns true if every cell in the given row is correctly filled.
 */
function checkRowComplete(row) {
    for (let c = 0; c < 9; c++) {
        if (userBoard[row][c] !== currentSolution[row][c]) return false;
    }
    return true;
}

/**
 * Returns true if every cell in the given column is correctly filled.
 */
function checkColComplete(col) {
    for (let r = 0; r < 9; r++) {
        if (userBoard[r][col] !== currentSolution[r][col]) return false;
    }
    return true;
}

/**
 * Returns true if the 3×3 box containing (row, col) is completely
 * and correctly filled.
 */
function checkBoxComplete(row, col) {
    const rStart = Math.floor(row / 3) * 3;
    const cStart = Math.floor(col / 3) * 3;
    for (let r = rStart; r < rStart + 3; r++) {
        for (let c = cStart; c < cStart + 3; c++) {
            if (userBoard[r][c] !== currentSolution[r][c]) return false;
        }
    }
    return true;
}

function eraseCell() {
    if (gameWon) return;
    if (!selectedCell) { shakeButton(btnErase); return; }
    const { r, c } = selectedCell;
    if (currentPuzzle[r][c] !== 0 || userBoard[r][c] === 0) {
        shakeButton(btnErase);
        return;
    }

    undoStack.push({ r, c, previousValue: userBoard[r][c] });
    userBoard[r][c] = 0;

    const cellEl = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    renderCellContent(cellEl, r, c);
    updateHighlights();
    updateNumpadIndicators();
    saveGameState();
}

function giveHint() {
    if (gameWon) return;
    if (!selectedCell) {
        shakeButton(btnHint);
        showToast(texts[window.currentLang].selectEmpty);
        return;
    }
    const { r, c } = selectedCell;
    if (currentPuzzle[r][c] !== 0 || userBoard[r][c] !== 0) {
        shakeButton(btnHint);
        return;
    }
    fillNumber(currentSolution[r][c]);
}

function undoLastMove() {
    if (gameWon || undoStack.length === 0) {
        shakeButton(btnUndo);
        return;
    }

    const { r, c, previousValue } = undoStack.pop();
    userBoard[r][c] = previousValue;

    const cellEl = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    renderCellContent(cellEl, r, c);
    updateHighlights();
    updateNumpadIndicators();
    saveGameState();
}

// =============================================================
// Keyboard
// =============================================================

function handleKeyboard(e) {
    if (e.key >= '1' && e.key <= '9') {
        fillNumber(parseInt(e.key));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
        eraseCell();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoLastMove();
    } else if (e.key.startsWith('Arrow') && selectedCell) {
        let { r, c } = selectedCell;
        if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
        if (e.key === 'ArrowDown') r = Math.min(8, r + 1);
        if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
        if (e.key === 'ArrowRight') c = Math.min(8, c + 1);
        selectCell(r, c);
    }
}

// =============================================================
// Win Check
// =============================================================

/**
 * Checks if the board is fully and correctly solved.
 * @returns {boolean} true if the puzzle is solved
 */
function checkWin() {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (userBoard[r][c] !== currentSolution[r][c]) return false;
        }
    }

    gameWon = true;
    stopTimer();
    saveGameState();

    // Win animation on all cells
    document.querySelectorAll('.cell').forEach((cell) => {
        cell.classList.add('complete-anim');
    });

    // Show win message as a beautiful toast (no blocking alert)
    setTimeout(() => {
        showToast(texts[window.currentLang].won, 4000);
    }, 800);

    return true;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.cell') && !e.target.closest('.controls-row') && !e.target.closest('.secondary-controls') && !e.target.closest('.numpad-container')) {
        if (selectedCell) {
            selectedCell = null;
            updateHighlights();
        }
    }
});

document.addEventListener('DOMContentLoaded', initGame);

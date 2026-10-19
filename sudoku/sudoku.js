// =============================================================
// Love Messages – shown as Toast overlays on row/box/win events
// =============================================================
const loveMessages = {
    pl: [
        // Row complete
    "Wspaniale Ci to wyszło, mój skarbie! 💛",
    "Jesteś po prostu niesamowita! ✨",
    "Perfekcyjnie rozwiązane! Uwielbiam Twoją determinację 🌸",
    "Mój anioł ma prawdziwy talent! 🌺",
    "Fantastycznie! Kocham Twoje zielone oczy! 💕",
    // Box complete
    "Jeden kwadrat mniej – mam nadzieję, że zaraz przytulisz się do mnie! 🌼",
    "Jesteś najpiękniejszą kobietą na świecie! 👑",
    "Twój uśmiech jest piękniejszy niż całe złoto i diamenty! 🌹",
    "Mistrzyni Sudoku! 💎",
    // Extra
    "Tak trzymaj, moja różo! 🥀",
    "Kocham Cię bardziej niż jest liczb na świecie! ❤️",
    "Jesteś moim największym szczęściem! 🍀"
    ],
    de: [
        // Row complete
        "Wunderschön gemacht, mein Schatz! 💛",
        "Du bist einfach unglaublich! ✨",
        "Perfekt gelöst! Ich liebe deine Entschlossenheit 🌸",
        "Mein Engel hat Talent! 🌺",
        "Fantastisch! Ich liebe deine grünen Augen! 💕",
        // Box complete
        "Ein Quadrat weniger – hoffentlich kommst du gleich zum Kuscheln! 🌼",
        "Du bist die schönste Frau der Welt! 👑",
        "Dein Lächeln ist schöner als alles Gold und Edelsteine! 🌹",
        "Sudoku-Meisterin! 💎",
        // Extra
        "Weiter so, meine Rose! 🥀",
        "Ich liebe dich mehr als es Zahlen gibt! ❤️",
        "Du bist mein größtes Glück! 🍀"
    ]
};

/**
 * Returns a random love message in the current language.
 * Falls back to 'pl' if language key is not found.
 * @param {string} lang - Language code ('pl' or 'de')
 * @returns {string}
 */
function getRandomLoveMessage(lang) {
    const pool = loveMessages[lang] || loveMessages['pl'];
    return pool[Math.floor(Math.random() * pool.length)];
}

class SudokuGenerator {
    constructor() {
        this.board = Array.from({ length: 9 }, () => Array(9).fill(0));
    }

    generate(difficulty = 'easy') {
        this.board = Array.from({ length: 9 }, () => Array(9).fill(0));
        this.fillDiagonal();
        this.solveSudoku();
        
        let removeCount = 30; // easy
        if (difficulty === 'medium') removeCount = 45;
        if (difficulty === 'hard') removeCount = 55;

        const puzzle = this.board.map(row => [...row]);
        const solution = this.board.map(row => [...row]);

        this.removeDigits(puzzle, removeCount);

        return { puzzle, solution };
    }

    fillDiagonal() {
        for (let i = 0; i < 9; i = i + 3) {
            this.fillBox(i, i);
        }
    }

    fillBox(rowStart, colStart) {
        let num;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                do {
                    num = this.randomGenerator(9);
                } while (!this.unUsedInBox(rowStart, colStart, num));
                this.board[rowStart + i][colStart + j] = num;
            }
        }
    }

    randomGenerator(num) {
        return Math.floor(Math.random() * num + 1);
    }

    checkIfSafe(i, j, num) {
        return (
            this.unUsedInRow(i, num) &&
            this.unUsedInCol(j, num) &&
            this.unUsedInBox(i - (i % 3), j - (j % 3), num)
        );
    }

    unUsedInRow(i, num) {
        for (let j = 0; j < 9; j++) {
            if (this.board[i][j] === num) return false;
        }
        return true;
    }

    unUsedInCol(j, num) {
        for (let i = 0; i < 9; i++) {
            if (this.board[i][j] === num) return false;
        }
        return true;
    }

    unUsedInBox(rowStart, colStart, num) {
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (this.board[rowStart + i][colStart + j] === num) return false;
            }
        }
        return true;
    }

    solveSudoku() {
        let row = -1;
        let col = -1;
        let isEmpty = true;
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                if (this.board[i][j] === 0) {
                    row = i;
                    col = j;
                    isEmpty = false;
                    break;
                }
            }
            if (!isEmpty) break;
        }

        if (isEmpty) return true;

        for (let num = 1; num <= 9; num++) {
            if (this.checkIfSafe(row, col, num)) {
                this.board[row][col] = num;
                if (this.solveSudoku()) return true;
                this.board[row][col] = 0;
            }
        }
        return false;
    }

    removeDigits(puzzle, count) {
        let countToRm = count;
        while (countToRm !== 0) {
            let cellId = this.randomGenerator(81) - 1;
            let i = Math.floor(cellId / 9);
            let j = cellId % 9;

            if (puzzle[i][j] !== 0) {
                countToRm--;
                puzzle[i][j] = 0;
            }
        }
    }
}

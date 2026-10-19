const texts = {
    pl: {
        title: "Sudoku",
        newGame: "Nowa gra",
        hint: "Podpowiedź",
        erase: "Usuń",
        undo: "Cofnij",
        easy: "Łatwy",
        medium: "Średni",
        hard: "Trudny",
        won: "Gratulacje! Rozwiązałaś Sudoku!",
        langToggle: "PL / DE",
        confirmNewGame: "Stracisz postęp. Kontynuować?",
        yes: "Tak",
        no: "Nie",
        selectEmpty: "Wybierz puste pole"
    },
    de: {
        title: "Sudoku",
        newGame: "Neues Spiel",
        hint: "Tipp",
        erase: "Löschen",
        undo: "Rückgängig",
        easy: "Einfach",
        medium: "Mittel",
        hard: "Schwer",
        won: "Herzlichen Glückwunsch! Du hast das Sudoku gelöst!",
        langToggle: "DE / PL",
        confirmNewGame: "Fortschritt geht verloren. Fortfahren?",
        yes: "Ja",
        no: "Nein",
        selectEmpty: "Wähle ein leeres Feld"
    }
};

window.currentLang = 'pl';

function setLanguage(lang) {
    window.currentLang = lang;
    document.documentElement.lang = lang;
    
    // Update texts
    // Using simple mapping based on IDs
    const elements = {
        'title': texts[lang].title,
        'btnNewGame': texts[lang].newGame,
        'btnHint': texts[lang].hint,
        'btnErase': texts[lang].erase,
        'btnUndo': texts[lang].undo,
        'btnEasy': texts[lang].easy,
        'btnMedium': texts[lang].medium,
        'btnHard': texts[lang].hard,
        'langToggle': texts[lang].langToggle,
        'confirmText': texts[lang].confirmNewGame,
        'confirmYes': texts[lang].yes,
        'confirmNo': texts[lang].no
    };

    for (let id in elements) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = elements[id];
        }
    }
}

function toggleLanguage() {
    const newLang = window.currentLang === 'pl' ? 'de' : 'pl';
    setLanguage(newLang);
    localStorage.setItem('sudokuLang', newLang);
}

// Init lang
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('sudokuLang') || 'pl';
    setLanguage(savedLang);
    
    document.getElementById('langToggle').addEventListener('click', toggleLanguage);
});

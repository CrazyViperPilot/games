// =============================================================
// Go – Translations (DE, EN, PL)
// =============================================================

const I18N = {
    de: {
        captures: (you, comp) => `Gefangen: du ${you} · Computer ${comp}`,
        btnPass: 'Passen',
        btnScoreDone: 'Fertig',
        btnUndo: 'Zug zurück',
        btnResign: 'Aufgeben',
        btnExplain: 'Erklären',
        btnNewGame: 'Neues Spiel',
        labelOpponent: 'Gegner',
        labelBoard: 'Brett',
        labelLang: 'Sprache',
        diffEasy: 'Leicht',
        diffMedium: 'Mittel',
        confirmReset: 'Die aktuelle Partie geht verloren. Fortfahren?',
        confirmResign: 'Partie aufgeben?',
        confirmYes: 'Ja',
        confirmNo: 'Nein',
        illegalMove: 'Dieser Zug ist nicht erlaubt (Selbstmord oder Ko).',
        aiThinking: 'Der Computer denkt nach …',
        turnBlack: 'Du bist am Zug (Schwarz).',
        turnWhite: 'Der Computer ist am Zug.',
        scoringHelp: (black, white, komi) => `Tote Steine antippen. Stand: Schwarz ${black}, Weiß ${white} (inkl. ${komi} Komi).`,
        winnerBlack: 'Du (Schwarz)',
        winnerWhite: 'Der Computer (Weiß)',
        resignedBlack: 'Du (Schwarz) gewinnt. Der Computer hat aufgegeben.',
        resignedWhite: 'Der Computer (Weiß) gewinnt. Du hast aufgegeben.',
        scoreResult: (winner, margin, black, white) => `${winner} gewinnt mit ${margin} Punkten (Schwarz ${black}, Weiß ${white}).`,
        explainNoMove: 'Noch kein Zug gespielt. Schwarz beginnt.',
        explainPassHuman: 'Du (Schwarz) hast gepasst.',
        explainPassAi: 'Der Computer (Weiß) hat gepasst – er sieht keinen nützlichen Zug mehr.',
        explainApparentSuicide: (subj, verbPlay, pos, verbCap, count, stoneWord) =>
            `${subj} ${verbPlay} ${pos} und ${verbCap} ${count} ${stoneWord}. Das sieht aus wie Selbstmord, ist es aber nicht: Die umgebende Gruppe hatte nur noch diese eine Freiheit und wurde deshalb geschlagen. Der gesetzte Stein lebt, weil durch das Schlagen Freiheiten entstehen.`,
        explainCapture: (subj, verbPlay, pos, verbCap, count, stoneWord) =>
            `${subj} ${verbPlay} ${pos} und ${verbCap} ${count} ${stoneWord}. Die geschlagene Gruppe hatte keine Freiheiten mehr.`,
        explainMoveGroup: (subj, verbPlay, pos, libs, libWord) =>
            `${subj} ${verbPlay} ${pos} – die Gruppe hat jetzt ${libs} ${libWord}.`,
        explainMoveSingle: (subj, verbPlay, pos, libs, libWord) =>
            `${subj} ${verbPlay} ${pos} – der Stein hat ${libs} ${libWord}.`,
        explainKo: (pos) =>
            ` Ko-Regel: ${pos} darf im nächsten Zug nicht direkt zurückgeschlagen werden.`,
        stoneWord: (n) => n === 1 ? 'Stein' : 'Steine',
        libertyWord: (n) => n === 1 ? 'Freiheit' : 'Freiheiten',
        subjectHuman: 'Du (Schwarz)',
        subjectAi: 'Der Computer (Weiß)',
        verbPlayHuman: 'spielst',
        verbPlayAi: 'spielt',
        verbCapHuman: 'fängst',
        verbCapAi: 'fängt'
    },
    en: {
        captures: (you, comp) => `Captures: you ${you} · Computer ${comp}`,
        btnPass: 'Pass',
        btnScoreDone: 'Done',
        btnUndo: 'Undo',
        btnResign: 'Resign',
        btnExplain: 'Explain',
        btnNewGame: 'New Game',
        labelOpponent: 'Opponent',
        labelBoard: 'Board',
        labelLang: 'Language',
        diffEasy: 'Easy',
        diffMedium: 'Medium',
        confirmReset: 'Current game will be lost. Continue?',
        confirmResign: 'Resign game?',
        confirmYes: 'Yes',
        confirmNo: 'No',
        illegalMove: 'This move is not allowed (suicide or ko).',
        aiThinking: 'The computer is thinking…',
        turnBlack: 'Your turn (Black).',
        turnWhite: "Computer's turn.",
        scoringHelp: (black, white, komi) => `Tap dead stones. Score: Black ${black}, White ${white} (incl. ${komi} komi).`,
        winnerBlack: 'You (Black)',
        winnerWhite: 'The Computer (White)',
        resignedBlack: 'You (Black) win. The computer resigned.',
        resignedWhite: 'The Computer (White) wins. You resigned.',
        scoreResult: (winner, margin, black, white) => `${winner} wins by ${margin} points (Black ${black}, White ${white}).`,
        explainNoMove: 'No move played yet. Black starts.',
        explainPassHuman: 'You (Black) passed.',
        explainPassAi: 'The computer (White) passed – it sees no useful moves left.',
        explainApparentSuicide: (subj, verbPlay, pos, verbCap, count, stoneWord) =>
            `${subj} ${verbPlay} ${pos} and ${verbCap} ${count} ${stoneWord}. This looks like suicide, but it is not: the surrounding group had only this single liberty left and was therefore captured. The placed stone survives because capturing creates new liberties.`,
        explainCapture: (subj, verbPlay, pos, verbCap, count, stoneWord) =>
            `${subj} ${verbPlay} ${pos} and ${verbCap} ${count} ${stoneWord}. The captured group had no liberties left.`,
        explainMoveGroup: (subj, verbPlay, pos, libs, libWord) =>
            `${subj} ${verbPlay} ${pos} – the group now has ${libs} ${libWord}.`,
        explainMoveSingle: (subj, verbPlay, pos, libs, libWord) =>
            `${subj} ${verbPlay} ${pos} – the stone has ${libs} ${libWord}.`,
        explainKo: (pos) =>
            ` Ko rule: ${pos} cannot be immediately recaptured on the next turn.`,
        stoneWord: (n) => n === 1 ? 'stone' : 'stones',
        libertyWord: (n) => n === 1 ? 'liberty' : 'liberties',
        subjectHuman: 'You (Black)',
        subjectAi: 'The computer (White)',
        verbPlayHuman: 'play',
        verbPlayAi: 'plays',
        verbCapHuman: 'capture',
        verbCapAi: 'captures'
    },
    pl: {
        captures: (you, comp) => `Jeńcy: Ty ${you} · Komputer ${comp}`,
        btnPass: 'Pas',
        btnScoreDone: 'Gotowe',
        btnUndo: 'Cofnij',
        btnResign: 'Poddaj się',
        btnExplain: 'Wyjaśnij',
        btnNewGame: 'Nowa gra',
        labelOpponent: 'Rywal',
        labelBoard: 'Plansza',
        labelLang: 'Język',
        diffEasy: 'Łatwy',
        diffMedium: 'Średni',
        confirmReset: 'Bieżąca partia zostanie utracona. Kontynuować?',
        confirmResign: 'Poddajesz partię?',
        confirmYes: 'Tak',
        confirmNo: 'Nie',
        illegalMove: 'Ten ruch jest niedozwolony (samobójstwo lub ko).',
        aiThinking: 'Komputer myśli…',
        turnBlack: 'Twój ruch (Czarne).',
        turnWhite: 'Ruch komputera.',
        scoringHelp: (black, white, komi) => `Dotknij martwe kamienie. Wynik: Czarne ${black}, Białe ${white} (w tym ${komi} komi).`,
        winnerBlack: 'Ty (Czarne)',
        winnerWhite: 'Komputer (Białe)',
        resignedBlack: 'Ty (Czarne) wygrywasz. Komputer poddał partię.',
        resignedWhite: 'Komputer (Białe) wygrywa. Poddałeś partię.',
        scoreResult: (winner, margin, black, white) => `${winner} wygrywa o ${margin} pkt (Czarne ${black}, Białe ${white}).`,
        explainNoMove: 'Nie wykonano jeszcze żadnego ruchu. Zaczynają czarne.',
        explainPassHuman: 'Ty (Czarne) pasujesz.',
        explainPassAi: 'Komputer (Białe) spasował – nie widzi już pożytecznego ruchu.',
        explainApparentSuicide: (subj, verbPlay, pos, verbCap, count, stoneWord) =>
            `${subj} ${verbPlay} ${pos} i ${verbCap} ${count} ${stoneWord}. Wygląda to na samobójstwo, ale nim nie jest: otaczająca grupa miała już tylko ten jeden oddech i została zbita. Postawiony kamień żyje, ponieważ zbicie tworzy nowe oddechy.`,
        explainCapture: (subj, verbPlay, pos, verbCap, count, stoneWord) =>
            `${subj} ${verbPlay} ${pos} i ${verbCap} ${count} ${stoneWord}. Zbita grupa nie miała już oddechów.`,
        explainMoveGroup: (subj, verbPlay, pos, libs, libWord) =>
            `${subj} ${verbPlay} ${pos} – grupa ma teraz ${libs} ${libWord}.`,
        explainMoveSingle: (subj, verbPlay, pos, libs, libWord) =>
            `${subj} ${verbPlay} ${pos} – kamień ma ${libs} ${libWord}.`,
        explainKo: (pos) =>
            ` Zasada ko: pole ${pos} nie może zostać natychmiast odbite w następnym ruchu.`,
        stoneWord: (n) => {
            if (n === 1) return 'kamień';
            const mod10 = n % 10;
            const mod100 = n % 100;
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'kamienie';
            return 'kamieni';
        },
        libertyWord: (n) => {
            if (n === 1) return 'oddech';
            const mod10 = n % 10;
            const mod100 = n % 100;
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'oddechy';
            return 'oddechów';
        },
        subjectHuman: 'Ty (Czarne)',
        subjectAi: 'Komputer (Białe)',
        verbPlayHuman: 'stawiasz kamień na',
        verbPlayAi: 'stawia kamień na',
        verbCapHuman: 'zbijasz',
        verbCapAi: 'zbija'
    }
};

function formatPoints(value, lang = 'de') {
    const locale = lang === 'en' ? 'en-US' : lang === 'pl' ? 'pl-PL' : 'de-DE';
    return value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

if (typeof module !== 'undefined') {
    module.exports = { I18N, formatPoints };
}

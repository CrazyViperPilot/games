// Texte auf Deutsch, Englisch und Polnisch. Sprache liegt im localStorage unter "sv:lang".
const LANGS = { de: 'Deutsch', en: 'English', pl: 'Polski' };

const STRINGS = {
  de: {
    title: 'Schiffe versenken', titleA: 'Schiffe', titleB: 'versenken',
    chat: 'Chat', menu: 'Menü', chatHead: 'Funkverkehr', chatClose: 'Chat schließen', chatPh: 'Nachricht…', send: 'Senden',
    offline: '⚠ offline', noConn: 'Keine Verbindung zum Server', noConnDot: 'Keine Verbindung zum Server.', connecting: 'Verbinde …', backHome: 'Zurück zum Hafen',
    gameOver: 'Das Spiel ist vorbei',
    yourName: 'Dein Name', needName: 'Bitte erst einen Namen eingeben', host: '⚓ Spiel hosten', openGames: 'Offene Spiele',
    searching: 'Suche offene Spiele …', nobody: '🌊 Gerade wartet niemand. Hoste ein Spiel – wer die Seite öffnet, sieht es hier.',
    waitingSince: 'wartet seit {0}', join: 'Beitreten ›', justNow: 'gerade eben',
    running1: '⚔️ 1 Gefecht läuft gerade', runningN: '⚔️ {0} Gefechte laufen gerade',
    waitOpp: 'Warte auf einen Gegner …', waitHint: 'Dein Spiel steht jetzt in der Liste „Offene Spiele“. Wer Schiffe versenken öffnet, kann beitreten.',
    captain: 'Kapitän ', wins: ' Siege', cancel: 'Abbrechen',
    tapShipFirst: 'Erst ein Schiff antippen', noRotate: 'Kein Platz zum Drehen', noRoom: 'Dort ist kein Platz', noTouch: 'Schiffe dürfen sich nicht berühren',
    isReady: ' ist bereit ✔', stillPlacing: ' stellt noch auf …', waitFor: '⏳ Warte auf {0} …', opponent: 'Gegner', change: 'Ändern',
    random: '🎲 Zufall', rotate: '⟳ Drehen', ready: 'Bereit ⚓', placeTitle: 'Flotte aufstellen', fleetSent: 'Deine Flotte ist gemeldet.',
    placeHint: 'Schiff ziehen zum Verschieben · nochmal antippen zum Drehen',
    alreadyShot: 'Da hast du schon hingeschossen', noShipThere: 'Dort kann kein Schiff liegen', fireAt: '🔥 Feuer auf {0}', pickTarget: '🔥 Ziel wählen',
    bWin: '🏆 Sieg! Die feindliche Flotte ist versenkt', bLose: '💥 Deine Flotte wurde versenkt', bNoOpp: 'Gegner fehlt',
    bSunk: '💥 Versenkt! Feuer frei', bHit: '🔥 Treffer! Nochmal feuern', bMine: '🎯 Dein Zug – wähle ein Ziel',
    bTheirs: '⏳ {0} zielt auf deine Flotte', offlineP: ' (offline)',
    hits: '{0}/{1} Treffer', round: 'Runde {0}', enemyFleet: 'Feindflotte', enemyWaters: 'Feindgewässer', yourFleet: 'Deine Flotte',
    rematch: '⟳ Revanche', leave: 'Verlassen', stay: 'Bleiben', winTitle: 'Sieg auf hoher See!', loseTitle: 'Versenkt …',
    winText: 'Du hast die Flotte von {0} versenkt.', loseText: '{0} hat deine Flotte versenkt.',
    sWins: 'Siege', sShots: 'Schüsse', sRate: 'Trefferquote', viewBoards: 'Bretter ansehen',
    leaveQ: 'Spiel verlassen?', leaveHint: 'Dein Gegner kann dann auf einen neuen Mitspieler warten.',
    soundOff: '🔇 Ton aus', soundOn: '🔊 Ton an', leaveGame: 'Spiel verlassen', showResult: 'Ergebnis zeigen', toOverview: '← Zur Spieleübersicht', close: 'Schließen',
    language: 'Sprache',
    ships: ['Schlachtschiff', 'Kreuzer', 'Zerstörer', 'U-Boot'],
    shipsAcc: ['ein Schlachtschiff', 'einen Kreuzer', 'einen Zerstörer', 'ein U-Boot'],
    // Server-Meldungen
    c_opened: '{0} hat das Spiel eröffnet', c_joined: '{0} ist an Bord – Schiffe aufstellen!', c_start: 'Alle Flotten bereit. {0} eröffnet das Feuer!',
    c_miss: '{0}: {1} – Wasser', c_hit: '{0}: {1} – Treffer!', c_sunk: '{0} versenkt {2} ({1})', c_won: '🏆 {0} gewinnt die Seeschlacht!',
    c_rematch: '{0} will Revanche – neue Runde, Schiffe aufstellen!', c_left: '{0} hat das Spiel verlassen. Warte auf neuen Gegner …',
    e_name: 'Bitte einen Namen eingeben', e_full: 'Das Spiel ist schon voll', e_busy: 'Gerade sind zu viele Spiele offen', e_gone: 'Das Spiel gibt es nicht mehr',
    e_notin: 'Du spielst hier nicht mit', e_noplace: 'Gerade wird nicht aufgestellt', e_nofight: 'Das Gefecht läuft nicht', e_noturn: 'Du bist nicht dran',
    e_cant: 'Geht gerade nicht', e_fleet: 'Die Flotte ist unvollständig', e_edge: 'Ein Schiff ragt über den Rand', e_touch: 'Schiffe dürfen sich nicht berühren',
    e_cell: 'Ungültiges Feld', e_shot: 'Da hast du schon hingeschossen',
  },
  en: {
    title: 'Battleships', titleA: 'Battle', titleB: 'ships',
    chat: 'Chat', menu: 'Menu', chatHead: 'Radio', chatClose: 'Close chat', chatPh: 'Message…', send: 'Send',
    offline: '⚠ offline', noConn: 'No connection to the server', noConnDot: 'No connection to the server.', connecting: 'Connecting …', backHome: 'Back to harbour',
    gameOver: 'The game is over',
    yourName: 'Your name', needName: 'Please enter a name first', host: '⚓ Host a game', openGames: 'Open games',
    searching: 'Looking for open games …', nobody: '🌊 Nobody is waiting right now. Host a game – anyone who opens this page will see it here.',
    waitingSince: 'waiting {0}', join: 'Join ›', justNow: 'just now',
    running1: '⚔️ 1 battle in progress', runningN: '⚔️ {0} battles in progress',
    waitOpp: 'Waiting for an opponent …', waitHint: 'Your game is now listed under “Open games”. Anyone who opens Battleships can join.',
    captain: 'Captain ', wins: ' wins', cancel: 'Cancel',
    tapShipFirst: 'Tap a ship first', noRotate: 'No room to rotate', noRoom: 'No room there', noTouch: 'Ships must not touch',
    isReady: ' is ready ✔', stillPlacing: ' is still placing …', waitFor: '⏳ Waiting for {0} …', opponent: 'opponent', change: 'Change',
    random: '🎲 Random', rotate: '⟳ Rotate', ready: 'Ready ⚓', placeTitle: 'Place your fleet', fleetSent: 'Your fleet is reported.',
    placeHint: 'Drag a ship to move · tap again to rotate',
    alreadyShot: 'You already fired there', noShipThere: 'No ship can be there', fireAt: '🔥 Fire at {0}', pickTarget: '🔥 Pick a target',
    bWin: '🏆 Victory! The enemy fleet is sunk', bLose: '💥 Your fleet was sunk', bNoOpp: 'Opponent missing',
    bSunk: '💥 Sunk! Fire at will', bHit: '🔥 Hit! Fire again', bMine: '🎯 Your turn – pick a target',
    bTheirs: '⏳ {0} is aiming at your fleet', offlineP: ' (offline)',
    hits: '{0}/{1} hits', round: 'Round {0}', enemyFleet: 'Enemy fleet', enemyWaters: 'Enemy waters', yourFleet: 'Your fleet',
    rematch: '⟳ Rematch', leave: 'Leave', stay: 'Stay', winTitle: 'Victory at sea!', loseTitle: 'Sunk …',
    winText: 'You sank the fleet of {0}.', loseText: '{0} sank your fleet.',
    sWins: 'Wins', sShots: 'Shots', sRate: 'Hit rate', viewBoards: 'View boards',
    leaveQ: 'Leave the game?', leaveHint: 'Your opponent can then wait for a new player.',
    soundOff: '🔇 Sound off', soundOn: '🔊 Sound on', leaveGame: 'Leave game', showResult: 'Show result', toOverview: '← All games', close: 'Close',
    language: 'Language',
    ships: ['Battleship', 'Cruiser', 'Destroyer', 'Submarine'],
    shipsAcc: ['a battleship', 'a cruiser', 'a destroyer', 'a submarine'],
    c_opened: '{0} opened the game', c_joined: '{0} is aboard – place your ships!', c_start: 'All fleets ready. {0} opens fire!',
    c_miss: '{0}: {1} – miss', c_hit: '{0}: {1} – hit!', c_sunk: '{0} sinks {2} ({1})', c_won: '🏆 {0} wins the naval battle!',
    c_rematch: '{0} wants a rematch – new round, place your ships!', c_left: '{0} left the game. Waiting for a new opponent …',
    e_name: 'Please enter a name', e_full: 'The game is already full', e_busy: 'Too many games are open right now', e_gone: 'This game no longer exists',
    e_notin: 'You are not playing here', e_noplace: 'Ships are not being placed right now', e_nofight: 'The battle is not running', e_noturn: 'It is not your turn',
    e_cant: 'Not possible right now', e_fleet: 'The fleet is incomplete', e_edge: 'A ship sticks out over the edge', e_touch: 'Ships must not touch',
    e_cell: 'Invalid cell', e_shot: 'You already fired there',
  },
  pl: {
    title: 'Statki', titleA: 'Gra w', titleB: 'statki',
    chat: 'Czat', menu: 'Menu', chatHead: 'Radio', chatClose: 'Zamknij czat', chatPh: 'Wiadomość…', send: 'Wyślij',
    offline: '⚠ offline', noConn: 'Brak połączenia z serwerem', noConnDot: 'Brak połączenia z serwerem.', connecting: 'Łączenie …', backHome: 'Wróć do portu',
    gameOver: 'Gra się skończyła',
    yourName: 'Twoje imię', needName: 'Najpierw wpisz imię', host: '⚓ Załóż grę', openGames: 'Otwarte gry',
    searching: 'Szukam otwartych gier …', nobody: '🌊 Nikt teraz nie czeka. Załóż grę – każdy, kto otworzy tę stronę, zobaczy ją tutaj.',
    waitingSince: 'czeka od {0}', join: 'Dołącz ›', justNow: 'przed chwilą',
    running1: '⚔️ Trwa 1 bitwa', runningN: '⚔️ Trwa bitew: {0}',
    waitOpp: 'Czekam na przeciwnika …', waitHint: 'Twoja gra jest teraz na liście „Otwarte gry“. Każdy, kto otworzy Statki, może dołączyć.',
    captain: 'Kapitan ', wins: ' wygr.', cancel: 'Anuluj',
    tapShipFirst: 'Najpierw dotknij statek', noRotate: 'Brak miejsca na obrót', noRoom: 'Tam nie ma miejsca', noTouch: 'Statki nie mogą się stykać',
    isReady: ' jest gotowy ✔', stillPlacing: ' jeszcze ustawia …', waitFor: '⏳ Czekam na: {0} …', opponent: 'przeciwnika', change: 'Zmień',
    random: '🎲 Losowo', rotate: '⟳ Obróć', ready: 'Gotowe ⚓', placeTitle: 'Ustaw flotę', fleetSent: 'Twoja flota jest zgłoszona.',
    placeHint: 'Przeciągnij statek, by przesunąć · dotknij ponownie, by obrócić',
    alreadyShot: 'Już tam strzelałeś', noShipThere: 'Tam nie może być statku', fireAt: '🔥 Ognia na {0}', pickTarget: '🔥 Wybierz cel',
    bWin: '🏆 Zwycięstwo! Flota wroga zatopiona', bLose: '💥 Twoja flota została zatopiona', bNoOpp: 'Brak przeciwnika',
    bSunk: '💥 Zatopiony! Ognia dalej', bHit: '🔥 Trafiony! Strzelaj jeszcze raz', bMine: '🎯 Twój ruch – wybierz cel',
    bTheirs: '⏳ {0} celuje w twoją flotę', offlineP: ' (offline)',
    hits: '{0}/{1} trafień', round: 'Runda {0}', enemyFleet: 'Flota wroga', enemyWaters: 'Wody wroga', yourFleet: 'Twoja flota',
    rematch: '⟳ Rewanż', leave: 'Wyjdź', stay: 'Zostań', winTitle: 'Zwycięstwo na morzu!', loseTitle: 'Zatopiony …',
    winText: 'Zatopiłeś flotę gracza {0}.', loseText: '{0} zatopił twoją flotę.',
    sWins: 'Wygrane', sShots: 'Strzały', sRate: 'Celność', viewBoards: 'Zobacz plansze',
    leaveQ: 'Opuścić grę?', leaveHint: 'Twój przeciwnik może wtedy poczekać na nowego gracza.',
    soundOff: '🔇 Dźwięk wył.', soundOn: '🔊 Dźwięk wł.', leaveGame: 'Opuść grę', showResult: 'Pokaż wynik', toOverview: '← Wszystkie gry', close: 'Zamknij',
    language: 'Język',
    ships: ['Pancernik', 'Krążownik', 'Niszczyciel', 'Okręt podwodny'],
    shipsAcc: ['pancernik', 'krążownik', 'niszczyciel', 'okręt podwodny'],
    c_opened: '{0} założył grę', c_joined: '{0} jest na pokładzie – ustawcie statki!', c_start: 'Wszystkie floty gotowe. {0} otwiera ogień!',
    c_miss: '{0}: {1} – pudło', c_hit: '{0}: {1} – trafiony!', c_sunk: '{0} zatapia {2} ({1})', c_won: '🏆 {0} wygrywa bitwę morską!',
    c_rematch: '{0} chce rewanżu – nowa runda, ustawcie statki!', c_left: '{0} opuścił grę. Czekam na nowego przeciwnika …',
    e_name: 'Wpisz imię', e_full: 'Gra jest już pełna', e_busy: 'Za dużo otwartych gier', e_gone: 'Ta gra już nie istnieje',
    e_notin: 'Nie grasz tutaj', e_noplace: 'Teraz nie ustawia się statków', e_nofight: 'Bitwa nie trwa', e_noturn: 'Nie twój ruch',
    e_cant: 'Teraz niemożliwe', e_fleet: 'Flota jest niekompletna', e_edge: 'Statek wystaje poza planszę', e_touch: 'Statki nie mogą się stykać',
    e_cell: 'Nieprawidłowe pole', e_shot: 'Już tam strzelałeś',
  },
};

let LANG = (() => {
  let l = '';
  try { l = localStorage.getItem('sv:lang') || ''; } catch (e) { /* privater Modus */ }
  if (!STRINGS[l]) l = ((navigator.language || 'de').slice(0, 2).toLowerCase());
  return STRINGS[l] ? l : 'de';
})();

/** Text zum Schlüssel, {0}, {1} … werden ersetzt. Fehlt er, kommt der Schlüssel zurück. */
function t(key, ...args) {
  const s = STRINGS[LANG][key] ?? STRINGS.de[key] ?? key;
  return typeof s === 'string' ? s.replace(/\{(\d)\}/g, (_, i) => args[i] ?? '') : s;
}
function setLang(l) {
  if (!STRINGS[l]) return;
  LANG = l;
  try { localStorage.setItem('sv:lang', l); } catch (e) { /* egal */ }
  applyStaticTexts();
}
/** Feste Texte im HTML (data-i18n, data-i18n-aria, data-i18n-ph). */
function applyStaticTexts() {
  document.documentElement.lang = LANG;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh); });
}

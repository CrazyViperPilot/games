// Overlay-Menüs (PLAN §5 ui/menu.js): Start, Pause, Hilfe, Ende. Reines DOM, keine Spiellogik.
// Jedes Menü setzt root.dataset.kind ('start' | 'pause' | 'help' | 'end'), damit die Tastatur weiß, was offen ist.
import { BALANCE } from '../data/balance.js';

const DIFFS = [
  ['easy', 'Leicht'],
  ['normal', 'Normal'],
  ['hard', 'Schwer'],
];
const POINTS = [25, 50, 100];
const KEYS = [
  ['Linksklick', 'Auswählen · Shift = hinzufügen · Doppelklick = alle dieses Typs im Bild'],
  ['Ziehen', 'Rahmenauswahl (nur Einheiten)'],
  ['Rechtsklick', 'Bewegen · auf Gegner = angreifen · Gebäude gewählt = Sammelpunkt'],
  ['A + Klick', 'Angriffsbewegung'],
  ['S', 'Stopp'],
  ['B', 'Baumenü: Q Fahrzeughalle, W Förderanlage, E Mauer, R Tor, T Mörser, Z Flugabwehr'],
  ['Q / W / E', 'Ausbildung im gewählten Gebäude (FOB: Schütze, PAK, LKW · Halle: SPz, KPz)'],
  ['F', 'LKW gewählt: FOB errichten, dann Zielpunkt anklicken'],
  ['Entf', 'Gebäude abreißen (25 % des Baumaterials zurück)'],
  ['Esc', 'Abbrechen · Auswahl aufheben'],
  ['Strg + 0–9', 'Gruppe speichern · 0–9 wählt · zweimal drücken = Kamera hin'],
  ['Pfeile / Rand', 'Kamera bewegen · Mausrad = Zoom · mittlere Taste ziehen'],
  ['Leertaste', 'Kamera auf Auswahl oder letzte Meldung · H = Haupt-FOB'],
  ['+ / −', 'Spielgeschwindigkeit'],
  ['P', 'Pause'],
  ['Minimap', 'Linksklick = Kamera, Rechtsklick = Bewegen'],
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmtTime(s) {
  const t = Math.max(0, Math.floor(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function show(root, kind, html) {
  root.innerHTML = html;
  root.dataset.kind = kind;
  root.hidden = false;
}

export function hideOverlay(root) {
  root.onclick = null;
  root.innerHTML = '';
  delete root.dataset.kind;
  root.hidden = true;
}

/** Startmenü: onStart({difficulty, winPoints}) beim Klick auf Start. */
export function showStartMenu(root, onStart) {
  let difficulty = 'normal';
  let winPoints = BALANCE.winPoints;
  show(
    root,
    'start',
    `<section class="menu start">
      <h1 class="logo">FRONTLINE</h1>
      <p class="tag">Echtzeit-Strategie · FOB bauen, Ressourcen fördern, Konfliktzone halten</p>
      <div class="field">
        <span class="flabel">Schwierigkeit</span>
        <div class="seg">${DIFFS.map(([k, l]) => `<button type="button" data-diff="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="field">
        <span class="flabel">Siegpunkte</span>
        <div class="seg">${POINTS.map((p) => `<button type="button" data-pts="${p}">${p}</button>`).join('')}</div>
      </div>
      <ol class="howto">
        <li>Förderanlagen auf Vorkommen im Bauradius deiner FOB setzen.</li>
        <li>Die Konfliktzone in der Mitte halten: Geld, und alle 30 s ein Punkt.</li>
        <li>Gewinnen: Siegpunkte erreichen oder den Gegner ohne FOB und LKW ausschalten.</li>
      </ol>
      <button type="button" class="primary" data-act="start">Start</button>
      <p class="muted small center">Alle Tasten zeigt F1 im Spiel.</p>
    </section>`,
  );
  const mark = () => {
    root.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.diff === difficulty)));
    root.querySelectorAll('[data-pts]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.pts) === winPoints)));
  };
  mark();
  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.diff) difficulty = b.dataset.diff;
    else if (b.dataset.pts) winPoints = Number(b.dataset.pts);
    else if (b.dataset.act === 'start') {
      hideOverlay(root);
      onStart({ difficulty, winPoints });
      return;
    }
    mark();
  };
}

/** Pausenmenü: onResume() bei „Weiter“, onQuit() bei „Zum Startmenü“. */
export function showPause(root, onResume, onQuit) {
  show(
    root,
    'pause',
    `<section class="menu small-menu">
      <h2>Pause</h2>
      <div class="stack">
        <button type="button" class="primary" data-act="resume">Weiter (P)</button>
        <button type="button" data-act="quit">Zum Startmenü</button>
      </div>
    </section>`,
  );
  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    hideOverlay(root);
    if (b.dataset.act === 'resume') onResume();
    else onQuit();
  };
}

/** Hilfe mit allen Tasten. Schließen über den Knopf oder Esc (main.js). */
export function showHelp(root) {
  show(
    root,
    'help',
    `<section class="menu help">
      <h2>Tasten und Maus</h2>
      <table class="keys">${KEYS.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="stack"><button type="button" class="primary" data-act="close">Schließen (Esc)</button></div>
    </section>`,
  );
  root.onclick = (e) => {
    if (e.target.closest('[data-act=close]')) hideOverlay(root);
  };
}

/**
 * Endbildschirm. info = { winner, team (eigenes Team), reason ('points' | 'eliminated'), stats: { time, points: [a, b], winPoints } }.
 */
export function showEnd(root, { winner, team, reason, stats }, onRestart) {
  const won = winner === team;
  const who = BALANCE.teamNames[winner];
  let why;
  if (reason === 'points') why = `${who} hat ${stats.winPoints} Siegpunkte erreicht.`;
  else if (won) why = 'Der Gegner hat keine FOB und keinen LKW mehr.';
  else why = 'Du hast keine FOB und keinen LKW mehr.';
  show(
    root,
    'end',
    `<section class="menu end">
      <h2 class="end-title ${won ? 'win' : 'lose'}">${won ? 'Sieg' : 'Niederlage'}</h2>
      <p class="center">${esc(why)}</p>
      <table class="keys">
        <tr><th>Spielzeit</th><td>${fmtTime(stats.time)}</td></tr>
        <tr><th>Siegpunkte</th><td>${BALANCE.teamNames[0]} ${stats.points[0]} : ${stats.points[1]} ${BALANCE.teamNames[1]}</td></tr>
      </table>
      <div class="stack"><button type="button" class="primary" data-act="again">Nochmal</button></div>
    </section>`,
  );
  root.onclick = (e) => {
    if (!e.target.closest('[data-act=again]')) return;
    hideOverlay(root);
    onRestart();
  };
}

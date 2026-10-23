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
  ['Rechtsklick auf FOB/HQ', 'LKW: leer laden, beladen entladen (am HQ nur laden) · Baufahrzeug: an Baustelle helfen, beschädigtes Gebäude reparieren'],
  ['A + Klick', 'Angriffsbewegung'],
  ['S', 'Stopp'],
  ['B', 'Baumenü: Baufahrzeug alles (Q Halle, W Förderanlage, E Mauer, R Tor, T Mörser, Z Flak, F FOB-Baustelle) · Infanterie nur E Mauer, R Tor'],
  ['Bauen', 'Gebäude brauchen einen Bauer daneben: Baufahrzeug oder Infanterie (nur Mauer/Tor)'],
  ['Q / W / E / R', 'Ausbildung im gewählten Gebäude (FOB: Schütze, PAK, LKW, Baufahrzeug · Halle: SPz, KPz)'],
  ['L / U / T', 'LKW gewählt: Laden (dann FOB oder HQ anklicken) · Entladen (FOB oder FOB-Baustelle) · Pendeln (Start-FOB oder HQ, dann Ziel-FOB)'],
  ['Q / W / E / R', 'LKW gewählt: Ladungsart Gemischt · Baumaterial · Munition · Treibstoff'],
  ['Entf', 'Gebäude abreißen (25 % des Baumaterials zurück)'],
  ['HQ', 'Unbegrenzter Nachschub, 2 Ladeplätze für LKW (weitere warten) · Bauradius 550 px · zerstört = Niederlage'],
  ['Lager', 'Jede FOB hat ein eigenes Lager (max. 3000 je Sorte). Förderanlagen liefern in die FOB, in deren Radius sie stehen · Gebäude bezahlt die FOB oder das HQ in Reichweite'],
  ['Munition', 'Jeder Schuss verbraucht Munition · ohne Vorrat feuern Einheiten nicht (FOB-MG kostet nichts)'],
  ['Treibstoff', 'Fahrzeuge verbrauchen Treibstoff nur beim Fahren · ohne Vorrat nur 25 % Tempo'],
  ['Esc', 'Abbrechen · Auswahl aufheben'],
  ['Strg + 0–9', 'Gruppe speichern · 0–9 wählt · zweimal drücken = Kamera hin'],
  ['Pfeile / Rand', 'Kamera bewegen · Mausrad = Zoom · mittlere Taste ziehen'],
  ['Leertaste', 'Kamera auf Auswahl oder letzte Meldung · H = Kamera auf das HQ'],
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
      <p class="tag">Echtzeit-Strategie · Nachschub vom HQ an die Front fahren, Konfliktzone halten</p>
      <div class="field">
        <span class="flabel">Schwierigkeit</span>
        <div class="seg">${DIFFS.map(([k, l]) => `<button type="button" data-diff="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="field">
        <span class="flabel">Siegpunkte</span>
        <div class="seg">${POINTS.map((p) => `<button type="button" data-pts="${p}">${p}</button>`).join('')}</div>
      </div>
      <ol class="howto">
        <li>Das HQ liefert unbegrenzt Nachschub, aber nur 2 LKW laden gleichzeitig. Vorgeschobene FOBs bauen (Baufahrzeug, B F).</li>
        <li>LKW (E): Baumaterial, Munition und Treibstoff vom HQ oder aus FOB-Lagern an Baustellen und Truppen bringen.</li>
        <li>Förderanlagen (Baufahrzeug, B W) auf Vorkommen an der Front liefern als Nahquelle in die FOB in deren Radius.</li>
        <li>Die Konfliktzone in der Mitte halten: Geld, und alle 30 s ein Punkt. Gewinnen: Siegpunkte erreichen oder das gegnerische HQ zerstören. Verlierst du dein HQ, ist die Partie verloren.</li>
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
 * Endbildschirm. info = { winner, team (eigenes Team), reason ('points' | 'hq'), stats: { time, points: [a, b], winPoints } }.
 */
export function showEnd(root, { winner, team, reason, stats }, onRestart) {
  const won = winner === team;
  const who = BALANCE.teamNames[winner];
  let why;
  let cause;
  if (reason === 'hq') {
    cause = 'HQ zerstört';
    why = won ? 'Das gegnerische HQ ist zerstört.' : 'Dein HQ wurde zerstört.';
  } else {
    cause = 'Siegpunkte';
    why = `${who} hat ${stats.winPoints} Siegpunkte erreicht.`;
  }
  show(
    root,
    'end',
    `<section class="menu end">
      <h2 class="end-title ${won ? 'win' : 'lose'}">${won ? 'Sieg' : 'Niederlage'}</h2>
      <p class="center">${esc(why)}</p>
      <table class="keys">
        <tr><th>Grund</th><td>${esc(cause)}</td></tr>
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

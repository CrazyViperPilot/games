// Overlay-Menüs (PLAN §5 ui/menu.js): Start, Pause, Hilfe, Ende. Reines DOM, keine Spiellogik.
// Jedes Menü setzt root.dataset.kind ('start' | 'pause' | 'help' | 'end'), damit die Tastatur weiß, was offen ist.
import { BALANCE } from '../data/balance.js';
import { listMaps, deleteMap, saveMap, normalizeMap, describeMap } from '../game/mapdata.js';

const DIFFS = [
  ['easy', 'Leicht'],
  ['normal', 'Normal'],
  ['hard', 'Schwer'],
];
const POINTS = [25, 50, 100];
const KEYS = [
  ['Linksklick / Tippen', 'Auswählen · Shift = hinzufügen · Doppelklick = alle dieses Typs im Bild · mit gewählten Einheiten: Boden = Gehen, Gegner = Angriff'],
  ['Ziehen (Maus)', 'Rahmenauswahl (nur Einheiten)'],
  ['Rechtsklick', 'Bewegen · auf Gegner = angreifen · Gebäude gewählt = Sammelpunkt · halten und ziehen = Karte schieben'],
  ['Touch', 'Ein Finger ziehen = Karte schieben · zwei Finger = Zoomen und Schieben'],
  ['I', 'Soldaten gewählt: Einsteigen (dann LKW, Baufahrzeug, Schützenpanzer, Hubschrauber oder ein Haus der Stadt antippen) · O = Absetzen bzw. Raus aus dem Haus'],
  ['Kisten', 'Versorgungskisten (gelbe Quadrate auf der Minimap) liegen abseits der Zone: Soldaten gewählt, Rechtsklick oder Tippen auf die Kiste – der nächste holt sie, die übrigen begleiten ihn. Der Träger geht langsamer, schießt nicht und bringt sie zur nächsten eigenen FOB · jede eingelagerte Kiste +1 Geld/s · K = ablegen · fällt der Träger oder die FOB, liegt die Kiste wieder am Boden'],
  ['Häuserkampf', 'Soldaten gewählt: Rechtsklick oder Tippen auf ein Haus der Stadt besetzt es (Wohnhaus 4, Halle und Bahnhof 8, Fabrik 10 Plätze). Drinnen geschützt, ein Stockwerk höher, Reichweite ab der Hauswand · Klick aufs eigene Haus wählt die Besatzung · O oder ein Marschbefehl = Raus · Handwaffen kratzen nur, Kanonen, RPG, Granaten und Mörser bringen das Haus zum Einsturz (Besatzung verletzt)'],
  ['Rechtsklick auf FOB', 'LKW: leer laden, beladen entladen · Baufahrzeug: an Baustelle helfen, beschädigtes Gebäude reparieren'],
  ['A + Klick', 'Angriffsbewegung'],
  ['S', 'Stopp'],
  ['F', 'Formation wechseln: Locker, Linie, Keil, Kolonne (Panzer vorn, Gruppe marschiert geschlossen)'],
  ['B', 'Baumenü: Baufahrzeug alles (E Mauer, R Tor, T Mörser, Z Flak, X Bohrer, G Sendemast, F FOB-Baustelle) · Soldaten nur E Mauer, R Tor'],
  ['Bauen', 'Gebäude brauchen einen Bauer daneben: Baufahrzeug oder Soldaten (nur Mauer/Tor, aus getragenem Baumaterial, im Bauradius einer FOB)'],
  ['Haupt-FOB', 'Ausbildung (nur hier, nur gegen Geld, zwei Einheiten gleichzeitig): Q Schütze · W PAK · T Scharfschütze · E LKW · R Baufahrzeug · A SPz · S KPz · D Little Bird · F Transporter · G AH-64 · C Kommandeur (einmalig)'],
  ['L / U / T', 'LKW gewählt: Laden (dann FOB anklicken) · Entladen (FOB oder FOB-Baustelle) · Pendeln (Start-FOB, dann Ziel)'],
  ['Q / W / E / R', 'LKW gewählt: Ladungsart Gemischt · Baumaterial · Munition · Treibstoff'],
  ['Entf', 'Gebäude abreißen (25 % des Baumaterials zurück)'],
  ['Lager', 'Die Haupt-FOB hat unendlich Baumaterial, Munition und Treibstoff. Vordere FOBs haben ein eigenes Lager, das LKW füllen · Gebäude bezahlt die FOB in Reichweite · LKW versorgen Einheiten in der Nähe aus ihrer Ladung'],
  ['Munition', 'Jeder Schuss verbraucht Munition · ohne Vorrat feuern Einheiten nicht (FOB-MG kostet nichts)'],
  ['Treibstoff', 'Fahrzeuge verbrauchen Treibstoff nur beim Fahren · ohne Vorrat nur 25 % Tempo'],
  ['Esc', 'Abbrechen · Auswahl aufheben'],
  ['Strg + 0–9', 'Gruppe speichern · 0–9 wählt · zweimal drücken = Kamera hin'],
  ['Pfeile / Rand', 'Kamera bewegen · Mausrad = Zoom · rechte oder mittlere Taste ziehen'],
  ['Leertaste', 'Kamera auf Auswahl oder letzte Meldung · H = Haupt-FOB'],
  ['+ / −', 'Spielgeschwindigkeit'],
  ['V', 'Ansicht umschalten: 2D von oben / isometrisch'],
  [', / .', 'Isometrische Ansicht um 90° nach links / rechts drehen (auch Knöpfe ⟲ ⟳ oben)'],
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

const MAPSEL_KEY = 'frontline-kartenwahl';
const RADIO_KEY = 'frontline-radio'; // Startmenü: Sendemast-Sieg an/aus
function readMapSel() {
  try {
    return localStorage.getItem(MAPSEL_KEY) || 'random';
  } catch {
    return 'random';
  }
}
/** Ein/Aus-Einstellung des Startmenüs (gemerkt). */
function readFlag(key, dflt) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === '1';
  } catch {
    return dflt;
  }
}
function writeFlag(key, on) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* ohne Speicher: gilt nur für diese Sitzung */
  }
}
function writeMapSel(v) {
  try {
    localStorage.setItem(MAPSEL_KEY, v);
  } catch {
    /* ohne Speicher: gilt nur für diese Sitzung */
  }
}

/** Startmenü: onStart({difficulty, winPoints, mapId, radio}) beim Klick auf Start (mapId 'random' oder Karten-ID, radio = Sendemast-Sieg). */
export function showStartMenu(root, onStart, { wallet = () => BALANCE.startRes.money, resetWallet = () => {} } = {}) {
  let difficulty = 'normal';
  let mapSel = readMapSel(); // 'random' | Karten-ID
  let winPoints = BALANCE.winPoints;
  let radio = readFlag(RADIO_KEY, true);
  show(
    root,
    'start',
    `<section class="menu start">
      <h1 class="logo">FRONTLINE</h1>
      <p class="tag">Echtzeit-Strategie · Einheiten an die Front bringen, versorgen und die Konfliktzone halten</p>
      <div class="field">
        <span class="flabel">Schwierigkeit</span>
        <div class="seg">${DIFFS.map(([k, l]) => `<button type="button" data-diff="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="field">
        <span class="flabel">Siegpunkte</span>
        <div class="seg">${POINTS.map((p) => `<button type="button" data-pts="${p}">${p}</button>`).join('')}</div>
      </div>
      <div class="field">
        <span class="flabel" title="Sendemast: bauen und ${Math.round(BALANCE.radio.hold / 60)} min halten gewinnt ebenfalls">Sendemast-Sieg</span>
        <div class="seg"><button type="button" data-radio="1">An</button><button type="button" data-radio="0">Aus</button></div>
      </div>
      <div class="field">
        <span class="flabel">Karte</span>
        <div class="seg">
          <button type="button" data-mapmode="random">Zufall</button>
          <button type="button" data-mapmode="saved">Gespeichert</button>
          <button type="button" data-mapmode="new">Neue Karte</button>
        </div>
        <div class="mapbox" data-mapbox></div>
      </div>
      <ol class="howto">
        <li>Du startest mit 2 Kampfpanzern, 3 Schützenpanzern, 29 Soldaten (22 Schützen, 7 Panzerabwehrsoldaten), LKW, Baufahrzeug und deinem Kommandeur (goldener Stern: in seiner Nähe schießen deine Einheiten schneller und Verwundete heilen; fällt er, bekommt der Gegner 5 Punkte). Das Einheitenlimit beträgt 50 Plätze: Soldat 1, Schützenpanzer 3, Kampfpanzer 5. Die Haupt-FOB hat unendlich Baumaterial, Munition und Treibstoff und bildet alle Einheiten aus – nur Geld ist knapp.</li>
        <li>LKW (E) bringen Nachschub aus der Haupt-FOB zu den vorderen FOBs und versorgen Einheiten in ihrer Nähe.</li>
        <li>Baufahrzeug (R): bis zu 10 FOBs (ohne überlappende Bauradien), Mörser, Flak, Bohrer und – falls oben an – einen Sendemast: steht er fertig 5 Minuten, ist die Partie gewonnen. Soldaten bauen aus wenig getragenem Baumaterial Mauern und Tore.</li>
        <li>Konfliktzone halten: jede deiner Einheiten dort bringt Geld (0,4/s, in der Hot Zone 0,8/s), alle 30 s ein Punkt. Fällt deine Haupt-FOB, ist die Runde verloren.</li>
      </ol>
      <p class="muted small center" data-wallet></p>
      <button type="button" class="primary" data-act="start">Start</button>
      <p class="muted small center">Alle Tasten zeigt F1 im Spiel.</p>
    </section>`,
  );
  const showWallet = () => {
    const el = root.querySelector('[data-wallet]');
    if (el) el.innerHTML = `Kasse: <b>${wallet()}</b> Geld (bleibt von Runde zu Runde) · <button type="button" class="btn-sm" data-act="resetWallet">zurücksetzen</button>`;
  };
  showWallet();
  const mark = () => {
    root.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.diff === difficulty)));
    root.querySelectorAll('[data-pts]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.pts) === winPoints)));
    root.querySelectorAll('[data-radio]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.radio === '1') === radio)));
  };
  const renderMapBox = () => {
    const box = root.querySelector('[data-mapbox]');
    const saved = listMaps();
    if (mapSel !== 'random' && !saved.some((m) => m.id === mapSel)) mapSel = 'random';
    if (mapSel === 'random') {
      box.innerHTML = '<p class="muted small">Bei jedem Start wird eine neue Karte erzeugt. <button type="button" class="btn-sm" data-act="editRandom">im Editor öffnen</button></p>';
    } else {
      box.innerHTML = '';
    }
    root.querySelectorAll('[data-mapmode]').forEach((b) => {
      const m = b.dataset.mapmode;
      b.setAttribute('aria-pressed', String(m === 'saved' ? mapSel !== 'random' : m === 'random' && mapSel === 'random'));
    });
    if (mapSel !== 'random' || root.dataset.showSaved === '1') {
      const opts = saved
        .map((m) => {
          const d = describeMap(m.map);
          return `<option value="${esc(m.id)}"${m.id === mapSel ? ' selected' : ''}>${esc(m.name)} (${d.buildings} Gebäude, ${d.trees} Bäume)</option>`;
        })
        .join('');
      box.innerHTML = saved.length
        ? `<select data-mapsel>${opts}</select>
           <div class="maprow"><button type="button" class="btn-sm" data-act="mapEdit">Bearbeiten</button>
           <button type="button" class="btn-sm" data-act="mapDelete">Löschen</button>
           <label class="btn-sm filebtn">Importieren<input type="file" accept=".json,application/json" data-mapimport hidden></label></div>`
        : `<p class="muted small">Noch keine Karte gespeichert. <label class="btn-sm filebtn">Importieren<input type="file" accept=".json,application/json" data-mapimport hidden></label></p>`;
    }
  };
  mark();
  renderMapBox();
  root.onchange = (e) => {
    if (e.target.matches('[data-mapsel]')) {
      mapSel = e.target.value;
      writeMapSel(mapSel);
    } else if (e.target.matches('[data-mapimport]')) {
      const f = e.target.files?.[0];
      if (!f) return;
      f.text()
        .then((t) => {
          const m = normalizeMap(JSON.parse(t));
          const id = saveMap(m);
          if (!id) throw new Error('Speicher voll');
          mapSel = id;
          writeMapSel(id);
          renderMapBox();
        })
        .catch((err) => {
          const box = root.querySelector('[data-mapbox]');
          box.insertAdjacentHTML('beforeend', `<p class="bad small">Import fehlgeschlagen: ${esc(err.message)}</p>`);
        });
    }
  };
  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mapmode === 'random') {
      mapSel = 'random';
      delete root.dataset.showSaved;
      writeMapSel(mapSel);
      renderMapBox();
      return;
    }
    if (b.dataset.mapmode === 'saved') {
      const saved = listMaps();
      if (mapSel === 'random' && saved.length) mapSel = saved[0].id;
      else if (!saved.length) root.dataset.showSaved = '1';
      writeMapSel(mapSel);
      renderMapBox();
      return;
    }
    if (b.dataset.mapmode === 'new') {
      location.href = 'editor.html?new=1';
      return;
    }
    if (b.dataset.act === 'editRandom') {
      location.href = `editor.html?seed=${Math.floor(Math.random() * 1e9) + 1}`;
      return;
    }
    if (b.dataset.act === 'mapEdit') {
      location.href = `editor.html?map=${encodeURIComponent(mapSel)}`;
      return;
    }
    if (b.dataset.act === 'mapDelete') {
      if (!window.confirm('Diese Karte löschen?')) return;
      deleteMap(mapSel);
      mapSel = 'random';
      writeMapSel(mapSel);
      renderMapBox();
      return;
    }
    if (b.dataset.diff) difficulty = b.dataset.diff;
    else if (b.dataset.pts) winPoints = Number(b.dataset.pts);
    else if (b.dataset.radio) {
      radio = b.dataset.radio === '1';
      writeFlag(RADIO_KEY, radio);
    }
    else if (b.dataset.act === 'resetWallet') {
      resetWallet();
      showWallet();
    } else if (b.dataset.act === 'start') {
      hideOverlay(root);
      onStart({ difficulty, winPoints, mapId: mapSel, radio });
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
 * Endbildschirm. info = { winner, team (eigenes Team), reason ('points' | 'eliminated' | 'radio'), stats: { time, points: [a, b], winPoints } }.
 */
export function showEnd(root, { winner, team, reason, stats }, onRestart) {
  const won = winner === team;
  const who = BALANCE.teamNames[winner];
  let why;
  if (reason === 'points') why = `${who} hat ${stats.winPoints} Siegpunkte erreicht.`;
  else if (reason === 'radio') why = `${who} hat den Sendemast ${Math.round(BALANCE.radio.hold / 60)} Minuten gehalten.`;
  else if (won) why = 'Die Haupt-FOB des Gegners ist zerstört.';
  else why = 'Deine Haupt-FOB ist zerstört.';
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

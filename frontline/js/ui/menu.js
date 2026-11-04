// Overlay-Menüs (docs/verlauf.md §5 ui/menu.js): Start, Pause, Hilfe, Ende. Reines DOM, keine Spiellogik.
// Jedes Menü setzt root.dataset.kind ('start' | 'pause' | 'help' | 'end'), damit die Tastatur weiß, was offen ist.
import { BALANCE } from '../data/balance.js';
import { listMaps, deleteMap, saveMap, normalizeMap, describeMap } from '../game/mapdata.js';
import { WEATHER_SETTINGS } from '../game/weather.js';
import { MOOD_SETTINGS } from '../render/mood.js';
import { SOUND_KEY } from '../audio/sound.js';

const DIFFS = [
  ['easy', 'Leicht'],
  ['normal', 'Normal'],
  ['hard', 'Schwer'],
];
const POINTS = [25, 50, 100];
const WEATHER_LABELS = { off: 'Aus', random: 'Zufall', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
const KEYS = [
  ['Linksklick / Tippen', 'Auswählen · Shift = hinzufügen · Doppelklick = alle dieses Typs im Bild · mit gewählten Einheiten: Boden = Gehen, Gegner = Angriff'],
  ['Ziehen (Maus)', 'Rahmenauswahl (nur Einheiten)'],
  ['Rechtsklick', 'Bewegen · auf Gegner = angreifen · Gebäude gewählt = Sammelpunkt · halten und ziehen = Karte schieben'],
  ['Touch', 'Ein Finger ziehen = Karte schieben · zwei Finger = Zoomen und Schieben'],
  ['I', 'Soldaten gewählt: Einsteigen (dann LKW, Baufahrzeug, Schützenpanzer, Hubschrauber oder ein Haus der Stadt antippen) · O = Absetzen bzw. Raus aus dem Haus'],
  ['Kisten', 'Versorgungskisten (gelbe Quadrate auf der Minimap) liegen abseits der Zone: Soldaten gewählt, Rechtsklick oder Tippen auf die Kiste – der nächste holt sie, die übrigen begleiten ihn. Der Träger geht langsamer, schießt nicht und bringt sie zur nächsten eigenen FOB · jede eingelagerte Kiste +1 Geld/s · K = ablegen · fällt der Träger oder die FOB, liegt die Kiste wieder am Boden'],
  ['Häuserkampf', 'Soldaten gewählt: Rechtsklick oder Tippen auf ein Haus der Stadt besetzt es (Wohnhaus 4, Halle und Bahnhof 8, Fabrik 10 Plätze). Drinnen geschützt, ein Stockwerk höher, Reichweite ab der Hauswand · Klick aufs eigene Haus wählt die Besatzung · O oder ein Marschbefehl = Raus · Handwaffen kratzen nur, Kanonen, RPG, Granaten und Mörser bringen das Haus zum Einsturz (Besatzung verletzt); Splitter treffen die Besatzung schon vorher · X = Stürmen (Soldaten laufen an ein gegnerisches Haus, kämpfen an der Wand und ziehen ein) · Besatzer bauen das Haus aus: Z Sandsäcke, N MG-Nest, W Stacheldraht'],
  ['Rechtsklick auf FOB', 'LKW: leer laden, beladen entladen · Baufahrzeug: an Baustelle helfen, beschädigtes Gebäude reparieren'],
  ['A + Klick', 'Angriffsbewegung · auf eine Brücke: beschießen, bis sie einstürzt'],
  ['Fluss', `Falls im Startmenü an: auf Zufallskarten trennt je ein Fluss die Startecken von der Zone · drei Brücken und zwei Furten führen hinüber (in der Furt halbes Tempo) · Brücken greift nur an, wer es befiehlt (A + Klick); eingestürzt sperren sie, bis ein Baufahrzeug sie wieder aufbaut (Rechtsklick oder Tippen auf die Trümmer, ${BALANCE.river.rebuildCost} Geld, ${BALANCE.river.rebuild} s)`],
  ['S', 'Stopp'],
  ['F', 'Formation wechseln: Locker, Linie, Keil, Kolonne (Panzer vorn, Gruppe marschiert geschlossen)'],
  ['Wetter', 'Falls im Startmenü an: Regen und Schnee −20 % Sicht, Nebel −35 % · Schneefall bremst Fahrzeuge um 20 %, Winterboden um 10 % · das Wetter wechselt alle paar Minuten (Anzeige oben, antippen erklärt es) · bei schlechter Sicht lohnt ein Späher'],
  ['J', 'Nächstes Baufahrzeug wählen und Kamera darauf (auch Knopf „Bauer“ rechts oben); wiederholt = reihum durch alle'],
  ['B', 'Baumenü: Baufahrzeug alles (E Mauer, R Tor, T Mörser, Z Flak, C Phalanx, V Gefechtsturm, X Bohrer, G Sendemast, F FOB-Baustelle) · Soldaten nur E Mauer, R Tor'],
  ['Festung', 'FOB gewählt: H = zur Festung ausbauen (Mauerring mit vier Toren, zwei Gefechtstürme an den Ecken zum Gegner) · Soldaten gewählt: Rechtsklick oder Tippen auf einen fertigen Turm besetzt ihn (3 Plätze, geschützt, mehr Reichweite) · Turm gewählt: T Mörser, Z Flak, N SAM aufs Dach (feuert nur mit Besatzung, Munition aus dem FOB-Lager), O Besatzung raus'],
  ['Bauen', 'Gebäude brauchen einen Bauer daneben: Baufahrzeug oder Soldaten (nur Mauer/Tor, aus getragenem Baumaterial, im Bauradius einer FOB)'],
  ['Hauptstadt', 'Ausbildung (nur hier, nur gegen Geld, zwei Einheiten gleichzeitig): Q Schütze · W PAK · T Scharfschütze · E LKW · R Baufahrzeug · A SPz · S KPz · D Little Bird · F Transporter · G AH-64 · J Flakpanzer · N SAM-Startrampe · C Kommandeur (einmalig)'],
  ['U', 'Forschungsbaum (falls im Startmenü an), auch über den Knopf „🔬 Forschung“ rechts oben oder U bei gewählter Hauptstadt · Alle Einheiten sind von Anfang an frei, die Forschung verbessert sie · 10 Stufen (Spalten) und 7 Äste (Zeilen: Infanterie, Kampfpanzer, Schützenpanzer und Flugabwehr, Luftwaffe, Logistik und Pioniere, Stellungen, Elektronik und KI) · Eine Stufe öffnet sich, wenn auf der Stufe davor 3 Forschungen fertig sind; jede Forschung braucht ihren Vorgänger im Ast · Die Hauptstadt forscht eins zugleich, bis zu 3 weitere warten (bezahlt beim Einreihen, ✕ in der Warteschlange erstattet) · Mit Stadt: ohne Universität ruht die Forschung, Rechenzentren beschleunigen sie · Antippen zeigt Wirkung, Preis und Voraussetzung, „Erforschen“ bzw. „Einreihen“ startet · Esc schließt'],
  ['N / Z', 'Fahrzeuge gewählt, Nebelwerfer erforscht: N legt eine Nebelwand (eigene Einheiten darin nehmen halb so viel Schaden) · Baufahrzeug, Minen erforscht: Z legt eine Mine (trifft Bodeneinheiten des Gegners)'],
  ['L / U / T', 'LKW gewählt: Laden (dann FOB anklicken) · Entladen (FOB oder FOB-Baustelle) · Pendeln (Start-FOB, dann Ziel)'],
  ['Q / W / E / R', 'LKW gewählt: Ladungsart Gemischt · Baumaterial · Munition · Treibstoff'],
  ['Entf', 'Gebäude abreißen (25 % des Baumaterials zurück)'],
  ['Lager', 'Die Hauptstadt hat unendlich Baumaterial (mit „Stadt“ im Startmenü: nur, was die Werke der Stadt liefern), Munition und Treibstoff. Vordere FOBs haben ein eigenes Lager, das LKW füllen · Gebäude bezahlt die FOB in Reichweite · LKW versorgen Einheiten in der Nähe aus ihrer Ladung'],
  ['Munition', 'Jeder Schuss verbraucht Munition · ohne Vorrat feuern Einheiten nicht (FOB-MG kostet nichts)'],
  ['Treibstoff', 'Fahrzeuge verbrauchen Treibstoff nur beim Fahren · ohne Vorrat nur 25 % Tempo'],
  ['Esc', 'Abbrechen · Auswahl aufheben'],
  ['Strg + 0–9', 'Gruppe speichern · 0–9 wählt · zweimal drücken = Kamera hin'],
  ['Pfeile / Rand', 'Kamera bewegen · Mausrad = Zoom · rechte oder mittlere Taste ziehen'],
  ['Leertaste', 'Kamera auf Auswahl oder letzte Meldung · H = Hauptstadt'],
  ['+ / −', 'Spielgeschwindigkeit'],
  ['V', 'Ansicht umschalten: 2D von oben / isometrisch'],
  [', / .', 'Isometrische Ansicht um 90° nach links / rechts drehen (auch Knöpfe ⟲ ⟳ oben)'],
  ['P', 'Pause'],
  ['Y', 'Baumodus der Stadt an/aus (nur mit Stadt im Startmenü): Werkzeug rechts wählen, auf der Karte ein Rechteck ziehen (überall, wo nichts im Weg steht; dunkle Zellen sind gesperrt); zwei Finger schieben weiter; das Spiel läuft weiter · Ausgebildete Einheiten brauchen freie Einwohner (Soldat 1, Panzer 3, Hubschrauber 2) · Bewohner in der Konfliktzone fliehen bei Beschuss · Förderung nur auf Vorkommen (Wald, Fels, Erz, Öl), Werke verarbeiten das Geförderte, Fahrzeuge kosten Metall · Eigenes Stadtgebäude antippen: Infos und Aktionen (Markt: Handel, T; Abreißen, Entf) · Mit fertigem Markt öffnet Tippen auf die Geldanzeige oben das Marktmenü · Gegnerische Stadtgebäude per Rechtsklick angreifen, Ruinen wachsen nach 30 s neu · Kraftwerk (2 × 2 Zellen): Strom für Werke und Forschung (oben Angebot/Verbrauch) · Die Straßen der Konfliktzone und die Brücken sind Stadtstraßen für beide Teams: dort gebaute Häuser und Läden haben Straßenanschluss, eigene Straßen schließen an · Werke (BM, Munition, Raffinerie, Stahl) sind Großbauten über 2 × 2 Zellen · Universität (Großbau 3 × 3 Zellen): ohne sie ruht jede Forschung · Rechenzentrum: jede Stufe jedes Rechenzentrums forscht 20 % schneller (höchstens dreifach) · Zufriedenheit (Gewerbe, Sicherheit, Strom) steigert Erträge · Truppen bilden mit Stadt nur Kaserne (4 × 4, Soldaten), Fabrikhalle (8 × 8, alle Fahrzeuge), Heliport (Hubschrauber) und ✈ Flughafen (10 × 10, F-16 mit K, Platz für 20 Flugzeuge) aus, bezahlt direkt aus der Stadt; das Startviertel hat Kaserne und Fabrikhalle · F-16: zwei Raketen (zwei Ziele, auch Hubschrauber und Flugzeuge), 45 s Treibstoff, fliegt leer oder bei knappem Treibstoff selbst zurück und tankt am Flughafen; Befehl = Start, Rechtsklick auf den eigenen Flughafen = landen, Flughafen gewählt: W wählt seine Staffel · Diese drei pflegen auch ihre Einheiten im Umkreis von 2 Feldern (Kaserne heilt Soldaten, Fabrikhalle und Heliport reparieren gegen Metall); das ✚ Krankenhaus heilt Soldaten im Umkreis von 3 Feldern schneller · Schilder über den Gebäuden: großes Symbol = Funktionsgebäude (⚖ Markt, Förderung, Werke, ⚔ Kaserne, 🔧 Fabrikhalle, 🚁 Heliport, ✚ Krankenhaus …), grünes Haus = Wohnen (privat), blaues Bürohaus = Gewerbe (kommerziell)'],
  ['📊', 'Ressourcen (nur mit Stadt): Knopf rechts oben unter „Forschung“ zeigt den Fluss von der Förderung (Gebäude, Rohstoff/s) über die Werke bis zu Lager und Verbrauch; Linienbreite = Menge je s, rot = Engpass, gelb = Werk wartet oder Rohstoff verfällt, unten die Engpässe mit Rat · Esc schließt'],
  ['F2', 'Ton an/aus (auch der Lautsprecher-Knopf oben)'],
  ['Minimap', 'Linksklick = Kamera, Rechtsklick = Bewegen'],
];

// Vollbild (wie Katzen-Queens): installiert startet die App per Manifest (`display: fullscreen`) ohne Status- und Navigationsleiste.
// Im Browser-Tab, oder solange Android das geänderte Manifest einer schon installierten App noch nicht übernommen hat,
// schaltet der Schalter im Start- und Pausenmenü die Fullscreen API. Läuft die App schon per Manifest im Vollbild, bleibt er verborgen.
const fsOn = () => !!document.fullscreenElement;
const fsToggleable = () =>
  !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false &&
  (fsOn() || !matchMedia('(display-mode: fullscreen)').matches);
function setFullscreen(on) {
  if (on === fsOn()) return;
  const p = on ? document.documentElement.requestFullscreen({ navigationUI: 'hide' }) : document.exitFullscreen();
  p?.catch?.(() => {});
}
/** Schalter im offenen Menü an den Vollbild-Zustand anpassen (auch nach Zurück-Geste oder Esc). */
function markFullscreen(root) {
  root.querySelectorAll('[data-fsbox]').forEach((el) => { el.hidden = !fsToggleable(); });
  root.querySelectorAll('[data-fs]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.fs === '1') === fsOn())));
}
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    const root = document.getElementById('overlay');
    if (root && !root.hidden) markFullscreen(root);
  });
}

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
const MOOD_LABELS = { off: 'Aus', random: 'Zufall', morning: 'Morgen', day: 'Tag', evening: 'Abend', night: 'Nacht' };
const MOOD_KEY = 'frontline-licht'; // Startmenü: Lichtstimmung (nur Optik)
const WEATHER_KEY = 'frontline-wetter'; // Startmenü: Wetter aus, Zufall oder feste Jahreszeit
const RESEARCH_KEY = 'frontline-forschung'; // Startmenü: Forschung an/aus
const CITY_KEY = 'frontline-stadt'; // Startmenü: Stadt (SimCity-Teil) an/aus
const RIVER_KEY = 'frontline-fluss'; // Startmenü: Flüsse auf Zufallskarten an/aus
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
/** Gemerkte Auswahl des Startmenüs (eine von `allowed`, sonst dflt). */
function readChoice(key, allowed, dflt) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : dflt;
  } catch {
    return dflt;
  }
}
function writeChoice(key, v) {
  try {
    localStorage.setItem(key, v);
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

/**
 * Startmenü: onStart({difficulty, winPoints, mapId, radio, weather, research, river}) beim Klick auf Start (mapId 'random' oder Karten-ID,
 * radio = Sendemast-Sieg, weather = 'off' | 'random' | Jahreszeit, research = Forschungsbaum, river = Flüsse auf Zufallskarten).
 */
export function showStartMenu(root, onStart, { wallet = () => BALANCE.startRes.money, resetWallet = () => {}, resume = null } = {}) {
  // resume: { find(): Promise<{ text, source } | null>, onResume(), onDiscard() } – gespeicherte Partie (Gerät oder Webspace), siehe ui/saves.js
  const D = BALANCE.menuDefaults; // Standards: js/data/balance.js
  let difficulty = D.difficulty;
  let mapSel = readMapSel(); // 'random' | Karten-ID
  let winPoints = BALANCE.winPoints;
  let radio = readFlag(RADIO_KEY, D.radio);
  let weather = readChoice(WEATHER_KEY, WEATHER_SETTINGS, D.weather);
  let mood = readChoice(MOOD_KEY, MOOD_SETTINGS, 'random');
  let research = readFlag(RESEARCH_KEY, D.research);
  let river = readFlag(RIVER_KEY, D.river);
  let city = readFlag(CITY_KEY, D.city);
  let sound = readFlag(SOUND_KEY, true); // Ton: gleicher Speicher wie der Schalter im Spiel (audio/sound.js)
  show(
    root,
    'start',
    `<section class="menu start">
      <h1 class="logo">FRONTLINE</h1>
      <div class="resume" data-resume hidden></div>
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
        <span class="flabel" title="Jahreszeit und wechselndes Wetter: Regen, Nebel und Schnee senken die Sicht, Schnee bremst Fahrzeuge">Wetter</span>
        <div class="seg">${WEATHER_SETTINGS.map((k) => `<button type="button" data-weather="${k}">${WEATHER_LABELS[k]}</button>`).join('')}</div>
      </div>
      <div class="field">
        <span class="flabel" title="Lichtstimmung über der Karte: Morgen, Tag, Abend oder Nacht (nur Optik, ändert nichts am Spiel). Zufall wählt passend zur Jahreszeit">Licht</span>
        <div class="seg">${MOOD_SETTINGS.map((k) => `<button type="button" data-mood="${k}">${MOOD_LABELS[k]}</button>`).join('')}</div>
      </div>
      <div class="field">
        <span class="flabel" title="Forschungsbaum in der Hauptstadt: 10 Stufen mit Verbesserungen je Einheit (Reichweite, Panzerung, Tempo, Treibstoff …); alle Einheiten sind auch ohne Forschung frei">Forschung</span>
        <div class="seg"><button type="button" data-research="1">An</button><button type="button" data-research="0">Aus</button></div>
      </div>
      <div class="field">
        <span class="flabel" title="Stadt auf der ganzen Karte rund um die Hauptstadt (die erste FOB); Stadtgebäude, Straßen und Fabriken überall, FOBs braucht man nur für militärische Gebäude: Wohnen, Gewerbe und Werke bauen; die Werke füllen das Lager der Hauptstadt mit Baumaterial, Munition und Treibstoff (ohne Stadt hat sie unendlich davon); ausgebildete Einheiten kosten Einwohner">Stadt</span>
        <div class="seg"><button type="button" data-city="1">An</button><button type="button" data-city="0">Aus</button></div>
      </div>
      <div class="field">
        <span class="flabel" title="Zufallskarten: je ein Fluss vor jeder Startecke mit drei zerstörbaren Brücken und zwei Furten">Fluss</span>
        <div class="seg"><button type="button" data-river="1">An</button><button type="button" data-river="0">Aus</button></div>
      </div>
      <div class="field">
        <span class="flabel" title="Schüsse, Explosionen, Fahrzeuge, Wetter und Meldungen; selbst erzeugt, ohne Dateien. Im Spiel: Taste F2 oder der Lautsprecher-Knopf oben">Ton</span>
        <div class="seg"><button type="button" data-sound="1">An</button><button type="button" data-sound="0">Aus</button></div>
      </div>
      <div class="field" data-fsbox hidden>
        <span class="flabel" title="Ohne Status- und Navigationsleiste spielen. Installiert startet Frontline von selbst im Vollbild">Vollbild</span>
        <div class="seg"><button type="button" data-fs="1">An</button><button type="button" data-fs="0">Aus</button></div>
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
        <li>Du startest mit 2 Kampfpanzern, 3 Schützenpanzern, 29 Soldaten (22 Schützen, 7 Panzerabwehrsoldaten), 3 LKW, Baufahrzeug und deinem Kommandeur (goldener Stern: in seiner Nähe schießen deine Einheiten schneller und Verwundete heilen; fällt er, bekommt der Gegner 5 Punkte). Das Einheitenlimit beträgt 300 Plätze: Soldat 1, Schützenpanzer 3, Kampfpanzer 5, Flakpanzer und SAM-Startrampe 2. Die Hauptstadt hat unendlich Baumaterial, Munition und Treibstoff und bildet alle Einheiten aus – nur Geld ist knapp. Mit Stadt (Startmenü) bilden stattdessen Kaserne, Fabrikhalle und Heliport der Stadt aus. Sie heilen bzw. reparieren auch Einheiten in ihrer Nähe; ein Krankenhaus heilt Soldaten im Umkreis von 3 Feldern. Alle Einheiten sind von Anfang an frei. Ist oben Forschung an, verbessert der Forschungsbaum (U) sie in 10 Stufen: mehr Reichweite, Panzerung, Tempo, Treibstoff-Reichweite und mehr.</li>
        <li>LKW (E) bringen Nachschub aus der Hauptstadt zu den vorderen FOBs und versorgen Einheiten in ihrer Nähe.</li>
        <li>Baufahrzeug (R): bis zu 10 FOBs (ohne überlappende Bauradien), Mörser, Flak, Phalanx (Nahbereichsschutz gegen Hubschrauber und Mörsergranaten, Reichweite halber FOB-Radius, 2 min Bauzeit, frisst Munition und Geld), Bohrer und – falls oben an – einen Sendemast: steht er fertig 30 Minuten, ist die Partie gewonnen. Soldaten bauen aus wenig getragenem Baumaterial Mauern und Tore.</li>
        <li>Ist oben Fluss an, liegt vor jeder Startecke ein Fluss: über drei Brücken oder langsam durch zwei Furten. Brücken lassen sich sprengen (A, dann Brücke anklicken) und von Baufahrzeugen wieder aufbauen.</li>
        <li>Konfliktzone halten: jede deiner Einheiten dort bringt Geld (0,4/s, in der Hot Zone 0,8/s), alle 30 s ein Punkt. Fällt deine Hauptstadt, ist die Runde verloren.</li>
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
  if (resume) {
    const box = root.querySelector('[data-resume]');
    resume
      .find()
      .then((info) => {
        if (!info || root.dataset.kind !== 'start') return;
        box.innerHTML = `<p><b>Gespeicherte Partie</b><br>${esc(info.text)}</p>
          <div class="stack"><button type="button" class="primary" data-act="resume">Fortsetzen</button>
          <button type="button" class="btn-sm" data-act="discardSave">Spielstand löschen</button></div>`;
        box.hidden = false;
      })
      .catch(() => {});
  }
  const mark = () => {
    root.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.diff === difficulty)));
    root.querySelectorAll('[data-pts]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.pts) === winPoints)));
    root.querySelectorAll('[data-radio]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.radio === '1') === radio)));
    root.querySelectorAll('[data-weather]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.weather === weather)));
    root.querySelectorAll('[data-mood]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mood === mood)));
    root.querySelectorAll('[data-research]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.research === '1') === research)));
    root.querySelectorAll('[data-city]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.city === '1') === city)));
    root.querySelectorAll('[data-river]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.river === '1') === river)));
    root.querySelectorAll('[data-sound]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.sound === '1') === sound)));
    markFullscreen(root);
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
      location.href = `editor.html?seed=${Math.floor(Math.random() * 1e9) + 1}${river ? '&river=1' : ''}`;
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
    } else if (b.dataset.mood) {
      mood = b.dataset.mood;
      writeChoice(MOOD_KEY, mood);
    } else if (b.dataset.weather) {
      weather = b.dataset.weather;
      writeChoice(WEATHER_KEY, weather);
    } else if (b.dataset.research) {
      research = b.dataset.research === '1';
      writeFlag(RESEARCH_KEY, research);
    } else if (b.dataset.city) {
      city = b.dataset.city === '1';
      writeFlag(CITY_KEY, city);
    } else if (b.dataset.river) {
      river = b.dataset.river === '1';
      writeFlag(RIVER_KEY, river);
    } else if (b.dataset.fs) {
      setFullscreen(b.dataset.fs === '1');
    } else if (b.dataset.sound) {
      sound = b.dataset.sound === '1';
      writeFlag(SOUND_KEY, sound);
    }
    else if (b.dataset.act === 'resume') {
      hideOverlay(root);
      resume.onResume();
      return;
    } else if (b.dataset.act === 'discardSave') {
      if (!confirm('Gespeicherte Partie wirklich löschen?')) return;
      const box = root.querySelector('[data-resume]');
      box.hidden = true;
      resume.onDiscard();
    } else if (b.dataset.act === 'resetWallet') {
      resetWallet();
      showWallet();
    } else if (b.dataset.act === 'start') {
      hideOverlay(root);
      onStart({ difficulty, winPoints, mapId: mapSel, radio, weather, mood, research, river, city });
      return;
    }
    mark();
  };
}

/** Pausenmenü: onResume() bei „Weiter“, onQuit() bei „Zum Startmenü“. */
export function showPause(root, onResume, onQuit, onSave = null) {
  show(
    root,
    'pause',
    `<section class="menu small-menu">
      <h2>Pause</h2>
      <div class="stack">
        <button type="button" class="primary" data-act="resume">Weiter (P)</button>
        <button type="button" data-act="quit">Speichern und zum Startmenü</button>
      </div>
      <div class="field" data-fsbox hidden>
        <span class="flabel">Vollbild</span>
        <div class="seg"><button type="button" data-fs="1">An</button><button type="button" data-fs="0">Aus</button></div>
      </div>
      <p class="muted small center" data-savestate></p>
    </section>`,
  );
  onSave?.((t) => {
    const el = root.querySelector('[data-savestate]');
    if (el) el.textContent = t;
  });
  markFullscreen(root);
  root.onclick = (e) => {
    const f = e.target.closest('[data-fs]');
    if (f) return setFullscreen(f.dataset.fs === '1');
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
  else if (won) why = 'Die Hauptstadt des Gegners ist zerstört.';
  else why = 'Deine Hauptstadt ist zerstört.';
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

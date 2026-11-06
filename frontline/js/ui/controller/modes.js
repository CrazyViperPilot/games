// Spieler-Steuerung: Modustabelle MODES (Hinweis, Klick und Vorschau je Modus). Eigene Datei, damit die Befehlskarte (cards.js) sie
// lesen kann, ohne die Klassendatei zu importieren (test/imports.test.js verbietet Zyklen). Kein DOM.

import { BUILDINGS } from '../../data/buildings.js';
import { WALL_MAX } from './util.js';

/**
 * UI-Modi der Steuerung (Review E-04, seit v5.63): je Modus der Hinweis oben (hint) und was ein Linksklick auf die Karte tut (click).
 * target: true = Zielmodus (Befehlskarte zeigt nur „Abbruch“, der Klick wählt nichts aus); Zielmodus ohne click (Mauer) läuft über
 * beginWall/endWall. preview(c, wx, wy) = Vorschau unter dem Mauszeiger (view.placement). Ein Modus ohne target (Baumenü)
 * endet beim Klick auf die Karte, danach wählt der Klick aus. Neuer Zielmodus: hier eintragen und eine confirm-Methode schreiben.
 */
export const MODES = {
  build: {
    hint: (c) => (c.buildPermission().level === 'fort' ? 'Baumenü Infanterie: nur Mauer und Tor' : 'Baumenü: Gebäude wählen (Baufahrzeug)'),
  },
  place: {
    target: true,
    hint: (c) => `${BUILDINGS[c.placeType]?.name || 'Gebäude'}: Klick baut · Rechtsklick oder Esc bricht ab · Shift = mehrfach`,
    click: (c, wx, wy, shift) => c.confirmPlace(wx, wy, shift),
    preview: (c, wx, wy) => c.placementFor(c.placeType, wx, wy),
  },
  wall: {
    target: true,
    hint: () => `Mauer: Maus gedrückt halten und ziehen (max. ${WALL_MAX} Zellen)`,
    preview: (c, wx, wy) => c.wallPreview(wx, wy),
  },
  attackMove: {
    target: true,
    hint: () => 'Angriffsbewegung: Ziel anklicken (auf eine Brücke: sprengen) · Esc bricht ab',
    click: (c, wx, wy, shift) => c.confirmAttackMove(wx, wy, shift),
  },
  loadFob: {
    target: true,
    hint: () => 'LKW laden: eigene fertige FOB anklicken · Esc bricht ab',
    click: (c, wx, wy) => c.confirmTruckFob('load', wx, wy),
  },
  unloadFob: {
    target: true,
    hint: () => 'LKW entladen: eigene FOB anklicken · Esc bricht ab',
    click: (c, wx, wy) => c.confirmTruckFob('unload', wx, wy),
  },
  routeFrom: {
    target: true,
    hint: () => 'Pendeln: Start eigene fertige FOB oder Werk (Ausgangslager) anklicken · Esc bricht ab',
    click: (c, wx, wy) => c.confirmRouteFrom(wx, wy),
  },
  routeTo: {
    target: true,
    hint: () => 'Pendeln: Ziel-FOB anklicken · Esc bricht ab',
    click: (c, wx, wy) => c.confirmRouteTo(wx, wy),
  },
  mortarTarget: {
    target: true,
    hint: () => 'Mörser / Artillerie: Ziel auf der Karte anklicken (Kreis zeigt Reichweite) · Esc bricht ab',
    click: (c, wx, wy) => c.confirmMortarTarget(wx, wy),
  },
  dropoff: {
    target: true,
    hint: () => 'Absetzen: Zielpunkt anklicken · Esc bricht ab',
    click: (c, wx, wy) => c.confirmDropoff(wx, wy),
  },
  landAt: {
    target: true,
    hint: () => 'Landen: eigenen Stellplatz (Flugzeuge) oder Heliport (Hubschrauber) anklicken · Esc bricht ab',
    click: (c, wx, wy) => c.confirmLand(wx, wy),
  },
  dig: {
    target: true,
    hint: () => 'Baggern: Zelle anklicken (Zonenstraße, Bäume, Haus, eigenes Gebäude) · Shift = weitere Zellen · Esc bricht ab',
    click: (c, wx, wy, shift) => c.confirmDig(wx, wy, shift),
  },
  storm: {
    target: true,
    hint: () => 'Stürmen: gegnerisch besetztes Haus anklicken · Esc bricht ab',
    click: (c, wx, wy) => c.confirmStorm(wx, wy),
  },
  board: {
    target: true,
    hint: () => 'Einsteigen: eigenes Transportfahrzeug (LKW, Baufahrzeug, SPz, Hubschrauber) oder ein Haus der Stadt anklicken · Esc bricht ab',
    click: (c, wx, wy) => c.confirmBoard(wx, wy),
  },
};

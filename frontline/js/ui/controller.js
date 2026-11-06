// Spieler-Steuerung (docs/verlauf.md §5 ui/controller.js, §11.3–11.8): Auswahl, Modi, Befehle und Befehlskarte. Kein DOM.
// Hält den Ansichtszustand `view`, den renderer.render(view) liest. Befehle laufen nur über game.issue.

import { cityEntityAt } from '../game/city/query.js';
import { BALANCE } from '../data/balance.js';
import { canBuild } from '../game/construction.js';
import { cargoSum, canSeat } from '../game/logistics.js';
import { canGarrison } from '../game/garrison.js';
import { canCarry } from '../game/crates.js';
import { FORMATIONS, FORMATION_NAMES } from '../game/formation.js';
import { deckDist } from '../game/river.js';
import { unitLift, buildingHeight, TOWN_H } from '../render/iso.js';
import { commandOf } from '../game/commands.js';
import { isCarrier } from './controller/util.js';
import { MODES } from './controller/modes.js';
import { cardMethods } from './controller/cards.js';
import { targetMethods } from './controller/targets.js';

const DOUBLE_MS = 350; // Doppelklick auf einen Typ = alle dieses Typs im Bild
const GROUP_DOUBLE_MS = 500; // Gruppentaste zweimal = Kamera hin
const PICK_PX = 16; // Trefferradius in Bildschirm-Pixeln

const HOTKEY_ALIAS = { Y: 'Z' }; // Flugabwehr auch mit Y

const LOADED = 0.5; // ab dieser Ladung gilt ein LKW als beladen

export const UI_MODES = Object.keys(MODES); // für Tests

export class Controller {
  constructor(game, team, camera) {
    this.game = game;
    this.team = team;
    this.camera = camera;
    this.view = {
      selection: new Set(),
      mode: 'normal',
      placement: null,
      dragBox: null,
      hoverId: 0,
      moveMarker: null,
      groups: {},
    };
    this.placeType = null; // Gebäudetyp im Modus place
    this.wall = null; // Startzelle {c, r} eines Mauerzugs (während der Maus gedrückt ist)
    this.routeFromId = null; // Start-FOB beim Pendeln (Modus routeTo)
    this.routeFromWork = null; // Start-Werk beim Pendeln ab einem Werk mit Ausgangslager (Zellindex, seit v5.70; sonst null)
    this.pointer = null; // letzte Weltposition des Mauszeigers
    this.lastClick = null;
    this.lastGroup = null;
    this.lastEvent = null; // Position der letzten Meldung (Leertaste)
    this.formation = 'loose'; // Formation für Marsch- und Angriffsbefehle (F schaltet weiter)
    this.onMessage = null; // Callback für HUD-Meldungen (text)
    this.onMarket = null; // () => Marktmenü öffnen (main.js), Aktion „Handel“ eines gewählten Markts
    this.onCity = null; // () => Baumodus der Stadt an/aus (main.js)
    this.onResearch = null; // () => Forschungsmenü auf/zu (main.js, seit v4.98 eigenes Fenster)
  }

  message(text) {
    if (this.onMessage) this.onMessage(text);
  }

  /** Befehl an game.issue; bei Fehler Grund als Meldung. */
  issue(cmd) {
    const r = this.game.issue(this.team, cmd);
    if (!r.ok) this.message(r.reason);
    else if (commandOf(cmd.type)?.sound) this.onOrder?.(cmd); // Befehlston (Befehlsregister); Ausbildung und Forschung melden sich über ihre Meldungen
    return r;
  }

  setMode(mode) {
    this.view.mode = mode;
    this.placeType = null;
    this.wall = null;
    this.view.placement = null;
    if (mode !== 'routeTo') {
      this.routeFromId = null;
      this.routeFromWork = null;
    }
  }

  setDragBox(rect) {
    this.view.dragBox = rect ? { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y2 } : null;
  }

  noteEvent(ev) {
    if (Number.isFinite(ev.x) && Number.isFinite(ev.y)) this.lastEvent = { x: ev.x, y: ev.y };
  }

  /** Eigene lebende Auswahl: erst Einheiten, dann Gebäude. Tote IDs fliegen aus der Auswahl. */
  selected() {
    const sel = this.view.selection;
    const out = [];
    for (const id of [...sel]) {
      const e = this.game.getEntity(id);
      if (!e || e.team !== this.team) {
        sel.delete(id);
        continue;
      }
      out.push(e);
    }
    out.sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === 'unit' ? -1 : 1));
    return out;
  }

  selectionCenter() {
    const s = this.selected();
    if (!s.length) return null;
    let x = 0;
    let y = 0;
    for (const e of s) {
      x += e.x;
      y += e.y;
    }
    return { x: x / s.length, y: y / s.length };
  }

  /** Erste fertige eigene FOB (Hauptstadt) oder null. */
  homeBase() {
    return this.game.buildings.find((b) => b.alive && b.built && b.team === this.team && b.type === 'fob') || null;
  }

  /** Nächste passende Entity an Weltpunkt: zuerst Einheiten, dann Gebäude (Fußabdruck). */
  pick(wx, wy, pred = () => true) {
    if (this.camera.iso) return this.pickIso(wx, wy, pred);
    const tol = PICK_PX / this.camera.zoom;
    let best = null;
    let bestD = Infinity;
    for (const e of this.game.query(wx, wy, tol, (e) => e.kind === 'unit' && !e.house && pred(e))) {
      const d = Math.hypot(e.x - wx, e.y - wy);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (best) return best;
    return this.pickB(wx, wy, pred);
  }

  /** Isometrisch: Einheiten nach Bildschirmabstand (mit Flughöhe), dann Gebäude (Boden oder Dach). */
  pickIso(wx, wy, pred) {
    const cam = this.camera;
    const sp = cam.worldToScreen(wx, wy);
    let best = null;
    let bestD = Infinity;
    for (const u of this.game.units) {
      if (!u.alive || u.house || !pred(u)) continue; // Besatzer wählt man über ihr Haus
      const p = cam.worldToScreen(u.x, u.y);
      const d = Math.hypot(p.x - sp.x, p.y - unitLift(u) * cam.zoom - sp.y);
      if (d <= PICK_PX + u.def.radius * cam.zoom * 0.9 && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    return best || this.pickB(wx, wy, pred);
  }

  /** Gebäude unter dem Weltpunkt (Fußabdruck) oder null. Isometrisch zählt auch ein Klick aufs Dach. */
  pickB(wx, wy, pred = () => true) {
    for (const e of this.game.query(wx, wy, 0, (e) => e.kind === 'building' && pred(e))) return e;
    const cam = this.camera;
    if (cam.iso) {
      const sp = cam.worldToScreen(wx, wy);
      for (const e of this.game.buildings) {
        if (!e.alive || !pred(e)) continue;
        const roof = cam.screenToWorld(sp.x, sp.y + buildingHeight(e) * cam.zoom);
        const hw = (e.w * BALANCE.map.tile) / 2;
        const hh = (e.h * BALANCE.map.tile) / 2;
        if (Math.abs(roof.x - e.x) <= hw && Math.abs(roof.y - e.y) <= hh) return e;
      }
    }
    return null;
  }

  /** Stadthaus (nicht eingestürzt) unter dem Weltpunkt oder null. Isometrisch zählt auch ein Klick aufs Dach. */
  pickHouse(wx, wy, pred = () => true) {
    const houses = this.game.houses || [];
    const inside = (h, x, y) => Math.abs(x - h.x) <= h.pw / 2 && Math.abs(y - h.y) <= h.ph / 2;
    for (const h of houses) if (h.alive && pred(h) && inside(h, wx, wy)) return h;
    const cam = this.camera;
    if (cam.iso) {
      const sp = cam.worldToScreen(wx, wy);
      for (const h of houses) {
        if (!h.alive || !pred(h)) continue;
        const roof = cam.screenToWorld(sp.x, sp.y + (TOWN_H[h.type] || 40) * cam.zoom);
        if (inside(h, roof.x, roof.y)) return h;
      }
    }
    return null;
  }

  /** Brücke unter dem Weltpunkt (Fahrbahn mit Fangradius), die pred erfüllt, oder null. Die nächste gewinnt. */
  pickBridge(wx, wy, pred = () => true) {
    if (!this.game.bridges?.length) return null;
    const tol = PICK_PX / this.camera.zoom;
    let best = null;
    let bestD = Infinity;
    for (const b of this.game.bridges) {
      if (!pred(b)) continue;
      const d = deckDist(b, wx, wy);
      if (d <= tol && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** Versorgungskiste am Boden unter dem Punkt (nur bekannte: in Sicht oder im Lagebild an derselben Stelle) oder null. */
  pickCrate(wx, wy) {
    const g = this.game;
    const cam = this.camera;
    const mem = g.crateSeen?.[this.team];
    const sp = cam.worldToScreen(wx, wy);
    let best = null;
    let bd = Infinity;
    for (const c of g.crates ?? []) {
      if (c.state !== 'ground') continue;
      const m = mem?.get(c.id);
      if (!g.isVisible(this.team, c.x, c.y) && !(m && m.x === c.x && m.y === c.y)) continue;
      const p = cam.worldToScreen(c.x, c.y);
      const d = Math.hypot(p.x - sp.x, p.y - (cam.iso ? 8 * cam.zoom : 0) - sp.y); // isometrisch: Mitte der Kiste über dem Boden
      if (d <= PICK_PX + 10 * cam.zoom && d < bd) {
        best = c;
        bd = d;
      }
    }
    return best;
  }

  /** Eigenes fertiges Stadtgebäude unter dem Weltpunkt (seit v4.94 wählbar) oder null. Isometrisch zählt auch ein Klick aufs Dach. */
  pickCity(wx, wy) {
    const g = this.game;
    if (!g.city) return null;
    const own = (e) => (e && e.team === this.team ? e : null);
    const hit = own(cityEntityAt(g, wx, wy));
    if (hit || !this.camera.iso) return hit;
    const cam = this.camera;
    const sp = cam.worldToScreen(wx, wy);
    for (const lift of [TOWN_H.house * 0.6, TOWN_H.hall, TOWN_H.factory * 0.8]) {
      const p = cam.screenToWorld(sp.x, sp.y + lift * cam.zoom);
      const e = own(cityEntityAt(g, p.x, p.y));
      if (e) return e;
    }
    return null;
  }

  /** Stadtgebäude aus der Auswahl nehmen (sie lassen sich nur einzeln wählen). */
  dropCity() {
    const sel = this.view.selection;
    for (const id of [...sel]) if (this.game.getEntity(id)?.type === 'city') sel.delete(id);
  }

  /** Eigene Besatzer des Hauses wählen (Klick aufs eigene besetzte Haus). */
  selectHouse(h, add) {
    const sel = this.view.selection;
    if (!add) sel.clear();
    for (const u of h.occupants) if (u.alive && u.team === this.team) sel.add(u.id);
  }

  /** Gewählte eigene Einheiten (ohne Gebäude). */
  selectedUnits() {
    return this.selected().filter((e) => e.kind === 'unit');
  }

  // ---- Auswahl ------------------------------------------------------------------

  /** Klick auf eigene Entity wählen (eigenes besetztes Haus: seine Besatzer); ohne Treffer (und ohne add) Auswahl leeren. */
  selectAt(wx, wy, add) {
    const hit = this.pick(wx, wy, (e) => e.team === this.team);
    const sel = this.view.selection;
    if (!hit) {
      const h = this.pickHouse(wx, wy, (x) => x.team === this.team);
      if (h) {
        this.dropCity();
        this.selectHouse(h, add);
        return;
      }
      const cb = this.pickCity(wx, wy);
      if (cb) {
        sel.clear();
        sel.add(cb.id);
        return;
      }
    }
    if (!add) sel.clear();
    else this.dropCity();
    if (!hit) return;
    if (add && sel.has(hit.id)) sel.delete(hit.id);
    else sel.add(hit.id);
  }

  /** Rahmenauswahl (Bildschirmkoordinaten): nur eigene Einheiten. */
  selectBox(rect, add) {
    const cam = this.camera;
    // Der Rahmen liegt in Bildschirmkoordinaten: Einheiten dorthin projizieren (gilt auch isometrisch, mit Flughöhe)
    const sx0 = Math.min(rect.x1, rect.x2);
    const sx1 = Math.max(rect.x1, rect.x2);
    const sy0 = Math.min(rect.y1, rect.y2);
    const sy1 = Math.max(rect.y1, rect.y2);
    const units = this.game.units.filter((u) => {
      if (!u.alive || u.team !== this.team) return false;
      const p = cam.worldToScreen(u.x, u.y);
      const y = cam.iso ? p.y - unitLift(u) * cam.zoom : p.y;
      return p.x >= sx0 && p.x <= sx1 && y >= sy0 && y <= sy1;
    });
    const sel = this.view.selection;
    if (!units.length) {
      if (!add) sel.clear();
      return;
    }
    if (!add) sel.clear();
    else this.dropCity();
    for (const u of units) sel.add(u.id);
  }

  /** Seit v4.95: wählt das nächste eigene Baufahrzeug (builder 'all') und gibt es zurück; wiederholt = reihum durch alle. */
  selectNextBuilder() {
    const list = this.game.units.filter((u) => u.alive && !u.house && u.team === this.team && u.def.builder === 'all').sort((a, b) => a.id - b.id);
    if (!list.length) {
      this.message('Kein Baufahrzeug vorhanden.');
      return null;
    }
    const cur = this.selectedUnits().length === 1 ? this.selectedUnits()[0] : null;
    const i = cur ? list.findIndex((u) => u.id === cur.id) : -1;
    const u = list[(i + 1) % list.length];
    const sel = this.view.selection;
    sel.clear();
    sel.add(u.id);
    return u;
  }

  /** Alle eigenen Einheiten dieses Typs im sichtbaren Ausschnitt. */
  selectSameType(id) {
    const e = this.game.getEntity(id);
    if (!e || e.kind !== 'unit') return;
    const R = this.camera.visibleRect();
    const sel = this.view.selection;
    sel.clear();
    for (const u of this.game.units) {
      if (u.alive && u.team === this.team && u.type === e.type && u.x >= R.x0 && u.x <= R.x1 && u.y >= R.y0 && u.y <= R.y1) {
        sel.add(u.id);
      }
    }
  }

  clear() {
    this.view.selection.clear();
  }

  /** Esc: laufenden Modus beenden, sonst Auswahl aufheben. */
  cancel() {
    if (this.view.mode !== 'normal') {
      this.setMode('normal');
      return;
    }
    this.view.selection.clear();
  }

  assignGroup(n) {
    const ids = this.selected().map((e) => e.id);
    if (!ids.length) {
      this.message(`Gruppe ${n}: nichts ausgewählt`);
      return;
    }
    this.view.groups[n] = ids;
    this.message(`Gruppe ${n} gespeichert`);
  }

  /** Gruppe wählen. Liefert true, wenn dieselbe Gruppentaste kurz nochmal gedrückt wurde (Kamera hin). */
  selectGroup(n) {
    const now = performance.now();
    const dbl = !!this.lastGroup && this.lastGroup.n === n && now - this.lastGroup.t < GROUP_DOUBLE_MS;
    this.lastGroup = { n, t: now };
    const stored = this.view.groups[n];
    if (!stored) {
      this.message(`Gruppe ${n} ist leer`);
      return false;
    }
    const ids = stored.filter((id) => this.game.getEntity(id));
    if (!ids.length) {
      delete this.view.groups[n];
      this.message(`Gruppe ${n} ist leer`);
      return false;
    }
    const sel = this.view.selection;
    sel.clear();
    for (const id of ids) sel.add(id);
    return dbl;
  }

  // ---- Klicks und Befehle -------------------------------------------------------

  /** Linksklick auf die Welt, je nach Modus: Platzieren, Ziel, Auswahl (mit Doppelklick). */
  leftClickWorld(wx, wy, shift, pointer = 'mouse') {
    const mode = MODES[this.view.mode];
    if (mode?.target) {
      mode.click?.(this, wx, wy, shift); // Mauer: Zug läuft über beginWall/endWall
      return;
    }
    if (mode) this.setMode('normal'); // Baumenü endet, der Klick wählt aus
    const now = performance.now();
    const hit = this.pick(wx, wy, (e) => e.team === this.team);
    const last = this.lastClick;
    this.lastClick = { t: now, x: wx, y: wy };
    // Eigenes besetztes Haus: Besatzer wählen, außer gewählte Soldaten können noch hinein (dann besetzen sie es mit)
    const ownHouse = hit ? null : this.pickHouse(wx, wy, (h) => h.team === this.team);
    if (ownHouse && !this.selectedUnits().some((u) => canGarrison(u) && u.house !== ownHouse.id)) {
      this.selectHouse(ownHouse, shift);
      return;
    }
    // Eigenes Stadtgebäude: wählen (Info und Aktionen, z. B. Handel am Markt), auch wenn Einheiten gewählt sind
    const cityHit = hit || ownHouse ? null : this.pickCity(wx, wy);
    if (cityHit) {
      this.view.selection.clear();
      this.view.selection.add(cityHit.id);
      return;
    }
    // Standardaktion mit gewählten Einheiten: Tippen auf Boden = Gehen, auf sichtbaren Gegner = Angriff (ohne Angriff-Knopf)
    if (!shift && !hit && this.selectedUnits().length) {
      this.rightClick(wx, wy);
      return;
    }
    // Nur Touch: eigenes Gebäude antippen gibt LKW/Baufahrzeug den Befehl (laden, hinfahren, reparieren), da es keinen Rechtsklick gibt.
    // Mit der Maus wählt der Linksklick das Gebäude, Befehle gibt der Rechtsklick.
    if (pointer === 'touch' && !shift && hit && hit.kind === 'building' && this.selectedUnits().some((u) => u.def.cargoCap || u.def.builder === 'all' || (hit.type === 'tower' && canGarrison(u)))) {
      this.rightClick(wx, wy);
      return;
    }
    if (
      hit &&
      hit.kind === 'unit' &&
      last &&
      now - last.t < DOUBLE_MS &&
      Math.hypot(wx - last.x, wy - last.y) * this.camera.zoom < PICK_PX * 2
    ) {
      this.lastClick = null;
      this.selectSameType(hit.id);
      return;
    }
    this.selectAt(wx, wy, shift);
  }

  /**
   * Rechtsklick: Bewegen, Angriff (auf Gegner), Sammelpunkt (nur Gebäude gewählt) – und auf eigene Gebäude:
   * LKW laden/entladen (FOB), Baufahrzeug hinfahren (Baustelle) bzw. reparieren (beschädigtes Gebäude).
   */
  rightClick(wx, wy) {
    const sel = this.selected();
    if (!sel.length) return;
    const units = sel.filter((e) => e.kind === 'unit');
    if (!units.length) {
      const mortars = sel.filter((e) => e.def.weapon && e.def.weapon.shell);
      if (mortars.length) {
        if (this.issue({ type: 'mortarTarget', ids: mortars.map((b) => b.id), x: wx, y: wy }).ok) this.moveMarker(wx, wy);
        return;
      }
      const producers = sel.filter((e) => e.produces && e.produces.length > 0);
      for (const b of producers) this.issue({ type: 'rally', buildingId: b.id, x: wx, y: wy });
      if (producers.length) this.moveMarker(wx, wy);
      return;
    }
    let rest = units;
    // Infanterie/Baufahrzeug auf eigenen Transporthubschrauber: einsteigen
    const heli = this.pick(wx, wy, (e) => e.kind === 'unit' && e.team === this.team && e.def.seats > 0);
    if (heli) {
      const riders = units.filter((u) => u !== heli && canSeat(heli, u));
      if (riders.length) {
        this.issue({ type: 'board', ids: riders.map((u) => u.id), heliId: heli.id });
        rest = units.filter((u) => !riders.includes(u));
        if (!rest.length) return;
      }
    }
    // Eigener Heliport: Hubschrauber landen dort (seit v5.51, die übrigen gehen hin)
    const hp = rest.some((u) => u.def.air && !u.def.jet) ? this.pickHeliport(wx, wy) : null;
    if (hp) {
      const helis = rest.filter((u) => u.def.air && !u.def.jet);
      if (this.issue({ type: 'land', ids: helis.map((u) => u.id), airportId: hp.id }).ok) this.moveMarker(hp.x, hp.y);
      rest = rest.filter((u) => !helis.includes(u));
      if (!rest.length) return;
    }
    // Eigener Stellplatz: Flugzeuge landen dort (die übrigen gehen hin)
    const ap = rest.some((u) => u.def.jet) ? this.pickStand(wx, wy) : null;
    if (ap) {
      const jets = rest.filter((u) => u.def.jet);
      if (this.issue({ type: 'land', ids: jets.map((u) => u.id), airportId: ap.id }).ok) this.moveMarker(ap.x, ap.y);
      rest = rest.filter((u) => !u.def.jet);
      if (!rest.length) return;
    }
    // Versorgungskiste: der nächste Soldat ohne Kiste holt sie, die übrigen gehen mit
    const crate = this.pickCrate(wx, wy);
    if (crate && rest.some(canCarry)) {
      if (this.issue({ type: 'pickup', ids: rest.map((u) => u.id), crateId: crate.id }).ok) this.moveMarker(crate.x, crate.y);
      return;
    }
    const own = this.pickB(wx, wy, (e) => e.team === this.team);
    if (own) {
      const done = this.orderOnOwnBuilding(own, units);
      rest = units.filter((u) => !done.has(u.id));
      if (!rest.length) return;
    }
    // Eigenes Werk der Stadt (seit v5.69): LKW holen dort die Ware aus dem Ausgangslager
    const work = this.pickWork(wx, wy);
    if (work) {
      const trucks = rest.filter(isCarrier);
      if (trucks.length && this.issue({ type: 'load', ids: trucks.map((u) => u.id), work: work.cityCell }).ok) {
        this.moveMarker(work.x, work.y);
        rest = rest.filter((u) => !trucks.includes(u));
        if (!rest.length) return;
      }
    }
    // Zerstörte Brücke: Baufahrzeuge bauen sie wieder auf (die übrigen gehen hin)
    const broken = this.pickBridge(wx, wy, (b) => b.broken);
    if (broken) {
      const eng = rest.filter((u) => u.def.builder === 'all');
      if (eng.length && this.issue({ type: 'repairBridge', ids: eng.map((u) => u.id), bridgeId: broken.id }).ok) {
        this.moveMarker(broken.x, broken.y);
        rest = rest.filter((u) => !eng.includes(u));
        if (!rest.length) return;
      }
    }
    // Gebäude der gegnerischen Stadt (sichtbar): angreifen
    const cityB = cityEntityAt(this.game, wx, wy);
    if (cityB && cityB.team !== this.team && this.game.sees(this.team, cityB)) {
      if (this.issue({ type: 'attack', ids: rest.map((u) => u.id), targetId: cityB.id }).ok) this.moveMarker(cityB.x, cityB.y);
      return;
    }
    // Stadthaus: vom Gegner besetzt und sichtbar = angreifen; leer oder eigen = Soldaten besetzen es, die übrigen gehen hin
    const house = this.pickHouse(wx, wy);
    if (house && house.team >= 0 && house.team !== this.team) {
      if (this.game.sees(this.team, house)) {
        this.issue({ type: 'attack', ids: rest.map((u) => u.id), targetId: house.id });
        return;
      }
    } else if (house) {
      const inf = rest.filter((u) => canGarrison(u) && u.house !== house.id);
      if (inf.length && this.issue({ type: 'garrison', ids: inf.map((u) => u.id), houseId: house.id }).ok) {
        this.moveMarker(house.x, house.y);
        rest = rest.filter((u) => !inf.includes(u));
        if (!rest.length) return;
      }
    }
    const ids = rest.map((u) => u.id);
    const target = this.pick(wx, wy, (e) => e.team !== this.team && this.game.sees(this.team, e));
    if (target) {
      this.issue({ type: 'attack', ids, targetId: target.id });
      return;
    }
    const r = this.issue({ type: 'move', ids, x: wx, y: wy, formation: this.formation });
    if (r.ok) this.moveMarker(wx, wy, r.slots);
  }

  /**
   * Rechtsklick auf eigenes Gebäude. Liefert die IDs der Einheiten, die damit erledigt sind.
   * LKW: leer → laden, beladen → entladen (FOB); an Baustelle → entladen. Baufahrzeug/Infanterie an Baustelle → hinfahren
   * Baufahrzeug an beschädigtem fertigen Gebäude → reparieren.
   */
  orderOnOwnBuilding(b, units) {
    const done = new Set();
    const ids = (list) => list.map((u) => u.id);
    const carriers = units.filter((u) => u.crate);
    if (b.type === 'fob' && b.built && carriers.length && this.issue({ type: 'deliver', ids: ids(carriers), fobId: b.id }).ok) {
      this.moveMarker(b.x, b.y);
      for (const u of carriers) done.add(u.id);
    }
    const trucks = units.filter(isCarrier);
    if (b.type === 'fob' && trucks.length) {
      if (!b.built) {
        this.issue({ type: 'unload', ids: ids(trucks), fobId: b.id });
      } else {
        const empty = trucks.filter((u) => cargoSum(u.cargo) < LOADED);
        const loaded = trucks.filter((u) => cargoSum(u.cargo) >= LOADED);
        if (empty.length) this.issue({ type: 'load', ids: ids(empty), fobId: b.id });
        if (loaded.length) this.issue({ type: 'unload', ids: ids(loaded), fobId: b.id });
      }
      for (const u of trucks) done.add(u.id);
    }
    if (b.type === 'tower' && b.built) {
      const inf = units.filter((u) => canGarrison(u) && u.house !== b.id && !done.has(u.id));
      if (inf.length && this.issue({ type: 'garrison', ids: ids(inf), houseId: b.id }).ok) {
        this.moveMarker(b.x, b.y);
        for (const u of inf) done.add(u.id);
      }
    }
    const others = units.filter((u) => !done.has(u.id));
    if (!b.built) {
      const builders = others.filter((u) => canBuild(u.def, b.type));
      if (builders.length && this.issue({ type: 'build', ids: ids(builders), siteId: b.id }).ok) {
        this.moveMarker(b.x, b.y);
      }
      for (const u of builders) done.add(u.id);
    } else if (b.hp < b.maxHp) {
      const eng = others.filter((u) => u.def.builder === 'all');
      if (eng.length && this.issue({ type: 'repair', ids: ids(eng), targetId: b.id }).ok) this.moveMarker(b.x, b.y);
      for (const u of eng) done.add(u.id);
    }
    return done;
  }

  /** Zielmarke; slots = Zielplätze der einzelnen Einheiten (Formation), als Punkte gezeichnet. */
  moveMarker(x, y, slots = null) {
    this.view.moveMarker = { x, y, t: performance.now(), slots: slots && slots.length > 1 ? slots : null };
  }

  /** Nächste Formation (Locker → Linie → Keil → Kolonne). */
  cycleFormation() {
    this.formation = FORMATIONS[(FORMATIONS.indexOf(this.formation) + 1) % FORMATIONS.length];
    this.message(`Formation: ${FORMATION_NAMES[this.formation]}`);
  }

  /** IDs der gewählten Bauer, die `type` bauen dürfen (Baufahrzeug: alles, Infanterie: Mauer/Tor). */
  builderIds(type) {
    return this.selectedUnits().filter((u) => canBuild(u.def, type)).map((u) => u.id);
  }

  /** Bauen nur Soldaten (zahlen aus getragenem Baumaterial, nur im Bauradius einer FOB)? */
  carriedFor(type) {
    const us = this.selectedUnits().filter((u) => canBuild(u.def, type));
    return us.length > 0 && us.every((u) => u.def.builder === 'fort');
  }

  /** Vorschau aktualisieren: Hover-Ziel, Platzierung, Mauerzug. Wird bei jeder Mausbewegung gerufen. */
  updatePointer(wx, wy) {
    this.pointer = { x: wx, y: wy };
    const hover =
      this.pick(wx, wy, (e) => e.team === this.team || this.game.sees(this.team, e)) ||
      this.pickCrate(wx, wy) ||
      this.pickHouse(wx, wy, (h) => h.team >= 0 && this.game.sees(this.team, h));
    this.view.hoverId = hover ? hover.id : 0;
    const preview = MODES[this.view.mode]?.preview;
    this.view.placement = preview ? preview(this, wx, wy) : null;
  }

  startBuildMenu() {
    const perm = this.buildPermission();
    if (!perm.level) {
      this.message(perm.reason);
      return;
    }
    this.setMode('build');
  }

  startAttackMove() {
    if (!this.selectedUnits().length) {
      this.message('Keine Einheit gewählt');
      return;
    }
    this.setMode('attackMove');
  }

  /** LKW-Modi: 'loadFob' (L), 'unloadFob' (U), 'routeFrom' (T, Start-FOB oder Werk). */
  startTruckMode(mode) {
    if (!this.selectedUnits().some(isCarrier)) {
      this.message('Kein LKW oder Transporthubschrauber gewählt');
      return;
    }
    this.setMode(mode);
  }

  stop() {
    const ids = this.selectedUnits().map((e) => e.id);
    if (ids.length) this.issue({ type: 'stop', ids });
    this.setMode('normal');
  }

  /** Ausbildung auf allen gewählten fertigen Gebäuden, die diesen Typ bauen. */
  train(unit) {
    const producers = this.selected().filter((e) => e.kind === 'building' && e.built && e.produces.includes(unit));
    for (const b of producers) {
      if (!this.issue({ type: 'train', buildingId: b.id, unit }).ok) break;
    }
  }

  cancelTrain() {
    const bs = this.selected().filter((e) => e.kind === 'building' && e.queue.length > 0);
    if (!bs.length) {
      this.message('Nichts in der Warteschlange');
      return;
    }
    for (const b of bs) this.issue({ type: 'cancelTrain', buildingId: b.id });
  }

  demolish() {
    const bs = this.selected().filter((e) => e.kind === 'building');
    for (const b of bs) this.issue({ type: 'demolish', buildingId: b.id });
  }

  // ---- Befehlskarte und Tasten --------------------------------------------------

  /** Kurzer Hinweistext für den aktuellen Modus (leer im Normalbetrieb). */
  hint() {
    return MODES[this.view.mode]?.hint(this) ?? '';
  }

  /** Taste (bereits groß geschrieben, "Entf" für Entf) auf die Befehlskarte anwenden. Liefert true, wenn belegt. */
  handleHotkey(key) {
    const K = HOTKEY_ALIAS[key] || key;
    const e = this.commandCard().find((c) => c.hotkey === K);
    if (!e) return false;
    if (!e.enabled) this.message(e.reason || e.tip);
    else e.action();
    return true;
  }
}

Object.assign(Controller.prototype, cardMethods, targetMethods);

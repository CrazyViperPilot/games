// Spieler-Steuerung (PLAN §5 ui/controller.js, §11.3–11.8): Auswahl, Modi, Befehle und Befehlskarte. Kein DOM.
// Hält den Ansichtszustand `view`, den renderer.render(view) liest. Befehle laufen nur über game.issue.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { canBuild } from '../game/construction.js';
import { cargoSum, canSeat } from '../game/logistics.js';
import { unitLift, buildingHeight } from '../render/iso.js';

const WALL_MAX = 40; // max. Zellen je Mauerzug (Vorschau und Befehl)
const DOUBLE_MS = 350; // Doppelklick auf einen Typ = alle dieses Typs im Bild
const GROUP_DOUBLE_MS = 500; // Gruppentaste zweimal = Kamera hin
const PICK_PX = 16; // Trefferradius in Bildschirm-Pixeln
const TARGET_MODES = ['board', 'place', 'wall', 'attackMove', 'fobTarget', 'loadFob', 'unloadFob', 'routeFrom', 'routeTo', 'mortarTarget', 'dropoff'];
const BUILD_MENU = Object.keys(BUILDINGS).filter((k) => BUILDINGS[k].hotkey && BUILDINGS[k].buildable !== false);
const RES_KEYS = ['money', 'bm', 'mun', 'fuel'];
const CARGO_KEYS = ['bm', 'mun', 'fuel']; // Lagersorten (FOB-Lager, LKW-Ladung)
const SHORT = { money: 'G', bm: 'BM', mun: 'MUN', fuel: 'TS' };
const HOTKEY_ALIAS = { Y: 'Z' }; // Flugabwehr auch mit Y
// Kurznamen für die Befehlskarte (der volle Name steht im Tooltip)
const SHORT_BLD = { wall: 'Mauer', gate: 'Tor', mortar: 'Mörser', aa: 'Flak', drill: 'Bohrer' };
const SHORT_UNIT = { rifleman: 'Schütze', at: 'PAK', truck: 'LKW', engineer: 'Baufz.', ifv: 'SPz', tank: 'KPz', littlebird: 'Little Bird', transporter: 'Transp.-Heli', gunship: 'AH-64', sniper: 'Scharfschütze' };
const isCarrier = (u) => u.def.cargoCap > 0; // LKW und Transporthubschrauber
// Ladungsart: Taste, Kurzname, Bezeichnung
const PRESET_BTN = [
  ['mix', 'Q', 'Gemischt', 'Gemischt'],
  ['bm', 'W', 'Baumat.', 'Baumaterial'],
  ['mun', 'E', 'Munition', 'Munition'],
  ['fuel', 'R', 'Treibstoff', 'Treibstoff'],
];
const LOADED = 0.5; // ab dieser Ladung gilt ein LKW als beladen

/** Zellen einer Geraden zwischen zwei Zellen (Bresenham, inklusive Endpunkte). */
function lineCells(c0, r0, c1, r1) {
  const out = [];
  const dc = Math.abs(c1 - c0);
  const sc = c0 < c1 ? 1 : -1;
  const dr = -Math.abs(r1 - r0);
  const sr = r0 < r1 ? 1 : -1;
  let err = dc + dr;
  let c = c0;
  let r = r0;
  for (;;) {
    out.push({ c, r });
    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 >= dr) {
      err += dr;
      c += sc;
    }
    if (e2 <= dc) {
      err += dc;
      r += sr;
    }
  }
  return out;
}

/** Mauerzug von Start- zu Endzelle, höchstens WALL_MAX Zellen. */
function wallLine(a, b) {
  return lineCells(a.c, a.r, b.c, b.r).slice(0, WALL_MAX);
}

/** Lager (FOB oder LKW) deckt die Kosten (nur Sorten bm/mun/fuel). */
const covers = (st, cost) => CARGO_KEYS.every((k) => (st[k] || 0) >= (cost[k] || 0));

/** Kosten kurz für Schaltflächen: "400 BM". */
export function costText(cost) {
  return RES_KEYS.filter((k) => cost[k]).map((k) => `${cost[k]} ${SHORT[k]}`).join(' · ');
}

function longCost(cost) {
  return RES_KEYS.filter((k) => cost[k]).map((k) => `${cost[k]} ${BALANCE.resNames[k]}`).join(', ');
}

/** Eintrag der Befehlskarte. */
function entry(label, hotkey, o = {}) {
  return {
    label,
    hotkey,
    cost: o.cost || '',
    tip: o.tip || label,
    enabled: o.enabled !== false,
    reason: o.reason || '',
    active: !!o.active,
    action: o.action,
  };
}

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
    this.pointer = null; // letzte Weltposition des Mauszeigers
    this.lastClick = null;
    this.lastGroup = null;
    this.lastEvent = null; // Position der letzten Meldung (Leertaste)
    this.onMessage = null; // Callback für HUD-Meldungen (text)
  }

  message(text) {
    if (this.onMessage) this.onMessage(text);
  }

  /** Befehl an game.issue; bei Fehler Grund als Meldung. */
  issue(cmd) {
    const r = this.game.issue(this.team, cmd);
    if (!r.ok) this.message(r.reason);
    return r;
  }

  setMode(mode) {
    this.view.mode = mode;
    this.placeType = null;
    this.wall = null;
    this.view.placement = null;
    if (mode !== 'routeTo') this.routeFromId = null;
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

  /** Erste fertige eigene FOB (Haupt-FOB) oder null. */
  homeBase() {
    return this.game.buildings.find((b) => b.alive && b.built && b.team === this.team && b.type === 'fob') || null;
  }

  /** Nächste passende Entity an Weltpunkt: zuerst Einheiten, dann Gebäude (Fußabdruck). */
  pick(wx, wy, pred = () => true) {
    if (this.camera.iso) return this.pickIso(wx, wy, pred);
    const tol = PICK_PX / this.camera.zoom;
    let best = null;
    let bestD = Infinity;
    for (const e of this.game.query(wx, wy, tol, (e) => e.kind === 'unit' && pred(e))) {
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
      if (!u.alive || !pred(u)) continue;
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

  /** Gewählte eigene Einheiten (ohne Gebäude). */
  selectedUnits() {
    return this.selected().filter((e) => e.kind === 'unit');
  }

  // ---- Auswahl ------------------------------------------------------------------

  /** Klick auf eigene Entity wählen; ohne Treffer (und ohne add) Auswahl leeren. */
  selectAt(wx, wy, add) {
    const hit = this.pick(wx, wy, (e) => e.team === this.team);
    const sel = this.view.selection;
    if (!add) sel.clear();
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
    for (const u of units) sel.add(u.id);
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
    switch (this.view.mode) {
      case 'place':
        this.confirmPlace(wx, wy, shift);
        return;
      case 'attackMove':
        this.confirmAttackMove(wx, wy, shift);
        return;
      case 'fobTarget':
        this.confirmFob(wx, wy, shift);
        return;
      case 'loadFob':
        this.confirmTruckFob('load', wx, wy);
        return;
      case 'unloadFob':
        this.confirmTruckFob('unload', wx, wy);
        return;
      case 'routeFrom':
        this.confirmRouteFrom(wx, wy);
        return;
      case 'routeTo':
        this.confirmRouteTo(wx, wy);
        return;
      case 'mortarTarget':
        this.confirmMortarTarget(wx, wy);
        return;
      case 'dropoff':
        this.confirmDropoff(wx, wy);
        return;
      case 'board':
        this.confirmBoard(wx, wy);
        return;
      case 'wall':
        return; // Mauerzug läuft über beginWall/endWall
      case 'build':
        this.setMode('normal');
        break;
      default:
        break;
    }
    const now = performance.now();
    const hit = this.pick(wx, wy, (e) => e.team === this.team);
    const last = this.lastClick;
    this.lastClick = { t: now, x: wx, y: wy };
    // Standardaktion mit gewählten Einheiten: Tippen auf Boden = Gehen, auf sichtbaren Gegner = Angriff (ohne Angriff-Knopf)
    if (!shift && !hit && this.selectedUnits().length) {
      this.rightClick(wx, wy);
      return;
    }
    // Nur Touch: eigenes Gebäude antippen gibt LKW/Baufahrzeug den Befehl (laden, hinfahren, reparieren), da es keinen Rechtsklick gibt.
    // Mit der Maus wählt der Linksklick das Gebäude, Befehle gibt der Rechtsklick.
    if (pointer === 'touch' && !shift && hit && hit.kind === 'building' && this.selectedUnits().some((u) => u.def.cargoCap || u.def.builder === 'all')) {
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
    const own = this.pickB(wx, wy, (e) => e.team === this.team);
    if (own) {
      const done = this.orderOnOwnBuilding(own, units);
      rest = units.filter((u) => !done.has(u.id));
      if (!rest.length) return;
    }
    const ids = rest.map((u) => u.id);
    const target = this.pick(wx, wy, (e) => e.team !== this.team && this.game.sees(this.team, e));
    if (target) {
      this.issue({ type: 'attack', ids, targetId: target.id });
      return;
    }
    if (this.issue({ type: 'move', ids, x: wx, y: wy }).ok) this.moveMarker(wx, wy);
  }

  /**
   * Rechtsklick auf eigenes Gebäude. Liefert die IDs der Einheiten, die damit erledigt sind.
   * LKW: leer → laden, beladen → entladen (FOB); an Baustelle → entladen. Baufahrzeug/Infanterie an Baustelle → hinfahren
   * Baufahrzeug an beschädigtem fertigen Gebäude → reparieren.
   */
  orderOnOwnBuilding(b, units) {
    const done = new Set();
    const ids = (list) => list.map((u) => u.id);
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

  moveMarker(x, y) {
    this.view.moveMarker = { x, y, t: performance.now() };
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

  confirmPlace(wx, wy, shift) {
    const type = this.placeType;
    if (!type) return;
    const r = this.issue({ type: 'build', ids: this.builderIds(type), building: type, x: wx, y: wy });
    if (!r.ok) return;
    if (shift) this.updatePointer(wx, wy);
    else this.setMode('normal');
  }

  confirmAttackMove(wx, wy, shift) {
    const ids = this.selectedUnits().map((e) => e.id);
    if (!ids.length) {
      this.message('Keine Einheit gewählt');
      this.setMode('normal');
      return;
    }
    const r = this.issue({ type: 'attackMove', ids, x: wx, y: wy });
    if (!r.ok) return;
    this.moveMarker(wx, wy);
    if (!shift) this.setMode('normal');
  }

  /** Baufahrzeuge setzen eine FOB-Baustelle (keine Kosten; 400 Baumaterial kommen per LKW). */
  confirmFob(wx, wy, shift) {
    const ids = this.selectedUnits().filter((e) => e.type === 'engineer').map((e) => e.id);
    if (!ids.length) {
      this.message('Kein Baufahrzeug gewählt');
      this.setMode('normal');
      return;
    }
    const r = this.issue({ type: 'buildFob', ids, x: wx, y: wy });
    if (!r.ok) return;
    this.moveMarker(wx, wy);
    if (shift) this.updatePointer(wx, wy);
    else this.setMode('normal');
  }

  /** Laden oder Entladen: Klick auf eigene FOB (Entladen auch auf FOB-Baustelle). */
  confirmTruckFob(kind, wx, wy) {
    const ids = this.selectedUnits().filter(isCarrier).map((e) => e.id);
    if (!ids.length) {
      this.message('Kein LKW gewählt');
      this.setMode('normal');
      return;
    }
    const fob = this.pickB(wx, wy, (e) => e.team === this.team && e.type === 'fob');
    if (!fob) {
      this.message(kind === 'load' ? 'Eigene fertige FOB anklicken' : 'Eigene FOB oder FOB-Baustelle anklicken');
      return;
    }
    if (this.issue({ type: kind, ids, fobId: fob.id }).ok) this.setMode('normal');
  }

  /** Pendeln, Schritt 1: Start-FOB (fertig). */
  confirmRouteFrom(wx, wy) {
    const ids = this.selectedUnits().filter(isCarrier);
    if (!ids.length) {
      this.message('Kein LKW gewählt');
      this.setMode('normal');
      return;
    }
    const fob = this.pickB(wx, wy, (e) => e.team === this.team && e.type === 'fob' && e.built);
    if (!fob) {
      this.message('Start: eigene fertige FOB anklicken');
      return;
    }
    this.routeFromId = fob.id; // setMode('routeTo') behält die Start-FOB
    this.setMode('routeTo');
  }

  /** Pendeln, Schritt 2: Ziel-FOB (oder Baustelle). */
  confirmRouteTo(wx, wy) {
    const ids = this.selectedUnits().filter(isCarrier).map((e) => e.id);
    const fob = this.pickB(wx, wy, (e) => e.team === this.team && e.type === 'fob');
    if (!fob) {
      this.message('Ziel: eigene FOB oder FOB-Baustelle anklicken');
      return;
    }
    if (fob.id === this.routeFromId) {
      this.message('Start und Ziel sind gleich');
      return;
    }
    if (this.issue({ type: 'route', ids, fromId: this.routeFromId, toId: fob.id }).ok) this.setMode('normal');
  }

  /** Mörser-Ziel: Klick auf die Karte, alle gewählten Mörser in Reichweite feuern dorthin. */
  confirmMortarTarget(wx, wy) {
    const ids = this.selected().filter((e) => e.kind === 'building' && e.def.weapon && e.def.weapon.shell).map((e) => e.id);
    if (!ids.length) {
      this.message('Kein Mörser gewählt');
      this.setMode('normal');
      return;
    }
    if (this.issue({ type: 'mortarTarget', ids, x: wx, y: wy }).ok) {
      this.moveMarker(wx, wy);
      this.setMode('normal');
    }
  }

  /** Einsteigen: gewählte Soldaten gehen zum angetippten eigenen Transportfahrzeug (Touch-Weg, sonst Rechtsklick). */
  confirmBoard(wx, wy) {
    const veh = this.pick(wx, wy, (e) => e.kind === 'unit' && e.team === this.team && e.def.seats > 0);
    if (!veh) {
      this.message('Kein Transportfahrzeug angetippt');
      return;
    }
    const riders = this.selectedUnits().filter((u) => u !== veh && canSeat(veh, u));
    if (!riders.length) {
      this.message(veh.def.air ? 'Nur Infanterie und Baufahrzeuge steigen ein' : 'Nur Infanterie steigt hier ein');
      this.setMode('normal');
      return;
    }
    if (this.issue({ type: 'board', ids: riders.map((u) => u.id), heliId: veh.id }).ok) this.setMode('normal');
  }

  /** Absetzen: Transportfahrzeug fliegt/fährt zum Klickpunkt und setzt Passagiere ab. */
  confirmDropoff(wx, wy) {
    const ids = this.selectedUnits().filter((e) => e.def.seats > 0).map((e) => e.id);
    if (!ids.length) {
      this.message('Kein Transporthubschrauber gewählt');
      this.setMode('normal');
      return;
    }
    if (this.issue({ type: 'dropoff', ids, x: wx, y: wy }).ok) {
      this.moveMarker(wx, wy);
      this.setMode('normal');
    }
  }

  // ---- Platzierung und Mauerzug -------------------------------------------------

  beginPlacement(type) {
    if (!BUILDINGS[type]) return;
    this.setMode(type === 'wall' ? 'wall' : 'place');
    this.placeType = type;
    if (this.pointer) this.updatePointer(this.pointer.x, this.pointer.y);
  }

  /** Maus gedrückt im Modus wall: Startpunkt setzen. */
  beginWall(wx, wy) {
    if (this.view.mode !== 'wall') return;
    const g = this.game.grid;
    this.wall = { c: g.toCell(wx), r: g.toCell(wy) };
    this.updatePointer(wx, wy);
  }

  /** Maus losgelassen im Modus wall: Mauerzug bauen (die gewählten Bauer gehen mit). */
  endWall(wx, wy, shift) {
    if (this.view.mode !== 'wall') return;
    const g = this.game.grid;
    const start = this.wall || { c: g.toCell(wx), r: g.toCell(wy) };
    const cells = wallLine(start, { c: g.toCell(wx), r: g.toCell(wy) });
    const end = cells[cells.length - 1];
    this.wall = null;
    const r = this.issue({
      type: 'buildWall',
      building: 'wall',
      ids: this.builderIds('wall'),
      x1: g.center(start.c),
      y1: g.center(start.r),
      x2: g.center(end.c),
      y2: g.center(end.r),
    });
    if (r.ok && !shift) this.setMode('normal');
    else if (this.pointer) this.updatePointer(this.pointer.x, this.pointer.y);
  }

  placementFor(type, wx, wy) {
    const p = this.game.canPlace(this.team, type, wx, wy, { carried: this.carriedFor(type) });
    return {
      type,
      x: Number.isFinite(p.x) ? p.x : wx,
      y: Number.isFinite(p.y) ? p.y : wy,
      ok: p.ok,
      reason: p.ok ? null : p.reason,
      payer: p.payer || null, // { kind: 'fob'|'truck', id } – wer bezahlt (Vorschau)
    };
  }

  wallPreview(wx, wy) {
    const g = this.game.grid;
    const cur = { c: g.toCell(wx), r: g.toCell(wy) };
    const cells = this.wall ? wallLine(this.wall, cur) : [cur];
    const cost = BUILDINGS.wall.cost;
    const carried = this.carriedFor('wall');
    const affordable = this.game.canAfford(this.team, cost);
    const short = this.moneyReason(cost);
    const list = cells.map(({ c, r }) => {
      const p = this.game.canPlace(this.team, 'wall', g.center(c), g.center(r), { carried });
      return { cx: c, cy: r, ok: p.ok && affordable, reason: p.ok ? null : p.reason, payer: p.payer || null };
    });
    const ok = list.some((x) => x.ok);
    const firstReason = list.find((x) => x.reason)?.reason || null;
    const reason = ok ? null : affordable ? firstReason : short;
    return { type: 'wall', x: wx, y: wy, ok, reason, cells: list };
  }

  /** Vorschau aktualisieren: Hover-Ziel, Platzierung, Mauerzug. Wird bei jeder Mausbewegung gerufen. */
  updatePointer(wx, wy) {
    this.pointer = { x: wx, y: wy };
    const hover = this.pick(wx, wy, (e) => e.team === this.team || this.game.sees(this.team, e));
    this.view.hoverId = hover ? hover.id : 0;
    switch (this.view.mode) {
      case 'place':
        this.view.placement = this.placementFor(this.placeType, wx, wy);
        break;
      case 'fobTarget':
        this.view.placement = this.placementFor('fob', wx, wy);
        break;
      case 'wall':
        this.view.placement = this.wallPreview(wx, wy);
        break;
      default:
        this.view.placement = null;
    }
  }

  // ---- Modi ---------------------------------------------------------------------

  /** Wer darf bauen: 'all' (Baufahrzeug), 'fort' (nur Infanterie: Mauer/Tor) oder null (mit Grund). */
  buildPermission() {
    const units = this.selectedUnits();
    if (units.some((u) => u.def.builder === 'all')) return { level: 'all', reason: '' };
    if (units.some((u) => u.def.builder === 'fort')) return { level: 'fort', reason: '' };
    return { level: null, reason: 'Baufahrzeug oder Infanterie wählen' };
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

  /** Baumenü-Eintrag F: FOB-Baustelle setzen (Baufahrzeug gewählt). */
  startFobTarget() {
    if (!this.selectedUnits().some((e) => e.type === 'engineer')) {
      this.message('Kein Baufahrzeug gewählt');
      return;
    }
    this.setMode('fobTarget');
    if (this.pointer) this.updatePointer(this.pointer.x, this.pointer.y);
  }

  /** LKW-Modi: 'loadFob' (L), 'unloadFob' (U), 'routeFrom' (T, Start-FOB). */
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

  // ---- Gründe für gesperrte Schaltflächen ----------------------------------------

  /** Fehlt Geld für die Kosten? Text „Fehlt: n Geld“ oder "". */
  moneyReason(cost) {
    const have = this.game.teams[this.team].res.money;
    const need = cost.money || 0;
    return have >= need ? '' : `Fehlt: ${Math.ceil(need - have)} ${BALANCE.resNames.money}`;
  }

  /** Hat eine fertige eigene FOB ein Lager, das alle Sorten der Kosten deckt? */
  anyFobCovers(cost) {
    return this.game.buildings.some((b) => b.alive && b.built && b.team === this.team && b.type === 'fob' && covers(b.store, cost));
  }

  /** Grund, wenn kein FOB-Lager die Sorten der Kosten deckt (ohne Ort: für Befehlskarte). */
  lagerReason(cost) {
    const fobs = this.game.buildings.filter((b) => b.alive && b.built && b.team === this.team && b.type === 'fob');
    if (!fobs.length) return 'Keine fertige FOB';
    const miss = CARGO_KEYS.filter((k) => (cost[k] || 0) > 0 && !fobs.some((f) => f.store[k] >= cost[k])).map(
      (k) => BALANCE.resNames[k],
    );
    if (miss.length) return `FOB-Lager: zu wenig ${miss.join(', ')}`;
    return 'FOB-Lager: keine einzelne FOB deckt alle Kosten';
  }

  /** Grund für ein Gebäude im Baumenü: Geld, dann Lager (Mauer/Tor prüft die Platzierung selbst). */
  buildReason(key) {
    const cost = BUILDINGS[key].cost;
    const money = this.moneyReason(cost);
    if (money) return money;
    if (key === 'wall' || key === 'gate') return '';
    return this.anyFobCovers(cost) ? '' : this.lagerReason(cost);
  }

  /** Grund für Ausbildung in der Haupt-FOB: Geld oder Einheitenlimit. */
  trainReason(b, cost) {
    const money = this.moneyReason(cost);
    if (money) return money;
    return '';
  }

  // ---- Befehlskarte und Tasten --------------------------------------------------

  /** Kurzer Hinweistext für den aktuellen Modus (leer im Normalbetrieb). */
  hint() {
    switch (this.view.mode) {
      case 'build':
        return this.buildPermission().level === 'fort'
          ? 'Baumenü Infanterie: nur Mauer und Tor'
          : 'Baumenü: Gebäude wählen (Baufahrzeug)';
      case 'place':
        return `${BUILDINGS[this.placeType]?.name || 'Gebäude'}: Klick baut · Rechtsklick oder Esc bricht ab · Shift = mehrfach`;
      case 'wall':
        return `Mauer: Maus gedrückt halten und ziehen (max. ${WALL_MAX} Zellen)`;
      case 'attackMove':
        return 'Angriffsbewegung: Ziel anklicken · Esc bricht ab';
      case 'fobTarget':
        return 'FOB-Baustelle: Standort anklicken · Esc bricht ab';
      case 'loadFob':
        return 'LKW laden: eigene fertige FOB anklicken · Esc bricht ab';
      case 'unloadFob':
        return 'LKW entladen: eigene FOB oder FOB-Baustelle anklicken · Esc bricht ab';
      case 'routeFrom':
        return 'Pendeln: Start-FOB (fertig) anklicken · Esc bricht ab';
      case 'routeTo':
        return 'Pendeln: Ziel-FOB oder FOB-Baustelle anklicken · Esc bricht ab';
      case 'mortarTarget':
        return 'Mörser: Ziel auf der Karte anklicken (Kreis zeigt Reichweite) · Esc bricht ab';
      case 'dropoff':
        return 'Absetzen: Zielpunkt anklicken · Esc bricht ab';
      case 'board':
        return 'Einsteigen: eigenes Transportfahrzeug (LKW, Baufahrzeug, SPz, Hubschrauber) anklicken · Esc bricht ab';
      default:
        return '';
    }
  }

  /** Befehlskarte für Auswahl bzw. Modus. Einträge: { label, hotkey, cost, tip, enabled, reason, active, action }. */
  commandCard() {
    const m = this.view.mode;
    if (TARGET_MODES.includes(m)) {
      return [entry('Abbruch', 'Esc', { tip: 'Abbrechen (Esc)', action: () => this.cancel() })];
    }
    if (m === 'build') return this.buildCard();
    return this.selectionCard();
  }

  /** Baumenü: Baufahrzeug alles (plus F FOB-Baustelle), Infanterie nur Mauer/Tor. */
  buildCard() {
    const perm = this.buildPermission();
    const card = [];
    if (perm.level) {
      for (const key of BUILD_MENU) {
        if (perm.level === 'fort' && !canBuild({ builder: 'fort' }, key)) continue;
        const def = BUILDINGS[key];
        const reason = this.buildReason(key);
        card.push(
          entry(SHORT_BLD[key] || def.name, def.hotkey, {
            cost: costText(def.cost),
            tip: `${def.name}: ${longCost(def.cost)}`,
            enabled: !reason,
            reason,
            action: () => this.beginPlacement(key),
          }),
        );
      }
      if (perm.level === 'all') {
        card.push(
          entry('FOB-Baustelle', 'F', {
            cost: '400 BM',
            tip: 'FOB-Baustelle: Standort anklicken. Danach 400 Baumaterial per LKW ins Lager der Baustelle, dann baut das Baufahrzeug (30 s).',
            action: () => this.startFobTarget(),
          }),
        );
      }
    }
    card.push(entry('Zurück', 'Esc', { tip: 'Zurück zu den Befehlen (Esc)', action: () => this.cancel() }));
    return card;
  }

  selectionCard() {
    const sel = this.selected();
    const units = sel.filter((e) => e.kind === 'unit');
    const blds = sel.filter((e) => e.kind === 'building');
    if (!units.length && blds.length) return this.buildingCard(blds);

    const perm = this.buildPermission();
    const card = [];
    // Hubschrauber bauen nicht: ohne Bodeneinheit in der Auswahl entfällt das Baumenü
    if (!units.length || units.some((u) => !u.def.air)) {
      card.push(
        entry('Bauen', 'B', {
          tip: perm.level ? 'Baumenü öffnen (B)' : perm.reason,
          enabled: !!perm.level,
          reason: perm.reason,
          action: () => this.startBuildMenu(),
        }),
      );
    }
    card.push(
      entry('Angriff', 'A', {
        tip: 'Angriffsbewegung (A, dann Ziel anklicken)',
        enabled: units.length > 0,
        reason: 'Keine Einheit gewählt',
        action: () => this.startAttackMove(),
      }),
      entry('Stopp', 'S', {
        tip: 'Gewählte Einheiten anhalten (S)',
        enabled: units.length > 0,
        reason: 'Keine Einheit gewählt',
        action: () => this.stop(),
      }),
    );
    const riders = units.filter((u) => u.def.canRide);
    if (riders.length) {
      card.push(
        entry('Einsteigen', 'I', {
          tip: 'Einsteigen (I): danach LKW, Baufahrzeug, Schützenpanzer oder Transporthubschrauber anklicken (oder Rechtsklick auf das Fahrzeug)',
          action: () => this.setMode('board'),
        }),
      );
    }
    const trucks = units.filter(isCarrier);
    if (trucks.length) {
      card.push(
        entry('Laden', 'L', {
          tip: 'Laden (L): LKW fährt zur eigenen FOB und lädt; FOB anklicken',
          action: () => this.startTruckMode('loadFob'),
        }),
        entry('Entladen', 'U', {
          tip: 'Entladen (U): eigene FOB oder FOB-Baustelle anklicken',
          action: () => this.startTruckMode('unloadFob'),
        }),
        entry('Pendeln', 'T', {
          tip: 'Pendeln (T): Start-FOB, dann Ziel-FOB anklicken',
          action: () => this.startTruckMode('routeFrom'),
        }),
      );
      for (const [preset, key, label, long] of PRESET_BTN) {
        card.push(
          entry(label, key, {
            tip: `Ladungsart ${long} (${key})`,
            active: trucks.every((t) => t.preset === preset),
            action: () => this.issue({ type: 'setPreset', ids: trucks.map((t) => t.id), preset }),
          }),
        );
      }
    }
    const helis = units.filter((u) => u.def.seats > 0);
    if (helis.length) {
      card.push(
        entry('Absetzen', 'O', {
          tip: 'Passagiere absetzen (O): Zielpunkt anklicken. Einsteigen: Infanterie wählen, Einsteigen (I) oder Rechtsklick auf das Fahrzeug.',
          enabled: helis.some((h) => h.passengers.length > 0),
          reason: 'Keine Passagiere an Bord',
          action: () => this.setMode('dropoff'),
        }),
      );
    }
    return card;
  }

  buildingCard(blds) {
    const card = [];
    const types = [];
    for (const b of blds) {
      for (const u of b.produces) if (!types.includes(u)) types.push(u);
    }
    for (const u of types) {
      const def = UNITS[u];
      const producers = blds.filter((b) => b.produces.includes(u));
      const ready = producers.find((b) => b.built && b.queue.length < BALANCE.queueMax);
      let reason = '';
      if (!producers.some((b) => b.built)) reason = 'Gebäude ist noch im Bau';
      else if (!ready) reason = 'Warteschlange ist voll';
      else reason = this.trainReason(ready, def.cost);
      card.push(
        entry(SHORT_UNIT[u] || def.name, def.hotkey, {
          cost: costText(def.cost),
          tip: `${def.name}: ${longCost(def.cost)}`,
          enabled: !reason,
          reason,
          action: () => this.train(u),
        }),
      );
    }
    const mortars = blds.filter((b) => b.built && b.def.weapon && b.def.weapon.shell);
    if (mortars.length) {
      card.push(
        entry('Ziel wählen', 'G', {
          tip: 'Mörser-Ziel (G): Punkt anklicken oder Rechtsklick. Schießt alle 20 s, solange die FOB Munition hat.',
          action: () => this.setMode('mortarTarget'),
        }),
        entry('Ziel löschen', 'C', {
          tip: 'Gewähltes Ziel löschen (C): Mörser feuert wieder automatisch',
          enabled: mortars.some((b) => b.fireTarget),
          reason: 'Kein Ziel gewählt',
          action: () => this.issue({ type: 'mortarTarget', ids: mortars.map((b) => b.id) }),
        }),
      );
    }
    const drills = blds.filter((b) => b.built && b.drill);
    if (drills.length) {
      const ready = drills.filter((b) => b.drill.state === 'ready');
      card.push(
        entry('Aktivieren', 'G', {
          tip: 'Bohrer aktivieren (G): 2 min aktiv, braucht Treibstoff aus der FOB, zieht die Hot Zone an; danach 5 min Pause',
          enabled: ready.length > 0,
          reason: drills.some((b) => b.drill.state === 'active') ? 'Bohrer läuft bereits' : 'Bohrer wärmt auf oder kühlt ab',
          action: () => this.issue({ type: 'drill', ids: ready.map((b) => b.id) }),
        }),
      );
    }
    card.push(
      entry('Abbruch', null, {
        tip: 'Letzten Auftrag abbrechen (Kosten werden erstattet)',
        enabled: blds.some((b) => b.queue.length > 0),
        reason: 'Nichts in der Warteschlange',
        action: () => this.cancelTrain(),
      }),
    );
    card.push(
      entry('Abreißen', 'Entf', {
        tip: 'Gebäude abreißen (25 % des Baumaterials zurück)',
        action: () => this.demolish(),
      }),
    );
    return card;
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

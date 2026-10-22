// Spieler-Steuerung (PLAN §5 ui/controller.js): Auswahl, Modi, Befehle und Befehlskarte. Kein DOM.
// Hält den Ansichtszustand `view`, den renderer.render(view) liest. Befehle laufen nur über game.issue.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';

const WALL_MAX = 40; // max. Zellen je Mauerzug (Vorschau und Befehl)
const DOUBLE_MS = 350; // Doppelklick auf einen Typ = alle dieses Typs im Bild
const GROUP_DOUBLE_MS = 500; // Gruppentaste zweimal = Kamera hin
const PICK_PX = 16; // Trefferradius in Bildschirm-Pixeln
const TARGET_MODES = ['place', 'wall', 'attackMove', 'fobTarget'];
const BUILD_MENU = Object.keys(BUILDINGS).filter((k) => BUILDINGS[k].hotkey && BUILDINGS[k].buildable !== false);
const RES_KEYS = ['money', 'bm', 'mun', 'fuel'];
const SHORT = { money: 'G', bm: 'BM', mun: 'MUN', fuel: 'TS' };
const HOTKEY_ALIAS = { Y: 'Z' }; // Flugabwehr auch mit Y
// Kurznamen für die Befehlskarte (der volle Name steht im Tooltip)
const SHORT_BLD = { depot: 'Halle', extractor: 'Förder­anlage', wall: 'Mauer', gate: 'Tor', mortar: 'Mörser', aa: 'Flak' };
const SHORT_UNIT = { rifleman: 'Schütze', at: 'PAK', truck: 'LKW', ifv: 'SPz', tank: 'KPz' };

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

/** Kosten kurz für Schaltflächen: "400 BM". */
export function costText(cost) {
  return RES_KEYS.filter((k) => cost[k]).map((k) => `${cost[k]} ${SHORT[k]}`).join(' · ');
}

function longCost(cost) {
  return RES_KEYS.filter((k) => cost[k]).map((k) => `${cost[k]} ${BALANCE.resNames[k]}`).join(', ');
}

/** "Fehlt: 120 Munition" oder "" wenn das Team alles bezahlen kann. */
export function shortage(game, team, cost) {
  const res = game.teams[team].res;
  const miss = RES_KEYS.filter((k) => (cost[k] || 0) > (res[k] || 0)).map(
    (k) => `${Math.ceil(cost[k] - res[k])} ${BALANCE.resNames[k]}`,
  );
  return miss.length ? `Fehlt: ${miss.join(', ')}` : '';
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
    for (const e of this.game.query(wx, wy, 0, (e) => e.kind === 'building' && pred(e))) return e;
    return null;
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
    const a = cam.screenToWorld(Math.min(rect.x1, rect.x2), Math.min(rect.y1, rect.y2));
    const b = cam.screenToWorld(Math.max(rect.x1, rect.x2), Math.max(rect.y1, rect.y2));
    const units = this.game.units.filter(
      (u) => u.alive && u.team === this.team && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y,
    );
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
  leftClickWorld(wx, wy, shift) {
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

  /** Rechtsklick: Bewegen, Angriff (auf Gegner) oder Sammelpunkt (nur Gebäude gewählt). */
  rightClick(wx, wy) {
    const sel = this.selected();
    if (!sel.length) return;
    const units = sel.filter((e) => e.kind === 'unit');
    if (units.length) {
      const target = this.pick(wx, wy, (e) => e.team !== this.team && this.game.isVisible(this.team, e.x, e.y));
      const ids = units.map((u) => u.id);
      if (target) {
        this.issue({ type: 'attack', ids, targetId: target.id });
        return;
      }
      if (this.issue({ type: 'move', ids, x: wx, y: wy }).ok) this.moveMarker(wx, wy);
      return;
    }
    const producers = sel.filter((e) => e.def.produces.length > 0);
    for (const b of producers) this.issue({ type: 'rally', buildingId: b.id, x: wx, y: wy });
    if (producers.length) this.moveMarker(wx, wy);
  }

  moveMarker(x, y) {
    this.view.moveMarker = { x, y, t: performance.now() };
  }

  confirmPlace(wx, wy, shift) {
    const type = this.placeType;
    if (!type) return;
    const r = this.issue({ type: 'build', building: type, x: wx, y: wy });
    if (!r.ok) return;
    if (shift) this.updatePointer(wx, wy);
    else this.setMode('normal');
  }

  confirmAttackMove(wx, wy, shift) {
    const ids = this.selected().filter((e) => e.kind === 'unit').map((e) => e.id);
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

  confirmFob(wx, wy, shift) {
    const truck = this.selected().find((e) => e.kind === 'unit' && e.type === 'truck');
    if (!truck) {
      this.message('Kein LKW gewählt');
      this.setMode('normal');
      return;
    }
    const r = this.issue({ type: 'buildFob', truckId: truck.id, x: wx, y: wy });
    if (!r.ok) return;
    this.moveMarker(wx, wy);
    if (shift) this.updatePointer(wx, wy);
    else this.setMode('normal');
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

  /** Maus losgelassen im Modus wall: Mauerzug bauen. */
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
      x1: g.center(start.c),
      y1: g.center(start.r),
      x2: g.center(end.c),
      y2: g.center(end.r),
    });
    if (r.ok && !shift) this.setMode('normal');
    else if (this.pointer) this.updatePointer(this.pointer.x, this.pointer.y);
  }

  placementFor(type, wx, wy) {
    const p = this.game.canPlace(this.team, type, wx, wy);
    return {
      type,
      x: Number.isFinite(p.x) ? p.x : wx,
      y: Number.isFinite(p.y) ? p.y : wy,
      ok: p.ok,
      reason: p.ok ? null : p.reason,
    };
  }

  wallPreview(wx, wy) {
    const g = this.game.grid;
    const cur = { c: g.toCell(wx), r: g.toCell(wy) };
    const cells = this.wall ? wallLine(this.wall, cur) : [cur];
    const cost = BUILDINGS.wall.cost;
    const affordable = this.game.canAfford(this.team, cost);
    const short = shortage(this.game, this.team, cost);
    const list = cells.map(({ c, r }) => {
      const p = this.game.canPlace(this.team, 'wall', g.center(c), g.center(r));
      return { cx: c, cy: r, ok: p.ok && affordable, reason: p.ok ? null : p.reason };
    });
    const ok = list.some((x) => x.ok);
    const firstReason = list.find((x) => x.reason)?.reason || null;
    const reason = ok ? null : affordable ? firstReason : short;
    return { type: 'wall', x: wx, y: wy, ok, reason, cells: list };
  }

  /** Vorschau aktualisieren: Hover-Ziel, Platzierung, Mauerzug. Wird bei jeder Mausbewegung gerufen. */
  updatePointer(wx, wy) {
    this.pointer = { x: wx, y: wy };
    const hover = this.pick(wx, wy, (e) => e.team === this.team || this.game.isVisible(this.team, e.x, e.y));
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

  startBuildMenu() {
    this.setMode('build');
  }

  startAttackMove() {
    if (!this.selected().some((e) => e.kind === 'unit')) {
      this.message('Keine Einheit gewählt');
      return;
    }
    this.setMode('attackMove');
  }

  startFobTarget() {
    if (!this.selected().some((e) => e.kind === 'unit' && e.type === 'truck')) {
      this.message('Kein LKW gewählt');
      return;
    }
    this.setMode('fobTarget');
    if (this.pointer) this.updatePointer(this.pointer.x, this.pointer.y);
  }

  stop() {
    const ids = this.selected().filter((e) => e.kind === 'unit').map((e) => e.id);
    if (ids.length) this.issue({ type: 'stop', ids });
    this.setMode('normal');
  }

  /** Ausbildung auf allen gewählten fertigen Gebäuden, die diesen Typ bauen. */
  train(unit) {
    const producers = this.selected().filter((e) => e.kind === 'building' && e.built && e.def.produces.includes(unit));
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
    switch (this.view.mode) {
      case 'build':
        return 'Gebäude wählen';
      case 'place':
        return `${BUILDINGS[this.placeType]?.name || 'Gebäude'}: Klick baut · Rechtsklick oder Esc bricht ab · Shift = mehrfach`;
      case 'wall':
        return `Mauer: Maus gedrückt halten und ziehen (max. ${WALL_MAX} Zellen)`;
      case 'attackMove':
        return 'Angriffsbewegung: Ziel anklicken · Esc bricht ab';
      case 'fobTarget':
        return 'FOB-Standort anklicken, der LKW fährt hin · Esc bricht ab';
      default:
        return '';
    }
  }

  /** Befehlskarte für Auswahl bzw. Modus. Einträge: { label, hotkey, cost, tip, enabled, reason, action }. */
  commandCard() {
    const m = this.view.mode;
    if (TARGET_MODES.includes(m)) {
      return [entry('Abbruch', 'Esc', { tip: 'Abbrechen (Esc)', action: () => this.cancel() })];
    }
    if (m === 'build') return this.buildCard();
    return this.selectionCard();
  }

  buildCard() {
    const card = BUILD_MENU.map((key) => {
      const def = BUILDINGS[key];
      const short = shortage(this.game, this.team, def.cost);
      return entry(SHORT_BLD[key] || def.name, def.hotkey, {
        cost: costText(def.cost),
        tip: `${def.name}: ${longCost(def.cost)}`,
        enabled: !short,
        reason: short,
        action: () => this.beginPlacement(key),
      });
    });
    card.push(entry('Zurück', 'Esc', { tip: 'Zurück zu den Befehlen (Esc)', action: () => this.cancel() }));
    return card;
  }

  selectionCard() {
    const sel = this.selected();
    const units = sel.filter((e) => e.kind === 'unit');
    const blds = sel.filter((e) => e.kind === 'building');
    if (!units.length && blds.length) return this.buildingCard(blds);

    const card = [
      entry('Bauen', 'B', { tip: 'Baumenü öffnen (B)', action: () => this.startBuildMenu() }),
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
    ];
    const trucks = units.filter((u) => u.type === 'truck');
    if (trucks.length) {
      const cost = BUILDINGS.fob.cost;
      const short = shortage(this.game, this.team, cost);
      card.push(
        entry('FOB errichten', 'F', {
          cost: costText(cost),
          tip: `FOB errichten (F): ${longCost(cost)}`,
          enabled: !short,
          reason: short,
          action: () => this.startFobTarget(),
        }),
      );
    }
    return card;
  }

  buildingCard(blds) {
    const card = [];
    const types = [];
    for (const b of blds) {
      for (const u of b.def.produces) if (!types.includes(u)) types.push(u);
    }
    for (const u of types) {
      const def = UNITS[u];
      const producers = blds.filter((b) => b.def.produces.includes(u));
      let reason = '';
      if (!producers.some((b) => b.built)) reason = 'Gebäude ist noch im Bau';
      else if (!producers.some((b) => b.built && b.queue.length < BALANCE.queueMax)) reason = 'Warteschlange ist voll';
      else reason = shortage(this.game, this.team, def.cost);
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

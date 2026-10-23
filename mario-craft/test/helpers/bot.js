// Spieltest-Bot mit echter Physik (PLAN §11, Aufgabe D5).
// Wegfindung auf Kachelebene: Knoten = Ruhekachel (Spalte c, Fuß-Zeile f), Kanten = Makros, die gegen die echte
// Spielerphysik (updatePlayer auf einer Kopie) simuliert werden: gehen/fallen, springen, Leiter hoch/runter und
// seitlich verlassen, Graben (neben/unter sich). Der Controller führt dieselben Makros mit denselben Eingaben im
// echten Spiel aus (Ausrichten auf Kachelmitte → Graben → Bewegung) und plant bei Abweichung neu.
// Nutzung: playLevel(levelDef, { maxTime: 300, lives: 99, power: 'bow' }) → Ergebnis mit won/time/diag.
import { PHYS } from '../../js/data/physics.js';
import { TILE_BY_ID, PICKS } from '../../js/data/tiles.js';
import { Game } from '../../js/game/game.js';
import { createPlayer, updatePlayer } from '../../js/game/player.js';

const T = PHYS.tile;
const DT = PHYS.step;
const E = 1e-6;
const SETTLE_X = 2.5;
const FIRE_CD = 0.5;
const PATH_CAP = 400000;                 // maximale Knotenentnahmen je Suche

// Sprungvarianten: delay = Wartezeit bis zur Seitwärtsbewegung, hold = Haltezeit der Sprungtaste.
const JUMP_VARIANTS = [
  { delay: 0, hold: 1 }, { delay: 0.2, hold: 1 }, { delay: 0.35, hold: 1 },
  { delay: 0, hold: 0.22 }, { delay: 0.1, hold: 0.3 }, { delay: 0, hold: 0.4 },
];
const EXIT_OFFSETS = [0.7, 2.5];

const dy = (m, cy) => m.y + m.h / 2 - cy;

const FRESH = () => ({
  left: false, right: false, jump: false, dig: false, fire: false,
  jumpPressed: false, digPressed: false, firePressed: false,
});

function resetInput(i) {
  i.left = i.right = i.jump = i.dig = i.fire = false;
  i.jumpPressed = i.digPressed = i.firePressed = false;
  return i;
}

// ---------- Steuerung (identisch in Simulation und Spiel) ----------

// Seitwärts zur Zielmitte tx: bremsen, wenn der Bremsweg reicht.
function steer(p, tx) {
  const cx = p.x + p.w / 2;
  const err = tx - cx;
  const v = p.vx;
  const rest = p.onGround || p.climbing;
  const decel = rest ? PHYS.decel : PHYS.decel * PHYS.airAccelMult;
  const stop = (v * Math.abs(v)) / (2 * decel);
  if (Math.abs(err) < 1.0 && Math.abs(v) < 10) return 0;
  if (v * err > 0 && Math.abs(stop) >= Math.abs(err) - 0.5) return 0;
  return err > 0 ? 1 : -1;
}

function setDir(inp, dir) {
  inp.left = dir < 0;
  inp.right = dir > 0;
}

// Ein Makro-Schritt VOR dem Physikschritt. Rückgabe: 0 läuft, 1 fertig, -1 gescheitert.
// m.kind: 'move' (gehen/springen), 'climb' (Leiter eine Zeile), 'exit' (Leiter seitlich verlassen).
function drive(m, s, p, inp) {
  const cx = p.x + p.w / 2;
  const t = s.n * DT;
  const rest = p.onGround || p.climbing;
  resetInput(inp);

  if (m.kind === 'move') {
    if (s.n > 0) {
      if (!rest) s.air = true;
      if (rest && Math.abs(p.vx) < 6 && Math.abs(cx - m.tx) < (m.tol || SETTLE_X) && (!m.needAir || s.air)) return 1;
      if (t > m.timeout) return -1;
    }
    if (m.jump) {
      inp.jumpPressed = s.n === 0;
      inp.jump = t < m.hold;
    }
    if (p.inWater && m.swim && !p.onGround && p.vy >= 0 && s.n % 24 === 3) {
      inp.jumpPressed = true;
      inp.jump = true;
    }
    if (t >= m.delay) setDir(inp, steer(p, m.tx));
    s.n++;
    return 0;
  }

  if (m.kind === 'climb') {
    const f = Math.floor((p.y + p.h - E) / T);
    if (s.n > 0 && (p.climbing || p.onGround) && f === m.toF) return 1;
    if (t > m.timeout) return -1;
    if (m.up) inp.jump = true;
    else inp.dig = true;
    if (Math.abs(cx - m.tx) > 1) setDir(inp, steer(p, m.tx));
    s.n++;
    return 0;
  }

  if (m.kind === 'exit') {
    if (t > m.timeout) return -1;
    const yf = p.y + p.h;
    if (s.phase === 0) {
      if (yf > m.yT + 0.3) inp.jump = true;
      else if (yf < m.yT - 4) inp.dig = true;
      else { s.phase = 1; s.n1 = 0; }
      if (s.phase === 0) {
        if (Math.abs(cx - m.tx0) > 1) setDir(inp, steer(p, m.tx0));
        s.n++;
        return 0;
      }
    }
    // Phase 1: seitlich weg, Sprungtaste kurz halten, bis gelandet und ruhig.
    if (s.n1 > 1 && p.onGround && Math.abs(p.vx) < 6 && Math.abs(cx - m.tx) < SETTLE_X) return 1;
    inp.jump = s.n1 * DT < 0.12;
    setDir(inp, steer(p, m.tx));
    s.n1++;
    s.n++;
    return 0;
  }
  return -1;
}

// ---------- Hilfen auf der Karte ----------

class Bot {
  constructor(game, opts = {}) {
    this.game = game;
    this.map = game.map;
    this.cols = game.map.cols;
    this.rows = game.map.rows;
    this.opts = opts;
    this.inp = FRESH();
    this.cache = new Map();          // Knoten → Kanten
    this.snap = new Uint8Array(game.map.tiles);
    this.blk = new Set();            // gesperrte Kanten (Schlüssel|Kanten-ID)
    this.cur = null;                 // laufende Kante
    this.path = null;
    this.fireCd = 0;
    this.diag = { blocked: [], noPath: [], deaths: [], notes: [] };
    this.noPathCount = 0;
    this.failed = false;
    this.lastState = 'play';
    this.chestsTried = new Set();
    this.goalCache = null;
    this.useCount = new Map();
    this.deathCause = null;
    this.combatT = 0;
    this.combatCool = 0;
    this.simCount = 0;
  }

  // ----- Kacheleigenschaften -----
  info(c, r) { return TILE_BY_ID[this.map.get(c, r)]; }
  solidAt(c, r) { return this.info(c, r).solid; }
  freeAt(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    const t = this.info(c, r);
    return !t.solid && !t.hazard;
  }
  groundAt(c, r) {
    if (c < 0 || c >= this.cols || r < 0) return true;
    if (r >= this.rows) return false;
    const t = this.info(c, r);
    return t.solid || t.oneWay;
  }
  ladderAt(c, f) {
    return (f >= 0 && f < this.rows && this.info(c, f).climb) || (f - 1 >= 0 && f - 1 < this.rows && this.info(c, f - 1).climb);
  }
  valid(c, f) {
    if (c < 0 || c >= this.cols || f < 1 || f >= this.rows) return false;
    if (!this.freeAt(c, f) || !this.freeAt(c, f - 1)) return false;
    return this.groundAt(c, f + 1) || this.ladderAt(c, f);
  }
  diggable(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    const t = this.info(c, r);
    // TNT (zündet) und befallene Blöcke (Silberfischchen) rührt der Bot nicht an.
    return t.solid && t.hard !== null && t.minPick <= this.game.pick && t.drop !== 'tnt' && t.drop !== 'silverfish';
  }
  digTime(c, r) {
    const t = this.info(c, r);
    return t.hard * PICKS[this.game.pick].mult;
  }
  key(c, f) { return f * this.cols + c; }
  cOf(key) { return key % this.cols; }
  fOf(key) { return Math.floor(key / this.cols); }
  center(c) { return (c + 0.5) * T; }

  nodeOf(p) {
    return { c: Math.floor((p.x + p.w / 2) / T), f: Math.floor((p.y + p.h - E) / T) };
  }

  // ----- Simulation -----
  simView(overlay) {
    const base = this.map;
    if (!overlay) return base;
    return { get: (c, r) => (overlay.has(r * this.cols + c) ? 0 : base.get(c, r)), cols: base.cols, rows: base.rows };
  }

  lethal(p, map) {
    if (p.y > this.rows * T + 16) return true;
    const c = Math.floor((p.x + p.w / 2) / T);
    const feet = Math.floor((p.y + p.h - E) / T);
    const head = Math.floor((p.y + 4) / T);
    return TILE_BY_ID[map.get(c, feet)].hazard || TILE_BY_ID[map.get(c, head)].hazard;
  }

  // Startzustand für Knoten (c, f). null, wenn kein Ruhezustand.
  simPlayer(c, f) {
    const p = createPlayer(this.center(c), (f + 1) * T, this.game.player.power);
    if (this.groundAt(c, f + 1)) {
      p.onGround = true;
      p.coyote = PHYS.coyote;
    } else if (this.ladderAt(c, f)) {
      p.climbing = true;
      p.y -= 1;
    } else return null;
    return p;
  }

  // Simuliert Makro m ab Knoten (c, f). Ergebnis { c, f, t } oder null.
  sim(c, f, m, overlay) {
    this.simCount++;
    const p = this.simPlayer(c, f);
    if (!p) return null;
    const view = this.simView(overlay);
    const sg = { player: p, map: view, emit() {} };
    const inp = FRESH();
    const s = { n: 0, air: false, phase: 0, n1: 0 };
    for (let i = 0; i < 600; i++) {
      const st = drive(m, s, p, inp);
      if (st === 1) {
        const n = this.nodeOf(p);
        return { c: n.c, f: n.f, t: s.n * DT };
      }
      if (st < 0) return null;
      updatePlayer(sg, DT, inp);
      if (this.lethal(p, view)) return null;
    }
    return null;
  }

  // ----- Kanten -----
  edgesOf(key) {
    let list = this.cache.get(key);
    if (!list) {
      list = this.genEdges(this.cOf(key), this.fOf(key));
      this.cache.set(key, list);
    }
    return list;
  }

  genEdges(c, f) {
    const out = [];
    if (!this.valid(c, f)) return out;
    const key = this.key(c, f);
    const grounded = this.groundAt(c, f + 1);
    const onLadder = this.ladderAt(c, f);
    const add = (e) => {
      if (e.to === key) return;
      const dup = out.findIndex((x) => x.to === e.to && x.type === e.type);
      if (dup >= 0) {
        if (out[dup].cost <= e.cost) return;
        out.splice(dup, 1);
      }
      out.push(e);
    };
    const move = (tx, extra = {}) => ({ kind: 'move', tx, jump: false, hold: 0, delay: 0, needAir: false, timeout: 4, ...extra });

    if (grounded) {
      for (const d of [-1, 1]) {
        const nc = c + d;
        // gehen / fallen
        const mv = move(this.center(nc));
        const r = this.sim(c, f, mv);
        if (r) add({ id: `w${d}`, type: 'walk', dir: d, to: this.key(r.c, r.f), cost: r.t + 0.02, macro: mv, align: false, digs: null });
        // seitlich graben und hineingehen
        if (!onLadder) {
          const cells = [];
          let ok = true;
          for (const rr of [f, f - 1]) {
            if (this.solidAt(nc, rr)) {
              if (this.diggable(nc, rr)) cells.push([nc, rr]); else ok = false;
            } else if (this.info(nc, rr).hazard) ok = false;
          }
          if (ok && cells.length) {
            const ov = new Set(cells.map(([cc, rr]) => rr * this.cols + cc));
            const r2 = this.sim(c, f, mv, ov);
            if (r2) {
              const dt = cells.reduce((a, [cc, rr]) => a + this.digTime(cc, rr), 0);
              add({ id: `d${d}`, type: 'dig', dir: d, to: this.key(r2.c, r2.f), cost: r2.t + dt + 0.2, macro: mv, align: true, digs: cells });
            }
          }
        }
      }
      // nach unten graben
      if (!onLadder && this.diggable(c, f + 1) && !this.info(c, f + 1).oneWay) {
        const ov = new Set([(f + 1) * this.cols + c]);
        const mv = move(this.center(c), { needAir: true, timeout: 5 });
        const r = this.sim(c, f, mv, ov);
        if (r) add({ id: 'dd', type: 'dig', dir: 0, to: this.key(r.c, r.f), cost: r.t + this.digTime(c, f + 1) + 0.2, macro: mv, align: true, digs: [[c, f + 1]] });
      }
      // Sprünge zu Zielen, die man nicht gehen kann
      this.genJumps(c, f, out, add, move);
    }

    if (onLadder) {
      if (this.ladderAt(c, f - 1) && this.valid(c, f - 1)) {
        const m = { kind: 'climb', up: true, toF: f - 1, tx: this.center(c), timeout: 1.5 };
        add({ id: 'cu', type: 'climb', to: this.key(c, f - 1), cost: T / 70 + 0.02, macro: m, align: true, digs: null });
      }
      if (this.ladderAt(c, f + 1) && this.valid(c, f + 1)) {
        const m = { kind: 'climb', up: false, toF: f + 1, tx: this.center(c), timeout: 1.5 };
        add({ id: 'cd', type: 'climb', to: this.key(c, f + 1), cost: T / 70 + 0.02, macro: m, align: true, digs: null });
      }
      // seitlich verlassen
      for (const d of [-1, 1]) {
        const nc = c + d;
        for (let ft = f - 4; ft <= f + 2; ft++) {
          if (!this.valid(nc, ft) || !this.groundAt(nc, ft + 1)) continue;
          if (!this.ladderAt(c, ft) && !this.ladderAt(c, ft + 1)) continue;
          let clear = true;
          for (let r = Math.min(f, ft); r <= Math.max(f, ft); r++) if (!this.freeAt(c, r) || !this.freeAt(c, r - 1)) clear = false;
          if (!clear) continue;
          for (const off of EXIT_OFFSETS) {
            const m = { kind: 'exit', dir: d, yT: (ft + 1) * T - off, tx0: this.center(c), tx: this.center(nc), timeout: 3 };
            const r = this.sim(c, f, m);
            if (r) {
              add({ id: `x${d}_${ft}_${off}`, type: 'exit', dir: d, to: this.key(r.c, r.f), cost: r.t + 0.1, macro: m, align: true, digs: null });
              break;
            }
          }
        }
      }
    }
    return out;
  }

  genJumps(c, f, out, add, move) {
    for (const s of [-1, 1]) {
      for (let n = 0; n <= 5; n++) {
        if (n === 0 && s < 0) continue;
        const nc = c + s * n;
        for (let ft = f - 4; ft <= f + 2; ft++) {
          if (!this.valid(nc, ft) || !this.groundAt(nc, ft + 1)) continue;
          const bounce = this.info(nc, ft + 1).bounce;
          if (n === 0 && !(bounce && ft === f)) continue;
          // gehbar? (ebene, lückenlos); Schleimblöcke schleudern nur nach Sprung/Fall
          if (ft === f && !bounce) {
            let walkable = true;
            for (let i = 1; i <= n; i++) if (!this.valid(c + s * i, f) || !this.groundAt(c + s * i, f + 1)) walkable = false;
            if (walkable) continue;
          }
          for (const v of JUMP_VARIANTS) {
            const mv = move(this.center(nc), { jump: true, hold: v.hold, delay: v.delay, needAir: true, timeout: 3, swim: true });
            const r = this.sim(c, f, mv);
            if (!r) continue;
            add({ id: `j${s}_${n}_${ft}_${v.delay}_${v.hold}`, type: 'jump', dir: s, to: this.key(r.c, r.f), cost: r.t + 0.15, macro: mv, align: true, digs: null });
            if (r.c === nc && r.f === ft) break;
          }
        }
      }
    }
  }

  // ----- Suche (A*) -----
  goalNodeFn(game) {
    const g = game.map.goal;
    const gc = Math.floor(g.x / T), gr = Math.round(g.y / T) - 1;
    return {
      gc,
      test: (key) => {
        const c = this.cOf(key), f = this.fOf(key);
        return Math.abs(c - gc) <= 1 && f >= gr - 2 && f <= gr + 1;
      },
    };
  }

  search(startKey, goal) {
    const open = [];
    const g = new Map([[startKey, 0]]);
    const par = new Map();
    const push = (k, fv) => {
      open.push([fv, k]);
      let i = open.length - 1;
      while (i > 0) {
        const pI = (i - 1) >> 1;
        if (open[pI][0] <= open[i][0]) break;
        [open[pI], open[i]] = [open[i], open[pI]];
        i = pI;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop();
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          let l = 2 * i + 1, r = l + 1, m = i;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };
    const h = (k) => (Math.abs(this.cOf(k) - goal.gc) * T) / 160;
    push(startKey, h(startKey));
    const closed = new Set();
    let pops = 0;
    while (open.length && pops++ < PATH_CAP) {
      const [, k] = pop();
      if (closed.has(k)) continue;
      closed.add(k);
      if (goal.test(k)) {
        const edges = [];
        let cur = k;
        while (cur !== startKey) {
          const pr = par.get(cur);
          edges.push(pr.edge);
          cur = pr.from;
        }
        edges.reverse();
        return edges;
      }
      for (const e of this.edgesOf(k)) {
        if (this.blk.has(`${k}|${e.id}`)) continue;
        const ng = g.get(k) + e.cost;
        if (ng < (g.get(e.to) ?? Infinity)) {
          g.set(e.to, ng);
          par.set(e.to, { from: k, edge: Object.assign({}, e, { from: k }) });
          push(e.to, ng + h(e.to));
        }
      }
    }
    return null;
  }

  // Karte hat sich geändert → Kanten in der Nähe verwerfen.
  syncMap() {
    const t = this.map.tiles, sn = this.snap;
    let changed = null;
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== sn[i]) {
        (changed ||= []).push(i % this.cols);
        sn[i] = t[i];
      }
    }
    if (!changed) return;
    this.goalCache = null;
    for (const key of [...this.cache.keys()]) {
      const c = this.cOf(key);
      if (changed.some((cc) => Math.abs(cc - c) <= 7)) this.cache.delete(key);
    }
  }

  // ----- Steuerung -----
  chestGoal(game) {
    // Hacken-Truhen, die noch geschlossen sind und besser als die eigene Hacke.
    const order = { pick_stone: 1, pick_iron: 2, pick_diamond: 3 };
    const out = [];
    for (const [k, kind] of Object.entries(game.map.chests)) {
      const v = order[kind];
      if (!v || v <= game.pick) continue;
      const [cc, cr] = k.split(',').map(Number);
      if (game.map.get(cc, cr) !== 23) continue;
      out.push({ cc, cr, v });
    }
    return out;
  }

  planFrom(node) {
    const game = this.game;
    const startKey = this.key(node.c, node.f);
    const goal = this.goalNodeFn(game);
    let path = this.search(startKey, goal);
    if (path) return { path, finalDig: null };
    // Ziel unerreichbar: Hacken-Truhen anfahren
    for (const ch of this.chestGoal(game)) {
      const tag = `${ch.cc},${ch.cr},${game.pick}`;
      if (this.chestsTried.has(tag)) continue;
      const cg = {
        gc: ch.cc,
        test: (key) => {
          const c = this.cOf(key), f = this.fOf(key);
          if ((c === ch.cc - 1 || c === ch.cc + 1) && (f === ch.cr || f === ch.cr + 1)) return true;
          return c === ch.cc && f + 1 === ch.cr;
        },
      };
      path = this.search(startKey, cg);
      if (path) return { path, finalDig: ch, tag };
    }
    return null;
  }

  idle() {
    return resetInput(this.inp);
  }

  // Pfeil schießen, wenn ein Gegner in Blickrichtung auf ähnlicher Höhe in Reichweite ist.
  fire(inp) {
    const g = this.game, p = g.player;
    if (this.fireCd > 0) { this.fireCd -= DT; return; }
    if (p.power !== 'bow') return;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const face = p.face < 0 ? -1 : 1;
    for (const m of g.mobs) {
      if (m.dead || !m.active) continue;
      const dx = m.x + m.w / 2 - cx;
      if (Math.abs(dy(m, cy)) < 24 && dx * face > 12 && Math.abs(dx) < 170) {
        inp.firePressed = true;
        inp.fire = true;
        this.fireCd = 0.35;
        return;
      }
    }
  }

  // Über nahe Gegner (ohne Bogen) und anfliegende Pfeile hüpfen; Landen auf Gegnern ist ein Stampfer.
  hop(inp) {
    const g = this.game, p = g.player;
    if (!p.onGround || p.climbing) return;
    if (this.cur && !(this.cur.edge.type === 'walk' && this.cur.stage === 'move') && this.cur.stage !== 'align') return;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const face = p.face < 0 ? -1 : 1;
    if (p.power !== 'bow') {
      for (const m of g.mobs) {
        if (m.dead || !m.active || m.flies) continue;
        const dx = m.x + m.w / 2 - cx;
        if (Math.abs(dy(m, cy)) < 20 && dx * face > 4 && dx * face < 44) {
          inp.jumpPressed = true;
          inp.jump = true;
          return;
        }
      }
    }
    // Gegnerische Pfeile/Geschosse im Anflug: überspringen.
    for (const o of g.projectiles) {
      if (!o.active || o.type === 'arrow' || o.stuck) continue;
      const dx = o.x + o.w / 2 - cx;
      if (dx * o.vx < 0 && Math.abs(dx) < 60 && Math.abs(o.y + o.h / 2 - cy) < 16) {
        inp.jumpPressed = true;
        inp.jump = true;
        return;
      }
    }
  }

  blockEdge(e, why) {
    this.blk.add(`${e.from}|${e.id}`);
    const c = this.cOf(e.from), f = this.fOf(e.from);
    this.diag.blocked.push({ c, f, edge: e.id, type: e.type, why, to: [this.cOf(e.to), this.fOf(e.to)] });
  }

  // Ein Schritt des Controllers; liefert das Eingabeobjekt.
  next() {
    const game = this.game;
    const p = game.player;
    const inp = this.idle();
    if (game.state !== 'play') {
      if (this.lastState === 'play' && game.state === 'dying') {
        const n = this.nodeOf(p);
        const cause = this.deathCause;
        if (this.cur && (cause === 'lava' || cause === 'fall')) this.blockEdge(this.cur.edge, `Tod (${cause})`);
        this.diag.deaths.push({ c: n.c, f: n.f, t: +game.time.toFixed(1), cause });
        this.cur = null;
        this.path = null;
      }
      this.lastState = game.state;
      return inp;
    }
    this.lastState = 'play';

    if (!this.cur) {
      const rest = p.onGround || p.climbing;
      if (!rest) { this.fire(inp); return inp; }
      if (Math.abs(p.vx) > 40 && !p.climbing) { this.fire(inp); return inp; }
      this.syncMap();
      const node = this.nodeOf(p);
      const key = this.key(node.c, node.f);
      if (!this.valid(node.c, node.f)) {
        // Zustand ohne Kante (z. B. Wasser, schräg): kurz nichts tun / Richtung zum Ziel
        this.diag.notes.push(`ungültiger Knoten ${node.c},${node.f} t=${game.time.toFixed(1)}`);
        if (this.diag.notes.length > 20) this.failed = true;
        this.fire(inp);
        return inp;
      }
      let plan = this.path && this.path.edges.length && this.path.edges[0].from === key ? this.path : null;
      if (!plan) {
        const res = this.planFrom(node);
        if (!res) {
          this.noPathCount++;
          this.diag.noPath.push({ c: node.c, f: node.f, t: +game.time.toFixed(1) });
          if (this.noPathCount > 3) this.failed = true;
          this.cache.clear();
          return inp;
        }
        this.noPathCount = 0;
        plan = { edges: res.path, finalDig: res.finalDig, tag: res.tag };
        this.path = plan;
      }
      if (!plan.edges.length) {
        // am Ziel (Truhe): jetzt graben
        if (plan.finalDig) this.startChestDig(plan.finalDig, node);
        this.path = null;
        return inp;
      }
      let e = plan.edges[0];
      // Mehrere Gehkanten gleicher Richtung auf gleicher Höhe zusammenfassen.
      let n = 1;
      let macro = e.macro;
      if (e.type === 'walk') {
        while (n < plan.edges.length) {
          const nx = plan.edges[n];
          if (nx.type === 'walk' && nx.dir === e.dir && this.fOf(nx.to) === this.fOf(e.to) && this.fOf(e.from) === this.fOf(e.to)) n++;
          else break;
        }
        if (n > 1) macro = { ...e.macro, tx: plan.edges[n - 1].macro.tx, timeout: 4 * n };
      }
      this.cur = {
        edge: e, consumed: n, plan, macro, stage: e.align ? 'align' : (e.digs ? 'dig' : 'move'),
        s: { n: 0, air: false, phase: 0, n1: 0 }, t0: game.time, startNode: node,
      };
      if (e.type === 'walk' && n > 1) this.cur.end = plan.edges[n - 1].to;
    }

    if (this.combat(inp)) return inp;
    this.runCur(inp);
    this.hop(inp);
    this.fire(inp);
    return inp;
  }

  // Gegner voraus in Schussweite: stehen bleiben und schießen (höchstens 3 s, dann 5 s Pause).
  combat(inp) {
    const g = this.game, p = g.player;
    if (this.combatCool > 0) { this.combatCool -= DT; return false; }
    if (p.power !== 'bow' || !p.onGround || p.climbing) { this.combatT = 0; return false; }
    if (this.cur && !(this.cur.edge.type === 'walk' || this.cur.stage === 'align')) return false;
    const face = p.face < 0 ? -1 : 1;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    let hit = false;
    for (const m of g.mobs) {
      if (m.dead || !m.active || m.type === 'silverfish') continue;
      const dx = m.x + m.w / 2 - cx;
      if (Math.abs(dy(m, cy)) < 24 && dx * face > 12 && Math.abs(dx) < 130) { hit = true; break; }
    }
    if (!hit) { this.combatT = 0; return false; }
    this.combatT += DT;
    if (this.combatT > 3) { this.combatT = 0; this.combatCool = 5; return false; }
    this.fire(inp);
    return true;
  }

  startChestDig(ch, node) {
    const dir = ch.cc > node.c ? 1 : ch.cc < node.c ? -1 : 0;
    this.chestsTried.add(`${ch.cc},${ch.cr},${this.game.pick}`);
    this.cur = {
      edge: { id: 'chest', type: 'dig', from: this.key(node.c, node.f), to: this.key(node.c, node.f) },
      consumed: 0, plan: null, macro: null, stage: 'dig',
      digs: [[ch.cc, ch.cr]], digDir: dir, s: { n: 0 }, t0: this.game.time, chest: true,
    };
  }

  runCur(inp) {
    const cur = this.cur;
    const p = this.game.player;
    const e = cur.edge;
    const finish = (ok, why) => {
      const wasChest = cur.chest;
      this.cur = null;
      if (wasChest) { this.path = null; return; }
      if (!ok) {
        this.blockEdge(e, why);
        this.path = null;
        return;
      }
      // Pfad fortsetzen, falls wir auf dem erwarteten Knoten stehen
      const plan = cur.plan;
      const target = cur.end ?? e.to;
      const n = this.nodeOf(p);
      const ek = `${e.from}|${e.id}`;
      if (this.key(n.c, n.f) === e.from) {
        const used = (this.useCount.get(ek) || 0) + 1;
        this.useCount.set(ek, used);
        if (used >= 4) { this.blockEdge(e, 'kein Fortschritt (Start = Ende)'); this.path = null; return; }
      } else this.useCount.delete(ek);
      if (plan && this.key(n.c, n.f) === target) {
        plan.edges = plan.edges.slice(cur.consumed);
        this.path = plan;
        if (!plan.edges.length && !plan.finalDig) this.path = null;
      } else {
        this.path = null;
      }
    };

    if (cur.stage === 'align') {
      const m = { kind: 'move', tx: this.center(this.cOf(e.from)), jump: false, hold: 0, delay: 0, needAir: false, timeout: 3, tol: 1.2 };
      if (e.macro.kind === 'climb' || e.macro.kind === 'exit') m.tx = e.macro.kind === 'exit' ? e.macro.tx0 : e.macro.tx;
      const st = drive(m, cur.s, p, inp);
      if (st === 1) {
        cur.s = { n: 0, air: false, phase: 0, n1: 0 };
        cur.stage = e.digs ? 'dig' : 'move';
        cur.alignFails = 0;
      } else if (st < 0) {
        cur.s = { n: 0, air: false, phase: 0, n1: 0 };
        cur.alignFails = (cur.alignFails || 0) + 1;
        if (cur.alignFails > 2) finish(false, 'Ausrichten scheitert');
      }
      return;
    }

    if (cur.stage === 'dig') {
      const digs = cur.chest ? cur.digs : e.digs;
      const dir = cur.chest ? cur.digDir : e.dir;
      const open = digs.every(([c, r]) => this.map.get(c, r) === 0 || (cur.chest && this.map.get(c, r) !== 23));
      if (open) {
        if (cur.chest) { this.cur = null; this.path = null; return; }
        cur.s = { n: 0, air: false, phase: 0, n1: 0 };
        cur.stage = 'move';
        resetInput(inp);
        return;
      }
      cur.s.n++;
      if (cur.s.n * DT > 8 + digs.reduce((a, [c, r]) => a + (this.info(c, r).hard || 1) * 3, 0)) {
        finish(false, 'Graben dauert zu lange');
        return;
      }
      inp.dig = true;
      setDir(inp, dir || 0);
      return;
    }

    // move-Phase
    const st = drive(cur.macro, cur.s, p, inp);
    if (st === 1) finish(true);
    else if (st < 0) finish(false, 'Makro-Zeitüberschreitung (Ziel nicht erreicht)');
  }
}

// ---------- Spiel durchlaufen ----------

export function playLevel(levelDef, opts = {}) {
  const maxTime = opts.maxTime ?? 300;
  const events = [];
  let bot = null;
  const game = new Game({
    level: levelDef,
    save: { lives: opts.lives ?? 99, power: opts.power ?? 'bow', pick: opts.pick ?? 0, emeralds: 0 },
    onEvent: (name, data) => {
      events.push({ name, data });
      if (name === 'die' && bot) bot.deathCause = data && data.cause;
    },
  });
  // Gegnerschaden steht in diesem Test nicht im Mittelpunkt (Level-Geometrie): Treffer werden ignoriert, solange
  // opts.immune !== false. Lava, Sturz und Explosionen der Karte (Trichter!) wirken weiter.
  if (opts.immune !== false) game.hurtPlayer = () => {};
  bot = new Bot(game, opts);
  const maxSteps = Math.round(maxTime / DT);
  let steps = 0;
  const trail = [];
  for (; steps < maxSteps; steps++) {
    const inp = bot.next();
    game.update(DT, inp);
    if (game.state === 'won' || game.state === 'over' || bot.failed) break;
    if (steps % 600 === 0) {
      const n = bot.nodeOf(game.player);
      trail.push(`${(steps * DT).toFixed(0)}s:${n.c},${n.f}`);
    }
  }
  const n = bot.nodeOf(game.player);
  const result = {
    id: levelDef.id,
    won: game.state === 'won',
    state: game.state,
    time: +(steps * DT).toFixed(1),
    simTime: +game.time.toFixed(1),
    lives: game.lives,
    node: { c: n.c, f: n.f },
    pick: game.pick,
    diamonds: game.diamonds.filter(Boolean).length,
    failed: bot.failed,
    diag: bot.diag,
    trail,
    sims: bot.simCount,
  };
  result.summary = summarize(result);
  return result;
}

function summarize(r) {
  const bl = r.diag.blocked.slice(-6).map((b) => `${b.type} ${b.edge} bei Spalte ${b.c}, Zeile ${b.f} (${b.why})`).join('; ');
  const np = r.diag.noPath.slice(0, 2).map((x) => `Spalte ${x.c}, Zeile ${x.f} @${x.t}s`).join('; ');
  const dt = r.diag.deaths.slice(-5).map((x) => `${x.c},${x.f}@${x.t}s(${x.cause})`).join(' ');
  return `${r.id}: ${r.won ? 'GEWONNEN' : 'nicht geschafft'} state=${r.state} t=${r.simTime}s Leben=${r.lives} Position=Spalte ${r.node.c}/Zeile ${r.node.f}`
    + (np ? ` | kein Pfad ab: ${np}` : '') + (bl ? ` | gesperrt: ${bl}` : '') + (dt ? ` | Tode: ${dt}` : '');
}

export { Bot };

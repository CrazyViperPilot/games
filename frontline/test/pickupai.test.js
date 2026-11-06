// Werk als Quelle in Oberfläche und KI (seit v5.66, P5b): der Befehl route mit fromWork startet am Ausgangslager eines Werks, die
// Oberfläche (T, dann Werk anklicken, dann Ziel-FOB) schickt ihn so, die KI plant Pendler ab einem Werk, wenn keine FOB Überschuss hat
// oder das Werk klar näher liegt, und die Ressourcenanzeige zeigt „davon an Werken“.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { KINDS } from '../js/data/citykinds.js';
import { anchorOf } from '../js/game/city/cells.js';
import { SURPLUS_MIN, ROUTE_HOLD } from '../js/data/ai.js';
import { resourceFlow } from '../js/game/flow.js';
import { Controller } from '../js/ui/controller.js';
import { classic } from './classic.js';

const DT = 0.05;
const FLAT = { iso: false }; // Kamera ohne Iso-Ansicht (Klicks treffen die Ebene)
const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) g.update(DT);
};

// Anker des ersten fertigen Werks der Art k (das Startviertel hat eine Raffinerie)
function workOf(g, k = 'fuel', team = 0) {
  const c = g.city[team];
  const a = c.list.find((i) => anchorOf(c, i) === i && c.level[i] && KINDS[c.kind[i] - 1] === k);
  assert.ok(a !== undefined, `kein fertiges Werk ${k}`);
  return a;
}

// Ausstoß eines Werks setzen (Ware je s, wie runWorks ihn im letzten Schritt schreibt)
const rate = (g, a, v) => {
  g.city[0].workOut[a] = v;
};

// Eigener LKW ohne Ladung an der Werksmitte
function truckAt(g, a, team = 0) {
  const e = g.city[team].ents.get(a);
  const u = g.units.find((x) => x.alive && x.team === team && x.type === 'truck');
  assert.ok(u, 'kein LKW');
  u.x = e.x;
  u.y = e.y;
  u.cargo = { bm: 0, mun: 0, fuel: 0 };
  return u;
}

// Freie Stelle für eine fertige FOB in einem Ring um (x0, y0); spawnt sie (ohne Kosten)
function fobRing(g, team, x0, y0, rMin, rMax, angle0 = 0) {
  for (let r = rMin; r <= rMax; r += 32) {
    for (let a = 0; a < 16; a++) {
      const ang = angle0 + (a * Math.PI) / 8;
      const p = g.canPlace(team, 'fob', x0 + Math.cos(ang) * r, y0 + Math.sin(ang) * r);
      if (p.ok) return g.spawnBuilding('fob', team, p.cx, p.cy, { built: true });
    }
  }
  assert.fail('keine freie FOB-Stelle');
}

/** Hauptstadt leeren (BM, MUN, TS) und eine bedürftige FOB daneben stellen; liefert { main, to }. */
function needyFob(g, team = 0) {
  const main = g.mainFob(team);
  for (const k of ['bm', 'mun', 'fuel']) main.store[k] = 0;
  const to = fobRing(g, team, main.x, main.y, 900, 1300, Math.PI); // auf der Seite, die vom Werk wegzeigt
  for (const k of ['bm', 'mun', 'fuel']) to.store[k] = 0;
  return { main, to };
}

test('Befehl route mit fromWork: der LKW fährt zum Werk, holt dessen Ware und bringt sie zur FOB', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const a = workOf(g, 'fuel');
  const { to } = needyFob(g);
  const u = truckAt(g, a);
  g.city[0].out[a] = 200;
  const r = g.issue(0, { type: 'route', ids: [u.id], fromWork: a, toId: to.id, preset: 'fuel' });
  assert.ok(r.ok, r.reason);
  assert.equal(u.order.work, a, 'Auftrag merkt sich das Werk');
  assert.equal(u.order.fromId, g.city[0].ents.get(a).id, 'Start ist das Werk');
  run(g, 150);
  assert.ok(to.store.fuel > 10, `FOB hat Treibstoff bekommen: ${to.store.fuel}`);
  assert.equal(g.city[0].pickClaim[a], 1, 'Werk ist dem LKW zugeteilt');
});

test('Oberfläche: T, dann Werk anklicken, dann Ziel-FOB, schickt route mit fromWork', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const a = workOf(g, 'fuel');
  const { main, to } = needyFob(g);
  const u = truckAt(g, a);
  const ctl = new Controller(g, 0, FLAT);
  ctl.view.selection.add(u.id);
  const e = g.city[0].ents.get(a);
  ctl.confirmRouteFrom(e.x, e.y);
  assert.equal(ctl.view.mode, 'routeTo', 'Start angenommen, jetzt das Ziel');
  assert.equal(ctl.routeFromWork, a, 'Start ist das Werk');
  assert.equal(ctl.routeFromId, null);
  ctl.confirmRouteTo(to.x, to.y);
  assert.equal(ctl.view.mode, 'normal', 'Route ausgegeben');
  assert.equal(u.order.type, 'route');
  assert.equal(u.order.work, a);
  assert.equal(u.order.toId, to.id);
  assert.equal(main.store.fuel, 0, 'die Hauptstadt wurde nicht als Start gewählt');
});

test('Oberfläche: Start FOB wie bisher, Start = Ziel wird abgelehnt', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const { main, to } = needyFob(g);
  const u = truckAt(g, workOf(g, 'fuel'));
  const ctl = new Controller(g, 0, FLAT);
  ctl.view.selection.add(u.id);
  ctl.confirmRouteFrom(to.x, to.y);
  assert.equal(ctl.routeFromId, to.id);
  assert.equal(ctl.routeFromWork, null);
  ctl.confirmRouteTo(to.x, to.y);
  assert.equal(ctl.view.mode, 'routeTo', 'Start = Ziel: bleibt im Modus');
  ctl.confirmRouteTo(main.x, main.y);
  assert.equal(u.order.fromId, to.id, 'route ab der FOB');
  assert.equal(u.order.work, null, 'kein Werk im Auftrag');
});

test('KI plant Pendler ab einem Werk, wenn keine FOB Überschuss hat', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const ai = new AI(g, 0, 'normal');
  const a = workOf(g, 'fuel');
  const { to } = needyFob(g);
  rate(g, a, 1);
  const s = ai.snapshot();
  const plan = ai.pendlerPlan(s, new Set(), null);
  assert.ok(plan, 'es gibt einen Plan');
  assert.equal(plan.k, 'fuel');
  assert.equal(plan.to, to);
  assert.equal(plan.from, null);
  assert.equal(plan.work.cityCell, a, 'Quelle ist das Werk');
});

test('KI: ohne Stadt gibt es keinen Werks-Plan', () => {
  const g = classic(new Game({ seed: 3 }));
  const ai = new AI(g, 0, 'normal');
  const main = g.mainFob(0);
  for (const k of ['bm', 'mun', 'fuel']) main.store[k] = 0;
  const to = fobRing(g, 0, main.x, main.y, 900, 1300, Math.PI);
  for (const k of ['bm', 'mun', 'fuel']) to.store[k] = 0;
  const plan = ai.pendlerPlan(ai.snapshot(), new Set(), null);
  assert.equal(plan, null, 'ohne Stadt kein Plan (alles wie vorher)');
});

test('KI: eine FOB mit Überschuss bleibt Quelle, wenn das Werk nicht klar näher liegt', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const ai = new AI(g, 0, 'normal');
  const main = g.mainFob(0);
  const w = g.city[0].ents.get(workOf(g, 'fuel'));
  for (const k of ['bm', 'mun']) main.store[k] = 0; // nur Treibstoff ist knapp
  main.store.fuel = 400; // Überschuss der Hauptstadt
  // Bedarfs-FOB möglichst weit weg vom Werk (ab 900 px um die Hauptstadt), damit die Hauptstadt die nähere Quelle bleibt
  let best = null;
  for (let k = 0; k < 16; k++) {
    const r = 900 + (k % 2) * 300;
    const ang = (Math.floor(k / 2) * Math.PI) / 4;
    const x = main.x + Math.cos(ang) * r;
    const y = main.y + Math.sin(ang) * r;
    const p = g.canPlace(0, 'fob', x, y);
    const d = Math.hypot(w.x - x, w.y - y);
    if (p.ok && (!best || d > best.d)) best = { p, d };
  }
  assert.ok(best, 'FOB-Stelle');
  const to = g.spawnBuilding('fob', 0, best.p.cx, best.p.cy, { built: true });
  to.store.fuel = 0;
  to.store.bm = to.store.mun = 0;
  const plan = ai.pendlerPlan(ai.snapshot(), new Set(), null);
  assert.ok(plan, 'Plan');
  assert.equal(plan.k, 'fuel');
  assert.equal(plan.work, null, 'kein Werk');
  assert.equal(plan.from, main, 'die Hauptstadt liefert');
});

test('KI: die Hauptstadt wird nie mit einem Werk versorgt (auch wenn sie allein bedürftig ist)', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const ai = new AI(g, 0, 'normal');
  const main = g.mainFob(0);
  for (const k of ['bm', 'mun', 'fuel']) main.store[k] = 0;
  const plan = ai.pendlerPlan(ai.snapshot(), new Set(), null);
  assert.equal(plan, null, 'die Hauptstadt ist die einzige FOB: kein Pendler, auch nicht ab dem Werk');
});

test('KI: höchstens WORK_SOURCE_TRUCKS LKW je Werk, der zweite LKW bekommt keinen Plan ab diesem Werk', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const ai = new AI(g, 0, 'normal');
  const a = workOf(g, 'fuel');
  needyFob(g);
  rate(g, a, 1);
  const t1 = truckAt(g, a);
  const t2 = g.units.find((x) => x.alive && x.team === 0 && x.type === 'truck' && x !== t1);
  assert.ok(t2, 'zweiter LKW');
  const taken = new Set();
  ai.managePendler(ai.snapshot(), t1, taken);
  assert.equal(t1.order.type, 'route', 'erster LKW pendelt');
  assert.equal(t1.order.work, a, 'ab dem Werk');
  const plan2 = ai.pendlerPlan(ai.snapshot(), new Set(), t2);
  assert.ok(!plan2 || plan2.work === null || plan2.work.cityCell !== a, 'zweiter LKW nimmt dasselbe Werk nicht');
});

test('KI: Route ab Werk wird gesetzt und bleibt gültig, solange die FOB Bedarf hat', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const ai = new AI(g, 0, 'normal');
  const a = workOf(g, 'fuel');
  const { to } = needyFob(g);
  const u = truckAt(g, a);
  g.city[0].out[a] = 200;
  rate(g, a, 1);
  ai.managePendler(ai.snapshot(), u, new Set());
  assert.equal(u.order.type, 'route', 'Route gesetzt');
  assert.equal(u.order.work, a);
  assert.equal(ai.routes.get(u.id).toId, to.id);
  assert.equal(ai.routes.get(u.id).fromId, g.city[0].ents.get(a).id, 'Quelle im Merker ist das Werk');
  // Ein späterer Denkschritt ändert die Route nicht, solange der Bedarf der FOB da ist
  const before = u.order.fromId;
  ai.managePendler(ai.snapshot(), u, new Set());
  assert.equal(u.order.fromId, before, 'gleiche Route');
  assert.equal(u.order.type, 'route');
});

test('KI: Route ab Werk endet, wenn das Werk abgerissen ist (kein Absturz im Denkschritt)', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const ai = new AI(g, 0, 'normal');
  const a = workOf(g, 'fuel');
  needyFob(g);
  const u = truckAt(g, a);
  g.city[0].out[a] = 200;
  rate(g, a, 1);
  ai.managePendler(ai.snapshot(), u, new Set());
  assert.equal(u.order.work, a);
  const q = a % g.city[0].cols;
  const r = (a - q) / g.city[0].cols;
  assert.ok(g.issue(0, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r }).ok, 'Werk räumen');
  run(g, 0.2);
  assert.doesNotThrow(() => ai.managePendler(ai.snapshot(), u, new Set()));
  assert.notEqual(u.order.work, a, 'kein Auftrag mehr am abgerissenen Werk');
});

test('Ressourcenanzeige: am Lagerknoten steht „davon an Werken“ (Summe der Ausgangslager je Ware)', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  c.out[a] = 20;
  const f = resourceFlow(g, 0, null);
  assert.equal(f.nodes['store:fuel'].atWorks, 20, 'Treibstoff im Werk');
  assert.equal(f.nodes['store:bm'].atWorks, 0, 'kein BM im Werk');
  c.out[a] = 0;
  assert.equal(resourceFlow(g, 0, null).nodes['store:fuel'].atWorks, 0);
});


test('KI: ein Werk ohne Ausstoß und mit leerem Ausgangslager wird als Quelle nicht gewählt', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const ai = new AI(g, 0, 'normal');
  const a = workOf(g, 'fuel');
  needyFob(g);
  rate(g, a, 0); // die Raffinerie liefert nichts (zum Beispiel ohne Öl)
  g.city[0].out[a] = 0;
  assert.equal(ai.pendlerPlan(ai.snapshot(), new Set(), null), null, 'kein Werks-Plan ohne Ausstoß');
  g.city[0].out[a] = SURPLUS_MIN; // das Ausgangslager reicht als Quelle
  const plan = ai.pendlerPlan(ai.snapshot(), new Set(), null);
  assert.ok(plan && plan.work && plan.work.cityCell === a, 'mit vollem Ausgangslager wieder gewählt');
});

test('KI: eine Route ab Werk wird nach ROUTE_HOLD aufgegeben, wenn das Werk aufhört zu liefern', () => {
  const g = classic(new Game({ seed: 3, city: true }));
  const ai = new AI(g, 0, 'normal');
  const a = workOf(g, 'fuel');
  needyFob(g);
  const u = truckAt(g, a);
  g.city[0].out[a] = 200;
  rate(g, a, 1);
  ai.managePendler(ai.snapshot(), u, new Set());
  assert.equal(u.order.work, a, 'Route läuft');
  // Das Werk stellt die Lieferung ein (Ausstoß und Ausgangslager 0, gegen den Sim-Schritt gehalten)
  const stop = () => {
    rate(g, a, 0);
    g.city[0].out[a] = 0;
  };
  for (let k = 0; k < 5 / DT; k++) {
    g.update(DT);
    stop();
  }
  ai.managePendler(ai.snapshot(), u, new Set());
  assert.equal(u.order.type, 'route', 'innerhalb ROUTE_HOLD bleibt die Route');
  for (let k = 0; k < (ROUTE_HOLD + 1) / DT; k++) {
    g.update(DT);
    stop();
  }
  ai.managePendler(ai.snapshot(), u, new Set());
  assert.notEqual(u.order.type, 'route', 'nach ROUTE_HOLD aufgegeben');
});

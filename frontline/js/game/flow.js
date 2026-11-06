// Ressourcenfluss (PRD §15 „Ressourcenanzeige“, seit v5.07): baut aus der Stadt eines Teams den Graphen der Flussanzeige
// (js/ui/flowpanel.js, Knopf „Ressourcen“). Links die Förderung (Gebäude, Rohstoff/s), dann die Werke aus CITY.chain, rechts die
// Lager mit Erzeugung und Verbrauch. Markiert Engpässe und nennt sie in Worten. Die Kette kommt nur aus CITY.chain, die Zahlen
// aus c.stats (updateCity), den Lagern und der LKW-Ladung. Liest nur. Kein DOM.
// Neue Rohstoffe, Werke oder Waren: CITY.chain und die Felder cap/inp/gross/n in updateCity pflegen; test/flow.test.js prüft das.
// Namen, Kürzel, Lager und Hinweise der Waren kommen seit v5.59 aus dem Warenregister js/data/goods.js.
// Zwischenprodukte (Roheisen, seit v5.20) haben keinen Bestand: sie laufen direkt vom Werk zum nächsten (Knotentyp 'mid').
import { CITY } from '../data/city.js';
import { BALANCE } from '../data/balance.js';
import { GOODS, GOOD_NAME, GOOD_SHORT, STORED_GOODS, MID_GOODS, CITY_STORE_GOODS } from '../data/goods.js';
import { DEPOSITS, DEPOSIT_NAME, MINE_NAME } from './city/cells.js';
import { KIND_NAME, KINDS } from '../data/citykinds.js';

export { GOOD_NAME };
const WORKS_SHORT = { bm: 'BM-Werk' };
const RAW_NAME = { wood: 'Holz', stone: 'Stein', ore: 'Erz', oil: 'Öl' }; // Rohstoff (DEPOSIT_NAME nennt das Vorkommen)
/** Waren mit Lager (BM, MUN, TS in den Lagern der Hauptstadt, Stahl und Kerosin im Stadtlager). */
export const FLOW_GOODS = STORED_GOODS;
/** Zwischenprodukte ohne Lager (seit v5.20): Roheisen von der Hütte zum Stahlwerk. */
export const FLOW_MIDS = MID_GOODS;
const isRaw = (x) => DEPOSITS.includes(x);
const isMid = (x) => FLOW_MIDS.includes(x);
const WORKS = Object.keys(CITY.chain);

/** Aufbau des Graphen (nur aus CITY.chain): Knoten mit Spalte und Reihe, Kanten. Einmal berechnet. */
let LAYOUT = null;
export function flowLayout() {
  if (LAYOUT) return LAYOUT;
  const nodes = {}; // id → { id, type: 'raw'|'works'|'mid'|'store', key, col, row, ins: [id], outs: [id] }
  const add = (id, type, key, col) => (nodes[id] ??= { id, type, key, col, row: 0, ins: [], outs: [] });
  const links = [];
  const link = (a, b) => {
    links.push({ from: a, to: b });
    nodes[a].outs.push(b);
    nodes[b].ins.push(a);
  };
  let r = 0;
  for (const w of WORKS) for (const f of CITY.chain[w].from) if (isRaw(f) && !nodes[`raw:${f}`]) add(`raw:${f}`, 'raw', f, 0).row = r++;
  const idOf = (f) => (isRaw(f) ? `raw:${f}` : isMid(f) ? `mid:${f}` : `store:${f}`);
  for (const w of WORKS) {
    const L = CITY.chain[w];
    const src = L.from.map(idOf);
    for (const id of src) if (!nodes[id]) throw new Error(`CITY.chain.${w}: ${id} kommt vor seinem Werk`);
    const wn = add(`works:${w}`, 'works', w, 1 + Math.max(...src.map((id) => nodes[id].col)));
    for (const id of src) link(id, wn.id);
    const out = isMid(L.to) ? add(`mid:${L.to}`, 'mid', L.to, wn.col + 1) : add(`store:${L.to}`, 'store', L.to, wn.col + 1);
    link(wn.id, out.id);
  }
  // Lager, aus denen kein Werk mehr nimmt, stehen ganz rechts
  const cols = 1 + Math.max(...Object.values(nodes).map((n) => n.col));
  for (const n of Object.values(nodes)) if (n.type === 'store' && n.outs.length === 0) n.col = cols - 1;
  // Reihen: Mitte der Zulieferer, in jeder Spalte mindestens eine Reihe Abstand
  for (let c = 1; c < cols; c++) {
    const list = Object.values(nodes).filter((n) => n.col === c);
    for (const n of list) n.row = n.ins.reduce((a, id) => a + nodes[id].row, 0) / Math.max(1, n.ins.length);
    list.sort((a, b) => a.row - b.row);
    for (let i = 1; i < list.length; i++) list[i].row = Math.max(list[i].row, list[i - 1].row + 1);
  }
  const rows = 1 + Math.max(...Object.values(nodes).map((n) => n.row));
  LAYOUT = { nodes, links, cols, rows };
  return LAYOUT;
}

/** Bestand je Ware: alle eigenen Lager (ohne unendliche Hauptstadt), Ausgangslager der Werke (seit v5.65), Ladung der LKW, Stahl und Kerosin im Stadtlager. */
export function teamStock(game, team) {
  const c = game.city?.[team];
  const st = { bm: 0, mun: 0, fuel: 0, metal: c?.metal ?? 0, kero: c?.kero ?? 0 };
  for (const b of game.buildings) {
    if (b.team !== team || !b.alive || !b.store || b.infinite) continue;
    for (const k of ['bm', 'mun', 'fuel']) st[k] += b.store[k] ?? 0;
  }
  for (const u of game.units) {
    if (u.team !== team || !u.alive || !(u.def?.cargoCap > 0)) continue;
    for (const k of ['bm', 'mun', 'fuel']) st[k] += u.cargo?.[k] ?? 0;
  }
  // Ausgangslager der Werke (CITY.pickup, seit v5.65) zählen wie das Lager, aus dem LKW holen (c.made zählt die Einlagerung mit)
  if (c?.out) for (const i of c.list) if (c.out[i]) st[CITY.chain[KINDS[c.kind[i] - 1]].to] += c.out[i];
  return st;
}

/**
 * Misst Erzeugung und Verbrauch je Ware über die letzten `window` s Spielzeit: Verbrauch = was ins Lager kam (c.made)
 * + Handel (c.traded) − Zunahme des Bestands. Zählt alles, was die Lager verlässt: Bauen, Nachladen, Tanken, Ausbildung,
 * Reparatur, Verluste. `sample` jedes Bild aufrufen (nimmt höchstens alle `step` s eine Probe).
 */
export class FlowMeter {
  constructor(window = 60, step = 1) {
    this.window = window;
    this.step = step;
    this.samples = [];
  }

  sample(game, team) {
    const c = game.city?.[team];
    if (!c) return;
    const last = this.samples[this.samples.length - 1];
    if (last && game.time < last.t) this.samples = []; // anderer Spielstand geladen
    else if (last && game.time - last.t < this.step) return;
    this.samples.push({ t: game.time, made: { ...(c.made ?? {}) }, traded: { ...(c.traded ?? {}) }, stock: teamStock(game, team) });
    while (this.samples.length > 2 && game.time - this.samples[1].t >= this.window) this.samples.shift();
  }

  /** Je Ware { made, traded, use, net, span } in 1/s, oder null, solange weniger als 5 s gemessen sind. */
  rates() {
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    if (!a || !b || b.t - a.t < 5) return null;
    const dt = b.t - a.t;
    const out = {};
    for (const g of FLOW_GOODS) {
      const made = ((b.made[g] ?? 0) - (a.made[g] ?? 0)) / dt;
      const traded = ((b.traded[g] ?? 0) - (a.traded[g] ?? 0)) / dt;
      const net = (b.stock[g] - a.stock[g]) / dt;
      out[g] = { made, traded, use: Math.max(0, made + traded - net), net, span: dt };
    }
    return out;
  }
}

const pct = (v) => `${Math.round(v * 100)} %`;
export const fmtFlow = (v) => (v >= 10 ? Math.round(v).toLocaleString('de-DE') : v.toLocaleString('de-DE', { minimumFractionDigits: v < 1 ? 2 : 1, maximumFractionDigits: v < 1 ? 2 : 1 }));
const EPS = 0.005;

/**
 * Graph der Flussanzeige für `team` (null ohne Stadt). `rates` = FlowMeter.rates() (oder null).
 * Knoten: { id, type, key, col, row, name, icon, count, rate, cap, out, stock, made, use, net, full, status, note }
 * mit status 'ok' | 'warn' | 'bad' | 'off'. Kanten: { from, to, good, rate }. Dazu factors (Arbeiter, Strom, Stimmung),
 * money (Steuern/s) und issues: Engpässe, wichtigste zuerst ({ sev, text, tip }).
 */
export function resourceFlow(game, team, rates = null) {
  const c = game.city?.[team];
  if (!c) return null;
  const s = c.stats;
  const { nodes: LN, links: LL, cols, rows } = flowLayout();
  const K = CITY.convert;
  const nodes = {};
  for (const n of Object.values(LN)) nodes[n.id] = { ...n, status: 'ok', note: '' };
  const issues = [];
  const issue = (sev, text, tip = '') => issues.push({ sev, text, tip });
  const links = LL.map((l) => ({ ...l, good: null, rate: 0 }));
  const linkOf = (a, b) => links.find((l) => l.from === a && l.to === b);

  // Förderung (Zwischenprodukte starten ohne Verbrauch)
  for (const n of Object.values(nodes)) {
    if (n.type === 'mid') n.used = 0;
    if (n.type !== 'raw') continue;
    n.name = MINE_NAME[n.key] ?? DEPOSIT_NAME[n.key] ?? n.key;
    n.unit = RAW_NAME[n.key] ?? DEPOSIT_NAME[n.key] ?? n.key;
    n.count = s.n?.mine?.[n.key] ?? 0;
    n.rate = s.raw?.[n.key] ?? 0;
    n.used = 0;
  }
  // Werke (in der Reihenfolge von CITY.chain)
  for (const w of WORKS) {
    const L = CITY.chain[w];
    const n = nodes[`works:${w}`];
    n.name = WORKS_SHORT[w] ?? KIND_NAME[w] ?? w;
    n.good = L.to;
    n.count = s.n?.[w] ?? 0;
    n.cap = s.cap?.[L.to] ?? 0;
    n.inp = s.inp?.[L.to] ?? 0;
    n.out = s.gross?.[L.to] ?? 0;
    const need = n.out * (K[L.to] ?? 1); // Rohstoff oder Ware, die das Werk je s verbraucht
    const ins = n.ins.map((id) => nodes[id]);
    const avail = ins.reduce((a, m) => a + (m.type === 'raw' ? m.rate : need), 0);
    for (const m of ins) {
      const r = m.type === 'raw' ? (avail > 0 ? (need * m.rate) / avail : 0) : need;
      const l = linkOf(m.id, n.id);
      l.rate = r;
      l.good = m.key;
      if (m.type === 'raw' || m.type === 'mid') m.used += r;
    }
    const outNode = nodes[n.outs[0]]; // Lager oder Zwischenprodukt
    const lo = linkOf(n.id, outNode.id);
    lo.rate = n.out;
    lo.good = L.to;
    const what = ins.map((m) => (m.type === 'raw' ? m.unit : GOOD_NAME[m.key])).join(' oder ');
    const rawIns = ins.filter((m) => m.type === 'raw');
    if (n.count === 0) {
      // Ohne Werk verfällt geförderter Rohstoff, den kein anderes gebautes Werk nimmt; Waren aus einem Lager (Stahl) bleiben liegen
      const lost = rawIns.reduce((a, m) => a + (m.outs.some((id) => id !== n.id && (s.n?.[nodes[id].key] ?? 0) > 0) ? 0 : m.rate), 0);
      n.status = lost > EPS ? 'bad' : 'off';
      n.note = lost > EPS ? 'fehlt · Rohstoff verfällt' : 'nicht gebaut';
      if (lost > EPS) issue(2.2, `Kein ${n.name}: ${fmtFlow(lost)} ${what}/s verfallen.`, `${n.name} bauen.`);
      continue;
    }
    if (n.cap <= EPS) {
      n.status = 'bad';
      n.note = 'steht: Arbeiter, Strom';
      issue(2.5, `${n.name} steht: keine Arbeiter oder kein Strom.`, 'Wohnen oder ein Kraftwerk bauen.');
      continue;
    }
    if (outNode.type === 'mid') {
      // Roheisen ohne Stahlwerk: die Hütte kann nichts liefern (Stahlwerk bauen)
      const next = nodes[outNode.outs[0]];
      if ((s.n?.[next.key] ?? 0) === 0) {
        n.status = 'bad';
        n.note = `${GOOD_NAME[outNode.key]} ohne ${KIND_NAME[next.key]}`;
        n.noNext = true;
        issue(2.3, `${n.name}: ${GOOD_NAME[outNode.key]} hat kein ${KIND_NAME[next.key]}, das es verarbeitet.`, `${KIND_NAME[next.key]} bauen.`);
        continue;
      }
    }
    n.util = Math.min(1, n.out / n.cap);
    if (n.inp < n.cap * 0.85) {
      // Rohstoff oder Zwischenprodukt ist der Engpass: das Werk wartet
      n.status = 'warn';
      n.note = `wartet · Auslastung ${pct(n.util)}`;
      const empty = rawIns.length === 0 || rawIns.every((m) => m.count === 0);
      for (const m of ins) {
        if (m.type !== 'raw') continue;
        if (m.count === 0 && !empty) continue;
        m.status = 'bad';
        m.note = m.count === 0 ? 'fehlt' : 'reicht nicht';
      }
      if (ins.some((m) => m.type === 'store')) {
        const st = nodes[ins.find((m) => m.type === 'store').id];
        st.starved = true;
      }
      // Wer liefert nach: Förderanlage (Rohstoff) oder Vorwerk (Roheisen von der Hütte)
      const feeders = ins.map((m) => (m.type === 'raw' ? m.name : m.type === 'mid' ? KIND_NAME[nodes[m.ins[0]].key] : null)).filter(Boolean);
      const mines = feeders.join(' oder ');
      issue(1 + (1 - n.util), `${n.name} nur ${pct(n.util)} ausgelastet: zu wenig ${what}.`, mines ? `${mines} bauen oder ausbauen.` : `Mehr ${what} erzeugen.`);
    } else if (n.cap < n.inp * 0.85 && rawIns.length) {
      n.status = 'bad';
      n.note = 'Engpass · voll'; // kurz, damit es auf den Knoten passt (v5.32)
    } else {
      n.note = `Auslastung ${pct(n.util)}`;
    }
  }
  // Rohstoff, der kein Werk mehr aufnimmt, verfällt
  const lostBy = {}; // Werk → [Rohstoff-Knoten mit Verlust]
  for (const n of Object.values(nodes)) {
    if (n.type !== 'raw') continue;
    n.waste = Math.max(0, n.rate - n.used);
    if (n.status === 'bad') continue;
    if (n.count === 0) {
      n.status = 'off';
      n.note = 'nicht gebaut';
    } else if (n.waste > EPS) {
      n.status = 'warn';
      n.note = `${fmtFlow(n.waste)}/s verfällt`;
      const w = n.outs.map((id) => nodes[id]).find((x) => x.count > 0 && !x.noNext); // erstes gebautes Werk, das ihn nimmt
      if (w) (lostBy[w.id] ??= []).push(n);
    } else n.note = 'wird ganz verarbeitet';
  }
  for (const [id, list] of Object.entries(lostBy)) {
    const w = nodes[id];
    const share = list.reduce((a, m) => a + m.waste, 0) / Math.max(EPS, list.reduce((a, m) => a + m.rate, 0)); // Anteil, der verfällt
    const lost = list.map((m) => `${fmtFlow(m.waste)} ${m.unit}`).join(' + ');
    // Hütte: läuft das Roheisen nicht weiter, weil das Stahlwerk voll ausgelastet ist, ist das Stahlwerk der Engpass
    const mid = w.outs.map((x) => nodes[x]).find((x) => x.type === 'mid');
    const next = mid ? nodes[mid.outs[0]] : null;
    if (next && (next.util ?? 0) >= 0.95) issue(1.5 + share, `${next.name} zu klein: ${w.name} liefert mehr Roheisen, als es verarbeitet. ${lost}/s verfallen.`, `${next.name} bauen oder ausbauen.`);
    else issue(1.5 + share, `${w.name} zu klein: ${lost}/s verfallen.`, `${w.name} bauen oder ausbauen.`);
  }
  // Zwischenprodukte (Roheisen): kein Lager; was das Stahlwerk nicht nimmt, verfällt
  for (const n of Object.values(nodes)) {
    if (n.type !== 'mid') continue;
    n.name = GOOD_NAME[n.key] ?? n.key;
    n.unit = GOOD_SHORT[n.key] ?? n.key;
    n.rate = s.gross?.[n.key] ?? 0;
    n.waste = Math.max(0, n.rate - n.used);
    n.status = n.waste > EPS ? 'warn' : 'ok';
    n.note = n.waste > EPS ? `${fmtFlow(n.waste)}/s verfällt` : 'ohne Lager, wird ganz verarbeitet';
  }
  // Lager: Bestand, gemessene Erzeugung und Verbrauch
  const main = game.mainFob(team);
  const cap = BALANCE.logistics.storeCap;
  const stock = teamStock(game, team);
  // Ausgangslager der Werke je Ware (CITY.pickup, seit v5.66): „davon an Werken“ am Lagerknoten
  const atWorks = {};
  if (c.out) {
    for (const i of c.list) {
      if (!c.out[i]) continue;
      const w = CITY.chain[KINDS[c.kind[i] - 1]].to;
      atWorks[w] = (atWorks[w] ?? 0) + c.out[i];
    }
  }
  for (const n of Object.values(nodes)) {
    if (n.type !== 'store') continue;
    const g = n.key;
    const inCity = CITY_STORE_GOODS.includes(g);
    n.name = GOOD_NAME[g] ?? g;
    n.unit = GOOD_SHORT[g] ?? g;
    n.where = inCity ? 'Stadtlager' : 'alle Lager';
    n.stock = stock[g];
    n.atWorks = atWorks[g] ?? 0;
    const here = inCity ? c[g] : main?.store?.[g] ?? 0;
    n.full = here >= (inCity ? cap : BALANCE.logistics.capitalCap ?? cap) - 1; // Stadtlager bzw. Lager der Hauptstadt (seit v5.06 größer)
    n.rate = s.gross?.[g] ?? 0;
    const r = rates?.[g];
    n.made = r ? r.made : null;
    n.use = r ? r.use : null;
    n.net = r ? r.net : null;
    if (n.full) {
      n.status = 'warn';
      n.note = 'Hauptlager voll';
      if (n.rate > EPS) issue(0.8, `${n.name}: Lager der Hauptstadt voll, Erzeugung verfällt.`, GOODS[g]?.full ?? 'Mit LKW zu den FOBs fahren oder am Markt verkaufen.');
    } else if (r && r.net < -EPS) {
      const eta = n.stock / -r.net;
      n.status = eta < 600 ? 'bad' : 'warn';
      n.note = `leer in ${eta < 60 ? '< 1' : Math.round(eta / 60)} min`;
      if (eta < 600) issue(3.5 - eta / 600, `${n.name} sinkt um ${fmtFlow(-r.net)}/s: leer in ${eta < 60 ? 'unter 1' : `etwa ${Math.round(eta / 60)}`} min.`, `Verbrauch ${fmtFlow(r.use)}/s, Erzeugung ${fmtFlow(r.made)}/s${Math.abs(r.traded) > EPS ? `, Markt ${r.traded > 0 ? '+' : '−'}${fmtFlow(Math.abs(r.traded))}/s` : ''}: mehr erzeugen.`);
    } else if (n.starved) {
      n.status = 'bad';
      n.note = 'leer · Werk wartet';
    } else if (r) n.note = r.net > EPS ? 'steigt' : 'gleich';
    else n.note = 'misst …';
  }

  // Arbeiter, Strom und Zufriedenheit wirken auf jede Förderanlage und jedes Werk
  const fill = s.fill ?? 1;
  const power = s.powerRatio ?? 1;
  const mood = s.mood ?? 1;
  if (s.jobs > 0 && fill < 0.95) issue(fill < 0.7 ? 3.5 - fill : 2.6 - fill, `Nur ${pct(fill)} der Arbeitsplätze besetzt: alle Werke arbeiten langsamer.`, 'Wohnen bauen.');
  if (power < 0.999) issue(power < 0.7 ? 3.4 - power : 2.5 - power, `Strom reicht nur für ${pct(power)}: Förderung und Werke laufen langsamer.`, 'Kraftwerk bauen oder ausbauen.');
  // Gewerbe bauen nur, wenn die Läden die Zufriedenheit kaum tragen (Läden-Anteil unter 50 %, seit v5.20)
  const shopLow = (s.shop ?? 1) < 0.5;
  if ((s.happy ?? 1) < 0.5) issue(0.9, `Zufriedenheit niedrig (${pct(s.happy)}): Erträge × ${mood.toFixed(2).replace('.', ',')}.`, shopLow ? 'Gewerbe bauen, Stadt schützen, Strom sichern.' : 'Stadt schützen, Strom sichern.');
  // Gewerbe braucht Baumaterial, über die Straße vom Lager (seit v5.20, AP3b): wenig versorgt = Steuer und Zufriedenheit fallen
  const sup = s.shopSupply ?? 1;
  if (sup < 0.5 && (s.jobsCom ?? 0) > 0) issue(1 + (0.5 - sup), `Gewerbe ohne Waren (Straße zum Lager, Baumaterial): nur ${pct(sup)} versorgt.`, 'Gewerbe per Straße an das Lager der Hauptstadt anschließen und Baumaterial nachproduzieren.');
  // Straßentransport (seit v5.20, AP5): Stau auf den Straßen (kleinster Stau-Faktor) und Waren, die gar keinen Weg haben
  const jam = s.jam ?? 1;
  if (jam < 0.95) issue(1 + (1 - jam), `Stau auf den Straßen (${pct(jam)}): Waren und Pendler kommen langsamer.`, `Eine zweite Straße zum Ziel legen oder eine Straße direkt daneben bauen (mehrspurig: Kapazität × Spuren, bis ${CITY.transport.maxLanes}; Straßen tragen ${CITY.transport.cap}/s je Spur, Stadtstraßen ${CITY.transport.mapCap}/s).`);
  const lost = s.lost ?? 0;
  if (lost > EPS) issue(1.4, `Waren ohne Straßenweg: ${fmtFlow(lost)}/s gehen verloren.`, 'Werk oder Förderanlage per Straße an das nächste Werk bzw. das Lager anschließen.');
  issues.sort((a, b) => b.sev - a.sev);

  // Linien ohne Fluss bekommen trotzdem eine Ware (Farbe)
  for (const l of links) l.good ??= nodes[l.from].key;
  return { nodes, links, cols, rows, issues, factors: { fill, power, happy: s.happy ?? 1, mood }, money: s.money ?? 0, pop: s.pop ?? 0 };
}

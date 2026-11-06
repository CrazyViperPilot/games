// Stadt-KI (PRD §15, seit v5.60 aus js/game/city.js hierher, Review A-04): Ausbau (Ringe, Viertel, Förderung, Anschluss, Fliegerhorst,
// Markt), Überfälle auf die gegnerische Stadt und Verteidigung. Befehle nur über game.issue; die Buchhaltung (cityAiMemory) liegt in
// der KI-Instanz (ai.js). Kein DOM, deterministisch.
import { CITY } from '../data/city.js';
import { KINDS, KIND_ID, WORKS, SUPPLIER_KINDS } from '../data/citykinds.js';
import { transportOf, transportInfo } from '../game/transport.js';
import { DEPOSITS, cellAt, idx, sizeOf, isPart, fitBig, cellFree, roadAt, hasRoad, buildAllowed, nbrsOf } from '../game/city/cells.js';
import { mainRoadReach, connectRoad, goalOf } from '../game/city/roadnet.js';
import { totals } from '../game/city/state.js';

/** Zellen höchstens `d` Schritte (4er-Nachbarschaft, alle Zellen) von einer Zelle aus `reach`, Uint8Array 1 = nah (seit v5.20, AP4). */
function nearCells(c, reach, d) {
  const n = c.cols * c.rows;
  const near = new Uint8Array(n);
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (!reach[i]) continue;
    dist[i] = 0;
    near[i] = 1;
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++];
    if (dist[i] >= d) continue;
    for (const j of nbrsOf(c, i)) {
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      near[j] = 1;
      queue[tail++] = j;
    }
  }
  return near;
}

/** Ist die Zelle im Muster um den Anker (ac, ar) eine Straße? Jede roadEvery-te Zeile und die Spalte durch den Anker. */
function aiRoad(col, row, ac, ar) {
  const n = CITY.ai.roadEvery;
  return (((row - ar) % n) + n) % n === 0 || col === ac;
}

/**
 * Welche Zone braucht die Stadt als Nächstes? (freie Planung seit v4.85) Wohnen, wenn Wohnraum oder freie Einwohner fehlen,
 * sonst die Arbeitsstätte mit dem größten Rückstand zum Mix; knappe Sorten (Lager, Metall, Geld) zählen CITY.ai.boost-fach.
 */
function aiNeed(game, c, add, skip = null) {
  const t = totals(c);
  const A = CITY.ai;
  const count = { res: 0, com: 0, bm: 0, mun: 0, fuel: 0, steel: 0, smelter: 0, kero: 0, market: 0, power: 0, uni: 0, dc: 0, barracks: 0, factory: 0, heliport: 0, hospital: 0 };
  for (const k in add) count[k] += add[k];
  for (const i of c.list) {
    if (isPart(c, i)) continue; // Großbau zählt einmal
    const k = KINDS[c.kind[i] - 1];
    if (k in count) count[k]++;
  }
  const work = count.com + count.bm + count.mun + count.fuel + count.steel + count.smelter + count.kero + count.market;
  const free = c.stats.free ?? 0;
  // Strom, Universität, Rechenzentrum (seit v4.88) nach Bedarf
  const st = c.stats;
  // Seit v5.20: Angebot bei voller Besetzung (fehlen nur Arbeiter, hilft ein weiteres Kraftwerk nicht, es braucht selbst welche)
  const supplyFull = CITY.power.base + t.power;
  if (supplyFull + (add.power ?? 0) * CITY.power.supply[1] < st.powerUse * A.powerMargin + A.powerSpare && (add.power ?? 0) < 1 && !skip?.has('power')) return 'power';
  // Wohnen zuerst (seit v5.20), wenn Arbeitsstätten keine Wohnung über die Straße erreichen (Pendler) oder Arbeiter fehlen
  if (!skip?.has('res') && count.res <= work * A.resMax && ((st.fill ?? 1) < A.lowFill || homeless(game, c))) return 'res';
  // Ausbildungsgebäude (seit v4.96): ohne sie keine Truppen; Heliport erst mit einer Arbeitsstätte
  const more = work >= A.moreFrom ? 1 : 0;
  for (const [k, n] of Object.entries(A.producers)) {
    if (k === 'heliport' && !work) continue;
    if (skip?.has(k)) continue; // Großbau ohne Platz in diesem Takt (seit v5.03 auch Kaserne und Fabrikhalle)
    if (count[k] < n + (k === 'heliport' ? 0 : more)) return k;
  }
  // Grundketten zuerst (seit v5.20), vor Krankenhaus und Universität (sonst spart die KI minutenlang für diese und kauft solange teuer
  // am Markt): ein BM-Werk, wenn Holz oder Stein im Gebiet liegt; Hütte und Stahlwerk, wenn Stahl knapp ist und Erz im Gebiet liegt.
  // Förderanlagen entstehen erst mit ihrem Werk (depositCells).
  if (count.bm === 0 && !skip?.has('bm') && (depositInClaim(c, 'wood') || depositInClaim(c, 'stone'))) return 'bm';
  if (c.metal < A.lowMetal && depositInClaim(c, 'ore')) {
    if (count.smelter === 0 && !skip?.has('smelter')) return 'smelter';
    if (count.steel < count.smelter && !skip?.has('steel')) return 'steel';
  }
  // … und ein Munitionswerk, sobald Stahl entsteht (Kette Erz → Stahl → Munition)
  if (count.steel > 0 && count.mun === 0 && !skip?.has('mun')) return 'mun';
  if (!count.hospital && work >= A.hospitalFrom && !skip?.has('hospital')) return 'hospital';
  if (!count.uni && work >= A.uniFrom && !skip?.has('uni')) return 'uni';
  if (!count.dc && count.uni && work >= A.dcFrom && !skip?.has('dc')) return 'dc';
  if (count.res < work * A.resPerWork || (t.housing + t.fled < c.drafted + A.draftSpare && count.res <= work * A.resMax) || (free < A.lowFree && count.res <= work * A.resMax)) return 'res';
  const main = game.mainFob(c.team);
  const s = c.stats;
  const low = {
    bm: main && main.store.bm < A.lowStock && s.raw.wood + s.raw.stone > s.bm, // Rohstoff da, Werk fehlt
    mun: main && main.store.mun < A.lowStock && c.metal > A.munMetal,
    fuel: main && main.store.fuel < A.lowStock && s.raw.oil > s.fuel,
    kero: c.kero < A.lowKero && s.raw.oil > 0, // Kerosin knapp, Öl wird gefördert (seit v5.20)
    smelter: c.metal < A.lowMetal && s.raw.ore > s.gross.iron * CITY.convert.iron, // Erz bleibt ungenutzt: es fehlt eine Hütte
    steel: c.metal < A.lowMetal && s.gross.iron > s.gross.metal * CITY.convert.metal, // Roheisen bleibt ungenutzt: es fehlt ein Stahlwerk
    com: game.teams[c.team].res.money < A.lowMoney,
  };
  let best = null;
  let lo = Infinity;
  for (const [k, w] of Object.entries(A.mix)) {
    if (k === 'market' && count.market >= 1) continue; // ein Markt reicht
    if (skip?.has(k)) continue; // Großbau ohne Platz in diesem Takt (seit v5.08 auch die 2 × 2-Werke)
    // Hütte und Stahlwerk als Paar (seit v5.20): je Hütte ein Stahlwerk, das danach kommt; ein Stahlwerk nie ohne Hütte davor
    if (k === 'steel' && count.steel >= count.smelter) continue;
    if (k === 'smelter' && count.smelter > count.steel) continue;
    // Kerosin-Raffinerie nur, wenn Kerosin knapp wird (seit v5.20): Öl fährt zur nächsten Raffinerie, eine Kerosin-Raffinerie auf Vorrat
    // nähme der Treibstoff-Raffinerie das Öl weg
    if (k === 'kero' && !low.kero) continue;
    const r = count[k] / (w * (low[k] ? A.boost : 1));
    if (r < lo) {
      lo = r;
      best = k;
    }
  }
  return best ?? 'res';
}

/** Hat eine fertige Arbeitsstätte keinen Pendlerweg zu einer Wohnung (transport.js)? */
function homeless(game, c) {
  for (const p of transportOf(game, c).commute.values()) if (p === null) return true;
  return false;
}

/** Liegt ein Vorkommen der Sorte d (DEPOSITS) im eigenen Gebiet? Zwischengespeichert je Stand des Gebiets (c.claimVer), nicht im Spielstand. */
const DEPOSIT_CACHE = new WeakMap();

function depositInClaim(c, d) {
  let hit = DEPOSIT_CACHE.get(c);
  if (!hit || hit.ver !== c.claimVer) {
    const has = new Uint8Array(DEPOSITS.length + 1);
    for (let i = 0; i < c.deposit.length; i++) if (c.deposit[i] && c.claim[i]) has[c.deposit[i]] = 1;
    hit = { ver: c.claimVer, has };
    DEPOSIT_CACHE.set(c, hit);
  }
  return !!hit.has[DEPOSITS.indexOf(d) + 1];
}

/** Liegt die Zelle nahe einem frischen Treffer auf die eigene Stadt? */
function inDanger(c, col, row, now) {
  const R = CITY.ai.dangerRadius;
  for (const h of c.hitLog ?? []) {
    if (h.t < now - CITY.ai.dangerTime) continue;
    if (Math.abs(Math.floor(h.x / c.cell) - col) <= R && Math.abs(Math.floor(h.y / c.cell) - row) <= R) return true;
  }
  return false;
}

/** Freie Zellen um den Anker (Weltpunkt), nach Abstand sortiert (Ringe), bis zum Radius in Zellen. */
function aiCandidates(game, c, x, y, rad, reach) {
  const [ac, ar] = cellAt(c, x, y);
  const out = [];
  for (let row = Math.max(0, ar - rad); row <= Math.min(c.rows - 1, ar + rad); row++) {
    for (let col = Math.max(0, ac - rad); col <= Math.min(c.cols - 1, ac + rad); col++) {
      const i = idx(c, col, row);
      if (c.kind[i] || !buildAllowed(game, c, i) || inDanger(c, col, row, game.time) || !cellFree(game, c, col, row)) continue; // Fels, Wasser oder Gebäude: dort wüchse nie etwas
      // seit v5.20 (AP4): Zellen neben einer Straße zum Lager zählen einen Ring näher (Werke und Großbauten zuerst dort)
      const far = reach && !touchesRoad(c, i, reach) ? CITY.ai.connectRing * 100 : 0;
      const d = Math.max(Math.abs(col - ac), Math.abs(row - ar)) * 100 + Math.abs(col - ac) + Math.abs(row - ar) + far;
      out.push({ i, col, row, d, road: aiRoad(col, row, ac, ar), deposit: c.deposit[i] });
    }
  }
  out.sort((a, b) => a.d - b.d || a.i - b.i);
  return out;
}

/** Neue Buchhaltung der Stadt-KI (liegt seit v5.58 in der KI-Instanz, ai.js `cityMem`): Ausbautakte, Zeit seit dem letzten Überfall, letzter Verteidigungsbefehl. */
export function cityAiMemory() {
  return { turn: 0, raidTimer: 0, defendAt: -1e9 };
}

/** KI-Schritt (alle ai.interval s von ai.js): weist die nächsten Zellen aus, solange Geld über der Reserve bleibt. mem: cityAiMemory() der KI. */
export function aiCity(game, team, difficulty, mem = cityAiMemory()) {
  const city = game.city?.[team];
  if (!city) return;
  const reserve = CITY.ai.reserve[difficulty] ?? CITY.ai.reserve.normal;
  const money = () => game.teams[team].res.money;
  aiMarket(game, team, reserve);
  mem.turn++;
  let n = 0;
  // Förderanlagen zuerst: jedes Vorkommen im Gebiet nutzen
  for (const i of city.list.length < CITY.ai.mineFrom ? [] : depositCells(game, city)) {
    if (money() < CITY.cost.mine + reserve) break; // Geldmangel stoppt nur die Förderung, nicht den übrigen Ausbau (seit v5.20)
    const col = i % city.cols;
    const row = (i - col) / city.cols;
    if (game.issue(team, { type: 'city', kind: 'mine', c0: col, r0: row, c1: col, r1: row }).ok && ++n >= CITY.ai.perStep) return;
  }
  const main = game.mainFob(team);
  const fobs = game.buildings.filter((b) => b.alive && b.built && b.team === team && b.type === 'fob' && !b.main);
  let anchor = main;
  let rad = CITY.territory.main + CITY.territory.building * 4;
  if (fobs.length && (mem.turn % CITY.ai.quarterEvery === 0 || !main)) {
    anchor = fobs[Math.floor(mem.turn / CITY.ai.quarterEvery) % fobs.length];
    rad = CITY.ai.quarter;
  }
  if (!anchor) return;
  if (aiAirport(game, city, main, reserve, CITY.ai.jets[difficulty] ?? CITY.ai.jets.normal)) n++;
  if (n < CITY.ai.perStep && aiConnect(game, city, mem.turn)) n++;
  const add = {};
  const skip = new Set(); // Großbauten, für die in diesem Takt kein Platz war
  // Ausbau: Zellen an Straßen, die mit dem Lager verbunden sind, kommen vor (aiCandidates, seit v5.20 AP4)
  const reach = mainRoadReach(game, city);
  const cands = aiCandidates(game, city, anchor.x, anchor.y, rad, reach);
  const near = nearCells(city, reach, CITY.ai.connectNear);
  const free = (j) => !city.kind[j] && !city.deposit[j] && !inDanger(city, j % city.cols, Math.floor(j / city.cols), game.time);
  // Werk (2 × 2, seit v5.20 AP4): zuerst ein Quadrat an einer Straße zum Lager, sonst an einer beliebigen Straße in Reichweite
  // (aiConnect verbindet es danach, Baumaterial vorausgesetzt)
  const workSpot = (kind) => {
    for (const pass of [true, false]) {
      for (const c2 of cands) {
        if (pass ? !touchesRoad(city, c2.i, reach) : !(near[c2.i] && hasRoad(city, c2.col, c2.row))) continue;
        const a = fitBig(game, city, c2.col, c2.row, kind, free, (j) => buildAllowed(game, city, j, kind));
        if (a >= 0) return a;
      }
    }
    return -1;
  };
  const place = (cand) => {
    if (cand.deposit) return; // Vorkommen bleiben für Förderanlagen frei
    let kind = 'road';
    let col = cand.col;
    let row = cand.row;
    if (!cand.road) {
      // nur neben einer (geplanten) Straße
      if (!hasRoad(city, cand.col, cand.row)) return;
      kind = aiNeed(game, city, add, skip);
      // Großbau (Werke 2 × 2, Kraftwerk, Universität, Kaserne, Fabrikhalle, Krankenhaus …, seit v5.20 AP4): Platz über workSpot, zuerst
      // an einer Straße zum Lager; ohne Platz gilt die Art für diesen Takt als ohne Platz und es kommt die nächste (bis zu 8 Versuche).
      // Vorher blieb ein Großbau ohne Platz an dieser Zelle stehen, und jede weitere Zelle des Takts wählte ihn erneut.
      let spot = -1;
      for (let tries = 0; sizeOf(kind) > 1 && tries < 8; tries++) {
        spot = workSpot(kind);
        if (spot >= 0) break;
        skip.add(kind);
        kind = aiNeed(game, city, add, skip);
      }
      if (sizeOf(kind) > 1) {
        if (spot < 0) return;
        col = spot % city.cols;
        row = Math.floor(spot / city.cols);
      }
    }
    if (money() < CITY.cost[kind] + reserve) {
      n = -Infinity; // Geld reicht nicht: Schluss für diesen Takt
      return;
    }
    const r = game.issue(team, { type: 'city', kind, c0: col, r0: row, c1: col, r1: row });
    if (!r.ok) {
      if (kind !== 'road') skip.add(kind); // z. B. zu wenig Baumaterial: in diesem Takt etwas anderes (seit v5.03)
      return;
    }
    if (kind !== 'road') add[kind] = (add[kind] ?? 0) + 1;
    n++;
  };
  for (const cand of cands) {
    if (n >= CITY.ai.perStep) return;
    place(cand);
    if (!Number.isFinite(n)) return;
  }
}

/** Liegt eine verbundene Straße (mit dem Lager) neben Zelle i? */
function touchesRoad(c, i, reach) {
  return nbrsOf(c, i).some((j) => reach[j] && roadAt(c, j));
}

/**
 * Straßenanschluss der KI (seit v5.20, AP4): höchstens ein Gebäude je Takt, dem der Weg fehlt (Förderanlage ohne Lieferweg zum
 * Werk, Werk ohne Lieferweg zum Lager, Arbeitsstätte ohne Pendlerweg). Prüft höchstens CITY.ai.roadTries Gebäude. true, wenn gebaut.
 */
function aiConnect(game, c, off) {
  let tried = 0;
  const list = c.list;
  // off: Ausbautakt der KI; der Anfang wandert mit jedem Takt, damit auch hintere Gebäude drankommen
  for (let s = 0; s < list.length && tried < CITY.ai.roadTries; s++) {
    const i = list[(s + off) % list.length];
    if (isPart(c, i) || !c.kind[i]) continue;
    const k = KINDS[c.kind[i] - 1];
    const info = transportInfo(game, c, i);
    const supplier = SUPPLIER_KINDS.includes(k) && info.to === null;
    if (!supplier && !info.noHome) continue;
    tried++;
    if (connectRoad(game, c, i, true, supplier ? goalOf(c, i, k) : null) > 0) return true;
  }
  return false;
}

/**
 * Fliegerhorst der KI (seit v5.35, ersetzt den Flughafen): ab CITY.ai.airportFrom Arbeitsstätten eine Bahn 2 × 10 nahe der Hauptstadt
 * (bis airportReach Zellen; waagrecht oder senkrecht, mit freiem Rand), daneben zwei Stellplätze, Tower, Kerosintank und Munitionslager;
 * Tank und Lager per connectRoad an die Straße zum Lager. Danach je Takt ein weiterer Stellplatz an der Bahn, bis sie `want` hat.
 */
export function aiAirport(game, c, main, reserve, want = 2) {
  const A = CITY.ai;
  if (!main) return false;
  const money = game.teams[c.team].res.money;
  let work = 0;
  const stands = [];
  for (const i of c.list) {
    if (isPart(c, i)) continue;
    const k = KINDS[c.kind[i] - 1];
    if (k === 'stand') stands.push(i); // auch noch nicht fertige (sonst baut sie doppelt)
    if (c.level[i] && (k === 'com' || k === 'market' || WORKS.includes(k))) work++;
  }
  const hasRunway = c.list.some((i) => c.kind[i] === KIND_ID.runway);
  const free = (j) => !c.kind[j] && !c.deposit[j] && !c.mapRoads?.[j] && buildAllowed(game, c, j) && cellFree(game, c, j % c.cols, Math.floor(j / c.cols)) && !inDanger(c, j % c.cols, Math.floor(j / c.cols), game.time);
  const put = (kind, q, r) => game.issue(c.team, { type: 'city', kind, c0: q, r0: r, c1: q, r1: r }).ok;
  if (hasRunway) {
    // Stellplätze ausbauen (seit v5.39 nur per Befehl): den ersten fertigen unter Stufe 3, wenn genug übrig bleibt
    const up = stands.length >= want ? stands.find((i) => c.level[i] && c.level[i] < CITY.maxLevel) : null; // erst genug Stellplätze
    const cost = up != null ? CITY.air.upgrade[c.level[up] + 1] : null;
    if (cost && money >= cost.money + Math.max(reserve, CITY.air.upgradeAiReserve) && main.store.bm >= cost.bm + A.upgradeBuffer.bm && c.metal >= (cost.steel ?? 0) + A.upgradeBuffer.steel) {
      const e = c.ents.get(up);
      if (e && game.issue(c.team, { type: 'cityUpgrade', buildingId: e.id }).ok) return true;
    }
    // weitere Stellplätze an der Bahn (beide Längsseiten)
    if (stands.length >= want || money < CITY.cost.stand + reserve || main.store.bm < CITY.costBm.stand + A.standBuffer) return false;
    const rw = c.list.filter((i) => c.kind[i] === KIND_ID.runway);
    for (const i of rw) {
      const q = i % c.cols;
      const r = (i - q) / c.cols;
      for (const [x, y] of [[q, r - 2], [q, r + 1], [q - 2, r], [q + 1, r], [q - 1, r - 2], [q - 1, r + 1]]) {
        const cells = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
        if (cells.some(([u, v]) => u < 0 || v < 0 || u >= c.cols || v >= c.rows || !free(v * c.cols + u))) continue;
        if (put('stand', x, y)) return true; // 2 × 2: Anker links oben der Mitte
      }
    }
    return false;
  }
  if (work < A.airportFrom || stands.length) return false;
  if (money < A.airportMoney + reserve || main.store.bm < A.airportBm) return false;
  const [fc, fr] = cellAt(c, main.x, main.y);
  const R = A.airportReach;
  const L = A.runwayLen; // Länge der Bahn
  const fits = (q, r, w, h) => {
    for (let y = r - 1; y <= r + h; y++) for (let x = q - 1; x <= q + w; x++) if (x < 0 || y < 0 || x >= c.cols || y >= c.rows || !free(y * c.cols + x)) return false;
    return true;
  };
  const cand = [];
  for (let r = Math.max(1, fr - R); r <= Math.min(c.rows - 2, fr + R); r++) {
    for (let q = Math.max(1, fc - R); q <= Math.min(c.cols - 2, fc + R); q++) cand.push({ q, r, d: Math.hypot(q - fc, r - fr) });
  }
  cand.sort((p, o) => p.d - o.d || p.r - o.r || p.q - o.q);
  for (const { q, r } of cand) {
    for (const vertical of [false, true]) {
      // Bahn L × 2 (bzw. 2 × L) mit einer Reihe 2 × 2-Bauten daneben: Fläche L × 4
      if (!fits(q, r, vertical ? 4 : L, vertical ? L : 4)) continue;
      if (vertical) {
        if (!game.issue(c.team, { type: 'city', kind: 'runway', c0: q, r0: r, c1: q + 1, r1: r + L - 1 }).ok) return false;
      } else if (!game.issue(c.team, { type: 'city', kind: 'runway', c0: q, r0: r, c1: q + L - 1, r1: r + 1 }).ok) return false;
      const spots = [0, 2, 4, 6, 8].map((k) => (vertical ? [q + 2, r + k] : [q + k, r + 2]));
      ['stand', 'stand', 'atc', 'ktank', 'mdepot'].forEach((kind, k) => {
        const [x, y] = spots[k];
        put(kind, x, y);
        if (kind === 'ktank' || kind === 'mdepot') connectRoad(game, c, y * c.cols + x, true);
      });
      return true;
    }
  }
  return false;
}

/** Freie Vorkommen im eigenen Gebiet (Zellindizes). */
function depositCells(game, c) {
  // Förderanlage nur, wenn das Werk für ihren Rohstoff schon steht oder ansteht (seit v5.20, AP4): sonst fließt die Ware ins Leere
  // Seit dem Review von v5.20 auch nur so viele, wie die Werke verarbeiten (CITY.ai.minesPer): Überschuss stünde als Last auf den Straßen
  const group = { wood: 'bm', stone: 'bm', ore: 'smelter', oil: 'oil' };
  const works = { bm: 0, smelter: 0, oil: 0 };
  const mines = { bm: 0, smelter: 0, oil: 0 };
  for (const i of c.list) {
    if (isPart(c, i)) continue;
    const k = KINDS[c.kind[i] - 1];
    if (k === 'mine') {
      const g = group[DEPOSITS[c.deposit[i] - 1]];
      if (g) mines[g]++;
    } else if (k === 'bm' || k === 'smelter') works[k]++;
    else if (k === 'fuel' || k === 'kero') works.oil++;
  }
  const out = [];
  for (let i = 0; i < c.deposit.length; i++) {
    if (!c.deposit[i] || !c.claim[i] || c.kind[i] || !buildAllowed(game, c, i)) continue;
    const g = group[DEPOSITS[c.deposit[i] - 1]];
    if (!g || mines[g] >= Math.ceil(works[g] * CITY.ai.minesPer[g])) continue;
    const q = i % c.cols;
    if (!inDanger(c, q, (i - q) / c.cols, game.time)) out.push(i);
  }
  // knappe Sorten zuerst (Öl bei wenig Treibstoff, Erz bei wenig Metall)
  const main = game.mainFob(c.team);
  const want = (i) => {
    const d = DEPOSITS[c.deposit[i] - 1];
    if (d === 'oil' && main && main.store.fuel < CITY.ai.lowStock) return 0;
    if (d === 'ore' && c.metal < CITY.ai.lowMetal) return 0;
    return 1;
  };
  out.sort((a, b) => want(a) - want(b) || a - b);
  // je Gruppe nur so viele Zellen, wie noch Förderanlagen fehlen (ein Takt baut sonst mehrere auf einmal)
  const left = {};
  for (const g in works) left[g] = Math.ceil(works[g] * CITY.ai.minesPer[g]) - mines[g];
  return out.filter((i) => left[group[DEPOSITS[c.deposit[i] - 1]]]-- > 0);
}

/** Markt der KI: Überschuss verkaufen, Metall zukaufen, wenn es knapp ist. */
function aiMarket(game, team, reserve) {
  const c = game.city[team];
  const main = game.mainFob(team);
  if (!main) return;
  for (const g of ['bm', 'mun', 'fuel']) if (main.store[g] > CITY.ai.sellAbove) game.issue(team, { type: 'trade', good: g, dir: 'sell' });
  if (c.metal > CITY.ai.sellAbove) game.issue(team, { type: 'trade', good: 'metal', dir: 'sell' });
  if (c.metal < CITY.ai.buyMetalBelow && game.teams[team].res.money > reserve + CITY.market.buy.metal) {
    game.issue(team, { type: 'trade', good: 'metal', dir: 'buy' });
  }
  // Baumaterial fehlt (seit v5.20, AP4): Straßen und Anschlüsse kosten es, ohne BM bleiben Werke unangebunden
  if (main.store.bm < CITY.ai.buyBmBelow && game.teams[team].res.money > CITY.market.buy.bm) {
    game.issue(team, { type: 'trade', good: 'bm', dir: 'buy' });
  }
}

/**
 * Angriff auf die gegnerische Stadt (von ai.js jede Sekunde): alle raidEvery s schicken bis zu raidSize untätige Fahrzeuge
 * mit Angriffsmarsch zum nächsten erkundeten gegnerischen Stadtgebäude.
 */
export function aiRaid(game, team, difficulty, dt, mem = cityAiMemory()) {
  const c = game.city?.[team];
  const every = CITY.ai.raidEvery[difficulty] ?? 0;
  if (!c || !every) return;
  mem.raidTimer += dt;
  if (mem.raidTimer < every) return;
  mem.raidTimer = 0;
  const foe = game.city[1 - team];
  const main = game.mainFob(team);
  if (!foe || !main) return;
  // Ziel nach Wert: Werke, Förderung und Markt zuerst, geteilt durch die Entfernung (freie Planung seit v4.85)
  let target = null;
  let best = -Infinity;
  for (const e of foe.ents.values()) {
    if (!e.alive || !game.isExplored(team, e.x, e.y)) continue;
    const k = KINDS[foe.kind[e.cityCell] - 1];
    const v = (CITY.ai.targetValue[k] ?? 1) / (1 + Math.hypot(e.x - main.x, e.y - main.y) / CITY.ai.raidDist);
    if (v > best) {
      best = v;
      target = e;
    }
  }
  if (!target) return;
  const ids = game.units
    .filter((u) => u.alive && u.team === team && !u.def.air && u.def.armor !== 'inf' && u.weapons.length && u.order.type === 'idle' && u.def.damage?.struct > 0)
    .slice(0, CITY.ai.raidSize)
    .map((u) => u.id);
  if (ids.length) game.issue(team, { type: 'attackMove', ids, x: target.x, y: target.y });
}

/**
 * Verteidigung (von ai.js jede Denkrunde): Wird ein eigenes Stadtgebäude beschossen, schickt die KI bis zu defendSize
 * bewaffnete Bodeneinheiten aus der Nähe mit Angriffsmarsch dorthin; Förderanlagen und Werke zuerst.
 */
export function aiDefend(game, team, mem = cityAiMemory()) {
  const c = game.city?.[team];
  if (!c) return;
  const A = CITY.ai;
  if (game.time - mem.defendAt < A.defendCooldown) return;
  let spot = null;
  let best = -1;
  for (const e of c.ents.values()) {
    if (!e.alive || e.lastHitTime < game.time - A.hitRecent) continue;
    const v = A.targetValue[KINDS[c.kind[e.cityCell] - 1]] ?? 1;
    if (v > best) {
      best = v;
      spot = e;
    }
  }
  if (!spot) return;
  const near = game.units
    .filter((u) => u.alive && u.team === team && !u.def.air && u.weapons.length && !u.house && !u.crate && u.order.type !== 'attack' && Math.hypot(u.x - spot.x, u.y - spot.y) < A.defendRange)
    .sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y) || a.id - b.id)
    .slice(0, A.defendSize);
  if (!near.length) return;
  mem.defendAt = game.time;
  game.issue(team, { type: 'attackMove', ids: near.map((u) => u.id), x: spot.x, y: spot.y });
}

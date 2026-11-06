// Stadt (PRD §15), Wirtschaftsschritt updateCity: Gebiet, Ruinen, Einwohner, Wachstum, Gewerbe, Zufriedenheit, Förderung, Werke in
// Kettenfolge, Lager, Munitionswerke, Fliegerhorst, Steuern und Pflege. Lieferwege aus transport.js. Kein DOM, deterministisch.
import { BALANCE } from '../../data/balance.js';
import { CITY } from '../../data/city.js';
import { KIND, KINDS, KIND_ID, WORKS } from '../../data/citykinds.js';
import { STORED_GOODS } from '../../data/goods.js';
import { transportOf, pathEff, addLoad, beginLoads, settleLoads, minFactor } from '../transport.js';
import { updateCare } from './care.js';
import { isFlat, DEPOSITS, isPart, cellsOf, cellFree, releaseCell, hasRoad } from './cells.js';
import { draftedCount, freePop } from './query.js';
import { zeroGoods, zeroStats, updateClaim, occupyCell, totals, syncEntity, dropEntity } from './state.js';

/** Arbeitsspeicher je Stadt (einmal angelegt, kein Allokieren im Schritt): Eingang und Wirkung je Gebäude, Liste der fertigen Gebäude. */
const SCRATCH = new WeakMap();

function scratchOf(c) {
  let w = SCRATCH.get(c);
  if (!w) {
    const n = c.cols * c.rows;
    w = { arr: new Float64Array(n), eff: new Float64Array(n), anchors: new Int32Array(n) };
    SCRATCH.set(c, w);
  }
  return w;
}

/** Werke in der Reihenfolge der Verarbeitung (Hütte liefert Roheisen ans Stahlwerk, bevor dieses rechnet). */
const WORK_ORDER = ['smelter', 'steel', 'bm', 'fuel', 'kero'];

/** Werke mit Ausgangslager (CITY.pickup, seit v5.69): Art-Schlüssel. */
const PICKUP = new Set(CITY.pickup.kinds);

/**
 * Ausgangslager eines Werks (seit v5.69): share des Ausstoßes dieses Schritts geht ohne Straßenweg ins Lager des Werks, höchstens bis
 * cap, nur solange dem Werk ein eigener LKW zugeteilt ist (pickClaim). Liefert die Menge je s, die dort landet (0 ohne Ausstoß oder bei vollem Lager). Zählt als Erzeugung der Ware.
 */
function stockAtWork(c, i, prod, out, dt) {
  if (!c.pickClaim[i] || !(dt > 0) || !(out > 0)) return 0; // ohne zugeteilten LKW zweigt das Werk nichts ab (seit v5.69)
  const put = Math.min(out * CITY.pickup.share * dt, Math.max(0, CITY.pickup.cap - c.out[i]));
  if (!(put > 0)) return 0;
  c.out[i] += put;
  const made = (c.made ??= zeroGoods(STORED_GOODS));
  made[prod] += put;
  return put / dt;
}

/** Arbeitsplätze eines fertigen Gebäudes (wie totals; Förderanlage nur mit Vorkommen). */
function jobsOf(c, i, k, lv) {
  if (k === 'mine') return DEPOSITS[c.deposit[i] - 1] ? CITY.jobsMine[lv] : 0;
  const table = KIND[k]?.jobs; // Register: Tabelle der Arbeitsplätze je Stufe
  return table ? CITY[table][lv] : 0;
}

/**
 * Ein Simulationsschritt der Stadt beider Teams. Nach updateEconomy aufrufen. Die Phasen laufen in fester Reihenfolge (seit v5.60
 * zerlegt, Review Q-06; Rechenreihenfolge unverändert): Gebiet und Rückkehr, Ruinen, Treffer, Einwohner, Wachstum, Wirtschaft
 * (Gewerbe, Zufriedenheit, Förderung, Werke, Lager, Munition, Fliegerhorst, Stau, Steuern), Pflege.
 */
export function updateCity(game, dt) {
  if (!game.city) return;
  game.teams.forEach((team, id) => {
    const c = game.city[id];
    refreshClaim(game, c, dt);
    clearRuins(game, c, id);
    logHits(game, c, dt);
    const P = population(game, c, id, dt);
    growCells(game, c, P, dt);
    const s = produce(game, c, id, P, dt);
    c.stats = s;

    team.res.money += s.money * dt;
    team.rate.money += s.money;
    updateCare(game, c, dt);
  });
}

/** Gebiet regelmäßig neu (FOBs gebaut oder zerstört, neue Stadtgebäude); geflohene Bewohner kehren nach ihrer Ruhezeit zurück. */
function refreshClaim(game, c, dt) {
  c.claimTimer += dt;
  if (c.claimTimer >= CITY.territory.interval) {
    c.claimTimer = 0;
    updateClaim(game, c);
  }
  for (const i of c.list) {
    if (!(c.flee[i] > 0)) continue;
    c.flee[i] = Math.max(0, c.flee[i] - dt);
    if (c.flee[i] === 0) c.ver++; // Bewohner zurück: wieder Pendlerziel (seit v5.20)
  }
}

/** Zerstörte Gebäude werden Ruinen: Zelle frei, nach CITY.ruinTime wächst sie neu (Wiederaufbau). */
function clearRuins(game, c, id) {
  for (const [i, e] of c.ents) {
    if (e.alive && e.hp > 0) continue;
    dropEntity(game, c, i);
    for (const j of cellsOf(c, i)) {
      const col = j % c.cols;
      releaseCell(game, c, col, (j - col) / c.cols);
      c.level[j] = 0;
      c.timer[j] = 0;
    }
    c.timer[i] = -CITY.ruinTime; // Großbau: die Mitte zählt die Zeit für alle Zellen
    c.ver++;
    game.addEffect('explosion', e.x, e.y, 1 - id, e.x, e.y, 'building');
    game.message(id, `${e.def.name} in der Stadt zerstört`, e.x, e.y);
  }
}

/** Treffer merken (KI meidet die Gegend beim Bauen und schickt Verteidiger). */
function logHits(game, c, dt) {
  for (const e of c.ents.values()) {
    if (e.lastHitTime > game.time - dt * 1.5) {
      c.hitLog = (c.hitLog ?? []).filter((h) => h.t > game.time - CITY.ai.dangerTime).slice(1 - CITY.ai.hitLog);
      c.hitLog.push({ x: e.x, y: e.y, t: game.time });
    }
  }
}

/**
 * Einwohner: gefallene Soldaten fehlen der Stadt (müssen neu zuziehen); Zuzug oder Abzug, bis die Wohnplätze gefüllt sind (ohne
 * Arbeit nur ein kleiner Anfang). Ergebnis: Kennzahlen (totals), Arbeitsplätze, Truppen, Einwohner, Arbeitsfähige.
 */
function population(game, c, id, dt) {
  const drafted = draftedCount(game, id);
  if (drafted < c.drafted) c.popF = Math.max(0, c.popF - (c.drafted - drafted));
  c.drafted = drafted;

  const t = totals(c);
  const jobs = t.jobsCom + WORKS.reduce((n, w) => n + t[w], 0) + t.mineJobs + t.jobsOther; // ganze Zahlen: Reihenfolge egal

  const target = jobs > 0 ? t.housing : Math.min(t.housing, CITY.startPop);
  if (c.popF < target) c.popF = Math.min(target, c.popF + CITY.immigration * (0.5 + (c.stats.happy ?? 1)) * dt); // zufriedene Städte ziehen schneller an
  else if (c.popF > target) c.popF = Math.max(target, c.popF - CITY.immigration * dt);
  const pop = c.popF;
  const pool = Math.max(0, pop - drafted); // Einwohner, die arbeiten können
  return { t, jobs, drafted, pop, pool };
}

/** Wachstum der Zellen: Gebäude entstehen nur mit Straßenanschluss (auch Förderanlagen), Ausbau nur bei Bedarf. */
function growCells(game, c, P, dt) {
  const { t, jobs, pool } = P;
  let built = false;
  for (const i of c.list) {
    if (isPart(c, i)) continue; // Großbau wächst über seine Mitte
    const kind = KINDS[c.kind[i] - 1];
    const col = i % c.cols;
    const row = (i - col) / c.cols;
    if (isFlat(c.kind[i]) || !hasRoad(c, col, row)) continue; // seit v5.20 auch Förderanlagen: ohne Straße wachsen sie nicht
    const lv = c.level[i];
    if (lv >= CITY.maxLevel) continue;
    if (lv >= 1 && kind === 'stand') continue; // Stellplatz: Ausbau nur über den Befehl cityUpgrade (seit v5.39)
    const need = lv === 0 ? CITY.growTime : CITY.upgradeTime;
    // Gewerbe (seit v5.20, AP3b): eine neue Stufe nur, solange seine Arbeitsplätze höchstens so viele sind wie Arbeitsfähige × CITY.shop.per
    const wanted = lv === 0 || (kind === 'res' ? jobs >= pool * CITY.demand : kind === 'com' ? t.jobsCom <= pool * CITY.shop.per : pool >= jobs * CITY.demand);
    if (c.timer[i] < need) c.timer[i] += dt;
    if (c.timer[i] >= need && wanted) {
      const all = cellsOf(c, i);
      if (lv === 0) {
        if (!all.every((j) => cellFree(game, c, j % c.cols, Math.floor(j / c.cols)))) continue; // ein Gebäude oder Hindernis steht im Weg: warten
        for (const j of all) occupyCell(game, c, j % c.cols, Math.floor(j / c.cols));
        built = true;
      }
      for (const j of all) c.level[j] = lv + 1;
      c.timer[i] = 0;
      c.ver++;
      syncEntity(game, c, i);
    }
  }
  if (built) updateClaim(game, c);
}

/**
 * Arbeit, Förderung, Verarbeitung, Lager, Steuern (seit v5.20, AP3, PLAN 1.4): Rechnung je Gebäude über seinen Lieferweg.
 * Pendler und Lieferwege kommen aus js/game/transport.js; Last und Stau laufen je Schritt (beginLoads … settleLoads).
 * Ergebnis: die Stadtzahlen des Schritts (c.stats).
 */
function produce(game, c, id, P, dt) {
  const { t, jobs, drafted, pop, pool } = P;
  const fill = jobs > 0 ? Math.min(1, pool / jobs) : 0;
  const s = zeroStats();
  s.pop = pop;
  s.housing = t.housing;
  s.fled = t.fled;
  s.drafted = drafted;
  s.free = freePop(game, id);
  s.jobs = jobs;
  s.jobsCom = t.jobsCom;
  s.workers = jobs * fill;
  s.market = t.market;
  s.fill = fill;
  s.n = t.n; // fertige Gebäude je Art (Flussanzeige)
  // Strom (Stufe 3): Angebot aus Notstrom und Kraftwerken; Mangel bremst Förderung und Werke
  s.powerSupply = CITY.power.base + t.power * fill;
  s.powerUse = t.use;
  s.powerRatio = t.use > 0 ? Math.min(1, s.powerSupply / t.use) : 1;
  const tr = transportOf(game, c);
  const W = scratchOf(c);
  // Arbeitsstand des Schritts für die Phasen unten: eff je Gebäude, arr = Ankunft am Eingang je Gebäude (Rate je s, nur für Werke und
  // Förderung gelesen), anchors = fertige Gebäude (Anker, ohne Straßen und Teile von Großbauten), einmal gesammelt
  const x = { c, s, tr, dt, fill, eff: W.eff, arr: W.arr, anchors: W.anchors, nA: 0, main: null, credit: false };
  for (const i of c.list) {
    if (!c.level[i] || isPart(c, i) || isFlat(c.kind[i])) continue;
    x.anchors[x.nA++] = i;
    x.arr[i] = 0; // Lieferziele sind fertige Gebäude (Anker)
  }
  beginLoads(tr);
  x.main = game.mainFob(id);
  x.credit = !!x.main?.built; // Lager der Hauptstadt steht (sonst gehen Waren zum Lager verloren)
  const shopW = supplyShops(x);
  // Zufriedenheit (Stufe 3): Läden (Versorgung zählt, geteilt durch arbeitsfähige Einwohner), Sicherheit, Strom
  const H = CITY.happy;
  const shop = pool > 0 ? Math.min(1, shopW / (pool * H.shopPer)) : 0;
  s.shop = shop;
  const hits = (c.hitLog ?? []).filter((h) => h.t > game.time - CITY.happy.hitWindow).length;
  const safe = 1 - Math.min(1, hits / H.hitsBad);
  s.happy = pop > 0 ? Math.min(1, H.base + H.shops * shop + H.safety * safe + H.power * s.powerRatio) : 1;
  const mood = H.lo + H.span * s.happy;
  s.mood = mood;
  s.uni = t.uni;
  s.dc = t.dc;
  workEffect(x, fill * s.powerRatio * mood);
  extract(x);
  runWorks(x);
  s.iron = s.gross.iron;
  storeAndMunitions(x);
  fillAirbase(x);
  // Stau: kleinster Stau-Faktor auf den in diesem Schritt benutzten Straßen (1 ohne Stau), dann Glättung für den nächsten Schritt
  s.jam = minFactor(tr);
  settleLoads(tr, dt);
  s.money = (pool * CITY.taxPop + shopW * CITY.taxCom) * mood; // Gewerbe-Steuer nur nach Versorgung (shopW)
  return s;
}

/**
 * Gewerbe und Markt (seit v5.20, AP3b): Baumaterial aus dem Lager der Hauptstadt, über ihren Weg zum Lager (Last = Bedarf).
 * Versorgung v je Gebäude: 0 ohne Weg oder Lager, anteilig, wenn das Lager nicht reicht, × Stau. Steuer und Anteil an der
 * Zufriedenheit wirken mit base + (1 − base) × v. Läuft vor der Zufriedenheit und liest den Lagerstand am Anfang des Schritts.
 * Ergebnis: Arbeiter × Gewichtung (base + (1 − base) × v) für Steuer und Zufriedenheit.
 */
function supplyShops(x) {
  const { c, s, tr, dt, fill, anchors, nA, main, credit } = x;
  const SP = CITY.shop;
  let shopW = 0; // Arbeiter × Gewichtung (base + (1 − base) × v): Steuer und Zufriedenheit
  let shopJ = 0; // Arbeiter in Gewerbe und Markt
  let shopV = 0; // Arbeiter × v (Versorgung)
  let shopTake = 0; // Baumaterial, das in diesem Schritt aus dem Lager geht
  for (let m = 0; m < nA; m++) {
    const i = anchors[m];
    const lv = c.level[i];
    const k = KINDS[c.kind[i] - 1];
    if (k !== 'com' && k !== 'market') continue;
    const workers = jobsOf(c, i, k, lv) * fill;
    const want = SP.need * workers * dt; // Bedarf dieses Schritts (Baumaterial)
    const p = tr.shop.get(i) ?? null;
    let v = 0;
    if (p && want > 0) {
      addLoad(tr, p, SP.need * workers);
      if (credit) {
        const take = Math.min(want, Math.max(0, main.store.bm));
        main.store.bm -= take;
        shopTake += take;
        v = (take / want) * pathEff(tr, p);
      }
    }
    shopW += workers * (SP.base + (1 - SP.base) * v);
    shopJ += workers;
    shopV += workers * v;
  }
  s.shopBm = dt > 0 ? shopTake / dt : 0; // Baumaterial je s, das Gewerbe verbraucht
  s.shopSupply = shopJ > 0 ? shopV / shopJ : 1; // gewichtete Versorgung 0 … 1 (ohne Gewerbe 1)
  return shopW;
}

/** eff_b = Besetzung × Strom × Zufriedenheit (base) × Pendlerwirkung des Gebäudes (kein Pendlerweg: 0). */
function workEffect(x, base) {
  const { c, tr, fill, eff, anchors, nA } = x;
  for (let m = 0; m < nA; m++) {
    const i = anchors[m];
    const lv = c.level[i];
    const k = KINDS[c.kind[i] - 1];
    let commuteEff = 1;
    if (tr.commute.has(i)) {
      // Arbeitsstätte: Pendler laufen über den Pendlerweg zur nächsten Wohnung (Last), die Arbeit wirkt mit dessen Stau
      const p = tr.commute.get(i);
      commuteEff = pathEff(tr, p);
      const jobsB = jobsOf(c, i, k, lv);
      if (p && jobsB > 0) addLoad(tr, p, jobsB * fill * CITY.transport.commute);
    }
    eff[i] = base * commuteEff;
  }
}

/** Förderung: Rohstoff je Förderanlage, Fluss zum nächsten Ziel (Werk); ohne Weg geht er verloren. */
function extract(x) {
  const { c, s, tr, eff, arr, anchors, nA } = x;
  const MINE = KIND_ID.mine;
  for (let m = 0; m < nA; m++) {
    const i = anchors[m];
    if (c.kind[i] !== MINE) continue;
    const lv = c.level[i];
    const d = DEPOSITS[c.deposit[i] - 1];
    if (!d) continue;
    const rawRate = CITY.jobsMine[lv] * eff[i] * CITY.extract[d];
    s.raw[d] += rawRate;
    const r = tr.routes.get(i);
    const p = r ? r.path : null;
    addLoad(tr, p, rawRate);
    if (!p) s.lost += rawRate;
    else arr[r.to] += rawRate * pathEff(tr, p);
  }
}

/** Werke in Kettenfolge (Hütte → Stahlwerk, dann BM, Raffinerien): Ausstoß = min(Leistung, Eingang / Verbrauch), Fluss zum Ziel. */
function runWorks(x) {
  const { c, s, tr, dt, eff, arr, anchors, nA, credit } = x;
  const Y = CITY.yield;
  const K = CITY.convert;
  for (const k of WORK_ORDER) {
    const prod = CITY.chain[k].to;
    const kid = KIND_ID[k];
    for (let m = 0; m < nA; m++) {
      const i = anchors[m];
      if (c.kind[i] !== kid) continue;
      const lv = c.level[i];
      const cap = CITY.jobs[lv] * eff[i] * Y[prod]; // Leistung je s
      const inp = arr[i] / K[prod]; // Produkt je s, das der Eingang hergibt
      const out = Math.min(cap, inp);
      c.workOut[i] = out; // Ausstoß je s am Anker (seit v5.70, Pendlerquelle der KI)
      s.cap[prod] += cap;
      s.inp[prod] += inp;
      s.gross[prod] += out;
      // Ausgangslager (seit v5.69): ein Anteil geht ohne Straßenweg dorthin, der Rest läuft wie bisher
      const kept = PICKUP.has(k) ? stockAtWork(c, i, prod, out, dt) : 0;
      const rest = out - kept;
      const r = tr.routes.get(i);
      const p = r && (r.to !== 'main' || credit) ? r.path : null;
      addLoad(tr, p, rest);
      if (!p) s.lost += rest;
      else if (r.to === 'main') s[prod] += rest * pathEff(tr, p); // Ankunft im Lager (bm, fuel, kero, metal = Stahl)
      else arr[r.to] += rest * pathEff(tr, p); // Roheisen zum Stahlwerk
    }
  }
}

/**
 * Lager gutschreiben (vor den Munitionswerken, die den Stahl daraus ziehen), dann Munitionswerke: ziehen Stahl aus dem Stadtlager
 * über ihren Weg (Hin: Stahl, zurück: Munition), höchstens was da ist; Munition ins Lager der Hauptstadt.
 */
function storeAndMunitions(x) {
  const { c, s, tr, dt, eff, anchors, nA, main, credit } = x;
  const Y = CITY.yield;
  const K = CITY.convert;
  const made = (c.made ??= zeroGoods(STORED_GOODS)); // Summe, die wirklich ins Lager kam (Flussanzeige misst damit den Verbrauch)
  const metal0 = c.metal;
  const kero0 = c.kero;
  if (credit) {
    for (const k of ['bm', 'fuel']) {
      const v0 = main.store[k];
      main.store[k] = Math.min(BALANCE.logistics.capitalCap, v0 + s[k] * dt);
      made[k] += Math.max(0, main.store[k] - v0);
    }
  }
  c.metal = Math.max(0, Math.min(BALANCE.logistics.storeCap, metal0 + s.metal * dt));
  c.kero = Math.max(0, Math.min(BALANCE.logistics.storeCap, kero0 + s.kero * dt));
  made.kero += Math.max(0, c.kero - kero0);
  const stock = c.metal / Math.max(dt, 1e-6); // Stahl je s im Stadtlager
  s.inp.mun = stock / K.mun;
  let drawn = 0; // Stahl je s, den die Munitionswerke ziehen
  const MUN = KIND_ID.mun;
  for (let m = 0; m < nA; m++) {
    const i = anchors[m];
    if (c.kind[i] !== MUN) continue;
    const lv = c.level[i];
    const cap = CITY.jobs[lv] * eff[i] * Y.mun; // Munition je s
    c.workOut[i] = 0; // Ausstoß je s am Anker (seit v5.70); unten gesetzt, wenn Munition fließt
    s.cap.mun += cap;
    const p = tr.mun.get(i) ?? null;
    if (!p || !credit) continue; // ohne Weg zum Lager (oder ohne fertiges Lager): kein Stahl, keine Munition
    const steelUse = Math.min(cap * K.mun, Math.max(0, stock - drawn));
    const w = pathEff(tr, p);
    addLoad(tr, p, steelUse);
    const mun = (steelUse * w) / K.mun; // Munition je s am Werk
    c.workOut[i] = mun;
    const kept = PICKUP.has('mun') ? stockAtWork(c, i, 'mun', mun, dt) : 0; // Ausgangslager (seit v5.69)
    addLoad(tr, p, mun - kept);
    s.gross.mun += mun;
    s.mun += (mun - kept) * w; // Ankunft im Lager
    drawn += steelUse;
  }
  s.metal -= drawn; // Stahl je s: Zugang der Stahlwerke minus Munitionswerke
  c.metal = Math.max(0, c.metal - drawn * dt);
  made.metal += Math.max(0, c.metal - metal0 + drawn * dt); // was die Stahlwerke ins Stadtlager bringen (Munition zählt als Verbrauch)
  if (credit) {
    const v0 = main.store.mun;
    main.store.mun = Math.min(BALANCE.logistics.capitalCap, v0 + s.mun * dt);
    made.mun += Math.max(0, main.store.mun - v0);
  }
}

/**
 * Fliegerhorst (seit v5.35): Kerosintanks aus dem Kerosin des Stadtlagers, Munitionslager aus dem Lager der Hauptstadt befüllen,
 * über ihren Weg zum Lager (Last = Menge), höchstens fill je s und bis zur Lagergröße.
 */
function fillAirbase(x) {
  const { c, tr, dt, anchors, nA, main, credit } = x;
  const KT = KIND_ID.ktank;
  const MD = KIND_ID.mdepot;
  for (let m = 0; m < nA; m++) {
    const i = anchors[m];
    const k = c.kind[i];
    if (k !== KT && k !== MD) continue;
    const e = c.ents.get(i);
    const p = tr.depot.get(i) ?? null;
    if (!e || !p || !credit) continue;
    const A = k === KT ? CITY.air.tank : CITY.air.depot;
    const lv = c.level[i];
    e.stock ??= 0;
    const room = Math.max(0, A.cap[lv] - e.stock) / Math.max(dt, 1e-6);
    const src = k === KT ? c.kero : main.store.mun;
    const want = Math.min(A.fill[lv], room, src / Math.max(dt, 1e-6));
    if (!(want > 0)) continue;
    addLoad(tr, p, want);
    const got = want * pathEff(tr, p);
    if (k === KT) c.kero = Math.max(0, c.kero - want * dt);
    else main.store.mun = Math.max(0, main.store.mun - want * dt);
    e.stock = Math.min(A.cap[lv], e.stock + got * dt);
  }
}

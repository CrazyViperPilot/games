// Stadt (PRD §15), Befehle (nur über game.issue): Zellen ausweisen und räumen (city), Stellplatz ausbauen (cityUpgrade), Markthandel
// (trade). Kein DOM, deterministisch.
import { BALANCE } from '../../data/balance.js';
import { CITY } from '../../data/city.js';
import { KINDS, KIND_ID, KIND_NAME } from '../../data/citykinds.js';
import { STORED_GOODS, MARKET_GOODS, CITY_STORE_GOODS } from '../../data/goods.js';
import { isFlat, idx, sizeOf, anchorOf, bigCells, cellsOf, fitBig, releaseCell, hasRoad, canZone, buildAllowed, buildWhy, roadLinkWhy, airLinkWhy, BUILD_BLOCK } from './cells.js';
import { woodScan, fellTiles, clearableAt, demolish, felledOf } from './clearing.js';
import { hasMarket } from './query.js';
import { zeroGoods, rebuildList, syncEntity, refundQueue, dropEntity } from './state.js';

/** Großbau mit Mitte a abreißen oder überbauen: alle Zellen leer, begehbar, Ziel weg, eigene Ausbildung zurück. */
function clearBig(game, team, c, a) {
  refundQueue(game, team, c.ents.get(a));
  dropEntity(game, c, a);
  for (const j of cellsOf(c, a)) {
    if (c.part[j] !== a + 1) continue;
    const q = j % c.cols;
    if (c.level[j]) releaseCell(game, c, q, (j - q) / c.cols);
    c.kind[j] = 0;
    c.level[j] = 0;
    c.timer[j] = 0;
    c.part[j] = 0;
  }
}

/** Großbau der Art `kind` mit Mitte nahe (col, row) ausweisen (ein Gebäude, Preis CITY.cost je Gebäude). */
function placeBig(game, team, c, kind, col, row) {
  const n = sizeOf(kind);
  const a = fitBig(game, c, col, row, kind, undefined, (j) => buildAllowed(game, c, j, kind));
  if (a < 0) {
    // Mit Baugebiet: liegt der Platz nur am Gebiet, Erkundung oder Feind, sagt die Meldung das (erste gesperrte Zelle)
    const plain = fitBig(game, c, col, row, kind); // ohne Baugebiet: Anschluss-Regeln (Straße, Stellplatz-Bahn) melden trotzdem den Grund
    if (plain >= 0) {
      for (const j of bigCells(c, plain, n)) {
        const why = buildWhy(game, c, j, kind);
        if (why) return { ok: false, reason: BUILD_BLOCK[why] };
      }
      if (roadLinkWhy(game, c, bigCells(c, plain, n), kind)) return { ok: false, reason: BUILD_BLOCK.road }; // Anschlusspflicht (Paket „Straßen“)
      if (airLinkWhy(c, bigCells(c, plain, n), kind)) return { ok: false, reason: BUILD_BLOCK.air }; // Stellplatz: Verbindung zur Startbahn
    }
    return { ok: false, reason: `${KIND_NAME[kind]} braucht ${n} × ${n} freie Zellen` };
  }
  const t = game.teams[team];
  const price = CITY.cost[kind];
  const bm = CITY.costBm[kind] ?? 0;
  const main = game.mainFob(team);
  if (t.res.money < price) return { ok: false, reason: 'Zu wenig Geld' };
  if (bm && (!main || main.store.bm < bm)) return { ok: false, reason: 'Zu wenig Baumaterial im Lager der Hauptstadt' };
  t.res.money -= price;
  if (bm) main.store.bm -= bm;
  for (const j of bigCells(c, a, n)) {
    c.kind[j] = KIND_ID[kind];
    c.level[j] = 0;
    c.timer[j] = 0;
    c.flee[j] = 0;
    c.part[j] = a + 1;
  }
  rebuildList(c);
  const q = a % c.cols;
  return { ok: true, placed: 1, broke: false, noRoad: !hasRoad(c, q, (a - q) / c.cols), anchor: a };
}

/**
 * Befehl `{ type: 'trade', good: 'bm'|'mun'|'fuel'|'metal'|'kero', dir: 'sell'|'buy', count? }`: `count` Lose (CITY.market.lot; Standard 1,
 * höchstens CITY.market.maxCount, Knöpfe ×10 und ×100) am Markt handeln. Reicht Geld, Bestand oder Lagerplatz nicht für alle, werden so viele
 * gehandelt wie möglich ({ ok, done, money }); scheitert schon das erste Los, der Grund. Braucht einen fertigen eigenen Markt.
 * BM, MUN, TS liegen im Lager der Hauptstadt, Stahl und Kerosin im Stadtlager.
 */
export function cmdTrade(game, team, cmd) {
  const n = Math.max(1, Math.min(CITY.market.maxCount, Math.floor(Number(cmd.count) || 1)));
  let done = 0;
  let money = 0;
  let res = null;
  for (let k = 0; k < n; k++) {
    res = tradeLot(game, team, cmd);
    if (!res.ok) break;
    done++;
    money += res.money;
  }
  if (!done) return res;
  return { ok: true, done, money, reason: done < n ? res.reason : undefined };
}

/** Ein Los handeln (cmdTrade). */
function tradeLot(game, team, cmd) {
  const c = game.city?.[team];
  if (!c) return { ok: false, reason: 'Die Stadt ist in dieser Partie ausgeschaltet' };
  if (!MARKET_GOODS.includes(cmd.good) || (cmd.dir !== 'sell' && cmd.dir !== 'buy')) return { ok: false, reason: 'Unbekannter Handel' };
  if (!hasMarket(game, team)) return { ok: false, reason: 'Erst einen Markt bauen' };
  const main = game.mainFob(team);
  const inCity = CITY_STORE_GOODS.includes(cmd.good);
  if (!main && !inCity) return { ok: false, reason: 'Hauptstadt zerstört' };
  const M = CITY.market;
  const cap = inCity ? BALANCE.logistics.storeCap : BALANCE.logistics.capitalCap; // Stadtlager bzw. Lager der Hauptstadt
  const t = game.teams[team];
  const have = inCity ? c[cmd.good] : main.store[cmd.good];
  const add = (v) => {
    if (inCity) c[cmd.good] = Math.min(cap, c[cmd.good] + v);
    else main.store[cmd.good] = Math.min(cap, main.store[cmd.good] + v);
    c.traded ??= zeroGoods(STORED_GOODS); // Summe der Käufe minus Verkäufe (Flussanzeige: zählt nicht als Verbrauch)
    c.traded[cmd.good] = (c.traded[cmd.good] ?? 0) + v;
  };
  if (cmd.dir === 'sell') {
    if (have < M.lot) return { ok: false, reason: 'Zu wenig zum Verkaufen' };
    add(-M.lot);
    t.res.money += M.sell[cmd.good];
    return { ok: true, money: M.sell[cmd.good] };
  }
  if (t.res.money < M.buy[cmd.good]) return { ok: false, reason: 'Zu wenig Geld' };
  if (have + M.lot > cap) return { ok: false, reason: 'Lager voll' };
  t.res.money -= M.buy[cmd.good];
  add(M.lot);
  return { ok: true, money: -M.buy[cmd.good] };
}

/**
 * Befehl `{ type: 'cityUpgrade', buildingId }` (seit v5.39): fertigen eigenen Stellplatz eine Stufe ausbauen (2 Überdachung,
 * 3 Stahlbeton-Shelter) gegen Geld, Baumaterial (Lager der Hauptstadt) und Stahl (Stadtlager), CITY.air.upgrade. Sofort fertig.
 */
export function cmdCityUpgrade(game, team, cmd) {
  const c = game.city?.[team];
  const e = game.getEntity(cmd.buildingId);
  if (!c || !e || !e.alive || e.team !== team || e.cityCell == null) return { ok: false, reason: 'Eigenen Stellplatz wählen' };
  const i = e.cityCell;
  if (KINDS[c.kind[i] - 1] !== 'stand') return { ok: false, reason: 'Nur Stellplätze lassen sich so ausbauen' };
  const lv = c.level[i];
  if (!lv) return { ok: false, reason: 'Der Stellplatz ist noch nicht fertig' };
  const cost = CITY.air.upgrade[lv + 1];
  if (!cost) return { ok: false, reason: 'Schon voll ausgebaut (Stahlbeton-Shelter)' };
  const money = game.teams[team].res.money;
  const main = game.mainFob(team);
  if (money < cost.money) return { ok: false, reason: `Zu wenig Geld (${cost.money} nötig)` };
  if (cost.bm && (!main || main.store.bm < cost.bm)) return { ok: false, reason: `Zu wenig Baumaterial im Lager der Hauptstadt (${cost.bm} nötig)` };
  if (cost.steel && c.metal < cost.steel) return { ok: false, reason: `Zu wenig Stahl (${cost.steel} nötig)` };
  game.teams[team].res.money -= cost.money;
  if (cost.bm) main.store.bm -= cost.bm;
  if (cost.steel) c.metal -= cost.steel;
  for (const j of cellsOf(c, i)) c.level[j] = lv + 1;
  c.timer[i] = 0;
  c.ver++;
  syncEntity(game, c, i);
  game.message?.(team, `${CITY.air.standName[lv + 1]} fertig`, e.x, e.y);
  return { ok: true, level: lv + 1 };
}

/**
 * Befehl `{ type: 'city', kind: 'road'|'res'|'com'|'bm'|'mun'|'fuel'|'erase', c0, r0, c1, r1 }`:
 * Rechteck (Spalten c0..c1, Zeilen r0..r1 im Kartenraster) ausweisen oder räumen. Überall, wo nichts gesperrt ist (seit v4.87).
 * Kostet Geld je Zelle, bis das Geld ausgeht. Seit v5.10 nur auf leeren Zellen: Belegte Zellen werden nicht überbaut (erst räumen).
 * Räumen fällt seit v5.13 auch Bäume (Einzelbäume, Wald), wo danach gebaut werden kann, und reißt seit v5.16 leere Häuser, Hallen und
 * Fabriken der Karte ab (CITY.clearable, kostenlos; besetzte nicht).
 */
export function cmdCity(game, team, cmd) {
  const city = game.city?.[team];
  if (!city) return { ok: false, reason: 'Die Stadt ist in dieser Partie ausgeschaltet' };
  const erase = cmd.kind === 'erase';
  if (!erase && !KIND_ID[cmd.kind]) return { ok: false, reason: 'Unbekannte Zellenart' };
  if (CITY.retired?.includes(cmd.kind)) return { ok: false, reason: `${KIND_NAME[cmd.kind]}: nicht mehr baubar (seit v5.35 Fliegerhorst aus Bahn, Stellplätzen, Tower, Kerosintank und Munitionslager)` };
  const c0 = Math.max(0, Math.min(cmd.c0, cmd.c1) | 0);
  const c1 = Math.min(city.cols - 1, Math.max(cmd.c0, cmd.c1) | 0);
  const r0 = Math.max(0, Math.min(cmd.r0, cmd.r1) | 0);
  const r1 = Math.min(city.rows - 1, Math.max(cmd.r0, cmd.r1) | 0);
  if (!(c1 >= c0 && r1 >= r0)) return { ok: false, reason: 'Außerhalb der Karte' };
  if (!erase && sizeOf(cmd.kind) > 1) {
    // Großbau: ein Gebäude mitten im Rechteck; bei gerader Kantenlänge liegt der Anker links oben der Mitte (seit v5.08; ein Tipp: dort
    // der Anker, das Quadrat reicht nach rechts unten)
    const off = sizeOf(cmd.kind) % 2 ? 0 : 0.5;
    return placeBig(game, team, city, cmd.kind, Math.round((c0 + c1) / 2 - off), Math.round((r0 + r1) / 2 - off));
  }
  const id = erase ? 0 : KIND_ID[cmd.kind];
  // Ergebnis je Rechteck: gesetzte Zellen und Gründe, warum andere nicht gingen
  const f = { placed: 0, broke: false, outside: false, rule: null, noDeposit: false, occupied: false, felled: 0, stuck: false, manned: false, razed: 0, kept: false };
  const S = city.cell;
  const scan = erase ? woodScan(game, c0 * S, r0 * S, (c1 + 1) * S, (r1 + 1) * S) : null;
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = idx(city, col, row);
      if (erase && city.deposit[i] && !cmd.demolish) {
        // Räumen lässt Rohstoffvorkommen (und Förderanlagen darauf) stehen; nur „Abreißen“ eines gewählten Gebäudes entfernt sie
        f.kept = true;
        continue;
      }
      if (erase && city.blocked[i]) clearMapCell(game, city, col, row, scan, f);
      else zoneCell(game, team, city, col, row, cmd, id, f);
    }
  }
  if (!f.placed) return { ok: false, reason: failReason(f, erase) };
  rebuildList(city);
  // Zonen ohne Straße daneben wachsen nicht (auch Förderanlagen): melden
  let noRoad = false;
  if (!erase && !isFlat(KIND_ID[cmd.kind])) {
    for (let row = r0; row <= r1 && !noRoad; row++) for (let col = c0; col <= c1; col++) if (city.kind[idx(city, col, row)] === id && !hasRoad(city, col, row)) noRoad = true;
  }
  return { ok: true, placed: f.placed, broke: !!f.broke, noRoad, occupied: f.occupied, felled: f.felled, razed: f.razed, manned: f.manned, kept: f.kept };
}

/** Räumen auf einer gesperrten Zelle: Gebäude der Karte abreißen (seit v5.16), dann Bäume fällen (seit v5.13); beides kostenlos. */
function clearMapCell(game, city, col, row, scan, f) {
  const i = idx(city, col, row);
  // Gebäude der Karte abreißen: Häuser, Hallen, Fabriken; besetzte bleiben stehen
  const list = clearableAt(game, city, col, row);
  if (!list) {
    f.manned = true;
    return;
  }
  for (const b of list) demolish(game, b, scan);
  if (list.length) f.razed += list.length;
  if (!city.blocked[i]) {
    f.placed++;
    return;
  }
  // Bäume fällen: nur wo danach gebaut werden kann; Fels, Wasser, Häuser bleiben gesperrt
  const tiles = fellTiles(game, city, col, row, scan);
  if (!tiles) {
    f.stuck = true;
    return;
  }
  for (const t of tiles) game.grid.terrain[t] = 0;
  city.blocked[i] = 0;
  felledOf(game)[i] = 1;
  f.felled++;
  f.placed++;
}

/** Eine Zelle ausweisen (Zellenart id) oder räumen (id 0): Preis in Geld und Baumaterial, alte Belegung und Ausbildung weg. */
function zoneCell(game, team, city, col, row, cmd, id, f) {
  const erase = id === 0;
  const i = idx(city, col, row);
  if (city.kind[i] === id) return;
  if (!erase && city.kind[i]) {
    f.occupied = true; // nichts überbauen (seit v5.10): erst räumen
    return;
  }
  if (!erase && !canZone(game, city, i)) {
    if (!city.blocked[i] && !city.claim[i]) f.outside = true;
    return;
  }
  if (!erase && game.buildRules) {
    const why = buildWhy(game, city, i, cmd.kind); // Baugebiet (seit v5.78): Gebiet, Erkundung, Konfliktzone, Feind
    if (why) {
      f.rule = why;
      return;
    }
  }
  if (cmd.kind === 'mine' && !city.deposit[i]) {
    f.noDeposit = true; // Förderanlagen nur auf Rohstoffvorkommen
    return;
  }
  if (!erase) {
    const t = game.teams[team];
    const main = game.mainFob(team);
    const price = CITY.cost[cmd.kind];
    const bm = CITY.costBm[cmd.kind] ?? 0;
    if (t.res.money < price || (bm && (!main || main.store.bm < bm))) {
      f.broke = t.res.money < price ? 'money' : 'bm';
      return;
    }
    t.res.money -= price;
    if (bm) main.store.bm -= bm;
  }
  if (city.part[i]) clearBig(game, team, city, anchorOf(city, i)); // Räumen: Großbau ganz weg (alle Zellen)
  if (city.level[i]) releaseCell(game, city, col, row);
  refundQueue(game, team, city.ents.get(i)); // eigene Ausbildung zurück
  dropEntity(game, city, i);
  city.kind[i] = id;
  city.level[i] = 0;
  city.timer[i] = 0;
  city.flee[i] = 0;
  f.placed++;
}

/** Meldung, wenn kein Feld gesetzt wurde (wichtigster Grund zuerst). */
function failReason(f, erase) {
  const poor = f.broke === 'bm' ? 'Zu wenig Baumaterial im Lager der Hauptstadt' : 'Zu wenig Geld';
  return f.kept && erase ? 'Rohstoffvorkommen werden beim Räumen nicht angetastet' : f.broke ? poor : f.occupied ? 'Dort steht schon etwas: erst räumen' : f.noDeposit ? 'Förderanlagen nur auf Rohstoffvorkommen' : f.outside ? 'Nur im eigenen Gebiet bauen' : f.rule ? BUILD_BLOCK[f.rule] : f.manned ? 'Besetzte Häuser lassen sich nicht räumen' : f.stuck ? 'Nur Bäume und Häuser lassen sich räumen, kein Fels, Wasser, Turm oder Mauer' : 'Nichts zu ändern';
}

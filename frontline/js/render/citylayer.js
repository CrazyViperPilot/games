// Stadt auf der Karte (PRD §15): Straßen, ausgewiesene Zonen, Gebäude, Gebietsgrenzen und im Baumodus das gezogene Rechteck.
// Liest nur game.city (und ren.cityUi, die Stadtleiste). 2D: flach von oben; isometrisch: Boden hier, Gebäude als Stadthäuser
// über drawTownBuilding (renderer.js).
import { KINDS, KIND_ID, DEPOSITS, cellRect, canZone, hasRoad, sizeOf, fitBig, bigCenter, bigSpan } from '../game/city.js';
import { BIG_KINDS, bigPlan, drawBigGround, drawBigTop, partFoot, bigTop } from './bigbuild.js';
import { drawWorksTop, worksLift, WORKS_GROUND, WORKS_KINDS } from './works.js';
import { CITY } from '../data/city.js';
import { CITY_COLORS, CITY_ICON } from '../ui/citypanel.js';
import { drawUniversityTop, UNI_LAWNS } from './university.js';
import { drawTownTop, townLift } from './townhouses.js';

// Grundstücke in der Farbe der Zellenart (wie die Werkzeugleiste): Wohnen grün, Gewerbe blau, Werke erdig, Markt gold, Militär oliv
const LOT = CITY_COLORS;
/** Hex-Farbe a mit b mischen (t = Anteil von a). */
function mix(a, b, t) {
  const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) * t + p(b, i) * (1 - t))).join(',')})`;
}
const LOT_BUILT = Object.fromEntries(Object.entries(LOT).map(([k, c]) => [k, mix(c, '#8b8d84', 0.5)])); // Pflaster unter Gebäuden, getönt
// Schilder über den Gebäuden (seit v4.96): Funktionsgebäude groß mit Symbol, Wohnen und Gewerbe klein (privat ⌂ grün, kommerziell ▣ blau)
const MINE_ICON = { wood: '🌲', stone: '⛰', ore: '⛏', oil: '🛢' };
const MINE_COLOR = { wood: '#3f8a3f', stone: '#8f8f88', ore: '#c4612f', oil: '#34343a' };
const SMALL = { res: 1, com: 1 };
// Höhe des Schilds über dem Boden je Gebäudeform (Weltpixel, isometrisch)
const BIG_LIFT = [0, 76, 98, 106]; // Universität je Stufe: über der Kuppel
// Rohstoffvorkommen: Bodenfarbe und Farbe der Tupfen (Bäume, Steine, Erzbrocken, Öllachen)
const DEP_GROUND = { wood: 'rgba(30,70,30,0.55)', stone: 'rgba(120,120,115,0.55)', ore: 'rgba(140,70,40,0.55)', oil: 'rgba(20,20,24,0.6)' };
const DEP_DOT = { wood: '#1f5a24', stone: '#b9b9b0', ore: '#c4612f', oil: '#0b0b0e' };
const DOTS = [[0.25, 0.3, 0.16], [0.68, 0.25, 0.13], [0.45, 0.62, 0.18], [0.78, 0.7, 0.12], [0.2, 0.75, 0.11]];

/** Sichtbare Stadtzellen beider Teams: eigene immer, fremde nur, wo das Gelände erkundet ist. */
function* cells(game, team, known) {
  if (!game.city) return;
  for (const c of game.city) {
    for (const i of c.list) {
      const k = KINDS[c.kind[i] - 1];
      if (!k) continue;
      const col = i % c.cols;
      const r = cellRect(c, col, (i - col) / c.cols);
      if (c.team !== team && !known(r.x, r.y)) continue;
      // Großbau (seit v5.00): big = 'anchor' für die Mitte, 'part' für die übrigen Zellen; Ruine nach dem Zeitgeber der Mitte
      const p = c.part?.[i];
      const a = p ? p - 1 : i;
      const big = p ? (a === i ? 'anchor' : 'part') : null;
      // ctr: Mitte des ganzen Gebäudes (Großbau mit gerader Kantenlänge: zwischen den Zellen, seit v5.03)
      yield { c, k, lv: c.level[i], r, i, big, ctr: big === 'anchor' ? bigCenter(c, i, sizeOf(k)) : r, ruin: !c.level[i] && c.timer[a] < 0 };
    }
  }
}

/** Farbvariante (0..2) eines 1 × 1-Gebäudes, fest je Zelle (townhouses.js). */
const variantOf = (i) => ((Math.imul(i ^ 0x5bd1, 2654435761) >>> 16) % 3);

/** Angaben für townhouses.js: Zellenart, Stufe, Teamfarbe, Variante und bei Förderanlagen das Vorkommen. */
const townObj = (c, k, lv, r, i, color, damage) => ({
  x: r.x,
  y: r.y,
  w: 56,
  h: 56,
  kind: 'town',
  ck: k,
  level: lv,
  color,
  variant: variantOf(i),
  dep: k === 'mine' ? DEPOSITS[c.deposit[i] - 1] ?? null : null,
  damage,
});

/** Gebäude als Stadthaus-Objekte { x, y, w, h, kind, … } für die Iso-Ansicht (1 × 1: kind 'town', gezeichnet in townhouses.js). */
export function cityBuildings(game, team, known, inRect) {
  const out = [];
  for (const { c, k, lv, r, i, big, ctr } of cells(game, team, known)) {
    if (k === 'road' || !lv || big === 'part' || !inRect(ctr.x, ctr.y, big ? (sizeOf(k) * c.cell) / 2 : 0)) continue;
    const e = c.ents.get(i);
    const color = c.team < 2 ? game.teams[c.team].color : '#888';
    const damage = e ? 1 - e.hp / e.def.hp : 0;
    if (big && BIG_KINDS.has(k)) {
      // Großbau (seit v5.03): jeder Körper ein eigenes Objekt, damit die Tiefenordnung auch große Anlagen richtig zeigt (bigbuild.js)
      bigPlan(k, lv, ctr.x, ctr.y, sizeOf(k) * c.cell).bodies.forEach((p, n) => out.push({ ...partFoot(p), kind: 'bigpart', part: p, color, damage: n ? 0 : damage }));
      continue;
    }
    if (big) {
      // Großbau: ein Objekt über das ganze Quadrat (eigenes Bild über isobuild.js: Universität university.js, Werke works.js seit v5.08)
      const w = sizeOf(k) * c.cell;
      out.push({ x: ctr.x, y: ctr.y, w, h: w, kind: k, level: lv, color, damage });
      continue;
    }
    out.push(townObj(c, k, lv, r, i, color, damage)); // 1 × 1 (seit v5.14): eigenes Bild je Art und Stufe (townhouses.js)
  }
  return out;
}

/** Viereck auf dem Boden als Pfad (mit Gelände in Bildschirmkoordinaten, sonst in Weltkoordinaten). */
function groundRect(ren, ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  if (!ren.draping()) {
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    return;
  }
  const cam = ren.camera;
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], n) => {
    const p = cam.worldToScreen(x, y);
    if (n) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
}

/** Boden der Stadt: Straßen, Grundstücke (blass = nur ausgewiesen) und Pflaster unter Gebäuden. */
export function drawCityGround(ren, ctx, team, known, inRect) {
  const g = ren.game;
  if (!g.city && !g.roads) return;
  ctx.save();
  if (ren.draping()) ctx.setTransform(ren.dpr, 0, 0, ren.dpr, 0, 0);
  if (!g.city) {
    drawRoads(ren, ctx, team, known); // ohne Stadt: nur die Stadtstraßen der Karte (Zone)
    ctx.restore();
    return;
  }
  drawDeposits(ren, ctx, known);
  drawClearings(ren, ctx, known);
  for (const { c, k, lv, r, ruin, big, ctr } of cells(g, team, known)) {
    if (!inRect(ctr.x, ctr.y, big ? (sizeOf(k) * c.cell) / 2 + 32 : 64)) continue;
    if (ruin) {
      // Ruine: Schutt, bis die Zelle neu wächst
      groundRect(ren, ctx, r.x0 + 4, r.y0 + 4, r.x1 - 4, r.y1 - 4);
      ctx.fillStyle = '#4a4540';
      ctx.fill();
      for (const [fx, fy, fr] of DOTS) groundDot(ren, ctx, r.x0 + fx * 64, r.y0 + fy * 64, fr * 40, '#2b2826');
      continue;
    }
    if (k === 'road' || big === 'part') continue; // Straßen danach in einem Zug (drawRoads); Großbau zeichnet seine Mitte
    if (big) {
      drawBigLot(ren, ctx, c, k, lv, r, team, ctr);
      continue;
    }
    groundRect(ren, ctx, r.x0 + 3, r.y0 + 3, r.x1 - 3, r.y1 - 3);
    ctx.fillStyle = lv ? LOT_BUILT[k] : LOT[k] + '55';
    ctx.fill();
    ctx.strokeStyle = LOT[k];
    ctx.lineWidth = ren.draping() ? Math.max(2, 4 * ren.camera.zoom) : 5;
    ctx.stroke();
    if (!lv && k !== 'mine' && c.team === team) {
      // ausgewiesen, aber noch nicht gebaut: Fortschritt als Balken, rot ohne Straße daneben
      const col = Math.floor(r.x0 / c.cell);
      const row = Math.floor(r.y0 / c.cell);
      const linked = hasRoad(c, col, row);
      const f = linked ? Math.max(0, Math.min(1, c.timer[row * c.cols + col] / CITY.growTime)) : 1;
      groundRect(ren, ctx, r.x0 + 8, r.y + 4, r.x0 + 8 + (r.x1 - r.x0 - 16) * f, r.y + 12);
      ctx.fillStyle = linked ? '#e8e2a0' : '#e0553a';
      ctx.fill();
    }
  }
  drawRoads(ren, ctx, team, known);
  drawTerritory(ren, ctx, team, known);
  ctx.restore();
}

/**
 * Grundstück eines Großbaus: ausgewiesen blass mit Fortschritt; gebaut die Universität als Pflaster mit vier Rasenflächen, die
 * anderen (Kraftwerk, Kaserne, Fabrikhalle, Flughafen) mit ihrem Boden aus bigbuild.js (Bahnen, Höfe, Plätze). r: Ankerzelle, m: Mitte.
 */
function drawBigLot(ren, ctx, c, k, lv, r, team, m) {
  const h = (sizeOf(k) * c.cell) / 2;
  const x0 = m.x - h;
  const y0 = m.y - h;
  if (lv && BIG_KINDS.has(k)) {
    const zl = ren.draping() ? ren.camera.zoom : 1;
    drawBigGround(
      {
        rect: (a, b, c2, d, color) => {
          groundRect(ren, ctx, a, b, c2, d);
          ctx.fillStyle = color;
          ctx.fill();
        },
        line: (a, b, c2, d, color, w) => {
          ctx.beginPath();
          groundLine(ren, ctx, a, b, c2, d);
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.8, w * zl);
          ctx.stroke();
        },
      },
      bigPlan(k, lv, m.x, m.y, 2 * h),
    );
    groundRect(ren, ctx, x0 + 3, y0 + 3, m.x + h - 3, m.y + h - 3);
    ctx.strokeStyle = LOT[k];
    ctx.lineWidth = ren.draping() ? Math.max(2, 4 * ren.camera.zoom) : 5;
    ctx.stroke();
    return;
  }
  groundRect(ren, ctx, x0 + 3, y0 + 3, m.x + h - 3, m.y + h - 3);
  ctx.fillStyle = lv ? WORKS_GROUND[k] ?? '#d3cbb6' : LOT[k] + '55'; // Werke (seit v5.08): Pflaster, Schotter oder Erde je Werk
  ctx.fill();
  ctx.strokeStyle = LOT[k];
  ctx.lineWidth = ren.draping() ? Math.max(2, 4 * ren.camera.zoom) : 5;
  ctx.stroke();
  if (lv && k !== 'uni') return;
  if (lv) {
    for (const [u0, v0, u1, v1] of UNI_LAWNS) {
      groundRect(ren, ctx, r.x + u0, r.y + v0, r.x + u1, r.y + v1);
      ctx.fillStyle = '#76a65a';
      ctx.fill();
      ctx.strokeStyle = '#9bbf7c';
      ctx.lineWidth = ren.draping() ? Math.max(1, 2 * ren.camera.zoom) : 2;
      ctx.stroke();
    }
    return;
  }
  if (c.team !== team) return;
  const i = Math.floor(r.y0 / c.cell) * c.cols + Math.floor(r.x0 / c.cell);
  const linked = hasRoad(c, i % c.cols, Math.floor(i / c.cols));
  const f = linked ? Math.max(0, Math.min(1, c.timer[i] / CITY.growTime)) : 1;
  groundRect(ren, ctx, x0 + 16, m.y - 6, x0 + 16 + (2 * h - 32) * f, m.y + 6);
  ctx.fillStyle = linked ? '#e8e2a0' : '#e0553a';
  ctx.fill();
}

// Straßen (v4.97): je Zelle nach den Straßennachbarn Gerade, Kurve, Sackgasse, T-Stück oder Kreuzung. Gehweg an Seiten ohne
// Anschluss, an Kurven als Bogen; weiße Mittellinie (gestrichelt, in Kurven gebogen); Kreuzungen und T-Stücke frei, davor
// Zebrastreifen. Alles als Flächen in Zellkoordinaten; die drei Pfade (Asphalt, Gehweg, Markierung) für alle Straßen werden
// nur neu gebaut, wenn sich Straßen, Sicht, Drehung oder Gelände ändern, sonst je Bild nur drei Füllungen.
export const ROAD = { asphalt: '#4e514b', walk: '#9b9a90', mark: 'rgba(240,238,226,0.88)', kerb: 7, line: 2.6 }; // auch die Brücken (bridge.js)
const RN = 1, RE = 2, RS = 4, RW = 8; // Straßennachbarn
const DNE = 16, DSE = 32, DSW = 64, DNW = 128; // Straße auch diagonal (dann keine Gehwegecke)
const ZN = 256, ZE = 512, ZS = 1024, ZW = 2048; // Zebrastreifen an dieser Seite (Nachbar ist Kreuzung oder T-Stück)

// Straßenbild v: { cols, rows, kind } mit kind[i] ≠ 0 für jede sichtbare Straße (eigene, erkundete fremde, Stadtstraßen der Karte)
function isRoad(v, col, row) {
  return col >= 0 && row >= 0 && col < v.cols && row < v.rows && v.kind[row * v.cols + col] !== 0;
}

/** Zahl der Straßennachbarn (4er-Nachbarschaft). */
function degree(v, col, row) {
  return +isRoad(v, col, row - 1) + +isRoad(v, col + 1, row) + +isRoad(v, col, row + 1) + +isRoad(v, col - 1, row);
}

/** Bitmaske einer Straßenzelle im Straßenbild v: Nachbarn (RN, RE, RS, RW), Diagonalen (DNE …) und Zebrastreifen (ZN …). */
export function roadMask(v, col, row) {
  let m = 0;
  if (isRoad(v, col, row - 1)) m |= RN;
  if (isRoad(v, col + 1, row)) m |= RE;
  if (isRoad(v, col, row + 1)) m |= RS;
  if (isRoad(v, col - 1, row)) m |= RW;
  if (isRoad(v, col + 1, row - 1)) m |= DNE;
  if (isRoad(v, col + 1, row + 1)) m |= DSE;
  if (isRoad(v, col - 1, row + 1)) m |= DSW;
  if (isRoad(v, col - 1, row - 1)) m |= DNW;
  const n = m & 15;
  if (n === (RN | RS)) {
    if (degree(v, col, row - 1) >= 3) m |= ZN;
    if (degree(v, col, row + 1) >= 3) m |= ZS;
  } else if (n === (RE | RW)) {
    if (degree(v, col + 1, row) >= 3) m |= ZE;
    if (degree(v, col - 1, row) >= 3) m |= ZW;
  }
  return m;
}

// Aktuelle Zelle beim Bauen der Pfade: Ursprung und Kante in Weltkoordinaten; mit Gelände (Q gesetzt) die vier Ecken
// in Pfadkoordinaten (Punkte dazwischen bilinear).
const Q = new Float64Array(8);
let qx = 0;
let qy = 0;
let qS = 64;
let qDrape = false;

/** Punkt (u, v) der aktuellen Zelle (0 … S) an den Pfad anhängen. */
function vtx(ctx, u, v, first) {
  let x = qx + u;
  let y = qy + v;
  if (qDrape) {
    const s = u / qS;
    const t = v / qS;
    const a = (1 - s) * (1 - t);
    const b = s * (1 - t);
    const d = s * t;
    const e = (1 - s) * t;
    x = Q[0] * a + Q[2] * b + Q[4] * d + Q[6] * e;
    y = Q[1] * a + Q[3] * b + Q[5] * d + Q[7] * e;
  }
  if (first) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
}

function rectUV(ctx, u0, v0, u1, v1) {
  vtx(ctx, u0, v0, true);
  vtx(ctx, u1, v0);
  vtx(ctx, u1, v1);
  vtx(ctx, u0, v1);
  ctx.closePath();
}

/** Innere Ecke einer Kurve (wo beide Anschlüsse zusammenstoßen) als [u, v, Richtung u, Richtung v], sonst null. */
function curveCorner(n, S) {
  if (n === (RN | RE)) return [S, 0, -1, 1];
  if (n === (RE | RS)) return [S, S, -1, -1];
  if (n === (RS | RW)) return [0, S, 1, -1];
  if (n === (RW | RN)) return [0, 0, 1, 1];
  return null;
}

/** Gehweg: Streifen an Seiten ohne Anschluss, Ecken zwischen zwei Anschlüssen; in Kurven die Außenseite als Bogen. */
function roadWalk(ctx, m, S) {
  const k = ROAD.kerb;
  const n = m & 15;
  const cc = curveCorner(n, S);
  if (cc) {
    const [cu, cv, su, sv] = cc;
    const R = S - k;
    const steps = 8;
    for (let j = 0; j <= steps; j++) {
      const a = (j / steps) * Math.PI * 0.5;
      vtx(ctx, cu + su * R * Math.cos(a), cv + sv * R * Math.sin(a), !j);
    }
    vtx(ctx, cu, cv + sv * S);
    vtx(ctx, cu + su * S, cv + sv * S);
    vtx(ctx, cu + su * S, cv);
    ctx.closePath();
    const diag = n === (RN | RE) ? DNE : n === (RE | RS) ? DSE : n === (RS | RW) ? DSW : DNW;
    if (!(m & diag)) rectUV(ctx, Math.min(cu, cu + su * k), Math.min(cv, cv + sv * k), Math.max(cu, cu + su * k), Math.max(cv, cv + sv * k));
    return;
  }
  if (!(n & RN)) rectUV(ctx, 0, 0, S, k);
  if (!(n & RE)) rectUV(ctx, S - k, 0, S, S);
  if (!(n & RS)) rectUV(ctx, 0, S - k, S, S);
  if (!(n & RW)) rectUV(ctx, 0, 0, k, S);
  if ((n & (RN | RE)) === (RN | RE) && !(m & DNE)) rectUV(ctx, S - k, 0, S, k);
  if ((n & (RE | RS)) === (RE | RS) && !(m & DSE)) rectUV(ctx, S - k, S - k, S, S);
  if ((n & (RS | RW)) === (RS | RW) && !(m & DSW)) rectUV(ctx, 0, S - k, k, S);
  if ((n & (RW | RN)) === (RW | RN) && !(m & DNW)) rectUV(ctx, 0, 0, k, k);
}

/** Zebrastreifen quer über die Fahrbahn an einer Seite (vertical: Straße läuft Nord-Süd). */
function zebra(ctx, S, vertical, near) {
  const k = ROAD.kerb + 2;
  const bars = 6;
  const bw = 4;
  const gap = (S - 2 * k - bars * bw) / (bars - 1);
  const a = near ? 2 : S - 14;
  for (let j = 0; j < bars; j++) {
    const p = k + j * (bw + gap);
    if (vertical) rectUV(ctx, p, a, p + bw, a + 12);
    else rectUV(ctx, a, p, a + 12, p + bw);
  }
}

/** Weiße Markierung: Mittellinie (gerade, Kurve, Sackgasse) und Zebrastreifen vor Kreuzungen. */
function roadMarks(ctx, m, S) {
  const n = m & 15;
  const w = ROAD.line / 2;
  const h = S / 2;
  const cc = curveCorner(n, S);
  if (cc) {
    const [cu, cv, su, sv] = cc;
    const L = Math.PI * 0.5 * h;
    for (const [s0, s1] of [[8, 18], [L - 18, L - 8]]) {
      const a0 = s0 / h;
      const a1 = s1 / h;
      for (let j = 0; j <= 3; j++) {
        const a = a0 + ((a1 - a0) * j) / 3;
        vtx(ctx, cu + su * (h + w) * Math.cos(a), cv + sv * (h + w) * Math.sin(a), !j);
      }
      for (let j = 3; j >= 0; j--) {
        const a = a0 + ((a1 - a0) * j) / 3;
        vtx(ctx, cu + su * (h - w) * Math.cos(a), cv + sv * (h - w) * Math.sin(a));
      }
      ctx.closePath();
    }
    return;
  }
  // Striche bei 10–22 und 42–54 (Takt 32): über Zellgrenzen gleichmäßig
  const dashV = (v0) => rectUV(ctx, h - w, v0, h + w, v0 + 12);
  const dashU = (u0) => rectUV(ctx, u0, h - w, u0 + 12, h + w);
  if (n === (RN | RS)) {
    if (m & ZN) zebra(ctx, S, true, true);
    else dashV(10);
    if (m & ZS) zebra(ctx, S, true, false);
    else dashV(S - 22);
  } else if (n === (RE | RW)) {
    if (m & ZW) zebra(ctx, S, false, true);
    else dashU(10);
    if (m & ZE) zebra(ctx, S, false, false);
    else dashU(S - 22);
  } else if (n === RN) dashV(10);
  else if (n === RS) dashV(S - 22);
  else if (n === RW) dashU(10);
  else if (n === RE) dashU(S - 22);
}

// Zwischenspeicher der Straßenpfade (eine Partie, eine Ansicht)
const cache = { key: '', game: null, relief: null, paths: null };

/**
 * Alle sichtbaren Straßen (eigene immer, fremde wo erkundet): Asphalt, Gehweg, Markierung als je ein Pfad.
 * Flach (2D und Iso ohne Gelände) in Weltkoordinaten unter der Welt-Transformation. Mit Gelände in Koordinaten
 * „Weltpunkt durch die Iso-Drehung bei Zoom 1, minus Geländehöhe“: Bildschirm = Ursprung + Zoom · Punkt, also nur
 * eine Transformation je Bild, solange die Drehung gleich bleibt.
 */
function drawRoads(ren, ctx, team, known) {
  const g = ren.game;
  const cam = ren.camera;
  const drape = ren.draping();
  const z = cam.zoom;
  let ax = 0;
  let ay = 0;
  let u1x = 1;
  let u1y = 0;
  let u2x = 0;
  let u2y = 1;
  if (drape) {
    const o = cam.worldToScreenFlat(0, 0);
    const e1 = cam.worldToScreenFlat(1000, 0);
    const e2 = cam.worldToScreenFlat(0, 1000);
    ax = o.x;
    ay = o.y;
    u1x = (e1.x - o.x) / (1000 * z);
    u1y = (e1.y - o.y) / (1000 * z);
    u2x = (e2.x - o.x) / (1000 * z);
    u2y = (e2.y - o.y) / (1000 * z);
  }
  // Fingerabdruck: alle Straßenzellen der Städte mit Sichtbarkeit, dazu die Ansicht (Stadtstraßen der Karte ändern sich nicht)
  let h = 0;
  let n = g.roads ? 1 : 0;
  for (const c of g.city ?? []) {
    for (const i of c.list) {
      if (c.kind[i] !== KIND_ID.road) continue;
      const col = i % c.cols;
      const vis = c.team === team || known(c.x0 + (col + 0.5) * c.cell, c.y0 + ((i - col) / c.cols + 0.5) * c.cell);
      h = (Math.imul(h, 31) + i * 4 + c.team * 2 + (vis ? 1 : 0)) | 0;
      if (vis) n++;
    }
  }
  if (!n) return;
  const view = drape ? `${u1x.toFixed(5)},${u1y.toFixed(5)},${u2x.toFixed(5)},${u2y.toFixed(5)}` : 'flat';
  const key = `${h}|${n}|${view}`;
  if (key !== cache.key || cache.game !== g || cache.relief !== (drape ? cam.relief : null)) {
    cache.key = key;
    cache.game = g;
    cache.relief = drape ? cam.relief : null;
    cache.paths = buildRoads(g, roadView(g, team, known), drape ? cam.relief : null, u1x, u1y, u2x, u2y);
  }
  ctx.save();
  if (drape) ctx.setTransform(ren.dpr * z, 0, 0, ren.dpr * z, ren.dpr * ax, ren.dpr * ay);
  const [asphalt, walk, mark] = cache.paths;
  ctx.fillStyle = ROAD.asphalt;
  ctx.fill(asphalt);
  ctx.fillStyle = ROAD.walk;
  ctx.fill(walk);
  ctx.fillStyle = ROAD.mark;
  ctx.fill(mark);
  ctx.restore();
}

/**
 * Straßenbild für den Betrachter `team`: Stadtstraßen der Karte (1 Zone, 2 Brücke), eigene Straßen und fremde, wo erkundet (3).
 * Eine Zelle, die mehrere Arten trägt, zählt einmal.
 */
function roadView(g, team, known) {
  const R = g.roads;
  const S = R?.cell ?? CITY.cell;
  const c0 = g.city?.[0];
  const cols = R?.cols ?? c0.cols;
  const rows = R?.rows ?? c0.rows;
  const kind = R ? R.kind.slice() : new Uint8Array(cols * rows);
  for (const c of g.city ?? []) {
    for (const i of c.list) {
      if (c.kind[i] !== KIND_ID.road || kind[i]) continue;
      const col = i % c.cols;
      if (c.team !== team && !known((col + 0.5) * S, ((i - col) / c.cols + 0.5) * S)) continue;
      kind[i] = 3;
    }
  }
  return { cols, rows, cell: S, kind };
}

/** Die drei Straßenpfade neu bauen (relief gesetzt: Pfadkoordinaten mit Gelände, siehe drawRoads). Brücken zeichnet bridge.js. */
function buildRoads(g, v, relief, u1x, u1y, u2x, u2y) {
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  qDrape = !!relief;
  const S = v.cell;
  for (let i = 0; i < v.kind.length; i++) {
    if (!v.kind[i] || v.kind[i] === 2) continue;
    const col = i % v.cols;
    const row = (i - col) / v.cols;
    const x0 = col * S;
    const y0 = row * S;
    qx = x0;
    qy = y0;
    qS = S;
    if (relief) {
      const pts = [x0, y0, x0 + S, y0, x0 + S, y0 + S, x0, y0 + S];
      for (let k = 0; k < 8; k += 2) {
        const x = pts[k];
        const y = pts[k + 1];
        Q[k] = x * u1x + y * u2x;
        Q[k + 1] = x * u1y + y * u2y - relief.displayAt(x, y);
      }
    }
    const m = roadMask(v, col, row);
    rectUV(paths[0], 0, 0, S, S);
    roadWalk(paths[1], m, S);
    roadMarks(paths[2], m, S);
  }
  return paths;
}

/** Kreis auf dem Boden (mit Gelände in Bildschirmkoordinaten). */
function groundDot(ren, ctx, x, y, rad, color) {
  ctx.beginPath();
  if (ren.draping()) {
    const p = ren.camera.worldToScreen(x, y);
    ctx.ellipse(p.x, p.y, rad * ren.camera.zoom, rad * ren.camera.zoom * 0.55, 0, 0, Math.PI * 2);
  } else ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Rohstoffvorkommen (Kartenmerkmal, wo erkundet): getönter Boden mit Tupfen; Zellen mit Förderanlage zeigt die Stadt. */
function drawDeposits(ren, ctx, known) {
  const g = ren.game;
  const c = g.city[0];
  const V = ren.camera.visibleRect();
  const S = c.cell;
  for (let r = Math.max(0, Math.floor(V.y0 / S) - 1); r <= Math.min(c.rows - 1, Math.ceil(V.y1 / S) + 1); r++) {
    for (let q = Math.max(0, Math.floor(V.x0 / S) - 1); q <= Math.min(c.cols - 1, Math.ceil(V.x1 / S) + 1); q++) {
      const i = r * c.cols + q;
      const d = DEPOSITS[c.deposit[i] - 1];
      if (!d || !known((q + 0.5) * S, (r + 0.5) * S)) continue;
      if (g.city.some((o) => o.level[i])) continue;
      groundRect(ren, ctx, q * S, r * S, (q + 1) * S, (r + 1) * S);
      ctx.fillStyle = DEP_GROUND[d];
      ctx.fill();
      for (const [fx, fy, fr] of DOTS) groundDot(ren, ctx, (q + fx) * S, (r + fy) * S, fr * S * 0.7, DEP_DOT[d]);
    }
  }
}

/** Baumstümpfe einer Lichtung (Lage in der Zelle 0..1, Radius in Zellen). */
const STUMPS = [[0.28, 0.32, 0.07], [0.7, 0.4, 0.06], [0.42, 0.74, 0.08]];

/** Gefällte Zellen (Räumen, seit v5.13; wo erkundet): Lichtung mit Baumstümpfen über dem Waldboden der Karte. */
function drawClearings(ren, ctx, known) {
  const g = ren.game;
  const c = g.city[0];
  if (!c.felled) return;
  const V = ren.camera.visibleRect();
  const S = c.cell;
  for (let r = Math.max(0, Math.floor(V.y0 / S) - 1); r <= Math.min(c.rows - 1, Math.ceil(V.y1 / S) + 1); r++) {
    for (let q = Math.max(0, Math.floor(V.x0 / S) - 1); q <= Math.min(c.cols - 1, Math.ceil(V.x1 / S) + 1); q++) {
      const i = r * c.cols + q;
      if (!c.felled[i] || c.blocked[i] || !known((q + 0.5) * S, (r + 0.5) * S)) continue;
      groundRect(ren, ctx, q * S, r * S, (q + 1) * S, (r + 1) * S);
      ctx.fillStyle = '#6b7442';
      ctx.fill();
      if (g.city.some((o) => o.kind[i])) continue; // Grundstück darüber: keine Stümpfe
      for (const [fx, fy, fr] of STUMPS) {
        groundDot(ren, ctx, (q + fx) * S, (r + fy) * S, fr * S, '#5a3d22');
        groundDot(ren, ctx, (q + fx) * S, (r + fy) * S, fr * S * 0.6, '#b08a58');
      }
    }
  }
}

/** Linie von (x0, y0) nach (x1, y1) auf dem Boden. */
function groundLine(ren, ctx, x0, y0, x1, y1) {
  if (!ren.draping()) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    return;
  }
  const a = ren.camera.worldToScreen(x0, y0);
  const b = ren.camera.worldToScreen(x1, y1);
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

/**
 * Gebietsgrenzen (eigene immer, fremde wo erkundet) als Linie in Teamfarbe; im Baumodus dazu bebaubare Zellen hell,
 * gesperrte dunkel und das gezogene Rechteck in der Farbe des Werkzeugs.
 */
function drawTerritory(ren, ctx, team, known) {
  const g = ren.game;
  const ui = ren.cityUi?.open ? ren.cityUi : null;
  const V = ren.camera.visibleRect();
  const z = ren.draping() ? 1 : 1 / ren.camera.zoom;
  for (const c of g.city) {
    const own = c.team === team;
    const S = c.cell;
    const q0 = Math.max(0, Math.floor(V.x0 / S) - 1);
    const q1 = Math.min(c.cols - 1, Math.ceil(V.x1 / S) + 1);
    const r0 = Math.max(0, Math.floor(V.y0 / S) - 1);
    const r1 = Math.min(c.rows - 1, Math.ceil(V.y1 / S) + 1);
    if (ui && own) {
      // Baumodus: gesperrte Zellen dunkel (bauen kann man überall sonst, seit v4.87 ohne Gebietsgrenze)
      for (let r = r0; r <= r1; r++) {
        for (let q = q0; q <= q1; q++) {
          const i = r * c.cols + q;
          if (c.kind[i] || c.mapRoads?.[i] || canZone(g, c, i)) continue; // Stadtstraßen der Karte bleiben hell
          groundRect(ren, ctx, q * S + 1, r * S + 1, (q + 1) * S - 1, (r + 1) * S - 1);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fill();
        }
      }
    }
  }
  const d = ui?.drag;
  if (d && sizeOf(ui.tool) > 1) {
    // Großbau: Quadrat dort, wo der Befehl es hinsetzen würde (rot, wenn nichts passt)
    const c = g.city[team];
    const S = c.cell;
    const n = sizeOf(ui.tool);
    const a = fitBig(g, c, d.c1, d.r1, ui.tool);
    const q = a >= 0 ? a % c.cols : d.c1;
    const r = a >= 0 ? Math.floor(a / c.cols) : d.r1;
    const [lo, hi] = bigSpan(n);
    const col = a >= 0 ? CITY_COLORS[ui.tool] : '#e0553a';
    groundRect(ren, ctx, (q - lo) * S, (r - lo) * S, (q + hi + 1) * S, (r + hi + 1) * S);
    ctx.fillStyle = col + '88';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3 * z;
    ctx.stroke();
  } else if (d) {
    const c = g.city[team];
    const S = c.cell;
    const qa = Math.min(d.c0, d.c1);
    const ra = Math.min(d.r0, d.r1);
    const qb = Math.max(d.c0, d.c1) + 1;
    const rb = Math.max(d.r0, d.r1) + 1;
    groundRect(ren, ctx, qa * S, ra * S, qb * S, rb * S);
    ctx.fillStyle = CITY_COLORS[ui.tool] + '88';
    ctx.fill();
    ctx.strokeStyle = CITY_COLORS[ui.tool];
    ctx.lineWidth = 3 * z;
    ctx.stroke();
  }
}

/** 2D von oben: Gebäude als Dachflächen mit Schatten (1 × 1 seit v5.14 aus townhouses.js). */
export function drawCityTop(ren, ctx, team, known, inRect) {
  const g = ren.game;
  if (!g.city) return;
  for (const { c, k, lv, r, i, big, ctr } of cells(g, team, known)) {
    if (k === 'road' || !lv || big === 'part' || !inRect(ctr.x, ctr.y, big ? (sizeOf(k) * c.cell) / 2 + 32 : 64)) continue;
    const e = c.ents.get(i);
    const color = c.team < 2 ? g.teams[c.team].color : '#888';
    if (big && BIG_KINDS.has(k)) {
      drawBigTop(ctx, bigPlan(k, lv, ctr.x, ctr.y, sizeOf(k) * c.cell), color, e ? 1 - e.hp / e.def.hp : 0);
      continue;
    }
    if (big) {
      const b = { x: ctr.x, y: ctr.y, kind: k, level: lv, color, damage: e ? 1 - e.hp / e.def.hp : 0 };
      if (WORKS_KINDS.includes(k)) drawWorksTop(ctx, b); // 2 × 2-Werke (seit v5.08)
      else drawUniversityTop(ctx, b);
      continue;
    }
    const damage = e ? 1 - e.hp / e.def.hp : 0;
    drawTownTop(ctx, townObj(c, k, lv, r, i, color, damage), ren.camera.zoom); // 1 × 1 (seit v5.14): eigenes Bild je Art und Stufe
    if (damage > 0) {
      ctx.fillStyle = `rgba(20,10,5,${(0.55 * damage).toFixed(2)})`; // beschädigt: dunkler
      ctx.fillRect(r.x - 23, r.y - 23, 46, 46);
    }
  }
}

/** Schild (Kreis oder kleines Quadrat mit Symbol) als Bild, je Symbol und Farbe einmal gezeichnet. */
const badgeCache = new Map();
function badgeImage(icon, color, small) {
  const key = `${icon}|${color}|${small ? 1 : 0}`;
  let img = badgeCache.get(key);
  if (img) return img;
  const S = 64;
  img = document.createElement('canvas');
  img.width = S;
  img.height = S;
  const g = img.getContext('2d');
  g.beginPath();
  if (small) g.roundRect(6, 6, S - 12, S - 12, 12);
  else g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = small ? 5 : 6;
  g.strokeStyle = small ? 'rgba(255,255,255,0.85)' : '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  if (icon === 'res' || icon === 'com') {
    // kleine Zeichen als Formen (Schriftzeichen wären zu dünn): Wohnhaus mit Giebel bzw. Bürohaus mit Fensterreihen
    g.beginPath();
    if (icon === 'res') {
      g.moveTo(32, 13);
      g.lineTo(51, 30);
      g.lineTo(46, 30);
      g.lineTo(46, 50);
      g.lineTo(18, 50);
      g.lineTo(18, 30);
      g.lineTo(13, 30);
      g.closePath();
      g.fill();
      g.fillStyle = color;
      g.fillRect(28, 37, 8, 13); // Tür
    } else {
      g.fillRect(17, 14, 30, 36);
      g.fillStyle = color;
      for (let y = 19; y < 44; y += 9) for (const x of [21, 30, 39]) g.fillRect(x, y, 5, 5); // Fenster
    }
  } else {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 34px system-ui, "Segoe UI Symbol", "Noto Color Emoji", "Segoe UI Emoji", sans-serif';
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 3;
    g.fillText(icon, S / 2, S / 2 + 2);
  }
  badgeCache.set(key, img);
  return img;
}

/**
 * Schilder über den Stadtgebäuden (seit v4.96, nach Daniels Wunsch): Funktionsgebäude (Markt, Förderung, Werke, Strom, Uni,
 * Rechenzentrum, Kaserne, Fabrikhalle, Heliport) mit großem Symbol in ihrer Farbe, Wohnen und Gewerbe mit kleinem Zeichen
 * (⌂ grün = privat, ▣ blau = kommerziell). Größe auf dem Bildschirm fast fest, damit man sie auch weit herausgezoomt findet.
 * 2D: Weltkoordinaten (Kontext skaliert); isometrisch: Bildschirmkoordinaten über dem Dach.
 */
export function drawCityBadges(ren, ctx, team, known, inRect, iso) {
  const g = ren.game;
  if (!g.city) return;
  const cam = ren.camera;
  const z = cam.zoom;
  const big = Math.max(18, Math.min(34, 30 * z));
  const small = Math.max(12, Math.min(22, 19 * z));
  for (const { c, k, lv, r: cell, i, big: whole, ctr } of cells(g, team, known)) {
    const r = whole ? ctr : cell; // Großbau: Schild über der Mitte
    if (k === 'road' || !lv || whole === 'part' || !inRect(r.x, r.y, 64)) continue;
    const sm = !!SMALL[k];
    const d = k === 'mine' ? DEPOSITS[c.deposit[i] - 1] : null;
    const img = badgeImage(sm ? k : d ? MINE_ICON[d] : CITY_ICON[k], d ? MINE_COLOR[d] : CITY_COLORS[k], sm);
    const px = sm ? small : big;
    if (iso) {
      const p = cam.worldToScreen(r.x, r.y);
      const lift = whole ? (BIG_KINDS.has(k) ? Math.min(150, bigTop(k, lv) * 0.7) + 14 : WORKS_KINDS.includes(k) ? worksLift(k, lv) : BIG_LIFT[lv] ?? 110) : townLift(k, lv, d);
      ctx.drawImage(img, p.x - px / 2, p.y - lift * z - px, px, px);
    } else {
      const w = px / z;
      ctx.drawImage(img, r.x - w / 2, r.y - w / 2, w, w);
    }
  }
}

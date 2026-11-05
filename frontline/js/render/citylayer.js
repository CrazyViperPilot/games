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
import { transportOf } from '../game/transport.js';
import { runwaysOf } from '../game/aircraft.js';
import { laneGrid } from '../game/roads.js';
import { depositSprite } from './nature.js';
import { blit, spriteDpr } from './spritecache.js';
import { groundPattern, patternMatrix } from './ways.js';
import { railList } from './terrain.js';

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
  groundPoly(ren, ctx, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}

/** Vieleck auf dem Boden an den laufenden Pfad anhängen (ohne beginPath). */
function groundPoly(ren, ctx, pts) {
  if (!ren.draping()) {
    pts.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    return;
  }
  const cam = ren.camera;
  pts.forEach(([x, y], n) => {
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
    if (k === 'runway' || k === 'taxi') continue; // Bahn und Rollfeld danach in einem Zug (drawAirfield, seit v5.37)
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
  drawAirfield(ren, ctx, team, known, inRect);
  drawRoads(ren, ctx, team, known);
  if (ren.cityUi?.open) drawLoads(ren, ctx, team, known, inRect); // Baumodus: Auslastung der Straßen
  drawTerritory(ren, ctx, team, known);
  ctx.restore();
}

// ---- Fliegerhorst am Boden (seit v5.37, Farben und Markierungen wie beim alten Flughafen, airport.js) ----
const AF = {
  asph: '#3d3f3c', // Bahn
  conc: '#a9a89f', // Rollfeld (Beton)
  rubber2: 'rgba(22,22,22,0.1)',
  rubber: 'rgba(22,22,22,0.22)',
  joint: 'rgba(60,58,50,0.2)',
  white: '#ecebe4',
  yel: '#e3c63a',
  blue: '#4f86ff',
  light: '#fff3c4',
  green: '#57e37f',
  red: '#e0553a',
};
// Ziffern als Striche (x 0…1, y 0…2, y nach unten), wie airport.js
const SEG = { a: [0, 0, 1, 0], b: [1, 0, 1, 1], c: [1, 1, 1, 2], d: [0, 2, 1, 2], e: [0, 1, 0, 2], f: [0, 0, 0, 1], g: [0, 1, 1, 1] };
const DIGIT = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/**
 * Start-/Landebahnen und Rollfeld (seit v5.37; vorher nur Asphalt mit wenigen Strichen): Bahn in dunklem Asphalt mit Schwellen,
 * Kennziffern (09/27 waagrecht, 18/36 senkrecht), Zielpunkt- und Aufsetzzonenmarken, Gummiabrieb, Rand- und Mittellinie,
 * Randfeuern und grünen Schwellenfeuern; Rollfeld (Werkzeug „Rollfeld“ und Bahnzellen neben dem Bahnstreifen) in Beton mit Fugen,
 * gelber Mittellinie zu den Nachbarfeldern, Haltelinie vor der Bahn, gelbem Rand und blauen Randfeuern. Eine Bahngruppe ohne gültigen
 * Streifen ist rot umrandet. Gleiche Farben in einem Pfad; feine Teile erst ab Zoom 0,55.
 */
function drawAirfield(ren, ctx, team, known, inRect) {
  const g = ren.game;
  const fine = ren.camera.zoom >= 0.55;
  const buckets = new Map(Object.values(AF).map((c) => [c, []]));
  const R = (x0, y0, x1, y1, col) => buckets.get(col).push(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
  const RW = KIND_ID.runway;
  const TX = KIND_ID.taxi;
  for (const c of g.city) {
    const S = c.cell;
    const rws = runwaysOf(g, c.team);
    const strip = new Set();
    for (const rw of rws) if (rw.valid) for (const i of rw.cells) strip.add(i);
    const pave = (j) => c.kind[j] === RW || c.kind[j] === TX;
    const ST = KIND_ID.stand;
    // Rollfeld-Nachbarn je Zelle: Mittellinien nur in Rollwegen (höchstens 2 Nachbarn), nicht kreuz und quer über breite Vorfelder
    const nb = (q, r) => {
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = q + dx;
        const y = r + dy;
        if (x >= 0 && y >= 0 && x < c.cols && y < c.rows && pave(y * c.cols + x)) n++;
      }
      return n;
    };
    for (const i of c.list) {
      if (!pave(i)) continue;
      const q = i % c.cols;
      const r = (i - q) / c.cols;
      const x0 = c.x0 + q * S;
      const y0 = c.y0 + r * S;
      const x = x0 + S / 2;
      const y = y0 + S / 2;
      if (!inRect(x, y, S) || (c.team !== team && !known(x, y))) continue; // eigene Stadt immer, fremde nur erkundet
      if (strip.has(i)) {
        R(x0, y0, x0 + S, y0 + S, AF.asph);
        continue;
      }
      R(x0, y0, x0 + S, y0 + S, AF.conc);
      if (fine) {
        R(x - 0.5, y0, x + 0.5, y0 + S, AF.joint);
        R(x0, y - 0.5, x0 + S, y + 0.5, AF.joint);
      }
      // Nachbarn: Mittellinie hin (vor der Bahn mit Haltelinie), sonst gelber Rand mit blauen Feuern
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nq = q + dx;
        const nr = r + dy;
        const inside = nq >= 0 && nr >= 0 && nq < c.cols && nr < c.rows;
        const j = nr * c.cols + nq;
        const ex = x + (dx * S) / 2; // Mitte der Kante
        const ey = y + (dy * S) / 2;
        if (inside && pave(j)) {
          const lane = nb(q, r) <= 2 || (!strip.has(j) && nb(nq, nr) <= 2);
          if (lane) {
            if (dx) R(x, y - 1.2, ex, y + 1.2, AF.yel);
            else R(x - 1.2, y, x + 1.2, ey, AF.yel);
          }
          if (strip.has(j) && fine) {
            // Haltelinie: zwei durchgezogene und zwei gestrichelte Linien quer zur Rollrichtung
            for (const [o, dash] of [[6, false], [9, false], [14, true], [17, true]]) {
              for (let t = -S / 2 + 4; t < S / 2 - 4; t += dash ? 9 : S) {
                const t1 = dash ? t + 5 : S / 2 - 4;
                if (dx) R(ex - dx * o - 0.8, y + t, ex - dx * o + 0.8, y + t1, AF.yel);
                else R(x + t, ey - dy * o - 0.8, x + t1, ey - dy * o + 0.8, AF.yel);
              }
            }
          }
        } else if (inside && c.kind[j] === ST) {
          // Zufahrt zum Stellplatz: Mittellinie bis zur Kante
          if (dx) R(x, y - 1.2, ex, y + 1.2, AF.yel);
          else R(x - 1.2, y, x + 1.2, ey, AF.yel);
        } else {
          if (dx) R(ex - dx * 4 - 0.8, y0, ex - dx * 4 + 0.8, y0 + S, AF.yel);
          else R(x0, ey - dy * 4 - 0.8, x0 + S, ey - dy * 4 + 0.8, AF.yel);
          if (fine) for (const t of [-S / 4, S / 4]) {
            if (dx) R(ex - dx * 2 - 1.2, y + t - 1.2, ex - dx * 2 + 1.2, y + t + 1.2, AF.blue);
            else R(x + t - 1.2, ey - dy * 2 - 1.2, x + t + 1.2, ey - dy * 2 + 1.2, AF.blue);
          }
        }
      }
    }
    for (const rw of rws) {
      if (c.team !== team && !known(rw.cx, rw.cy)) continue;
      if (!inRect(rw.cx, rw.cy, (rw.len * S) / 2 + S)) continue;
      if (!rw.valid) {
        // ungültig: Umriss der Gruppe rot
        const x0 = c.x0 + rw.gq0 * S + 3;
        const y0 = c.y0 + rw.gr0 * S + 3;
        const x1 = c.x0 + (rw.gq1 + 1) * S - 3;
        const y1 = c.y0 + (rw.gr1 + 1) * S - 3;
        R(x0, y0, x1, y0 + 4, AF.red);
        R(x0, y1 - 4, x1, y1, AF.red);
        R(x0, y0, x0 + 4, y1, AF.red);
        R(x1 - 4, y0, x1, y1, AF.red);
        continue;
      }
      runwayMarks(rw, c, R, fine);
    }
  }
  for (const [col, rs] of buckets) {
    if (!rs.length) continue;
    ctx.beginPath();
    for (let k = 0; k < rs.length; k += 4) groundPoly(ren, ctx, [[rs[k], rs[k + 1]], [rs[k + 2], rs[k + 1]], [rs[k + 2], rs[k + 3]], [rs[k], rs[k + 3]]]);
    ctx.fillStyle = col;
    ctx.fill();
  }
}

/** Markierungen einer gültigen Bahn (örtlich: a längs ab dem Ende, b quer; Maße wie airport.js, längs × 2, quer × 3,4). */
function runwayMarks(rw, c, R, fine) {
  const S = c.cell;
  const X = rw.axis === 'x';
  const L = rw.len * S;
  const x0 = c.x0 + rw.q0 * S;
  const y0 = c.y0 + rw.r0 * S;
  const A = 2;
  const B = 3.4;
  // örtliches Rechteck (a0…a1 längs vom Ende d, b0…b1 quer, Seite × d) in Welt
  const put = (d, a0, a1, b0, b1, col) => {
    const p0 = d > 0 ? a0 : L - a0;
    const p1 = d > 0 ? a1 : L - a1;
    const q0 = b0 * d;
    const q1 = b1 * d;
    if (X) R(x0 + p0, rw.cy + q0, x0 + p1, rw.cy + q1, col);
    else R(rw.cx - q0, y0 + p0, rw.cx - q1, y0 + p1, col);
  };
  for (const d of [1, -1]) {
    put(d, 36 * A, 230 * A, -10 * B, 10 * B, AF.rubber2); // Gummiabrieb
    put(d, 46 * A, 170 * A, -6 * B, 6 * B, AF.rubber);
  }
  for (const s of [-1, 1]) put(1, 4, L - 4, s * 15.5 * B - 1.9, s * 15.5 * B + 1.9, AF.white); // Randlinien
  for (let a = 116; a < L - 116 - 30; a += 56) put(1, a, a + 30, -2.6, 2.6, AF.white); // Mittellinie
  for (const d of [1, -1]) {
    for (const k of [-12.5, -9.5, -6.5, -3.5, 3.5, 6.5, 9.5, 12.5]) put(d, 8, 40, k * B - 3.4, k * B + 3.4, AF.white); // Schwelle
    if (L >= 2 * 160 + 40) for (const k of [-7, 7]) put(d, 116, 160, k * B - 5, k * B + 5, AF.white); // Zielpunkt
    if (fine && L >= 2 * 292) {
      [[184, [4.5, 7.5, 10.5]], [228, [4.5, 7.5]], [272, [4.5]]].forEach(([a, ks]) => {
        for (const k of ks) for (const s of [-1, 1]) put(d, a, a + 20, s * k * B - 3, s * k * B + 3, AF.white); // Aufsetzzone
      });
    }
    // Kennziffern (Landerichtung), Fuß zur Schwelle
    const num = X ? (d > 0 ? '09' : '27') : d > 0 ? '18' : '36';
    const SZ = 6 * A;
    const W = 7 * B;
    [...num].forEach((ch, n) => {
      const off = (n ? 5.5 : -5.5) * B;
      for (const sk of DIGIT[ch]) {
        const [gx0, gy0, gx1, gy1] = SEG[sk];
        const a0 = 48 + (2 - gy0) * SZ;
        const a1 = 48 + (2 - gy1) * SZ;
        const b0 = off + (gx0 - 0.5) * W;
        const b1 = off + (gx1 - 0.5) * W;
        const h = 2.2;
        put(d, Math.min(a0, a1) - h, Math.max(a0, a1) + h, Math.min(b0, b1) - h, Math.max(b0, b1) + h, AF.white);
      }
    });
    if (fine) for (let k = -16; k <= 16; k += 4) put(d, 1, 4, k * B - 1.6, k * B + 1.6, AF.green); // Schwellenfeuer
  }
  if (fine) for (let a = 12; a <= L - 12; a += 48) for (const s of [-1, 1]) put(1, a - 1.6, a + 1.6, s * 17.4 * B - 1.6, s * 17.4 * B + 1.6, AF.light); // Randfeuer
}

// Auslastung der Straßen im Baumodus (seit v5.20, AP5): Last / Kapazität je Straßenzelle, grün unter 60 %, gelb unter 100 %, rot ab 100 %.
const LOAD_TINT = ['rgba(70,180,90,0.42)', 'rgba(235,195,40,0.5)', 'rgba(225,60,40,0.58)'];
/**
 * Straßen der eigenen Stadt (Eigenstraßen und Stadtstraßen der Karte) nach Auslastung tönen; nur Zellen mit Last. Die Last kommt aus
 * transportOf (Stand des letzten Schritts). Stadtstraßen der Karte nur, wo erkundet.
 */
function drawLoads(ren, ctx, team, known, inRect) {
  const c = ren.game.city?.[team];
  if (!c) return;
  const tr = transportOf(ren.game, c);
  const S = c.cell;
  for (let m = 0; m < tr.list.length; m++) {
    const i = tr.list[m];
    const L = tr.load[i];
    if (!(L > 0)) continue;
    const col = i % c.cols;
    const r = cellRect(c, col, (i - col) / c.cols);
    if (!inRect(r.x, r.y, S)) continue;
    if (c.kind[i] !== KIND_ID.road && !known(r.x, r.y)) continue;
    const q = L / tr.cap[i];
    groundRect(ren, ctx, r.x0 + 2, r.y0 + 2, r.x1 - 2, r.y1 - 2);
    ctx.fillStyle = LOAD_TINT[q < 0.6 ? 0 : q < 1 ? 1 : 2];
    ctx.fill();
  }
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
        begin: () => ctx.beginPath(),
        rect: (a, b, c2, d) => groundPoly(ren, ctx, [[a, b], [c2, b], [c2, d], [a, d]]),
        poly: (pts) => groundPoly(ren, ctx, pts),
        line: (a, b, c2, d) => groundLine(ren, ctx, a, b, c2, d),
        fill: (color) => {
          ctx.fillStyle = color;
          ctx.fill();
        },
        stroke: (color, w) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.8, w * zl);
          ctx.stroke();
        },
      },
      bigPlan(k, lv, m.x, m.y, 2 * h),
      ren.camera.zoom >= 0.55, // feine Markierungen und Lichter erst ab mittlerem Zoom
      ren.season === 'winter',
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
// Zebrastreifen. Alles als Flächen in Zellkoordinaten; die Pfade für alle Straßen werden nur neu gebaut, wenn sich Straßen,
// Sicht, Drehung, Gelände oder Jahreszeit ändern, sonst je Bild nur die Füllungen der sichtbaren Kacheln (16 × 16 Zellen).
// Seit v5.31 schöner: Asphalt und Gehwegplatten als Muster (ways.js, ab Zoom 0,5), heller Bordstein mit Rinne (Herbst Laub,
// Winter Schneewall), Bordsteinecken und Bögen, Kanaldeckel und Gullys, Bahnübergänge mit Betonplatten über den Schienen.
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

/** Kurve nur, wenn die Diagonale zwischen den beiden Anschlüssen keine Straße ist (sonst Ecke eines breiten Bandes, seit v5.38). */
function curveOf(m, S) {
  const n = m & 15;
  const diag = n === (RN | RE) ? DNE : n === (RE | RS) ? DSE : n === (RS | RW) ? DSW : n === (RW | RN) ? DNW : 0;
  return diag && m & diag ? null : curveCorner(n, S);
}

/** Innere Ecke einer Kurve (wo beide Anschlüsse zusammenstoßen) als [u, v, Richtung u, Richtung v], sonst null. */
function curveCorner(n, S) {
  if (n === (RN | RE)) return [S, 0, -1, 1];
  if (n === (RE | RS)) return [S, S, -1, -1];
  if (n === (RS | RW)) return [0, S, 1, -1];
  if (n === (RW | RN)) return [0, 0, 1, 1];
  return null;
}

/** Gehweg: Streifen an Seiten ohne Anschluss, Ecken zwischen zwei Anschlüssen; in Kurven die Außenseite als Bogen. E: Überstand. */
function roadWalk(ctx, m, S, E = 0) {
  const k = ROAD.kerb;
  const n = m & 15;
  const cc = curveOf(m, S);
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
  if (!(n & RN)) rectUV(ctx, -E, 0, S + E, k);
  if (!(n & RE)) rectUV(ctx, S - k, -E, S, S + E);
  if (!(n & RS)) rectUV(ctx, -E, S - k, S + E, S);
  if (!(n & RW)) rectUV(ctx, 0, -E, k, S + E);
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
  const cc = curveOf(m, S);
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

/**
 * Markierung eines mehrspurigen Bandes (seit v5.38): width Zellen nebeneinander = width Spuren je Richtung. Doppelte durchgezogene
 * Mittellinie in der Mitte des Bandes, gestrichelte Spurlinien dazwischen; vor einer Kreuzung (Nachbar in Fahrtrichtung gehört nicht
 * zum selben Band) Zebrastreifen über den Teil der Fahrbahn in dieser Zelle. Zellkoordinaten u (x), v (y).
 */
function laneMarks(ctx, lg, view, col, row, S) {
  const i = row * view.cols + col;
  const H = lg.dir[i] === 1; // läuft waagrecht
  const w = lg.width[i];
  const k = lg.idx[i];
  const kb = ROAD.kerb;
  const span = w * S - 2 * kb; // Fahrbahn quer
  const nL = 2 * w;
  const lw = span / nL;
  const lh = ROAD.line / 2;
  // quer a (im Band), längs b0…b1 → Rechteck in der Zelle
  const rect = (a0, a1, b0, b1) => {
    const c0 = a0 - k * S;
    const c1 = a1 - k * S;
    if (c1 <= 0 || c0 >= S) return;
    const p0 = Math.max(0, c0);
    const p1 = Math.min(S, c1);
    if (H) rectUV(ctx, b0, p0, b1, p1);
    else rectUV(ctx, p0, b0, p1, b1);
  };
  // Nachbarn längs: gehören sie zum selben Band? sonst (Straße) Kreuzung: Zebrastreifen statt Linien am Rand
  const same = (q, r) => {
    if (q < 0 || r < 0 || q >= view.cols || r >= view.rows) return null;
    const j = r * view.cols + q;
    if (!view.kind[j]) return null;
    return lg.dir[j] === lg.dir[i] && lg.width[j] === w;
  };
  const before = H ? same(col - 1, row) : same(col, row - 1);
  const after = H ? same(col + 1, row) : same(col, row + 1);
  const b0 = before === false ? 16 : 0;
  const b1 = after === false ? S - 16 : S;
  for (let j = 1; j < nL; j++) {
    const a = kb + j * lw;
    if (j === w) {
      rect(a - 3.2 - lh, a - 3.2 + lh, b0, b1); // doppelte Mittellinie
      rect(a + 3.2 - lh, a + 3.2 + lh, b0, b1);
    } else {
      for (const [d0, d1] of [[10, 22], [42, 54]]) if (d0 >= b0 && d1 <= b1) rect(a - lh, a + lh, d0, d1);
    }
  }
  // Zebrastreifen vor der Kreuzung: Balken quer über die Fahrbahn dieser Zelle
  for (const [near, flag] of [[true, before], [false, after]]) {
    if (flag !== false) continue;
    const z0 = near ? 2 : S - 14;
    for (let a = kb + 2; a + 4 <= kb + span - 2; a += 9) rect(a, a + 4, z0, z0 + 12);
  }
}

// ---------- Bordstein, Rinne, Kanaldeckel, Gullys, Bahnübergänge (seit v5.31) ----------

const KW = 1.7; // Bordstein (im Gehweg)
const RAIL_GAUGE = 11.2; // halbe Spurweite, wie ways.js

/** Bordstein und Rinne entlang einer achsparallelen Gehwegkante (u0, v0) – (u1, v1); (nu, nv) zeigt zur Fahrbahn. */
function kerbEdge(kerb, gutter, gw, u0, v0, u1, v1, nu, nv) {
  if (v0 === v1) {
    const a = Math.min(u0, u1);
    const b = Math.max(u0, u1);
    rectUV(kerb, a, Math.min(v0, v0 - nv * KW), b, Math.max(v0, v0 - nv * KW));
    rectUV(gutter, a, Math.min(v0, v0 + nv * gw), b, Math.max(v0, v0 + nv * gw));
  } else {
    const a = Math.min(v0, v1);
    const b = Math.max(v0, v1);
    rectUV(kerb, Math.min(u0, u0 - nu * KW), a, Math.max(u0, u0 - nu * KW), b);
    rectUV(gutter, Math.min(u0, u0 + nu * gw), a, Math.max(u0, u0 + nu * gw), b);
  }
}

/** Viertelring um die Kurvenecke (cu, cv) zwischen den Radien r0 und r1. */
function arcBand(ctx, cu, cv, su, sv, r0, r1) {
  const steps = 8;
  for (let j = 0; j <= steps; j++) {
    const a = (j / steps) * Math.PI * 0.5;
    vtx(ctx, cu + su * r1 * Math.cos(a), cv + sv * r1 * Math.sin(a), !j);
  }
  for (let j = steps; j >= 0; j--) {
    const a = (j / steps) * Math.PI * 0.5;
    vtx(ctx, cu + su * r0 * Math.cos(a), cv + sv * r0 * Math.sin(a));
  }
  ctx.closePath();
}

/** Bordstein (heller Streifen an der Gehwegkante) und Rinne (dunkel, im Winter Schneewall) einer Straßenzelle. */
function roadKerb(kerb, gutter, m, S, gw) {
  const k = ROAD.kerb;
  const n = m & 15;
  const cc = curveOf(m, S);
  if (cc) {
    const [cu, cv, su, sv] = cc;
    const R = S - k;
    arcBand(kerb, cu, cv, su, sv, R, R + KW);
    arcBand(gutter, cu, cv, su, sv, R - gw, R);
    const diag = n === (RN | RE) ? DNE : n === (RE | RS) ? DSE : n === (RS | RW) ? DSW : DNW;
    if (!(m & diag)) {
      const eu = cu + su * k;
      const ev = cv + sv * k;
      kerbEdge(kerb, gutter, gw, eu, cv, eu, ev, su, 0);
      kerbEdge(kerb, gutter, gw, cu, ev, eu, ev, 0, sv);
    }
    return;
  }
  const uA = n & RW ? 0 : k;
  const uB = n & RE ? S : S - k;
  const vA = n & RN ? 0 : k;
  const vB = n & RS ? S : S - k;
  if (!(n & RN)) kerbEdge(kerb, gutter, gw, uA, k, uB, k, 0, 1);
  if (!(n & RS)) kerbEdge(kerb, gutter, gw, uA, S - k, uB, S - k, 0, -1);
  if (!(n & RW)) kerbEdge(kerb, gutter, gw, k, vA, k, vB, 1, 0);
  if (!(n & RE)) kerbEdge(kerb, gutter, gw, S - k, vA, S - k, vB, -1, 0);
  // Ecken der Nachbarblöcke, wenn zwei Seiten anschließen und die Diagonale keine Straße ist
  if ((n & (RN | RE)) === (RN | RE) && !(m & DNE)) {
    kerbEdge(kerb, gutter, gw, S - k, 0, S - k, k, -1, 0);
    kerbEdge(kerb, gutter, gw, S - k, k, S, k, 0, 1);
  }
  if ((n & (RE | RS)) === (RE | RS) && !(m & DSE)) {
    kerbEdge(kerb, gutter, gw, S - k, S - k, S - k, S, -1, 0);
    kerbEdge(kerb, gutter, gw, S - k, S - k, S, S - k, 0, -1);
  }
  if ((n & (RS | RW)) === (RS | RW) && !(m & DSW)) {
    kerbEdge(kerb, gutter, gw, k, S - k, k, S, 1, 0);
    kerbEdge(kerb, gutter, gw, 0, S - k, k, S - k, 0, -1);
  }
  if ((n & (RW | RN)) === (RW | RN) && !(m & DNW)) {
    kerbEdge(kerb, gutter, gw, k, 0, k, k, 1, 0);
    kerbEdge(kerb, gutter, gw, 0, k, k, k, 0, 1);
  }
}

/** Kreis (Vieleck) um (u, v) in der aktuellen Zelle. */
function circleUV(ctx, u, v, r) {
  for (let j = 0; j < 10; j++) {
    const a = -(j / 10) * Math.PI * 2;
    vtx(ctx, u + Math.cos(a) * r, v + Math.sin(a) * r, !j);
  }
  ctx.closePath();
}

/** Kanaldeckel in der Fahrspur und Gullys an der Rinne, fest je Zelle (nur auf geraden Stücken ohne Zebrastreifen). */
function roadDetail(rim, lid, drain, m, S, col, row) {
  const n = m & 15;
  const vert = n === (RN | RS);
  const hori = n === (RE | RW);
  if (!vert && !hori) return;
  const h = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
  if (h % 5 === 0 && !(m & (ZN | ZS | ZE | ZW))) {
    const a = S * (0.3 + ((h >>> 5) % 5) * 0.1);
    const b = S / 2 + ((h >>> 3) % 2 ? 13 : -13);
    const [u, v] = vert ? [b, a] : [a, b];
    circleUV(rim, u, v, 2.6);
    circleUV(lid, u, v, 2.0);
  }
  if (h % 3 === 1) {
    const k = ROAD.kerb;
    const a = S * (0.4 + ((h >>> 7) % 3) * 0.1);
    const near = (h >>> 9) % 2 === 0;
    const q0 = near ? k + 0.3 : S - k - 2.6;
    if (vert) rectUV(drain, q0, a - 1.7, q0 + 2.3, a + 1.7);
    else rectUV(drain, a - 1.7, q0, a + 1.7, q0 + 2.3);
  }
}

/** Bahnübergang: wo ein Gleis die Zelle kreuzt, Betonplatten zwischen den Schienen und die Schienen selbst über der Fahrbahn. */
function railCross(panel, rail, railTop, rails, x0, y0, S) {
  for (const r of rails) {
    const dx = r.x2 - r.x1;
    const dy = r.y2 - r.y1;
    const L = Math.hypot(dx, dy);
    if (L < 1) continue;
    // Strecke des Gleises in der Zelle (Liang-Barsky)
    let t0 = 0;
    let t1 = 1;
    const clip = (p, q) => {
      if (Math.abs(p) < 1e-9) return q >= 0;
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
      return true;
    };
    if (!(clip(-dx, r.x1 - x0) && clip(dx, x0 + S - r.x1) && clip(-dy, r.y1 - y0) && clip(dy, y0 + S - r.y1)) || t1 - t0 < 1e-6) continue;
    const ux = dx / L;
    const uy = dy / L;
    const nx = -uy;
    const ny = ux;
    const strip = (ctx, s0, s1, lo, hi) => {
      const pts = [[s0, hi], [s1, hi], [s1, lo], [s0, lo]];
      pts.forEach(([s, o], j) => vtx(ctx, r.x1 + ux * s + nx * o - x0, r.y1 + uy * s + ny * o - y0, !j));
      ctx.closePath();
    };
    const s0 = t0 * L;
    const s1 = t1 * L;
    strip(panel, s0, s1, -RAIL_GAUGE - 3.5, RAIL_GAUGE + 3.5);
    for (const side of [-1, 1]) {
      strip(rail, s0, s1, side * RAIL_GAUGE - 1.15, side * RAIL_GAUGE + 1.15);
      strip(railTop, s0, s1, side * RAIL_GAUGE - 0.75, side * RAIL_GAUGE - 0.05);
    }
  }
}

// Zwischenspeicher der Straßenpfade (eine Partie, eine Ansicht), in Kacheln zu 16 × 16 Zellen
const cache = { key: '', game: null, relief: null, chunks: null };
const RCHUNK = 16;

const STREET_COL = {
  summer: { kerb: '#cbc8be', gutter: 'rgba(18,18,16,0.3)', rim: '#2c2e2b', lid: '#595b56', drain: '#1f211e', panel: '#878883', rail: '#3e4043', railTop: '#d6d9db', mark: ROAD.mark, gw: 1.4 },
  autumn: { kerb: '#c3c0b6', gutter: 'rgba(92,52,20,0.42)', rim: '#2c2e2b', lid: '#555752', drain: '#1f211e', panel: '#82837e', rail: '#433f3c', railTop: '#c9c8c4', mark: ROAD.mark, gw: 1.8 },
  winter: { kerb: '#edf0f2', gutter: 'rgba(238,242,245,0.95)', rim: '#3a3c3a', lid: '#6c6f6c', drain: '#2b2d2b', panel: '#8f918d', rail: '#3f4144', railTop: '#eef0f2', mark: 'rgba(240,238,226,0.66)', gw: 3.2 },
};
const STREET_ORDER = ['asphalt', 'panel', 'gutter', 'walk', 'kerb', 'mark', 'rim', 'lid', 'drain', 'rail', 'railTop'];

/**
 * Alle sichtbaren Straßen (eigene immer, fremde wo erkundet): Asphalt, Gehweg mit Bordstein, Markierung, Kanaldeckel, Gullys und
 * Bahnübergänge, je Ebene ein Pfad je Kachel; gefüllt werden nur die Kacheln im Bild. Flach (2D und Iso ohne Gelände) in
 * Weltkoordinaten unter der Welt-Transformation. Mit Gelände in Koordinaten „Weltpunkt durch die Iso-Drehung bei Zoom 1, minus
 * Geländehöhe“: Bildschirm = Ursprung + Zoom · Punkt, also nur eine Transformation je Bild, solange die Drehung gleich bleibt.
 * Asphalt und Gehwegplatten als Muster (ways.js), ganz weit weg einfarbig.
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
  if (!n || typeof Path2D === 'undefined') return;
  const season = ren.season ?? 'summer';
  const view = drape ? `${u1x.toFixed(5)},${u1y.toFixed(5)},${u2x.toFixed(5)},${u2y.toFixed(5)}` : 'flat';
  const key = `${h}|${n}|${view}|${season}`;
  if (key !== cache.key || cache.game !== g || cache.relief !== (drape ? cam.relief : null)) {
    cache.key = key;
    cache.game = g;
    cache.relief = drape ? cam.relief : null;
    cache.chunks = buildRoads(g, roadView(g, team, known), drape ? cam.relief : null, u1x, u1y, u2x, u2y, season);
  }
  const S = g.roads?.cell ?? CITY.cell;
  const span = RCHUNK * S;
  const R = cam.visibleRect();
  const shown = [];
  for (const c of cache.chunks.values()) {
    const x0 = c.cx * span;
    const y0 = c.cy * span;
    if (x0 > R.x1 + 64 || y0 > R.y1 + 64 || x0 + span < R.x0 - 64 || y0 + span < R.y0 - 64) continue;
    shown.push(c);
  }
  if (!shown.length) return;
  ctx.save();
  if (drape) ctx.setTransform(ren.dpr * z, 0, 0, ren.dpr * z, ren.dpr * ax, ren.dpr * ay);
  const C = STREET_COL[season] ?? STREET_COL.summer;
  const mat = z >= 0.5 ? patternMatrix(drape ? [u1x, u1y, u2x, u2y] : null) : null;
  const fill = (layer) => {
    if (layer === 'asphalt' || layer === 'walk') {
      const pat = mat ? groundPattern(ctx, layer === 'walk' ? 'pavers' : 'asphalt', season) : null;
      if (pat) {
        if (pat.setTransform) pat.setTransform(mat);
        return pat;
      }
      return layer === 'walk' ? (season === 'winter' ? '#c7cbcc' : ROAD.walk) : ROAD.asphalt;
    }
    return C[layer];
  };
  const fine = z >= 0.45; // Kleinteile nur nah genug
  for (const layer of STREET_ORDER) {
    if (!fine && (layer === 'rim' || layer === 'lid' || layer === 'drain' || layer === 'kerb' || layer === 'railTop')) continue;
    ctx.fillStyle = fill(layer);
    for (const c of shown) {
      const p = c.p[layer];
      if (p) ctx.fill(p);
    }
  }
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

/** Pfade der Straßen je Kachel neu bauen (relief gesetzt: Pfadkoordinaten mit Gelände, siehe drawRoads). Brücken zeichnet bridge.js. */
function buildRoads(g, v, relief, u1x, u1y, u2x, u2y, season) {
  const chunks = new Map();
  qDrape = !!relief;
  const S = v.cell;
  const E = 0.6; // Flächen ragen etwas über die Zelle (keine Nähte zwischen den Kacheln)
  const gw = (STREET_COL[season] ?? STREET_COL.summer).gw;
  const rails = railList(g.map.town);
  const lg = laneGrid(v.cols, v.rows, (i) => v.kind[i] !== 0, 255); // Bänder aus parallelen Straßen (seit v5.38)
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
    const cx = Math.floor(col / RCHUNK);
    const cy = Math.floor(row / RCHUNK);
    const ck = `${cx},${cy}`;
    let ch = chunks.get(ck);
    if (!ch) chunks.set(ck, (ch = { cx, cy, p: {} }));
    const P = (name) => (ch.p[name] ??= new Path2D());
    const m = roadMask(v, col, row);
    rectUV(P('asphalt'), -E, -E, S + E, S + E);
    roadWalk(P('walk'), m, S, E);
    roadKerb(P('kerb'), P('gutter'), m, S, gw);
    if (lg.dir[i] && lg.width[i] >= 2 && lg.width[i] <= 6) laneMarks(P('mark'), lg, v, col, row, S);
    else roadMarks(P('mark'), m, S);
    roadDetail(P('rim'), P('lid'), P('drain'), m, S, col, row);
    if (rails.length) railCross(P('panel'), P('rail'), P('railTop'), rails, x0, y0, S);
  }
  return chunks;
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

/**
 * Rohstoffvorkommen (Kartenmerkmal, wo erkundet): seit v5.28 ein gemaltes Bodenbild je Zelle (nature.js: Stümpfe und Holzstapel,
 * Steinblöcke, rostiges Erz, Ölpfützen), mit Gelände an die Zellecken angepasst; fehlt das Bild noch, getönter Boden mit Tupfen.
 * Zellen mit Förderanlage zeigt die Stadt.
 */
function drawDeposits(ren, ctx, known) {
  const g = ren.game;
  const c = g.city[0];
  const cam = ren.camera;
  const V = cam.visibleRect();
  const S = c.cell;
  const drape = ren.draping();
  const dpr = ren.dpr;
  const scale = cam.zoom * spriteDpr();
  for (let r = Math.max(0, Math.floor(V.y0 / S) - 1); r <= Math.min(c.rows - 1, Math.ceil(V.y1 / S) + 1); r++) {
    for (let q = Math.max(0, Math.floor(V.x0 / S) - 1); q <= Math.min(c.cols - 1, Math.ceil(V.x1 / S) + 1); q++) {
      const i = r * c.cols + q;
      const d = DEPOSITS[c.deposit[i] - 1];
      if (!d || !known((q + 0.5) * S, (r + 0.5) * S)) continue;
      if (g.city.some((o) => o.level[i])) continue;
      const e = depositSprite(d, (Math.imul(q + 7, 73856093) ^ Math.imul(r + 3, 19349663)) >>> 0 & 3, ren.season, scale * (S / 64));
      if (e) {
        if (drape) {
          // Bild auf die Zelle legen: Ecken mit Gelände (drei Ecken bestimmen die Lage, die vierte folgt)
          const A = cam.worldToScreen(q * S, r * S);
          const B = cam.worldToScreen((q + 1) * S, r * S);
          const C = cam.worldToScreen(q * S, (r + 1) * S);
          ctx.setTransform((dpr * (B.x - A.x)) / 64, (dpr * (B.y - A.y)) / 64, (dpr * (C.x - A.x)) / 64, (dpr * (C.y - A.y)) / 64, dpr * A.x, dpr * A.y);
          blit(ctx, e, 0, 0, 1);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else {
          ctx.save();
          ctx.translate(q * S, r * S);
          ctx.scale(S / 64, S / 64);
          blit(ctx, e, 0, 0, 1);
          ctx.restore();
        }
        continue;
      }
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

/** 2D von oben, nach den Bodeneinheiten (seit v5.39): Dächer der ausgebauten Stellplätze halb durchsichtig über den Flugzeugen. */
export function drawCityRoofs(ren, ctx, team, known, inRect) {
  const g = ren.game;
  if (!g.city) return;
  for (const { c, k, lv, i, big, ctr } of cells(g, team, known)) {
    if (k !== 'stand' || lv < 2 || big !== 'anchor' || !inRect(ctr.x, ctr.y, c.cell + 32)) continue;
    const e = c.ents.get(i);
    const color = c.team < 2 ? g.teams[c.team].color : '#888';
    drawBigTop(ctx, bigPlan(k, lv, ctr.x, ctr.y, sizeOf(k) * c.cell), color, e ? 1 - e.hp / e.def.hp : 0, ren.camera.zoom, true);
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
      drawBigTop(ctx, bigPlan(k, lv, ctr.x, ctr.y, sizeOf(k) * c.cell), color, e ? 1 - e.hp / e.def.hp : 0, ren.camera.zoom);
      continue;
    }
    if (big) {
      const b = { x: ctr.x, y: ctr.y, kind: k, level: lv, color, damage: e ? 1 - e.hp / e.def.hp : 0 };
      if (WORKS_KINDS.includes(k)) drawWorksTop(ctx, b, ren.camera.zoom); // 2 × 2-Werke und Kraftwerk (works.js)
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
/** Warnzeichen „kein Weg“ (seit v5.20): großes, fettes rotes X mit weißem Rand, gezeichnet (kein Schriftzeichen, sieht überall gleich aus). */
let warnCache = null;
function warnImage() {
  if (warnCache) return warnCache;
  const S = 64;
  const img = document.createElement('canvas');
  img.width = S;
  img.height = S;
  const g = img.getContext('2d');
  g.lineCap = 'round';
  const cross = () => {
    g.beginPath();
    g.moveTo(12, 12);
    g.lineTo(S - 12, S - 12);
    g.moveTo(S - 12, 12);
    g.lineTo(12, S - 12);
    g.stroke();
  };
  g.strokeStyle = '#ffffff'; // weißer Rand
  g.lineWidth = 20;
  cross();
  g.strokeStyle = '#e01b1b'; // rotes X
  g.lineWidth = 12;
  cross();
  warnCache = img;
  return img;
}

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
  // Baumodus: Warnzeichen (rotes X) an Gebäuden ohne Lieferweg oder Pendlerweg der eigenen Stadt
  const tr = ren.cityUi?.open && g.city[team] ? transportOf(g, g.city[team]) : null;
  const warnImg = tr ? warnImage() : null;
  for (const { c, k, lv, r: cell, i, big: whole, ctr } of cells(g, team, known)) {
    const r = whole ? ctr : cell; // Großbau: Schild über der Mitte
    if (k === 'road' || !lv || whole === 'part' || !inRect(r.x, r.y, 64)) continue;
    const sm = !!SMALL[k];
    const d = k === 'mine' ? DEPOSITS[c.deposit[i] - 1] : null;
    const img = badgeImage(sm ? k : d ? MINE_ICON[d] : CITY_ICON[k], d ? MINE_COLOR[d] : CITY_COLORS[k], sm);
    const px = sm ? small : big;
    let bx;
    let by;
    let bw;
    if (iso) {
      const p = cam.worldToScreen(r.x, r.y);
      const lift = whole ? (BIG_KINDS.has(k) ? Math.min(150, bigTop(k, lv) * 0.7) + 14 : WORKS_KINDS.includes(k) ? worksLift(k, lv) : BIG_LIFT[lv] ?? 110) : townLift(k, lv, d);
      bx = p.x - px / 2;
      by = p.y - lift * z - px;
      bw = px;
    } else {
      bw = px / z;
      bx = r.x - bw / 2;
      by = r.y - bw / 2;
    }
    ctx.drawImage(img, bx, by, bw, bw);
    // Baumodus (seit v5.20, AP5): rotes Warnzeichen oben rechts, wenn ein Lieferweg oder Pendlerweg fehlt
    if (tr && c.team === team && transportWarn(tr, k, i)) {
      const ws = bw * 0.9; // groß: fast so groß wie das Schild
      ctx.drawImage(warnImg, bx + bw - ws * 0.55, by - ws * 0.45, ws, ws);
    }
  }
}

/** Arten, die etwas an ein Ziel liefern (Förderung, Werke, Munitionswerk). */
const SUPPLIER_KINDS = new Set(['mine', 'smelter', 'bm', 'steel', 'fuel', 'kero', 'mun']);
/** Warnung am Schild: Lieferant ohne Lieferweg, oder Arbeitsstätte ohne erreichbare Wohnung (Pendlerweg fehlt). */
function transportWarn(tr, k, i) {
  const r = tr.routes.get(i);
  const noRoute = SUPPLIER_KINDS.has(k) && (!r || r.to === null);
  const noHome = tr.commute.has(i) && tr.commute.get(i) === null;
  return noRoute || noHome;
}

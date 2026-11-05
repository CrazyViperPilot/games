// Isometrische Gebäude mit Details (Fenster, Türen, Tore, Balkone, Dächer). Alles wird gezeichnet, keine Bilddateien.
// Spätere Sprites (z. B. freies Grafikpaket oder eigene Entwürfe) lassen sich pro Gebäudeart einhängen:
// spriteOverrides.house = (ctx, cam, b) => { …; return true; } ersetzt die gemalte Variante (Rückgabe true = erledigt).
import { BALANCE } from '../data/balance.js';
import { drawUniversityIso } from './university.js';
import { drawWorksIso, WORKS_KINDS } from './works.js';
import { drawBigPart, VEH, VEH_COLOR } from './bigbuild.js';
import { drawCityHallIso } from './cityhall.js';
import { drawTownIso } from './townhouses.js';
import { drawMilIso } from './milbuild.js';
import { drawMapIso } from './maptown.js';
import { drawBox, drawRotBox, wallPoint, wallQuad, buildingHeight, TOWN_H, drawTree } from './iso.js';
import { shade, tint, hexA } from './sprites.js';
import { snowy } from './season.js';

const TILE = BALANCE.map.tile;
const OUTLINE = 'rgba(0,0,0,0.55)';
const GLASS = '#2f4a63';
const LIT = '#e6cf7a';
const TRAIN_PAINT = { loco: '#b3423a', container: '#3f8a5e', tank: '#7c8190' };
const DETAIL_ZOOM = 0.5; // darunter keine Fenster/Türen (Leistung)

/** Austauschpunkt für Sprites: Schlüssel = Stadtart (house, hall, factory) oder Gebäudetyp (fob, depot, helipad …). */
export const spriteOverrides = {};

const hash = (x, y = 0) => (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663)) >>> 0;

function path(ctx, polys) {
  ctx.beginPath();
  for (const q of polys) {
    ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
  }
}
function fillPolys(ctx, polys, fill, stroke) {
  if (!polys.length) return;
  path(ctx, polys);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
const lines = (ctx, segs, style, lw = 1) => {
  if (!segs.length) return;
  ctx.beginPath();
  for (const [a, b] of segs) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = style;
  ctx.lineWidth = lw;
  ctx.stroke();
};

/** Fensterreihen einer Wand. rows = [[h0, h1], …]; skip(t, reihe) lässt Fenster aus; lit = Anteil beleuchteter Fenster. */
function windows(ctx, w, rows, { gap = 26, ww = 10, skip = null, lit = 0.25, seed = 0 } = {}) {
  const n = Math.max(1, Math.round(w.len / gap));
  const hw = ww / 2 / w.len;
  const glass = [];
  const warm = [];
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (skip && skip(t, r)) continue;
      const q = wallQuad(w, t - hw, t + hw, rows[r][0], rows[r][1]);
      (hash(seed + i * 7 + r * 13, w.edge * 3) % 100 < lit * 100 ? warm : glass).push(q);
    }
  }
  fillPolys(ctx, glass, GLASS);
  fillPolys(ctx, warm, LIT);
  path(ctx, glass.concat(warm));
  ctx.strokeStyle = 'rgba(245,245,240,0.75)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Durchgehendes Fensterband mit Pfosten (Leitstelle, Oberlicht der Halle). */
function band(ctx, w, h0, h1, panes, t0 = 0.06, t1 = 0.94, glass = GLASS) {
  fillPolys(ctx, [wallQuad(w, t0, t1, h0, h1)], glass, 'rgba(240,240,235,0.7)');
  const segs = [];
  for (let i = 1; i < panes; i++) {
    const t = t0 + ((t1 - t0) * i) / panes;
    segs.push([wallPoint(w, t, h0), wallPoint(w, t, h1)]);
  }
  lines(ctx, segs, 'rgba(240,240,235,0.6)');
}

/** Tür mit Rahmen. */
function door(ctx, w, t, wWorld, h, col = '#5a3b28') {
  const hw = wWorld / 2 / w.len;
  fillPolys(ctx, [wallQuad(w, t - hw - 0.012, t + hw + 0.012, 0, h + 1.5)], tint(col, 0.5));
  fillPolys(ctx, [wallQuad(w, t - hw, t + hw, 0, h)], col, OUTLINE);
}

/** Großes Rolltor: Rahmen, dunkle Öffnung, oben halb heruntergelassene Lamellen. */
function gate(ctx, w, t, wWorld, h, frame = '#c9b24a', slat = '#8b9096') {
  const hw = wWorld / 2 / w.len;
  const fw = 2.5 / w.len;
  fillPolys(ctx, [wallQuad(w, t - hw - fw, t + hw + fw, 0, h + 3)], frame, OUTLINE);
  fillPolys(ctx, [wallQuad(w, t - hw, t + hw, 0, h)], '#1b1f22');
  fillPolys(ctx, [wallQuad(w, t - hw, t + hw, h * 0.72, h)], slat);
  const segs = [];
  for (let k = 1; k <= 3; k++) {
    const hh = h * (0.72 + (0.28 * k) / 4);
    segs.push([wallPoint(w, t - hw, hh), wallPoint(w, t + hw, hh)]);
  }
  lines(ctx, segs, 'rgba(0,0,0,0.4)');
}

/** Sockelstreifen und Geschosslinie. */
function plinth(ctx, w, color, floorAt = 0) {
  fillPolys(ctx, [wallQuad(w, 0, 1, 0, 4)], shade(color, 0.3));
  if (floorAt) lines(ctx, [[wallPoint(w, 0, floorAt), wallPoint(w, 1, floorAt)]], 'rgba(0,0,0,0.28)');
}

/** Satteldach über dem Quader (First entlang der langen Seite); abgewandte Giebel entfallen, beide Dachhälften werden gezeichnet. */
function gableRoof(ctx, cam, x0, y0, x1, y1, H, rh, roofCol, wallCol) {
  const z = cam.zoom;
  roofCol = snowy(roofCol); // Winter: Schnee auf dem Dach (season.js)
  const P = (x, y, h) => {
    const p = cam.worldToScreen(x, y);
    return { x: p.x, y: p.y - h * z };
  };
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const alongX = x1 - x0 >= y1 - y0;
  // [Punkte, Normale nach außen (Welt), Schrägfläche?]
  const pieces = alongX
    ? [
        [[P(x0, y0, H), P(x1, y0, H), P(x1, ym, H + rh), P(x0, ym, H + rh)], 0, -1, true],
        [[P(x0, y1, H), P(x1, y1, H), P(x1, ym, H + rh), P(x0, ym, H + rh)], 0, 1, true],
        [[P(x0, y0, H), P(x0, y1, H), P(x0, ym, H + rh)], -1, 0, false],
        [[P(x1, y0, H), P(x1, y1, H), P(x1, ym, H + rh)], 1, 0, false],
      ]
    : [
        [[P(x0, y0, H), P(x0, y1, H), P(xm, y1, H + rh), P(xm, y0, H + rh)], -1, 0, true],
        [[P(x1, y0, H), P(x1, y1, H), P(xm, y1, H + rh), P(xm, y0, H + rh)], 1, 0, true],
        [[P(x0, y0, H), P(x1, y0, H), P(xm, y0, H + rh)], 0, -1, false],
        [[P(x0, y1, H), P(x1, y1, H), P(xm, y1, H + rh)], 0, 1, false],
      ];
  const o = cam.worldToScreen(xm, ym);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE;
  // Wegzeigende Dachhälfte zuerst (sie ist von oben sichtbar, der Quaderdeckel darf nicht durchscheinen), dann die zugewandten Teile.
  const facing = pieces.map((pc) => {
    const n = cam.worldToScreen(xm + pc[1] * 10, ym + pc[2] * 10);
    return [pc, n.x - o.x, n.y - o.y];
  });
  facing.sort((a, b) => a[2] - b[2]);
  for (const [[pts, , , slope], sx, sy] of facing) {
    if (sy < -0.01 && !slope) continue; // abgewandter Giebel ist verdeckt, abgewandte Schräge nicht
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    const left = sx < 0;
    ctx.fillStyle = slope ? (left ? tint(roofCol, 0.1) : shade(roofCol, 0.22)) : left ? shade(wallCol, 0.1) : shade(wallCol, 0.3);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Kleiner Aufbau auf dem Dach (Schornstein, Lüfter, Klimaanlage). */
function roofBox(ctx, cam, cx, cy, s, base, h, color) {
  drawBox(ctx, cam, cx - s, cy - s, cx + s, cy + s, h, color, { base, noShadow: true });
}

const HOUSE_WALLS = ['#d8c9a6', '#cfc0a0', '#dad0bd', '#cfae93', '#bcc7b4', '#d6c07e'];
const HOUSE_ROOFS = ['#8c4a38', '#a15a3c', '#7d5a47', '#6f4a3a'];
const HALL_WALLS = ['#9aa0a3', '#a39d8f', '#8c97a0'];
const FACT_WALLS = ['#9a6a55', '#7b7e80', '#8a7f72'];

function houseDetails(ctx, top, seed) {
  const detail = top.cam.zoom >= DETAIL_ZOOM;
  const balcony = hash(seed) % 3 !== 0;
  for (const w of top.walls) {
    const odd = w.edge % 2 === 1;
    plinth(ctx, w, top.color, 23);
    if (!detail || w.len * w.z < 26) continue;
    const doorWall = !odd;
    windows(ctx, w, [[7, 18], [30, 41]], {
      gap: 28,
      ww: 11,
      seed,
      skip: (t, r) => (doorWall && r === 0 && Math.abs(t - 0.5) < 0.15) || (odd && balcony && r === 1 && Math.abs(t - 0.5) < 0.16),
    });
    if (doorWall) door(ctx, w, 0.5, 14, 17);
    else if (balcony) {
      const t0 = 0.32;
      const t1 = 0.68;
      fillPolys(ctx, [wallQuad(w, 0.45, 0.55, 24, 40)], GLASS, 'rgba(245,245,240,0.8)'); // Balkontür
      const slab = [wallPoint(w, t0, 23), wallPoint(w, t1, 23), wallPoint(w, t1, 23, 8), wallPoint(w, t0, 23, 8)];
      fillPolys(ctx, [slab], '#bdb8ad', OUTLINE);
      fillPolys(ctx, [wallQuad(w, t0, t1, 21, 23, 8)], '#8f8b82');
      fillPolys(ctx, [wallQuad(w, t0, t1, 23, 29, 8)], 'rgba(30,30,30,0.22)');
      lines(
        ctx,
        [
          [wallPoint(w, t0, 29, 8), wallPoint(w, t1, 29, 8)],
          [wallPoint(w, t0, 23, 8), wallPoint(w, t0, 29, 8)],
          [wallPoint(w, t1, 23, 8), wallPoint(w, t1, 29, 8)],
          [wallPoint(w, t0, 29, 0), wallPoint(w, t0, 29, 8)],
          [wallPoint(w, t1, 29, 0), wallPoint(w, t1, 29, 8)],
        ],
        '#3b3b3b',
        1.2,
      );
    }
  }
}

function hallDetails(ctx, top, seed) {
  const detail = top.cam.zoom >= DETAIL_ZOOM;
  const gateCol = ['#5b7c99', '#a24a3a', '#6d8a5b'][seed % 3];
  for (const w of top.walls) {
    plinth(ctx, w, top.color);
    if (!detail || w.len * w.z < 30) continue;
    // Wellblech-Rippen
    const segs = [];
    const n = Math.min(24, Math.round(w.len / 9));
    for (let i = 1; i < n; i++) segs.push([wallPoint(w, i / n, 5), wallPoint(w, i / n, 56)]);
    lines(ctx, segs, 'rgba(0,0,0,0.10)');
    band(ctx, w, 45, 55, Math.max(3, Math.round(w.len / 24)), 0.05, 0.95, '#3b566e');
    if (w.edge % 2 === 0) {
      if (w.len > 200) {
        gate(ctx, w, 0.3, 44, 34, gateCol);
        gate(ctx, w, 0.7, 44, 34, gateCol);
      } else gate(ctx, w, 0.5, 48, 34, gateCol);
    } else {
      door(ctx, w, 0.5, 12, 18, '#4a4f55');
    }
  }
}

function factoryDetails(ctx, top, seed) {
  const detail = top.cam.zoom >= DETAIL_ZOOM;
  for (const w of top.walls) {
    plinth(ctx, w, top.color);
    lines(ctx, [[wallPoint(w, 0, 40), wallPoint(w, 1, 40)]], 'rgba(0,0,0,0.25)');
    if (!detail || w.len * w.z < 30) continue;
    const gateWall = w.edge % 2 === 0;
    windows(ctx, w, [[48, 62], [70, 84]], { gap: 48, ww: 32, seed, lit: 0.35 });
    if (gateWall) {
      gate(ctx, w, 0.5, 60, 38, '#d1a93a', '#9a8f78');
      windows(ctx, w, [[8, 26]], { gap: 48, ww: 24, seed, skip: (t) => Math.abs(t - 0.5) < 0.22, lit: 0.2 });
    } else {
      windows(ctx, w, [[8, 28]], { gap: 48, ww: 26, seed, lit: 0.2 });
      door(ctx, w, 0.12, 12, 20, '#4a4f55');
    }
  }
}

/** Geparktes Auto als kleiner Körper mit Kabine (aufrecht ausgerichtet an x oder y, wie in 2D). */
export function drawCar(ctx, cam, c) {
  const lx = c.vertical ? 9 : 18;
  const ly = c.vertical ? 18 : 9;
  drawBox(ctx, cam, c.x - lx, c.y - ly, c.x + lx, c.y + ly, 9, c.color, { noShadow: false });
  const cx = c.vertical ? 8 : 9;
  const cy = c.vertical ? 9 : 8;
  drawBox(ctx, cam, c.x - cx, c.y - cy, c.x + cx, c.y + cy, 7, '#34495e', { base: 9, noShadow: true, roof: shade(c.color, 0.85), wallS: '#2b3b4b', wallE: '#22303d' });
}

/**
 * Parkbank (seit v5.23 aus Latten): drei Sitz- und zwei Lehnenlatten auf gusseisernen Wangen, ausgerichtet entlang des
 * Rundwegs (b.a), Lehne nach außen (b.rx, b.ry). Liegt die Lehne hinten, kommt sie zuerst, sonst zuletzt.
 */
export function drawBench(ctx, cam, b) {
  const IRON = '#33373a';
  const WOOD = '#a27849';
  const ca = Math.cos(b.a);
  const sa = Math.sin(b.a);
  const z = cam.zoom;
  const pos = (al, out) => [b.x + ca * al + b.rx * out, b.y + sa * al + b.ry * out];
  const shadow = [[-9.6, -3.2], [9.6, -3.2], [9.6, 4], [-9.6, 4]].map(([al, out]) => {
    const p = cam.worldToScreen(...pos(al, out));
    return { x: p.x - 2.4 * z, y: p.y + 1.2 * z };
  });
  ctx.beginPath();
  shadow.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fill();
  const part = (al, out, len, wid, h, base, color) => {
    const [x, y] = pos(al, out);
    return { x, y, len, wid, h, base, color, d: cam.depth(x, y) };
  };
  const legs = [part(-7.4, -0.2, 1.3, 5.4, 4.4, 0, IRON), part(7.4, -0.2, 1.3, 5.4, 4.4, 0, IRON)];
  const seat = [-1.8, 0, 1.8].map((out) => part(0, out, 18, 1.5, 0.8, 4.4, WOOD));
  const back = [part(-7.4, 2.7, 1.3, 1.2, 10.4, 0, IRON), part(7.4, 2.7, 1.3, 1.2, 10.4, 0, IRON), part(0, 3, 18, 0.8, 1.4, 6.4, WOOD), part(0, 3, 18, 0.8, 1.4, 8.6, WOOD)];
  const byDepth = (list) => list.sort((p, q) => p.d - q.d || p.base - q.base);
  const front = [...byDepth(legs), ...byDepth(seat)];
  const order = cam.depth(...pos(0, 3)) < cam.depth(b.x, b.y) ? [...byDepth(back), ...front] : [...front, ...byDepth(back)];
  for (const p of order) drawRotBox(ctx, cam, p.x, p.y, p.len, p.wid, b.a, p.h, p.color, { noShadow: true, base: p.base, line: 0.5 });
}

/** Gebäude der Stadt (Haus, Halle, Fabrik) mit Fenstern, Türen, Toren, Balkonen und Dachaufbauten. */
export function drawTownBuilding(ctx, cam, b, season = 'summer') {
  if (b.kind === 'bigpart') {
    drawBigBody(ctx, cam, b, season); // Körper eines Großbaus (Kaserne, Fabrikhalle, Flughafen; bigbuild.js)
    return;
  }
  if (b.kind === 'uni') {
    drawUniversityIso(ctx, cam, b); // 3 × 3-Großbau, für jede Drehung dasselbe Bild (university.js)
    return;
  }
  if (WORKS_KINDS.includes(b.kind)) {
    drawWorksIso(ctx, cam, b, season); // 2 × 2-Werke und Kraftwerk, für jede Drehung dasselbe Bild (works.js)
    return;
  }
  if (b.kind === 'town') {
    drawTownIso(ctx, cam, b, season); // 1 × 1-Stadtgebäude (seit v5.14), je Art und Stufe eigenes Bild (townhouses.js)
    return;
  }
  if (drawMapIso(ctx, cam, b)) return; // Gebäude der Karte, gemalt (seit v5.23, maptown.js)
  if (spriteOverrides[b.kind]?.(ctx, cam, b)) return;
  const hw = b.w / 2;
  const hh = b.h / 2;
  const x0 = b.x - hw;
  const y0 = b.y - hh;
  const x1 = b.x + hw;
  const y1 = b.y + hh;
  const seed = hash(b.x, b.y);
  const H = TOWN_H[b.kind];
  const z = cam.zoom;
  if (b.kind === 'wall') {
    drawBox(ctx, cam, x0, y0, x1, y1, 22, '#a29f94', { roof: '#c4c1b6' });
    return;
  }
  if (b.kind === 'barracks' || b.kind === 'vhall' || b.kind === 'heliport') {
    drawMilitaryTown(ctx, cam, b, x0, y0, x1, y1, H, seed);
    return;
  }
  if (b.kind === 'platform') {
    const ang = b.angle || 0;
    drawRotBox(ctx, cam, b.x, b.y, b.w, b.h, ang, H, '#a7a8a2', { roof: '#bfbfb7' });
    // Bahnsteigdach auf Stützen (nur bei genug Zoom)
    if (z >= DETAIL_ZOOM) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      for (const t of [-0.36, 0, 0.36]) {
        drawRotBox(ctx, cam, b.x + c * b.w * t, b.y + s * b.w * t, 4, 4, ang, 34, '#6d7478', { base: H, noShadow: true });
      }
      drawRotBox(ctx, cam, b.x, b.y, b.w * 0.86, b.h * 0.8, ang, 3, '#8d959a', { base: H + 34, noShadow: true, roof: '#a9b0b4' });
    }
    return;
  }
  if (b.kind === 'train' && b.angle) {
    drawRotBox(ctx, cam, b.x, b.y, b.w - 6, b.h - 8, b.angle, 30, TRAIN_PAINT[b.part] ?? '#777', {});
    return;
  }
  if (b.kind === 'train') {
    drawBox(ctx, cam, x0 + 3, y0 + 4, x1 - 3, y1 - 4, 30, TRAIN_PAINT[b.part] ?? '#777', {});
    return;
  }
  let wall;
  if (b.kind === 'house') wall = HOUSE_WALLS[seed % HOUSE_WALLS.length];
  else if (b.kind === 'hall') wall = HALL_WALLS[seed % HALL_WALLS.length];
  else if (b.kind === 'station') wall = '#cdbb98';
  else if (b.kind === 'clinic') wall = '#e9e7e1';
  else wall = FACT_WALLS[seed % FACT_WALLS.length];
  const opts = { wallS: shade(wall, 0.2), wallE: shade(wall, 0.42), noTop: b.kind === 'house' || b.kind === 'station' };
  const top = drawBox(ctx, cam, x0, y0, x1, y1, H, wall, { ...opts, roof: b.kind === 'hall' ? '#b3b9bd' : b.kind === 'clinic' ? '#d9dad6' : '#6a6e70' });
  top.cam = cam;
  top.color = wall;
  if (b.kind === 'house') {
    houseDetails(ctx, top, seed);
    const roof = HOUSE_ROOFS[(seed >>> 3) % HOUSE_ROOFS.length];
    gableRoof(ctx, cam, x0, y0, x1, y1, H, 12, roof, wall);
    if (seed % 4 === 0 && z >= DETAIL_ZOOM) roofBox(ctx, cam, x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.3, 5, H + 4, 14, '#7a5a4a');
  } else if (b.kind === 'station') {
    hallDetails(ctx, top, seed);
    gableRoof(ctx, cam, x0, y0, x1, y1, H, 14, '#7d4b3d', wall);
    // Uhrenturm am einen Ende
    const alongX = b.w >= b.h;
    const tx = alongX ? b.x - hw * 0.72 : b.x;
    const ty = alongX ? b.y : b.y - hh * 0.72;
    roofBox(ctx, cam, tx, ty, 11, H, 30, '#b5a789');
    roofBox(ctx, cam, tx, ty, 13, H + 30, 6, '#6a4034');
    if (z >= DETAIL_ZOOM) {
      const c = cam.worldToScreen(tx, ty);
      ctx.fillStyle = '#f2efe4';
      ctx.beginPath();
      ctx.arc(c.x, c.y - (H + 18) * z, 5 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else if (b.kind === 'clinic') {
    // Krankenhaus (Stadt, seit v5.01): helle Fassade mit Fensterreihen, rotes Kreuz auf dem Dach
    hallDetails(ctx, top, seed);
    roofCross(ctx, cam, b.x, b.y, H, Math.min(hw, hh) * 0.5, Math.min(hw, hh) * 0.15, '#d23a3a');
  } else if (b.kind === 'hall') {
    hallDetails(ctx, top, seed);
    if (z >= DETAIL_ZOOM) {
      roofBox(ctx, cam, b.x - hw * 0.4, b.y, 9, H, 6, '#8d9296');
      roofBox(ctx, cam, b.x + hw * 0.35, b.y, 9, H, 6, '#8d9296');
    }
  } else {
    factoryDetails(ctx, top, seed);
    if (z >= DETAIL_ZOOM) {
      roofBox(ctx, cam, b.x - hw * 0.4, b.y + hh * 0.2, 12, H, 8, '#7b7f82');
      roofBox(ctx, cam, b.x, b.y - hh * 0.3, 8, H, 12, '#5d6366');
    }
    // Schornstein mit rot-weißen Ringen
    const c = cam.worldToScreen(b.x + hw * 0.7, b.y - hh * 0.6);
    const base = c.y - H * z;
    ctx.fillStyle = '#3b3d3f';
    ctx.fillRect(c.x - 5 * z, base - 56 * z, 10 * z, 56 * z);
    ctx.fillStyle = '#c9c9c4';
    ctx.fillRect(c.x - 5 * z, base - 56 * z, 10 * z, 6 * z);
    ctx.fillStyle = '#b3423a';
    ctx.fillRect(c.x - 5 * z, base - 50 * z, 10 * z, 6 * z);
    ctx.fillStyle = '#55585b';
    ctx.fillRect(c.x - 6.5 * z, base - 60 * z, 13 * z, 5 * z);
  }
}

// ---- Körper der Großbauten mit Schmuck (seit v5.11: Kaserne und Fabrikhalle; Maße und Schmuck in bigbuild.js) ----

/** Ein Körper eines Großbaus: Baum, Fahrzeug, Quader mit Fenstern, Toren, Satteldach oder Sheddach; sonst wie bisher (bigbuild.js). */
function drawBigBody(ctx, cam, b, season) {
  const p = b.part;
  if (p.t === 'tree') {
    drawTree(ctx, cam, p, season); // gemalter Baum (renderer.js nimmt vorher das Baum-Bild, wenn geladen)
    return;
  }
  if (p.t === 'veh') {
    drawYardVehicle(ctx, cam, p);
    return;
  }
  if (p.t !== 'box' || !p.fine) {
    drawBigPart(ctx, cam, p, b.color);
    return;
  }
  const base = p.base ?? 0;
  const top = drawBox(ctx, cam, p.x0, p.y0, p.x1, p.y1, p.h, p.c, { base, roof: p.roof, noShadow: base > 0, noTop: !!p.gable, wallS: shade(p.c, 0.12), wallE: shade(p.c, 0.34) });
  const detail = cam.zoom >= DETAIL_ZOOM;
  const seed = hash(p.x0, p.y0);
  for (const w of top.walls) {
    if (!base && p.h > 8) plinth(ctx, w, p.c);
    if (p.stripe) fillPolys(ctx, [wallQuad(w, 0, 1, p.h - 4.5, p.h - 1)], b.color); // Band in Teamfarbe unter der Dachkante
    if (!detail || w.len * w.z < 14) continue;
    if (p.ribs) {
      // Wellblech: feine senkrechte Rippen
      const segs = [];
      const n = Math.floor(w.len / 6);
      for (let i = 1; i < n; i++) segs.push([wallPoint(w, i / n, 4), wallPoint(w, i / n, p.h)]);
      lines(ctx, segs, 'rgba(0,0,0,0.1)');
    }
    const gt = p.gates?.e.includes(w.edge) ? p.gates : null;
    const dr = p.door?.includes(w.edge);
    if (p.win) {
      const rows = gt ? p.win.filter(([h0]) => h0 > gt.h + 4) : p.win;
      const dw = 8 / w.len;
      if (rows.length) windows(ctx, w, rows, { gap: p.wg ?? 20, ww: p.ww ?? 8, seed, lit: 0.22, skip: dr ? (t, r) => r === 0 && Math.abs(t - 0.5) < dw * 1.6 : null });
    }
    if (gt) for (let i = 0; i < gt.n; i++) gate(ctx, w, (i + 0.5) / gt.n, gt.w, gt.h, '#c9b24a', '#8b9096');
    if (dr) door(ctx, w, 0.5, 8, Math.min(12, p.h - 3), '#4a4f55');
  }
  if (p.gable) gableRoof(ctx, cam, p.x0, p.y0, p.x1, p.y1, base + p.h, p.gable, p.roof, p.c);
  if (p.saw) sawRoof(ctx, cam, p, base + p.h);
}

/** Sheddach: n Zähne entlang x, jeder steigt nach +x an und hat dort eine senkrechte Glasfläche (für jede Drehung richtig verdeckt). */
function sawRoof(ctx, cam, p, H) {
  const z = cam.zoom;
  const { n, rh } = p.saw;
  const P = (x, y, h) => {
    const q = cam.worldToScreen(x, y);
    return { x: q.x, y: q.y - h * z };
  };
  const ym = (p.y0 + p.y1) / 2;
  const dir = (nx, ny) => {
    const o = cam.worldToScreen(p.x0, ym);
    const q = cam.worldToScreen(p.x0 + nx * 10, ym + ny * 10);
    return { x: q.x - o.x, y: q.y - o.y };
  };
  const dx = dir(1, 0); // Glasseite (+x)
  const dyN = dir(0, -1);
  const roof = snowy(p.roof);
  const slope = dir(-1, 0).x < 0 ? tint(roof, 0.12) : shade(roof, 0.2);
  const glass = dx.x < 0 ? '#86aac2' : '#5d7f97';
  const step = (p.x1 - p.x0) / n;
  const teeth = [];
  for (let i = 0; i < n; i++) teeth.push([p.x0 + i * step, p.x0 + (i + 1) * step]);
  teeth.sort((a, b) => cam.worldToScreen(a[0], ym).y - cam.worldToScreen(b[0], ym).y);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE;
  const face = (pts, fill) => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  for (const [a0, a1] of teeth) {
    face([P(a0, p.y0, H), P(a1, p.y0, H + rh), P(a1, p.y1, H + rh), P(a0, p.y1, H)], slope);
    if (dx.y > 0.01) {
      face([P(a1, p.y0, H), P(a1, p.y1, H), P(a1, p.y1, H + rh), P(a1, p.y0, H + rh)], glass);
      if (z >= DETAIL_ZOOM) {
        const segs = [];
        const m = Math.max(2, Math.round((p.y1 - p.y0) / 14));
        for (let k = 1; k < m; k++) {
          const y = p.y0 + ((p.y1 - p.y0) * k) / m;
          segs.push([P(a1, y, H), P(a1, y, H + rh)]);
        }
        lines(ctx, segs, 'rgba(235,240,240,0.55)');
      }
    }
    for (const [y, s] of [[p.y0, -1], [p.y1, 1]]) {
      if (dyN.y * -s > 0.01) face([P(a0, y, H), P(a1, y, H), P(a1, y, H + rh)], shade(p.c, dyN.x * -s < 0 ? 0.12 : 0.34));
    }
  }
  ctx.restore();
}

/** Fahrzeug auf dem Hof (Panzer, Schützenpanzer, Lkw, Jeep) aus Quadern, Front nach +x bzw. +y (bigbuild.js VEH). */
function drawYardVehicle(ctx, cam, p) {
  const ax = p.ax === 'x';
  const d = VEH[p.v];
  const f = d.l / 2;
  const C = VEH_COLOR;
  // Quader in Fahrzeugachsen: u entlang (Front +), v quer
  const part = (u0, u1, v0, v1, h, color, o = {}) => {
    const [x0, x1, y0, y1] = ax ? [p.x + u0, p.x + u1, p.y + v0, p.y + v1] : [p.x + v0, p.x + v1, p.y + u0, p.y + u1];
    return drawBox(ctx, cam, x0, y0, x1, y1, h, color, { wallS: shade(color, 0.15), wallE: shade(color, 0.38), ...o });
  };
  if (p.v === 'tank') {
    part(-f, f, -d.w / 2, d.w / 2, 7, '#3d4228', { roof: C });
    part(-8, 5, -6, 6, 5, tint(C, 0.06), { base: 7, noShadow: true });
    part(5, f + 11, -1.2, 1.2, 2.4, '#3d4528', { base: 9, noShadow: true });
  } else if (p.v === 'apc') {
    part(-f, f, -d.w / 2, d.w / 2, 10, C, { roof: tint(C, 0.08) });
    part(-4, 4, -4, 4, 4, shade(C, 0.1), { base: 10, noShadow: true });
    part(4, f + 3, -0.8, 0.8, 1.6, '#3d4528', { base: 12, noShadow: true });
  } else if (p.v === 'truck') {
    part(-f, f, -d.w / 2, d.w / 2, 4, '#2d2f2a', { roof: '#3d4228' }); // Fahrgestell
    part(f - 9, f, -d.w / 2, d.w / 2, 9, '#4f5a33', { base: 4, noShadow: true, roof: '#5a6440' }); // Kabine
    part(-f, f - 11, -d.w / 2, d.w / 2, 9, '#7a8150', { base: 4, noShadow: true }); // Plane
  } else {
    part(-f, f, -d.w / 2, d.w / 2, 6, C, { roof: tint(C, 0.1) });
    part(-5, 2, -d.w / 2 + 1, d.w / 2 - 1, 3.5, '#34495e', { base: 6, noShadow: true, roof: '#4b5a3a' }); // Bügel und Scheibe
  }
}

/** Fahnenmast mit Teamfarbe (Welt x, y; Höhe ab Boden h). */
function flagPole(ctx, cam, x, y, base, h, color) {
  const z = cam.zoom;
  const p = cam.worldToScreen(x, y);
  const y0 = p.y - base * z;
  ctx.strokeStyle = '#d8d8d0';
  ctx.lineWidth = Math.max(1, 1.6 * z);
  ctx.beginPath();
  ctx.moveTo(p.x, y0);
  ctx.lineTo(p.x, y0 - h * z);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(p.x, y0 - h * z, 13 * z, 8 * z);
}

/**
 * Militärische Stadtgebäude (seit v4.96): Kaserne (zwei lange Blöcke mit Satteldach und Fahne), Fabrikhalle (große Halle mit Toren)
 * und Heliport (Landeplatz am Boden aus citylayer.js, hier nur Turm mit Windsack). Oliv, damit sie neben Wohnhäusern auffallen.
 */
function drawMilitaryTown(ctx, cam, b, x0, y0, x1, y1, H, seed) {
  const wall = '#8f9670';
  const roof = '#56603a';
  if (b.kind === 'barracks') {
    const alongX = (seed & 1) === 0;
    const gap = 4;
    const halves = alongX
      ? [[x0, y0, x1, (y0 + y1) / 2 - gap], [x0, (y0 + y1) / 2 + gap, x1, y1]]
      : [[x0, y0, (x0 + x1) / 2 - gap, y1], [(x0 + x1) / 2 + gap, y0, x1, y1]];
    for (const [a0, b0, a1, b1] of halves) {
      const top = drawBox(ctx, cam, a0, b0, a1, b1, H, wall, { wallS: shade(wall, 0.2), wallE: shade(wall, 0.42), noTop: true });
      top.cam = cam;
      top.color = wall;
      for (const w of top.walls) plinth(ctx, w, wall);
      if (cam.zoom >= DETAIL_ZOOM) for (const w of top.walls) windows(ctx, w, [[9, 19]], { gap: 12, ww: 6, seed, lit: 0.3 });
      gableRoof(ctx, cam, a0, b0, a1, b1, H, 8, roof, wall);
    }
    flagPole(ctx, cam, x1 - 3, y1 - 3, 0, 46, b.color ?? '#c33');
    return;
  }
  if (b.kind === 'vhall') {
    const top = drawBox(ctx, cam, x0, y0, x1, y1, H, '#868b78', { wallS: shade('#868b78', 0.2), wallE: shade('#868b78', 0.42), roof: '#5c6352' });
    top.cam = cam;
    top.color = '#868b78';
    for (const w of top.walls) {
      plinth(ctx, w, top.color);
      if (w.len * w.z >= 24) gate(ctx, w, 0.5, w.len * 0.55, H * 0.62, '#c9b24a', '#6f7468');
    }
    if (cam.zoom >= DETAIL_ZOOM) {
      roofBox(ctx, cam, b.x - (x1 - x0) * 0.22, b.y, 6, H, 5, '#4b5143');
      roofBox(ctx, cam, b.x + (x1 - x0) * 0.22, b.y, 6, H, 5, '#4b5143');
    }
    flagPole(ctx, cam, x0 + 2, y1 - 2, H, 22, b.color ?? '#c33');
    return;
  }
  // Heliport: Turm in der Ecke (der Landeplatz liegt am Boden), Windsack
  const tx = x1 - 6;
  const ty = y0 + 6;
  drawBox(ctx, cam, tx - 6, ty - 6, tx + 6, ty + 6, H, '#9a9d92', { roof: '#4a4f4a' });
  drawBox(ctx, cam, tx - 7.5, ty - 7.5, tx + 7.5, ty + 7.5, 6, '#5f7f8f', { base: H, noShadow: true, roof: '#3a4a52' });
  const p = cam.worldToScreen(x0 + 4, y1 - 4);
  const z = cam.zoom;
  ctx.strokeStyle = '#d8d8d0';
  ctx.lineWidth = Math.max(1, 1.4 * z);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x, p.y - 26 * z);
  ctx.stroke();
  ctx.fillStyle = '#e8762c';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 26 * z);
  ctx.lineTo(p.x + 14 * z, p.y - 23 * z);
  ctx.lineTo(p.x, p.y - 20 * z);
  ctx.closePath();
  ctx.fill();
}

// ---- Gebäude der Teams -------------------------------------------------------------------------------------------

const planePt = (cam, x, y, h) => {
  const p = cam.worldToScreen(x, y);
  return { x: p.x, y: p.y - h * cam.zoom };
};

/**
 * Spielgebäude (Team): seit v5.21 sind alle Militärgebäude und ihre Baustellen gemalt (milbuild.js), die Hauptstadt ist ein
 * Rathaus (cityhall.js). Übrig bleibt nur die Baustelle der Hauptstadt: ein halb durchsichtiger Kasten, der mit dem Fortschritt wächst.
 */
export function drawTeamBuilding(ctx, cam, b, color) {
  if (drawMilIso(ctx, cam, b, color)) return;
  if (b.main && b.type === 'fob' && b.built) {
    drawCityHallIso(ctx, cam, b, color); // Hauptstadt: modernes Rathaus, für jede Drehung dasselbe Bild (cityhall.js)
    return;
  }
  const x0 = b.cx * TILE;
  const y0 = b.cy * TILE;
  const h = Math.max(4, buildingHeight(b) * (b.built ? 1 : b.progress || 0));
  drawBox(ctx, cam, x0, y0, x0 + b.w * TILE, y0 + b.h * TILE, h, color, { alpha: 0.55, noShadow: true });
}

export { hexA };

/**
 * Ruine eines eingestürzten Stadthauses (Häuserkampf): Schuttfläche, ein Mauerrest in der Farbe des Hauses und Trümmerbrocken,
 * nach Tiefe sortiert. Zufall fest aus der Lage, damit die Ruine bei jedem Bild gleich aussieht.
 */
/**
 * Versorgungskiste (isometrisch): olivgrüne Holzkiste mit Gurten und gelbem Schloss auf dem Deckel. base = Höhe über dem Boden
 * (auf dem Rücken eines Trägers), glow = liegt am Boden (pulsierender Schimmer).
 */
export function drawCrate(ctx, cam, x, y, s = 16, base = 0, glow = 0) {
  const h = s * 0.72;
  const x0 = x - s / 2;
  const y0 = y - s / 2;
  if (glow > 0) {
    const p = cam.worldToScreen(x, y);
    ctx.save();
    ctx.fillStyle = `rgba(232,184,48,${0.22 * glow})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s * 1.4 * cam.zoom, s * 0.7 * cam.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawBox(ctx, cam, x0, y0, x0 + s, y0 + s, h, '#66713c', { roof: '#7c8848', base, noShadow: base > 0 });
  const top = base + h;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(40,44,22,0.85)';
  ctx.lineWidth = Math.max(1, s * 0.1 * cam.zoom);
  ctx.beginPath();
  for (const f of [0.3, 0.7]) {
    const a = planePt(cam, x0 + s * f, y0, top);
    const b = planePt(cam, x0 + s * f, y0 + s, top);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  const c = planePt(cam, x, y, top);
  const r = Math.max(1.2, s * 0.13 * cam.zoom);
  ctx.fillStyle = '#e8b830';
  ctx.fillRect(c.x - r, c.y - r * 0.6, r * 2, r * 1.2);
  ctx.restore();
}

/** Flaches Kreuz auf einem Dach der Höhe H (Mitte x/y, halbe Armlänge a, halbe Armbreite t, Weltmaße). */
function roofCross(ctx, cam, x, y, H, a, t, color) {
  const z = cam.zoom;
  const quad = (qx0, qy0, qx1, qy1) => {
    ctx.beginPath();
    for (const [px, py] of [[qx0, qy0], [qx1, qy0], [qx1, qy1], [qx0, qy1]]) {
      const p = cam.worldToScreen(px, py);
      ctx.lineTo(p.x, p.y - H * z);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = color;
  quad(x - a, y - t, x + a, y + t);
  quad(x - t, y - a, x + t, y + a);
}

export function drawRubble(ctx, cam, b, burnt = false) {
  const hw = b.w / 2;
  const hh = b.h / 2;
  const x0 = b.x - hw;
  const y0 = b.y - hh;
  const seed0 = hash(b.x, b.y);
  let seed = seed0 || 1;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  let wall;
  if (b.kind === 'house') wall = HOUSE_WALLS[seed0 % HOUSE_WALLS.length];
  else if (b.kind === 'hall') wall = HALL_WALLS[seed0 % HALL_WALLS.length];
  else if (b.kind === 'station') wall = '#cdbb98';
  else wall = FACT_WALLS[seed0 % FACT_WALLS.length];
  if (burnt) wall = '#4d4842'; // ausgebranntes Teamgebäude: verkohlt
  drawBox(ctx, cam, x0 + 2, y0 + 2, x0 + b.w - 2, y0 + b.h - 2, 4, burnt ? '#3a3632' : '#6f6a62', { roof: burnt ? '#45403a' : '#857f75', noShadow: true });
  const H = b.hgt ?? (TOWN_H[b.kind] || 40);
  const pieces = [];
  // Mauerrest: eine Ecke steht noch (zwei kurze Wandstücke)
  const ex = rnd() < 0.5 ? x0 : x0 + b.w;
  const ey = rnd() < 0.5 ? y0 : y0 + b.h;
  const sx = ex === x0 ? 1 : -1;
  const sy = ey === y0 ? 1 : -1;
  const lx = b.w * (0.3 + rnd() * 0.25);
  const ly = b.h * (0.3 + rnd() * 0.25);
  pieces.push({ x0: Math.min(ex, ex + sx * lx), y0: Math.min(ey, ey + sy * 8), x1: Math.max(ex, ex + sx * lx), y1: Math.max(ey, ey + sy * 8), h: H * 0.5, c: wall });
  pieces.push({ x0: Math.min(ex, ex + sx * 8), y0: Math.min(ey, ey + sy * ly), x1: Math.max(ex, ex + sx * 8), y1: Math.max(ey, ey + sy * ly), h: H * 0.35, c: shade(wall, 0.15) });
  const n = Math.max(6, Math.min(26, Math.round((b.w * b.h) / 700)));
  const grays = burnt ? ['#5a554e', '#47423c', '#6d675e', '#2a2724', '#7a5a3a'] : ['#8d877c', '#79736a', '#9a9387', '#6b655d', wall];
  for (let i = 0; i < n; i++) {
    const s = 5 + rnd() * 10;
    const px = x0 + 6 + rnd() * (b.w - 12 - s);
    const py = y0 + 6 + rnd() * (b.h - 12 - s);
    pieces.push({ x0: px, y0: py, x1: px + s, y1: py + s * (0.6 + rnd() * 0.8), h: 3 + rnd() * 12, c: grays[i % grays.length] });
  }
  pieces.sort((a, c) => cam.depth((a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2) - cam.depth((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2));
  for (const p of pieces) drawBox(ctx, cam, p.x0, p.y0, p.x1, p.y1, p.h, p.c, { noShadow: p.h < 10 });
}

/** Fahrzeugwrack isometrisch ohne Modellbild: flache, verkohlte Wanne; Panzer und Schützenpanzer mit verdrehtem Turm. */
export function drawWreckBox(ctx, cam, w) {
  const seed = hash(w.x, w.y) || 1;
  const big = w.type === 'tank';
  const len = w.air ? w.r * 2.4 : big ? 28 : w.type === 'ifv' ? 24 : 18;
  const wid = w.air ? w.r * 0.9 : big ? 18 : w.type === 'ifv' ? 14 : 12;
  drawRotBox(ctx, cam, w.x, w.y, len, wid, w.angle, w.air ? 6 : 8, '#2b2825', { roof: '#3a3530' });
  if (w.type === 'tank' || w.type === 'ifv') {
    const ta = w.angle + ((seed % 628) / 100);
    drawRotBox(ctx, cam, w.x, w.y, big ? 14 : 11, big ? 12 : 9, ta, 5, '#2b2825', { base: 8, roof: '#36312c', noShadow: true });
  }
}

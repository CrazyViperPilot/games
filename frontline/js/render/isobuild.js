// Isometrische Gebäude mit Details (Fenster, Türen, Tore, Balkone, Dächer). Alles wird gezeichnet, keine Bilddateien.
// Spätere Sprites (z. B. freies Grafikpaket oder eigene Entwürfe) lassen sich pro Gebäudeart einhängen:
// spriteOverrides.house = (ctx, cam, b) => { …; return true; } ersetzt die gemalte Variante (Rückgabe true = erledigt).
import { BALANCE } from '../data/balance.js';
import { drawBox, drawRotBox, wallPoint, wallQuad, buildingHeight, TOWN_H } from './iso.js';
import { shade, tint, hexA } from './sprites.js';

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

/** Satteldach über dem Quader (First entlang der langen Seite); keine Rückseiten. */
function gableRoof(ctx, cam, x0, y0, x1, y1, H, rh, roofCol, wallCol) {
  const z = cam.zoom;
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
  for (const [pts, nx, ny, slope] of pieces) {
    const n = cam.worldToScreen(xm + nx * 10, ym + ny * 10);
    const sx = n.x - o.x;
    const sy = n.y - o.y;
    if (sy < -0.01) continue; // zeigt vom Betrachter weg
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

/** Gebäude der Stadt (Haus, Halle, Fabrik) mit Fenstern, Türen, Toren, Balkonen und Dachaufbauten. */
export function drawTownBuilding(ctx, cam, b) {
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
  else wall = FACT_WALLS[seed % FACT_WALLS.length];
  const opts = { wallS: shade(wall, 0.2), wallE: shade(wall, 0.42), noTop: b.kind === 'house' || b.kind === 'station' };
  const top = drawBox(ctx, cam, x0, y0, x1, y1, H, wall, { ...opts, roof: b.kind === 'hall' ? '#b3b9bd' : '#6a6e70' });
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

// ---- Gebäude der Teams -------------------------------------------------------------------------------------------

/** Kleiner Panzer (aufrecht) vor oder im Tor der Fahrzeughalle. */
function miniTank(ctx, p, s, team) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = '#23262a';
  ctx.fillRect(-15 * s, -5 * s, 30 * s, 5 * s);
  ctx.fillStyle = '#566048';
  ctx.fillRect(-13 * s, -11 * s, 26 * s, 7 * s);
  ctx.fillStyle = '#667257';
  ctx.fillRect(-7 * s, -17 * s, 15 * s, 7 * s);
  ctx.fillStyle = '#2b2f2b';
  ctx.fillRect(7 * s, -15 * s, 17 * s, 2.4 * s);
  ctx.fillStyle = team;
  ctx.fillRect(-13 * s, -7 * s, 5 * s, 2.5 * s);
  ctx.restore();
}

const planePt = (cam, x, y, h) => {
  const p = cam.worldToScreen(x, y);
  return { x: p.x, y: p.y - h * cam.zoom };
};

/** Fahrzeughalle (Panzerwerkstatt): Tore mit Panzer, Teamband, Dachkran, Abluft. */
function drawDepot(ctx, cam, b, color, x0, y0, x1, y1) {
  const z = cam.zoom;
  const H = 44;
  const body = '#6f7668';
  const top = drawBox(ctx, cam, x0, y0, x1, y1, H, body, { noTop: true, wallS: shade(body, 0.12), wallE: shade(body, 0.34) });
  for (const w of top.walls) {
    // Teamband unter dem Dach, Sockel
    fillPolys(ctx, [wallQuad(w, 0, 1, H - 7, H)], color);
    plinth(ctx, w, body);
    if (z < DETAIL_ZOOM || w.len * z < 30) continue;
    gate(ctx, w, 0.5, 58, 30, '#d1a93a', '#8b9096');
    // Panzer im Tor
    const c = wallPoint(w, 0.5, 0);
    miniTank(ctx, { x: c.x, y: c.y - 1 }, z * 0.95, color);
    // Warnstreifen links und rechts
    const segs = [];
    for (let i = 0; i < 6; i++) {
      const h = 2 + i * 5;
      segs.push([wallPoint(w, 0.06, h), wallPoint(w, 0.1, h + 3)]);
      segs.push([wallPoint(w, 0.9, h), wallPoint(w, 0.94, h + 3)]);
    }
    lines(ctx, segs, '#e8c53b', 1.6);
  }
  gableRoof(ctx, cam, x0, y0, x1, y1, H, 10, '#5d6458', body);
  if (z >= DETAIL_ZOOM) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    // Dachkran (Portal mit Haken)
    const A = planePt(cam, cx - 30, cy, H + 14);
    const B = planePt(cam, cx + 30, cy, H + 14);
    ctx.save();
    ctx.strokeStyle = '#d1a93a';
    ctx.lineWidth = 3 * z;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(A.x, A.y + 14 * z);
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(B.x, B.y + 14 * z);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#2b2f2b';
    const m = planePt(cam, cx, cy, H + 14);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x, m.y + 14 * z);
    ctx.stroke();
    ctx.restore();
    roofBox(ctx, cam, cx - 26, cy + 20, 5, H + 6, 8, '#4a4f55');
    roofBox(ctx, cam, cx + 26, cy - 20, 5, H + 6, 10, '#4a4f55');
  }
  return top;
}

/** Zentrale (FOB): Sockelbau mit Fensterband und Eingang, Leitstellenturm, Radarschüssel, Antennen, Flagge. */
function drawCentral(ctx, cam, b, color, x0, y0, x1, y1) {
  const z = cam.zoom;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const body = tint(shade(color, 0.35), 0.35);
  const lower = drawBox(ctx, cam, x0, y0, x1, y1, 32, body, { roof: '#6f757a', wallS: shade(body, 0.1), wallE: shade(body, 0.32) });
  for (const w of lower.walls) {
    plinth(ctx, w, body);
    fillPolys(ctx, [wallQuad(w, 0, 1, 27, 32)], color); // Teamband
    if (z < DETAIL_ZOOM || w.len * z < 30) continue;
    band(ctx, w, 10, 24, 7, 0.05, 0.95);
    if (w.edge % 2 === 0) {
      door(ctx, w, 0.5, 16, 16, '#2a3036');
      fillPolys(ctx, [[wallPoint(w, 0.38, 19), wallPoint(w, 0.62, 19), wallPoint(w, 0.62, 19, 9), wallPoint(w, 0.38, 19, 9)]], '#e6e8e4', OUTLINE); // Vordach
    }
  }
  const s = (x1 - x0) * 0.26;
  const tower = drawBox(ctx, cam, cx - s, cy - s, cx + s, cy + s, 24, body, { base: 32, roof: '#80868a', wallS: shade(body, 0.08), wallE: shade(body, 0.3) });
  if (z >= DETAIL_ZOOM) for (const w of tower.walls) band(ctx, w, 5, 18, 5, 0.06, 0.94, '#3b6a8f');
  // Radarschüssel und Antennen auf dem Turm
  const roofC = planePt(cam, cx, cy, 56);
  ctx.save();
  ctx.fillStyle = '#d7dadb';
  ctx.strokeStyle = '#2b2f2b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(roofC.x - 6 * z, roofC.y - 8 * z, 11 * z, 6 * z, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(roofC.x - 6 * z, roofC.y - 8 * z);
  ctx.lineTo(roofC.x - 2 * z, roofC.y - 15 * z);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(roofC.x + 8 * z, roofC.y);
  ctx.lineTo(roofC.x + 8 * z, roofC.y - 24 * z);
  ctx.moveTo(roofC.x + 3 * z, roofC.y);
  ctx.lineTo(roofC.x + 3 * z, roofC.y - 14 * z);
  ctx.stroke();
  ctx.fillStyle = '#e04a3a';
  ctx.beginPath();
  ctx.arc(roofC.x + 8 * z, roofC.y - 24 * z, 1.8 * z, 0, Math.PI * 2);
  ctx.fill();
  // Flagge auf dem Sockelbau
  const f = planePt(cam, x1 - 10, y0 + 10, 32);
  ctx.strokeStyle = '#2b2f2b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(f.x, f.y - 26 * z);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(f.x, f.y - 26 * z, 14 * z, 8 * z);
  ctx.restore();
  return lower;
}

/** Landeplatz: Betonplatte mit Teamrand, H, Kreis, Randfeuer und Windsack. */
function drawHelipad(ctx, cam, b, color, x0, y0, x1, y1) {
  const z = cam.zoom;
  const top = drawBox(ctx, cam, x0, y0, x1, y1, 5, '#8a8e92', { roof: '#6b7075', wallS: '#7d8286', wallE: '#62676b', noShadow: false });
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hgt = 5;
  const P = (x, y) => planePt(cam, x, y, hgt);
  const poly = (pts, fill) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const p = P(x, y);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ctx.save();
  // Teamfarbener Rand
  const m = 5;
  ctx.beginPath();
  [[x0 + m, y0 + m], [x1 - m, y0 + m], [x1 - m, y1 - m], [x0 + m, y1 - m]].forEach(([x, y], i) => {
    const p = P(x, y);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 3 * z);
  ctx.stroke();
  // Ring
  const r = (x1 - x0) * 0.36;
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const p = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1.2, 2.2 * z);
  ctx.stroke();
  // H (zwei Balken und Quersteg, Welt-ausgerichtet)
  const hh = r * 0.62;
  const bw = r * 0.2;
  poly([[cx - hh, cy - hh], [cx - hh + bw, cy - hh], [cx - hh + bw, cy + hh], [cx - hh, cy + hh]], '#f4f4ee');
  poly([[cx + hh - bw, cy - hh], [cx + hh, cy - hh], [cx + hh, cy + hh], [cx + hh - bw, cy + hh]], '#f4f4ee');
  poly([[cx - hh, cy - bw / 2], [cx + hh, cy - bw / 2], [cx + hh, cy + bw / 2], [cx - hh, cy + bw / 2]], '#f4f4ee');
  // Randfeuer
  ctx.fillStyle = '#ffd24a';
  for (const [x, y] of [[x0 + 6, y0 + 6], [x1 - 6, y0 + 6], [x1 - 6, y1 - 6], [x0 + 6, y1 - 6]]) {
    const p = P(x, y);
    ctx.beginPath();
    ctx.arc(p.x, p.y - 1.5 * z, Math.max(1.5, 2.2 * z), 0, Math.PI * 2);
    ctx.fill();
  }
  // Windsack
  const w = P(x1 - 4, y1 - 4);
  ctx.strokeStyle = '#2b2f2b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(w.x, w.y);
  ctx.lineTo(w.x, w.y - 22 * z);
  ctx.stroke();
  ctx.fillStyle = '#f08a2a';
  ctx.beginPath();
  ctx.moveTo(w.x, w.y - 22 * z);
  ctx.lineTo(w.x - 14 * z, w.y - 19 * z);
  ctx.lineTo(w.x, w.y - 15 * z);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return top;
}

/** Spielgebäude (Team): Typen mit eigenem Aussehen, sonst Quader in Teamfarbe mit Kürzel und Aufbauten. */
export function drawTeamBuilding(ctx, cam, b, color) {
  const x0 = b.cx * TILE;
  const y0 = b.cy * TILE;
  const x1 = x0 + b.w * TILE;
  const y1 = y0 + b.h * TILE;
  const z = cam.zoom;
  const h = buildingHeight(b);
  const isWall = b.type === 'wall' || b.type === 'gate';
  if (!b.built) {
    // Baustelle: Gerüst-Quader wächst mit dem Fortschritt
    const g = Math.max(4, h * (b.progress || 0));
    drawBox(ctx, cam, x0, y0, x1, y1, g, color, { alpha: 0.55, noShadow: true });
    return;
  }
  if (spriteOverrides[b.type]?.(ctx, cam, b, color)) return;
  let top;
  if (b.type === 'depot') top = drawDepot(ctx, cam, b, color, x0, y0, x1, y1);
  else if (b.type === 'fob') top = drawCentral(ctx, cam, b, color, x0, y0, x1, y1);
  else if (b.type === 'helipad') top = drawHelipad(ctx, cam, b, color, x0, y0, x1, y1);
  else {
    const body = isWall ? (b.type === 'gate' ? '#7d827b' : '#8c9089') : color;
    top = drawBox(ctx, cam, x0, y0, x1, y1, h, body, { roof: isWall ? '#b3b7b0' : tint(color, 0.25) });
    const cx = (top[0].x + top[2].x) / 2;
    const cy = (top[0].y + top[2].y) / 2;
    if (!isWall) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = Math.max(8, Math.min(13 * z, b.w * TILE * z * 0.45));
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.fillText(LABEL[b.type] || b.def.name, cx, cy);
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    if (b.type === 'drill') {
      ctx.strokeStyle = '#d9d2b0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 10 * z, cy + 4 * z);
      ctx.lineTo(cx, cy - 52 * z);
      ctx.lineTo(cx + 10 * z, cy + 4 * z);
      ctx.moveTo(cx - 6 * z, cy - 16 * z);
      ctx.lineTo(cx + 6 * z, cy - 16 * z);
      ctx.moveTo(cx - 8 * z, cy - 5 * z);
      ctx.lineTo(cx + 8 * z, cy - 5 * z);
      ctx.stroke();
    } else if (b.type === 'mortar') {
      ctx.strokeStyle = '#23272a';
      ctx.lineWidth = 4 * z;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 8 * z, cy - 20 * z);
      ctx.stroke();
    } else if (b.type === 'aa') {
      ctx.strokeStyle = '#23272a';
      ctx.lineWidth = 3 * z;
      ctx.beginPath();
      ctx.moveTo(cx - 5 * z, cy);
      ctx.lineTo(cx - 9 * z, cy - 20 * z);
      ctx.moveTo(cx + 5 * z, cy);
      ctx.lineTo(cx + 1 * z, cy - 20 * z);
      ctx.stroke();
    } else if (b.type === 'extractor') {
      ctx.fillStyle = '#2b2f2b';
      ctx.beginPath();
      ctx.arc(cx, cy - 8 * z, 6 * z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (b.hp < b.maxHp) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${(1 - b.hp / b.maxHp) * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(top[i].x, top[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

const LABEL = { extractor: 'FÖR', mortar: 'MÖR', aa: 'FLA', drill: 'BOHR' };

export { hexA };

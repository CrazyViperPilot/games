// Universität (seit v5.00, PRD §15): 3 × 3-Großbau der Stadt, ein Kuppelbau mit vierfacher Symmetrie. Weil die Anlage von allen
// vier Seiten gleich aussieht, zeichnet die Iso-Ansicht für jede Drehung der Karte dasselbe Bild (Daniels Idee): die Drehung der
// Kamera wird hier bewusst nicht beachtet. Stufe 1: Kuppelbau mit vier Säulenportalen; Stufe 2: dazu vier Flügel (Kreuzform),
// höhere Kuppel mit Laterne; Stufe 3: Ecktürme mit Fahnen in Teamfarbe, Bäume im Hof. 2D: dieselbe Anlage von oben.
// Nur Zeichnen (liest b = { x, y, level, color, damage }; Rauch bei Schaden zeichnet renderer.js), keine Spielregeln. Boden (Pflaster, Rasen) zeichnet citylayer.js.
import { ISO_K } from './camera.js';
import { shade, tint } from './sprites.js';
import { snowy } from './season.js';

const WALL = '#e6d9bb'; // Sandstein
const STONE = '#f4efe3'; // Säulen, Gesims, Treppen
const FLAT = '#d8cfb8'; // Flachdach des Kuppelbaus
const ROOF = '#b4553c'; // Ziegeldach der Flügel und Portale
const SLATE = '#56636f'; // Turmdächer
const GLASS = '#34506d';
const GOLD = '#e2b444';
const DOME = ['#b5e2cf', '#64a58d', '#2c584b']; // Kupfer mit Patina: Licht, Mitte, Schatten
const LEAF = ['#8fc46a', '#4f8a3c', '#2b5a26'];
const OUTLINE = 'rgba(40,30,20,0.45)';
const DETAIL = 0.42; // darunter keine Fenster, Säulen und Rippen (Leistung, zu klein zum Sehen)

/** Maße je Stufe in Weltpixeln ab der Mitte (das Quadrat reicht bis ±96). */
const LV = [
  null,
  { core: 34, coreH: 30, drum: 10, dome: 21, arm: 0, armW: 0, armH: 0, towers: false, lantern: false, trees: 62 },
  { core: 38, coreH: 34, drum: 13, dome: 25, arm: 64, armW: 19, armH: 22, towers: false, lantern: true, trees: 62 },
  { core: 40, coreH: 36, drum: 16, dome: 28, arm: 66, armW: 20, armH: 23, towers: true, lantern: true, trees: 49 },
];
const TOWER = { at: 73, half: 10, h: 44, roof: 18 };

// Licht von links oben (wie die Stadthäuser: linke Wand hell, rechte dunkler); Helligkeit = Grundlicht + Lambert
const LIGHT = (() => {
  const v = [-0.35, 0.45, 0.82];
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
})();
function lit(color, nu, nv, nh) {
  const n = Math.hypot(nu, nv, nh) || 1;
  const d = Math.max(0, (nu * LIGHT[0] + nv * LIGHT[1] + nh * LIGHT[2]) / n);
  return shade(color, 1 - (0.56 + 0.44 * d));
}
const FACE = { top: [0, 0, 1], s: [0, 1, 0], e: [1, 0, 0] };

/** Zeichenkontext für eine Universität: Projektion lokaler Koordinaten (u, v nach rechts unten/links unten, h nach oben). */
function iso(ctx, cam, b) {
  const p = cam.worldToScreen(b.x, b.y);
  const z = cam.zoom;
  const k = ISO_K * z;
  return { ctx, z, P: (u, v, h = 0) => [p.x + (u - v) * k, p.y + (u + v) * k * 0.5 - h * z] };
}

function poly(g, pts, fill, stroke = OUTLINE) {
  const { ctx } = g;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(0.6, 0.9 * g.z);
    ctx.stroke();
  }
}

/** Quader: sichtbar sind die Wand nach +v (links), nach +u (rechts) und das Dach. */
function box(g, u0, u1, v0, v1, h0, h1, wall, top = wall, stroke = OUTLINE) {
  const { P } = g;
  poly(g, [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], lit(wall, ...FACE.s), stroke);
  poly(g, [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], lit(wall, ...FACE.e), stroke);
  poly(g, [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)], lit(top, ...FACE.top), stroke);
}

/** Fensterreihe auf der linken (+v, Ebene v) oder rechten Wand (+u, Ebene u) zwischen a0 und a1. */
function windows(g, face, plane, a0, a1, h0, h1, gap, ww, arch = false) {
  if (g.z < DETAIL) return;
  const { P, ctx } = g;
  const n = Math.max(1, Math.floor((a1 - a0) / gap));
  const step = (a1 - a0) / n;
  const pt = (a, h) => (face === 's' ? P(a, plane, h) : P(plane, a, h));
  const glass = lit(GLASS, ...FACE[face]);
  for (let i = 0; i < n; i++) {
    const a = a0 + step * (i + 0.5);
    const q = [pt(a - ww / 2, h0), pt(a + ww / 2, h0), pt(a + ww / 2, h1), pt(a - ww / 2, h1)];
    poly(g, q, glass, null);
    if (arch) {
      // Rundbogen: Halbkreis über dem Fenster
      const [mx, my] = pt(a, h1);
      const [rx] = pt(a + ww / 2, h1);
      ctx.beginPath();
      ctx.ellipse(mx, my, Math.abs(rx - mx), Math.abs(rx - mx) * 0.9, 0, Math.PI, 0);
      ctx.fillStyle = glass;
      ctx.fill();
    }
    poly(g, [pt(a - ww / 2 - 1, h0 - 1.2), pt(a + ww / 2 + 1, h0 - 1.2), pt(a + ww / 2 + 1, h0), pt(a - ww / 2 - 1, h0)], lit(STONE, ...FACE[face]), null); // Sims
  }
}

/** Satteldach entlang der Achse (u oder v) von a0 bis a1, halbe Breite w, Traufe h, Firsthöhe rh; Giebel am äußeren Ende a1. */
function gable(g, axis, a0, a1, w, h, rh, roof, wall, front) {
  const { P } = g;
  const R = snowy(roof);
  if (axis === 'u') {
    poly(g, [P(a0, -w, h), P(a1, -w, h), P(a1, 0, h + rh), P(a0, 0, h + rh)], lit(R, 0, -rh, w));
    poly(g, [P(a0, 0, h + rh), P(a1, 0, h + rh), P(a1, w, h), P(a0, w, h)], lit(R, 0, rh, w));
    if (front) poly(g, [P(a1, -w, h), P(a1, w, h), P(a1, 0, h + rh)], lit(wall, ...FACE.e));
  } else {
    poly(g, [P(-w, a0, h), P(-w, a1, h), P(0, a1, h + rh), P(0, a0, h + rh)], lit(R, -rh, 0, w));
    poly(g, [P(0, a0, h + rh), P(0, a1, h + rh), P(w, a1, h), P(w, a0, h)], lit(R, rh, 0, w));
    if (front) poly(g, [P(-w, a1, h), P(w, a1, h), P(0, a1, h + rh)], lit(wall, ...FACE.s));
  }
}

/** Rechteck in Achsen-Koordinaten (a entlang der Achse, b quer) als Quader. */
function axisBox(g, axis, s, a0, a1, b0, b1, h0, h1, wall, top) {
  const [lo, hi] = s > 0 ? [a0, a1] : [-a1, -a0];
  if (axis === 'u') box(g, lo, hi, b0, b1, h0, h1, wall, top);
  else box(g, b0, b1, lo, hi, h0, h1, wall, top);
}

/** Säulenportal mit Treppe und Dreiecksgiebel vor der Wand bei d (Achse u/v, Richtung s = ±1). */
function portico(g, axis, s, d, colTop) {
  const depth = 12;
  const half = 19;
  axisBox(g, axis, s, d, d + depth + 3, -half - 2, half + 2, 0, 3, STONE, STONE); // Treppe
  if (g.z >= DETAIL) {
    const cols = [-14, -5, 5, 14].map((b) => {
      const a = s * (d + depth - 2);
      return axis === 'u' ? [a, b] : [b, a];
    });
    cols.sort((p, q) => p[0] + p[1] - q[0] - q[1]); // hinten zuerst
    for (const [u, v] of cols) box(g, u - 1.6, u + 1.6, v - 1.6, v + 1.6, 3, colTop, STONE, STONE, 'rgba(60,50,40,0.35)');
  }
  axisBox(g, axis, s, d, d + depth, -half, half, colTop, colTop + 3, STONE, STONE); // Gebälk
  const [lo, hi] = s > 0 ? [d, d + depth] : [-d - depth, -d];
  gable(g, axis, lo, hi, half, colTop + 3, 8, ROOF, STONE, s > 0);
}

/** Senkrechter Zylinder (Tambour, Laterne) mit Mitte (0, 0), Radius r, von h0 bis h1. */
function cylinder(g, r, h0, h1, color, winN = 0) {
  const { P, ctx, z } = g;
  const [cx, y0] = P(0, 0, h0);
  const [, y1] = P(0, 0, h1);
  const R = r * z;
  const grad = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  grad.addColorStop(0, tint(color, 0.12));
  grad.addColorStop(0.45, shade(color, 0.12));
  grad.addColorStop(1, shade(color, 0.48));
  ctx.beginPath();
  ctx.moveTo(cx - R, y1);
  ctx.lineTo(cx - R, y0);
  ctx.ellipse(cx, y0, R, R / 2, 0, Math.PI, 0, true);
  ctx.lineTo(cx + R, y1);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
  if (winN && z >= DETAIL) {
    // Fenster rund um den Tambour (nur die vordere Hälfte ist zu sehen)
    ctx.fillStyle = GLASS;
    for (let i = 0; i < winN; i++) {
      const t = -0.8 + (1.6 * i) / (winN - 1);
      const x = cx + t * R;
      const dy = (R / 2) * Math.sqrt(1 - t * t);
      const w = R * 0.11 * Math.sqrt(1 - t * t);
      ctx.fillRect(x - w, y1 + dy + (y0 - y1) * 0.22, w * 2, (y0 - y1) * 0.55);
    }
  }
  ctx.beginPath();
  ctx.ellipse(cx, y1, R, R / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = tint(color, 0.18);
  ctx.fill();
  ctx.stroke();
}

/** Halbkugel (Kuppel) mit Radius r auf Höhe h0: oben Umriss der Kugel (Halbachse 1,118 r), unten die vordere Hälfte des Fußkreises. */
function dome(g, r, h0, colors = DOME) {
  const { P, ctx, z } = g;
  const [cx, cy] = P(0, 0, h0);
  const R = r * z;
  const grad = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.72, R * 0.08, cx - R * 0.1, cy - R * 0.35, R * 1.35);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.5, colors[1]);
  grad.addColorStop(1, colors[2]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R / 2, 0, 0, Math.PI);
  ctx.ellipse(cx, cy, R, R * 1.118, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
  if (z < DETAIL) return;
  // Rippen: Meridiane auf der vorderen Hälfte
  ctx.strokeStyle = 'rgba(25,55,45,0.35)';
  ctx.lineWidth = Math.max(0.5, 0.8 * z);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    if (Math.cos(a) + Math.sin(a) < -0.2) continue; // Rückseite
    ctx.beginPath();
    for (let j = 0; j <= 8; j++) {
      const f = (j / 8) * (Math.PI / 2);
      const [x, y] = P(r * Math.cos(a) * Math.cos(f), r * Math.sin(a) * Math.cos(f), h0 + r * Math.sin(f));
      if (j) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}

/** Pyramidendach (Turm) über dem Quadrat ±s um (cu, cv) ab Höhe h, Spitze rh höher; Rückseiten zuerst. */
function pyramid(g, cu, cv, s, h, rh, color) {
  const { P } = g;
  const top = P(cu, cv, h + rh);
  const C = snowy(color);
  const c = [P(cu - s, cv - s, h), P(cu + s, cv - s, h), P(cu + s, cv + s, h), P(cu - s, cv + s, h)];
  poly(g, [c[0], c[1], top], lit(C, 0, -rh, s)); // nach −v
  poly(g, [c[3], c[0], top], lit(C, -rh, 0, s)); // nach −u
  poly(g, [c[2], c[3], top], lit(C, 0, rh, s)); // nach +v
  poly(g, [c[1], c[2], top], lit(C, rh, 0, s)); // nach +u
}

function tree(g, u, v, s = 1) {
  const { P, ctx, z } = g;
  const [gx, gy] = P(u, v, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(gx - 3 * z, gy + 1.5 * z, 9 * s * z, 4.5 * s * z, 0, 0, Math.PI * 2);
  ctx.fill();
  const [, ty] = P(u, v, 9 * s);
  ctx.strokeStyle = '#5a4030';
  ctx.lineWidth = Math.max(1, 2.2 * z);
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx, ty);
  ctx.stroke();
  const [cx, cy] = P(u, v, 17 * s);
  const R = 9.5 * s * z;
  const grad = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1);
  grad.addColorStop(0, LEAF[0]);
  grad.addColorStop(0.55, LEAF[1]);
  grad.addColorStop(1, LEAF[2]);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
}

/** Turm an der Ecke (cu, cv) mit Fenstern, Fahne in Teamfarbe an beiden sichtbaren Seiten und Pyramidendach. */
function tower(g, cu, cv, color) {
  const T = TOWER;
  const s = T.half;
  box(g, cu - s, cu + s, cv - s, cv + s, 0, T.h, WALL);
  windows(g, 's', cv + s, cu - s + 3, cu + s - 3, 26, 34, 10, 3.2, true);
  windows(g, 'e', cu + s, cv - s + 3, cv + s - 3, 26, 34, 10, 3.2, true);
  if (g.z >= DETAIL) {
    // Fahnen: senkrechte Banner unter dem Dach
    const { P } = g;
    poly(g, [P(cu - 3, cv + s + 0.3, 22), P(cu + 3, cv + s + 0.3, 22), P(cu + 3, cv + s + 0.3, 8), P(cu, cv + s + 0.3, 5), P(cu - 3, cv + s + 0.3, 8)], lit(color, ...FACE.s), null);
    poly(g, [P(cu + s + 0.3, cv - 3, 22), P(cu + s + 0.3, cv + 3, 22), P(cu + s + 0.3, cv + 3, 8), P(cu + s + 0.3, cv, 5), P(cu + s + 0.3, cv - 3, 8)], lit(color, ...FACE.e), null);
  }
  box(g, cu - s - 1.5, cu + s + 1.5, cv - s - 1.5, cv + s + 1.5, T.h, T.h + 2.5, STONE);
  pyramid(g, cu, cv, s + 1.5, T.h + 2.5, T.roof, SLATE);
  const { P, ctx, z } = g;
  const [x, y] = P(cu, cv, T.h + 2.5 + T.roof);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(x, y - 1.5 * z, Math.max(1, 1.8 * z), 0, Math.PI * 2);
  ctx.fill();
}

/** Flügel entlang der Achse (Richtung s) vom Kuppelbau bis zum Portal, mit Fenstern an der sichtbaren Längsseite. */
function wing(g, axis, s, L) {
  const w = L.armW;
  axisBox(g, axis, s, L.core - 1, L.arm, -w, w, 0, L.armH, WALL);
  const [lo, hi] = s > 0 ? [L.core, L.arm] : [-L.arm, -L.core];
  if (axis === 'u') windows(g, 's', w, lo + 3, hi - 3, 7, 17, 9, 3.4, true);
  else windows(g, 'e', w, lo + 3, hi - 3, 7, 17, 9, 3.4, true);
  gable(g, axis, lo, hi, w + 1.5, L.armH, 11, ROOF, WALL, false);
}

/** Kuppelbau in der Mitte: Quader mit zwei Fensterreihen, Gesims, Flachdach, Tambour, Kuppel, Laterne und Fahne. */
function core(g, L, color) {
  const c = L.core;
  const H = L.coreH;
  box(g, -c, c, -c, c, 0, H, WALL, FLAT);
  windows(g, 's', c, -c + 4, c - 4, 6, 15, 10, 4, true);
  windows(g, 'e', c, -c + 4, c - 4, 6, 15, 10, 4, true);
  windows(g, 's', c, -c + 4, c - 4, 20, 26, 10, 3.4);
  windows(g, 'e', c, -c + 4, c - 4, 20, 26, 10, 3.4);
  box(g, -c - 2, c + 2, -c - 2, c + 2, H, H + 3, STONE, FLAT); // Gesims
  const base = H + 3;
  cylinder(g, L.dome + 3, base, base + 3, STONE); // Sockelring
  cylinder(g, L.dome, base + 3, base + 3 + L.drum, WALL, 7);
  const dh = base + 3 + L.drum;
  dome(g, L.dome, dh);
  let top = dh + L.dome * 1.0;
  if (L.lantern) {
    cylinder(g, 4.5, top - 1, top + 6, STONE);
    dome(g, 4.8, top + 6, [tint(GOLD, 0.4), GOLD, shade(GOLD, 0.45)]);
    top += 11;
  }
  // Spitze und Fahne in Teamfarbe
  const { P, ctx, z } = g;
  const [x, y0] = P(0, 0, top);
  const [, y1] = P(0, 0, top + 13);
  ctx.strokeStyle = '#d9d4c4';
  ctx.lineWidth = Math.max(1, 1.4 * z);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(x, y1, 10 * z, 6 * z);
}

/**
 * Isometrisch: ganze Anlage in einem Zug (hinten nach vorne). Gleiches Bild für jede Drehung der Karte, weil die Anlage vierfach
 * symmetrisch ist. b = { x, y, level, color } (Mitte des 3 × 3-Quadrats in Weltkoordinaten).
 */
export function drawUniversityIso(ctx, cam, b) {
  const L = LV[Math.max(1, Math.min(3, b.level | 0))];
  const g = iso(ctx, cam, b);
  ctx.save();
  ctx.lineJoin = 'round';
  // Schatten des Kuppelbaus und der Flügel (nach links unten, wie bei den anderen Gebäuden)
  {
    const { P } = g;
    const sh = (u0, u1, v0, v1, h) => {
      const o = h * 0.35;
      const pts = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)].map(([x, y]) => [x - o * g.z, y + o * 0.5 * g.z]);
      poly(g, pts, 'rgba(0,0,0,0.18)', null);
    };
    sh(-L.core, L.core, -L.core, L.core, L.coreH + L.dome);
    if (L.arm) {
      sh(-L.arm, L.arm, -L.armW, L.armW, L.armH);
      sh(-L.armW, L.armW, -L.arm, L.arm, L.armH);
    }
  }
  const T = TOWER.at;
  const t = L.trees;
  const colTop = L.arm ? 20 : 18;
  const d = L.arm || L.core; // Portale vor den Flügelenden (ab Stufe 2) oder vor dem Kuppelbau
  // 1. hinten
  if (L.towers) tower(g, -T, -T, b.color);
  tree(g, -t, -t);
  portico(g, 'u', -1, d, colTop);
  portico(g, 'v', -1, d, colTop);
  if (L.arm) {
    wing(g, 'u', -1, L);
    wing(g, 'v', -1, L);
  }
  // 2. seitlich (überdecken sich nicht mit der Mitte)
  if (L.towers) {
    tower(g, T, -T, b.color);
    tower(g, -T, T, b.color);
  }
  tree(g, t, -t);
  tree(g, -t, t);
  // 3. Mitte
  core(g, L, b.color);
  // 4. vorne
  if (L.arm) {
    wing(g, 'u', 1, L);
    wing(g, 'v', 1, L);
  }
  portico(g, 'u', 1, d, colTop);
  portico(g, 'v', 1, d, colTop);
  if (L.towers) tower(g, T, T, b.color);
  tree(g, t, t);
  ctx.restore();
}

/**
 * 2D von oben (Weltkoordinaten, Kontext skaliert): Kreuzbau mit Kuppel, Portalen, Ecktürmen und Bäumen.
 * Der Boden (Pflaster, Rasen) liegt schon darunter.
 */
export function drawUniversityTop(ctx, b) {
  const L = LV[Math.max(1, Math.min(3, b.level | 0))];
  const { x, y } = b;
  const r = (u0, v0, u1, v1, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x + u0, y + v0, u1 - u0, v1 - v0);
  };
  const shadow = 'rgba(0,0,0,0.25)';
  const o = 5;
  // Schatten
  ctx.save();
  ctx.translate(o, o);
  r(-L.core - 2, -L.core - 2, L.core + 2, L.core + 2, shadow);
  if (L.arm) {
    r(-L.arm - 14, -L.armW, L.arm + 14, L.armW, shadow);
    r(-L.armW, -L.arm - 14, L.armW, L.arm + 14, shadow);
  }
  ctx.restore();
  // Portale: Treppe, Säulen, Giebeldach
  const d = L.arm || L.core;
  for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const along = (a0, a1, b0, b1, fill) => (ax ? r(Math.min(ax * a0, ax * a1), b0, Math.max(ax * a0, ax * a1), b1, fill) : r(b0, Math.min(ay * a0, ay * a1), b1, Math.max(ay * a0, ay * a1), fill));
    along(d, d + 15, -21, 21, STONE);
    along(d, d + 12, -19, 0, tint(ROOF, 0.15));
    along(d, d + 12, 0, 19, shade(ROOF, 0.15));
  }
  // Flügel mit Satteldach (Lichtseite oben/links)
  if (L.arm) {
    for (const s of [1, -1]) {
      const a0 = s > 0 ? L.core : -L.arm;
      const a1 = s > 0 ? L.arm : -L.core;
      r(a0, -L.armW - 1.5, a1, 0, tint(ROOF, 0.12));
      r(a0, 0, a1, L.armW + 1.5, shade(ROOF, 0.18));
      r(-L.armW - 1.5, a0, 0, a1, tint(ROOF, 0.12));
      r(0, a0, L.armW + 1.5, a1, shade(ROOF, 0.18));
    }
  }
  // Kuppelbau: Gesims, Flachdach
  r(-L.core - 2, -L.core - 2, L.core + 2, L.core + 2, STONE);
  r(-L.core + 2, -L.core + 2, L.core - 2, L.core - 2, FLAT);
  // Kuppel mit Rippen und Laterne
  const R = L.dome;
  const grad = ctx.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
  grad.addColorStop(0, DOME[0]);
  grad.addColorStop(0.6, DOME[1]);
  grad.addColorStop(1, DOME[2]);
  ctx.fillStyle = STONE;
  ctx.beginPath();
  ctx.arc(x, y, R + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(25,55,45,0.4)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.moveTo(x + Math.cos(a) * R * 0.22, y + Math.sin(a) * R * 0.22);
    ctx.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
  }
  ctx.stroke();
  ctx.fillStyle = L.lantern ? GOLD : STONE;
  ctx.beginPath();
  ctx.arc(x, y, L.lantern ? 5 : 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Fahne
  ctx.fillStyle = b.color;
  ctx.fillRect(x + 1, y - 9, 9, 5);
  // Ecktürme mit Pyramidendach
  if (L.towers) {
    const T = TOWER.at;
    const s = TOWER.half + 1.5;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = x + sx * T;
      const cy = y + sy * T;
      ctx.fillStyle = shadow;
      ctx.fillRect(cx - s + o, cy - s + o, s * 2, s * 2);
      const tri = (pts, fill) => {
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      tri([[cx - s, cy - s], [cx + s, cy - s], [cx, cy]], tint(SLATE, 0.25));
      tri([[cx - s, cy - s], [cx - s, cy + s], [cx, cy]], tint(SLATE, 0.1));
      tri([[cx - s, cy + s], [cx + s, cy + s], [cx, cy]], shade(SLATE, 0.15));
      tri([[cx + s, cy - s], [cx + s, cy + s], [cx, cy]], shade(SLATE, 0.3));
      ctx.fillStyle = b.color;
      ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
    }
  }
  // Bäume im Hof
  const t = L.trees;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = x + sx * t;
    const cy = y + sy * t;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(cx + 3, cy + 3, 9, 0, Math.PI * 2);
    ctx.fill();
    const tg = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 10);
    tg.addColorStop(0, LEAF[0]);
    tg.addColorStop(0.6, LEAF[1]);
    tg.addColorStop(1, LEAF[2]);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if ((b.damage ?? 0) > 0) {
    ctx.fillStyle = `rgba(20,10,5,${(0.55 * b.damage).toFixed(2)})`; // beschädigt: dunkler
    ctx.fillRect(x - L.core - 2, y - L.core - 2, (L.core + 2) * 2, (L.core + 2) * 2);
  }
}

/** Rasen und Wege des Hofs (Weltkoordinaten relativ zur Mitte): vier Rasenflächen zwischen den Wegen zu den Portalen. */
export const UNI_LAWNS = [[-88, -88, -26, -26], [26, -88, 88, -26], [-88, 26, -26, 88], [26, 26, 88, 88]];

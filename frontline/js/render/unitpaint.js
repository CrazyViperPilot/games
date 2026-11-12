// Einheiten gemalt (seit v5.27, Daniels Wunsch „eine Gruppe nach der anderen“): Soldaten, Fahrzeuge, Hubschrauber, F-16, Su-27, F-22 und U-2
// als kleine 3D-Modelle aus Körpern (Kasten, Prismen, Zylinder, Kugeln). Ein Mini-Renderer malt sie mit dem Licht der Gebäude
// (links oben, wie `lit` in isokit.js) einmal je Variante in ein Bild (spritecache.js) und kopiert es danach nur noch.
// Iso: Wanne in 16 Richtungen, Turm getrennt in 16 Richtungen (folgt dem Ziel), Soldaten in 8 Richtungen mit Gehbewegung.
// 2D: dasselbe Modell genau von oben, Wanne und Turm frei gedreht, Schatten als Umriss. Rotoren und Nachbrenner laufen live.
// Teams: Blau graublau, Rot rotbraun, dazu Teamfarbe an Weste, Wimpel und Markierungen. Nur Darstellung, keine Spielregel.
import { sprite, blit, spriteDpr, peek } from './spritecache.js';
import { ISO_K } from './camera.js';
import { jetAlt, jetGrounded } from '../game/aircraft.js';
import { setIsoAt } from './iso.js';
import { rgbOf, mix } from './color.js';

const K = ISO_K;
const TAU = Math.PI * 2;
const ISO_SCALE = 1.35; // Iso: Modelle etwas größer als ihre Grundfläche (wie bisher), damit man sie gut erkennt
const VEH_SECT = 16; // Richtungen der Fahrzeuge, Hubschrauber und Jets in Iso
const INF_SECT = 8; // Richtungen der Soldaten in Iso

// ---------- Farben ----------

// rgbOf, hexOf, mix aus color.js (seit v5.59)

// Je Team: Lack (body), dunkel, hell, Tarnfleck, Teamfarbe (mark), Weste der Soldaten, Luftfahrzeuge
const TEAM_PAINT = [
  { body: '#566f8f', dark: '#3b4c63', light: '#7690b0', camo: '#475a5c', mark: '#3d8bfd', vest: '#3a6fc0', air: '#62778f' },
  { body: '#8f5a4a', dark: '#603a30', light: '#ad7966', camo: '#665041', mark: '#e5484d', vest: '#b8443a', air: '#8e665b' },
];
// Ausstellungsstücke auf den Höfen der Ausbildungsgebäude (seit v5.40, bigbuild.js): sandfarbene Grundierung ohne Teamfarbe,
// damit man sie nicht für echte Einheiten hält (Team-Index SHOWROOM)
const DISPLAY = { body: '#bdb08c', dark: '#8f8568', light: '#d9cfae', camo: '#a99f80', mark: '#f1ede0', vest: '#a89c7a', air: '#c2bdaf' };
export const SHOWROOM = 3;
const NEUTRAL = { body: '#6f7469', dark: '#4b4f47', light: '#8e9387', camo: '#585c50', mark: '#c9c9c0', vest: '#6f7469', air: '#7a7f78' };
const TRACK = '#2a2c2e';
const WHEEL = '#2b2d2f';
const HUB = '#4a4e51';
const METAL = '#3b3f42';
const GUN = '#2c3032';
const GLASS = '#4f6b80';
const YELLOW = '#c9a227';
const SKIN = '#c99a76';
const OLIVE = '#56603f';
const BOOT = '#2c2924';
const WHITE = '#dfe3dc';

// ---------- Körper ----------
// Modellkoordinaten in Welt-Pixeln: x nach vorn, y nach rechts, z nach oben. Ein Körper = Flächen + Mitte (für die Reihenfolge).

const solid = (faces, col, c, o = {}) => ({ faces, col, c, ...o });

function box(x0, x1, y0, y1, z0, z1, col, o) {
  return solid(
    [
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
    ],
    col,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    o,
  );
}

/** Seitenprofil [[x, z] …] (Wanne, Kabine), quer von y0 bis y1 gezogen. */
function prX(prof, y0, y1, col, o) {
  const faces = [prof.map(([x, z]) => [x, y0, z]), prof.map(([x, z]) => [x, y1, z])];
  for (let i = 0; i < prof.length; i++) {
    const [ax, az] = prof[i];
    const [bx, bz] = prof[(i + 1) % prof.length];
    faces.push([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]]);
  }
  const cx = prof.reduce((s, p) => s + p[0], 0) / prof.length;
  const cz = prof.reduce((s, p) => s + p[1], 0) / prof.length;
  return solid(faces, col, [cx, (y0 + y1) / 2, cz], o);
}

/** Querschnitt [[y, z] …] (Plane, Rumpf), längs von x0 bis x1 gezogen. */
function prY(prof, x0, x1, col, o) {
  const faces = [prof.map(([y, z]) => [x0, y, z]), prof.map(([y, z]) => [x1, y, z])];
  for (let i = 0; i < prof.length; i++) {
    const [ay, az] = prof[i];
    const [by, bz] = prof[(i + 1) % prof.length];
    faces.push([[x0, ay, az], [x1, ay, az], [x1, by, bz], [x0, by, bz]]);
  }
  const cy = prof.reduce((s, p) => s + p[0], 0) / prof.length;
  const cz = prof.reduce((s, p) => s + p[1], 0) / prof.length;
  return solid(faces, col, [(x0 + x1) / 2, cy, cz], o);
}

/** Grundriss [[x, y] …] (Turm, Flügel), von z0 bis z1 hochgezogen. */
function prZ(plan, z0, z1, col, o) {
  const faces = [plan.map(([x, y]) => [x, y, z1]), plan.map(([x, y]) => [x, y, z0])];
  for (let i = 0; i < plan.length; i++) {
    const [ax, ay] = plan[i];
    const [bx, by] = plan[(i + 1) % plan.length];
    faces.push([[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]]);
  }
  const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length;
  const cy = plan.reduce((s, p) => s + p[1], 0) / plan.length;
  return solid(faces, col, [cx, cy, (z0 + z1) / 2], o);
}

/** Körper mit schrägen Seiten (Turm, Kabine): Grundriss lo in Höhe z0, kleinerer Grundriss hi in z1, gleich viele Ecken. */
function loft(lo, hi, z0, z1, col, o) {
  const A = lo.map(([x, y]) => [x, y, z0]);
  const B = hi.map(([x, y]) => [x, y, z1]);
  const faces = [B, A.slice().reverse()];
  for (let i = 0; i < A.length; i++) faces.push([A[i], A[(i + 1) % A.length], B[(i + 1) % A.length], B[i]]);
  const all = [...A, ...B];
  const c = [0, 1, 2].map((k) => all.reduce((s, p) => s + p[k], 0) / all.length);
  return solid(faces, col, c, o);
}

const sub3 =(a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Zylinder oder Kegelstumpf von p0 nach p1 (Radien r0 → r1, n Kanten; n = 4 gibt einen Vierkant, z. B. für Arme und Ausleger). */
function cyl(p0, p1, r0, r1, n, col, o) {
  const ax = norm3(sub3(p1, p0));
  const t = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm3(cross3(ax, t));
  const w = cross3(ax, u);
  const ring = (p, r) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((i + 0.5) / n) * TAU;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      return [p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s];
    });
  const A = ring(p0, r0);
  const B = ring(p1, r1);
  const faces = [A.slice().reverse(), B];
  for (let i = 0; i < n; i++) faces.push([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]]);
  return solid(faces, col, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], { smooth: n >= 6, ...o });
}

/** Ellipsoid um c mit Halbachsen rx, ry, rz; zHalf: nur die obere Hälfte (Helm, Kuppel). */
function ball(c, rx, ry, rz, col, o = {}) {
  const n = o.n ?? 10;
  const m = o.m ?? 6;
  const top = o.half ? Math.PI / 2 : Math.PI;
  const P = (i, j) => {
    const th = (i / m) * top;
    const ph = (j / n) * TAU;
    return [c[0] + Math.sin(th) * Math.cos(ph) * rx, c[1] + Math.sin(th) * Math.sin(ph) * ry, c[2] + Math.cos(th) * rz];
  };
  const faces = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) faces.push(i === 0 ? [P(0, 0), P(1, j + 1), P(1, j)] : [P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)]);
  if (o.half) faces.push(Array.from({ length: n }, (_, j) => P(m, n - j)));
  return solid(faces, col, o.half ? [c[0], c[1], c[2] + rz * 0.4] : c, { smooth: true, ...o });
}

/** Aufgesetztes Teil (Luke, Gitter, Tarnfleck, Scheibe): wird immer direkt nach seinem Träger gemalt. */
const on = (parent, s) => ((s.on = parent), s);
const fine = (s) => ((s.fine = true), s);

// ---------- Renderer ----------

const LIGHT = norm3([-0.35, 0.45, 0.82]); // wie die Gebäude (university.js)
const VIEW_ISO = [1, 1, K]; // Blickrichtung zum Betrachter (isokit: Fläche sichtbar, wenn n · VIEW > 0)
const CHAR = '#2a2623';

/**
 * Malt Körper um yaw gedreht. view: { iso, s (Gerätepixel je Einheit), charred, shadow (nur Umriss schwarz) }.
 * Reihenfolge: Körper nach der Tiefe ihrer Mitte, aufgesetzte Teile direkt nach ihrem Träger; Rückseiten fallen weg.
 */
function paintSolids(ctx, solids, yaw, view) {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const rot = (p) => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs, p[2]];
  const { iso, s } = view;
  const proj = iso ? (p) => [(p[0] - p[1]) * K * s, ((p[0] + p[1]) * K * 0.5 - p[2]) * s] : (p) => [p[0] * s, p[1] * s];
  const depth = iso ? (p) => p[0] * VIEW_ISO[0] + p[1] * VIEW_ISO[1] + p[2] * VIEW_ISO[2] : (p) => p[2];
  const mode = iso ? 'iso' : 'top';
  const incl = (so) => !(so.fine && s < 1.6) && !(so.only && so.only !== mode) && (!so.on || incl(so.on));
  const list = [];
  for (const so of solids) so._k = undefined;
  for (const so of solids) {
    if (!incl(so)) continue;
    so._c = rot(so.c);
    so._k = depth(so._c);
  }
  for (const so of solids) {
    if (so._k === undefined) continue;
    let root = so;
    let lift = 0;
    while (root.on && root.on._k !== undefined) {
      root = root.on;
      lift += 1;
    }
    // Kette und untere Wanne (under) zuerst, aufgesetzte Teile nach ihrem Träger, untereinander nach eigener Tiefe
    list.push({ so, k: root._k + (root.under ? -1e4 : 0), lift, own: so._k, i: list.length });
  }
  list.sort((a, b) => a.k - b.k || a.lift - b.lift || a.own - b.own || a.i - b.i);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.min(0.9, 0.28 * s);
  for (const { so } of list) {
    let col = so.col;
    if (view.charred) col = mix(col, CHAR, 0.78);
    const rgb = rgbOf(col);
    const top = so.top && !view.charred ? (so._top ??= rgbOf(so.top.col)) : null; // Oberseiten (Schnee, Moos, seit v5.28)
    const c = so._c;
    for (let fi = 0; fi < so.faces.length; fi++) {
      const pts = so.faces[fi].map(rot);
      // Normale nach Newell, nach außen (weg von der Körpermitte)
      let nx = 0;
      let ny = 0;
      let nz = 0;
      let fx = 0;
      let fy = 0;
      let fz = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        nx += (a[1] - b[1]) * (a[2] + b[2]);
        ny += (a[2] - b[2]) * (a[0] + b[0]);
        nz += (a[0] - b[0]) * (a[1] + b[1]);
        fx += a[0];
        fy += a[1];
        fz += a[2];
      }
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) continue;
      nx /= l;
      ny /= l;
      nz /= l;
      fx /= pts.length;
      fy /= pts.length;
      fz /= pts.length;
      if (nx * (fx - c[0]) + ny * (fy - c[1]) + nz * (fz - c[2]) < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const vis = iso ? nx * VIEW_ISO[0] + ny * VIEW_ISO[1] + nz * VIEW_ISO[2] : nz;
      if (vis <= 1e-6) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = proj(pts[i]);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      if (view.shadow) {
        ctx.fillStyle = '#000';
        ctx.fill();
        continue;
      }
      const d = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const ao = fz < 7 ? 0.8 + (0.2 * Math.max(0, fz)) / 7 : 1; // bodennahe Flächen etwas dunkler (Umgebungsverdeckung)
      let k = (0.56 + 0.44 * d) * ao;
      if (so.vary) k *= 1 + so.vary * (((Math.imul(fi + 1, 2654435761) >>> 0) % 1000) / 1000 - 0.5); // Flächen leicht verschieden (Fels)
      let fc = rgb;
      if (top && nz > so.top.at) {
        const t = Math.min(1, (nz - so.top.at) / 0.18);
        fc = [rgb[0] + (top[0] - rgb[0]) * t, rgb[1] + (top[1] - rgb[1]) * t, rgb[2] + (top[2] - rgb[2]) * t];
      }
      ctx.fillStyle = `rgb(${Math.min(255, fc[0] * k) | 0},${Math.min(255, fc[1] * k) | 0},${Math.min(255, fc[2] * k) | 0})`;
      ctx.fill();
      if (!so.noLine) {
        const e = so.smooth ? k : k * 0.68; // runde Körper ohne dunkle Kanten (sonst Netzmuster), nur Nähte geschlossen
        ctx.strokeStyle = `rgb(${(fc[0] * e) | 0},${(fc[1] * e) | 0},${(fc[2] * e) | 0})`;
        ctx.stroke();
      }
    }
  }
}

/**
 * Bildgrenzen [x0, y0, x1, y1] eines Körpersatzes, um yaw gedreht, in Iso oder von oben, mit 1 Einheit Rand. Eng um das Modell
 * (ein langes Rohr macht das Bild nur in seiner Richtung groß); je Halter (Modell, Turm, Wrack) und Richtung gemerkt.
 */
function boundsOf(holder, solids, yaw, iso) {
  const memo = (holder.bnd ??= new Map());
  const key = (iso ? 'i' : 't') + Math.round(yaw * 1000);
  let b = memo.get(key);
  if (b) return b;
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const so of solids) {
    for (const f of so.faces) {
      for (const p of f) {
        const rx = p[0] * cs - p[1] * sn;
        const ry = p[0] * sn + p[1] * cs;
        const X = iso ? (rx - ry) * K : rx;
        const Y = iso ? (rx + ry) * K * 0.5 - p[2] : ry;
        b[0] = Math.min(b[0], X - 1);
        b[1] = Math.min(b[1], Y - 1);
        b[2] = Math.max(b[2], X + 1);
        b[3] = Math.max(b[3], Y + 1);
      }
    }
  }
  memo.set(key, b);
  return b;
}

// ---------- Bauteile ----------

/**
 * Kettenlaufwerk einer Seite (side −1 links, +1 rechts): Kette mit runden Enden und Laufrollen. Kette und untere Wanne liegen
 * unter der oberen Wanne und werden zuerst gemalt (under), damit die Wanne sie richtig verdeckt. o.skirt = [x0, x1]: Kettenschürze
 * in Feldern von o.fender (Wannenkante) bis außen, mit Tarnflecken.
 */
function tracks(S, side, x0, x1, yIn, yOut, h, P, o = {}) {
  const ya = side < 0 ? -yOut : yIn;
  const yb = side < 0 ? -yIn : yOut;
  const r = h / 2;
  const prof = [[x0 + r, 0], [x1 - r, 0], [x1, r], [x1 - r * 0.6, h], [x0 + r * 0.6, h], [x0, r]];
  const tr = prX(prof, ya, yb, TRACK, { under: true });
  S.push(tr);
  const yo = side < 0 ? -yOut : yOut;
  const n = o.wheels ?? 5;
  for (let i = 0; i < n; i++) {
    const x = x0 + r + ((x1 - x0 - 2 * r) * i) / (n - 1);
    S.push(fine(on(tr, cyl([x, yo, r * 0.92], [x, yo + side * 0.25, r * 0.92], r * 0.72, r * 0.72, 8, HUB, { only: 'iso' }))));
  }
  if (!o.skirt) return tr;
  const [s0, s1] = o.skirt;
  const f = o.fender ?? yOut - 0.6;
  const ya2 = side < 0 ? -yOut - 0.45 : f;
  const yb2 = side < 0 ? -f : yOut + 0.45;
  const z0 = h * 0.42;
  const z1 = h + 0.4;
  const sk = box(s0, s1, ya2, yb2, z0, z1, mix(P.body, P.dark, 0.45), { only: 'iso' });
  S.push(sk);
  const yl = side < 0 ? ya2 - 0.08 : yb2;
  const seg = Math.max(2, Math.round((s1 - s0) / 4.6));
  const line = mix(P.dark, '#000000', 0.3);
  for (let i = 1; i < seg; i++) {
    const x = s0 + ((s1 - s0) * i) / seg;
    S.push(fine(on(sk, box(x - 0.13, x + 0.13, yl, yl + 0.08, z0, z1, line, { noLine: true, only: 'iso' }))));
  }
  const L = s1 - s0;
  const spots = side < 0 ? [[0.12, 0.2, 0.5], [0.58, 0.16, 0.62]] : [[0.3, 0.22, 0.58], [0.72, 0.14, 0.48]];
  for (const [a, w, t] of spots) {
    const zz = z0 + (z1 - z0) * t;
    S.push(fine(on(sk, box(s0 + L * a, s0 + L * (a + w), yl, yl + 0.08, zz - 1, Math.min(z1, zz + 1.1), P.camo, { noLine: true, only: 'iso' }))));
  }
  return tr;
}

/** Untere Wanne zwischen den Ketten (Bug- und Heckplatte schräg), wird mit den Ketten zuerst gemalt. */
const lowerHull = (x0, x1, half, top, P) => prX([[x0 + 0.8, 2], [x0, top], [x1, top], [x1 - 1.6, 2]], -half, half, P.dark, { under: true });

/** Rad mit Achse quer (y), Mitte (x, y, z). */
const wheel = (x, y, z, r, w, side) => cyl([x, y, z], [x, y + side * w, z], r, r, 10, WHEEL);

/** Tarnflecken (aufgesetzt) auf eine waagrechte Fläche in Höhe z. */
function camo(S, parent, spots, z, col) {
  for (const [x, y, w, h] of spots) S.push(fine(on(parent, box(x, x + w, y, y + h, z, z + 0.15, col, { noLine: true }))));
}

/** Tarnflecken an beiden Seitenwänden (y = ±half, nur Iso); spots = [x, Länge, z0, z1], links gespiegelt (anderes Muster). */
function camoSides(S, parent, half, spots, col) {
  for (const [x, w, z0, z1] of spots) {
    S.push(fine(on(parent, box(x, x + w, half, half + 0.12, z0, z1, col, { noLine: true, only: 'iso' }))));
    S.push(fine(on(parent, box(-x - w, -x, -half - 0.12, -half, z0, z1, col, { noLine: true, only: 'iso' }))));
  }
}

/** Scheinwerfer vorn (Paar) und Rücklichter hinten. */
function lights(S, parent, xf, half, zf, xr, zr) {
  for (const side of [-1, 1]) {
    S.push(on(parent, box(xf - 1.3, xf, side * half - 0.7, side * half + 0.7, zf, zf + 0.8, '#ddd5a4', { only: 'iso' })));
    S.push(fine(on(parent, box(xr - 0.25, xr, side * half - 0.5, side * half + 0.5, zr, zr + 0.55, '#a3302b', { noLine: true, only: 'iso' }))));
  }
}

/** Funkantenne mit Wimpel in Teamfarbe. */
function antenna(T, parent, x, y, z0, z1, P) {
  T.push(on(parent, cyl([x, y, z0], [x, y, z1], 0.2, 0.16, 4, '#1b1d1f')));
  T.push(on(parent, box(x, x + 2.7, y - 0.1, y + 0.1, z1 - 2, z1, P.mark, { noLine: true })));
}

// ---------- Modelle: Fahrzeuge ----------
// Ketten unten, darauf die obere Wanne mit schrägem Bug, Türme mit schrägen Seiten (loft) und hellerer Dachplatte.

function tank(P) {
  const S = [];
  for (const side of [-1, 1]) tracks(S, side, -17, 17, 6.2, 10, 4.8, P, { wheels: 7, skirt: [-13, 16.4], fender: 9.2 });
  S.push(lowerHull(-17, 17.8, 6.2, 4.6, P));
  const hull = prX([[-17.2, 4.6], [-17.4, 7.2], [7.5, 7.2], [17.8, 4.6]], -9.2, 9.2, P.body);
  S.push(hull);
  const deck = fine(on(hull, box(-16.9, -9, -6.6, 6.6, 7.2, 7.4, P.dark))); // Motordeck
  S.push(deck);
  for (const x of [-16, -13.8, -11.6]) S.push(fine(on(deck, box(x, x + 1.3, -5.8, 5.8, 7.4, 7.5, METAL, { noLine: true })))); // Lüftergitter
  S.push(fine(on(hull, box(7.6, 9.6, 1.4, 4.2, 7.2, 7.45, METAL)))); // Fahrerluke
  lights(S, hull, 17, 8, 4.9, -17.4, 6.2);
  camoSides(S, hull, 9.2, [[-15, 5, 5.6, 6.9], [-4, 4, 5.4, 7], [3, 3.5, 5.6, 6.8]], P.camo);
  const T = [];
  const tur = loft(
    [[-11.5, -6.6], [2.5, -7.6], [11, -2.4], [11, 2.4], [2.5, 7.6], [-11.5, 6.6]],
    [[-10.8, -5.8], [2, -6.8], [9.6, -2], [9.6, 2], [2, 6.8], [-10.8, 5.8]],
    7.2, 10.4, P.body,
  );
  T.push(tur);
  const roof = on(tur, prZ([[-10, -5], [1.6, -5.9], [8.2, -1.6], [8.2, 1.6], [1.6, 5.9], [-10, 5]], 10.4, 10.6, P.light));
  T.push(roof);
  const bustle = box(-15, -11, -5.8, 5.8, 7.8, 10, P.dark); // Staukorb
  T.push(bustle);
  T.push(fine(on(bustle, box(-14.7, -11.3, -5.4, 5.4, 10, 10.5, OLIVE, { noLine: true }))));
  T.push(box(9.4, 12, -1.9, 1.9, 7.6, 10.2, P.dark)); // Blende
  T.push(cyl([12, 0, 8.9], [33, 0, 8.9], 0.85, 0.72, 8, GUN)); // Rohr 120 mm
  T.push(cyl([12, 0, 8.9], [17, 0, 8.9], 1.05, 1, 8, GUN));
  T.push(cyl([19.5, 0, 8.9], [23, 0, 8.9], 1.3, 1.3, 8, GUN)); // Rauchabsauger
  T.push(fine(on(roof, cyl([-6.8, 3.4, 10.6], [-6.8, 3.4, 11], 1.7, 1.7, 10, P.dark)))); // Luken
  T.push(fine(on(roof, cyl([-6.8, -3.4, 10.6], [-6.8, -3.4, 11], 1.5, 1.5, 10, P.dark))));
  T.push(on(roof, cyl([-3.2, 3.9, 10.6], [-3.2, 3.9, 12.1], 0.95, 0.95, 8, METAL))); // Rundblickoptik
  const peri = on(roof, box(-4.2, -2, 2.9, 4.9, 12.1, 13.3, METAL));
  T.push(peri);
  T.push(fine(on(peri, box(-2, -1.85, 3.2, 4.6, 12.35, 13.05, GLASS, { noLine: true }))));
  const sight = on(roof, box(3.2, 6.2, -5.4, -3.4, 10.6, 11.8, METAL)); // Zieloptik
  T.push(sight);
  T.push(fine(on(sight, box(6.2, 6.35, -5.1, -3.7, 10.9, 11.5, GLASS, { noLine: true }))));
  T.push(on(roof, cyl([-6.4, -3.4, 11.5], [0.5, -3.7, 11.7], 0.28, 0.25, 4, GUN))); // MG
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) T.push(fine(cyl([-4.5 + i * 1.25, side * 6.1, 9.5], [-4.2 + i * 1.25, side * 7.3, 10.2], 0.4, 0.4, 6, P.dark))); // Nebelwurfbecher
  antenna(T, roof, -9.6, -4.4, 10.6, 20, P);
  camo(T, roof, [[-8, -3.6, 4.5, 2.6], [-1, 1.2, 4, 2.4]], 10.6, P.camo);
  return { S, turret: { x: -2, S: T }, foot: [-17.8, 17.8, -10.5, 10.5] };
}

function ifv(P) {
  const S = [];
  for (const side of [-1, 1]) tracks(S, side, -15, 15, 5.6, 9.2, 4.4, P, { wheels: 6, skirt: [-13.4, 13.6], fender: 8.6 });
  S.push(lowerHull(-15, 15.8, 5.6, 4.2, P));
  const hull = prX([[-15, 4.2], [-15.2, 8.6], [4.5, 8.6], [15.8, 5], [15.6, 4.2]], -8.6, 8.6, P.body);
  S.push(hull);
  S.push(fine(on(hull, box(-15.45, -15.25, -5.6, 5.6, 5, 8.1, P.dark, { only: 'iso' })))); // Heckklappe
  S.push(fine(on(hull, box(1.4, 4.2, -6.6, -3.4, 8.6, 8.85, METAL)))); // Fahrerluke
  S.push(fine(on(hull, box(-14, -6, -7.4, -6.2, 8.6, 9.1, P.dark)))); // Staukasten
  S.push(fine(on(hull, box(-14, -6, 6.2, 7.4, 8.6, 9.1, P.dark))));
  lights(S, hull, 15.4, 7, 5.3, -15.2, 7.2);
  camoSides(S, hull, 8.6, [[-13, 5, 5.6, 7.6], [-2, 4.5, 5.8, 8.2]], P.camo);
  const T = [];
  const tur = loft(
    [[-6.5, -5.2], [3.5, -5.2], [7, -2.8], [7, 2.8], [3.5, 5.2], [-6.5, 5.2]],
    [[-5.8, -4.4], [3, -4.4], [6, -2.2], [6, 2.2], [3, 4.4], [-5.8, 4.4]],
    8.6, 10.8, P.body,
  );
  T.push(tur);
  const roof = on(tur, prZ([[-5.2, -3.8], [2.6, -3.8], [5.2, -1.8], [5.2, 1.8], [2.6, 3.8], [-5.2, 3.8]], 10.8, 11, P.light));
  T.push(roof);
  T.push(cyl([6, 0.8, 9.8], [9.5, 0.8, 9.8], 0.95, 0.95, 8, GUN)); // Waffenblende
  T.push(cyl([9.5, 0.8, 9.8], [21.5, 0.8, 9.8], 0.6, 0.52, 6, GUN)); // 30-mm-Kanone
  T.push(box(-4, 2.5, 5.2, 7.2, 9.3, 11.3, OLIVE)); // Lenkflugkörper
  T.push(fine(box(2.5, 2.65, 5.6, 6.8, 9.7, 10.9, '#3a3d33', { noLine: true })));
  const peri = on(roof, box(-3, 0.4, -4, -1.6, 11, 12.8, METAL)); // Kommandantenoptik
  T.push(peri);
  T.push(fine(on(peri, box(0.4, 0.55, -3.7, -1.9, 11.4, 12.4, GLASS, { noLine: true }))));
  antenna(T, roof, -5, 3.6, 11, 18.5, P);
  camo(T, roof, [[-4.4, -3, 3.5, 2.4], [0.6, 0.8, 2.6, 2]], 11, P.camo);
  return { S, turret: { x: -1, S: T }, foot: [-15.8, 15.8, -9.7, 9.7] };
}

/** Leichtes Kettenfahrzeug (Flak, SAM): Wanne 25 × 16. */
function lightHull(P, S) {
  for (const side of [-1, 1]) tracks(S, side, -12, 12, 4.8, 8, 4, P, { wheels: 4 });
  S.push(lowerHull(-12, 12.8, 4.8, 3.8, P));
  const hull = prX([[-12, 3.8], [-12.2, 6.8], [4, 6.8], [12.8, 4.2], [12.6, 3.8]], -7.6, 7.6, P.body);
  S.push(hull);
  S.push(fine(on(hull, box(-11.8, -7, -5.4, 5.4, 6.8, 7, P.dark)))); // Motordeck
  S.push(fine(on(hull, box(0.8, 3.4, -6.4, -3.8, 6.8, 7, METAL)))); // Fahrerluke
  lights(S, hull, 12.4, 5.8, 4.4, -12.2, 5.6);
  camoSides(S, hull, 7.6, [[-10, 4.5, 4.3, 6.3], [1, 3.5, 4.5, 6.5]], P.camo);
  return hull;
}

function flak(P) {
  const S = [];
  lightHull(P, S);
  const T = [];
  const tur = cyl([0, 0, 6.8], [0, 0, 10.2], 5, 4.6, 12, P.body);
  T.push(tur);
  const top = on(tur, cyl([0, 0, 10.2], [0, 0, 10.45], 4.3, 4.3, 12, P.light));
  T.push(top);
  T.push(on(top, box(-2.2, 1, -1.5, 1.5, 10.45, 11.4, METAL)));
  T.push(on(top, cyl([-3.2, 0, 10.45], [-3.2, 0, 12.2], 0.35, 0.35, 4, METAL))); // Radar
  T.push(on(top, box(-3.8, -2.6, -2.4, 2.4, 12.1, 13.6, '#b9bdb2')));
  for (const side of [-1, 1]) {
    T.push(box(-1, 4, side * 2.6 - 1, side * 2.6 + 1, 8.2, 10.6, P.dark)); // Waffenwiege
    T.push(cyl([3, side * 2.6, 9.4], [16, side * 2.6, 9.4], 0.5, 0.45, 6, GUN));
    T.push(cyl([14.6, side * 2.6, 9.4], [16.2, side * 2.6, 9.4], 0.75, 0.75, 6, GUN));
  }
  T.push(fine(box(-4.6, -2, -5.3, -3.1, 7.6, 9.8, OLIVE))); // Munition
  return { S, turret: { x: -1.5, S: T }, foot: [-12.8, 12.8, -8, 8] };
}

function sam(P) {
  const S = [];
  lightHull(P, S);
  const T = [];
  T.push(cyl([0, 0, 6.8], [0, 0, 8.6], 4, 4, 12, P.dark));
  T.push(box(-1.5, 1.5, -1.2, 1.2, 8.6, 10.6, METAL));
  for (const side of [-1, 1]) {
    // Startbehälter, leicht angestellt
    const pod = prX([[-5, 9.4], [-5, 12.6], [8, 13.6], [8, 10.4]], side < 0 ? -5.4 : 1.6, side < 0 ? -1.6 : 5.4, WHITE);
    T.push(pod);
    for (const y of [side * 2.5, side * 4.5]) for (const z of [11.2, 12.8]) T.push(fine(on(pod, cyl([8, y, z], [8.3, y, z], 0.7, 0.7, 6, '#9a2f2a', { noLine: true })))); // Rohrdeckel
    T.push(fine(on(pod, box(-1, 1, side < 0 ? -5.5 : 5.4, side < 0 ? -5.4 : 5.5, 10.4, 12.6, P.mark, { noLine: true, only: 'iso' }))));
  }
  const eye = box(-3, 0.5, -1, 1, 10.6, 12.6, P.body); // Zielgerät
  T.push(eye);
  T.push(fine(on(eye, box(0.5, 0.7, -0.7, 0.7, 11.2, 12.2, GLASS, { noLine: true }))));
  return { S, turret: { x: -1.5, S: T }, foot: [-12.8, 12.8, -8, 8] };
}

function gepard(P) {
  const S = [];
  for (const side of [-1, 1]) tracks(S, side, -15.5, 15.5, 6, 9.5, 4.8, P, { wheels: 7, skirt: [-12, 14.2], fender: 8.8 });
  S.push(lowerHull(-15.5, 16.4, 6, 4.6, P));
  const hull = prX([[-15.6, 4.6], [-15.8, 7.2], [6.5, 7.2], [16.4, 4.6]], -8.8, 8.8, P.body);
  S.push(hull);
  const deck = fine(on(hull, box(-15.4, -8.5, -6.4, 6.4, 7.2, 7.4, P.dark)));
  S.push(deck);
  for (const x of [-14.6, -12.4]) S.push(fine(on(deck, box(x, x + 1.3, -5.6, 5.6, 7.4, 7.5, METAL, { noLine: true }))));
  S.push(fine(on(hull, box(6.6, 8.6, 1.4, 4.2, 7.2, 7.45, METAL))));
  lights(S, hull, 15.8, 7.4, 4.9, -15.8, 6.2);
  camoSides(S, hull, 8.8, [[-14, 5, 5.6, 6.9], [-2, 4, 5.5, 7]], P.camo);
  const T = [];
  const tur = loft(
    [[-8.5, -6.2], [5.5, -6.2], [8.4, -3.6], [8.4, 3.6], [5.5, 6.2], [-8.5, 6.2]],
    [[-8, -5.6], [5, -5.6], [7.6, -3.2], [7.6, 3.2], [5, 5.6], [-8, 5.6]],
    7.2, 12, P.body,
  );
  T.push(tur);
  const roof = on(tur, prZ([[-7.4, -5], [4.6, -5], [6.8, -2.8], [6.8, 2.8], [4.6, 5], [-7.4, 5]], 12, 12.25, P.light));
  T.push(roof);
  for (const side of [-1, 1]) {
    T.push(box(-3, 5.5, side < 0 ? -8.4 : 6, side < 0 ? -6 : 8.4, 8.4, 11.6, P.dark)); // Waffenkasten
    T.push(cyl([5.5, side * 7.2, 10.1], [24, side * 7.2, 10.1], 0.58, 0.5, 6, GUN));
    T.push(cyl([22.5, side * 7.2, 10.1], [24.5, side * 7.2, 10.1], 0.95, 0.95, 6, GUN));
  }
  T.push(cyl([8.2, 0, 10], [9.8, 0, 10], 2, 2, 12, METAL)); // Folgeradar
  T.push(on(roof, cyl([-5.5, 0, 12.25], [-5.5, 0, 14.2], 0.5, 0.5, 6, METAL))); // Mast
  const radar = on(roof, box(-6.4, -4.8, -5.4, 5.4, 14, 16.4, '#b9bdb2')); // Suchradar
  T.push(radar);
  T.push(fine(on(radar, box(-4.8, -4.6, -4.8, 4.8, 14.4, 16, '#8e9389', { noLine: true }))));
  T.push(fine(on(roof, cyl([0, 3, 12.25], [0, 3, 12.6], 1.4, 1.4, 10, P.dark))));
  camo(T, roof, [[-3, -4.4, 4, 2.4], [1, 1.8, 3, 2.6]], 12.25, P.camo);
  return { S, turret: { x: -1, S: T }, foot: [-16.4, 16.4, -10, 10] };
}

function pzh(P) {
  const S = [];
  for (const side of [-1, 1]) tracks(S, side, -17, 17, 6.4, 10, 4.8, P, { wheels: 7, skirt: [-14, 16], fender: 9.4 });
  S.push(lowerHull(-17, 17.8, 6.4, 4.6, P));
  const hull = prX([[-17.2, 4.6], [-17.4, 7.4], [11, 7.4], [17.8, 4.6]], -9.4, 9.4, P.body);
  S.push(hull);
  S.push(fine(on(hull, box(8, 10.6, 2, 6.4, 7.4, 7.65, METAL)))); // Fahrerluke
  S.push(fine(on(hull, box(-17.2, -13.2, -6.6, 6.6, 7.4, 7.6, P.dark))));
  lights(S, hull, 17, 8.2, 5, -17.4, 6.4);
  camoSides(S, hull, 9.4, [[-15, 5, 5.6, 7.1], [4, 4, 5.6, 7]], P.camo);
  const T = [];
  const tur = loft(
    [[-11.5, -7.8], [6, -7.8], [9.4, -5], [9.4, 5], [6, 7.8], [-11.5, 7.8]],
    [[-11, -7.1], [5.6, -7.1], [8.6, -4.4], [8.6, 4.4], [5.6, 7.1], [-11, 7.1]],
    7.4, 13.2, P.body,
  );
  T.push(tur);
  const roof = on(tur, prZ([[-10.2, -6.3], [5.1, -6.3], [7.8, -3.9], [7.8, 3.9], [5.1, 6.3], [-10.2, 6.3]], 13.2, 13.45, P.light));
  T.push(roof);
  T.push(box(8.8, 11.8, -2.2, 2.2, 8.6, 12, P.dark)); // Wiege
  T.push(cyl([11.5, 0, 10.3], [40, 0, 10.3], 1, 0.88, 8, GUN)); // Rohr 155 mm
  T.push(cyl([37.6, 0, 10.3], [41, 0, 10.3], 1.55, 1.55, 8, GUN)); // Mündungsbremse
  T.push(cyl([16, 0, 10.3], [18.6, 0, 10.3], 1.3, 1.3, 8, GUN)); // Rauchabsauger
  T.push(fine(on(roof, cyl([-6, 4, 13.45], [-6, 4, 13.9], 1.7, 1.7, 10, P.dark)))); // Luken
  T.push(fine(on(roof, cyl([-6, -4, 13.45], [-6, -4, 13.9], 1.7, 1.7, 10, P.dark))));
  T.push(on(roof, cyl([-3, -4, 14.2], [3, -4.2, 14.5], 0.3, 0.3, 4, GUN))); // MG
  T.push(fine(box(-11.6, -11.4, -4, 4, 8.4, 12, P.dark, { only: 'iso' }))); // Munitionsklappe
  antenna(T, roof, -9.5, 6, 13.45, 22, P);
  camo(T, roof, [[-8, -5, 6, 3], [-1, 2, 5, 3]], 13.45, P.camo);
  return { S, turret: { x: -5, S: T }, foot: [-17.8, 17.8, -10.5, 10.5] };
}

function truck(P) {
  const S = [];
  S.push(box(-15, 12, -3.6, 3.6, 2.2, 3.8, METAL, { only: 'iso', under: true })); // Rahmen
  for (const x of [9.5, -5.5, -11]) for (const side of [-1, 1]) S.push(wheel(x, side * 4.4, 2.7, 2.7, 1.8, side));
  const cab = prX([[8, 3.6], [8, 11], [12.5, 11], [15, 8.8], [15.4, 3.6]], -6, 6, P.body);
  S.push(cab);
  S.push(on(cab, box(8.4, 12.3, -5.6, 5.6, 11, 11.3, P.light))); // Dach
  S.push(on(cab, prX([[12.7, 10.6], [14.85, 8.75], [14.9, 7.4], [12.9, 7.4]], -5.2, 5.2, GLASS, { noLine: true })));
  for (const side of [-1, 1]) S.push(on(cab, box(9, 12, side < 0 ? -6.15 : 6, side < 0 ? -6 : 6.15, 7.6, 10.2, GLASS, { noLine: true, only: 'iso' })));
  S.push(box(15.2, 16.2, -6, 6, 3, 4.6, METAL)); // Stoßfänger
  for (const side of [-1, 1]) S.push(fine(box(15.3, 15.6, side * 4.2 - 0.9, side * 4.2 + 0.9, 5, 6, '#e8e2b8', { only: 'iso' })));
  const bed = box(-15.2, 7.4, -6, 6, 3.8, 6.4, P.dark);
  S.push(bed);
  const tarp = prY([[-6, 6.4], [6, 6.4], [6, 11.2], [4.6, 12.8], [-4.6, 12.8], [-6, 11.2]], -14.8, 7, mix(P.body, OLIVE, 0.45));
  S.push(tarp);
  for (const x of [-10, -4.5, 1.5]) S.push(fine(on(tarp, box(x, x + 0.5, -4.5, 4.5, 12.8, 13, mix(P.dark, OLIVE, 0.4), { noLine: true }))));
  S.push(fine(on(tarp, box(-12, 4, -1, 1, 12.8, 13.05, P.mark, { noLine: true })))); // Kennstreifen
  return { S, foot: [-15.5, 16, -6.2, 6.2] };
}

function fobTruck(P) {
  const S = [];
  S.push(box(-20, 15, -3.4, 3.4, 2.2, 3.8, METAL, { only: 'iso', under: true }));
  for (const x of [16, 10.5, -11, -16]) for (const side of [-1, 1]) S.push(wheel(x, side * 4.6, 2.8, 2.8, 1.8, side));
  const cab = prX([[13, 3.6], [13, 11.2], [17.5, 11.2], [20, 9], [20.4, 3.6]], -6.4, 6.4, P.body);
  S.push(cab);
  S.push(on(cab, box(13.4, 17.3, -6, 6, 11.2, 11.5, P.light)));
  S.push(on(cab, prX([[17.7, 10.8], [19.85, 8.95], [19.9, 7.6], [17.9, 7.6]], -5.6, 5.6, GLASS, { noLine: true })));
  for (const side of [-1, 1]) S.push(on(cab, box(14, 17, side < 0 ? -6.55 : 6.4, side < 0 ? -6.4 : 6.55, 7.8, 10.4, GLASS, { noLine: true, only: 'iso' })));
  S.push(box(20.2, 21.2, -6.4, 6.4, 3, 4.6, METAL));
  const box1 = box(-20.5, 11.5, -6.8, 6.8, 4, 13.4, mix(P.body, OLIVE, 0.35));
  S.push(box1);
  for (const x of [-17, -8, 1, 9]) {
    S.push(fine(on(box1, box(x, x + 1.8, -6.95, -6.8, 4, 13.4, YELLOW, { noLine: true, only: 'iso' }))));
    S.push(fine(on(box1, box(x, x + 1.8, 6.8, 6.95, 4, 13.4, YELLOW, { noLine: true }))));
    S.push(fine(on(box1, box(x, x + 1.8, -6.8, 6.8, 13.4, 13.55, YELLOW, { noLine: true }))));
  }
  S.push(fine(on(box1, box(-19, 9, -1, 1, 13.55, 13.7, P.mark, { noLine: true }))));
  S.push(cyl([-16, -3.5, 13.4], [-16, -3.5, 27], 0.42, 0.3, 6, '#2b2f2b')); // Antennenmast
  S.push(prX([[-16, 27], [-16, 23.6], [-10.5, 25.3]], -3.6, -3.4, YELLOW)); // Wimpel
  return { S, foot: [-21, 21.5, -6.9, 6.9] };
}

function engineer(P) {
  const S = [];
  for (const side of [-1, 1]) tracks(S, side, -14, 13, 5.6, 9, 4.4, P, { wheels: 5 });
  S.push(lowerHull(-14, 13.6, 5.6, 4.2, P));
  const hull = prX([[-14, 4], [-14.2, 7.6], [7, 7.6], [13.6, 4.6], [13.4, 4]], -8.6, 8.6, P.body);
  S.push(hull);
  lights(S, hull, 12.6, 7, 4.9, -14.2, 6.4);
  camoSides(S, hull, 8.6, [[-12, 5, 4.6, 7], [0, 4, 4.8, 7.2]], P.camo);
  const blade = box(14, 15.6, -9.6, 9.6, 0.6, 5.2, YELLOW); // Räumschild
  S.push(blade);
  S.push(fine(on(blade, box(15.6, 15.9, -9.6, 9.6, 0.6, 1.4, METAL, { noLine: true }))));
  for (let i = -3; i <= 3; i += 2) S.push(fine(on(blade, box(15.6, 15.75, i * 2.4 - 0.9, i * 2.4 + 0.9, 3.6, 4.6, '#1e1f1c', { noLine: true, only: 'iso' }))));
  for (const side of [-1, 1]) S.push(cyl([8, side * 7, 5], [14.2, side * 7, 3.4], 0.6, 0.6, 6, METAL));
  const cab = loft([[-9, 1.6], [-1.5, 1.6], [-1.5, 8.2], [-9, 8.2]], [[-8.6, 2], [-2, 2], [-2, 7.8], [-8.6, 7.8]], 7.6, 12.2, P.body);
  S.push(cab);
  S.push(on(cab, box(-8.3, -2.3, 2.3, 7.5, 12.2, 12.45, P.light)));
  S.push(on(cab, box(-1.85, -1.6, 2.4, 7.4, 9.4, 11.6, GLASS, { noLine: true, only: 'iso' })));
  S.push(on(cab, box(-8, -2.6, 7.9, 8.12, 9.4, 11.6, GLASS, { noLine: true, only: 'iso' })));
  S.push(cyl([0, -3.4, 7.6], [0, -3.4, 9.4], 2.6, 2.6, 12, YELLOW)); // Drehkranz
  S.push(cyl([0.5, -3.4, 9], [11, -3.4, 15.2], 1.15, 1, 4, YELLOW)); // Ausleger
  S.push(cyl([11, -3.4, 15.2], [17.5, -3.4, 8.2], 0.95, 0.85, 4, YELLOW)); // Stiel
  S.push(box(16, 19.2, -5.2, -1.6, 6, 9, METAL)); // Schaufel
  S.push(fine(cyl([3, -3.4, 10.4], [9, -3.4, 14], 0.4, 0.4, 4, METAL))); // Hydraulik
  return { S, foot: [-14.5, 16, -9.6, 9.6] };
}

/** Bagger (seit v5.35): Kettenfahrwerk, Oberwagen mit Kabine und Gegengewicht, langer Ausleger mit Tieflöffel. */
function excavator(P) {
  const S = [];
  for (const side of [-1, 1]) tracks(S, side, -12, 12, 5.4, 9, 4, P, { wheels: 4 });
  S.push(lowerHull(-12, 12, 5.4, 3.8, P));
  S.push(cyl([0, 0, 3.8], [0, 0, 5.2], 5, 5, 12, METAL)); // Drehkranz
  const upper = box(-11, 6, -7.6, 7.6, 5.2, 9.6, YELLOW); // Oberwagen
  S.push(upper);
  S.push(on(upper, box(-12.6, -9.4, -7.2, 7.2, 5.4, 10.4, mix(YELLOW, '#2a2a26', 0.35)))); // Gegengewicht
  camoSides(S, upper, 7.6, [[-9, 5.6, 4.2, 8.8]], P.camo);
  const cab = loft([[-1, 1], [6, 1], [6, 7.2], [-1, 7.2]], [[-0.6, 1.4], [5.2, 1.4], [5.2, 6.8], [-0.6, 6.8]], 9.6, 15, YELLOW);
  S.push(cab);
  S.push(on(cab, box(-0.4, 5, 1.6, 6.6, 15, 15.25, P.light)));
  S.push(on(cab, box(5.4, 5.7, 1.8, 6.4, 10.6, 14.2, GLASS, { noLine: true, only: 'iso' })));
  S.push(on(cab, box(-0.4, 5, 7.1, 7.3, 10.6, 14.2, GLASS, { noLine: true, only: 'iso' })));
  S.push(fine(box(-6, -2, -7.8, -7.6, 6.4, 8.6, P.mark, { noLine: true, only: 'iso' }))); // Kennung
  S.push(cyl([3, -3, 9.4], [14, -3, 19], 1.3, 1.1, 4, YELLOW)); // Ausleger
  S.push(cyl([14, -3, 19], [21, -3, 8.5], 1, 0.9, 4, YELLOW)); // Stiel
  S.push(box(19, 23, -5.6, -0.4, 4.2, 8.6, METAL)); // Tieflöffel
  for (let i = 0; i < 3; i++) S.push(fine(box(22.8, 23.6, -5 + i * 1.8, -4 + i * 1.8, 3.4, 4.4, '#1e1f1c', { noLine: true, only: 'iso' }))); // Zähne
  S.push(fine(cyl([5, -3, 10.8], [12, -3, 17], 0.45, 0.45, 4, METAL))); // Hydraulik
  lights(S, upper, 6, 6.4, 8.8, -12.6, 7);
  return { S, foot: [-12.6, 23.6, -9, 9] };
}

// ---------- Modelle: Luftfahrzeuge ----------

function littlebird(P) {
  const S = [];
  const body = mix(P.air, '#24272a', 0.55);
  for (const side of [-1, 1]) {
    S.push(cyl([-5.5, side * 3.6, 0.6], [7.5, side * 3.6, 0.6], 0.45, 0.45, 6, METAL)); // Kufe
    for (const x of [-2.5, 4]) S.push(cyl([x, side * 3.6, 0.6], [x, side * 2.2, 3.4], 0.3, 0.3, 4, METAL));
  }
  S.push(ball([1.5, 0, 6.2], 6.4, 3.9, 3.8, body));
  S.push(ball([4.6, 0, 6.8], 3.6, 3.3, 3.1, GLASS));
  S.push(cyl([-4, 0, 6.8], [-15.5, 0, 8.4], 1.2, 0.55, 6, body)); // Heckausleger
  S.push(box(-16.4, -14.6, -0.25, 0.25, 7.4, 12.6, body)); // Seitenleitwerk
  S.push(box(-15.2, -13.4, -3, 3, 8.1, 8.5, body));
  S.push(fine(on(S[S.length - 4], box(-11, -6, -1.3, 1.3, 7.6, 7.85, P.mark, { noLine: true, only: 'top' }))));
  S.push(cyl([1.5, 0, 9.6], [1.5, 0, 11.4], 0.75, 0.6, 6, METAL)); // Rotormast
  S.push(fine(box(-2, 2, -4.1, -3.85, 4.5, 6.5, P.mark, { noLine: true, only: 'iso' }))); // Kennung
  S.push(fine(box(-2, 2, 3.85, 4.1, 4.5, 6.5, P.mark, { noLine: true })));
  return { S, rotors: [{ x: 1.5, z: 11.6, r: 12.5, n: 5 }], tail: { x: -15.6, z: 9.6, r: 2.4 }, foot: [-16, 10, -4.5, 4.5] };
}

function gunship(P) {
  const S = [];
  const body = mix(P.air, '#3c4136', 0.35);
  const fus = prX([[-7, 2.6], [-7, 9], [2, 10.4], [9.5, 8.4], [13.5, 5.2], [12, 2.6]], -2.4, 2.4, body);
  S.push(fus);
  S.push(on(fus, prX([[0.5, 9.2], [3, 10.9], [9, 8.9], [12.2, 6], [10, 5.6]], -1.9, 1.9, GLASS, { noLine: true })));
  for (const side of [-1, 1]) {
    S.push(cyl([-5, side * 3.4, 9.2], [2, side * 3.4, 9.2], 1.55, 1.4, 8, body)); // Triebwerk
    S.push(box(-2.5, 1.5, side < 0 ? -8.6 : 2.4, side < 0 ? -2.4 : 8.6, 6.2, 6.9, body)); // Stummelflügel
    S.push(cyl([-2.5, side * 7.2, 4.9], [2.8, side * 7.2, 4.9], 1.15, 1.15, 8, OLIVE)); // Raketenbehälter
    S.push(fine(cyl([-2, side * 4.6, 5.1], [2.6, side * 4.6, 5.1], 0.55, 0.55, 6, WHITE))); // Lenkflugkörper
    S.push(cyl([9, side * 2.2, 0.9], [9, side * 2.2, 2.8], 0.3, 0.3, 4, METAL));
    S.push(cyl([9, side * 2.2, 0.9], [9, side * 2.2 + side * 0.6, 0.9], 0.85, 0.85, 8, WHEEL));
  }
  S.push(cyl([-7, 0, 6.6], [-21, 0, 8.4], 1.7, 0.75, 6, body)); // Heckausleger
  S.push(box(-22.2, -19.8, -0.3, 0.3, 7, 13.6, body));
  S.push(box(-21, -18.6, -3.6, 3.6, 7.6, 8.1, body));
  S.push(cyl([12, 0, 2.6], [17, 0, 2.6], 0.4, 0.35, 6, GUN)); // Bordkanone
  S.push(box(11, 13.2, -1, 1, 1.8, 3.4, METAL));
  S.push(cyl([0, 0, 10.4], [0, 0, 12.4], 0.8, 0.7, 6, METAL));
  S.push(fine(on(fus, box(-6, -1, -2.55, -2.4, 4, 7, P.mark, { noLine: true, only: 'iso' }))));
  S.push(fine(on(fus, box(-6, -1, 2.4, 2.55, 4, 7, P.mark, { noLine: true }))));
  S.push(fine(on(S[S.length - 9], box(-17, -9, -0.9, 0.9, 7.9, 8.1, P.mark, { noLine: true, only: 'top' }))));
  return { S, rotors: [{ x: 0, z: 12.6, r: 14.5, n: 4 }], tail: { x: -21, z: 12, r: 2.8 }, foot: [-22, 17, -8.6, 8.6] };
}

function transporter(P) {
  const S = [];
  const body = mix(P.air, '#4a5040', 0.3);
  const fus = prY([[-4.6, 2.2], [4.6, 2.2], [5.2, 4], [5.2, 9.2], [4.2, 10.8], [-4.2, 10.8], [-5.2, 9.2], [-5.2, 4]], -18, 13, body);
  S.push(fus);
  const nose = prX([[13, 2.6], [13, 10.6], [16.5, 9.6], [19, 6.4], [18.5, 3.6]], -4.6, 4.6, body);
  S.push(nose);
  S.push(on(nose, prX([[15.6, 9.7], [17.6, 8.8], [18.9, 6.6], [16.6, 6.6]], -3.6, 3.6, GLASS, { noLine: true })));
  for (const side of [-1, 1]) {
    S.push(box(-11, 8, side < 0 ? -6.6 : 5.2, side < 0 ? -5.2 : 6.6, 2.2, 5.6, body)); // Seitentanks
    for (const x of [-12, 9]) S.push(cyl([x, side * 4, 1.1], [x, side * 4 + side * 0.8, 1.1], 1.1, 1.1, 8, WHEEL));
    for (let i = 0; i < 4; i++) S.push(fine(on(fus, box(-8 + i * 4, -5.5 + i * 4, side < 0 ? -5.35 : 5.2, side < 0 ? -5.2 : 5.35, 7.2, 8.8, GLASS, { noLine: true, only: 'iso' }))));
  }
  S.push(box(-18.5, -10.5, -2.6, 2.6, 10.8, 15.6, body)); // hinterer Turm
  S.push(box(8.5, 13, -2.2, 2.2, 10.8, 12.4, body)); // vorderer Turm
  for (const side of [-1, 1]) S.push(cyl([-9, side * 3.6, 11.2], [-1, side * 3.6, 11.2], 1.3, 1.3, 8, body)); // Triebwerke
  S.push(cyl([-14.5, 0, 15.6], [-14.5, 0, 16.8], 0.75, 0.6, 6, METAL));
  S.push(cyl([10.8, 0, 12.4], [10.8, 0, 13.6], 0.75, 0.6, 6, METAL));
  S.push(fine(on(fus, box(-12, 6, -1.2, 1.2, 10.8, 11, P.mark, { noLine: true }))));
  for (const side of [-1, 1]) S.push(fine(on(fus, box(-16, -12, side < 0 ? -5.35 : 5.2, side < 0 ? -5.2 : 5.35, 3, 6.6, P.mark, { noLine: true, only: 'iso' }))));
  return { S, rotors: [{ x: 10.8, z: 13.8, r: 13, n: 3 }, { x: -14.5, z: 17, r: 13, n: 3 }], foot: [-18.5, 19, -6.6, 6.6] };
}

function f16(P, o) {
  const S = [];
  const ms = o.missiles ?? 22;
  const aim = ms % 10; // Luft-Luft-Lenkraketen an den Flügelspitzen
  const agm = Math.floor(ms / 10); // Luft-Boden-Raketen unter den Flügeln (seit v5.41)
  const body = mix(P.air, '#9aa3a8', 0.5);
  const dark = mix(body, '#000000', 0.25);
  S.push(cyl([-15, 0, 4.2], [9, 0, 4.2], 2.2, 2.3, 10, body)); // Rumpf
  S.push(cyl([9, 0, 4.2], [17.5, 0, 4.4], 2.3, 0.25, 10, body)); // Nase
  S.push(fine(cyl([16.3, 0, 4.36], [17.6, 0, 4.4], 0.6, 0.2, 6, '#3d4246'))); // Radom
  S.push(ball([7.2, 0, 5.9], 3.8, 1.35, 1.6, GLASS, { n: 10, m: 5, half: true })); // Kanzel
  S.push(box(0, 8.5, -1.7, 1.7, 1.6, 3.2, dark)); // Lufteinlauf
  S.push(fine(box(8.5, 8.7, -1.4, 1.4, 1.9, 2.9, '#16181a', { noLine: true })));
  for (const side of [-1, 1]) {
    S.push(prZ([[5, 0], [-6, side * 13], [-9, side * 13], [-9.5, 0]].map(([x, y]) => [x, y + side * 1.6]), 3.6, 4.1, body)); // Flügel
    S.push(prZ([[-10.5, side * 1.6], [-15, side * 7.2], [-17.2, side * 7.2], [-17, side * 1.6]], 3.5, 3.9, body)); // Höhenleitwerk
    if (agm >= (side < 0 ? 1 : 2)) {
      S.push(cyl([-3.8, side * 8.2, 3.45], [-3.8, side * 8.2, 2.5], 0.35, 0.35, 4, METAL)); // Pylon
      S.push(cyl([-6.5, side * 8.2, 2.1], [2.2, side * 8.2, 2.1], 0.85, 0.85, 8, '#8d917c')); // Luft-Boden-Rakete
      S.push(cyl([2.2, side * 8.2, 2.1], [3.4, side * 8.2, 2.1], 0.85, 0.15, 8, '#3a3e40')); // Suchkopf
      S.push(fine(box(-6.4, -5, side * 8.2 - 1.6, side * 8.2 + 1.6, 2.05, 2.15, '#6f735f', { noLine: true }))); // Leitwerk
    }
    if (aim >= (side < 0 ? 1 : 2)) {
      S.push(cyl([-9.5, side * 14.9, 3.85], [-1.5, side * 14.9, 3.85], 0.5, 0.5, 6, WHITE)); // Lenkrakete an der Flügelspitze
      S.push(cyl([-1.5, side * 14.9, 3.85], [0, side * 14.9, 3.85], 0.5, 0.05, 6, '#7d8288'));
      S.push(fine(box(-9.5, -8, side * 14.9 - 1.3, side * 14.9 + 1.3, 3.8, 3.9, '#9aa0a6', { noLine: true })));
    }
    S.push(fine(box(-9, -6, side * 14.6 - 0.2, side * 14.6 + 0.2, 3.6, 4.1, P.mark, { noLine: true }))); // Flügelspitze in Teamfarbe
  }
  const fin = prX([[-9.5, 6.2], [-15.5, 12.8], [-17.5, 12.8], [-16.8, 6.2]], -0.3, 0.3, body);
  S.push(fin);
  S.push(fine(on(fin, prX([[-15, 11.4], [-15.6, 12.8], [-17.5, 12.8], [-17.2, 11.4]], -0.36, 0.36, P.mark, { noLine: true }))));
  S.push(cyl([-15, 0, 4.2], [-17.6, 0, 4.2], 1.85, 1.6, 10, '#4a4e52')); // Düse
  S.push(fine(on(S[0], box(-6, 2, -0.5, 0.5, 6.35, 6.45, dark, { noLine: true, only: 'top' }))));
  if (o.gear) {
    for (const [x, y] of [[11, 0], [-4.5, -2.6], [-4.5, 2.6]]) {
      S.push(cyl([x, y, 2.4], [x, y, 0.9], 0.25, 0.25, 4, METAL));
      S.push(cyl([x, y - 0.35, 0.8], [x, y + 0.35, 0.8], 0.8, 0.8, 8, WHEEL));
    }
  }
  return { S, nozzle: { x: -17.6, z: 4.2 }, foot: [-17.6, 17.6, -15.5, 15.5] };
}

// ---------- F-22: Bauteile für den facettierten Tarnkappenrumpf ----------

const same3 = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
const avg3 = (pts) => [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);

/**
 * Facettierter Rumpf aus Ringen [[x, y, z] …] (gleich viele Ecken; ein Ring aus einem Punkt ist die Spitze). Jeder Abschnitt
 * zwischen zwei Ringen ist ein eigener, fast konvexer Körper: so stimmen Rückseiten und Reihenfolge auch am langen, taillierten Rumpf.
 */
function hull(rings, col, o) {
  const out = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    const n = Math.max(a.length, b.length);
    const A = Array.from({ length: n }, (_, k) => a[a.length === 1 ? 0 : k]);
    const B = Array.from({ length: n }, (_, k) => b[b.length === 1 ? 0 : k]);
    const faces = [];
    if (a.length > 1) faces.push(A.slice().reverse());
    if (b.length > 1) faces.push(B.slice());
    for (let k = 0; k < n; k++) {
      const q = [A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]];
      faces.push(q.filter((p, j) => !same3(p, q[(j + 1) % 4]))); // an der Spitze Dreieck statt Viereck
    }
    out.push(solid(faces, col, avg3([...a, ...b]), o));
  }
  return out;
}

/** Querschnitt bei x: flacher Boden (Halbbreite wb in Höhe zb, Bodenkante bei xb), Kante (wc, zc), flacher Rücken (wt, zt). */
const ring = (x, wb, zb, wc, zc, wt, zt, xb = x) => [[xb, -wb, zb], [x, -wc, zc], [x, -wt, zt], [x, wt, zt], [x, wc, zc], [xb, wb, zb]];

/**
 * Dünne Platte auf einer ebenen Fläche pts (Einlauf, Schachtöffnung, Tarnfleck): nach außen (weg vom Punkt inside) um lift
 * abgehoben, Dicke t, k = Anteil, um den sie zur Mitte schrumpft.
 */
function slab(pts, inside, col, { k = 0, lift = 0.04, t = 0.08, ...o } = {}) {
  const m = avg3(pts);
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  n = norm3(n);
  if (n[0] * (m[0] - inside[0]) + n[1] * (m[1] - inside[1]) + n[2] * (m[2] - inside[2]) < 0) n = n.map((v) => -v);
  const at = (d) => pts.map((p) => p.map((v, i) => v + (m[i] - v) * k + n[i] * d));
  const P = at(lift);
  const Q = at(lift + t);
  const faces = [P.slice().reverse(), Q];
  for (let i = 0; i < P.length; i++) faces.push([P[i], P[(i + 1) % P.length], Q[(i + 1) % P.length], Q[i]]);
  return solid(faces, col, avg3([...P, ...Q]), { noLine: true, ...o });
}

/** Grundriss um d nach innen versetzt (gleiche Eckenzahl): Oberseite für abgeschrägte Kanten an Flügel und Leitwerk (loft). */
function inset(plan, d) {
  const n = plan.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += plan[i][0] * plan[(i + 1) % n][1] - plan[(i + 1) % n][0] * plan[i][1];
  const sg = area > 0 ? 1 : -1;
  const lines = plan.map(([ax, ay], i) => {
    const [bx, by] = plan[(i + 1) % n];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    return [ax - ((by - ay) / l) * d * sg, ay + ((bx - ax) / l) * d * sg, bx - ax, by - ay];
  });
  return plan.map((_, i) => {
    const [px, py, ux, uy] = lines[(i - 1 + n) % n];
    const [qx, qy, vx, vy] = lines[i];
    const den = ux * vy - uy * vx;
    if (Math.abs(den) < 1e-9) return [qx, qy];
    const t = ((qx - px) * vy - (qy - py) * vx) / den;
    return [px + ux * t, py + uy * t];
  });
}

/** Alle Punkte eines Körpers mit f umrechnen (schräg gestellte Seitenleitwerke). */
function remap(so, f) {
  so.faces = so.faces.map((fc) => fc.map(f));
  so.c = f(so.c);
  return so;
}

// Rumpf der F-22 als Ringe [x, wb, zb, wc, zc, wt, zt, xb]: Nase mit Kante (chine), schräge Einläufe unter der Kanzel, breiter
// Mittelrumpf mit flachem Boden, hinten die Triebwerke. Die Ringe 9.0 → 6.4 bilden die Einläufe (unten außen), dahinter liegen
// in der unteren Seitenfläche die Seitenschächte (x 6.3 … -0.6).
const F22_RINGS = [
  [17.2, 0.35, 3.1, 1.05, 3.78, 0.3, 4.5],
  [13.8, 0.75, 2.55, 1.95, 3.7, 0.62, 5.05],
  [10.6, 1.0, 2.35, 2.75, 3.65, 0.82, 5.38],
  [9.0, 1.1, 2.3, 3.2, 3.65, 0.88, 5.48, 8.3],
  [6.4, 3.7, 2.3, 4.25, 3.7, 1.1, 5.62],
  [3.0, 3.75, 2.3, 4.55, 3.72, 1.4, 5.7],
  [-2.5, 3.6, 2.3, 4.5, 3.76, 1.85, 5.58],
  [-8.0, 3.2, 2.4, 4.05, 3.8, 2.1, 5.32],
  [-12.0, 2.85, 2.55, 3.55, 3.8, 2.2, 5.05],
  [-14.6, 2.55, 2.75, 3.0, 3.8, 2.05, 4.85],
];
/** Wert eines Ringfelds (Index i in F22_RINGS-Zeilen) bei x, linear zwischen den Ringen. */
function f22At(x, i) {
  const R = F22_RINGS;
  for (let j = 0; j + 1 < R.length; j++) {
    const [xa] = R[j];
    const [xb] = R[j + 1];
    if (x <= xa && x >= xb) return R[j][i] + ((R[j + 1][i] - R[j][i]) * (xa - x)) / (xa - xb);
  }
  return R[x > R[0][0] ? 0 : R.length - 1][i];
}
/** Punkt auf der unteren Seitenfläche (Boden → Kante) rechts bei x, t = 0 unten … 1 an der Kante; side −1 spiegelt nach links. */
const f22Side = (x, t, side) => [x, side * (f22At(x, 1) + (f22At(x, 3) - f22At(x, 1)) * t), f22At(x, 2) + (f22At(x, 4) - f22At(x, 2)) * t];
/** Punkt auf dem flachen Rücken bei x (y quer). */
const f22Top = (x, y) => [x, y, f22At(x, 6) + 0.01];

const F22_MISSILES = 6; // Lenkraketen in den Seitenschächten (UNITS.f22, Waffe 'aim'): je Seite drei Startschienen

/**
 * F-22 (seit dem Paket „F-22“): Tarnkappenjäger mit facettiertem Rumpf, rautenförmigen Flügeln, nach außen geneigten Doppel-
 * Seitenleitwerken, trapezförmigen Höhenleitwerken, schrägen Einläufen, goldener Kanzel ohne Rahmen und zwei rechteckigen Schubvektor-
 * düsen. Waffen innen: im Flug sind die Schächte zu (glatte Unterseite). Am Boden (o.gear) stehen die Schächte offen, die
 * Startschienen sind ausgefahren und tragen o.missiles (0 … 6) Lenkraketen, abwechselnd links und rechts von innen nach außen.
 */
function f22(P, o) {
  const S = [];
  const body = mix(P.air, '#565d64', 0.62); // Tarnanstrich, dunkler als die F-16
  const spot = mix(body, '#262b30', 0.16); // zweiter Grauton (Tarnflecken)
  const dark = mix(body, '#000000', 0.3);
  const NOZ = '#55595d';
  const BLACK = '#15171a';
  const GOLD = '#977c3f'; // goldene Tönung der Kanzel
  const open = !!o.gear; // am Boden: Schächte offen
  const ms = open ? Math.max(0, Math.min(F22_MISSILES, o.missiles ?? F22_MISSILES)) : 0;

  // Rumpf: Spitze, dann die Ringe
  S.push(...hull([[[20.5, 0, 3.85]], ...F22_RINGS.map((r) => ring(...r))], body, { smooth: true })); // Facetten nur über das Licht, ohne Fugen
  const inner = [0, 0, 3.6];
  for (const side of [-1, 1]) {
    // Einlauf: schräge Öffnung unter der Kante, oben vorn, unten hinten (Ringe 9.0 → 6.4)
    const lip = [[8.3, side * 1.1, 2.3], [9.0, side * 3.2, 3.65], [6.4, side * 4.25, 3.7], [6.4, side * 3.7, 2.3]];
    S.push(slab(lip, [7.6, 0, 3.6], BLACK, { k: 0.16 }));
    // Klappen der Seitenschächte, im Flug geschlossen (feine Fugen), am Boden als Öffnung
    const door = [f22Side(6.3, 0.18, side), f22Side(6.3, 0.86, side), f22Side(-0.6, 0.86, side), f22Side(-0.6, 0.18, side)];
    S.push(fine(slab(door, inner, open ? BLACK : mix(body, '#000000', 0.12), { k: open ? 0.04 : 0, only: open ? undefined : 'iso' })));
  }
  // Kanzel: golden getönt, ohne Rahmen, dahinter der Rücken
  const can = ball([9.8, 0, 5.15], 4.7, 1.3, 1.95, GOLD, { n: 12, m: 5, half: true });
  S.push(can);
  S.push(fine(on(can, ball([10.9, 0.3, 6.72], 1.7, 0.38, 0.26, '#dcc98e', { n: 8, m: 3, half: true, noLine: true })))); // Lichtreflex
  S.push(...hull([[[6.2, -1.25, 5.5], [6.2, -0.7, 6.15], [6.2, 0.7, 6.15], [6.2, 1.25, 5.5]], [[-7.5, -1.7, 5.3], [-7.5, -0.6, 5.6], [-7.5, 0.6, 5.6], [-7.5, 1.7, 5.3]]], body, { smooth: true }));

  // Flügel (Raute: Vorderkante 42° gepfeilt, Hinterkante nach vorn gepfeilt) und Höhenleitwerke (parallele Kanten), abgeschrägte Kanten
  const WING = [[3.0, 4.5], [-6.3, 15], [-9.5, 15], [-12.9, 3.6]];
  const STAB = [[-12.6, 2.9], [-17.9, 9.3], [-20.2, 9.3], [-21.5, 4.6], [-20.7, 2.9]];
  for (const side of [-1, 1]) {
    const mir = (pl) => pl.map(([x, y]) => [x, y * side]);
    const w = loft(mir(WING), mir(inset(WING, 0.5)), 3.4, 3.82, body);
    S.push(w);
    const pat = side < 0 ? [[-1.8, 6.6], [-3.2, 9], [-6.6, 9.6], [-6, 7]] : [[-2.4, 7.2], [-4.6, 10.4], [-7.4, 9.8], [-5.8, 6.6]];
    S.push(fine(on(w, slab(pat.map(([x, y]) => [x, y * side, 3.82]), [-5, side * 8, 3], spot, { lift: 0.01, t: 0.04 }))));
    const pat2 = side < 0 ? [[-7.2, 11], [-8, 13.6], [-10.2, 13.2], [-9.6, 10.6]] : [[-8.2, 11.6], [-8.8, 13.8], [-10.4, 13.6], [-10.4, 11]];
    S.push(fine(on(w, slab(pat2.map(([x, y]) => [x, y * side, 3.82]), [-9, side * 12, 3], spot, { lift: 0.01, t: 0.04 }))));
    S.push(loft(mir(STAB), mir(inset(STAB, 0.35)), 3.45, 3.78, body));
    // Ausleger neben den Düsen (Lager der Höhenleitwerke)
    S.push(prX([[-14.2, 3.0], [-14.2, 4.55], [-18.4, 4.15], [-20.2, 3.7], [-19, 3.1]], side < 0 ? -3.3 : 2.45, side < 0 ? -2.45 : 3.3, body));
    // Seitenleitwerk, 28° nach außen geneigt, Spitze in Teamfarbe
    const cs = Math.cos(0.49);
    const sn = Math.sin(0.49);
    const cant = ([x, y, z]) => [x, side * (2.75 + y * cs + z * sn), 4.55 - y * sn + z * cs];
    const fin = remap(prX([[-8.4, -0.3], [-12.3, 6], [-15.5, 6], [-17.4, -0.3]], -0.22, 0.22, body), cant);
    S.push(fin);
    S.push(fine(on(fin, remap(prX([[-11.75, 5.1], [-12.3, 6], [-15.5, 6], [-15.8, 5.1]], -0.28, 0.28, P.mark, { noLine: true }), cant))));
    // Schubvektordüse (zweidimensional, rechteckig) mit dunkler Öffnung
    const yc = side * 1.4;
    const noz = prX([[-14.4, 2.95], [-14.4, 4.75], [-18, 4.28], [-18, 3.3]], yc - 1, yc + 1, NOZ);
    S.push(noz);
    S.push(on(noz, slab([[-18, yc - 0.8, 3.42], [-18, yc + 0.8, 3.42], [-18, yc + 0.8, 4.16], [-18, yc - 0.8, 4.16]], [-16, yc, 3.8], BLACK)));
    S.push(fine(on(noz, box(-18, -17.2, yc - 1, yc + 1, 4.28, 4.36, dark, { noLine: true, only: 'top' })))); // Kante der oberen Klappe
  }
  S.push(prX([[-14.4, 3.05], [-14.4, 4.7], [-16.6, 4.1], [-16.6, 3.5]], -0.42, 0.42, body)); // Kiel zwischen den Düsen
  // Tarnflecken auf dem Rücken
  S.push(fine(slab([f22Top(-3, -1.7), f22Top(-3, 0.3), f22Top(-9, 0.9), f22Top(-9.5, -1.2)], [-6, 0, 3.5], spot)));
  S.push(fine(slab([f22Top(2.2, 0.4), f22Top(2.2, 1.3), f22Top(-1.6, 1.7), f22Top(-1.2, 0.2)], [0, 0, 3.5], spot)));

  if (open) {
    // Startschienen an Armen aus dem Schacht, je Seite drei nach außen und unten gestaffelt; Raketen nach Vorrat
    for (let r = 0; r < 3; r++) {
      for (const side of [-1, 1]) {
        const y = side * (5.0 + 1.05 * r);
        const z = 2.85 - 0.68 * r;
        const xf = 8.8 - 0.45 * r; // Spitze der Rakete: weit vorn, damit man sie auch von oben vor der Flügelkante sieht
        const xr = xf - 7.6;
        for (const xa of [xf - 2.4, xr + 1.6]) S.push(cyl(f22Side(xa, 0.5, side), [xa, y, z + 0.5], 0.14, 0.14, 4, METAL, { only: 'iso' })); // Arme
        S.push(box(xr + 0.9, xf - 1.6, y - 0.13, y + 0.13, z + 0.4, z + 0.58, METAL)); // Schiene
        const slot = r * 2 + (side < 0 ? 0 : 1);
        if (slot >= ms) continue;
        S.push(cyl([xr, y, z], [xf - 1.1, y, z], 0.47, 0.47, 6, WHITE)); // Lenkrakete
        S.push(cyl([xf - 1.1, y, z], [xf, y, z], 0.47, 0.06, 6, '#7d8288')); // Suchkopf
        S.push(fine(box(xr, xr + 1.1, y - 1.05, y + 1.05, z - 0.04, z + 0.04, '#9aa0a6', { noLine: true }))); // Leitwerk
        S.push(fine(box(xr + 3.4, xr + 4.4, y - 0.8, y + 0.8, z - 0.04, z + 0.04, '#9aa0a6', { noLine: true }))); // Flügel
        S.push(fine(box(xr, xr + 1.1, y - 0.04, y + 0.04, z - 0.95, z - 0.4, '#9aa0a6', { noLine: true, only: 'iso' })));
      }
    }
    // Klappen des Hauptschachts hängen unter dem Rumpf
    for (const side of [-1, 1]) S.push(box(-2.6, 6.4, side * 2.05 - 0.1, side * 2.05 + 0.1, 0.95, 2.3, dark, { only: 'iso' }));
    // Fahrwerk: Bugrad und Hauptfahrwerk mit Klappen
    S.push(cyl([12.2, 0, 2.5], [12.2, 0, 0.8], 0.25, 0.25, 4, METAL));
    S.push(cyl([12.2, -0.32, 0.75], [12.2, 0.32, 0.75], 0.75, 0.75, 8, WHEEL));
    for (const side of [-1, 1]) {
      S.push(box(10.8, 13.8, side * 0.62 - 0.07, side * 0.62 + 0.07, 1.45, 2.4, body, { only: 'iso' }));
      S.push(cyl([-3.6, side * 3.1, 2.3], [-3.6, side * 3.1, 0.95], 0.28, 0.28, 4, METAL));
      S.push(cyl([-3.6, side * 3.1 - 0.4, 0.95], [-3.6, side * 3.1 + 0.4, 0.95], 0.95, 0.95, 8, WHEEL));
      S.push(box(-5.2, -2, side * 3.75 - 0.07, side * 3.75 + 0.07, 1.25, 2.3, body, { only: 'iso' }));
    }
  }
  return { S, nozzle: { x: -18, z: 3.79, ys: [-1.4, 1.4], sy: 0.8, sz: 0.5 }, foot: [-21.5, 20.5, -15, 15] };
}

// ---------- Su-27: Überlegenheitsjet mit langem Bug und zwei getrennten Triebwerken ----------

/**
 * Su-27 (Paket „Su-27“): langer schlanker Rumpf mit spitzem Radom und weit vorn liegender Kanzel (der Bug hängt leicht nach unten),
 * breiter flacher Mittelrumpf, der in die großen gepfeilten Flügel übergeht (Vorderkantenerweiterung an der Wurzel), zwei Triebwerke
 * weit außen mit runden Düsen, dazwischen ein Heckstachel über die Düsen hinaus, zwei senkrechte Seitenleitwerke auf den Gondeln und
 * große trapezförmige Höhenleitwerke. Bewaffnung wie die F-16 (o.missiles wie dort: Luft-Luft an den Flügelspitzen, % 10, plus 10 ×
 * Luft-Boden unter den Flügeln); o.gear = Fahrwerk am Boden. Teamfarbe nur an Flügelspitzen und Leitwerksspitzen.
 */
function su27(P, o) {
  const S = [];
  const ms = o.missiles ?? 22;
  const aim = ms % 10; // Luft-Luft-Lenkraketen an den Flügelspitzen
  const agm = Math.floor(ms / 10); // Luft-Boden-Raketen unter den Flügeln
  const body = mix(P.air, '#c3ccd3', 0.55); // heller blaugrauer Tarnanstrich
  const NOZ = '#4a4e52';

  // Rumpf: Spitze des Radoms, dann die Ringe von vorn nach hinten (Bug fällt leicht ab, Mitte breit und flach)
  S.push(
    ...hull(
      [
        [[23.6, 0, 3.9]],
        ring(21.5, 0.3, 3.55, 0.5, 4.0, 0.3, 4.45),
        ring(18.5, 0.6, 3.25, 0.95, 4.1, 0.6, 4.9),
        ring(15, 0.9, 3.0, 1.45, 4.25, 0.9, 5.4),
        ring(11.5, 1.45, 2.8, 2.0, 4.45, 1.3, 5.7),
        ring(6, 2.1, 2.55, 2.85, 4.3, 2.0, 5.65),
        ring(0, 2.5, 2.45, 3.3, 4.2, 2.3, 5.5),
        ring(-6, 2.5, 2.6, 3.3, 4.2, 2.1, 5.3),
        ring(-11, 2.0, 2.8, 2.7, 4.2, 1.6, 5.1),
        ring(-15, 1.3, 3.1, 1.9, 4.0, 1.0, 4.9),
        ring(-18.5, 0.7, 3.4, 1.2, 3.9, 0.6, 4.5),
      ],
      body,
      { smooth: true },
    ),
  );
  // Kanzel weit vorn, Tropfenform auf dem Rumpf
  S.push(ball([9.8, 0, 5.4], 3.5, 1.3, 1.8, GLASS, { n: 10, m: 5, half: true }));
  // Lufteinlauf unter der Vorderkante der Flügel (dunkel)
  S.push(box(1.5, 8.0, -1.8, 1.8, 1.9, 2.6, mix(body, '#000000', 0.35)));
  // Heckstachel zwischen den Düsen, ragt über sie hinaus
  S.push(cyl([-8, 0, 4.2], [-24.2, 0, 4.5], 1.05, 0.22, 8, body));

  for (const side of [-1, 1]) {
    // Flügel: große Wurzel mit Vorderkantenerweiterung, gepfeilte Vorderkante, gerade Spitze
    const wing = prZ([[12.5, 2.4], [9, 3.4], [-4.5, 14.6], [-9.2, 14.6], [-11.8, 2.4]].map(([x, y]) => [x, side * y]), 3.5, 3.9, body);
    S.push(wing);
    // dunkler Tarnfleck auf der Oberseite (die echte Su-27 trägt Tarnanstrich)
    S.push(fine(on(wing, prZ([[3.5, 4.5], [-1.5, 7.5], [-5.5, 8.2], [-3, 4.5]].map(([x, y]) => [x, side * y]), 3.9, 3.94, mix(body, '#5f6d76', 0.4), { noLine: true, only: 'top' }))));
    // Teamfarbe nur auf der Flügelspitze
    S.push(fine(box(-8.6, -4.6, side * 14.6 - 0.2, side * 14.6 + 0.2, 3.88, 3.96, P.mark, { noLine: true })));
    if (aim >= (side < 0 ? 1 : 2)) {
      // Lenkrakete an der Flügelspitze (wie die F-16), nach vorn über die Flügelkante
      S.push(cyl([-9, side * 14.9, 3.9], [-0.5, side * 14.9, 3.9], 0.5, 0.5, 6, WHITE));
      S.push(cyl([-0.5, side * 14.9, 3.9], [0.5, side * 14.9, 3.9], 0.5, 0.05, 6, '#7d8288'));
      S.push(fine(box(-9, -7.6, side * 14.9 - 1.3, side * 14.9 + 1.3, 3.9, 4.0, '#9aa0a6', { noLine: true })));
    }
    if (agm >= (side < 0 ? 1 : 2)) {
      // Luft-Boden-Rakete unter dem Flügel an einem Pylon
      S.push(cyl([-3.8, side * 8.6, 3.45], [-3.8, side * 8.6, 2.5], 0.35, 0.35, 4, METAL));
      S.push(cyl([-6.5, side * 8.6, 2.1], [2.2, side * 8.6, 2.1], 0.85, 0.85, 8, '#8d917c'));
      S.push(cyl([2.2, side * 8.6, 2.1], [3.4, side * 8.6, 2.1], 0.85, 0.15, 8, '#3a3e40'));
      S.push(fine(box(-6.4, -5, side * 8.6 - 1.6, side * 8.6 + 1.6, 2.05, 2.15, '#6f735f', { noLine: true })));
    }
    // Höhenleitwerk: großes Trapez am Rumpfheck
    S.push(prZ([[-11.5, 2.4], [-16.8, 9.4], [-21, 9.4], [-19.6, 2.4]].map(([x, y]) => [x, side * y]), 3.55, 3.9, body));
    // Triebwerksgondel mit runder Düse, weit außen
    S.push(cyl([-1.5, side * 3.6, 3.3], [-19.8, side * 3.6, 3.3], 1.95, 1.7, 10, body));
    S.push(cyl([-19.8, side * 3.6, 3.3], [-21, side * 3.6, 3.3], 1.7, 1.55, 10, NOZ));
    S.push(cyl([-20.9, side * 3.6, 3.3], [-21.1, side * 3.6, 3.3], 1.25, 1.25, 10, '#16181a'));
    // Seitenleitwerk: senkrecht auf der Gondel, Spitze in Teamfarbe
    const fin = prX([[-4.5, 4.9], [-12.6, 12.4], [-16.8, 12.4], [-18.6, 4.9]], side * 3.6 - 0.3, side * 3.6 + 0.3, body);
    S.push(fin);
    S.push(fine(on(fin, prX([[-12.2, 11.1], [-12.6, 12.4], [-16.8, 12.4], [-17.1, 11.1]], side * 3.6 - 0.34, side * 3.6 + 0.34, P.mark, { noLine: true }))));
  }
  if (o.gear) {
    for (const [x, y] of [[12, 0], [-1, -4.9], [-1, 4.9]]) {
      S.push(cyl([x, y, 2.4], [x, y, 0.9], 0.25, 0.25, 4, METAL));
      S.push(cyl([x, y - 0.35, 0.8], [x, y + 0.35, 0.8], 0.8, 0.8, 8, WHEEL));
    }
  }
  return { S, nozzle: { x: -21, z: 3.3, ys: [-3.6, 3.6], sy: 0.9, sz: 0.9 }, foot: [-22.5, 23.6, -15.5, 15.5] };
}

// ---------- U-2: Höhenaufklärer ----------

/** Ovaler Rumpfquerschnitt bei x: Halbbreite w, Halbhöhe h, Mitte in Höhe zc, n Ecken (für hull). */
const oval = (x, w, h, zc, n = 10) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((i + 0.5) / n) * TAU;
    return [x, Math.cos(a) * w, zc + Math.sin(a) * h];
  });
/** Obere Hälfte eines Ovals bei x (Kanzel, Rahmen): von links unten über den Scheitel nach rechts unten, Unterkante in Höhe z0. */
const arch = (x, w, h, z0, n = 7) =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * i) / (n - 1);
    return [x, -Math.cos(a) * w, z0 + Math.sin(a) * h];
  });

// Rumpf der U-2 als Ringe [x, Halbbreite, Halbhöhe, Mitte z]: spitze Nase, Kanzel weit vorn, langer gleichmäßiger Rumpf,
// schlanker Heckkonus bis zur runden Düse. Länge mit Düse 40,8, halbe Spannweite 32,5 (Spannweite ≈ 1,6 × Länge wie beim Vorbild).
const U2_BODY = [
  [19.6, 0.7, 0.62, 3.0],
  [17.6, 1.3, 1.2, 3.08],
  [14.6, 1.72, 1.62, 3.14],
  [10.5, 1.92, 1.84, 3.16],
  [4.5, 1.98, 1.9, 3.16],
  [-3, 1.86, 1.8, 3.14],
  [-9, 1.55, 1.55, 3.12],
  [-14, 1.22, 1.28, 3.12],
  [-18.7, 0.98, 1.02, 3.15],
];
// Flügel als Profile quer [y, Vorderkante x, Hinterkante x, Dicke]: sehr lang und schmal, Vorderkante leicht gepfeilt, Hinterkante
// fast gerade, abgerundete Spitze. Unterseite in Höhe 2,95 (Mitteldecker).
const U2_WING = [
  [1.5, 4.1, -4.1, 0.5],
  [6, 3.55, -3.8, 0.46],
  [11, 2.98, -3.46, 0.42],
  [16, 2.42, -3.12, 0.38],
  [21, 1.85, -2.78, 0.33],
  [25.5, 1.33, -2.48, 0.28],
  [29, 0.93, -2.24, 0.23],
  [31.6, 0.62, -2.04, 0.19],
  [32.5, 0.12, -1.62, 0.11],
];
const U2_POGO = 17; // Stützräder („Pogos“) unter den Flügeln, Abstand zur Mitte
const U2_POD = 10; // Sensorbehälter („Superpods“) an den Flügeln, Abstand zur Mitte
/** Durchhang der Flügel am Boden (volle Tanks, Spitzen hängen außerhalb der Stützräder nach unten; im Flug gerade). */
const u2Droop = (y) => -0.0025 * Math.max(0, y - 10) ** 2;
// Abgasschein der U-2: kein Nachbrenner, nur ein schwacher, kurzer Schein (statt FLAME, Länge × len)
const U2_GLOW = [
  [1.25, 1, 'rgba(255,150,80,0.2)'],
  [0.7, 0.6, 'rgba(255,214,160,0.38)'],
];

/**
 * U-2 „Dragon Lady“ (seit dem Paket „U-2“): Höhenaufklärer ohne Waffen. Fast schwarzer, matter Anstrich, sehr lange gerade Flügel
 * mit großer Streckung und zwei Sensorbehältern, schlanker Rumpf mit gerahmter Kanzel weit vorn, seitliche Einläufe, Rückenbuckel,
 * hohes Seitenleitwerk (Spitze in Teamfarbe, dünne helle Kennung), kleine gerade Höhenleitwerke (Spitzen in Teamfarbe), runde Düse.
 * Am Boden (o.gear): Tandemfahrwerk unter dem Rumpf, Stützräder unter den Flügeln, Flügelspitzen hängen leicht nach unten.
 */
function u2(P, o) {
  const S = [];
  const body = mix(P.air, '#24282d', 0.8); // fast schwarz, Team nur als Hauch
  const dark = mix(body, '#000000', 0.35);
  const hump = mix(body, '#5a6068', 0.16); // Rückenbuckel (Antennenverkleidung), etwas heller
  const NOZ = '#4a4e52';
  const BLACK = '#121315';
  const ID = '#c3c6c0'; // dünne helle Kennung
  const gear = !!o.gear;
  const droop = gear ? u2Droop : () => 0;

  // Rumpf: Nasenspitze, dann die Ringe
  S.push(...hull([[[20.8, 0, 2.95]], ...U2_BODY.map(([x, w, h, z]) => oval(x, w, h, z))], body, { smooth: true }));
  // Düse (rund) mit dunkler Öffnung
  const noz = cyl([-18.6, 0, 3.15], [-19.9, 0, 3.15], 0.96, 0.84, 10, NOZ);
  S.push(noz);
  S.push(on(noz, slab(oval(-19.9, 0.62, 0.62, 3.15, 8), [-19, 0, 3.15], BLACK)));

  // Seitliche Lufteinläufe neben und hinter der Kanzel: halbrunde Hutzen mit schwarzer Öffnung
  for (const side of [-1, 1]) {
    const lip = [9.4, side * 1.95, 3.42];
    const intake = cyl(lip, [3.2, side * 1.55, 3.22], 0.86, 0.42, 8, body);
    S.push(intake);
    S.push(on(intake, slab(oval(9.4, 0.62, 0.62, 0, 8).map(([x, y, z]) => [x, lip[1] + y, lip[2] + z]), [8, lip[1], lip[2]], BLACK)));
  }

  // Kanzel weit vorn: getönte Haube mit Rahmen (Frontscheibe, Bügel, Heck), Lichtreflex
  const CAN = [
    [14.5, 0.55, 0.3],
    [13.4, 1.12, 0.95],
    [11.6, 1.22, 1.12],
    [9.9, 1.02, 0.82],
    [9.1, 0.6, 0.32],
  ];
  const z0 = 4.4;
  const can = hull(CAN.map(([x, w, h]) => arch(x, w, h, z0)), GLASS, { smooth: true });
  S.push(...can);
  const canAt = (x) => {
    for (let j = 0; j + 1 < CAN.length; j++) {
      const [xa, wa, ha] = CAN[j];
      const [xb, wb, hb] = CAN[j + 1];
      if (x <= xa && x >= xb) {
        const t = (xa - x) / (xa - xb);
        return [wa + (wb - wa) * t, ha + (hb - ha) * t];
      }
    }
    return [0.5, 0.3];
  };
  const frame = (x0, x1, seg) => {
    const [w0, h0] = canAt(x0);
    const [w1, h1] = canAt(x1);
    for (const so of hull([arch(x0, w0 + 0.07, h0 + 0.07, z0), arch(x1, w1 + 0.07, h1 + 0.07, z0)], dark)) S.push(on(can[seg], so));
  };
  frame(13.55, 13.2, 1); // Rahmen der Frontscheibe
  frame(11.75, 11.45, 1); // Bügel der Haube
  frame(9.95, 9.65, 3); // hinterer Rahmen
  for (const side of [-1, 1]) S.push(fine(on(can[1], box(9.4, 13.6, side * 1.12 - 0.07, side * 1.12 + 0.07, z0 + 0.05, z0 + 0.28, dark, { noLine: true })))); // Sims
  S.push(fine(on(can[2], ball([12.4, 0.35, 5.36], 1.1, 0.3, 0.16, '#9fb4c4', { n: 8, m: 3, half: true, noLine: true })))); // Lichtreflex
  // Rücken hinter der Kanzel und Antennenbuckel über dem Flügel
  S.push(...hull([arch(9.6, 0.8, 0.45, 4.5), arch(5.5, 0.75, 0.32, 4.6), arch(2.5, 0.5, 0.12, 4.7)], body, { smooth: true }));
  S.push(ball([-1.2, 0, 4.82], 4.4, 1.12, 0.82, hump, { n: 12, m: 4, half: true }));

  // Flügel: Profile quer, am Boden mit Durchhang; Sensorbehälter, am Boden Gleitkufen an den Spitzen
  const sec = (y, xl, xt, t, side) => {
    const c = xl - xt;
    const z = 2.95 + droop(y);
    const Y = side * y;
    return [[xl, Y, z + 0.38 * t], [xl - 0.18 * c, Y, z + t], [xt + 0.35 * c, Y, z + 0.78 * t], [xt, Y, z + 0.4 * t], [xt + 0.35 * c, Y, z + 0.1 * t], [xl - 0.18 * c, Y, z]];
  };
  for (const side of [-1, 1]) {
    S.push(...hull(U2_WING.map(([y, xl, xt, t]) => sec(y, xl, xt, t, side)), body, { smooth: true }));
    const yp = side * U2_POD;
    const pz = 2.9;
    S.push(cyl([4.6, yp, pz], [7.3, yp, pz + 0.06], 0.68, 0.1, 10, body)); // Spitze des Sensorbehälters
    S.push(cyl([-3.6, yp, pz], [4.6, yp, pz], 0.68, 0.68, 10, body));
    S.push(cyl([-3.6, yp, pz], [-6, yp, pz + 0.05], 0.68, 0.24, 10, body));
    const wb = 2.95 + droop(31.5);
    if (gear) S.push(box(-1.5, 0.1, side * 31.5 - 0.1, side * 31.5 + 0.1, wb - 0.4, wb + 0.05, dark, { only: 'iso' })); // Gleitkufe unter der Spitze
  }

  // Höhenleitwerke: klein und gerade, Spitzen in Teamfarbe
  const STAB = [[-14.6, 0.8], [-15.95, 6.6], [-18.6, 6.6], [-19.0, 0.8]];
  const TIP = [[-15.95, 6.6], [-16.35, 8.3], [-18.5, 8.3], [-18.6, 6.6]];
  for (const side of [-1, 1]) {
    const mir = (pl) => pl.map(([x, y]) => [x, y * side]);
    S.push(loft(mir(STAB), mir(inset(STAB, 0.22)), 3.12, 3.4, body));
    S.push(loft(mir(TIP), mir(inset(TIP, 0.18)), 3.13, 3.39, P.mark));
  }
  // Hohes Seitenleitwerk mit Spitze in Teamfarbe und dünner heller Kennung an beiden Seiten
  const fin = prX([[-10.6, 4.3], [-15.5, 11.4], [-18.15, 11.4], [-19.3, 4.0]], -0.3, 0.3, body);
  S.push(fin);
  S.push(fine(on(fin, prX([[-14.95, 10.6], [-15.5, 11.4], [-18.15, 11.4], [-18.05, 10.6]], -0.36, 0.36, P.mark, { noLine: true }))));
  // Kennung und Ruderspalt als dünne Platten je Seite, nicht aufgesetzt (on): mit der Mitte des Leitwerks plus Seitenversatz als
  // Tiefe liegt die ferne Platte hinter dem Leitwerk, die nahe davor (aufgesetzt schiene die ferne durch)
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? -0.36 : 0.3;
    for (const [x0, x1, za, zb, col] of [[-17.3, -14.3, 7.55, 7.85, ID], [-18.1, -17.85, 4.6, 10.45, dark]]) {
      const b = fine(box(x0, x1, y0, y0 + 0.06, za, zb, col, { noLine: true, only: 'iso' }));
      b.c = [fin.c[0], side * 0.33, fin.c[2]];
      S.push(b);
    }
  }

  if (gear) {
    // Tandemfahrwerk: Hauptfahrwerk hinter der Kanzel (Zwillingsräder), Spornräder unter dem Heck
    const twin = (x, y, r, w, n) => {
      for (const k of [-1, 1]) S.push(cyl([x, y + k * 0.08, r], [x, y + k * (0.08 + w), r], r, r, n, WHEEL));
    };
    S.push(cyl([7.2, 0, 1.5], [7.2, 0, 0.85], 0.22, 0.22, 4, METAL));
    twin(7.2, 0, 0.85, 0.7, 10);
    S.push(cyl([-14.3, 0, 2.0], [-14.3, 0, 0.5], 0.17, 0.17, 4, METAL));
    twin(-14.3, 0, 0.5, 0.38, 8);
    // Stützräder unter den Flügeln: Strebe mit kleinem Zwillingsrad
    for (const side of [-1, 1]) {
      const y = side * U2_POGO;
      S.push(cyl([-0.6, y, 2.95 + u2Droop(U2_POGO)], [-0.6, y, 0.5], 0.16, 0.16, 4, METAL));
      twin(-0.6, y, 0.48, 0.32, 8);
    }
  }
  return { S, nozzle: { x: -19.9, z: 3.15, sy: 0.6, sz: 0.6, len: 0.55, flame: U2_GLOW }, foot: [-19.9, 20.8, -32.5, 32.5] };
}

// ---------- Modelle: Soldaten ----------

/**
 * Soldat (Schütze, PAK-Schütze, Scharfschütze, Kommandeur) in Bild `frame`: 0 steht, 1–4 Gehbewegung (Beine und Arme schwingen).
 * Höhe gut 14 px, Weste in Teamfarbe, Helm mit Teamband.
 */
function soldier(P, o) {
  const S = [];
  const kind = o.kind;
  const ph = o.frame ? ((o.frame - 1) * Math.PI) / 2 : 0;
  const sw = o.frame ? Math.sin(ph) * 1.5 : 0;
  const uni = kind === 'sniper' ? '#5a5d3c' : '#5b6146';
  for (const side of [-1, 1]) {
    const k = side < 0 ? sw : -sw;
    S.push(cyl([0, side * 0.95, 6.4], [k, side * 0.95, 1.1], 0.78, 0.7, 4, uni)); // Bein
    S.push(box(k - 0.9, k + 1.5, side * 0.95 - 0.7, side * 0.95 + 0.7, 0, 1.1, BOOT)); // Stiefel
  }
  S.push(box(-1, 1, -1.85, 1.85, 5.8, 7.4, uni)); // Hüfte
  const vest = box(-1.25, 1.25, -2, 2, 7.2, 11, kind === 'sniper' ? mix(P.vest, '#5a5d3c', 0.5) : P.vest);
  S.push(vest);
  S.push(fine(on(vest, box(1.25, 1.4, -1.4, 1.4, 8, 9.4, mix(P.vest, '#000000', 0.25), { noLine: true })))); // Taschen
  S.push(box(-2.5, -1.25, -1.55, 1.55, 7.6, 10.6, kind === 'at' || kind === 'manpads' ? '#4b5034' : '#474c37')); // Rucksack
  S.push(cyl([0, 0, 11], [0, 0, 11.7], 0.6, 0.6, 6, SKIN)); // Hals
  S.push(ball([0.15, 0, 12.6], 1.15, 1.05, 1.25, SKIN, { n: 8, m: 5 }));
  if (kind === 'commander') {
    S.push(cyl([0, 0, 13.3], [0, 0, 13.9], 1.45, 1.45, 10, mix(P.mark, '#2a2a2a', 0.35))); // Barett
    S.push(cyl([-2, 1, 10.6], [-2, 1, 18], 0.14, 0.12, 4, '#1b1d1f')); // Funkantenne
  } else {
    const helmet = ball([0, 0, 12.9], 1.6, 1.5, 1.3, kind === 'sniper' ? '#4f5a35' : OLIVE, { n: 10, m: 3, half: true });
    S.push(helmet);
    S.push(fine(on(helmet, cyl([0, 0, 12.85], [0, 0, 13.35], 1.62, 1.55, 10, P.mark, { noLine: true })))); // Teamband
  }
  if (kind === 'sniper') {
    // Tarnanzug: Büschel auf Schultern, Rücken und Kopf
    const tufts = [[-1.4, -1.6, 10.6], [-1.4, 1.6, 10.4], [-2, 0, 11.2], [0.4, -2, 9.4], [0.4, 2, 9.6], [-1, 0, 13.6], [-2.6, -1, 8.6], [-2.6, 1.2, 9]];
    tufts.forEach(([x, y, z], i) => S.push(ball([x, y, z], 1.1, 1, 0.8, i % 3 ? '#5f6a3a' : '#6e6544', { n: 6, m: 3 })));
  }
  // Arme zur Waffe (gehend schwingt der freie Arm leicht mit)
  const hand = [3.4, 0.9, 9.2];
  const armSw = o.frame ? Math.sin(ph) * 0.6 : 0;
  S.push(cyl([0, -2.2, 10.4], [hand[0] - 1.2 + armSw, -0.6, hand[2] - 0.2], 0.55, 0.5, 4, uni));
  S.push(cyl([0, 2.2, 10.4], [hand[0] - 2.6 - armSw, hand[1] + 0.5, hand[2] - 0.6], 0.55, 0.5, 4, uni));
  if (kind === 'at' || kind === 'manpads') {
    S.push(cyl([-5, 1.6, 11.4], [5.5, 1.6, 11.9], 0.75, 0.75, 6, OLIVE)); // Rohr auf der Schulter
    S.push(cyl([5.5, 1.6, 11.9], [7.4, 1.6, 12], 1.05, 0.25, 6, '#6a6f4a')); // Gefechtskopf
    S.push(cyl([1, 1.6, 10.6], [1, 1.6, 11], 0.3, 0.3, 4, GUN));
  } else if (kind === 'sniper') {
    S.push(cyl([-1, 0.7, 9.4], [9.5, 0.4, 9.6], 0.3, 0.26, 4, GUN)); // langes Gewehr
    S.push(cyl([1.2, 0.7, 10.2], [4.2, 0.6, 10.2], 0.42, 0.42, 6, '#1c1e20')); // Zielfernrohr
  } else if (kind === 'commander') {
    S.push(cyl([0.5, 0.8, 9.2], [5, 0.6, 9.4], 0.32, 0.3, 4, GUN)); // Maschinenpistole
  } else if (kind === 'medic') {
    S.push(fine(box(1.3, 1.5, -1.4, 1.4, 8.6, 9.0, WHITE))); // weißes Kreuz auf der Brust (unbewaffnet)
    S.push(fine(box(1.3, 1.5, -0.5, 0.5, 7.9, 9.7, WHITE)));
  } else {
    S.push(cyl([-0.8, 0.8, 9], [6.6, 0.5, 9.4], 0.32, 0.28, 4, GUN)); // Gewehr
    S.push(fine(box(1.6, 2.6, 0.45, 1.1, 7.9, 9, GUN))); // Magazin
  }
  return { S, foot: [-1.6, 1.6, -1.6, 1.6], inf: true };
}

const MODELS = { tank, ifv, flak, sam, gepard, pzh, mlrs: pzh, truck, scout: truck, fobTruck, engineer, excavator, littlebird, gunship, transporter, f16, f22, su27, u2 };
const INFANTRY = { rifleman: 'rifleman', medic: 'medic', at: 'at', manpads: 'manpads', flamer: 'rifleman', mortarteam: 'rifleman', sniper: 'sniper', commander: 'commander' };
const TEAM_KEYS = ['b', 'r', 'n', 'd'];

const paintOf = (team) => (team === SHOWROOM ? DISPLAY : TEAM_PAINT[team] ?? NEUTRAL);
const SIZE = { tank: 1.12, pzh: 1.08 }; // schwere Fahrzeuge etwas größer, damit sie sich vom Schützenpanzer abheben

/** Modell um k vergrößern (Körper, Turmdrehpunkt, Grundfläche). */
function scaleModel(m, k) {
  for (const so of [...m.S, ...(m.turret?.S ?? [])]) {
    so.faces = so.faces.map((f) => f.map((p) => p.map((v) => v * k)));
    so.c = so.c.map((v) => v * k);
  }
  if (m.turret) m.turret.x *= k;
  if (m.foot) m.foot = m.foot.map((v) => v * k);
}

const models = new Map(); // Schlüssel → Modell (Körper und Maße); klein, bleibt
function modelOf(type, team, o = {}) {
  const key = `${type}|${team}|${o.frame ?? ''}|${o.missiles ?? ''}|${o.gear ? 1 : 0}`;
  let m = models.get(key);
  if (m) return m;
  const P = paintOf(team);
  m = INFANTRY[type] ? soldier(P, { kind: INFANTRY[type], frame: o.frame ?? 0 }) : MODELS[type]?.(P, o);
  if (!m) return null;
  if (SIZE[type]) scaleModel(m, SIZE[type]);
  models.set(key, m);
  return m;
}

// ---------- Bilder ----------

/** Bild holen; fehlt es (Zeitbudget), ein vorhandenes Nachbarbild nehmen (andere Richtung), sonst false. */
function getSprite(key, scale, bounds, paint, alts) {
  const e = sprite(key, scale, bounds, paint);
  if (e !== false) return e;
  for (const k of alts) {
    const a = peek(k, scale);
    if (a) return a;
  }
  return false;
}

const sectorOf = (a, n) => ((Math.round((a / TAU) * n) % n) + n) % n;
const ROT = [
  [1, 0, 0, 1],
  [0, -1, 1, 0],
  [-1, 0, 0, -1],
  [0, 1, -1, 0],
]; // wie camera.js: gedrehte Achsen (u, v) aus Welt (x, y)
/** Blickwinkel im gedrehten Iso-Bild (Drehung der Kamera abgezogen). */
function viewAngle(cam, a) {
  const [ra, rb, rc, rd] = ROT[cam.rot | 0] ?? ROT[0];
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Math.atan2(rc * c + rd * s, ra * c + rb * s);
}

function nearKeys(make, sec, n) {
  const out = [];
  for (let d = 1; d <= n / 2; d++) out.push(make((sec + d) % n), make((sec - d + n) % n));
  return out;
}

/** Zustand, der das Bild ändert: Gehbewegung, Raketen und Fahrwerk der F-16, Su-27 und F-22, Fahrwerk der U-2. */
function lookOf(u, now) {
  if (INFANTRY[u.type]) return { frame: (u.speedNow ?? 0) > 3 ? 1 + (Math.floor(now / 140 + u.id * 0.37) % 4) : 0 };
  if (u.type === 'f16' || u.type === 'su27') {
    // missiles = Luft-Luft-Raketen + 10 × Luft-Boden-Raketen (je 0 … 2), seit v5.41; die Su-27 wie die F-16 (gleiche Waffen)
    let aim = 0;
    let agm = 0;
    for (const w of u.weapons ?? []) {
      if (w.spec?.id === 'agm' || w.id === 'agm') agm += Math.min(2, w.rounds | 0);
      else aim += Math.min(2, w.rounds | 0);
    }
    return { missiles: Math.min(2, aim) + 10 * Math.min(2, agm), gear: jetGrounded(u) };
  }
  if (u.type === 'f22') {
    // Raketen innen: nur am Boden (Schächte offen) je Vorrat ein Bild, im Flug eines (Schächte zu): 8 Bilder je Team und Richtung
    if (!jetGrounded(u)) return { gear: false };
    let n = 0;
    for (const w of u.weapons ?? []) n += w.rounds | 0;
    return { missiles: Math.min(F22_MISSILES, n), gear: true };
  }
  if (u.type === 'u2') return { gear: jetGrounded(u) }; // keine Waffen: nur Boden (Fahrwerk, Stützräder, hängende Flügel) oder Flug
  return {};
}

// ---------- Iso ----------

/**
 * Einheit in Iso an Bildpunkt p (Boden), lift = Höhe über dem Boden. aim = Weltwinkel zum Ziel (Turm, Soldat) oder null.
 * Liefert false, wenn es kein Modell oder noch kein Bild gibt (dann zeichnet der Renderer den Ersatz).
 */
export function drawUnitIso(ctx, cam, u, p, aim = null, lift = 0, now = 0) {
  const look = lookOf(u, now);
  const m = modelOf(u.type, u.team, look);
  if (!m) return false;
  const z = cam.zoom;
  const dpr = spriteDpr();
  const f = z * ISO_SCALE;
  const n = m.inf ? INF_SECT : VEH_SECT;
  const face = m.inf && aim !== null && aim !== undefined ? aim : u.angle ?? 0;
  const va = viewAngle(cam, face);
  const sec = sectorOf(va, n);
  const tk = TEAM_KEYS[u.team] ?? 'n';
  const base = `ui|${u.type}|${tk}|${look.frame ?? ''}|${look.missiles ?? ''}|${look.gear ? 1 : 0}`;
  const make = (k) => `${base}|${k}`;
  const yaw = (k) => (k / n) * TAU;
  const e = getSprite(make(sec), f * dpr, boundsOf(m, m.S, yaw(sec), true), (c, s) => paintSolids(c, m.S, yaw(sec), { iso: true, s }), nearKeys(make, sec, n));
  if (!e) return false;
  const y = p.y - lift * z;
  const burn = m.nozzle && !u.parked && (u.jet?.phase === 'roll' || jetAlt(u) > 0.05);
  const away = Math.cos(yaw(sec)) + Math.sin(yaw(sec)) > 0; // Düse zeigt vom Betrachter weg: Flamme liegt hinter dem Rumpf
  if (burn && away) drawFlameIso(ctx, m, p.x, y, f, yaw(sec), now);
  blit(ctx, e, p.x, y, f);
  if (m.turret) {
    const ta = aim === null || aim === undefined ? va : viewAngle(cam, aim);
    const ts = sectorOf(ta, VEH_SECT);
    const hy = yaw(sec);
    const px = m.turret.x * Math.cos(hy);
    const py = m.turret.x * Math.sin(hy);
    const tx = p.x + (px - py) * K * f;
    const ty = y + (px + py) * K * 0.5 * f;
    const tkey = (k) => `ut|${u.type}|${tk}|${k}`;
    const te = getSprite(tkey(ts), f * dpr, boundsOf(m.turret, m.turret.S, yaw(ts), true), (c, s) => paintSolids(c, m.turret.S, yaw(ts), { iso: true, s }), nearKeys(tkey, ts, VEH_SECT));
    if (te) blit(ctx, te, tx, ty, f);
  }
  if (m.rotors) drawRotorsIso(ctx, m, u, p.x, y, f, yaw(sec), now);
  if (burn && !away) drawFlameIso(ctx, m, p.x, y, f, yaw(sec), now);
  return true;
}

/** Rotoren live: Scheibe (Unschärfe) und Blätter, im Iso-Bild als Ellipse. */
function drawRotorsIso(ctx, m, u, x, y, f, hy, now) {
  const spin = (now / 45 + u.id * 1.7) % TAU;
  const P = (a, b, h) => [x + (a - b) * K * f, y + ((a + b) * K * 0.5 - h) * f];
  const c = Math.cos(hy);
  const s = Math.sin(hy);
  ctx.save();
  for (const [i, r] of m.rotors.entries()) {
    const cx = r.x * c;
    const cy = r.x * s;
    const [hx, hz] = P(cx, cy, r.z);
    ctx.fillStyle = 'rgba(28,30,32,0.16)';
    ctx.beginPath();
    ctx.ellipse(hx, hz, r.r * f, r.r * 0.5 * f, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,32,34,0.75)';
    ctx.lineWidth = Math.max(1, 0.9 * f);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const sp = spin * (i % 2 ? -1 : 1);
    for (let k = 0; k < r.n; k++) {
      const a = sp + (k / r.n) * TAU;
      const [bx, by] = P(cx + Math.cos(a) * r.r, cy + Math.sin(a) * r.r, r.z);
      ctx.moveTo(hx, hz);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }
  if (m.tail) {
    const tx = m.tail.x * c;
    const ty = m.tail.x * s;
    const [qx, qy] = P(tx, ty, m.tail.z);
    ctx.fillStyle = 'rgba(28,30,32,0.28)';
    ctx.beginPath();
    ctx.ellipse(qx, qy, m.tail.r * f * Math.abs(c) * 0.8 + 0.6 * f, m.tail.r * f, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// Nachbrenner: äußere Flamme und heller Kern (halbe Breite, Anteil der Länge, Farbe). Je Düse eine Flamme: nozzle.ys = Querlagen
// der Düsen (F-16 eine in der Mitte, F-22 zwei), sy/sz = Breite/Höhe der Flamme (rechteckige Düsen der F-22 flacher), len = Anteil der
// Länge und flame = eigene Farben (U-2: schwacher Abgasschein statt Nachbrenner).
const NOZZLE_YS = [0];
const FLAME = [
  [1.5, 1, 'rgba(255,140,40,0.6)'],
  [0.8, 0.6, 'rgba(255,228,160,0.9)'],
];

/** Nachbrenner in Iso als Kegel (zwei gekreuzte Dreiecke) hinter der Düse. */
function drawFlameIso(ctx, m, x, y, f, hy, now) {
  const c = Math.cos(hy);
  const s = Math.sin(hy);
  const P = (a, b, h) => {
    const rx = a * c - b * s;
    const ry = a * s + b * c;
    return [x + (rx - ry) * K * f, y + ((rx + ry) * K * 0.5 - h) * f];
  };
  const { x: nx, z: nz, ys = NOZZLE_YS, sy = 1, sz = 1, len: lk = 1, flame = FLAME } = m.nozzle;
  const len = (6.5 + Math.sin(now / 40) * 0.9) * lk;
  ctx.save();
  for (const [w, l, col] of flame) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (const oy of ys) {
      const tip = P(nx - len * l, oy, nz);
      for (const [a, b] of [[P(nx, oy - w * sy, nz), P(nx, oy + w * sy, nz)], [P(nx, oy, nz - w * sz), P(nx, oy, nz + w * sz)]]) {
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(tip[0], tip[1]);
        ctx.closePath();
      }
    }
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Schatten in Iso: Umriss des Modells von oben, flach auf den Boden gelegt (Bodenpunkt p, auch unter fliegenden Einheiten).
 * Setzt danach den einfachen Bildschirm-Transform (dpr) zurück. false = kein Modell oder Bild (dann Ellipse).
 */
export function drawUnitShadowIso(ctx, cam, u, p, dpr, now = 0) {
  const look = lookOf(u, now);
  const m = modelOf(u.type, u.team, { ...look, frame: 0 });
  if (!m) return false;
  const tk = TEAM_KEYS[u.team] ?? 'n';
  const key = `uo|${u.type}|${tk}|${look.missiles ?? ''}|${look.gear ? 1 : 0}|sh`;
  const e = sprite(key, cam.zoom * ISO_SCALE * spriteDpr(), boundsOf(m, m.S, 0, false), (c, s) => paintSolids(c, m.S, 0, { iso: false, s, shadow: true }));
  if (!e) return false;
  const air = !!u.def?.air && !jetGrounded(u) && !u.parked;
  setIsoAt(ctx, cam, dpr, p.x, p.y, u.x, u.y, ISO_SCALE);
  ctx.translate(u.x, u.y);
  ctx.rotate(m.inf ? 0 : u.angle ?? 0);
  ctx.globalAlpha = air ? 0.2 : m.inf ? 0.26 : 0.32;
  blit(ctx, e, 0, 0, 1);
  ctx.globalAlpha = 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

// ---------- 2D von oben ----------

/**
 * Einheit von oben (2D), Weltkoordinaten (Transform des Renderers). aim = Weltwinkel zum Ziel oder null. alt = Flughöhe 0 … 1
 * (Schatten rückt ab). Liefert false ohne Modell oder Bild (dann zeichnet sprites.js den Ersatz).
 */
export function drawUnitTop(ctx, u, zoom, aim = null, now = 0) {
  const look = lookOf(u, now);
  const m = modelOf(u.type, u.team, { ...look, frame: 0 });
  if (!m) return false;
  const tk = TEAM_KEYS[u.team] ?? 'n';
  const base = `uo|${u.type}|${tk}|${look.missiles ?? ''}|${look.gear ? 1 : 0}`;
  const sc = zoom * spriteDpr();
  const hull = u.angle ?? 0;
  const face = m.inf && aim !== null && aim !== undefined ? aim : hull;
  const e = sprite(base, sc, boundsOf(m, m.S, 0, false), (c, s) => paintSolids(c, m.S, 0, { iso: false, s }));
  if (!e) return false;
  const sh = sprite(`${base}|sh`, sc, boundsOf(m, m.S, 0, false), (c, s) => paintSolids(c, m.S, 0, { iso: false, s, shadow: true }));
  const air = !!u.def?.air;
  const alt = u.def?.jet ? jetAlt(u) : air ? 1 : 0;
  const off = m.inf ? 1.2 : air ? 4 + 14 * alt : 2.6;
  const k = u.def?.jet ? 0.86 + 0.14 * alt : 1;
  ctx.save();
  ctx.translate(u.x, u.y);
  if (sh) {
    ctx.save();
    ctx.translate(off, off * 1.2);
    ctx.rotate(face);
    ctx.scale(k, k);
    ctx.globalAlpha = air ? 0.22 : 0.3;
    blit(ctx, sh, 0, 0, 1);
    ctx.restore();
  }
  ctx.rotate(face);
  ctx.scale(k, k);
  blit(ctx, e, 0, 0, 1);
  if (m.turret) {
    const te = sprite(`${base}|t`, sc, boundsOf(m.turret, m.turret.S, 0, false), (c, s) => paintSolids(c, m.turret.S, 0, { iso: false, s }));
    if (te) {
      ctx.translate(m.turret.x, 0);
      ctx.rotate(aim === null || aim === undefined ? 0 : aim - hull);
      blit(ctx, te, 0, 0, 1);
    }
  }
  ctx.restore();
  if (m.rotors) drawRotorsTop(ctx, m, u, face, k, now, zoom);
  if (m.nozzle && !u.parked && (u.jet?.phase === 'roll' || alt > 0.05)) {
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.rotate(face);
    ctx.scale(k, k);
    const { x: nx, ys = NOZZLE_YS, sy = 1, len: lk = 1, flame = FLAME } = m.nozzle;
    const len = (7 + Math.sin(now / 40) * 0.8) * lk;
    for (const [w, l, col] of flame) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (const oy of ys) {
        ctx.moveTo(nx, oy - w * sy);
        ctx.lineTo(nx - len * l, oy);
        ctx.lineTo(nx, oy + w * sy);
        ctx.closePath();
      }
      ctx.fill();
    }
    ctx.restore();
  }
  return true;
}

function drawRotorsTop(ctx, m, u, face, k, now, zoom) {
  const spin = (now / 45 + u.id * 1.7) % TAU;
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.rotate(face);
  ctx.scale(k, k);
  for (const [i, r] of m.rotors.entries()) {
    ctx.fillStyle = 'rgba(28,30,32,0.14)';
    ctx.beginPath();
    ctx.arc(r.x, 0, r.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(32,34,36,0.8)';
    ctx.lineWidth = Math.max(1 / zoom, 1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const sp = spin * (i % 2 ? -1 : 1);
    for (let j = 0; j < r.n; j++) {
      const a = sp + (j / r.n) * TAU;
      ctx.moveTo(r.x, 0);
      ctx.lineTo(r.x + Math.cos(a) * r.r, Math.sin(a) * r.r);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Wracks ----------

/** Wrack in Iso: verkohltes Modell (Wanne und Turm) am Boden. false = kein Modell. */
export function drawWreckIso(ctx, cam, w, p) {
  const wk = wreckOf(w.type);
  if (!wk) return false;
  const f = cam.zoom * ISO_SCALE;
  const sec = sectorOf(viewAngle(cam, w.angle ?? 0), VEH_SECT);
  const yaw = (sec / VEH_SECT) * TAU;
  const key = (k) => `uw|${w.type}|${k}`;
  const e = getSprite(key(sec), f * spriteDpr(), boundsOf(wk, wk.solids, yaw, true), (c, s) => paintSolids(c, wk.solids, yaw, { iso: true, s, charred: true }), nearKeys(key, sec, VEH_SECT));
  if (!e) return false;
  blit(ctx, e, p.x, p.y, f);
  return true;
}

/**
 * Wrack von oben (2D, seit v5.34): dasselbe verkohlte Modell wie in Iso, gedreht wie das Fahrzeug beim Abschuss, mit Schatten.
 * a = Deckkraft (Verblassen). false = kein Modell (dann die einfache Form aus fx.js).
 */
export function drawWreckTop(ctx, w, zoom, a = 1) {
  const wk = wreckOf(w.type);
  if (!wk) return false;
  const sc = zoom * spriteDpr();
  const bnd = boundsOf(wk, wk.solids, 0, false);
  const e = sprite(`uwo|${w.type}`, sc, bnd, (c, s) => paintSolids(c, wk.solids, 0, { iso: false, s, charred: true }));
  if (!e) return false;
  const sh = sprite(`uwo|${w.type}|sh`, sc, bnd, (c, s) => paintSolids(c, wk.solids, 0, { iso: false, s, shadow: true }));
  const ang = w.angle ?? 0;
  ctx.save();
  ctx.translate(w.x, w.y);
  if (sh) {
    ctx.save();
    ctx.translate(1.6, 2);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.3 * a;
    blit(ctx, sh, 0, 0, 1);
    ctx.restore();
  }
  ctx.rotate(ang);
  ctx.globalAlpha = a;
  blit(ctx, e, 0, 0, 1);
  ctx.restore();
  return true;
}

const shifted = new WeakMap();
function shift(so, dx) {
  let s = shifted.get(so);
  if (s) return s;
  s = { ...so, faces: so.faces.map((fc) => fc.map(([x, y, z]) => [x + dx, y, z])), c: [so.c[0] + dx, so.c[1], so.c[2]], on: undefined };
  shifted.set(so, s);
  if (so.on) s.on = shift(so.on, dx); // Aufsatz bleibt beim (verschobenen) Träger im Turm
  return s;
}
const wrecks = new Map(); // Art → { solids: Wanne und verschobener Turm, bnd } oder null (kein Fahrzeug)
function wreckOf(type) {
  if (wrecks.has(type)) return wrecks.get(type);
  const m = modelOf(type, 0, { missiles: 0, gear: true });
  const wk = !m || m.inf ? null : { solids: m.turret ? [...m.S, ...m.turret.S.map((so) => shift(so, m.turret.x))] : m.S };
  wrecks.set(type, wk);
  return wk;
}

/** Für Tests: alle Modelle bauen lassen (Körper, Maße), ohne zu malen. */
export function unitModelTypes() {
  return [...Object.keys(MODELS), ...Object.keys(INFANTRY)];
}
export { modelOf as unitModel, lookOf as unitLook };

/** Malwerkzeug für andere gemalte Modelle (Tiere und Felsen in nature.js, seit v5.28): Körper, Renderer, Bildgrenzen, Richtungen. */
export const PAINT = { solid, box, cyl, ball, loft, prX, prY, prZ, on, fine, paintSolids, boundsOf, getSprite, viewAngle, nearKeys, sectorOf, mix };

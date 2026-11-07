// Regierungsgebäude der Hauptstadt (PRD §9 „Isometrische Ansicht“; bis zum Regierungsviertel ein modernes Rathaus, seit v5.02):
// Die Haupt-FOB jedes Teams ist ein klassizistischer Kuppelbau, damit sie sich klar von allen anderen Gebäuden abhebt, auch weit
// herausgezoomt: Terrasse mit Freitreppen an allen vier Seiten, heller Hauptbau mit Rundbogenfenstern und Bannern in Teamfarbe,
// Säulenportikus mit Dreiecksgiebel an jeder Seite, Gesims und Balustrade, Fahnen an den Ecken, hoher Tambour mit Säulenkranz, weiße
// Kuppel mit goldenen Rippen und Laterne, darüber der Mast mit der großen Fahne. Ringsum liegt das Regierungsviertel (govquarter.js).
// Der Bau ist vierfach symmetrisch: Iso zeichnet für jede Drehung der Karte dasselbe Bild. Bilder je Maßstab über spritecache.js,
// unter Zoom 0,42 ohne Fenster, Säulen und Rippen.
// Nur Zeichnen (liest b.x, b.y, b.hp, b.maxHp und die Teamfarbe), keine Spielregeln; Fußabdruck bleibt die FOB (3 × 3 Kacheln = ±48).
import { G, poly, box, lit, FACE, DETAIL, OUTLINE, shade, tint, snowy, roofSnowOn, cyl, flagpole, parapet, circle, rectF, rectS, polyF, lineT } from './isokit.js';
import { sprite, blit, spriteDpr } from './spritecache.js';
import { setRoofSnow } from './season.js';

const MARBLE = '#f1ece1'; // Hauptbau
const TRIM = '#fbf8f1'; // Säulen, Gesims, Treppen
const TERRACE = '#e3dccd';
const LEAD = '#c3c8cc'; // Giebeldächer der Portiken (Blei)
const ROOF = '#aeb5bb'; // Dach des Hauptbaus hinter der Balustrade
const WINDOW = '#3c5a78';
const GOLD = '#e2b444';
const DOME = ['#ffffff', '#e6e9ec', '#a3adb6']; // Kuppel: Licht, Mitte, Schatten

/** Maße in Weltpixeln ab der Mitte; Höhen in Bildschirm-Pixeln bei Zoom 1 wie die anderen Gebäude. */
export const M = {
  pod: 38, podH: 4.4, // Terrasse
  body: 30, bodyH: 28, // Hauptbau
  corn: 31.4, cornH: 30.2, // Gesims
  atticH: 33.6, // Balustrade
  port: 38.5, portW: 15, colH: 26.5, // Portikus: bis 38,5 vor die Mitte (auf der Terrasse), halbe Breite 15, Säulen bis 26,5
  drum: 15.5, drumH: 52, ring: 17.2, ringH: 54.4, drum2: 14, drum2H: 58, // Tambour mit Säulenkranz, Ring, Attika
  dome: 14, tallDome: 1.32, // Kuppel ab drum2H: Umriss tallDome-mal so hoch wie der einer Halbkugel
  lantern: 3.4, mastH: 122, // Laterne und Fahnenmast (Spitze)
};
// Die Kuppel ist ein gestrecktes Rotationsellipsoid: Halbachse c senkrecht, damit ihr Umriss im Bild (Halbachse 1,118 · r bei einer
// Halbkugel) tallDome-mal so hoch wird: √(r²/4 + c²) = 1,118 · r · tallDome.
const DOME_C = M.dome * Math.sqrt(1.25 * M.tallDome ** 2 - 0.25);
/** Scheitel der Kuppel (≈ 77 Weltpixel), darauf die Laterne. */
export const DOME_TOP = M.drum2H + DOME_C;
const LANTERN_H = DOME_TOP + 8.6; // Oberkante der Laterne mit Ring

/** Säulenportikus mit Freitreppe und Dreiecksgiebel an der Seite (axis 'u'/'v', Richtung s = ±1). */
function portico(g, axis, s, color) {
  const { P } = g;
  const W = M.portW;
  // Rechteck in Achsen-Koordinaten (a entlang der Achse, b quer) als Quader
  const ab = (a0, a1, b0, b1, h0, h1, wall, top = wall) => {
    const [lo, hi] = s > 0 ? [a0, a1] : [-a1, -a0];
    if (axis === 'u') box(g, lo, hi, b0, b1, h0, h1, wall, top);
    else box(g, b0, b1, lo, hi, h0, h1, wall, top);
  };
  // Freitreppe: drei Stufen von der Terrasse herab
  ab(M.pod, M.pod + 3, -W - 3, W + 3, 0, M.podH * 0.67, TRIM);
  ab(M.pod + 3, M.pod + 6, -W - 4.5, W + 4.5, 0, M.podH * 0.34, TRIM);
  ab(M.pod + 6, M.pod + 9, -W - 6, W + 6, 0, 0.9, TRIM);
  // Säulen (sechs), hinten zuerst
  if (g.z >= DETAIL) {
    const a = s * (M.port - 2);
    const cols = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5].map((b) => (axis === 'u' ? [a, b] : [b, a]));
    cols.sort((p, q) => p[0] + p[1] - q[0] - q[1]);
    for (const [u, v] of cols) box(g, u - 1.3, u + 1.3, v - 1.3, v + 1.3, M.podH, M.colH, TRIM, TRIM, 'rgba(60,50,40,0.3)');
  } else ab(M.body, M.port, -W, W, M.podH, M.colH, shade(TRIM, 0.08));
  // Gebälk mit Fries in Teamfarbe, Giebel
  ab(M.body, M.port, -W - 0.5, W + 0.5, M.colH, M.colH + 3.4, TRIM);
  const h = M.colH + 3.4;
  const rh = 8;
  const [lo, hi] = s > 0 ? [M.body, M.port] : [-M.port, -M.body];
  const R = snowy(LEAD);
  if (axis === 'u') {
    poly(g, [P(lo, -W, h), P(hi, -W, h), P(hi, 0, h + rh), P(lo, 0, h + rh)], lit(R, 0, -rh, W));
    poly(g, [P(lo, 0, h + rh), P(hi, 0, h + rh), P(hi, W, h), P(lo, W, h)], lit(R, 0, rh, W));
    if (s > 0) {
      poly(g, [P(hi, -W, h), P(hi, W, h), P(hi, 0, h + rh)], lit(TRIM, ...FACE.e));
      tympanum(g, 'e', hi, h, rh, W, color);
    }
  } else {
    poly(g, [P(-W, lo, h), P(-W, hi, h), P(0, hi, h + rh), P(0, lo, h + rh)], lit(R, -rh, 0, W));
    poly(g, [P(0, lo, h + rh), P(0, hi, h + rh), P(W, hi, h), P(W, lo, h)], lit(R, rh, 0, W));
    if (s > 0) {
      poly(g, [P(-W, hi, h), P(W, hi, h), P(0, hi, h + rh)], lit(TRIM, ...FACE.s));
      tympanum(g, 's', hi, h, rh, W, color);
    }
  }
}

/** Giebelfeld: Rand und Wappenschild in Teamfarbe. */
function tympanum(g, face, plane, h, rh, W, color) {
  if (g.z < DETAIL) return;
  const { P } = g;
  const pt = face === 's' ? (a, hh) => P(a, plane + 0.2, hh) : (a, hh) => P(plane + 0.2, a, hh);
  poly(g, [pt(-W + 3, h + 0.8), pt(W - 3, h + 0.8), pt(0, h + rh - 1.6)], lit(shade(TRIM, 0.07), ...FACE[face]), 'rgba(60,50,40,0.3)');
  poly(g, [pt(-2, h + 1.4), pt(2, h + 1.4), pt(2, h + 4.4), pt(0, h + 5.6), pt(-2, h + 4.4)], lit(color, ...FACE[face]), 'rgba(0,0,0,0.35)');
}

/** Wand des Hauptbaus (sichtbare Seite): Rundbogenfenster in zwei Geschossen neben dem Portikus, Banner in Teamfarbe, Tür. */
function facade(g, face, color) {
  const { P, ctx, z } = g;
  const c = M.body + 0.15;
  const pt = face === 's' ? (a, h) => P(a, c, h) : (a, h) => P(c, a, h);
  const quad = (a0, a1, h0, h1, col) => poly(g, [pt(a0, h0), pt(a1, h0), pt(a1, h1), pt(a0, h1)], col, null);
  // Tür hinter dem Portikus
  quad(-3, 3, M.podH, M.podH + 9, lit('#5a4430', ...FACE[face]));
  if (z < DETAIL) return;
  const glass = lit(WINDOW, ...FACE[face]);
  for (const a of [-26.5, -19.5, 19.5, 26.5]) {
    for (const [h0, h1] of [[M.podH + 4, M.podH + 9.5], [M.podH + 13, M.podH + 18.5]]) {
      quad(a - 1.6, a + 1.6, h0, h1, glass);
      const [mx, my] = pt(a, h1);
      const [rx] = pt(a + 1.6, h1);
      const rr = Math.abs(rx - mx);
      ctx.beginPath();
      ctx.ellipse(mx, my - 0.2 * z, rr, rr * 1.3, 0, Math.PI, 0);
      ctx.fillStyle = glass;
      ctx.fill();
      quad(a - 2.1, a + 2.1, h0 - 0.9, h0, lit(TRIM, ...FACE[face])); // Sims
    }
  }
  for (const a of [-23, 23]) {
    quad(a - 1.5, a + 1.5, M.podH + 5, M.bodyH - 1.2, lit(color, ...FACE[face])); // Banner zwischen den Fenstern
    quad(a - 1.5, a + 1.5, M.podH + 5, M.podH + 6.2, lit(shade(color, 0.3), ...FACE[face]));
  }
  // Pilaster an den Ecken und Geschossgesims
  quad(-M.body, -M.body + 1.6, M.podH, M.bodyH, lit(TRIM, ...FACE[face]));
  quad(M.body - 1.6, M.body, M.podH, M.bodyH, lit(TRIM, ...FACE[face]));
  quad(-M.body, M.body, M.podH + 11, M.podH + 11.8, lit(TRIM, ...FACE[face]));
}

/** Tambour mit Säulenkranz: zurückgesetzte Wand, helle Säulen auf der vorderen Hälfte. */
function drum(g) {
  const { P, ctx, z } = g;
  cyl(g, 0, 0, M.drum - 1.6, M.atticH, M.drumH, '#d9d6cf', false);
  if (z >= DETAIL) {
    const [cx, y0] = P(0, 0, M.atticH);
    const [, y1] = P(0, 0, M.drumH);
    const R = M.drum * z;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const sx = Math.cos(a); // nach rechts im Bild
      const sy = Math.sin(a); // nach vorn
      if (sy < -0.05) continue; // Rückseite
      const x = cx + sx * R;
      const dy = (R / 2) * sy;
      const w = Math.max(0.5, R * 0.075 * Math.sqrt(Math.max(0, 1 - sx * sx)) + 0.35 * z);
      const grad = ctx.createLinearGradient(x - w, 0, x + w, 0);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, sx > 0.4 ? '#c9ccc9' : '#ece9e2');
      ctx.fillStyle = grad;
      ctx.fillRect(x - w, y1 + dy, w * 2, y0 - y1);
    }
  } else cyl(g, 0, 0, M.drum, M.atticH, M.drumH, TRIM, false);
  // Sockel und Ring
  cyl(g, 0, 0, M.drum + 0.6, M.atticH, M.atticH + 1.4, TRIM, false);
  cyl(g, 0, 0, M.ring, M.drumH, M.ringH, TRIM);
  cyl(g, 0, 0, M.drum2, M.ringH, M.drum2H, MARBLE);
  if (z >= DETAIL) {
    // kleine Fenster in der Attika des Tambours
    const [cx, ya] = P(0, 0, M.ringH);
    const [, yb] = P(0, 0, M.drum2H);
    const R = M.drum2 * z;
    ctx.fillStyle = WINDOW;
    for (let i = 0; i < 7; i++) {
      const t = -0.82 + (1.64 * i) / 6;
      const x = cx + t * R;
      const dy = (R / 2) * Math.sqrt(1 - t * t);
      const w = R * 0.07 * Math.sqrt(1 - t * t);
      ctx.fillRect(x - w, yb + dy + (ya - yb) * 0.25, w * 2, (ya - yb) * 0.5);
    }
  }
}

/** Kuppel: weiß, etwas höher als eine Halbkugel, mit goldenen Rippen. */
function domeShape(g) {
  const { P, ctx, z } = g;
  const r = M.dome;
  const T = M.tallDome;
  const [cx, cy] = P(0, 0, M.drum2H);
  const R = r * z;
  const C = roofSnowOn() ? ['#ffffff', '#eef1f4', '#b3bcc4'] : DOME;
  const grad = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.95, R * 0.08, cx - R * 0.1, cy - R * 0.45, R * 1.5);
  grad.addColorStop(0, C[0]);
  grad.addColorStop(0.5, C[1]);
  grad.addColorStop(1, C[2]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R / 2, 0, 0, Math.PI);
  ctx.ellipse(cx, cy, R, R * 1.118 * T, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
  if (z < DETAIL) return;
  // Rippen: Meridiane der vorderen Hälfte (Kuppel als gestreckte Halbkugel)
  ctx.strokeStyle = 'rgba(196,150,52,0.75)';
  ctx.lineWidth = Math.max(0.5, 0.75 * z);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
    if (Math.cos(a) + Math.sin(a) < -0.3) continue;
    ctx.beginPath();
    for (let j = 0; j <= 10; j++) {
      const f = (j / 10) * (Math.PI / 2);
      const [x, y] = P(r * Math.cos(a) * Math.cos(f), r * Math.sin(a) * Math.cos(f), M.drum2H + DOME_C * Math.sin(f));
      if (j) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  // Fensterreihe (Lukarnen) am Kuppelfuß
  ctx.fillStyle = 'rgba(70,95,120,0.8)';
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (Math.cos(a) + Math.sin(a) < 0.3) continue;
    const [x, y] = P(r * 0.93 * Math.cos(a), r * 0.93 * Math.sin(a), M.drum2H + 3.2);
    ctx.fillRect(x - 0.6 * z, y - 1.1 * z, 1.2 * z, 2.2 * z);
  }
}

/** Laterne auf der Kuppel mit goldener Haube und Mast mit großer Fahne in Teamfarbe. */
function lantern(g, color) {
  const { P, ctx, z } = g;
  const h0 = DOME_TOP - 1.2;
  cyl(g, 0, 0, M.lantern, h0, LANTERN_H - 1.1, TRIM);
  if (z >= DETAIL) {
    const [cx, y0] = P(0, 0, h0 + 1);
    const [, y1] = P(0, 0, LANTERN_H - 2);
    ctx.fillStyle = WINDOW;
    for (const t of [-0.5, 0, 0.5]) ctx.fillRect(cx + t * M.lantern * z - 0.45 * z, y1, 0.9 * z, y0 - y1);
  }
  cyl(g, 0, 0, M.lantern + 0.8, LANTERN_H - 1.1, LANTERN_H, TRIM);
  // goldene Haube
  const [cx, cy] = P(0, 0, LANTERN_H);
  const R = M.lantern * z;
  const gr = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.9, R * 0.1, cx, cy - R * 0.3, R * 1.4);
  gr.addColorStop(0, '#fff2bf');
  gr.addColorStop(0.5, GOLD);
  gr.addColorStop(1, '#9a7420');
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R / 2, 0, 0, Math.PI);
  ctx.ellipse(cx, cy, R, R * 1.4, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = gr;
  ctx.fill();
  // Mast mit Fahne
  const [mx, my0] = P(0, 0, LANTERN_H + 4);
  const [, my1] = P(0, 0, M.mastH);
  ctx.strokeStyle = '#dcdedb';
  ctx.lineWidth = Math.max(1, 1.5 * z);
  ctx.beginPath();
  ctx.moveTo(mx, my0);
  ctx.lineTo(mx, my1);
  ctx.stroke();
  const big = Math.max(1, 0.7 / (z / spriteDpr())); // weit herausgezoomt größer, damit die Hauptstadt erkennbar bleibt
  wave(ctx, mx, my1 + 1.5 * z, 20 * z * big, 12 * z * big, color);
  circle(ctx, mx, my1, Math.max(1, 1.5 * z), GOLD);
}

/** Wehende Fahne ab (x, y) nach rechts. */
function wave(ctx, x, y, w, h, color) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.22, x + w, y + h * 0.08);
  ctx.lineTo(x + w, y + h * 1.08);
  ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.78, x, y + h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** Balustrade auf dem Gesims (sichtbare Seiten): Sockel, Docken als Striche, Handlauf. */
function balustrade(g) {
  const { P } = g;
  const a = M.body;
  box(g, -a, a, -a, a, M.cornH, M.atticH, TRIM);
  parapet(g, -a, a, -a, a, M.atticH, TRIM, ROOF, 1.5);
  if (g.z < DETAIL) return;
  const dark = 'rgba(90,80,60,0.35)';
  g.ctx.lineWidth = Math.max(0.5, 0.6 * g.z);
  g.ctx.strokeStyle = dark;
  g.ctx.beginPath();
  for (let t = -a + 2; t < a - 1; t += 2.2) {
    for (const [p, q] of [[P(t, a, M.cornH + 0.9), P(t, a, M.atticH - 0.9)], [P(a, t, M.cornH + 0.9), P(a, t, M.atticH - 0.9)]]) {
      g.ctx.moveTo(p[0], p[1]);
      g.ctx.lineTo(q[0], q[1]);
    }
  }
  g.ctx.stroke();
}

/** Iso-Bild in Bildkoordinaten (Mitte im Ursprung). dmg = 0 … 1 (dunkler). */
function paintIso(g, color, dmg) {
  const { P } = g;
  const p = M.pod;
  // Schatten nach links unten
  g.ctx.beginPath();
  for (const [s, h] of [[M.body, M.bodyH], [M.drum, DOME_TOP]]) {
    const d = Math.min(26, h * 0.3);
    [P(-s, -s), P(s, -s), P(s, s + d), P(-s, s + d)].forEach(([x, y], i) => (i ? g.ctx.lineTo(x, y) : g.ctx.moveTo(x, y)));
    g.ctx.closePath();
  }
  g.ctx.fillStyle = 'rgba(0,0,0,0.18)';
  g.ctx.fill('nonzero');
  // Terrasse
  box(g, -p, p, -p, p, 0, M.podH, TERRACE, snowy(shade(TERRACE, 0.03)));
  // hintere Portiken (größtenteils verdeckt)
  portico(g, 'u', -1, color);
  portico(g, 'v', -1, color);
  // Hauptbau
  box(g, -M.body, M.body, -M.body, M.body, M.podH, M.bodyH, MARBLE);
  facade(g, 's', color);
  facade(g, 'e', color);
  box(g, -M.corn, M.corn, -M.corn, M.corn, M.bodyH, M.cornH, TRIM);
  balustrade(g);
  // Eckfahnen hinten, Tambour, Kuppel, Laterne, Eckfahnen seitlich
  const F = M.body - 3;
  flagpole(g, -F, -F, M.atticH, 14, color);
  drum(g);
  domeShape(g);
  lantern(g, color);
  flagpole(g, F, -F, M.atticH, 14, color);
  flagpole(g, -F, F, M.atticH, 14, color);
  // vordere Portiken, vordere Eckfahne
  portico(g, 'u', 1, color);
  portico(g, 'v', 1, color);
  flagpole(g, F, F, M.atticH, 14, color);
  if (dmg > 0) {
    const a = `rgba(0,0,0,${(dmg * 0.42).toFixed(2)})`;
    const q = (face, c, a0, a1, h0, h1) =>
      poly(g, face === 's' ? [P(a0, c, h0), P(a1, c, h0), P(a1, c, h1), P(a0, c, h1)] : [P(c, a0, h0), P(c, a1, h0), P(c, a1, h1), P(c, a0, h1)], a, null);
    for (const f of ['s', 'e']) {
      q(f, p, -p, p, 0, M.podH);
      q(f, M.body, -M.body, M.body, M.podH, M.atticH);
      q(f, M.port + 0.1, -M.portW, M.portW, M.podH, M.colH + 3.4);
    }
  }
}

const dmgOf = (b) => (b.maxHp > 0 && b.hp < b.maxHp ? Math.round((1 - Math.max(0, b.hp) / b.maxHp) * 8) / 8 : 0);

/**
 * Isometrisch: das Regierungsgebäude als Bild aus dem Zwischenspeicher, gleich für jede Drehung (vierfach symmetrisch).
 * b = Haupt-FOB (Mitte b.x, b.y), color = Teamfarbe. Schnee auf den Dächern folgt setRoofSnow (Renderer).
 */
export function drawCityHallIso(ctx, cam, b, color) {
  const winter = roofSnowOn();
  const dmg = dmgOf(b);
  const key = `ch|${color}|${winter ? 1 : 0}|${dmg}`;
  const paint = (c, s) => {
    const was = roofSnowOn();
    setRoofSnow(winter);
    paintIso(G(c, s), color, dmg);
    setRoofSnow(was);
  };
  const p = cam.worldToScreen(b.x, b.y);
  const dpr = spriteDpr();
  const e = sprite(key, cam.zoom * dpr, [-72, -(M.mastH + 4), 76, 42], paint);
  if (e === false) return;
  if (e) {
    blit(ctx, e, p.x, p.y, cam.zoom);
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1 / dpr, 1 / dpr);
  paint(ctx, cam.zoom * dpr);
  ctx.restore();
}

// ---------- 2D von oben ----------

/** Satteldach eines Portikus von oben (First entlang der Achse), Giebel außen. */
function porticoTop(c, ax, ay, winter) {
  const W = M.portW;
  const roof = winter ? '#e8edf1' : LEAD;
  const [x0, x1, y0, y1] = ax ? [Math.min(ax * M.body, ax * M.port), Math.max(ax * M.body, ax * M.port), -W, W] : [-W, W, Math.min(ay * M.body, ay * M.port), Math.max(ay * M.body, ay * M.port)];
  // Treppe
  const st = ax ? [Math.min(ax * M.pod, ax * (M.pod + 9)), Math.max(ax * M.pod, ax * (M.pod + 9)), -W - 6, W + 6] : [-W - 6, W + 6, Math.min(ay * M.pod, ay * (M.pod + 9)), Math.max(ay * M.pod, ay * (M.pod + 9))];
  rectF(c, st[0], st[2], st[1], st[3], TRIM);
  c.strokeStyle = 'rgba(120,110,90,0.4)';
  c.lineWidth = 0.4;
  c.beginPath();
  for (const d of [3, 6]) {
    if (ax) {
      c.moveTo(ax * (M.pod + d), -W - 6);
      c.lineTo(ax * (M.pod + d), W + 6);
    } else {
      c.moveTo(-W - 6, ay * (M.pod + d));
      c.lineTo(W + 6, ay * (M.pod + d));
    }
  }
  c.stroke();
  if (ax) {
    rectF(c, x0, y0, x1, 0, tint(roof, 0.1));
    rectF(c, x0, 0, x1, y1, shade(roof, 0.16));
  } else {
    rectF(c, x0, y0, 0, y1, tint(roof, 0.1));
    rectF(c, 0, y0, x1, y1, shade(roof, 0.16));
  }
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 0.5;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

function paintTop(c, color, winter, dmg, fine, big) {
  const p = M.pod;
  // Schatten nach rechts unten: Hauptbau kurz, Kuppel lang
  polyF(c, [[-M.body, -M.body], [M.body, -M.body], [M.body + 9, -M.body + 9], [M.body + 9, M.body + 9], [-M.body + 9, M.body + 9], [-M.body, M.body]], 'rgba(0,0,0,0.22)');
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath();
  c.arc(20, 20, M.drum, 0, Math.PI * 2);
  c.fill();
  lineT(c, [[0, 0], [34, 34]], 'rgba(0,0,0,0.25)', 3);
  // Terrasse, Portiken mit Treppen
  rectS(c, -p, -p, p, p, TERRACE, 'rgba(0,0,0,0.3)', 0.5);
  for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) porticoTop(c, ax, ay, winter);
  // Dach des Hauptbaus: Balustrade als Rand, Dachfläche
  rectS(c, -M.corn, -M.corn, M.corn, M.corn, TRIM, 'rgba(0,0,0,0.4)', 0.6);
  rectF(c, -M.body + 2, -M.body + 2, M.body - 2, M.body - 2, winter ? '#e9edf0' : ROOF);
  rectF(c, -M.body + 2, -M.body + 2, M.body - 2, -M.body + 3, 'rgba(0,0,0,0.15)');
  rectF(c, -M.body + 2, -M.body + 3, -M.body + 3, M.body - 2, 'rgba(0,0,0,0.15)');
  // Eckfahnen
  const F = M.body - 3;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    rectS(c, sx * F, sy * F - 4.5, sx * F + 7, sy * F - 0.5, color, 'rgba(0,0,0,0.35)', 0.4);
    circle(c, sx * F, sy * F, 1.2, '#6a6d6c');
  }
  // Tambour mit Säulenkranz, Kuppel, Laterne
  circle(c, 0, 0, M.ring, TRIM);
  if (fine) {
    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.5) / 16) * Math.PI * 2;
      circle(c, Math.cos(a) * (M.drum - 0.4), Math.sin(a) * (M.drum - 0.4), 0.9, '#d6d2c8');
    }
  }
  const R = M.dome;
  const gr = c.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
  gr.addColorStop(0, winter ? '#ffffff' : DOME[0]);
  gr.addColorStop(0.55, DOME[1]);
  gr.addColorStop(1, DOME[2]);
  circle(c, 0, 0, R, gr);
  if (fine) {
    c.strokeStyle = 'rgba(196,150,52,0.8)';
    c.lineWidth = 0.6;
    c.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      c.moveTo(Math.cos(a) * M.lantern, Math.sin(a) * M.lantern);
      c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    c.stroke();
  }
  circle(c, 0, 0, M.lantern + 0.8, TRIM);
  circle(c, 0, 0, M.lantern, GOLD);
  // Mast mit großer Fahne
  lineT(c, [[0, 0], [26, 26]], 'rgba(0,0,0,0.28)', 1);
  rectS(c, 1, -2 - 9 * big, 1 + 15 * big, -2, color, 'rgba(0,0,0,0.4)', 0.7);
  circle(c, 0, 0, 1.4, GOLD);
  if (dmg > 0) rectF(c, -p, -p, p, p, `rgba(0,0,0,${(dmg * 0.45).toFixed(2)})`);
}

/** 2D von oben (Weltkoordinaten, Kontext skaliert). Platz und Boden zeichnet govquarter.js darunter. */
export function drawCityHallTop(ctx, b, color, zoom = 1, season = 'summer') {
  const winter = season === 'winter';
  const dmg = dmgOf(b);
  const key = `cht|${color}|${winter ? 1 : 0}|${dmg}`;
  const paint = (c, s) => {
    c.scale(s, s);
    paintTop(c, color, winter, dmg, s >= DETAIL, Math.min(1.8, Math.max(1, 0.7 / (s / spriteDpr())))); // Fahne weit herausgezoomt größer
  };
  const e = sprite(key, zoom * spriteDpr(), [-50, -50, 62, 62], paint);
  if (e === false) return;
  if (e) {
    blit(ctx, e, b.x, b.y, 1);
    return;
  }
  ctx.save();
  ctx.translate(b.x, b.y);
  paint(ctx, 1);
  ctx.restore();
}

// Rathaus der Hauptstadt (seit v5.02, PRD §9): die Haupt-FOB jedes Teams als modernes Rathaus, damit sie sich klar von allen
// anderen Gebäuden abhebt, auch weit herausgezoomt: heller Platz mit Rand in Teamfarbe und vier Fahnenmasten, flacher Sockelbau
// mit Glas-Foyer, schlanker weißer Turm mit Glasfassade, Rathausuhr, Leuchtband in Teamfarbe, schwebendes Flachdach und Mast mit Fahne.
// Der Bau ist vierfach symmetrisch: die Iso-Ansicht zeichnet für jede Drehung der Karte dasselbe Bild (wie die Universität).
// Nur Zeichnen (liest b.x, b.y, b.hp, b.maxHp und die Teamfarbe), keine Spielregeln; Fußabdruck bleibt die FOB (3 × 3 Kacheln = ±48).
import { iso, poly, box, lit, FACE, DETAIL } from './university.js';
import { shade, tint } from './sprites.js';
import { snowy } from './season.js';

const WHITE = '#eef0ec'; // Sichtbeton, hell
const ROOF = '#c9ccc8'; // Flachdächer
const PAVE = '#d3cec2'; // Platz
const STEP = '#e2ddd2';
const GLASS = '#4683ab'; // Glasfassade des Turms
const LOBBY = '#2b4256'; // Foyer und Fensterband
const DARK = '#2a3036';
const OUTLINE = 'rgba(40,40,40,0.45)';

/** Maße in Weltpixeln ab der Mitte (Fußabdruck ±48). Höhen in Bildschirm-Pixeln bei Zoom 1 wie die anderen Gebäude. */
const M = {
  plaza: 47, plazaH: 2,
  pod: 33, podH: 27, lobby: 30, lobbyH: 12, canopy: 35, canopyH: 14.5, band: 24, // Sockelbau, Teamband ab 24
  tower: 19, glass: 16, glassH: [30, 76], clockH: 82, clockR: 6.5, ledH: [90, 96], bodyH: 100,
  hat: 23, hatH: [103, 107], mastH: 146, // Dachkante 107 = CAPITAL_H in iso.js (Lebensbalken, Klick aufs Dach)
  pole: 41, poleH: 40,
};

/** Viereck auf der sichtbaren Wand: 's' = Ebene v = c (links), 'e' = Ebene u = c (rechts); a entlang der Wand. */
function quad(g, face, c, a0, a1, h0, h1) {
  const { P } = g;
  return face === 's' ? [P(a0, c, h0), P(a1, c, h0), P(a1, c, h1), P(a0, c, h1)] : [P(c, a0, h0), P(c, a1, h0), P(c, a1, h1), P(c, a0, h1)];
}

/** Zeichnen in Wandkoordinaten (a nach rechts, h nach oben) auf einer sichtbaren Wand: setzt die Transformation. */
function onWall(g, face, c, fn) {
  const { ctx, P, z } = g;
  const k = Math.SQRT1_2 * z;
  const [ox, oy] = face === 's' ? P(0, c, 0) : P(c, 0, 0);
  ctx.save();
  ctx.transform(k, face === 's' ? k / 2 : -k / 2, 0, -z, ox, oy);
  fn(ctx);
  ctx.restore();
}

/** Glasfassade mit Spiegelung, weißen Lisenen und Geschosslinien. */
function curtain(g, face, c) {
  const { ctx, z } = g;
  const [h0, h1] = M.glassH;
  const a = M.glass;
  const q = quad(g, face, c + 0.2, -a, a, h0, h1);
  const base = lit(GLASS, ...FACE[face]);
  const gr = ctx.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]);
  gr.addColorStop(0, shade(base, 0.25));
  gr.addColorStop(0.48, tint(base, 0.32));
  gr.addColorStop(0.62, base);
  gr.addColorStop(1, shade(base, 0.18));
  poly(g, q, gr, OUTLINE);
  if (z < DETAIL) return;
  const fin = lit(WHITE, ...FACE[face]);
  for (let x = -a + 4; x < a - 1; x += 4) poly(g, quad(g, face, c + 0.4, x - 0.45, x + 0.45, h0, h1), fin, null); // Lisenen
  ctx.strokeStyle = 'rgba(230,240,245,0.35)';
  ctx.lineWidth = Math.max(0.5, 0.7 * z);
  ctx.beginPath();
  for (let h = h0 + 6.5; h < h1 - 1; h += 6.5) {
    const [p0, p1] = quad(g, face, c + 0.4, -a, a, h, h);
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
  }
  ctx.stroke();
}

/** Rathausuhr: Zifferblatt mit Strichen und Zeigern (zehn nach zehn). */
function clock(g, face, c) {
  const r = M.clockR;
  const hc = M.clockH;
  onWall(g, face, c + 0.3, (ctx) => {
    ctx.beginPath();
    ctx.arc(0, hc, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = DARK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, hc, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fbfaf2';
    ctx.fill();
    if (g.z < DETAIL) return;
    ctx.strokeStyle = DARK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const w = (i / 12) * Math.PI * 2;
      const r0 = i % 3 ? r * 0.8 : r * 0.68;
      ctx.moveTo(Math.sin(w) * r0, hc + Math.cos(w) * r0);
      ctx.lineTo(Math.sin(w) * r * 0.92, hc + Math.cos(w) * r * 0.92);
    }
    ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, hc);
    ctx.lineTo(-0.866 * r * 0.5, hc + 0.5 * r * 0.5); // Stundenzeiger auf 10
    ctx.moveTo(0, hc);
    ctx.lineTo(0.866 * r * 0.78, hc + 0.5 * r * 0.78); // Minutenzeiger auf 2
    ctx.stroke();
  });
}

/** Fahnenmast auf dem Platz mit Fahne in Teamfarbe. */
function flagpole(g, u, v, color) {
  const { ctx, P, z } = g;
  box(g, u - 1.5, u + 1.5, v - 1.5, v + 1.5, M.plazaH, M.plazaH + 1.5, STEP);
  const [x, y0] = P(u, v, M.plazaH + 1.5);
  const [, y1] = P(u, v, M.poleH);
  ctx.strokeStyle = '#d4d6d2';
  ctx.lineWidth = Math.max(1, 1.3 * z);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  wave(ctx, x, y1, 12 * z, 7.5 * z, color);
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

/** Eingang an einer sichtbaren Seite: Treppe und Vordach. */
function entrance(g, face) {
  const p = M.pod;
  const s = (a0, a1, d0, d1, h0, h1, col) => (face === 's' ? box(g, a0, a1, d0, d1, h0, h1, col) : box(g, d0, d1, a0, a1, h0, h1, col));
  s(-12, 12, p - 2, p + 9, M.plazaH, M.plazaH + 1.5, STEP);
  s(-10, 10, M.lobby, p + 7, M.lobbyH, M.lobbyH + 1.8, WHITE);
}

/**
 * Isometrisch, in einem Zug von hinten nach vorne. Gleiches Bild für jede Drehung der Karte (vierfach symmetrisch).
 * b = Haupt-FOB (Mitte b.x, b.y), color = Teamfarbe.
 */
export function drawCityHallIso(ctx, cam, b, color) {
  const g = iso(ctx, cam, b);
  const { P, z } = g;
  ctx.save();
  ctx.lineJoin = 'round';
  // Platz mit Rand in Teamfarbe
  const L = M.plaza;
  box(g, -L, L, -L, L, 0, M.plazaH, shade(PAVE, 0.1), snowy(PAVE));
  const H = M.plazaH;
  for (const q of [
    [P(-L, -L, H), P(L, -L, H), P(L - 3, -L + 3, H), P(-L + 3, -L + 3, H)],
    [P(L, -L, H), P(L, L, H), P(L - 3, L - 3, H), P(L - 3, -L + 3, H)],
    [P(L, L, H), P(-L, L, H), P(-L + 3, L - 3, H), P(L - 3, L - 3, H)],
    [P(-L, L, H), P(-L, -L, H), P(-L + 3, -L + 3, H), P(-L + 3, L - 3, H)],
  ]) poly(g, q, color, null);
  if (z >= DETAIL) {
    ctx.strokeStyle = 'rgba(90,80,60,0.18)';
    ctx.lineWidth = Math.max(0.5, 0.7 * z);
    ctx.beginPath();
    for (let a = -L + 11; a < L - 4; a += 11) {
      for (const [p0, p1] of [[P(a, -L + 3, H), P(a, L - 3, H)], [P(-L + 3, a, H), P(L - 3, a, H)]]) {
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
      }
    }
    ctx.stroke();
  }
  // Schatten von Turm und Sockel (nach links unten wie bei den anderen Gebäuden): Grundriss bis zum versetzten Grundriss, eine Fläche
  ctx.beginPath();
  for (const [s, h] of [[M.tower, M.hatH[1]], [M.pod, M.podH]]) {
    const d = (h * 0.35) / Math.SQRT1_2; // Versatz in Welt-v, entspricht h · 0,35 Bildschirm-Pixeln nach links
    [P(-s, -s, H), P(s, -s, H), P(s, s + d, H), P(-s, s + d, H)].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill('nonzero');
  // Fahnen hinten und seitlich
  const F = M.pole;
  flagpole(g, -F, -F, color);
  flagpole(g, F, -F, color);
  flagpole(g, -F, F, color);
  // Sockelbau: Glas-Foyer, Vordach, Obergeschoss mit Fensterband und Teamband
  box(g, -M.lobby, M.lobby, -M.lobby, M.lobby, H, M.lobbyH, LOBBY);
  box(g, -M.canopy, M.canopy, -M.canopy, M.canopy, M.lobbyH, M.canopyH, WHITE);
  const p = M.pod;
  box(g, -p, p, -p, p, M.canopyH, M.podH, WHITE, snowy(ROOF));
  for (const f of ['s', 'e']) {
    poly(g, quad(g, f, p + 0.2, -p + 3, p - 3, 17, 21.5), lit(LOBBY, ...FACE[f]), null);
    poly(g, quad(g, f, p + 0.3, -p, p, M.band, M.podH), lit(color, ...FACE[f]), OUTLINE);
    entrance(g, f);
  }
  // Turm: weißer Rahmen, Glasfassade, Uhr, Leuchtband, schwebendes Dach
  const t = M.tower;
  box(g, -t, t, -t, t, M.podH, M.bodyH, WHITE);
  for (const f of ['s', 'e']) {
    curtain(g, f, t);
    clock(g, f, t);
    const glow = tint(color, 0.3);
    poly(g, quad(g, f, t + 0.3, -t, t, M.ledH[0], M.ledH[1]), lit(glow, ...FACE[f]), OUTLINE);
  }
  box(g, -t + 3, t - 3, -t + 3, t - 3, M.bodyH, M.hatH[0], DARK);
  box(g, -M.hat, M.hat, -M.hat, M.hat, M.hatH[0], M.hatH[1], WHITE, snowy(WHITE));
  // Mast mit großer Fahne und rotem Licht
  const [mx, my0] = P(0, 0, M.hatH[1]);
  const [, my1] = P(0, 0, M.mastH);
  ctx.strokeStyle = '#dcdedb';
  ctx.lineWidth = Math.max(1, 1.6 * z);
  ctx.beginPath();
  ctx.moveTo(mx, my0);
  ctx.lineTo(mx, my1);
  ctx.stroke();
  wave(ctx, mx, my1 + 2 * z, 18 * z, 11 * z, color);
  ctx.fillStyle = '#ff5a48';
  ctx.beginPath();
  ctx.arc(mx, my1, Math.max(1, 1.6 * z), 0, Math.PI * 2);
  ctx.fill();
  // Fahne vorne
  flagpole(g, F, F, color);
  // Schaden: Sockel und Turm dunkler
  if (b.hp < b.maxHp) {
    const a = `rgba(0,0,0,${((1 - b.hp / b.maxHp) * 0.4).toFixed(2)})`;
    for (const f of ['s', 'e']) {
      poly(g, quad(g, f, p, -p, p, H, M.podH), a, null);
      poly(g, quad(g, f, t, -t, t, M.podH, M.bodyH), a, null);
    }
  }
  ctx.restore();
}

/**
 * 2D von oben (Weltkoordinaten, Kontext skaliert): Platz mit Teamrand und Fahnen, Sockeldach mit Oberlichtern,
 * langer Schatten des Turms, Turmdach mit Leuchtband, Glasdach und Mast.
 */
export function drawCityHallTop(ctx, b, color) {
  const { x, y } = b;
  const r = (u0, v0, u1, v1, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x + u0, y + v0, u1 - u0, v1 - v0);
  };
  const L = M.plaza;
  ctx.save();
  // Platz, Fugen, Rand in Teamfarbe
  r(-L, -L, L, L, snowy(PAVE));
  ctx.strokeStyle = 'rgba(90,80,60,0.18)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let a = -L + 11; a < L - 4; a += 11) {
    ctx.moveTo(x + a, y - L);
    ctx.lineTo(x + a, y + L);
    ctx.moveTo(x - L, y + a);
    ctx.lineTo(x + L, y + a);
  }
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x - L + 1.5, y - L + 1.5, L * 2 - 3, L * 2 - 3);
  // Schatten: Sockel kurz, Turm lang (nach rechts unten)
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  for (const [s, o] of [[M.pod, 5], [M.hat, 17]]) {
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y - s);
    ctx.lineTo(x + s + o, y - s + o);
    ctx.lineTo(x + s + o, y + s + o);
    ctx.lineTo(x - s + o, y + s + o);
    ctx.lineTo(x - s, y + s);
    ctx.closePath();
  }
  ctx.fill('nonzero');
  // Fahnenmasten an den Ecken
  const F = M.pole - 2;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = x + sx * F;
    const py = y + sy * F;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px, py, 7, 1.5); // Schatten des Masts
    ctx.fillStyle = color;
    ctx.fillRect(px - sx * 0.5 - (sx > 0 ? 7 : 0), py - sy * 2 - 2.5, 7, 5); // Fahne weht zur Mitte
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(px - sx * 0.5 - (sx > 0 ? 7 : 0), py - sy * 2 - 2.5, 7, 5);
    ctx.fillStyle = '#5b5f5c';
    ctx.beginPath();
    ctx.arc(px, py, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Eingänge (Treppe, Vordach) an allen vier Seiten
  const p = M.pod;
  for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const at = (d0, d1, w, fill) => (ax ? r(Math.min(ax * d0, ax * d1), -w, Math.max(ax * d0, ax * d1), w, fill) : r(-w, Math.min(ay * d0, ay * d1), w, Math.max(ay * d0, ay * d1), fill));
    at(p, p + 9, 12, STEP);
    at(p - 1, p + 7, 10, WHITE);
  }
  // Sockeldach: Brüstung, Dach, Oberlichter
  r(-p, -p, p, p, WHITE);
  r(-p + 2.5, -p + 2.5, p - 2.5, p - 2.5, snowy(ROOF));
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x - p, y - p, p * 2, p * 2);
  for (const s of [1, -1]) {
    r(-26, s > 0 ? 24 : -28, 26, s > 0 ? 28 : -24, LOBBY);
    r(s > 0 ? 24 : -28, -20, s > 0 ? 28 : -24, 20, LOBBY);
  }
  // Turmdach: schwebendes Dach, Leuchtband, Glasdach mit Raster
  const h = M.hat;
  r(-h, -h, h, h, snowy(WHITE));
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - h, y - h, h * 2, h * 2);
  ctx.strokeStyle = tint(color, 0.15);
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 16, y - 16, 32, 32);
  const gg = ctx.createLinearGradient(x - 12, y - 12, x + 12, y + 12);
  gg.addColorStop(0, tint(GLASS, 0.35));
  gg.addColorStop(0.5, GLASS);
  gg.addColorStop(1, shade(GLASS, 0.3));
  r(-12, -12, 12, 12, gg);
  ctx.strokeStyle = 'rgba(235,245,250,0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const a of [-6, 0, 6]) {
    ctx.moveTo(x + a, y - 12);
    ctx.lineTo(x + a, y + 12);
    ctx.moveTo(x - 12, y + a);
    ctx.lineTo(x + 12, y + a);
  }
  ctx.stroke();
  // Mast mit Fahne
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x, y, 22, 2); // Schatten des Masts
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y - 10, 13, 8);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x + 1, y - 10, 13, 8);
  ctx.fillStyle = '#ff5a48';
  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Schaden: dunkler
  if (b.hp < b.maxHp) {
    ctx.fillStyle = `rgba(0,0,0,${((1 - b.hp / b.maxHp) * 0.45).toFixed(2)})`;
    ctx.fillRect(x - p, y - p, p * 2, p * 2);
  }
  ctx.restore();
}

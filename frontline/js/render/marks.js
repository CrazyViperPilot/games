// Anzeigen auf der Karte gemalt (seit v5.50, Daniels Wunsch „die Anzeigen auf der Karte schöner gestalten, genau so wie zuletzt alle
// Welt-Grafiken neu gemalt wurden“): Auswahlring, Hover, Auswahlrahmen und die übrigen Markierungen waren flache Linien und Rechtecke.
// Jetzt haben sie einen dunklen Saum (lesbar auf Gras, Sand, Schnee, Wasser und bei Nacht), einen hellen Kern und kräftige Eckmarken.
// Was oft vorkommt (Ringe unter 100 gewählten Einheiten), wird je Größe und Maßstab einmal in ein Bild gemalt (spritecache.js) und dann
// nur kopiert: kein Verlauf und keine Schatten-Unschärfe je Einheit und Bild. Bodenmarken werden in Weltkoordinaten gezeichnet; der
// Aufrufer setzt vorher die Bodenebene (Iso: setIsoGround/groundAt, 2D: Weltmaßstab), damit sie jeder Drehung und dem Gelände folgen.
// Nur Bild: wer was sieht und was gewählt ist, entscheidet weiter der Renderer.
import { sprite, blit, spriteDpr } from './spritecache.js';
import { BALANCE } from '../data/balance.js';

const TILE = BALANCE.map.tile;

const TAU = Math.PI * 2;
const HALO = 'rgba(8,12,10,0.6)'; // dunkler Saum unter jeder hellen Linie
const HALO_SOFT = 'rgba(8,12,10,0.38)';
const SEL = '#f4f7f2'; // gewählt: fast weiß wie bisher
const SEL_FILL = 'rgba(255,255,255,0.09)';
const HOVER = 'rgba(244,247,242,0.62)'; // überfahren: halb durchsichtig wie bisher
const GOLD = '#c9a227'; // Akzent (Auswahlrahmen)
const GOLD_HI = '#ffe08a';
const ISO_THICK = 1.45; // Iso: der Boden ist gestaucht, Linien darum etwas dicker, damit sie oben und unten nicht dünn werden

/** Weltlänge eines Bildschirmpixels für ein Bild mit s Gerätepixeln je Einheit. */
const pxOf = (s) => spriteDpr() / s;

/** Ring mit dunklem Saum, hellem Kern und vier Eckbögen (gewählt) bzw. zwölf Strichen (überfahren). r in Welt-px. */
function paintRing(c, s, r, hover, iso) {
  const p = pxOf(s) * (iso ? ISO_THICK : 1);
  if (!hover) {
    c.fillStyle = SEL_FILL;
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.fill();
  }
  const arcs = (n, len, off) => {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      c.moveTo(Math.cos(a - len / 2) * r, Math.sin(a - len / 2) * r);
      c.arc(0, 0, r, a - len / 2, a + len / 2);
    }
  };
  if (hover) {
    arcs(12, (TAU / 12) * 0.55, 0);
    c.strokeStyle = HALO_SOFT;
    c.lineWidth = 3.4 * p;
    c.stroke();
    c.strokeStyle = HOVER;
    c.lineWidth = 1.6 * p;
    c.stroke();
    return;
  }
  // ganzer Ring
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.strokeStyle = HALO;
  c.lineWidth = 3.6 * p;
  c.stroke();
  c.strokeStyle = SEL;
  c.lineWidth = 1.3 * p;
  c.stroke();
  // vier kräftige Eckbögen auf den Diagonalen (Iso: oben, unten, links, rechts)
  const len = Math.min(0.62, (9 * p) / r + 0.22);
  arcs(4, len, Math.PI / 4);
  c.strokeStyle = HALO;
  c.lineWidth = 5.2 * p;
  c.stroke();
  c.strokeStyle = SEL;
  c.lineWidth = 2.6 * p;
  c.stroke();
}

/** Rahmen um Gebäude und Häuser: Eckwinkel mit Saum, dazwischen eine feine Linie (gewählt) bzw. nur dünnere Eckwinkel (überfahren). */
function paintFrame(c, s, hw, hh, hover, iso) {
  const p = pxOf(s) * (iso ? ISO_THICK : 1);
  const L = Math.min(16 * p, hw * 0.55, hh * 0.55);
  const corners = () => {
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      c.moveTo(sx * hw, sy * (hh - L));
      c.lineTo(sx * hw, sy * hh);
      c.lineTo(sx * (hw - L), sy * hh);
    }
  };
  if (!hover) {
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(-hw, -hh, hw * 2, hh * 2);
    c.strokeStyle = HALO_SOFT;
    c.lineWidth = 3 * p;
    c.strokeRect(-hw, -hh, hw * 2, hh * 2);
    c.strokeStyle = 'rgba(244,247,242,0.7)';
    c.lineWidth = 1.1 * p;
    c.strokeRect(-hw, -hh, hw * 2, hh * 2);
  }
  corners();
  c.strokeStyle = hover ? HALO_SOFT : HALO;
  c.lineWidth = (hover ? 3.6 : 5.4) * p;
  c.stroke();
  c.strokeStyle = hover ? HOVER : SEL;
  c.lineWidth = (hover ? 1.7 : 2.8) * p;
  c.stroke();
}

const q = (x) => Math.round(x * 2) / 2; // Größen auf halbe Pixel: wenige Bildvarianten

/**
 * Auswahl- bzw. Hover-Markierung eines Objekts am Boden (seit v5.50). ctx steht auf der Bodenebene in Weltkoordinaten,
 * z = Zoom, scale = Gerätepixel je Welteinheit, iso = isometrische Ansicht. Einheiten und Kisten: Ring, Gebäude und Häuser: Rahmen.
 */
export function drawSelectMark(ctx, e, z, hover, iso, scale) {
  let key;
  let b;
  let paint;
  const m = 8 / z; // Rand fürs Bild (Saum und Linien)
  if (e.kind === 'unit' || e.kind === 'crate') {
    const r = q(e.kind === 'unit' ? e.def.radius + 4 : 15);
    key = `selR|${r}|${hover ? 1 : 0}|${iso ? 1 : 0}`;
    b = [-r - m, -r - m, r + m, r + m];
    paint = (c, s) => {
      c.scale(s, s);
      paintRing(c, s, r, hover, iso);
    };
  } else {
    const house = e.kind === 'house';
    const hw = q(house ? e.pw / 2 + 3 : (Math.max(e.w, e.h) * TILE) / 2 + 3);
    const hh = q(house ? e.ph / 2 + 3 : hw);
    key = `selF|${hw}|${hh}|${hover ? 1 : 0}|${iso ? 1 : 0}`;
    b = [-hw - m, -hh - m, hw + m, hh + m];
    paint = (c, s) => {
      c.scale(s, s);
      paintFrame(c, s, hw, hh, hover, iso);
    };
  }
  const img = sprite(key, scale, b, paint);
  if (img) {
    blit(ctx, img, e.x, e.y, 1);
    return;
  }
  if (img === false) return; // Budget dieses Bilds aufgebraucht: ein Bild lang ohne Ring
  // kein Canvas (Node-Tests): direkt malen
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(1 / scale, 1 / scale);
  paint(ctx, scale);
  ctx.restore();
}

/** Auswahlrahmen beim Aufziehen (Bildschirmkoordinaten, Transformation auf DPR): Fläche, Saum, Goldlinie, helle Eckwinkel. */
export function drawDragFrame(ctx, d) {
  const x = Math.min(d.x1, d.x2);
  const y = Math.min(d.y1, d.y2);
  const w = Math.abs(d.x2 - d.x1);
  const h = Math.abs(d.y2 - d.y1);
  if (!(w > 0 || h > 0)) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(201,162,39,0.1)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = HALO_SOFT;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  const L = Math.min(14, w / 3, h / 3);
  if (L >= 3) {
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]]) {
      ctx.moveTo(cx + 0.5, cy + 0.5 + sy * L);
      ctx.lineTo(cx + 0.5, cy + 0.5);
      ctx.lineTo(cx + 0.5 + sx * L, cy + 0.5);
    }
    ctx.strokeStyle = HALO;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = GOLD_HI;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Über den Einheiten (Gruppe 2, v5.52) ----------

const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const PLATE = 'rgba(10,12,10,0.84)'; // dunkle Platte unter jedem Balken
const TROUGH = '#3b4039'; // leerer Teil des Balkens
const SHINE = 'rgba(255,255,255,0.3)'; // Glanz oben auf der Füllung

/**
 * Balken mit dunkler Platte (1 Bildschirmpixel Rand), dunkelgrauem leerem Teil, Füllung mit Glanzkante und auf Wunsch Vierteln
 * (Lebensbalken). Weltmaße; px = Weltlänge eines Bildschirmpixels. Gestapelte Balken (Leben, Munition, Treibstoff) mit 1 px Abstand
 * ergeben eine gemeinsame Platte. Nur Rechtecke, keine Verläufe (viele Einheiten je Bild).
 */
export function drawGauge(ctx, x, y, w, h, frac, color, px = h / 3, ticks = false) {
  const f = clamp01(frac);
  ctx.fillStyle = PLATE;
  ctx.fillRect(x - px, y - px, w + 2 * px, h + 2 * px);
  const fw = w * f;
  if (f < 1) {
    ctx.fillStyle = TROUGH;
    ctx.fillRect(x + fw, y, w - fw, h);
  }
  if (fw > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = SHINE;
    ctx.fillRect(x, y, fw, h * 0.4);
  }
  if (ticks && w >= 20 * px) {
    ctx.fillStyle = 'rgba(10,12,10,0.5)';
    ctx.beginPath();
    for (let k = 1; k < 4; k++) ctx.rect(x + (w * k) / 4 - px * 0.5, y, px, h);
    ctx.fill();
  }
}

/** LKW-Ladung: ein Balken mit den Sorten nebeneinander (parts = [[Anteil 0..1, Farbe], …]), gleiche Platte und Glanz. */
export function drawCargoGauge(ctx, x, y, w, h, parts, px) {
  ctx.fillStyle = PLATE;
  ctx.fillRect(x - px, y - px, w + 2 * px, h + 2 * px);
  ctx.fillStyle = TROUGH;
  ctx.fillRect(x, y, w, h);
  let x0 = x;
  for (const [f, color] of parts) {
    const pw = w * clamp01(f);
    if (pw <= 0) continue;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y, Math.min(pw, x + w - x0), h);
    x0 += pw;
    if (x0 >= x + w) break;
  }
  if (x0 > x) {
    ctx.fillStyle = SHINE;
    ctx.fillRect(x, y, Math.min(x0, x + w) - x, h * 0.4);
  }
}

/** Kleines Zeichen in Bildschirmpixeln (einmal gemalt, Maßstab = Gerätepixel), mit Mittelpunkt bei Welt (x, y); z = Zoom. */
function icon(ctx, key, r, x, y, z, paint) {
  const dpr = spriteDpr();
  const e = sprite(key, dpr, [-r, -r, r, r], (c, s) => {
    c.scale(s, s);
    paint(c);
  });
  if (e) {
    blit(ctx, e, x, y, 1 / z);
    return;
  }
  if (e === false) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / z, 1 / z);
  paint(ctx);
  ctx.restore();
}

function starPath(c, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.46 : r;
    c.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  c.closePath();
}

/** Kommandeursstern: dunkler Saum, goldene Füllung, geschliffene Zacken (Licht von links oben), feiner Rand. r in Bildschirmpixeln. */
function paintStar(c, r) {
  c.lineJoin = 'round';
  starPath(c, r);
  c.strokeStyle = 'rgba(30,20,0,0.75)';
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = '#e0ac2a';
  c.fill();
  // je Zacke die dem Licht zugewandte Hälfte heller
  c.fillStyle = '#ffe489';
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const lit = (k) => Math.cos(a + (k * Math.PI) / 10 + (Math.PI * 3) / 4); // Lichtrichtung links oben
    const b = a + ((lit(-1) > lit(1) ? -1 : 1) * Math.PI) / 5; // Hälfte zur Lichtseite
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    c.lineTo(Math.cos(b) * r * 0.46, Math.sin(b) * r * 0.46);
    c.closePath();
  }
  c.fill();
  starPath(c, r);
  c.strokeStyle = '#7a5200';
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath();
  c.arc(-r * 0.12, -r * 0.18, Math.max(0.8, r * 0.12), 0, TAU);
  c.fill();
}

/** Kommandeursstern mit Mittelpunkt (x, y) in Welt, r = Radius in Weltmaßen, zoom = Zoom (seit v5.52 gemalt). */
export function drawStarMark(ctx, x, y, r, zoom = 1) {
  const z = zoom || 1;
  const rp = Math.round(r * z * 2) / 2;
  icon(ctx, `star|${rp}`, rp + 3, x, y, z, (c) => paintStar(c, rp));
}

/** Grünes Kreuz mit weißem Rand und dunklem Saum: wird geheilt oder repariert. Mitte (x, y) in Welt. */
export function drawCareMark(ctx, x, y, z) {
  icon(ctx, 'care', 8, x, y, z, (c) => {
    const a = 4.6;
    const t = 1.8;
    c.beginPath();
    c.moveTo(-t, -a);
    c.lineTo(t, -a);
    c.lineTo(t, -t);
    c.lineTo(a, -t);
    c.lineTo(a, t);
    c.lineTo(t, t);
    c.lineTo(t, a);
    c.lineTo(-t, a);
    c.lineTo(-t, t);
    c.lineTo(-a, t);
    c.lineTo(-a, -t);
    c.lineTo(-t, -t);
    c.closePath();
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(8,12,10,0.7)';
    c.lineWidth = 3.2;
    c.stroke();
    c.strokeStyle = '#f4fff6';
    c.lineWidth = 1.4;
    c.stroke();
    c.fillStyle = '#3fd46a';
    c.fill();
  });
}

/** Warnzeichen „ohne Munition“: rotes Dreieck mit dunklem Saum und weißem Ausrufezeichen. Mitte (x, y) in Welt. */
export function drawNoAmmoMark(ctx, x, y, z) {
  icon(ctx, 'noammo', 11, x, y, z, (c) => {
    const s = 7.6;
    c.beginPath();
    c.moveTo(0, -s);
    c.lineTo(s * 0.98, s * 0.72);
    c.lineTo(-s * 0.98, s * 0.72);
    c.closePath();
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(8,12,10,0.8)';
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = '#ff4d4d';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = '#ff4d4d';
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath();
    c.moveTo(0, -s);
    c.lineTo(-s * 0.98, s * 0.72);
    c.lineTo(0, s * 0.72);
    c.closePath();
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillRect(-0.95, -s * 0.42, 1.9, s * 0.62);
    c.beginPath();
    c.arc(0, s * 0.42, 1.1, 0, TAU);
    c.fill();
  });
}

// ---------- Befehle (Gruppe 3, v5.54) ----------

const MOVE = [150, 255, 180]; // Wegziel: hellgrün wie bisher

/**
 * Wegziel am Boden (Weltkoordinaten auf der Bodenebene): Ring mit dunklem Saum wächst und verblasst, vier Winkel laufen dabei zur
 * Mitte zusammen, in der Mitte ein Punkt. k = Alter 0..1 (MARKER_LIFE), z = Zoom.
 */
export function drawMoveRing(ctx, x, y, k, z, iso = false) {
  const a = 1 - k;
  if (!(a > 0)) return;
  const p = (iso ? ISO_THICK : 1) / z;
  const r = (6 + 10 * k) / z;
  const [R, Gc, B] = MOVE;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.strokeStyle = `rgba(8,12,10,${0.55 * a})`;
  ctx.lineWidth = 3.6 * p;
  ctx.stroke();
  ctx.strokeStyle = `rgba(${R},${Gc},${B},${a})`;
  ctx.lineWidth = 1.8 * p;
  ctx.stroke();
  // Winkel (Pfeilspitzen zur Mitte) auf den Diagonalen
  const d = (17 - 9 * k) / z;
  const s = 3.4 / z;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = Math.PI / 4 + (i * Math.PI) / 2;
    const cx = x + Math.cos(ang) * d;
    const cy = y + Math.sin(ang) * d;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    ctx.moveTo(cx + (ux - uy) * s, cy + (uy + ux) * s);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + (ux + uy) * s, cy + (uy - ux) * s);
  }
  ctx.strokeStyle = `rgba(8,12,10,${0.5 * a})`;
  ctx.lineWidth = 3.4 * p;
  ctx.stroke();
  ctx.strokeStyle = `rgba(${R},${Gc},${B},${a})`;
  ctx.lineWidth = 1.6 * p;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 2.2 / z, 0, TAU);
  ctx.fillStyle = `rgba(8,12,10,${0.5 * a})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 1.3 / z, 0, TAU);
  ctx.fillStyle = `rgba(${R},${Gc},${B},${a})`;
  ctx.fill();
  ctx.restore();
}

/** Formationsplatz am Boden: kleiner grüner Punkt mit dunklem Rand und hellem Kern (einmal gemalt), alpha = Deckkraft. */
export function drawSlotMark(ctx, x, y, z, alpha) {
  if (!(alpha > 0)) return;
  const old = typeof ctx.globalAlpha === 'number' ? ctx.globalAlpha : 1;
  ctx.globalAlpha = old * Math.min(1, alpha);
  icon(ctx, 'slot', 6, x, y, z, (c) => {
    c.beginPath();
    c.arc(0, 0, 3.4, 0, TAU);
    c.fillStyle = 'rgba(8,12,10,0.6)';
    c.fill();
    c.beginPath();
    c.arc(0, 0, 2.5, 0, TAU);
    c.fillStyle = 'rgb(150,255,180)';
    c.fill();
    c.beginPath();
    c.arc(-0.6, -0.6, 0.9, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fill();
  });
  ctx.globalAlpha = old;
}

/**
 * Linie mit dunklem Saum: der Aufrufer baut den Pfad (beginPath, moveTo/lineTo), hier wird er erst durchgehend dunkel und breit, dann
 * gestrichelt in der Farbe gezogen. w = Breite der Farblinie, dash = [Strich, Lücke], beides in Zeichenkoordinaten.
 */
export function strokeTrail(ctx, color, w, dash) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(8,12,10,0.42)';
  ctx.lineWidth = w * 2.3;
  ctx.stroke();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

/** Pfeilspitze am Boden: Spitze bei (x, y) in Richtung ang, Länge s; Füllung mit dunklem Rand (Breite px). */
export function drawArrowHead(ctx, x, y, ang, s, color, px) {
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - c * s * 1.5 + sn * s * 0.85, y - sn * s * 1.5 - c * s * 0.85);
  ctx.lineTo(x - c * s * 1.05, y - sn * s * 1.05);
  ctx.lineTo(x - c * s * 1.5 - sn * s * 0.85, y - sn * s * 1.5 + c * s * 0.85);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(8,12,10,0.6)';
  ctx.lineWidth = px * 2.4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Ring am Boden um einen Punkt (Anfang einer Route, Fuß des Sammelpunkts): dunkler Saum, farbiger Kern. r und px in Zeichenkoordinaten. */
export function drawFootRing(ctx, x, y, r, color, px) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = 'rgba(8,12,10,0.28)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(8,12,10,0.55)';
  ctx.lineWidth = px * 3.4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = px * 1.6;
  ctx.stroke();
  ctx.restore();
}

/**
 * Sammelpunkt-Fahne (einmal gemalt, Bildschirmpixel): Mast mit Knauf und ein goldener Wimpel mit Schwalbenschwanz und dunklem Saum.
 * Fußpunkt bei (x, y); f = Zeichenkoordinaten je Bildschirmpixel (2D: 1/Zoom, Iso aufrecht: 1).
 */
export function drawRallyFlag(ctx, x, y, f) {
  const dpr = spriteDpr();
  const e = sprite('rally', dpr, [-4, -22, 16, 3], (c, s) => {
    c.scale(s, s);
    paintFlag(c);
  });
  if (e) {
    blit(ctx, e, x, y, f);
    return;
  }
  if (e === false) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f, f);
  paintFlag(ctx);
  ctx.restore();
}

function paintFlag(c) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // Mast
  c.strokeStyle = 'rgba(8,12,10,0.7)';
  c.lineWidth = 3.2;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -19);
  c.stroke();
  c.strokeStyle = '#e9ece6';
  c.lineWidth = 1.4;
  c.stroke();
  // Wimpel mit Schwalbenschwanz
  c.beginPath();
  c.moveTo(0.6, -19);
  c.lineTo(12.5, -16.8);
  c.lineTo(9.2, -14.2);
  c.lineTo(12.5, -11.6);
  c.lineTo(0.6, -11);
  c.closePath();
  c.strokeStyle = 'rgba(8,12,10,0.7)';
  c.lineWidth = 2.4;
  c.stroke();
  c.fillStyle = GOLD;
  c.fill();
  c.fillStyle = 'rgba(255,240,180,0.55)'; // oberer Streifen heller
  c.beginPath();
  c.moveTo(0.6, -19);
  c.lineTo(12.5, -16.8);
  c.lineTo(11.2, -15.8);
  c.lineTo(0.6, -16.4);
  c.closePath();
  c.fill();
  // Knauf
  c.beginPath();
  c.arc(0, -19.6, 1.5, 0, TAU);
  c.fillStyle = GOLD_HI;
  c.fill();
  c.strokeStyle = 'rgba(8,12,10,0.7)';
  c.lineWidth = 0.8;
  c.stroke();
}

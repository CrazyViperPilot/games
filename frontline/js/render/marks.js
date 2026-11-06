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

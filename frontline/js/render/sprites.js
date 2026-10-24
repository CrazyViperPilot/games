// Prozedurale Zeichnung von oben (PLAN §5 render/sprites.js). Alle Funktionen zeichnen in Weltkoordinaten;
// der Renderer setzt die Kamera-Transformation. `zoom` dient nur dazu, Linien und Schrift bildschirmstabil zu halten.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';

const TILE = BALANCE.map.tile;
const OUTLINE = 'rgba(0,0,0,0.65)';
export const BUILD_ABBR = { fob: 'FOB', depot: 'HALLE', extractor: 'FÖR', mortar: 'MÖR', aa: 'FLA', helipad: 'HELI', drill: 'BOHR' };
export const NODE_COLOR = { bm: '#8b5a2b', mun: '#d9b600', fuel: '#3b2350' };
export const NODE_LABEL = { bm: 'BM', mun: 'MUN', fuel: 'TS' };
const WALL_GREY = '#8c9089';
const GATE_GREY = '#7d827b';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Farbe abdunkeln (f = 0 unverändert, 1 schwarz). */
export function shade(hex, f) {
  const [r, g, b] = rgbOf(hex).map((c) => Math.round(c * (1 - f)));
  return `rgb(${r},${g},${b})`;
}

/** Farbe aufhellen (f = 0 unverändert, 1 weiß). */
export function tint(hex, f) {
  const [r, g, b] = rgbOf(hex).map((c) => Math.round(c + (255 - c) * f));
  return `rgb(${r},${g},${b})`;
}

/** Hex-Farbe mit Alpha als rgba-String. */
export function hexA(hex, a) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Farbe für Lebensbalken: grün, gelb, rot. */
export function hpColor(frac) {
  return frac > 0.6 ? '#6fd16a' : frac > 0.3 ? '#e7c24a' : '#e5484d';
}

/** Text in Weltkoordinaten, Schriftgröße in Bildschirm-Pixeln (px), verkleinert bei Bedarf auf maxW. */
export function fitText(ctx, text, x, y, px, zoom, maxW = Infinity) {
  const z = zoom || 1;
  let size = px / z;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    size *= maxW / w;
    ctx.font = `700 ${size}px system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** Lebensbalken (Welt-Maße). frac 0..1. */
export function drawBar(ctx, x, y, w, h, frac, color) {
  const f = clamp(frac, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * f, h);
}

/**
 * Einheit von oben. u: Entity; color: Teamfarbe; aim: Zielwinkel (Turm/Waffe), sonst Fahrtrichtung.
 */
export function drawUnit(ctx, u, color, zoom = 1, aim = null, now = 0, iso = false) {
  const z = zoom || 1;
  const dark = shade(color, 0.45);
  const light = tint(color, 0.25);
  const hull = u.angle || 0;
  const turret = aim === null || aim === undefined ? 0 : aim - hull;
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1 / z;

  if (u.type === 'rifleman' || u.type === 'at') {
    const at = u.type === 'at';
    ctx.save();
    ctx.rotate(turret);
    ctx.fillStyle = '#2b2f2b';
    const len = at ? 12 : 9;
    ctx.fillRect(0, at ? -1.3 : -1, len, at ? 2.6 : 2);
    ctx.strokeRect(0, at ? -1.3 : -1, len, at ? 2.6 : 2);
    ctx.restore();
    ctx.fillStyle = at ? dark : color;
    ctx.beginPath();
    ctx.arc(0, 0, at ? 5 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(-1, -1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (u.def && u.def.air) {
    drawHeli(ctx, u, color, dark, light, hull, turret, now, z, iso);
  } else if (u.type === 'truck') {
    ctx.rotate(hull);
    ctx.fillStyle = dark;
    ctx.fillRect(-9, -6, 18, 12);
    ctx.strokeRect(-9, -6, 18, 12);
    ctx.fillStyle = light;
    ctx.fillRect(4, -5, 5, 10);
    ctx.strokeRect(4, -5, 5, 10);
  } else if (u.type === 'engineer') {
    // Baufahrzeug: Wanne mit Ketten, Kabine und Kran-Arm mit Schaufel nach vorn
    ctx.rotate(hull);
    ctx.fillStyle = '#23272a';
    ctx.fillRect(-9, -8, 17, 2.5);
    ctx.fillRect(-9, 5.5, 17, 2.5);
    ctx.fillStyle = dark;
    ctx.fillRect(-9, -6, 17, 12);
    ctx.strokeRect(-9, -6, 17, 12);
    ctx.fillStyle = light;
    ctx.fillRect(-4, -4, 6, 8);
    ctx.strokeRect(-4, -4, 6, 8);
    ctx.fillStyle = '#c9a227'; // Kran-Arm und Schaufel in Akzentgelb
    ctx.fillRect(2, -1, 11, 2);
    ctx.strokeRect(2, -1, 11, 2);
    ctx.fillRect(11, -4.5, 2.5, 9);
    ctx.strokeRect(11, -4.5, 2.5, 9);
  } else if (u.type === 'ifv' || u.type === 'tank') {
    const big = u.type === 'tank';
    const hl = big ? 14 : 12;
    const hw = big ? 9 : 7;
    ctx.rotate(hull);
    ctx.fillStyle = '#23272a';
    ctx.fillRect(-hl, -hw - 3, hl * 2, 3);
    ctx.fillRect(-hl, hw, hl * 2, 3);
    ctx.fillStyle = dark;
    ctx.fillRect(-hl + 1, -hw, hl * 2 - 2, hw * 2);
    ctx.strokeRect(-hl + 1, -hw, hl * 2 - 2, hw * 2);
    // Turm und Rohr folgen dem Ziel
    ctx.rotate(turret);
    ctx.fillStyle = '#2b2f2b';
    const barrel = big ? 20 : 13;
    const bw = big ? 3.2 : 2.4;
    ctx.fillRect(0, -bw / 2, barrel, bw);
    ctx.strokeRect(0, -bw / 2, barrel, bw);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, big ? 7 : 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, u.def ? u.def.radius : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Hubschrauber von oben: Schatten, Rumpf, Heckausleger, drehende Rotoren. */
function drawHeli(ctx, u, color, dark, light, hull, turret, now, z, iso = false) {
  const big = u.type === 'transporter';
  const gun = u.type === 'gunship';
  const len = big ? 24 : gun ? 20 : 15;
  const wid = big ? 7 : gun ? 5 : 6;
  // Schatten auf dem Boden (versetzt); in der isometrischen Ansicht zeichnet der Renderer ihn am Boden
  if (!iso) {
  ctx.save();
  ctx.translate(7, 9);
  ctx.rotate(hull);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.8, wid, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  }
  ctx.save();
  ctx.rotate(hull);
  ctx.fillStyle = dark;
  ctx.fillRect(-len, -1.2, len * 0.9, 2.4); // Heckausleger
  ctx.fillRect(-len, -4, 2, 8); // Heckrotor-Leitwerk
  if (gun) {
    ctx.fillRect(-3, -13, 7, 26); // Stummelflügel
    ctx.strokeRect(-3, -13, 7, 26);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.5, wid, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(len * 0.22, 0, len * 0.16, wid * 0.55, 0, 0, Math.PI * 2); // Kanzel
  ctx.fill();
  if (gun) {
    ctx.rotate(turret);
    ctx.fillStyle = '#2b2f2b';
    ctx.fillRect(len * 0.4, -0.9, 7, 1.8); // Bordkanone
  }
  ctx.restore();
  // Rotorkreuz dreht sich; Transporter mit zweitem Rotor hinten
  const spin = (now / 60 + u.id) % (Math.PI * 2);
  ctx.strokeStyle = 'rgba(235,240,235,0.75)';
  ctx.lineWidth = 1.6 / z;
  const rotor = (cx, cy, r) => {
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const a = spin + (k * Math.PI) / 2;
      ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
  };
  if (big) {
    const c = Math.cos(hull);
    const s = Math.sin(hull);
    rotor(c * 9, s * 9, 12);
    rotor(-c * 9, -s * 9, 12);
  } else {
    rotor(0, 0, gun ? 15 : 13);
  }
}

/**
 * Gebäude: fertig (Team-Plate mit Kürzel), im Bau (gestrichelt, Gerüst, Fortschrittsbalken),
 * Mauer (grauer Block), Tor (grauer Block mit Teamstreifen). Dunkelt sich mit Schaden ab,
 * Fertigungsbalken unter dem Gebäude.
 */
export function drawBuilding(ctx, b, color, zoom = 1) {
  const z = zoom || 1;
  const x0 = b.cx * TILE;
  const y0 = b.cy * TILE;
  const w = b.w * TILE;
  const h = b.h * TILE;
  const isWall = b.type === 'wall' || b.type === 'gate';
  ctx.save();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5 / z;

  if (!b.built) {
    // Baustelle: gestrichelter Rahmen, Gerüst, Fortschritt
    const base = isWall ? WALL_GREY : color;
    ctx.fillStyle = hexA(base, 0.22);
    ctx.fillRect(x0, y0, w, h);
    ctx.setLineDash([5 / z, 4 / z]);
    ctx.strokeStyle = hexA(base, 0.95);
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.setLineDash([]);
    ctx.strokeStyle = hexA(base, 0.5);
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + w, y0 + h);
    ctx.moveTo(x0 + w, y0);
    ctx.lineTo(x0, y0 + h);
    ctx.stroke();
    const bh = Math.max(3, 4 / z);
    const by = y0 + h - bh - 2 / z;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0 + 2, by, w - 4, bh);
    ctx.fillStyle = base;
    ctx.fillRect(x0 + 2, by, (w - 4) * clamp(b.progress || 0, 0, 1), bh);
    if (!isWall) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      fitText(ctx, BUILD_ABBR[b.type] || '', x0 + w / 2, y0 + h / 2 - bh, 10, z, w * 0.9);
    }
  } else if (b.type === 'wall') {
    ctx.fillStyle = WALL_GREY;
    ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.fillStyle = '#b3b7b0';
    ctx.fillRect(x0 + 2, y0 + 2, w - 4, Math.max(2, h * 0.14));
    ctx.fillStyle = '#5d615b';
    ctx.fillRect(x0 + 2, y0 + h - 2 - Math.max(2, h * 0.14), w - 4, Math.max(2, h * 0.14));
    ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
  } else if (b.type === 'gate') {
    ctx.fillStyle = GATE_GREY;
    ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.fillStyle = color;
    ctx.fillRect(x0 + 2, y0 + h / 2 - h * 0.14, w - 4, h * 0.28);
    ctx.fillStyle = '#5d615b';
    ctx.fillRect(x0 + 2, y0 + 2, 3, h - 4);
    ctx.fillRect(x0 + w - 5, y0 + 2, 3, h - 4);
    ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
  } else {
    ctx.fillStyle = shade(color, 0.5);
    ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.fillStyle = shade(color, 0.3);
    ctx.fillRect(x0 + 4, y0 + 4, w - 8, h - 8);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    fitText(ctx, BUILD_ABBR[b.type] || b.def.name, x0 + w / 2, y0 + h / 2, 11, z, w * 0.88);
    if (b.hp < b.maxHp) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - b.hp / b.maxHp) * 0.45})`;
      ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    }
    if (b.drill) {
      // Bohrer: Phase als Balken über dem Gebäude (aktiv grün und leerlaufend, bereit gelb, sonst grau und füllend)
      const d = b.drill;
      const frac = d.frac;
      const col = d.state === 'active' ? '#7fd36a' : d.state === 'ready' ? '#e8c43a' : '#8a8f88';
      const bh = Math.max(3, 4 / z);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x0, y0 - bh - 3 / z, w, bh);
      ctx.fillStyle = col;
      ctx.fillRect(x0, y0 - bh - 3 / z, w * clamp(frac, 0, 1), bh);
    }
    // Fertigungsfortschritt des ersten Auftrags
    if (b.queue && b.queue.length) {
      const bt = UNITS[b.queue[0].unit ?? b.queue[0]].buildTime;
      const frac = clamp(b.queueTime / bt, 0, 1);
      const bh = Math.max(3, 4 / z);
      const by = y0 + h + 3 / z;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x0, by, w, bh);
      ctx.fillStyle = '#7fd36a';
      ctx.fillRect(x0, by, w * frac, bh);
    }
  }
  ctx.restore();
}

/** Vorkommen: farbige Kuppe mit Kürzel; besetzt (Förderanlage) abgeblendet. */
export function drawNode(ctx, node, occupied = false, zoom = 1) {
  const z = zoom || 1;
  const col = NODE_COLOR[node.type] || '#888888';
  ctx.save();
  ctx.globalAlpha = occupied ? 0.4 : 1;
  ctx.fillStyle = 'rgba(15,15,12,0.55)';
  ctx.beginPath();
  ctx.arc(node.x + 1.5, node.y + 2, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2 / z;
  ctx.strokeStyle = node.type === 'fuel' ? '#9b6bd1' : 'rgba(0,0,0,0.55)';
  ctx.stroke();
  ctx.fillStyle = tint(col, 0.35);
  ctx.globalAlpha *= 0.5;
  ctx.beginPath();
  ctx.arc(node.x - 6, node.y - 6, 6, 0, Math.PI * 2);
  ctx.fill();
  if (!occupied) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    fitText(ctx, NODE_LABEL[node.type] || '', node.x, node.y, 11, z, 36);
  }
  ctx.restore();
}

/** Mörsergranate in der Luft: Spur vom Abschuss, Kopf, Markierung am Ziel. */
export function drawShell(ctx, s, zoom = 1) {
  const z = zoom || 1;
  const head = Math.max(3, 3.5 / z);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,190,80,0.55)';
  ctx.lineWidth = 1 / z;
  ctx.setLineDash([3 / z, 3 / z]);
  ctx.beginPath();
  ctx.arc(s.tx, s.ty, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,235,170,0.45)';
  ctx.lineWidth = Math.max(1, 1.5 / z);
  ctx.beginPath();
  ctx.moveTo(s.sx, s.sy);
  ctx.lineTo(s.x, s.y);
  ctx.stroke();
  ctx.fillStyle = '#ffe9a0';
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(s.x, s.y, head, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Effekt (game.effects): tracer (gelbe Spur), shell (Geschoss), explosion (orange Wolke),
 * intercept (weißer Ring), muzzle (Mündungsfeuer). Alpha und Größe aus t / life.
 */
export function drawEffect(ctx, e, zoom = 1) {
  const z = zoom || 1;
  const k = clamp(e.t / e.life, 0, 1);
  const a = 1 - k;
  ctx.save();
  switch (e.type) {
    case 'tracer': {
      ctx.strokeStyle = `rgba(255,226,120,${a})`;
      ctx.lineWidth = Math.max(1.2, 1.6 / z);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
      break;
    }
    case 'shell': {
      const x2 = e.x2 ?? e.x;
      const y2 = e.y2 ?? e.y;
      const hx = e.x + (x2 - e.x) * k;
      const hy = e.y + (y2 - e.y) * k;
      const tx = e.x + (x2 - e.x) * Math.max(0, k - 0.3);
      const ty = e.y + (y2 - e.y) * Math.max(0, k - 0.3);
      ctx.strokeStyle = `rgba(255,240,180,${0.6 * a})`;
      ctx.lineWidth = Math.max(1, 1.5 / z);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,230,140,${a})`;
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(2.5, 3 / z), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'explosion': {
      const R = 6 + 26 * k;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, R);
      g.addColorStop(0, `rgba(255,245,190,${a})`);
      g.addColorStop(0.35, `rgba(255,150,40,${0.9 * a})`);
      g.addColorStop(1, 'rgba(200,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, R, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'intercept': {
      ctx.strokeStyle = `rgba(190,235,255,${a})`;
      ctx.lineWidth = Math.max(1.2, 2 / z);
      ctx.beginPath();
      ctx.arc(e.x, e.y, 3 + 12 * k, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'muzzle': {
      ctx.fillStyle = `rgba(255,230,120,${a})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 3 + 3 * (1 - k), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

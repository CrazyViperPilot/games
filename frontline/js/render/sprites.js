// Prozedurale Zeichnung von oben (docs/verlauf.md §5 render/sprites.js). Alle Funktionen zeichnen in Weltkoordinaten;
// der Renderer setzt die Kamera-Transformation. `zoom` dient nur dazu, Linien und Schrift bildschirmstabil zu halten.
import { drawGauge, drawStarMark } from './marks.js';
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { jetAlt } from '../game/aircraft.js';
import { rgbOf } from './color.js';

const TILE = BALANCE.map.tile;
const OUTLINE = 'rgba(0,0,0,0.65)';
const GOLD = '#f2c94c';
/** Kürzel auf der Karte (kürzer und in Großbuchstaben, daher nicht `short` aus buildings.js, das die Befehlskarte nutzt). */
const BUILD_ABBR = { fob: 'FOB', mortar: 'MÖR', aa: 'FLA', tower: 'TURM', drill: 'BOHR', radio: 'MAST', phalanx: 'PHALANX' };
const WALL_GREY = '#8c9089';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));


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

/** Lebensbalken (Welt-Maße). frac 0..1; px = Weltlänge eines Bildschirmpixels, ticks = Viertel zeigen (gemalt seit v5.52, marks.js). */
export function drawBar(ctx, x, y, w, h, frac, color, px = h / 3, ticks = false) {
  drawGauge(ctx, x, y, w, h, frac, color, px, ticks);
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

  if (u.type === 'commander') {
    // Kommandeur: kurze Waffe, Körper mit goldenem Rand (Abzeichen), der Stern darüber kommt vom Renderer
    ctx.save();
    ctx.rotate(turret);
    ctx.fillStyle = '#2b2f2b';
    ctx.fillRect(0, -1, 7, 2);
    ctx.restore();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.6 / z;
    ctx.stroke();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(-1.2, -1.2, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (u.type === 'rifleman' || u.type === 'at') {
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
  } else if (u.type === 'gepard') {
    // Flakpanzer Gepard: breite Kettenwanne, Turm mit zwei langen 35-mm-Rohren seitlich und drehender Radarschüssel
    ctx.rotate(hull);
    ctx.fillStyle = '#23272a';
    ctx.fillRect(-12, -9, 24, 2.8);
    ctx.fillRect(-12, 6.2, 24, 2.8);
    ctx.fillStyle = dark;
    ctx.fillRect(-11, -6.5, 22, 13);
    ctx.strokeRect(-11, -6.5, 22, 13);
    ctx.rotate(turret);
    ctx.fillStyle = '#2b2f2b';
    for (const y of [-6.2, 4.8]) {
      ctx.fillRect(-1, y, 19, 1.4);
      ctx.strokeRect(-1, y, 19, 1.4);
    }
    ctx.fillStyle = color;
    ctx.fillRect(-6, -5, 11, 10);
    ctx.strokeRect(-6, -5, 11, 10);
    ctx.save();
    ctx.translate(-3, 0);
    ctx.rotate((now / 600) % (Math.PI * 2)); // Suchradar dreht sich
    ctx.fillStyle = light;
    ctx.fillRect(-1, -4.5, 2, 9);
    ctx.restore();
  } else if (u.type === 'pzh') {
    // Panzerhaubitze: lange Wanne, großer Turm hinten, sehr langes Rohr mit Mündungsbremse
    ctx.rotate(hull);
    ctx.fillStyle = '#23272a';
    ctx.fillRect(-13, -9, 26, 2.8);
    ctx.fillRect(-13, 6.2, 26, 2.8);
    ctx.fillStyle = dark;
    ctx.fillRect(-12, -6.5, 24, 13);
    ctx.strokeRect(-12, -6.5, 24, 13);
    ctx.translate(-3, 0);
    ctx.rotate(turret);
    ctx.fillStyle = '#2b2f2b';
    ctx.fillRect(2, -1.2, 24, 2.4);
    ctx.strokeRect(2, -1.2, 24, 2.4);
    ctx.fillRect(24, -2, 3, 4);
    ctx.fillStyle = color;
    ctx.fillRect(-7, -6, 13, 12);
    ctx.strokeRect(-7, -6, 13, 12);
    ctx.fillStyle = light;
    ctx.fillRect(-4, -3.5, 4, 2.5);
  } else if (u.type === 'flak' || u.type === 'sam') {
    // Flakpanzer: Wanne mit Ketten, zwei Rohre auf dem Turm. SAM: Wanne mit Startrampe, vier Raketenspitzen auf dem Turm
    ctx.rotate(hull);
    ctx.fillStyle = '#23272a';
    ctx.fillRect(-10, -8, 20, 2.5);
    ctx.fillRect(-10, 5.5, 20, 2.5);
    ctx.fillStyle = dark;
    ctx.fillRect(-9, -6, 18, 12);
    ctx.strokeRect(-9, -6, 18, 12);
    ctx.rotate(turret);
    ctx.fillStyle = u.type === 'flak' ? '#2b2f2b' : '#e9ece6';
    if (u.type === 'flak') {
      ctx.fillRect(0, -3, 14, 1.5);
      ctx.strokeRect(0, -3, 14, 1.5);
      ctx.fillRect(0, 1.5, 14, 1.5);
      ctx.strokeRect(0, 1.5, 14, 1.5);
    } else {
      ctx.fillRect(-3, -5, 10, 10);
      ctx.strokeRect(-3, -5, 10, 10);
      for (const y of [-3, 0, 3]) {
        ctx.beginPath();
        ctx.arc(8, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (u.def && u.def.jet) {
    drawJet(ctx, u, color, dark, light, hull, iso);
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
  } else if (u.type === 'fobTruck') {
    // FOB-Fahrzeug: langer Sattelzug mit Container (gelbe Streifen) und Antennenmast in Teamfarbe
    ctx.rotate(hull);
    ctx.fillStyle = '#23272a';
    ctx.fillRect(-13, -8, 26, 2);
    ctx.fillRect(-13, 6, 26, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(-13, -7, 19, 14);
    ctx.strokeRect(-13, -7, 19, 14);
    ctx.fillStyle = '#c9a227';
    for (const x of [-10, -4, 2]) ctx.fillRect(x, -7, 2, 14);
    ctx.fillStyle = light;
    ctx.fillRect(7, -6, 6, 12);
    ctx.strokeRect(7, -6, 6, 12);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-7, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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

/** Umriss einer F-16 von oben (Nase bei +x): Rumpf, Deltaflügel, Höhenleitwerk. */
const JET_BODY = [[17, 0], [11, -2], [3, -3], [-1, -13], [-5, -13], [-6, -3], [-11, -3], [-15, -8], [-17, -8], [-16, -2], [-18, -2], [-18, 2], [-16, 2], [-17, 8], [-15, 8], [-11, 3], [-6, 3], [-5, 13], [-1, 13], [3, 3], [11, 2]];

/** Kampfflugzeug von oben: Schatten (in der Luft weit versetzt, abgestellt dicht darunter), Umriss in Teamfarbe, Kanzel, Düse. */
function drawJet(ctx, u, color, dark, light, hull, iso = false) {
  const path = () => {
    ctx.beginPath();
    JET_BODY.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const alt = jetAlt(u); // 0 am Boden … 1 Reiseflughöhe: Schatten rückt mit der Höhe ab
  if (!iso) {
    ctx.save();
    const off = 3 + 13 * alt;
    ctx.translate(off, off * 1.2);
    ctx.rotate(hull);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    path();
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.rotate(hull);
  const k = 0.86 + 0.14 * alt; // am Boden etwas kleiner, steigend größer (näher an der Kamera)
  ctx.scale(k, k);
  ctx.fillStyle = color;
  path();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.fillRect(-18, -1.2, 4, 2.4); // Düse
  ctx.fillRect(-14, -0.6, 22, 1.2); // Rumpfrücken
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(8, 0, 3.6, 1.5, 0, 0, Math.PI * 2); // Kanzel
  ctx.fill();
  ctx.fillStyle = '#d8d8d0'; // Raketen unter den Flügelspitzen
  for (const w of u.weapons ?? []) {
    if (w.rounds >= 1) ctx.fillRect(-4, -13.5, 7, 1.4);
    if (w.rounds >= 2) ctx.fillRect(-4, 12.1, 7, 1.4);
  }
  if (!u.parked && (u.jet?.phase === 'roll' || alt > 0.05)) {
    ctx.fillStyle = 'rgba(255,170,60,0.85)'; // Nachbrenner (Startlauf und Flug, nicht beim Rollen)
    ctx.beginPath();
    ctx.moveTo(-18, -1.4);
    ctx.lineTo(-25, 0);
    ctx.lineTo(-18, 1.4);
    ctx.fill();
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
 * Fertigungsbalken unter dem Gebäude. pic = das Gebäude ist schon als Bild gemalt (milbuild.js, seit v5.21):
 * dann nur die Anzeigen darüber (Baufortschritt, Besatzung des Turms, Bohrer, Fertigung).
 */
export function drawBuilding(ctx, b, color, zoom = 1, pic = false) {
  const z = zoom || 1;
  const x0 = b.cx * TILE;
  const y0 = b.cy * TILE;
  const w = b.w * TILE;
  const h = b.h * TILE;
  const isWall = b.type === 'wall' || b.type === 'gate';
  ctx.save();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5 / z;

  if (!b.built && pic) {
    // Baustelle als Bild: nur Fortschritt und Kürzel
    const bh = Math.max(3, 4 / z);
    const by = y0 + h - bh - 2 / z;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0 + 2, by, w - 4, bh);
    ctx.fillStyle = color;
    ctx.fillRect(x0 + 2, by, (w - 4) * clamp(b.progress || 0, 0, 1), bh);
    if (!isWall) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      fitText(ctx, BUILD_ABBR[b.type] || '', x0 + w / 2, y0 + 8, 9, z, w * 0.9);
    }
  } else if (!b.built) {
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
      fitText(ctx, (b.main ? 'HAUPTSTADT' : BUILD_ABBR[b.type]) || '', x0 + w / 2, y0 + h / 2 - bh, 10, z, w * 0.9);
    }
  } else if (pic) {
    drawOverlays(ctx, b, x0, y0, w, h, z, true);
  } else {
    ctx.fillStyle = shade(color, 0.5);
    ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.fillStyle = shade(color, 0.3);
    ctx.fillRect(x0 + 4, y0 + 4, w - 8, h - 8);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    fitText(ctx, (b.main ? 'HAUPTSTADT' : BUILD_ABBR[b.type]) || b.def.name, x0 + w / 2, y0 + h / 2, 11, z, w * 0.88);
    if (b.hp < b.maxHp) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - b.hp / b.maxHp) * 0.45})`;
      ctx.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    }
    drawOverlays(ctx, b, x0, y0, w, h, z, false);
  }
  ctx.restore();
}

/** Anzeigen über einem fertigen Gebäude: Besatzung und Dachaufbau des Turms, Phase des Bohrers, Fertigungsbalken. */
function drawOverlays(ctx, b, x0, y0, w, h, z, pic) {
  if (b.type === 'tower') {
    // Gefechtsturm: Besatzung als Punkte, Dachaufbau als Kürzel (mit Bild nur, solange er gebaut wird)
    const cap = b.def.cap;
    for (let i = 0; i < cap; i++) {
      ctx.fillStyle = i < b.occupants.length ? '#f4f1d0' : 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(x0 + w / 2 + (i - (cap - 1) / 2) * 12, y0 + h - 9, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (pic) {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1 / z;
        ctx.stroke();
      }
    }
    const roof = pic ? (b.roof ? null : b.roofJob?.kind) : (b.roof ?? b.roofJob?.kind);
    if (roof) {
      ctx.fillStyle = b.roof ? '#ffd45a' : 'rgba(255,255,255,0.6)';
      fitText(ctx, BUILDINGS.tower.roofs[roof].short, x0 + w / 2, y0 + 11, 9, z, w * 0.8);
    }
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
  // Fertigungsfortschritt der laufenden Aufträge (je Ausbildungsplatz eine Leiste)
  if (b.queue && b.queue.length) {
    const bh = Math.max(3, 4 / z);
    const slots = Math.min(BALANCE.trainSlots, b.queue.length);
    for (let i = 0; i < slots; i++) {
      const bt = UNITS[b.queue[i].unit].buildTime;
      const frac = clamp(b.queueTimes[i] / bt, 0, 1);
      const by = y0 + h + 3 / z + i * (bh + 1 / z);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x0, by, w, bh);
      ctx.fillStyle = '#7fd36a';
      ctx.fillRect(x0, by, w * frac, bh);
    }
  }
}

export const CRATE_COLOR = '#66713c'; // Versorgungskiste: olivgrünes Holz
export const CRATE_MARK = '#e8b830'; // Markierung (Gurtschloss, Minimap)

/**
 * Versorgungskiste von oben: olivgrüne Kiste (Kantenlänge s) mit zwei Gurten und gelbem Schloss; glow = liegt am Boden
 * (pulsierender Schimmer, damit man sie findet).
 */
export function drawCrate(ctx, x, y, s = 16, zoom = 1, glow = 0) {
  const z = zoom || 1;
  const h = s / 2;
  ctx.save();
  if (glow > 0) {
    ctx.fillStyle = hexA(CRATE_MARK, 0.18 * glow);
    ctx.beginPath();
    ctx.arc(x, y, s * 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x - h + 2, y - h + 2.5, s, s);
  ctx.fillStyle = CRATE_COLOR;
  ctx.fillRect(x - h, y - h, s, s);
  ctx.fillStyle = tint(CRATE_COLOR, 0.18);
  ctx.fillRect(x - h + 2, y - h + 2, s - 4, s - 4);
  ctx.strokeStyle = shade(CRATE_COLOR, 0.45);
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.beginPath();
  ctx.moveTo(x - h * 0.4, y - h);
  ctx.lineTo(x - h * 0.4, y + h);
  ctx.moveTo(x + h * 0.4, y - h);
  ctx.lineTo(x + h * 0.4, y + h);
  ctx.stroke();
  ctx.fillStyle = CRATE_MARK;
  ctx.fillRect(x - s * 0.12, y - s * 0.12, s * 0.24, s * 0.24);
  ctx.lineWidth = 1.2 / z;
  ctx.strokeStyle = OUTLINE;
  ctx.strokeRect(x - h, y - h, s, s);
  ctx.restore();
}

/** Goldener Stern (Kommandeur) mit Mittelpunkt (x, y), Radius r (Welt-Maße); gemalt seit v5.52 (marks.js). */
export function drawStar(ctx, x, y, r, zoom = 1) {
  drawStarMark(ctx, x, y, r, zoom);
}

// Granaten, Effekte, Rauch, Feuer, Krater und Trümmer: fx.js (seit v5.34)

// ---- Tiere -------------------------------------------------------------------------------
const DEER = { body: '#8b5e34', dark: '#6e4827', belly: '#c9a77a', rump: '#efe5d2' };
const BOAR = { body: '#4b3c30', dark: '#33281f', snout: '#7a6152' };

/** Tier von oben (Weltkoordinaten, gedreht nach Laufrichtung): Reh mit hellem Spiegel, Wildschwein gedrungen mit Rüssel. */
export function drawAnimalTop(ctx, a, zoom = 1) {
  const z = zoom || 1;
  const deer = a.kind === 'deer';
  const bob = a.speed > 0 ? Math.sin(a.step * 0.35) * 0.5 : 0;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2, deer ? 8 : 7, deer ? 3.6 : 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8 / z;
  if (deer) {
    ctx.fillStyle = DEER.body;
    ctx.beginPath();
    ctx.ellipse(bob, 0, 7.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = DEER.dark;
    ctx.beginPath();
    ctx.ellipse(8.5 + bob, 0, 2.6, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(9 + bob, -2.6, 1.2, 1.2); // Ohren
    ctx.fillRect(9 + bob, 1.4, 1.2, 1.2);
    ctx.fillStyle = DEER.rump;
    ctx.beginPath();
    ctx.arc(-6.5 + bob, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = BOAR.body;
    ctx.beginPath();
    ctx.ellipse(bob, 0, 6.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BOAR.dark;
    ctx.fillRect(-5 + bob, -0.6, 9, 1.2); // Borstenkamm
    ctx.beginPath();
    ctx.moveTo(4.5 + bob, -3);
    ctx.lineTo(9.5 + bob, -1.2);
    ctx.lineTo(9.5 + bob, 1.2);
    ctx.lineTo(4.5 + bob, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = BOAR.snout;
    ctx.fillRect(9.2 + bob, -1, 1.4, 2);
  }
  ctx.restore();
}

/**
 * Tier in der Seitenansicht (isometrisch, Bildschirmkoordinaten): Fußpunkt (x, y), k = Maßstab (Zoom), right = Blick nach rechts.
 * Beine schwingen mit dem zurückgelegten Weg; Rehe mit Hals, Kopf und Ohren, Wildschweine tief und breit mit Rüssel.
 */
export function drawAnimalSide(ctx, a, x, y, k, right) {
  const deer = a.kind === 'deer';
  const run = a.speed > 60;
  const swing = a.speed > 0 ? Math.sin(a.step * (deer ? 0.28 : 0.4)) * (run ? 3.2 : 1.8) : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(right ? k : -k, k);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, deer ? 8 : 7, deer ? 2.4 : 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = 'round';
  if (deer) {
    const legTop = -8;
    ctx.strokeStyle = DEER.dark;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const [lx, ph] of [[-5, 1], [-3.5, -1], [4, -1], [5.5, 1]]) {
      ctx.moveTo(lx, legTop);
      ctx.lineTo(lx + swing * ph, 0);
    }
    ctx.stroke();
    ctx.fillStyle = DEER.body;
    ctx.beginPath();
    ctx.ellipse(0, -10, 7.5, 3.4, run ? -0.08 : 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DEER.belly;
    ctx.beginPath();
    ctx.ellipse(0, -8.2, 5.5, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DEER.rump;
    ctx.beginPath();
    ctx.ellipse(-6.9, -10, 1.1, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hals und Kopf (beim Grasen gesenkt)
    const graze = a.state === 'graze';
    const hx = graze ? 9.5 : 8.5;
    const hy = graze ? -5 : -17;
    ctx.strokeStyle = DEER.body;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(5.5, -11);
    ctx.lineTo(hx - 1, hy + 1.5);
    ctx.stroke();
    ctx.fillStyle = DEER.dark;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 2.6, 1.6, graze ? 0.6 : 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx - 1.5, hy - 1);
    ctx.lineTo(hx - 2.5, hy - 4);
    ctx.lineTo(hx - 0.5, hy - 1.5);
    ctx.fill();
  } else {
    ctx.strokeStyle = BOAR.dark;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (const [lx, ph] of [[-4, 1], [-2.5, -1], [3, -1], [4.5, 1]]) {
      ctx.moveTo(lx, -4);
      ctx.lineTo(lx + swing * ph * 0.7, 0);
    }
    ctx.stroke();
    ctx.fillStyle = BOAR.body;
    ctx.beginPath();
    ctx.ellipse(0, -6.5, 6.8, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d4a3a';
    ctx.beginPath();
    ctx.ellipse(-0.5, -5.2, 5, 2, 0, 0, Math.PI * 2); // hellere Flanke
    ctx.fill();
    ctx.fillStyle = BOAR.dark;
    ctx.beginPath();
    ctx.ellipse(-0.5, -9.9, 5.2, 0.9, 0, 0, Math.PI * 2); // Borstenkamm
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4.5, -9.5);
    ctx.lineTo(10, -5.5);
    ctx.lineTo(10, -3.2);
    ctx.lineTo(5, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = BOAR.snout;
    ctx.fillRect(9.6, -5.6, 1.3, 2.3);
    ctx.fillStyle = '#eee6d6';
    ctx.fillRect(8.4, -3.8, 1.6, 0.7); // Hauer
  }
  ctx.restore();
}

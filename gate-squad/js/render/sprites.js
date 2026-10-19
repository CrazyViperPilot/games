// Prozedurale Zeichenfunktionen (Top-Down, leicht schräg). Keine Bilddateien.
// Gegner werden je Typ und Laufphase einmal in Offscreen-Canvases vorgerendert (drawImage im
// Hotpath); Truppe, Boss, Tore, Kisten und Icons werden direkt gezeichnet (wenige Objekte).
// Maße in Welteinheiten; der Renderer setzt die Transformation. Keine Allokationen pro Aufruf
// (nur Pfade/Fills auf dem Context).

import { CFG } from '../config.js';
import { ATTACHMENTS } from '../data/attachments.js';
import { SPECIALISTS } from '../data/specialists.js';
import { BAL } from '../data/balance.js';

const TAU = Math.PI * 2;

const COL = {
  helmet: '#3d4a2c',
  vest: '#4b5a3a',
  legs: '#22261b',
  rifle: '#121411',
  patch: '#ff7a1a',
  muzzle: '#ffcf4a',
  muzzleCore: '#fff6d0',
  red: '#e04a3a',
  glass: '#1d2a33',
  glassHi: '#5b7d8f',
  dark: '#0b0d09',
  steelLo: '#15180f',
  steelHi: '#7b847c',
  enemyHelmet: '#3a3424',
  text: '#e8e6dc',
  good: '#4fb8ff',
  bad: '#e04a3a',
  orange: CFG.COLORS.orange,
};

const FALLBACK_ENEMY = { id: 'infantry', color: '#7d8a6a', radius: 9 };
const FALLBACK_BOSS = { id: 'boss_apc', color: '#7a7f4a' };

// Gewichtete Tarnflecken am Boss: [fx, fy, frx, fry, rot] relativ zu w/h.
const CAMO = [
  [-0.3, -0.22, 0.2, 0.12, 0.4],
  [0.22, 0.1, 0.24, 0.14, -0.3],
  [-0.12, 0.3, 0.18, 0.1, 0.2],
  [0.3, -0.36, 0.14, 0.09, 0.6],
  [0.02, -0.02, 0.12, 0.08, -0.7],
];

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Abgerundetes Rechteck als Pfad (Füllung/Stroke erfolgt beim Aufrufer).
function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

// Text mit dunkler Kontur (Schrift muss vom Aufrufer gesetzt sein).
function outlinedText(ctx, text, x, y, fill) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COL.dark;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------- Soldat

function soldierVest(ctx, x, y) {
  rr(ctx, x - 4.6, y - 1.2, 9.2, 6.2, 2.2);
}

// Mündungspunkt je Waffe relativ zur Soldatenmitte (Standard = Sturmgewehr).
const TIP = {
  rifle: [3, -8],
  smg: [3, -4.5],
  mg: [0.6, -11],
  sniper: [3.2, -12],
  demo: [3, -5],
  rpg: [4.5, -8],
};

// Waffe, die unter der Weste liegt (RPG wird danach auf die Schulter gelegt).
function drawWeaponBack(ctx, x, y, spec) {
  switch (spec) {
    case 'smg':
      ctx.strokeStyle = COL.rifle;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 2.4, y + 2);
      ctx.lineTo(x + 3, y - 4.5);
      ctx.stroke();
      ctx.fillStyle = '#56d6c8';
      ctx.fillRect(x + 2, y + 0.5, 1.6, 2.6);
      break;
    case 'mg':
      // Breites Gehäuse quer, Lauf nach oben, Munitionsgurt in Orange
      ctx.fillStyle = COL.dark;
      ctx.fillRect(x - 2, y - 3, 5.2, 3.4);
      ctx.strokeStyle = COL.rifle;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(x + 0.6, y - 3);
      ctx.lineTo(x + 0.6, y - 11);
      ctx.stroke();
      ctx.fillStyle = '#3a3f2a';
      ctx.fillRect(x - 3.6, y + 1, 2.4, 3.2);
      ctx.fillStyle = '#ffb347';
      for (let k = 0; k < 4; k++) ctx.fillRect(x - 3.1, y - 1.5 + k * 1.7, 1.2, 1.1);
      break;
    case 'sniper':
      // Langes Gewehr mit Zielfernrohr
      ctx.strokeStyle = COL.rifle;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 3);
      ctx.lineTo(x + 3.2, y - 12);
      ctx.stroke();
      ctx.fillStyle = COL.glass;
      ctx.fillRect(x + 1.6, y - 6, 2, 2.6);
      ctx.fillStyle = COL.glassHi;
      ctx.fillRect(x + 2, y - 5.6, 0.8, 0.8);
      break;
    case 'demo':
      // Pistole (Sprengmeister wirft C4)
      ctx.strokeStyle = COL.rifle;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 2.2, y + 1.5);
      ctx.lineTo(x + 3, y - 5);
      ctx.stroke();
      break;
    case 'rpg':
      break;
    default:
      // Sturmgewehr (Standard-Soldat und 'rifle')
      ctx.strokeStyle = COL.rifle;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x + 2.4, y + 2);
      ctx.lineTo(x + 3, y - 7);
      ctx.stroke();
  }
}

// Top-Down-Soldat (ca. 10×12), schaut nach oben (Gewehr zeigt Richtung Gegner).
// walkPhase: Animationsphase der Beine; muzzle 0..1 Mündungsfeuer; tint 0..1 roter Treffer-Blitz;
// specId: optional 'rifle'|'smg'|'mg'|'sniper'|'demo'|'rpg' (Spezialist mit Markierungspunkt).
export function drawSoldier(ctx, x, y, walkPhase, muzzle, tint, specId) {
  const s = Math.sin(walkPhase || 0) * 1.4;
  const spec = specId || '';
  const tip = TIP[spec] || TIP.rifle;
  const isMg = spec === 'mg';

  if (isMg) {
    // MG-Schütze ist etwas größer
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.15, 1.15);
    ctx.translate(-x, -y);
  }

  // Beine (wippen gegenläufig)
  ctx.fillStyle = COL.legs;
  ctx.fillRect(x - 3.4, y + 3.2 + s, 2.3, 4.2);
  ctx.fillRect(x + 1.1, y + 3.2 - s, 2.3, 4.2);

  // Rucksack mit Sprengstoff (hinter dem Körper)
  if (spec === 'demo') {
    ctx.fillStyle = '#2b3322';
    ctx.fillRect(x - 4, y + 2.6, 8, 4.6);
    ctx.fillStyle = '#ff6a3d';
    ctx.fillRect(x - 3.2, y + 3.4, 2.2, 3.4);
    ctx.fillStyle = '#e0452a';
    ctx.fillRect(x + 1, y + 3.4, 2.2, 3.4);
  }

  drawWeaponBack(ctx, x, y, spec);

  // Weste / Schultern
  soldierVest(ctx, x, y);
  ctx.fillStyle = COL.vest;
  ctx.fill();

  // Ghillie-Umhang (Scharfschütze)
  if (spec === 'sniper') {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#4f6b3c';
    ctx.beginPath();
    ctx.ellipse(x, y + 1.2, 6, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2e4026';
    ctx.fillRect(x - 4, y - 0.5, 1.6, 1.2);
    ctx.fillRect(x + 2, y + 2.6, 1.8, 1.2);
    ctx.fillRect(x - 2, y + 3.4, 1.4, 1.1);
    ctx.globalAlpha = 1;
  }

  // RPG-Rohr auf der Schulter mit Raketenkopf
  if (spec === 'rpg') {
    ctx.strokeStyle = '#3a4a2a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y + 2);
    ctx.lineTo(x + tip[0], y + tip[1]);
    ctx.stroke();
    ctx.fillStyle = COL.red;
    ctx.beginPath();
    ctx.arc(x + tip[0], y + tip[1], 1.8, 0, TAU);
    ctx.fill();
  }

  // Helm
  ctx.fillStyle = COL.helmet;
  ctx.beginPath();
  ctx.arc(x - 0.2, y - 2.6, 3.3, 0, TAU);
  ctx.fill();

  // Orangefarbener Schulterpatch
  ctx.fillStyle = COL.patch;
  ctx.fillRect(x - 4.2, y - 0.4, 1.7, 1.7);

  // Blaues Armband (Sturmgewehr-Spezialist)
  if (spec === 'rifle') {
    ctx.fillStyle = '#5aa0ff';
    ctx.fillRect(x - 4.8, y + 0.9, 1.6, 2.2);
  }

  // Mündungsfeuer
  if (muzzle > 0) {
    const m = Math.min(1, muzzle);
    const r = 1.6 + 2.6 * m;
    const mx = x + tip[0];
    const my = y + tip[1];
    ctx.globalAlpha = m;
    ctx.fillStyle = COL.muzzle;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL.muzzleCore;
    ctx.beginPath();
    ctx.arc(mx, my, r * 0.45, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Markierungspunkt des Spezialisten (Farbe je Typ) unter dem Soldaten
  if (spec) {
    const sp = SPECIALISTS[spec];
    ctx.fillStyle = sp ? sp.color : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y + 10.4, 1.9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Treffer-Blitz
  if (tint > 0) {
    ctx.globalAlpha = Math.min(1, tint) * 0.55;
    ctx.fillStyle = COL.red;
    soldierVest(ctx, x, y);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 0.2, y - 2.6, 3.3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (isMg) ctx.restore();
}

// Icon-Rakete (Körper oliv, Spitze rot, Flamme hinten). cx/cy = Mitte, s = Länge in Einheiten,
// ang = Winkel (Standard: nach oben rechts).
export function drawRocketIcon(ctx, cx, cy, s, ang) {
  const a = ang === undefined ? -Math.PI / 4 : ang;
  const k = s / 10;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = '#ff9a2a';
  ctx.beginPath();
  ctx.moveTo(-4 * k, -1.4 * k);
  ctx.lineTo(-7 * k, 0);
  ctx.lineTo(-4 * k, 1.4 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5f6b3e';
  ctx.fillRect(-4.6 * k, -2.8 * k, 1.8 * k, 5.6 * k);
  ctx.fillStyle = '#c7cfb0';
  ctx.fillRect(-4 * k, -1.6 * k, 7 * k, 3.2 * k);
  ctx.fillStyle = COL.red;
  ctx.beginPath();
  ctx.moveTo(3 * k, -1.6 * k);
  ctx.lineTo(6 * k, 0);
  ctx.lineTo(3 * k, 1.6 * k);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- Gegner (vorgerendert)

const SPR_BOX = 56; // Kantenlänge eines Gegner-Sprites in Welteinheiten (Mitte = Gegnerposition)
const SPR_HALF = SPR_BOX / 2;
const WALK_FRAMES = 4;
const SHIELD_STAGE_ALPHA = [1, 0.65, 0.35];

let _ppu = 1; // Pixel je Welteinheit, für die Sprite-Caches
const _enemyCache = new Map();

// Renderer ruft das bei jedem Resize auf. Ändert sich die Auflösung, werden alle Sprites neu gebaut.
export function setSpriteResolution(ppu) {
  if (!(ppu > 0) || ppu === _ppu) return;
  _ppu = ppu;
  _enemyCache.clear();
}

function newSpriteCanvas() {
  const px = Math.max(8, Math.ceil(SPR_BOX * _ppu));
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  const k = px / SPR_BOX;
  ctx.setTransform(k, 0, 0, k, px / 2, px / 2); // Ursprung = Gegnermitte
  return { c, ctx };
}

// Laufphase 0..3 aus e.walk (Sinus-Phase).
function walkFrame(walk) {
  const k = Math.floor((walk || 0) * (WALK_FRAMES / TAU));
  return ((k % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES;
}

// Schild-Zustand in 3 Stufen: 0 = voll, 1 = angeschlagen, 2 = kaputt.
function shieldStage(e) {
  const maxS = e.maxShield > 0 ? e.maxShield : 1;
  const ratio = clamp01(e.shield / maxS);
  return ratio >= 0.66 ? 0 : ratio >= 0.33 ? 1 : 2;
}

function hpBar(ctx, x, y, w, ratio) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - w / 2, y, w, 2.5);
  ctx.fillStyle = ratio > 0.5 ? CFG.COLORS.good : ratio > 0.25 ? CFG.COLORS.orange : CFG.COLORS.bad;
  ctx.fillRect(x - w / 2, y, w * clamp01(ratio), 2.5);
}

function drawInfantry(ctx, x, y, col, w) {
  // Beine (oben, Blick nach unten)
  ctx.fillStyle = COL.legs;
  ctx.fillRect(x - 3.2, y - 7 - w * 1.2, 2.2, 4);
  ctx.fillRect(x + 1.0, y - 7 + w * 1.2, 2.2, 4);

  // Gewehr zeigt nach unten
  ctx.strokeStyle = COL.rifle;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x - 2.4, y - 1);
  ctx.lineTo(x + 2.8, y + 8);
  ctx.stroke();

  // Weste
  rr(ctx, x - 4.5, y - 4.6, 9, 7, 2.2);
  ctx.fillStyle = col;
  ctx.fill();

  // Helm
  ctx.fillStyle = COL.enemyHelmet;
  ctx.beginPath();
  ctx.arc(x, y + 3, 3.3, 0, TAU);
  ctx.fill();
}

function drawRunner(ctx, x, y, col, w) {
  // Schnelle Beine
  ctx.strokeStyle = COL.legs;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 1.5, y - 4);
  ctx.lineTo(x - 1.5 + w * 2, y - 10);
  ctx.moveTo(x + 1.5, y - 4);
  ctx.lineTo(x + 1.5 - w * 2, y - 10);
  ctx.stroke();

  // Schmaler Torso
  rr(ctx, x - 3, y - 5, 6, 9, 2.5);
  ctx.fillStyle = col;
  ctx.fill();

  // Querstreifen
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = COL.dark;
  ctx.fillRect(x - 3, y - 1, 6, 1.2);
  ctx.globalAlpha = 1;

  // Kopf
  ctx.fillStyle = COL.enemyHelmet;
  ctx.beginPath();
  ctx.arc(x, y + 3.5, 2.8, 0, TAU);
  ctx.fill();
}

function drawSniper(ctx, x, y, col, aim) {
  // Langes Gewehr nach unten
  ctx.strokeStyle = COL.rifle;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 6);
  ctx.lineTo(x + 2.6, y + 15);
  ctx.stroke();

  // Zielfernrohr-Glint
  ctx.globalAlpha = aim ? 1 : 0.55;
  ctx.fillStyle = '#e8f4ff';
  ctx.fillRect(x + 1.4, y + 3, 2, 2.2);
  ctx.globalAlpha = 1;

  // Weste
  rr(ctx, x - 4, y - 4, 8, 7, 2);
  ctx.fillStyle = col;
  ctx.fill();

  // Kopf
  ctx.fillStyle = COL.enemyHelmet;
  ctx.beginPath();
  ctx.arc(x - 0.5, y + 3.2, 2.9, 0, TAU);
  ctx.fill();
}

// Mini-Fahrzeug 40×36 (Radius 20).
function drawApc(ctx, x, y, col) {
  // Räder seitlich
  ctx.fillStyle = COL.dark;
  for (let k = 0; k < 2; k++) {
    const yy = y - 12 + k * 16;
    ctx.fillRect(x - 22, yy, 5, 8);
    ctx.fillRect(x + 17, yy, 5, 8);
  }

  // Wanne
  rr(ctx, x - 20, y - 18, 40, 36, 5);
  ctx.fillStyle = col;
  ctx.fill();

  // Panzerplatten
  ctx.strokeStyle = COL.steelLo;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 16.5, y - 14.5, 33, 27);

  // Frontscheibe (Richtung Squad)
  ctx.fillStyle = COL.glass;
  ctx.fillRect(x - 10, y + 8, 20, 6);
  ctx.fillStyle = COL.glassHi;
  ctx.fillRect(x - 8, y + 9, 5, 1.5);

  // Turm mit Rohr
  ctx.fillStyle = COL.rifle;
  ctx.fillRect(x - 1.2, y - 4, 2.4, 9);
  ctx.fillStyle = COL.steelLo;
  ctx.beginPath();
  ctx.arc(x, y - 4, 5.5, 0, TAU);
  ctx.fill();
}

function drawEnemyBody(ctx, id, col, w, aim) {
  switch (id) {
    case 'runner':
      drawRunner(ctx, 0, 0, col, w);
      break;
    case 'sniper':
      drawSniper(ctx, 0, 0, col, aim);
      break;
    case 'apc':
      drawApc(ctx, 0, 0, col);
      break;
    default:
      drawInfantry(ctx, 0, 0, col, w);
  }
}

// Schild-Ebene (um den Ursprung). stage 0 = voll, 1/2 = mit Rissen und blasser.
function drawShieldStage(ctx, stage) {
  ctx.globalAlpha = SHIELD_STAGE_ALPHA[stage];
  ctx.lineCap = 'round';
  ctx.strokeStyle = COL.steelHi;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 4, 13, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = '#5f6f8a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 4, 10.5, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  if (stage > 0) {
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-6, 11);
    ctx.lineTo(-2, 8.5);
    ctx.lineTo(-1, 13);
    ctx.moveTo(5, 12);
    ctx.lineTo(3, 9);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

// Gegnertyp einmal vorrendern: Körper je Laufphase (Scharfschütze zusätzlich Zielzustand),
// Schild je Stufe, Treffer-Silhouette je Körper-Sprite.
function buildEnemyEntry(d) {
  const id = d.id || 'infantry';
  const col = d.color || FALLBACK_ENEMY.color;
  const variants = id === 'sniper' ? 2 : 1;
  const body = [];
  for (let v = 0; v < variants; v++) {
    for (let f = 0; f < WALK_FRAMES; f++) {
      const sc = newSpriteCanvas();
      drawEnemyBody(sc.ctx, id, col, Math.sin((f * TAU) / WALK_FRAMES), v === 1);
      body.push(sc.c);
    }
  }

  // Weiße Silhouette (Treffer-Blitz)
  const flash = [];
  for (let k = 0; k < body.length; k++) {
    const src = body[k];
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    flash.push(c);
  }

  let shield = null;
  if (id === 'shield') {
    shield = [];
    for (let st = 0; st < SHIELD_STAGE_ALPHA.length; st++) {
      const sc = newSpriteCanvas();
      drawShieldStage(sc.ctx, st);
      shield.push(sc.c);
    }
  }
  return { body, flash, shield };
}

function getEnemyEntry(d) {
  let entry = _enemyCache.get(d.id);
  if (!entry) {
    entry = buildEnemyEntry(d);
    _enemyCache.set(d.id, entry);
  }
  return entry;
}

// Gegner zeichnen (vorgerenderte Sprites). Silhouette je def.id, Farbe aus def.color.
// HP-Balken nur für Gegner mit maxHp > 200 und wenn verletzt.
export function drawEnemy(ctx, e) {
  const d = e.def || FALLBACK_ENEMY;
  const x = e.x;
  const y = e.y;
  const entry = getEnemyEntry(d);
  const frame = walkFrame(e.walk);
  const variant = entry.body.length > WALK_FRAMES && e.state === 'aim' ? 1 : 0;
  const idx = variant * WALK_FRAMES + frame;
  const ox = x - SPR_HALF;
  const oy = y - SPR_HALF;

  ctx.globalAlpha = 1;
  ctx.drawImage(entry.body[idx], ox, oy, SPR_BOX, SPR_BOX);

  if (entry.shield && e.shield > 0) {
    ctx.drawImage(entry.shield[shieldStage(e)], ox, oy, SPR_BOX, SPR_BOX);
  }

  if (e.flash > 0) {
    ctx.globalAlpha = Math.min(1, e.flash) * 0.6;
    ctx.drawImage(entry.flash[idx], ox, oy, SPR_BOX, SPR_BOX);
    ctx.globalAlpha = 1;
  }

  if (e.maxHp > 200 && e.hp < e.maxHp) {
    const r = e.r || d.radius || FALLBACK_ENEMY.radius;
    hpBar(ctx, x, y - r - 7, r * 2 + 4, e.hp / e.maxHp);
  }
}

// ---------------------------------------------------------------- Boss (Kampfpanzer)

const TURRET_R = 0.32; // Turmradius = TURRET_R · min(w, h)
const TURRET_DY = BAL.BOSS_TURRET_DY; // Turm-Mitte relativ zu h (gemeinsam mit der Spiel-Logik)
const BARREL_LEN = BAL.BOSS_BARREL; // Rohrlänge = BARREL_LEN · h (ab Turm-Mitte)
const TRACK_PITCH = 4.5; // Abstand der Kettenglieder
const BOSS_COL_FALLBACK = '#5d6b4e';

const _mz = { x: 0, y: 0 };

function turretAngle(boss) {
  return typeof boss.turret === 'number' ? boss.turret : Math.PI / 2;
}

// Rohrspitze in Weltkoordinaten (ohne Rückstoß). Schreibt in out.x / out.y und gibt out zurück.
export function bossMuzzle(boss, out) {
  const a = turretAngle(boss);
  const L = BARREL_LEN * boss.h;
  out.x = boss.x + Math.cos(a) * L;
  out.y = boss.y + TURRET_DY * boss.h + Math.sin(a) * L;
  return out;
}

// Wannen-Umriss: flache Oberseite, abgeschrägte Front (unten) zwischen den Ketten.
function hullPath(ctx, cx, cy, hw, hh, tw) {
  const x0 = cx - hw + tw;
  const x1 = cx + hw - tw;
  const iw = x1 - x0;
  const top = cy - hh;
  const bot = cy + hh;
  const yc = cy + hh * 0.35;
  ctx.beginPath();
  ctx.moveTo(x0, top);
  ctx.lineTo(x1, top);
  ctx.lineTo(x1, yc);
  ctx.lineTo(x1 - iw * 0.2, bot);
  ctx.lineTo(x0 + iw * 0.2, bot);
  ctx.lineTo(x0, yc);
  ctx.closePath();
}

// Kette: dunkler Gurt mit Kettengliedern, die mit der Track-Phase wandern.
function drawTrack(ctx, xl, cy, hh, tw, phase) {
  const top = cy - hh;
  const h = hh * 2;
  ctx.fillStyle = '#16180f';
  ctx.fillRect(xl, top, tw, h);
  ctx.strokeStyle = '#3e4331';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const off = ((phase % TRACK_PITCH) + TRACK_PITCH) % TRACK_PITCH;
  for (let yy = top + off; yy < top + h; yy += TRACK_PITCH) {
    ctx.moveTo(xl + 1, yy);
    ctx.lineTo(xl + tw - 1, yy);
  }
  ctx.stroke();
  ctx.strokeStyle = '#4a5040';
  ctx.strokeRect(xl + 0.5, top + 0.5, tw - 1, h - 1);
}

// Turm: Rohr zuerst (liegt unter dem Turm), dann flacher Körper mit ERA, Kommandantenkuppel.
// a = Canvas-Winkel (0 = rechts, π/2 = nach unten). recoil 0..1 zieht das Rohr bis 25 % zurück.
function drawTurret(ctx, cx, tcy, r, L, a, recoil, col) {
  const rb = recoil * 0.25 * L;
  const tipX = L - rb;
  ctx.save();
  ctx.translate(cx, tcy);
  ctx.rotate(a);

  // Rohr
  ctx.fillStyle = COL.rifle;
  ctx.fillRect(r * 0.5 - rb, -r * 0.1, tipX - (r * 0.5 - rb), r * 0.2);
  // Mündungsbremse
  ctx.fillStyle = '#2a2e22';
  ctx.fillRect(tipX - L * 0.07, -r * 0.15, L * 0.07, r * 0.3);

  // Turmkörper (flach, rund)
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = COL.dark;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Reaktivpanzer-Kacheln an beiden Turmseiten
  ctx.fillStyle = '#4a5a33';
  ctx.strokeStyle = '#161a10';
  ctx.lineWidth = 0.6;
  for (let s = 0; s < 2; s++) {
    const ty = (s === 0 ? -1.0 : 0.78) * r;
    for (let k = 0; k < 2; k++) {
      const tx = (k === 0 ? -0.6 : 0.1) * r;
      ctx.fillRect(tx, ty, r * 0.5, r * 0.22);
      ctx.strokeRect(tx + 0.3, ty + 0.3, r * 0.5 - 0.6, r * 0.22 - 0.6);
    }
  }

  // Kommandantenkuppel mit Luke
  ctx.fillStyle = '#2b3024';
  ctx.beginPath();
  ctx.arc(-r * 0.28, -r * 0.12, r * 0.34, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#5b6650';
  ctx.beginPath();
  ctx.arc(-r * 0.34, -r * 0.2, r * 0.12, 0, TAU);
  ctx.fill();

  // Mündungsfeuer bei starkem Rückstoß
  if (recoil > 0.6) {
    const f = clamp01((recoil - 0.6) / 0.4);
    const R = r * 0.35 + r * 0.6 * f;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = COL.muzzle;
    ctx.beginPath();
    ctx.arc(tipX + R * 0.6, 0, R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL.muzzleCore;
    ctx.beginPath();
    ctx.arc(tipX + R * 0.5, 0, R * 0.45, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// Boss zeichnen (T-90-artiger Kampfpanzer, Wanne zeigt nach unten). Der HP-Balken übernimmt das HUD.
export function drawBoss(ctx, boss) {
  const d = boss.def || FALLBACK_BOSS;
  const w = boss.w;
  const h = boss.h;
  const cx = boss.x;
  const cy = boss.y;
  const hw = w / 2;
  const hh = h / 2;
  const col = d.color || BOSS_COL_FALLBACK;
  const tw = Math.max(9, w * 0.14);
  const x0 = cx - hw + tw;
  const iw = w - 2 * tw;
  const r = TURRET_R * Math.min(w, h);
  const L = BARREL_LEN * h;
  const tcy = cy + TURRET_DY * h;
  const recoil = clamp01(boss.recoil || 0);
  const track = boss.track || 0;

  // 1. Ketten (links/rechts)
  drawTrack(ctx, cx - hw, cy, hh, tw, track);
  drawTrack(ctx, cx + hw - tw, cy, hh, tw, track);

  // 2. Wanne
  hullPath(ctx, cx, cy, hw, hh, tw);
  ctx.fillStyle = col;
  ctx.fill();

  // Tarnflecken (auf die Wanne beschnitten), Motorgitter hinten, Frontplatte
  hullPath(ctx, cx, cy, hw, hh, tw);
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < CAMO.length; i++) {
    const c = CAMO[i];
    ctx.fillStyle = i % 2 ? '#2e3324' : '#9aa06a';
    ctx.beginPath();
    ctx.ellipse(cx + c[0] * w, cy + c[1] * h, c[2] * w, c[3] * h, c[4], 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1a1d14';
  ctx.fillRect(x0 + 2, cy - hh + 2, iw - 4, 4);
  ctx.fillStyle = '#3a3e2e';
  for (let k = 1; k < 5; k++) ctx.fillRect(x0 + 2 + (k * (iw - 4)) / 5, cy - hh + 2, 1, 4);
  ctx.fillStyle = '#3d4534';
  ctx.fillRect(x0 + iw * 0.26, cy + hh - 5, iw * 0.48, 2.5);
  ctx.restore();

  // Reaktivpanzer-Kacheln auf der Front (unterhalb des Turms)
  ctx.fillStyle = '#4a5a33';
  ctx.strokeStyle = '#161a10';
  ctx.lineWidth = 0.6;
  const ty = cy + hh * 0.55;
  const th = hh * 0.14;
  for (let k = 0; k < 4; k++) {
    const tx = x0 + iw * (0.14 + k * 0.2);
    const tWid = iw * 0.12;
    ctx.fillRect(tx, ty, tWid, th);
    ctx.strokeRect(tx + 0.3, ty + 0.3, tWid - 0.6, th - 0.6);
  }

  // 3. Turm mit Rohr
  drawTurret(ctx, cx, tcy, r, L, turretAngle(boss), recoil, col);

  // 4. Ziellinie (rot, pulsierend) von der Rohrspitze zum Ziel
  if (boss.aiming > 0 && typeof boss.aimX === 'number' && typeof boss.aimY === 'number') {
    bossMuzzle(boss, _mz);
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.014);
    ctx.globalAlpha = clamp01(boss.aiming) * pulse;
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(_mz.x, _mz.y);
    ctx.lineTo(boss.aimX, boss.aimY);
    ctx.stroke();
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(boss.aimX, boss.aimY, 2.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 5. Treffer-Überzug (weiß)
  if (boss.flash > 0) {
    ctx.globalAlpha = Math.min(1, boss.flash) * 0.2;
    ctx.fillStyle = '#ffffff';
    hullPath(ctx, cx, cy, hw, hh, tw);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, tcy, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- Tor

// Anzeige-Text eines Zahlentors: add +5/-5, mul x2/x3/x1/÷2/÷3.
function gateLabel(g) {
  if (g.op === 'add') return g.value > 0 ? '+' + g.value : String(g.value);
  const v = g.value;
  if (v >= 1) return 'x' + v;
  return '÷' + Math.round(1 / v);
}

// Tor-Panel. gate.x = linke Kante, gate.y = Mitte. squadCount bestimmt gut/schlecht.
export function drawGate(ctx, gate, squadCount, weaponNameNext) {
  const x = gate.x;
  const w = gate.w;
  const h = gate.h || 44;
  const y = gate.y;
  const top = y - h / 2;
  const used = !!gate.used;
  const base = used ? 0.2 : 1;
  const isWeapon = gate.kind === 'weapon';
  const flash = gate.flash || 0;

  ctx.save();

  // Farbe und Gut/Schlecht
  let fill;
  let good = true;
  if (isWeapon) {
    fill = gate.locked ? COL.steelHi : COL.orange;
  } else {
    good = gate.op === 'add' ? gate.value >= 0 : gate.value >= 1;
    fill = good ? COL.good : COL.bad;
  }

  // Fläche
  ctx.globalAlpha = base * (isWeapon && gate.locked ? 0.7 : 0.38);
  ctx.fillStyle = gate.locked ? COL.steelLo : fill;
  ctx.fillRect(x, top, w, h);

  // Gestreifte Fläche bei gesperrtem Waffentor
  if (isWeapon && gate.locked) {
    ctx.globalAlpha = base * 0.35;
    ctx.strokeStyle = COL.orange;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let sx = x - h; sx < x + w; sx += 14) {
      ctx.moveTo(sx, top + h);
      ctx.lineTo(sx + h, top);
    }
    ctx.stroke();
  }

  // Aufhellung beim Treffer
  if (flash > 0) {
    ctx.globalAlpha = base * Math.min(1, flash) * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, top, w, h);
  }

  // Rahmen
  ctx.globalAlpha = base;
  ctx.strokeStyle = gate.locked ? COL.steelHi : fill;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);

  // Stahl-Pfosten links/rechts
  ctx.fillStyle = COL.steelHi;
  ctx.fillRect(x - 4, top - 3, 5, h + 6);
  ctx.fillRect(x + w - 1, top - 3, 5, h + 6);
  ctx.fillStyle = COL.steelLo;
  ctx.fillRect(x - 1, top - 3, 1.5, h + 6);
  ctx.fillRect(x + w + 2, top - 3, 1.5, h + 6);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  if (isWeapon) {
    if (gate.locked) {
      // Name klein oben
      ctx.font = '800 11px system-ui, sans-serif';
      outlinedText(ctx, (weaponNameNext || '').toUpperCase(), x + w / 2, top + 11, COL.text);

      // Schloss-Symbol
      const cx = x + w / 2;
      const cy = top + 24;
      ctx.fillStyle = COL.text;
      ctx.fillRect(cx - 4.5, cy - 1, 9, 7);
      ctx.strokeStyle = COL.text;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy - 1, 3, Math.PI, 0);
      ctx.stroke();

      // HP-Balken (Freischießen)
      const ratio = gate.unlockMax > 0 ? Math.max(0, Math.min(1, gate.unlockHp / gate.unlockMax)) : 0;
      ctx.fillStyle = COL.dark;
      ctx.fillRect(x + 6, top + h - 9, w - 12, 5);
      ctx.fillStyle = COL.orange;
      ctx.fillRect(x + 6, top + h - 9, (w - 12) * ratio, 5);
    } else {
      ctx.font = '800 19px system-ui, sans-serif';
      outlinedText(ctx, (weaponNameNext || '').toUpperCase(), x + w / 2, y - 2, COL.text);
    }
  } else {
    ctx.font = '800 22px system-ui, sans-serif';
    outlinedText(ctx, gateLabel(gate), x + w / 2, y - 3, COL.text);

    // Fortschritt bis zum nächsten Punkt
    const p = Math.max(0, Math.min(1, gate.progress || 0));
    ctx.fillStyle = COL.dark;
    ctx.fillRect(x + 6, top + h - 7, w - 12, 3);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 6, top + h - 7, (w - 12) * p, 3);
  }

  ctx.restore();
  void squadCount; // Ergebnis-Vergleich wird über good/bad in der Farbe sichtbar
}

// ---------------------------------------------------------------- Kiste

// kind 'att' (Attachment), 'rpg' (+1 RPG-Schütze), 'spec' (Spezialist c.spec). Fehlt kind → 'att'.
export function drawCrate(ctx, c) {
  if (c.opened) return;
  const kind = c.kind || 'att';
  const r = c.r || 15;
  const flash = c.flash || 0;
  const jitter = flash > 0 ? (Math.random() - 0.5) * 4 * Math.min(1, flash) : 0;
  const x = c.x + jitter;
  const y = c.y;
  const sp = kind === 'spec' && c.spec ? SPECIALISTS[c.spec] || null : null;

  // Schatten
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = COL.dark;
  ctx.fillRect(x - r + 2, y - r * 0.8 + 4, r * 2, r * 1.6);
  ctx.globalAlpha = 1;

  // Kistenkörper
  rr(ctx, x - r, y - r * 0.8, r * 2, r * 1.6, 2);
  ctx.fillStyle = COL.vest;
  ctx.fill();

  // Holz-/Metall-Latten
  ctx.strokeStyle = '#2d3524';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) {
    const yy = y + k * r * 0.4;
    ctx.moveTo(x - r + 2, yy);
    ctx.lineTo(x + r - 2, yy);
  }
  ctx.stroke();

  // Kanten (Spezialisten-Kiste in Spezialisten-Farbe)
  ctx.strokeStyle = sp ? sp.color : COL.steelHi;
  ctx.lineWidth = sp ? 2.4 : 1.6;
  ctx.strokeRect(x - r + 0.8, y - r * 0.8 + 0.8, r * 2 - 1.6, r * 1.6 - 1.6);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  if (kind === 'rpg') {
    drawRocketIcon(ctx, x, y - 4, 11);
    ctx.font = '800 7px system-ui, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = COL.dark;
    ctx.strokeText('RPG +1', x, y + 5.5);
    ctx.fillStyle = '#ff5a2a';
    ctx.fillText('RPG +1', x, y + 5.5);
  } else if (sp) {
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COL.dark;
    ctx.strokeText(sp.short, x, y);
    ctx.fillStyle = sp.color;
    ctx.fillText(sp.short, x, y);
  } else {
    // Orange Markierung (Attachment)
    ctx.fillStyle = COL.orange;
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }

  // Treffer-Blitz
  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash) * 0.6;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x - r, y - r * 0.8, r * 2, r * 1.6, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // HP-Balken bei Schaden
  if (c.hp < c.maxHp) {
    const ratio = Math.max(0, c.hp / c.maxHp);
    const bw = r * 2;
    const by = y - r * 0.8 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - bw / 2, by, bw, 2.5);
    ctx.fillStyle = COL.orange;
    ctx.fillRect(x - bw / 2, by, bw * ratio, 2.5);
  }
}

// ---------------------------------------------------------------- Attachment-Icon

// Kleines Icon in einem Quadrat. x, y = linke obere Ecke, size = Kantenlänge.
export function drawAttachmentIcon(ctx, id, x, y, size) {
  const s = size;
  const att = ATTACHMENTS[id];
  const col = att ? att.color : COL.text;

  // Kantenquadrat
  ctx.fillStyle = 'rgba(14,17,12,0.92)';
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = COL.orange;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);

  ctx.lineWidth = Math.max(1, s * 0.07);
  switch (id) {
    case 'reddot': {
      ctx.strokeStyle = COL.text;
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s * 0.3, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s * 0.09, 0, TAU);
      ctx.fill();
      break;
    }
    case 'comp': {
      // Zylinder mit Schlitzen
      rr(ctx, x + s * 0.3, y + s * 0.18, s * 0.4, s * 0.64, s * 0.08);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = COL.dark;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const yy = y + s * (0.34 + k * 0.16);
        ctx.moveTo(x + s * 0.3, yy);
        ctx.lineTo(x + s * 0.7, yy);
      }
      ctx.stroke();
      break;
    }
    case 'extmag': {
      // Langes Magazin
      ctx.beginPath();
      ctx.moveTo(x + s * 0.36, y + s * 0.12);
      ctx.lineTo(x + s * 0.64, y + s * 0.12);
      ctx.lineTo(x + s * 0.6, y + s * 0.88);
      ctx.lineTo(x + s * 0.4, y + s * 0.88);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = COL.dark;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.4, y + s * 0.4);
      ctx.lineTo(x + s * 0.6, y + s * 0.4);
      ctx.stroke();
      break;
    }
    case 'hollow': {
      // Patrone mit Kerbe
      ctx.fillStyle = col;
      ctx.fillRect(x + s * 0.38, y + s * 0.4, s * 0.24, s * 0.48);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.38, y + s * 0.4);
      ctx.lineTo(x + s * 0.62, y + s * 0.4);
      ctx.lineTo(x + s * 0.5, y + s * 0.14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.dark;
      ctx.fillRect(x + s * 0.46, y + s * 0.22, s * 0.08, s * 0.1);
      break;
    }
    case 'ugl': {
      // Rohr mit Granate
      ctx.fillStyle = col;
      ctx.fillRect(x + s * 0.12, y + s * 0.44, s * 0.56, s * 0.12);
      ctx.beginPath();
      ctx.arc(x + s * 0.76, y + s * 0.5, s * 0.16, 0, TAU);
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------- Partikel

// Alpha = life / maxLife. Liefert keine Allokation; setzt globalAlpha am Ende zurück.
export function drawParticle(ctx, p) {
  const life = p.life > 0 ? p.life : 0;
  const a = p.maxLife > 0 ? Math.min(1, life / p.maxLife) : 0;
  const grow = 1 - a;
  const size = p.size || 2;

  switch (p.kind) {
    case 'spark': {
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color || '#ffd27a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
      break;
    }
    case 'smoke': {
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = p.color || '#7a7f74';
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * (1 + grow * 1.5), 0, TAU);
      ctx.fill();
      break;
    }
    case 'flash': {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color || '#fff6c0';
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * (0.6 + grow), 0, TAU);
      ctx.fill();
      break;
    }
    case 'debris': {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color || '#2a2a24';
      ctx.fillRect(p.x - size * 0.5, p.y - size * 0.3, size, size * 0.6);
      break;
    }
    case 'text': {
      ctx.globalAlpha = a;
      ctx.font = '800 ' + size + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = COL.dark;
      ctx.strokeText(p.text || '', p.x, p.y);
      ctx.fillStyle = p.color || COL.text;
      ctx.fillText(p.text || '', p.x, p.y);
      break;
    }
    case 'ring': {
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color || '#ffffff';
      ctx.lineWidth = 0.5 + 2 * a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * (1 + grow * 2), 0, TAU);
      ctx.stroke();
      break;
    }
    case 'casing': {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color || '#c9a84a';
      ctx.fillRect(p.x - 1.5, p.y - 0.75, 3, 1.5);
      break;
    }
    default:
      break;
  }
  ctx.globalAlpha = 1;
}

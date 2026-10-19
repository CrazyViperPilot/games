// Prozedurale Zeichenfunktionen (Top-Down, leicht schräg). Keine Bilddateien.
// Maße in Welteinheiten; der Renderer setzt die Transformation. Keine Allokationen pro Aufruf
// (nur Pfade/Fills auf dem Context).

import { CFG } from '../config.js';
import { ATTACHMENTS } from '../data/attachments.js';

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

// Gewichtete Tarnflecken am Boss: [fx, fy, frx, fry, rot] relativ zu w/h.
const CAMO = [
  [-0.3, -0.22, 0.2, 0.12, 0.4],
  [0.22, 0.1, 0.24, 0.14, -0.3],
  [-0.12, 0.3, 0.18, 0.1, 0.2],
  [0.3, -0.36, 0.14, 0.09, 0.6],
  [0.02, -0.02, 0.12, 0.08, -0.7],
];

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

// Top-Down-Soldat (ca. 10×12), schaut nach oben (Gewehr zeigt Richtung Gegner).
// walkPhase: Animationsphase der Beine; muzzle 0..1 Mündungsfeuer; tint 0..1 roter Treffer-Blitz.
export function drawSoldier(ctx, x, y, walkPhase, muzzle, tint) {
  const s = Math.sin(walkPhase || 0) * 1.4;

  // Beine (wippen gegenläufig)
  ctx.fillStyle = COL.legs;
  ctx.fillRect(x - 3.4, y + 3.2 + s, 2.3, 4.2);
  ctx.fillRect(x + 1.1, y + 3.2 - s, 2.3, 4.2);

  // Gewehr nach oben
  ctx.strokeStyle = COL.rifle;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x + 2.4, y + 2);
  ctx.lineTo(x + 3, y - 7);
  ctx.stroke();

  // Weste / Schultern
  soldierVest(ctx, x, y);
  ctx.fillStyle = COL.vest;
  ctx.fill();

  // Helm
  ctx.fillStyle = COL.helmet;
  ctx.beginPath();
  ctx.arc(x - 0.2, y - 2.6, 3.3, 0, TAU);
  ctx.fill();

  // Orangefarbener Schulterpatch
  ctx.fillStyle = COL.patch;
  ctx.fillRect(x - 4.2, y - 0.4, 1.7, 1.7);

  // Mündungsfeuer
  if (muzzle > 0) {
    const m = Math.min(1, muzzle);
    const r = 1.6 + 2.6 * m;
    ctx.globalAlpha = m;
    ctx.fillStyle = COL.muzzle;
    ctx.beginPath();
    ctx.arc(x + 3, y - 8, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL.muzzleCore;
    ctx.beginPath();
    ctx.arc(x + 3, y - 8, r * 0.45, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
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
}

// ---------------------------------------------------------------- Gegner

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

// Schild: je niedriger der Schildwert, desto transparenter und mit Rissen. Schildwert 0 = kein Schild.
function drawShield(ctx, e, x, y) {
  if (!(e.shield > 0)) return;
  const maxS = e.maxShield > 0 ? e.maxShield : 1;
  const ratio = Math.min(1, e.shield / maxS);

  ctx.globalAlpha = 0.3 + 0.7 * ratio;
  ctx.lineCap = 'round';
  ctx.strokeStyle = COL.steelHi;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y + 4, 13, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = '#5f6f8a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y + 4, 10.5, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  if (ratio < 0.5) {
    ctx.strokeStyle = COL.dark;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 11);
    ctx.lineTo(x - 2, y + 8.5);
    ctx.lineTo(x - 1, y + 13);
    ctx.moveTo(x + 5, y + 12);
    ctx.lineTo(x + 3, y + 9);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
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

function hpBar(ctx, x, y, w, ratio) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - w / 2, y, w, 2.5);
  ctx.fillStyle = ratio > 0.5 ? CFG.COLORS.good : ratio > 0.25 ? CFG.COLORS.orange : CFG.COLORS.bad;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, ratio)), 2.5);
}

// Gegner zeichnen. Silhouette je def.id, Farbe aus def.color.
export function drawEnemy(ctx, e) {
  const d = e.def;
  const x = e.x;
  const y = e.y;
  const r = e.r || d.radius;
  const col = d.color;
  const w = Math.sin(e.walk || 0);

  switch (d.id) {
    case 'runner':
      drawRunner(ctx, x, y, col, w);
      break;
    case 'shield':
      drawInfantry(ctx, x, y, col, w);
      drawShield(ctx, e, x, y);
      break;
    case 'sniper':
      drawSniper(ctx, x, y, col, e.state === 'aim');
      break;
    case 'apc':
      drawApc(ctx, x, y, col);
      break;
    default:
      drawInfantry(ctx, x, y, col, w);
  }

  // Treffer-Blitz (weiß überlagert)
  if (e.flash > 0) {
    ctx.globalAlpha = Math.min(1, e.flash) * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.1, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // HP-Balken nur bei robusten Gegnern, wenn verletzt
  if (e.maxHp > 40 && e.hp < e.maxHp) {
    hpBar(ctx, x, y - r - 7, r * 2 + 4, e.hp / e.maxHp);
  }
}

// ---------------------------------------------------------------- Boss

function drawTurret(ctx, cx, cy, r, angle, len, col) {
  // Rohr zuerst (liegt unter dem Turm)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = COL.rifle;
  ctx.fillRect(0, -r * 0.24, len, r * 0.48);
  ctx.restore();

  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = COL.dark;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Panzerwagen (8 Räder).
function drawBossApc(ctx, x, y, w, h, col) {
  const hw = w / 2;
  const hh = h / 2;

  // Räder: 4 je Seite
  ctx.fillStyle = COL.dark;
  for (let k = 0; k < 4; k++) {
    const yy = y - hh * 0.7 + k * (hh * 1.4 / 3);
    ctx.fillRect(x - hw - 3, yy - 5, 6, 10);
    ctx.fillRect(x + hw - 3, yy - 5, 6, 10);
  }

  // Wanne
  rr(ctx, x - hw, y - hh, w, h, 9);
  ctx.fillStyle = col;
  ctx.fill();

  // Tarnflecken
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < CAMO.length; i++) {
    const c = CAMO[i];
    ctx.fillStyle = i % 2 ? '#2e3324' : '#9aa06a';
    ctx.beginPath();
    ctx.ellipse(x + c[0] * w, y + c[1] * h, c[2] * w, c[3] * h, c[4], 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Kabine mit Frontscheibe
  rr(ctx, x - w * 0.3, y - hh * 0.55, w * 0.6, hh * 1.1, 5);
  ctx.fillStyle = '#3a4032';
  ctx.fill();
  ctx.fillStyle = COL.glass;
  ctx.fillRect(x - w * 0.24, y + hh * 0.25, w * 0.48, hh * 0.22);

  // Rammschutz vorn
  ctx.fillStyle = COL.steelLo;
  ctx.fillRect(x - hw + 4, y + hh - 6, w - 8, 4);
}

// Kampfpanzer (Ketten, drehender Turm). turret = Winkel in Canvas-Konvention (0 = rechts, π/2 = nach unten).
function drawBossTank(ctx, x, y, w, h, col, turret) {
  const hw = w / 2;
  const hh = h / 2;

  // Ketten
  ctx.fillStyle = '#16180f';
  ctx.fillRect(x - hw, y - hh, 12, h);
  ctx.fillRect(x + hw - 12, y - hh, 12, h);
  ctx.strokeStyle = '#3a3e2e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let yy = y - hh; yy < y + hh; yy += 5) {
    ctx.moveTo(x - hw, yy);
    ctx.lineTo(x - hw + 12, yy);
    ctx.moveTo(x + hw - 12, yy);
    ctx.lineTo(x + hw, yy);
  }
  ctx.stroke();

  // Wanne
  rr(ctx, x - hw + 11, y - hh + 3, w - 22, h - 6, 6);
  ctx.fillStyle = col;
  ctx.fill();

  // Frontplatte
  ctx.fillStyle = '#3d4534';
  ctx.fillRect(x - hw + 14, y + hh - 12, w - 28, 7);

  drawTurret(ctx, x, y - hh * 0.05, Math.min(w, h) * 0.24, turret, w * 0.45, col);
}

// Bunkerfahrzeug: breit, zwei Türme.
function drawBossFortress(ctx, x, y, w, h, col, turret) {
  const hw = w / 2;
  const hh = h / 2;

  rr(ctx, x - hw, y - hh, w, h, 10);
  ctx.fillStyle = col;
  ctx.fill();

  // Schießscharten
  ctx.fillStyle = COL.dark;
  for (let k = -1; k <= 1; k++) {
    ctx.fillRect(x + k * w * 0.35 - 3, y - hh + 5, 6, 3);
  }

  // Panzerplatte vorn
  ctx.fillStyle = '#353830';
  ctx.fillRect(x - hw + 6, y + hh - 10, w - 12, 5);

  const r = Math.min(w, h) * 0.17;
  drawTurret(ctx, x - w * 0.26, y, r, turret, w * 0.3, col);
  drawTurret(ctx, x + w * 0.26, y, r, turret, w * 0.3, col);
}

// Boss zeichnen (je def.id). Der HP-Balken übernimmt das HUD.
export function drawBoss(ctx, boss) {
  const d = boss.def;
  const w = boss.w;
  const h = boss.h;
  const x = boss.x;
  const y = boss.y;
  const col = d.color || '#5d6b4e';
  const turret = boss.turret || 0;

  switch (d.id) {
    case 'boss_tank':
      drawBossTank(ctx, x, y, w, h, col, turret);
      break;
    case 'boss_fortress':
      drawBossFortress(ctx, x, y, w, h, col, turret);
      break;
    default:
      drawBossApc(ctx, x, y, w, h, col);
  }

  if (boss.flash > 0) {
    ctx.globalAlpha = Math.min(1, boss.flash) * 0.6;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x - w / 2, y - h / 2, w, h, 10);
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

export function drawCrate(ctx, c) {
  if (c.opened) return;
  const r = c.r || 15;
  const flash = c.flash || 0;
  const jitter = flash > 0 ? (Math.random() - 0.5) * 4 * Math.min(1, flash) : 0;
  const x = c.x + jitter;
  const y = c.y;

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

  // Metallkanten
  ctx.strokeStyle = COL.steelHi;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x - r + 0.8, y - r * 0.8 + 0.8, r * 2 - 1.6, r * 1.6 - 1.6);

  // Orange Markierung
  ctx.fillStyle = COL.orange;
  ctx.fillRect(x - 3, y - 3, 6, 6);

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

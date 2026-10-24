// Graben, Kopfstoß, Drops und Sand-Nachfall (PLAN §3, §6; PRD §4).
// Die Spielerkoordinaten sind die linke obere Ecke (wie in collide.js). Die Zeile der Füße ist die unterste
// Zeile, die der Körper belegt; der Kopf ist die Zeile darüber.
import { PHYS } from '../data/physics.js';
import { TILE_BY_ID, TILE_IDS, PICKS } from '../data/tiles.js';

const T = PHYS.tile;
const E = 1e-6;
const AIR_ID = TILE_IDS.air;
const FAIL_INTERVAL = 0.5;      // s zwischen zwei digFail-Ereignissen
const SOUND_INTERVAL = 0.25;    // s zwischen zwei dig-Ereignissen beim Graben
const TNT_FUSE = 2.0;

// Ergebnis der Zielsuche (wiederverwendet, keine Allokation).
const TGT = { c: 0, r: 0 };

// Ziel-Kachel: hart definiert (hard !== null) und nicht Luft.
function isTarget(id) {
  return id !== AIR_ID && TILE_BY_ID[id].hard !== null;
}

// Seitlich: erst Zeile der Füße, dann Kopf. Leer oder nicht abbaubar und nicht fest (Wasser, Lava) → weiter;
// nicht abbaubare feste Kachel (Grundgestein) → kein Ziel.
function findSide(map, p, dir) {
  const c = dir > 0 ? Math.floor((p.x + p.w - E) / T) + 1 : Math.floor((p.x + E) / T) - 1;
  const feet = Math.floor((p.y + p.h - E) / T);
  for (let r = feet; r >= feet - 1; r--) {
    const id = map.get(c, r);
    if (isTarget(id)) {
      TGT.c = c;
      TGT.r = r;
      return true;
    }
    if (TILE_BY_ID[id].solid) return false;
  }
  return false;
}

// Ohne Richtung: Kachel direkt unter der Fußmitte.
function findUnder(map, p) {
  const c = Math.floor((p.x + p.w / 2) / T);
  const r = Math.floor((p.y + p.h + E) / T);
  if (!isTarget(map.get(c, r))) return false;
  TGT.c = c;
  TGT.r = r;
  return true;
}

// Treppe: Springen + Graben + Richtung. Die Kachel vor den Füßen bleibt als Stufe stehen; abgebaut werden
// vorne Kopfzeile, vorne eine Zeile darüber und über dem eigenen Kopf. Rückgabe: 'target' (TGT gesetzt),
// 'ready' (alles frei, Stufe da → hochhüpfen) oder 'none' (keine Stufe / Grundgestein im Weg).
function findStair(map, p, dir) {
  const c = Math.floor((p.x + p.w / 2) / T);
  const c1 = c + dir;
  const feet = Math.floor((p.y + p.h - E) / T);
  if (!TILE_BY_ID[map.get(c1, feet)].solid) return 'none';
  const cells = [[c1, feet - 1], [c1, feet - 2], [c, feet - 2]];
  for (let i = 0; i < cells.length; i++) {
    const id = map.get(cells[i][0], cells[i][1]);
    if (isTarget(id)) {
      TGT.c = cells[i][0];
      TGT.r = cells[i][1];
      return 'target';
    }
    if (TILE_BY_ID[id].solid) return 'none';
  }
  return 'ready';
}

function digState(game) {
  let d = game.dig;
  if (!d) {
    d = { active: false, c: 0, r: 0, progress: 0, stage: 0, failCd: 0, soundCd: 0, mobCd: 0 };
    game.dig = d;
  }
  return d;
}

function resetDig(d, p) {
  d.active = false;
  d.progress = 0;
  d.stage = 0;
  d.soundCd = 0;
  p.digging = false;
}

// Pickel trifft Mobs in Reichweite (digReach Kacheln seitlich in Laufrichtung bzw. Blickrichtung, ohne Richtung
// unter den Füßen). Ein Treffer = −1 HP; ein Zischer wird so ohne Explosion erledigt.
function hitMobsWithPick(game, d, p, dir) {
  const mobs = game.mobs;
  if (!mobs || mobs.length === 0 || d.mobCd > 0) return;
  const reach = PHYS.digReach * T;
  let x, y, w, h;
  if (dir === 0) {
    x = p.x; y = p.y + p.h; w = p.w; h = reach;
  } else {
    w = reach; h = p.h; y = p.y;
    x = dir > 0 ? p.x + p.w : p.x - reach;
  }
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (!m.active || m.dead || m.state === 'dead') continue;
    if (x < m.x + m.w && x + w > m.x && y < m.y + m.h && y + h > m.y) {
      game.hitMob?.(m, 'dig');
      d.mobCd = PHYS.digHitCooldown;
      game.emit('stomp');
      return;
    }
  }
}

// Graben: Ziel suchen, Fortschritt je nach Hacke, Bruch bei progress >= 1. Schreibt game.dig und player.digging.
export function updateDig(game, dt, input) {
  const p = game.player;
  const d = digState(game);
  if (d.failCd > 0) d.failCd = Math.max(0, d.failCd - dt);
  if (d.soundCd > 0) d.soundCd = Math.max(0, d.soundCd - dt);

  if (d.mobCd > 0) d.mobCd = Math.max(0, d.mobCd - dt);

  if (!input.dig || p.climbing) {
    resetDig(d, p);
    return;
  }

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  hitMobsWithPick(game, d, p, dir);
  let found;
  if (dir !== 0 && input.jump && p.onGround) {
    const st = findStair(game.map, p, dir);
    if (st === 'ready') {
      // Stufe frei: automatisch hochhüpfen (Sprungimpuls wie ein normaler Sprung).
      p.vy = -PHYS.jumpSpeed;
      p.onGround = false;
      p.jumping = true;
      resetDig(d, p);
      game.emit('jump');
      return;
    }
    found = st === 'target';
  } else {
    found = dir === 0 ? findUnder(game.map, p) : findSide(game.map, p, dir);
  }
  if (!found) {
    resetDig(d, p);
    return;
  }

  const c = TGT.c, r = TGT.r;
  if (!(d.active && d.c === c && d.r === r)) {
    d.progress = 0;
    d.stage = 0;
    d.c = c;
    d.r = r;
  }
  d.active = true;
  p.digging = true;

  const tile = TILE_BY_ID[game.map.get(c, r)];
  const pick = game.pick;
  if (pick < tile.minPick) {
    d.progress = 0;
    d.stage = 0;
    if (d.failCd <= 0) {
      game.emit('digFail');
      d.failCd = FAIL_INTERVAL;
    }
    return;
  }

  d.progress += dt / (tile.hard * PICKS[pick].mult);
  if (d.progress >= 1) {
    breakTile(game, c, r, 'dig');
    d.progress = 0;
    d.stage = 0;
    d.active = false;
    p.digging = false;
    return;
  }

  d.stage = Math.floor(d.progress * 4);
  if (d.soundCd <= 0) {
    game.emit('dig');
    d.soundCd = SOUND_INTERVAL;
  }
}

// Bricht eine Kachel. Gibt false zurück, wenn nichts passiert ist (Luft, Grundgestein; bei Explosion auch Obsidian).
export function breakTile(game, c, r, cause) {
  const map = game.map;
  const id = map.get(c, r);
  const tile = TILE_BY_ID[id];
  if (id === AIR_ID || tile.hard === null) return false;
  if (cause === 'explosion' && tile.kind === 'obsidian') return false;

  const drop = tile.drop;
  if (drop === 'tnt' && game.igniteTnt) {
    game.igniteTnt(c, r, TNT_FUSE);      // entfernt die Kachel selbst
  } else if (drop !== 'chest') {
    map.set(c, r, AIR_ID);               // Truhen setzt openChest selbst
  }

  game.markDirty(c, r);
  game.lightDirty = true;
  game.spawnDebris?.(c, r, id);

  if (drop) {
    if (typeof drop === 'object') {
      game.addEmeralds(drop.emeralds);
    } else if (drop === 'diamond') {
      game.collectDiamondAt((c + 0.5) * 16, (r + 0.5) * 16);
    } else if (drop === 'silverfish') {
      game.spawnMob('silverfish', (c + 0.5) * T, (r + 1) * T);
    } else if (drop === 'chest') {
      game.openChest(c, r);
    }
  }

  // Sand darüber fällt nach.
  if (TILE_BY_ID[map.get(c, r - 1)].falls) game.startFalling?.(c, r - 1);

  game.emit('break', { c, r, id, cause });
  return true;
}

// Kopfstoß: weiche Kacheln brechen, Truhen öffnen sich. Gibt zurück, ob etwas passiert ist.
export function headBreak(game, c, r) {
  const tile = TILE_BY_ID[game.map.get(c, r)];
  if (tile.kind === 'chest') {
    game.openChest(c, r);
    game.markDirty(c, r);
    return true;
  }
  if (tile.soft) return breakTile(game, c, r, 'head');
  return false;
}

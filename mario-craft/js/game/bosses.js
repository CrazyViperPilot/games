// Bosse (PLAN §6, §9; PRD §2, §5). Kein DOM. createBoss(kind, x, y): x, y = Fußmitte des Spawns '@'.
// Gemeinsame Felder: { kind, x, y, w, h, vx, vy, face, anim, animTime, active, state, hp, invuln, parts, onGround,
//   update(game, dt, prevFeet), damage(game, how) }. update/damage rufen updateBoss/damageBoss auf.
// state: 'idle' (Arena noch nicht betreten) → 'fight' (active = true) → 'defeated' (active = false, danach nichts mehr).
// Riesenschleim (slimeking): parts = Teile { size 'l'|'m', anim 'boss_slime_l'|'boss_slime_m', x, y, w, h, vx, vy,
//   onGround, state 'live', hopT, invuln, animTime, gone }. Der Boss-Körper (x, y, w, h, vx, vy, onGround, anim)
//   ist eine Kopie des größten lebenden Teils; hp = Anzahl Teile (Anzeige).
// Treffer: Stampfen (fallend, Füße über der Teil-Mitte) und Pfeil/Explosion teilen ein Teil. Schleime aus einem
// mittleren Teil sind Mobs mit m.fromBoss = true; der Boss ist besiegt, wenn keine Teile und keine solchen Mobs leben.
// Dreikopf (dreikopf): schwebt, parts = []. state 'fight' | 'dive' (Sturzflug nach einer Salve, active = true).
//   hp = Energie (BOSSES.dreikopf.hp), maxHp, phase (1, ab hp ≤ 50 % → 2), invuln (s, Blinken), salvos/shots (Zähler).
//   Stampfer und Pfeil treffen; Explosionen nicht. Sieg: explode-Radius 2 am Körpermittelpunkt, dann defeatBoss().
// Leerendrache (drache): state 'fly' (Phase 1 mit Kristallen, Phase 2 nach 4 s Flug) | 'land' | 'perch'. Körper flying
//   64×32, perch 48×40 mit Unterkante auf dem Spawn-y. ai = { homeX, groundY, angle, shootT, timer, transit, fromX, fromY }.
//   game.crystals: { x, y, w, h, alive }; zerstört durch Stampfer (hier), Pfeil (game.hitCrystal) oder Explosion.
//   Kristall zerstört: 200 Punkte, Event 'crystal' und 'bossHit'. Feuerbälle ('fire') zielen auf den Spieler.
import { PHYS } from '../data/physics.js';
import { BOSSES } from '../data/mobs.js';
import { moveAndCollide } from './collide.js';
import { explode } from './explode.js';
import { spawnProjectile } from './projectiles.js';

const T = PHYS.tile;
const ARENA_LEAD = 20 * T;      // px: ab so weit links vom Boss (x des Körpers) ist die Arena aktiv
const SPLIT_INVULN = 0.5;       // s Unverwundbarkeit eines neu entstandenen Teils
const HIT_SCORE = 500;
const DEFEAT_SCORE = 5000;
const SLIME_SPAWN_DX = 8;       // px: die zwei Schleime aus einem mittleren Teil liegen ± 8 px um die Mitte
const SLIME_PART_DX = 12;       // px: Mitten der zwei mittleren Teile aus einem großen Teil ± 12 px
const SPLIT_VX = 60;            // px/s: Abstoß der mittleren Teile nach dem Teilen
const SPLIT_VY = -250;
const OFF_LEVEL = 64;           // px unter dem Level: ein Teil fällt aus der Welt und zählt als verloren

const SLIME_DATA = BOSSES.slimeking;
const SLIME = {
  l: { size: SLIME_DATA.w, hopEvery: SLIME_DATA.hopEvery, hopVy: SLIME_DATA.hopVy, hopVx: 70 },
  m: { size: SLIME_DATA.split.w, hopEvery: 1.2, hopVy: -320, hopVx: 90 },
};

// ---------- Aufbau ----------

// Boss an der Fußmitte (x, y) erzeugen. Unbekannter Typ ist ein Fehler.
export function createBoss(kind, x, y) {
  if (!Object.hasOwn(KINDS, kind)) throw new Error(`Unbekannter oder noch nicht implementierter Boss: ${kind}`);
  return KINDS[kind](x, y);
}

const KINDS = { slimeking: makeSlimeKing, dreikopf: makeDreikopf, drache: makeDrache, schildkroete: makeSchildkroete };

// Kampf unterbrochen (Tod der Figur oder Arena verlassen): neuer Boss am Spawn (x, y) im Zustand 'idle', der
// angerichtete Schaden bleibt. Riesenschleim: dieselben Teile (Größen) nebeneinander am Spawn; Schleime aus dem
// Boss leben als Mobs weiter. Dreikopf/Drache: Energie bleibt; zerstörte Kristalle bleiben zerstört (game.crystals).
export function restartBoss(old, x, y) {
  const b = createBoss(old.kind, x, y);
  if (old.kind === 'slimeking') {
    const keep = old.parts.filter((q) => !q.gone);
    if (keep.length !== 1 || keep[0].size !== 'l') {
      b.parts.length = 0;
      for (let i = 0; i < keep.length; i++) {
        const dx = (i - (keep.length - 1) / 2) * (SLIME.m.size + 4);
        b.parts.push(makePart(keep[i].size, x + dx, y, 0, 0));
      }
      syncBody(b);
    }
  } else {
    b.hp = old.hp;
  }
  return b;
}

function newBoss(kind, x, y, w, h) {
  const b = {
    kind, x, y, w, h, vx: 0, vy: 0, face: -1, anim: '', animTime: 0,
    active: false, state: 'idle', hp: 0, invuln: 0, parts: [], onGround: false,
    update: (game, dt, prevFeet) => stepBoss(game, b, dt, prevFeet),
    damage: (game, how) => hitBoss(game, b, how),
  };
  return b;
}

// Teil an der Fußmitte (footX, footY) mit Startgeschwindigkeit.
function makePart(size, footX, footY, vx, vy) {
  const s = SLIME[size];
  const w = s.size;
  return {
    size, anim: size === 'l' ? 'boss_slime_l' : 'boss_slime_m',
    x: footX - w / 2, y: footY - w, w, h: w, vx, vy,
    onGround: false, state: 'live', hopT: s.hopEvery, invuln: 0, animTime: 0, gone: false,
  };
}

function pushPart(b, size, footX, footY, vx, vy) {
  const part = makePart(size, footX, footY, vx, vy);
  part.invuln = SPLIT_INVULN;
  b.parts.push(part);
}

function makeSlimeKing(x, y) {
  const w = SLIME_DATA.w, h = SLIME_DATA.h;
  const b = newBoss('slimeking', x - w / 2, y - h, w, h);
  b.parts.push(makePart('l', x, y, 0, 0));
  syncBody(b);
  return b;
}

// Dreikopf: Schwebemitte 5 Kacheln über dem Spawn (Mitte von hover), Sinus um die Spawn-Mitte.
const DRE = BOSSES.dreikopf;
const DRE_HOVER = (DRE.hover.minH + DRE.hover.maxH) / 2 * T;  // px: Unterkante des Körpers über dem Spawn-Fuß
const DRE_BOB = (DRE.hover.maxH - DRE.hover.minH) / 2 * T;    // px: vertikale Amplitude
const DRE_SWAY = DRE.sway * T;                                 // px: horizontale Amplitude
const DRE_OMEGA_X = DRE.speed / DRE_SWAY;                      // rad/s: Spitzengeschwindigkeit = speed px/s

function makeDreikopf(x, y) {
  const w = DRE.w, h = DRE.h;
  const top = y - DRE_HOVER - h;
  const b = newBoss('dreikopf', x - w / 2, top, w, h);
  b.anim = 'boss_dreikopf';
  b.hp = DRE.hp;
  b.maxHp = DRE.hp;
  b.phase = 1;
  b.salvos = 0;   // Zähler: abgefeuerte Salven
  b.shots = 0;    // Zähler: erzeugte Schädel
  b.ai = { homeX: x, homeTop: top, t: 0, shootT: DRE.shootEvery, diveT: 0 };
  return b;
}

// ---------- Schritt und Schaden (auch über game.boss) ----------

// Schritt für game.boss (PLAN §6). Ohne Boss passiert nichts.
export function updateBoss(game, dt, prevFeet) {
  if (game.boss) stepBoss(game, game.boss, dt, prevFeet);
}

// Pfeil oder Explosion für game.boss (PLAN §6). how: 'arrow' | 'explosion'.
export function damageBoss(game, how) {
  if (game.boss) hitBoss(game, game.boss, how);
}

function stepBoss(game, b, dt, prevFeet) {
  if (b.state === 'defeated') return;
  if (b.state === 'idle') {
    const flyer = b.kind === 'dreikopf' || b.kind === 'drache';
    if (flyer ? !nearFlyer(game, b) : game.player.x < b.x - ARENA_LEAD) return;
    if (game.inArena && !game.inArena()) return;   // erst ganz hinter der Tür (Tor schließt nicht auf der Figur)
    if (b.kind === 'drache') {
      // Landeplatz: erster fester Boden unterhalb des Spawns (der Spawn darf in der Luft liegen).
      const map = game.map;
      const c = Math.floor(b.ai.homeX / 16);
      let r = Math.floor((b.ai.groundY - 1) / 16);
      while (r < map.rows && !map.isSolid(c, r)) r++;
      b.ai.groundY = r * 16;
    }
    b.state = b.kind === 'drache' ? 'fly' : 'fight';
    b.active = true;
    game.lockArena?.();
    game.emit('bossStart');
  }

  if (b.kind === 'dreikopf') {
    stepDreikopf(game, b, dt, prevFeet);
    return;
  }
  if (b.kind === 'drache') {
    stepDrache(game, b, dt, prevFeet);
    return;
  }
  if (b.kind === 'schildkroete') {
    stepSchildkroete(game, b, dt, prevFeet);
    return;
  }

  const parts = b.parts;
  for (let i = 0; i < parts.length; i++) movePart(game, parts[i], dt);
  touchParts(game, b, prevFeet);
  compactParts(b);
  syncBody(b);
  checkDefeat(game, b);
}

function hitBoss(game, b, how) {
  if (b.kind === 'dreikopf') {
    if (how === 'arrow') hitFlyer(game, b, DRE.arrowDmg);
    return;
  }
  if (b.kind === 'drache') {
    if (how === 'arrow') hitDrache(game, b, DRA.arrowDmg);
    return;
  }
  if (b.kind === 'schildkroete') {
    if (how === 'arrow') hitSchildkroete(game, b, TUR.arrowDmg);
    return;
  }
  if (b.state !== 'fight') return;
  const target = largestPart(b.parts);
  if (!target || target.invuln > 0) return;
  splitPart(game, b, target);
  compactParts(b);
  syncBody(b);
  checkDefeat(game, b);
}

// ---------- Teile ----------

// Ein Teil: Schwerkraft, Sprung zum Spieler alle hopEvery s (nur am Boden), Kollision mit der Karte.
function movePart(game, part, dt) {
  const map = game.map;
  const s = SLIME[part.size];
  part.invuln = Math.max(0, part.invuln - dt);
  part.animTime += dt;
  part.hopT -= dt;
  part.vy = Math.min(part.vy + PHYS.gravity * dt, PHYS.maxFall);
  if (part.onGround) {
    if (part.hopT <= 0) {
      const p = game.player;
      const dir = p.x + p.w / 2 >= part.x + part.w / 2 ? 1 : -1;
      part.vx = dir * s.hopVx;
      part.vy = s.hopVy;
      part.hopT = s.hopEvery;
    } else {
      part.vx = 0;
    }
  }
  const res = moveAndCollide(part, map, dt);
  part.onGround = res.onGround;
  if (part.y > map.rows * T + OFF_LEVEL) part.gone = true;
}

function overlapsPlayer(part, p) {
  return part.x < p.x + p.w && part.x + part.w > p.x && part.y < p.y + p.h && part.y + part.h > p.y;
}

// Kontakt Spieler–Teile: Stampfen teilt (mit Abprall), Stern teilt, sonst seitlich Schaden.
// prevFeet = Fußposition des Spielers vor dem Schritt. Neu entstandene Teile werden erst im nächsten Schritt geprüft.
function touchParts(game, b, prevFeet) {
  const p = game.player;
  const parts = b.parts;
  const n = parts.length;
  for (let i = 0; i < n; i++) {
    const part = parts[i];
    if (part.gone || !overlapsPlayer(part, p)) continue;
    if (p.vy > 0 && prevFeet <= part.y + part.h * 0.5) {
      if (part.invuln <= 0) splitPart(game, b, part);
      p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
      continue;
    }
    if (p.star > 0) {
      if (part.invuln <= 0) splitPart(game, b, part);
      continue;
    }
    if (p.invuln <= 0) game.hurtPlayer('boss');
  }
}

// Teil trifft: großes → 2 mittlere (Abstoß nach links/rechts); mittleres → 2 Schleim-Mobs (fromBoss).
// Das getroffene Teil wird als gone markiert und erst von compactParts entfernt.
function splitPart(game, b, part) {
  part.gone = true;
  const cx = part.x + part.w / 2;
  const foot = part.y + part.h;
  if (part.size === 'l') {
    pushPart(b, 'm', cx - SLIME_PART_DX, foot, -SPLIT_VX, SPLIT_VY);
    pushPart(b, 'm', cx + SLIME_PART_DX, foot, SPLIT_VX, SPLIT_VY);
  } else {
    for (let k = -1; k <= 1; k += 2) {
      const m = game.spawnMob('slimeSmall', cx + k * SLIME_SPAWN_DX, foot);
      if (m) m.fromBoss = true;
    }
  }
  game.addScore(HIT_SCORE);
  game.emit('bossHit', { size: part.size });
}

function compactParts(b) {
  const parts = b.parts;
  let n = 0;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].gone) parts[n++] = parts[i];
  }
  parts.length = n;
}

// Größtes lebendes Teil (bei Gleichstand das erste).
function largestPart(parts) {
  let best = null;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.gone && (best === null || p.w > best.w)) best = p;
  }
  return best;
}

// Boss-Körper = größtes Teil; hp = Anzahl Teile (Anzeige).
function syncBody(b) {
  b.hp = b.parts.length;
  const big = largestPart(b.parts);
  if (!big) return;
  b.x = big.x;
  b.y = big.y;
  b.w = big.w;
  b.h = big.h;
  b.vx = big.vx;
  b.vy = big.vy;
  b.onGround = big.onGround;
  if (big.vx !== 0) b.face = big.vx < 0 ? -1 : 1;
  b.anim = big.anim;
  b.animTime = big.animTime;
}

// Besiegt: keine Teile mehr und kein lebender Schleim aus dem Boss.
function checkDefeat(game, b) {
  if (b.parts.length > 0) return;
  const mobs = game.mobs || [];
  for (let i = 0; i < mobs.length; i++) {
    if (mobs[i].fromBoss && !mobs[i].dead) return;
  }
  b.state = 'defeated';
  b.active = false;
  b.hp = 0;
  game.addScore(DEFEAT_SCORE);
  game.emit('bossHit', { defeated: true });
  game.defeatBoss();
}

// ---------- Dreikopf ----------

// Aktiv, sobald der Spieler in der Arena (halbe Breite um den Spawn) steht. Dreikopf und Drache.
function nearFlyer(game, b) {
  const p = game.player;
  const arena = b.kind === 'drache' ? DRA.arena : DRE.arena;
  return Math.abs(p.x + p.w / 2 - b.ai.homeX) <= (arena.w / 2) * T;
}

// Ein Schritt: Salvenzähler, Sturzflug, Schweben (Sinus), Kontakt mit dem Spieler.
function stepDreikopf(game, b, dt, prevFeet) {
  const ai = b.ai;
  const p = game.player;
  ai.t += dt;
  b.animTime += dt;
  b.invuln = Math.max(0, b.invuln - dt);
  b.phase = b.hp <= DRE.hp * DRE.enrageAt ? 2 : 1;

  const px = p.x + p.w / 2;
  const hoverTop = ai.homeTop + Math.sin(ai.t * DRE.bobSpeed) * DRE_BOB;
  const cx = ai.homeX + Math.sin(ai.t * DRE_OMEGA_X) * DRE_SWAY;

  ai.shootT -= dt;
  if (ai.shootT <= 0) {
    fireSalvo(game, b);
    ai.shootT = b.phase === 2 ? DRE.shootEveryEnraged : DRE.shootEvery;
    ai.diveT = DRE.diveTime;
    // Sturzflugziel wird beim Start fixiert (sonst liefe der Boss dem Spieler beim Springen hinterher).
    ai.diveTop = Math.max(hoverTop, p.y + p.h - DRE.diveFeet);
  }
  if (ai.diveT > 0) ai.diveT -= dt;
  b.state = ai.diveT > 0 ? 'dive' : 'fight';

  // Zielhöhe (Oberkante): Schwebehöhe; im Sturzflug das fixierte Ziel, wenn der Spieler nahe ist.
  let targetTop = hoverTop;
  if (b.state === 'dive' && Math.abs(px - cx) <= DRE.diveRange * T) targetTop = ai.diveTop;
  const oldX = b.x, oldY = b.y;
  const maxStep = DRE.diveSpeed * dt;
  b.x = cx - b.w / 2;
  b.y += Math.max(-maxStep, Math.min(maxStep, targetTop - b.y));
  b.vx = (b.x - oldX) / dt;
  b.vy = (b.y - oldY) / dt;
  b.face = px >= cx ? 1 : -1;
  b.onGround = false;

  touchFlyer(game, b, prevFeet);
}

// Salve: Schädel vom Körpermittelpunkt in Richtung Spieler, symmetrischer Fächer.
function fireSalvo(game, b) {
  const p = game.player;
  const n = b.phase === 2 ? DRE.skullsEnraged : DRE.skulls;
  const sx = b.x + b.w / 2;
  const sy = b.y + b.h / 2;
  const base = Math.atan2(p.y + p.h / 2 - sy, p.x + p.w / 2 - sx);
  for (let i = 0; i < n; i++) {
    const off = n > 1 ? -DRE.fan + (2 * DRE.fan * i) / (n - 1) : 0;
    const a = base + off;
    if (spawnProjectile(game, 'skull', sx, sy, Math.cos(a) * DRE.skullSpeed, Math.sin(a) * DRE.skullSpeed)) b.shots++;
  }
  b.salvos++;
}

// Kontakt: Stampfen von oben (Abprall, Schaden), Stern (Schaden), sonst seitlich Schaden für den Spieler.
function touchFlyer(game, b, prevFeet) {
  const p = game.player;
  if (!overlapsPlayer(b, p)) return;
  if (p.vy > 0 && prevFeet <= b.y + b.h * 0.5) {
    hitFlyer(game, b, DRE.stompDmg);
    p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
    return;
  }
  if (p.star > 0) {
    hitFlyer(game, b, DRE.stompDmg);
    return;
  }
  if (p.invuln <= 0) game.hurtPlayer('boss');
}

// Treffer: Energie senken, 1,2 s Unverwundbarkeit, 500 Punkte; bei 0 Sieg.
function hitFlyer(game, b, dmg) {
  if (b.state !== 'fight' && b.state !== 'dive') return;
  if (b.invuln > 0) return;
  b.hp = Math.max(0, b.hp - dmg);
  b.invuln = DRE.invulnTime;
  game.addScore(HIT_SCORE);
  game.emit('bossHit', { hp: b.hp });
  if (b.hp <= 0) defeatFlyer(game, b);
}

// Sieg: Zustand zuerst setzen (Explosion trifft den Boss dann nicht mehr), Explosion, Punkte, defeatBoss.
function defeatFlyer(game, b, radius = DRE.defeatRadius) {
  b.state = 'defeated';
  b.active = false;
  b.invuln = 0;
  b.hp = 0;
  explode(game, b.x + b.w / 2, b.y + b.h / 2, radius);
  game.addScore(DEFEAT_SCORE);
  game.emit('bossHit', { defeated: true });
  game.defeatBoss();
}

// ---------- Leerendrache ----------

const DRA = BOSSES.drache;
const DRA_RX = DRA.flyRange.w * T;            // px: Ellipse horizontal um den Spawn
const DRA_RY = DRA.flyRange.h * T;            // px: Ellipse vertikal
const DRA_HOVER = DRA.hover * T;              // px: Mittelpunkt der Ellipse über dem Boden
const DRA_OMEGA = 2 * Math.PI / DRA.lapTime;  // rad/s
const CRYSTAL_SCORE = 200;
const PT = { x: 0, y: 0 };                    // Rückgabepuffer (kein Neuanlegen im Schritt)
const BL = { x: 0, y: 0 };

function makeDrache(x, y) {
  const b = newBoss('drache', 0, 0, DRA.w, DRA.h);
  b.anim = 'boss_drache';
  b.hp = DRA.hp;
  b.maxHp = DRA.hp;
  b.phase = 1;
  b.shots = 0;    // Zähler: erzeugte Feuerbälle
  // Start oben auf der Ellipse; ai.angle läuft die Ellipse ab.
  b.ai = { homeX: x, groundY: y, angle: -Math.PI / 2, shootT: DRA.fireEvery, timer: 0, transit: 0, fromX: x, fromY: y - DRA_HOVER };
  const fp = flyPoint(b.ai);
  placeCenter(b, fp.x, fp.y);
  return b;
}

// Ellipsenpunkt der Flugbahn (Mittelpunkt).
function flyPoint(ai) {
  PT.x = ai.homeX + DRA_RX * Math.cos(ai.angle);
  PT.y = ai.groundY - DRA_HOVER + DRA_RY * Math.sin(ai.angle);
  return PT;
}

// Sitzposition: Mitte auf dem Sockel, Unterkante auf dem Boden.
function perchPoint(ai) {
  PT.x = ai.homeX;
  PT.y = ai.groundY - DRA.perchH / 2;
  return PT;
}

// Mittelpunkt setzen (Körper = Rechteck um die Mitte).
function placeCenter(b, cx, cy) {
  b.x = cx - b.w / 2;
  b.y = cy - b.h / 2;
}

// Größe ändern, Mittelpunkt bleibt.
function setSize(b, w, h) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  b.w = w;
  b.h = h;
  placeCenter(b, cx, cy);
}

// Übergang (Start- bis Zielpunkt) über ai.transit Sekunden, weich (Smoothstep). Ohne Übergang das Ziel.
function blendToward(ai, tx, ty) {
  if (ai.transit <= 0) {
    BL.x = tx;
    BL.y = ty;
    return BL;
  }
  const p = 1 - ai.transit / DRA.transitTime;
  const s = p * p * (3 - 2 * p);
  BL.x = ai.fromX + (tx - ai.fromX) * s;
  BL.y = ai.fromY + (ty - ai.fromY) * s;
  return BL;
}

function aliveCrystals(game) {
  const list = game.crystals || [];
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i].alive !== false) n++;
  return n;
}

function centerX(b) { return b.x + b.w / 2; }
function centerY(b) { return b.y + b.h / 2; }

// Start der Landung: aus der Luft zum Sockel.
function beginLand(b) {
  const ai = b.ai;
  b.state = 'land';
  b.phase = 2;
  ai.fromX = centerX(b);
  ai.fromY = centerY(b);
  ai.transit = DRA.transitTime;
}

// Sitzen: verwundbar, Körper auf dem Boden (perch-Größe).
function beginPerch(b) {
  const ai = b.ai;
  b.state = 'perch';
  setSize(b, DRA.perchW, DRA.perchH);
  const pp = perchPoint(ai);
  placeCenter(b, pp.x, pp.y);
  ai.timer = DRA.perchTime;
  ai.transit = 0;
}

// Wieder aufsteigen (Phase 2): aus dem Sitz zur Ellipse, dann flyTime s Flug.
function beginFly(b) {
  const ai = b.ai;
  b.state = 'fly';
  setSize(b, DRA.w, DRA.h);
  ai.fromX = centerX(b);
  ai.fromY = centerY(b);
  ai.transit = DRA.transitTime;
  ai.timer = DRA.flyTime;
  ai.shootT = DRA.fireEveryEnraged;
}

// Ein Schritt des Drachen.
function stepDrache(game, b, dt, prevFeet) {
  const ai = b.ai;
  const p = game.player;
  const oldCx = centerX(b), oldCy = centerY(b);
  b.animTime += dt;
  b.invuln = Math.max(0, b.invuln - dt);
  ai.transit = Math.max(0, ai.transit - dt);

  crystalPass(game, b, prevFeet);
  if (b.phase === 1 && aliveCrystals(game) === 0) beginLand(b);

  if (b.state === 'fly') {
    ai.angle += DRA_OMEGA * dt;
    const fp = flyPoint(ai);
    const q = blendToward(ai, fp.x, fp.y);
    placeCenter(b, q.x, q.y);
    ai.shootT -= dt;
    if (ai.shootT <= 0) {
      fireFireball(game, b);
      ai.shootT = b.phase === 2 ? DRA.fireEveryEnraged : DRA.fireEvery;
    }
    if (b.phase === 2) {
      ai.timer -= dt;
      if (ai.timer <= 0) beginLand(b);
    }
  } else if (b.state === 'land') {
    const pp = perchPoint(ai);
    const q = blendToward(ai, pp.x, pp.y);
    placeCenter(b, q.x, q.y);
    if (ai.transit <= 0) beginPerch(b);
  } else if (b.state === 'perch') {
    ai.timer -= dt;
    if (ai.timer <= 0) beginFly(b);
  }

  const cx = centerX(b);
  const cy = centerY(b);
  b.vx = (cx - oldCx) / dt;
  b.vy = (cy - oldCy) / dt;
  b.face = p.x + p.w / 2 >= cx ? 1 : -1;
  b.onGround = b.state === 'perch';
  b.anim = b.state === 'perch' ? 'boss_drache_perch' : 'boss_drache';

  touchDrache(game, b, prevFeet);
}

// Kristalle: Stampfen zerstört einen (Abprall). Jeder zerstörte Kristall zählt einmal: 200 Punkte, Events.
function crystalPass(game, b, prevFeet) {
  const p = game.player;
  const list = game.crystals || [];
  for (let i = 0; i < list.length; i++) {
    const cr = list[i];
    if (cr.alive !== false && overlapsPlayer(cr, p) && p.vy > 0 && prevFeet <= cr.y + cr.h * 0.5) {
      cr.alive = false;
      p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
    }
    if (cr.alive === false && !cr.counted) {
      cr.counted = true;
      game.addScore(CRYSTAL_SCORE);
      game.emit('crystal', { index: i });
      game.emit('bossHit', { crystals: aliveCrystals(game) });
    }
  }
}

// Feuerball von der Körpermitte auf den Spieler (Tempo fireSpeed).
function fireFireball(game, b) {
  const p = game.player;
  const sx = centerX(b), sy = centerY(b);
  const dx = p.x + p.w / 2 - sx, dy = p.y + p.h / 2 - sy;
  const d = Math.hypot(dx, dy) || 1;
  if (spawnProjectile(game, 'fire', sx, sy, dx / d * DRA.fireSpeed, dy / d * DRA.fireSpeed)) b.shots++;
}

// Kontakt: im Sitzen Stampfen von oben (Schaden, Abprall) und Stern (Schaden); sonst Schaden für den Spieler.
// Im Flug und bei der Landung verletzt jede Berührung (Stern ausgenommen).
function touchDrache(game, b, prevFeet) {
  const p = game.player;
  if (!overlapsPlayer(b, p)) return;
  if (b.state === 'perch') {
    if (p.vy > 0 && prevFeet <= b.y + b.h * 0.5) {
      hitDrache(game, b, DRA.stompDmg);
      p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
      return;
    }
    if (p.star > 0) {
      hitDrache(game, b, DRA.stompDmg);
      return;
    }
  }
  if (p.star > 0) return;
  if (p.invuln <= 0) game.hurtPlayer('boss');
}

// Schaden nur im Sitzen, 1,2 s Unverwundbarkeit danach; bei 0 Sieg.
function hitDrache(game, b, dmg) {
  if (b.state !== 'perch' || b.invuln > 0) return;
  b.hp = Math.max(0, b.hp - dmg);
  b.invuln = DRA.invulnTime;
  game.addScore(HIT_SCORE);
  game.emit('bossHit', { hp: b.hp });
  if (b.hp <= 0) defeatFlyer(game, b, DRA.defeatRadius);
}


// ---------- Riesenschildkröte ----------

const TUR = BOSSES.schildkroete;

function makeSchildkroete(x, y) {
  const w = TUR.w, h = TUR.h;
  const b = newBoss('schildkroete', x - w / 2, y - h, w, h);
  b.anim = 'boss_schildkroete';
  b.hp = TUR.hp;
  b.maxHp = TUR.hp;
  b.phase = 1;
  b.shellTimer = 0;
  b.shellDir = -1;
  b.onGround = true;
  return b;
}

function enterShell(b, dir = -1) {
  b.state = 'shell';
  b.anim = 'boss_schildkroete_shell';
  b.shellTimer = TUR.shellTime;
  b.shellDir = dir !== 0 ? dir : -1;
  b.face = b.shellDir;
}

function exitShell(b) {
  b.state = 'fight';
  b.anim = 'boss_schildkroete';
  b.shellTimer = 0;
  b.vx = 0;
}

function stepSchildkroete(game, b, dt, prevFeet) {
  const p = game.player;
  b.animTime += dt;
  b.invuln = Math.max(0, b.invuln - dt);

  if (b.hp <= b.maxHp * 0.5) b.phase = 2;

  // Schwerkraft
  b.vy = Math.min(PHYS.maxFall, b.vy + PHYS.gravity * dt);

  if (b.state === 'fight') {
    b.face = (p.x + p.w / 2 < b.x + b.w / 2) ? -1 : 1;
    b.vx = b.face * TUR.speed;
  } else if (b.state === 'shell') {
    b.shellTimer -= dt;
    const speed = b.phase === 2 ? TUR.shellSpeedEnraged : TUR.shellSpeed;
    b.vx = b.shellDir * speed;
    if (b.shellTimer <= 0) {
      exitShell(b);
    }
  }

  const col = moveAndCollide(b, game.map, dt);
  b.onGround = col.onGround;

  if (b.state === 'shell' && col.hitWall) {
    b.shellDir = -b.shellDir;
    b.face = b.shellDir;
    game.emit('bossHit', { wall: true });
  }

  touchSchildkroete(game, b, prevFeet);
}

function touchSchildkroete(game, b, prevFeet) {
  const p = game.player;
  if (!overlapsPlayer(b, p)) return;

  const stompOver = p.vy > 0 && prevFeet <= b.y + b.h * 0.5;

  if (b.state === 'fight') {
    if (stompOver || p.star > 0) {
      hitSchildkroete(game, b, TUR.stompDmg);
      p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
      const dir = (p.x + p.w / 2 < b.x + b.w / 2) ? 1 : -1;
      enterShell(b, dir);
      return;
    }
  } else if (b.state === 'shell') {
    if (stompOver || p.star > 0) {
      p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
      b.shellDir = -b.shellDir;
      b.face = b.shellDir;
      game.emit('bossHit', { deflected: true });
      return;
    }
  }

  if (p.star > 0) return;
  if (p.invuln <= 0) game.hurtPlayer('boss');
}

function hitSchildkroete(game, b, dmg) {
  if (b.invuln > 0 || b.state === 'defeated') return;
  b.hp = Math.max(0, b.hp - dmg);
  b.invuln = TUR.invulnTime;
  game.addScore(HIT_SCORE);
  game.emit('bossHit', { hp: b.hp });
  if (b.hp <= 0) {
    defeatFlyer(game, b, TUR.defeatRadius);
  } else if (b.state === 'fight') {
    const dir = (game.player.x + game.player.w / 2 < b.x + b.w / 2) ? 1 : -1;
    enterShell(b, dir);
  }
}

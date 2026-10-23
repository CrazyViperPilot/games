import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { Game } from '../js/game/game.js';
import { createBoss, updateBoss, damageBoss } from '../js/game/bosses.js';
import { explode } from '../js/game/explode.js';
import { BOSSES } from '../js/data/mobs.js';

const T = PHYS.tile;
const DT = 1 / 60;
const STEP = PHYS.step;
const COLS = 60;
const ROWS = 14;
const BOSS_C = 40;           // Spalte des Spawns '@'
const GROUND_Y = 12 * T;     // Oberkante der Standzeile (Zeile 12 = S)
const FAR_X = 400;           // Spieler weit weg von der Arena (Parkposition)

// Arena: Zeile 12 fest (S), Zeile 13 Grundgestein (Z), sonst Luft. P links, F rechts, '@' in der Mitte.
function makeRows(cells = {}, floor = 'S') {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let s = '';
    for (let c = 0; c < COLS; c++) {
      const key = `${c},${r}`;
      if (key in cells) s += cells[key];
      else if (r === ROWS - 1) s += 'Z';
      else if (r === ROWS - 2) s += floor;
      else s += '.';
    }
    rows.push(s);
  }
  return rows;
}

function makeGame(save = { lives: 99, power: 'bow' }, kind = 'slimeking') {
  const events = [];
  const rows = makeRows({ '2,11': 'P', '58,11': 'F', [`${BOSS_C},11`]: '@' }, kind === 'dreikopf' ? 'Z' : 'S');
  const game = new Game({
    level: { id: 'test', theme: 'overworld', rows, boss: kind },
    save,
    onEvent: (name, data) => events.push({ name, data }),
  });
  game.locks = 0;
  game.lockArena = () => { game.locks++; };
  const count = (name) => events.filter((e) => e.name === name).length;
  return { game, events, count };
}

function input(over = {}) {
  return {
    left: false, right: false, jump: false, dig: false, fire: false,
    jumpPressed: false, digPressed: false, firePressed: false, ...over,
  };
}

function run(game, steps, dt = DT) {
  for (let i = 0; i < steps; i++) game.update(dt, input());
}

// Boss aktivieren: Spieler knapp innerhalb der Arena-Grenze, ein Schritt.
function activate(game) {
  const b = game.boss;
  game.player.x = b.x - 20 * T + 1;
  game.update(DT, input());
  assert.equal(b.state, 'fight');
  return b;
}

// Spieler stellt sich weit weg von der Arena auf den Boden.
function park(game) {
  const p = game.player;
  p.x = FAR_X;
  p.y = GROUND_Y - p.h;
  p.vy = 0;
  p.onGround = true;
}

// Alle Teile einfrieren (kein Hüpfen, keine Berührung mit dem Spieler).
function freeze(game) {
  for (const part of game.boss.parts) part.hopT = 1e9;
}

// Spieler fällt von oben auf ein Teil: Füße knapp über der Oberkante, dann ein Schritt.
function stompOn(game, part) {
  const p = game.player;
  part.hopT = 1e9;
  p.x = part.x + part.w / 2 - p.w / 2;
  p.y = part.y - p.h - 1;
  p.vy = 300;
  p.onGround = false;
  game.update(DT, input());
}

// Kurz warten, bis die Unverwundbarkeit frischer Teile abgelaufen ist (Teile bleiben eingefroren).
function waitInvuln(game) {
  freeze(game);
  park(game);
  run(game, 40);
}

test('createBoss: Felder für den Renderer, Fehler bei unbekanntem Typ', () => {
  const b = createBoss('slimeking', 100, 200);
  assert.equal(b.kind, 'slimeking');
  assert.equal(b.state, 'idle');
  assert.equal(b.active, false);
  assert.equal(b.w, 48);
  assert.equal(b.h, 48);
  assert.equal(b.x, 100 - 24);
  assert.equal(b.y, 200 - 48);
  assert.equal(b.parts.length, 1);
  assert.equal(b.parts[0].size, 'l');
  assert.equal(b.parts[0].anim, 'boss_slime_l');
  assert.equal(typeof b.update, 'function');
  assert.equal(typeof b.damage, 'function');
  assert.throws(() => createBoss('gibtsnicht', 0, 0), /Unbekannter/);
});

test('Parser-Spawn @ erzeugt den Boss des Levels', () => {
  const { game } = makeGame();
  assert.ok(game.boss);
  assert.equal(game.boss.kind, 'slimeking');
  assert.equal(game.mobs.some((m) => m.type === 'boss'), false);
});

test('Boss wird erst aktiv, wenn der Spieler die Arena betritt', () => {
  const { game, count } = makeGame();
  const b = game.boss;
  run(game, 240);
  assert.equal(b.state, 'idle');
  assert.equal(b.active, false);
  assert.equal(count('bossStart'), 0);

  game.player.x = b.x - 20 * T - 2;
  game.update(DT, input());
  assert.equal(b.state, 'idle');

  game.player.x = b.x - 20 * T + 1;
  game.update(DT, input());
  assert.equal(b.state, 'fight');
  assert.equal(b.active, true);
  assert.equal(count('bossStart'), 1);
  assert.equal(game.locks, 1);
});

test('Teile hüpfen zum Spieler hin', () => {
  const { game } = makeGame();
  const b = activate(game);
  const part = b.parts[0];
  const x0 = part.x;
  let hops = 0;
  let wasGround = part.onGround;
  for (let i = 0; i < 180; i++) {   // 3 s
    game.update(DT, input());
    if (wasGround && !part.onGround) hops++;
    wasGround = part.onGround;
  }
  assert.ok(hops >= 1, 'mindestens ein Sprung in 3 s');
  assert.ok(part.x < x0 - 20, 'Teil ist nach links zum Spieler gewandert');
});

test('Stampfer auf großes Teil: 2 × mittel, Abprall, Punkte', () => {
  const { game, count } = makeGame();
  const b = activate(game);
  const big = b.parts[0];
  const score0 = game.score;
  stompOn(game, big);

  assert.equal(b.parts.length, 2);
  assert.ok(b.parts.every((p) => p.size === 'm' && p.w === 32 && p.h === 32));
  assert.ok(b.parts[0].vx < 0 && b.parts[1].vx > 0, 'mittlere Teile fliegen auseinander');
  assert.ok(b.parts.every((p) => p.vy === -250));
  assert.ok(b.parts.every((p) => p.invuln > 0), 'neue Teile sind kurz unverwundbar');
  assert.equal(game.player.vy, -PHYS.stompBounce);
  assert.equal(game.score - score0, 500);
  assert.ok(count('bossHit') >= 1);
  assert.equal(b.state, 'fight');
});

test('Stampfer auf mittleres Teil: 2 Schleim-Mobs (fromBoss)', () => {
  const { game } = makeGame();
  const b = activate(game);
  stompOn(game, b.parts[0]);
  waitInvuln(game);

  const part = b.parts[0];
  const before = game.mobs.length;
  stompOn(game, part);

  assert.equal(b.parts.length, 1, 'ein mittleres Teil bleibt');
  const boss = game.mobs.slice(before).filter((m) => m.fromBoss);
  assert.equal(boss.length, 2);
  assert.ok(boss.every((m) => m.type === 'slimeSmall' && m.active && !m.dead));
  assert.ok(boss[0].x < boss[1].x, 'Schleime liegen links und rechts der Mitte');
});

test('Seitlicher Kontakt verletzt den Spieler, Teil bleibt', () => {
  const { game } = makeGame();
  const b = activate(game);
  const part = b.parts[0];
  freeze(game);
  const hurts = [];
  game.hurtPlayer = (cause) => hurts.push(cause);
  const p = game.player;
  p.x = part.x - p.w + 2;            // 2 px Überlappung von links
  p.y = part.y + 10;                 // Füße tief im Teil: kein Stampfen
  p.vy = 0;
  game.update(DT, input());
  assert.deepEqual(hurts, ['boss']);
  assert.equal(b.parts.length, 1);
});

test('Pfeil teilt das größte Teil, unverwundbar bis der Schutz abläuft', () => {
  const { game, count } = makeGame();
  const b = activate(game);
  damageBoss(game, 'arrow');
  assert.equal(b.parts.length, 2);
  assert.ok(b.parts.every((p) => p.size === 'm'));
  assert.ok(count('bossHit') >= 1);

  game.damageBoss('arrow');          // Teile noch unverwundbar
  assert.equal(b.parts.length, 2);

  waitInvuln(game);
  game.damageBoss('arrow');
  assert.equal(b.parts.length, 1);
  assert.equal(game.mobs.filter((m) => m.fromBoss).length, 2);
});

test('Explosion im Körper des Bosses teilt ihn', () => {
  const { game } = makeGame();
  const b = activate(game);
  freeze(game);
  park(game);
  explode(game, b.x + b.w / 2, b.y + b.h / 2, 2.5);
  assert.equal(b.parts.length, 2);
  assert.ok(b.parts.every((p) => p.size === 'm'));
});

test('Besiegt, wenn keine Teile und keine Boss-Schleime mehr leben', () => {
  const { game, count } = makeGame();
  const b = activate(game);
  let defeats = 0;
  const orig = game.defeatBoss.bind(game);
  game.defeatBoss = () => { defeats++; orig(); };

  damageBoss(game, 'arrow');         // l → 2 m
  waitInvuln(game);
  game.damageBoss('arrow');          // m → 2 Schleime
  waitInvuln(game);
  game.damageBoss('arrow');          // m → 2 Schleime, keine Teile mehr
  assert.equal(b.parts.length, 0);
  assert.equal(b.state, 'fight', 'Schleime leben noch');
  assert.equal(defeats, 0);

  const boss = game.mobs.filter((m) => m.fromBoss);
  assert.equal(boss.length, 4);
  for (const m of boss) game.killMob(m, 'explosion');
  run(game, 1);

  assert.equal(b.state, 'defeated');
  assert.equal(b.active, false);
  assert.equal(game.bossDefeated, true);
  assert.equal(defeats, 1);
  assert.equal(count('bossHit') >= 4, true);
  assert.ok(game.score >= 1500 + 5000);

  // Nach dem Sieg macht der Boss nichts mehr.
  const score = game.score;
  run(game, 30);
  assert.equal(b.state, 'defeated');
  assert.equal(defeats, 1);
  assert.equal(game.score, score);
});

test('Bot besiegt die Arena in unter 60 s (Schritt 1/120, updatePlayer)', () => {
  const { game } = makeGame({ lives: 99, power: 'bow' });
  const JUMP_NEAR = 40;   // px Abstand, ab dem der Bot aus dem Stand springt (Sprung landet auf dem Teil)
  const JUMP_FAR = 60;

  // Ziel: größtes lebendes Teil, sonst der nächste Schleim aus dem Boss. Vor der Arena nach rechts laufen.
  function botInput() {
    const p = game.player;
    const b = game.boss;
    const inp = input();
    if (b.state === 'idle') {
      inp.right = true;
      return inp;
    }
    let target = null;
    for (const part of b.parts) {
      if (!part.gone && (target === null || part.w > target.w)) target = part;
    }
    if (!target) {
      let best = Infinity;
      for (const m of game.mobs) {
        if (!m.fromBoss || m.dead) continue;
        const d = Math.abs(m.x + m.w / 2 - (p.x + p.w / 2));
        if (d < best) { best = d; target = m; }
      }
    }
    if (!target) return inp;
    const dx = (target.x + target.w / 2) - (p.x + p.w / 2);
    const adx = Math.abs(dx);
    if (!p.onGround) {
      // In der Luft auf das Ziel zu und den Sprung bis zum Scheitel halten.
      inp.left = dx < 0;
      inp.right = dx > 0;
      inp.jump = p.vy < 0;
    } else if (adx > JUMP_FAR) {
      inp.left = dx < 0;
      inp.right = dx > 0;
    } else if (adx >= JUMP_NEAR) {
      inp.jump = true;
      inp.jumpPressed = true;
      inp.left = dx < 0;
      inp.right = dx > 0;
    }
    return inp;
  }

  const maxSteps = 60 / STEP;
  let steps = 0;
  while (game.boss.state !== 'defeated' && steps < maxSteps) {
    game.update(STEP, botInput());
    steps++;
  }
  assert.equal(game.boss.state, 'defeated', `nicht besiegt nach ${(steps * STEP).toFixed(1)} s (Leben ${game.lives}, Zustand ${game.state})`);
  assert.ok(steps * STEP < 60);
});

// ---------- Dreikopf ----------

const DRE = BOSSES.dreikopf;

function drei(save) {
  return makeGame(save, 'dreikopf');
}

// Spieler steht am Boden weit weg, dann in die Arena (fünf Kacheln links der Boss-Mitte). Boss wird aktiv.
function activateDrei(game) {
  const b = game.boss;
  park(game);
  game.player.x = b.x + b.w / 2 - 5 * T - game.player.w / 2;
  game.update(DT, input());
  assert.equal(b.state, 'fight');
  return b;
}

// Spieler fällt von oben auf den Dreikopf (Füße knapp über der Oberkante, dann ein Schritt).
function stompDrei(game, b) {
  const p = game.player;
  p.x = b.x + b.w / 2 - p.w / 2;
  p.y = b.y - p.h - 1;
  p.vy = 300;
  p.onGround = false;
  game.update(DT, input());
}

function skulls(game) {
  return (game.projectiles || []).filter((o) => o.active && o.type === 'skull').length;
}

function runUntil(game, pred, maxSec = 20) {
  let t = 0;
  while (!pred() && t < maxSec) {
    game.update(DT, input());
    t += DT;
  }
  assert.ok(pred(), 'Bedingung nicht erreicht');
  return t;
}

test('Dreikopf: createBoss liefert die Felder für den Renderer', () => {
  const b = createBoss('dreikopf', 100, 200);
  assert.equal(b.kind, 'dreikopf');
  assert.equal(b.state, 'idle');
  assert.equal(b.active, false);
  assert.equal(b.w, 48);
  assert.equal(b.h, 40);
  assert.equal(b.anim, 'boss_dreikopf');
  assert.equal(b.hp, DRE.hp);
  assert.equal(b.maxHp, DRE.hp);
  assert.equal(b.x, 100 - 24);
  assert.equal(b.y + b.h, 200 - 5 * T, 'Unterkante 5 Kacheln über dem Spawn');
  assert.equal(b.parts.length, 0);
  assert.equal(typeof b.update, 'function');
  assert.equal(typeof b.damage, 'function');
});

test('Dreikopf: Parser-Spawn @ erzeugt den Boss', () => {
  const { game } = drei();
  assert.equal(game.boss.kind, 'dreikopf');
});

test('Dreikopf: wird erst aktiv, wenn der Spieler in der Arena steht', () => {
  const { game, count } = drei();
  const b = game.boss;
  park(game);
  run(game, 240);
  assert.equal(b.state, 'idle');
  assert.equal(count('bossStart'), 0);
  activateDrei(game);
  assert.equal(count('bossStart'), 1);
  assert.equal(game.locks, 1);
});

test('Dreikopf: schwebt in der Höhenbande und pendelt, ohne Sturzflug bei entferntem Spieler', () => {
  const { game } = drei();
  const b = activateDrei(game);
  park(game);
  let minB = Infinity, maxB = -Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 15 * 60; i++) {
    game.update(DT, input());
    const bottom = b.y + b.h;
    minB = Math.min(minB, bottom);
    maxB = Math.max(maxB, bottom);
    const cx = b.x + b.w / 2;
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    assert.ok(b.state === 'fight' || b.state === 'dive');
  }
  const floor = GROUND_Y;
  assert.ok(minB >= floor - 6 * T - 0.5 && maxB <= floor - 4 * T + 0.5, `Unterkante ${minB}..${maxB}`);
  assert.ok(maxB - minB > 20, 'vertikale Bewegung');
  const home = BOSS_C * T + T / 2;
  assert.ok(minX >= home - 6 * T - 1 && maxX <= home + 6 * T + 1, `x ${minX}..${maxX}`);
  assert.ok(maxX - minX > 150, 'horizontale Bewegung');
});

test('Dreikopf: Salve alle 3 s mit 3 Schädeln, in Phase 2 alle 2 s mit 5', () => {
  const { game } = drei();
  const b = activateDrei(game);
  park(game);
  const t1 = runUntil(game, () => b.salvos >= 1);
  assert.ok(Math.abs(t1 - DRE.shootEvery) < 0.05, `erste Salve nach ${t1} s`);
  assert.equal(b.shots, DRE.skulls);
  assert.equal(skulls(game), DRE.skulls);

  const t2 = runUntil(game, () => b.salvos >= 2);
  assert.ok(Math.abs(t2 - DRE.shootEvery) < 0.05, `zweite Salve nach ${t2} s`);
  assert.equal(b.shots, 2 * DRE.skulls);

  b.hp = DRE.hp / 2;                       // Phase 2 ab hier
  const shots0 = b.shots;
  runUntil(game, () => b.salvos >= 3);     // Intervall der laufenden Pause noch Phase 1
  assert.equal(b.shots - shots0, DRE.skullsEnraged);
  assert.equal(b.phase, 2);
  const t4 = runUntil(game, () => b.salvos >= 4);
  assert.ok(Math.abs(t4 - DRE.shootEveryEnraged) < 0.05, `Phase-2-Salve nach ${t4} s`);
});

test('Dreikopf: Phase 2 ab halber Energie', () => {
  const { game } = drei();
  const b = activateDrei(game);
  assert.equal(b.phase, 1);
  b.hp = DRE.hp / 2 + 1;
  run(game, 1);
  assert.equal(b.phase, 1);
  b.hp = DRE.hp / 2;
  run(game, 1);
  assert.equal(b.phase, 2);
});

test('Dreikopf: Stampfer = 1 Schaden, Abprall, Unverwundbarkeit 1,2 s, 500 Punkte', () => {
  const { game, count } = drei();
  const b = activateDrei(game);
  const score0 = game.score;
  stompDrei(game, b);
  assert.equal(b.hp, DRE.hp - DRE.stompDmg);
  assert.equal(game.player.vy, -PHYS.stompBounce);
  assert.equal(game.score - score0, 500);
  assert.ok(count('bossHit') >= 1);
  assert.ok(b.invuln > DRE.invulnTime - 0.1 && b.invuln <= DRE.invulnTime);

  stompDrei(game, b);                      // unverwundbar: kein Schaden, der Spieler prallt trotzdem ab
  assert.equal(b.hp, DRE.hp - DRE.stompDmg);
  assert.equal(game.player.vy, -PHYS.stompBounce);

  run(game, Math.ceil((DRE.invulnTime + 0.1) / DT));
  stompDrei(game, b);
  assert.equal(b.hp, DRE.hp - 2 * DRE.stompDmg);
});

test('Dreikopf: Pfeil 1 Schaden, Explosion wirkt nicht, Pfeil in Schutzzeit ohne Wirkung', () => {
  const { game } = drei();
  const b = activateDrei(game);
  damageBoss(game, 'explosion');
  assert.equal(b.hp, DRE.hp);
  damageBoss(game, 'arrow');
  assert.equal(b.hp, DRE.hp - DRE.arrowDmg);
  game.damageBoss('arrow');
  assert.equal(b.hp, DRE.hp - DRE.arrowDmg, 'Schutzzeit');
  run(game, Math.ceil((DRE.invulnTime + 0.1) / DT));
  game.damageBoss('arrow');
  assert.equal(b.hp, DRE.hp - 2 * DRE.arrowDmg);
});

test('Dreikopf: seitlicher Kontakt verletzt den Spieler, der Boss bleibt', () => {
  const { game } = drei();
  const b = activateDrei(game);
  const hurts = [];
  game.hurtPlayer = (cause) => hurts.push(cause);
  const p = game.player;
  p.x = b.x - p.w + 2;
  p.y = b.y + 20;
  p.vy = 0;
  game.update(DT, input());
  assert.deepEqual(hurts, ['boss']);
  assert.equal(b.hp, DRE.hp);
});

test('Dreikopf: Sturzflug nach der Salve auf Spielerhöhe, wenn der Spieler nahe ist', () => {
  const { game } = drei();
  const b = activateDrei(game);
  const p = game.player;
  park(game);
  p.x = b.x + b.w / 2 - p.w / 2;           // direkt unter dem Boss
  const hurts = [];
  game.hurtPlayer = (cause) => hurts.push(cause);
  b.ai.shootT = 0;                         // nächste Salve sofort
  run(game, 48);                           // 0,8 s
  assert.equal(b.state, 'dive');
  const feet = p.y + p.h;
  assert.ok(Math.abs(b.y - (feet - DRE.diveFeet)) < 1, `Oberkante ${b.y} statt ${feet - DRE.diveFeet}`);
  run(game, 60);                           // Sturzflug vorbei (1,5 s), Boss steigt wieder
  assert.equal(b.state, 'fight');
  assert.ok(b.y < feet - DRE.diveFeet - 20, 'steigt zurück');
});

test('Dreikopf: kein Sturzflug, wenn der Spieler weit weg ist', () => {
  const { game } = drei();
  const b = activateDrei(game);
  park(game);
  b.ai.shootT = 0;
  run(game, 180);
  assert.equal(b.salvos, 1);
  assert.equal(b.state, 'fight');
});

test('Dreikopf: Sieg bei 0 Energie: Explosion, defeatBoss, danach inaktiv', () => {
  const { game, count } = drei();
  const b = activateDrei(game);
  let defeats = 0;
  const orig = game.defeatBoss.bind(game);
  game.defeatBoss = () => { defeats++; orig(); };
  b.hp = DRE.arrowDmg;
  const score0 = game.score;
  damageBoss(game, 'arrow');
  assert.equal(b.hp, 0);
  assert.equal(b.state, 'defeated');
  assert.equal(b.active, false);
  assert.equal(defeats, 1);
  assert.equal(game.bossDefeated, true);
  assert.equal(game.score - score0, 500 + 5000);
  assert.ok(game.shake > 0, 'Schüttelbewegung');
  assert.ok(count('bossHit') >= 1);

  const score = game.score;
  run(game, 60);
  assert.equal(b.state, 'defeated');
  assert.equal(defeats, 1);
  assert.equal(game.score, score);
});

// Bot für den Dreikopf: weicht Schädeln aus (Bahnen 1,5 s voraus, Richtung mit dem größten Abstand), hält Abstand
// zum Boss, stampft ihn im Sturzflug (Sprung unter die Oberkante) und schießt mit Bogen Pfeile mit Vorhalt.
// Richtung (-1, 0, 1): ohne Bedrohung 0 (dann normal laufen), sonst die Richtung mit dem größten Mindestabstand
// zu den Schädelbahnen in den nächsten 1,5 s (mit Abstrafung, wenn der Boss dadurch zu weit weg käme).
function dodge(game) {
  const p = game.player;
  const b = game.boss;
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  const bcx = b.x + b.w / 2;
  const skulls = (game.projectiles || []).filter((o) => o.active && o.type === 'skull');
  const minDist = (dir, horizon = 1.5) => {
    let m = Infinity;
    for (const o of skulls) {
      for (let k = 0; k <= horizon * 10; k++) {
        const tau = k * 0.1;
        const d = Math.hypot(pcx + dir * 75 * tau - (o.x + o.vx * tau), pcy - (o.y + o.vy * tau));
        if (d < m) m = d;
      }
    }
    return m;
  };
  const score = (dir) => {
    const adxAfter = Math.abs(bcx - (pcx + dir * 37));
    return minDist(dir) - 1.5 * Math.max(0, Math.abs(adxAfter - 50) - 15);
  };
  if (minDist(0) >= 40 || minDist(0, 0.9) >= 40) return 0;
  let best = 0, bestS = score(0);
  for (const dir of [-1, 1]) {
    const s = score(dir);
    if (s > bestS + 4) { best = dir; bestS = s; }
  }
  return best;
}

function dreBotInput(game) {
  const p = game.player;
  const b = game.boss;
  const inp = input();
  if (b.state === 'idle') { inp.right = true; return inp; }
  if (b.state === 'defeated') return inp;
  const pcx = p.x + p.w / 2;
  const dx = (b.x + b.w / 2) - pcx;
  const adx = Math.abs(dx);
  const feet = p.y + p.h;
  const dir = dodge(game);
  if (dir !== 0) {
    inp.left = dir < 0;
    inp.right = dir > 0;
  } else if (p.onGround) {
    // Im Sturzflug aus ~45 px seitlich unter den Boss; sonst auf 50–64 px bleiben (Sturzflug-Reichweite 64 px).
    const band = b.state === 'dive' ? [38, 56] : [50, 64];
    if (adx < band[0]) { inp.left = dx > 0; inp.right = dx < 0; }
    else if (adx > band[1]) { inp.left = dx < 0; inp.right = dx > 0; }
  }
  const rc = (p.y + p.h) - (b.y + b.h / 2);     // Höhe der Bossmitte über den Füßen
  const top = (p.y + p.h) - b.y;                // Höhe der Oberkante über den Füßen
  // Sprung zum Stampfen: Oberkante in Reichweite, seitlich knapp außerhalb des Körpers (kein Kontakt beim Aufstieg).
  const stompJump = p.onGround && top > 10 && top < 80 && adx >= 32 && adx < 60;
  // Sprung zum Schießen: Bossmitte in Bogenhöhe, Bogen geladen.
  const shootJump = p.onGround && p.power === 'bow' && rc > 30 && rc < 140 && adx >= 40 && adx < 200;
  if (stompJump || shootJump) {
    inp.jump = true;
    inp.jumpPressed = true;
  }
  if (!p.onGround) {
    inp.jump = p.vy < 0;
    if (feet > b.y + 2) {
      // Unterhalb der Oberkante: nicht in den Körper hineinfliegen, sonst auf den Sturzflug-Abstand zufahren.
      const band = b.state === 'dive' ? 45 : 57;
      if (adx < 32) { inp.left = dx > 0; inp.right = dx < 0; }
      else if (adx > band + 6) { inp.left = dx < 0; inp.right = dx > 0; }
    } else if (dx > 4) inp.right = true;     // oberhalb der Oberkante: auf die Mitte zu (Stampfen)
    else if (dx < -4) inp.left = true;
  }
  if (p.power === 'bow' && adx < 200) {
    // Vorhalten: Boss-Position zum Zeitpunkt des Eintreffens (zwei Iterationen), Boss muss dann verwundbar sein.
    const face = dx >= 0 ? 1 : -1;
    const ax = pcx + face * 8;
    const ay = p.y + 10;
    let t = Math.abs((b.x + b.w / 2) - ax) / PHYS.arrowSpeed;
    let hit = false;
    for (let k = 0; k < 3; k++) {
      const tx = (b.x + b.w / 2) + b.vx * t;
      const ty = (b.y + b.h / 2) + b.vy * t;
      const tt = Math.abs(tx - ax) / PHYS.arrowSpeed;
      const yAt = ay - 30 * tt + 0.5 * PHYS.arrowGravity * tt * tt;
      hit = Math.abs(yAt - ty) < b.h / 2 - 4 && b.invuln <= tt + 0.05;
      t = tt;
    }
    const inFlight = (game.projectiles || []).some((o) => o.active && o.type === 'arrow');
    if (hit && !inFlight) {
      if (p.face === face) inp.firePressed = true;
      else { inp.left = face < 0; inp.right = face > 0; }   // erst zum Boss drehen (Blickrichtung)
    }
  }
  return inp;
}

test('Dreikopf: Bot besiegt den Boss in unter 90 s Simulationszeit', () => {
  const { game, count } = drei({ lives: 99, power: 'bow' });
  const b = game.boss;
  const maxSteps = 90 / STEP;
  let steps = 0;
  while (b.state !== 'defeated' && steps < maxSteps) {
    game.update(STEP, dreBotInput(game));
    steps++;
  }
  const secs = (steps * STEP).toFixed(1);
  assert.equal(b.state, 'defeated', `nicht besiegt nach ${secs} s (hp ${b.hp}, Leben ${game.lives}, Zustand ${game.state}, Salven ${b.salvos})`);
  assert.ok(steps * STEP < 90, `Zeit ${secs} s`);
  assert.ok(count('bossHit') >= DRE.hp / DRE.arrowDmg / 2, 'Treffer');
});

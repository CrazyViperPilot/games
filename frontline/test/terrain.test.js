// Gelände im Spiel: Höhenvorteil, Tempo am Hang, Talwege der Wegsuche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { Relief, COARSE_N, setRelief } from '../js/game/relief.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { heightMult, shotDamage } from '../js/game/combat.js';
import { slopeFactor, planPath } from '../js/game/movement.js';
import { UNITS } from '../js/data/units.js';
import { BALANCE } from '../js/data/balance.js';

const RES = 64;

/** Leere Karte mit einem runden Hügel (Höhe h, Breite sigma) bei (hx, hy). */
function hillMap(hx, hy, h, sigma) {
  const map = createEmptyMap('Hügel');
  const r = new Relief();
  for (let j = 0; j < COARSE_N; j++) {
    for (let i = 0; i < COARSE_N; i++) {
      const d = Math.hypot(i * RES - hx, j * RES - hy);
      r.coarse[j * COARSE_N + i] = 20 + h * Math.exp(-((d / sigma) ** 2));
    }
  }
  r.refine();
  setRelief(map, r);
  return map;
}

test('Höhenvorteil: wer höher steht, trifft härter, bergauf schwächer; flach und Hubschrauber ohne Effekt', () => {
  const g = new Game({ map: hillMap(4500, 6000, 160, 500) });
  const top = g.spawnUnit('rifleman', 0, 4500, 6000);
  const foot = g.spawnUnit('rifleman', 1, 4500, 6180);
  const side = g.spawnUnit('rifleman', 1, 4510, 6000);
  const heli = g.spawnUnit('gunship', 1, 4500, 6150);
  const down = heightMult(g, top, foot);
  const up = heightMult(g, foot, top);
  assert.ok(down > 1.1 && down <= 1 + BALANCE.height.bonus + 1e-9, `bergab ${down}`);
  assert.ok(up < 0.9 && up >= 1 - BALANCE.height.bonus - 1e-9, `bergauf ${up}`);
  assert.equal(heightMult(g, top, side), 1, 'gleiche Höhe');
  assert.equal(heightMult(g, heli, top), 1, 'Hubschrauber');
  const flat = new Game({ map: createEmptyMap() });
  assert.equal(heightMult(flat, flat.units[0], flat.units[1]), 1);
});

test('Höhenvorteil bei Trefferzahlen: Gewehr gegen Soldat 4 Treffer, mit Vorteil 3, bergauf 5', () => {
  const rifle = UNITS.rifleman.weapons[0];
  const s = { x: 0, y: 0, angle: 0, kind: 'unit', def: UNITS.rifleman, type: 'rifleman' };
  const t = { x: 100, y: 0, angle: 0, kind: 'unit', def: UNITS.rifleman, type: 'rifleman' };
  const shots = (mult) => {
    let hp = UNITS.rifleman.hp;
    let n = 0;
    while (hp > 0 && n < 20) {
      hp -= shotDamage(rifle, s, t, mult);
      n++;
    }
    return n;
  };
  assert.equal(shots(1), 4);
  assert.equal(shots(1.25), 3);
  assert.equal(shots(0.75), 5);
});

test('Tempo am Hang: Fahrzeuge bergauf deutlich langsamer, bergab schneller, Infanterie schwächer betroffen', () => {
  const g = new Game({ map: hillMap(4500, 6000, 160, 500) });
  const tank = g.spawnUnit('tank', 0, 4500, 6300); // Südflanke
  const inf = g.spawnUnit('rifleman', 0, 4500, 6300);
  const upT = slopeFactor(g.relief, tank, 0, -1);
  const downT = slopeFactor(g.relief, tank, 0, 1);
  const upI = slopeFactor(g.relief, inf, 0, -1);
  assert.ok(upT < 0.85, `Panzer bergauf ${upT}`);
  assert.ok(downT > 1.02, `Panzer bergab ${downT}`);
  assert.ok(upI > upT && upI < 1, `Infanterie bergauf ${upI}`);
  assert.equal(slopeFactor(g.relief, tank, 1, 0) < 1.01 && slopeFactor(g.relief, tank, 1, 0) > 0.99, true, 'quer zum Hang');
  assert.equal(slopeFactor(null, tank, 0, -1), 1, 'flache Karte');
});

test('Wegsuche: der Weg weicht der steilen Hügelflanke aus, wenn der Umweg kurz ist', () => {
  const g = new Game({ map: hillMap(4500, 6250, 240, 520) }); // die gerade Linie liefe über die Flanke (Höhe ~210)
  const u = g.spawnUnit('tank', 0, 3300, 6000);
  planPath(g, u, 5700, 6000);
  assert.ok(u.path.length > 0);
  const last = u.path[u.path.length - 1];
  assert.ok(Math.hypot(last.x - 5700, last.y - 6000) < 40, 'erreicht das Ziel');
  let px = u.x;
  let py = u.y;
  let maxH = 0;
  for (const p of u.path) {
    for (let k = 0; k <= 20; k++) maxH = Math.max(maxH, g.relief.heightAt(px + ((p.x - px) * k) / 20, py + ((p.y - py) * k) / 20));
    px = p.x;
    py = p.y;
  }
  assert.ok(maxH < 150, `höchster Punkt am Weg ${maxH.toFixed(0)}`);
});

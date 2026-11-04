// Waffen gegen Flugzeuge (Schadensklasse jet) und parallel feuernde Panzer (def.parallel), seit v5.15.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { shotDamage } from '../js/game/combat.js';
import { UNITS } from '../js/data/units.js';

const DT = 0.05;
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
/** Szene weit weg von den Basen: alle Startarmeen weg, Team 0 bei (x, y). */
function scene(seed = 7) {
  const g = classic(new Game({ seed }));
  for (const u of g.units) u.alive = false;
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}
const spec = (type, id) => UNITS[type].weapons.find((w) => w.id === id);

test('Gegen Flugzeuge: Soldaten nichts, Panzer-MGs sehr wenig, Kampfhubschrauber mittel; gegen Hubschrauber wie bisher', () => {
  const { g, x, y } = scene();
  const jet = g.spawnUnit('f16', 1, x, y);
  const heli = g.spawnUnit('littlebird', 1, x, y);
  const s = { x: x - 100, y };
  for (const [type, id] of [['rifleman', 'rifle'], ['at', 'rpg'], ['sniper', 'sniper'], ['commander', 'smg']]) {
    assert.equal(shotDamage(spec(type, id), s, jet), 0, `${type} trifft keine Flugzeuge`);
    assert.ok(shotDamage(spec(type, id), s, heli) > 0, `${type} trifft weiter Hubschrauber`);
  }
  const tankMg = shotDamage(spec('tank', 'mg'), s, jet);
  const ifvMg = shotDamage(spec('ifv', 'mg'), s, jet);
  const gun = shotDamage(spec('gunship', 'cannon'), s, jet);
  const rocket = shotDamage(spec('gunship', 'rocket'), s, jet);
  assert.ok(tankMg > 0 && ifvMg > 0 && tankMg <= 2 && ifvMg <= 2, `Panzer-MGs sehr wenig (${tankMg}, ${ifvMg})`);
  assert.ok(gun > 5 * ifvMg && rocket >= jet.maxHp / 6 && rocket < jet.maxHp / 2, `Kampfhubschrauber mittel (${gun}, ${rocket})`);
  // Flugabwehr trifft Jets wie Hubschrauber (keine eigene jet-Angabe: es gilt air)
  assert.equal(shotDamage(spec('sam', 'sam'), s, jet), shotDamage(spec('sam', 'sam'), s, heli));
});

test('Soldaten schießen nicht auf eine F-16 über ihnen', () => {
  const { g, x, y } = scene();
  for (let k = 0; k < 6; k++) g.spawnUnit(k % 2 ? 'at' : 'rifleman', 0, x + k * 10, y);
  const jet = g.spawnUnit('f16', 1, x + 60, y);
  for (const w of jet.weapons) w.rounds = 0; // schießt selbst nicht
  jet.fuel = jet.def.fuelMax;
  const hp = jet.hp;
  run(g, 4);
  assert.equal(jet.hp, hp, 'kein Schaden');
  assert.equal(g.teams[0].used.mun, 0, 'kein Schuss abgegeben');
});

test('Kampfpanzer: MG auf Soldaten und Hauptkanone auf ein Fahrzeug gleichzeitig', () => {
  const { g, x, y } = scene();
  const tank = g.spawnUnit('tank', 0, x, y);
  const rifle = g.spawnUnit('rifleman', 1, x + 120, y); // näher: Hauptziel der Zielsuche
  const truck = g.spawnUnit('truck', 1, x + 230, y + 40);
  rifle.hp = truck.hp = 1e6; // überleben, damit beide Waffen weiterfeuern
  const cannon = tank.weapons.find((w) => w.spec.id === 'cannon');
  const mg = tank.weapons.find((w) => w.spec.id === 'mg');
  const c0 = cannon.rounds;
  const m0 = mg.rounds;
  run(g, 2);
  assert.ok(cannon.rounds < c0, 'Hauptkanone hat gefeuert');
  assert.ok(m0 - mg.rounds >= 4, `MG feuert dauernd (${m0 - mg.rounds})`);
  assert.ok(truck.hp < 1e6, 'Kanone trifft das Fahrzeug');
  assert.ok(rifle.hp < 1e6, 'MG trifft den Soldaten');
});

test('Schützenpanzer: MG und Granatwerfer blockieren sich nicht, auch beim Angriffsbefehl', () => {
  const { g, x, y } = scene();
  const ifv = g.spawnUnit('ifv', 0, x, y);
  const rifle = g.spawnUnit('rifleman', 1, x + 100, y - 40);
  const enemy = g.spawnUnit('ifv', 1, x + 200, y);
  rifle.hp = enemy.hp = 1e6;
  enemy.weapons.forEach((w) => (w.rounds = 0));
  assert.equal(g.issue(0, { type: 'attack', ids: [ifv.id], targetId: enemy.id }).ok, true);
  const gl = ifv.weapons.find((w) => w.spec.id === 'grenade');
  const mg = ifv.weapons.find((w) => w.spec.id === 'mg');
  const g0 = gl.rounds;
  const m0 = mg.rounds;
  run(g, 3);
  assert.ok(gl.rounds < g0, 'Granatwerfer auf das befohlene Fahrzeug');
  assert.ok(m0 - mg.rounds >= 4, 'MG schießt nebenbei');
  assert.ok(rifle.hp < 1e6, 'MG trifft den Soldaten');
  assert.ok(enemy.hp < 1e6, 'Granatwerfer trifft das Ziel');
});

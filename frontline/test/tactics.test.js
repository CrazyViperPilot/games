// KI-Taktik (PRD §10 „Kampfgruppen und Mehrfrontenangriff“): Die Armee-KI teilt eine Welle in Hauptstoß und Flanken, stellt sie in
// getrennten Bereitstellungsräumen bereit und greift mit allen Gruppen gleichzeitig an. Auf Leicht bleibt es bei einer Gruppe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { BALANCE } from '../js/data/balance.js';
import { GROUP_MIN } from '../js/data/ai.js';

const DT = 0.1;

/** Partie, in der Blau (passiv) mit `n` Einheiten die Konfliktzone hält: nur dann stellt Rot Flanken bereit (leere Zone: direkt). */
function heldZone(seed, n = 8) {
  const g = new Game({ seed });
  const blue = g.units.filter((u) => u.alive && u.team === 0 && u.def.range > 0 && !u.def.air).slice(0, n);
  blue.forEach((u, i) => {
    u.x = g.zone.x + (i % 4) * 40;
    u.y = g.zone.y + Math.floor(i / 4) * 40;
  });
  for (let k = 0; k < 40; k++) g.update(0.05);
  assert.equal(g.zone.owner, 0, 'Blau hält die Zone');
  return g;
}

/** Rot (KI) gegen ein passives Blau: läuft `secs` s und merkt sich jede Gruppe der ersten Welle (Stand je Sekunde). */
function runWave(seed, difficulty, secs) {
  const g = heldZone(seed);
  const ai = new AI(g, 1, difficulty);
  const seen = new Map(); // Gruppen-ID → letzter Stand
  const owners = new Map(); // Einheit → Gruppen-IDs, in denen sie gleichzeitig stand
  let doubled = 0;
  for (let k = 0; k < secs / DT; k++) {
    ai.update(DT);
    g.update(DT);
    if (k % 10) continue;
    owners.clear();
    for (const gr of ai.groups.values()) {
      if (gr.wave === 1) seen.set(gr.id, { ...gr, ids: new Set(gr.ids) });
      for (const id of gr.ids) {
        if (owners.has(id)) doubled++;
        owners.set(id, gr.id);
      }
    }
  }
  return { g, ai, groups: [...seen.values()], doubled };
}

const angleBetween = (a, b) => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return ((d > Math.PI ? 2 * Math.PI - d : d) * 180) / Math.PI;
};

test('Normal: Hauptstoß und Flanke aus getrennten Bereitstellungsräumen, gleichzeitiger Angriff', () => {
  const { g, groups, doubled } = runWave(5, 'normal', 300);
  assert.equal(groups.length, 2, 'Hauptstoß und eine Flanke');
  assert.deepEqual(groups.map((gr) => gr.role).sort(), ['flank', 'main']);
  assert.equal(doubled, 0, 'keine Einheit in zwei Gruppen');
  for (const gr of groups) assert.ok(gr.ids.size >= GROUP_MIN, 'Gruppe groß genug');
  const [a, b] = groups;
  assert.ok(angleBetween(a.angle, b.angle) > 40, `Winkel zwischen den Bereitstellungsräumen ${angleBetween(a.angle, b.angle).toFixed(0)}°`);
  assert.ok(Math.hypot(a.stage.x - b.stage.x, a.stage.y - b.stage.y) > 800, 'Bereitstellungsräume liegen auseinander');
  // Bereitstellung liegt vor dem Ziel, nicht darin
  for (const gr of groups) assert.ok(Math.hypot(gr.stage.x - g.zone.x, gr.stage.y - g.zone.y) > 900, 'Bereitstellungsraum abseits der Zonenmitte');
  // gleichzeitiger Angriff
  for (const gr of groups) assert.ok(gr.tAssault > 0, `Gruppe ${gr.role} hat angegriffen`);
  assert.ok(Math.abs(a.tAssault - b.tAssault) <= 3, `Angriff gleichzeitig (${a.tAssault.toFixed(1)} s / ${b.tAssault.toFixed(1)} s)`);
  // der Hauptstoß ist die größere Gruppe und hat die meisten Fahrzeuge
  const main = groups.find((gr) => gr.role === 'main');
  const flank = groups.find((gr) => gr.role === 'flank');
  assert.ok(main.value0 > flank.value0, 'Hauptstoß ist stärker als die Flanke');
});

test('Schwer: Hauptstoß und zwei Flanken auf verschiedenen Seiten', () => {
  const { groups } = runWave(5, 'hard', 300);
  assert.equal(groups.length, 3);
  const main = groups.find((gr) => gr.role === 'main');
  const flanks = groups.filter((gr) => gr.role === 'flank');
  assert.equal(flanks.length, 2);
  assert.ok(angleBetween(flanks[0].angle, flanks[1].angle) > 80, 'Flanken auf beiden Seiten');
  for (const f of flanks) assert.ok(angleBetween(f.angle, main.angle) > 40);
  const times = groups.map((gr) => gr.tAssault);
  assert.ok(times.every((x) => x > 0) && Math.max(...times) - Math.min(...times) <= 3, 'alle drei greifen gleichzeitig an');
});

test('Leicht: eine Gruppe, keine Bereitstellung', () => {
  const { ai, groups } = runWave(5, 'easy', 120);
  assert.equal(BALANCE.difficulty.easy.tactics.flanks, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].role, 'main');
  assert.equal(groups[0].t0, groups[0].tAssault, 'greift sofort an');
  assert.equal(ai.staging.size, 0);
});

test('Angriff auf eine Gruppe in der Bereitstellung löst den Gesamtangriff aus', () => {
  const g = heldZone(5);
  const ai = new AI(g, 1, 'normal');
  ai.think();
  const groups = [...ai.groups.values()];
  assert.equal(groups.length, 2);
  assert.ok(groups.every((gr) => gr.phase === 'stage'));
  // die Flanke steht schon bereit, ein Gegner taucht bei ihr auf
  const flank = groups.find((gr) => gr.role === 'flank');
  const mine = g.units.filter((u) => flank.ids.has(u.id));
  mine.forEach((u, i) => {
    u.x = flank.stage.x + (i % 4) * 30;
    u.y = flank.stage.y + Math.floor(i / 4) * 30;
  });
  const foe = g.units.find((u) => u.alive && u.team === 0 && u.def.range > 0 && !u.def.air && Math.hypot(u.x - g.zone.x, u.y - g.zone.y) > g.zone.r);
  foe.x = flank.stage.x + 200;
  foe.y = flank.stage.y;
  foe.hp = 1e6; // übersteht die erste Sekunde
  for (let k = 0; k < 20; k++) g.update(0.05); // Sicht neu berechnen
  ai.think();
  assert.ok(groups.every((gr) => gr.phase === 'assault'), 'beide Gruppen greifen an');
  assert.equal(groups[0].tAssault, groups[1].tAssault);
});

test('Gruppe unter GROUP_MIN löst sich auf, Gefallene fallen heraus', () => {
  const g = heldZone(5);
  const ai = new AI(g, 1, 'normal');
  ai.think();
  const flank = [...ai.groups.values()].find((gr) => gr.role === 'flank');
  const ids = [...flank.ids];
  g.units.find((u) => u.id === ids[0]).alive = false;
  ai.think();
  assert.ok(!flank.ids.has(ids[0]), 'Gefallener ist ausgetragen');
  for (const id of ids.slice(1, ids.length - GROUP_MIN + 2)) g.units.find((u) => u.id === id).alive = false;
  ai.think();
  assert.ok(!ai.groups.has(flank.id), 'zu kleine Gruppe ist aufgelöst');
  assert.ok(![...ai.staging].some((id) => ids.includes(id)));
});

test('Leere, herrenlose Zone: auch Normal besetzt sie direkt mit einer Gruppe', () => {
  const g = new Game({ seed: 5 });
  const ai = new AI(g, 1, 'normal');
  ai.think();
  const groups = [...ai.groups.values()];
  assert.equal(groups.length, 1);
  assert.equal(groups[0].phase, 'assault');
});

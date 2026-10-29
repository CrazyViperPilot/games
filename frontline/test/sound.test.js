// Ton (PRD §14): die Simulation hängt jedem Effekt einen Ton-Hinweis (`snd`) an; Sound übersetzt neue Effekte in Geräusche, ohne
// das Spiel zu ändern. Hier mit einem Attrappen-AudioContext (Node hat kein WebAudio): kein Absturz, Entfernung, Drosselung, Schalter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { BALANCE } from '../js/data/balance.js';
import { Sound } from '../js/audio/sound.js';

const DT = 1 / BALANCE.tickRate;

/** Knoten, der jede Methode und jedes Feld schluckt (AudioParam, GainNode …). */
function node() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : proxy),
    set: () => true,
    apply: () => proxy,
  });
  return proxy;
}
function fakeCtx() {
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    state: 'running',
    destination: node(),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
  };
  for (const m of ['createGain', 'createDynamicsCompressor', 'createBufferSource', 'createBiquadFilter', 'createOscillator', 'createStereoPanner']) ctx[m] = () => node();
  return ctx;
}
const cam = { viewW: 800, viewH: 600, zoom: 1, worldToScreen: (x, y) => ({ x, y }) };
function make() {
  const g = new Game({ seed: 3 });
  const s = new Sound({ ctx: fakeCtx() });
  s.on = true;
  s.attach(g, cam, 0);
  s.on = true;
  return { g, s };
}

test('Effekte tragen einen Ton-Hinweis, Gefallene lösen einen Todes-Effekt aus', () => {
  const g = new Game({ seed: 3 });
  g.addEffect('tracer', 1, 2, 0, 3, 4, 'rifle');
  assert.equal(g.effects.at(-1).snd, 'rifle');
  const u = g.units.find((x) => x.team === 1 && x.def.armor === 'inf');
  u.hp = 0;
  g.cleanup();
  assert.ok(g.effects.some((e) => e.type === 'death' && e.snd === 'inf'));
});

test('neue Effekte werden einmal abgespielt, Ort außerhalb des Bilds ist stumm', () => {
  const { g, s } = make();
  const played = [];
  s.play = (name, vol) => played.push([name, vol]);
  g.addEffect('tracer', 400, 300, 0, 450, 300, 'sniper');
  g.addEffect('explosion', 400, 300, 0, 400, 300, 'building');
  g.addEffect('tracer', 5000, 5000, 0, 5000, 5000, 'rifle'); // weit weg
  s.update(DT);
  s.update(DT);
  assert.deepEqual(played.map((p) => p[0]), ['sniper', 'boomL']);
  assert.ok(played.every((p) => p[1] > 0.9));
});

test('gegnerische Schüsse im Nebel bleiben stumm', () => {
  const { g, s } = make();
  const played = [];
  s.play = (name) => played.push(name);
  const f = g.buildings.find((b) => b.team === 1 && b.main);
  const spot = { x: f.x, y: f.y };
  g.fog[0].isVisible = () => false;
  g.addEffect('tracer', spot.x, spot.y, 1, spot.x, spot.y, 'rifle');
  cam.worldToScreen = () => ({ x: 400, y: 300 });
  s.update(DT);
  cam.worldToScreen = (x, y) => ({ x, y });
  assert.deepEqual(played, []);
});

test('gleiche Geräusche werden gedrosselt, Schalter schaltet alles ab', () => {
  const { s } = make();
  let made = 0;
  s.bus = () => {
    made++;
    return node();
  };
  s.play('rifle');
  s.play('rifle'); // gleiche Zeit: unter `gap`
  assert.equal(made, 1);
  s.on = false;
  s.play('click');
  assert.equal(made, 1);
});

test('alle Geräusche laufen durch (Attrappe), Meldungen wählen den passenden Ton', () => {
  const { s } = make();
  for (const n of ['rifle', 'smg', 'mg', 'sniper', 'cannon', 'grenade', 'rpg', 'rocket', 'flak', 'sam', 'base', 'mortar', 'boomS', 'boomM', 'boomL', 'dieInf', 'dieAir', 'intercept', 'click', 'order', 'ready', 'built', 'alarm', 'coin', 'note', 'win', 'lose', 'thunder']) {
    s.lastAt = {};
    assert.doesNotThrow(() => s.play(n, 1, 0), n);
  }
  const played = [];
  s.play = (n) => played.push(n);
  for (const text of ['Schütze bereit', 'FOB fertig', 'Basis wird angegriffen', '+25 Geld: Abschuss', 'Mörser zerstört', 'Kein Weg']) s.message({ text });
  assert.deepEqual(played, ['ready', 'built', 'alarm', 'coin', 'note']);
});

test('Dauergeräusche: Regen und Fahrzeuge in Bildnähe heben den Pegel, Pause senkt ihn', () => {
  const { g, s } = make();
  let lv = null;
  s.setLevels = (...a) => (lv = a);
  g.weather = { on: true, kind: 'rain', prev: 'rain', mix: 1, season: 'summer' };
  const tank = g.units.find((u) => u.team === 0 && u.type === 'tank');
  tank.speedNow = 30;
  cam.worldToScreen = () => ({ x: 400, y: 300 });
  s.ambience();
  cam.worldToScreen = (x, y) => ({ x, y });
  assert.ok(lv[0] > 0 && lv[3] > 0, 'Regen und Fahrzeuge hörbar');
  s.update(DT, true);
  assert.deepEqual(lv, [0, 0, 0, 0]);
});

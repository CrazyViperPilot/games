// Musik (Paket P4, v5.64): Vorausplaner, Lage (ruhig/Gefecht), Pause, Spielende, Regler und Speicher. Läuft mit der Attrappe aus
// test/audiofake.js (Node hat keinen AudioContext). Die Musik liest die Partie nur; hier wird sie mit einer echten Partie gefüttert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { Sound, loadLevel, saveLevel } from '../js/audio/sound.js';
import { node, fakeCtx, withStorage } from './audiofake.js';

const FRAME = 1 / 30;
const cam = { viewW: 800, viewH: 600, zoom: 1, worldToScreen: (x, y) => ({ x, y }) };

function make(seed = 3) {
  const g = new Game({ seed });
  const ctx = fakeCtx();
  const s = new Sound({ ctx });
  s.attach(g, cam, 0);
  s.on = true;
  return { g, s, ctx };
}

/** Bilder laufen lassen: Partie, Takt der AudioContext-Zeit und Ton (wie main.js: erst Partie, dann Ton). */
function run(g, s, ctx, seconds, paused = false) {
  for (let t = 0; t < seconds; t += FRAME) {
    if (!paused) g.update(FRAME);
    ctx.currentTime += FRAME;
    s.update(FRAME, paused);
  }
}

/** Zählt die Schritte des Vorausplaners (Musik); Geräusche der Schüsse erzeugen eigene Oszillatoren und zählen nicht mit. */
function countPlans(s) {
  const counter = { n: 0 };
  const orig = s.music.planStep.bind(s.music);
  s.music.planStep = (...a) => {
    counter.n++;
    return orig(...a);
  };
  return counter;
}

/** Sechs Schüsse im Bild: genug für Gefecht. */
function battle(g, n = 6) {
  for (let i = 0; i < n; i++) g.addEffect('tracer', 400, 300, 0, 450, 300, 'rifle');
}

test('60 s Spielzeit ohne Absturz: Gefecht und Ruhe wechseln, Noten werden geplant', () => {
  const { g, s, ctx } = make();
  s.setLevel('music', 0.5);
  const plans = countPlans(s);
  for (let sec = 0; sec < 60; sec += 2) {
    battle(g, 3);
    run(g, s, ctx, 2);
    assert.ok(s.music.intensity >= 0 && s.music.intensity <= 1, 'Lage bleibt zwischen 0 und 1');
  }
  assert.ok(plans.n > 180, `Achtel geplant (60 s bei 0,3125 s je Achtel: ca. 192): ${plans.n}`);
  assert.ok(Number.isFinite(s.music.next) && Number.isFinite(s.music.intensity));
});

test('Lage: sechs Kampfeffekte im Bild lassen das Gefecht steigen, danach fällt es wieder; fünf reichen nicht', () => {
  const { g, s, ctx } = make();
  battle(g, 5);
  run(g, s, ctx, 3);
  assert.ok(s.music.intensity < 0.01, 'fünf Effekte sind noch ruhig');
  battle(g, 1);
  run(g, s, ctx, 1);
  assert.ok(s.music.intensity > 0.3, `sechs Effekte: Gefecht steigt (${s.music.intensity})`);
  run(g, s, ctx, 25);
  assert.ok(s.music.intensity < 0.05, `nach Ruhe wieder ruhig (${s.music.intensity})`);
});

test('Lage: Alarm „Basis wird angegriffen“ zählt als Gefecht', () => {
  const { g, s, ctx } = make();
  run(g, s, ctx, 0.5);
  s.message({ text: 'Basis wird angegriffen' });
  run(g, s, ctx, 2);
  assert.ok(s.music.intensity > 0.5, `Alarm: Gefecht (${s.music.intensity})`);
});

test('Musik 0 %: keine Noten, auch im Gefecht', () => {
  const { g, s, ctx } = make();
  s.setLevel('music', 0);
  const plans = countPlans(s);
  battle(g, 8);
  run(g, s, ctx, 10);
  assert.equal(plans.n, 0, 'keine Schritte bei 0 %');
  s.setLevel('music', 0.5);
  run(g, s, ctx, 3);
  assert.ok(plans.n > 0, 'mit Musik wieder Noten');
});

test('Pause: Musik auf 30 % des Pegels, nicht stumm; Spielende blendet aus', () => {
  const { g, s, ctx } = make();
  s.setLevel('music', 0.5);
  run(g, s, ctx, 1);
  assert.ok(Math.abs(s.music.last.bus - 0.25) < 0.01, `ohne Pause ${s.music.last.bus}`);
  run(g, s, ctx, 2, true);
  assert.ok(Math.abs(s.music.last.bus - 0.075) < 0.01, `in der Pause ${s.music.last.bus}`);
  g.winner = 0;
  run(g, s, ctx, 3);
  assert.ok(s.music.last.bus < 0.01, 'Spielende: ausgeblendet');
});

test('Spielende: danach werden keine Noten mehr geplant', () => {
  const { g, s, ctx } = make();
  s.setLevel('music', 0.5);
  run(g, s, ctx, 2);
  g.winner = 0;
  run(g, s, ctx, 1);
  const plans = countPlans(s);
  run(g, s, ctx, 5);
  assert.equal(plans.n, 0, 'nach Spielende keine Schritte');
});

test('Lautstärke: Standard 80 % Geräusche und 50 % Musik, Regler wird gespeichert und gelesen', () =>
  withStorage(() => {
    assert.equal(loadLevel('sfx'), 0.8);
    assert.equal(loadLevel('music'), 0.5);
    saveLevel('music', 0.35);
    assert.equal(loadLevel('music'), 0.35);
    saveLevel('sfx', 2); // außerhalb von 0–1: auf 100 % begrenzt
    assert.equal(loadLevel('sfx'), 1);
    globalThis.localStorage.setItem('frontline-musik-laut', 'abc'); // kaputter Wert: Standard
    assert.equal(loadLevel('music'), 0.5);

    const s = new Sound({ ctx: fakeCtx() });
    s.setLevel('music', 0.2);
    s.setLevel('sfx', 0.3);
    assert.equal(globalThis.localStorage.getItem('frontline-musik-laut'), '20');
    const again = new Sound({ ctx: fakeCtx() });
    assert.equal(again.getLevel('music'), 0.2);
    assert.equal(again.getLevel('sfx'), 0.3);
    assert.equal(again.music.level, 0.2, 'Musikmodul bekommt den Regler');
  }));

test('Lautstärke ohne Speicher: Standardwerte, kein Absturz', () => {
  const old = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.equal(loadLevel('sfx'), 0.8);
    saveLevel('music', 0.1); // ohne Speicher still
    assert.equal(loadLevel('music'), 0.5);
  } finally {
    if (old !== undefined) globalThis.localStorage = old;
  }
});

test('Attrappe: Knoten schluckt Methoden und Felder', () => {
  const n = node();
  assert.doesNotThrow(() => {
    n.gain.setTargetAtTime(1, 0, 0.3);
    n.connect(n).start(0);
  });
});

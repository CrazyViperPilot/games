// KI-Kennzahlen (tools/metrics.mjs, seit v5.83): die Vergleichsregel meldet nur grobe Ausreißer; die Referenzdatei passt zu den Seeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compare, KEYS, SEEDS } from '../tools/metrics.mjs';

const team = (v) => Object.fromEntries(Object.keys(KEYS).map((k) => [k, v]));

test('metrics: gleiche Werte und kleine Schwankungen ohne Warnung, Ausfall auf 0 und Abweichung über 50 % mit Warnung', () => {
  const ref = [team(100), team(100)];
  assert.deepEqual(compare([team(100), team(100)], ref), []);
  assert.deepEqual(compare([team(70), team(140)], ref), []);
  const now = [team(100), team(100)];
  now[0].steel = 0;
  now[1].mun = 300;
  const w = compare(now, ref);
  assert.equal(w.length, 2);
  assert.match(w[0], /Blau Stahl 0/);
  assert.match(w[1], /Rot Mun 300/);
  // kleine Zahlen (unter 10) sind Rauschen: 1 statt 4 Stürme warnt nicht
  assert.deepEqual(compare([team(1), team(1)], [team(4), team(4)]), []);
});

test('metrics: Referenzwerte für jeden Seed und jede Kennzahl', () => {
  const ref = JSON.parse(readFileSync(new URL('../tools/metrics-ref.json', import.meta.url), 'utf8'));
  for (const s of SEEDS) for (const t of [0, 1]) for (const k of Object.keys(KEYS)) assert.equal(typeof ref[s]?.[t]?.[k], 'number', `Seed ${s} Team ${t} ${k}`);
});

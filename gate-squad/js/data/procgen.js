// Prozedurale Level ab Level 21 (Endlos). Deterministisch pro Level-Nummer (PLAN.md §4).
import { mulberry32, randRange, randInt, pick } from '../core/rng.js';
import { endlessBossBase } from './balance.js';

const PATTERNS = ['line', 'v', 'column', 'random', 'wall'];
const BOSSES = ['boss_apc', 'boss_tank', 'boss_fortress'];

// Gewichtete Gegnerwahl (apc selten).
function pickEnemy(rng) {
  const r = rng();
  if (r < 0.35) return 'infantry';
  if (r < 0.62) return 'runner';
  if (r < 0.82) return 'shield';
  if (r < 0.95) return 'sniper';
  return 'apc';
}

function makeWave(rng, n, d) {
  const enemy = pickEnemy(rng);
  const base = Math.min(22, 8 + (n - 20) / 3);
  let count;
  if (enemy === 'apc') count = 1;
  else if (enemy === 'sniper') count = randInt(rng, 1, 2);
  else if (enemy === 'shield') count = Math.max(2, Math.round(base * 0.5 * randRange(rng, 0.8, 1.2)));
  else if (enemy === 'runner') count = Math.round(base * 1.2 * randRange(rng, 0.9, 1.1));
  else count = Math.round(base * randRange(rng, 0.8, 1.2));
  count = Math.min(22, count);
  const ev = { d, t: 'wave', enemy, count, pattern: pick(rng, PATTERNS) };
  if (rng() < 0.5) ev.x = Math.round(randRange(rng, 0.2, 0.8) * 100) / 100;
  return ev;
}

// Positive Seite: Addition (klein/groß) oder Multiplikator x2/x3.
function posGate(rng, s) {
  if (rng() < 0.6) {
    return { op: 'add', v: Math.max(3, Math.round(s * randRange(rng, 0.7, 1.4))) };
  }
  return { op: 'mul', v: rng() < 0.6 ? 2 : 3 };
}

// Riskante Seite: negatives Addieren (durch Anschießen positiv möglich) oder ÷2.
function riskGate(rng, s) {
  if (rng() < 0.7) {
    return { op: 'add', v: -Math.max(2, Math.round(s * randRange(rng, 0.6, 1.2))) };
  }
  return { op: 'mul', v: 0.5 };
}

function makeGates(rng, n, d) {
  const s = 6 + (n - 20) * 0.25;
  const pos = posGate(rng, s);
  const risk = riskGate(rng, s);
  return rng() < 0.5
    ? { d, t: 'gates', left: pos, right: risk }
    : { d, t: 'gates', left: risk, right: pos };
}

function makeWeapon(rng, n, d) {
  const side = rng() < 0.5 ? 'left' : 'right';
  const other = rng() < 0.7 ? posGate(rng, 6 + (n - 20) * 0.25) : null;
  return { d, t: 'weapon', side, other };
}

function makeCrate(rng, d) {
  return { d, t: 'crate', x: Math.round(randRange(rng, 0.15, 0.85) * 100) / 100 };
}

export function generateLevel(n) {
  const rng = mulberry32(n * 9973 + 17);
  const length = 4400 + Math.min(2000, 60 * (n - 20));
  const scroll = Math.min(95, 85 + (n - 20) * 0.5);
  const boss = BOSSES[n % 3];
  const bossHp = Math.round(endlessBossBase(n));
  const finalD = length - 400;
  const events = [];

  let d = 200;
  while (d <= length - 250) {
    // Freiraum um das Schluss-Gatepaar lassen.
    if (Math.abs(d - finalD) < 180) {
      d = finalD + 180;
      continue;
    }
    const r = rng() * 100;
    if (r < 60) events.push(makeWave(rng, n, d));
    else if (r < 85) events.push(makeGates(rng, n, d));
    else if (r < 92) events.push(makeWeapon(rng, n, d));
    else events.push(makeCrate(rng, d));
    d += randInt(rng, 200, 300);
  }

  // Starkes positives Tor-Paar zur Boss-Vorbereitung.
  const s = 6 + (n - 20) * 0.25;
  events.push({
    d: finalD,
    t: 'gates',
    left: { op: 'add', v: Math.round(s * 2.2) },
    right: { op: 'mul', v: 3 },
  });
  events.sort((a, b) => a.d - b.d);

  return { id: n, name: `Einsatz ${n}`, length, scroll, boss, bossHp, events };
}

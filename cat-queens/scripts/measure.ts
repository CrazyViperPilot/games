// Misst Verteilung von Schwierigkeit und Laufzeit roher Rätsel je Größe.
import { buildBoard, regionsConnected } from '../src/core/board';
import { growRegions, makeUnique, randomSolution } from '../src/core/generator';
import { solveLogically } from '../src/core/logic';
import { createRng } from '../src/core/rng';

const N = Number(process.argv[2] ?? 8);
const count = Number(process.argv[3] ?? 200);
const rng = createRng('measure' + N);
const hist = new Map<string, number>();
let fails = 0, guess = 0;
const t0 = performance.now();
const scores: number[] = [];
for (let i = 0; i < count; i++) {
  const sol = randomSolution(N, rng);
  const regions = makeUnique(N, growRegions(N, sol, rng), sol, rng);
  if (!regions || !regionsConnected(N, regions)) { fails++; continue; }
  const r = solveLogically(buildBoard(N, regions));
  if (!r.solved) { guess++; continue; }
  hist.set('L' + r.maxLevel, (hist.get('L' + r.maxLevel) ?? 0) + 1);
  scores.push(r.score);
}
const ms = performance.now() - t0;
scores.sort((a, b) => a - b);
console.log(`n=${N} ${count} Versuche, ${(ms / count).toFixed(1)} ms/Versuch, nicht eindeutig: ${fails}, Logik reicht nicht: ${guess}`);
console.log([...hist.entries()].sort().map(([k, v]) => `${k}:${v}`).join(' '), ' score p10/50/90:', scores[Math.floor(scores.length * .1)], scores[Math.floor(scores.length * .5)], scores[Math.floor(scores.length * .9)]);

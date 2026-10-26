// Generator-Bericht: npx tsx scripts/report.ts [Rätsel je Stufe]
// Erzeugt je Schwierigkeit viele Rätsel und misst Größe, Laufzeit, Techniken, Eindeutigkeit.
import { regionsConnected } from '../src/core/board';
import { DIFFICULTIES, generatePuzzle, type Difficulty, type GeneratedPuzzle } from '../src/core/generator';
import { solve } from '../src/core/solver';

const COUNT = Number(process.argv[2] ?? 100);
const NAMES: Record<Difficulty, string> = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
const TECH = { single: 'Einzelfeld', confine: 'Einschluss', attack: 'Bedrohung', group: 'Gruppe', lookahead: 'Probieren' } as const;

const pct = (arr: number[], p: number) => [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

console.log(`| Stufe | Größen | Ø Zeit | p95 | max | Ø Versuche | eindeutig | zusammenhängend | im Ziel | Ø Schritte | Ø Score | Techniken (Rätsel, die sie brauchen) |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
const samples: GeneratedPuzzle[] = [];
for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
  const spec = DIFFICULTIES[diff];
  const times: number[] = [];
  const list: GeneratedPuzzle[] = [];
  for (let i = 0; i < COUNT; i++) {
    const t0 = performance.now();
    list.push(generatePuzzle({ seed: `report-${i}`, difficulty: diff }));
    times.push(performance.now() - t0);
  }
  samples.push(list[0]);
  const sizes = new Map<number, number>();
  list.forEach((p) => sizes.set(p.n, (sizes.get(p.n) ?? 0) + 1));
  const unique = list.filter((p) => solve(p.n, p.regions, 2).count === 1).length;
  const connected = list.filter((p) => regionsConnected(p.n, p.regions)).length;
  const inSpec = list.filter((p) => p.rating.maxLevel >= spec.minLevel && p.rating.maxLevel <= spec.maxLevel && p.rating.score >= spec.minScore).length;
  const tech = (Object.keys(TECH) as (keyof typeof TECH)[]).map((t) => `${TECH[t]} ${list.filter((p) => p.rating.counts[t] > 0).length}`).join(', ');
  console.log(
    `| ${NAMES[diff]} | ${[...sizes].sort().map(([n, c]) => `${n}×${n}: ${c}`).join(', ')} | ${avg(times).toFixed(0)} ms | ${pct(times, 0.95).toFixed(0)} ms | ${Math.max(...times).toFixed(0)} ms | ${avg(list.map((p) => p.attempts)).toFixed(1)} | ${unique}/${COUNT} | ${connected}/${COUNT} | ${inSpec}/${COUNT} | ${avg(list.map((p) => p.rating.steps)).toFixed(1)} | ${avg(list.map((p) => p.rating.score)).toFixed(1)} | ${tech} |`,
  );
}

console.log('\nBeispiele (Buchstabe = Region, Großbuchstabe = Katze der Lösung):');
for (const p of samples) {
  console.log(`\n${NAMES[p.difficulty]} ${p.n}×${p.n}, Score ${p.rating.score}, schwerste Technik Stufe ${p.rating.maxLevel}`);
  for (let r = 0; r < p.n; r++) {
    console.log(
      '  ' +
        p.regions
          .slice(r * p.n, r * p.n + p.n)
          .map((reg, c) => (p.solution[r] === c ? String.fromCharCode(65 + reg) : String.fromCharCode(97 + reg)))
          .join(' '),
    );
  }
}

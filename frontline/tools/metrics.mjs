// KI-Kennzahlen (seit v5.83): lange Läufe KI gegen KI mit den Schaltern des Startmenüs, je Seed eine Zeile mit Kennzahlen je Team
// (Stahl, Munition, Ausbildung, Abschüsse, FOBs, Stadtzellen, besetzte Häuser, Stürme, Routen ab Werk, Luftabwehr, Punkte).
// Vergleicht mit den Referenzwerten in tools/metrics-ref.json und warnt nur bei groben Ausreißern: ein Wert fällt auf 0, obwohl die
// Referenz deutlich darüber lag, oder weicht um mehr als die Hälfte ab. Das findet Fehler, die kein Test bemerkt, weil nichts
// abstürzt (z. B. v5.82: eine KI-Stadt erzeugte keinen Stahl). Kurze Ausgabe, damit Agenten wenig Tokens verbrauchen.
//
// Aufruf (im Ordner frontline/):  npm run metrics                 vergleichen (Exit-Code 1 bei Warnungen)
//                                  npm run metrics -- --update     Referenzwerte neu setzen (nach gewollten Änderungen an KI oder Wirtschaft)
// Läuft in der CI nach npm test; von Hand bei Paketen, die KI, Stadt-Wirtschaft oder Kampf ändern. Je Seed ein Worker (parallel).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

export const SEEDS = [3, 7, 11];
export const MINUTES = 15;
const DT = 0.1;
const REF = fileURLToPath(new URL('./metrics-ref.json', import.meta.url));
// Schalter wie im Startmenü (BALANCE.menuDefaults): so spielt man das Spiel
const OPTS = { radio: true, weather: 'random', research: true, river: true, city: true, buildRules: true };
// Kennzahlen: Kürzel für die Ausgabe. Zahlen unter MIN gelten beim Vergleich als „klein“ (keine Prozent-Warnung, Rauschen)
export const KEYS = {
  steel: 'Stahl', mun: 'Mun', trained: 'Ausb', kills: 'Absch', fobs: 'FOB', cells: 'Stadt', houses: 'Häuser',
  storms: 'Sturm', workRoutes: 'Werkroute', airDef: 'Luftabw', points: 'Pkt',
};
const MIN = 10;

/** Ein Lauf: Kennzahlen je Team. Läuft im Worker (oder direkt, z. B. in Tests). */
export async function runSeed(seed, minutes = MINUTES) {
  const { Game } = await import('../js/game/game.js');
  const { AI } = await import('../js/ai/ai.js');
  const g = new Game({ seed, ...OPTS });
  const ais = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
  const peak = [0, 1].map(() => ({ houses: 0, storms: 0, workRoutes: 0, airDef: 0 }));
  const steps = Math.round((minutes * 60) / DT);
  for (let k = 0; k < steps; k++) {
    ais[0].update(DT);
    ais[1].update(DT);
    g.update(DT);
    if (k % 50 !== 0) continue; // alle 5 s Spielzeit: Höchstwerte
    for (let t = 0; t < 2; t++) {
      const p = peak[t];
      let storms = 0;
      let work = 0;
      let air = 0;
      for (const u of g.units) {
        if (!u.alive || u.team !== t) continue;
        if (u.order.type === 'storm') storms++;
        if (u.order.work != null) work++;
        if (u.type === 'flak' || u.type === 'sam' || u.type === 'gepard') air++;
      }
      p.houses = Math.max(p.houses, g.garrisoned.filter((h) => h.alive && h.team === t).length);
      p.storms = Math.max(p.storms, storms);
      p.workRoutes = Math.max(p.workRoutes, work);
      p.airDef = Math.max(p.airDef, air);
    }
  }
  return [0, 1].map((t) => {
    const c = g.city?.[t];
    const s = g.teams[t].stats;
    return {
      steel: Math.round(c?.made.metal ?? 0),
      mun: Math.round(c?.made.mun ?? 0),
      trained: s.trained,
      kills: s.kills,
      fobs: g.buildings.filter((b) => b.alive && b.built && b.team === t && b.type === 'fob').length,
      cells: c?.list.length ?? 0,
      ...peak[t],
      points: Math.round(g.teams[t].points),
    };
  });
}

/** Warnungen für einen Seed: Wert 0 bei Referenz ≥ MIN, oder Abweichung über 50 % (beide ≥ MIN). */
export function compare(now, ref) {
  const out = [];
  for (let t = 0; t < 2; t++) {
    for (const k of Object.keys(KEYS)) {
      const a = now[t][k];
      const r = ref?.[t]?.[k];
      if (r === undefined) continue;
      const team = t ? 'Rot' : 'Blau';
      if (a === 0 && r >= MIN) out.push(`${team} ${KEYS[k]} 0, Referenz ${r}`);
      else if (Math.max(a, r) >= MIN && Math.abs(a - r) > 0.5 * Math.max(a, r)) out.push(`${team} ${KEYS[k]} ${a}, Referenz ${r} (${a > r ? '+' : ''}${Math.round((100 * (a - r)) / Math.max(r, 1))} %)`);
    }
  }
  return out;
}

const line = (seed, v) =>
  `Seed ${seed}: ` + Object.keys(KEYS).map((k) => `${KEYS[k]} ${v[0][k]}/${v[1][k]}`).join(' · ');

if (!isMainThread) {
  runSeed(workerData.seed).then((v) => parentPort.postMessage(v));
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const update = process.argv.includes('--update');
  const t0 = Date.now();
  const n = Math.max(1, Math.min(SEEDS.length, cpus().length));
  const results = {};
  const queue = [...SEEDS];
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (queue.length) {
        const seed = queue.shift();
        results[seed] = await new Promise((resolve, reject) => {
          const w = new Worker(fileURLToPath(import.meta.url), { workerData: { seed } });
          w.once('message', resolve);
          w.once('error', reject);
        });
      }
    }),
  );
  const ref = existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : {};
  let warn = 0;
  console.log(`KI-Kennzahlen (Blau/Rot), ${MINUTES} min je Seed, ${((Date.now() - t0) / 1000).toFixed(0)} s:`);
  for (const seed of SEEDS) {
    console.log(line(seed, results[seed]));
    if (update) continue;
    for (const w of compare(results[seed], ref[seed])) {
      console.log(`  ⚠ Seed ${seed}: ${w}`);
      warn++;
    }
  }
  if (update) {
    writeFileSync(REF, JSON.stringify(results, null, 1) + '\n');
    console.log('Referenzwerte gesetzt: tools/metrics-ref.json');
  } else if (!Object.keys(ref).length) console.log('Keine Referenzwerte: npm run metrics -- --update');
  else if (warn) console.log(`${warn} Ausreißer. Gewollt (Regeländerung)? Dann: npm run metrics -- --update`);
  else console.log('Keine Ausreißer.');
  process.exit(warn ? 1 : 0);
}

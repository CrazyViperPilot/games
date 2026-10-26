// Rätsel besorgen: über einen Web Worker, mit vorbereitetem Vorrat für das freie Spiel.

import { dailyDifficulty, generatePuzzle, type Difficulty, type GenerateOptions, type GeneratedPuzzle } from '../core/generator';
import { loadNext, saveNext } from './storage';

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (p: GeneratedPuzzle) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; puzzle?: GeneratedPuzzle; error?: string }>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.puzzle) w.resolve(e.data.puzzle);
      else w.reject(new Error(e.data.error ?? 'Fehler'));
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function generate(opts: GenerateOptions): Promise<GeneratedPuzzle> {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => generatePuzzle(opts));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, opts });
  });
}

export function randomSeed(): string {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `free-${r[0].toString(36)}${r[1].toString(36)}`;
}

const preparing = new Map<Difficulty, Promise<GeneratedPuzzle | null>>();

/** Legt im Hintergrund das nächste Rätsel der Stufe bereit. */
export function prepareNext(d: Difficulty): void {
  if (loadNext(d) || preparing.has(d)) return;
  const job = generate({ seed: randomSeed(), difficulty: d })
    .then((p) => {
      saveNext(d, p);
      return p;
    })
    .catch(() => null)
    .finally(() => preparing.delete(d));
  preparing.set(d, job);
}

/** Nächstes freies Rätsel: aus dem Vorrat (sofort), aus der laufenden Vorbereitung oder frisch erzeugt. */
export async function takeFree(d: Difficulty): Promise<GeneratedPuzzle> {
  let p = loadNext(d) ?? (await preparing.get(d)) ?? null;
  saveNext(d, null);
  if (!p) p = await generate({ seed: randomSeed(), difficulty: d });
  prepareNext(d);
  return p;
}

export function daily(date: string): Promise<GeneratedPuzzle> {
  const [y, m, day] = date.split('-').map(Number);
  return generate({ seed: `daily-${date}`, difficulty: dailyDifficulty(new Date(y, m - 1, day)) });
}

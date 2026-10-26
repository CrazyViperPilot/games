// Web Worker: erzeugt Rätsel, ohne die Oberfläche zu blockieren.
import { generatePuzzle, type GenerateOptions } from './core/generator';

self.onmessage = (e: MessageEvent<{ id: number; opts: GenerateOptions }>) => {
  const { id, opts } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, puzzle: generatePuzzle(opts) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};

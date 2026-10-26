// Höhengelände (Hügel, Berge, Seen). Gespeichert als Höhenraster alle 64 px, für Netz, Neigung und Wegfindung
// auf ein Feinraster von 32 px (= Zellengröße) glatt hochgerechnet. Höhen in Bildschirm-Pixeln bei Zoom 1, wie die
// Gebäudehöhen der isometrischen Ansicht. Kein DOM.
import { BALANCE } from '../data/balance.js';

const W = BALANCE.map.width;

export const RELIEF = {
  res: 64, // Abstand der gespeicherten Höhenpunkte (px)
  step: BALANCE.map.tile, // Feinraster (Netz, Neigung, Wegfindung)
  water: -20, // Wasserspiegel: tiefer liegendes Gelände ist See und unpassierbar
  steep: 0.42, // Neigung (Höhe je px), ab der niemand mehr hinaufkommt (Fels)
  rock: 0.3, // ab hier zeigt das Bild Fels
  peak: 300, // Gipfel: darüber ist alles Fels und unpassierbar, auch wenn es flach ist
  min: -128, // Speicherformat: 1 Byte je Punkt in 2er-Schritten ab −128 (bis 382)
  q: 2,
};

export const COARSE_N = W / RELIEF.res + 1; // 142 Punkte je Achse (0 … 9024)
export const FINE_N = W / RELIEF.step + 1; // 283

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Catmull-Rom-Mitte zwischen p1 und p2
const mid = (p0, p1, p2, p3) => (-p0 + 9 * p1 + 9 * p2 - p3) / 16;

export class Relief {
  /** coarse: Float32Array(COARSE_N²) mit Höhen, Zeile für Zeile (y), sonst flach. */
  constructor(coarse = null) {
    this.coarse = coarse ?? new Float32Array(COARSE_N * COARSE_N);
    this.fine = new Float32Array(FINE_N * FINE_N);
    this.tmp = new Float32Array(FINE_N * COARSE_N);
    this.version = 0;
    this.rows = null; // [erste, letzte] seit dem letzten Hochladen geänderte Feinzeile (WebGL-Boden lädt nur die neu)
    this.refine();
  }

  /**
   * Feinraster aus dem Grobraster neu berechnen (getrennt in x und y, glatt, durch die Grobpunkte). Mit Grenzen nur der
   * Teil, den die geänderten Grobpunkte i0…i1 × j0…j1 beeinflussen (Editor-Pinsel).
   */
  refine(i0 = 0, j0 = 0, i1 = COARSE_N - 1, j1 = COARSE_N - 1) {
    const C = this.coarse;
    const T = this.tmp;
    const F = this.fine;
    const n = COARSE_N;
    const c = (i, j) => C[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)];
    // ein Grobpunkt k wirkt auf die Feinpunkte 2k − 3 … 2k + 3
    const fi0 = Math.max(0, 2 * i0 - 3);
    const fi1 = Math.min(FINE_N - 1, 2 * i1 + 3);
    const fj0 = Math.max(0, 2 * j0 - 3);
    const fj1 = Math.min(FINE_N - 1, 2 * j1 + 3);
    for (let j = Math.max(0, (fj0 >> 1) - 1); j <= Math.min(n - 1, (fj1 >> 1) + 2); j++) {
      for (let i = fi0; i <= fi1; i++) {
        const k = i >> 1;
        T[j * FINE_N + i] = i & 1 ? mid(c(k - 1, j), c(k, j), c(k + 1, j), c(k + 2, j)) : c(k, j);
      }
    }
    const t = (i, j) => T[clamp(j, 0, n - 1) * FINE_N + i];
    for (let j = fj0; j <= fj1; j++) {
      const k = j >> 1;
      for (let i = fi0; i <= fi1; i++) {
        F[j * FINE_N + i] = j & 1 ? mid(t(i, k - 1), t(i, k), t(i, k + 1), t(i, k + 2)) : t(i, k);
      }
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < F.length; i++) {
      if (F[i] < lo) lo = F[i];
      if (F[i] > hi) hi = F[i];
    }
    this.lo = lo;
    this.hi = hi;
    this.rows = this.rows ? [Math.min(this.rows[0], fj0), Math.max(this.rows[1], fj1)] : [fj0, fj1];
    this.version++;
  }

  /** Geländehöhe am Weltpunkt (bilinear im Feinraster). */
  heightAt(x, y) {
    const s = RELIEF.step;
    const u = clamp(x / s, 0, FINE_N - 1.000001);
    const v = clamp(y / s, 0, FINE_N - 1.000001);
    const i = u | 0;
    const j = v | 0;
    const fu = u - i;
    const fv = v - j;
    const F = this.fine;
    const k = j * FINE_N + i;
    return (F[k] * (1 - fu) + F[k + 1] * fu) * (1 - fv) + (F[k + FINE_N] * (1 - fu) + F[k + FINE_N + 1] * fu) * fv;
  }

  /** Sichtbare Höhe: Seen haben eine ebene Wasseroberfläche. */
  displayAt(x, y) {
    return Math.max(RELIEF.water, this.heightAt(x, y));
  }

  /** Neigung (Höhe je px) als Vektor, aus Nachbarpunkten im Abstand d. */
  gradAt(x, y, d = 16) {
    return {
      x: (this.heightAt(x + d, y) - this.heightAt(x - d, y)) / (2 * d),
      y: (this.heightAt(x, y + d) - this.heightAt(x, y - d)) / (2 * d),
    };
  }

  /** Neigung einer Zelle (c, r) des Spielrasters (ihre vier Ecken sind Feinpunkte). */
  cellSlope(c, r) {
    const F = this.fine;
    const k = r * FINE_N + c;
    const a = F[k];
    const b = F[k + 1];
    const d = F[k + FINE_N];
    const e = F[k + FINE_N + 1];
    const s2 = 2 * RELIEF.step;
    return Math.hypot((b + e - a - d) / s2, (d + e - a - b) / s2);
  }

  /** Mittlere Höhe einer Zelle. */
  cellHeight(c, r) {
    const F = this.fine;
    const k = r * FINE_N + c;
    return (F[k] + F[k + 1] + F[k + FINE_N] + F[k + FINE_N + 1]) / 4;
  }

  /** Zelle ist unpassierbar: zu steil oder unter Wasser. */
  cellBlocked(c, r) {
    const h = this.cellHeight(c, r);
    return h < RELIEF.water || h > RELIEF.peak || this.cellSlope(c, r) > RELIEF.steep;
  }

  /** Grobraster als Text (Base64, 1 Byte je Punkt). */
  encode() {
    const C = this.coarse;
    let s = '';
    for (let i = 0; i < C.length; i++) s += String.fromCharCode(clamp(Math.round((C[i] - RELIEF.min) / RELIEF.q), 0, 255));
    return btoa(s);
  }

  /** Aus encode() zurück; null bei falscher Länge oder kaputtem Text. */
  static decode(text) {
    if (typeof text !== 'string') return null;
    let s;
    try {
      s = atob(text);
    } catch {
      return null;
    }
    if (s.length !== COARSE_N * COARSE_N) return null;
    const C = new Float32Array(s.length);
    for (let i = 0; i < s.length; i++) C[i] = s.charCodeAt(i) * RELIEF.q + RELIEF.min;
    return new Relief(C);
  }
}

const cache = new WeakMap(); // Karte → { src, relief }

/** Gelände einer Karte (aus `map.relief`, zwischengespeichert) oder null für flache Karten. */
export function reliefOf(map) {
  if (!map || typeof map.relief !== 'string') return null;
  const hit = cache.get(map);
  if (hit && hit.src === map.relief) return hit.relief;
  const relief = Relief.decode(map.relief);
  cache.set(map, { src: map.relief, relief });
  return relief;
}

/** Gelände in die Karte schreiben (Text) und das Objekt für reliefOf merken (Editor: dasselbe Objekt bleibt aktiv). */
export function setRelief(map, relief) {
  if (!relief) {
    delete map.relief;
    cache.delete(map);
    return;
  }
  map.relief = relief.encode();
  cache.set(map, { src: map.relief, relief });
}

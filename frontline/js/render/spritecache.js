// Zwischenspeicher für gemalte Gebäude (seit v5.14): jede Variante (Art, Stufe, Farbe, Jahreszeit …) wird je Maßstab einmal in ein
// eigenes kleines Bild gemalt und danach nur noch kopiert. So bleiben auch große Städte mit vielen detailreichen Häusern auf Handy
// und Tablet flüssig (ein drawImage statt hunderter Flächen je Haus und Bild).
// Maßstäbe in Stufen von 2^(1/4): beim Kopieren wird ein Bild höchstens um ±9 % gestreckt, bleibt also scharf. Je Bild darf nur
// BUDGET_MS lang neu gemalt werden (Zoomen erzeugt sonst einen Ruckler); was dann noch fehlt, nimmt solange das vorhandene Bild in
// einem anderen Maßstab und wird in den nächsten Bildern nachgemalt. Bilder, die länger nicht gebraucht wurden, fallen heraus.
// Nur Darstellung, kein Spielzustand, kein Einfluss auf die Simulation.

const STEP = Math.log(2) / 4; // Abstand zweier Maßstäbe (natürlicher Logarithmus)
const MIN_SCALE = 0.25; // Gerätepixel je Einheit, kleiner/größer wird nicht gemalt
const MAX_SCALE = 6;
const BUDGET_MS = 6; // Zeit je Bild für neue Zeichnungen
const MAX_PIXELS = 10e6; // Obergrenze aller Bilder zusammen (Bildpunkte, ≈ 40 MB); darüber fallen die ältesten heraus (weich, siehe trim)
const IDLE_MS = 30000; // so lange nicht gebraucht: Bild fällt heraus

const store = new Map(); // Schlüssel → Map(Maßstabsstufe → Eintrag)
let pixels = 0;
let spent = 0;
let now = 0;
let prev = 0; // Zeitpunkt des vorigen Bilds
let lastSweep = 0;

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null; // Node-Tests: kein Canvas, der Aufrufer malt dann direkt
}

let ratio = 1;

/** Gerätepixel je CSS-Pixel des laufenden Bilds (für den Maßstab der Bilder). */
export const spriteDpr = () => ratio;

/** Zu Beginn jedes Bilds aufrufen (Renderer): merkt die Gerätepixel, setzt das Zeitbudget zurück und räumt alte Bilder weg. */
export function spriteFrame(r = 1) {
  ratio = r || 1;
  prev = now;
  now = clock();
  spent = 0;
  if (now - lastSweep < 2000) return;
  lastSweep = now;
  for (const [key, levels] of store) {
    for (const [k, e] of levels) {
      if (now - e.used < IDLE_MS) continue;
      pixels -= e.px;
      levels.delete(k);
    }
    if (!levels.size) store.delete(key);
  }
}

/**
 * Über der Obergrenze: die am längsten nicht gebrauchten Bilder entfernen, bis 70 % frei sind. Was in diesem oder dem vorigen Bild
 * gebraucht wurde, bleibt (seit v5.29): sonst fiele in sehr vollen Ansichten (größter Zoom auf dem Handy, Wald neben der
 * Kartenstadt) ein Teil des gerade Sichtbaren heraus und würde Bild für Bild neu gemalt (Ruckeln, flache Ersatzbäume). Die Grenze
 * ist damit weich: der Speicher wächst höchstens auf das, was eine Ansicht wirklich braucht.
 */
function trim() {
  const all = [];
  for (const [key, levels] of store) for (const [k, e] of levels) all.push({ key, k, e });
  all.sort((a, b) => a.e.used - b.e.used);
  for (const { key, k, e } of all) {
    if (pixels <= MAX_PIXELS * 0.7) break;
    if (e.used >= prev) break; // ab hier alles in diesem oder dem vorigen Bild gebraucht (sortiert)
    const levels = store.get(key);
    levels.delete(k);
    if (!levels.size) store.delete(key);
    pixels -= e.px;
  }
}

function render(bounds, s, paint) {
  const [x0, y0, x1, y1] = bounds;
  const w = Math.max(1, Math.ceil((x1 - x0) * s) + 2);
  const h = Math.max(1, Math.ceil((y1 - y0) * s) + 2);
  const img = makeCanvas(w, h);
  if (!img) return null;
  const ctx = img.getContext('2d');
  ctx.translate(1 - x0 * s, 1 - y0 * s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paint(ctx, s);
  return { img, s, x0: x0 - 1 / s, y0: y0 - 1 / s, w: w / s, h: h / s, px: w * h, used: now };
}

/**
 * Bild der Variante `key` für `scale` Gerätepixel je Einheit. bounds = [x0, y0, x1, y1]: Fläche (in Einheiten) um den Ankerpunkt,
 * die das Bild abdeckt. paint(ctx, s) malt mit dem Ankerpunkt im Ursprung und s Gerätepixeln je Einheit.
 * Ergebnis: Eintrag für blit(), false (Zeitbudget dieses Bilds aufgebraucht, noch nichts da: diesmal nicht zeichnen) oder null
 * (kein Canvas verfügbar: der Aufrufer malt direkt).
 */
export function sprite(key, scale, bounds, paint) {
  const k = Math.round(Math.log(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))) / STEP);
  let levels = store.get(key);
  let e = levels?.get(k);
  if (!e) {
    if (spent >= BUDGET_MS) {
      // Budget dieses Bilds aufgebraucht: solange den nächsten vorhandenen Maßstab nehmen (lieber den größeren);
      // gibt es noch keinen, fehlt das Gebäude ein, zwei Bilder lang (false), statt das Bild ruckeln zu lassen
      let best = null;
      let bd = Infinity;
      for (const [kk, ee] of levels ?? []) {
        const d = Math.abs(kk - k) + (kk < k ? 0.5 : 0);
        if (d < bd) {
          bd = d;
          best = ee;
        }
      }
      if (!best) return false;
      best.used = now;
      return best;
    }
    const t0 = clock();
    e = render(bounds, Math.exp(k * STEP), paint);
    spent += clock() - t0;
    if (!e) return null;
    if (!levels) store.set(key, (levels = new Map()));
    levels.set(k, e);
    pixels += e.px;
    if (pixels > MAX_PIXELS) trim();
  }
  e.used = now;
  return e;
}

/** Vorhandenes Bild der Variante `key` (Maßstab am nächsten an `scale`), ohne neu zu malen; sonst null (Ersatz, seit v5.27). */
export function peek(key, scale) {
  const levels = store.get(key);
  if (!levels?.size) return null;
  const k = Math.log(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))) / STEP;
  let best = null;
  let bd = Infinity;
  for (const [kk, e] of levels) {
    const d = Math.abs(kk - k);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  best.used = now;
  return best;
}

/** Eintrag e so zeichnen, dass sein Ankerpunkt bei (x, y) liegt; f = Zeichenkoordinaten je Einheit (Iso: Zoom, 2D: 1). */
export function blit(ctx, e, x, y, f) {
  ctx.drawImage(e.img, x + e.x0 * f, y + e.y0 * f, e.w * f, e.h * f);
}

/** Für Tests und Fehlersuche: Zahl der Bilder und Bildpunkte im Speicher. */
export function spriteStats() {
  let n = 0;
  for (const levels of store.values()) n += levels.size;
  return { sprites: n, pixels };
}

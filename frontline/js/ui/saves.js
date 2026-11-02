// Spielstand speichern und fortsetzen: lokal in IndexedDB (läuft offline) und zusätzlich auf Daniels Webspace
// (PHP, `frontline/api.php` im Repo vipervocs). Es gibt genau einen Stand; der neuere (savedAt) gewinnt.
// Ohne Netz wird nur lokal gespeichert und beim nächsten Mal nachgeschickt.
import { toB64, fromB64 } from '../core/snapshot.js';

export const REMOTE_URL = 'https://phpexpert.de/vocs/frontline/api.php';
const DB = 'frontline-save';
const STORE = 'save';
const KEY = 'current';
const TIMEOUT = 15000;

/** Meta: { savedAt (ms), format, gameTime, points: [a, b], winPoints, difficulty, size }. Rec: { meta, bytes (gzip) }. */

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const readLocal = () => idb('readonly', (s) => s.get(KEY)).then((r) => r ?? null).catch(() => null);
export const writeLocal = (rec) => idb('readwrite', (s) => s.put(rec, KEY));
export const clearLocal = () => idb('readwrite', (s) => s.delete(KEY)).catch(() => {});

async function remote(method, query = '', body = null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(REMOTE_URL + query, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'text/plain' } : undefined, // kein Preflight nötig
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Serverfehler ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Meta des Webspace-Stands oder null (leer); wirft bei Netzfehler. */
export async function remoteMeta() {
  const d = await remote('GET', '?meta=1');
  return d.meta ?? null;
}

export async function pullRemote() {
  const d = await remote('GET');
  return d.meta ? { meta: d.meta, bytes: fromB64(d.data) } : null;
}

export const pushRemote = (rec) => remote('POST', '', { action: 'save', meta: rec.meta, data: toB64(rec.bytes) });
export const clearRemote = () => remote('POST', '', { action: 'delete' });

let pending = Promise.resolve(); // Schreibvorgänge nacheinander

/** Speichert lokal (sicher) und versucht den Webspace. Liefert 'beide' | 'lokal' (Webspace nicht erreichbar). */
export function saveBoth(rec) {
  const job = pending.then(async () => {
    await writeLocal(rec);
    try {
      await pushRemote(rec);
      return 'beide';
    } catch {
      return 'lokal';
    }
  });
  pending = job.catch(() => {});
  return job;
}

/** Löscht den Stand lokal und, soweit erreichbar, auf dem Webspace. */
export function discardAll() {
  const job = pending.then(async () => {
    await clearLocal();
    try {
      await clearRemote();
    } catch {
      /* offline: der Webspace-Stand bleibt; gilt dann beim nächsten Start noch */
    }
  });
  pending = job.catch(() => {});
  return job;
}

/**
 * Neuesten Stand ermitteln: lokal und Webspace vergleichen. Lädt den Webspace-Stand nur, wenn er neuer ist.
 * Schickt einen neueren lokalen Stand nach (nach Offline-Spielen). Liefert { rec, source: 'lokal' | 'Webspace' } oder null.
 */
export async function findBest() {
  const local = await readLocal();
  let rm = null;
  let online = true;
  try {
    rm = await remoteMeta();
  } catch {
    online = false;
  }
  if (rm && (!local || rm.savedAt > local.meta.savedAt)) {
    try {
      const rec = await pullRemote();
      if (rec) {
        await writeLocal(rec).catch(() => {});
        return { rec, source: 'Webspace' };
      }
    } catch {
      /* Netz weg zwischen den Aufrufen: lokalen Stand nehmen */
    }
  }
  if (local) {
    if (online && (!rm || local.meta.savedAt > rm.savedAt)) pushRemote(local).catch(() => {});
    return { rec: local, source: 'lokal' };
  }
  return null;
}

export function describe(meta, source) {
  const t = Math.floor(meta.gameTime);
  const mm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const when = new Date(meta.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  return `Spielzeit ${mm} · Punkte ${meta.points[0]} : ${meta.points[1]} von ${meta.winPoints} · ${meta.difficulty} · gespeichert ${when} (${source})`;
}

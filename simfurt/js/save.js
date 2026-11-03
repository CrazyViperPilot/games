// Simfurt – Speichern: lokal in IndexedDB (offline) und zusätzlich auf Daniels Webspace (PHP, simfurt/api.php im Repo vipervocs).
// Drei Plätze. Der jeweils neuere Stand (savedAt) gewinnt; ohne Netz wird später nachgeschickt.
import { N } from './data.js';
import { newCity, refresh } from './sim.js';

export const REMOTE_URL = 'https://phpexpert.de/vocs/simfurt/api.php';
export const SLOTS = [1, 2, 3];
const DB = 'simfurt-save', STORE = 'slots', FORMAT = 1, TIMEOUT = 12000;

// ---------------------------------------------------------------- Serialisierung
const ARR = ['terrain', 'road', 'zone', 'lvl', 'vr', 'fire', 'flood'];
function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
export { toB64, fromB64 };

export function serialize(s) {
  const o = {
    format: FORMAT, size: N, name: s.name, seed: s.seed, rng: s.rng, year: s.year, month: s.month, money: s.money, loan: s.loan, rates: s.rates, disasters: s.disasters,
    bld: s.bld, nextId: s.nextId, ms: s.ms, msgs: s.msgs.slice(-30), hist: s.hist, occupancy: s.occupancy, demand: s.demand, ticks: s.ticks, seen: s.seen, peakPop: s.peakPop || 0,
  };
  for (const k of ARR) o[k] = toB64(s[k]);
  return JSON.stringify(o);
}

export function deserialize(text) {
  const o = JSON.parse(text);
  if (o.format !== FORMAT) throw new Error('Unbekanntes Format');
  const s = newCity({ name: o.name, seed: o.seed, size: o.size || 64 });
  for (const k of ['rng', 'year', 'month', 'money', 'loan', 'rates', 'disasters', 'bld', 'nextId', 'ms', 'msgs', 'hist', 'occupancy', 'demand', 'ticks', 'seen', 'peakPop']) if (o[k] !== undefined) s[k] = o[k];
  for (const k of ARR) { const u = fromB64(o[k]); if (u.length !== N * N) throw new Error('Kartengröße passt nicht'); s[k].set(u); }
  s.occ.fill(0);
  for (const b of s.bld) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) s.occ[y * N + x] = b.id;
  refresh(s);
  return s;
}

export function metaOf(s) {
  return { savedAt: Date.now(), format: FORMAT, size: N, name: s.name, year: s.year, month: s.month, pop: s.stats ? s.stats.pop : 0, money: Math.round(s.money) };
}

// ---------------------------------------------------------------- Komprimierung
const canZip = typeof CompressionStream !== 'undefined';
async function pipe(bytes, stream) {
  const r = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(r).arrayBuffer());
}
export const gzip = (text) => pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
export const gunzip = async (u8) => new TextDecoder().decode(await pipe(u8, new DecompressionStream('gzip')));

// ---------------------------------------------------------------- Lokal (IndexedDB)
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
      const tx = db.transaction(STORE, mode); const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export const readLocal = (slot) => idb('readonly', (st) => st.get('slot' + slot)).then((r) => r ?? null).catch(() => null);
export const writeLocal = (slot, rec) => idb('readwrite', (st) => st.put(rec, 'slot' + slot));
export const clearLocal = (slot) => idb('readwrite', (st) => st.delete('slot' + slot)).catch(() => {});

// ---------------------------------------------------------------- Webspace
async function remote(method, query = '', body = null) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(REMOTE_URL + query, {
      method, body: body ? JSON.stringify(body) : undefined, headers: body ? { 'Content-Type': 'text/plain' } : undefined, signal: ctrl.signal, cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Serverfehler ${res.status}`);
    return data;
  } finally { clearTimeout(timer); }
}
export const remoteList = async () => (await remote('GET', '?list=1')).slots ?? {};
export async function pullRemote(slot) {
  const d = await remote('GET', `?slot=${slot}`);
  return d.meta ? { meta: d.meta, bytes: fromB64(d.data) } : null;
}
export const pushRemote = (slot, rec) => remote('POST', '', { action: 'save', slot, meta: rec.meta, data: toB64(rec.bytes) });
export const deleteRemote = (slot) => remote('POST', '', { action: 'delete', slot });

// ---------------------------------------------------------------- Öffentliche Aufrufe
const PENDING = (slot) => 'simfurt-pending-' + slot;
const setPending = (slot, v) => { try { v ? localStorage.setItem(PENDING(slot), '1') : localStorage.removeItem(PENDING(slot)); } catch { /* ignorieren */ } };
const isPending = (slot) => { try { return !!localStorage.getItem(PENDING(slot)); } catch { return false; } };

/** Speichert lokal (sicher) und versucht danach den Webspace. Liefert 'beide' | 'lokal'. */
export async function saveSlot(slot, s) {
  const text = serialize(s); const meta = metaOf(s);
  const rec = canZip ? { meta, bytes: await gzip(text) } : { meta, text };
  await writeLocal(slot, rec);
  if (!rec.bytes) return 'lokal';
  setPending(slot, true);
  try { await pushRemote(slot, rec); setPending(slot, false); return 'beide'; } catch { return 'lokal'; }
}

async function recToState(rec) { return deserialize(rec.bytes ? await gunzip(rec.bytes) : rec.text); }

/** Lädt einen Platz; nimmt den neueren von lokal und Webspace. Liefert {state, source} oder null. */
export async function loadSlot(slot) {
  const local = await readLocal(slot);
  let remoteRec = null;
  try { remoteRec = await pullRemote(slot); } catch { /* offline */ }
  let pick = local, source = 'lokal';
  if (remoteRec && (!local || remoteRec.meta.savedAt > local.meta.savedAt)) { pick = remoteRec; source = 'Webspace'; await writeLocal(slot, remoteRec).catch(() => {}); }
  else if (local && isPending(slot) && local.bytes) pushRemote(slot, local).then(() => setPending(slot, false)).catch(() => {});
  if (!pick) return null;
  return { state: await recToState(pick), source };
}

/** Übersicht der drei Plätze: {slot, local, remote}. */
export async function listSlots(withRemote = true) {
  const out = [];
  let rem = {};
  if (withRemote) { try { rem = await remoteList(); } catch { rem = null; } }
  for (const slot of SLOTS) {
    const local = await readLocal(slot);
    out.push({ slot, local: local ? local.meta : null, remote: rem ? rem[slot] ?? null : undefined });
  }
  return out;
}

export async function deleteSlot(slot) {
  await clearLocal(slot); setPending(slot, false);
  try { await deleteRemote(slot); } catch { /* offline */ }
}

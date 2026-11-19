// Simfurt – Speichern.
// Drei Plätze. Lokal zuerst (IndexedDB, Ersatz: localStorage), zusätzlich ein synchroner Notfall-Schnappschuss beim Verlassen der Seite.
// Optional im Hintergrund: Webspace (PHP, simfurt/api.php in diesem Repo, Deploy per deploy-backend.yml) – blockiert nie das lokale Speichern.
// Außerdem Export/Import als Datei (.simfurt = gzip-JSON, ohne CompressionStream reines JSON).
import { N } from './data.js';
import { newCity, refresh, say } from './sim.js';

export const REMOTE_URL = 'https://phpexpert.de/games/simfurt/api.php';
export const SLOTS = [1, 2, 3];
const DB = 'simfurt-save', STORE = 'slots', FORMAT = 2, FORMATS = [1, 2], TIMEOUT = 8000, RETRY_MS = 5 * 60 * 1000;
const LS_SLOT = (slot) => 'simfurt-slot-' + slot, LS_SNAP = 'simfurt-snap', PENDING = (slot) => 'simfurt-pending-' + slot;

// ---------------------------------------------------------------- Serialisierung
const ARR = ['terrain', 'road', 'rail', 'zone', 'lvl', 'vr', 'fire', 'flood'];
const KEYS = ['rng', 'year', 'month', 'money', 'loan', 'rates', 'budget', 'ords', 'trade', 'news', 'disasters', 'bld', 'nextId', 'ms', 'msgs', 'hist', 'occupancy', 'demand', 'ticks', 'seen', 'peakPop'];
function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
export { toB64, fromB64 };

export function serialize(s) {
  const o = { format: FORMAT, app: 'simfurt', size: N, name: s.name, seed: s.seed, savedAt: Date.now() };
  for (const k of KEYS) o[k] = s[k];
  o.msgs = s.msgs.slice(-30); o.peakPop = s.peakPop || 0;
  for (const k of ARR) if (s[k]) o[k] = toB64(s[k]);
  return JSON.stringify(o);
}

export function deserialize(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('Datei ist kein Simfurt-Spielstand'); }
  if (!o || !FORMATS.includes(o.format) || !o.terrain) throw new Error('Unbekanntes Spielstand-Format');
  const size = o.size || 64;
  const s = newCity({ name: o.name, seed: o.seed, size });
  for (const k of KEYS) if (o[k] !== undefined) s[k] = o[k];
  for (const k of ARR) {
    if (!o[k] || !s[k]) continue; // ältere Stände ohne flood/rail o. Ä.
    const u = fromB64(o[k]); if (u.length !== size * size) throw new Error('Kartengröße passt nicht'); s[k].set(u);
  }
  s.occ.fill(0);
  for (const b of s.bld) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) s.occ[y * size + x] = b.id;
  refresh(s);
  if (s.stats.pop >= 400 && !s.bld.some((b) => b.type === 'dump' || b.type === 'incin')) say(s, 'Neu: Müllabfuhr! Baue eine Deponie oder Müllverbrennung (Kategorie Müll), sonst leiden Umwelt und Zufriedenheit.', 'info');
  if (o.budget === undefined && s.bld.length) say(s, 'Neu in Simfurt: Wasserversorgung, Budget und Verordnungen. Baue ein Pumpwerk am Ufer, sonst sinken Gebäude ab Stufe 2 langsam ab.', 'info');
  return s;
}

export function metaOf(s) {
  return { savedAt: Date.now(), format: FORMAT, mapSize: N, name: s.name, year: s.year, month: s.month, pop: s.stats ? s.stats.pop : 0, money: Math.round(s.money) };
}

// ---------------------------------------------------------------- Komprimierung
export const canZip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
async function pipe(bytes, stream) {
  const r = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(r).arrayBuffer());
}
export const gzip = (text) => pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
export const gunzip = async (u8) => new TextDecoder().decode(await pipe(u8, new DecompressionStream('gzip')));
const isGz = (u8) => u8 && u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;

/** Datensatz {meta, bytes|text} → Text (JSON). */
async function recText(rec) {
  if (rec.text) return rec.text;
  if (isGz(rec.bytes)) return gunzip(rec.bytes);
  return new TextDecoder().decode(rec.bytes);
}
const recToState = async (rec) => deserialize(await recText(rec));

// ---------------------------------------------------------------- Lokal: IndexedDB, Ersatz localStorage
let idbBroken = typeof indexedDB === 'undefined';
function openDb() {
  return new Promise((resolve, reject) => {
    let r;
    try { r = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
    const t = setTimeout(() => reject(new Error('IndexedDB antwortet nicht')), 4000);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => { clearTimeout(t); resolve(r.result); };
    r.onerror = () => { clearTimeout(t); reject(r.error); };
    r.onblocked = () => { clearTimeout(t); reject(new Error('IndexedDB blockiert')); };
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
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, v); },
  del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
};
function lsRead(key) {
  const raw = ls.get(key); if (!raw) return null;
  try { const o = JSON.parse(raw); return o && o.meta ? { meta: o.meta, slot: o.slot, bytes: o.b64 ? fromB64(o.b64) : undefined, text: o.text } : null; } catch { return null; }
}
function lsWrite(key, rec, extra = {}) {
  ls.set(key, JSON.stringify({ ...extra, meta: rec.meta, b64: rec.bytes ? toB64(rec.bytes) : undefined, text: rec.text }));
}

async function readLocal(slot) {
  let rec = null;
  if (!idbBroken) { try { rec = (await idb('readonly', (st) => st.get('slot' + slot))) ?? null; } catch { idbBroken = true; } }
  const alt = lsRead(LS_SLOT(slot));
  if (alt && (!rec || alt.meta.savedAt > rec.meta.savedAt)) rec = alt;
  return rec;
}
/** Schreibt lokal; liefert 'IndexedDB' oder 'Browser-Speicher'. Wirft, wenn beides scheitert. */
async function writeLocal(slot, rec) {
  if (!idbBroken) {
    try { await idb('readwrite', (st) => st.put(rec, 'slot' + slot)); ls.del(LS_SLOT(slot)); return 'IndexedDB'; } catch { idbBroken = true; }
  }
  try { lsWrite(LS_SLOT(slot), rec); return 'Browser-Speicher'; } catch {
    throw new Error('Browser-Speicher voll oder gesperrt – bitte „Als Datei exportieren“ nutzen');
  }
}
async function clearLocal(slot) {
  if (!idbBroken) { try { await idb('readwrite', (st) => st.delete('slot' + slot)); } catch { idbBroken = true; } }
  ls.del(LS_SLOT(slot));
  const snap = lsRead(LS_SNAP); if (snap && snap.slot === slot) ls.del(LS_SNAP);
}

/** Bittet den Browser, den Speicher nicht automatisch zu räumen (wichtig auf Android/iOS). */
export async function persist() { try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* egal */ } }

// ---------------------------------------------------------------- Notfall-Schnappschuss (synchron)
/** Synchroner Schnappschuss in localStorage – für visibilitychange/pagehide, wo asynchrones Speichern oft nicht mehr fertig wird. */
export function snapshot(s, slot) {
  if (!s || !slot) return false;
  try { ls.set(LS_SNAP, JSON.stringify({ slot, meta: metaOf(s), text: serialize(s) })); return true; } catch { return false; }
}
function readSnap(slot) { const r = lsRead(LS_SNAP); return r && r.slot === slot ? r : null; }

// ---------------------------------------------------------------- Webspace (optional, nie blockierend)
let remoteDownUntil = 0, remoteOk = null;
export const remoteStatus = () => (remoteOk === true ? 'online' : remoteOk === false ? 'nicht erreichbar' : 'unbekannt');
async function remote(method, query = '', body = null) {
  if (Date.now() < remoteDownUntil) throw new Error('Webspace nicht erreichbar');
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(REMOTE_URL + query, {
      method, body: body ? JSON.stringify(body) : undefined, headers: body ? { 'Content-Type': 'text/plain' } : undefined, signal: ctrl.signal, cache: 'no-store',
    });
    if (!(res.headers.get('content-type') || '').includes('json')) throw new Error(`Webspace antwortet nicht (${res.status})`);
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error ?? `Serverfehler ${res.status}`), { app: true });
    remoteOk = true;
    return data;
  } catch (e) {
    if (!e.app) { remoteOk = false; remoteDownUntil = Date.now() + RETRY_MS; }
    throw e;
  } finally { clearTimeout(timer); }
}
const remoteList = async () => (await remote('GET', '?list=1')).slots ?? {};
async function pullRemote(slot) {
  const d = await remote('GET', `?slot=${slot}`);
  return d.meta && d.data ? { meta: d.meta, bytes: fromB64(d.data) } : null;
}
const pushRemote = (slot, rec) => remote('POST', '', { action: 'save', slot, meta: rec.meta, data: toB64(rec.bytes) });
const deleteRemote = (slot) => remote('POST', '', { action: 'delete', slot });
const setPending = (slot, v) => { try { v ? ls.set(PENDING(slot), '1') : ls.del(PENDING(slot)); } catch { /* egal */ } };
const isPending = (slot) => !!ls.get(PENDING(slot));
const pushing = new Set();
/** Schickt den Stand im Hintergrund zum Webspace. Liefert true/false, wirft nie. */
async function syncRemote(slot, rec) {
  if (!isGz(rec.bytes)) return false;
  setPending(slot, true);
  if (pushing.has(slot)) return false;
  pushing.add(slot);
  try { await pushRemote(slot, rec); setPending(slot, false); return true; } catch { return false; } finally { pushing.delete(slot); }
}

// ---------------------------------------------------------------- Öffentliche Aufrufe
async function makeRec(s) {
  const text = serialize(s); const meta = metaOf(s);
  if (canZip) { try { return { meta, bytes: await gzip(text) }; } catch { /* unten */ } }
  return { meta, text };
}

/**
 * Speichert lokal (wartet darauf) und startet den Webspace-Abgleich im Hintergrund.
 * Liefert {where, remote: Promise<boolean>}. Wirft nur, wenn lokal nichts geht.
 */
export async function saveSlot(slot, s) {
  const rec = await makeRec(s);
  const where = await writeLocal(slot, rec);
  const snap = readSnap(slot); if (snap && snap.meta.savedAt <= rec.meta.savedAt) ls.del(LS_SNAP);
  return { where, remote: syncRemote(slot, rec) };
}

/** Lädt einen Platz; nimmt den neuesten aus lokal, Schnappschuss und Webspace. Liefert {state, source} oder null. */
export async function loadSlot(slot) {
  const cands = [];
  const local = await readLocal(slot); if (local) cands.push([local, 'Gerät']);
  const snap = readSnap(slot); if (snap) cands.push([snap, 'Gerät']);
  let rem = null;
  try { rem = await pullRemote(slot); } catch { /* offline */ }
  if (rem) cands.push([rem, 'Webspace']);
  cands.sort((a, b) => b[0].meta.savedAt - a[0].meta.savedAt);
  for (const [rec, source] of cands) {
    try {
      const state = await recToState(rec);
      if (rec !== local) writeLocal(slot, rec.text && canZip ? { meta: rec.meta, bytes: await gzip(rec.text) } : rec).catch(() => {});
      else if (isPending(slot)) syncRemote(slot, rec);
      return { state, source };
    } catch (e) { if (rec === cands[cands.length - 1][0]) throw e; } // kaputt → nächstbesten nehmen
  }
  return null;
}

/** Übersicht der drei Plätze: {slot, local, remote}. remote: meta | null | undefined (= nicht geprüft/erreichbar). */
export async function listSlots(withRemote = true) {
  let rem;
  if (withRemote) { try { rem = await remoteList(); } catch { rem = undefined; } }
  const out = [];
  for (const slot of SLOTS) {
    let m = (await readLocal(slot))?.meta ?? null;
    const sn = readSnap(slot); if (sn && (!m || sn.meta.savedAt > m.savedAt)) m = sn.meta;
    out.push({ slot, local: m, remote: rem ? rem[slot] ?? null : undefined });
  }
  return out;
}

export async function deleteSlot(slot) {
  await clearLocal(slot); setPending(slot, false);
  try { await deleteRemote(slot); } catch { /* offline */ }
}

export function storageInfo() {
  return { local: idbBroken ? 'Browser-Speicher (localStorage)' : 'IndexedDB', remote: remoteStatus() };
}

// ---------------------------------------------------------------- Datei
export function fileName(s) {
  const safe = String(s.name || 'Simfurt').replace(/[^\wäöüÄÖÜß-]+/g, '_').slice(0, 24);
  return `${safe}-${s.year}-${String(s.month + 1).padStart(2, '0')}.simfurt`;
}
/** Erzeugt die Datei als Blob (gzip-JSON bzw. JSON). */
export async function exportBlob(s) {
  const text = serialize(s);
  if (canZip) { try { return new Blob([await gzip(text)], { type: 'application/octet-stream' }); } catch { /* unten */ } }
  return new Blob([text], { type: 'application/json' });
}
/** Lädt den Stand als Datei herunter (Browser). Liefert den Dateinamen. */
export async function exportFile(s) {
  const blob = await exportBlob(s); const name = fileName(s);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}
/** Liest eine .simfurt-Datei (gzip oder JSON) und liefert den Spielstand. */
export async function importFile(file) {
  const u8 = new Uint8Array(await file.arrayBuffer());
  let text;
  if (isGz(u8)) { if (!canZip) throw new Error('Dieser Browser kann gepackte Dateien nicht lesen'); text = await gunzip(u8); }
  else text = new TextDecoder().decode(u8);
  return deserialize(text);
}

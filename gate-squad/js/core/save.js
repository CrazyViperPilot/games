// core/save.js – versioniertes Savegame.
// Speicherorte: localStorage → IndexedDB → Speicher der laufenden Sitzung.
// Alle Zugriffe sind abgesichert; nach außen wird nie eine Exception geworfen.

const KEY = 'gatesquad.save';
export const SAVE_VERSION = 1;

const DB_NAME = 'gatesquad';
const STORE = 'kv';
const IDB_TIMEOUT_MS = 1500;

// Maxima der Shop-Upgrades (PLAN.md §5)
const UPGRADE_MAX = { squad: 15, damage: 10, fireRate: 10, weapon: 3 };

// Letzter geschriebener Stand als JSON, falls weder localStorage noch IndexedDB verfügbar sind.
let memoryJson = null;

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    unlocked: 1,
    coins: 0,
    upgrades: { squad: 0, weapon: 0, damage: 0, fireRate: 0 },
    best: {},
    endlessBest: 0,
    settings: { sound: true, vibration: true },
  };
}

export async function loadSave() {
  let data = null;

  // 1. localStorage
  try {
    const ls = getLocalStorage();
    const raw = ls ? ls.getItem(KEY) : null;
    if (raw) data = parseObject(raw);
  } catch (_) {}

  // 2. IndexedDB (mit Timeout)
  if (!data) {
    try {
      const value = await withTimeout(idbRequest('readonly', (st) => st.get(KEY)), IDB_TIMEOUT_MS);
      if (isObj(value)) data = value;
    } catch (_) {}
  }

  // 3. Speicher der laufenden Sitzung
  if (!data && memoryJson) data = parseObject(memoryJson);

  // 4. Default
  if (!data) data = defaultSave();

  return sanitize(migrate(data));
}

export function writeSave(data) {
  try {
    if (!isObj(data)) return;
    data.v = SAVE_VERSION;
    const json = JSON.stringify(data);
    memoryJson = json;
    if (lsSet(json)) return;
    // localStorage nicht verfügbar oder voll → IndexedDB (fire-and-forget).
    idbPut(data).then(lsRemove, () => {});
  } catch (_) {}
}

export function resetSave() {
  const fresh = defaultSave();
  try {
    const json = JSON.stringify(fresh);
    memoryJson = json;
    const ok = lsSet(json);
    idbPut(fresh).then(() => { if (!ok) lsRemove(); }, () => {});
  } catch (_) {}
  return fresh;
}

// Fehlende/alte Versionen auf v1 abbilden. Unbekannte Felder bleiben erhalten,
// fehlende füllt sanitize() mit Defaults auf. Neuere Versionen werden unverändert durchgereicht.
export function migrate(data) {
  if (!isObj(data)) return defaultSave();
  const ver = Number(data.v);
  if (!Number.isFinite(ver) || ver < 1) {
    // v0: kein gültiges Versionsfeld; Feldnamen entsprechen v1.
    return { ...data, v: 1 };
  }
  return data;
}

// Liefert ein frisches, geprüftes Objekt im v1-Format.
export function sanitize(data) {
  const out = defaultSave();
  if (!isObj(data)) return out;

  out.unlocked = Math.max(1, toInt(data.unlocked, 1));
  out.coins = toInt(data.coins, 0);
  out.endlessBest = toInt(data.endlessBest, 0);

  const up = isObj(data.upgrades) ? data.upgrades : {};
  for (const k of Object.keys(UPGRADE_MAX)) {
    out.upgrades[k] = Math.min(UPGRADE_MAX[k], toInt(up[k], 0));
  }

  out.best = sanitizeBest(data.best);

  const st = isObj(data.settings) ? data.settings : {};
  out.settings = {
    sound: typeof st.sound === 'boolean' ? st.sound : true,
    vibration: typeof st.vibration === 'boolean' ? st.vibration : true,
  };
  return out;
}

// ---------- Hilfsfunktionen ----------

function isObj(x) {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// Nicht-negative, endliche Ganzzahl; sonst fallback. Nicht-ganze Werte werden abgerundet.
function toInt(x, fallback) {
  if (!Number.isFinite(x) || x < 0) return fallback;
  return Math.min(Math.floor(x), Number.MAX_SAFE_INTEGER);
}

function sanitizeBest(src) {
  const out = {};
  if (!isObj(src)) return out;
  for (const key of Object.keys(src)) {
    if (!/^[1-9]\d*$/.test(key)) continue; // Schlüssel = Levelnummer
    const entry = src[key];
    if (!isObj(entry)) continue;
    out[key] = { survivors: toInt(entry.survivors, 0), coins: toInt(entry.coins, 0) };
  }
  return out;
}

function parseObject(json) {
  try {
    const value = JSON.parse(json);
    return isObj(value) ? value : null;
  } catch (_) {
    return null;
  }
}

function getLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' && localStorage ? localStorage : null;
  } catch (_) {
    return null;
  }
}

function lsSet(json) {
  try {
    const ls = getLocalStorage();
    if (!ls) return false;
    ls.setItem(KEY, json);
    return true;
  } catch (_) {
    return false;
  }
}

// Entfernt einen evtl. veralteten localStorage-Eintrag, damit beim Laden der neue IndexedDB-Stand gilt.
function lsRemove() {
  try {
    const ls = getLocalStorage();
    if (ls) ls.removeItem(KEY);
  } catch (_) {}
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Führt eine Operation im Object-Store aus. Rejects bei jedem Fehler (kein Throw).
function idbRequest(mode, op) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB nicht verfügbar'));
      return;
    }
    let openReq;
    try {
      openReq = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    openReq.onupgradeneeded = () => {
      try {
        const db = openReq.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      } catch (_) {}
    };
    openReq.onerror = () => reject(openReq.error);
    openReq.onsuccess = () => {
      const db = openReq.result;
      try {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
      } catch (e) {
        try { db.close(); } catch (_) {}
        reject(e);
      }
    };
  });
}

function idbPut(value) {
  return idbRequest('readwrite', (st) => st.put(value, KEY));
}

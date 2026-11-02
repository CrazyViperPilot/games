// Spielstand-Abbild (Speichern und Fortsetzen): wandelt den Objektgraphen eines laufenden Spiels (Game, AI, Karte, Nebel …)
// in reines JSON und zurück. Kein DOM. Der Zustand der Zufallsgeneratoren (makeRng) wird mitgesichert, so läuft ein
// geladenes Spiel bitgenau so weiter wie das gespeicherte (test/save.test.js prüft das).
//
// Format: Objekte, die mehrfach erreichbar sind (gemeinsame Verweise, Zyklen), stehen einmal in `table` und werden mit
// { $r: Nr } verwiesen; alles andere steht eingebettet. Sonderfälle: { $m: [[k, v], …] } Map, { $s: […] } Set,
// { $t: 'Float32Array', b: Base64 } Typed Array, { $g: Zustand } Zufallsgenerator, { $d: Pfad } feste Spielwerte (UNITS …),
// { $c: 'Klasse', p: {…} } Klasseninstanz, { $n: 'inf' | '-inf' | 'nan' | '-0' }, { $u: 1 } undefined.
// Zugriffsmethoden (Getter) und Funktionen werden übergangen; wer sie braucht, legt sie nach dem Laden neu an (Game.restoreAccessors).
// Eigene Schlüssel dürfen nicht mit „$“ beginnen.

const TYPED = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array };

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const isRng = (o) => typeof o.getState === 'function' && typeof o.setState === 'function';

/** Pfade aller Objekte in den festen Spieldaten (UNITS, BUILDINGS, BALANCE …): Verweise darauf bleiben Verweise. */
function indexStatics(statics) {
  const idx = new Map();
  const walk = (o, path) => {
    if (o === null || typeof o !== 'object' || idx.has(o)) return;
    idx.set(o, path);
    for (const k of Object.keys(o)) walk(o[k], `${path}\u0001${k}`);
  };
  for (const [name, root] of Object.entries(statics)) walk(root, name);
  return idx;
}

/**
 * @param {object} root  Wurzelobjekt (z. B. { game, ai })
 * @param {Record<string, object>} statics  feste Spieldaten, auf die nur verwiesen wird (z. B. { UNITS, BUILDINGS, BALANCE })
 * @param {Record<string, Function>} classes  Klassen, deren Instanzen vorkommen dürfen (Name → Konstruktor)
 */
export function encode(root, statics, classes) {
  const sidx = indexStatics(statics);
  const className = new Map(Object.entries(classes).map(([n, c]) => [c.prototype, n]));
  const count = new Map(); // Objekt → Zahl der Verweise
  const stack = [root];
  // Durchgang 1: Verweise zählen (Kinder nur beim ersten Besuch)
  while (stack.length) {
    const o = stack.pop();
    if (o === null || typeof o !== 'object' || sidx.has(o)) continue;
    const n = count.get(o) ?? 0;
    count.set(o, n + 1);
    if (n > 0 || ArrayBuffer.isView(o) || isRng(o)) continue;
    if (o instanceof Map) {
      for (const [k, v] of o) stack.push(k, v);
    } else if (o instanceof Set) {
      for (const v of o) stack.push(v);
    } else if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) stack.push(o[i]);
    } else {
      for (const k of Object.keys(o)) {
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d.get && !d.set) stack.push(d.value);
      }
    }
  }

  const ids = new Map(); // gemeinsame Objekte → Tabellennummer
  const table = [];
  const enc = (v) => {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (v === undefined) return { $u: 1 };
    if (typeof v === 'number') {
      if (Number.isFinite(v)) return Object.is(v, -0) ? { $n: '-0' } : v;
      return { $n: Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf' };
    }
    if (typeof v === 'function') return { $u: 1 };
    if (typeof v !== 'object') throw new Error(`snapshot: Typ ${typeof v} nicht speicherbar`);
    const sp = sidx.get(v);
    if (sp !== undefined) return { $d: sp };
    if (count.get(v) > 1) {
      if (!ids.has(v)) {
        const id = table.length;
        ids.set(v, id);
        table.push(null);
        table[id] = body(v);
      }
      return { $r: ids.get(v) };
    }
    return body(v);
  };
  const body = (o) => {
    if (ArrayBuffer.isView(o)) {
      const name = o.constructor.name;
      if (!TYPED[name]) throw new Error(`snapshot: ${name} nicht speicherbar`);
      return { $t: name, b: toB64(new Uint8Array(o.buffer, o.byteOffset, o.byteLength)) };
    }
    if (isRng(o)) return { $g: o.getState() };
    if (o instanceof Map) return { $m: [...o].map(([k, v]) => [enc(k), enc(v)]) };
    if (o instanceof Set) return { $s: [...o].map(enc) };
    if (Array.isArray(o)) return o.map(enc);
    const proto = Object.getPrototypeOf(o);
    const out = {};
    for (const k of Object.keys(o)) {
      const d = Object.getOwnPropertyDescriptor(o, k);
      if (d.get || d.set) continue;
      out[k] = enc(d.value);
    }
    if (proto === Object.prototype || proto === null) return out;
    const cn = className.get(proto);
    if (!cn) throw new Error(`snapshot: Klasse ${proto.constructor?.name} ist nicht angemeldet`);
    return { $c: cn, p: out };
  };
  const r = enc(root);
  return { table, root: r };
}

/** Gegenstück zu encode: baut den Objektgraphen neu auf (Klassen ohne Konstruktoraufruf, Prototyp gesetzt). */
export function decode(data, statics, classes) {
  const sidx = new Map();
  for (const [o, p] of indexStatics(statics)) sidx.set(p, o);
  const { table, root } = data;
  const shells = table.map((t) => {
    if (t.$t) {
      const bytes = fromB64(t.b);
      return new TYPED[t.$t](bytes.buffer);
    }
    if (t.$g !== undefined) return makeRngShell(t.$g);
    if (t.$m) return new Map();
    if (t.$s) return new Set();
    if (Array.isArray(t)) return [];
    if (t.$c) return Object.create(classes[t.$c].prototype);
    return {};
  });
  const dec = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(dec);
    if (v.$r !== undefined) return shells[v.$r];
    if (v.$u) return undefined;
    if (v.$n) return v.$n === 'nan' ? NaN : v.$n === 'inf' ? Infinity : v.$n === '-inf' ? -Infinity : -0;
    if (v.$d !== undefined) {
      const o = sidx.get(v.$d);
      if (!o) throw new Error(`snapshot: feste Daten ${v.$d} fehlen`);
      return o;
    }
    if (v.$t) {
      const bytes = fromB64(v.b);
      return new TYPED[v.$t](bytes.buffer);
    }
    if (v.$g !== undefined) return makeRngShell(v.$g);
    if (v.$m) return new Map(v.$m.map(([k, x]) => [dec(k), dec(x)]));
    if (v.$s) return new Set(v.$s.map(dec));
    if (v.$c) {
      const o = Object.create(classes[v.$c].prototype);
      fill(o, v.p);
      return o;
    }
    const o = {};
    fill(o, v);
    return o;
  };
  const fill = (o, p) => {
    for (const k of Object.keys(p)) o[k] = dec(p[k]);
  };
  table.forEach((t, i) => {
    const o = shells[i];
    if (t.$t || t.$g !== undefined) return;
    if (t.$m) for (const [k, x] of t.$m) o.set(dec(k), dec(x));
    else if (t.$s) for (const x of t.$s) o.add(dec(x));
    else if (Array.isArray(t)) for (const x of t) o.push(dec(x));
    else if (t.$c) fill(o, t.p);
    else fill(o, t);
  });
  return dec(root);
}

import { makeRng } from './rng.js';
function makeRngShell(state) {
  const r = makeRng(0);
  r.setState(state);
  return r;
}

// ---- Packen (gzip) -------------------------------------------------------------

/** JSON → gzip-Bytes (CompressionStream; Chrome/Android und Node 22). */
export async function pack(obj) {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unpack(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export { toB64, fromB64 };

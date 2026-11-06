// Spielstand-Abbild (Speichern und Fortsetzen): wandelt den Objektgraphen eines laufenden Spiels (Game, AI, Karte, Nebel …)
// in reines JSON und zurück. Kein DOM. Der Zustand der Zufallsgeneratoren (makeRng) wird mitgesichert, so läuft ein
// geladenes Spiel bitgenau so weiter wie das gespeicherte (test/save.test.js prüft das).
//
// Format: Objekte, die mehrfach erreichbar sind (gemeinsame Verweise, Zyklen), stehen einmal in `table` und werden mit
// { $r: Nr } verwiesen; alles andere steht eingebettet. Sonderfälle: { $m: [[k, v], …] } Map, { $s: […] } Set,
// { $t: 'Float32Array', b: Base64 } Typed Array (meist gleichförmige seit v5.62 als { $t, n: Länge, f: Füllbits, i: Stellen,
// v: Werte }), { $g: Zustand } Zufallsgenerator, { $d: Pfad } feste Spielwerte (UNITS …), { $c: 'Klasse', p: {…} } Klasseninstanz,
// { $n: 'inf' | '-inf' | 'nan' | '-0' }, { $u: 1 } undefined.
// Zugriffsmethoden (Getter) und Funktionen werden übergangen; wer sie braucht, legt sie nach dem Laden neu an (Game.restoreAccessors).
// Ableitbares (Gelände, Raster der Karte) ersetzt der Aufrufer über `replace` durch eine kleine Beschreibung und baut es nach dem Laden
// neu auf (game/savegame.js).
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

const UINT = { 1: Uint8Array, 2: Uint16Array, 4: Uint32Array }; // gleich große Ganzzahlsicht je Elementgröße (Vergleich der Bits)
const bytesOf = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/**
 * Typed Array als Füllwert (Bits des ersten Elements) plus abweichende Stellen, wenn das höchstens ein Viertel der Bytes braucht
 * (Stadt-, Nebel- und Rasterfelder sind meist gleichförmig); sonst null. Bitgenau, auch für -0 und NaN.
 */
function sparse(o) {
  const U = UINT[o.BYTES_PER_ELEMENT];
  if (!U || o.length < 64) return null;
  const a = new U(o.buffer, o.byteOffset, o.length);
  const f = a[0];
  const max = Math.floor(o.byteLength / 4 / (4 + o.BYTES_PER_ELEMENT));
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== f && ++n > max) return null;
  const at = new Uint32Array(n);
  const val = new U(n);
  for (let i = 0, j = 0; j < n; i++) {
    if (a[i] === f) continue;
    at[j] = i;
    val[j++] = a[i];
  }
  return { $t: o.constructor.name, n: o.length, f, i: toB64(bytesOf(at)), v: toB64(bytesOf(val)) };
}

/** Typed Array aus { $t, b } (alle Bytes) oder { $t, n, f, i, v } (sparse). */
function typedFrom(t) {
  const T = TYPED[t.$t];
  if (t.b !== undefined) return new T(fromB64(t.b).buffer);
  const out = new T(t.n);
  const U = UINT[T.BYTES_PER_ELEMENT];
  const a = new U(out.buffer).fill(t.f);
  const at = new Uint32Array(fromB64(t.i).buffer);
  const val = new U(fromB64(t.v).buffer);
  for (let j = 0; j < at.length; j++) a[at[j]] = val[j];
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
 * @param {Map<object, any>} [replace]  Objekt → Ersatz, der an seiner Stelle gespeichert wird (z. B. null oder ein Unterschied zur Karte)
 */
export function encode(root, statics, classes, replace = null) {
  const sidx = indexStatics(statics);
  const className = new Map(Object.entries(classes).map(([n, c]) => [c.prototype, n]));
  const count = new Map(); // Objekt → Zahl der Verweise
  const stack = [root];
  // Durchgang 1: Verweise zählen (Kinder nur beim ersten Besuch)
  while (stack.length) {
    let o = stack.pop();
    if (replace?.has(o)) o = replace.get(o);
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
    if (replace?.has(v)) v = replace.get(v);
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
      return sparse(o) ?? { $t: name, b: toB64(bytesOf(o)) };
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
    if (t.$t) return typedFrom(t);
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
    if (v.$t) return typedFrom(v);
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

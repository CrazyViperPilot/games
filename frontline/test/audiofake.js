// Testhilfe ohne eigene Tests (node --test lädt die Datei mit, findet aber nichts): Attrappe für WebAudio (Node hat keinen AudioContext)
// und für localStorage. Jeder Knoten schluckt jede Methode und jedes Feld; `ctx.currentTime` setzt der Test selbst.

/** Knoten, der jede Methode und jedes Feld schluckt (AudioParam, GainNode …). */
export function node() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : proxy),
    set: () => true,
    apply: () => proxy,
  });
  return proxy;
}

/** AudioContext-Attrappe; `ctx.created` zählt die erzeugten Knoten je Methode. */
export function fakeCtx() {
  const created = {};
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    state: 'running',
    destination: node(),
    created,
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
  };
  for (const m of ['createGain', 'createDynamicsCompressor', 'createBufferSource', 'createBiquadFilter', 'createOscillator', 'createStereoPanner']) {
    ctx[m] = () => {
      created[m] = (created[m] ?? 0) + 1;
      return node();
    };
  }
  return ctx;
}

/** localStorage-Attrappe (Map), für die Dauer von `fn()` als globales localStorage. */
export function withStorage(fn) {
  const map = new Map();
  const old = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try {
    return fn(map);
  } finally {
    if (old === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = old;
  }
}

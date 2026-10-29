// Level-Komposer für die Welten 1–5 (Bodenlevel): setzt ein Level aus zufällig gewählten Abschnitten zusammen
// (Lücken, Brücken, Treppen, Mauern, Türme, Plattformen, Gegnerfelder, Gegnernester, Engstellen).
// Aufbau: Oberfläche A → Schacht nach unten → 2–4 Höhlenkammern (Pflichtroute, darüber ein Lavasee) →
// Leiter nach oben → Oberfläche B → Portal. Jedes Level hat seinen eigenen Seed und eine eigene Abschnittsfolge;
// Duplikate werden über die Abschnittsfolge (Signatur) vermieden.
import { makeRng, LevelBuilder } from './builder.mjs';

const THEMES = {
  overworld: { world: 1, top: 'G', sub: '#', rock: 'S', cave: 'C', pit: 'water', bridge: 'W', deco: 'tree',
    mobs: ['z', 'z', 's', 'c', 'm'], ground: (nr) => 13 + (nr % 3), pick: 0, ore: false, den: false },
  depths: { world: 2, top: 'C', sub: 'S', rock: 'S', cave: 'B', pit: 'lava', bridge: 'B', deco: 'torch',
    mobs: ['z', 's', 'r', 'f', 'c'], ground: (nr) => 13 + (nr % 3), pick: 1, ore: true, den: true },
  paradise: { world: 3, top: 'A', sub: 'A', rock: 'S', cave: 'S', pit: 'water', bridge: 'W', deco: 'palm',
    mobs: ['z', 'c', 'm', 's'], ground: (nr) => 14 + (nr % 3), pick: 2, ore: false, den: false },
  sky: { world: 4, top: 'B', sub: 'B', rock: 'S', cave: 'R', pit: 'lava', bridge: 'B', deco: 'torch',
    mobs: ['s', 'z', 'e', 'c'], ground: (nr) => 15 + (nr % 3), pick: 2, ore: false, den: false },
  nether: { world: 5, top: 'N', sub: 'N', rock: 'N', cave: 'R', pit: 'lava', bridge: 'R', deco: 'torch',
    mobs: ['g', 's', 'z', 'c'], ground: () => 14, pick: 2, ore: false, den: true },
};

const SOLID_FLOOR = new Set('GAS#CBWNRE'.split(''));
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const choose = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// Zufallsgegner passend zur Schwierigkeit d (0..1): spätere Level nutzen mehr der „stärkeren“ Gegner (hintere Einträge).
function mobFor(c) {
  const list = c.cfg.mobs;
  const hi = Math.min(list.length, 2 + Math.floor(c.d * (list.length - 1)));
  return list[Math.floor(c.rng() * hi)];
}

// Spalte mit Höhe h über der Gehfläche (Zeile c.g): Oberkante c.top, darunter c.sub.
function column(b, x, c, h) {
  for (let i = 1; i <= h; i++) b.put(x, c.g - i, i === h ? c.top : c.sub);
}

// Grube der Breite n ab Spalte x.
function pit(b, x, n, c) {
  for (let i = 0; i < n; i++) {
    if (c.cfg.pit === 'water') {
      for (let r = c.g; r < c.g + c.pitD; r++) b.put(x + i, r, '~');
    } else {
      b.put(x + i, c.g, '.');
      b.put(x + i, c.g + 1, 'L');
    }
  }
}

const coin = (b, x, r) => { if (b.at(x, r) === '.') b.put(x, r, 'o'); };

// Abschnitte. Signatur (sig) wird für die Duplikatprüfung mitgeschrieben. Rückgabe: Breite (0 = passt nicht).
const SEG = {
  flat(b, x, c, limit) {
    const n = ri(c.rng, 2, 4);
    if (x + n > limit) return 0;
    for (let i = 0; i < n; i++) if (c.rng() < 0.35) coin(b, x + i, c.g - 1);
    if (!c.cave && c.cfg.deco === 'tree' && n >= 3 && c.rng() < 0.6) b.tree(x + 1, c.g);
    if (!c.cave && c.cfg.deco === 'palm' && n >= 3 && c.rng() < 0.5) b.palm(x + 1, c.g);
    if (c.cfg.deco === 'torch' && c.rng() < 0.4) b.put(x + 1, c.g - 3, '|');
    return n;
  },
  gap(b, x, c, limit) {
    const n = ri(c.rng, 2, 3 + (c.d > 0.3 ? 1 : 0));
    if (x + n > limit) return 0;
    pit(b, x, n, c);
    coin(b, x + (n >> 1), c.g - 3);
    c.sig.push(`gap${n}`);
    return n;
  },
  wideGap(b, x, c, limit) {
    const pits = ri(c.rng, 2, c.d > 0.5 ? 3 : 2);
    const widths = Array.from({ length: pits }, () => ri(c.rng, 2, 4));
    const total = widths.reduce((a, n) => a + n, 0) + (pits - 1);
    if (x + total > limit) return 0;
    let cx = x;
    for (let i = 0; i < pits; i++) {
      pit(b, cx, widths[i], c);
      cx += widths[i];
      if (i < pits - 1) {
        // Säule als Trittstein, mal auf Bodenhöhe, mal eine Kachel höher
        const up = c.rng() < 0.5 ? 1 : 0;
        if (up) column(b, cx, c, 1);
        else b.put(cx, c.g, c.top);
        coin(b, cx, c.g - 2 - up);
        cx++;
      }
    }
    c.sig.push(`wide${widths.join('')}`);
    return total;
  },
  stairs(b, x, c, limit) {
    const h = ri(c.rng, 2, c.cave ? 3 : 4);
    const plateau = ri(c.rng, 3, 6);
    const total = 4 * h + plateau;
    if (x + total > limit) return 0;
    let cx = x;
    for (let s = 1; s <= h; s++) { column(b, cx++, c, s); column(b, cx++, c, s); }
    for (let i = 0; i < plateau; i++) {
      column(b, cx, c, h);
      if (i % 2 === 1) coin(b, cx, c.g - h - 1);
      cx++;
    }
    if (plateau >= 5 && c.rng() < 0.5 * (0.5 + c.d)) b.put(x + 2 * h + 2, c.g - h - 1, mobFor(c));
    for (let s = h; s >= 1; s--) { column(b, cx++, c, s); column(b, cx++, c, s); }
    c.sig.push(`stairs${h}${plateau}`);
    return total;
  },
  wall(b, x, c, limit) {
    const k = ri(c.rng, 1, c.d > 0.4 ? 3 : 2);
    const hs = Array.from({ length: k }, () => ri(c.rng, 2, 3));
    const total = 1 + hs.length * 5;
    if (x + total > limit) return 0;
    let cx = x + 2;
    for (const h of hs) {
      column(b, cx, c, h);
      coin(b, cx - 2, c.g - 3);
      if (c.rng() < 0.3 + c.d * 0.4) b.put(cx + 2, c.g - 1, mobFor(c));
      cx += 5;
    }
    c.sig.push(`wall${hs.join('')}`);
    return total;
  },
  gauntlet(b, x, c, limit) {
    const k = ri(c.rng, 2, 2 + Math.round(c.d * 3));
    const total = 4 + 5 * k;
    if (x + total > limit) return 0;
    for (let i = 0; i < k; i++) {
      b.put(x + 4 + 5 * i, c.g - 1, mobFor(c));
      if (c.rng() < 0.5) coin(b, x + 6 + 5 * i, c.g - 1);
    }
    if (c.cfg.deco === 'torch') b.put(x + (total >> 1), c.g - 3, '|');
    if (!c.cave && c.cfg.deco === 'tree') b.tree(x + 2, c.g);
    c.sig.push(`gaunt${k}`);
    return total;
  },
  valley(b, x, c, limit) {
    if (c.cave) return 0;
    const d = ri(c.rng, 2, 3);
    const floor = ri(c.rng, 4, 7);
    const total = 4 * d + floor;
    if (x + total > limit) return 0;
    const depthAt = [];
    for (let s = 1; s <= d; s++) depthAt.push(s, s);
    for (let i = 0; i < floor; i++) depthAt.push(d);
    for (let s = d; s >= 1; s--) depthAt.push(s, s);
    depthAt.forEach((dep, i) => {
      for (let r = c.g; r < c.g + dep; r++) b.put(x + i, r, '.');
      b.put(x + i, c.g + dep, c.top);
    });
    const mid = x + 2 * d + (floor >> 1);
    b.put(mid, c.g + d - 1, mobFor(c));
    if (floor >= 6) b.put(mid + 2, c.g + d - 1, mobFor(c));
    coin(b, mid - 1, c.g + d - 1);
    c.sig.push(`valley${d}${floor}`);
    return total;
  },
  tower(b, x, c, limit) {
    if (c.cave) return 0;
    const h = ri(c.rng, 4, 6);
    const w = ri(c.rng, 4, 5);
    const total = w + 3;
    if (x + total > limit) return 0;
    for (let r = c.g - h - 1; r < c.g; r++) b.put(x + 1, r, 'H');
    for (let i = 0; i < w; i++) {
      for (let r = c.g - h; r < c.g; r++) b.put(x + 2 + i, r, r === c.g - h ? c.top : c.cfg.rock === 'N' ? 'N' : 'B');
      if (i % 2 === 0) coin(b, x + 2 + i, c.g - h - 1);
    }
    if (c.rng() < 0.5) b.put(x + 2 + w - 1, c.g - h - 1, mobFor(c));
    c.spots.push({ c: x + 2 + (w >> 1), r: c.g - h - 1 });
    c.sig.push(`tower${h}${w}`);
    return total;
  },
  platforms(b, x, c, limit) {
    const n = ri(c.rng, 2, 4);
    const total = n * 6 + 2;
    if (x + total > limit) return 0;
    let row = c.g - 3;
    for (let i = 0; i < n; i++) {
      const px = x + 2 + i * 6;
      for (let k = 0; k < 3; k++) b.put(px + k, row, '=');
      coin(b, px + 1, row - 1);
      if (c.rng() < 0.4) b.put(px + 2, c.g - 1, mobFor(c));
      if (i === n - 1) c.spots.push({ c: px + 1, r: row - 1 });
      row = Math.max(c.g - 5, Math.min(c.g - 3, row + ri(c.rng, -1, 1)));
    }
    c.sig.push(`plat${n}`);
    return total;
  },
  bridge(b, x, c, limit) {
    const n = ri(c.rng, 9, 14);
    if (x + n + 2 > limit) return 0;
    const holes = [];
    let cx = x + 1;
    while (cx < x + n - 3) {
      cx += ri(c.rng, 3, 5);
      if (cx < x + n - 2) { holes.push([cx, ri(c.rng, 1, 2 + (c.d > 0.5 ? 1 : 0))]); cx += 3; }
    }
    pit(b, x, n, c);
    const open = new Set();
    for (const [hx, hw] of holes) for (let i = 0; i < hw; i++) open.add(hx + i);
    for (let i = 0; i < n; i++) {
      if (!open.has(x + i)) b.put(x + i, c.g, c.cfg.bridge);
    }
    if (c.cfg.pit === 'lava') for (let i = 0; i < n; i++) if (!open.has(x + i)) b.put(x + i, c.g + 1, 'L');
    for (const [hx] of holes) coin(b, hx, c.g - 3);
    c.sig.push(`bridge${n}${holes.map((h) => h[1]).join('')}`);
    return n;
  },
  den(b, x, c, limit) {
    if (!c.cfg.den) return 0;
    const total = 11;
    if (x + total > limit) return 0;
    b.put(x + 3, c.g - 1, 'M');
    b.put(x + 6, c.g - 1, mobFor(c));
    b.put(x + 8, c.g - 1, mobFor(c));
    b.put(x + 2, c.g - 3, '|');
    c.sig.push('den');
    return total;
  },
  squeeze(b, x, c, limit) {
    if (!c.cave) return 0;
    const n = ri(c.rng, 6, 9);
    if (x + n > limit) return 0;
    for (let i = 0; i < n; i++) for (let r = c.g - 8; r <= c.g - 3; r++) b.put(x + i, r, c.cfg.rock);
    b.put(x + (n >> 1), c.g - 1, choose(c.rng, ['z', 'r', 'f', 'z'].filter((m) => c.cfg.mobs.includes(m)).concat(c.cfg.mobs[0])));
    c.sig.push(`squeeze${n}`);
    return n;
  },
  ledge(b, x, c, limit) {
    if (!c.cave) return 0;
    const total = 8;
    if (x + total > limit) return 0;
    for (let k = 0; k < 5; k++) b.put(x + 2 + k, c.g - 3, '=');
    coin(b, x + 3, c.g - 4);
    c.spots.push({ c: x + 4, r: c.g - 4 });
    if (c.rng() < 0.5) b.put(x + 6, c.g - 1, mobFor(c));
    c.sig.push('ledge');
    return total;
  },
};

// Gewichte je Abschnittsart: [Oberfläche, Höhle]. Mit Schwierigkeit d wachsen die schwereren Abschnitte.
function weights(d) {
  return {
    flat: [0, 0], gap: [3, 3], wideGap: [1 + 2 * d, 1 + 2 * d], stairs: [2, 1.5], wall: [2, 2.5],
    gauntlet: [2 + 2 * d, 3], valley: [1.5, 0], tower: [1.5, 0], platforms: [1.5, 0.5], bridge: [2, 1.5],
    den: [1.5, 3], squeeze: [0, 2], ledge: [0, 1.5],
  };
}

function fillRegion(b, c, x0, x1, needSpot) {
  const W = weights(c.d);
  const names = Object.keys(W).filter((n) => n !== 'flat');
  let x = x0;
  let last = '';
  let spotDone = !needSpot;
  const spotSegs = c.cave ? ['ledge'] : ['tower', 'platforms'];
  let guard = 0;
  while (x < x1 - 6 && guard++ < 200) {
    let name;
    if (!spotDone && (x > (x0 + x1) / 2 || c.rng() < 0.3)) name = choose(c.rng, spotSegs);
    else {
      const pool = names.filter((n) => n !== last && W[n][c.cave ? 1 : 0] > 0);
      const total = pool.reduce((a, n) => a + W[n][c.cave ? 1 : 0], 0);
      let t = c.rng() * total;
      name = pool[pool.length - 1];
      for (const n of pool) { t -= W[n][c.cave ? 1 : 0]; if (t <= 0) { name = n; break; } }
    }
    const w = SEG[name](b, x, c, x1 - 4);
    if (!w) { if (name === last || guard > 150) break; continue; }
    if (spotSegs.includes(name)) spotDone = true;
    last = name;
    x += w;
    // Puffer zwischen den Abschnitten (flach, damit Anlauf und Landung sicher sind)
    const f = SEG.flat(b, x, c, x1);
    x += f || 2;
  }
  return x;
}

export const failLog = {};

// Baut ein Level; scheitert die Validierung (unlösbar o. Ä.), wird mit neuem Seed erneut gewürfelt.
export function buildGroundLevel(themeName, nr, usedSigs, attempt = 0) {
  try {
    return tryBuild(themeName, nr, usedSigs, attempt);
  } catch (e) {
    if (e.code !== 'ERR_ASSERTION' || attempt >= 80) throw e;
    const key = String(e.message).replace(/w\d-\d+: /, '').replace(/\d+/g, 'N');
    failLog[key] = (failLog[key] || 0) + 1;
    return buildGroundLevel(themeName, nr, usedSigs, attempt + 1);
  }
}

function tryBuild(themeName, nr, usedSigs, attempt) {
  const cfg = THEMES[themeName];
  const world = cfg.world;
  const rng = makeRng(10007 * world + 131 * nr + 7919 * attempt + 17);
  const d = Math.min(1, (nr - 1) / 31);
  const nCh = nr < 10 ? 2 : nr < 22 ? 3 : 4;
  const W = Math.min(300, 200 + nr * 3 + ((nr * 7) % 11));
  const g = cfg.ground(nr);
  const chH = 10;
  const floors = Array.from({ length: nCh }, (_, i) => g + chH * (i + 1));
  const H = floors[nCh - 1] + 8;
  const b = new LevelBuilder(`w${world}-${nr}`, world, themeName === 'depths' ? 'depths' : themeName,
    W, H, cfg.pick);
  b.addBorders(false);

  // Gelände: Oberfläche, Erdschicht, Gestein
  for (let x = 1; x < W - 1; x++) {
    b.put(x, g, cfg.top);
    b.fill(x, g + 1, x, g + 2, cfg.sub);
    b.fill(x, g + 3, x, H - 2, cfg.rock);
  }

  const sigs = [];
  const spotsA = [], spotsC = [], spotsB = [];
  const mk = (cave, gr, spots) => ({ cfg, rng, d, cave, g: gr, top: cave ? cfg.cave : cfg.top, sub: cave ? cfg.cave : cfg.sub,
    pitD: cave ? 2 : 3, sig: sigs, spots });

  // Längen: Oberfläche A / Höhlen / Oberfläche B
  const xs0 = Math.round(W * 0.26);
  const xsEnd = Math.round(W * 0.74);
  const span = xsEnd - xs0;
  const xb = Array.from({ length: nCh + 1 }, (_, k) => xs0 + Math.round((k * span) / nCh));

  // Start / Ziel
  b.put(4, g - 1, 'P');
  for (const x of [7, 9]) b.put(x, g - 1, 'o');
  b.put(W - 5, g - 1, 'F');
  b.put(W - 8, g - 1, 'o');
  b.put(W - 9, g - 1, 'o');

  // Oberfläche A (vor dem Schacht) und B (nach der Leiter nach oben)
  const ca = mk(false, g, spotsA);
  fillRegion(b, ca, 12, xs0 - 3, true);
  const cb = mk(false, g, spotsB);
  fillRegion(b, cb, xsEnd + 5, W - 12, true);

  // Lavasee bzw. Abgrund über den Höhlen: nur durch die Höhlen zu umgehen
  for (let x = xs0 + 2; x < xsEnd; x++) {
    b.put(x, g, '.');
    b.put(x, g + 1, 'L');
    b.put(x, g + 2, 'L');
  }

  // Höhlenkammern
  const bedCh = nCh === 2 ? 0 : 1;
  const chests = [];
  for (let i = 0; i < nCh; i++) {
    const f = floors[i];
    const a = i === 0 ? xb[0] : xb[i] - 3;
    const e = xb[i + 1];
    b.fill(a, f - 6, e, f, '.');
    b.hline(a, e, f + 1, cfg.cave);
    if (i > 0) { // Schacht von oben (Kammer i-1 → i)
      const sx = xb[i];
      b.fill(sx - 1, floors[i - 1] + 1, sx, f, '.');
      b.vline(sx, floors[i - 1] + 1, f, 'H');
    }
    // Schacht an der Oberfläche (Start der ersten Kammer)
    if (i === 0) { b.fill(a, g, a, g, '.'); b.fill(a, g + 1, a + 1, f, '.'); b.vline(a, g, f, 'H'); }
    // letzter Schacht: Leiter nach oben
    if (i === nCh - 1) { b.fill(e, g, e, g, '.'); b.fill(e, g + 1, e + 1, f, '.'); b.vline(e, g - 1, f, 'H'); }
    // Boden mit Schachtlöchern
    const cave = mk(true, f + 1, spotsC);
    const fa = a + (i === 0 ? 6 : 7), fb = e - 8;
    fillRegion(b, cave, fa, fb, i === 1 % nCh || (nCh === 2 && i === 0));
    // Fackeln
    for (let t = a + 6; t < e - 4; t += 9) if (b.at(t, f - 4) === '.') b.put(t, f - 4, '|');
    // Bett und Truhen
    if (i === bedCh) { b.put(e - 5, f, 'K'); b.put(e - 6, f, 'o'); b.put(e - 4, f, 'o'); chests.push([e - 7, f, rng() < 0.5 ? 'armor' : 'bow']); }
    if (i === 0) chests.push([e - 10, f, cfg.ore ? 'pick_iron' : (nr % 2 ? 'pick_stone' : 'apple')]);
    else if (i === nCh - 1) chests.push([e - 12, f, nr % 3 === 0 ? 'pick_diamond' : 'apple']);
  }
  // Truhen nur auf freien Boden; sind Kollisionen möglich, wird Spalte versetzt
  for (const [cx, f, kind] of chests) {
    let x = cx;
    while (x > 2 && (b.at(x, f) !== '.' || !SOLID_FLOOR.has(b.at(x, f + 1)) || !SOLID_FLOOR.has(b.at(x - 1, f + 1)))) x--;
    b.addChest(x, f, kind);
  }

  // Diamanten: A (Oberfläche), Höhle (oder Erz), B
  const spotOf = (spots, fallback) => spots.length ? spots[0] : fallback;
  const sa = spotOf(spotsA, { c: 6, r: g - 5 });
  const sc = spotOf(spotsC, null);
  const sb = spotOf(spotsB, { c: W - 14, r: g - 5 });
  b.addDiamond(sa.c, sa.r, false);
  if (sc) b.addDiamond(sc.c, sc.r, cfg.ore);
  else b.addDiamond(xb[1] - 8, floors[1] - 4, false);
  b.addDiamond(sb.c, sb.r, false);

  const sig = sigs.join('|');
  if (usedSigs.has(sig) && attempt < 40) throw Object.assign(new Error('dup'), { code: 'ERR_ASSERTION' });
  const def = b.validate();
  usedSigs.add(sig);
  return def;
}

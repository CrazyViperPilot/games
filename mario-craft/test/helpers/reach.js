// Erreichbarkeits-Suche auf Kachelebene für die Level-Tests (PLAN §11).
// Konservatives Bewegungsmodell, keine volle Physik. Zustand = Körperposition (c, f):
// Spalte c, Fuß-Zeile f; der Körper (1 Kachel breit, 2 hoch) belegt die Zeilen f-1 und f.
//   laufen:    seitlich, auf Boden ±1 Stufe hoch (Kopffreiheit nötig)
//   springen:  bis 4 Kacheln hoch, 5 weit (Sprungbogen als Näherung: Aufstieg in der Startspalte,
//              Flug auf Scheitelhöhe min(f, f2)-1, Abstieg in der Zielspalte; alle Zellen frei)
//   fallen:    senkrecht beliebig tief bis Boden; in der Luft seitlicher Drift bis 3 Kacheln
//   klettern:  H (ladder) und V (vine), hoch/runter; seitlich davon weg
//   schwimmen: ~ (water), in alle Richtungen
//   Schleim:   J (bounce), von Schleim senkrecht bis 8 Kacheln hoch
//   Graben:    Feststoff mit hard !== null und minPick <= pick gilt als begehbar, aber nur seitlich
//              und nach unten (nicht nach oben). Kosten egal. Annahme: gegrabene Blöcke bleiben offen,
//              der Boden wird für die Suche nicht nachträglich entfernt.
// Lava (hazard) ist nie begehbar. Die Zeile unter dem Level ist Grube = Tod.
// Barrier-Kacheln sind offen, wenn opts.bossDefeated gesetzt ist.
import { PHYS } from '../../js/data/physics.js';
import { TILE_BY_ID } from '../../js/data/tiles.js';

const T = PHYS.tile;
const JUMP_UP = 4, JUMP_DX = 5, DRIFT = 3, BOUNCE = 8;
const PICK_OF = { pick_stone: 1, pick_iron: 2, pick_diamond: 3 };
const NEIGH4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Pixelposition (map.start, map.goal, Gegner, Bett …) → Zelle { c, r }. y ist die Unterkante der Zelle.
// Ein Zellen-Objekt { c, r } wird unverändert übernommen.
export function cellOf(pos) {
  if ('c' in pos) return { c: pos.c, r: pos.r };
  return { c: Math.floor(pos.x / T), r: Math.round(pos.y / T) - 1 };
}

// Erreichbare Standkacheln als Set mit Schlüssel r*cols+c (Fuß-Zeile). Standkacheln = Boden, Leiter, Wasser.
export function reachable(map, opts = {}) {
  return explore(map, opts).stand;
}

// Wie reachable, liefert zusätzlich Abdeckung:
//   touches(c, r)      Körper hat die Zelle (c, r) erreicht (Luft-Items wie Diamant, Bett, Portal)
//   touchesSolid(c, r) Körper hat die Zelle oder eine seitlich/oben/unten angrenzende Zelle erreicht
//                      (feste Ziele wie Truhe oder Diamanterz)
//   canDig(c, r)       Block (c, r) ist mit der Hacke der Suche abbaubar (hard !== null, minPick <= pick)
//                      Feste Ziele brauchen touchesSolid UND canDig.
// opts: { pick: -1 | 0..3 | 'auto' (Standard 0), start: Pixel {x,y} | Zelle {c,r}, bossDefeated: bool }
// pick -1 = kein Graben. 'auto' = Level-pick plus beste erreichbare Hacken-Truhe (Fixpunkt).
// Ohne opts.start: map.start, bei opts.bossDefeated die Boss-Arena (Spawn 'boss').
export function explore(map, opts = {}) {
  const res = resolvePick(map, opts);
  const hit = (c, r) => hitAt(res, c, r);
  return {
    stand: res.stand,
    pick: res.pick,
    touches: hit,
    touchesSolid: (c, r) => hit(c, r) || hit(c - 1, r) || hit(c + 1, r) || hit(c, r - 1) || hit(c, r + 1),
    canDig: (c, r) => {
      if (c < 0 || c >= res.cols || r < 0 || r >= res.rows) return false;
      const t = TILE_BY_ID[map.tiles[r * res.cols + c]];
      return res.pick >= 0 && t.hard !== null && t.minPick <= res.pick;
    },
  };
}

function hitAt(res, c, r) {
  return c >= 0 && c < res.cols && r >= 0 && r < res.rows && res.cover[r * res.cols + c] === 1;
}

function resolvePick(map, opts) {
  const req = opts.pick ?? 0;
  if (req !== 'auto') return run(map, opts, req);
  let pick = Math.max(0, map.pick || 0);
  for (;;) {
    const res = run(map, opts, pick);
    let best = pick;
    for (const [key, kind] of Object.entries(map.chests || {})) {
      const v = PICK_OF[kind];
      if (!v || v <= best) continue;
      const [c, r] = key.split(',').map(Number);
      if (hitAt(res, c, r) || hitAt(res, c - 1, r) || hitAt(res, c + 1, r) || hitAt(res, c, r - 1) || hitAt(res, c, r + 1)) {
        best = v;
      }
    }
    if (best === pick) return res;
    pick = best;
  }
}

function startFeet(map, opts) {
  let from = opts.start;
  if (!from) {
    const boss = opts.bossDefeated ? map.spawns.find((s) => s.type === 'boss') : null;
    from = boss || map.start;
  }
  const cell = cellOf(from);
  return { c: cell.c, f: cell.r };
}

function run(map, opts, pick) {
  const cols = map.cols, R = map.rows, N = cols * R;
  const grab = pick >= 0;
  const bossOpen = !!opts.bossDefeated;

  const SOL = new Uint8Array(N), DIG = new Uint8Array(N), HAZ = new Uint8Array(N);
  const CLB = new Uint8Array(N), WAT = new Uint8Array(N), OW = new Uint8Array(N), BNC = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const t = TILE_BY_ID[map.tiles[i]];
    const solid = t.solid && !(bossOpen && t.kind === 'barrier');
    if (solid) SOL[i] = 1;
    if (solid && grab && t.hard !== null && t.minPick <= pick) DIG[i] = 1;
    if (t.hazard) HAZ[i] = 1;
    if (t.climb) CLB[i] = 1;
    if (t.water) WAT[i] = 1;
    if (t.oneWay) OW[i] = 1;
    if (solid && t.bounce) BNC[i] = 1;
  }

  const inside = (c, r) => c >= 0 && c < cols && r >= 0 && r < R;
  const at = (c, r) => r * cols + c;
  const free = (c, r) => inside(c, r) && SOL[at(c, r)] === 0 && HAZ[at(c, r)] === 0;
  const dig = (c, r) => inside(c, r) && DIG[at(c, r)] === 1;
  const passH = (c, r) => free(c, r) || dig(c, r);
  // Boden unter Zeile r in Spalte c: fest oder Schlamm-/Slab-Kante. Seiten und Decke = Grundgestein, unten = Grube.
  const ground = (c, r) => {
    if (c < 0 || c >= cols || r < 0) return true;
    if (r >= R) return false;
    const i = at(c, r);
    return SOL[i] === 1 || OW[i] === 1;
  };
  const ladderAt = (c, f) => (inside(c, f) && CLB[at(c, f)] === 1) || (inside(c, f - 1) && CLB[at(c, f - 1)] === 1);
  const waterAt = (c, f) => (inside(c, f) && WAT[at(c, f)] === 1) || (inside(c, f - 1) && WAT[at(c, f - 1)] === 1);
  const standing = (c, f) => ground(c, f + 1);
  const rest = (c, f) => standing(c, f) || ladderAt(c, f) || waterAt(c, f);

  const seen = new Uint8Array(N * 4);
  const queue = new Int32Array(N * 4);
  const cover = new Uint8Array(N);
  const stand = new Set();
  let qh = 0, qt = 0;

  const push = (c, f, u) => {
    if (!inside(c, f) || !inside(c, f - 1)) return;
    const isRest = rest(c, f);
    const key = at(c, f) * 4 + (isRest ? 0 : u);
    if (seen[key]) return;
    seen[key] = 1;
    queue[qt++] = key;
    cover[at(c, f)] = 1;
    cover[at(c, f - 1)] = 1;
    if (isRest) stand.add(at(c, f));
  };

  // Sprungbogen: Aufstieg in Spalte c, Flug auf Scheitelhöhe, Abstieg in Spalte c+dx.
  const jumpOk = (c, f, dx, f2) => {
    const s = dx > 0 ? 1 : -1, n = Math.abs(dx);
    const apex = Math.min(f, f2) - 1;
    for (let r = apex - 1; r <= f - 2; r++) if (!free(c, r)) return false;
    for (let i = 1; i <= n; i++) {
      const k = c + s * i, hi = i < n ? apex : f2;
      for (let r = apex - 1; r <= hi; r++) if (!free(k, r)) return false;
    }
    for (let r = apex - 1; r <= f - 2; r++) cover[at(c, r)] = 1;
    for (let i = 1; i <= n; i++) {
      const k = c + s * i, hi = i < n ? apex : f2;
      for (let r = apex - 1; r <= hi; r++) cover[at(k, r)] = 1;
    }
    return true;
  };

  const start = startFeet(map, opts);
  push(start.c, start.f, 0);

  while (qh < qt) {
    const key = queue[qh++];
    const u = key & 3;
    const cell = key >> 2;
    const f = Math.floor(cell / cols), c = cell - f * cols;
    const isRest = rest(c, f);
    const st = standing(c, f);

    // Seitlich: auf Halt (Boden, Leiter, Wasser) frei, in der Luft Drift-Budget.
    if (isRest || u < DRIFT) {
      const nu = isRest ? 1 : u + 1;
      for (const d of [-1, 1]) {
        if (passH(c + d, f) && passH(c + d, f - 1)) push(c + d, f, nu);
      }
    }

    if (st) {
      // Stufe hoch (1 Kachel), Kopffreiheit in der Startspalte nötig.
      for (const d of [-1, 1]) {
        if (free(c + d, f - 1) && free(c + d, f - 2) && free(c, f - 2)) push(c + d, f - 1, 1);
      }
      // Sprünge bis 4 hoch, 5 weit; Landung nur auf Boden.
      for (let n = 1; n <= JUMP_DX; n++) {
        for (const s of [-1, 1]) {
          for (let dy = 0; dy <= JUMP_UP; dy++) {
            const nc = c + s * n, nf = f - dy;
            if (!free(nc, nf) || !free(nc, nf - 1) || !ground(nc, nf + 1)) continue;
            if (jumpOk(c, f, nc - c, nf)) push(nc, nf, 0);
          }
        }
      }
      // Schleim unter den Füßen: senkrecht bis 8 hoch.
      if (inside(c, f + 1) && BNC[at(c, f + 1)] === 1) {
        for (let k = 1; k <= BOUNCE; k++) {
          const nf = f - k;
          if (!free(c, nf) || !free(c, nf - 1)) break;
          push(c, nf, 0);
        }
      }
      // Graben nach unten: Block unter den Füßen wird zum Fallen durchbrochen.
      if (dig(c, f + 1)) push(c, f + 1, 0);
    }

    if (ladderAt(c, f)) {
      if (free(c, f - 2) && free(c, f - 1)) push(c, f - 1, 0);
      if (free(c, f) && free(c, f + 1)) push(c, f + 1, 0);
    }

    if (waterAt(c, f)) {
      for (const [dc, df] of NEIGH4) {
        const nc = c + dc, nf = f + df;
        if (free(nc, nf) && free(nc, nf - 1)) push(nc, nf, 0);
      }
    }

    // In der Luft: senkrecht fallen (Graben nach unten erlaubt).
    if (!isRest && passH(c, f + 1)) push(c, f + 1, u);
  }

  return { stand, cover, pick, cols, rows: R };
}

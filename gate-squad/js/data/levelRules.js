// Level-Expander (PLAN.md §12): macht aus einem Level-Entwurf (handgebaut oder prozedural) das
// spielbare Level – deterministisch pro Levelnummer.
//  * Länge × LEN_SCALE
//  * Tor-Paare → zwei unabhängige Lane-Tore (zeitversetzt, jedes einzeln nehmbar)
//  * Waffentor + Gegenseite → Waffentor und versetztes Zahlentor in der anderen Lane
//  * Horden-Wellen füllen das ganze Level (tausende Gegner pro Runde)
//  * Spezialisten- und RPG-Kisten (RPG immer +1)
import { mulberry32, randInt, randRange } from '../core/rng.js';
import { SPECIALIST_IDS } from './specialists.js';

export const RULES = {
  LEN_SCALE: 3,
  STAGGER_MIN: 150, // Versatz der zweiten Lane (Distanz)
  STAGGER_MAX: 320,
  HORDE_STEP_MIN: 130,
  HORDE_STEP_MAX: 175,
  HORDE_START: 520,
  HORDE_BASE: 14, // Horden-Größe = HORDE_BASE + HORDE_PER_LEVEL·L (vor BAL.WAVE_COUNT_MULT)
  HORDE_PER_LEVEL: 1,
  HORDE_MAX: 44,
  HORDE_RAMP_MIN: 0.3,
  HORDE_RAMP_END: 0.4,
  SPEC_CRATES: (L) => Math.min(6, 2 + Math.floor(L / 5)),
  RPG_CRATES: (L) => Math.min(9, 3 + Math.floor(L / 3)),
  // ab welchem Level ein Spezialist in Kisten vorkommt
  SPEC_FROM: { rifle: 1, smg: 1, mg: 2, demo: 3, sniper: 4 },
};

function laneGate(d, side, g) {
  return { d, t: 'gate', side, g };
}

function hordeEnemy(L, rng) {
  // Horden = Kanonenfutter (Infanterie/Läufer); Schildträger nur in den handgebauten Wellen.
  const r = rng();
  if (L >= 3 && r < 0.4) return 'runner';
  return 'infantry';
}

export function expandLevel(lv, L) {
  const rng = mulberry32(L * 7349 + 3);
  const S = RULES.LEN_SCALE;
  const length = Math.round(lv.length * S);
  const out = [];

  for (const src of lv.events) {
    const ev = JSON.parse(JSON.stringify(src));
    if (ev.d > 0) ev.d = Math.round(ev.d * S);
    const stagger = randInt(rng, RULES.STAGGER_MIN, RULES.STAGGER_MAX);
    const leftFirst = rng() < 0.5;

    if (ev.t === 'gates') {
      if (ev.yFrac !== undefined) {
        // Start-Tore: beide sofort auf dem Bildschirm, aber versetzt und unabhängig.
        out.push({ d: 0, t: 'gate', side: 'left', g: ev.left, yFrac: leftFirst ? 0.5 : 0.3 });
        out.push({ d: 0, t: 'gate', side: 'right', g: ev.right, yFrac: leftFirst ? 0.3 : 0.5 });
      } else {
        out.push(laneGate(ev.d + (leftFirst ? 0 : stagger), 'left', ev.left));
        out.push(laneGate(ev.d + (leftFirst ? stagger : 0), 'right', ev.right));
      }
    } else if (ev.t === 'weapon') {
      out.push({ d: ev.d, t: 'weapon', side: ev.side, other: null });
      if (ev.other) out.push(laneGate(ev.d + stagger, ev.side === 'left' ? 'right' : 'left', ev.other));
    } else {
      out.push(ev);
    }
  }

  // Horden: durchgehend über das Level.
  for (let d = RULES.HORDE_START; d < length - 250; d += randInt(rng, RULES.HORDE_STEP_MIN, RULES.HORDE_STEP_MAX)) {
    // Horden wachsen im Level an: Start mit HORDE_RAMP_MIN, volle Größe ab HORDE_RAMP_END der Strecke.
    const ramp = RULES.HORDE_RAMP_MIN + (1 - RULES.HORDE_RAMP_MIN) * Math.min(1, d / (RULES.HORDE_RAMP_END * length));
    const full = Math.min(RULES.HORDE_MAX, RULES.HORDE_BASE + Math.round(RULES.HORDE_PER_LEVEL * L) + randInt(rng, -3, 3));
    const count = Math.max(4, Math.round(full * ramp));
    out.push({
      d,
      t: 'wave',
      enemy: hordeEnemy(L, rng),
      count,
      pattern: rng() < 0.65 ? 'horde' : 'wall',
      x: Math.round(randRange(rng, 0.25, 0.75) * 100) / 100,
    });
  }

  // Kisten: Spezialisten und RPG gleichmäßig verteilt (mit etwas Zufall), abwechselnd links/rechts.
  const avail = SPECIALIST_IDS.filter((id) => L >= RULES.SPEC_FROM[id]);
  const nSpec = RULES.SPEC_CRATES(L);
  const nRpg = RULES.RPG_CRATES(L);
  const total = nSpec + nRpg;
  let si = L % avail.length;
  let ri = 0;
  for (let k = 0; k < total; k++) {
    const d = Math.round(400 + ((k + 0.5) / total) * (length - 900) + randRange(rng, -60, 60));
    const x = k % 2 ? randRange(rng, 0.62, 0.82) : randRange(rng, 0.18, 0.38);
    // Verteilung: RPG und Spezialisten im Wechsel, Rest RPG am Ende (für den Bosskampf)
    const isSpec = (k % 2 === 0 && si - (L % avail.length) < nSpec) || ri >= nRpg;
    if (isSpec) {
      out.push({ d, t: 'crate', x: Math.round(x * 100) / 100, kind: 'spec', spec: avail[si % avail.length] });
      si++;
    } else {
      out.push({ d, t: 'crate', x: Math.round(x * 100) / 100, kind: 'rpg' });
      ri++;
    }
  }

  out.sort((a, b) => a.d - b.d);
  return { ...lv, length, events: out };
}

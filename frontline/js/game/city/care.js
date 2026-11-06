// Stadt (PRD §15), Pflege (seit v5.01): Kaserne, Fabrikhalle, Heliport und Krankenhaus heilen bzw. reparieren eigene Einheiten in
// ihrem Umkreis (CITY.care). Läuft am Ende von updateCity (economy.js). Kein DOM, deterministisch.
import { CITY } from '../../data/city.js';
import { KINDS } from '../../data/citykinds.js';
import { sizeOf } from './cells.js';

/** Pflege (seit v5.01): Werte aus CITY.care.by für ein Stadtgebäude (Ziel-Entity) oder null, wenn es nicht heilt oder repariert. */
export function careOf(game, e) {
  if (e?.type !== 'city' || !game.city?.[e.team]) return null;
  return CITY.care.by[KINDS[game.city[e.team].kind[e.cityCell] - 1]] ?? null;
}

/** Welche Pflege braucht die Einheit? 'inf' Soldaten, 'air' Hubschrauber, 'ground' Bodenfahrzeuge. */
export const careClass = (u) => (u.def.air ? 'air' : u.def.armor === 'inf' ? 'inf' : 'ground');

/**
 * Heilen und Reparieren (seit v5.01): Kaserne, Fabrikhalle, Heliport und Krankenhaus pflegen eigene Einheiten in ihrem Umkreis
 * (CITY.care). Tempo × Stufe × Strom; Fahrzeuge kosten Metall aus dem Stadtlager. Das schnellste Gebäude in Reichweite zählt.
 */
export function updateCare(game, c, dt) {
  const C = CITY.care;
  const givers = [];
  for (const [i, e] of c.ents) {
    const spec = C.by[KINDS[c.kind[i] - 1]];
    if (spec && e.alive) givers.push({ e, spec, r2: ((spec.radius + (c.part?.[i] ? sizeOf(KINDS[c.kind[i] - 1]) : 1) / 2) * c.cell) ** 2, rate: spec.rate * (C.levelMul[c.level[i]] ?? 1) });
  }
  if (!givers.length) return;
  const power = c.stats.powerRatio ?? 1;
  // Tanken der Hubschrauber: seit v5.51 gelandet am Heliport aus dem Kerosintank (helipad.js), nicht mehr im Umkreis aus c.kero
  for (const u of game.units) {
    if (!u.alive || u.team !== c.team || u.hp >= u.maxHp || game.time - u.lastHitTime < C.delay) continue;
    const cls = careClass(u);
    let rate = 0;
    for (const g of givers) {
      if (g.spec.units !== cls || g.rate <= rate) continue;
      const dx = u.x - g.e.x;
      const dy = u.y - g.e.y;
      if (dx * dx + dy * dy <= g.r2) rate = g.rate;
    }
    if (!rate) continue;
    let heal = Math.min(u.maxHp - u.hp, u.maxHp * rate * power * dt);
    const metal = (CITY.metalCost[u.type] ?? 0) * C.metalShare; // Metall für eine volle Reparatur
    if (metal > 0) {
      heal = Math.min(heal, (c.metal / metal) * u.maxHp);
      c.metal = Math.max(0, c.metal - (metal * heal) / u.maxHp);
    }
    if (heal <= 0) continue;
    u.hp += heal;
    u.caredAt = game.time; // für die Anzeige (grünes Kreuz)
  }
}

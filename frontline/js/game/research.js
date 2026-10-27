// Forschungsstufen (v4.52, nach Age of Empires II und Empire Earth): Die Haupt-FOB forscht neben der Ausbildung, eins nach dem
// anderen (Geld beim Start, Abbruch erstattet voll). Stufe 2 schaltet Scharfschützen, Schützenpanzer, Hubschrauber und Flakpanzer frei,
// Stufe 3 Kampfpanzer, Kampfhubschrauber und SAM-Startrampe; dazu drei Verbesserungen: Schutzwesten (Infanterie), Verbundpanzerung (Fahrzeuge und
// Hubschrauber) und Wärmebildoptik (Reichweite und Sicht der Einheiten). Aus (Standard): alles frei, keine Verbesserungen.
// Zustand je Team: team.tech = { tier, done: [Schlüssel], cur: { key, t } | null }.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';

const R = BALANCE.research;
export const RESEARCH_KEYS = Object.keys(R.items);
const pct = (m) => `${Math.round(Math.abs(1 - m) * 100)} %`;
const fail = (reason) => ({ ok: false, reason });

/** Einheiten, die eine Stufe freischaltet (Namen in Reihenfolge von UNITS). */
export const tierUnits = (tier) => Object.keys(UNITS).filter((k) => R.unitTier[k] === tier);

/** Wirkung eines Forschungsziels in Worten (Tooltip, Meldung). */
export function researchEffect(key) {
  const it = R.items[key];
  if (it?.tier) return `schaltet frei: ${tierUnits(it.tier).map((k) => UNITS[k].name).join(', ')}`;
  if (key === 'vests') return `Infanterie nimmt ${pct(R.vests)} weniger Schaden`;
  if (key === 'composite') return `Fahrzeuge und Hubschrauber nehmen ${pct(R.composite)} weniger Schaden`;
  if (key === 'optics') return `Waffenreichweite und Sicht der Einheiten +${pct(R.optics)}`;
  return '';
}

/** Legt game.research und team.tech an (on: Forschung eingeschaltet). */
export function createResearch(game, on) {
  game.research = !!on;
  for (const t of game.teams) t.tech = { tier: 1, done: [], cur: null };
}

/** Stufe, ab der eine Einheit ausgebildet werden kann (1 = von Anfang an). */
export const unitTier = (type) => R.unitTier[type] ?? 1;

/** Ist diese Einheit für das Team noch gesperrt? Ohne Forschung nie. */
export const unitLocked = (game, team, type) => !!game.research && unitTier(type) > game.teams[team].tech.tier;

export const lockReason = (type) => `Benötigt Stufe ${unitTier(type)}`;

/** Hat das Team diese Verbesserung erforscht? */
export const hasTech = (game, team, key) => !!game.research && game.teams[team].tech.done.includes(key);

/** Warum das Forschungsziel jetzt nicht begonnen werden kann (ohne Geld); '' = möglich. */
export function researchBlock(game, team, key) {
  if (!game.research) return 'Forschung ist in dieser Partie ausgeschaltet';
  const it = R.items[key];
  if (!it) return 'Unbekannte Forschung';
  const tech = game.teams[team].tech;
  if (tech.done.includes(key) || (it.tier && tech.tier >= it.tier)) return 'Bereits erforscht';
  if (tech.cur) return tech.cur.key === key ? 'Wird gerade erforscht' : 'Es läuft schon eine Forschung';
  if (tech.tier < it.needs) return `Benötigt Stufe ${it.needs}`;
  return '';
}

/** { type: 'research', buildingId, key }: nur die Haupt-FOB, eine Forschung zugleich, Geld beim Start. */
export function cmdResearch(game, team, cmd) {
  const b = game.getEntity(cmd.buildingId);
  if (!b || b.kind !== 'building' || b.team !== team || !b.main) return fail('Nur die Haupt-FOB forscht');
  const why = researchBlock(game, team, cmd.key);
  if (why) return fail(why);
  const cost = { money: R.items[cmd.key].money };
  if (!game.canAfford(team, cost)) return fail(game.missingMoney());
  game.pay(team, cost);
  game.teams[team].tech.cur = { key: cmd.key, t: 0 };
  return { ok: true };
}

/** { type: 'cancelResearch' }: laufende Forschung abbrechen, das Geld kommt ganz zurück. */
export function cmdCancelResearch(game, team) {
  const tech = game.teams[team].tech;
  if (!tech?.cur) return fail('Keine Forschung läuft');
  game.refund(team, { money: R.items[tech.cur.key].money });
  tech.cur = null;
  return { ok: true };
}

/** Ein Schritt: Fortschritt der laufenden Forschung; fertig → Stufe bzw. Verbesserung, Meldung (Stufen erfährt auch der Gegner). */
export function updateResearch(game, dt) {
  if (!game.research) return;
  for (const team of game.teams) {
    const tech = team.tech;
    const cur = tech.cur;
    if (!cur || !game.mainFob(team.id)) continue;
    cur.t += dt;
    const it = R.items[cur.key];
    if (cur.t < it.time) continue;
    tech.cur = null;
    tech.done.push(cur.key);
    if (it.tier) {
      tech.tier = Math.max(tech.tier, it.tier);
      const names = tierUnits(it.tier).map((k) => UNITS[k].name);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names[0];
      game.message(team.id, `${it.name} erreicht: ${list} freigeschaltet`);
      game.message(1 - team.id, `Der Gegner hat ${it.name} erreicht`);
    } else {
      game.message(team.id, `${it.name} erforscht: ${researchEffect(cur.key)}`);
    }
  }
}

/**
 * Schadensfaktor gegen eine Einheit (Schutzwesten für Infanterie, Verbundpanzerung für Fahrzeuge und Hubschrauber).
 * Ein Schuss, der das unverletzte Ziel sofort tötet (Scharfschütze, Panzerfaust gegen Soldaten), bleibt tödlich.
 */
export function armorMul(game, u, amount) {
  if (!game.research || amount >= u.def.hp) return 1;
  const done = game.teams[u.team]?.tech.done;
  if (!done?.length) return 1;
  if (u.def.armor === 'inf') return done.includes('vests') ? R.vests : 1;
  return done.includes('composite') ? R.composite : 1;
}

/** Faktor für Waffenreichweite und Sicht der Einheiten eines Teams (Wärmebildoptik), sonst 1. */
export const opticsMul = (game, team) => (hasTech(game, team, 'optics') ? R.optics : 1);

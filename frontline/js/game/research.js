// Forschungsstufen (v4.52, nach Age of Empires II und Empire Earth): Die Hauptstadt forscht neben der Ausbildung, eins nach dem
// anderen (Geld beim Start, Abbruch erstattet voll). Stufe 2 schaltet Scharfschützen, Schützenpanzer, Hubschrauber und Flakpanzer frei,
// Stufe 3 Kampfpanzer, Kampfhubschrauber und SAM-Startrampe; dazu drei Verbesserungen: Schutzwesten (Infanterie), Verbundpanzerung (Fahrzeuge und
// Hubschrauber) und Wärmebildoptik (Reichweite und Sicht der Einheiten). Aus (Standard): alles frei, keine Verbesserungen.
// Zustand je Team: team.tech = { tier, done: [Schlüssel], cur: { key, t } | null }.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { CITY } from '../data/city.js';
import { cityLevel, powerRatio } from './city.js';

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
  const it2 = R.items[key];
  const fx = it2?.fx;
  if (fx) {
    const T = {
      speed: (m) => `Bodenfahrzeuge ${pct(m)} schneller`,
      fuel: (m) => `Treibstoffverbrauch −${pct(m)}`,
      taken: (m) => `Fahrzeuge und Hubschrauber nehmen ${pct(m)} weniger Schaden`,
      dealtVeh: (m) => `+${pct(m)} Schaden gegen Fahrzeuge`,
      dealtInf: (m) => `+${pct(m)} Schaden gegen Infanterie`,
      dealtAll: (m) => `+${pct(m)} Schaden`,
      cd: (m) => `Waffen feuern ${Math.round((1 / m - 1) * 100)} % schneller`,
      sniperRange: (m) => `Scharfschützen-Reichweite +${pct(m)}`,
      aa: (m) => `Flak und SAM +${pct(m)} Schaden`,
      build: (m) => `Bautempo +${pct(m)}`,
      repair: (m) => `Reparatur ${m}× so schnell`,
      abilityCd: (m) => `Rauch und Minen laden ${pct(m)} schneller`,
      optics: (m) => `Sicht und Waffenreichweite der Einheiten +${pct(m)}`,
      jam: (m) => `gegnerische Flak und SAM treffen eigene Hubschrauber ${pct(m)} seltener`,
    };
    return Object.entries(fx).map(([k, m]) => T[k](m)).join(', ');
  }
  if (it2?.autoTurret) return 'Dachaufbauten von Gefechtstürmen und Häusern feuern auch ohne Besatzung';
  if (it2?.regen) return 'Bodenfahrzeuge reparieren sich selbst, wenn sie 6 s nicht getroffen wurden';
  if (key === 'smoke') return 'Fahrzeuge legen mit V eine Nebelwand: eigene Einheiten darin nehmen halb so viel Schaden';
  if (key === 'mines') return 'Baufahrzeuge legen mit M Minen, die Bodeneinheiten des Gegners treffen';
  return '';
}

/** Legt game.research und team.tech an (on: Forschung eingeschaltet). */
export function createResearch(game, on) {
  game.research = !!on;
  game.smokes = [];
  game.mines = [];
  for (const t of game.teams) t.tech = { tier: 1, done: [], cur: null };
}

/** Stufe, ab der eine Einheit ausgebildet werden kann (1 = von Anfang an). */
export const unitTier = (type) => R.unitTier[type] ?? 1;

/** Ist diese Einheit für das Team noch gesperrt? Ohne Forschung nie. */
export const unitLocked = (game, team, type) => !!game.research && unitTier(type) > game.teams[team].tech.tier;

export const lockReason = (type) => `Benötigt Stufe ${unitTier(type)}`;

/** Hat das Team diese Verbesserung erforscht? */
export const hasTech = (game, team, key) => !!game.research && game.teams[team].tech.done.includes(key);

/** Warum das Forschungsziel jetzt nicht begonnen werden kann (ohne Geld); '' = möglich. anyway: laufende Forschung übergehen (Menü). */
export function researchBlock(game, team, key, anyway = false) {
  if (!game.research) return 'Forschung ist in dieser Partie ausgeschaltet';
  const it = R.items[key];
  if (!it) return 'Unbekannte Forschung';
  const tech = game.teams[team].tech;
  if (tech.done.includes(key) || (it.tier && tech.tier >= it.tier)) return 'Bereits erforscht';
  if (tech.cur?.key === key) return 'Wird gerade erforscht';
  if (tech.cur && !anyway) return 'Es läuft schon eine Forschung';
  if (it.req === 'branch') {
    const rest = RESEARCH_KEYS.filter((k) => R.items[k].branch === it.branch && k !== key && !R.items[k].tier);
    if (rest.some((k) => !tech.done.includes(k))) return `Benötigt alle anderen Forschungen im Ast ${R.branches[it.branch]}`;
  } else if (it.req && !tech.done.includes(it.req)) return `Benötigt ${R.items[it.req].name}`;
  if (tech.tier < it.needs) return `Benötigt Stufe ${it.needs}`;
  // Stadt (seit v4.88): Universität für Stufe 2 und 3, Rechenzentrum für den Ast KI
  if (it.dc && cityLevel(game, team, 'dc') < 1) return game.city ? 'Benötigt ein Rechenzentrum in der Stadt' : 'Nur mit Stadt (Rechenzentrum)';
  if (game.city && it.tier === 2 && cityLevel(game, team, 'uni') < 1) return 'Benötigt eine Universität in der Stadt';
  if (game.city && it.tier === 3 && cityLevel(game, team, 'uni') < CITY.uniForTier3) return `Benötigt eine Universität der Stufe ${CITY.uniForTier3}`;
  return '';
}

/** { type: 'research', buildingId, key }: nur die Hauptstadt, eine Forschung zugleich, Geld beim Start. */
export function cmdResearch(game, team, cmd) {
  const b = game.getEntity(cmd.buildingId);
  if (!b || b.kind !== 'building' || b.team !== team || !b.main) return fail('Nur die Hauptstadt forscht');
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
    // Stadt: jede Uni-Stufe über 1 beschleunigt, Strommangel bremst
    const uni = game.city ? cityLevel(game, team.id, 'uni') : 0;
    cur.t += game.city ? dt * (1 + CITY.uniSpeed * Math.max(0, uni - 1)) * powerRatio(game, team.id) : dt;
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
  return (done.includes('composite') ? R.composite : 1) * fxMul(game, u.team, 'taken');
}

/** Faktor für Waffenreichweite und Sicht der Einheiten eines Teams (Wärmebildoptik), sonst 1. */
export const opticsMul = (game, team) => (hasTech(game, team, 'optics') ? R.optics : 1) * fxMul(game, team, 'optics');

/** Produkt der Wirkung `stat` (fx) aller erforschten Verbesserungen des Teams, sonst 1. */
export function fxMul(game, team, stat) {
  if (!game.research) return 1;
  let m = 1;
  for (const k of game.teams[team].tech.done) m *= R.items[k]?.fx?.[stat] ?? 1;
  return m;
}

/** Waffenreichweite-Faktor einer Einheit: Wärmebildoptik, bei Scharfschützen Zielfernrohre. */
export const rangeMul = (game, u) => opticsMul(game, u.team) * (u.type === 'sniper' ? fxMul(game, u.team, 'sniperRange') : 1);

/** Faktor auf den Schaden eines Schusses von s auf t (Munition, Granaten, Lenkraketen, Waffenmeister). */
export function dealtMul(game, s, t) {
  if (!game.research || !game.teams[s.team].tech.done.length) return 1;
  const m = fxMul(game, s.team, 'dealtAll') * fxMul(game, s.team, t.def.armor === 'inf' ? 'dealtInf' : 'dealtVeh');
  return s.type === 'flak' || s.type === 'sam' ? m * fxMul(game, s.team, 'aa') : m;
}

/** Faktor Rauch: eigene Einheiten in einer Nebelwand ihres Teams nehmen weniger Schaden. */
export function smokeMul(game, u) {
  for (const s of game.smokes ?? []) if (s.team === u.team && Math.hypot(u.x - s.x, u.y - s.y) <= s.r) return BALANCE.research.smoke.taken;
  return 1;
}

// Wetter und Jahreszeiten (nach Empire Earth II): Die Jahreszeit gilt die ganze Partie (Sommer, Herbst, Winter), das Wetter wechselt
// alle paar Minuten (klar, Regen, Nebel, Schnee). Regen und Schnee senken die Sichtweite, Nebel noch mehr; Schneefall und Winterboden
// bremsen Bodenfahrzeuge. Übergänge blenden über `fade` s, die Sicht in 5-%-Stufen (die Sichtstrahlen bleiben zwischengespeichert).
// Eigener Zufall (deterministisch je Seed), der übrige Spielablauf bleibt unberührt. Aus (Standard): Sommer, klar, alle Faktoren 1.
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';

const WX = BALANCE.weather;
export const SEASONS = ['summer', 'autumn', 'winter'];
export const SEASON_NAMES = { summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
export const WEATHER_NAMES = { clear: 'Klar', rain: 'Regen', fog: 'Nebel', snow: 'Schnee' };
/** Einstellungen des Startmenüs: aus, Zufall (Jahreszeit je Partie) oder eine feste Jahreszeit. */
export const WEATHER_SETTINGS = ['off', 'random', ...SEASONS];

const START = { rain: 'Regen zieht auf', fog: 'Nebel zieht auf', snow: 'Es schneit' };
const STOP = { rain: 'Der Regen hört auf', fog: 'Der Nebel lichtet sich', snow: 'Es hört auf zu schneien' };

const lerp = (a, b, t) => a + (b - a) * t;
const rngOf = (game) => makeRng((Math.imul(game.seed | 0, 2654435761) ^ 0x5eed7e17) >>> 0); // eigener Zufall je Seed
const pct = (m) => `${Math.round((1 - m) * 100)} %`;

/** Tempo der Bodenfahrzeuge bei diesem Wetter in dieser Jahreszeit (Schneefall vor Winterboden). */
const vehicleOf = (kind, season) => (kind === 'snow' ? WX.vehicle : season === 'winter' ? WX.winter : 1);

/**
 * Wirkung eines Wetters in Worten, z. B. „Sicht −35 %“ oder „Sicht −20 %, Fahrzeuge −20 %“ (leer bei klarem Sommerwetter).
 * withGround = false: ohne die Bremse des Winterbodens (die gilt die ganze Partie und steht in der Startmeldung).
 */
export function weatherEffect(kind, season, withGround = true) {
  const out = [];
  const s = WX.sight[kind] ?? 1;
  const v = vehicleOf(kind, withGround ? season : 'summer');
  if (s < 1) out.push(`Sicht −${pct(s)}`);
  if (v < 1) out.push(`Fahrzeuge −${pct(v)}`);
  return out.join(', ');
}

/** Nächstes Wetter nach den Gewichten der Jahreszeit, nie das aktuelle. */
function pickNext(w) {
  const odds = Object.entries(WX.odds[w.season]).filter(([k]) => k !== w.kind);
  let r = w.rng.next() * odds.reduce((a, [, n]) => a + n, 0);
  for (const [k, n] of odds) {
    r -= n;
    if (r < 0) return k;
  }
  return odds[odds.length - 1][0];
}

/** Erstes Wetter einer Partie (alle Arten der Jahreszeit nach Gewicht, auch klar). */
function pickFirst(w) {
  const odds = Object.entries(WX.odds[w.season]);
  let r = w.rng.next() * odds.reduce((a, [, n]) => a + n, 0);
  for (const [k, n] of odds) {
    r -= n;
    if (r < 0) return k;
  }
  return 'clear';
}

/**
 * Legt game.weather an. setting: 'off' (oder false/null), 'random' (Jahreszeit aus dem Seed) oder 'summer' | 'autumn' | 'winter'.
 * Felder: on, season, kind (aktuelles Wetter), prev, mix (0 … 1: Übergang von prev zu kind), next (Spielzeit des nächsten Wechsels),
 * sight (Faktor der Sichtweite), vehicle (Faktor des Tempos der Bodenfahrzeuge).
 */
export function createWeather(game, setting) {
  const on = !!setting && setting !== 'off';
  const w = { on, season: 'summer', kind: 'clear', prev: 'clear', mix: 1, next: Infinity, sight: 1, vehicle: 1, rng: null };
  game.weather = w;
  if (!on) return w;
  w.rng = rngOf(game);
  w.season = SEASONS.includes(setting) ? setting : SEASONS[Math.floor(w.rng.next() * SEASONS.length)];
  w.kind = w.prev = pickFirst(w);
  w.next = w.rng.range(...WX.phase[w.kind]);
  settle(w);
  const ground = w.season === 'winter' ? ` (Schnee am Boden: Fahrzeuge −${pct(WX.winter)})` : '';
  const eff = weatherEffect(w.kind, w.season, false);
  game.message(-1, `${SEASON_NAMES[w.season]}${ground} · ${WEATHER_NAMES[w.kind]}${eff ? `: ${eff}` : ''}`);
  return w;
}

/** Faktoren aus Übergang und Jahreszeit (Sicht in 5-%-Stufen, Tempo auf 1 %). */
function settle(w) {
  const s = lerp(WX.sight[w.prev], WX.sight[w.kind], w.mix);
  const v = lerp(vehicleOf(w.prev, w.season), vehicleOf(w.kind, w.season), w.mix);
  w.sight = Math.round(s * 20) / 20;
  w.vehicle = Math.round(v * 100) / 100;
}

/** Ein Schritt: Übergang weiterblenden, zur Zeit den Wechsel auslösen und beiden Seiten melden. */
export function updateWeather(game, dt) {
  const w = game.weather;
  if (!w?.on) return;
  if (w.mix < 1) w.mix = Math.min(1, w.mix + dt / WX.fade);
  if (game.time >= w.next) {
    w.prev = w.kind;
    w.kind = pickNext(w);
    w.mix = 0;
    w.next = game.time + w.rng.range(...WX.phase[w.kind]);
    const eff = weatherEffect(w.kind, w.season, false);
    game.message(-1, w.kind === 'clear' ? `${STOP[w.prev]}: klare Sicht` : `${START[w.kind]}: ${eff}`);
  }
  settle(w);
}

/** Faktor der Sichtweite (1 ohne Wetter). */
export const weatherSight = (game) => game.weather?.sight ?? 1;

/** Faktor des Tempos dieser Einheit: Bodenfahrzeuge bei Schnee und auf Winterboden, sonst 1. */
export function weatherSpeed(game, u) {
  const v = game.weather?.vehicle ?? 1;
  return v !== 1 && !u.def.air && u.def.armor !== 'inf' ? v : 1;
}

/** Test- und Debug-Hilfe: schaltet sofort auf dieses Wetter (ohne Übergang und Meldung), auch bei ausgeschaltetem Wetter. */
export function setWeather(game, kind, season = game.weather?.season ?? 'summer') {
  const w = game.weather ?? createWeather(game, 'off');
  w.on = true;
  w.rng ??= rngOf(game);
  w.season = season;
  w.kind = w.prev = kind;
  w.mix = 1;
  if (!Number.isFinite(w.next)) w.next = game.time + w.rng.range(...WX.phase[kind]);
  settle(w);
  return w;
}

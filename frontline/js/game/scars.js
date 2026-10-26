// Sichtbarer Schaden: Wracks zerstörter Fahrzeuge und Gebäude, Krater von Mörsereinschlägen und Brandflecken. Rein optisch:
// nichts davon blockiert Wege oder Sicht. Jedes Team sieht eine Narbe erst, wenn ihre Stelle einmal in seiner Sicht lag (seen, Bitmaske).
import { BALANCE } from '../data/balance.js';

const S = BALANCE.scars;
const TILE = BALANCE.map.tile;

export function createScars(game) {
  game.wrecks = [];
  game.craters = [];
  game.scarSeq = 0;
}

/** Bitmaske der Teams, die (x, y) gerade sehen. */
function seenBy(game, x, y) {
  let m = 0;
  for (let t = 0; t < game.teams.length; t++) if (game.fog[t] && game.isVisible(t, x, y)) m |= 1 << t;
  return m;
}

function push(list, item, max) {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max); // die ältesten zuerst
}

/** Krater bzw. Brandfleck mit Radius r. */
export function addCrater(game, x, y, r = S.craterR) {
  push(game.craters, { id: ++game.scarSeq, x, y, r, t0: game.time, seen: seenBy(game, x, y) }, S.craterMax);
}

/** Wrack einer zerstörten Einheit (Fahrzeug oder Hubschrauber; Infanterie hinterlässt keins), mit Brandfleck darunter. */
export function addUnitWreck(game, u) {
  if (u.def.armor === 'inf') return;
  push(
    game.wrecks,
    { id: ++game.scarSeq, kind: 'unit', type: u.type, team: u.team, x: u.x, y: u.y, angle: u.angle || 0, r: u.def.radius, air: !!u.def.air, t0: game.time, seen: seenBy(game, u.x, u.y) },
    S.wreckMax,
  );
  addCrater(game, u.x, u.y, u.def.radius * 1.5);
}

/** Trümmer eines zerstörten (nicht abgerissenen) Gebäudes auf seiner Grundfläche, mit Brandfleck. */
export function addBuildingWreck(game, b) {
  const w = b.w * TILE;
  const h = b.h * TILE;
  const x = b.cx * TILE + w / 2;
  const y = b.cy * TILE + h / 2;
  const small = !!(b.def.blocksAll || b.def.gate); // Mauern und Tore: nur ein Schutthaufen, kein Brand
  push(game.wrecks, { id: ++game.scarSeq, kind: 'building', type: b.type, team: b.team, x, y, w, h, small, t0: game.time, seen: seenBy(game, x, y) }, S.wreckMax);
  if (!small) addCrater(game, x, y, Math.max(w, h) * 0.6);
}

/** Ein neues Gebäude räumt die Trümmer auf seiner Fläche weg. */
export function clearWrecksUnder(game, b) {
  const x0 = b.cx * TILE;
  const y0 = b.cy * TILE;
  const x1 = x0 + b.w * TILE;
  const y1 = y0 + b.h * TILE;
  game.wrecks = game.wrecks.filter((w) => w.kind !== 'building' || w.x <= x0 || w.x >= x1 || w.y <= y0 || w.y >= y1);
}

/** Sichtstand der Narben nach jeder Nebelrechnung. */
export function updateScarIntel(game) {
  const all = (1 << game.teams.length) - 1;
  for (const list of [game.wrecks, game.craters]) for (const s of list) if (s.seen !== all) s.seen |= seenBy(game, s.x, s.y);
}

/** Abgelaufene Narben entfernen. */
export function updateScars(game) {
  const t = game.time;
  if (game.wrecks.length && t - game.wrecks[0].t0 > S.wreckLife) game.wrecks = game.wrecks.filter((w) => t - w.t0 <= S.wreckLife);
  if (game.craters.length && t - game.craters[0].t0 > S.craterLife) game.craters = game.craters.filter((c) => t - c.t0 <= S.craterLife);
}

/** Deckkraft einer Narbe (1 → 0 in den letzten fade Sekunden ihres Lebens). */
export function scarAlpha(s, time, life, fade) {
  return Math.max(0, Math.min(1, (life - (time - s.t0)) / fade));
}

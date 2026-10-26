// Sendemast (nach dem Wunder aus Age of Empires II): zweite Siegbedingung neben den Zonenpunkten, in der Partie ein- oder ausschaltbar.
// Ein Team baut ihn (einer je Team) in einem Bauradius; ist er fertig, sieht ihn der Gegner überall, und hält er `hold` Sekunden,
// gewinnt sein Team. Der Gegner muss also angreifen statt nur die Zone zu halten. Zerstört beginnt die Zeit beim nächsten von vorn.
import { BALANCE } from '../data/balance.js';

const R = BALANCE.radio;
const names = BALANCE.teamNames;

/** Restzeit (s) bis zum Sieg durch diesen fertigen Mast. */
export const radioLeft = (b) => Math.max(0, R.hold - (b.hold || 0));

/** Geschätzte Zeit (s) bis zum Sieg: fertig die Restzeit, als Baustelle dazu die restliche Bauzeit (ein Bauer). */
export const radioEta = (b) => (b.built ? radioLeft(b) : (1 - (b.progress || 0)) * b.def.buildTime + R.hold);

/** Fertige, lebende Sendemasten. */
export const radios = (game) => game.buildings.filter((b) => b.alive && b.built && b.def.radio);

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Eine Baustelle wurde gesetzt: der Gegner erfährt, dass gebaut wird (nicht wo). */
export function radioStarted(game, b) {
  game.message(1 - b.team, 'Der Gegner baut einen Sendemast');
}

/** Zeit der fertigen Masten; Meldungen bei Fertigstellung und kurz vor Ablauf; Sieg nach `hold` s. */
export function updateRadio(game, dt) {
  if (!game.radioWin) return;
  for (const b of game.buildings) {
    if (!b.alive || !b.built || !b.def.radio) continue;
    if (b.hold === undefined) {
      b.hold = 0;
      game.message(b.team, `Sendemast steht: halte ihn ${clock(R.hold)} für den Sieg`, b.x, b.y);
      game.message(1 - b.team, `${names[b.team]} hat einen Sendemast errichtet: zerstört ihn binnen ${clock(R.hold)}!`, b.x, b.y);
    }
    b.hold += dt;
    if (!b.warned && radioLeft(b) <= R.warn) {
      b.warned = true;
      game.message(-1, `Sendemast ${names[b.team]}: noch ${clock(radioLeft(b))}`, b.x, b.y);
    }
    if (b.hold >= R.hold) {
      game.endGame(b.team, 'radio');
      return;
    }
  }
}

/** Ein Mast ist gefallen (zerstört, nicht abgerissen): Meldung an den Gegner. */
export function radioLost(game, b) {
  if (b.built) game.message(1 - b.team, `Sendemast von ${names[b.team]} zerstört`, b.x, b.y);
}

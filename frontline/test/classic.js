// Testhilfe: die Haupt-FOB bekommt ein endliches Lager (wie früher), damit Tests die Lagerbuchhaltung prüfen können.
export const CLASSIC = { bm: 1000, mun: 400, fuel: 400 };

/** Alle Haupt-FOBs auf endliches Lager umstellen (Verlust-Regel und Ausbildung bleiben). Liefert das Spiel. */
export function classic(game, stock = CLASSIC) {
  for (const b of game.buildings) {
    if (!b.infinite) continue;
    b.infinite = false;
    b.store = { ...stock };
  }
  return game;
}

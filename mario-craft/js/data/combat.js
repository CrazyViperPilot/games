// Feinwerte für Gegner, Gegenstände, Geschosse, Bosse und Spielablauf (PLAN §4, §10).
// Zeiten in s, Strecken in px, Geschwindigkeiten in px/s, Punkte als Ganzzahlen.
export const TUNE = {
  // Gegner
  shellKickSafe: 0.2,          // s, Spieler ist nach dem Kick vor dem Panzer sicher
  flipVy: -260,                // px/s, Abschuss-Sprung besiegter Gegner (fallen danach aus dem Bild)
  deadFlipTime: 1.2,           // s, bis ein abgeschossener Gegner entfernt wird
  squashTime: 0.4,             // s, gestampfter Gegner liegt so lange platt
  // Plattformen
  fallDelay: 0.5,              // s, Stehzeit bis eine fallende Plattform fällt
  // Gegenstände und Blöcke
  mushroomSpeed: 40,           // px/s, Pilz und 1-Up
  starSpeed: 50,               // px/s, Stern
  starHop: 220,                // px/s, Stern-Hüpfer
  itemRise: 64,                // px/s, Gegenstand steigt aus dem Block
  coinPopRise: 110,            // px/s, aufspritzende Münze
  coinPopTime: 0.35,           // s
  bumpTime: 0.15,              // s, Wackeln eines Blocks
  debrisLife: 0.8,             // s, Ziegelbruchstücke
  // Geschosse
  rockTime: 0.6,               // s, Fels bleibt nach der Landung so lange liegen
  rockSize: 12,
  rockOffsets: [-20, 8, -6, 18, -14], // px, Streuung der fallenden Felsen um den Spieler
  flameSpeed: 110,             // px/s, Drachenfeuer
  flameLife: 3.0,              // s
  flameW: 16,
  flameH: 8,
  // Bosse
  stompInvuln: 1.0,            // s, Boss nach einem Treffer unverwundbar
  rootJump: 300,               // px/s, Sprung des Wurzelkönigs
  golemJump: 300,              // px/s, Sprung des Felsgolems
  golemJumpEvery: 3.0,         // s
  bossDefeatTime: 1.5,         // s, besiegter Boss fällt, dann verschwindet er
  bossFallVy: -300,            // px/s
  bossDefeatPoints: 1000,
  barrierDist: 2,              // Kacheln, unsichtbare Wand vor der Zielfahne
  // Spieler und Ablauf
  deathTime: 1.5,              // s
  deathHop: -200,              // px/s, kurzer Hüpfer beim Tod durch Treffer oder Gegner
  pointsStomp: [100, 200, 400, 800, 1000], // Kettenpunkte, danach bleibt der letzte Wert
  pointsKill: 100,             // Abschuss durch Feuerball, Panzer, Stern oder Block
  pointsPowerup: 1000,         // Pilz, Blume, Stern
  pointsFlagMin: 100,          // Zielfahne: unten
  pointsFlagMax: 5000,         // Zielfahne: ganz oben
};

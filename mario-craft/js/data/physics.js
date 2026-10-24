// Bewegungs- und Spielwerte (PLAN §5). Längen in px, Geschwindigkeiten px/s, Zeiten s.
export const PHYS = {
  tile: 16, step: 1 / 120,
  walkSpeed: 90, runSpeed: 150, runDelay: 0.6,     // Renntempo nach 0,6 s gehaltener Richtung
  accel: 600, decel: 700, turnDecel: 1100, airAccelMult: 0.8,
  gravity: 1300, gravityHold: 650,                 // geringere Schwerkraft solange Sprung gehalten und vy < 0
  jumpSpeed: 330, runJumpBonus: 30,                // vy beim Absprung (+ Bonus bei Renntempo)
  jumpCut: 0.45,                                   // vy *= jumpCut beim Loslassen während Aufstieg
  maxFall: 420, coyote: 0.08, jumpBuffer: 0.1,
  stompBounce: 220, stompBounceHold: 330,
  cornerNudge: 4,                                  // px seitliche Korrektur bei Kopfstoß an Blockkante
  hurtInvuln: 1.5, starTime: 8,
  player: { w: 12, h: 26 },                        // feste Größe
  climbSpeed: 70,
  water: { gravity: 350, maxFall: 70, swim: 150, speedMult: 0.6 },
  slimeBounce: 560,
  digReach: 1,                                     // Kacheln
  arrowSpeed: 260,
  arrowGravity: 120,
  maxArrows: 2,
  stunTime: 0.9,                                   // Lähmung durch Skelett-Pfeil (statt Schaden)
  stunInvuln: 1.6,                                 // Schonzeit nach der Lähmung gegen sofortige Wiederholung
  digHitCooldown: 0.35,                            // s zwischen zwei Pickel-Treffern auf Mobs
  lives: 3, coinsPerLife: 100,
};

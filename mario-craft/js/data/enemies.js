// Gegner- und Bosswerte (PLAN §4.3).
export const ENEMIES = {
  walker:   { w: 14, h: 14, speed: 30, stompable: true,  falls: true },
  beetle:   { w: 14, h: 16, speed: 30, stompable: true,  falls: true, shell: true },
  hopper:   { w: 14, h: 14, speed: 40, stompable: true,  hopEvery: 1.4, hopSpeed: 280 },
  spiky:    { w: 14, h: 14, speed: 20, stompable: false, turnAtEdge: true },
  lavaball: { w: 10, h: 10, jumpSpeed: 420, every: 2.5, invulnerable: true },
};

export const BOSSES = {
  rootking: { w: 32, h: 32, hp: 3, speed: 50, jumpEvery: 2.5 },
  golem:    { w: 32, h: 40, hp: 3, speed: 35, rockEvery: 2.8, dizzy: 2.0 },
  dragon:   { w: 40, h: 32, hp: 3, fireHp: 8, speed: 40, fireEvery: 2.0 },
};

// Mob- und Boss-Werte (PRD §5, PLAN §7 und §9).
// Größen w/h = Hitbox in px. Geschwindigkeit px/s, Zeiten s. Abstände (aggro, keep, jumpRange, fuseRange,
// radius, hover, arena, skullRadius) in Kacheln.

export const MOBS = {
  zischer: { w: 12, h: 24, speed: 40, hp: 1, stompable: true, aggro: 8, fuseRange: 1.5, fuse: 1.5, stompFuse: 1.0, radius: 2.5 },
  zombie: { w: 12, h: 26, speed: 25, hp: 1, stompable: true },
  skeleton: { w: 12, h: 26, speed: 30, hp: 1, stompable: true, keep: [4, 6], shootEvery: 2 },
  spider: { w: 22, h: 10, speed: 70, hp: 1, stompable: true, jumpRange: 3, climb: true },
  slime: { w: 16, h: 16, speed: 45, hp: 1, stompable: true, split: 2, splitInto: 'slimeSmall' },
  slimeSmall: { w: 8, h: 8, speed: 60, hp: 1, stompable: true },
  silverfish: { w: 10, h: 6, speed: 75, hp: 1, stompable: true },
  glutgeist: { w: 14, h: 20, speed: 25, hp: 3, stompable: false, shootEvery: 3, shots: 3 },
  leerenlaeufer: { w: 10, h: 30, speed: 50, hp: 2, stompable: true },
};

export const BOSSES = {
  // Arena 24×10. Hüpft alle 1,6 s Richtung Spieler. Stampfer teilt: 2 × mittel (32×32), je mittlerer → 2 × slime.
  slimeking: {
    w: 48, h: 48, arena: { w: 24, h: 10 }, hp: 1,
    hopEvery: 1.6, hopVy: -380,
    split: { w: 32, h: 32, count: 2, into: 'slime' },
  },
  // Arena 30×14. Schwebt 4–6 Kacheln hoch, 60 px/s. Schädel alle 2 s (1 s ab halber Energie),
  // Schädel-Explosion Radius 1,5. Stampfer 4 Schaden (3 Stampfer), Pfeil 1 (10 Pfeile).
  dreikopf: {
    w: 48, h: 40, arena: { w: 30, h: 14 }, hp: 10, stompDmg: 4, arrowDmg: 1,
    hover: { minH: 4, maxH: 6 }, speed: 60,
    shootEvery: 2, shootEveryEnraged: 1.4, enrageAt: 0.5, skullRadius: 1.5,
  },
  // Arena 40×18. 4 Kristalle auf Säulen; solange einer steht, unverwundbar. Kristall: Stampfer oder Pfeil,
  // Explosion 1,0. Alle 6 s Landung auf dem Sockel für 2,5 s (perch). Stampfer 3 (4 Stampfer), Pfeil 1 (12 Pfeile).
  drache: {
    w: 64, h: 32, perchW: 48, perchH: 40, arena: { w: 40, h: 18 }, hp: 12, stompDmg: 3, arrowDmg: 1,
    crystals: 4, crystalExplode: 1.0, perchEvery: 6, perchTime: 2.5,
  },
};

// Monster-Spawner (Kachel M): erzeugt alle `every` s einen Gegner, wenn der Spieler ≤ `range` Kacheln entfernt ist.
export const SPAWNER = { every: 4, range: 10, max: 3, types: ['zombie', 'skeleton'] };

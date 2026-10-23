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
  // Glutgeist: schwebt (flies), driftet mit speed (px/s) zum Spieler innerhalb range Kacheln, wippt bobAmp px um y0.
  // Salve alle shootEvery s: shots Feuerkugeln (shotSpeed px/s), Fächerabstand fan rad. Stampfen verletzt.
  glutgeist: {
    w: 14, h: 20, speed: 20, hp: 1, stompable: false, flies: true,
    shootEvery: 3, shots: 3, shotSpeed: 90, fan: 0.25, range: 12, bobAmp: 4, bobPeriod: 2,
  },
  // Leerenläufer: calm läuft mit speed hin und her. Berührung → angry: teleportiert vor den Spieler (teleportDist px
  // nach Blickrichtung) und läuft mit angrySpeed auf ihn zu. hp 2: Stampfer nimmt 1 hp und gibt invulnTime s Schonzeit.
  leerenlaeufer: {
    w: 10, h: 30, speed: 30, angrySpeed: 70, hp: 2, stompable: true,
    teleportDist: 20, invulnTime: 0.6,
  },
};

export const BOSSES = {
  // Arena 24×10. Hüpft alle 1,6 s Richtung Spieler. Stampfer teilt: 2 × mittel (32×32), je mittlerer → 2 × slime.
  slimeking: {
    w: 48, h: 48, arena: { w: 24, h: 10 }, hp: 1,
    hopEvery: 1.6, hopVy: -380,
    split: { w: 32, h: 32, count: 2, into: 'slime' },
  },
  // Arena 30×14. Schwebt 4–6 Kacheln über dem Boden (Mitte 5), pendelt ±6 Kacheln (Spitze speed px/s).
  // Salve alle 3 s, ab halber Energie alle 2 s: 3 Schädel (5), Fächer ±0,3 rad, 80 px/s, Explosion Radius 1,5.
  // Nach jeder Salve 1,5 s Sturzflug auf Spielerhöhe, wenn der Spieler nahe ist (diveRange Kacheln).
  // Stampfer 1 Schaden, Pfeil 1 (10 Treffer). Explosionen wirken nicht (keine Eigenverletzung durch Schädel).
  dreikopf: {
    w: 48, h: 40, arena: { w: 30, h: 14 }, hp: 10, stompDmg: 1, arrowDmg: 1, invulnTime: 1.2,
    hover: { minH: 4, maxH: 6 }, speed: 60, sway: 6, bobSpeed: 1,
    shootEvery: 3, shootEveryEnraged: 2, enrageAt: 0.5, skulls: 3, skullsEnraged: 5, skullSpeed: 80, fan: 0.3,
    skullRadius: 1.5, diveTime: 1.5, diveRange: 4, diveFeet: 28, diveSpeed: 150, defeatRadius: 2,
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

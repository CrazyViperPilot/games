// Held (PRD §3/§7, PLAN §7): 16×28 px, Blick nach rechts, Hitbox 12×26 mittig unten.
// Eckige Blockfigur mit Kopf 8×8, Rumpf 8 breit, Arme 4 px breit, Beine 4 px breit.
// Varianten (plain/armor/bow) und Animationen entstehen aus gemeinsamen Teilen (Kopf, Rumpf, Arme, Beine,
// Werkzeug). Die Kontur (1 px, Farbe k) wird automatisch um die Silhouette gelegt.
// Der Atlas spiegelt für Linksblick (flip: true).

const W = 16;
const H = 28;

const PAL_HERO = {
  k: '#1d1322', // Kontur und Augen
  s: '#f2c29b', S: '#d9a077', // Haut, Schatten
  h: '#6b4224', H: '#8a5a33', // Haare braun
  o: '#f0801e', O: '#b5520f', P: '#ffb35c', // Hemd und Kappe orange
  b: '#2f6fd6', B: '#1f4aa0', // Hose (nah, fern)
  g: '#8a909c', G: '#4f5560', J: '#6a717d', // Schuhe, Sohlen
  i: '#dfe5ee', I: '#aab3bf', // Eisenrüstung hell, mittel
  j: '#7d8794', // Eisenrüstung dunkel
  c: '#3b2a1a', // Gürtel
  w: '#8b5a2b', W: '#5e3a1a', // Holz (Stiel, Bogen)
  t: '#eee8d5', // Bogensehne
  e: '#c8ccd4', // Spitzhacke (Metall)
};

const blank = () => Array.from({ length: H }, () => Array(W).fill('.'));

function rect(g, x0, y0, x1, y1, ch) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch;
    }
  }
}

// Arm (4 px breit). up = true: Hand oben (top..top+1), Ärmel darunter bis bottom.
// up = false: Ärmel top..bottom-2, Hand unten (bottom-1..bottom).
function arm(g, [x, top, bottom, up], sleeve, shade) {
  if (up) {
    rect(g, x, top, x + 3, top + 1, 's');
    rect(g, x, top + 2, x + 3, bottom, sleeve);
    rect(g, x + 3, top + 2, x + 3, bottom, shade);
  } else {
    rect(g, x, top, x + 3, bottom - 2, sleeve);
    rect(g, x + 3, top, x + 3, bottom - 2, shade);
    rect(g, x, bottom - 1, x + 3, bottom, 's');
  }
}

// Bein (4 px breit, Schuh 5 px). lift = 1 oder 2: Fuß angehoben.
function leg(g, [x, lift], pants, shade, shoe) {
  rect(g, x, 18, x + 3, 24 - lift, pants);
  rect(g, x + 3, 18, x + 3, 24 - lift, shade);
  rect(g, x, 25 - lift, x + 4, 26 - lift, shoe);
  rect(g, x, 27 - lift, x + 4, 27 - lift, 'G');
}

// Kopf 8×8 (Spalten 4–11, Zeilen 0–7). Kappe (plain) oder Eisenhelm (armor, bow).
function head(g, armor, dead) {
  if (armor) {
    rect(g, 4, 0, 11, 2, 'i');
    rect(g, 11, 0, 11, 3, 'I');
    rect(g, 4, 3, 11, 3, 'j');       // Visiersteg
    rect(g, 4, 4, 11, 7, 's');
    rect(g, 4, 4, 4, 6, 'I');        // Wangenschutz
  } else {
    rect(g, 4, 0, 11, 1, 'o');
    rect(g, 5, 0, 8, 0, 'P');        // Licht auf der Kappe
    rect(g, 11, 0, 11, 1, 'O');
    rect(g, 12, 1, 13, 1, 'O');      // Schirm
    rect(g, 4, 2, 11, 2, 'h');       // braune Haare unter der Kappe
    rect(g, 4, 3, 11, 7, 's');
    rect(g, 4, 3, 4, 4, 'h');        // Haarsträhne hinten
  }
  rect(g, 5, 7, 10, 7, 'S');         // Kinnschatten
  dot(g, 12, 5, 'S');                // Nase
  if (dead) {
    dot(g, 9, 4, 'k'); dot(g, 11, 4, 'k');
    dot(g, 9, 5, 'k'); dot(g, 11, 5, 'k');
  } else {
    dot(g, 9, 4, 'k'); dot(g, 11, 4, 'k');
  }
}

function dot(g, x, y, ch) { rect(g, x, y, x, y, ch); }

// Rumpf 8×10 (Spalten 4–11, Zeilen 8–17), Gürtel in Zeile 16.
function torso(g, armor) {
  if (armor) {
    rect(g, 4, 8, 11, 17, 'i');
    rect(g, 4, 8, 4, 15, 'I');
    rect(g, 11, 8, 11, 15, 'j');
    rect(g, 7, 9, 8, 15, 'I');       // Brustplatte: Mittelstreifen
    rect(g, 4, 16, 11, 16, 'c');
  } else {
    rect(g, 4, 8, 11, 17, 'o');
    rect(g, 11, 8, 11, 15, 'O');
    rect(g, 4, 16, 11, 16, 'c');
  }
}

// Spitzhacke: 'up' = über dem Kopf, 'swing' = nach unten vor dem Körper.
function pick(g, mode) {
  if (mode === 'up') {
    rect(g, 14, 1, 14, 8, 'w');      // Stiel
    rect(g, 12, 0, 15, 0, 'e');      // Kopf
    dot(g, 12, 1, 'e'); dot(g, 15, 1, 'e');
  } else {
    rect(g, 13, 15, 14, 15, 'w');
    rect(g, 14, 16, 14, 19, 'w');    // Stiel nach unten
    rect(g, 12, 20, 15, 20, 'e');    // Kopf unten
    dot(g, 12, 19, 'e'); dot(g, 15, 19, 'e');
  }
}

// Bogen in der fernen Hand, links am Körper.
function bow(g) {
  dot(g, 1, 5, 'W');
  dot(g, 0, 6, 'W'); dot(g, 0, 7, 'W');
  rect(g, 0, 8, 0, 16, 'W');
  dot(g, 0, 17, 'W'); dot(g, 0, 18, 'W');
  dot(g, 1, 19, 'W');
  rect(g, 2, 5, 2, 19, 't');         // Sehne
}

// Kontur: gefüllte Pixel mit transparentem Nachbarn (oder Rand) werden k.
function outline(g) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : g[y][x]);
  return g.map((row, y) => row.map((p, x) => {
    if (p === '.') return '.';
    const edge = at(x - 1, y) === '.' || at(x + 1, y) === '.' || at(x, y - 1) === '.' || at(x, y + 1) === '.';
    return edge ? 'k' : p;
  }).join(''));
}

// Eine Figur: power = plain | armor | bow; p = Pose aus ANIM.
function figure(power, p) {
  const g = blank();
  const armor = power !== 'plain';
  const sleeve = armor ? 'i' : 'o';
  const sleeveShade = armor ? 'I' : 'O';
  const pants = (near) => (near ? ['b', 'B'] : ['B', 'B']);

  // Hinten: fernes Bein und ferner Arm
  leg(g, p.fl, 'B', 'B', 'J');
  arm(g, p.fa, sleeve, sleeveShade);
  if (power === 'bow') bow(g);
  torso(g, armor);
  // Vorn: nahes Bein, nahe Hand
  leg(g, p.nl, pants(true)[0], pants(true)[1], 'g');
  arm(g, p.na, sleeve, sleeveShade);
  head(g, armor, p.dead);
  if (p.tool) pick(g, p.tool);
  return outline(g);
}

// Posen: nl/fl = [x, lift] Beine, na/fa = [x, top, bottom, up] Arme (Ärmelspalte x), tool, dead.
const P = (nl, fl, na, fa, tool = null, dead = false) => ({ nl, fl, na, fa, tool, dead });
const STAND_NA = [11, 9, 17, 0];
const STAND_FA = [1, 9, 17, 0];

const ANIM = {
  stand: [P([8, 0], [4, 0], STAND_NA, STAND_FA)],
  walk: [
    P([9, 0], [3, 0], [10, 9, 17, 0], [2, 9, 17, 0]),
    P([8, 1], [4, 0], STAND_NA, STAND_FA),
    P([7, 0], [5, 0], [12, 9, 17, 0], [0, 9, 17, 0]),
    P([8, 0], [4, 1], STAND_NA, STAND_FA),
  ],
  jump: [P([9, 2], [3, 1], [12, 4, 11, 1], STAND_FA)],
  fall: [P([9, 0], [3, 0], [12, 5, 12, 1], [0, 5, 12, 1])],
  climb: [
    P([8, 2], [4, 0], [12, 3, 11, 1], STAND_FA),
    P([8, 0], [4, 2], STAND_NA, [0, 4, 11, 1]),
  ],
  swim: [
    P([9, 0], [3, 2], [12, 3, 9, 1], [0, 11, 16, 0]),
    P([8, 2], [4, 0], [12, 11, 16, 0], [0, 3, 9, 1]),
  ],
  dig: [
    P([8, 0], [4, 0], [12, 7, 13, 1], STAND_FA, 'up'),
    P([8, 0], [4, 0], [12, 11, 16, 0], STAND_FA, 'swing'),
  ],
  dead: [P([8, 0], [4, 0], STAND_NA, STAND_FA, null, true)],
};

export const HERO_ART = {};
for (const power of ['plain', 'armor', 'bow']) {
  for (const anim of Object.keys(ANIM)) {
    HERO_ART[`hero_${power}_${anim}`] = {
      pal: PAL_HERO,
      frames: ANIM[anim].map((pose) => figure(power, pose)),
      flip: true,
    };
  }
}

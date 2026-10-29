// Generator für alle Level von Mario Craft (5 Welten x 33 Level = 165 Level).
// Bodenlevel kommen aus compose.mjs, Inseln der Leere und die Welt-3/4-Bosse stehen hier.
// Prüft jedes Level mit parseLevel und explore auf 100% Erreichbarkeit und Unlösbarkeitsfreiheit!
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng, LevelBuilder } from './builder.mjs';
import { buildGroundLevel, failLog } from './compose.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(__dirname, '..');

// -------------------------------------------------------------
// LEVEL GENERATORS
// -------------------------------------------------------------

export function buildEndLevel(nr, world = 5, usedSigs = new Set(), attempt = 0) {
  const rng = makeRng(4000 + nr * 67 + attempt * 7919);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const id = `w${world}-${nr}`;
  const d = Math.min(1, (nr - 19) / 13);
  const H = 54;
  const count = 13 + Math.round(d * 8);

  // Plan: Inseln mit Breite, Lücke, Höhe und Besonderheit; daraus ergibt sich die Levelbreite.
  const plan = [];
  let curR = 20;
  let x = 2 + 15 + 2;
  for (let i = 0; i < count; i++) {
    const width = ri(8 - Math.round(d * 2), 13 - Math.round(d * 3));
    let dR = ri(-3, 3);
    curR = Math.max(16, Math.min(H - 14, curR + dR));
    dR = Math.sign(dR) * Math.min(Math.abs(dR), 3);
    const gap = dR > 0 ? ri(2, 3) : ri(2, 3 + (d > 0.4 ? 1 : 0));
    const feature = ['mobs', 'pillar', 'mobs', 'coins', 'slime', 'twin'][ri(0, 5)];
    plan.push({ c0: x, width, r: curR, gap, feature });
    x += width + gap + 1;
  }
  const W = x + 20;
  const b = new LevelBuilder(id, world, 'end', W, H, 2);
  b.addBorders(true);

  const island = (c0, c1, top, depth = 5) => {
    for (let k = 0; k < depth; k++) {
      const shrink = Math.round(k * 0.5);
      b.fill(c0 + shrink, top + k, c1 - shrink, top + k, 'E');
    }
  };

  // Startinsel
  island(2, 16, 20);
  b.put(4, 19, 'P');
  b.put(6, 19, 'o');
  b.put(8, 19, 'o');

  const sigs = [];
  const bedAt = Math.floor(count / 2);
  let diamonds = 0;
  plan.forEach((p, i) => {
    const c1 = p.c0 + p.width;
    island(p.c0, c1, p.r);
    // Trittstein bei Lücken ab 3: kleiner Block in der Mitte der Lücke
    const prevEnd = i === 0 ? 16 : plan[i - 1].c0 + plan[i - 1].width;
    const lag = p.c0 - prevEnd - 1;
    if (lag >= 3) {
      const pr = i === 0 ? 20 : plan[i - 1].r;
      b.put(prevEnd + 1 + (lag >> 1), Math.max(pr, p.r), 'E');
    }
    const mid = p.c0 + (p.width >> 1);
    const foot = p.r - 1;
    if (i === bedAt) {
      b.put(p.c0 + 3, foot, 'K');
      b.addChest(p.c0 + 6, foot, 'armor');
    } else if (i === 2) {
      b.addChest(p.c0 + 4, foot, 'bow');
    } else if (p.feature === 'mobs') {
      const n = 1 + (d > 0.3 ? 1 : 0) + (d > 0.7 ? 1 : 0);
      for (let k = 0; k < n; k++) b.put(p.c0 + 3 + k * 3, foot, k % 2 && d > 0.5 ? 's' : 'e');
    } else if (p.feature === 'pillar') {
      b.vline(mid, foot - 2, foot, 'E');
      b.put(mid + 2, foot, 'e');
      b.put(mid, foot - 3, 'o');
    } else if (p.feature === 'coins') {
      for (let k = 2; k < p.width - 1; k += 2) b.put(p.c0 + k, foot - 1, 'o');
      b.put(mid, foot - 4 - 0, '.');
    } else if (p.feature === 'slime') {
      b.put(c1 - 2, p.r, 'J');
      b.put(p.c0 + 3, foot, 'e');
    } else if (p.feature === 'twin') {
      b.put(mid - 2, foot, 'e');
      b.put(mid + 2, foot, 'e');
      b.put(mid, foot - 3, '|');
    }
    if (i === 1 || i === bedAt + 2 || i === count - 2) {
      if (diamonds < 3) { b.addDiamond(mid, foot - 1, false); diamonds++; }
    }
    sigs.push(`${p.width}.${p.gap}.${p.r}.${p.feature}`);
  });
  while (diamonds < 3) { b.addDiamond(plan[count - 3].c0 + 2 + diamonds, plan[count - 3].r - 2, false); diamonds++; }

  const last = plan[count - 1];
  island(last.c0 + last.width + 3, W - 3, last.r);
  b.put(W - 6, last.r - 1, 'F');
  b.put(W - 8, last.r - 1, 'o');
  b.put(W - 9, last.r - 1, 'o');
  const prevEnd = last.c0 + last.width;
  b.put(prevEnd + 2, last.r, 'E');

  const sig = sigs.join('|');
  if (usedSigs.has(sig) && attempt < 40) return buildEndLevel(nr, world, usedSigs, attempt + 1);
  usedSigs.add(sig);
  return b.validate();
}

export function buildParadiseBossLevel(world = 3) {
  const id = `w${world}-33`;
  const W = 140, H = 44;
  const b = new LevelBuilder(id, world, 'paradise', W, H, 2, 'schildkroete');

  b.addBorders(false);

  const baseGround = 15;

  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'A');
    b.put(c, baseGround + 1, 'A');
    b.fill(c, baseGround + 2, c, H - 2, 'S');
  }

  b.palm(10, baseGround);
  b.palm(24, baseGround);

  b.put(4, baseGround - 1, 'P');
  b.put(6, baseGround - 1, 'o');
  b.put(8, baseGround - 1, 'o');

  const shaftC = 35;
  const arenaFloor = 28;
  b.fill(shaftC, baseGround, shaftC + 1, arenaFloor, '.');
  b.vline(shaftC, baseGround, arenaFloor, 'H');

  const doorC = 60;
  b.fill(shaftC, arenaFloor - 3, doorC, arenaFloor, '.');
  b.hline(shaftC, doorC, arenaFloor + 1, 'S');

  b.put(doorC - 4, arenaFloor, 'K');
  b.addChest(doorC - 8, arenaFloor, 'armor');
  b.addChest(doorC - 12, arenaFloor, 'bow');
  b.put(doorC - 2, arenaFloor - 1, '|');

  b.fill(doorC, 0, doorC, arenaFloor - 3, 'Z');
  b.fill(doorC, arenaFloor - 2, doorC, arenaFloor, ':');

  b.fill(doorC + 1, arenaFloor - 10, W - 2, arenaFloor, '.');
  b.hline(doorC + 1, W - 2, arenaFloor + 1, 'A');
  b.fill(doorC + 1, arenaFloor + 2, W - 2, H - 2, 'S');

  b.hline(doorC, W - 2, arenaFloor - 11, 'Z');
  b.vline(W - 2, arenaFloor - 11, arenaFloor, 'Z');

  const bossC = doorC + 30;
  b.put(bossC, arenaFloor, '@');
  b.put(W - 6, arenaFloor, 'F');
  b.put(doorC + 5, arenaFloor, 'o');
  b.put(doorC + 10, arenaFloor, 'o');

  b.put(doorC + 2, arenaFloor - 2, '|');
  b.put(W - 4, arenaFloor - 2, '|');

  b.addDiamond(10, baseGround - 5, false);
  b.addDiamond(shaftC + 6, arenaFloor - 2, false);
  b.addDiamond(doorC + 20, arenaFloor - 2, false);

  return b.validate();
}

export function buildSkyBossLevel(world = 4) {
  const id = `w${world}-33`;
  const W = 140, H = 44;
  const b = new LevelBuilder(id, world, 'sky', W, H, 2, 'eisengolem');

  b.addBorders(false);

  const baseGround = 15;

  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'B');
    b.put(c, baseGround + 1, 'B');
    b.fill(c, baseGround + 2, c, H - 2, 'S');
  }

  b.vline(10, baseGround - 4, baseGround - 1, 'B');
  b.put(10, baseGround - 5, '=');
  b.vline(24, baseGround - 4, baseGround - 1, 'B');
  b.put(24, baseGround - 5, '=');

  b.put(4, baseGround - 1, 'P');
  b.put(6, baseGround - 1, 'o');
  b.put(8, baseGround - 1, 'o');

  const shaftC = 35;
  const arenaFloor = 28;
  b.fill(shaftC, baseGround, shaftC + 1, arenaFloor, '.');
  b.vline(shaftC, baseGround, arenaFloor, 'H');

  const doorC = 60;
  b.fill(shaftC, arenaFloor - 3, doorC, arenaFloor, '.');
  b.hline(shaftC, doorC, arenaFloor + 1, 'B');

  b.put(doorC - 4, arenaFloor, 'K');
  b.addChest(doorC - 8, arenaFloor, 'armor');
  b.addChest(doorC - 12, arenaFloor, 'bow');
  b.put(doorC - 2, arenaFloor - 1, '|');

  b.fill(doorC, 0, doorC, arenaFloor - 3, 'Z');
  b.fill(doorC, arenaFloor - 2, doorC, arenaFloor, ':');

  b.fill(doorC + 1, arenaFloor - 10, W - 2, arenaFloor, '.');
  b.hline(doorC + 1, W - 2, arenaFloor + 1, 'B');
  b.fill(doorC + 1, arenaFloor + 2, W - 2, H - 2, 'S');

  b.hline(doorC, W - 2, arenaFloor - 11, 'Z');
  b.vline(W - 2, arenaFloor - 11, arenaFloor, 'Z');

  const bossC = doorC + 30;
  b.put(bossC, arenaFloor, '@');
  b.put(W - 6, arenaFloor, 'F');
  b.put(doorC + 5, arenaFloor, 'o');
  b.put(doorC + 10, arenaFloor, 'o');

  b.put(doorC + 2, arenaFloor - 2, '|');
  b.put(W - 4, arenaFloor - 2, '|');
  b.put(doorC + 18, arenaFloor - 9, 'U');

  b.addDiamond(10, baseGround - 5, false);
  b.addDiamond(shaftC + 6, arenaFloor - 2, false);
  b.addDiamond(doorC + 20, arenaFloor - 2, false);

  return b.validate();
}

// -------------------------------------------------------------
// AUSFÜHRUNG & GENERIERUNG ALLER 165 LEVEL
// -------------------------------------------------------------

const GROUND = [
  { world: 1, theme: 'overworld', from: 4, to: 32, label: 'Oberwelt' },
  { world: 2, theme: 'depths', from: 4, to: 32, label: 'Tiefen' },
  { world: 3, theme: 'paradise', from: 1, to: 32, label: 'Paradies' },
  { world: 4, theme: 'sky', from: 1, to: 32, label: 'Himmelsfestung' },
  { world: 5, theme: 'nether', from: 4, to: 18, label: 'Nether' },
];

const writeLevel = (def, nr, world, note) => {
  const filePath = join(LEVELS_DIR, `w${world}-${nr}.js`);
  writeFileSync(filePath, `// Level w${world}-${nr} (Welt ${world}, ${note}). Automatisch generiert (gen/build-all-levels.mjs).\nexport default ${JSON.stringify(def, null, 2)};\n`, 'utf8');
};

export function generateAllLevels() {
  console.log('--- Mario Craft Level-Generator ---');
  for (const gw of GROUND) {
    const used = new Set();
    for (let nr = gw.from; nr <= gw.to; nr++) writeLevel(buildGroundLevel(gw.theme, nr, used), nr, gw.world, gw.theme);
    console.log(`Welt ${gw.world} (${gw.label}) w${gw.world}-${gw.from}..w${gw.world}-${gw.to}`);
  }
  {
    const used = new Set();
    for (let nr = 19; nr <= 32; nr++) writeLevel(buildEndLevel(nr, 5, used), nr, 5, 'end');
    console.log('Welt 5 (Leere) w5-19..w5-32');
  }
  writeLevel(buildParadiseBossLevel(3), 33, 3, 'Boss „Schildkröten-Bucht“');
  writeLevel(buildSkyBossLevel(4), 33, 4, 'Boss „Golem-Zitadelle“');

  // Index
  let imports = '';
  let arr = 'export const LEVELS = [\n';
  for (let w = 1; w <= 5; w++) {
    for (let nr = 1; nr <= 33; nr++) {
      imports += `import w${w}_${nr} from './w${w}-${nr}.js';\n`;
      arr += `  w${w}_${nr},\n`;
    }
  }
  writeFileSync(join(LEVELS_DIR, 'index.js'), imports + '\n' + arr + '];\n', 'utf8');
  console.log('Neu gewürfelt:', JSON.stringify(failLog));
  console.log('--- fertig: 165 Level erzeugt und validiert ---');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAllLevels();
}

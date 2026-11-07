// Regierungsviertel der Hauptstadt (PRD §9 „Isometrische Ansicht“, Daniels Wunsch): Unter und um jede Hauptstadt sind die
// Stadtzellen gesperrt (CITY.fobMargin, dort erscheinen neue Einheiten); die Fläche lag bisher leer da. Jetzt füllt sie ein kleines
// Regierungsviertel um das Regierungsgebäude (cityhall.js): Rasen mit Hecke, vier Prachtstraßen mit Laternen und Bannern in
// Teamfarbe, Zufahrt mit Wache, Schranke, Fahnen und Obelisk, ein klassisches und ein modernes Ministerium, Park mit Brunnen und
// Bänken, Parkplatz mit Dienstwagen.
// - Boden (Rasen, Wege, Platz mit Rand in Teamfarbe, Parkplätze): ein Bild in Weltkoordinaten über genau den gesperrten Zellen,
//   in 2D und Iso gleich (Iso legt es wie die Vorkommen in citylayer.js mit drei Ecken aufs Gelände, passt also zu jeder Drehung).
// - Teile mit Höhe stehen nur im inneren Quadrat (Fußabdruck ±48 + Rand 64 = ±112), weil ein Mauerring der Festung die äußeren
//   Streifen belegen kann. Iso: acht Gruppen um die Mitte (Ecken und Seiten), jede ein eigenes Bild je Drehung und mit eigener
//   Tiefe, damit Einheiten im Viertel richtig davor oder dahinter stehen. Steht in einer Gruppe ein anderes Gebäude (Bunker,
//   Turm …), entfällt sie. 2D: alle Teile in einem Bild.
// - Die Anlage ist für Team 1 um 180° gedreht (die Karte ist punktsymmetrisch): Zufahrt und Parkplatz liegen für beide Teams auf
//   derselben Seite ihrer Stadt.
// Alle Bilder über spritecache.js je Maßstab; unter Zoom 0,42 ohne Fenster, Laternen und Bänke. Nur Darstellung, keine Spielregeln:
// Wege, Auswahl und Trefferprüfung bleiben beim Fußabdruck der Hauptstadt.
import { CITY } from '../data/city.js';
import { ROT } from './camera.js';
import { sprite, blit, spriteDpr } from './spritecache.js';
import { setRoofSnow, roofSnowOn } from './season.js';
import {
  G, poly, box, lit, FACE, DETAIL, snowy, pyramid, flat, shadow, plinth, ledge, wallBand, wins, door, hip, parapet, tree, car, lamp,
  flagpole, acUnit, cyl, stroke, circle, rectF, rectS, polyF, shadowTop, hipTop, flatTop, carTop, lineT, LEAF, LEAF_SNOW, k3, DECK, HEDGE,
} from './isokit.js';

const TILE = 32;
export const FOOT = 48; // halber Fußabdruck der Hauptstadt (3 × 3 Kacheln)
export const INNER = 112; // inneres Quadrat: Fußabdruck + CITY.fobMargin; nur hier stehen Teile mit Höhe
const AV = 9; // halbe Breite der Prachtstraßen

// Farben
const SAND = '#e8dcbf'; // klassisches Ministerium
const RED = '#ad5a40'; // Ziegeldach
const STONE = '#f4efe3';
const MOD = '#eceae4'; // modernes Ministerium
const MGLASS = '#4a7898';
const GUARD = '#dcd6c8';
const GOLD = '#e2b444';
const OFFICIAL = ['#23272c', '#e8e6e0', '#1f2c42', '#a9b0b6', '#23272c', '#3a3f45', '#e8e6e0']; // Dienstwagen: schwarz, weiß, dunkelblau, silber
const FLOWERS = ['#e0525a', '#f2c94c', '#f08ac0', '#ffffff', '#9b6ad6'];

/** Hauptstadt mit Regierungsviertel? (erste FOB, fertig, lebt) */
export const isCapital = (b) => !!b && b.alive && b.main && b.built && b.type === 'fob';

/**
 * Fläche des Viertels in Weltpixeln ab der Mitte der Hauptstadt: genau die Stadtzellen, die nearMain (js/game/city/cells.js) unter und
 * um die Hauptstadt sperrt (Zellen CITY.cell, die das Rechteck Fußabdruck + CITY.fobMargin schneiden). { x0, x1, y0, y1 }
 */
export function quarterRect(b) {
  const S = CITY.cell;
  const m = CITY.fobMargin;
  const X0 = Math.floor((b.cx * TILE - m) / S) * S;
  const X1 = Math.ceil(((b.cx + b.w) * TILE + m) / S) * S;
  const Y0 = Math.floor((b.cy * TILE - m) / S) * S;
  const Y1 = Math.ceil(((b.cy + b.h) * TILE + m) / S) * S;
  return { x0: X0 - b.x, x1: X1 - b.x, y0: Y0 - b.y, y1: Y1 - b.y };
}

/** Drehung der Anlage: Team 1 um 180° (Index in ROT wie camera.js). */
const turnOf = (b) => (b.team === 1 ? 2 : 0);
const tv = (r, x, y) => {
  const m = ROT[r];
  return [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
};
function tRect(r, x0, x1, y0, y1) {
  const [a, b] = tv(r, x0, y0);
  const [c, d] = tv(r, x1, y1);
  return [Math.min(a, c), Math.max(a, c), Math.min(b, d), Math.max(b, d)];
}
/** Achse 'x'/'y' der Anlage → 'u'/'v' im Bild (bei 90°/270° vertauscht). */
const tAxis = (r, ax) => ((r % 2 === 1) === (ax === 'x') ? 'v' : 'u');

/** Ausdehnung in Anlage-Koordinaten (Team 1 gedreht): { W, E, N, S } ab der Mitte, je mindestens INNER. */
function extOf(b) {
  const q = quarterRect(b);
  const t = turnOf(b);
  const [x0, x1, y0, y1] = tRect(t, q.x0, q.x1, q.y0, q.y1);
  return { W: -x0, E: x1, N: -y0, S: y1 };
}

// ---------- Plan (Anlage-Koordinaten wie Team 0: x nach Osten, y nach Süden; Zufahrt von Nordosten) ----------

/** Teile mit Höhe: { k, x, y } bzw. Rechteck { k, x0, x1, y0, y1 }; Zusätze je Art. Alles innerhalb ±INNER. */
function plan() {
  const P = [];
  const at = (k, x, y, o = {}) => P.push({ k, x, y, ...o });
  const rect = (k, x0, x1, y0, y1, o = {}) => P.push({ k, x0, x1, y0, y1, x: (x0 + x1) / 2, y: (y0 + y1) / 2, ...o });
  // Ministerien: klassisch im Nordwesten, modern im Südosten
  rect('minA', -104, -60, -100, -64);
  rect('minB', 60, 104, 64, 100);
  // Zufahrt im Nordosten (die Diagonale von der Ecke zum Platz): Obelisk im Rondell, Wache mit Schilderhaus und Schranke, Fahnen
  at('obelisk', 80, -80);
  rect('guard', 86, 106, -72, -56);
  rect('booth', 103, 109, -96, -90);
  at('barrier', 106, -93, { x2: 92, y2: -107 });
  for (const t of [0, 1, 2]) at('flag', 54 + t * 12, -78 - t * 12);
  // Park mit Brunnen im Südwesten
  at('fountain', -80, 80);
  for (const [x, y, ax] of [[-80, 58, 'x'], [-80, 102, 'x'], [-58, 80, 'y'], [-102, 80, 'y']]) at('bench', x, y, { ax });
  for (const [x, y, t] of [[-104, 56, 0], [-56, 104, 1], [-104, 104, 2], [-58, 58, 1]]) at('tree', x, y, { s: 0.95, t });
  // Parkplatz mit Dienstwagen im Süden (beiderseits der Straße)
  let n = 0;
  for (const side of [-1, 1]) {
    for (const y of [67, 97]) {
      for (const x of [17.5, 25.5, 33.5, 41.5]) {
        if (side > 0 && y === 97 && x === 41.5) continue; // eine Lücke
        at('car', side * x, y, { ax: 'y', c: OFFICIAL[n++ % OFFICIAL.length] });
      }
    }
  }
  // Alleen: Bäume in den Seitenstreifen (nicht im Süden: Parkplatz)
  for (const [x, y, t] of [
    [-28, -70, 0], [28, -70, 1], [-28, -100, 2], [28, -100, 0],
    [-70, -28, 1], [-70, 28, 2], [-100, -28, 0], [-100, 28, 1],
    [70, -28, 2], [70, 28, 0], [100, -28, 1], [100, 28, 2],
  ]) at('tree', x, y, { s: 0.9, t });
  // Laternen mit Bannern in Teamfarbe an allen vier Straßen
  for (const d of [62, 94]) {
    for (const s of [-1, 1]) {
      at('lamp', s * 12.5, -d);
      at('lamp', s * 12.5, d);
      at('lamp', -d, s * 12.5);
      at('lamp', d, s * 12.5);
    }
  }
  return P;
}
const PLAN = plan();

// ---------- Boden (Weltbild, in Anlage-Koordinaten gemalt) ----------

function groundColors(season) {
  const winter = season === 'winter';
  const autumn = season === 'autumn';
  return {
    winter,
    lawn: winter ? '#e4e9ec' : autumn ? '#8fa656' : '#7cab55',
    lawn2: winter ? '#dde3e7' : autumn ? '#98ad5d' : '#86b45d',
    hedge: winter ? '#c9d4cf' : HEDGE,
    curb: winter ? '#d9dcdc' : '#cfc8b8',
    path: winter ? '#d6d8d8' : '#dcd2bb',
    pathEdge: winter ? 'rgba(120,130,140,0.35)' : 'rgba(120,100,70,0.35)',
    plaza: winter ? '#dfe2e3' : '#ddd5c4',
    joint: winter ? 'rgba(120,130,140,0.25)' : 'rgba(110,95,70,0.22)',
    asph: winter ? '#9a9fa2' : '#80847f',
    mark: winter ? 'rgba(255,255,255,0.5)' : 'rgba(245,245,240,0.8)',
    bed: winter ? '#c7cbcb' : '#6d5a43',
    water: winter ? '#b8d3e0' : '#5aa6c9',
  };
}

/** Linie (Weltkoordinaten, ohne Pfadbeginn). */
function seg(c, x0, y0, x1, y1) {
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
}

/** Boden in Anlage-Koordinaten: ext = { W, E, N, S }. fine = Feinheiten (Fugen, Markierungen, Blumen). */
function paintGround(c, ext, color, season, fine) {
  const { W, E, N, S } = ext;
  const C = groundColors(season);
  // Rasen mit Mähstreifen
  rectF(c, -W, -N, E, S, C.lawn);
  if (fine && !C.winter) for (let x = -W; x < E; x += 16) rectF(c, x, -N, x + 8, S, C.lawn2);
  // Rand: Bordstein und Hecke (Lücken an den Straßen und an der Zufahrt)
  rectF(c, -W, -N, E, -N + 2, C.curb);
  rectF(c, -W, S - 2, E, S, C.curb);
  rectF(c, -W, -N, -W + 2, S, C.curb);
  rectF(c, E - 2, -N, E, S, C.curb);
  c.fillStyle = C.hedge;
  for (const [x0, y0, x1, y1] of [
    [-W + 2, -N + 2, -AV - 3, -N + 5], [AV + 3, -N + 2, E - 30, -N + 5], // Norden (Zufahrt an der Ostecke)
    [-W + 2, S - 5, -AV - 3, S - 2], [AV + 3, S - 5, E - 2, S - 2],
    [-W + 2, -N + 2, -W + 5, -AV - 3], [-W + 2, AV + 3, -W + 5, S - 2],
    [E - 5, -N + 30, E - 2, -AV - 3], [E - 5, AV + 3, E - 2, S - 2],
  ]) c.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Wege im Park und zu den Ministerien
  c.fillStyle = C.path;
  for (const [x0, y0, x1, y1] of [
    [-84, AV, -76, 62], [-62, 76, -AV, 84], // Park
    [-84, -62, -76, -AV], [-62, -84, -AV, -76], // Ministerium Nordwest
    [76, AV, 84, 62], [62, 76, AV + 4, 84], // Ministerium Südost
  ]) c.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Brunnenplatz mit Blumenring
  c.beginPath();
  c.arc(-80, 80, 21, 0, Math.PI * 2);
  c.fill();
  if (fine) {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (Math.abs(Math.sin(a * 2)) < 0.25) continue; // Lücken für die Wege
      circle(c, -80 + Math.cos(a) * 24, 80 + Math.sin(a) * 24, 1.6, C.winter ? C.bed : FLOWERS[i % FLOWERS.length]);
    }
  }
  // Vorplätze der Ministerien
  rectF(c, -108, -60, -56, -54, C.path);
  rectF(c, -60, -104, -54, -56, C.path);
  rectF(c, 56, 54, 108, 60, C.path);
  rectF(c, 54, 56, 60, 108, C.path);
  // Prachtstraßen
  c.fillStyle = C.path;
  c.fillRect(-AV, -N, AV * 2, N - FOOT);
  c.fillRect(-AV, FOOT, AV * 2, S - FOOT);
  c.fillRect(-W, -AV, W - FOOT, AV * 2);
  c.fillRect(FOOT, -AV, E - FOOT, AV * 2);
  // Zufahrt: Diagonale von der Nordostecke zum Platz, Rondell um den Obelisk, Hof vor der Wache
  const D = 8.5 * Math.SQRT2;
  polyF(c, [[E - D, -N], [E, -N], [E, -N + D], [FOOT + D, -FOOT], [FOOT, -FOOT], [FOOT, -FOOT - D]], C.path);
  c.fillStyle = C.path;
  c.beginPath();
  c.arc(80, -80, 17, 0, Math.PI * 2);
  c.fill();
  rectF(c, 82, -76, 110, -52, C.path);
  circle(c, 80, -80, 8.5, C.lawn);
  // Parkplätze (Asphalt mit Markierung)
  for (const s of [-1, 1]) {
    const [x0, x1] = s < 0 ? [-46, -13] : [13, 46];
    rectF(c, x0, 58, x1, 106, C.asph);
    rectF(c, s < 0 ? -13 : AV, 75, s < 0 ? -AV : 13, 85, C.asph); // Einfahrt von der Straße
    if (!fine) continue;
    c.strokeStyle = C.mark;
    c.lineWidth = 0.6;
    c.beginPath();
    for (let k = 0; k <= 4; k++) {
      const x = s * (13.5 + k * 8); // Trennstriche zwischen den Stellplätzen beider Reihen
      seg(c, x, 61, x, 73);
      seg(c, x, 91, x, 103);
    }
    c.stroke();
  }
  // Blumenbeete am Platz
  if (fine) {
    for (const [x0, y0, x1, y1] of [
      [-40, -56, -15, -51], [15, -56, 40, -51], [-40, 51, -15, 56], [15, 51, 40, 56],
      [-56, -40, -51, -15], [-56, 15, -51, 40], [51, -40, 56, -15], [51, 15, 56, 40],
    ]) {
      rectF(c, x0, y0, x1, y1, C.bed);
      if (C.winter) continue;
      const along = x1 - x0 > y1 - y0;
      const len = along ? x1 - x0 : y1 - y0;
      for (let i = 0; i < len / 2.6; i++) {
        const a = (along ? x0 : y0) + 1.3 + i * 2.6;
        circle(c, along ? a : (x0 + x1) / 2, along ? (y0 + y1) / 2 : a, 1.2, FLOWERS[(i + Math.round(x0 + y0)) % FLOWERS.length]);
      }
    }
  }
  // Kanten der Wege
  if (fine) {
    c.strokeStyle = C.pathEdge;
    c.lineWidth = 0.5;
    c.beginPath();
    for (const s of [-1, 1]) {
      seg(c, s * AV, -N, s * AV, -FOOT);
      seg(c, s * AV, FOOT, s * AV, S);
      seg(c, -W, s * AV, -FOOT, s * AV);
      seg(c, FOOT, s * AV, E, s * AV);
    }
    c.stroke();
  }
  // Platz um das Regierungsgebäude: Steinplatten, Rand in Teamfarbe
  rectF(c, -FOOT, -FOOT, FOOT, FOOT, C.plaza);
  if (fine) {
    c.strokeStyle = C.joint;
    c.lineWidth = 0.5;
    c.beginPath();
    for (let a = -FOOT + 8; a < FOOT; a += 8) {
      seg(c, a, -FOOT, a, FOOT);
      seg(c, -FOOT, a, FOOT, a);
    }
    c.stroke();
  }
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.strokeRect(-FOOT + 1.5, -FOOT + 1.5, FOOT * 2 - 3, FOOT * 2 - 3);
}

/** Boden des Viertels zeichnen. 2D: Kontext in Weltkoordinaten. Iso: dpr gesetzt, das Bild wird mit drei Ecken aufs Gelände gelegt. */
export function drawQuarterGround(ctx, cam, b, color, season = 'summer', dpr = 1, iso = false) {
  const q = quarterRect(b);
  const ext = extOf(b);
  const t = turnOf(b);
  const key = `gqg|${t}|${ext.W},${ext.E},${ext.N},${ext.S}|${color}|${season}`;
  const paint = (c, s) => {
    c.scale(s, s);
    if (t) c.rotate(Math.PI);
    paintGround(c, ext, color, season, s >= 0.6);
  };
  const e = sprite(key, cam.zoom * spriteDpr(), [q.x0, q.y0, q.x1, q.y1], paint);
  if (e === false) return;
  ctx.save();
  if (iso) {
    // wie drawDeposits (citylayer.js): drei Ecken mit Gelände bestimmen die Lage, passt zu jeder Drehung
    const A = cam.worldToScreen(b.x + q.x0, b.y + q.y0);
    const B = cam.worldToScreen(b.x + q.x1, b.y + q.y0);
    const C = cam.worldToScreen(b.x + q.x0, b.y + q.y1);
    const w = q.x1 - q.x0;
    const h = q.y1 - q.y0;
    ctx.setTransform((dpr * (B.x - A.x)) / w, (dpr * (B.y - A.y)) / w, (dpr * (C.x - A.x)) / h, (dpr * (C.y - A.y)) / h, dpr * A.x, dpr * A.y);
    ctx.translate(-q.x0, -q.y0);
  } else ctx.translate(b.x, b.y);
  if (e) blit(ctx, e, 0, 0, 1);
  else paint(ctx, 1); // ohne Canvas (Tests): direkt
  ctx.restore();
}

// ---------- Gruppen (Iso) ----------

/** Gruppe 0 … 8 eines Punkts der Welt (Spalte und Zeile an ±FOOT geteilt), 4 = Mitte (Regierungsgebäude). */
const groupAt = (x, y) => (x < -FOOT ? 0 : x > FOOT ? 2 : 1) + 3 * (y < -FOOT ? 0 : y > FOOT ? 2 : 1);
/** Rechteck einer Gruppe in der Welt (ab der Mitte), auf das innere Quadrat begrenzt. */
function groupRect(gi) {
  const lim = [[-INNER, -FOOT], [-FOOT, FOOT], [FOOT, INNER]];
  const [x0, x1] = lim[gi % 3];
  const [y0, y1] = lim[(gi / 3) | 0];
  return { x0, x1, y0, y1 };
}

/** Teile je Gruppe für Team-Drehung t (Welt-Koordinaten ab der Mitte): Liste von 9 Listen. */
const GROUPS = [0, 1, 2, 3].map((t) => {
  const out = Array.from({ length: 9 }, () => []);
  for (const p of PLAN) {
    const [x, y] = tv(t, p.x, p.y);
    out[groupAt(x, y)].push(p);
  }
  return out;
});

/** Belegt ein anderes Gebäude Kacheln der Gruppe gi (Raster grid.struct)? Dann entfällt die Gruppe. */
function blockedGroup(grid, b, gi) {
  if (!grid?.struct) return false;
  const r = groupRect(gi);
  const c0 = Math.floor((b.x + r.x0) / TILE);
  const c1 = Math.ceil((b.x + r.x1) / TILE) - 1;
  const r0 = Math.floor((b.y + r.y0) / TILE);
  const r1 = Math.ceil((b.y + r.y1) / TILE) - 1;
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (!grid.inBounds(col, row)) continue;
      const id = grid.struct[grid.idx(col, row)];
      if (id && id !== b.id) return true;
    }
  }
  return false;
}

/** Bitmaske der Gruppen, die gezeichnet werden (Bit gi gesetzt = frei). */
export function quarterMask(grid, b) {
  let m = 0;
  for (let gi = 0; gi < 9; gi++) if (gi !== 4 && GROUPS[turnOf(b)][gi].length && !blockedGroup(grid, b, gi)) m |= 1 << gi;
  return m;
}

/** Iso: die Gruppen der Hauptstadt b als Objekte für die Tiefensortierung { x, y, b, gi } (x, y = Mitte der Gruppe in der Welt). */
export function quarterItems(grid, b) {
  const out = [];
  const m = quarterMask(grid, b);
  for (let gi = 0; gi < 9; gi++) {
    if (!(m & (1 << gi))) continue;
    const r = groupRect(gi);
    out.push({ x: b.x + (r.x0 + r.x1) / 2, y: b.y + (r.y0 + r.y1) / 2, b, gi });
  }
  return out;
}

// ---------- Teile (isometrisch, Bildkoordinaten u, v ab dem Ankerpunkt der Gruppe) ----------

/** Klassisches Ministerium: Sandstein, zwei Geschosse mit Sprossenfenstern, Gesims, Walmdach, Eingang mit Säulen. */
function minAIso(g, [u0, u1, v0, v1], color) {
  const H = 20;
  shadow(g, u0, u1, v0, v1, H + 8);
  box(g, u0, u1, v0, v1, 0, H, SAND);
  plinth(g, u0, u1, v0, v1, SAND, 2.2);
  if (g.z >= DETAIL) {
    for (const [face, plane, a0, a1] of [['s', v1, u0, u1], ['e', u1, v0, v1]]) {
      const n = Math.max(3, Math.round((a1 - a0) / 6.4)) | 1;
      const mid = (n - 1) / 2;
      wins(g, face, plane, a0 + 2, a1 - 2, n, [[4, 8.6], [11.6, 16.4]], 2.5, { cross: true, frame: STONE, seed: n * 7, lit: 0.15, skip: (i, r) => r === 0 && i === mid });
      door(g, face, plane, (a0 + a1) / 2, 3.6, 7, '#4f3b2b');
    }
    ledge(g, u0, u1, v0, v1, 10.2, 'rgba(255,255,255,0.45)', 0.9);
  }
  box(g, u0 - 0.8, u1 + 0.8, v0 - 0.8, v1 + 0.8, H, H + 1.4, STONE);
  hip(g, u0, u1, v0, v1, H + 1.4, 9, RED, () => {
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    flagpole(g, um, vm, H + 8, 13, color);
  });
}

/** Modernes Ministerium: weißer Bau mit Fensterbändern, Glasfoyer, Band in Teamfarbe, Flachdach mit Technik. */
function minBIso(g, [u0, u1, v0, v1], color) {
  const H = 25;
  shadow(g, u0, u1, v0, v1, H + 4);
  box(g, u0, u1, v0, v1, 0, H, MOD, DECK);
  const { P } = g;
  for (const [face, plane, a0, a1] of [['s', v1, u0, u1], ['e', u1, v0, v1]]) {
    const q = (b0, b1, h0, h1, col) => poly(g, face === 's' ? [P(b0, plane, h0), P(b1, plane, h0), P(b1, plane, h1), P(b0, plane, h1)] : [P(plane, b0, h0), P(plane, b1, h0), P(plane, b1, h1), P(plane, b0, h1)], col, null);
    const glass = lit(MGLASS, ...FACE[face]);
    q(a0 + (a1 - a0) * 0.3, a1 - (a1 - a0) * 0.3, 0, 5.5, lit('#2c4256', ...FACE[face])); // Glasfoyer
    for (const h of [8, 13.5, 19]) q(a0 + 1.8, a1 - 1.8, h, h + 3.4, glass); // Fensterbänder
    if (g.fine) {
      const pt = face === 's' ? (a, h) => P(a, plane, h) : (a, h) => P(plane, a, h);
      for (let a = a0 + 4; a < a1 - 2; a += 3.6) stroke(g, [pt(a, 8), pt(a, 22.4)], 'rgba(235,240,242,0.55)', 0.45);
    }
  }
  wallBand(g, u0, u1, v0, v1, H - 2.6, H, color);
  parapet(g, u0, u1, v0, v1, H, MOD, DECK);
  if (g.z >= DETAIL) {
    acUnit(g, u0 + 9, v0 + 9, H - 1.3, 2.6);
    acUnit(g, u1 - 10, v0 + 12, H - 1.3, 2.2);
    box(g, u1 - 14, u1 - 6, v1 - 12, v1 - 5, H - 1.3, H + 4, '#cfd2d0'); // Treppenhaus
  }
}

/** Wache: flacher Bau mit Band in Teamfarbe, Fenstern und Tür. */
function guardIso(g, [u0, u1, v0, v1], color) {
  const H = 9;
  shadow(g, u0, u1, v0, v1, H);
  box(g, u0, u1, v0, v1, 0, H, GUARD, DECK);
  if (g.z >= DETAIL) {
    for (const [face, plane, a0, a1] of [['s', v1, u0, u1], ['e', u1, v0, v1]]) {
      wins(g, face, plane, a0 + 1.5, a1 - 1.5, Math.max(2, Math.round((a1 - a0) / 6)), [[3.2, 6.4]], 2.8, { frame: false, lit: 0.4, seed: 3 });
    }
  }
  wallBand(g, u0, u1, v0, v1, H - 1.8, H, color);
  parapet(g, u0, u1, v0, v1, H + 0.6, GUARD, DECK, 0.8);
}

/** Schilderhaus: kleines Häuschen mit Spitzdach, rot-weiß. */
function boothIso(g, [u0, u1, v0, v1], color) {
  shadow(g, u0, u1, v0, v1, 9);
  box(g, u0, u1, v0, v1, 0, 7.5, '#f1efe8');
  wallBand(g, u0, u1, v0, v1, 2.5, 4, color);
  pyramid(g, (u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) / 2 + 0.6, 7.5, 3, '#5c6670');
}

/** Schranke: Pfosten und rot-weiß gestreifter Arm. */
function barrierIso(g, u, v, u2, v2) {
  const { P, ctx, z } = g;
  box(g, u - 1, u + 1, v - 1, v + 1, 0, 4.2, '#d9d6cc');
  const h = 3.6;
  const n = 6;
  ctx.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const a = P(u + ((u2 - u) * i) / n, v + ((v2 - v) * i) / n, h);
    const b = P(u + ((u2 - u) * (i + 1)) / n, v + ((v2 - v) * (i + 1)) / n, h);
    ctx.strokeStyle = i % 2 ? '#f4f2ec' : '#d33a2c';
    ctx.lineWidth = Math.max(0.8, 1.2 * z);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.lineCap = 'round';
}

/** Obelisk auf gestuftem Sockel mit goldener Spitze. */
function obeliskIso(g, u, v) {
  const { P } = g;
  const s = 'rgba(0,0,0,0.2)';
  flat(g, u - 4, u + 4, v - 4, v + 13, s); // Schatten
  box(g, u - 5, u + 5, v - 5, v + 5, 0, 1.6, STONE);
  box(g, u - 3.6, u + 3.6, v - 3.6, v + 3.6, 1.6, 5, '#e9e3d4');
  const w0 = 2.3;
  const w1 = 1.5;
  const h0 = 5;
  const h1 = 27;
  const col = '#ece6d6';
  poly(g, [P(u - w0, v + w0, h0), P(u + w0, v + w0, h0), P(u + w1, v + w1, h1), P(u - w1, v + w1, h1)], lit(col, ...FACE.s));
  poly(g, [P(u + w0, v - w0, h0), P(u + w0, v + w0, h0), P(u + w1, v + w1, h1), P(u + w1, v - w1, h1)], lit(col, ...FACE.e));
  pyramid(g, u, v, w1, h1, 3.6, GOLD);
}

/** Fahnenmast mit Sockel und Fahne in Teamfarbe. */
function flagIso(g, u, v, color) {
  box(g, u - 1.2, u + 1.2, v - 1.2, v + 1.2, 0, 1.2, STONE);
  flagpole(g, u, v, 1.2, 22, color);
}

/** Springbrunnen: runde Steinschale, Wasser, Mittelschale mit Fontäne. */
function fountainIso(g, u, v, winter) {
  const { P, ctx, z } = g;
  cyl(g, u, v, 12.5, 0, 2.6, STONE, false);
  const [cx, cy] = P(u, v, 2.4);
  const R = 11.3 * z;
  const water = ctx.createLinearGradient(cx - R, cy - R / 2, cx + R, cy + R / 2);
  water.addColorStop(0, winter ? '#e6f0f5' : '#8fd0ea');
  water.addColorStop(1, winter ? '#a9c3d0' : '#3b86ad');
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = water;
  ctx.fill();
  cyl(g, u, v, 2.2, 1.2, 6, STONE);
  cyl(g, u, v, 4.6, 6, 7.2, STONE);
  if (winter) return;
  // Fontäne: Strahl nach oben und Bögen in die Schale
  const [tx, ty] = P(u, v, 13.5);
  const [bx, by] = P(u, v, 7.2);
  ctx.strokeStyle = 'rgba(235,248,255,0.85)';
  ctx.lineWidth = Math.max(0.8, 1.4 * z);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.strokeStyle = 'rgba(225,245,255,0.7)';
  ctx.beginPath();
  for (const [du, dv] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7]]) {
    const [ex, ey] = P(u + du * 8, v + dv * 8, 2.6);
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + (ex - tx) * 0.6, ty - 3 * z, ex, ey);
  }
  ctx.stroke();
}

/** Parkbank entlang der Achse ('u'/'v'). */
function benchIso(g, u, v, ax) {
  const [hu, hv] = ax === 'u' ? [3, 0.9] : [0.9, 3];
  box(g, u - hu, u + hu, v - hv, v + hv, 0.9, 1.8, '#8a6a46', '#9c7a52');
}

/** Laterne mit Banner in Teamfarbe. */
function lampIso(g, u, v, color) {
  const { P, ctx, z } = g;
  lamp(g, u, v, 13);
  const [x, y] = P(u, v, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x + 0.5 * z, y, 2.6 * z, 6.4 * z);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 2.3 * z, y, 0.8 * z, 6.4 * z);
}

/** Ein Teil im Bild zeichnen: p = Plan-Eintrag, r = Drehung Anlage → Bild, (au, av) = Anker der Gruppe im Bild. */
function partIso(g, p, r, au, av, color, winter) {
  const pt = (x, y) => {
    const [u, v] = tv(r, x, y);
    return [u - au, v - av];
  };
  const rc = () => {
    const [u0, u1, v0, v1] = tRect(r, p.x0, p.x1, p.y0, p.y1);
    return [u0 - au, u1 - au, v0 - av, v1 - av];
  };
  const [u, v] = pt(p.x, p.y);
  switch (p.k) {
    case 'minA': return minAIso(g, rc(), color);
    case 'minB': return minBIso(g, rc(), color);
    case 'guard': return guardIso(g, rc(), color);
    case 'booth': return boothIso(g, rc(), color);
    case 'barrier': {
      const [u2, v2] = pt(p.x2, p.y2);
      return barrierIso(g, u, v, u2, v2);
    }
    case 'obelisk': return obeliskIso(g, u, v);
    case 'flag': return flagIso(g, u, v, color);
    case 'fountain': return fountainIso(g, u, v, winter);
    case 'bench': return g.z >= DETAIL && benchIso(g, u, v, tAxis(r, p.ax));
    case 'tree': return tree(g, u, v, p.s, p.t);
    case 'car': return car(g, u, v, tAxis(r, p.ax), p.c);
    case 'lamp': return g.z >= DETAIL && lampIso(g, u, v, color);
  }
}

/** Tiefe eines Teils im Bild (Mitte). */
function depthOf(p, r) {
  const [u, v] = tv(r, p.x, p.y);
  return u + v;
}

// Höchster Punkt der Teile einer Gruppe (Weltpixel): Fahnen 23, Bäume 23, Ministerium mit Dach und Fahne 43
const TALL = 46;

/** Iso: eine Gruppe des Viertels (Objekt aus quarterItems) als Bild aus dem Zwischenspeicher. */
export function drawQuarterIso(ctx, cam, o, color, season = 'summer') {
  const { b, gi } = o;
  const t = turnOf(b);
  const r = (cam.rot + t) % 4; // Anlage → Bild: erst die Drehung der Anlage (Team), dann die der Kamera
  const rect = groupRect(gi);
  const [au, av] = tv(cam.rot, (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
  const winter = season === 'winter';
  const parts = GROUPS[t][gi];
  if (!parts.length) return;
  const K = Math.SQRT1_2;
  // Bildgrenzen: Ecken des Gruppenrechtecks im Bild, dazu Höhe und Schatten
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1]]) {
    const [u, v] = tv(cam.rot, x, y);
    const sx = (u - au - (v - av)) * K;
    const sy = (u - au + (v - av)) * K * 0.5;
    x0 = Math.min(x0, sx);
    x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy);
    y1 = Math.max(y1, sy);
  }
  const bounds = [x0 - 14, y0 - TALL - 6, x1 + 16, y1 + 12];
  const key = `gqi|${gi}|${r}|${t}|${color}|${winter ? 1 : 0}`;
  const paint = (c, s) => {
    const was = roofSnowOn();
    setRoofSnow(winter);
    const g = G(c, s);
    const order = parts.slice().sort((a, bb) => depthOf(a, r) - depthOf(bb, r));
    for (const p of order) partIso(g, p, r, au, av, color, winter);
    setRoofSnow(was);
  };
  const p = cam.worldToScreen(o.x, o.y);
  const dpr = spriteDpr();
  const e = sprite(key, cam.zoom * dpr, bounds, paint);
  if (e === false) return;
  if (e) {
    blit(ctx, e, p.x, p.y, cam.zoom);
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1 / dpr, 1 / dpr);
  paint(ctx, cam.zoom * dpr);
  ctx.restore();
}

// ---------- 2D von oben (Weltkoordinaten ab der Mitte, Schatten nach rechts unten) ----------

function treeTop2(c, x, y, r, t, winter) {
  circle(c, x + r * 0.5, y + r * 0.5, r, 'rgba(0,0,0,0.25)');
  const L = winter ? LEAF_SNOW : LEAF[k3(t)];
  const grad = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, L[0]);
  grad.addColorStop(0.6, L[1]);
  grad.addColorStop(1, L[2]);
  circle(c, x, y, r, grad);
}

function partTop(c, p, r, color, winter, fine) {
  const pt = (x, y) => tv(r, x, y);
  const rc = () => tRect(r, p.x0, p.x1, p.y0, p.y1);
  const [x, y] = pt(p.x, p.y);
  switch (p.k) {
    case 'minA': {
      const [x0, x1, y0, y1] = rc();
      shadowTop(c, x0, y0, x1, y1, 30);
      hipTop(c, x0, y0, x1, y1, snowy(RED));
      rectF(c, (x0 + x1) / 2 - 0.6, (y0 + y1) / 2 - 7, (x0 + x1) / 2 + 6, (y0 + y1) / 2 - 3, color); // Fahne
      return;
    }
    case 'minB': {
      const [x0, x1, y0, y1] = rc();
      shadowTop(c, x0, y0, x1, y1, 30);
      flatTop(c, x0, y0, x1, y1, MOD, snowy(DECK));
      c.strokeStyle = color;
      c.lineWidth = 1.4;
      c.strokeRect(x0 + 0.7, y0 + 0.7, x1 - x0 - 1.4, y1 - y0 - 1.4);
      if (fine) {
        rectS(c, x0 + 6, y0 + 6, x0 + 12, y0 + 10, '#c4c8cb');
        rectS(c, x1 - 13, y1 - 12, x1 - 5, y1 - 5, '#cfd2d0');
      }
      return;
    }
    case 'guard': {
      const [x0, x1, y0, y1] = rc();
      shadowTop(c, x0, y0, x1, y1, 10);
      flatTop(c, x0, y0, x1, y1, GUARD, snowy(DECK));
      c.strokeStyle = color;
      c.lineWidth = 1;
      c.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      return;
    }
    case 'booth': {
      const [x0, x1, y0, y1] = rc();
      shadowTop(c, x0, y0, x1, y1, 10);
      rectS(c, x0, y0, x1, y1, snowy('#5c6670'));
      return;
    }
    case 'barrier': {
      const [x2, y2] = pt(p.x2, p.y2);
      lineT(c, [[x + 1, y + 1], [x2 + 1, y2 + 1]], 'rgba(0,0,0,0.25)', 1);
      lineT(c, [[x, y], [x2, y2]], '#d33a2c', 1.1);
      circle(c, x, y, 1.3, '#d9d6cc');
      return;
    }
    case 'obelisk':
      lineT(c, [[x, y], [x + 16, y + 16]], 'rgba(0,0,0,0.28)', 3);
      rectS(c, x - 4, y - 4, x + 4, y + 4, STONE);
      rectS(c, x - 2.3, y - 2.3, x + 2.3, y + 2.3, '#e9e3d4');
      circle(c, x, y, 1.2, GOLD);
      return;
    case 'flag':
      lineT(c, [[x, y], [x + 7, y + 7]], 'rgba(0,0,0,0.25)', 0.8);
      rectS(c, x, y - 4.5, x + 7, y - 0.5, color, 'rgba(0,0,0,0.35)', 0.4);
      circle(c, x, y, 1.1, '#6a6d6c');
      return;
    case 'fountain': {
      circle(c, x, y, 12.5, STONE);
      const R = 11;
      const gr = c.createRadialGradient(x - 3, y - 3, 1, x, y, R);
      gr.addColorStop(0, winter ? '#eef5f8' : '#8fd0ea');
      gr.addColorStop(1, winter ? '#b3c9d3' : '#3b86ad');
      circle(c, x, y, R, gr);
      circle(c, x, y, 4.4, STONE);
      if (!winter) circle(c, x, y, 2.2, 'rgba(240,250,255,0.9)');
      return;
    }
    case 'bench': {
      if (!fine) return;
      const [hx, hy] = (r % 2 === 1) === (p.ax === 'x') ? [0.9, 3] : [3, 0.9];
      rectS(c, x - hx, y - hy, x + hx, y + hy, '#8a6a46', 'rgba(0,0,0,0.4)', 0.3);
      return;
    }
    case 'tree':
      return treeTop2(c, x, y, 8.5 * p.s, p.t, winter);
    case 'car':
      return carTop(c, x, y, (r % 2 === 1) === (p.ax === 'x') ? 'v' : 'u', p.c);
    case 'lamp':
      if (!fine) return;
      circle(c, x + 1.5, y + 1.5, 1.1, 'rgba(0,0,0,0.25)');
      rectF(c, x - 1.2, y - 3.2, x + 1.2, y + 0.4, color);
      circle(c, x, y, 1, '#3e4246');
      return;
  }
}

/** 2D: alle Teile des Viertels (ohne Boden und ohne das Regierungsgebäude) in einem Bild. Kontext in Weltkoordinaten. */
export function drawQuarterTop(ctx, grid, b, color, zoom = 1, season = 'summer') {
  const t = turnOf(b);
  const mask = quarterMask(grid, b);
  const winter = season === 'winter';
  const key = `gqt|${t}|${mask}|${color}|${winter ? 1 : 0}`;
  const paint = (c, s) => {
    c.scale(s, s);
    const fine = s >= DETAIL;
    const parts = [];
    for (let gi = 0; gi < 9; gi++) if (mask & (1 << gi)) parts.push(...GROUPS[t][gi]);
    // Schatten liegen unten: erst Autos, Bänke, Laternen, dann Bäume und Bauten (größere Schatten über kleinen Teilen)
    const rank = { car: 0, bench: 0, lamp: 1, flag: 1, barrier: 1, fountain: 0, obelisk: 2, booth: 2, guard: 3, minA: 3, minB: 3, tree: 4 };
    parts.sort((a, bb) => rank[a.k] - rank[bb.k]);
    for (const p of parts) partTop(c, p, t, color, winter, fine);
  };
  const e = sprite(key, zoom * spriteDpr(), [-INNER - 4, -INNER - 4, INNER + 22, INNER + 22], paint);
  if (e === false) return;
  if (e) {
    blit(ctx, e, b.x, b.y, 1);
    return;
  }
  ctx.save();
  ctx.translate(b.x, b.y);
  paint(ctx, 1);
  ctx.restore();
}

/** Für Tests: Plan, Gruppen und Hilfen. */
export const _quarter = { PLAN, GROUPS, groupAt, groupRect, tv, tRect, tAxis, extOf, turnOf };

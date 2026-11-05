// Brücken über die Flüsse (game/river.js): von oben (2D) und isometrisch mit Pfeilern, Fahrbahn und Geländer. Zerstört bleiben
// die Brückenköpfe stehen, Trümmer liegen im Wasser; beim Wiederaufbau wächst ein Holzgerüst von beiden Ufern zur Mitte.
// Seit v5.31 schöner: Pfeiler aus zwei runden Stützen mit Querträger und Gischt am Fuß, Überbau mit hellem Gesims über dem
// dunkleren Träger, Fahrbahn wie die Stadtstraßen (Asphalt und Gehwegplatten als Muster, Bordstein, Rinne), Fugen über den
// Pfeilern, Stahlgeländer mit zwei Holmen, Laternen; zerstört ragen Bewehrungseisen aus den Bruchkanten.
import { BALANCE } from '../data/balance.js';
import { RELIEF } from '../game/relief.js';
import { makeRng } from '../core/rng.js';
import { drawRotBox } from './iso.js';
import { hpColor } from './sprites.js';
import { ROAD } from './citylayer.js';
import { groundPattern, patternMatrix } from './ways.js';
import { frustum, band } from './isokit.js';

const DECK = BALANCE.river.deck;
const HALF = DECK / 2;
const SLAB = 6; // Stärke der Fahrbahnplatte (Höheneinheiten = Bildschirm-px bei Zoom 1)
const RAIL_H = 6; // Geländerhöhe
const STUB = 18; // so weit ragt ein zerstörter Brückenkopf übers Wasser
// Fahrbahn wie eine Stadtstraße (seit v5.03): eine Stadtzelle breit, Gehweg an beiden Seiten, gestrichelte Mittellinie im selben
// Takt wie die Straßenzellen (Striche bei 10–22 und 42–54 je 64 px ab dem Brückenende, das auf einer Zellkante liegt)
const LANE = 32; // halbe Fahrbahnbreite (eine halbe Stadtzelle)
const DASHES = (u0, u1) => {
  const out = [];
  for (let a = Math.floor(u0 / 32) * 32; a < u1; a += 32) {
    const s0 = Math.max(u0, a + 10);
    const s1 = Math.min(u1, a + 22);
    if (s1 > s0) out.push([s0, s1]);
  }
  return out;
};
const COL = {
  concrete: '#8f8a7f',
  cornice: '#b4afa4',
  girder: '#77726a',
  edge: '#6b665c',
  road: '#56554f',
  curb: '#cbc8be',
  gutter: 'rgba(18,18,16,0.3)',
  joint: 'rgba(20,20,18,0.55)',
  rail: '#c4c9cc',
  railMid: '#9aa0a4',
  post: '#4a4d50',
  pier: '#8a8479',
  stump: '#5e5a52',
  timber: '#8b6a40',
  rebar: '#4a3a30',
  lampPole: '#3d4144',
  lampHead: '#2c2f31',
  lampGlow: '#fff4cf',
  debris: ['#5a564e', '#6e695f', '#48443e'],
};
const KERB_W = 1.7; // Bordstein (hell, im Gehweg)
const GUTTER_W = 1.4; // Rinne (dunkel, auf der Fahrbahn)

/** Laternen je Brücke: Lage entlang u und Seite, ein Drittel und zwei Drittel der Länge auf wechselnden Seiten. */
const lamps = (b) => [[b.len * 0.3, -1], [b.len * 0.5, 1], [b.len * 0.7, -1]];

/** Muster der Fahrbahn (Asphalt, Gehwegplatten) oder einfache Farbe; mat legt das Muster auf die Fahrbahnebene. */
function deckFill(ctx, kind, season, mat) {
  const pat = mat ? groundPattern(ctx, kind, season) : null;
  if (pat) {
    if (pat.setTransform) pat.setTransform(mat);
    return pat;
  }
  return kind === 'asphalt' ? ROAD.asphalt : ROAD.walk;
}

/** Pfeiler gleichmäßig über der Wasserstrecke (je ca. 90 px einer). */
function piers(b) {
  const [w0, w1] = b.span;
  const n = Math.max(1, Math.round((w1 - w0) / 90));
  const out = [];
  for (let i = 1; i <= n; i++) out.push(w0 + ((w1 - w0) * i) / (n + 1));
  return out;
}

/** Trümmer im Wasser (fest je Brücke): Lage entlang u, quer v, Größe, Drehung, Farbe. */
const debrisCache = new WeakMap();
function debris(b) {
  let list = debrisCache.get(b);
  if (!list) {
    const rng = makeRng(((b.x * 92821) ^ (b.y * 68917)) >>> 0);
    const [w0, w1] = b.span;
    list = [];
    for (let i = 0; i < 9; i++) {
      list.push({
        u: w0 + STUB + rng.next() * Math.max(10, w1 - w0 - 2 * STUB),
        v: (rng.next() - 0.5) * DECK * 1.3,
        s: 10 + rng.next() * 16,
        a: rng.next() * Math.PI,
        c: COL.debris[i % COL.debris.length],
      });
    }
    debrisCache.set(b, list);
  }
  return list;
}

/** Fortschritt des Wiederaufbaus 0–1 (0 ohne Auftrag). */
const progressOf = (b) => (b.broken && b.rebuild ? Math.min(1, b.rebuild.progress) : 0);

// ---- 2D (von oben) ---------------------------------------------------------------------------

function deckRect(ctx, u0, u1, season = 'summer', joints = [], lampList = []) {
  ctx.fillStyle = COL.concrete;
  ctx.fillRect(u0, -HALF, u1 - u0, DECK);
  ctx.fillStyle = COL.cornice; // Gesims an den Rändern
  ctx.fillRect(u0, -HALF, u1 - u0, 2);
  ctx.fillRect(u0, HALF - 2, u1 - u0, 2);
  const mat = patternMatrix(null);
  ctx.fillStyle = deckFill(ctx, 'asphalt', season, mat);
  ctx.fillRect(u0, -LANE, u1 - u0, LANE * 2);
  ctx.fillStyle = deckFill(ctx, 'pavers', season, mat); // Gehwege
  ctx.fillRect(u0, -LANE, u1 - u0, ROAD.kerb);
  ctx.fillRect(u0, LANE - ROAD.kerb, u1 - u0, ROAD.kerb);
  ctx.fillStyle = COL.curb; // Bordstein
  ctx.fillRect(u0, -LANE + ROAD.kerb - KERB_W, u1 - u0, KERB_W);
  ctx.fillRect(u0, LANE - ROAD.kerb, u1 - u0, KERB_W);
  ctx.fillStyle = season === 'winter' ? 'rgba(238,242,245,0.95)' : COL.gutter; // Rinne bzw. Schneewall
  const gw = season === 'winter' ? 3.2 : GUTTER_W;
  ctx.fillRect(u0, -LANE + ROAD.kerb, u1 - u0, gw);
  ctx.fillRect(u0, LANE - ROAD.kerb - gw, u1 - u0, gw);
  ctx.fillStyle = ROAD.mark; // Mittellinie
  for (const [a, b] of DASHES(u0, u1)) ctx.fillRect(a, -ROAD.line / 2, b - a, ROAD.line);
  ctx.fillStyle = COL.joint; // Fugen über den Pfeilern
  for (const u of joints) if (u > u0 + 1 && u < u1 - 1) ctx.fillRect(u - 0.6, -LANE, 1.2, LANE * 2);
  // Geländer: Pfosten und zwei Holme
  ctx.fillStyle = COL.post;
  for (let u = u0 + 4; u < u1 - 2; u += 9) for (const s of [-1, 1]) ctx.fillRect(u - 1, s * (HALF - 1.5) - 1, 2, 2);
  ctx.strokeStyle = COL.rail;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(u0, s * (HALF - 1.5));
    ctx.lineTo(u1, s * (HALF - 1.5));
  }
  ctx.stroke();
  // Laternen: Mast am Rand, Leuchte über dem Gehweg
  for (const [u, s] of lampList) {
    if (u < u0 + 2 || u > u1 - 2) continue;
    ctx.strokeStyle = COL.lampPole;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(u, s * (HALF - 2.5));
    ctx.lineTo(u, s * (LANE - 2));
    ctx.stroke();
    ctx.fillStyle = COL.lampHead;
    ctx.fillRect(u - 2.2, s * (LANE - 2) - 1.4, 4.4, 2.8);
    ctx.fillStyle = COL.lampGlow;
    ctx.fillRect(u - 1.4, s * (LANE - 2) - 0.7, 2.8, 1.4);
  }
}
/** Bruchkante eines Brückenkopfs (Zacken) bei u, Richtung dir (+1 = Kopf links, Kante rechts). */
function brokenEdge(ctx, u, dir) {
  ctx.fillStyle = COL.concrete;
  ctx.beginPath();
  ctx.moveTo(u, -HALF);
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const v = -HALF + (DECK * i) / n;
    ctx.lineTo(u + dir * (i % 2 ? 9 : 2), v);
  }
  ctx.lineTo(u, HALF);
  ctx.closePath();
  ctx.fill();
}

/** Brücke von oben; Weltkoordinaten (Transformation der Kamera gesetzt). */
export function drawBridgeTop(ctx, b, season = 'summer') {
  const L = b.len;
  const [w0, w1] = b.span;
  ctx.save();
  // Schatten aufs Wasser (nach rechts unten wie bei Gebäuden), nur über der Wasserstrecke und nur, wo die Platte steht
  const ax = Math.cos(b.angle);
  const ay = Math.sin(b.angle);
  const at = (u, v) => [b.x1 + u * ax - v * ay, b.y1 + u * ay + v * ax];
  const shadow = (u0, u1) => {
    if (u1 <= u0) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    for (const [u, v] of [[u0, -HALF], [u1, -HALF], [u1, HALF], [u0, HALF]]) {
      const [x, y] = at(u, v);
      ctx.lineTo(x + 7, y + 9);
    }
    ctx.closePath();
    ctx.fill();
  };
  const p = progressOf(b);
  const gap = w1 - w0 - 2 * STUB;
  if (!b.broken) shadow(w0, w1);
  else if (p > 0) {
    shadow(w0 + STUB, w0 + STUB + (gap * p) / 2);
    shadow(w1 - STUB - (gap * p) / 2, w1 - STUB);
  }
  ctx.translate(b.x1, b.y1);
  ctx.rotate(b.angle);
  // Pfeiler: Querträger mit runden Enden ragen seitlich unter der Platte hervor (zerstört: Stützenstümpfe im Wasser)
  const lampList = lamps(b);
  const joints = piers(b);
  for (const u of joints) {
    if (b.broken) {
      for (const s of [-1, 1]) {
        ctx.fillStyle = COL.stump;
        ctx.beginPath();
        ctx.arc(u, s * HALF * 0.55, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    ctx.fillStyle = COL.pier;
    ctx.beginPath();
    ctx.moveTo(u - 6, -HALF - 3);
    ctx.arc(u, -HALF - 3, 6, Math.PI, 0);
    ctx.lineTo(u + 6, HALF + 3);
    ctx.arc(u, HALF + 3, 6, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  if (!b.broken) {
    deckRect(ctx, 0, L, season, joints, lampList);
    // Widerlager an den Enden
    ctx.fillStyle = COL.edge;
    ctx.fillRect(0, -HALF, 5, DECK);
    ctx.fillRect(L - 5, -HALF, 5, DECK);
    // Treffer: dunkle Brandflecken, je mehr Schaden, desto mehr
    const dmg = 1 - b.hp / b.maxHp;
    if (dmg > 0.05) {
      const rng = makeRng(Math.abs(b.id) * 7919);
      ctx.fillStyle = 'rgba(25,20,15,0.45)';
      for (let i = 0, n = Math.ceil(dmg * 8); i < n; i++) {
        ctx.beginPath();
        ctx.arc(w0 + rng.next() * (w1 - w0), (rng.next() - 0.5) * (DECK - 16), 5 + rng.next() * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    for (const d of debris(b)) {
      ctx.save();
      ctx.translate(d.u, d.v);
      ctx.rotate(d.a);
      ctx.fillStyle = d.c;
      ctx.fillRect(-d.s / 2, -d.s / 3, d.s, (d.s * 2) / 3);
      ctx.restore();
    }
    if (p > 0) {
      // Gerüst: zwei Längsbalken über die ganze Lücke, Querbohlen von beiden Seiten bis zum Fortschritt
      ctx.strokeStyle = COL.timber;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(w0 + STUB, s * HALF * 0.6);
        ctx.lineTo(w1 - STUB, s * HALF * 0.6);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = COL.timber;
      const reach = (gap * p) / 2;
      for (let u = 0; u <= reach; u += 9) {
        ctx.fillRect(w0 + STUB + u, -HALF + 6, 6, DECK - 12);
        ctx.fillRect(w1 - STUB - u - 6, -HALF + 6, 6, DECK - 12);
      }
      ctx.globalAlpha = 1;
    }
    deckRect(ctx, 0, w0 + STUB, season, [], lampList);
    deckRect(ctx, w1 - STUB, L, season, [], lampList);
    brokenEdge(ctx, w0 + STUB, 1);
    brokenEdge(ctx, w1 - STUB, -1);
    // Bewehrungseisen ragen aus den Bruchkanten
    ctx.strokeStyle = COL.rebar;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const [u, dir] of [[w0 + STUB, 1], [w1 - STUB, -1]]) {
      for (let i = 0; i < 7; i++) {
        const v = -HALF + 6 + ((DECK - 12) * i) / 6;
        ctx.moveTo(u + dir * 4, v);
        ctx.lineTo(u + dir * (9 + (i % 3) * 2), v + (i % 2 ? 1.5 : -1.5));
      }
    }
    ctx.stroke();
    ctx.fillStyle = COL.edge;
    ctx.fillRect(0, -HALF, 5, DECK);
    ctx.fillRect(L - 5, -HALF, 5, DECK);
  }
  ctx.restore();
}

// ---- Isometrisch ---------------------------------------------------------------------------

const CAP_H = 4; // Querträger auf den Stützen
const COL_R = 4.6; // Halbmesser einer runden Stütze
const LAMP_H = 17; // Laternenmast über der Fahrbahn
const POST_GAP = 10; // Abstand der Geländerpfosten

/**
 * Brücke isometrisch. Mit Gelände (cam.relief) stehen die Pfeiler im Wasser und die Fahrbahn liegt auf b.deckH, ohne Gelände
 * liegt sie knapp über dem flachen Boden. Transformation: beliebig (die Funktion setzt sie selbst, dpr). season wählt die Muster
 * der Fahrbahn (Asphalt, Gehwegplatten wie die Stadtstraßen) und im Winter Schneewälle statt der Rinne.
 */
export function drawBridgeIso(ctx, cam, dpr, b, season = 'summer') {
  const water = cam.relief ? RELIEF.water : 0;
  const top = cam.relief ? b.deckH : 10; // Oberkante der Fahrbahn
  const lift = top - water; // über dem Wasser
  const z = cam.zoom;
  const ax = Math.cos(b.angle);
  const ay = Math.sin(b.angle);
  const at = (u, v) => ({ x: b.x1 + u * ax - v * ay, y: b.y1 + u * ay + v * ax });
  const scr = (u, v, h) => {
    const q = at(u, v);
    const s = cam.worldToScreen(q.x, q.y);
    return { x: s.x, y: s.y - h * z };
  };
  const g = { ctx, z, P: (u, v, h = 0) => { const q = scr(u, v, h); return [q.x, q.y]; } }; // für frustum/band (isokit)
  const [w0, w1] = b.span;
  const L = b.len;
  const p = progressOf(b);
  const gap = w1 - w0 - 2 * STUB;
  const fine = z >= 0.45;
  cam.pin(water);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Schatten aufs Wasser (wie bei Gebäuden nach links unten versetzt)
  const shadow = (u0, u1) => {
    if (u1 <= u0) return;
    const s = lift * 0.35 * z;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    for (const [u, v] of [[u0, -HALF], [u1, -HALF], [u1, HALF], [u0, HALF]]) {
      const q = scr(u, v, 0);
      ctx.lineTo(q.x - s, q.y + s * 0.5);
    }
    ctx.closePath();
    ctx.fill();
  };
  if (!b.broken) shadow(w0, w1);
  else if (p > 0) {
    shadow(w0 + STUB, w0 + STUB + (gap * p) / 2);
    shadow(w1 - STUB - (gap * p) / 2, w1 - STUB);
  }
  // Pfeiler, hinten zuerst: je zwei runde Stützen mit nassem Fuß und Gischt, darauf der Querträger (zerstört: Stümpfe)
  const near = scr(L / 2, HALF, 0).y > scr(L / 2, -HALF, 0).y ? 1 : -1; // die dem Betrachter zugewandte Seite (v-Vorzeichen)
  const colTop = Math.max(0, lift - SLAB - CAP_H);
  const pierList = piers(b);
  const order = pierList.map((u, i) => ({ u, i, y: scr(u, 0, 0).y })).sort((a, c) => a.y - c.y);
  for (const { u, i } of order) {
    for (const s of [-near, near]) {
      const v = s * HALF * 0.55;
      const h = b.broken ? Math.min(colTop, 5 + ((i * 7 + (s > 0 ? 3 : 0)) % 6)) : colTop;
      foam(ctx, scr(u, v, 0), z);
      if (h < 1) continue;
      frustum(g, u, v, COL_R, COL_R, 0, h, b.broken ? COL.stump : COL.pier, b.broken);
      band(g, u, v, COL_R, 0, Math.min(h, 2.4), '#5f6058'); // nasser Fuß
      if (b.broken && fine) rebarUp(ctx, scr(u, v, h), z, i + (s > 0 ? 5 : 0));
    }
    if (b.broken) continue;
    const c = at(u, 0);
    drawRotBox(ctx, cam, c.x, c.y, 10, DECK + 6, b.angle, Math.min(CAP_H, lift - SLAB), COL.pier, { base: colTop, noShadow: true, wallS: '#77716a', wallE: '#625d56' });
  }
  // Widerlager an beiden Enden: Betonwand vom Ufer bis unter die Fahrbahn, damit die Brücke nicht über dem Hang schwebt
  if (cam.relief) {
    for (const [u, dir] of [[0, 1], [L, -1]]) {
      const c = at(u + dir * 5, 0);
      const ground = cam.relief.displayAt(c.x, c.y) - water - 4; // etwas eingegraben
      const h = lift - SLAB - ground;
      if (h > 1) drawRotBox(ctx, cam, c.x, c.y, 10, DECK - 2, b.angle, h, COL.pier, { base: ground, noShadow: true, wallS: '#7d776e', wallE: '#67625a' });
    }
  }
  // Fahrbahnebene: Muster an der Welt ausgerichtet wie bei den Stadtstraßen (citylayer.js), nur um die Fahrbahnhöhe versetzt
  let mat = null;
  if (z >= 0.5 && typeof DOMMatrix !== 'undefined') {
    const o = cam.worldToScreenFlat(0, 0);
    const e1 = cam.worldToScreenFlat(1, 0);
    const e2 = cam.worldToScreenFlat(0, 1);
    const sc = patternMatrix(null).a; // Welteinheiten je Musterpixel
    mat = new DOMMatrix([(e1.x - o.x) * sc, (e1.y - o.y) * sc, (e2.x - o.x) * sc, (e2.y - o.y) * sc, o.x, o.y - top * z]);
  }
  const quad = (v0, v1, a, c) => {
    ctx.beginPath();
    for (const [u, v] of [[a, v0], [c, v0], [c, v1], [a, v1]]) {
      const q = scr(u, v, lift);
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.fill();
  };
  const line = (pts, color, w) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const [a, c] of pts) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
  };
  // Geländer einer Seite: Pfosten, Mittel- und Oberholm
  const railing = (u0, u1, s) => {
    const v = s * (HALF - 1.4);
    const posts = [];
    for (let u = u0 + 3; u <= u1 - 2; u += POST_GAP) posts.push([scr(u, v, lift), scr(u, v, lift + RAIL_H)]);
    line(posts, COL.post, Math.max(0.8, 1.1 * z));
    if (fine) line([[scr(u0, v, lift + RAIL_H * 0.5), scr(u1, v, lift + RAIL_H * 0.5)]], COL.railMid, Math.max(0.6, 0.8 * z));
    line([[scr(u0, v, lift + RAIL_H), scr(u1, v, lift + RAIL_H)]], COL.rail, Math.max(1, 1.5 * z));
  };
  // Laterne: Mast am Rand, Ausleger über den Gehweg, Leuchte mit hellem Glas
  const lamp = (u, s) => {
    const v0 = s * (HALF - 3.2);
    const v1 = s * (LANE - 3);
    const foot = scr(u, v0, lift);
    const head = scr(u, v0, lift + LAMP_H);
    const arm = scr(u, v1, lift + LAMP_H - 0.6);
    line([[foot, head], [head, arm]], COL.lampPole, Math.max(0.9, 1.3 * z));
    const r = Math.max(1.2, 2.2 * z);
    ctx.fillStyle = COL.lampHead;
    ctx.beginPath();
    ctx.ellipse(arm.x, arm.y, r * 1.2, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.lampGlow;
    ctx.beginPath();
    ctx.ellipse(arm.x, arm.y + r * 0.35, r * 0.75, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const slab = (u0, u1, joints, alpha = 1) => {
    if (u1 - u0 < 2) return;
    const c = at((u0 + u1) / 2, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    // Überbau: dunklerer Träger, darauf das helle Gesims, das an beiden Seiten etwas übersteht
    drawRotBox(ctx, cam, c.x, c.y, u1 - u0, DECK - 6, b.angle, SLAB - 2, COL.girder, { base: lift - SLAB, noShadow: true, wallS: '#6a655d', wallE: '#56524b' });
    drawRotBox(ctx, cam, c.x, c.y, u1 - u0, DECK, b.angle, 2, COL.cornice, { base: lift - 2, roof: COL.concrete, noShadow: true, wallS: '#a39e93', wallE: '#8b867c' });
    // Fahrbahn wie eine Stadtstraße: Asphalt, Gehwege aus Platten, Bordstein, Rinne, Mittellinie, Fugen
    ctx.fillStyle = deckFill(ctx, 'asphalt', season, mat);
    quad(-LANE, LANE, u0, u1);
    ctx.fillStyle = deckFill(ctx, 'pavers', season, mat);
    quad(-LANE, -LANE + ROAD.kerb, u0, u1);
    quad(LANE - ROAD.kerb, LANE, u0, u1);
    if (fine) {
      ctx.fillStyle = COL.curb;
      quad(-LANE + ROAD.kerb - KERB_W, -LANE + ROAD.kerb, u0, u1);
      quad(LANE - ROAD.kerb, LANE - ROAD.kerb + KERB_W, u0, u1);
      const gw = season === 'winter' ? 3.2 : GUTTER_W;
      ctx.fillStyle = season === 'winter' ? 'rgba(238,242,245,0.95)' : COL.gutter;
      quad(-LANE + ROAD.kerb, -LANE + ROAD.kerb + gw, u0, u1);
      quad(LANE - ROAD.kerb - gw, LANE - ROAD.kerb, u0, u1);
    }
    ctx.fillStyle = ROAD.mark;
    for (const [a, e] of DASHES(u0, u1)) quad(-ROAD.line / 2, ROAD.line / 2, a, e);
    if (fine) {
      ctx.fillStyle = COL.joint;
      for (const u of joints) if (u > u0 + 1 && u < u1 - 1) quad(-LANE, LANE, u - 0.7, u + 0.7);
    }
    ctx.restore();
    railing(u0, u1, -near);
    for (const [u, s] of lamps(b)) if (u > u0 + 2 && u < u1 - 2) lamp(u, s);
    railing(u0, u1, near);
  };
  if (!b.broken) {
    slab(0, L, [2.5, ...pierList, L - 2.5]);
    // Treffer: dunkle Flecken auf der Fahrbahn
    const dmg = 1 - b.hp / b.maxHp;
    if (dmg > 0.05) {
      const rng = makeRng(Math.abs(b.id) * 7919);
      ctx.fillStyle = 'rgba(25,20,15,0.45)';
      for (let i = 0, n = Math.ceil(dmg * 8); i < n; i++) {
        const q = scr(w0 + rng.next() * (w1 - w0), (rng.next() - 0.5) * (DECK - 16), lift);
        const r = (5 + rng.next() * 7) * z;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    for (const d of debris(b)) {
      const c = at(d.u, d.v);
      drawRotBox(ctx, cam, c.x, c.y, d.s, (d.s * 2) / 3, b.angle + d.a, 4, d.c, { noShadow: true });
    }
    if (p > 0) {
      // Gerüst: Holzstützen vom Wasser bis unter die Fahrbahn, darauf Bohlen bis zum Fortschritt
      const reach = (gap * p) / 2;
      ctx.strokeStyle = COL.timber;
      ctx.lineWidth = Math.max(1, 2.4 * z);
      ctx.beginPath();
      for (let u = 0; u <= reach; u += 24) {
        for (const uu of [w0 + STUB + u, w1 - STUB - u]) {
          for (const s of [-1, 1]) {
            const q0 = scr(uu, s * HALF * 0.7, 0);
            const q1 = scr(uu, s * HALF * 0.7, lift - SLAB);
            ctx.moveTo(q0.x, q0.y);
            ctx.lineTo(q1.x, q1.y);
          }
        }
      }
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.9;
      for (const [u0, u1] of [[w0 + STUB, w0 + STUB + reach], [w1 - STUB - reach, w1 - STUB]]) {
        if (u1 - u0 < 2) continue;
        const c = at((u0 + u1) / 2, 0);
        drawRotBox(ctx, cam, c.x, c.y, u1 - u0, DECK - 12, b.angle, 3, COL.timber, { base: lift - 3, noShadow: true });
      }
      ctx.restore();
    }
    slab(0, w0 + STUB, [2.5]);
    slab(w1 - STUB, L, [L - 2.5]);
    // Bewehrungseisen ragen aus den Bruchkanten
    if (fine) {
      const bars = [];
      for (const [u, dir] of [[w0 + STUB, 1], [w1 - STUB, -1]]) {
        for (let i = 0; i < 7; i++) {
          const v = -HALF + 6 + ((DECK - 12) * i) / 6;
          const h = lift - SLAB * (i % 2 ? 0.35 : 0.7);
          bars.push([scr(u, v, h), scr(u + dir * (5 + (i % 3) * 2), v + (i % 2 ? 1.6 : -1.6), h - 1.5 - (i % 3))]);
        }
      }
      line(bars, COL.rebar, Math.max(0.7, 0.9 * z));
    }
  }
  cam.unpin();
}

/** Gischt am Fuß einer Stütze (Bildschirmpunkt auf dem Wasser): zwei helle Ringe. */
function foam(ctx, q, z) {
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = Math.max(0.8, 1.1 * z);
  ctx.beginPath();
  ctx.ellipse(q.x, q.y, (COL_R + 2) * z, (COL_R + 2) * z * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(q.x + 1.5 * z, q.y + 0.8 * z, (COL_R + 5) * z, (COL_R + 5) * z * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** Bewehrungseisen aus einem abgebrochenen Stützenstumpf (Bildschirmpunkt der Bruchkante). */
function rebarUp(ctx, q, z, seed) {
  ctx.strokeStyle = COL.rebar;
  ctx.lineWidth = Math.max(0.6, 0.8 * z);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const dx = (k - 1) * 2.2 * z;
    const lean = (((seed + k * 3) % 5) - 2) * 0.9 * z;
    ctx.moveTo(q.x + dx, q.y);
    ctx.lineTo(q.x + dx + lean, q.y - (3 + ((seed + k) % 3)) * z);
  }
  ctx.stroke();
}

// ---- Furten: Furtstangen am Rand des seichten Wassers ------------------------------------------

const POST_H = 16; // Höhe einer Furtstange über dem Wasser
const postCache = new WeakMap();

/** Furtstangen der Karte (fest je Karte): Punkte auf dem Rand jeder Furt, die im Wasser stehen. */
export function fordPosts(map, relief) {
  const key = (map.fords ?? []).map((f) => `${f.x},${f.y},${f.r}`).join(';'); // der Editor ändert Furten an Ort und Stelle
  let list = postCache.get(map);
  if (list && list.key === key && list.relief === relief) return list;
  list = [];
  list.key = key;
  list.relief = relief;
  for (const f of map.fords ?? []) {
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      const x = f.x + Math.cos(a) * f.r * 0.9;
      const y = f.y + Math.sin(a) * f.r * 0.9;
      if (!relief || relief.heightAt(x, y) < RELIEF.water) list.push({ x, y, k });
    }
  }
  postCache.set(map, list);
  return list;
}

/** Furtstange von oben (Weltkoordinaten): Kräuselring im Wasser, Schatten, Kopf rot-weiß geviertelt wie eine Bake. */
export function drawFordPostTop(ctx, p) {
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(p.x + 3, p.y + 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2efe6';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8402f';
  const a = (p.k % 4) * (Math.PI / 4);
  for (const o of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, 4, a + o, a + o + Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(30,25,20,0.8)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Furtstange isometrisch: nasser Holzpfahl aus dem Wasser, darüber rot-weiße Bänder und eine Kappe, im Wasser Spiegelung und
 * zwei Kräuselringe; Kamera auf die Wasserhöhe gepinnt, Transformation dpr.
 */
export function drawFordPostIso(ctx, cam, p) {
  const z = cam.zoom;
  const s = cam.worldToScreen(p.x, p.y);
  const w = Math.max(1.6, 3.2 * z);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(200,64,47,0.22)'; // Spiegelung der Bänder im Wasser
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y + 1 * z);
  ctx.lineTo(s.x, s.y + POST_H * 0.45 * z);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; // Kräuselung am Pfahl
  ctx.lineWidth = Math.max(0.8, 1.1 * z);
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 4.5 * z, 2.2 * z, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(s.x + 1 * z, s.y + 0.6 * z, 8 * z, 4 * z, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = w;
  const seg = (h0, h1, c) => {
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - h0 * z);
    ctx.lineTo(s.x, s.y - h1 * z);
    ctx.stroke();
  };
  seg(0, POST_H * 0.18, '#3e3122'); // nass
  seg(POST_H * 0.18, POST_H * 0.42, '#5b4630');
  seg(POST_H * 0.42, POST_H * 0.58, '#f2efe6');
  seg(POST_H * 0.58, POST_H * 0.74, '#c8402f');
  seg(POST_H * 0.74, POST_H * 0.9, '#f2efe6');
  seg(POST_H * 0.9, POST_H, '#c8402f');
  ctx.lineWidth = Math.max(0.5, 0.7 * z); // Licht von links
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.moveTo(s.x - w * 0.28, s.y - POST_H * 0.2 * z);
  ctx.lineTo(s.x - w * 0.28, s.y - POST_H * z);
  ctx.stroke();
  ctx.fillStyle = '#2f2a24'; // Kappe
  ctx.beginPath();
  ctx.ellipse(s.x, s.y - POST_H * z, w * 0.62, w * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Lebens- bzw. Baubalken über der Brückenmitte; (x, y) = Bildschirmpunkt (CSS-Pixel, Transformation dpr). */
export function drawBridgeBar(ctx, x, y, b) {
  const p = progressOf(b);
  const frac = b.broken ? p : b.hp / b.maxHp;
  const w = 44;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = b.broken ? '#c9a227' : hpColor(frac);
  ctx.fillRect(x - w / 2, y, w * frac, 4);
}

/** Zeigt die Brücke einen Balken? Beschädigt (intakt) oder im Wiederaufbau. */
export const bridgeBar = (b) => (!b.broken && b.hp < b.maxHp) || progressOf(b) > 0;

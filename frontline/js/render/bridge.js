// Brücken über die Flüsse (game/river.js): von oben (2D) und isometrisch mit Pfeilern, Fahrbahn und Geländer. Zerstört bleiben
// die Brückenköpfe stehen, Trümmer liegen im Wasser; beim Wiederaufbau wächst ein Holzgerüst von beiden Ufern zur Mitte.
import { BALANCE } from '../data/balance.js';
import { RELIEF } from '../game/relief.js';
import { makeRng } from '../core/rng.js';
import { drawRotBox } from './iso.js';
import { hpColor } from './sprites.js';

const DECK = BALANCE.river.deck;
const HALF = DECK / 2;
const SLAB = 6; // Stärke der Fahrbahnplatte (Höheneinheiten = Bildschirm-px bei Zoom 1)
const RAIL_H = 6; // Geländerhöhe
const STUB = 18; // so weit ragt ein zerstörter Brückenkopf übers Wasser
const COL = {
  concrete: '#8f8a7f',
  edge: '#6b665c',
  road: '#56554f',
  curb: '#b9b3a4',
  rail: '#d9d3c4',
  pier: '#77726a',
  stump: '#5e5a52',
  timber: '#8b6a40',
  debris: ['#5a564e', '#6e695f', '#48443e'],
};

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

function deckRect(ctx, u0, u1) {
  ctx.fillStyle = COL.concrete;
  ctx.fillRect(u0, -HALF, u1 - u0, DECK);
  ctx.fillStyle = COL.road;
  ctx.fillRect(u0, -HALF + 8, u1 - u0, DECK - 16);
  ctx.strokeStyle = COL.curb;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(u0, s * (HALF - 5));
    ctx.lineTo(u1, s * (HALF - 5));
  }
  ctx.stroke();
  // Geländer: Pfosten und Handlauf
  ctx.fillStyle = COL.rail;
  for (let u = u0 + 6; u < u1 - 3; u += 18) for (const s of [-1, 1]) ctx.fillRect(u - 1.5, s * (HALF - 1.5) - 1.5, 3, 3);
  ctx.strokeStyle = COL.rail;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(u0, s * (HALF - 1.5));
    ctx.lineTo(u1, s * (HALF - 1.5));
  }
  ctx.stroke();
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
export function drawBridgeTop(ctx, b) {
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
  // Pfeilerköpfe ragen seitlich unter der Platte hervor (zerstört: Stümpfe im Wasser)
  for (const u of piers(b)) {
    ctx.fillStyle = b.broken ? COL.stump : COL.pier;
    ctx.fillRect(u - 7, -HALF - 7, 14, DECK + 14);
  }
  if (!b.broken) {
    deckRect(ctx, 0, L);
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
    deckRect(ctx, 0, w0 + STUB);
    deckRect(ctx, w1 - STUB, L);
    brokenEdge(ctx, w0 + STUB, 1);
    brokenEdge(ctx, w1 - STUB, -1);
    ctx.fillStyle = COL.edge;
    ctx.fillRect(0, -HALF, 5, DECK);
    ctx.fillRect(L - 5, -HALF, 5, DECK);
  }
  ctx.restore();
}

// ---- Isometrisch ---------------------------------------------------------------------------

/**
 * Brücke isometrisch. Mit Gelände (cam.relief) stehen die Pfeiler im Wasser und die Fahrbahn liegt auf b.deckH, ohne Gelände
 * liegt sie knapp über dem flachen Boden. Transformation: beliebig (die Funktion setzt sie selbst, dpr).
 */
export function drawBridgeIso(ctx, cam, dpr, b) {
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
  const [w0, w1] = b.span;
  const L = b.len;
  const p = progressOf(b);
  const gap = w1 - w0 - 2 * STUB;
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
  // Pfeiler (zerstört: Stümpfe), dann die Platte darauf
  for (const u of piers(b)) {
    const c = at(u, 0);
    drawRotBox(ctx, cam, c.x, c.y, 14, DECK + 10, b.angle, b.broken ? 7 : Math.max(2, lift - SLAB), b.broken ? COL.stump : COL.pier, { noShadow: true });
  }
  const slab = (u0, u1, alpha = 1) => {
    if (u1 - u0 < 2) return;
    const c = at((u0 + u1) / 2, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    drawRotBox(ctx, cam, c.x, c.y, u1 - u0, DECK, b.angle, SLAB, COL.concrete, { base: lift - SLAB, roof: COL.road, noShadow: true, wallS: '#7a756b', wallE: '#625e55' });
    ctx.restore();
    // Bordsteine und Geländer auf der Platte
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const a0 = scr(u0, s * (HALF - 5), lift);
      const a1 = scr(u1, s * (HALF - 5), lift);
      ctx.strokeStyle = COL.curb;
      ctx.lineWidth = Math.max(1, 3 * z);
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(40,36,30,0.8)';
      ctx.lineWidth = Math.max(1, 1.6 * z);
      ctx.beginPath();
      for (let u = u0 + 4; u <= u1 - 2; u += 18) {
        const q0 = scr(u, s * (HALF - 1.5), lift);
        ctx.moveTo(q0.x, q0.y);
        ctx.lineTo(q0.x, q0.y - RAIL_H * z);
      }
      ctx.stroke();
      const r0 = scr(u0, s * (HALF - 1.5), lift + RAIL_H);
      const r1 = scr(u1, s * (HALF - 1.5), lift + RAIL_H);
      ctx.strokeStyle = COL.rail;
      ctx.lineWidth = Math.max(1, 1.8 * z);
      ctx.beginPath();
      ctx.moveTo(r0.x, r0.y);
      ctx.lineTo(r1.x, r1.y);
      ctx.stroke();
    }
  };
  if (!b.broken) {
    slab(0, L);
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
    slab(0, w0 + STUB);
    slab(w1 - STUB, L);
  }
  cam.unpin();
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

/** Furtstange von oben (Weltkoordinaten): rot-weißer Kopf mit Schatten. */
export function drawFordPostTop(ctx, p) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(p.x + 3, p.y + 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.k % 2 ? '#f2efe6' : '#c8402f';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,25,20,0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** Furtstange isometrisch: Pfahl aus dem Wasser, oben rot-weiß; Kamera auf die Wasserhöhe gepinnt, Transformation dpr. */
export function drawFordPostIso(ctx, cam, p) {
  const z = cam.zoom;
  const s = cam.worldToScreen(p.x, p.y);
  const w = Math.max(1.5, 3 * z);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; // Kräuselung am Pfahl
  ctx.lineWidth = Math.max(1, 1.2 * z);
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 5 * z, 2.5 * z, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = w;
  const seg = (h0, h1, c) => {
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - h0 * z);
    ctx.lineTo(s.x, s.y - h1 * z);
    ctx.stroke();
  };
  seg(0, POST_H * 0.45, '#5b4630');
  seg(POST_H * 0.45, POST_H * 0.72, '#f2efe6');
  seg(POST_H * 0.72, POST_H, '#c8402f');
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

// Werke und Kraftwerk als 2 × 2-Großbauten (Werke seit v5.08, alle neu gezeichnet seit v5.18, PRD §15). Jede Anlage hat je
// Ausbaustufe ein eigenes Bild, in 2D (von oben) und isometrisch (für jede Drehung der Karte dasselbe Bild, Daniel dreht nie):
//   Kraftwerk:     Kesselhaus, Maschinenhaus, Schornstein, Kühlturm mit Dampf, Kohlelager mit Förderbrücke, Umspannwerk
//   BM-Werk:       Ziegelei (Ringofen mit Ziegelschornstein, Trockenschuppen, Palettenlager) mit Holzlager und Sägeschuppen
//   Munitionswerk: Fertigungshalle mit Sheddach, Erdbunker, Kistenlager, Wache am Tor, Geschoss-Denkmal
//   Raffinerie:    Tanklager in der Auffangwanne, Destillationskolonnen, Rohrbrücken, Kugeltanks, Fackel, Verladestation
//   Stahlwerk:     Hochofen mit Winderhitzern und Schrägaufzug, Gießhalle mit Glut, Erz- und Kokshalden, Torpedowagen
//   Hütte:         gemauerter Hochofen mit offener Gicht, Gießhalle aus Bruchstein, Masselbett mit Glutrinnen, Erzhalden, Röstöfen
//   Kerosin-Raf.:  Kugel- und Rundtanks mit blauen Ringen, Kolonne, Pumpenhaus, Rohrbrücke, Drucktanks, Verladestation, Fackel
// Stufe 2 und 3 fügen Anlagen hinzu. Wie die 1 × 1-Stadtgebäude (townhouses.js) wird jedes Bild über spritecache.js einmal je
// Maßstab gemalt und danach nur kopiert. Örtliche Koordinaten ab der Mitte des Quadrats (±64, bemalt bis ±58), Bauteile aus
// isokit.js. Nur Zeichnen: liest b = { x, y, kind, level, color, damage }.
import {
  ASPH, CAR_COLORS, DECK, FACE, G, GLASS, OUTLINE, SILL, acTop, acUnit, ball, band, box, cap, car, carTop, circle, clampLv,
  coneRoof, conveyor, cyl, door, excavator, fan, flagpole, flame, flat, flatTop, frustum, gable, gableTop, heap, heapTop, hip,
  hipTop, lamp, latticeTop, lineT, lit, loader, logPile, logsTop, mast, onFace, parapet, planks, planksTop, plinth, poly,
  rails, railsTop, rectF, rectS, ribs, ring, rnd, seam, shade, shadow, shadowTop, shed, snowy, stroke, tint, tree, treeTop,
  vault, vaultTop, wallBand, wins, yellowTop,
} from './isokit.js';
import { sprite, blit, spriteDpr } from './spritecache.js';

export const WORKS_KINDS = ['bm', 'mun', 'fuel', 'steel', 'power', 'smelter', 'kero'];
/** Boden unter dem fertigen Werk (sichtbar am Rand des Grundstücks). */
export const WORKS_GROUND = { bm: '#b39a74', mun: '#8b9273', fuel: '#8f9398', steel: '#7a756f', power: '#b3afa4', smelter: '#6e6660', kero: '#a3aaaf' };

const E = 58; // bemalte Fläche ±E (Grundstücksrahmen ab ±61)
const CONCRETE = '#bab5a9';
const GRAVEL = '#a39d90';
const BRICK = '#a9523b';
const BRICKS = '#b9583d'; // Ziegel auf Paletten
const RAW = '#9c9a8c'; // ungebrannte Rohlinge
const STEEL = '#5b6570';
const RUST = '#7a4b37';
const TANK = '#e9ecef';
const PIPE = '#9aa1a8';
const GRASS = '#7f9a52';
const BRASS = '#d4a94a';
const OLIVE = '#5f6b3e';
const RED = '#c0392b';
const HOT = '#ffb347';
const COAL = '#2c2a27';

// ---------- Bauteile der Industrie (isometrisch) ----------

const ground = (g, color) => flat(g, -E, E, -E, E, color);
const grass = (g, u0, u1, v0, v1) => flat(g, u0, u1, v0, v1, snowy(GRASS));

/** Schatten eines runden Bauteils nach links unten (wie shadow() für Quader, nach +v verlängert). */
function shadowRound(g, u, v, r, h, a = 0.2) {
  const { P, ctx, z } = g;
  const L = Math.min(16, h * 0.28);
  ctx.beginPath();
  for (let k = 0; k <= 4; k++) {
    const [x, y] = P(u, v + (L * k) / 4, 0);
    ctx.moveTo(x + r * z, y);
    ctx.ellipse(x, y, r * z, (r * z) / 2, 0, 0, Math.PI * 2);
  }
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fill();
}

/** Rolltor mit Rahmen und Lamellen in einer Wand (Mitte a, Breite w, Höhe h). */
function gate(g, face, plane, a, w, h, col = '#8e979d') {
  const pt = onFace(g, face, plane);
  poly(g, [pt(a - w / 2 - 0.6, 0), pt(a + w / 2 + 0.6, 0), pt(a + w / 2 + 0.6, h + 0.6), pt(a - w / 2 - 0.6, h + 0.6)], lit('#4d5358', ...FACE[face]), null);
  poly(g, [pt(a - w / 2, 0), pt(a + w / 2, 0), pt(a + w / 2, h), pt(a - w / 2, h)], lit(col, ...FACE[face]), OUTLINE);
  if (g.fine) for (let k = 0.8; k < h - 0.2; k += 0.8) stroke(g, [pt(a - w / 2, k), pt(a + w / 2, k)], 'rgba(0,0,0,0.15)', 0.35);
}

/** Durchgehendes Fensterband mit Pfosten (a0…a1, Höhe h0…h1); glow = warm beleuchtet (Glut der Gießhalle). */
function strip(g, face, plane, a0, a1, h0, h1, step = 3, glow = false) {
  const pt = onFace(g, face, plane);
  poly(g, [pt(a0 - 0.4, h0 - 0.5), pt(a1 + 0.4, h0 - 0.5), pt(a1 + 0.4, h1 + 0.4), pt(a0 - 0.4, h1 + 0.4)], lit(SILL, ...FACE[face]), null);
  poly(g, [pt(a0, h0), pt(a1, h0), pt(a1, h1), pt(a0, h1)], glow ? (face === 's' ? '#f6a640' : '#e08a2c') : lit(GLASS, ...FACE[face]), null);
  if (!g.fine) return;
  for (let a = a0 + step; a < a1 - 0.4; a += step) stroke(g, [pt(a, h0), pt(a, h1)], 'rgba(220,224,228,0.55)', 0.45);
  if (!glow) poly(g, [pt(a0, h1), pt(a0 + (a1 - a0) * 0.25, h1), pt(a0, h0 + (h1 - h0) * 0.3)], 'rgba(255,255,255,0.12)', null);
}

/** Wände einer Halle mit Schatten und Sockel (o.ribs: Wellblech, o.band: Band unter der Traufe); Dach, Tore, Fenster danach. */
function walls(g, u0, u1, v0, v1, H, wall, o = {}) {
  shadow(g, u0, u1, v0, v1, H + (o.roofH ?? 0));
  box(g, u0, u1, v0, v1, 0, H, wall);
  plinth(g, u0, u1, v0, v1, wall);
  if (o.ribs) ribs(g, u0, u1, v0, v1, 1.8, H - 0.5, o.ribs);
  if (o.band) wallBand(g, u0, u1, v0, v1, H - 2.6, H - 1.3, o.band);
}

/** Flachdach mit Attika (nach walls bis H). */
const flatRoof = (g, u0, u1, v0, v1, H, wall, deck = DECK) => parapet(g, u0, u1, v0, v1, H, wall, deck);

/** Sheddach auf Höhe h: n Zähne entlang u, schräge Dachflächen, senkrechte Glasbänder nach +u, Giebeldreiecke vorn (v1). */
function sawRoof(g, u0, u1, v0, v1, h, n, rh, roof, wall) {
  const { P } = g;
  const R = snowy(roof);
  const w = (u1 - u0) / n;
  for (let k = 0; k < n; k++) {
    const a = u0 + k * w;
    const b = a + w;
    poly(g, [P(a, v0, h), P(b, v0, h + rh), P(b, v1, h + rh), P(a, v1, h)], lit(R, -rh, 0, w));
    poly(g, [P(b, v0, h), P(b, v0, h + rh), P(b, v1, h + rh), P(b, v1, h)], lit('#86a8c2', ...FACE.e), OUTLINE);
    if (g.fine) for (let t = v0 + 2.4; t < v1 - 0.5; t += 2.4) stroke(g, [P(b, t, h), P(b, t, h + rh)], 'rgba(40,50,60,0.45)', 0.35);
  }
  for (let k = 0; k < n; k++) {
    const a = u0 + k * w;
    poly(g, [P(a, v1, h), P(a + w, v1, h), P(a + w, v1, h + rh)], lit(wall, ...FACE.s), OUTLINE);
  }
}

/** Runder Schornstein (Kegelstumpf) mit rot-weißen Ringen, dunkler Krone und Flugwarnlicht. */
function stack(g, u, v, r0, r1, H, o = {}) {
  const col = o.color ?? '#d6d2c9';
  const rAt = (h) => r0 + ((r1 - r0) * h) / H;
  shadowRound(g, u, v, r0, H, 0.16);
  frustum(g, u, v, r0, r1, 0, H, col, false);
  if (g.fine) for (let h = 9; h < H - 6; h += 9) seam(g, u, v, rAt(h), h, 'rgba(60,60,70,0.16)');
  for (let k = 0; k < (o.bands ?? 0); k++) {
    const h1 = H - 2 - k * 10;
    band(g, u, v, rAt(h1 - 2.5) + 0.04, h1 - 5, h1, RED);
  }
  cyl(g, u, v, r1 + 0.5, H - 1.4, H, shade(col, 0.22), false);
  const { P, ctx, z } = g;
  const [x, y] = P(u, v, H);
  ctx.beginPath();
  ctx.ellipse(x, y, (r1 + 0.5) * z, ((r1 + 0.5) * z) / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(col, 0.3);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + 0.1 * z, r1 * 0.8 * z, r1 * 0.4 * z, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#262627';
  ctx.fill();
  if (o.light) circle(ctx, x, y - 1.4 * z, Math.max(0.9, 1.1 * z), '#ff4a3a');
}

/** Gemauerter Schornstein (quadratisch, verjüngt) mit Ziegelfugen, hellem Band und Kranz. */
function brickStack(g, u, v, s0, s1, H, col = BRICK) {
  const { P } = g;
  const sAt = (h) => s0 + ((s1 - s0) * h) / H;
  shadow(g, u - s0, u + s0, v - s0, v + s0, H, 0.16);
  poly(g, [P(u - s0, v + s0, 0), P(u + s0, v + s0, 0), P(u + s1, v + s1, H), P(u - s1, v + s1, H)], lit(col, ...FACE.s));
  poly(g, [P(u + s0, v + s0, 0), P(u + s0, v - s0, 0), P(u + s1, v - s1, H), P(u + s1, v + s1, H)], lit(col, ...FACE.e));
  if (g.fine) {
    for (let h = 2.4; h < H - 3; h += 2.4) {
      const s = sAt(h);
      stroke(g, [P(u - s, v + s, h), P(u + s, v + s, h), P(u + s, v - s, h)], 'rgba(60,20,10,0.2)', 0.4);
    }
  }
  const b = H - 9;
  const s = sAt(b);
  const t = sAt(b + 2);
  poly(g, [P(u - s, v + s, b), P(u + s, v + s, b), P(u + t, v + t, b + 2), P(u - t, v + t, b + 2)], lit('#e9e1cf', ...FACE.s), null);
  poly(g, [P(u + s, v + s, b), P(u + s, v - s, b), P(u + t, v - t, b + 2), P(u + t, v + t, b + 2)], lit('#e9e1cf', ...FACE.e), null);
  const c = s1 + 0.8;
  box(g, u - c, u + c, v - c, v + c, H - 2.2, H, tint(col, 0.05));
  poly(g, [P(u - s1 + 0.3, v - s1 + 0.3, H), P(u + s1 - 0.3, v - s1 + 0.3, H), P(u + s1 - 0.3, v + s1 - 0.3, H), P(u - s1 + 0.3, v + s1 - 0.3, H)], '#2a2622', null);
}

/** Dampffahne über (u, v, h): steigt auf, wird breiter und zieht nach links oben; unten grau, oben hell. */
function steam(g, u, v, h, s) {
  const { P, ctx, z } = g;
  const [x, y] = P(u, v, h);
  const puffs = [];
  for (let k = 0; k < 12; k++) {
    const t = k / 11;
    const r = (0.62 + t * 0.62) * (0.85 + rnd(k * 31 + 7) * 0.3);
    puffs.push([-t * 2.7 + (rnd(k * 17 + 3) - 0.5) * 0.8, 0.15 - t * 3 + (rnd(k * 11 + 5) - 0.5) * 0.45, r, 1 - t * 0.45]);
  }
  for (const light of [false, true]) {
    for (const [dx, dy, r, a] of puffs) {
      const R = r * s * z * (light ? 0.9 : 1);
      const cx = x + dx * s * z + (light ? -0.1 : 0.14) * R;
      const cy = y + dy * s * z + (light ? -0.14 : 0.16) * R;
      const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R);
      if (light) {
        grad.addColorStop(0, `rgba(255,255,255,${(0.96 * a).toFixed(2)})`);
        grad.addColorStop(0.55, `rgba(241,244,247,${(0.78 * a).toFixed(2)})`);
        grad.addColorStop(1, 'rgba(232,236,240,0)');
      } else {
        grad.addColorStop(0, `rgba(190,197,206,${(0.85 * a).toFixed(2)})`);
        grad.addColorStop(0.6, `rgba(178,186,196,${(0.6 * a).toFixed(2)})`);
        grad.addColorStop(1, 'rgba(170,178,188,0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Naturzug-Kühlturm (Hyperboloid): Fuß r0, Taille rw bei 70 %, Krone r1, Höhe H; Stützenkranz, Schlieren, Öffnung, Dampf. */
function coolingTower(g, u, v, r0, rw, r1, H) {
  const { P, ctx, z } = g;
  const N = 18;
  const tw = 0.7;
  const R = (t) => (t < tw ? rw + (r0 - rw) * ((tw - t) / tw) ** 1.8 : rw + (r1 - rw) * ((t - tw) / (1 - tw)) ** 1.8);
  shadowRound(g, u, v, r0, H, 0.2);
  const col = '#d6d2c9';
  const [cx, cy] = P(u, v, 0);
  const grad = ctx.createLinearGradient(cx - r0 * z, 0, cx + r0 * z, 0);
  grad.addColorStop(0, tint(col, 0.16));
  grad.addColorStop(0.4, col);
  grad.addColorStop(1, shade(col, 0.44));
  ctx.beginPath();
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const x = cx - R(t) * z;
    const y = cy - H * t * z;
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let k = N; k >= 0; k--) ctx.lineTo(cx + R(k / N) * z, cy - H * (k / N) * z);
  ctx.ellipse(cx, cy, r0 * z, (r0 * z) / 2, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
  if (g.fine) {
    // Schlieren (Regenspuren) entlang des Mantels
    ctx.lineWidth = Math.max(0.8, 1.1 * z);
    for (const f of [-0.62, -0.35, -0.08, 0.2, 0.46, 0.7]) {
      ctx.beginPath();
      for (let k = 2; k <= N; k++) {
        const t = k / N;
        const x = cx + f * R(t) * z;
        const y = cy - H * t * z + (R(t) * z * Math.sqrt(1 - f * f)) / 2;
        if (k > 2) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'rgba(95,90,82,0.1)';
      ctx.stroke();
    }
    // Stützenkranz am Fuß: dunkles Band mit schrägen Stützen
    band(g, u, v, r0 * 0.99, 0, 3, '#5b5751');
    for (let k = 0; k <= 16; k++) {
      const th = -Math.PI / 4 + (Math.PI * k) / 16;
      const d = k % 2 ? 0.14 : -0.14;
      const a = P(u + r0 * Math.cos(th), v + r0 * Math.sin(th), 0);
      const b = P(u + r0 * 0.99 * Math.cos(th + d), v + r0 * 0.99 * Math.sin(th + d), 3);
      stroke(g, [a, b], 'rgba(214,210,201,0.85)', 0.55);
    }
  }
  // Öffnung oben: Rand, innen hinten die beleuchtete Wand, vorne Dunkel
  const [tx, ty] = P(u, v, H);
  const rt = R(1);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(tx, ty, rt * z, (rt * z) / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = shade(col, 0.28);
  ctx.fillRect(tx - rt * z, ty - rt * z, 2 * rt * z, 2 * rt * z);
  ctx.fillStyle = '#34322f';
  ctx.beginPath();
  ctx.ellipse(tx, ty + rt * z * 0.38, rt * z, (rt * z) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(tx, ty, rt * z, (rt * z) / 2, 0, 0, Math.PI * 2);
  ctx.strokeStyle = shade(col, 0.15);
  ctx.lineWidth = Math.max(0.7, 1 * z);
  ctx.stroke();
  steam(g, u - 2, v - 2, H + rt * 0.35, rt * 0.62);
}

/** Langgezogene Halde (Miete) mit Grat entlang der langen Seite und hellen Brocken. */
function pile(g, u0, u1, v0, v1, h, color) {
  shadow(g, u0, u1, v0, v1, h * 0.5, 0.16);
  hip(g, u0, u1, v0, v1, 0.7, h, color, null, 0);
  if (!g.fine) return;
  const { ctx, P, z } = g;
  const w = Math.min(u1 - u0, v1 - v0) / 2;
  ctx.fillStyle = tint(color, 0.3);
  for (let k = 0; k < 30; k++) {
    const a = u0 + rnd(k * 13 + 7 * u0) * (u1 - u0);
    const b = v0 + rnd(k * 19 + 3 * v0) * (v1 - v0);
    const d = Math.min(a - u0, u1 - a, b - v0, v1 - b);
    const [px, py] = P(a, b, Math.min(1, d / w) * h);
    ctx.fillRect(px, py, Math.max(1, 0.6 * z), Math.max(1, 0.45 * z));
  }
}

/** Lagertank: Mantel mit Nähten, Band in Teamfarbe, Treppe außen, Kegeldach oder (float) Schwimmdach. */
function tank(g, u, v, r, H, o = {}) {
  const col = o.color ?? TANK;
  shadowRound(g, u, v, r, H);
  cyl(g, u, v, r, 0, H, col, false);
  seam(g, u, v, r, H * 0.33);
  seam(g, u, v, r, H * 0.66);
  if (o.band) band(g, u, v, r, H - 3.4, H - 1.6, o.band);
  const { P, ctx, z } = g;
  if (o.float) {
    const [x, y] = P(u, v, H);
    ctx.beginPath();
    ctx.ellipse(x, y, r * z, (r * z) / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(col, 0.32);
    ctx.fill();
    ctx.save();
    ctx.clip();
    const [, y2] = P(u, v, H - 1.8);
    ctx.beginPath();
    ctx.ellipse(x, y2, r * 0.95 * z, (r * 0.95 * z) / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = snowy('#b8bdc2');
    ctx.fill();
    if (g.fine) {
      ctx.strokeStyle = 'rgba(80,86,92,0.35)';
      ctx.lineWidth = Math.max(0.5, 0.45 * z);
      ctx.beginPath();
      ctx.ellipse(x, y2, r * 0.45 * z, r * 0.22 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(x, y, r * z, (r * z) / 2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(0.6, 0.9 * z);
    ctx.stroke();
  } else coneRoof(g, u, v, r, H, r * 0.2, snowy('#dfe3e7'));
  if (g.fine) {
    // Treppe schräg am Mantel hinauf (vorne links)
    const a = P(u - r * 0.15, v + r * 0.99, 0);
    const b = P(u - r * 0.86, v + r * 0.5, H);
    stroke(g, [a, b], 'rgba(70,75,85,0.75)', 0.9);
    stroke(g, [[a[0], a[1] - 1.2 * z], [b[0], b[1] - 1.2 * z]], 'rgba(70,75,85,0.5)', 0.4);
  }
}

/** Auffangwanne (niedrige Betonmauer) um [u0,u1]×[v0,v1]: part 'back' hintere Seiten, 'front' vordere Seiten. */
function bund(g, u0, u1, v0, v1, part, h = 2.2) {
  if (part === 'back') {
    box(g, u0, u0 + 1, v0, v1, 0, h, CONCRETE);
    box(g, u0, u1, v0, v0 + 1, 0, h, CONCRETE);
  } else {
    box(g, u0, u1, v1 - 1, v1, 0, h, CONCRETE);
    box(g, u1 - 1, u1, v0, v1, 0, h, CONCRETE);
  }
}

/** Kugeltank auf Stützen: Kugel mit Radius r, Unterkante auf h0. */
function sphere(g, u, v, r, h0) {
  const { P, ctx, z } = g;
  shadowRound(g, u, v, r * 0.9, h0 + 2 * r, 0.18);
  const legs = [];
  for (let k = 0; k < 8; k++) {
    const t = ((k + 0.5) / 8) * Math.PI * 2;
    legs.push([u + r * 0.82 * Math.cos(t), v + r * 0.82 * Math.sin(t), Math.cos(t) + Math.sin(t)]);
  }
  const leg = ([lu, lv]) => stroke(g, [P(lu, lv, 0), P(lu, lv, h0 + r)], '#7d858c', 1.2);
  legs.filter((l) => l[2] < 0).forEach(leg);
  const [x, y] = P(u, v, h0 + r);
  const Rz = r * z;
  const grad = ctx.createRadialGradient(x - Rz * 0.35, y - Rz * 0.5, Rz * 0.1, x, y, Rz * 1.2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#e4e7ea');
  grad.addColorStop(1, '#9ea5ab');
  ctx.beginPath();
  ctx.ellipse(x, y, Rz, Rz * 1.118, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, Rz, Rz / 2, 0, 0, Math.PI);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(0.5, 0.7 * z);
  ctx.stroke();
  legs.filter((l) => l[2] >= 0).forEach(leg);
  if (g.fine) {
    // Treppe zur Kuppe
    stroke(g, [P(u + r * 1.25, v + r * 0.5, 0), P(u + r * 0.35, v + r * 0.25, h0 + 2 * r - 0.4)], 'rgba(70,75,85,0.7)', 0.8);
  }
}

/** Destillationskolonne: Zylinder mit Bühnen und Geländern, Leiter, Haube oben. */
function column(g, u, v, r, H, o = {}) {
  const col = o.color ?? '#d3d7db';
  const step = o.step ?? 11;
  shadowRound(g, u, v, r + 1, H, 0.16);
  const decks = [];
  let h = 0;
  while (h < H - 0.1) {
    const h1 = Math.min(H, h + step);
    cyl(g, u, v, r, h, h1, col, false);
    if (h1 < H - 2) {
      cyl(g, u, v, r + 1.7, h1 - 0.6, h1, '#6d757c', true);
      decks.push(h1);
    }
    h = h1;
  }
  cap(g, u, v, r, H, col, 0.5);
  if (!g.fine) return;
  const { P, ctx, z } = g;
  stroke(g, [P(u - r * 0.72, v + r * 0.72, 0), P(u - r * 0.72, v + r * 0.72, H)], 'rgba(70,75,85,0.6)', 0.6); // Leiter
  for (const d of decks) {
    const [x, y] = P(u, v, d + 1.6);
    ctx.beginPath();
    ctx.ellipse(x, y, (r + 1.7) * z, ((r + 1.7) * z) / 2, 0, 0, Math.PI);
    ctx.strokeStyle = 'rgba(200,170,40,0.85)';
    ctx.lineWidth = Math.max(0.5, 0.45 * z);
    ctx.stroke();
  }
}

/** Rohr als Linienzug durch Punkte [u, v, h] mit Glanzlinie (d = Durchmesser). */
function pipe(g, pts, d, col = PIPE) {
  const S = pts.map(([u, v, h]) => g.P(u, v, h));
  stroke(g, S, shade(col, 0.28), d);
  stroke(g, S.map(([x, y]) => [x, y - d * g.z * 0.22]), tint(col, 0.3), d * 0.32);
}

/** Rohrbrücke entlang axis ('u' oder 'v') von a0 bis a1 bei c (quer), Höhe h, mit n Rohren. */
function rack(g, axis, a0, a1, c, h, cols = ['#a3aab0', '#c9a24a', '#8a6f5a']) {
  const { P } = g;
  const Q = axis === 'u' ? (a, cc, hh) => P(a, cc, hh) : (a, cc, hh) => P(cc, a, hh);
  for (let a = a0; a <= a1 + 0.1; a += 9) {
    stroke(g, [Q(a, c - 2.2, 0), Q(a, c - 2.2, h)], '#6b7177', 0.8);
    stroke(g, [Q(a, c - 2.6, h), Q(a, c + 2.6, h)], '#6b7177', 0.8);
  }
  cols.forEach((col, k) => {
    const cc = c - 1.5 + (k * 3) / Math.max(1, cols.length - 1);
    pipe(g, axis === 'u' ? [[a0, cc, h + 0.7], [a1, cc, h + 0.7]] : [[cc, a0, h + 0.7], [cc, a1, h + 0.7]], 1.1, col);
  });
  for (let a = a0; a <= a1 + 0.1; a += 9) stroke(g, [Q(a, c + 2.2, 0), Q(a, c + 2.2, h)], '#6b7177', 0.8);
}

/** Transformator: Kessel mit Kühlrippen, Ausgleichsbehälter, drei Durchführungen. */
function transformer(g, u, v) {
  shadow(g, u - 3, u + 3, v - 2.4, v + 2.4, 7, 0.18);
  box(g, u - 3, u + 3, v - 2.4, v + 2.4, 0, 5, '#77818a', '#87919a');
  ribs(g, u - 3, u + 3, v - 2.4, v + 2.4, 0.8, 4.4, 0.7);
  box(g, u - 2.6, u + 0.6, v - 2.2, v - 0.8, 5, 6.6, '#87919a');
  for (const a of [-1.6, 0.2, 2]) cyl(g, u + a, v + 1, 0.42, 5, 8.4, '#9b6a45', true);
}

/** Strommast (Gitter, ohne Warnlicht) mit zwei Traversen quer zur Leitung (entlang v). */
function pylon(g, u, v, H) {
  const { P } = g;
  mast(g, u, v, 0, H, 2.4, 0.8, '#9ba2a8', false);
  for (const [h, w] of [[H - 2, 4.5], [H - 7, 6]]) {
    stroke(g, [P(u, v - w, h), P(u, v + w, h)], '#9ba2a8', 0.8);
    for (const s of [-w, w]) stroke(g, [P(u, v + s, h), P(u, v + s, h - 1.8)], '#4a4f55', 0.6);
  }
}

/** Leitung zwischen zwei Punkten [u, v, h] mit Durchhang. */
function wire(g, a, b, sag = 2.5) {
  const { ctx, z } = g;
  const [x0, y0] = g.P(...a);
  const [x1, y1] = g.P(...b);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * z * 2, x1, y1);
  ctx.strokeStyle = 'rgba(45,45,48,0.55)';
  ctx.lineWidth = Math.max(0.5, 0.3 * z);
  ctx.stroke();
}

/** Überdachte Förderbrücke von a = [u, v, h] nach b, Breite w, Höhe hh, mit Stützen und Fensterband. */
function gallery(g, a, b, w = 3.2, hh = 3, col = '#b3b7ba') {
  const { P } = g;
  const [u0, v0, h0] = a;
  const [u1, v1, h1] = b;
  const L = Math.hypot(u1 - u0, v1 - v0);
  const nu = -(v1 - v0) / L;
  const nv = (u1 - u0) / L;
  const s = nu + nv >= 0 ? 1 : -1; // Seite zur Kamera
  const pu = (nu * s * w) / 2;
  const pv = (nv * s * w) / 2;
  const n = Math.max(1, Math.round(L / 12));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = u0 + (u1 - u0) * t;
    const v = v0 + (v1 - v0) * t;
    const h = h0 + (h1 - h0) * t;
    if (h < 2) continue;
    stroke(g, [P(u - pu, v - pv, 0), P(u - pu, v - pv, h)], '#6b7075', 0.8);
    stroke(g, [P(u + pu, v + pv, 0), P(u + pu, v + pv, h)], '#6b7075', 0.8);
    if (g.fine) stroke(g, [P(u - pu, v - pv, h * 0.5), P(u + pu, v + pv, h * 0.5)], '#6b7075', 0.5);
  }
  poly(g, [P(u0 + pu, v0 + pv, h0), P(u1 + pu, v1 + pv, h1), P(u1 + pu, v1 + pv, h1 + hh), P(u0 + pu, v0 + pv, h0 + hh)], lit(col, pu, pv, 0));
  poly(g, [P(u0 - pu, v0 - pv, h0 + hh), P(u1 - pu, v1 - pv, h1 + hh), P(u1 + pu, v1 + pv, h1 + hh), P(u0 + pu, v0 + pv, h0 + hh)], lit(snowy(tint(col, 0.06)), ...FACE.top));
  if (g.fine) stroke(g, [P(u0 + pu, v0 + pv, h0 + hh * 0.55), P(u1 + pu, v1 + pv, h1 + hh * 0.55)], 'rgba(40,50,60,0.5)', 0.7);
}

/** Zaunstück zwischen zwei Bodenpunkten (Pfosten, zwei Drähte). */
function fenceLine(g, a, b, h = 3.6) {
  const { P } = g;
  const col = 'rgba(66,72,78,0.8)';
  for (const hh of [h, h * 0.55]) stroke(g, [P(a[0], a[1], hh), P(b[0], b[1], hh)], col, 0.4);
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4.5));
  for (let j = 0; j <= n; j++) {
    const t = j / n;
    stroke(g, [P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0), P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, h + 0.3)], col, 0.55);
  }
}

/** Erdbunker: Tonne mit Grasdecke (First entlang u), vorn (u1) Stirnwand aus Beton mit Stahltor, Lüfter oben. */
function bunker(g, u0, u1, v0, v1, H) {
  const vm = (v0 + v1) / 2;
  shadow(g, u0, u1, v0, v1, H * 0.5, 0.12);
  box(g, u1 - 0.6, u1 + 2.2, v0 - 1.4, v0 + 0.4, 0, H * 0.7, CONCRETE); // hintere Flügelmauer
  vault(g, 'u', u0, u1, v0, v1, 0.8, H, GRASS, CONCRETE, 12);
  cyl(g, u0 + (u1 - u0) * 0.35, vm, 0.8, H + 0.6, H + 3.2, '#8a9096');
  gate(g, 'e', u1, vm, (v1 - v0) * 0.42, H * 0.55, '#6c757b');
  if (g.fine) {
    const pt = onFace(g, 'e', u1);
    poly(g, [pt(vm - 1.2, H * 0.62), pt(vm + 1.2, H * 0.62), pt(vm + 1.2, H * 0.62 + 1), pt(vm - 1.2, H * 0.62 + 1)], '#e3c43a', null); // Warnschild
  }
  box(g, u1 - 0.6, u1 + 2.2, v1 - 0.4, v1 + 1.4, 0, H * 0.7, CONCRETE); // vordere Flügelmauer
}

/** LKW entlang u oder v (Fahrerhaus vorn bei +u bzw. +v); load: 'bricks', 'tank', 'tarp', 'coal', 'ore', 'logs'. */
function lorry(g, u, v, along, cabCol, load, o = {}) {
  const U = along === 'u';
  const L = 7;
  const W = 2.3;
  const bx = (a0, a1, c0, c1, h0, h1, col, top) => (U ? box(g, u + a0, u + a1, v + c0, v + c1, h0, h1, col, top) : box(g, u + c0, u + c1, v + a0, v + a1, h0, h1, col, top));
  if (U) flat(g, u - L, u + L + 0.6, v - W, v + W + 1.6, 'rgba(0,0,0,0.22)');
  else flat(g, u - W, u + W + 0.6, v - L, v + L + 1.6, 'rgba(0,0,0,0.22)');
  for (const a of [-5, -2.6, 4.8]) bx(a - 1, a + 1, W - 0.4, W + 0.1, 0, 1.9, '#2f3134'); // Räder der sichtbaren Seite
  bx(-L, L - 0.2, -W + 0.4, W - 0.4, 0.9, 1.7, '#3a3d40');
  const bed = L - 3.8;
  if (load === 'tank') {
    bx(-L, bed, -W + 0.2, W - 0.2, 1.7, 5.4, o.tank ?? TANK, tint(o.tank ?? TANK, 0.1));
    if (o.band) bx(-L + 0.6, bed - 0.6, -W + 0.15, W - 0.15, 3.2, 4, o.band);
  } else if (load === 'tarp') {
    bx(-L, bed, -W, W, 1.7, 6.2, OLIVE, tint(OLIVE, 0.1));
    if (g.fine) for (let a = -L + 2; a < bed; a += 2.2) {
      const [p0, p1] = U ? [g.P(u + a, v + W, 1.8), g.P(u + a, v + W, 6.1)] : [g.P(u + W, v + a, 1.8), g.P(u + W, v + a, 6.1)];
      stroke(g, [p0, p1], 'rgba(0,0,0,0.18)', 0.4);
    }
  } else if (load === 'coal' || load === 'ore') {
    bx(-L, bed, -W, W, 1.7, 4.6, '#d29b1d', '#e3b02c');
    bx(-L + 0.5, bed - 0.5, -W + 0.5, W - 0.5, 4.6, 5.2, load === 'coal' ? COAL : '#8a4b2e');
  } else {
    bx(-L, bed, -W, W, 1.7, 2.3, '#6d5a45', '#7d6a55');
    if (load === 'bricks') for (const a of [-4.8, -1.4]) bx(a - 1.5, a + 1.5, -1.7, 1.7, 2.3, 4.8, BRICKS, tint(BRICKS, 0.1));
    if (load === 'logs' && U) logPile(g, u - L + 0.4, u + bed - 0.4, v - W + 0.3, v + W - 0.3, 2);
  }
  bx(L - 3.4, L, -W, W, 1.7, 5.8, cabCol, tint(cabCol, 0.1));
  const { P } = g;
  if (U) poly(g, [P(u + L, v - W + 0.4, 3.6), P(u + L, v + W - 0.4, 3.6), P(u + L, v + W - 0.4, 5.3), P(u + L, v - W + 0.4, 5.3)], lit('#2c3a47', ...FACE.e), null);
  else poly(g, [P(u - W + 0.4, v + L, 3.6), P(u + W - 0.4, v + L, 3.6), P(u + W - 0.4, v + L, 5.3), P(u - W + 0.4, v + L, 5.3)], lit('#2c3a47', ...FACE.s), null);
}

/** Palette mit Ziegeln (oder anderer Ware), Kantenlänge 2s, Höhe h. */
function pallet(g, u, v, s = 2.2, h = 3.2, col = BRICKS) {
  box(g, u - s, u + s, v - s, v + s, 0, 0.6, '#9c7a52');
  box(g, u - s + 0.2, u + s - 0.2, v - s + 0.2, v + s - 0.2, 0.6, h, col, tint(col, 0.1));
  if (!g.fine) return;
  const { P } = g;
  for (let k = 1.4; k < h - 0.2; k += 0.8) stroke(g, [P(u - s + 0.2, v + s - 0.2, k), P(u + s - 0.2, v + s - 0.2, k), P(u + s - 0.2, v - s + 0.2, k)], 'rgba(70,30,20,0.25)', 0.35);
  stroke(g, [P(u, v + s - 0.2, 0.6), P(u, v + s - 0.2, h), P(u, v - s + 0.2, h)], 'rgba(240,240,235,0.75)', 0.4); // Band
}

/** Gabelstapler (orange) mit Palette auf der Gabel nach +u. */
function forklift(g, u, v, col = BRICKS) {
  const { P } = g;
  flat(g, u - 2.6, u + 5, v - 1.8, v + 2.8, 'rgba(0,0,0,0.18)');
  box(g, u - 2.4, u + 1.6, v - 1.5, v + 1.5, 0.5, 2.8, '#e08a1e', '#eea040');
  for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) stroke(g, [P(u + a * 0.9, v + b * 0.9, 2.8), P(u + a * 0.9, v + b * 0.9, 5.6)], '#3a3d40', 0.5);
  box(g, u - 1.8, u + 1.8, v - 1.6, v + 1.6, 5.6, 6, '#3a3d40');
  for (const b of [-1, 1]) stroke(g, [P(u + 2, v + b, 0), P(u + 2, v + b, 6.4)], '#3a3d40', 0.7);
  pallet(g, u + 3.6, v, 1.4, 2.6, col);
}

/** Geschoss-Denkmal: Betonsockel, Messinghülse, olivgrünes Geschoss mit gelbem Ring und Kupfer-Führungsband. */
function shellMonument(g, u, v, r, H) {
  shadowRound(g, u, v, r + 1.5, H, 0.18);
  box(g, u - r - 2.2, u + r + 2.2, v - r - 2.2, v + r + 2.2, 0, 2.6, '#c4bfb3', '#d1ccc0');
  if (g.fine) {
    const pt = onFace(g, 's', v + r + 2.2);
    poly(g, [pt(u - r, 0.7), pt(u + r, 0.7), pt(u + r, 1.9), pt(u - r, 1.9)], lit('#6b5a3a', ...FACE.s), null); // Tafel
  }
  const h0 = 2.6;
  cyl(g, u, v, r, h0, h0 + H * 0.42, BRASS, false);
  seam(g, u, v, r, h0 + H * 0.12, 'rgba(120,80,20,0.45)');
  cyl(g, u, v, r * 1.01, h0 + H * 0.42, h0 + H * 0.47, '#b5643a', false);
  cyl(g, u, v, r * 0.97, h0 + H * 0.47, h0 + H * 0.7, OLIVE, false);
  band(g, u, v, r * 0.97, h0 + H * 0.6, h0 + H * 0.64, '#e3c43a');
  cap(g, u, v, r * 0.97, h0 + H * 0.7, OLIVE, (H * 0.3) / (r * 0.97));
}

/** Wachturm: vier Stelzen, Kanzel mit Fenstern und Dach. */
function watchtower(g, u, v, H) {
  const { P } = g;
  shadow(g, u - 3, u + 3, v - 3, v + 3, H + 4, 0.16);
  for (const [a, b] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) stroke(g, [P(u + a, v + b, 0), P(u + a * 0.8, v + b * 0.8, H)], '#5d5850', 0.9);
  box(g, u - 3, u + 3, v - 3, v + 3, H, H + 4.2, '#8a8270', '#9a927f');
  wins(g, 's', v + 3, u - 3, u + 3, 2, [[H + 1.6, H + 3.6]], 2.2, { frame: false, lit: 0.3 });
  wins(g, 'e', u + 3, v - 3, v + 3, 2, [[H + 1.6, H + 3.6]], 2.2, { frame: false, lit: 0.3 });
  hip(g, u - 3, u + 3, v - 3, v + 3, H + 4.2, 2.6, '#4f5348');
}

/** Wasserturm: vier Stelzen mit Kreuzverband, Behälter mit Band in Teamfarbe und Kegeldach. */
function waterTower(g, u, v, H, team) {
  const { P } = g;
  const L = H - 7;
  shadowRound(g, u, v, 4.6, H + 3, 0.16);
  const lp = (a, b, h) => P(u + a * (1 - 0.22 * (h / L)), v + b * (1 - 0.22 * (h / L)), h);
  for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) stroke(g, [lp(a, b, 0), lp(a, b, L)], '#6d7277', 0.9);
  for (const [h0, h1] of [[0, L / 2], [L / 2, L]]) {
    stroke(g, [lp(-3, 3, h0), lp(3, 3, h1)], '#7d8287', 0.45);
    stroke(g, [lp(3, 3, h0), lp(-3, 3, h1)], '#7d8287', 0.45);
    stroke(g, [lp(3, 3, h0), lp(3, -3, h1)], '#7d8287', 0.45);
    stroke(g, [lp(3, -3, h0), lp(3, 3, h1)], '#7d8287', 0.45);
  }
  cyl(g, u, v, 4.6, L, H, '#b9c0c5', false);
  band(g, u, v, 4.6, H - 3.4, H - 2.2, team);
  coneRoof(g, u, v, 4.9, H, 2.8, '#7d8287');
}

/** Kleines Verwaltungsgebäude mit Fenstern, Tür und Dach (hip: Walmdach, sonst Flachdach mit Attika). */
function office(g, u0, u1, v0, v1, H, wall, o = {}) {
  walls(g, u0, u1, v0, v1, H, wall, { roofH: o.hip ? 4 : 0 });
  const n = Math.max(2, Math.round((u1 - u0) / 4));
  const m = Math.max(1, Math.round((v1 - v0) / 4));
  const rows = H > 9 ? [[2.2, 4.4], [6.8, 9]] : [[2.2, 4.6]];
  wins(g, 's', v1, u0, u1, n, rows, 2.2, { seed: o.seed ?? 3, lit: 0.25 });
  wins(g, 'e', u1, v0, v1, m, rows, 2.2, { seed: (o.seed ?? 3) + 5, lit: 0.25 });
  door(g, 's', v1, u0 + (u1 - u0) * 0.5, 2.6, 4.2, '#4f5a63');
  if (o.hip) hip(g, u0, u1, v0, v1, H, 4, o.roof ?? '#7a4a3a');
  else {
    flatRoof(g, u0, u1, v0, v1, H, wall);
    acUnit(g, u0 + (u1 - u0) * 0.3, v0 + (v1 - v0) * 0.45, H - 1.3);
  }
}

/** Parkplatz-Markierungen entlang u bei v0…v1. */
function stalls(g, u0, u1, v0, v1, step = 5.5) {
  const { P } = g;
  for (let a = u0; a <= u1 + 0.1; a += step) stroke(g, [P(a, v0, 0), P(a, v1, 0)], 'rgba(235,232,220,0.7)', 0.5);
}

/** Liegender Zylinder entlang axis ('u' oder 'v') von a0 bis a1 bei c (quer), Achse auf Höhe h, Radius r; Stirnseite bei a1 sichtbar. */
function hcyl(g, axis, a0, a1, c, h, r, color) {
  const { P, ctx, z } = g;
  const Q = axis === 'u' ? (a, cc, hh) => P(a, cc, hh) : (a, cc, hh) => P(cc, a, hh);
  const ring = (a) => {
    const pts = [];
    for (let k = 0; k < 20; k++) {
      const t = (k / 20) * Math.PI * 2;
      pts.push(Q(a, c + r * Math.cos(t), h + r * Math.sin(t)));
    }
    return pts;
  };
  const pts = [...ring(a0), ...ring(a1)].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  const hi = [];
  for (const p of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop();
    hi.push(p);
  }
  const hull = [...lo.slice(0, -1), ...hi.slice(0, -1)];
  const am = (a0 + a1) / 2;
  const [, yt] = Q(am, c, h + r);
  const [, yb] = Q(am, c, h - r);
  const grad = ctx.createLinearGradient(0, yt, 0, yb);
  grad.addColorStop(0, tint(color, 0.22));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, shade(color, 0.42));
  poly(g, hull, grad);
  poly(g, ring(a1), lit(color, ...(axis === 'u' ? FACE.e : FACE.s)));
  void z;
}

/** Gemauerte Ofentür mit Rundbogen (dunkel oder mit Glut). */
function archDoor(g, face, plane, a, w, h, hot = false) {
  const pt = onFace(g, face, plane);
  const r = w / 2;
  const col = hot ? (face === 's' ? '#f19a3c' : '#d9802c') : '#2d2420';
  const pts = [pt(a - r, 0), pt(a + r, 0)];
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8) * Math.PI;
    pts.push(pt(a + r * Math.cos(t), h - r + r * Math.sin(t)));
  }
  poly(g, pts, col, 'rgba(60,25,15,0.6)');
}

/** Winderhitzer (Cowper): hoher Stahlzylinder mit Kuppel. */
function cowper(g, u, v, r, H) {
  shadowRound(g, u, v, r, H, 0.18);
  cyl(g, u, v, r, 0, H, '#8f959a', false);
  for (const f of [0.25, 0.5, 0.75]) seam(g, u, v, r, H * f, 'rgba(40,40,45,0.3)');
  cap(g, u, v, r, H, '#8f959a', 0.8);
}

/** Staubsack: Behälter mit Trichter auf Stützen. */
function dustCatcher(g, u, v, H) {
  const { P } = g;
  shadowRound(g, u, v, 5, H, 0.16);
  for (const [a, b] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) stroke(g, [P(u + a, v + b, 0), P(u + a, v + b, H * 0.42)], '#4b4f54', 0.9);
  frustum(g, u, v, 1.6, 5.4, H * 0.2, H * 0.42, '#7c8085', false);
  cyl(g, u, v, 5.4, H * 0.42, H * 0.88, '#7c8085', false);
  cap(g, u, v, 5.4, H * 0.88, '#7c8085', 0.45);
}

/** Hochofen: Gestell, Rast, Schacht aus Stahl mit Rost, Ringleitung, Gichtbühne, Gasabzüge, Stahlgerüst, Glut am Stichloch. */
function furnace(g, u, v, H) {
  const { P, ctx, z } = g;
  const f = 11;
  shadowRound(g, u, v, 11, H, 0.2);
  const post = (a, b) => stroke(g, [P(u + a, v + b, 0), P(u + a * 0.62, v + b * 0.62, H * 0.84)], '#45494e', 1.2);
  post(-f, -f);
  post(f, -f);
  post(-f, f);
  if (g.fine) {
    for (const h of [H * 0.3, H * 0.55]) stroke(g, [P(u - f * 0.8, v + f * 0.8, h), P(u - f * 0.8, v - f * 0.8, h), P(u + f * 0.8, v - f * 0.8, h)], '#45494e', 0.6);
  }
  cyl(g, u, v, 8.6, 0, 9, '#4a4643', false);
  frustum(g, u, v, 9.2, 10.6, 9, 14, RUST, false);
  frustum(g, u, v, 10.6, 7, 14, H * 0.72, RUST, false);
  for (const h of [H * 0.35, H * 0.52]) seam(g, u, v, 10.6 - (3.6 * (h - 14)) / (H * 0.72 - 14), h, 'rgba(30,20,15,0.35)');
  band(g, u, v, 11.4, 11, 13.4, '#5d5550'); // Ringleitung
  cyl(g, u, v, 8.6, H * 0.72, H * 0.76, '#5b5f63', true); // Gichtbühne
  for (const [a, b] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) pipe(g, [[u + a, v + b, H * 0.76], [u + a * 0.9, v + b * 0.9, H * 0.93], [u, v, H]], 1.9, '#6f6a64');
  cyl(g, u, v, 1.8, H - 1, H + 3, '#6f6a64', true);
  post(f, f);
  // Glut am Stichloch und in der Rinne (vorne)
  const [x, y] = P(u + 6.5, v + 6.5, 1.2);
  const R = 4 * z;
  const grad = ctx.createRadialGradient(x, y, R * 0.1, x, y, R);
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.4, HOT);
  grad.addColorStop(1, 'rgba(230,90,30,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, R, R * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Glühender Fleck am Boden (Schlacke, Rinne). */
function glow(g, u, v, h, r) {
  const { P, ctx, z } = g;
  const [x, y] = P(u, v, h);
  const R = r * z;
  const grad = ctx.createRadialGradient(x, y, R * 0.05, x, y, R);
  grad.addColorStop(0, '#fff1a6');
  grad.addColorStop(0.45, '#ff9a3a');
  grad.addColorStop(1, 'rgba(200,60,20,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, R, R / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Torpedowagen auf Schienen (entlang u): Drehgestelle, liegender Behälter, Öffnung mit Glut. */
function torpedo(g, u, v) {
  box(g, u - 7, u - 2.5, v - 1.6, v + 1.6, 0.3, 1.9, '#3a3d40');
  box(g, u + 2.5, u + 7, v - 1.6, v + 1.6, 0.3, 1.9, '#3a3d40');
  hcyl(g, 'u', u - 6.5, u + 6.5, v, 4.6, 2.8, '#6e5a4d');
  const { P, ctx, z } = g;
  const [x, y] = P(u, v, 7.3);
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.ellipse(x, y, 1.6 * z, 0.8 * z, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Erzwagen (Selbstentlader) auf Schienen entlang u. */
function hopper(g, u, v, load = '#8a4b2e') {
  box(g, u - 5.5, u - 2, v - 1.6, v + 1.6, 0.3, 1.9, '#3a3d40');
  box(g, u + 2, u + 5.5, v - 1.6, v + 1.6, 0.3, 1.9, '#3a3d40');
  box(g, u - 5.5, u + 5.5, v - 2.3, v + 2.3, 1.9, 5.6, '#5a4a40', '#6a5a50');
  box(g, u - 5, u + 5, v - 1.8, v + 1.8, 5.6, 6.3, load);
}

/** Offenes Vordach auf Stützen (Verladestation): Dach auf Höhe H mit Rand in Teamfarbe. */
function canopy(g, u0, u1, v0, v1, H, team) {
  const { P } = g;
  shadow(g, u0, u1, v0, v1, H, 0.14);
  const posts = [];
  for (let a = u0 + 1; a <= u1 - 0.9; a += (u1 - u0 - 2) / 3) for (const b of [v0 + 1, v1 - 1]) posts.push([a, b]);
  posts.filter(([, b]) => b < v1 - 2).forEach(([a, b]) => stroke(g, [P(a, b, 0), P(a, b, H)], '#6b7177', 1));
  return () => {
    posts.filter(([, b]) => b >= v1 - 2).forEach(([a, b]) => stroke(g, [P(a, b, 0), P(a, b, H)], '#6b7177', 1));
    box(g, u0, u1, v0, v1, H, H + 1.2, '#d9dcde', snowy('#c9cdd0'));
    wallBand(g, u0, u1, v0, v1, H + 0.2, H + 1, team);
  };
}

// ---------- Kraftwerk ----------

function power(g, lv, o) {
  const T = o.color;
  ground(g, CONCRETE);
  flat(g, -E, -20, -6, E, '#57534b'); // Kohlelager
  flat(g, 14, E, 26, E, GRAVEL); // Umspannwerk
  flat(g, -18, 12, 34, E, ASPH); // Parkplatz
  stalls(g, -16, 10, 44, 54);
  grass(g, -18, 12, 12, 34);
  const CH = [0, 92, 102, 112][lv];
  stack(g, -46, -46, 5.8, 4.2, CH, { bands: lv >= 3 ? 3 : 2, light: true });
  box(g, -46, -38, -45, -40, 24, 30, '#8f9499'); // Rauchgaskanal zum Schornstein
  if (lv >= 2) {
    // Rauchgaswäsche (REA) hinter dem Maschinenhaus
    box(g, -12, -6, -49, -45, 27, 31, '#8f9499');
    cyl(g, -2, -50, 6.4, 0, 36, '#c9cdd1', false);
    seam(g, -2, -50, 6.4, 12);
    seam(g, -2, -50, 6.4, 24);
    cap(g, -2, -50, 6.4, 36, '#c9cdd1', 0.3);
  }
  // Kesselhaus
  const BH = [0, 40, 46, 50][lv];
  walls(g, -38, -12, -40, -16, BH, '#c4c9cd', { ribs: 2.2 });
  for (let h = 8; h < BH - 4; h += 9) {
    strip(g, 's', -16, -35, -21, h, h + 1.8, 2.8);
    strip(g, 'e', -12, -37, -19, h, h + 1.8, 2.8);
  }
  flatRoof(g, -38, -12, -40, -16, BH, '#c4c9cd');
  fan(g, -30, -30, BH - 1.3, 2.2);
  acUnit(g, -20, -34, BH - 1.3, 2.6);
  walls(g, -19, -13, -16, -11, BH + 4, '#aeb4b9'); // Treppenhaus
  strip(g, 's', -11, -18, -14, 3, BH + 1, 10);
  flatRoof(g, -19, -13, -16, -11, BH + 4, '#aeb4b9');
  // Maschinenhaus mit hohen Fenstern und Band in Teamfarbe
  walls(g, -10, 10, -38, -18, 22, '#dcd6c8', { band: T, roofH: 3 });
  wins(g, 's', -18, -10, 10, 5, [[3, 17.5]], 2.2, { frame: false, lit: 0.12, seed: 5 });
  wins(g, 'e', 10, -38, -18, 4, [[3, 17.5]], 2.2, { frame: false, lit: 0.12, seed: 9 });
  gable(g, 'u', -10, 10, -38, -18, 22, 3, '#7d8287', '#dcd6c8');
  // Kohle in langen Mieten, Radlader, Förderbrücke zum Kesselhaus
  pile(g, -55, -42, -2, 52, lv >= 3 ? 9 : 7.5, COAL);
  if (lv >= 3) pile(g, -39, -31, 4, 22, 5.5, COAL);
  gallery(g, [-28, 26, 3], [-28, -16, 33], 3.2, 3, '#a9adb0');
  if (lv >= 2) pile(g, -39, -31, 32, 55, 6, COAL);
  if (lv >= 2) loader(g, -35, 27);
  // Kühlwasser-Pumpenhaus mit Leitungen zum Kühlturm
  pipe(g, [[28, -1, 1.4], [33.5, -1, 1.4], [33.5, -21, 1.4]], 1.3, '#7f8d96');
  pipe(g, [[28, 3, 1.4], [36.5, 3, 1.4], [36.5, -20, 1.4]], 1.3, '#7f8d96');
  walls(g, 16, 28, -5, 7, 7, '#c9c4b4', { roofH: 1 });
  wins(g, 's', 7, 16, 28, 3, [[2.6, 4.8]], 2, { frame: false, lit: 0.2, seed: 3 });
  door(g, 'e', 28, 1, 2.4, 4.4);
  flatRoof(g, 16, 28, -5, 7, 7, '#c9c4b4');
  // Kühltürme rechts hinten, ab Stufe 3 ein zweiter davor
  const big = lv >= 2;
  coolingTower(g, 39, -39, big ? 19.5 : 18.5, big ? 12.9 : 12.2, big ? 13.9 : 13.2, big ? 60 : 54);
  if (lv >= 3) coolingTower(g, 44, -11, 14, 9.4, 10.1, 44);
  // Verwaltung, Fahne, Autos, Laternen, Bäume
  office(g, -12, 8, 16, 30, 12, '#e3ddd0', { seed: 21 });
  flagpole(g, -15, 32, 0, 17, T);
  [[-13, 49], [-2, 49], [3.5, 49]].slice(0, lv).forEach(([u, v], k) => car(g, u, v, 'v', CAR_COLORS[(k * 3 + 1) % CAR_COLORS.length]));
  lamp(g, 12, 33, 9);
  tree(g, -6, 55, 0.85, 1);
  tree(g, 8, 56, 0.8, 2);
  // Umspannwerk: Transformatoren, Masten, Leitungen
  const tr = [[24, 36], [24, 48], [33, 54]].slice(0, lv);
  tr.forEach(([u, v]) => transformer(g, u, v));
  pylon(g, 46, 32, 22);
  pylon(g, 46, 50, 22);
  for (const [u, v] of tr) wire(g, [u + 0.2, v + 1, 8.4], [46, v < 42 ? 32 : 50, 20], 1.5);
  for (const v of [32, 50]) for (const s of [-4.5, 4.5]) wire(g, [46, v + s, 20], [E, v + s * 0.8, 21], 1);
}

// ---------- BM-Werk (Ziegelei mit Holzlager) ----------

function bm(g, lv, o) {
  const T = o.color;
  ground(g, '#b9a37d');
  flat(g, -56, -14, -2, 30, '#c2b8a6'); // Palettenlager (gepflastert)
  flat(g, -8, 8, 4, E, ASPH); // Zufahrt
  grass(g, 14, E, 24, E);
  // Ringofen mit Ziegelschornstein in der Mitte
  const SH = [0, 46, 52, 58][lv];
  walls(g, -54, -14, -54, -38, 8, BRICK, { roofH: 5 });
  for (let a = -50.5, k = 0; a <= -17; a += 6.6, k++) archDoor(g, 's', -38, a, 3, 5.6, k % 3 === 1);
  archDoor(g, 'e', -14, -46, 3, 5.6, false);
  gable(g, 'u', -54, -14, -54, -38, 8, 5, '#5e5049', BRICK, () => brickStack(g, -34, -46, 3.6, 2.5, SH));
  // Lehmhalde mit Bagger und Förderband zum Ofen
  heap(g, 30, -42, 12, 9, '#a5653f');
  if (lv >= 2) {
    excavator(g, 20, -30, 0);
    conveyor(g, 18, -47, 1.5, -13, -47, 6.5, 1.6);
  }
  // Trockenschuppen mit Rohlingen; Stufe 3: geschlossener Tunnelofen mit Stahlkaminen
  const rawRacks = (u0, u1, v0, v1) => () => {
    for (let b = v0 + 1.6; b < v1 - 1; b += 2.6) box(g, u0 + 1, u1 - 1, b - 0.8, b + 0.8, 0, 3.4, RAW, tint(RAW, 0.12));
  };
  shed(g, -54, -16, -32, -20, 5, 2.6, '#6a5b4e', rawRacks(-54, -16, -32, -20));
  if (lv === 2) shed(g, -54, -16, -16, -5, 5, 2.6, '#6a5b4e', rawRacks(-54, -16, -16, -5));
  if (lv >= 3) {
    walls(g, -54, -16, -16, -5, 9, '#b8bec2', { ribs: 2, band: T });
    gate(g, 'e', -16, -10.5, 5, 6.5);
    strip(g, 's', -5, -50, -22, 5.5, 7.2, 3);
    flatRoof(g, -54, -16, -16, -5, 9, '#b8bec2');
    stack(g, -44, -11, 1.5, 1.3, 26, { color: '#9aa1a8' });
    stack(g, -30, -11, 1.5, 1.3, 26, { color: '#9aa1a8' });
  }
  // Holzlager mit Stämmen und Brettern; Stufe 2: Sägeschuppen
  logPile(g, 14, 40, -24, -15, 2);
  planks(g, 44, 54, -24, -14, 3.6);
  if (lv >= 2) {
    logPile(g, 14, 40, -11, -2, 2);
    shed(g, 14, 40, 3, 13, 5.5, 3, '#6a5b4e', () => {
      box(g, 18, 34, 7, 9, 0, 2.6, '#6d7277', '#8a8f94');
      planks(g, 36, 39, 5, 11, 2);
    });
  }
  // Palettenlager mit Ziegeln, Gabelstapler
  const n = [0, 8, 14, 20][lv];
  let k = 0;
  for (const c of [5, 12, 19, 26]) for (const a of [-50, -43, -36, -29, -22]) if (k++ < n) pallet(g, a, c, 2.4, 2.8 + rnd(k * 13) * 1.4);
  if (lv >= 2) forklift(g, -14, 12);
  // Büro mit Fahne, LKW mit Ziegeln, Bäume
  office(g, 22, 42, 28, 42, 10, '#ebe3d2', { hip: true, roof: '#8a4a36', seed: 13 });
  flagpole(g, 18, 46, 0, 16, T);
  lorry(g, 0, 38, 'v', '#c8463a', 'bricks');
  if (lv >= 3) lorry(g, 28, 18, 'u', '#3a6fb3', 'logs');
  car(g, 34, 50, 'u', CAR_COLORS[1]);
  lamp(g, 9, 26, 9);
  tree(g, 52, 8, 0.9, 0);
  tree(g, 56, 22, 0.8, 1);
  tree(g, 16, 56, 0.85, 2);
}

// ---------- Munitionswerk ----------

function mun(g, lv, o) {
  const T = o.color;
  ground(g, '#8f9579');
  flat(g, -12, 2, -24, E, ASPH); // Werkstraße zum Tor
  flat(g, -54, -20, 4, 44, '#9b9f8c'); // Kistenlager
  grass(g, 18, E, 20, E);
  flat(g, 6, 34, 2, 20, ASPH); // Fahrzeughof
  stalls(g, 7.5, 30.5, 3, 19, 8);
  fenceLine(g, [-56, 56], [-56, -56]);
  fenceLine(g, [-56, -56], [56, -56]);
  // Fertigungshalle mit Sheddach und Lüftern
  walls(g, -52, -8, -52, -28, 11, '#a3a993', { band: T, roofH: 4 });
  strip(g, 's', -28, -50, -22, 4, 7.2, 3);
  gate(g, 's', -28, -15, 6, 7.5);
  gate(g, 'e', -8, -40, 7, 7.5);
  sawRoof(g, -52, -8, -52, -28, 11, 5, 4, '#6d7368', '#a3a993');
  if (lv >= 2) {
    for (const u of [-45, -27]) {
      cyl(g, u, -31, 1.4, 11, 22, '#9aa1a8', false);
      cyl(g, u, -31, 1.8, 21, 22.6, '#7d848a', true);
    }
  }
  // Erdbunker
  bunker(g, 8, 46, -52, -38, 9);
  if (lv >= 2) bunker(g, 8, 46, -32, -18, 9);
  if (lv >= 3) {
    bunker(g, 8, 46, -12, 2, 9);
    walls(g, -52, -24, -20, -2, 9, '#b0b49f');
    gate(g, 's', -2, -31, 6, 6.5);
    strip(g, 's', -2, -50, -36, 4, 6.4, 3);
    flatRoof(g, -52, -24, -20, -2, 9, '#b0b49f');
  }
  waterTower(g, 52, -47, 26, T);
  // Kisten (gestapelt), Gabelstapler, LKW mit Plane, Militär-LKW im Fahrzeughof (je Stufe einer mehr)
  const n = [0, 6, 9, 12][lv];
  let k = 0;
  for (const c of [10, 20, 30, 40]) for (const a of [-49, -40, -31]) {
    if (k++ >= n) continue;
    const h = 2.6 * (1 + Math.floor(rnd(k * 7) * 2.4));
    box(g, a - 3, a + 3, c - 3, c + 3, 0, 0.6, '#9c7a52');
    box(g, a - 2.8, a + 2.8, c - 2.8, c + 2.8, 0.6, h, '#596440', '#69744c');
    if (g.fine) for (let hh = 3.2; hh < h; hh += 2.6) stroke(g, [g.P(a - 2.8, c + 2.8, hh), g.P(a + 2.8, c + 2.8, hh), g.P(a + 2.8, c - 2.8, hh)], 'rgba(0,0,0,0.25)', 0.45);
  }
  if (lv >= 2) forklift(g, -20, 14, '#596440');
  lorry(g, -5, 26, 'v', OLIVE, 'tarp');
  [11, 19, 27].slice(0, lv).forEach((u) => lorry(g, u, 11, 'v', OLIVE, 'tarp'));
  // Tor mit Wache und Schranke, Fahnen
  walls(g, 4, 10, 44, 50, 6, '#c9c4b4', { roofH: 1 });
  wins(g, 's', 50, 4, 10, 1, [[2.6, 4.6]], 2.6, { frame: false, lit: 0.6 });
  wins(g, 'e', 10, 44, 50, 1, [[2.6, 4.6]], 2.6, { frame: false, lit: 0.6 });
  box(g, 3.4, 10.6, 43.4, 50.6, 6, 7, '#55585b');
  box(g, -12, 3, 51.4, 52.2, 3.6, 4.4, '#e8e4d4', '#d23a3a');
  box(g, 2.4, 3.6, 50.8, 52.8, 0, 5, '#d23a3a');
  flagpole(g, 14, 54, 0, 16, T);
  flagpole(g, -16, 54, 0, 16, T);
  // Denkmal auf dem Rasen, Bäume
  shellMonument(g, 36, 38, 3 + lv * 0.4, 16 + lv * 3);
  tree(g, 52, 24, 0.9, 0);
  tree(g, 22, 52, 0.85, 1);
  tree(g, 52, 50, 0.8, 2);
  if (lv >= 3) watchtower(g, -50, 50, 14);
  fenceLine(g, [-56, 56], [-12, 56]);
  fenceLine(g, [3, 56], [56, 56]);
  fenceLine(g, [56, 56], [56, -56]);
}

// ---------- Raffinerie ----------

function fuel(g, lv, o) {
  const T = o.color;
  ground(g, '#a6aaac');
  flat(g, -56, -6, -56, -6, '#979891'); // Boden der Auffangwanne
  flat(g, -E, E, 2, 10, ASPH); // Werkstraße
  flat(g, -10, 0, 10, E, ASPH);
  bund(g, -56, -6, -56, -6, 'back');
  tank(g, -40, -40, 13, 12, { float: true, band: T });
  tank(g, -16, -44, 8.5, 10, {});
  if (lv >= 2) tank(g, -42, -17, 8.5, 10, { float: true, band: T });
  if (lv >= 3) tank(g, -19, -20, 7, 9, {});
  bund(g, -56, -6, -56, -6, 'front');
  pipe(g, [[-27, -40, 2.4], [-4, -40, 2.4], [-4, -40, 7.7]], 1.2);
  // Prozessanlage: Kolonnen, Ofen mit Kamin, Rohrbrücken, Fackel
  if (lv >= 3) {
    stack(g, 52, -52, 1.4, 1.1, 66, { color: '#b9bfc4', bands: 2 });
    flame(g, 52, -52, 66, 1.3);
  }
  if (lv >= 3) column(g, 12, -46, 3, 28);
  if (lv >= 2) column(g, 36, -42, 3.6, 34);
  if (lv >= 2) rack(g, 'v', -50, -6, 4, 7);
  column(g, 22, -28, 4.8, [0, 38, 48, 56][lv]);
  walls(g, 30, 46, -22, -10, 9, '#b9a48a', { roofH: 0 });
  strip(g, 's', -10, 32, 44, 3, 4.6, 2, true);
  flatRoof(g, 30, 46, -22, -10, 9, '#b9a48a');
  stack(g, 41, -16, 1.9, 1.6, 30, { color: '#a7adb2', bands: 1 });
  rack(g, 'u', -4, 54, -2, 7);
  // Kugeltanks
  if (lv >= 2) sphere(g, 42, 22, 7.5, 3);
  if (lv >= 3) sphere(g, 42, 42, 7.5, 3);
  // Verladestation mit Tankwagen
  const front = canopy(g, -52, -22, 18, lv >= 2 ? 44 : 34, 7.5, T);
  lorry(g, -37, 26, 'u', '#d6d2c6', 'tank', { band: T });
  if (lv >= 2) lorry(g, -37, 38, 'u', '#c8463a', 'tank', { band: T });
  front();
  // Leitstand mit Fahne
  office(g, 4, 22, 36, 50, 8, '#e1dccf', { seed: 17 });
  flagpole(g, 25, 52, 0, 16, T);
  lamp(g, 1, 14, 9);
  lamp(g, 1, 40, 9);
  tree(g, -14, 52, 0.85, 1);
  tree(g, 52, 6, 0.8, 2);
}

// ---------- Stahlwerk ----------

function steel(g, lv, o) {
  const T = o.color;
  ground(g, '#827d75');
  flat(g, -E, 12, 11, 21, '#6a655e'); // Gleisbett
  flat(g, -6, 6, 21, E, ASPH);
  rails(g, -E, 12, 16);
  if (lv >= 3) {
    stack(g, 52, -52, 3.4, 2.6, 80, { color: '#8e8a84', bands: 2, light: true });
  }
  // Winderhitzer und Heißwindleitung
  const SH = [0, 34, 38, 42][lv];
  [-44, -30, -16, -2].slice(0, lv + 1).forEach((v) => cowper(g, -46, v, 5.2, SH));
  pipe(g, [[-41, -24, 17], [-25, -24, 17]], 2.4, '#8b8f93');
  // Möllerbunker und Schrägaufzug zur Gicht
  walls(g, 12, 36, -54, -40, 10, '#8d8378');
  flatRoof(g, 12, 36, -54, -40, 10, '#8d8378');
  const H = [0, 52, 58, 64][lv];
  furnace(g, -16, -24, H);
  gallery(g, [14, -44, 10], [-9, -29, H * 0.74], 3.2, 2.6, '#9aa1a8');
  if (lv >= 2) {
    dustCatcher(g, 12, -16, 22);
    pipe(g, [[-14, -22, H], [-6, -18, H - 4], [12, -16, 21]], 2.2, '#6f6a64');
  }
  // Gießhalle mit Glut
  walls(g, -30, 0, -10, 6, 12, '#8a8f93', { ribs: 2, band: T, roofH: 4 });
  strip(g, 's', 6, -27, -3, 3, 7, 3, true);
  gate(g, 'e', 0, -2, 6, 8, '#e08a2c');
  gable(g, 'u', -30, 0, -10, 6, 12, 4, '#5d6166', '#8a8f93');
  // Halden
  heap(g, -44, 34, 10, 8, '#8a4b2e');
  heap(g, -26, 46, 9, 7, COAL);
  if (lv >= 2) heap(g, -48, 52, 6, 4.5, '#8a4b2e');
  // Schienenwagen: Erzwagen, ab Stufe 2 Torpedowagen
  hopper(g, -46, 16);
  if (lv >= 2) torpedo(g, -16, 16);
  // Rechts vorn: Schlackenplatz mit Glut, ab Stufe 3 die Walzwerkhalle
  if (lv >= 3) {
    walls(g, 16, 56, 8, 30, 16, '#9aa1a8', { ribs: 2.4, band: T, roofH: 5 });
    strip(g, 's', 30, 20, 52, 9, 11.5, 3);
    gate(g, 's', 30, 26, 6, 8);
    gate(g, 'e', 56, 19, 7, 9);
    gable(g, 'u', 16, 56, 8, 30, 16, 5, '#6b7075', '#9aa1a8');
  } else {
    flat(g, 18, 54, 10, 30, '#5a5550');
    glow(g, 32, 20, 0.2, 7);
    glow(g, 44, 24, 0.2, 4.5);
    heap(g, 46, 14, 5, 3.5, '#4a4642');
  }
  lorry(g, 0, 40, 'v', '#d29b1d', 'ore');
  flagpole(g, 10, 52, 0, 16, T);
  lamp(g, 8, 30, 9);
  tree(g, 52, 50, 0.85, 1);
  tree(g, 24, 52, 0.8, 2);
}

// ---------- Hütte (Verhüttung von Erz zu Roheisen, seit v5.20) ----------
// Alter gemauerter Hochofen (quadratischer Steinschacht mit Ankerbändern, offene Gicht mit Glut), Gießhalle aus Bruchstein mit
// glühenden Bogentoren, Masselbett mit Glutrinnen, rötliche Erzhalden, Röstöfen, dunkler Ziegelschornstein. Bewusst anders als
// das Stahlwerk (runder Stahlofen, Winderhitzer, Walzwerk): dunkler Stein und Rost statt Stahlgrau.

const STONE = '#6d635b'; // Bruchstein
const STONE_D = '#554c46';
const IRON = '#3a2f2a'; // Ankerbänder, Eisen
const ORE = '#a4462c'; // Erz (rötlich)
const ORE_R = '#b65a35'; // geröstetes Erz
const SOOT = '#6b3a2c'; // dunkler Ziegel (Schornstein, Röstöfen)
const SAND = '#8f7c60'; // Masselbett
const PIG = '#575b60'; // Masseln (Roheisen)

/** Gemauerter Schacht (quadratisch, verjüngt von s0 auf s1) von h0 bis h1: Steinlagen, eiserne Ankerbänder, Deckfläche. */
function stoneShaft(g, u, v, s0, s1, h0, h1, col, bands = []) {
  const { P } = g;
  const sAt = (h) => s0 + ((s1 - s0) * (h - h0)) / (h1 - h0);
  poly(g, [P(u - s0, v + s0, h0), P(u + s0, v + s0, h0), P(u + s1, v + s1, h1), P(u - s1, v + s1, h1)], lit(col, ...FACE.s));
  poly(g, [P(u + s0, v + s0, h0), P(u + s0, v - s0, h0), P(u + s1, v - s1, h1), P(u + s1, v + s1, h1)], lit(col, ...FACE.e));
  if (g.fine) {
    for (let h = h0 + 1.8, k = 0; h < h1 - 0.5; h += 1.8, k++) {
      const s = sAt(h);
      stroke(g, [P(u - s, v + s, h), P(u + s, v + s, h), P(u + s, v - s, h)], 'rgba(25,15,10,0.22)', 0.35);
      const t = sAt(h + 1.8);
      for (let a = -s + (k % 2 ? 1.6 : 3.2); a < s - 0.4; a += 3.2) {
        stroke(g, [P(u + a, v + s, h), P(u + (a * t) / s, v + t, h + 1.8)], 'rgba(25,15,10,0.16)', 0.3);
        stroke(g, [P(u + s, v + a, h), P(u + t, v + (a * t) / s, h + 1.8)], 'rgba(25,15,10,0.16)', 0.3);
      }
    }
  }
  for (const b of bands) {
    const s = sAt(b) + 0.12;
    const t = sAt(b + 1.2) + 0.12;
    poly(g, [P(u - s, v + s, b), P(u + s, v + s, b), P(u + t, v + t, b + 1.2), P(u - t, v + t, b + 1.2)], lit(IRON, ...FACE.s), null);
    poly(g, [P(u + s, v + s, b), P(u + s, v - s, b), P(u + t, v - t, b + 1.2), P(u + t, v + t, b + 1.2)], lit(IRON, ...FACE.e), null);
  }
  poly(g, [P(u - s1, v - s1, h1), P(u + s1, v - s1, h1), P(u + s1, v + s1, h1), P(u - s1, v + s1, h1)], lit(shade(col, 0.1), ...FACE.top));
}

/** Gemauerter Hochofen: Gestell mit glühendem Stichloch, verjüngter Steinschacht, Gichtbühne mit Geländer, offene Gicht mit Glut und Flamme. */
function stoneFurnace(g, u, v, s, H) {
  const { P } = g;
  const h0 = H * 0.28;
  const h1 = H * 0.8;
  const top = s * 0.56;
  shadow(g, u - s, u + s, v - s, v + s, H, 0.22);
  box(g, u - s, u + s, v - s, v + s, 0, h0, STONE_D, shade(STONE_D, 0.15));
  archDoor(g, 's', v + s, u, s * 0.7, h0 * 0.72, true);
  archDoor(g, 'e', u + s, v, s * 0.5, h0 * 0.6, false);
  wallBand(g, u - s, u + s, v - s, v + s, h0 - 1.1, h0, IRON);
  stoneShaft(g, u, v, s * 0.86, top, h0, h1, STONE, [h0 + (h1 - h0) * 0.3, h0 + (h1 - h0) * 0.62]);
  // Gichtbühne mit Geländer
  const b = s * 0.86;
  box(g, u - b, u + b, v - b, v + b, h1, h1 + 0.9, '#4a4f55', snowy('#5b6066'));
  if (g.fine) {
    stroke(g, [P(u - b, v + b, h1 + 2.4), P(u + b, v + b, h1 + 2.4), P(u + b, v - b, h1 + 2.4)], 'rgba(60,64,70,0.9)', 0.45);
    for (let a = -b; a <= b + 0.1; a += b / 2) {
      stroke(g, [P(u + a, v + b, h1 + 0.9), P(u + a, v + b, h1 + 2.4)], 'rgba(60,64,70,0.9)', 0.35);
      stroke(g, [P(u + b, v + a, h1 + 0.9), P(u + b, v + a, h1 + 2.4)], 'rgba(60,64,70,0.9)', 0.35);
    }
  }
  // offene Gicht: niedriger Mauerkranz, Glut, Flamme
  box(g, u - top, u + top, v - top, v + top, h1 + 0.9, h1 + 3.6, STONE_D, '#2a211d');
  glow(g, u, v, h1 + 3.6, top * 1.4);
  flame(g, u - 0.4, v - 0.4, h1 + 3.4, 0.55);
}

/** Röstofen: gedrungener Kegelstumpf aus dunklem Ziegel mit Eisenring und glühender Öffnung. */
function kiln(g, u, v, r, H) {
  shadowRound(g, u, v, r, H, 0.18);
  frustum(g, u, v, r, r * 0.78, 0, H, SOOT, false);
  band(g, u, v, r * 0.9, H * 0.45, H * 0.45 + 1, IRON);
  cyl(g, u, v, r * 0.82, H, H + 0.8, shade(SOOT, 0.2), true);
  glow(g, u, v, H + 0.8, r * 0.9);
  archDoor(g, 's', v + r * 0.98, u, r * 0.7, H * 0.4, true);
}

/** Masselbett: Sandfläche mit Hauptrinne entlang u und Seitenrinnen nach +v; hot = Anteil der glühenden Rinnen. */
function castBed(g, u0, u1, v0, v1, n, hot) {
  flat(g, u0, u1, v0, v1, SAND);
  const { P } = g;
  const w = (u1 - u0) / n;
  stroke(g, [P(u0 + 1, v0 + 2, 0), P(u1 - 1, v0 + 2, 0)], '#ff9a3a', 1.1);
  for (let k = 0; k < n; k++) {
    const a = u0 + w * (k + 0.5);
    const on = k < n * hot;
    stroke(g, [P(a, v0 + 2, 0), P(a, v1 - 1.5, 0)], on ? '#ff8a2a' : '#4c4744', on ? 0.9 : 0.8);
    if (!g.fine) continue;
    for (let b = v0 + 4.5; b < v1 - 2; b += 2.6) stroke(g, [P(a - w * 0.38, b, 0), P(a + w * 0.38, b, 0)], on ? 'rgba(255,170,70,0.9)' : 'rgba(70,66,64,0.8)', 0.55);
  }
  glow(g, u0 + 3, v0 + 2, 0.1, 4.5);
}

/** Stapel Masseln (Roheisenbarren) auf dem Lagerplatz. */
function pigStack(g, u, v, layers) {
  for (let k = 0; k < layers; k++) {
    const h = k * 0.9;
    if (k % 2) box(g, u - 2.2, u + 2.2, v - 1.6, v + 1.6, h, h + 0.9, PIG, tint(PIG, 0.12));
    else box(g, u - 1.8, u + 1.8, v - 2, v + 2, h, h + 0.9, shade(PIG, 0.06), tint(PIG, 0.08));
  }
}

function smelter(g, lv, o) {
  const T = o.color;
  ground(g, '#6e6660');
  flat(g, 14, E, -E, -4, '#7b4a3a'); // Erzplatz
  flat(g, -6, 6, 20, E, ASPH); // Zufahrt
  flat(g, -56, -26, 36, 56, '#5f5955'); // Masselplatz
  castBed(g, -54, -12, 4, 30, [0, 5, 7, 8][lv], [0, 0.6, 0.72, 0.8][lv]);
  // Schornstein, Hochöfen (Stufe 3 ein zweiter)
  brickStack(g, -53, -30, 3.4, 2.4, [0, 46, 52, 58][lv], SOOT);
  const H = [0, 44, 50, 56][lv];
  stoneFurnace(g, -28, -34, 10, H);
  if (lv >= 3) stoneFurnace(g, 0, -45, 7.5, 40);
  // Erz-, Koks- und Röstgut-Halden
  if (lv >= 2) heap(g, 26, -50, 6.5, 5, COAL);
  heap(g, 41, -44, 12, 9, ORE);
  if (lv >= 3) gallery(g, [24, -34, 2], [7.8, -44, 32.8], 2.8, 2.4, '#7d6e64');
  gallery(g, [22, -20, 2], [-19, -32, H * 0.8], 3.2, 2.6, '#7d6e64');
  if (lv >= 2) loader(g, 32, -26);
  // Gießhalle aus Bruchstein mit glühenden Bogentoren
  walls(g, -46, -8, -20, -6, 11, STONE, { band: T, roofH: 4 });
  for (const a of [-40, -32, -24]) archDoor(g, 's', -6, a, 4, 7, true);
  strip(g, 'e', -8, -18, -9, 6.5, 8.6, 2.2, true);
  gable(g, 'u', -46, -8, -20, -6, 11, 4, '#3d3633', STONE);
  if (lv >= 2) heap(g, 46, -21, 9, 7, ORE_R);
  // Röstöfen
  [22, 34, 46].slice(0, lv).forEach((u) => kiln(g, u, 8, 4.5, 9));
  // Masseln, Schlacke, Büro, LKW
  const n = [0, 4, 7, 10][lv];
  for (let k = 0; k < n; k++) pigStack(g, -51 + (k % 5) * 6, 40 + Math.floor(k / 5) * 8, 2 + Math.floor(rnd(k * 7 + 3) * 3));
  if (lv >= 2) {
    heap(g, 44, 27, 7, 5, '#3f3b38');
    glow(g, 41, 29, 2.2, 3.6);
  }
  office(g, 16, 34, 38, 52, 9, '#cfc6b8', { hip: true, roof: '#5a3a30', seed: 23 });
  flagpole(g, 12, 55, 0, 16, T);
  lorry(g, 0, 40, 'v', '#7a4b37', 'ore');
  lamp(g, 8, 24, 9);
  tree(g, 52, 54, 0.8, 1);
  if (lv >= 3) tree(g, -20, 55, 0.75, 2);
}

// ---------- Kerosin-Raffinerie (Öl zu Kerosin, seit v5.20) ----------
// Helle Kugeltanks mit blauem Gürtel, Rundtanks mit gewölbtem Dach und blauen Tankringen in der Auffangwanne, Kolonne, Pumpenhaus
// mit blauem Band, Rohrbrücke mit blauen Leitungen, liegende Drucktanks, Verladestation mit blau-weißen Flugfeld-Tankwagen, ab
// Stufe 3 die Fackel. Anders als die Raffinerie (Schwimmdachtanks, Ofen mit Kamin): hell, blau, Kugeln vorn sichtbar.

const BLUE = '#2f6fb3';
const KTANK = '#eef2f5';

/** Rundtank mit gewölbtem Dach und zwei blauen Tankringen. */
function keroTank(g, u, v, r, H) {
  shadowRound(g, u, v, r, H);
  cyl(g, u, v, r, 0, H, KTANK, false);
  seam(g, u, v, r, H * 0.5);
  for (const f of [0.22, 0.68]) band(g, u, v, r * 1.01, H * f, H * f + 1.9, BLUE);
  cap(g, u, v, r, H, snowy('#e2e7eb'), 0.32);
  if (g.fine) {
    const { P } = g;
    const a = P(u - r * 0.15, v + r * 0.99, 0);
    const b = P(u - r * 0.86, v + r * 0.5, H);
    stroke(g, [a, b], 'rgba(40,60,90,0.75)', 0.9); // Treppe
    stroke(g, [[a[0], a[1] - 1.2 * g.z], [b[0], b[1] - 1.2 * g.z]], 'rgba(40,60,90,0.5)', 0.4);
  }
}

/** Kugeltank mit blauem Gürtel am Äquator. */
function keroSphere(g, u, v, r, h0) {
  sphere(g, u, v, r, h0);
  const { P, ctx, z } = g;
  const [x, y] = P(u, v, h0 + r);
  ctx.beginPath();
  ctx.ellipse(x, y, r * z, (r * z) / 2, 0, 0, Math.PI);
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = Math.max(1, 1.6 * z);
  ctx.stroke();
}

/** Liegender Drucktank entlang u auf Betonsätteln, mit blauem Ring in der Mitte. */
function bullet(g, u0, u1, v, r) {
  const h = r + 1.2;
  flat(g, u0 - 0.5, u1, v - r, v + r + 3, 'rgba(0,0,0,0.16)');
  for (const a of [u0 + 3, u1 - 3]) box(g, a - 0.9, a + 0.9, v - r * 0.8, v + r * 0.8, 0, h - r * 0.4, CONCRETE);
  hcyl(g, 'u', u0, u1, v, h, r, KTANK);
  const { P } = g;
  const m = (u0 + u1) / 2;
  const pts = [];
  for (let k = 0; k <= 12; k++) {
    const t = -Math.PI / 2 + (k / 12) * Math.PI * 1.5;
    pts.push(P(m, v + r * Math.cos(t), h + r * Math.sin(t)));
  }
  stroke(g, pts, BLUE, 1.3);
}

function kero(g, lv, o) {
  const T = o.color;
  ground(g, '#a3aaaf');
  flat(g, 12, 56, -56, -12, '#979b98'); // Boden der Auffangwanne
  flat(g, -E, E, 18, 26, ASPH); // Werkstraße
  flat(g, -4, 6, 26, E, ASPH);
  flat(g, 12, 48, 28, 54, '#8d9296'); // Verladeplatz
  // Fackel (Stufe 3), Kugeltanks hinten links
  if (lv >= 3) {
    stack(g, -54, -2, 1.4, 1.1, 54, { color: '#c9ced3', bands: 2 });
    flame(g, -54, -2, 54, 1.3);
  }
  keroSphere(g, -40, -40, 10, 3);
  if (lv >= 2) keroSphere(g, -16, -46, 7.5, 3);
  if (lv >= 3) keroSphere(g, -44, -14, 7.5, 3);
  // Rundtanks in der Auffangwanne hinten rechts
  bund(g, 12, 56, -56, -12, 'back');
  keroTank(g, 30, -40, 11, 13);
  if (lv >= 2) keroTank(g, 47, -24, 7.5, 11);
  if (lv >= 3) keroTank(g, 24, -20, 6.5, 10);
  bund(g, 12, 56, -56, -12, 'front');
  pipe(g, [[19, -30, 2.4], [8, -30, 2.4], [8, 8, 7.7]], 1.2, BLUE);
  // Kolonne(n) und Pumpenhaus
  if (lv >= 2) column(g, 4, -28, 2.8, 28, { color: '#dfe5ea' });
  const CH = [0, 34, 40, 46][lv];
  column(g, -6, -14, 4, CH, { color: '#dfe5ea' });
  band(g, -6, -14, 4.02, CH - 4, CH - 2.4, BLUE);
  pipe(g, [[-29, -38, 2.4], [-29, -10, 2.4], [-29, -8, 4]], 1.2, BLUE);
  walls(g, -34, -18, -8, 3, 7, '#d4d9dd', { band: BLUE, roofH: 0 });
  gate(g, 's', 3, -26, 5, 5.2, '#8fa6bd');
  door(g, 'e', -18, -2.5, 2.2, 4.2, '#4f5a63');
  flatRoof(g, -34, -18, -8, 3, 7, '#d4d9dd');
  fan(g, -28, -3, 5.7, 1.8);
  // Rohrbrücke mit blauen Leitungen
  rack(g, 'u', -54, 54, 8, 7, [BLUE, '#a3aab0', BLUE]);
  // vorn links: liegende Drucktanks und Leitstand
  if (lv >= 2) bullet(g, -54, -30, 36, 3.6);
  if (lv >= 3) bullet(g, -54, -30, 46, 3.6);
  office(g, -24, -10, 32, 46, 8, '#e4e8ea', { seed: 19 });
  flagpole(g, -8, 52, 0, 16, T);
  // vorn rechts: Verladestation mit Flugfeld-Tankwagen
  const front = canopy(g, 14, 46, 30, lv >= 2 ? 52 : 42, 7.5, T);
  lorry(g, 28, 35, 'u', BLUE, 'tank', { band: BLUE });
  if (lv >= 2) lorry(g, 28, 46, 'u', '#e8e4da', 'tank', { band: BLUE });
  front();
  lamp(g, 9, 14, 9);
  lamp(g, 9, 40, 9);
  tree(g, 53, 56, 0.8, 2);
}

// ---------- 2D von oben ----------
// x = u, y = v; Licht von links oben, Schatten nach rechts unten (wie isokit.js). Dieselbe Anlage wie im Iso-Bild.

function ringTop(c, x, y, r, color, w) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}

/** Schatten eines runden Baus der Höhe h: Scheibe r, nach rechts unten gezogen. */
function roundShadow(c, x, y, r, h, a = 0.24) {
  const s = Math.min(16, h * 0.22);
  c.save();
  c.strokeStyle = `rgba(0,0,0,${a})`;
  c.lineWidth = 2 * r;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + s + 0.01, y + s);
  c.stroke();
  c.restore();
}

/** Runde Scheibe mit Lichtverlauf und dünnem Rand. */
function discTop(c, x, y, r, color, edge = 'rgba(0,0,0,0.35)') {
  const grad = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  grad.addColorStop(0, tint(color, 0.2));
  grad.addColorStop(1, shade(color, 0.22));
  circle(c, x, y, r, grad);
  ringTop(c, x, y, r, edge, 0.4);
}

/** Gebäude mit Flachdach: Schatten, Attika, Dachfläche. */
function blockTop(c, x0, y0, x1, y1, H, wall, deck = DECK) {
  shadowTop(c, x0, y0, x1, y1, H);
  flatTop(c, x0, y0, x1, y1, wall, deck);
}

/** Halle mit Satteldach (First entlang x). */
function hallTop(c, x0, y0, x1, y1, H, roof) {
  shadowTop(c, x0, y0, x1, y1, H);
  gableTop(c, x0, y0, x1, y1, 'u', roof);
}

/** Schornstein von oben: Ring, rotes Kopfband, schwarze Öffnung, Warnlicht, langer Schatten. */
function stackTop(c, x, y, r, H, o = {}) {
  roundShadow(c, x, y, r, H);
  discTop(c, x, y, r + 0.5, o.color ?? '#d6d2c9');
  if (o.bands) ringTop(c, x, y, r * 0.86, RED, r * 0.3);
  circle(c, x, y, r * 0.6, '#262627');
  if (o.light) circle(c, x + r * 0.75, y - r * 0.75, 0.6, '#ff4a3a');
}

/** Dampf von oben: weiche Ballen, nach links oben gezogen, unten grau. */
function steamTop(c, x, y, s) {
  for (const light of [false, true]) {
    for (let k = 0; k < 8; k++) {
      const t = k / 7;
      const R = s * (0.55 + t * 0.5) * (light ? 0.9 : 1);
      const cx = x - t * s * 2.2 + (rnd(k * 17 + 3) - 0.5) * s * 0.6 + (light ? -0.1 : 0.15) * R;
      const cy = y - t * s * 1.5 + (rnd(k * 11 + 5) - 0.5) * s * 0.6 + (light ? -0.1 : 0.15) * R;
      const a = 0.85 - t * 0.35;
      const grad = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.05, cx, cy, R);
      grad.addColorStop(0, light ? `rgba(255,255,255,${a.toFixed(2)})` : `rgba(180,188,198,${(a * 0.8).toFixed(2)})`);
      grad.addColorStop(1, light ? 'rgba(235,239,243,0)' : 'rgba(170,178,188,0)');
      circle(c, cx, cy, R, grad);
    }
  }
}

/** Kühlturm von oben: Mantel vom Fuß (r0) bis zur Krone (r1), Öffnung mit beleuchteter Innenwand, Dampf. */
function coolingTop(c, x, y, r0, r1, H) {
  const col = '#d6d2c9';
  roundShadow(c, x, y, r0 * 0.92, H, 0.26);
  const grad = c.createRadialGradient(x - r0 * 0.45, y - r0 * 0.45, r1 * 0.4, x, y, r0);
  grad.addColorStop(0, tint(col, 0.2));
  grad.addColorStop(1, shade(col, 0.32));
  circle(c, x, y, r0, grad);
  ringTop(c, x, y, r0, 'rgba(0,0,0,0.4)', 0.5);
  ringTop(c, x, y, r0 - 0.9, 'rgba(91,87,81,0.55)', 0.9); // Stützenkranz
  circle(c, x, y, r1 + 0.7, tint(col, 0.12));
  ringTop(c, x, y, r1 + 0.7, 'rgba(0,0,0,0.3)', 0.4);
  circle(c, x, y, r1, '#8a857c'); // Innenwand, rechts unten beleuchtet
  circle(c, x - r1 * 0.16, y - r1 * 0.16, r1 * 0.84, '#2c2a27');
  steamTop(c, x - r1 * 0.2, y - r1 * 0.2, r1 * 0.62);
}

/** Lagertank von oben: Kegeldach mit Nähten oder Schwimmdach, Ring in Teamfarbe. */
function storeTop(c, x, y, r, H, o = {}) {
  roundShadow(c, x, y, r, H);
  discTop(c, x, y, r, TANK);
  if (o.float) {
    circle(c, x, y, r - 1.1, '#c9cdd0');
    ringTop(c, x, y, r - 1.1, 'rgba(0,0,0,0.25)', 0.4);
    lineT(c, [[x - r + 1.4, y + 0.6], [x + r * 0.35, y + 0.6]], 'rgba(90,95,100,0.55)', 0.6); // Rolltreppe
    circle(c, x + r * 0.2, y - r * 0.2, Math.max(0.7, r * 0.1), '#9aa1a8');
  } else {
    c.strokeStyle = 'rgba(0,0,0,0.13)';
    c.lineWidth = 0.35;
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      c.moveTo(x, y);
      c.lineTo(x + Math.cos((k * Math.PI) / 4) * r, y + Math.sin((k * Math.PI) / 4) * r);
    }
    c.stroke();
    circle(c, x, y, Math.max(0.8, r * 0.12), '#b6bcc1');
  }
  if (o.band) ringTop(c, x, y, r - 0.4, o.band, 0.8);
}

/** Säule (Kolonne) von oben mit gelbem Bühnengeländer. */
function columnTop(c, x, y, r, H) {
  roundShadow(c, x, y, r + 0.6, H);
  ringTop(c, x, y, r + 1.5, '#c9a24a', 0.6);
  discTop(c, x, y, r, '#d3d7db');
  circle(c, x, y, r * 0.35, '#9aa1a8');
}

/** Rohr von oben (Linienzug) mit Schatten und Glanzlinie. */
function pipeTop(c, pts, w, col = PIPE) {
  lineT(c, pts.map(([x, y]) => [x + w * 0.5, y + w * 0.5]), 'rgba(0,0,0,0.2)', w);
  lineT(c, pts, shade(col, 0.2), w);
  lineT(c, pts.map(([x, y]) => [x - w * 0.15, y - w * 0.15]), tint(col, 0.35), w * 0.35);
}

/** Rohrbrücke von oben entlang axis von a0 bis a1 bei cc: Querträger und drei Rohre. */
function rackTop(c, axis, a0, a1, cc, cols = ['#a3aab0', '#c9a24a', '#8a6f5a']) {
  const P = axis === 'u' ? (a, b) => [a, b] : (a, b) => [b, a];
  lineT(c, [P(a0, cc + 1.4), P(a1, cc + 1.4)], 'rgba(0,0,0,0.16)', 4.6);
  for (let a = a0; a <= a1 + 0.1; a += 9) lineT(c, [P(a, cc - 2.6), P(a, cc + 2.6)], '#6b7177', 0.8);
  cols.forEach((col, k) => {
    const b = cc - 1.5 + (k * 3) / Math.max(1, cols.length - 1);
    pipeTop(c, [P(a0, b), P(a1, b)], 1.1, col);
  });
}

/** Förderbrücke von oben zwischen [x, y, h]-Punkten, Schatten nach Höhe versetzt. */
function galleryTop(c, a, b, w = 3.2, col = '#b3b7ba') {
  const pts = [[a[0], a[1]], [b[0], b[1]]];
  const sa = Math.min(16, a[2] * 0.22);
  const sb = Math.min(16, b[2] * 0.22);
  lineT(c, [[a[0] + sa, a[1] + sa], [b[0] + sb, b[1] + sb]], 'rgba(0,0,0,0.2)', w);
  lineT(c, pts, shade(col, 0.18), w);
  lineT(c, pts.map(([x, y]) => [x - w * 0.18, y - w * 0.18]), tint(col, 0.22), w * 0.45);
}

/** Langgezogene Halde von oben: Walm mit Grat, helle Brocken. */
function pileTop(c, x0, y0, x1, y1, h, color) {
  shadowTop(c, x0, y0, x1, y1, h * 0.6);
  hipTop(c, x0, y0, x1, y1, color, 0);
  c.fillStyle = tint(color, 0.3);
  for (let k = 0; k < 30; k++) c.fillRect(x0 + rnd(k * 13 + 7 * x0) * (x1 - x0), y0 + rnd(k * 19 + 3 * y0) * (y1 - y0), 0.6, 0.45);
}

/** Sheddach von oben: n Zähne entlang x, Glasband an der hohen Kante. */
function sawTop(c, x0, y0, x1, y1, n, roof) {
  const w = (x1 - x0) / n;
  for (let k = 0; k < n; k++) {
    const a = x0 + k * w;
    const grad = c.createLinearGradient(a, 0, a + w, 0);
    grad.addColorStop(0, shade(roof, 0.14));
    grad.addColorStop(1, tint(roof, 0.14));
    rectF(c, a, y0, a + w, y1, grad);
    rectF(c, a + w - 0.8, y0, a + w, y1, '#86a8c2');
  }
  c.strokeStyle = 'rgba(0,0,0,0.45)';
  c.lineWidth = 0.5;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

/** Erdbunker von oben: Grastonne entlang x, Stirnwand mit Tor und Flügelmauern bei x1, Lüfter. */
function bunkerTop(c, x0, y0, x1, y1) {
  shadowTop(c, x0, y0, x1, y1, 5);
  vaultTop(c, x0, y0, x1, y1, 'u', GRASS, false);
  rectS(c, x1 - 0.6, y0 - 1.4, x1 + 2.2, y0 + 0.4, CONCRETE, 'rgba(0,0,0,0.4)', 0.3);
  rectS(c, x1 - 0.6, y1 - 0.4, x1 + 2.2, y1 + 1.4, CONCRETE, 'rgba(0,0,0,0.4)', 0.3);
  rectF(c, x1 - 0.2, y0 + 0.4, x1 + 0.7, y1 - 0.4, '#8f989e');
  circle(c, x0 + (x1 - x0) * 0.35, (y0 + y1) / 2, 1, '#8a9096');
}

/** Palette von oben (Holzrand, Ware). */
function palletTop(c, x, y, s, col = BRICKS) {
  rectF(c, x - s + 0.7, y - s + 0.7, x + s + 0.7, y + s + 0.7, 'rgba(0,0,0,0.25)');
  rectS(c, x - s, y - s, x + s, y + s, '#9c7a52', 'rgba(0,0,0,0.3)', 0.25);
  rectS(c, x - s + 0.3, y - s + 0.3, x + s - 0.3, y + s - 0.3, tint(col, 0.08), 'rgba(0,0,0,0.25)', 0.25);
  lineT(c, [[x - s + 0.3, y], [x + s - 0.3, y]], 'rgba(0,0,0,0.18)', 0.25);
}

/** LKW von oben (Fahrerhaus bei +x bzw. +y). */
function lorryTop(c, x, y, along, cabCol, load, o = {}) {
  const U = along === 'u';
  const R = (a0, a1, b0, b1, fill, line = 'rgba(0,0,0,0.4)') =>
    U ? rectS(c, x + a0, y + b0, x + a1, y + b1, fill, line, 0.3) : rectS(c, x + b0, y + a0, x + b1, y + a1, fill, line, 0.3);
  if (U) rectF(c, x - 6, y - 1.3, x + 8, y + 3.3, 'rgba(0,0,0,0.25)');
  else rectF(c, x - 1.3, y - 6, x + 3.3, y + 8, 'rgba(0,0,0,0.25)');
  const bed = 3.2;
  if (load === 'tank') {
    R(-7, bed, -2.1, 2.1, TANK);
    R(-7, bed, -0.5, 0.4, tint(TANK, 0.5), 'rgba(0,0,0,0)');
    if (o.band) R(-2.2, -1, -2.1, 2.1, o.band);
  } else if (load === 'tarp') {
    R(-7, bed, -2.3, 2.3, OLIVE);
    for (let a = -5; a < bed; a += 2.2) R(a, a + 0.3, -2.3, 2.3, shade(OLIVE, 0.2), 'rgba(0,0,0,0)');
  } else if (load === 'coal' || load === 'ore') {
    R(-7, bed, -2.3, 2.3, '#d29b1d');
    R(-6.5, bed - 0.5, -1.8, 1.8, load === 'coal' ? COAL : '#8a4b2e', 'rgba(0,0,0,0.2)');
  } else {
    R(-7, bed, -2.3, 2.3, '#7d6a55');
    if (load === 'bricks') for (const a of [-4.8, -1.4]) R(a - 1.5, a + 1.5, -1.7, 1.7, BRICKS);
    if (load === 'logs' && U) logsTop(c, x - 6.6, y - 2, x + bed - 0.4, y + 2, 2);
  }
  R(bed + 0.4, 7, -2.3, 2.3, cabCol);
  R(6, 7, -1.9, 1.9, '#2c3a47', 'rgba(0,0,0,0)');
}

/** Gabelstapler von oben mit Palette vorn (+x). */
function forkliftTop(c, x, y, col = BRICKS) {
  rectF(c, x - 1.6, y - 0.7, x + 2.4, y + 2.3, 'rgba(0,0,0,0.22)');
  rectS(c, x - 2.4, y - 1.5, x + 1.6, y + 1.5, '#eea040', 'rgba(0,0,0,0.4)', 0.3);
  rectS(c, x - 1.8, y - 1.6, x + 1.2, y + 1.6, '#3a3d40', 'rgba(0,0,0,0.4)', 0.2);
  palletTop(c, x + 3.6, y, 1.4, col);
}

/** Fahne in Teamfarbe von oben: Stange als Punkt, Tuch, Schatten der Stange. */
function flagTop(c, x, y, color) {
  lineT(c, [[x, y], [x + 3.4, y + 3.4]], 'rgba(0,0,0,0.25)', 0.5);
  rectS(c, x + 0.3, y - 0.7, x + 4.8, y + 1.3, color, 'rgba(0,0,0,0.35)', 0.25);
  circle(c, x, y, 0.65, '#e9e9e9');
}

function lampTop(c, x, y) {
  lineT(c, [[x, y], [x + 2, y + 2]], 'rgba(0,0,0,0.2)', 0.4);
  circle(c, x, y, 0.75, '#4a4f55');
  circle(c, x, y, 0.4, '#f3e3a0');
}

/** Transformator von oben: Kasten mit Kühlrippen, drei Durchführungen. */
function transformerTop(c, x, y) {
  rectF(c, x - 2, y - 1.4, x + 4.2, y + 3.6, 'rgba(0,0,0,0.25)');
  rectS(c, x - 3, y - 2.4, x + 3, y + 2.4, '#87919a', 'rgba(0,0,0,0.45)', 0.35);
  for (let a = -2.2; a <= 2.3; a += 0.9) lineT(c, [[x + a, y - 2.4], [x + a, y - 1.6]], '#5f676e', 0.4);
  rectF(c, x - 2.6, y - 2.2, x + 0.6, y - 0.8, '#9aa3ab');
  for (const a of [-1.6, 0.2, 2]) circle(c, x + a, y + 1, 0.5, '#9b6a45');
}

/** Strommast von oben: Gitterfuß, Traversen entlang y. */
function pylonTop(c, x, y, H) {
  latticeTop(c, x, y, 2.4, H * 0.6, '#9ba2a8');
  lineT(c, [[x, y - 6], [x, y + 6]], '#9ba2a8', 0.8);
  lineT(c, [[x + 0.4, y - 4.5], [x + 0.4, y + 4.5]], '#7d848a', 0.5);
}

const wireTop = (c, a, b) => lineT(c, [a, b], 'rgba(40,44,48,0.55)', 0.28);

/** Zaun von oben als gestrichelte Linie. */
function fenceLineTop(c, a, b) {
  c.save();
  c.setLineDash([1.6, 0.9]);
  lineT(c, [a, b], 'rgba(55,60,66,0.75)', 0.45);
  c.restore();
}

/** Parkplatzlinien quer zur Fahrbahn. */
function stallsTop(c, x0, x1, y0, y1, step = 5.5) {
  for (let a = x0; a <= x1 + 0.1; a += step) lineT(c, [[a, y0], [a, y1]], 'rgba(235,232,220,0.7)', 0.5);
}

/** Kegelstumpf-Turm mit Dach (Wasserturm) von oben. */
function waterTowerTop(c, x, y, H, team) {
  roundShadow(c, x, y, 4.6, H);
  for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) circle(c, x + a, y + b, 0.5, '#6d7277');
  discTop(c, x, y, 4.8, '#7d8287');
  ringTop(c, x, y, 4.5, team, 0.6);
  circle(c, x - 0.4, y - 0.4, 0.9, tint('#7d8287', 0.3));
}

/** Kleiner Turm mit Walmdach (Wachturm) von oben. */
function watchtowerTop(c, x, y, H) {
  shadowTop(c, x - 3, y - 3, x + 3, y + 3, H + 5);
  hipTop(c, x - 3, y - 3, x + 3, y + 3, '#4f5348');
}

/** Bagger von oben: gelber Oberwagen, Ausleger nach +x. */
function excavatorTop(c, x, y) {
  rectF(c, x - 3.2, y - 2.6, x + 3.2, y + 2.6, '#3a3d40');
  yellowTop(c, x - 2.4, y - 1.9, x + 2, y + 1.9);
  lineT(c, [[x + 1, y], [x + 7, y - 1]], '#c99a18', 1.1);
  rectF(c, x + 6.4, y - 2.2, x + 8, y + 0.2, '#4a4d50');
}

/** Radlader von oben: gelber Körper, Schaufel vorn (+x). */
function loaderTop(c, x, y) {
  yellowTop(c, x - 3, y - 1.8, x + 2.6, y + 1.8);
  rectF(c, x - 2.4, y - 1.4, x - 0.4, y + 1.4, '#2c3a47');
  rectS(c, x + 2.8, y - 2.4, x + 4, y + 2.4, '#55595d', 'rgba(0,0,0,0.4)', 0.3);
}

const conveyorTop = (c, a, b) => {
  lineT(c, [a, b], '#4a4f55', 1.6);
  lineT(c, [a, b], '#2f3236', 0.7);
};

/** Glühender Fleck von oben. */
function glowTop(c, x, y, r) {
  const grad = c.createRadialGradient(x, y, r * 0.1, x, y, r);
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.4, HOT);
  grad.addColorStop(1, 'rgba(230,90,30,0)');
  circle(c, x, y, r, grad);
}

/** Wagen auf Schienen von oben: Erzwagen (Ladung) oder Torpedowagen. */
function hopperTop(c, x, y, load = '#8a4b2e') {
  rectF(c, x - 4.5, y - 1.3, x + 6.5, y + 3.3, 'rgba(0,0,0,0.25)');
  rectS(c, x - 5.5, y - 2.3, x + 5.5, y + 2.3, '#5a4a40', 'rgba(0,0,0,0.45)', 0.3);
  rectF(c, x - 5, y - 1.8, x + 5, y + 1.8, load);
}
function torpedoTop(c, x, y) {
  rectF(c, x - 5.5, y - 1.8, x + 7.5, y + 3.8, 'rgba(0,0,0,0.25)');
  const grad = c.createLinearGradient(0, y - 2.8, 0, y + 2.8);
  grad.addColorStop(0, tint('#6e5a4d', 0.25));
  grad.addColorStop(1, shade('#6e5a4d', 0.3));
  c.fillStyle = grad;
  c.beginPath();
  c.ellipse(x, y, 6.6, 2.8, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 0.35;
  c.stroke();
  glowTop(c, x, y, 2);
}

/** Geschoss-Denkmal von oben: Sockel, Geschossspitze mit gelbem Ring. */
function monumentTop(c, x, y, r, H) {
  roundShadow(c, x, y, r, H);
  rectS(c, x - r - 2.2, y - r - 2.2, x + r + 2.2, y + r + 2.2, '#d1ccc0', 'rgba(0,0,0,0.35)', 0.35);
  discTop(c, x, y, r, OLIVE);
  ringTop(c, x, y, r * 0.7, '#e3c43a', 0.6);
  circle(c, x - r * 0.15, y - r * 0.15, r * 0.25, tint(OLIVE, 0.35));
}

/** Gemauerter Schornstein von oben (quadratisch). */
function brickStackTop(c, x, y, s, H) {
  shadowTop(c, x - s, y - s, x + s, y + s, H);
  rectS(c, x - s - 0.8, y - s - 0.8, x + s + 0.8, y + s + 0.8, tint(BRICK, 0.05), 'rgba(0,0,0,0.45)', 0.35);
  rectF(c, x - s + 0.3, y - s + 0.3, x + s - 0.3, y + s - 0.3, '#2a2622');
}

/** Olivgrüne Kistenstapel von oben (Höhe nach Zufall wie im Iso-Bild). */
function crateTop(c, a, b, h) {
  shadowTop(c, a - 3, b - 3, a + 3, b + 3, h);
  rectF(c, a - 3, b - 3, a + 3, b + 3, '#9c7a52');
  rectS(c, a - 2.8, b - 2.8, a + 2.8, b + 2.8, '#69744c', 'rgba(0,0,0,0.4)', 0.3);
  lineT(c, [[a - 2.8, b], [a + 2.8, b]], 'rgba(0,0,0,0.22)', 0.35);
  lineT(c, [[a, b - 2.8], [a, b + 2.8]], 'rgba(0,0,0,0.22)', 0.35);
}

const treesTop = (c, list) => list.forEach(([x, y, s, t]) => treeTop(c, x, y, 6 * s, t));

// Kraftwerk
function powerTop(c, lv, o) {
  const T = o.color;
  rectF(c, -E, -E, E, E, CONCRETE);
  rectF(c, -E, -6, -20, E, '#57534b');
  rectF(c, 14, 26, E, E, GRAVEL);
  rectF(c, -18, 34, 12, E, ASPH);
  stallsTop(c, -16, 10, 44, 54);
  rectF(c, -18, 12, 12, 34, GRASS);
  // Kohle, Förderbrücke, Radlader
  pileTop(c, -55, -2, -42, 52, lv >= 3 ? 9 : 7.5, COAL);
  if (lv >= 3) pileTop(c, -39, 4, -31, 22, 5.5, COAL);
  if (lv >= 2) pileTop(c, -39, 32, -31, 55, 6, COAL);
  if (lv >= 2) loaderTop(c, -35, 27);
  // Pumpenhaus mit Leitungen
  pipeTop(c, [[28, -1], [33.5, -1], [33.5, -21]], 1.3, '#7f8d96');
  pipeTop(c, [[28, 3], [36.5, 3], [36.5, -20]], 1.3, '#7f8d96');
  blockTop(c, 16, -5, 28, 7, 8, '#c9c4b4');
  // Rauchgasreinigung, Kesselhaus, Treppenhaus, Maschinenhaus
  const BH = [0, 40, 46, 50][lv];
  rectS(c, -46, -45, -38, -40, '#8f9499', 'rgba(0,0,0,0.35)', 0.3);
  if (lv >= 2) {
    rectS(c, -12, -49, -6, -45, '#8f9499', 'rgba(0,0,0,0.35)', 0.3);
    roundShadow(c, -2, -50, 6.4, 38);
    discTop(c, -2, -50, 6.4, '#c9cdd1');
  }
  blockTop(c, -38, -40, -12, -16, BH, '#c4c9cd');
  circle(c, -30, -30, 2.2, '#5f6468');
  acTop(c, -20, -34, 2.6);
  blockTop(c, -19, -16, -13, -11, BH + 4, '#aeb4b9');
  hallTop(c, -10, -38, 10, -18, 25, '#7d8287');
  rectF(c, -11.5, -17, 11.5, -16, T); // Traufe in Teamfarbe
  galleryTop(c, [-28, 26, 3], [-28, -16, 33], 3.2, '#a9adb0');
  // Schornstein, Kühltürme
  stackTop(c, -46, -46, 4.2, [0, 92, 102, 112][lv], { bands: lv >= 3 ? 3 : 2, light: true });
  const big = lv >= 2;
  coolingTop(c, 39, -39, big ? 19.5 : 18.5, big ? 13.9 : 13.2, big ? 60 : 54);
  if (lv >= 3) coolingTop(c, 44, -11, 14, 10.1, 44);
  // Verwaltung, Fahne, Autos, Laterne, Bäume
  blockTop(c, -12, 16, 8, 30, 12, '#e3ddd0');
  acTop(c, -6, 22.3, 2.2);
  flagTop(c, -15, 32, T);
  [[-13, 49], [-2, 49], [3.5, 49]].slice(0, lv).forEach(([x, y], k) => carTop(c, x, y, 'v', CAR_COLORS[(k * 3 + 1) % CAR_COLORS.length]));
  lampTop(c, 12, 33);
  treesTop(c, [[-6, 55, 0.85, 1], [8, 56, 0.8, 2]]);
  // Umspannwerk
  const tr = [[24, 36], [24, 48], [33, 54]].slice(0, lv);
  tr.forEach(([x, y]) => transformerTop(c, x, y));
  pylonTop(c, 46, 32, 22);
  pylonTop(c, 46, 50, 22);
  for (const [x, y] of tr) wireTop(c, [x, y + 1], [46, y < 42 ? 32 : 50]);
  for (const y of [32, 50]) for (const s of [-4.5, 4.5]) wireTop(c, [46, y + s], [E, y + s * 0.8]);
}

// BM-Werk
function bmTop(c, lv, o) {
  const T = o.color;
  rectF(c, -E, -E, E, E, '#b9a37d');
  rectF(c, -56, -2, -14, 30, '#c2b8a6');
  rectF(c, -8, 4, 8, E, ASPH);
  rectF(c, 14, 24, E, E, GRASS);
  // Lehm, Bagger, Förderband
  heapTop(c, 30, -42, 12, '#a5653f');
  if (lv >= 2) {
    conveyorTop(c, [18, -47], [-13, -47]);
    excavatorTop(c, 20, -30);
  }
  // Ringofen mit Schornstein
  hallTop(c, -54, -54, -14, -38, 13, '#5e5049');
  brickStackTop(c, -34, -46, 2.5, [0, 46, 52, 58][lv]);
  // Trockenschuppen, Stufe 3 Tunnelofen
  hallTop(c, -54, -32, -16, -20, 7.6, '#6a5b4e');
  if (lv === 2) hallTop(c, -54, -16, -16, -5, 7.6, '#6a5b4e');
  if (lv >= 3) {
    blockTop(c, -54, -16, -16, -5, 9, '#b8bec2');
    rectF(c, -54, -5.8, -16, -5, T);
    stackTop(c, -44, -11, 1.3, 26, { color: '#9aa1a8' });
    stackTop(c, -30, -11, 1.3, 26, { color: '#9aa1a8' });
  }
  // Holzlager, Sägeschuppen
  logsTop(c, 14, -24, 40, -15, 2);
  planksTop(c, 44, -24, 54, -14);
  if (lv >= 2) {
    logsTop(c, 14, -11, 40, -2, 2);
    hallTop(c, 14, 3, 40, 13, 8.5, '#6a5b4e');
  }
  // Palettenlager, Gabelstapler
  const n = [0, 8, 14, 20][lv];
  let k = 0;
  for (const y of [5, 12, 19, 26]) for (const x of [-50, -43, -36, -29, -22]) if (k++ < n) palletTop(c, x, y, 2.4);
  if (lv >= 2) forkliftTop(c, -14, 12);
  // Büro, Fahne, LKW, Auto, Laterne, Bäume
  shadowTop(c, 22, 28, 42, 42, 14);
  hipTop(c, 22, 28, 42, 42, '#8a4a36');
  flagTop(c, 18, 46, T);
  lorryTop(c, 0, 38, 'v', '#c8463a', 'bricks');
  if (lv >= 3) lorryTop(c, 28, 18, 'u', '#3a6fb3', 'logs');
  carTop(c, 34, 50, 'u', CAR_COLORS[1]);
  lampTop(c, 9, 26);
  treesTop(c, [[52, 8, 0.9, 0], [56, 22, 0.8, 1], [16, 56, 0.85, 2]]);
}

// Munitionswerk
function munTop(c, lv, o) {
  const T = o.color;
  rectF(c, -E, -E, E, E, '#8f9579');
  rectF(c, -12, -24, 2, E, ASPH);
  rectF(c, -54, 4, -20, 44, '#9b9f8c');
  rectF(c, 18, 20, E, E, GRASS);
  rectF(c, 6, 2, 34, 20, ASPH);
  stallsTop(c, 7.5, 30.5, 3, 19, 8);
  // Fertigungshalle, Lüfter, Bunker, Stufe 3 Lagerhalle
  shadowTop(c, -52, -52, -8, -28, 15);
  sawTop(c, -52, -52, -8, -28, 5, '#6d7368');
  rectF(c, -52, -28.6, -8, -28, T);
  if (lv >= 2) for (const x of [-45, -27]) stackTop(c, x, -31, 1.8, 22, { color: '#9aa1a8' });
  bunkerTop(c, 8, -52, 46, -38);
  if (lv >= 2) bunkerTop(c, 8, -32, 46, -18);
  if (lv >= 3) {
    bunkerTop(c, 8, -12, 46, 2);
    blockTop(c, -52, -20, -24, -2, 9, '#b0b49f');
  }
  waterTowerTop(c, 52, -47, 26, T);
  // Kisten, Gabelstapler, LKW
  const n = [0, 6, 9, 12][lv];
  let k = 0;
  for (const y of [10, 20, 30, 40]) for (const x of [-49, -40, -31]) {
    if (k++ >= n) continue;
    crateTop(c, x, y, 2.6 * (1 + Math.floor(rnd(k * 7) * 2.4)));
  }
  if (lv >= 2) forkliftTop(c, -20, 14, '#596440');
  lorryTop(c, -5, 26, 'v', OLIVE, 'tarp');
  [11, 19, 27].slice(0, lv).forEach((x) => lorryTop(c, x, 11, 'v', OLIVE, 'tarp'));
  // Wache, Schranke, Fahnen, Denkmal, Bäume, Wachturm, Zaun
  shadowTop(c, 3.4, 43.4, 10.6, 50.6, 7);
  rectS(c, 3.4, 43.4, 10.6, 50.6, '#55585b', 'rgba(0,0,0,0.45)', 0.35);
  c.save();
  c.setLineDash([1.5, 1.5]);
  lineT(c, [[-12, 51.8], [3, 51.8]], '#d23a3a', 0.8);
  c.lineDashOffset = 1.5;
  lineT(c, [[-12, 51.8], [3, 51.8]], '#e8e4d4', 0.8);
  c.restore();
  flagTop(c, 14, 54, T);
  flagTop(c, -16, 54, T);
  monumentTop(c, 36, 38, 3 + lv * 0.4, 16 + lv * 3);
  treesTop(c, [[52, 24, 0.9, 0], [22, 52, 0.85, 1], [52, 50, 0.8, 2]]);
  if (lv >= 3) watchtowerTop(c, -50, 50, 14);
  for (const [a, b] of [[[-56, 56], [-56, -56]], [[-56, -56], [56, -56]], [[-56, 56], [-12, 56]], [[3, 56], [56, 56]], [[56, 56], [56, -56]]]) fenceLineTop(c, a, b);
}

// Raffinerie
function fuelTop(c, lv, o) {
  const T = o.color;
  rectF(c, -E, -E, E, E, '#a6aaac');
  rectS(c, -56, -56, -6, -6, '#979891', CONCRETE, 1.4);
  rectF(c, -E, 2, E, 10, ASPH);
  rectF(c, -10, 10, 0, E, ASPH);
  storeTop(c, -40, -40, 13, 12, { float: true, band: T });
  storeTop(c, -16, -44, 8.5, 10);
  if (lv >= 2) storeTop(c, -42, -17, 8.5, 10, { float: true, band: T });
  if (lv >= 3) storeTop(c, -19, -20, 7, 9);
  pipeTop(c, [[-27, -40], [-4, -40]], 1.2);
  // Prozessanlage
  if (lv >= 2) rackTop(c, 'v', -50, -6, 4);
  rackTop(c, 'u', -4, 54, -2);
  if (lv >= 3) columnTop(c, 12, -46, 3, 28);
  if (lv >= 2) columnTop(c, 36, -42, 3.6, 34);
  columnTop(c, 22, -28, 4.8, [0, 38, 48, 56][lv]);
  blockTop(c, 30, -22, 46, -10, 9, '#b9a48a');
  stackTop(c, 41, -16, 1.6, 30, { color: '#a7adb2', bands: 1 });
  if (lv >= 3) {
    stackTop(c, 52, -52, 1.1, 66, { color: '#b9bfc4', bands: 2 });
    glowTop(c, 51.4, -52.6, 2.4);
  }
  if (lv >= 2) sphereTop(c, 42, 22, 7.5);
  if (lv >= 3) sphereTop(c, 42, 42, 7.5);
  // Verladestation: Tankwagen unter dem Dach (Dach durchscheinend)
  const v1 = lv >= 2 ? 44 : 34;
  lorryTop(c, -37, 26, 'u', '#d6d2c6', 'tank', { band: T });
  if (lv >= 2) lorryTop(c, -37, 38, 'u', '#c8463a', 'tank', { band: T });
  shadowTop(c, -52, 18, -22, v1, 8);
  rectS(c, -52, 18, -22, v1, 'rgba(214,218,221,0.55)', 'rgba(0,0,0,0.45)', 0.4);
  for (let x = -51; x <= -22.9; x += 28 / 3) lineT(c, [[x, 18], [x, v1]], 'rgba(107,113,119,0.7)', 0.5);
  rectF(c, -52, v1 - 0.8, -22, v1, T);
  // Leitstand, Fahne, Laternen, Bäume
  blockTop(c, 4, 36, 22, 50, 8, '#e1dccf');
  acTop(c, 9.4, 42.3, 2.2);
  flagTop(c, 25, 52, T);
  lampTop(c, 1, 14);
  lampTop(c, 1, 40);
  treesTop(c, [[-14, 52, 0.85, 1], [52, 6, 0.8, 2]]);
}

function sphereTop(c, x, y, r) {
  roundShadow(c, x, y, r, r * 2 + 3);
  ball(c, x, y, r, '#eef0f2');
  circle(c, x - 0.3, y - 0.3, 0.8, '#9aa1a8');
}

// Stahlwerk
function steelTop(c, lv, o) {
  const T = o.color;
  rectF(c, -E, -E, E, E, '#827d75');
  rectF(c, -E, 11, 12, 21, '#6a655e');
  rectF(c, -6, 21, 6, E, ASPH);
  railsTop(c, -E, 12, 16);
  // Schlackenplatz oder Walzwerk
  if (lv >= 3) {
    hallTop(c, 16, 8, 56, 30, 21, '#6b7075');
    rectF(c, 14.5, 30.5, 57.5, 31.5, T);
  } else {
    rectF(c, 18, 10, 54, 30, '#5a5550');
    glowTop(c, 32, 20, 7);
    glowTop(c, 44, 24, 4.5);
    heapTop(c, 46, 14, 5, '#4a4642');
  }
  // Halden, Wagen
  heapTop(c, -44, 34, 10, '#8a4b2e');
  heapTop(c, -26, 46, 9, COAL);
  if (lv >= 2) heapTop(c, -48, 52, 6, '#8a4b2e');
  hopperTop(c, -46, 16);
  if (lv >= 2) torpedoTop(c, -16, 16);
  // Möllerbunker, Gießhalle, Staubsack, Leitungen
  blockTop(c, 12, -54, 36, -40, 10, '#8d8378');
  hallTop(c, -30, -10, 0, 6, 16, '#5d6166');
  rectF(c, -31.5, 6.5, 1.5, 7.5, T);
  glowTop(c, 2, -2, 3);
  const H = [0, 52, 58, 64][lv];
  if (lv >= 2) {
    pipeTop(c, [[-14, -22], [-6, -18], [12, -16]], 2.2, '#6f6a64');
    roundShadow(c, 12, -16, 5.4, 22);
    discTop(c, 12, -16, 5.4, '#7c8085');
    circle(c, 12, -16, 1.4, '#5b5f63');
  }
  pipeTop(c, [[-41, -24], [-25, -24]], 2.4, '#8b8f93');
  // Winderhitzer, Hochofen, Schrägaufzug
  const SH = [0, 34, 38, 42][lv];
  [-44, -30, -16, -2].slice(0, lv + 1).forEach((y) => {
    roundShadow(c, -46, y, 5.2, SH);
    ball(c, -46, y, 5.2, '#8f959a');
  });
  roundShadow(c, -16, -24, 10.6, H, 0.26);
  for (const [a, b] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) circle(c, -16 + a, -24 + b, 0.8, '#45494e');
  discTop(c, -16, -24, 10.6, RUST);
  discTop(c, -16, -24, 8.6, '#5b5f63');
  for (const [a, b] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) lineT(c, [[-16 + a, -24 + b], [-16, -24]], '#6f6a64', 1.6);
  discTop(c, -16, -24, 1.8, '#6f6a64');
  galleryTop(c, [14, -44, 10], [-9, -29, H * 0.74], 3.2, '#9aa1a8');
  if (lv >= 3) stackTop(c, 52, -52, 2.6, 80, { color: '#8e8a84', bands: 2, light: true });
  // LKW, Fahne, Laterne, Bäume
  lorryTop(c, 0, 40, 'v', '#d29b1d', 'ore');
  flagTop(c, 10, 52, T);
  lampTop(c, 8, 30);
  treesTop(c, [[52, 50, 0.85, 1], [24, 52, 0.8, 2]]);
}

// Hütte
/** Gemauerter Hochofen von oben: Gestell, Steinschacht mit Ankerband, Gichtbühne, offene Gicht mit Glut. */
function stoneFurnaceTop(c, x, y, s, H) {
  shadowTop(c, x - s, y - s, x + s, y + s, H);
  rectS(c, x - s, y - s, x + s, y + s, STONE_D, 'rgba(0,0,0,0.45)', 0.4);
  const b = s * 0.86;
  rectS(c, x - b, y - b, x + b, y + b, '#5b6066', 'rgba(0,0,0,0.45)', 0.35);
  c.save();
  c.setLineDash([0.6, 0.6]);
  c.strokeStyle = 'rgba(40,44,48,0.8)';
  c.lineWidth = 0.3;
  c.strokeRect(x - b + 0.4, y - b + 0.4, 2 * b - 0.8, 2 * b - 0.8);
  c.restore();
  const t = s * 0.56;
  rectS(c, x - t, y - t, x + t, y + t, STONE, 'rgba(0,0,0,0.45)', 0.35);
  rectF(c, x - t + 0.9, y - t + 0.9, x + t - 0.9, y + t - 0.9, '#2a211d');
  glowTop(c, x, y, t * 1.1);
}

function kilnTop(c, x, y, r, H) {
  roundShadow(c, x, y, r, H);
  discTop(c, x, y, r, SOOT);
  ringTop(c, x, y, r * 0.86, IRON, 0.5);
  circle(c, x, y, r * 0.62, '#2a211d');
  glowTop(c, x, y, r * 0.7);
}

function castBedTop(c, x0, y0, x1, y1, n, hot) {
  rectF(c, x0, y0, x1, y1, SAND);
  const w = (x1 - x0) / n;
  lineT(c, [[x0 + 1, y0 + 2], [x1 - 1, y0 + 2]], '#ff9a3a', 1.1);
  for (let k = 0; k < n; k++) {
    const a = x0 + w * (k + 0.5);
    const on = k < n * hot;
    lineT(c, [[a, y0 + 2], [a, y1 - 1.5]], on ? '#ff8a2a' : '#4c4744', 0.8);
    for (let b = y0 + 4.5; b < y1 - 2; b += 2.6) lineT(c, [[a - w * 0.38, b], [a + w * 0.38, b]], on ? 'rgba(255,170,70,0.9)' : 'rgba(70,66,64,0.8)', 0.55);
  }
  glowTop(c, x0 + 3, y0 + 2, 4.5);
}

function pigTop(c, x, y) {
  rectF(c, x - 1.4, y - 1.2, x + 2.8, y + 2.6, 'rgba(0,0,0,0.25)');
  rectS(c, x - 2.2, y - 2, x + 2.2, y + 2, PIG, 'rgba(0,0,0,0.4)', 0.3);
  for (const d of [-1, 0, 1]) lineT(c, [[x - 2, y + d], [x + 2, y + d]], tint(PIG, 0.15), 0.3);
}

function smelterTop(c, lv, o) {
  const T = o.color;
  rectF(c, -E, -E, E, E, '#6e6660');
  rectF(c, 14, -E, E, -4, '#7b4a3a');
  rectF(c, -6, 20, 6, E, ASPH);
  rectF(c, -56, 36, -26, 56, '#5f5955');
  castBedTop(c, -54, 4, -12, 30, [0, 5, 7, 8][lv], [0, 0.6, 0.72, 0.8][lv]);
  // Halden, Röstöfen, Schlacke
  heapTop(c, 41, -44, 12, ORE);
  if (lv >= 2) {
    heapTop(c, 26, -50, 6.5, COAL);
    heapTop(c, 46, -21, 9, ORE_R);
    loaderTop(c, 32, -26);
    heapTop(c, 44, 27, 7, '#3f3b38');
    glowTop(c, 42, 28, 3.2);
  }
  [22, 34, 46].slice(0, lv).forEach((x) => kilnTop(c, x, 8, 4.5, 9));
  // Gießhalle, Hochöfen, Schrägaufzug, Schornstein
  hallTop(c, -46, -20, -8, -6, 15, '#3d3633');
  rectF(c, -47.5, -6, -6.5, -5, T);
  for (const x of [-40, -32, -24]) glowTop(c, x, -4.6, 2.2);
  const H = [0, 44, 50, 56][lv];
  stoneFurnaceTop(c, -28, -34, 10, H);
  if (lv >= 3) {
    stoneFurnaceTop(c, 0, -45, 7.5, 40);
    galleryTop(c, [24, -34, 2], [7.8, -44, 32.8], 2.8, '#7d6e64');
  }
  galleryTop(c, [22, -20, 2], [-19, -32, H * 0.8], 3.2, '#7d6e64');
  shadowTop(c, -56.4, -33.4, -49.6, -26.6, [0, 46, 52, 58][lv]);
  rectS(c, -56.2, -33.2, -49.8, -26.8, tint(SOOT, 0.05), 'rgba(0,0,0,0.45)', 0.35);
  rectF(c, -55.1, -32.1, -50.9, -27.9, '#2a2622');
  // Masseln, Büro, Fahne, LKW, Laterne, Bäume
  const n = [0, 4, 7, 10][lv];
  for (let k = 0; k < n; k++) pigTop(c, -51 + (k % 5) * 6, 40 + Math.floor(k / 5) * 8);
  shadowTop(c, 16, 38, 34, 52, 13);
  hipTop(c, 16, 38, 34, 52, '#5a3a30');
  flagTop(c, 12, 55, T);
  lorryTop(c, 0, 40, 'v', '#7a4b37', 'ore');
  lampTop(c, 8, 24);
  treesTop(c, lv >= 3 ? [[52, 54, 0.8, 1], [-20, 55, 0.75, 2]] : [[52, 54, 0.8, 1]]);
}

// Kerosin-Raffinerie
function keroTankTop(c, x, y, r, H) {
  roundShadow(c, x, y, r, H);
  discTop(c, x, y, r, KTANK);
  ringTop(c, x, y, r - 0.6, BLUE, 1.1);
  const grad = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.2, x, y, r * 0.8);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  circle(c, x, y, r * 0.8, grad);
  circle(c, x, y, Math.max(0.7, r * 0.1), '#9aa7b3');
}

function keroSphereTop(c, x, y, r) {
  sphereTop(c, x, y, r);
  ringTop(c, x, y, r - 0.5, BLUE, 1);
}

function bulletTop(c, x0, x1, y, r) {
  rectF(c, x0 + 1, y - r + 1.2, x1 + 1.6, y + r + 1.8, 'rgba(0,0,0,0.22)');
  const grad = c.createLinearGradient(0, y - r, 0, y + r);
  grad.addColorStop(0, tint(KTANK, 0.3));
  grad.addColorStop(1, shade(KTANK, 0.3));
  c.fillStyle = grad;
  c.beginPath();
  c.moveTo(x0 + r * 0.6, y - r);
  c.lineTo(x1 - r * 0.6, y - r);
  c.quadraticCurveTo(x1, y - r, x1, y);
  c.quadraticCurveTo(x1, y + r, x1 - r * 0.6, y + r);
  c.lineTo(x0 + r * 0.6, y + r);
  c.quadraticCurveTo(x0, y + r, x0, y);
  c.quadraticCurveTo(x0, y - r, x0 + r * 0.6, y - r);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 0.35;
  c.stroke();
  const m = (x0 + x1) / 2;
  rectF(c, m - 0.6, y - r, m + 0.6, y + r, BLUE);
}

function keroTop(c, lv, o) {
  const T = o.color;
  rectF(c, -E, -E, E, E, '#a3aaaf');
  rectS(c, 12, -56, 56, -12, '#979b98', CONCRETE, 1.4);
  rectF(c, -E, 18, E, 26, ASPH);
  rectF(c, -4, 26, 6, E, ASPH);
  rectF(c, 12, 28, 48, 54, '#8d9296');
  // Leitungen, Rohrbrücke
  pipeTop(c, [[19, -30], [8, -30], [8, 8]], 1.2, BLUE);
  pipeTop(c, [[-29, -38], [-29, -10]], 1.2, BLUE);
  rackTop(c, 'u', -54, 54, 8, [BLUE, '#a3aab0', BLUE]);
  // Tanks
  keroSphereTop(c, -40, -40, 10);
  if (lv >= 2) keroSphereTop(c, -16, -46, 7.5);
  if (lv >= 3) keroSphereTop(c, -44, -14, 7.5);
  keroTankTop(c, 30, -40, 11, 13);
  if (lv >= 2) keroTankTop(c, 47, -24, 7.5, 11);
  if (lv >= 3) keroTankTop(c, 24, -20, 6.5, 10);
  // Kolonnen, Pumpenhaus
  if (lv >= 2) columnTop(c, 4, -28, 2.8, 28);
  columnTop(c, -6, -14, 4, [0, 34, 40, 46][lv]);
  blockTop(c, -34, -8, -18, 3, 7, '#d4d9dd');
  rectF(c, -34, 2.2, -18, 3, BLUE);
  circle(c, -28, -3, 1.8, '#5f6468');
  if (lv >= 3) {
    stackTop(c, -54, -2, 1.1, 54, { color: '#c9ced3', bands: 2 });
    glowTop(c, -54.6, -2.6, 2.4);
  }
  // Drucktanks, Leitstand, Fahne
  if (lv >= 2) bulletTop(c, -54, -30, 36, 3.6);
  if (lv >= 3) bulletTop(c, -54, -30, 46, 3.6);
  blockTop(c, -24, 32, -10, 46, 8, '#e4e8ea');
  acTop(c, -19.8, 38.3, 2.2);
  flagTop(c, -8, 52, T);
  // Verladestation (Dach durchscheinend)
  const y1 = lv >= 2 ? 52 : 42;
  lorryTop(c, 28, 35, 'u', BLUE, 'tank', { band: BLUE });
  if (lv >= 2) lorryTop(c, 28, 46, 'u', '#e8e4da', 'tank', { band: BLUE });
  shadowTop(c, 14, 30, 46, y1, 8);
  rectS(c, 14, 30, 46, y1, 'rgba(214,218,221,0.55)', 'rgba(0,0,0,0.45)', 0.4);
  for (let x = 15; x <= 45.1; x += 10) lineT(c, [[x, 30], [x, y1]], 'rgba(107,113,119,0.7)', 0.5);
  rectF(c, 14, y1 - 0.8, 46, y1, T);
  lampTop(c, 9, 14);
  lampTop(c, 9, 40);
  treesTop(c, [[53, 56, 0.8, 2]]);
}

// ---------- Schnittstelle ----------

const ISO = { power, bm, mun, fuel, steel, smelter, kero };
const TOP = { power: powerTop, bm: bmTop, mun: munTop, fuel: fuelTop, steel: steelTop, smelter: smelterTop, kero: keroTop };
// Höhe des höchsten Punkts im Iso-Bild über der Mitte des Quadrats (Weltpixel, gemessen, hinten stehende Teile zählen mit ihrer
// Lage höher): bestimmt die Größe des Bilds und die Höhe des Schilds darüber. Nach jeder Änderung an einer Anlage neu messen.
const TALL = { power: [0, 128, 138, 148], bm: [0, 78, 84, 90], mun: [0, 50, 52, 52], fuel: [0, 48, 54, 81], steel: [0, 71, 77, 83], smelter: [0, 78, 84, 90], kero: [0, 53, 53, 88] };

function paintIso(ctx, s, kind, lv, color) {
  ISO[kind](G(ctx, s), lv, { color });
}

function paintTop(ctx, s, kind, lv, color) {
  ctx.scale(s, s);
  TOP[kind](ctx, lv, { color });
}

/** Höhe (Weltpixel) über dem höchsten Teil, für das Schild darüber. */
export function worksLift(kind, level) {
  return (TALL[kind] ?? TALL.bm)[clampLv(level)] + 8;
}

/** Isometrisch: das ganze Werk als Bild aus dem Zwischenspeicher (für jede Drehung dasselbe), Ankerpunkt = Mitte des Quadrats. */
export function drawWorksIso(ctx, cam, b, season = 'summer') {
  const kind = ISO[b.kind] ? b.kind : 'bm';
  const lv = clampLv(b.level);
  const key = `w|${kind}|${lv}|${b.color}|${season === 'winter' ? 1 : 0}`;
  const p = cam.worldToScreen(b.x, b.y);
  const z = cam.zoom;
  const dpr = spriteDpr();
  const e = sprite(key, z * dpr, [-84, -(TALL[kind][lv] + 2), 84, 47], (c, s) => paintIso(c, s, kind, lv, b.color));
  if (e === false) return; // wird im nächsten Bild gemalt
  if (e) {
    blit(ctx, e, p.x, p.y, z);
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1 / dpr, 1 / dpr);
  paintIso(ctx, z * dpr, kind, lv, b.color);
  ctx.restore();
}

/** 2D von oben (Weltkoordinaten, Kamera-Transformation gesetzt). Der Boden liegt schon darunter (citylayer.js). */
export function drawWorksTop(ctx, b, zoom = 1) {
  const kind = TOP[b.kind] ? b.kind : 'bm';
  const lv = clampLv(b.level);
  const e = sprite(`wt|${kind}|${lv}|${b.color}`, zoom * spriteDpr(), [-64, -64, 80, 80], (c, s) => paintTop(c, s, kind, lv, b.color));
  if (e) blit(ctx, e, b.x, b.y, 1);
  else if (e === null) {
    ctx.save();
    ctx.translate(b.x, b.y);
    paintTop(ctx, 1, kind, lv, b.color);
    ctx.restore();
  }
  if ((b.damage ?? 0) > 0) {
    ctx.fillStyle = `rgba(20,10,5,${(0.5 * b.damage).toFixed(2)})`; // beschädigt: dunkler
    ctx.fillRect(b.x - 58, b.y - 58, 116, 116);
  }
}

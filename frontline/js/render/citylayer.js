// Stadt auf der Karte (PRD §15): Straßen, ausgewiesene Zonen, Gebäude, Gebietsgrenzen und im Baumodus das gezogene Rechteck.
// Liest nur game.city (und ren.cityUi, die Stadtleiste). 2D: flach von oben; isometrisch: Boden hier, Gebäude als Stadthäuser
// über drawTownBuilding (renderer.js).
import { KINDS, DEPOSITS, cellRect, canZone, hasRoad } from '../game/city.js';
import { CITY } from '../data/city.js';
import { CITY_COLORS, CITY_ICON } from '../ui/citypanel.js';

// Grundstücke in der Farbe der Zellenart (wie die Werkzeugleiste): Wohnen grün, Gewerbe blau, Werke erdig, Markt gold, Militär oliv
const LOT = CITY_COLORS;
const ROOF = { res: '#8a4b3c', com: '#5f8fc8', bm: '#6e5a48', mun: '#5f6670', fuel: '#6a5a7e', steel: '#4f5862', mine: '#7a6440', market: '#c9952b', power: '#5a5a40', uni: '#7a3b30', dc: '#3a4a55', barracks: '#56603a', factory: '#5c6352', heliport: '#4a4f4a' };
const TOWN_KIND = { res: 'house', com: 'hall', bm: 'factory', mun: 'factory', fuel: 'factory', steel: 'factory', mine: 'hall', market: 'hall', power: 'factory', uni: 'hall', dc: 'hall', barracks: 'barracks', factory: 'vhall', heliport: 'heliport' };
/** Hex-Farbe a mit b mischen (t = Anteil von a). */
function mix(a, b, t) {
  const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) * t + p(b, i) * (1 - t))).join(',')})`;
}
const LOT_BUILT = Object.fromEntries(Object.entries(LOT).map(([k, c]) => [k, mix(c, '#8b8d84', 0.5)])); // Pflaster unter Gebäuden, getönt
// Schilder über den Gebäuden (seit v4.96): Funktionsgebäude groß mit Symbol, Wohnen und Gewerbe klein (privat ⌂ grün, kommerziell ▣ blau)
const MINE_ICON = { wood: '🌲', stone: '⛰', ore: '⛏', oil: '🛢' };
const MINE_COLOR = { wood: '#3f8a3f', stone: '#8f8f88', ore: '#c4612f', oil: '#34343a' };
const SMALL = { res: 1, com: 1 };
// Höhe des Schilds über dem Boden je Gebäudeform (Weltpixel, isometrisch)
const BADGE_LIFT = { house: 50, hall: 56, factory: 74, barracks: 40, vhall: 52, heliport: 26 };
// Rohstoffvorkommen: Bodenfarbe und Farbe der Tupfen (Bäume, Steine, Erzbrocken, Öllachen)
const DEP_GROUND = { wood: 'rgba(30,70,30,0.55)', stone: 'rgba(120,120,115,0.55)', ore: 'rgba(140,70,40,0.55)', oil: 'rgba(20,20,24,0.6)' };
const DEP_DOT = { wood: '#1f5a24', stone: '#b9b9b0', ore: '#c4612f', oil: '#0b0b0e' };
const DOTS = [[0.25, 0.3, 0.16], [0.68, 0.25, 0.13], [0.45, 0.62, 0.18], [0.78, 0.7, 0.12], [0.2, 0.75, 0.11]];

/** Sichtbare Stadtzellen beider Teams: eigene immer, fremde nur, wo das Gelände erkundet ist. */
function* cells(game, team, known) {
  if (!game.city) return;
  for (const c of game.city) {
    for (const i of c.list) {
      const k = KINDS[c.kind[i] - 1];
      if (!k) continue;
      const col = i % c.cols;
      const r = cellRect(c, col, (i - col) / c.cols);
      if (c.team !== team && !known(r.x, r.y)) continue;
      yield { c, k, lv: c.level[i], r, i, ruin: !c.level[i] && c.timer[i] < 0 };
    }
  }
}

/** Seitenlänge eines Gebäudes der Stufe lv in der Zelle r (px): lässt einen farbigen Rand des Grundstücks frei. */
const footprint = (r, lv) => r.x1 - r.x0 - 26 + lv * 6;

/** Gebäude als Stadthaus-Objekte { x, y, w, h, kind } (Größe nach Ausbaustufe), für die Iso-Ansicht. */
export function cityBuildings(game, team, known, inRect) {
  const out = [];
  for (const { c, k, lv, r, i } of cells(game, team, known)) {
    if (k === 'road' || !lv || !inRect(r.x, r.y)) continue;
    const s = footprint(r, lv); // Stufe 1 kleiner, Stufe 3 füllt fast die Zelle (Rand zeigt die Farbe der Zone)
    const e = c.ents.get(i);
    out.push({ x: r.x, y: r.y, w: s, h: k === 'res' ? s * 0.8 : s, kind: TOWN_KIND[k], color: c.team < 2 ? game.teams[c.team].color : '#888', damage: e ? 1 - e.hp / e.def.hp : 0 });
  }
  return out;
}

/** Viereck auf dem Boden als Pfad (mit Gelände in Bildschirmkoordinaten, sonst in Weltkoordinaten). */
function groundRect(ren, ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  if (!ren.draping()) {
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    return;
  }
  const cam = ren.camera;
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], n) => {
    const p = cam.worldToScreen(x, y);
    if (n) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
}

/** Boden der Stadt: Straßen, Grundstücke (blass = nur ausgewiesen) und Pflaster unter Gebäuden. */
export function drawCityGround(ren, ctx, team, known, inRect) {
  const g = ren.game;
  if (!g.city) return;
  ctx.save();
  if (ren.draping()) ctx.setTransform(ren.dpr, 0, 0, ren.dpr, 0, 0);
  drawDeposits(ren, ctx, known);
  for (const { c, k, lv, r, ruin } of cells(g, team, known)) {
    if (!inRect(r.x, r.y, 64)) continue;
    if (ruin) {
      // Ruine: Schutt, bis die Zelle neu wächst
      groundRect(ren, ctx, r.x0 + 4, r.y0 + 4, r.x1 - 4, r.y1 - 4);
      ctx.fillStyle = '#4a4540';
      ctx.fill();
      for (const [fx, fy, fr] of DOTS) groundDot(ren, ctx, r.x0 + fx * 64, r.y0 + fy * 64, fr * 40, '#2b2826');
      continue;
    }
    if (k === 'road') {
      groundRect(ren, ctx, r.x0, r.y0, r.x1, r.y1);
      ctx.fillStyle = '#55584f';
      ctx.fill();
      continue;
    }
    groundRect(ren, ctx, r.x0 + 3, r.y0 + 3, r.x1 - 3, r.y1 - 3);
    ctx.fillStyle = lv ? LOT_BUILT[k] : LOT[k] + '55';
    ctx.fill();
    ctx.strokeStyle = LOT[k];
    ctx.lineWidth = ren.draping() ? Math.max(2, 4 * ren.camera.zoom) : 5;
    ctx.stroke();
    if (lv && k === 'heliport') drawPad(ren, ctx, r);
    if (!lv && k !== 'mine' && c.team === team) {
      // ausgewiesen, aber noch nicht gebaut: Fortschritt als Balken, rot ohne Straße daneben
      const col = Math.floor(r.x0 / c.cell);
      const row = Math.floor(r.y0 / c.cell);
      const linked = hasRoad(c, col, row);
      const f = linked ? Math.max(0, Math.min(1, c.timer[row * c.cols + col] / CITY.growTime)) : 1;
      groundRect(ren, ctx, r.x0 + 8, r.y + 4, r.x0 + 8 + (r.x1 - r.x0 - 16) * f, r.y + 12);
      ctx.fillStyle = linked ? '#e8e2a0' : '#e0553a';
      ctx.fill();
    }
  }
  drawTerritory(ren, ctx, team, known);
  ctx.restore();
}

/** Landeplatz des Heliports: dunkler Kreis mit weißem Ring und „H“ auf dem Boden. */
function drawPad(ren, ctx, r) {
  const rad = (r.x1 - r.x0) * 0.36;
  groundDot(ren, ctx, r.x, r.y, rad, '#3a3d3a');
  groundDot(ren, ctx, r.x, r.y, rad * 0.86, '#e8e8e0');
  groundDot(ren, ctx, r.x, r.y, rad * 0.76, '#3a3d3a');
  const h = rad * 0.5;
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of [[-0.6, -1, -0.6, 1], [0.6, -1, 0.6, 1], [-0.6, 0, 0.6, 0]]) groundLine(ren, ctx, r.x + x0 * h * 0.8, r.y + y0 * h, r.x + x1 * h * 0.8, r.y + y1 * h);
  ctx.strokeStyle = '#f2f2ea';
  ctx.lineWidth = ren.draping() ? Math.max(1.5, 4 * ren.camera.zoom) : 4;
  ctx.stroke();
}

/** Kreis auf dem Boden (mit Gelände in Bildschirmkoordinaten). */
function groundDot(ren, ctx, x, y, rad, color) {
  ctx.beginPath();
  if (ren.draping()) {
    const p = ren.camera.worldToScreen(x, y);
    ctx.ellipse(p.x, p.y, rad * ren.camera.zoom, rad * ren.camera.zoom * 0.55, 0, 0, Math.PI * 2);
  } else ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Rohstoffvorkommen (Kartenmerkmal, wo erkundet): getönter Boden mit Tupfen; Zellen mit Förderanlage zeigt die Stadt. */
function drawDeposits(ren, ctx, known) {
  const g = ren.game;
  const c = g.city[0];
  const V = ren.camera.visibleRect();
  const S = c.cell;
  for (let r = Math.max(0, Math.floor(V.y0 / S) - 1); r <= Math.min(c.rows - 1, Math.ceil(V.y1 / S) + 1); r++) {
    for (let q = Math.max(0, Math.floor(V.x0 / S) - 1); q <= Math.min(c.cols - 1, Math.ceil(V.x1 / S) + 1); q++) {
      const i = r * c.cols + q;
      const d = DEPOSITS[c.deposit[i] - 1];
      if (!d || !known((q + 0.5) * S, (r + 0.5) * S)) continue;
      if (g.city.some((o) => o.level[i])) continue;
      groundRect(ren, ctx, q * S, r * S, (q + 1) * S, (r + 1) * S);
      ctx.fillStyle = DEP_GROUND[d];
      ctx.fill();
      for (const [fx, fy, fr] of DOTS) groundDot(ren, ctx, (q + fx) * S, (r + fy) * S, fr * S * 0.7, DEP_DOT[d]);
    }
  }
}

/** Linie von (x0, y0) nach (x1, y1) auf dem Boden. */
function groundLine(ren, ctx, x0, y0, x1, y1) {
  if (!ren.draping()) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    return;
  }
  const a = ren.camera.worldToScreen(x0, y0);
  const b = ren.camera.worldToScreen(x1, y1);
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

/**
 * Gebietsgrenzen (eigene immer, fremde wo erkundet) als Linie in Teamfarbe; im Baumodus dazu bebaubare Zellen hell,
 * gesperrte dunkel und das gezogene Rechteck in der Farbe des Werkzeugs.
 */
function drawTerritory(ren, ctx, team, known) {
  const g = ren.game;
  const ui = ren.cityUi?.open ? ren.cityUi : null;
  const V = ren.camera.visibleRect();
  const z = ren.draping() ? 1 : 1 / ren.camera.zoom;
  for (const c of g.city) {
    const own = c.team === team;
    const S = c.cell;
    const q0 = Math.max(0, Math.floor(V.x0 / S) - 1);
    const q1 = Math.min(c.cols - 1, Math.ceil(V.x1 / S) + 1);
    const r0 = Math.max(0, Math.floor(V.y0 / S) - 1);
    const r1 = Math.min(c.rows - 1, Math.ceil(V.y1 / S) + 1);
    if (ui && own) {
      // Baumodus: gesperrte Zellen dunkel (bauen kann man überall sonst, seit v4.87 ohne Gebietsgrenze)
      for (let r = r0; r <= r1; r++) {
        for (let q = q0; q <= q1; q++) {
          const i = r * c.cols + q;
          if (c.kind[i] || canZone(g, c, i)) continue;
          groundRect(ren, ctx, q * S + 1, r * S + 1, (q + 1) * S - 1, (r + 1) * S - 1);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fill();
        }
      }
    }
  }
  const d = ui?.drag;
  if (d) {
    const c = g.city[team];
    const S = c.cell;
    const qa = Math.min(d.c0, d.c1);
    const ra = Math.min(d.r0, d.r1);
    const qb = Math.max(d.c0, d.c1) + 1;
    const rb = Math.max(d.r0, d.r1) + 1;
    groundRect(ren, ctx, qa * S, ra * S, qb * S, rb * S);
    ctx.fillStyle = CITY_COLORS[ui.tool] + '88';
    ctx.fill();
    ctx.strokeStyle = CITY_COLORS[ui.tool];
    ctx.lineWidth = 3 * z;
    ctx.stroke();
  }
}

/** 2D von oben: Gebäude als Dachflächen mit Schatten. */
export function drawCityTop(ren, ctx, team, known, inRect) {
  const g = ren.game;
  if (!g.city) return;
  for (const { c, k, lv, r, i } of cells(g, team, known)) {
    if (k === 'road' || !lv || !inRect(r.x, r.y, 64)) continue;
    const e = c.ents.get(i);
    if (k === 'heliport') {
      // Landeplatz liegt am Boden; nur ein kleiner Turm in der Ecke
      ctx.fillStyle = ROOF.heliport;
      ctx.fillRect(r.x1 - 18, r.y0 + 6, 12, 12);
      continue;
    }
    const s = footprint(r, lv);
    const h = k === 'res' ? s * 0.8 : s;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(r.x - s / 2 + 4, r.y - h / 2 + 4, s, h);
    ctx.fillStyle = ROOF[k];
    ctx.fillRect(r.x - s / 2, r.y - h / 2, s, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(r.x - s / 2, r.y - h / 2, s, h / 2); // Dachfirst: Lichtseite
    if (k !== 'res' && k !== 'com' && !CITY.produces[k] && k !== 'market') {
      ctx.fillStyle = '#3b3b3b'; // Schornstein der Werke
      ctx.fillRect(r.x + s / 4, r.y - h / 4, 7, 7);
    }
    if (e && e.hp < e.def.hp) {
      ctx.fillStyle = `rgba(20,10,5,${(0.6 * (1 - e.hp / e.def.hp)).toFixed(2)})`; // beschädigt: dunkler
      ctx.fillRect(r.x - s / 2, r.y - h / 2, s, h);
    }
  }
}

/** Schild (Kreis oder kleines Quadrat mit Symbol) als Bild, je Symbol und Farbe einmal gezeichnet. */
const badgeCache = new Map();
function badgeImage(icon, color, small) {
  const key = `${icon}|${color}|${small ? 1 : 0}`;
  let img = badgeCache.get(key);
  if (img) return img;
  const S = 64;
  img = document.createElement('canvas');
  img.width = S;
  img.height = S;
  const g = img.getContext('2d');
  g.beginPath();
  if (small) g.roundRect(6, 6, S - 12, S - 12, 12);
  else g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = small ? 5 : 6;
  g.strokeStyle = small ? 'rgba(255,255,255,0.85)' : '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  if (icon === 'res' || icon === 'com') {
    // kleine Zeichen als Formen (Schriftzeichen wären zu dünn): Wohnhaus mit Giebel bzw. Bürohaus mit Fensterreihen
    g.beginPath();
    if (icon === 'res') {
      g.moveTo(32, 13);
      g.lineTo(51, 30);
      g.lineTo(46, 30);
      g.lineTo(46, 50);
      g.lineTo(18, 50);
      g.lineTo(18, 30);
      g.lineTo(13, 30);
      g.closePath();
      g.fill();
      g.fillStyle = color;
      g.fillRect(28, 37, 8, 13); // Tür
    } else {
      g.fillRect(17, 14, 30, 36);
      g.fillStyle = color;
      for (let y = 19; y < 44; y += 9) for (const x of [21, 30, 39]) g.fillRect(x, y, 5, 5); // Fenster
    }
  } else {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 34px system-ui, "Segoe UI Symbol", "Noto Color Emoji", "Segoe UI Emoji", sans-serif';
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 3;
    g.fillText(icon, S / 2, S / 2 + 2);
  }
  badgeCache.set(key, img);
  return img;
}

/**
 * Schilder über den Stadtgebäuden (seit v4.96, nach Daniels Wunsch): Funktionsgebäude (Markt, Förderung, Werke, Strom, Uni,
 * Rechenzentrum, Kaserne, Fabrikhalle, Heliport) mit großem Symbol in ihrer Farbe, Wohnen und Gewerbe mit kleinem Zeichen
 * (⌂ grün = privat, ▣ blau = kommerziell). Größe auf dem Bildschirm fast fest, damit man sie auch weit herausgezoomt findet.
 * 2D: Weltkoordinaten (Kontext skaliert); isometrisch: Bildschirmkoordinaten über dem Dach.
 */
export function drawCityBadges(ren, ctx, team, known, inRect, iso) {
  const g = ren.game;
  if (!g.city) return;
  const cam = ren.camera;
  const z = cam.zoom;
  const big = Math.max(18, Math.min(34, 30 * z));
  const small = Math.max(12, Math.min(22, 19 * z));
  for (const { c, k, lv, r, i } of cells(g, team, known)) {
    if (k === 'road' || !lv || !inRect(r.x, r.y, 64)) continue;
    const sm = !!SMALL[k];
    const d = k === 'mine' ? DEPOSITS[c.deposit[i] - 1] : null;
    const img = badgeImage(sm ? k : d ? MINE_ICON[d] : CITY_ICON[k], d ? MINE_COLOR[d] : CITY_COLORS[k], sm);
    const px = sm ? small : big;
    if (iso) {
      const p = cam.worldToScreen(r.x, r.y);
      const lift = (BADGE_LIFT[TOWN_KIND[k]] ?? 50) * (0.75 + lv * 0.1);
      ctx.drawImage(img, p.x - px / 2, p.y - lift * z - px, px, px);
    } else {
      const w = px / z;
      ctx.drawImage(img, r.x - w / 2, r.y - w / 2, w, w);
    }
  }
}

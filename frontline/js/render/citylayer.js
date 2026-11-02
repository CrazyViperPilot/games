// Stadt auf der Karte (PRD §15): Straßen, ausgewiesene Zonen, Gebäude, Gebietsgrenzen und im Baumodus das gezogene Rechteck.
// Liest nur game.city (und ren.cityUi, die Stadtleiste). 2D: flach von oben; isometrisch: Boden hier, Gebäude als Stadthäuser
// über drawTownBuilding (renderer.js).
import { KINDS, DEPOSITS, cellRect, canZone, hasRoad } from '../game/city.js';
import { CITY } from '../data/city.js';
import { CITY_COLORS } from '../ui/citypanel.js';

const LOT = { res: '#5fa36a', com: '#5a88c4', bm: '#b07a43', mun: '#9aa4b4', fuel: '#a585cf', steel: '#7f8c99', mine: '#c9a14a', market: '#d6b84a', power: '#e0c040', uni: '#6fa8dc', dc: '#4fc3c7' };
const ROOF = { res: '#8a4b3c', com: '#9aa3ab', bm: '#6e5a48', mun: '#5f6670', fuel: '#6a5a7e', steel: '#4f5862', mine: '#7a6440', market: '#b8863b', power: '#5a5a40', uni: '#7a3b30', dc: '#3a4a55' };
const TOWN_KIND = { res: 'house', com: 'hall', bm: 'factory', mun: 'factory', fuel: 'factory', steel: 'factory', mine: 'hall', market: 'hall', power: 'factory', uni: 'hall', dc: 'hall' };
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

/** Gebäude als Stadthaus-Objekte { x, y, w, h, kind } (Größe nach Ausbaustufe), für die Iso-Ansicht. */
export function cityBuildings(game, team, known, inRect) {
  const out = [];
  for (const { c, k, lv, r, i } of cells(game, team, known)) {
    if (k === 'road' || !lv || !inRect(r.x, r.y)) continue;
    const s = r.x1 - r.x0 - 22 + lv * 6; // Stufe 1 kleiner, Stufe 3 füllt fast die Zelle
    const e = c.ents.get(i);
    out.push({ x: r.x, y: r.y, w: s, h: k === 'res' ? s * 0.8 : s, kind: TOWN_KIND[k], damage: e ? 1 - e.hp / e.def.hp : 0 });
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
    groundRect(ren, ctx, r.x0 + 2, r.y0 + 2, r.x1 - 2, r.y1 - 2);
    ctx.fillStyle = lv ? '#8b8d84' : LOT[k] + '55';
    ctx.fill();
    ctx.strokeStyle = LOT[k];
    ctx.lineWidth = ren.draping() ? 1.5 : 3;
    ctx.stroke();
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
    const s = r.x1 - r.x0 - 22 + lv * 6;
    const h = k === 'res' ? s * 0.8 : s;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(r.x - s / 2 + 4, r.y - h / 2 + 4, s, h);
    ctx.fillStyle = ROOF[k];
    ctx.fillRect(r.x - s / 2, r.y - h / 2, s, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(r.x - s / 2, r.y - h / 2, s, h / 2); // Dachfirst: Lichtseite
    if (k !== 'res' && k !== 'com') {
      ctx.fillStyle = '#3b3b3b'; // Schornstein der Werke
      ctx.fillRect(r.x + s / 4, r.y - h / 4, 7, 7);
    }
    if (e && e.hp < e.def.hp) {
      ctx.fillStyle = `rgba(20,10,5,${(0.6 * (1 - e.hp / e.def.hp)).toFixed(2)})`; // beschädigt: dunkler
      ctx.fillRect(r.x - s / 2, r.y - h / 2, s, h);
    }
  }
}

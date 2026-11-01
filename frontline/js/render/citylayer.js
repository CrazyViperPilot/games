// Stadt auf der Karte (PRD §15): Straßen, ausgewiesene Zonen, Gebäude, Gebietsgrenzen und im Baumodus das gezogene Rechteck.
// Liest nur game.city (und ren.cityUi, die Stadtleiste). 2D: flach von oben; isometrisch: Boden hier, Gebäude als Stadthäuser
// über drawTownBuilding (renderer.js).
import { KINDS, cellRect, canZone } from '../game/city.js';
import { CITY_COLORS } from '../ui/citypanel.js';

const LOT = { res: '#5fa36a', com: '#5a88c4', bm: '#b07a43', mun: '#9aa4b4', fuel: '#a585cf' };
const ROOF = { res: '#8a4b3c', com: '#9aa3ab', bm: '#6e5a48', mun: '#5f6670', fuel: '#6a5a7e' };
const TOWN_KIND = { res: 'house', com: 'hall', bm: 'factory', mun: 'factory', fuel: 'factory' };

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
      yield { c, k, lv: c.level[i], r };
    }
  }
}

/** Gebäude als Stadthaus-Objekte { x, y, w, h, kind } (Größe nach Ausbaustufe), für die Iso-Ansicht. */
export function cityBuildings(game, team, known, inRect) {
  const out = [];
  for (const { k, lv, r } of cells(game, team, known)) {
    if (k === 'road' || !lv || !inRect(r.x, r.y)) continue;
    const s = r.x1 - r.x0 - 22 + lv * 6; // Stufe 1 kleiner, Stufe 3 füllt fast die Zelle
    out.push({ x: r.x, y: r.y, w: s, h: k === 'res' ? s * 0.8 : s, kind: TOWN_KIND[k] });
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
  for (const { k, lv, r } of cells(g, team, known)) {
    if (!inRect(r.x, r.y, 64)) continue;
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
  }
  drawTerritory(ren, ctx, team, known);
  ctx.restore();
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
    const claim = c.claim;
    const at = (q, r) => q >= 0 && r >= 0 && q < c.cols && r < c.rows && claim[r * c.cols + q];
    if (ui && own) {
      for (let r = r0; r <= r1; r++) {
        for (let q = q0; q <= q1; q++) {
          const i = r * c.cols + q;
          if (!claim[i] || c.kind[i]) continue;
          groundRect(ren, ctx, q * S + 1, r * S + 1, (q + 1) * S - 1, (r + 1) * S - 1);
          ctx.fillStyle = canZone(g, c, i) ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.35)';
          ctx.fill();
        }
      }
    }
    ctx.beginPath();
    for (let r = r0; r <= r1; r++) {
      for (let q = q0; q <= q1; q++) {
        if (!claim[r * c.cols + q]) continue;
        if (!own && !known((q + 0.5) * S, (r + 0.5) * S)) continue;
        const x = q * S;
        const y = r * S;
        if (!at(q, r - 1)) groundLine(ren, ctx, x, y, x + S, y);
        if (!at(q, r + 1)) groundLine(ren, ctx, x, y + S, x + S, y + S);
        if (!at(q - 1, r)) groundLine(ren, ctx, x, y, x, y + S);
        if (!at(q + 1, r)) groundLine(ren, ctx, x + S, y, x + S, y + S);
      }
    }
    ctx.strokeStyle = g.teams[c.team].color;
    ctx.globalAlpha = ui && own ? 0.95 : 0.6;
    ctx.lineWidth = (ui && own ? 3 : 2) * z;
    ctx.setLineDash([8 * z, 6 * z]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
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
  for (const { k, lv, r } of cells(g, team, known)) {
    if (k === 'road' || !lv || !inRect(r.x, r.y, 64)) continue;
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
  }
}

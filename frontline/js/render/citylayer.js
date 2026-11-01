// Stadt auf der Karte (PRD §15): Straßen, ausgewiesene Zonen und Gebäude der Zonenstadt um die Haupt-FOB.
// Liest nur game.city. 2D: flach von oben; isometrisch: Boden hier, Gebäude als Stadthäuser über drawTownBuilding (renderer.js).
import { KINDS, cellRect } from '../game/city.js';

const LOT = { res: '#5fa36a', com: '#5a88c4', bm: '#b07a43', mun: '#9aa4b4', fuel: '#a585cf' };
const ROOF = { res: '#8a4b3c', com: '#9aa3ab', bm: '#6e5a48', mun: '#5f6670', fuel: '#6a5a7e' };
const TOWN_KIND = { res: 'house', com: 'hall', bm: 'factory', mun: 'factory', fuel: 'factory' };

/** Sichtbare Stadtzellen beider Teams: eigene immer, fremde nur, wo das Gelände erkundet ist. */
function* cells(game, team, known) {
  if (!game.city) return;
  for (const c of game.city) {
    for (let row = 0; row < c.rows; row++) {
      for (let col = 0; col < c.cols; col++) {
        const i = row * c.cols + col;
        const k = KINDS[c.kind[i] - 1];
        if (!k) continue;
        const r = cellRect(c, col, row);
        if (c.team !== team && !known(r.x, r.y)) continue;
        yield { c, k, lv: c.level[i], r };
      }
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
  ctx.restore();
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

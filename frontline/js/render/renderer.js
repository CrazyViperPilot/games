// Haupt-Renderer (PLAN §5 render/renderer.js). Zeichnet Terrain, Zone, Vorkommen, Gebäude, Einheiten,
// Granaten, Effekte, Nebel und Overlays. Liest game.projectiles/effects bei jedem Aufruf frisch. Kein Zugriff auf den Controller.
import { BALANCE } from '../data/balance.js';
import { BUILDINGS } from '../data/buildings.js';
import { buildTerrain } from './terrain.js';
import {
  drawUnit,
  drawBuilding,
  drawNode,
  drawShell,
  drawEffect,
  drawBar,
  fitText,
  hpColor,
  hexA,
} from './sprites.js';
import { builderState } from '../ui/status.js';
import { isDepot, depotRadius } from '../game/entities.js';

const TILE = BALANCE.map.tile;
const W = BALANCE.map.width;
const H = BALANCE.map.height;
const BG = '#0d110d';
const ACCENT = '#c9a227';
const SITE_BM = BALANCE.construction.fobMaterial; // Material, das eine FOB-Baustelle braucht
const CARGO_COLOR = { bm: '#a0703f', mun: '#d9b600', fuel: '#9b7bc4' }; // LKW-Ladung je Sorte
const AMMO_COLOR = '#7f93ad'; // Munitionsbalken (grau-blau)
const FUEL_COLOR = '#9b7bc4'; // Treibstoffbalken (violett)
const BAR_W = 24; // Balkenbreite über Einheiten (Welt-px)
const HP_OFFSET = 14; // Abstand Lebensbalken-Oberkante zum Einheitenrand (Bildschirm-px); darunter Vorrat
const FOG_EXPLORED_ALPHA = 150; // erkundet: abgedunkelt, nicht schwarz
const MARKER_LIFE = 0.8; // s, Lebensdauer des Wegziel-Markers

/** Off-screen-Canvas in Nebelzellen-Größe (75 × 75) mit ImageData. */
export function makeFogLayer(fog) {
  const canvas = document.createElement('canvas');
  canvas.width = fog.cols;
  canvas.height = fog.rows;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, image: ctx.createImageData(fog.cols, fog.rows) };
}

/** Füllt die Nebelschicht aus fog.visible / fog.explored. reveal = alles sichtbar. */
export function updateFogLayer(layer, fog, reveal) {
  const d = layer.image.data;
  const n = fog.cols * fog.rows;
  for (let i = 0; i < n; i++) {
    let a;
    if (reveal || fog.visible[i]) a = 0;
    else if (fog.explored[i]) a = FOG_EXPLORED_ALPHA;
    else a = 255;
    const o = i * 4;
    d[o] = 6;
    d[o + 1] = 8;
    d[o + 2] = 10;
    d[o + 3] = a;
  }
  layer.ctx.putImageData(layer.image, 0, 0);
}

export class Renderer {
  constructor(canvas, game, camera, team) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.camera = camera;
    this.team = team;
    this.revealAll = false; // Debug: kein Nebel, alle Gegner sichtbar
    this.terrain = buildTerrain(game.map);
    this.fogLayer = makeFogLayer(game.fog[team]);
    this.dpr = 1;
    this.cssW = 0;
    this.cssH = 0;
    this.resize();
  }

  /** Canvas an die CSS-Größe anpassen (DPR höchstens 2) und Kamera-Ansicht setzen. */
  resize() {
    const cssW = this.canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
    const cssH = this.canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const pw = Math.max(1, Math.round(cssW * dpr));
    const ph = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.dpr = dpr;
    this.cssW = cssW;
    this.cssH = cssH;
    this.camera.resize(cssW, cssH);
  }

  /**
   * Ein Bild. view = { selection: Set<id>, placement, dragBox, hoverId, moveMarker } – alle Felder optional.
   * placement: { type, x, y, ok, reason, cells?: [{cx, cy, ok}] }; dragBox in Bildschirmkoordinaten;
   * moveMarker: { x, y, t } mit t = performance.now() beim Klick (Marker verblasst nach 0,8 s).
   */
  render(view = null) {
    const v = view || {};
    if (this.canvas.clientWidth && (this.canvas.clientWidth !== this.cssW || this.canvas.clientHeight !== this.cssH)) {
      this.resize();
    }
    const ctx = this.ctx;
    const g = this.game;
    const cam = this.camera;
    const team = this.team;
    const dpr = this.dpr;
    const z = cam.zoom;
    const reveal = this.revealAll;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const sel = v.selection instanceof Set ? v.selection : new Set(v.selection || []);
    const hover = v.hoverId ? g.getEntity(v.hoverId) : null;

    const R = cam.visibleRect();
    const inRect = (x, y, pad = 0) => x >= R.x0 - pad && x <= R.x1 + pad && y >= R.y0 - pad && y <= R.y1 + pad;
    const seen = (x, y) => reveal || g.isVisible(team, x, y);
    const known = (x, y) => reveal || g.isExplored(team, x, y);
    const shown = (e) => e.team === team || seen(e.x, e.y);

    // Bildschirm: Hintergrund; danach Welt-Transformation (Kamera)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (cam.viewW / 2 - cam.x * z) * dpr, (cam.viewH / 2 - cam.y * z) * dpr);
    ctx.imageSmoothingEnabled = true;

    this.drawTerrain(ctx, R);
    this.drawZone(ctx, z);

    for (const n of g.map.nodes) {
      if (inRect(n.x, n.y, 40)) drawNode(ctx, n, g.extractorOn(n.id), z);
    }

    if (v.placement) this.drawRadii(ctx, z);
    this.drawSelectedRadii(ctx, z, v);
    this.drawRoutes(ctx, sel, z);

    for (const b of g.buildings) {
      if (!b.alive || (b.team !== team && !known(b.x, b.y))) continue;
      if (!inRect(b.x, b.y, (Math.max(b.w, b.h) * TILE) / 2)) continue;
      drawBuilding(ctx, b, g.teams[b.team].color, z);
      if (!b.built && b.team === team) this.drawSiteMarks(ctx, b, z);
    }

    // Auswahl und Hover (unter den Einheiten)
    for (const id of sel) {
      const e = g.getEntity(id);
      if (e && shown(e)) this.drawSelectRing(ctx, e, '#f2f5f2', z, false);
    }
    if (hover && !sel.has(hover.id) && shown(hover)) this.drawSelectRing(ctx, hover, 'rgba(255,255,255,0.5)', z, true);

    // Sammelpunkte gewählter eigener Gebäude
    for (const id of sel) {
      const b = g.getEntity(id);
      if (b && b.kind === 'building' && b.team === team) this.drawRally(ctx, b, z);
    }

    for (const u of g.units) {
      if (!u.alive || !shown(u) || !inRect(u.x, u.y, 30)) continue;
      let aim = null;
      if (u.targetId && u.def.range > 0) {
        const t = g.getEntity(u.targetId);
        if (t) aim = Math.atan2(t.y - u.y, t.x - u.x);
      }
      drawUnit(ctx, u, g.teams[u.team].color, z, aim);
    }

    this.drawMoveMarker(ctx, v.moveMarker, now, z);

    for (const p of g.projectiles) {
      if (!p.alive || !shown(p)) continue;
      if (!inRect(p.x, p.y, 80) && !inRect(p.tx, p.ty, 80)) continue;
      drawShell(ctx, p, z);
    }

    for (const e of g.effects) {
      if (!inRect(e.x, e.y, 120) && !inRect(e.x2 ?? e.x, e.y2 ?? e.y, 120)) continue;
      if (e.team !== -1 && e.team !== team && !seen(e.x, e.y) && !seen(e.x2 ?? e.x, e.y2 ?? e.y)) continue;
      drawEffect(ctx, e, z);
    }

    if (!reveal) {
      updateFogLayer(this.fogLayer, g.fog[team], false);
      ctx.drawImage(this.fogLayer.canvas, 0, 0, this.fogLayer.canvas.width, this.fogLayer.canvas.height, 0, 0, W, H);
    }

    // Lebensbalken: bei Auswahl, Hover oder Schaden
    for (const u of g.units) {
      if (!u.alive || !shown(u) || !inRect(u.x, u.y, 30)) continue;
      if (!(sel.has(u.id) || hover === u || u.hp < u.maxHp)) continue;
      const bw = 24;
      this.drawHp(ctx, u.x - bw / 2, u.y - u.def.radius - HP_OFFSET / z, bw, u.hp / u.maxHp, z);
    }
    for (const b of g.buildings) {
      if (!b.alive || b.team !== team || !inRect(b.x, b.y, 40)) continue;
      if (!(sel.has(b.id) || hover === b || b.hp < b.maxHp)) continue;
      const bw = b.w * TILE * 0.8;
      this.drawHp(ctx, b.x - bw / 2, b.cy * TILE - 8 / z, bw, b.hp / b.maxHp, z);
    }

    // Vorrat und Warnzeichen (nur eigene Einheiten: Vorrat des Gegners ist unbekannt)
    for (const u of g.units) {
      if (!u.alive || u.team !== team || !inRect(u.x, u.y, 30)) continue;
      this.drawSupply(ctx, u, sel.has(u.id) || hover === u, z);
    }

    if (v.placement) this.drawPlacement(ctx, v.placement, z);

    // Bildschirmkoordinaten: Auswahlrahmen, Hinweistext zur Platzierung
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (v.dragBox) this.drawDragBox(ctx, v.dragBox);
    if (v.placement && !v.placement.ok && v.placement.reason && Number.isFinite(v.placement.x)) {
      this.drawNote(ctx, cam.worldToScreen(v.placement.x, v.placement.y), v.placement.reason);
    }
  }

  drawTerrain(ctx, R) {
    const S = this.terrain.width / W;
    const x0 = Math.max(0, R.x0);
    const y0 = Math.max(0, R.y0);
    const x1 = Math.min(W, R.x1);
    const y1 = Math.min(H, R.y1);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.drawImage(this.terrain, x0 * S, y0 * S, (x1 - x0) * S, (y1 - y0) * S, x0, y0, x1 - x0, y1 - y0);
  }

  drawZone(ctx, z) {
    const g = this.game;
    const zn = g.zone;
    const owned = zn.owner >= 0;
    const col = owned ? g.teams[zn.owner].color : '#e8ece8';
    ctx.save();
    ctx.beginPath();
    ctx.arc(zn.x, zn.y, zn.r, 0, Math.PI * 2);
    ctx.fillStyle = hexA(col, owned ? 0.12 : 0.05);
    ctx.fill();
    ctx.strokeStyle = hexA(col, 0.85);
    ctx.lineWidth = 4;
    if (zn.contested) ctx.setLineDash([28, 18]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Beschriftung nahe dem oberen Rand, damit sie nicht über den Einheiten in der Mitte liegt
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 56px system-ui, sans-serif';
    ctx.fillText('KONFLIKTZONE', zn.x, zn.y - zn.r + 110);
    ctx.restore();
  }

  /** Bauradius der eigenen fertigen Lager-Gebäude (HQ 550 px, FOB 450 px) – nur bei Platzierung. */
  drawRadii(ctx, z) {
    const g = this.game;
    ctx.save();
    ctx.setLineDash([10 / z, 8 / z]);
    ctx.strokeStyle = 'rgba(120,190,255,0.4)';
    ctx.lineWidth = 2 / z;
    for (const b of g.buildings) {
      if (!isDepot(b) || b.team !== this.team) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, depotRadius(b), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Bauradius gewählter oder überfahrener Lager-Gebäude (HQ und FOB, eigene und gegnerische) in Teamfarbe, leicht gefüllt. */
  drawSelectedRadii(ctx, z, v) {
    const g = this.game;
    const ids = v.selection ? [...v.selection] : [];
    if (v.hoverId) ids.push(v.hoverId);
    const seen = new Set();
    ctx.save();
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([10 / z, 8 / z]);
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = g.getEntity(id);
      if (!b || b.kind !== 'building' || (b.type !== 'fob' && b.type !== 'hq')) continue;
      const color = g.teams[b.team].color;
      ctx.globalAlpha = b.built ? 1 : 0.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, depotRadius(b), 0, Math.PI * 2);
      ctx.fillStyle = hexA(color, 0.07);
      ctx.fill();
      ctx.strokeStyle = hexA(color, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSelectRing(ctx, e, color, z, dashed) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / z;
    if (dashed) ctx.setLineDash([6 / z, 4 / z]);
    if (e.kind === 'unit') {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.def.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const half = (Math.max(e.w, e.h) * TILE) / 2 + 3;
      ctx.strokeRect(e.x - half, e.y - half, half * 2, half * 2);
    }
    ctx.restore();
  }

  /** Gestrichelte Routenlinie gewählter LKW von Start-FOB nach Ziel-FOB, mit Pfeilspitze am Ziel. */
  drawRoutes(ctx, sel, z) {
    const g = this.game;
    const seen = new Set();
    ctx.save();
    ctx.strokeStyle = 'rgba(201,162,39,0.85)';
    ctx.fillStyle = 'rgba(201,162,39,0.85)';
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([10 / z, 7 / z]);
    for (const id of sel) {
      const u = g.getEntity(id);
      if (!u || u.kind !== 'unit' || u.type !== 'truck' || u.order.type !== 'route') continue;
      const a = g.getEntity(u.order.fromId);
      const b = g.getEntity(u.order.toId);
      if (!a || !b) continue;
      const key = `${a.id}>${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const hx = b.x - Math.cos(ang) * 30;
      const hy = b.y - Math.sin(ang) * 30;
      const s = 9 / z;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(ang) * s, hy + Math.sin(ang) * s);
      ctx.lineTo(hx + Math.cos(ang + 2.5) * s, hy + Math.sin(ang + 2.5) * s);
      ctx.lineTo(hx + Math.cos(ang - 2.5) * s, hy + Math.sin(ang - 2.5) * s);
      ctx.fill();
      ctx.setLineDash([10 / z, 7 / z]);
    }
    ctx.restore();
  }

  /**
   * Eigene Baustelle: FOB-Baustelle mit Materialbalken x/400 über dem Gebäude; ohne Bauer ein graues „!“ an der Ecke.
   */
  drawSiteMarks(ctx, b, z) {
    const x0 = b.cx * TILE;
    const y0 = b.cy * TILE;
    const w = b.w * TILE;
    if (b.type === 'fob' && !b.supplied) {
      const yb = y0 - 7 / z;
      const have = Math.min(SITE_BM, Math.floor(b.store.bm));
      drawBar(ctx, x0, yb, w, 4 / z, b.store.bm / SITE_BM, CARGO_COLOR.bm);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      fitText(ctx, `${have}/${SITE_BM}`, x0 + w / 2, yb - 7 / z, 10, z, w * 1.2);
    }
    if (builderState(this.game, b) === 'none') {
      ctx.save();
      ctx.fillStyle = '#8c8f89';
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      ctx.arc(x0 + w, y0, 7 / z, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#161916';
      fitText(ctx, '!', x0 + w, y0, 12, z);
      ctx.restore();
    }
  }

  /**
   * Eigene Einheit: LKW-Ladung (immer), Munitions- und Treibstoffbalken (gewählt/gehovert), rotes „!“ bei leerer
   * Munition (bewaffnete Einheiten, immer).
   */
  drawSupply(ctx, u, picked, z) {
    const r = u.def.radius;
    const x = u.x - BAR_W / 2;
    if (u.type === 'truck' && u.cargo) {
      const cap = BALANCE.logistics.truckCapacity;
      const y = u.y + r + 4 / z;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x, y, BAR_W, 3 / z);
      let x0 = x;
      for (const k of ['bm', 'mun', 'fuel']) {
        const w = (BAR_W * u.cargo[k]) / cap;
        if (w <= 0) continue;
        ctx.fillStyle = CARGO_COLOR[k];
        ctx.fillRect(x0, y, w, 3 / z);
        x0 += w;
      }
    }
    if (picked) {
      // unter dem Lebensbalken: Munition, dann Treibstoff (beide oberhalb des Sprites)
      const y = u.y - r - HP_OFFSET / z;
      if (u.def.ammoMax) drawBar(ctx, x, y + 5 / z, BAR_W, 3 / z, u.ammo / u.def.ammoMax, AMMO_COLOR);
      if (u.def.fuelMax) drawBar(ctx, x, y + 9 / z, BAR_W, 3 / z, u.fuel / u.def.fuelMax, FUEL_COLOR);
    }
    if (u.def.range > 0 && u.def.ammoMax && u.ammo < u.def.ammoPerShot) {
      ctx.save();
      ctx.fillStyle = '#ff4d4d';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 2 / z;
      fitText(ctx, '!', u.x + r + 5 / z, u.y - r - 3 / z, 14, z);
      ctx.restore();
    }
  }

  /** Sammelpunkt-Linie mit kleiner Flagge. */
  drawRally(ctx, b, z) {
    ctx.save();
    ctx.strokeStyle = hexA(ACCENT, 0.75);
    ctx.fillStyle = ACCENT;
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.rallyX, b.rallyY);
    ctx.stroke();
    ctx.setLineDash([]);
    const px = b.rallyX;
    const py = b.rallyY;
    ctx.fillRect(px - 0.75 / z, py - 10 / z, 1.5 / z, 10 / z);
    ctx.beginPath();
    ctx.moveTo(px, py - 10 / z);
    ctx.lineTo(px + 7 / z, py - 7.5 / z);
    ctx.lineTo(px, py - 5 / z);
    ctx.fill();
    ctx.restore();
  }

  /** Wegziel-Markierung: wächst und verblasst über MARKER_LIFE. */
  drawMoveMarker(ctx, m, now, z) {
    if (!m || !Number.isFinite(m.t)) return;
    const age = (now - m.t) / 1000;
    if (!(age >= 0 && age < MARKER_LIFE)) return;
    const k = age / MARKER_LIFE;
    const r = (6 + 10 * k) / z;
    ctx.save();
    ctx.strokeStyle = `rgba(150,255,180,${1 - k})`;
    ctx.lineWidth = 2 / z;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Platzierungsvorschau: grün gültig, rot ungültig; bei Mauerzug jede Zelle einzeln. */
  drawPlacement(ctx, p, z) {
    if (Array.isArray(p.cells) && p.cells.length) {
      for (const c of p.cells) this.ghostRect(ctx, c.cx, c.cy, 1, 1, c.ok, z);
      return;
    }
    const def = BUILDINGS[p.type];
    if (!def || !Number.isFinite(p.x)) return;
    const cx = Math.floor(p.x / TILE) - Math.floor(def.w / 2);
    const cy = Math.floor(p.y / TILE) - Math.floor(def.h / 2);
    this.ghostRect(ctx, cx, cy, def.w, def.h, p.ok, z);
  }

  ghostRect(ctx, cx, cy, w, h, ok, z) {
    const x = cx * TILE;
    const y = cy * TILE;
    ctx.save();
    ctx.fillStyle = ok ? 'rgba(70,220,110,0.3)' : 'rgba(255,80,80,0.3)';
    ctx.strokeStyle = ok ? '#7dff9e' : '#ff7070';
    ctx.lineWidth = 2 / z;
    ctx.fillRect(x, y, w * TILE, h * TILE);
    ctx.strokeRect(x, y, w * TILE, h * TILE);
    ctx.restore();
  }

  drawHp(ctx, x, y, w, frac, z) {
    drawBar(ctx, x, y, w, 4 / z, frac, hpColor(frac));
  }

  /** Auswahlrahmen (Bildschirmkoordinaten, Transformation bereits auf DPR gesetzt). */
  drawDragBox(ctx, d) {
    const x = Math.min(d.x1, d.x2);
    const y = Math.min(d.y1, d.y2);
    const w = Math.abs(d.x2 - d.x1);
    const h = Math.abs(d.y2 - d.y1);
    ctx.save();
    ctx.fillStyle = 'rgba(201,162,39,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();
  }

  /** Grund für ungültige Platzierung, über dem Mauszeiger (Bildschirmkoordinaten). */
  drawNote(ctx, s, text) {
    ctx.save();
    ctx.font = '600 13px system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    const bx = s.x - tw / 2 - 8;
    const by = s.y - 44;
    ctx.fillStyle = 'rgba(20,10,10,0.85)';
    ctx.fillRect(bx, by, tw + 16, 22);
    ctx.fillStyle = '#ffb4b4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, s.x, by + 11);
    ctx.restore();
  }
}

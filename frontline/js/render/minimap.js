// Minimap (PLAN §5 render/minimap.js): Gelände, Zone, Vorkommen, Gebäude und Einheiten als Punkte, Nebel, Kamerarahmen.
// Zeichnet in Weltkoordinaten (Transformation Welt → Canvas) und nutzt dieselben Sichtregeln wie der Hauptrenderer.
import { BALANCE } from '../data/balance.js';
import { buildTerrain } from './terrain.js';
import { makeFogLayer, updateFogLayer } from './renderer.js';
import { hexA, CRATE_MARK } from './sprites.js';

const TILE = BALANCE.map.tile;
const W = BALANCE.map.width;
const H = BALANCE.map.height;
const DEFAULT_SIZE = 180;

export class Minimap {
  constructor(canvas, game, camera, team) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.camera = camera;
    this.team = team;
    this.revealAll = false; // wie Renderer.revealAll, von main.js mitsetzen
    this.terrain = buildTerrain(game.map);
    this.fogLayer = makeFogLayer(game.fog[team]);
    this.dpr = 1;
    this.cssW = DEFAULT_SIZE;
    this.cssH = DEFAULT_SIZE;
    this.resize();
  }

  /** Canvas-Pufferung an CSS-Größe und DPR anpassen. */
  resize() {
    const cssW = this.canvas.clientWidth || DEFAULT_SIZE;
    const cssH = this.canvas.clientHeight || DEFAULT_SIZE;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
  }

  /** Minimap-Position (CSS-Pixel im Canvas) → Weltkoordinate. */
  toWorld(mx, my) {
    return { x: (mx * W) / this.cssW, y: (my * H) / this.cssH };
  }

  render() {
    if (this.canvas.clientWidth && (this.canvas.clientWidth !== this.cssW || this.canvas.clientHeight !== this.cssH)) {
      this.resize();
    }
    const g = this.game;
    const ctx = this.ctx;
    const team = this.team;
    const reveal = this.revealAll;
    const known = (x, y) => reveal || g.isExplored(team, x, y);
    const seen = (x, y) => reveal || g.isVisible(team, x, y);
    const kx = this.cssW / W; // CSS-Pixel je Weltpixel
    const ky = this.cssH / H;
    const px = 1 / kx; // Weltlänge von 1 CSS-Pixel (quadratische Minimap)

    ctx.setTransform(this.dpr * kx, 0, 0, this.dpr * ky, 0, 0);
    ctx.fillStyle = '#0a0d0a';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain, 0, 0, this.terrain.width, this.terrain.height, 0, 0, W, H);

    // Zone
    const zn = g.zone;
    const col = zn.owner >= 0 ? g.teams[zn.owner].color : '#e8ece8';
    ctx.beginPath();
    ctx.arc(zn.x, zn.y, zn.r, 0, Math.PI * 2);
    ctx.fillStyle = hexA(col, zn.owner >= 0 ? 0.25 : 0.1);
    ctx.fill();
    ctx.strokeStyle = hexA(col, 0.9);
    ctx.lineWidth = 1.5 * px;
    ctx.stroke();

    // Hot Zone
    const hz = g.hot;
    ctx.beginPath();
    ctx.arc(hz.x, hz.y, hz.r, 0, Math.PI * 2);
    ctx.fillStyle = hexA('#ff7a1a', 0.35);
    ctx.fill();
    ctx.strokeStyle = hexA('#ffb060', 0.9);
    ctx.lineWidth = 1.2 * px;
    ctx.stroke();

    // Gebäude (eigene immer, fremde wenn erkundet); mindestens ca. 2,5 CSS-Pixel groß
    for (const b of g.buildings) {
      if (!b.alive || (!g.alwaysVisible(team, b) && !known(b.x, b.y))) continue;
      const w = Math.max(b.w * TILE, 2.5 * px);
      const h = Math.max(b.h * TILE, 2.5 * px);
      ctx.fillStyle = g.teams[b.team].color;
      ctx.fillRect(b.x - w / 2, b.y - h / 2, w, h);
    }

    // Einheiten (fremde nur in Sicht)
    for (const u of g.units) {
      if (!u.alive || (u.team !== team && !reveal && !(seen(u.x, u.y) && g.sees(team, u)))) continue;
      ctx.fillStyle = u.team === team ? '#eaf6ff' : g.teams[u.team].color;
      ctx.beginPath();
      ctx.arc(u.x, u.y, 1.6 * px, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!reveal) {
      updateFogLayer(this.fogLayer, g.fog[team], false);
      ctx.drawImage(this.fogLayer.canvas, 0, 0, this.fogLayer.canvas.width, this.fogLayer.canvas.height, 0, 0, W, H);
    }

    // Versorgungskisten am Boden (Lagebild: Fundorte von der Karte, danach zuletzt gesehen), auch im Nebel
    const crates = reveal ? (g.crates ?? []).filter((c) => c.state === 'ground') : [...(g.crateSeen?.[team]?.values() ?? [])];
    ctx.fillStyle = CRATE_MARK;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 0.8 * px;
    for (const c of crates) {
      const s = 3.6 * px;
      ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s);
      ctx.strokeRect(c.x - s / 2, c.y - s / 2, s, s);
    }

    // Kamerarahmen
    const Q = this.camera.visibleQuad();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.2 * px;
    ctx.beginPath();
    ctx.moveTo(Q[0].x, Q[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(Q[i].x, Q[i].y);
    ctx.closePath();
    ctx.stroke();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

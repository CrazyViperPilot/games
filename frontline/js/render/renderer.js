// Haupt-Renderer (PLAN §5 render/renderer.js). Zeichnet Terrain, Zone, Vorkommen, Gebäude, Einheiten,
// Granaten, Effekte, Nebel und Overlays. Liest game.projectiles/effects bei jedem Aufruf frisch. Kein Zugriff auf den Controller.
import { BALANCE } from '../data/balance.js';
import { BUILDINGS } from '../data/buildings.js';
import { buildTerrain } from './terrain.js';
import { lacksAmmo } from '../game/entities.js';
import {
  drawUnit,
  drawBuilding,
  drawShell,
  drawEffect,
  drawBar,
  drawCrate as drawCrateTop,
  fitText,
  hpColor,
  hexA,
  drawCrater,
  drawWreck,
  drawWreckRubble,
  drawSmoke,
  drawFire,
  drawAnimalTop,
  drawAnimalSide,
  drawStar,
} from './sprites.js';
import { builderState } from '../ui/status.js';
import { makeRng } from '../core/rng.js';
import {
  setIsoGround,
  setIsoAt,
  setUprightAt,
  drawTree,
  drawRock,
  unitLift,
  buildingHeight,
  TOWN_H,
} from './iso.js';
import { drawTownBuilding, drawTeamBuilding, drawCar, drawBench, drawRubble, drawCrate, drawWreckBox } from './isobuild.js';
import { parkDeco } from './terrain.js';
import { drawTreeSprite, drawUnitSprite, drawWreckSprite, setTeamBuildings } from './isosprites.js';
import { scarAlpha } from '../game/scars.js';
import { reliefOf } from '../game/relief.js';
import { getGround, LIGHT_ELEV } from './ground.js';
import { seasonal, setRoofSnow } from './season.js';
import { drawWeather } from './weatherfx.js';
import { drawBridgeTop, drawBridgeIso, drawBridgeBar, bridgeBar, fordPosts, drawFordPostTop, drawFordPostIso } from './bridge.js';
import { bridgeUnder } from '../game/river.js';

const TILE = BALANCE.map.tile;
const W = BALANCE.map.width;
const H = BALANCE.map.height;
const BG = '#0d110d';
const BG_RGB = [13, 17, 13];
const ACCENT = '#c9a227';
const SITE_BM = BALANCE.construction.fobMaterial; // Material, das eine FOB-Baustelle braucht
const CARGO_COLOR = { bm: '#a0703f', mun: '#d9b600', fuel: '#9b7bc4' }; // LKW-Ladung je Sorte
const AMMO_COLOR = '#7f93ad'; // Munitionsbalken (grau-blau)
const FUEL_COLOR = '#9b7bc4'; // Treibstoffbalken (violett)
const BAR_W = 24; // Balkenbreite über Einheiten (Welt-px)
const HP_OFFSET = 14; // Abstand Lebensbalken-Oberkante zum Einheitenrand (Bildschirm-px); darunter Vorrat
const STAR_UP = 8; // Stern des Kommandeurs: so weit über dem Lebensbalken (Bildschirm-px)
const STAR_R = 8; // Radius des Sterns (Bildschirm-px)
const ISO_STAR_UP = 0; // Iso: zusätzlich angehoben (Welt-px), über dem Kopf der Figur
const FOG_EXPLORED_ALPHA = 150; // erkundet: abgedunkelt, nicht schwarz
const MARKER_LIFE = 0.8; // s, Lebensdauer des Wegziel-Markers
const SLOT_LIFE = 1.6; // s, so lange zeigen Punkte die Formationsplätze
const SC = BALANCE.scars;
const SMOKE_AT = 0.6; // Gebäude und Häuser rauchen unter diesem Lebensanteil, Fahrzeuge unter VEHICLE_SMOKE
const VEHICLE_SMOKE = 0.5;
const FIRE_AT = 0.3; // darunter brennt es (Fahrzeuge: halber Wert)
const WRECK_SMOKE = 60; // s: so lange raucht ein Wrack, die ersten WRECK_FIRE s brennt es
const WRECK_FIRE = 20;

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
    this.season = game.weather?.season ?? 'summer'; // Herbst- und Winterfarben (season.js)
    this.terrain = seasonal(buildTerrain(game.map), this.season);
    this.terrainIso = null; // Boden ohne Gebäude/Bäume, erst beim ersten Wechsel in die isometrische Ansicht
    this.terrainGL = null; // dasselbe ohne Gelände-Schattierung: Textur des WebGL-Bodens
    this.ground = null; // WebGL-Boden (ground.js), wenn die Karte Gelände hat und WebGL verfügbar ist
    this.fogBytes = null; // Nebel je Zelle (0 frei … 255 schwarz) für den WebGL-Nebel
    this.deco = null; // Bäume und Felsen der Hindernisse (isometrisch)
    this.fogLayer = makeFogLayer(game.fog[team]);
    this.rubble = new Map(); // Trümmer je eingestürztem Haus (2D), einmal erzeugt
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

    this.syncRelief();
    if (cam.iso) {
      this.renderIso(v, now);
      return;
    }
    const R = cam.visibleRect();
    const inRect = (x, y, pad = 0) => x >= R.x0 - pad && x <= R.x1 + pad && y >= R.y0 - pad && y <= R.y1 + pad;
    const seen = (x, y) => reveal || g.isVisible(team, x, y);
    const known = (x, y) => reveal || g.isExplored(team, x, y);
    const shown = (e) => e.team === team || reveal || (seen(e.x, e.y) && g.sees(team, e));

    // Bildschirm: Hintergrund; danach Welt-Transformation (Kamera)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (cam.viewW / 2 - cam.x * z) * dpr, (cam.viewH / 2 - cam.y * z) * dpr);
    ctx.imageSmoothingEnabled = true;

    this.drawTerrain(ctx, R);
    for (const b of g.bridges ?? []) if (inRect(b.x, b.y, b.len / 2 + 40)) drawBridgeTop(ctx, b); // über dem Fluss, unter allem anderen
    for (const p of fordPosts(g.map, reliefOf(g.map))) if (inRect(p.x, p.y, 10)) drawFordPostTop(ctx, p); // Furtstangen
    this.drawRuins(ctx, R, known);
    this.drawScars(ctx, inRect, z);
    this.drawZone(ctx, z);
    this.drawHot(ctx, z, now);

    if (v.placement) this.drawRadii(ctx, z);
    this.drawSelectedRadii(ctx, z, v);
    this.drawRoutes(ctx, sel, z);

    for (const b of g.buildings) {
      if (!b.alive || (!g.alwaysVisible(team, b) && !known(b.x, b.y))) continue;
      if (!inRect(b.x, b.y, (Math.max(b.w, b.h) * TILE) / 2)) continue;
      drawBuilding(ctx, b, g.teams[b.team].color, z);
      if (!b.built && b.team === team) this.drawSiteMarks(ctx, b, z);
    }
    const glow = 0.6 + 0.4 * Math.sin(now / 350);
    for (const m of this.crateMarks(seen, known)) {
      if (inRect(m.x, m.y, 30)) drawCrateTop(ctx, m.x, m.y, m.ground ? 16 : 13, z, m.ground ? glow : 0);
    }
    for (const a of g.animals ?? []) if (inRect(a.x, a.y, 20) && seen(a.x, a.y)) drawAnimalTop(ctx, a, z); // nur in Sicht

    // Auswahl und Hover (unter den Einheiten); Besatzer eines Hauses: Rahmen ums Haus
    for (const e of this.ringed(sel)) if (shown(e)) this.drawSelectRing(ctx, e, '#f2f5f2', z, false);
    if (hover && !sel.has(hover.id) && shown(hover)) this.drawSelectRing(ctx, hover, 'rgba(255,255,255,0.5)', z, true);

    // Sammelpunkte gewählter eigener Gebäude
    for (const id of sel) {
      const b = g.getEntity(id);
      if (b && b.kind === 'building' && b.team === team) this.drawRally(ctx, b, z);
    }

    for (const air of [false, true]) {
      // Hubschrauber zuletzt: sie fliegen über allem
      for (const u of g.units) {
        if (!u.alive || u.house || !!u.def.air !== air || !shown(u) || !inRect(u.x, u.y, 30)) continue;
        let aim = null;
        if (u.targetId && u.def.range > 0) {
          const t = g.getEntity(u.targetId);
          if (t) aim = Math.atan2(t.y - u.y, t.x - u.x);
        }
        drawUnit(ctx, u, g.teams[u.team].color, z, aim, now);
        if (u.crate) drawCrateTop(ctx, u.x + 4, u.y - 6, 10, z); // Kiste auf dem Rücken
      }
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
    const t = now / 1000;
    for (const q of this.smokeSources(seen, shown, inRect, 120)) {
      if (q.fire) drawFire(ctx, q.x, q.y, q.s * 0.7, t, q.seed);
      drawSmoke(ctx, q.x, q.y, q.s, q.k, t, q.seed);
    }

    if (!reveal) {
      updateFogLayer(this.fogLayer, g.fog[team], false);
      ctx.drawImage(this.fogLayer.canvas, 0, 0, this.fogLayer.canvas.width, this.fogLayer.canvas.height, 0, 0, W, H);
    }
    // Regen, Schnee und Nebel über der Welt (Bildschirmkoordinaten), danach wieder die Welt-Transformation
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWeather(ctx, g.weather, this.cssW, this.cssH, now, cam);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (cam.viewW / 2 - cam.x * z) * dpr, (cam.viewH / 2 - cam.y * z) * dpr);

    // Lebensbalken: bei Auswahl, Hover oder Schaden
    for (const u of g.units) {
      if (!u.alive || u.house || !shown(u) || !inRect(u.x, u.y, 30)) continue;
      if (!(sel.has(u.id) || hover === u || u.hp < u.maxHp)) continue;
      const bw = 24;
      this.drawHp(ctx, u.x - bw / 2, u.y - u.def.radius - HP_OFFSET / z, bw, u.hp / u.maxHp, z);
    }
    for (const u of g.units) {
      if (u.alive && u.def.hero && !u.house && shown(u) && inRect(u.x, u.y, 30)) drawStar(ctx, u.x, u.y - u.def.radius - (HP_OFFSET + STAR_UP) / z, STAR_R / z, z);
    }
    for (const b of g.buildings) {
      if (!b.alive || b.team !== team || !inRect(b.x, b.y, 40)) continue;
      if (!(sel.has(b.id) || hover === b || b.hp < b.maxHp)) continue;
      const bw = b.w * TILE * 0.8;
      this.drawHp(ctx, b.x - bw / 2, b.cy * TILE - 8 / z, bw, b.hp / b.maxHp, z);
    }

    // Vorrat und Warnzeichen (nur eigene Einheiten: Vorrat des Gegners ist unbekannt)
    for (const u of g.units) {
      if (!u.alive || u.house || u.team !== team || !inRect(u.x, u.y, 30)) continue;
      this.drawSupply(ctx, u, sel.has(u.id) || hover === u, z);
    }

    if (v.placement) this.drawPlacement(ctx, v.placement, z);

    // Bildschirmkoordinaten: Brückenbalken, Besatzung der Häuser, Auswahlrahmen, Hinweistext zur Platzierung
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const b of g.bridges ?? []) {
      if (!bridgeBar(b) || !inRect(b.x, b.y, 60)) continue;
      const p = cam.worldToScreen(b.x, b.y);
      drawBridgeBar(ctx, p.x, p.y - 34, b);
    }
    for (const h of g.garrisoned ?? []) {
      if (!inRect(h.x, h.y, 200) || !(h.team === team || reveal || g.sees(team, h))) continue;
      const p = cam.worldToScreen(h.x, h.y - h.ph / 2);
      this.drawGarrison(ctx, p.x, p.y - 12, h);
    }
    if (v.dragBox) this.drawDragBox(ctx, v.dragBox);
    if (v.placement && !v.placement.ok && v.placement.reason && Number.isFinite(v.placement.x)) {
      this.drawNote(ctx, cam.worldToScreen(v.placement.x, v.placement.y), v.placement.reason);
    }
  }

  /**
   * Gelände der Karte: mit WebGL steht die isometrische Ansicht auf echten Hügeln (Kamera hebt Punkte an), ohne WebGL bleibt
   * der Boden flach und das Gelände nur aufgemalt. Der Editor ändert das Gelände laufend, darum bei jedem Bild.
   */
  syncRelief() {
    const relief = reliefOf(this.game.map);
    this.ground = relief ? getGround() : null;
    this.camera.relief = this.ground ? relief : null;
  }

  /** Bodenmarkierungen folgen dem Gelände (isometrisch mit WebGL-Boden): dann Pfade in Bildschirmkoordinaten. */
  draping() {
    return this.camera.iso && !!this.camera.relief;
  }

  /** Kreis auf dem Boden als Pfad: flach per arc, mit Gelände als Linienzug in Bildschirmkoordinaten (Transformation dpr). */
  groundArc(ctx, x, y, r) {
    ctx.beginPath();
    if (!this.draping()) {
      ctx.arc(x, y, r, 0, Math.PI * 2);
      return;
    }
    const cam = this.camera;
    const n = Math.max(24, Math.min(256, Math.round(r / 30)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = cam.worldToScreen(x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.closePath();
  }

  /** Strecke auf dem Boden (wie groundArc): flach gerade, mit Gelände alle 48 px ein Stützpunkt. Ohne beginPath. */
  groundLine(ctx, x1, y1, x2, y2) {
    if (!this.draping()) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      return;
    }
    const cam = this.camera;
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 48));
    for (let i = 0; i <= n; i++) {
      const p = cam.worldToScreen(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
  }

  /** Bodenebene für eine Markierung am Weltpunkt (isometrisch auf dessen Geländehöhe). */
  groundAt(ctx, x, y) {
    const cam = this.camera;
    const br = this.game.bridges?.length ? bridgeUnder(this.game, x, y) : null; // auf einer Brücke: ihre Fahrbahn
    if (br) cam.pin(br.deckH);
    else cam.pinAt(x, y);
    setIsoGround(ctx, cam, this.dpr);
    cam.unpin();
  }

  /** Lichtrichtung (Welt, z nach oben) für den WebGL-Boden: kommt von rechts oben im Bild, wie die Schatten der Gebäude. */
  lightVec() {
    const [, , rc, rd] = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]][this.camera.rot];
    // Bildschirm „rechts oben“ entspricht der Weltrichtung (−rc, −rd); etwas nach rechts gedreht, damit Kämme nicht flach wirken
    const a = Math.atan2(-rd, -rc) + 0.35;
    const k = Math.sqrt(1 - LIGHT_ELEV * LIGHT_ELEV);
    return [Math.cos(a) * k, Math.sin(a) * k, LIGHT_ELEV];
  }

  /** Nebel als Bytes je Zelle für den WebGL-Nebel (gleiche Stufen wie updateFogLayer). */
  fogData(fog) {
    const n = fog.cols * fog.rows;
    if (!this.fogBytes || this.fogBytes.length !== n) this.fogBytes = new Uint8Array(n);
    const d = this.fogBytes;
    for (let i = 0; i < n; i++) d[i] = fog.visible[i] ? 0 : fog.explored[i] ? FOG_EXPLORED_ALPHA : 255;
    return { cols: fog.cols, rows: fog.rows, data: d };
  }

  /** Isometrisch: danach zeichnen Weltkoordinaten (x, y) aufrecht um den Bildschirmpunkt dieses Weltpunkts, `lift` Pixel höher. */
  uprightAtWorld(ctx, wx, wy, lift) {
    const cam = this.camera;
    const p = cam.worldToScreen(wx, wy);
    setUprightAt(ctx, cam, this.dpr, p.x, p.y - lift * cam.zoom, wx, wy);
  }

  /** Bäume und Felsen für Wald- und Felshindernisse (deterministisch aus der Karte). */
  buildDeco() {
    const trees = [];
    const rocks = [];
    for (const o of this.game.map.obstacles) {
      if (Math.round(o.r) % 2 === 0) {
        const rng = makeRng((o.x * 31 + o.y * 17 + o.r) >>> 0);
        const n = Math.max(5, Math.round(o.r / 7));
        for (let i = 0; i < n; i++) {
          const a = rng.next() * Math.PI * 2;
          const d = Math.sqrt(rng.next()) * o.r * 0.85;
          trees.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, r: 12 + rng.next() * 8 });
        }
      } else rocks.push(o);
    }
    return { trees, rocks };
  }

  /**
   * Isometrische Ansicht: Boden schräg (mit Gelände als WebGL-Netz, sonst flaches Bild), Gebäude/Bäume/Einheiten mit Höhe,
   * nach Tiefe sortiert und auf ihrer Geländehöhe; der Nebel liegt zuletzt über allem (mit Gelände ebenfalls aus WebGL).
   */
  renderIso(v, now) {
    const ctx = this.ctx;
    const g = this.game;
    const cam = this.camera;
    const team = this.team;
    const dpr = this.dpr;
    const z = cam.zoom;
    const reveal = this.revealAll;
    const sel = v.selection instanceof Set ? v.selection : new Set(v.selection || []);
    const hover = v.hoverId ? g.getEntity(v.hoverId) : null;
    const R = cam.visibleRect();
    const PAD = 260; // hohe Objekte ragen nach oben ins Bild
    const inRect = (x, y, pad = 0) => x >= R.x0 - pad && x <= R.x1 + pad && y >= R.y0 - pad && y <= R.y1 + pad;
    const seen = (x, y) => reveal || g.isVisible(team, x, y);
    const known = (x, y) => reveal || g.isExplored(team, x, y);
    const shown = (e) => e.team === team || reveal || (seen(e.x, e.y) && g.sees(team, e));
    const relief = cam.relief; // gesetzt nur mit WebGL-Boden
    if (!this.deco) this.deco = this.buildDeco();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (relief) {
      if (!this.terrainGL) this.terrainGL = seasonal(buildTerrain(g.map, 'gl'), this.season);
      const snow = this.season === 'winter' ? 1 : 0;
      const img = this.ground.render(cam, this.cssW, this.cssH, dpr, relief, this.terrainGL, this.lightVec(), now / 1000, BG_RGB, snow);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(img, 0, 0);
    } else {
      if (!this.terrainIso) this.terrainIso = seasonal(buildTerrain(g.map, 'iso'), this.season);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      setIsoGround(ctx, cam, dpr);
      const S = this.terrainIso.width / W;
      const x0 = Math.max(0, R.x0);
      const y0 = Math.max(0, R.y0);
      const x1 = Math.min(W, R.x1);
      const y1 = Math.min(H, R.y1);
      if (x1 > x0 && y1 > y0) {
        ctx.drawImage(this.terrainIso, x0 * S, y0 * S, (x1 - x0) * S, (y1 - y0) * S, x0, y0, x1 - x0, y1 - y0);
      }
    }
    for (const c of g.craters ?? []) {
      if (!this.scarShown(c) || !inRect(c.x, c.y, c.r + 10)) continue;
      if (relief) this.groundAt(ctx, c.x, c.y);
      else setIsoGround(ctx, cam, dpr);
      drawCrater(ctx, c, scarAlpha(c, g.time, SC.craterLife, SC.craterFade));
    }
    for (const b of g.bridges ?? []) if (inRect(b.x, b.y, b.len / 2 + PAD)) drawBridgeIso(ctx, cam, dpr, b); // Einheiten fahren darüber
    setIsoGround(ctx, cam, dpr);
    this.drawZone(ctx, z);
    this.drawHot(ctx, z, now);
    setIsoGround(ctx, cam, dpr);
    if (v.placement) this.drawRadii(ctx, z);
    this.drawSelectedRadii(ctx, z, v);
    this.drawRoutes(ctx, sel, z);
    setIsoGround(ctx, cam, dpr);
    for (const e of this.ringed(sel)) {
      if (!shown(e)) continue;
      if (relief) this.groundAt(ctx, e.x, e.y);
      this.drawSelectRing(ctx, e, '#f2f5f2', z, false);
    }
    if (hover && !sel.has(hover.id) && shown(hover)) {
      if (relief) this.groundAt(ctx, hover.x, hover.y);
      this.drawSelectRing(ctx, hover, 'rgba(255,255,255,0.5)', z, true);
    }
    for (const id of sel) {
      const b = g.getEntity(id);
      if (b && b.kind === 'building' && b.team === team) this.drawRally(ctx, b, z);
    }

    setTeamBuildings(g.buildings);
    // Objekte mit Höhe, nach Tiefe (x + y) sortiert
    const items = [];
    const town = g.map.town;
    for (const b of town?.buildings ?? []) if (inRect(b.x, b.y, PAD)) items.push({ k: cam.depth(b.x, b.y), t: 0, o: b });
    for (const t of town?.trees ?? []) if (inRect(t.x, t.y, PAD)) items.push({ k: cam.depth(t.x, t.y), t: 1, o: t });
    for (const t of g.map.trees ?? []) if (inRect(t.x, t.y, PAD)) items.push({ k: cam.depth(t.x, t.y), t: 1, o: t });
    for (const t of this.deco.trees) if (inRect(t.x, t.y, PAD)) items.push({ k: cam.depth(t.x, t.y), t: 1, o: t });
    for (const c of town?.cars ?? []) if (inRect(c.x, c.y, 60)) items.push({ k: cam.depth(c.x, c.y), t: 6, o: c });
    for (const p of town?.parks ?? []) {
      if (!inRect(p.x, p.y, p.r + PAD)) continue;
      const d = parkDeco(p);
      for (const t of d.trees) items.push({ k: cam.depth(t.x, t.y), t: 1, o: t });
      for (const b of d.benches) items.push({ k: cam.depth(b.x, b.y), t: 7, o: b });
    }
    for (const o of this.deco.rocks) if (inRect(o.x, o.y, PAD)) items.push({ k: cam.depth(o.x, o.y), t: 2, o });
    for (const b of g.buildings) {
      if (!b.alive || (!g.alwaysVisible(team, b) && !known(b.x, b.y)) || !inRect(b.x, b.y, PAD)) continue;
      items.push({ k: cam.depth(b.x, b.y), t: 4, o: b });
    }
    for (const m of this.crateMarks(seen, known)) if (inRect(m.x, m.y, 40)) items.push({ k: cam.depth(m.x, m.y), t: 8, o: m });
    for (const w of g.wrecks ?? []) {
      if (this.scarShown(w) && inRect(w.x, w.y, PAD)) items.push({ k: cam.depth(w.x, w.y), t: w.kind === 'building' ? 10 : 9, o: w });
    }
    for (const a of g.animals ?? []) if (inRect(a.x, a.y, 40) && seen(a.x, a.y)) items.push({ k: cam.depth(a.x, a.y), t: 11, o: a });
    for (const p of fordPosts(g.map, relief)) if (inRect(p.x, p.y, 30)) items.push({ k: cam.depth(p.x, p.y), t: 12, o: p });
    const [ia, , ic] = cam.isoMatrix(1); // Blickrichtung der Tiere im Bild
    const glow = 0.6 + 0.4 * Math.sin(now / 350);
    const air = [];
    for (const u of g.units) {
      if (!u.alive || u.house || !shown(u) || !inRect(u.x, u.y, PAD)) continue;
      if (u.def.air) air.push(u);
      else items.push({ k: cam.depth(u.x, u.y), t: 5, o: u });
    }
    items.sort((a, b) => a.k - b.k);

    const drawU = (u) => {
      const p = cam.worldToScreen(u.x, u.y);
      const lift = unitLift(u);
      const sc = 1.35;
      // Schatten am Boden
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, u.def.radius * z * (u.def.air ? 1.5 : 1.2), u.def.radius * z * (u.def.air ? 0.7 : 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
      let aim0 = null;
      if (u.targetId && u.def.range > 0) {
        const t0 = g.getEntity(u.targetId);
        if (t0) aim0 = Math.atan2(t0.y - u.y, t0.x - u.x);
      }
      if (drawUnitSprite(ctx, cam, u, { x: p.x, y: p.y }, aim0, lift)) return;
      setIsoAt(ctx, cam, dpr, p.x, p.y - lift * z, u.x, u.y, sc);
      let aim = null;
      if (u.targetId && u.def.range > 0) {
        const t = g.getEntity(u.targetId);
        if (t) aim = Math.atan2(t.y - u.y, t.x - u.x);
      }
      drawUnit(ctx, u, g.teams[u.team].color, z * sc, aim, now, true);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const it of items) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Jedes Objekt steht eben auf seiner Geländehöhe (Gebäude auf der tiefsten Ecke, damit nichts schwebt)
      if (relief) cam.pin(this.baseHeight(it));
      if (it.t === 0) {
        const hs = g.houseBySrc?.get(it.o);
        if (hs && hs.ruined && known(hs.x, hs.y)) drawRubble(ctx, cam, it.o);
        else {
          setRoofSnow(this.season === 'winter'); // Winter: Schnee auf den Dächern der Stadt
          drawTownBuilding(ctx, cam, it.o);
          setRoofSnow(false);
        }
      }
      else if (it.t === 1) {
        if (!drawTreeSprite(ctx, cam, it.o, this.season)) drawTree(ctx, cam, it.o, this.season);
      }
      else if (it.t === 2) drawRock(ctx, cam, it.o);
      else if (it.t === 6) drawCar(ctx, cam, it.o);
      else if (it.t === 7) drawBench(ctx, cam, it.o);
      else if (it.t === 8) drawCrate(ctx, cam, it.o.x, it.o.y, it.o.ground ? 16 : 13, 0, it.o.ground ? glow : 0);
      else if (it.t === 12) drawFordPostIso(ctx, cam, it.o);
      else if (it.t === 11) {
        const a = it.o;
        const p = cam.worldToScreen(a.x, a.y);
        drawAnimalSide(ctx, a, p.x, p.y, z * 1.1, ia * Math.cos(a.angle) + ic * Math.sin(a.angle) >= 0);
      } else if (it.t === 9 || it.t === 10) {
        const w = it.o;
        ctx.globalAlpha = scarAlpha(w, g.time, SC.wreckLife, SC.wreckFade);
        if (it.t === 10) drawRubble(ctx, cam, { x: w.x, y: w.y, w: w.w, h: w.h, kind: w.small ? 'wall' : 'wreck', hgt: w.small ? 18 : 36 }, !w.small);
        else if (!drawWreckSprite(ctx, cam, w, cam.worldToScreen(w.x, w.y))) drawWreckBox(ctx, cam, w);
        ctx.globalAlpha = 1;
      }
      else if (it.t === 4) {
        const b = it.o;
        drawTeamBuilding(ctx, cam, b, g.teams[b.team].color);
        if (!b.built && b.team === team) {
          const p = cam.worldToScreen(b.x, b.y);
          setUprightAt(ctx, cam, dpr, p.x, p.y, b.x, b.y);
          this.drawSiteMarks(ctx, b, z);
        }
      } else {
        drawU(it.o);
        if (it.o.crate) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawCrate(ctx, cam, it.o.x, it.o.y, 10, unitLift(it.o) + 14); // Kiste auf dem Rücken
        }
      }
      cam.unpin();
    }
    for (const u of air) drawU(u);

    // Geschosse fliegen im Bogen, Effekte am Boden
    for (const p of g.projectiles) {
      if (!p.alive || !shown(p)) continue;
      if (!inRect(p.x, p.y, 80) && !inRect(p.tx, p.ty, 80)) continue;
      const sp = cam.worldToScreen(p.x, p.y);
      const f = Math.min(1, p.t / p.duration);
      setUprightAt(ctx, cam, dpr, sp.x, sp.y - (14 + 90 * Math.sin(Math.PI * f)) * z, p.x, p.y);
      drawShell(ctx, p, z);
    }
    setIsoGround(ctx, cam, dpr);
    for (const e of g.effects) {
      if (!inRect(e.x, e.y, 120) && !inRect(e.x2 ?? e.x, e.y2 ?? e.y, 120)) continue;
      if (e.team !== -1 && e.team !== team && !seen(e.x, e.y) && !seen(e.x2 ?? e.x, e.y2 ?? e.y)) continue;
      if (relief) {
        // Strecken (Leuchtspur) auf der mittleren Höhe beider Enden
        cam.pin(e.x2 === undefined ? relief.displayAt(e.x, e.y) : (relief.displayAt(e.x, e.y) + relief.displayAt(e.x2, e.y2)) / 2);
        setIsoGround(ctx, cam, dpr);
        cam.unpin();
      }
      drawEffect(ctx, e, z);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = now / 1000;
    for (const q of this.smokeSources(seen, shown, inRect, PAD)) {
      const p = cam.worldToScreen(q.x, q.y);
      const y = p.y - q.lift * z;
      if (q.fire) drawFire(ctx, p.x, y, q.s * 0.7 * z, t, q.seed);
      drawSmoke(ctx, p.x, y, q.s * z, q.k, t, q.seed);
    }
    if (relief && v.moveMarker) this.groundAt(ctx, v.moveMarker.x, v.moveMarker.y);
    this.drawMoveMarker(ctx, v.moveMarker, now, z, relief ? (x, y) => this.groundAt(ctx, x, y) : null);

    if (!reveal) {
      if (relief) {
        const img = this.ground.renderFog(cam, this.cssW, this.cssH, dpr, relief, this.fogData(g.fog[team]));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(img, 0, 0);
      } else {
        setIsoGround(ctx, cam, dpr);
        updateFogLayer(this.fogLayer, g.fog[team], false);
        ctx.drawImage(this.fogLayer.canvas, 0, 0, this.fogLayer.canvas.width, this.fogLayer.canvas.height, 0, 0, W, H);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWeather(ctx, g.weather, this.cssW, this.cssH, now, cam); // Regen, Schnee und Nebel über der Welt

    // Balken und Warnzeichen aufrecht über den Objekten
    const upright = (wx, wy, lift) => {
      const p = cam.worldToScreen(wx, wy);
      setUprightAt(ctx, cam, dpr, p.x, p.y - lift * z, wx, wy);
    };
    for (const u of g.units) {
      if (!u.alive || u.house || !shown(u) || !inRect(u.x, u.y, PAD)) continue;
      if (!(sel.has(u.id) || hover === u || u.hp < u.maxHp)) continue;
      upright(u.x, u.y, unitLift(u));
      this.drawHp(ctx, u.x - 12, u.y - u.def.radius - HP_OFFSET / z, 24, u.hp / u.maxHp, z);
    }
    for (const u of g.units) {
      if (!u.alive || !u.def.hero || u.house || !shown(u) || !inRect(u.x, u.y, PAD)) continue;
      upright(u.x, u.y, unitLift(u) + ISO_STAR_UP);
      drawStar(ctx, u.x, u.y - u.def.radius - (HP_OFFSET + STAR_UP) / z, STAR_R / z, z);
    }
    for (const b of g.buildings) {
      if (!b.alive || b.team !== team || !inRect(b.x, b.y, PAD)) continue;
      if (!(sel.has(b.id) || hover === b || b.hp < b.maxHp)) continue;
      const bw = b.w * TILE * 0.8;
      if (relief) cam.pin(this.baseHeight({ t: 4, o: b }));
      upright(b.x, b.cy * TILE, buildingHeight(b) + 8);
      cam.unpin();
      this.drawHp(ctx, b.x - bw / 2, b.cy * TILE - 8 / z, bw, b.hp / b.maxHp, z);
    }
    for (const u of g.units) {
      if (!u.alive || u.house || u.team !== team || !inRect(u.x, u.y, PAD)) continue;
      upright(u.x, u.y, unitLift(u));
      this.drawSupply(ctx, u, sel.has(u.id) || hover === u, z);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const b of g.bridges ?? []) {
      if (!bridgeBar(b) || !inRect(b.x, b.y, PAD)) continue;
      cam.pin(b.deckH);
      const p = cam.worldToScreen(b.x, b.y);
      cam.unpin();
      drawBridgeBar(ctx, p.x, p.y - 34 * Math.max(0.6, z), b);
    }
    for (const h of g.garrisoned ?? []) {
      if (!inRect(h.x, h.y, PAD) || !(h.team === team || reveal || g.sees(team, h))) continue;
      if (relief) cam.pin(this.baseHeight({ t: 0, o: h.src }));
      const p = cam.worldToScreen(h.x, h.y);
      cam.unpin();
      this.drawGarrison(ctx, p.x, p.y - ((TOWN_H[h.type] || 40) + 20) * z, h);
    }

    if (v.placement) {
      if (relief && Number.isFinite(v.placement.x)) this.groundAt(ctx, v.placement.x, v.placement.y);
      else setIsoGround(ctx, cam, dpr);
      this.drawPlacement(ctx, v.placement, z);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (v.dragBox) this.drawDragBox(ctx, v.dragBox);
    if (v.placement && !v.placement.ok && v.placement.reason && Number.isFinite(v.placement.x)) {
      this.drawNote(ctx, cam.worldToScreen(v.placement.x, v.placement.y), v.placement.reason);
    }
  }

  /**
   * Kisten zum Zeichnen: am Boden, wie das Team sie zuletzt gesehen hat (nur in erkundeten Zellen; Debug: alle), und eingelagerte bei
   * eigenen FOBs oder in Sicht. Getragene zeichnet die Einheit. → [{ x, y, ground }]
   */
  crateMarks(seen, known) {
    const g = this.game;
    const out = [];
    for (const c of g.crates ?? []) {
      if (c.state === 'stored' && (c.holder === this.team || seen(c.x, c.y))) out.push({ x: c.x, y: c.y, ground: false });
      else if (c.state === 'ground' && this.revealAll) out.push({ x: c.x, y: c.y, ground: true });
    }
    if (!this.revealAll) for (const m of g.crateSeen?.[this.team]?.values() ?? []) if (known(m.x, m.y)) out.push({ x: m.x, y: m.y, ground: true });
    return out;
  }

  /** Wrack oder Krater, den das Team schon gesehen hat (Debug: alle). */
  scarShown(s) {
    return this.revealAll || ((s.seen >> this.team) & 1) === 1;
  }

  /** Draufsicht: Krater und Brandflecken, darauf Trümmer und Fahrzeugwracks (unter Gebäuden und Einheiten). */
  drawScars(ctx, inRect, z) {
    const g = this.game;
    for (const c of g.craters ?? []) {
      if (this.scarShown(c) && inRect(c.x, c.y, c.r + 10)) drawCrater(ctx, c, scarAlpha(c, g.time, SC.craterLife, SC.craterFade));
    }
    for (const w of g.wrecks ?? []) {
      if (!this.scarShown(w) || !inRect(w.x, w.y, 60)) continue;
      const a = scarAlpha(w, g.time, SC.wreckLife, SC.wreckFade);
      if (w.kind === 'building') drawWreckRubble(ctx, w, a);
      else drawWreck(ctx, w, z, a);
    }
  }

  /**
   * Rauch und Feuer in Sicht: beschädigte Teamgebäude und Häuser (unter SMOKE_AT), Fahrzeuge (unter VEHICLE_SMOKE) und frische
   * Wracks. Größen in Welt-px, lift = Höhe der Quelle über dem Boden (isometrisch). → [{ x, y, lift, s, k, fire, seed }]
   */
  smokeSources(seen, shown, inRect, pad) {
    const g = this.game;
    const out = [];
    for (const b of g.buildings) {
      if (!b.alive || !b.built || b.def.blocksAll || b.def.gate || !inRect(b.x, b.y, pad)) continue;
      const f = b.hp / b.maxHp;
      if (f >= SMOKE_AT || !(b.team === this.team || seen(b.x, b.y))) continue;
      const off = ((b.id * 37) % 21) / 20 - 0.5; // nicht genau in der Mitte
      out.push({ x: b.x + off * b.w * TILE * 0.5, y: b.y - off * b.h * TILE * 0.3, lift: buildingHeight(b) * 0.5, s: 6 + 2.5 * Math.max(b.w, b.h), k: (SMOKE_AT - f) / SMOKE_AT, fire: f < FIRE_AT, seed: b.id * 13 });
    }
    for (const h of g.houses ?? []) {
      if (!h.alive || h.ruined || h.hp >= h.maxHp * SMOKE_AT || !inRect(h.x, h.y, pad) || !(h.team === this.team || seen(h.x, h.y))) continue;
      const f = h.hp / h.maxHp;
      out.push({ x: h.x, y: h.y, lift: (TOWN_H[h.type] || 40) * 0.85, s: 8 + Math.max(h.pw, h.ph) / 14, k: (SMOKE_AT - f) / SMOKE_AT, fire: f < FIRE_AT, seed: -h.id * 7 });
    }
    for (const u of g.units) {
      if (!u.alive || u.house || u.def.armor === 'inf' || u.hp >= u.maxHp * VEHICLE_SMOKE || !inRect(u.x, u.y, pad) || !shown(u)) continue;
      const f = u.hp / u.maxHp;
      out.push({ x: u.x, y: u.y, lift: unitLift(u) + 6, s: 4 + u.def.radius * 0.3, k: (VEHICLE_SMOKE - f) / VEHICLE_SMOKE, fire: f < FIRE_AT / 2, seed: u.id * 17 });
    }
    for (const w of g.wrecks ?? []) {
      const age = g.time - w.t0;
      if (age >= WRECK_SMOKE || w.small || !inRect(w.x, w.y, pad) || !seen(w.x, w.y)) continue;
      const big = w.kind === 'building';
      out.push({ x: w.x, y: w.y, lift: big ? 12 : 6, s: big ? 8 + Math.max(w.w, w.h) / 14 : 6, k: 1 - age / WRECK_SMOKE, fire: age < WRECK_FIRE, seed: w.id * 29 });
    }
    return out;
  }

  /** Geländehöhe, auf der ein Objekt der Tiefenliste steht: Gebäude auf ihrer tiefsten Ecke, sonst am Fußpunkt. */
  baseHeight(it) {
    const relief = this.camera.relief;
    const o = it.o;
    let x0;
    let y0;
    let x1;
    let y1;
    if (it.t === 4) {
      x0 = o.cx * TILE;
      y0 = o.cy * TILE;
      x1 = x0 + o.w * TILE;
      y1 = y0 + o.h * TILE;
    } else if (it.t === 10) {
      x0 = o.x - o.w / 2;
      x1 = o.x + o.w / 2;
      y0 = o.y - o.h / 2;
      y1 = o.y + o.h / 2;
    } else if (it.t === 0) {
      const r = Math.max(o.w, o.h) / 2;
      x0 = o.x - (o.angle ? r : o.w / 2);
      x1 = o.x + (o.angle ? r : o.w / 2);
      y0 = o.y - (o.angle ? r : o.h / 2);
      y1 = o.y + (o.angle ? r : o.h / 2);
    } else if (it.t === 5) return this.game.groundHeight(o); // Einheiten: auf Brücken die Fahrbahn
    else return relief.displayAt(o.x, o.y);
    return Math.min(relief.displayAt(x0, y0), relief.displayAt(x1, y0), relief.displayAt(x0, y1), relief.displayAt(x1, y1));
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
    const drape = this.draping();
    const k = drape ? z : 1; // Längen in Bildschirm-Pixeln, wenn der Kreis dem Gelände folgt
    ctx.save();
    if (drape) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.groundArc(ctx, zn.x, zn.y, zn.r);
    ctx.fillStyle = hexA(col, owned ? 0.12 : 0.05);
    ctx.fill();
    ctx.strokeStyle = hexA(col, 0.85);
    ctx.lineWidth = drape ? Math.max(1.5, 3 * z) : 4;
    if (zn.contested) ctx.setLineDash([28 * k, 18 * k]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Beschriftung nahe dem oberen Rand, damit sie nicht über den Einheiten in der Mitte liegt
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 56px system-ui, sans-serif';
    if (this.camera.iso) this.uprightAtWorld(ctx, zn.x, zn.y - zn.r + 110, 0);
    ctx.fillText('KONFLIKTZONE', zn.x, zn.y - zn.r + 110);
    ctx.restore();
  }

  /** Hot Zone: pulsierender oranger Kreis mit Beschriftung; Besitzfarbe, wenn ein Team sie hält. */
  drawHot(ctx, z, now) {
    const hz = this.game.hot;
    const owned = hz.owner >= 0;
    const col = owned ? this.game.teams[hz.owner].color : '#ff9a1f';
    const pulse = 0.5 + 0.5 * Math.sin(now / 400);
    const drape = this.draping();
    const k = drape ? z : 1;
    ctx.save();
    if (drape) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.groundArc(ctx, hz.x, hz.y, hz.r);
    ctx.fillStyle = hexA('#ff7a1a', 0.1 + 0.07 * pulse);
    ctx.fill();
    ctx.strokeStyle = hexA(col, 0.9);
    ctx.lineWidth = drape ? Math.max(1.5, 2.4 * z) : 3;
    ctx.setLineDash([16 * k, 10 * k]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,190,110,0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 34px system-ui, sans-serif';
    if (this.camera.iso) this.uprightAtWorld(ctx, hz.x, hz.y - hz.r + 40, 0);
    ctx.fillText('HOT ZONE', hz.x, hz.y - hz.r + 40);
    ctx.restore();
  }

  /** Bauradius der eigenen fertigen FOBs (nur bei Platzierung). */
  drawRadii(ctx, z) {
    const g = this.game;
    const k = this.draping() ? z : 1;
    ctx.save();
    if (this.draping()) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.setLineDash([(10 / z) * k, (8 / z) * k]);
    ctx.strokeStyle = 'rgba(120,190,255,0.4)';
    ctx.lineWidth = (2 / z) * k;
    for (const b of g.buildings) {
      if (!b.alive || !b.built || b.team !== this.team || b.type !== 'fob') continue;
      this.groundArc(ctx, b.x, b.y, BALANCE.fob.buildRadius);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Bauradius gewählter oder überfahrener FOBs (eigene und gegnerische) in Teamfarbe, leicht gefüllt. */
  drawSelectedRadii(ctx, z, v) {
    const g = this.game;
    const ids = v.selection ? [...v.selection] : [];
    if (v.hoverId) ids.push(v.hoverId);
    const seen = new Set();
    const k = this.draping() ? z : 1;
    ctx.save();
    if (this.draping()) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineWidth = (2 / z) * k;
    ctx.setLineDash([(10 / z) * k, (8 / z) * k]);
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = g.getEntity(id);
      if (b && b.kind === 'building' && b.def.weapon && b.def.weapon.shell && b.team === this.team) {
        this.drawMortarRange(ctx, b, z);
        continue;
      }
      if (b && b.kind === 'unit' && b.def.hero && !b.house) {
        // Kommandeur: Umkreis seiner Aura
        this.groundArc(ctx, b.x, b.y, BALANCE.commander.aura);
        ctx.fillStyle = 'rgba(242,201,76,0.06)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(242,201,76,0.8)';
        ctx.stroke();
        continue;
      }
      if (!b || b.kind !== 'building' || b.type !== 'fob') continue;
      const color = g.teams[b.team].color;
      ctx.globalAlpha = b.built ? 1 : 0.5;
      this.groundArc(ctx, b.x, b.y, BALANCE.fob.buildRadius);
      ctx.fillStyle = hexA(color, 0.07);
      ctx.fill();
      ctx.strokeStyle = hexA(color, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Mörser: Reichweite (außen), Mindestreichweite (innen) und gewähltes Ziel. */
  drawMortarRange(ctx, b, z) {
    const w = b.def.weapon;
    const drape = this.draping();
    const k = drape ? z : 1;
    ctx.save();
    if (drape) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.setLineDash([(10 / z) * k, (8 / z) * k]);
    ctx.lineWidth = (2 / z) * k;
    this.groundArc(ctx, b.x, b.y, w.range);
    ctx.fillStyle = 'rgba(255,170,60,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,60,0.75)';
    ctx.stroke();
    this.groundArc(ctx, b.x, b.y, w.minRange);
    ctx.strokeStyle = 'rgba(255,170,60,0.4)';
    ctx.stroke();
    ctx.setLineDash([]);
    if (b.fireTarget) {
      const t = b.fireTarget;
      if (drape) this.groundAt(ctx, t.x, t.y);
      ctx.strokeStyle = '#ff6a3a';
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      ctx.arc(t.x, t.y, w.splash || 30, 0, Math.PI * 2);
      ctx.moveTo(t.x - 14 / z, t.y);
      ctx.lineTo(t.x + 14 / z, t.y);
      ctx.moveTo(t.x, t.y - 14 / z);
      ctx.lineTo(t.x, t.y + 14 / z);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Entities für Auswahlrahmen: Besatzer eines Hauses werden zum Haus (je Haus einmal). */
  ringed(sel) {
    const g = this.game;
    const out = new Set();
    for (const id of sel) {
      const e = g.getEntity(id);
      if (e) out.add(e.house ? (g.getEntity(e.house) ?? e) : e);
    }
    return out;
  }

  /** 2D: Ruinen eingestürzter Stadthäuser über dem Bodenbild (das die Häuser fest enthält): Schutt und Brocken. */
  drawRuins(ctx, R, known) {
    for (const h of this.game.houses ?? []) {
      if (!h.ruined || !known(h.x, h.y)) continue;
      const x0 = h.x - h.pw / 2;
      const y0 = h.y - h.ph / 2;
      if (x0 > R.x1 || y0 > R.y1 || x0 + h.pw < R.x0 || y0 + h.ph < R.y0) continue;
      let bits = this.rubble.get(h.id);
      if (!bits) {
        const rng = makeRng(((h.x * 73856093) ^ (h.y * 19349663)) >>> 0);
        const cols = ['#8d877c', '#79736a', '#9a9387', '#5f5a53'];
        bits = [];
        const n = Math.max(8, Math.min(40, Math.round((h.pw * h.ph) / 400)));
        for (let i = 0; i < n; i++) {
          const s = 4 + rng.next() * 11;
          bits.push({ x: x0 + 3 + rng.next() * (h.pw - 6 - s), y: y0 + 3 + rng.next() * (h.ph - 6 - s), w: s, h: s * (0.5 + rng.next()), c: cols[i % cols.length] });
        }
        this.rubble.set(h.id, bits);
      }
      ctx.fillStyle = '#6f6a62';
      ctx.fillRect(x0, y0, h.pw, h.ph);
      for (const b of bits) {
        ctx.fillStyle = b.c;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, h.pw, h.ph);
    }
  }

  /** Besatzung eines Hauses (Bildschirmkoordinaten, Transformation auf DPR): Schild in Teamfarbe „n/Plätze“, darunter der Zustand. */
  drawGarrison(ctx, x, y, h) {
    const text = `${h.occupants.length}/${h.def.cap}`;
    ctx.save();
    ctx.font = '700 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 22;
    const bh = 16;
    const x0 = x - w / 2;
    const y0 = y - bh / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, bh, 4);
    else ctx.rect(x0, y0, w, bh);
    ctx.fillStyle = this.game.teams[h.team]?.color ?? '#888';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // kleines Soldaten-Zeichen: Helm und Schultern
    ctx.fillStyle = '#f4f6f2';
    ctx.beginPath();
    ctx.arc(x0 + 8, y0 + 6.5, 3, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x0 + 4.5, y0 + 8.5, 7, 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x0 + 15, y + 0.5);
    if (h.hp < h.maxHp) drawBar(ctx, x0, y0 + bh + 2, w, 3, h.hp / h.maxHp, hpColor(h.hp / h.maxHp));
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
    } else if (e.kind === 'house') {
      ctx.strokeRect(e.x - e.pw / 2 - 3, e.y - e.ph / 2 - 3, e.pw + 6, e.ph + 6);
    } else if (e.kind === 'crate') {
      ctx.beginPath();
      ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
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
    const drape = this.draping();
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
      if (drape) {
        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        this.groundLine(ctx, a.x, a.y, b.x, b.y);
        ctx.stroke();
        ctx.restore();
        this.groundAt(ctx, b.x, b.y);
      } else {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
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
    if (lacksAmmo(u)) {
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
    if (this.draping()) {
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      this.groundLine(ctx, b.x, b.y, b.rallyX, b.rallyY);
      ctx.stroke();
      ctx.restore();
      this.groundAt(ctx, b.rallyX, b.rallyY);
    } else {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.rallyX, b.rallyY);
      ctx.stroke();
    }
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
  /** Wegziel: Ring am Klickpunkt, bei Formationen kurz Punkte auf den Zielplätzen. at(x, y) setzt im Relief die Bodenebene dort. */
  drawMoveMarker(ctx, m, now, z, at = null) {
    if (!m || !Number.isFinite(m.t)) return;
    const age = (now - m.t) / 1000;
    if (!(age >= 0 && age < Math.max(MARKER_LIFE, m.slots ? SLOT_LIFE : 0))) return;
    ctx.save();
    if (m.slots) {
      ctx.fillStyle = `rgba(150,255,180,${0.85 * (1 - age / SLOT_LIFE)})`;
      for (const p of m.slots) {
        at?.(p.x, p.y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 / z, 0, Math.PI * 2);
        ctx.fill();
      }
      at?.(m.x, m.y);
    }
    if (age < MARKER_LIFE) {
      const k = age / MARKER_LIFE;
      ctx.strokeStyle = `rgba(150,255,180,${1 - k})`;
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      ctx.arc(m.x, m.y, (6 + 10 * k) / z, 0, Math.PI * 2);
      ctx.stroke();
    }
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

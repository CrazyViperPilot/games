// Haupt-Renderer (docs/verlauf.md §5 render/renderer.js). Zeichnet Terrain, Zone, Vorkommen, Gebäude, Einheiten,
// Granaten, Effekte, Nebel und Overlays. Liest game.projectiles/effects bei jedem Aufruf frisch. Kein Zugriff auf den Controller.
import { BALANCE } from '../data/balance.js';
import { BUILDINGS } from '../data/buildings.js';
import { CITY } from '../data/city.js';
import { careOf } from '../game/city/care.js';
import { KINDS as CITY_KINDS, KIND as CITY_KIND } from '../data/citykinds.js';
import { bigCenter } from '../game/city/cells.js';
import { runwaysOf } from '../game/aircraft.js';
import { treeGone } from '../game/city/clearing.js';
import { rangeMul } from '../game/research.js';
import { buildTerrain, railList } from './terrain.js';
import { lacksAmmo } from '../game/entities.js';
import {
  drawUnit,
  drawBuilding,
  drawBar,
  drawCrate as drawCrateTop,
  fitText,
  hpColor,
  hexA,
  drawAnimalTop,
  drawAnimalSide,
  drawStar,
} from './sprites.js';
import { builderState } from '../game/construction.js';
import { GOOD_COLOR } from '../data/goods.js';
import { hashXY } from './color.js';
import { makeRng } from '../core/rng.js';
import {
  setIsoGround,
  setIsoAt,
  setUprightAt,
  drawTree,
  drawRock,
  unitLift,
  flying,
  buildingHeight,
  TOWN_H,
} from './iso.js';
import { drawCityHallTop } from './cityhall.js';
import { drawTownBuilding, drawTeamBuilding, drawCar, drawBench, drawRubble, drawCrate, drawWreckBox } from './isobuild.js';
import { parkDeco } from './terrain.js';
import { drawUnitSprite, drawWreckSprite } from './isosprites.js';
import { drawMapCarIso, drawMapCarShadowIso, drawBenchIso, drawBenchShadowIso, drawCrateIso, drawCrateTop as drawCratePainted, drawBaleIso, drawBaleShadowIso, drawBaleTop } from './props.js';
import { fieldBales } from './fields.js';
import { drawTreeIso, drawTreeTop, drawBushIso, drawBushTop, drawRockIso, drawRockTop, natureShadowIso, drawAnimalIso, drawAnimalTopP, forestKind, forestSpecies } from './nature.js';
import { drawMilTop, setMilWalls } from './milbuild.js';
import { scarAlpha } from '../game/scars.js';
import { reliefOf, RELIEF } from '../game/relief.js';
import { getGround, LIGHT_ELEV, FOG_EXPLORED_ALPHA } from './ground.js';
import { seasonal, setRoofSnow } from './season.js';
import { drawWeather } from './weatherfx.js';
import { drawMood } from './mood.js';
import { drawBridgeTop, drawBridgeIso, drawBridgeBar, bridgeBar, fordPosts, drawFordPostTop, drawFordPostIso } from './bridge.js';
import { bridgeUnder } from '../game/river.js';
import { setMapTown, drawMapTown2D, drawMapCars2D, drawPark } from './maptown.js';
import { drawHouseWorksIso, drawHouseWorksTop, drawHouseFlagIso, drawHouseFlagTop, worksMask } from './stronghold.js';
import { drawUnitTop, drawUnitShadowIso, drawWreckTop } from './unitpaint.js';
import { drawShell, drawShellIso, drawShellTarget, drawEffect, drawEffectUp, drawCrater, drawWreck, drawWreckRubble, drawSmoke, drawSmokeScreen, drawDust, drawFire, drawMine } from './fx.js';
import { drawCityGround, drawCityTop, drawCityRoofs, cityBuildings, drawCityBadges } from './citylayer.js';
import { drawWays } from './ways.js';
import { drawSelectMark, drawDragFrame, drawCargoGauge, drawCareMark, drawNoAmmoMark, drawMoveRing, drawSlotMark, strokeTrail, drawArrowHead, drawFootRing, drawRallyFlag } from './marks.js';
import { beginTownFrame, townLift } from './townhouses.js';

const TILE = BALANCE.map.tile;
const W = BALANCE.map.width;
const H = BALANCE.map.height;
const BG = '#0d110d';
const BG_RGB = [13, 17, 13];
const ACCENT = '#c9a227';
const GOLD_RALLY = '#ffd65a'; // Ring am Sammelpunkt
const ROUTE_COLOR = 'rgba(222,182,52,0.95)'; // Route gewählter LKW
const CARGO_COLOR = GOOD_COLOR; // LKW-Ladung je Sorte in der Farbe ihrer Ware (js/data/goods.js, seit v5.64)
const AMMO_COLOR = '#7f93ad'; // Munitionsbalken (grau-blau)
const FUEL_COLOR = GOOD_COLOR.fuel; // Treibstoffbalken (violett, Farbe der Ware)
const BAR_W = 24; // Balkenbreite über Einheiten (Welt-px)
const HP_OFFSET = 14; // Abstand Lebensbalken-Oberkante zum Einheitenrand (Bildschirm-px); darunter Vorrat
const STAR_UP = 8; // Stern des Kommandeurs: so weit über dem Lebensbalken (Bildschirm-px)
const STAR_R = 8; // Radius des Sterns (Bildschirm-px)
const ISO_PAD = 260; // Iso: Rand um den Ausschnitt, hohe Objekte ragen nach oben ins Bild (Welt-px)
const ISO_STAR_UP = 0; // Iso: zusätzlich angehoben (Welt-px), über dem Kopf der Figur
const MARKER_LIFE = 0.8; // s, Lebensdauer des Wegziel-Markers
const SLOT_LIFE = 1.6; // s, so lange zeigen Punkte die Formationsplätze
const WIN_OFF = 4; // Feuerbereich (seit v5.67): Strich vor der Hauswand (Welt-px)
const WIN_HALF = 0.3; // halbe Länge des Strichs, Anteil der Seitenlänge
const SC = BALANCE.scars;
const SMOKE_AT = 0.6; // Gebäude und Häuser rauchen unter diesem Lebensanteil, Fahrzeuge unter VEHICLE_SMOKE
const VEHICLE_SMOKE = 0.5;
const FIRE_AT = 0.3; // darunter brennt es (Fahrzeuge: halber Wert)
const WRECK_SMOKE = 60; // s: so lange raucht ein Wrack, die ersten WRECK_FIRE s brennt es
const WRECK_FIRE = 20;

/** Off-screen-Canvas in Nebelzellen-Größe (173 × 173) mit ImageData; clouds = false: ohne Wolken (Minimap, dort wäre es Rauschen). */
export function makeFogLayer(fog, clouds = true) {
  const canvas = document.createElement('canvas');
  canvas.width = fog.cols;
  canvas.height = fog.rows;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, image: ctx.createImageData(fog.cols, fog.rows), clouds };
}

// Kriegsnebel (seit v5.49 gemalt, Daniels Wunsch „schaue welche Assets noch nicht verbessert wurden“): Unerforschtes liegt unter einer
// dunklen Wolkendecke mit weichen hellen und dunklen Flecken statt flach schwarz, Erkundetes ist kühl abgedunkelt, am Übergang ein
// heller Wolkensaum; der Rand ist weichgezeichnet, damit keine Treppen aus 64-px-Zellen bleiben. Mit WebGL zeichnet ground.js (FS_FOG)
// den Nebel in Iso und 2D (ziehende Wolken); hier der Canvas-Weg für die Minimap und Geräte ohne WebGL (feste Wolkenflecken).
const FOG_DIM = [8, 12, 20]; // erkundet
const FOG_DEEP = [5, 7, 9]; // Wolken dunkel …
const FOG_LIGHT = [24, 27, 33]; // … und hell
const FOG_RIM = [15, 17, 18]; // heller Saum am Rand des Unerforschten

/** Wolken je Nebelzelle (Stufe 0 … 15, fest): weiches Wertrauschen über zwei Maßstäbe. */
export function fogTone(cols, rows) {
  const out = new Uint8Array(cols * rows);
  const h = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi);
    const b = h(xi + 1, yi);
    const c = h(xi, yi + 1);
    const d = h(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[r * cols + c] = Math.min(15, Math.floor((vn(c / 6, r / 6) * 0.65 + vn(c / 2.5 + 17, r / 2.5 + 5) * 0.35) * 16));
  }
  return out;
}

let fogStamp = 0; // zählt jeden neu gerechneten WebGL-Nebel (über alle Renderer), ground.js lädt die Textur nur dann neu

/** Weichzeichnen 1-2-1 waagrecht (nach tmp), dann senkrecht (zurück nach a); k Werte je Zelle, verschachtelt. Liefert a. */
export function blur121(a, tmp, cols, rows, k = 1) {
  const line = cols * k;
  for (let r = 0; r < rows; r++) {
    const o = r * line;
    for (let j = 0; j < line; j++) {
      const i = o + j;
      tmp[i] = (a[j < k ? i : i - k] + 2 * a[i] + a[j >= line - k ? i : i + k] + 2) >> 2;
    }
  }
  for (let r = 0; r < rows; r++) {
    const o = r * line;
    const up = r > 0 ? -line : 0;
    const dn = r < rows - 1 ? line : 0;
    for (let j = 0; j < line; j++) {
      const i = o + j;
      a[i] = (tmp[i + up] + 2 * tmp[i] + tmp[i + dn] + 2) >> 2;
    }
  }
  return a;
}

/**
 * Füllt die Nebelschicht aus fog.visible / fog.explored (Canvas-Weg: Minimap und ohne WebGL; seit v5.49 weicher Rand, Wolken,
 * heller Saum). reveal = alles sichtbar.
 */
export function updateFogLayer(layer, fog, reveal) {
  const d = layer.image.data;
  const cols = fog.cols;
  const rows = fog.rows;
  const n = cols * rows;
  if (!layer.a || layer.a.length !== n) {
    layer.a = new Uint8Array(n);
    layer.b = new Uint8Array(n);
    layer.tone = layer.clouds === false ? new Uint8Array(n).fill(5) : fogTone(cols, rows);
    layer.lut = fogLut();
  }
  // nur neu malen, wenn sich der Nebel geändert hat (fog.version zählt jede Neuberechnung, alle 0,25 s Spielzeit)
  if (fog.version !== undefined && layer.src === fog && layer.ver === fog.version && layer.rev === reveal) return;
  layer.src = fog;
  layer.ver = fog.version;
  layer.rev = reveal;
  const A = layer.a;
  const vis = fog.visible;
  const exp = fog.explored;
  for (let i = 0; i < n; i++) A[i] = reveal || vis[i] ? 0 : exp[i] ? FOG_EXPLORED_ALPHA : 255;
  blur121(A, layer.b, cols, rows, 1);
  const T = layer.tone;
  const L = layer.lut;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const q = (A[i] * 16 + T[i]) * 3; // Tabelle: Nebelstufe × 16 Wolkentöne
    d[p] = L[q];
    d[p + 1] = L[q + 1];
    d[p + 2] = L[q + 2];
    d[p + 3] = A[i];
  }
  layer.ctx.putImageData(layer.image, 0, 0);
}

/** Farbtabelle für updateFogLayer: je Nebelstufe (0 … 255) und Wolkenton (0 … 15) r, g, b wie FS_FOG in ground.js. */
function fogLut() {
  const L = new Uint8ClampedArray(256 * 16 * 3);
  const span = 255 - FOG_EXPLORED_ALPHA;
  for (let a = 0; a < 256; a++) {
    const u = a <= FOG_EXPLORED_ALPHA ? 0 : (a - FOG_EXPLORED_ALPHA) / span; // 0 erkundet … 1 unerforscht
    for (let s = 0; s < 16; s++) {
      const t = s / 15;
      const w = Math.min(1, t * t * 1.3);
      const rim = 4 * u * (1 - u) * (0.35 + 0.65 * t); // heller Saum am Übergang
      const q = (a * 16 + s) * 3;
      for (let k = 0; k < 3; k++) L[q + k] = FOG_DIM[k] + (FOG_DEEP[k] + (FOG_LIGHT[k] - FOG_DEEP[k]) * w - FOG_DIM[k]) * u + FOG_RIM[k] * rim;
    }
  }
  return L;
}

export class Renderer {
  constructor(canvas, game, camera, team) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.camera = camera;
    this.team = team;
    this.revealAll = false; // Debug: kein Nebel, alle Gegner sichtbar
    this.mood = null; // Lichtstimmung (mood.js), main.js setzt sie nach der Wahl im Startmenü
    this.season = game.weather?.season ?? 'summer'; // Herbst- und Winterfarben (season.js)
    this.terrain = seasonal(buildTerrain(game.map), this.season);
    this.terrainIso = null; // Boden ohne Gebäude/Bäume, erst beim ersten Wechsel in die isometrische Ansicht
    this.terrainGL = null; // dasselbe ohne Gelände-Schattierung: Textur des WebGL-Bodens
    this.ground = null; // WebGL-Boden (ground.js), wenn die Karte Gelände hat und WebGL verfügbar ist
    this.fogBytes = null; // Nebel je Zelle (0 frei … 255 schwarz) für den WebGL-Nebel
    this.deco = null; // Bäume und Felsen der Hindernisse (isometrisch)
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
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const g = this.game;
    this.syncRelief();
    beginTownFrame(this.dpr); // Stadtgebäude: Maßstab der Bilder, Zeitbudget fürs Nachmalen (townhouses.js, spritecache.js)
    setMapTown(g.map); // Kartenstadt: Felder für die Gehöfte (maptown.js)
    setMilWalls(g.buildings); // Mauern und Tore: Verbindungen zu den Nachbarn (milbuild.js)
    if (!this.deco) this.deco = this.buildDeco();
    const f = this.frameOf(v, now);
    if (this.camera.iso) this.renderIso(f);
    else this.renderTop(f);
  }

  /**
   * Gemeinsame Werte eines Bildes für alle Durchläufe (seit v5.64, Review-Paket P11): Ansicht v, Zeit, Kamera, Sichtregeln.
   * inRect(x, y, pad): im sichtbaren Ausschnitt; seen/known: in Sicht bzw. erkundet; shown(e): Objekt für das eigene Team sichtbar.
   */
  frameOf(v, now) {
    const g = this.game;
    const cam = this.camera;
    const team = this.team;
    const reveal = this.revealAll;
    const R = cam.visibleRect();
    const seen = (x, y) => reveal || g.isVisible(team, x, y);
    return {
      v,
      now,
      ctx: this.ctx,
      g,
      cam,
      team,
      dpr: this.dpr,
      z: cam.zoom,
      reveal,
      R,
      sel: v.selection instanceof Set ? v.selection : new Set(v.selection || []),
      hover: v.hoverId ? g.getEntity(v.hoverId) : null,
      inRect: (x, y, pad = 0) => x >= R.x0 - pad && x <= R.x1 + pad && y >= R.y0 - pad && y <= R.y1 + pad,
      seen,
      known: (x, y) => reveal || g.isExplored(team, x, y),
      shown: (e) => e.team === team || reveal || (seen(e.x, e.y) && g.sees(team, e)),
    };
  }

  /** 2D: Welt-Transformation der Kamera (Weltkoordinaten → Canvas). */
  worldTransform(f) {
    const { ctx, cam, dpr, z } = f;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (cam.viewW / 2 - cam.x * z) * dpr, (cam.viewH / 2 - cam.y * z) * dpr);
  }

  /** 2D-Ansicht von oben: Durchläufe Boden, Objekte, Effekte, Nebel und Wetter, Balken, Bildschirmanzeigen. */
  renderTop(f) {
    const { ctx, dpr } = f;
    // Bildschirm: Hintergrund; danach Welt-Transformation (Kamera)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    this.worldTransform(f);
    ctx.imageSmoothingEnabled = true;
    this.topGround(f);
    this.topObjects(f);
    this.topEffects(f);
    this.topFog(f);
    // Regen, Schnee und Nebel über der Welt (Bildschirmkoordinaten), danach wieder die Welt-Transformation
    this.drawSky(f);
    this.worldTransform(f);
    this.topBars(f);
    this.topScreen(f);
  }

  /** 2D, Boden: Gelände, Wege, Kartenstadt, Brücken, Krater, Stadt (Straßen, Dächer, Schilder), Natur, Zone und Hot Zone. */
  topGround(f) {
    const { ctx, g, team, z, now, inRect, known } = f;
    this.drawTerrain(ctx, f.R);
    drawWays(this, ctx, this.season); // Feldwege und Gleise scharf über dem Geländebild (seit v5.31, ways.js)
    // Kartenstadt (seit v5.23 gemalt, nicht mehr im Geländebild): Parks, Gebäude, Bänke, Stadtbäume, Autos (maptown.js)
    setRoofSnow(this.season === 'winter');
    const ruined = (b) => {
      const h = g.houseBySrc?.get(b);
      return !!h?.ruined && known(h.x, h.y);
    };
    drawMapTown2D(ctx, g.map.town, inRect, z, this.season, (x, y) => g.city && treeGone(g, x, y), ruined);
    setRoofSnow(false);
    // besetzte und ausgebaute Häuser (seit v5.48, stronghold.js): Sandsäcke, MG-Nest, Stacheldraht und Fahne in Teamfarbe
    for (const h of g.houses ?? []) {
      if (h.ruined || !inRect(h.x, h.y, (h.pw + h.ph) / 2) || !this.fortShown(h, known)) continue;
      drawHouseWorksTop(ctx, h, z);
      if (h.occupants.length && h.team >= 0) drawHouseFlagTop(ctx, h, g.teams[h.team]?.color ?? '#888', now / 1000);
    }
    for (const b of g.bridges ?? []) if (inRect(b.x, b.y, b.len / 2 + 40)) drawBridgeTop(ctx, b, this.season); // über dem Fluss, unter allem anderen
    for (const p of fordPosts(g.map, reliefOf(g.map))) if (inRect(p.x, p.y, 10)) drawFordPostTop(ctx, p); // Furtstangen
    this.drawRuins(ctx, f.R, known);
    this.drawScars(ctx, inRect, z);
    drawCityGround(this, ctx, team, known, inRect); // Stadt: Straßen und Grundstücke
    drawMapCars2D(ctx, g.map.town, inRect, z, this.season); // Autos der Karte auf den Straßen (seit v5.23 sichtbar, seit v5.43 gemalt)
    drawCityTop(this, ctx, team, known, inRect); // Stadt: Dächer
    this.drawNatureTop(ctx, inRect, z); // Felsen, Büsche und Bäume von oben (seit v5.28 gemalt, nicht mehr im Geländebild)
    drawCityBadges(this, ctx, team, known, inRect, false); // Stadt: Schilder (Funktion, privat/kommerziell)
    this.drawZone(ctx, z);
    this.drawHot(ctx, z, now);
  }

  /** 2D, Objekte: Reichweiten und Routen, Gebäude, Kisten, Tiere, Auswahl, Sammelpunkte, Einheiten (Flieger zuletzt), Wegziel. */
  topObjects(f) {
    const { ctx, g, team, z, now, v, sel, hover, inRect, seen, known, shown } = f;
    if (v.placement) this.drawRadii(ctx, z);
    this.drawSelectedRadii(ctx, z, v);
    this.drawAirPlanning(ctx, z);
    this.drawRoutes(ctx, sel, z);

    for (const b of g.buildings) {
      if (!b.alive || (!g.alwaysVisible(team, b) && !known(b.x, b.y))) continue;
      if (!inRect(b.x, b.y, (Math.max(b.w, b.h) * TILE) / 2)) continue;
      if (b.main && b.built && b.type === 'fob') drawCityHallTop(ctx, b, g.teams[b.team].color); // Hauptstadt: Rathaus (cityhall.js)
      else drawBuilding(ctx, b, g.teams[b.team].color, z, drawMilTop(ctx, b, g.teams[b.team].color, z)); // Bild aus milbuild.js, darüber Anzeigen
      if (!b.built && b.team === team) this.drawSiteMarks(ctx, b, z);
    }
    const glow = 0.6 + 0.4 * Math.sin(now / 350);
    for (const m of this.crateMarks(seen, known)) {
      if (inRect(m.x, m.y, 30) && !drawCratePainted(ctx, m.x, m.y, m.ground ? 16 : 13, z, m.ground ? glow : 0)) drawCrateTop(ctx, m.x, m.y, m.ground ? 16 : 13, z, m.ground ? glow : 0);
    }
    for (const a of g.animals ?? []) if (inRect(a.x, a.y, 20) && seen(a.x, a.y) && !drawAnimalTopP(ctx, a, z, now)) drawAnimalTop(ctx, a, z); // nur in Sicht

    // Auswahl und Hover (unter den Einheiten); Besatzer eines Hauses: Rahmen ums Haus
    for (const e of this.ringed(sel)) if (shown(e)) this.drawSelectRing(ctx, e, z, false);
    if (hover && !sel.has(hover.id) && shown(hover)) this.drawSelectRing(ctx, hover, z, true);
    this.drawRallies(f);

    for (const air of [false, true]) {
      // Hubschrauber zuletzt: sie fliegen über allem
      if (air) drawCityRoofs(this, ctx, team, known, inRect); // Dächer der Stellplätze über den abgestellten Flugzeugen (seit v5.39)
      for (const u of g.units) {
        if (!u.alive || u.house || flying(u) !== air || !shown(u) || !inRect(u.x, u.y, 30)) continue; // Jets am Boden mit den Bodeneinheiten
        const aim = this.aimOf(u);
        if (!drawUnitTop(ctx, u, z, aim, now)) drawUnit(ctx, u, g.teams[u.team].color, z, aim, now); // gemalt (seit v5.27), sonst einfache Form
        if (u.crate && !drawCratePainted(ctx, u.x + 4, u.y - 6, 10, z)) drawCrateTop(ctx, u.x + 4, u.y - 6, 10, z); // Kiste auf dem Rücken
      }
    }

    this.drawMoveMarker(ctx, v.moveMarker, now, z);
  }

  /** Sammelpunkte gewählter eigener Gebäude. */
  drawRallies(f) {
    for (const id of f.sel) {
      const b = f.g.getEntity(id);
      if (b && b.kind === 'building' && b.team === f.team) this.drawRally(f.ctx, b, f.z);
    }
  }

  /** Blickrichtung einer Einheit zu ihrem Ziel (Bogenmaß) oder null. */
  aimOf(u) {
    if (!u.targetId || !(u.def.range > 0)) return null;
    const t = this.game.getEntity(u.targetId);
    return t ? Math.atan2(t.y - u.y, t.x - u.x) : null;
  }

  /** Effekte, die das eigene Team sieht (im Ausschnitt, eigene oder in Sicht). */
  *visibleEffects(f) {
    const { g, team, inRect, seen } = f;
    for (const e of g.effects) {
      if (!inRect(e.x, e.y, 120) && !inRect(e.x2 ?? e.x, e.y2 ?? e.y, 120)) continue;
      if (e.team !== -1 && e.team !== team && !seen(e.x, e.y) && !seen(e.x2 ?? e.x, e.y2 ?? e.y)) continue;
      yield e;
    }
  }

  /** Granaten, die das eigene Team sieht (Flug oder Ziel im Ausschnitt). */
  *visibleShells(f) {
    for (const p of f.g.projectiles) {
      if (!p.alive || !f.shown(p)) continue;
      if (!f.inRect(p.x, p.y, 80) && !f.inRect(p.tx, p.ty, 80)) continue;
      yield p;
    }
  }

  /** 2D, Effekte: Granaten, Einschläge und Mündungsfeuer, Rauch, Feuer, Nebelwände, Minen. */
  topEffects(f) {
    const { ctx, z, now } = f;
    for (const p of this.visibleShells(f)) drawShell(ctx, p, z);
    for (const e of this.visibleEffects(f)) drawEffect(ctx, e, z);
    const t = now / 1000;
    for (const q of this.smokeSources(f.seen, f.shown, f.inRect, 120)) {
      if (q.mine) {
        drawMine(ctx, q.x, q.y, 1);
        continue;
      }
      if (q.screen) {
        drawSmokeScreen(ctx, q.x, q.y, q.s, q.k, t, q.seed);
        continue;
      }
      if (q.dust) {
        drawDust(ctx, q.x, q.y, q.s, q.k, t, q.seed);
        continue;
      }
      if (q.fire) drawFire(ctx, q.x, q.y, q.s * 0.7, t, q.seed);
      drawSmoke(ctx, q.x, q.y, q.s, q.k, t, q.seed);
    }
  }

  /** 2D, Nebel des Krieges (nicht im Debug „alles zeigen“). */
  topFog(f) {
    const { ctx, g, cam, team, dpr, now } = f;
    if (f.reveal) return;
    if (cam.relief && this.ground) {
      // mit WebGL dieselben Wolken und glatten Ränder wie isometrisch, flach von oben (seit v5.49)
      const img = this.ground.renderFog(cam, this.cssW, this.cssH, dpr, cam.relief, this.fogData(g.fog[team]), now / 1000, true);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(img, 0, 0);
    } else {
      updateFogLayer(this.fogLayer, g.fog[team], false);
      ctx.drawImage(this.fogLayer.canvas, 0, 0, this.fogLayer.canvas.width, this.fogLayer.canvas.height, 0, 0, W, H);
    }
  }

  /** Regen, Schnee und Nebel, dann die Lichtstimmung über der Welt (Bildschirmkoordinaten, beide Ansichten). */
  drawSky(f) {
    const { ctx, dpr } = f;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWeather(ctx, f.g.weather, this.cssW, this.cssH, f.now, f.cam);
    drawMood(ctx, this.mood, this.cssW, this.cssH); // Lichtstimmung (mood.js)
  }

  /** Lebensbalken bei Auswahl, Hover oder Schaden. */
  barShown(f, e) {
    return f.sel.has(e.id) || f.hover === e || e.hp < e.maxHp;
  }

  /** 2D, Balken: Lebensbalken, Heilkreuz, Kommandeursstern, Vorrat und Warnzeichen, Platzierung. */
  topBars(f) {
    const { ctx, g, team, z, sel, hover, inRect, shown } = f;
    for (const u of g.units) {
      if (!u.alive || u.house || !shown(u) || !inRect(u.x, u.y, 30)) continue;
      if (!this.barShown(f, u)) continue;
      const bw = 24;
      this.drawHp(ctx, u.x - bw / 2, u.y - u.def.radius - HP_OFFSET / z, bw, u.hp / u.maxHp, z);
      if (g.time - (u.caredAt ?? -9) < 0.5) this.drawCare(ctx, u.x - bw / 2, u.y - u.def.radius - HP_OFFSET / z, z);
    }
    for (const u of g.units) {
      if (u.alive && u.def.hero && !u.house && shown(u) && inRect(u.x, u.y, 30)) drawStar(ctx, u.x, u.y - u.def.radius - (HP_OFFSET + STAR_UP) / z, STAR_R / z, z);
    }
    for (const b of g.buildings) {
      if (!b.alive || b.team !== team || !inRect(b.x, b.y, 40)) continue;
      if (!this.barShown(f, b)) continue;
      const bw = b.w * TILE * 0.8;
      this.drawHp(ctx, b.x - bw / 2, b.cy * TILE - 8 / z, bw, b.hp / b.maxHp, z);
    }

    // Vorrat und Warnzeichen (nur eigene Einheiten: Vorrat des Gegners ist unbekannt)
    for (const u of g.units) {
      if (!u.alive || u.house || u.team !== team || !inRect(u.x, u.y, 30)) continue;
      this.drawSupply(ctx, u, sel.has(u.id) || hover === u, z);
    }

    if (f.v.placement) this.drawPlacement(ctx, f.v.placement, z);
  }

  /** 2D, Bildschirmkoordinaten: Brückenbalken, Besatzung der Häuser, dann Auswahlrahmen und Hinweis (drawScreenNotes). */
  topScreen(f) {
    const { ctx, g, cam, team, dpr, inRect } = f;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const b of g.bridges ?? []) {
      if (!bridgeBar(b) || !inRect(b.x, b.y, 60)) continue;
      const p = cam.worldToScreen(b.x, b.y);
      drawBridgeBar(ctx, p.x, p.y - 34, b);
    }
    for (const h of g.garrisoned ?? []) {
      if (!inRect(h.x, h.y, 200) || !(h.team === team || f.reveal || g.sees(team, h))) continue;
      const p = cam.worldToScreen(h.x, h.y - h.ph / 2);
      if (h.team === team) this.drawWindows(ctx, h, cam); // Feuerbereich (seit v5.67)
      this.drawGarrison(ctx, p.x, p.y - 12, h);
    }
    this.drawScreenNotes(f);
  }

  /** Bildschirmkoordinaten (beide Ansichten): Auswahlrahmen und Hinweistext zur Platzierung. */
  drawScreenNotes(f) {
    const { ctx, v } = f;
    if (v.dragBox) this.drawDragBox(ctx, v.dragBox);
    if (v.placement && !v.placement.ok && v.placement.reason && Number.isFinite(v.placement.x)) {
      this.drawNote(ctx, f.cam.worldToScreen(v.placement.x, v.placement.y), v.placement.reason);
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

  /** Iso: Bildschirmpunkt des Bodens am Weltpunkt (Gelände, auf einer Brücke ihre Fahrbahn). */
  screenAt(x, y) {
    const cam = this.camera;
    const br = this.game.bridges?.length ? bridgeUnder(this.game, x, y) : null;
    if (!br) return cam.worldToScreen(x, y);
    cam.pin(br.deckH);
    const p = cam.worldToScreen(x, y);
    cam.unpin();
    return p;
  }

  /** Lichtrichtung (Welt, z nach oben) für den WebGL-Boden: kommt von rechts oben im Bild, wie die Schatten der Gebäude. */
  lightVec() {
    const [, , rc, rd] = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]][this.camera.rot];
    // Bildschirm „rechts oben“ entspricht der Weltrichtung (−rc, −rd); etwas nach rechts gedreht, damit Kämme nicht flach wirken
    const a = Math.atan2(-rd, -rc) + 0.35;
    const k = Math.sqrt(1 - LIGHT_ELEV * LIGHT_ELEV);
    return [Math.cos(a) * k, Math.sin(a) * k, LIGHT_ELEV];
  }

  /**
   * Nebel für den WebGL-Nebel: je Zelle zwei Bytes (in Sicht, erkundet: 0 oder 255), weichgezeichnet (seit v5.49). Der Shader macht
   * daraus glatte Ränder ohne die Treppen der 64-px-Zellen; Sicht und Erkundet getrennt, damit am Rand zum Unerforschten kein Streifen
   * „erkundet“ entsteht.
   */
  fogData(fog) {
    const n = fog.cols * fog.rows;
    const out = this.fogOut;
    if (out && fog.version !== undefined && out.src === fog && out.ver === fog.version) return out; // unverändert: kein Neuladen
    if (!this.fogBytes || this.fogBytes.length !== 2 * n) {
      this.fogBytes = new Uint8Array(2 * n);
      this.fogTmp = new Uint8Array(2 * n);
    }
    const d = this.fogBytes;
    const vis = fog.visible;
    const exp = fog.explored;
    for (let i = 0; i < n; i++) {
      d[2 * i] = vis[i] ? 255 : 0;
      d[2 * i + 1] = exp[i] ? 255 : 0;
    }
    blur121(d, this.fogTmp, fog.cols, fog.rows, 2);
    this.fogOut = { cols: fog.cols, rows: fog.rows, data: d, src: fog, ver: fog.version, stamp: ++fogStamp };
    return this.fogOut;
  }

  /** Isometrisch: danach zeichnen Weltkoordinaten (x, y) aufrecht um den Bildschirmpunkt dieses Weltpunkts, `lift` Pixel höher. */
  uprightAtWorld(ctx, wx, wy, lift) {
    const cam = this.camera;
    const p = cam.worldToScreen(wx, wy);
    setUprightAt(ctx, cam, this.dpr, p.x, p.y - lift * cam.zoom, wx, wy);
  }

  /** Bäume und Felsen für Wald- und Felshindernisse (deterministisch aus der Karte). */
  /** 2D: Felsen, Büsche und Bäume von oben (gemalt, nature.js); fehlt ein Bild noch, eine einfache Krone. Gefällte Zellen frei. */
  drawNatureTop(ctx, inRect, z) {
    const g = this.game;
    const season = this.season;
    const gone = (x, y) => g.city && treeGone(g, x, y);
    for (const f of g.map.town?.fields ?? []) {
      if (!inRect(f.x, f.y, Math.max(f.w, f.h) / 2 + 20)) continue;
      for (const b of fieldBales(f)) if ((!b.only || b.only === season) && inRect(b.x, b.y, 20) && !gone(b.x, b.y)) drawBaleTop(ctx, b, z, season); // Ballen (seit v5.44)
    }
    for (const o of this.deco.rocks) if (inRect(o.x, o.y, o.r + 30)) drawRockTop(ctx, o, season, z);
    for (const b of this.deco.bushes) if (inRect(b.x, b.y, 24) && !gone(b.x, b.y)) drawBushTop(ctx, b, season, z);
    for (const list of [g.map.trees ?? [], this.deco.trees]) {
      for (const t of list) {
        if (!inRect(t.x, t.y, 40) || gone(t.x, t.y) || drawTreeTop(ctx, t, season, z)) continue;
        ctx.fillStyle = season === 'winter' ? '#6d6259' : '#355a2c';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  buildDeco() {
    const trees = [];
    const rocks = [];
    const bushes = [];
    for (const o of this.game.map.obstacles) {
      if (Math.round(o.r) % 2 === 0) {
        const rng = makeRng((o.x * 31 + o.y * 17 + o.r) >>> 0);
        // Seit v5.28 dichter (Kronen schließen sich) und nach Waldart gemischt (Laub-, Nadel- oder Mischwald, nature.js);
        // gleichmäßig verteilt (Spirale mit Zufall), damit keine großen Lücken entstehen
        const kind = forestKind(o);
        const n = Math.max(6, Math.round((o.r * o.r) / 430));
        for (let i = 0; i < n; i++) {
          const a = i * 2.39996 + rng.next() * 0.6;
          const d = Math.min(o.r * 0.88, Math.sqrt((i + 0.5) / n) * o.r * 0.86 + (rng.next() - 0.5) * 7);
          // inner: Schatten fällt auf den Waldboden und wird nicht eigens gezeichnet (Leistung)
          trees.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, r: 12 + rng.next() * 8, sp: forestSpecies(kind, rng.next()), inner: d < o.r * 0.6 });
        }
        // Unterholz zwischen den Stämmen: Farne und junge Fichten (nur Optik)
        const under = Math.round(n * 0.25);
        for (let i = 0; i < under; i++) {
          const a = rng.next() * Math.PI * 2;
          const d = Math.sqrt(rng.next()) * o.r * 0.8;
          const k = rng.next() < (kind === 'laub' ? 0.8 : 0.45) ? 'fern' : 'sapling';
          bushes.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, r: 6 + rng.next() * 3, k, under: true });
        }
        // Büsche am Waldrand (nur Optik, blockieren nicht)
        const edge = Math.max(3, Math.round(o.r / 12));
        for (let i = 0; i < edge; i++) {
          const a = rng.next() * Math.PI * 2;
          const d = o.r * (0.95 + rng.next() * 0.2);
          bushes.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, r: 8 + rng.next() * 4 });
        }
      } else rocks.push(o);
    }
    // Einzelne Büsche neben verstreuten Bäumen (fest nach Lage des Baums)
    for (const t of this.game.map.trees ?? []) {
      const h = hashXY(t.x, t.y);
      if (h % 100 >= 30) continue;
      const a = ((h >>> 7) % 628) / 100;
      bushes.push({ x: t.x + Math.cos(a) * t.r * 1.5, y: t.y + Math.sin(a) * t.r * 1.5, r: 8 + ((h >>> 12) % 40) / 10 });
    }
    const relief = reliefOf(this.game.map);
    if (relief) {
      // Geröll auf steilen Hängen und Gipfeln (nur Optik, dort ist es ohnehin unpassierbar), fest nach Lage
      for (let y = 24; y < H; y += 48) {
        for (let x = 24; x < W; x += 48) {
          const h = hashXY(x, y);
          if (h % 100 >= 12) continue;
          const px = x + ((h >>> 8) % 40) - 20;
          const py = y + ((h >>> 16) % 40) - 20;
          if (relief.heightAt(px, py) < RELIEF.water + 30) continue; // nicht im See oder am Uferrand
          const gr = relief.gradAt(px, py);
          if (Math.hypot(gr.x, gr.y) > RELIEF.rock || (relief.heightAt(px, py) > RELIEF.peak * 0.85 && relief.heightAt(px, py) <= RELIEF.peak + 60)) {
            rocks.push({ x: px, y: py, r: 11 + ((h >>> 4) % 12) });
          }
        }
      }
    }
    return { trees, rocks, bushes: relief ? bushes.filter((b) => relief.heightAt(b.x, b.y) > RELIEF.water + 4 && relief.heightAt(b.x, b.y) < RELIEF.peak) : bushes };
  }

  /**
   * Isometrische Ansicht: Boden schräg (mit Gelände als WebGL-Netz, sonst flaches Bild), Gebäude/Bäume/Einheiten mit Höhe,
   * nach Tiefe sortiert und auf ihrer Geländehöhe; der Nebel liegt zuletzt über allem (mit Gelände ebenfalls aus WebGL).
   * Durchläufe (seit v5.64, Review-Paket P11): Boden, Bodenmarken, Objekte nach Tiefe, Flieger, Effekte, Nebel und Wetter, Balken,
   * Bildschirmanzeigen.
   */
  renderIso(f) {
    const { ctx, cam, dpr } = f;
    f.relief = cam.relief; // gesetzt nur mit WebGL-Boden
    this.isoGround(f);
    this.isoMarks(f);
    const { items, air } = this.isoItems(f);
    this.isoShadows(f, items);
    this.isoObjects(f, items);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCityBadges(this, ctx, f.team, f.known, f.inRect, true); // Stadt: Schilder über den Dächern (über allen Gebäuden)
    for (const u of air) this.drawUnitIsoAt(f, u);
    this.isoEffects(f);
    this.isoFog(f);
    this.drawSky(f);
    this.isoBars(f);
    this.isoScreen(f);
  }

  /** Iso, Boden: Gelände (WebGL oder flaches Bild), Parks, Wege, Krater, Brücken, Stadtstraßen, Zone und Hot Zone. */
  isoGround(f) {
    const { ctx, g, cam, dpr, z, now, R, relief, inRect } = f;
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
    // Parks der Kartenstadt als Bodenbild (seit v5.23, maptown.js), vor Kratern und Stadtstraßen
    const parks = g.map.town?.parks ?? [];
    if (parks.length) {
      const rails = railList(g.map.town);
      for (const p of parks) {
        if (!inRect(p.x, p.y, p.r)) continue;
        if (relief) this.groundAt(ctx, p.x, p.y);
        else setIsoGround(ctx, cam, dpr);
        drawPark(ctx, p, z, this.season, rails);
      }
    }
    setIsoGround(ctx, cam, dpr);
    drawWays(this, ctx, this.season); // Feldwege und Gleise scharf auf dem Boden (seit v5.31, ways.js)
    for (const c of g.craters ?? []) {
      if (!this.scarShown(c) || !inRect(c.x, c.y, c.r + 10)) continue;
      if (relief) this.groundAt(ctx, c.x, c.y);
      else setIsoGround(ctx, cam, dpr);
      drawCrater(ctx, c, scarAlpha(c, g.time, SC.craterLife, SC.craterFade));
    }
    this.drawRubble(ctx, inRect, relief ? (x, y) => this.groundAt(ctx, x, y) : () => setIsoGround(ctx, cam, dpr)); // Schutt zerstörter Straßen (Paket „Straßen“)
    for (const b of g.bridges ?? []) if (inRect(b.x, b.y, b.len / 2 + ISO_PAD)) drawBridgeIso(ctx, cam, dpr, b, this.season); // Einheiten fahren darüber
    setIsoGround(ctx, cam, dpr);
    drawCityGround(this, ctx, f.team, f.known, inRect); // Stadt: Straßen und Grundstücke
    setIsoGround(ctx, cam, dpr);
    this.drawZone(ctx, z);
    this.drawHot(ctx, z, now);
  }

  /** Iso, Bodenmarken: Reichweiten, Routen, Auswahl- und Hover-Ringe, Sammelpunkte. */
  isoMarks(f) {
    const { ctx, cam, dpr, z, v, sel, hover, relief, shown } = f;
    setIsoGround(ctx, cam, dpr);
    if (v.placement) this.drawRadii(ctx, z);
    this.drawSelectedRadii(ctx, z, v);
    this.drawAirPlanning(ctx, z);
    this.drawRoutes(ctx, sel, z);
    setIsoGround(ctx, cam, dpr);
    for (const e of this.ringed(sel)) {
      if (!shown(e)) continue;
      if (relief) this.groundAt(ctx, e.x, e.y);
      this.drawSelectRing(ctx, e, z, false);
    }
    if (hover && !sel.has(hover.id) && shown(hover)) {
      if (relief) this.groundAt(ctx, hover.x, hover.y);
      this.drawSelectRing(ctx, hover, z, true);
    }
    this.drawRallies(f);
  }

  /**
   * Iso: Objekte mit Höhe, nach Tiefe (x + y) sortiert → { items: [{ k, t, o }], air: fliegende Einheiten (zuletzt) }.
   * t: 0 Stadtgebäude, 1 Baum, 2 Fels, 4 Militärgebäude, 5 Einheit, 6 Auto, 7 Bank, 8 Kiste, 9/10 Wrack (Fahrzeug/Gebäude),
   * 11 Tier, 12 Furtstange, 13 Busch, 14 Ballen.
   */
  isoItems(f) {
    const { g, cam, team, z, relief, inRect, seen, known, shown } = f;
    const PAD = ISO_PAD;
    const items = [];
    const town = g.map.town;
    for (const b of town?.buildings ?? []) if (inRect(b.x, b.y, PAD)) items.push({ k: cam.depth(b.x, b.y), t: 0, o: b });
    for (const b of cityBuildings(g, team, known, (x, y) => inRect(x, y, PAD))) {
      // Dach über einem abgestellten Flugzeug (Stellplatz, seit v5.39): hinter allem darunter, nach der vordersten Ecke einsortiert
      const p = b.part;
      const k = p?.over ? Math.max(cam.depth(p.x0, p.y0), cam.depth(p.x1, p.y0), cam.depth(p.x1, p.y1), cam.depth(p.x0, p.y1)) : cam.depth(b.x, b.y);
      items.push({ k, t: 0, o: b }); // Stadt
    }
    // Bäume und Büsche: nicht auf gefällten (Räumen) oder ausgewiesenen Stadtzellen (seit v5.13)
    const gone = (x, y) => g.city && treeGone(g, x, y);
    for (const t of town?.trees ?? []) if (inRect(t.x, t.y, PAD) && !gone(t.x, t.y)) items.push({ k: cam.depth(t.x, t.y), t: 1, o: t });
    for (const t of g.map.trees ?? []) if (inRect(t.x, t.y, PAD) && !gone(t.x, t.y)) items.push({ k: cam.depth(t.x, t.y), t: 1, o: t });
    for (const t of this.deco.trees) if (inRect(t.x, t.y, PAD) && !gone(t.x, t.y)) items.push({ k: cam.depth(t.x, t.y), t: 1, o: t });
    for (const c of town?.cars ?? []) if (inRect(c.x, c.y, 60)) items.push({ k: cam.depth(c.x, c.y), t: 6, o: c });
    for (const p of town?.parks ?? []) {
      if (!inRect(p.x, p.y, p.r + PAD)) continue;
      const d = parkDeco(p);
      for (const t of d.trees) items.push({ k: cam.depth(t.x, t.y), t: 1, o: t });
      for (const b of d.benches) items.push({ k: cam.depth(b.x, b.y), t: 7, o: b });
    }
    // Heu- und Strohballen auf Weiden und Stoppelfeldern (seit v5.44, fields.js / props.js)
    for (const fl of town?.fields ?? []) {
      if (!inRect(fl.x, fl.y, Math.max(fl.w, fl.h) / 2 + 20)) continue;
      for (const b of fieldBales(fl)) {
        if ((!b.only || b.only === this.season) && inRect(b.x, b.y, 30) && !gone(b.x, b.y)) items.push({ k: cam.depth(b.x, b.y), t: 14, o: b });
      }
    }
    for (const o of this.deco.rocks) if (inRect(o.x, o.y, PAD)) items.push({ k: cam.depth(o.x, o.y), t: 2, o });
    const small = z < 0.6; // weit herausgezoomt: Unterholz im Wald weglassen (winzig, unter den Kronen)
    for (const b of this.deco.bushes) if (inRect(b.x, b.y, 40) && !(small && b.under) && !gone(b.x, b.y)) items.push({ k: cam.depth(b.x, b.y), t: 13, o: b });
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
    const air = [];
    for (const u of g.units) {
      if (!u.alive || u.house || !shown(u) || !inRect(u.x, u.y, PAD)) continue;
      if (flying(u)) air.push(u); // Jets am Boden (abgestellt, rollend) stehen bei den Bodeneinheiten
      else items.push({ k: cam.depth(u.x, u.y), t: 5, o: u });
    }
    items.sort((a, b) => a.k - b.k);
    return { items, air };
  }

  /** Iso, Schatten am Boden vor allen Objekten: Bäume, Büsche und Felsen in einem Zug, dann Autos, Bänke und Ballen. */
  isoShadows(f, items) {
    const { ctx, cam, dpr, relief } = f;
    // Schatten der Bäume, Büsche und Felsen in einem Zug auf den Boden (seit v5.28): fallen nie über andere Dinge
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    for (const it of items) {
      if ((it.t !== 1 && it.t !== 2 && it.t !== 13) || it.o.inner || it.o.under) continue;
      if (relief) cam.pin(this.baseHeight(it));
      natureShadowIso(ctx, cam, it.o, it.t);
      cam.unpin();
    }
    ctx.fillStyle = 'rgba(10,18,8,0.24)';
    ctx.fill();
    // Schatten der geparkten Autos, Bänke (seit v5.43) und Ballen (seit v5.44): Umriss von oben am Boden (props.js)
    for (const it of items) {
      if (it.t !== 6 && it.t !== 7 && it.t !== 14) continue;
      if (relief) cam.pin(this.baseHeight(it));
      if (it.t === 6) drawMapCarShadowIso(ctx, cam, it.o, dpr);
      else if (it.t === 7) drawBenchShadowIso(ctx, cam, it.o, dpr);
      else drawBaleShadowIso(ctx, cam, it.o, dpr);
      cam.unpin();
    }
  }

  /** Iso: die Objekte nach Tiefe, jedes eben auf seiner Geländehöhe (Gebäude auf der tiefsten Ecke, damit nichts schwebt). */
  isoObjects(f, items) {
    const { ctx, g, cam, team, dpr, z, now, relief } = f;
    const [ia, , ic] = cam.isoMatrix(1); // Blickrichtung der Tiere im Bild
    const glow = 0.6 + 0.4 * Math.sin(now / 350);
    for (const it of items) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (relief) cam.pin(this.baseHeight(it));
      if (it.t === 0) this.drawTownItemIso(f, it.o);
      else if (it.t === 1) {
        if (!drawTreeIso(ctx, cam, it.o, this.season)) drawTree(ctx, cam, it.o, this.season); // gemalt (nature.js), sonst Ersatz
      }
      else if (it.t === 2) { if (!drawRockIso(ctx, cam, it.o, this.season)) drawRock(ctx, cam, it.o); }
      else if (it.t === 13) drawBushIso(ctx, cam, it.o, this.season);
      else if (it.t === 6) { if (!drawMapCarIso(ctx, cam, it.o, this.season)) drawCar(ctx, cam, it.o); } // gemalt (props.js, seit v5.43)
      else if (it.t === 7) { if (!drawBenchIso(ctx, cam, it.o, this.season)) drawBench(ctx, cam, it.o); }
      else if (it.t === 14) drawBaleIso(ctx, cam, it.o, this.season);
      else if (it.t === 8) {
        const s = it.o.ground ? 16 : 13;
        if (!drawCrateIso(ctx, cam, it.o.x, it.o.y, s, 0, it.o.ground ? glow : 0)) drawCrate(ctx, cam, it.o.x, it.o.y, s, 0, it.o.ground ? glow : 0);
      }
      else if (it.t === 12) drawFordPostIso(ctx, cam, it.o);
      else if (it.t === 11) {
        const a = it.o;
        const p = cam.worldToScreen(a.x, a.y);
        if (!drawAnimalIso(ctx, cam, a, p, now)) drawAnimalSide(ctx, a, p.x, p.y, z * 1.1, ia * Math.cos(a.angle) + ic * Math.sin(a.angle) >= 0);
      } else if (it.t === 9 || it.t === 10) {
        const w = it.o;
        ctx.globalAlpha = scarAlpha(w, g.time, SC.wreckLife, SC.wreckFade);
        if (it.t === 10) drawRubble(ctx, cam, { x: w.x, y: w.y, w: w.w, h: w.h, kind: w.small ? 'wall' : 'wreck', hgt: w.small ? 18 : 36 }, !w.small);
        else if (!drawWreckSprite(ctx, cam, w, cam.worldToScreen(w.x, w.y))) drawWreckBox(ctx, cam, w);
        ctx.globalAlpha = 1;
      }
      else if (it.t === 4) {
        const b = it.o;
        setRoofSnow(this.season === 'winter'); // Winter: Schnee auf Dächern und Wällen (milbuild.js)
        drawTeamBuilding(ctx, cam, b, g.teams[b.team].color);
        setRoofSnow(false);
        if (!b.built && b.team === team) {
          const p = cam.worldToScreen(b.x, b.y);
          setUprightAt(ctx, cam, dpr, p.x, p.y, b.x, b.y);
          this.drawSiteMarks(ctx, b, z);
        }
      } else {
        this.drawUnitIsoAt(f, it.o);
        if (it.o.crate) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          if (!drawCrateIso(ctx, cam, it.o.x, it.o.y, 10, unitLift(it.o) + 14)) drawCrate(ctx, cam, it.o.x, it.o.y, 10, unitLift(it.o) + 14); // Kiste auf dem Rücken
        }
      }
      cam.unpin();
    }
  }

  /** Iso: Gebäude der Stadt bzw. Kartenstadt (Ruine als Schutt, ausgebautes Haus mit Sandsäcken und Fahne, Rauch bei Schaden). */
  drawTownItemIso(f, o) {
    const { ctx, g, cam, known } = f;
    const hs = g.houseBySrc?.get(o);
    if (hs && hs.ruined && known(hs.x, hs.y)) {
      drawRubble(ctx, cam, o);
      return;
    }
    setRoofSnow(this.season === 'winter'); // Winter: Schnee auf den Dächern der Stadt
    const fort = hs && this.fortShown(hs, known) ? hs : null; // besetztes oder ausgebautes Haus (seit v5.48, stronghold.js)
    if (fort) drawHouseWorksIso(ctx, cam, fort, 'back'); // Draht hinter dem Haus
    if (o.part?.t !== 'tree' || !drawTreeIso(ctx, cam, o.part, this.season)) drawTownBuilding(ctx, cam, o, this.season); // Bäume der Großbauten gemalt (nature.js)
    if (fort) {
      drawHouseWorksIso(ctx, cam, fort, 'front'); // Sandsäcke, MG-Nest, Draht davor
      if (fort.occupants.length && fort.team >= 0) drawHouseFlagIso(ctx, cam, fort, g.teams[fort.team]?.color ?? '#888', f.now / 1000);
    }
    setRoofSnow(false);
    if (o.damage > 0.25) {
      // beschädigtes Stadtgebäude (Stadt-Teil): Rauch über dem Dach
      const p = cam.worldToScreen(o.x, o.y);
      const k = cam.zoom;
      const up = o.kind === 'town' ? townLift(o.ck, o.level, o.dep) - 52 : 0; // 1 × 1: Rauch ab dem Dach (seit v5.14)
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = `rgba(40,36,34,${Math.min(0.75, o.damage).toFixed(2)})`;
      for (const [dx, dy, r] of [[0, -46, 10], [6, -60, 13], [-4, -76, 16]]) {
        ctx.beginPath();
        ctx.arc(p.x + dx * k, p.y + (dy - up) * k, r * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Iso: eine Einheit mit Schatten am Boden (gemaltes Modell, sonst einfache Form aufrecht). */
  drawUnitIsoAt(f, u) {
    const { ctx, g, cam, dpr, z, now } = f;
    const p = cam.worldToScreen(u.x, u.y);
    const lift = unitLift(u);
    const sc = 1.35;
    // Schatten am Boden: Umriss des Modells (seit v5.27, unitpaint.js), sonst Ellipse
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!drawUnitShadowIso(ctx, cam, u, p, dpr, now)) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, u.def.radius * z * (u.def.air ? 1.5 : 1.2), u.def.radius * z * (u.def.air ? 0.7 : 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const aim = this.aimOf(u);
    if (drawUnitSprite(ctx, cam, u, { x: p.x, y: p.y }, aim, lift, now)) return;
    setIsoAt(ctx, cam, dpr, p.x, p.y - lift * z, u.x, u.y, sc);
    drawUnit(ctx, u, g.teams[u.team].color, z * sc, aim, now, true);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Iso, Effekte (seit v5.34, fx.js): Zielringe, Lichtschein und Druckringe in der Bodenebene, danach aufrecht Granaten im Bogen,
   * Feuerbälle, Leuchtspuren und Mündungsfeuer; Rauch, Feuer, Nebelwände und Minen; zuletzt das Wegziel.
   */
  isoEffects(f) {
    const { ctx, cam, dpr, z, now, v, relief } = f;
    const at = (x, y) => this.screenAt(x, y);
    const shells = [];
    setIsoGround(ctx, cam, dpr);
    for (const p of this.visibleShells(f)) {
      if (relief) this.groundAt(ctx, p.tx, p.ty);
      drawShellTarget(ctx, p, z);
      shells.push(p);
    }
    const ups = [];
    for (const e of this.visibleEffects(f)) {
      if (e.type === 'explosion' || e.type === 'muzzle') {
        if (relief) this.groundAt(ctx, e.x, e.y);
        else setIsoGround(ctx, cam, dpr);
        drawEffect(ctx, e, z, true);
      }
      ups.push(e);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of shells) drawShellIso(ctx, cam, p, at);
    for (const e of ups) drawEffectUp(ctx, e, cam, at);
    const t = now / 1000;
    for (const q of this.smokeSources(f.seen, f.shown, f.inRect, ISO_PAD)) {
      const p = cam.worldToScreen(q.x, q.y);
      const y = p.y - q.lift * z;
      if (q.mine) {
        drawMine(ctx, p.x, y, z * 0.6);
        continue;
      }
      if (q.screen) {
        drawSmokeScreen(ctx, p.x, y, q.s * z, q.k, t, q.seed);
        continue;
      }
      if (q.dust) {
        drawDust(ctx, p.x, y, q.s * z, q.k, t, q.seed);
        continue;
      }
      if (q.fire) drawFire(ctx, p.x, y, q.s * 0.7 * z, t, q.seed);
      drawSmoke(ctx, p.x, y, q.s * z, q.k, t, q.seed);
    }
    if (relief && v.moveMarker) this.groundAt(ctx, v.moveMarker.x, v.moveMarker.y);
    else setIsoGround(ctx, cam, dpr); // ohne Gelände: flache Bodenebene
    this.drawMoveMarker(ctx, v.moveMarker, now, z, relief ? (x, y) => this.groundAt(ctx, x, y) : null);
  }

  /** Iso, Nebel des Krieges über allem (mit Gelände aus WebGL, Wolken ziehen seit v5.49). */
  isoFog(f) {
    const { ctx, g, cam, team, dpr, now, relief } = f;
    if (f.reveal) return;
    if (relief) {
      const img = this.ground.renderFog(cam, this.cssW, this.cssH, dpr, relief, this.fogData(g.fog[team]), now / 1000);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(img, 0, 0);
    } else {
      setIsoGround(ctx, cam, dpr);
      updateFogLayer(this.fogLayer, g.fog[team], false);
      ctx.drawImage(this.fogLayer.canvas, 0, 0, this.fogLayer.canvas.width, this.fogLayer.canvas.height, 0, 0, W, H);
    }
  }

  /** Iso, Balken und Warnzeichen aufrecht über den Objekten. */
  isoBars(f) {
    const { ctx, g, cam, team, dpr, z, sel, hover, relief, inRect, shown } = f;
    const PAD = ISO_PAD;
    const upright = (wx, wy, lift) => {
      const p = cam.worldToScreen(wx, wy);
      setUprightAt(ctx, cam, dpr, p.x, p.y - lift * z, wx, wy);
    };
    for (const u of g.units) {
      if (!u.alive || u.house || !shown(u) || !inRect(u.x, u.y, PAD)) continue;
      if (!this.barShown(f, u)) continue;
      upright(u.x, u.y, unitLift(u));
      this.drawHp(ctx, u.x - 12, u.y - u.def.radius - HP_OFFSET / z, 24, u.hp / u.maxHp, z);
      if (g.time - (u.caredAt ?? -9) < 0.5) this.drawCare(ctx, u.x - 12, u.y - u.def.radius - HP_OFFSET / z, z);
    }
    for (const u of g.units) {
      if (!u.alive || !u.def.hero || u.house || !shown(u) || !inRect(u.x, u.y, PAD)) continue;
      upright(u.x, u.y, unitLift(u) + ISO_STAR_UP);
      drawStar(ctx, u.x, u.y - u.def.radius - (HP_OFFSET + STAR_UP) / z, STAR_R / z, z);
    }
    for (const b of g.buildings) {
      if (!b.alive || b.team !== team || !inRect(b.x, b.y, PAD)) continue;
      if (!this.barShown(f, b)) continue;
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
  }

  /** Iso, Bildschirmkoordinaten: Brückenbalken, Besatzung der Häuser, Platzierung (in der Bodenebene), Rahmen und Hinweis. */
  isoScreen(f) {
    const { ctx, g, cam, team, dpr, z, v, relief, inRect } = f;
    const PAD = ISO_PAD;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const b of g.bridges ?? []) {
      if (!bridgeBar(b) || !inRect(b.x, b.y, PAD)) continue;
      cam.pin(b.deckH);
      const p = cam.worldToScreen(b.x, b.y);
      cam.unpin();
      drawBridgeBar(ctx, p.x, p.y - 34 * Math.max(0.6, z), b);
    }
    for (const h of g.garrisoned ?? []) {
      if (!inRect(h.x, h.y, PAD) || !(h.team === team || f.reveal || g.sees(team, h))) continue;
      if (relief) cam.pin(this.baseHeight({ t: 0, o: h.src }));
      const p = cam.worldToScreen(h.x, h.y);
      if (h.team === team) this.drawWindows(ctx, h, cam); // Feuerbereich (seit v5.67), mit derselben Höhe wie das Haus
      cam.unpin();
      this.drawGarrison(ctx, p.x, p.y - ((TOWN_H[h.type] || 40) + 20) * z, h);
    }

    if (v.placement) {
      if (relief && Number.isFinite(v.placement.x)) this.groundAt(ctx, v.placement.x, v.placement.y);
      else setIsoGround(ctx, cam, dpr);
      this.drawPlacement(ctx, v.placement, z);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawScreenNotes(f);
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

  /**
   * Schutt zerstörter Straßen (Paket „Straßen“, Teil 3): je Zelle ein großer Krater mit Brocken, solange nicht geräumt. Gezeigt, wenn die
   * Stelle erkundet ist (wie Stadtzellen). ground(x, y): Bodenebene je Ort setzen (Iso mit Gelände), sonst null.
   */
  drawRubble(ctx, inRect, ground) {
    const g = this.game;
    if (!g.rubble) return;
    const S = CITY.cell;
    const cols = g.city?.[0]?.cols ?? g.roads?.cols ?? 0;
    const fog = g.fog?.[this.team];
    for (const k in g.rubble) {
      const i = +k;
      const x = ((i % cols) + 0.5) * S;
      const y = (Math.floor(i / cols) + 0.5) * S;
      if (!inRect(x, y, S)) continue;
      if (!this.revealAll && fog && !fog.isExplored(x, y)) continue;
      if (ground) ground(x, y);
      ctx.save();
      ctx.fillStyle = 'rgba(70,64,56,0.85)'; // aufgerissener Belag
      ctx.fillRect(x - S / 2 + 3, y - S / 2 + 3, S - 6, S - 6);
      ctx.restore();
      drawCrater(ctx, { id: 900000 + i, x, y, r: S * 0.36 }, 1);
      drawCrater(ctx, { id: 950000 + i, x: x + S * 0.2, y: y - S * 0.18, r: S * 0.18 }, 0.9);
    }
  }

  /** Draufsicht: Krater und Brandflecken, darauf Trümmer und Fahrzeugwracks (unter Gebäuden und Einheiten). */
  drawScars(ctx, inRect, z) {
    const g = this.game;
    for (const c of g.craters ?? []) {
      if (this.scarShown(c) && inRect(c.x, c.y, c.r + 10)) drawCrater(ctx, c, scarAlpha(c, g.time, SC.craterLife, SC.craterFade));
    }
    this.drawRubble(ctx, inRect, null);
    for (const w of g.wrecks ?? []) {
      if (!this.scarShown(w) || !inRect(w.x, w.y, 60)) continue;
      const a = scarAlpha(w, g.time, SC.wreckLife, SC.wreckFade);
      if (w.kind === 'building') drawWreckRubble(ctx, w, a);
      else if (!drawWreckTop(ctx, w, z, a)) drawWreck(ctx, w, z, a); // verkohltes Modell (seit v5.34), sonst einfache Form
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
    // Staub am arbeitenden Bagger (seit v5.77, nur Bild): an der Zelle, die er gerade räumt, solange er dort arbeitet (order.t > 0)
    for (const u of g.units) {
      const o = u.order;
      if (!u.alive || o.type !== 'dig' || !(o.t > 0) || !inRect(o.x, o.y, pad) || !shown(u)) continue;
      out.push({ x: o.x * 0.7 + u.x * 0.3, y: o.y * 0.7 + u.y * 0.3, lift: 4, s: 24, k: Math.min(1, o.t * 2), fire: false, seed: u.id * 11, dust: true });
    }
    for (const w of g.wrecks ?? []) {
      const age = g.time - w.t0;
      if (age >= WRECK_SMOKE || w.small || !inRect(w.x, w.y, pad) || !seen(w.x, w.y)) continue;
      const big = w.kind === 'building';
      out.push({ x: w.x, y: w.y, lift: big ? 12 : 6, s: big ? 8 + Math.max(w.w, w.h) / 14 : 6, k: 1 - age / WRECK_SMOKE, fire: age < WRECK_FIRE, seed: w.id * 29 });
    }
    // Nebelwand und eigene Minen (Fähigkeiten, abilities.js); bis v5.33 versehentlich in crateMarks (ohne inRect: Fehler beim Zeichnen)
    for (const s of g.smokes ?? []) {
      if (!inRect(s.x, s.y, pad + s.r) || !(s.team === this.team || seen(s.x, s.y))) continue;
      const k = Math.min(1, (s.until - g.time) / 3, (g.time - s.t0) / 1 + 0.2); // Auf- und Abklingen
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + s.t0;
        out.push({ x: s.x + Math.cos(a) * s.r * 0.55, y: s.y + Math.sin(a) * s.r * 0.55, lift: 8, s: s.r * 0.55, k: Math.max(0.15, k) * 0.8, fire: false, seed: Math.round(s.t0 * 7) + i * 31, screen: true });
      }
    }
    for (const m of g.mines ?? []) {
      if (m.team === this.team && inRect(m.x, m.y, pad)) out.push({ x: m.x, y: m.y, lift: 0, s: 3, k: 0.5, fire: false, seed: 1, mine: true });
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
      if (b && b.kind === 'unit' && b.def.indirect && b.team === this.team) {
        this.drawMortarRange(ctx, b, z); // Artillerie: gleiche Kreise wie der Mörser
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
      if (b && b.team === this.team && this.drawAirRadius(ctx, b, 1)) continue; // Fliegerhorst-Versorgung (seit v5.74)
      const care = b && b.team === this.team ? careOf(g, b) : null;
      if (care) {
        // Stadtgebäude, das heilt oder repariert (seit v5.01): Umkreis in Grün
        this.groundArc(ctx, b.x, b.y, care.radius * CITY.cell + (b.w * TILE) / 2); // ab dem Gebäuderand (Großbau größer)
        ctx.fillStyle = 'rgba(63,212,106,0.07)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(63,212,106,0.85)';
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

  /**
   * Umkreise der Fliegerhorst-Versorgung (seit v5.74, Daniels Wunsch „Radius anzeigen, damit ich den Flughafen besser planen kann“):
   * Kerosintank und Munitionslager versorgen Stellplätze und Heliports im Umkreis CITY.air.supplyRadius (Mitte zu Mitte), der Tower lotst
   * Heliports im Umkreis atcRadius und Bahnen, deren Mitte höchstens atcRadius + halbe Bahnlänge entfernt ist (diese Bahnen grün
   * umrandet). Ein gewählter Stellplatz oder Heliport zeigt, wo Tank und Lager stehen müssen. a = Deckkraft (Baumodus blasser).
   * Liefert true, wenn b eine dieser Arten ist.
   */
  drawAirRadius(ctx, b, a) {
    const g = this.game;
    const c = b.cityCell != null ? g.city?.[b.team] : null;
    if (!c) return false;
    const k = CITY_KINDS[c.kind[b.cityCell] - 1];
    const A = CITY.air;
    const S = c.cell;
    const ring = (r, col) => {
      this.groundArc(ctx, b.x, b.y, r);
      ctx.fillStyle = hexA(col, 0.07 * a);
      ctx.fill();
      ctx.strokeStyle = hexA(col, 0.85 * a);
      ctx.stroke();
    };
    if (k === 'ktank' || k === 'mdepot') ring(A.supplyRadius * S, CITY_KIND[k].color);
    else if (k === 'stand' || k === 'heliport') ring(A.supplyRadius * S, '#e8e4d8');
    else if (k === 'atc') {
      ring(A.atcRadius * S, CITY_KIND.atc.color);
      // Bahnen, die dieser Tower lotst: grün umrandet
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = hexA('#3fd46a', 0.9 * a);
      for (const rw of runwaysOf(g, b.team)) {
        if (!rw.valid || Math.hypot(b.x - rw.cx, b.y - rw.cy) > A.atcRadius * S + (rw.len * S) / 2) continue;
        const x0 = c.x0 + rw.q0 * S;
        const y0 = c.y0 + rw.r0 * S;
        const x1 = c.x0 + (rw.q1 + 1) * S;
        const y1 = c.y0 + (rw.r1 + 1) * S;
        ctx.beginPath();
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], n) => {
          const p = this.draping() ? this.camera.worldToScreen(x, y) : { x, y };
          if (n) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    } else return false;
    return true;
  }

  /** Baumodus mit einem Fliegerhorst-Werkzeug: Umkreise aller eigenen Tanks, Lager und Tower blass (seit v5.74). */
  drawAirPlanning(ctx, z) {
    const ui = this.cityUi;
    if (!ui?.open || !['runway', 'taxi', 'stand', 'atc', 'ktank', 'mdepot', 'heliport'].includes(ui.tool)) return;
    const c = this.game.city?.[this.team];
    if (!c) return;
    const k = this.draping() ? z : 1;
    ctx.save();
    if (this.draping()) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineWidth = (2 / z) * k;
    ctx.setLineDash([(10 / z) * k, (8 / z) * k]);
    for (const [i, e] of c.ents) {
      if (e.alive && ['ktank', 'mdepot', 'atc'].includes(CITY_KINDS[c.kind[i] - 1])) this.drawAirRadius(ctx, e, 0.55);
    }
    // Vorschau: Umkreis des Baus, der gerade gezogen wird (Mitte des 2 × 2-Quadrats am Finger)
    const d = ui.drag;
    const R = ui.tool === 'atc' ? CITY.air.atcRadius : ['ktank', 'mdepot'].includes(ui.tool) ? CITY.air.supplyRadius : 0;
    if (d && R) {
      const p = bigCenter(c, d.r1 * c.cols + d.c1, CITY.size[ui.tool]);
      this.groundArc(ctx, p.x, p.y, R * c.cell);
      ctx.fillStyle = hexA(CITY_KIND[ui.tool].color, 0.1);
      ctx.fill();
      ctx.strokeStyle = hexA(CITY_KIND[ui.tool].color, 0.95);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Mörser: Reichweite (außen), Mindestreichweite (innen) und gewähltes Ziel. */
  drawMortarRange(ctx, b, z) {
    const w = b.def.weapon ?? b.weapons?.find((x) => x.spec.shell)?.spec; // Mörser (Gebäude) oder Artillerie (Einheit)
    if (!w) return;
    const range = w.range * rangeMul(this.game, b);
    const drape = this.draping();
    const k = drape ? z : 1;
    ctx.save();
    if (drape) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.setLineDash([(10 / z) * k, (8 / z) * k]);
    ctx.lineWidth = (2 / z) * k;
    this.groundArc(ctx, b.x, b.y, range);
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

  /** 2D: Ruinen eingestürzter Stadthäuser über dem Bodenbild (das die Häuser fest enthält): Schutthügel, Mauerecke, Balken (fx.js). */
  drawRuins(ctx, R, known) {
    for (const h of this.game.houses ?? []) {
      if (!h.ruined || !known(h.x, h.y)) continue;
      const x0 = h.x - h.pw / 2;
      const y0 = h.y - h.ph / 2;
      if (x0 > R.x1 || y0 > R.y1 || x0 + h.pw < R.x0 || y0 + h.ph < R.y0) continue;
      drawWreckRubble(ctx, { id: h.id, x: h.x, y: h.y, w: h.pw, h: h.ph, small: false, ruin: true, wall: '#c9bfae' });
    }
  }

  /**
   * Besetztes oder ausgebautes Haus sichtbar machen (seit v5.48)? Eigene immer; ein besetztes fremdes, wenn ein Besatzer erkannt ist (wie
   * das Schild, ein getarnter Scharfschütze verrät sein Haus nicht); ein leeres mit Ausbauten, wenn die Stelle erkundet ist.
   */
  fortShown(h, known) {
    const occupied = h.occupants.length > 0;
    if (!occupied && !worksMask(h)) return false;
    if (h.team === this.team || this.revealAll) return true;
    return occupied ? this.game.sees(this.team, h) : known(h.x, h.y);
  }

  /**
   * Feuerbereich am eigenen besetzten Haus (seit v5.67): an jeder Fensterseite ein kurzer Strich in Teamfarbe, vor der Wand.
   * cam bildet Welt- auf Bildschirmkoordinaten ab (während eines Pins die feste Höhe). Nur Bild.
   */
  drawWindows(ctx, h, cam) {
    const w = h.windows;
    if (!w) return;
    const hx = h.pw * WIN_HALF;
    const hy = h.ph * WIN_HALF;
    const left = h.x - h.pw / 2 - WIN_OFF;
    const right = h.x + h.pw / 2 + WIN_OFF;
    const top = h.y - h.ph / 2 - WIN_OFF;
    const bottom = h.y + h.ph / 2 + WIN_OFF;
    ctx.save();
    ctx.strokeStyle = this.game.teams[h.team]?.color ?? '#888';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (w.n) this.windowLine(ctx, cam, h.x - hx, top, h.x + hx, top);
    if (w.s) this.windowLine(ctx, cam, h.x - hx, bottom, h.x + hx, bottom);
    if (w.w) this.windowLine(ctx, cam, left, h.y - hy, left, h.y + hy);
    if (w.e) this.windowLine(ctx, cam, right, h.y - hy, right, h.y + hy);
    ctx.stroke();
    ctx.restore();
  }

  /** Ein Segment (Weltpunkte) in den laufenden Pfad von drawWindows. */
  windowLine(ctx, cam, x0, y0, x1, y1) {
    const a = cam.worldToScreen(x0, y0);
    const b = cam.worldToScreen(x1, y1);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  /** Besatzung eines Hauses (Bildschirmkoordinaten, Transformation auf DPR): Schild in Teamfarbe „n/Plätze“, darunter der Zustand. */
  drawGarrison(ctx, x, y, h) {
    const works = h.works ? Object.keys(h.works).length : 0;
    const text = `${h.occupants.length}/${h.def.cap}${'+'.repeat(works)}${h.building ? '…' : ''}`; // + = fertiger Ausbau, … = im Bau
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
    if (h.hp < h.maxHp) drawBar(ctx, x0, y0 + bh + 2, w, 3, h.hp / h.maxHp, hpColor(h.hp / h.maxHp), 1);
    ctx.restore();
  }

  /** Auswahl (dashed = nur überfahren): gemalter Ring bzw. Rahmen am Boden (seit v5.50, marks.js). */
  drawSelectRing(ctx, e, z, dashed) {
    drawSelectMark(ctx, e, z, dashed, this.camera.iso, z * this.dpr);
  }

  /** Route gewählter LKW von Start-FOB nach Ziel-FOB: gestrichelte Goldlinie mit dunklem Saum und Pfeilspitze am Ziel (seit v5.54, marks.js). */
  drawRoutes(ctx, sel, z) {
    const g = this.game;
    const seen = new Set();
    const drape = this.draping();
    for (const id of sel) {
      const u = g.getEntity(id);
      if (!u || u.kind !== 'unit' || u.type !== 'truck' || u.order.type !== 'route') continue;
      const a = g.getEntity(u.order.fromId);
      const b = g.getEntity(u.order.toId);
      if (!a || !b) continue;
      const key = `${a.id}>${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.save();
      if (drape) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.beginPath();
        this.groundLine(ctx, a.x, a.y, b.x, b.y);
        strokeTrail(ctx, ROUTE_COLOR, 2, [10, 7]);
        this.groundAt(ctx, b.x, b.y);
      } else {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        strokeTrail(ctx, ROUTE_COLOR, 2 / z, [10 / z, 7 / z]);
      }
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      drawArrowHead(ctx, b.x - Math.cos(ang) * 22, b.y - Math.sin(ang) * 22, ang, 6.5 / z, ROUTE_COLOR, 1 / z);
      ctx.restore();
    }
  }

  /** Eigene Baustelle: ohne Bauer ein graues „!“ an der Ecke. */
  drawSiteMarks(ctx, b, z) {
    const x0 = b.cx * TILE;
    const y0 = b.cy * TILE;
    const w = b.w * TILE;
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
      const parts = ['bm', 'mun', 'fuel'].map((k) => [u.cargo[k] / cap, CARGO_COLOR[k]]);
      drawCargoGauge(ctx, x, u.y + r + 4 / z, BAR_W, 3 / z, parts, 1 / z);
    }
    if (picked) {
      // unter dem Lebensbalken: Munition, dann Treibstoff (beide oberhalb des Sprites); die Platten schließen lückenlos an
      const y = u.y - r - HP_OFFSET / z;
      if (u.def.ammoMax) drawBar(ctx, x, y + 5 / z, BAR_W, 3 / z, u.ammo / u.def.ammoMax, AMMO_COLOR, 1 / z);
      if (u.def.fuelMax) drawBar(ctx, x, y + 9 / z, BAR_W, 3 / z, u.fuel / u.def.fuelMax, FUEL_COLOR, 1 / z);
    }
    if (lacksAmmo(u)) drawNoAmmoMark(ctx, u.x + r + 5 / z, u.y - r - 3 / z, z);
  }

  /** Sammelpunkt: gestrichelte Linie mit Saum, Ring am Boden und aufrechte Fahne (gemalt seit v5.54, marks.js). */
  drawRally(ctx, b, z) {
    if (b.rallyX === undefined) return; // Stadtgebäude haben keinen Sammelpunkt
    const px = b.rallyX;
    const py = b.rallyY;
    const color = hexA(ACCENT, 0.9);
    ctx.save();
    if (this.draping()) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.beginPath();
      this.groundLine(ctx, b.x, b.y, px, py);
      strokeTrail(ctx, color, 1.5, [5, 4]);
      this.groundAt(ctx, px, py);
    } else {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(px, py);
      strokeTrail(ctx, color, 1.5 / z, [5 / z, 4 / z]);
    }
    drawFootRing(ctx, px, py, 5 / z, GOLD_RALLY, 1 / z);
    if (this.camera.iso) {
      // Fahne aufrecht über dem Fußpunkt (Bildschirm)
      const p = this.draping() ? this.screenAt(px, py) : this.camera.worldToScreen(px, py);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      drawRallyFlag(ctx, p.x, p.y, 1);
    } else drawRallyFlag(ctx, px, py, 1 / z);
    ctx.restore();
  }

  /** Wegziel: Ring am Klickpunkt, bei Formationen kurz Punkte auf den Zielplätzen (gemalt seit v5.54, marks.js). at(x, y) setzt im Relief die Bodenebene dort. */
  drawMoveMarker(ctx, m, now, z, at = null) {
    if (!m || !Number.isFinite(m.t)) return;
    const age = (now - m.t) / 1000;
    if (!(age >= 0 && age < Math.max(MARKER_LIFE, m.slots ? SLOT_LIFE : 0))) return;
    if (m.slots) {
      const a = 0.9 * (1 - age / SLOT_LIFE);
      for (const p of m.slots) {
        at?.(p.x, p.y);
        drawSlotMark(ctx, p.x, p.y, z, a);
      }
      at?.(m.x, m.y);
    }
    if (age < MARKER_LIFE) drawMoveRing(ctx, m.x, m.y, age / MARKER_LIFE, z, this.camera.iso);
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
    drawBar(ctx, x, y, w, 4 / z, frac, hpColor(frac), 1 / z, true);
  }

  /** Grünes Kreuz links neben dem Lebensbalken: die Einheit wird gerade geheilt oder repariert (Stadtgebäude, seit v5.01). */
  drawCare(ctx, x, y, z) {
    drawCareMark(ctx, x - 6 / z, y + 2 / z, z); // gemalt seit v5.52 (marks.js)
  }

  /** Auswahlrahmen (Bildschirmkoordinaten, Transformation bereits auf DPR gesetzt; gemalt seit v5.50, marks.js). */
  drawDragBox(ctx, d) {
    drawDragFrame(ctx, d);
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

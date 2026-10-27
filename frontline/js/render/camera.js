// Kamera: Weltausschnitt, Zoom und Umrechnung Welt <-> Bildschirm (docs/verlauf.md §5 render/camera.js). Kein DOM.

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1.6;

// Isometrische Ansicht: Bodenebene um 45° gedreht und in der Höhe halbiert (Weltachse x → rechts unten, y → links unten).
// Bildschirm = Mitte + zoom · ISO · (Welt − Kamera) mit ISO = [[K, −K], [K/2, K/2]].
export const ISO_K = Math.SQRT1_2;
// Drehung der isometrischen Ansicht in 90°-Schritten: Matrix [ra, rb, rc, rd] auf den Abstand zur Kamera (rx = ra·dx + rb·dy, ry = rc·dx + rd·dy).
const ROT = [
  [1, 0, 0, 1],
  [0, -1, 1, 0],
  [-1, 0, 0, -1],
  [0, 1, -1, 0],
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Camera {
  constructor(mapW, mapH) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.x = mapW / 2; // Weltmitte im Bild
    this.y = mapH / 2;
    this.zoom = 1;
    this.zoomMin = ZOOM_MIN; // Karteneditor setzt weitere Grenzen
    this.zoomMax = ZOOM_MAX;
    this.iso = false; // isometrische Ansicht (Renderer und Eingabe fragen dieses Flag)
    this.rot = 0; // isometrisch: Drehung 0–3 (je 90°)
    this.viewW = 800;
    this.viewH = 600;
    // Höhengelände (game/relief.js), nur isometrisch wirksam: Punkte am Boden erscheinen um ihre Geländehöhe angehoben.
    // Der Renderer setzt es nur, wenn er das Gelände auch in 3D zeichnet (sonst bleibt der Boden flach und relief null).
    this.relief = null;
    this.pinned = null; // feste Geländehöhe für das gerade gezeichnete Objekt (pin/unpin), sonst null
  }

  /** Bildschirm-Anhebung (Pixel) des Geländes am Weltpunkt; während pin() die feste Höhe. */
  lift(x, y) {
    if (!this.iso || !this.relief) return 0;
    return (this.pinned ?? this.relief.displayAt(x, y)) * this.zoom;
  }

  /** Alle folgenden worldToScreen-Aufrufe nutzen die Geländehöhe h (ein Gebäude steht eben, auch am Hang). */
  pin(h) {
    this.pinned = this.relief ? h : null;
  }

  /** pin() mit der Geländehöhe am Weltpunkt. */
  pinAt(x, y) {
    this.pinned = this.relief ? this.relief.displayAt(x, y) : null;
  }

  unpin() {
    this.pinned = null;
  }

  /** Bildschirmgröße in CSS-Pixeln (Canvas-Größe ohne DPR). */
  resize(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  worldToScreen(x, y) {
    const p = this.worldToScreenFlat(x, y);
    if (this.iso && this.relief) p.y -= this.lift(x, y);
    return p;
  }

  /** Wie worldToScreen, aber ohne Gelände (Boden auf Höhe 0). */
  worldToScreenFlat(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    if (this.iso) {
      const [ra, rb, rc, rd] = ROT[this.rot];
      const rx = ra * dx + rb * dy;
      const ry = rc * dx + rd * dy;
      return {
        x: (rx - ry) * ISO_K * this.zoom + this.viewW / 2,
        y: (rx + ry) * ISO_K * 0.5 * this.zoom + this.viewH / 2,
      };
    }
    return { x: dx * this.zoom + this.viewW / 2, y: dy * this.zoom + this.viewH / 2 };
  }

  /** Weltpunkt unter dem Bildschirmpunkt; mit Gelände der Punkt, an dem der Sichtstrahl den Boden trifft (Näherung). */
  screenToWorld(sx, sy) {
    if (!this.iso || !this.relief) return this.screenToWorldFlat(sx, sy);
    let p = this.screenToWorldFlat(sx, sy);
    for (let k = 0; k < 10; k++) {
      const q = this.screenToWorldFlat(sx, sy + this.relief.displayAt(p.x, p.y) * this.zoom);
      const nx = k < 4 ? q.x : (p.x + q.x) / 2; // später gedämpft, damit steile Hänge nicht pendeln
      const ny = k < 4 ? q.y : (p.y + q.y) / 2;
      if (Math.abs(nx - p.x) + Math.abs(ny - p.y) < 0.5) return { x: nx, y: ny };
      p = { x: nx, y: ny };
    }
    return p;
  }

  /** Umkehrung von worldToScreenFlat (Boden auf Höhe 0). */
  screenToWorldFlat(sx, sy) {
    const px = (sx - this.viewW / 2) / this.zoom;
    const py = (sy - this.viewH / 2) / this.zoom;
    if (this.iso) {
      // Umkehrung von ISO: rx = px/(2K) + py/K, ry = −px/(2K) + py/K, dann zurückdrehen (transponierte Drehmatrix)
      const rx = px / (2 * ISO_K) + py / ISO_K;
      const ry = -px / (2 * ISO_K) + py / ISO_K;
      const [ra, rb, rc, rd] = ROT[this.rot];
      return { x: this.x + ra * rx + rc * ry, y: this.y + rb * rx + rd * ry };
    }
    return { x: this.x + px, y: this.y + py };
  }

  /** Matrix [a, b, c, d] (ohne Verschiebung) für ctx.setTransform: Welt → Bildschirm isometrisch, mit Zoom `z` und Drehung. */
  isoMatrix(z = this.zoom) {
    const [ra, rb, rc, rd] = ROT[this.rot];
    const k = z * ISO_K;
    return [k * (ra - rc), (k / 2) * (ra + rc), k * (rb - rd), (k / 2) * (rb + rd)];
  }

  /** Richtung, in der der Tiefenwert wächst (Weltachsen): depth(x, y) = dir · (x − Kamera). */
  depthDir() {
    const [ra, rb, rc, rd] = ROT[this.rot];
    return [ra + rc, rb + rd];
  }

  /** Tiefenwert eines Weltpunkts: größer = näher am Betrachter (Sortierung isometrisch). */
  depth(x, y) {
    const [ra, rb, rc, rd] = ROT[this.rot];
    const dx = x - this.x;
    const dy = y - this.y;
    return (ra + rc) * dx + (rb + rd) * dy;
  }

  /** Dreht die isometrische Ansicht um 90° (dir = ±1); die Kartenmitte im Bild bleibt. */
  rotate(dir) {
    this.rot = (this.rot + (dir < 0 ? 3 : 1)) % 4;
  }

  /** Verschiebt um Bildschirm-Pixel (Inhalt folgt der Maus). */
  pan(dxScreen, dyScreen) {
    const a = this.screenToWorldFlat(this.viewW / 2, this.viewH / 2);
    const b = this.screenToWorldFlat(this.viewW / 2 - dxScreen, this.viewH / 2 - dyScreen);
    this.x += b.x - a.x;
    this.y += b.y - a.y;
    this.clamp();
  }

  /** Zoomt um `factor`; der Weltpunkt unter (sx, sy) bleibt an derselben Stelle. */
  zoomAt(factor, sx, sy) {
    const before = this.screenToWorld(sx, sy);
    const h = this.iso && this.relief ? this.relief.displayAt(before.x, before.y) : 0;
    this.zoom = clamp(this.zoom * factor, this.zoomMin, this.zoomMax);
    // Kamera so setzen, dass der Weltpunkt (mit seiner Geländehöhe) wieder unter (sx, sy) liegt
    this.x = this.y = 0;
    const now = this.screenToWorldFlat(sx, sy + h * this.zoom);
    this.x = before.x - now.x;
    this.y = before.y - now.y;
    this.clamp();
  }

  centerOn(x, y) {
    this.x = x;
    this.y = y;
    this.clamp();
  }

  /** Mitte so begrenzen, dass der Ausschnitt möglichst in der Karte bleibt (zu groß: zentriert). Isometrisch: Mitte in der Karte. */
  clamp() {
    if (this.iso) {
      this.x = clamp(this.x, 0, this.mapW);
      this.y = clamp(this.y, 0, this.mapH);
      return;
    }
    const hw = this.viewW / (2 * this.zoom);
    const hh = this.viewH / (2 * this.zoom);
    this.x = hw * 2 >= this.mapW ? this.mapW / 2 : clamp(this.x, hw, this.mapW - hw);
    this.y = hh * 2 >= this.mapH ? this.mapH / 2 : clamp(this.y, hh, this.mapH - hh);
  }

  /** Bildschirmecken (Welt, Boden auf Höhe 0) im Uhrzeigersinn: oben links, oben rechts, unten rechts, unten links. */
  visibleQuad() {
    const w = this.viewW;
    const h = this.viewH;
    return [this.screenToWorldFlat(0, 0), this.screenToWorldFlat(w, 0), this.screenToWorldFlat(w, h), this.screenToWorldFlat(0, h)];
  }

  /**
   * Umschließendes Weltrechteck des sichtbaren Ausschnitts {x0, y0, x1, y1} (kann über die Karte hinausragen).
   * Mit Gelände zählt auch, was hinter dem unteren Rand liegt und hoch genug ins Bild ragt (und tiefer Liegendes oben).
   */
  visibleRect() {
    const q = this.visibleQuad();
    if (this.iso && this.relief) {
      const w = this.viewW;
      const h = this.viewH;
      const up = Math.max(0, this.relief.hi) * this.zoom;
      const down = Math.min(0, Math.max(this.relief.lo, -20)) * this.zoom;
      q.push(this.screenToWorldFlat(0, h + up), this.screenToWorldFlat(w, h + up), this.screenToWorldFlat(0, down), this.screenToWorldFlat(w, down));
    }
    return {
      x0: Math.min(...q.map((p) => p.x)),
      y0: Math.min(...q.map((p) => p.y)),
      x1: Math.max(...q.map((p) => p.x)),
      y1: Math.max(...q.map((p) => p.y)),
    };
  }
}

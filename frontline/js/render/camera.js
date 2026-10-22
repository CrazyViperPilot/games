// Kamera: Weltausschnitt, Zoom und Umrechnung Welt <-> Bildschirm (PLAN §5 render/camera.js). Kein DOM.

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1.6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Camera {
  constructor(mapW, mapH) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.x = mapW / 2; // Weltmitte im Bild
    this.y = mapH / 2;
    this.zoom = 1;
    this.viewW = 800;
    this.viewH = 600;
  }

  /** Bildschirmgröße in CSS-Pixeln (Canvas-Größe ohne DPR). */
  resize(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.x) * this.zoom + this.viewW / 2,
      y: (y - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: this.x + (sx - this.viewW / 2) / this.zoom,
      y: this.y + (sy - this.viewH / 2) / this.zoom,
    };
  }

  /** Verschiebt um Bildschirm-Pixel (Inhalt folgt der Maus). */
  pan(dxScreen, dyScreen) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  /** Zoomt um `factor`; der Weltpunkt unter (sx, sy) bleibt an derselben Stelle. */
  zoomAt(factor, sx, sy) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    this.x = before.x - (sx - this.viewW / 2) / this.zoom;
    this.y = before.y - (sy - this.viewH / 2) / this.zoom;
    this.clamp();
  }

  centerOn(x, y) {
    this.x = x;
    this.y = y;
    this.clamp();
  }

  /** Mitte so begrenzen, dass der Ausschnitt möglichst in der Karte bleibt (zu groß: zentriert). */
  clamp() {
    const hw = this.viewW / (2 * this.zoom);
    const hh = this.viewH / (2 * this.zoom);
    this.x = hw * 2 >= this.mapW ? this.mapW / 2 : clamp(this.x, hw, this.mapW - hw);
    this.y = hh * 2 >= this.mapH ? this.mapH / 2 : clamp(this.y, hh, this.mapH - hh);
  }

  /** Sichtbarer Weltausschnitt {x0, y0, x1, y1} (kann über die Karte hinausragen). */
  visibleRect() {
    const hw = this.viewW / (2 * this.zoom);
    const hh = this.viewH / (2 * this.zoom);
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}

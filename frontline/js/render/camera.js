// Kamera: Weltausschnitt, Zoom und Umrechnung Welt <-> Bildschirm (PLAN §5 render/camera.js). Kein DOM.

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1.6;

// Isometrische Ansicht: Bodenebene um 45° gedreht und in der Höhe halbiert (Weltachse x → rechts unten, y → links unten).
// Bildschirm = Mitte + zoom · ISO · (Welt − Kamera) mit ISO = [[K, −K], [K/2, K/2]].
export const ISO_K = Math.SQRT1_2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Camera {
  constructor(mapW, mapH) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.x = mapW / 2; // Weltmitte im Bild
    this.y = mapH / 2;
    this.zoom = 1;
    this.iso = false; // isometrische Ansicht (Renderer und Eingabe fragen dieses Flag)
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
    const dx = x - this.x;
    const dy = y - this.y;
    if (this.iso) {
      return {
        x: (dx - dy) * ISO_K * this.zoom + this.viewW / 2,
        y: (dx + dy) * ISO_K * 0.5 * this.zoom + this.viewH / 2,
      };
    }
    return { x: dx * this.zoom + this.viewW / 2, y: dy * this.zoom + this.viewH / 2 };
  }

  screenToWorld(sx, sy) {
    const px = (sx - this.viewW / 2) / this.zoom;
    const py = (sy - this.viewH / 2) / this.zoom;
    if (this.iso) {
      // Umkehrung von ISO: dx = px/(2K) + py/K, dy = −px/(2K) + py/K
      return { x: this.x + px / (2 * ISO_K) + py / ISO_K, y: this.y - px / (2 * ISO_K) + py / ISO_K };
    }
    return { x: this.x + px, y: this.y + py };
  }

  /** Verschiebt um Bildschirm-Pixel (Inhalt folgt der Maus). */
  pan(dxScreen, dyScreen) {
    const a = this.screenToWorld(this.viewW / 2, this.viewH / 2);
    const b = this.screenToWorld(this.viewW / 2 - dxScreen, this.viewH / 2 - dyScreen);
    this.x += b.x - a.x;
    this.y += b.y - a.y;
    this.clamp();
  }

  /** Zoomt um `factor`; der Weltpunkt unter (sx, sy) bleibt an derselben Stelle. */
  zoomAt(factor, sx, sy) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    // Kamera so setzen, dass der Weltpunkt wieder unter (sx, sy) liegt
    this.x = this.y = 0;
    const now = this.screenToWorld(sx, sy);
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

  /** Bildschirmecken (Welt) im Uhrzeigersinn: oben links, oben rechts, unten rechts, unten links. */
  visibleQuad() {
    const w = this.viewW;
    const h = this.viewH;
    return [this.screenToWorld(0, 0), this.screenToWorld(w, 0), this.screenToWorld(w, h), this.screenToWorld(0, h)];
  }

  /** Umschließendes Weltrechteck des sichtbaren Ausschnitts {x0, y0, x1, y1} (kann über die Karte hinausragen). */
  visibleRect() {
    const q = this.visibleQuad();
    return {
      x0: Math.min(q[0].x, q[1].x, q[2].x, q[3].x),
      y0: Math.min(q[0].y, q[1].y, q[2].y, q[3].y),
      x1: Math.max(q[0].x, q[1].x, q[2].x, q[3].x),
      y1: Math.max(q[0].y, q[1].y, q[2].y, q[3].y),
    };
  }
}

// Relatives Ziehen per Pointer Events. Nur ein aktiver Pointer.
export class Input {
  constructor(canvas, getScale) {
    this.canvas = canvas;
    this.getScale = getScale;
    this.dragging = false;
    this.enabled = true;
    this._pointerId = null;
    this._lastX = 0;
    this._delta = 0; // CSS-px seit letztem consumeDeltaX()
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
  }

  attach() {
    const c = this.canvas;
    c.addEventListener('pointerdown', this._onDown);
    c.addEventListener('pointermove', this._onMove);
    c.addEventListener('pointerup', this._onUp);
    c.addEventListener('pointercancel', this._onUp);
  }

  detach() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('pointermove', this._onMove);
    c.removeEventListener('pointerup', this._onUp);
    c.removeEventListener('pointercancel', this._onUp);
    this.reset();
  }

  reset() {
    this._delta = 0;
    this.dragging = false;
    this._pointerId = null;
  }

  // Gibt die Verschiebung in Welt-Einheiten seit dem letzten Aufruf zurück.
  consumeDeltaX() {
    const d = this._delta;
    this._delta = 0;
    const s = this.getScale();
    return s ? d / s : 0;
  }

  _capture(e) {
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // ignorieren (z. B. ungültige Pointer-ID)
    }
  }

  _onDown(e) {
    e.preventDefault();
    if (this._pointerId !== null) return; // nur ein aktiver Pointer
    this._pointerId = e.pointerId;
    this._lastX = e.clientX;
    this.dragging = true;
    this._capture(e);
  }

  _onMove(e) {
    e.preventDefault();
    if (e.pointerId !== this._pointerId) return;
    const dx = e.clientX - this._lastX;
    this._lastX = e.clientX;
    if (this.enabled) this._delta += dx;
  }

  _onUp(e) {
    if (e.pointerId !== this._pointerId) return;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      // ignorieren
    }
    this._pointerId = null;
    this.dragging = false;
  }
}

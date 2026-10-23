// Relatives Ziehen per Pointer Events. Nur ein aktiver Pointer.
const KEY_SPEED = 300; // Welt-Einheiten pro Sekunde bei Tastatursteuerung

export class Input {
  constructor(canvas, getScale) {
    this.canvas = canvas;
    this.getScale = getScale;
    this.dragging = false;
    this.enabled = true;
    this._pointerId = null;
    this._lastX = 0;
    this._delta = 0; // CSS-px seit letztem consumeDeltaX()
    this.targetX = null; // Maus-Zielposition in Welt-Einheiten (nur Desktop), sonst null
    this._keyL = false;
    this._keyR = false;
    this._lastT = 0;
    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    this._onBlur = () => { this._keyL = this._keyR = false; };
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
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  detach() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('pointermove', this._onMove);
    c.removeEventListener('pointerup', this._onUp);
    c.removeEventListener('pointercancel', this._onUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.reset();
  }

  reset() {
    this._delta = 0;
    this.dragging = false;
    this._pointerId = null;
    this.targetX = null;
    this._keyL = this._keyR = false;
  }

  // Pfeiltasten / A / D: halten = Truppe bewegen.
  _key(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.isContentEditable)) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this._keyL = down;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this._keyR = down;
    else return;
    if (down) this.targetX = null; // Tastatur hat Vorrang, bis die Maus wieder bewegt wird
    e.preventDefault();
  }

  // Gibt die Verschiebung in Welt-Einheiten seit dem letzten Aufruf zurück.
  consumeDeltaX() {
    let d = this._delta;
    this._delta = 0;
    const s = this.getScale();
    const now = performance.now();
    const dt = this._lastT ? Math.min(0.05, (now - this._lastT) / 1000) : 0;
    this._lastT = now;
    const dir = (this._keyR ? 1 : 0) - (this._keyL ? 1 : 0);
    if (!this.enabled) return 0;
    return (s ? d / s : 0) + dir * KEY_SPEED * dt;
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
    if (e.pointerType === 'mouse') {
      // Maus: absolute Position, kein relatives Ziehen
      this._onMove(e);
      return;
    }
    this._pointerId = e.pointerId;
    this._lastX = e.clientX;
    this.dragging = true;
    this._capture(e);
  }

  _onMove(e) {
    e.preventDefault();
    if (e.pointerType === 'mouse' && this.enabled) {
      const r = this.canvas.getBoundingClientRect();
      const s = this.getScale();
      if (s) this.targetX = (e.clientX - r.left) / s;
    }
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

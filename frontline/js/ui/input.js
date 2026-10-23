// Eingabe (PLAN §5 ui/input.js): Maus und Tastatur → Controller und Kamera. Hält keinen Spielzustand.
// `app` (optional) liefert Aktionen aus main.js: overlayOpen, closeOverlay, togglePause, toggleHelp, changeSpeed, debugMoney.
const DRAG_PX = 6; // ab dieser Strecke ist ein Druck eine Rahmenauswahl
const EDGE_PX = 10; // Randscrollen: Abstand zum Canvas-Rand
const SCROLL_PX = 900; // Kamerageschwindigkeit in Bildschirm-Pixeln je Sekunde

export class Input {
  constructor({ canvas, minimap, camera, controller, hud = null, app = {} }) {
    this.canvas = canvas;
    this.minimap = minimap;
    this.camera = camera;
    this.controller = controller;
    this.hud = hud;
    this.app = app;
    this.down = null; // linker Druck auf dem Canvas {sx, sy, shift, dragging, mode}
    this.pan = null; // mittlere Maustaste: Verschieben {x, y} (Client-Koordinaten)
    this.mmDrag = null; // Druck auf der Minimap
    this.keys = new Set();
    this.mouse = null; // Mausposition im Canvas (CSS-Pixel), nur wenn darüber
    this.inCanvas = false;

    this.h = {
      down: (e) => this.onCanvasDown(e),
      enter: () => {
        this.inCanvas = true;
      },
      leave: () => {
        this.inCanvas = false;
        this.mouse = null;
      },
      wheel: (e) => this.onWheel(e),
      noMenu: (e) => e.preventDefault(),
      mmDown: (e) => this.onMinimapDown(e),
      move: (e) => this.onMove(e),
      up: (e) => this.onUp(e),
      key: (e) => this.onKeyDown(e),
      keyUp: (e) => this.keys.delete(e.key),
      blur: () => this.reset(),
    };
    const h = this.h;
    canvas.addEventListener('mousedown', h.down);
    canvas.addEventListener('mouseenter', h.enter);
    canvas.addEventListener('mouseleave', h.leave);
    canvas.addEventListener('wheel', h.wheel, { passive: false });
    canvas.addEventListener('contextmenu', h.noMenu);
    minimap.canvas.addEventListener('mousedown', h.mmDown);
    minimap.canvas.addEventListener('contextmenu', h.noMenu);
    window.addEventListener('mousemove', h.move);
    window.addEventListener('mouseup', h.up);
    window.addEventListener('keydown', h.key);
    window.addEventListener('keyup', h.keyUp);
    window.addEventListener('blur', h.blur);
  }

  destroy() {
    const h = this.h;
    this.canvas.removeEventListener('mousedown', h.down);
    this.canvas.removeEventListener('mouseenter', h.enter);
    this.canvas.removeEventListener('mouseleave', h.leave);
    this.canvas.removeEventListener('wheel', h.wheel);
    this.canvas.removeEventListener('contextmenu', h.noMenu);
    this.minimap.canvas.removeEventListener('mousedown', h.mmDown);
    this.minimap.canvas.removeEventListener('contextmenu', h.noMenu);
    window.removeEventListener('mousemove', h.move);
    window.removeEventListener('mouseup', h.up);
    window.removeEventListener('keydown', h.key);
    window.removeEventListener('keyup', h.keyUp);
    window.removeEventListener('blur', h.blur);
  }

  reset() {
    this.keys.clear();
    this.down = null;
    this.pan = null;
    this.mmDrag = null;
    this.controller.setDragBox(null);
  }

  /** Zeigerposition relativ zum Element (CSS-Pixel). */
  pos(e, el) {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Kamera-Bewegung pro Frame: Pfeile und Randscrollen. */
  update(dt) {
    this.canvas.style.cursor = this.controller.view.mode === 'normal' ? 'default' : 'crosshair';
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.has('ArrowLeft')) dx -= 1;
    if (k.has('ArrowRight')) dx += 1;
    if (k.has('ArrowUp')) dy -= 1;
    if (k.has('ArrowDown')) dy += 1;
    if (!dx && !dy && this.inCanvas && this.mouse && !this.down && !this.pan && this.mmDrag === null) {
      const { x, y } = this.mouse;
      const cam = this.camera;
      if (x < EDGE_PX) dx -= 1;
      else if (x > cam.viewW - EDGE_PX) dx += 1;
      if (y < EDGE_PX) dy -= 1;
      else if (y > cam.viewH - EDGE_PX) dy += 1;
    }
    if (!dx && !dy) return;
    const len = Math.hypot(dx, dy);
    const step = (SCROLL_PX * dt) / this.camera.zoom / len;
    this.camera.centerOn(this.camera.x + dx * step, this.camera.y + dy * step);
  }

  rightAt(wx, wy) {
    if (this.controller.view.mode !== 'normal') this.controller.cancel();
    else this.controller.rightClick(wx, wy);
  }

  onCanvasDown(e) {
    if (e.button === 1) {
      e.preventDefault();
      this.pan = { x: e.clientX, y: e.clientY };
      return;
    }
    const p = this.pos(e, this.canvas);
    const w = this.camera.screenToWorld(p.x, p.y);
    if (e.button === 2) {
      this.rightAt(w.x, w.y);
      return;
    }
    if (e.button !== 0) return;
    const c = this.controller;
    this.down = { sx: p.x, sy: p.y, shift: e.shiftKey, dragging: false, mode: c.view.mode };
    if (c.view.mode === 'wall') c.beginWall(w.x, w.y);
  }

  onMove(e) {
    const p = this.pos(e, this.canvas);
    // Ziel des Ereignisses entscheidet: liegt das HUD über dem Canvas, ist der Zeiger nicht „im Spielfeld“.
    this.inCanvas = e.target === this.canvas;
    this.mouse = this.inCanvas ? p : null;
    if (this.pan) {
      this.camera.pan(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan = { x: e.clientX, y: e.clientY };
    }
    if (this.mmDrag !== null) this.minimapGo(e);
    const d = this.down;
    if (d) {
      if (!d.dragging && d.mode === 'normal' && Math.hypot(p.x - d.sx, p.y - d.sy) >= DRAG_PX) d.dragging = true;
      if (d.dragging) this.controller.setDragBox({ x1: d.sx, y1: d.sy, x2: p.x, y2: p.y });
    }
    if (this.inCanvas || d) {
      const w = this.camera.screenToWorld(p.x, p.y);
      this.controller.updatePointer(w.x, w.y);
    }
  }

  onUp(e) {
    if (e.button === 1) {
      this.pan = null;
      return;
    }
    if (e.button === 0 && this.mmDrag !== null) {
      this.mmDrag = null;
      return;
    }
    if (e.button !== 0 || !this.down) return;
    const d = this.down;
    this.down = null;
    const c = this.controller;
    c.setDragBox(null);
    const p = this.pos(e, this.canvas);
    const w = this.camera.screenToWorld(p.x, p.y);
    if (c.view.mode === 'wall') {
      c.endWall(w.x, w.y, e.shiftKey);
      return;
    }
    if (d.dragging && c.view.mode === 'normal') {
      c.selectBox({ x1: d.sx, y1: d.sy, x2: p.x, y2: p.y }, e.shiftKey);
      return;
    }
    if (e.target !== this.canvas && !d.dragging) return; // Loslassen über dem HUD löst keinen Klick aus
    c.leftClickWorld(w.x, w.y, e.shiftKey);
  }

  onWheel(e) {
    e.preventDefault();
    const p = this.pos(e, this.canvas);
    const f = Math.min(1.25, Math.max(0.8, Math.exp(-e.deltaY * 0.0015)));
    this.camera.zoomAt(f, p.x, p.y);
  }

  minimapWorld(e) {
    const r = this.minimap.canvas.getBoundingClientRect();
    return this.minimap.toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  minimapGo(e) {
    const w = this.minimapWorld(e);
    this.camera.centerOn(w.x, w.y);
  }

  onMinimapDown(e) {
    e.preventDefault();
    if (e.button === 0) {
      this.mmDrag = 0;
      this.minimapGo(e);
    } else if (e.button === 2) {
      const w = this.minimapWorld(e);
      this.rightAt(w.x, w.y);
    }
  }

  /** Leertaste: Auswahl, sonst letzte Meldung, sonst HQ. */
  jump() {
    const c = this.controller;
    const center = c.selectionCenter() || c.lastEvent;
    if (center) this.camera.centerOn(center.x, center.y);
    else this.goHome();
  }

  /** H: Kamera auf das eigene HQ. */
  goHome() {
    const h = this.controller.homeBase();
    if (h) this.camera.centerOn(h.x, h.y);
  }

  /** Gruppentaste: zweimal kurz hintereinander = Kamera auf die Gruppe. */
  selectGroupKey(n) {
    if (this.controller.selectGroup(n)) {
      const c = this.controller.selectionCenter();
      if (c) this.camera.centerOn(c.x, c.y);
    }
  }

  onKeyDown(e) {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const app = this.app;
    const k = e.key;

    if (app.overlayOpen && app.overlayOpen()) {
      if (k === 'Escape') {
        e.preventDefault();
        app.closeOverlay?.();
      } else if (k === 'p' || k === 'P') {
        e.preventDefault();
        app.togglePause?.();
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.ctrlKey && /^[0-9]$/.test(k)) {
        e.preventDefault();
        this.controller.assignGroup(Number(k));
      }
      return;
    }
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      this.keys.add(k);
      return;
    }
    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      this.selectGroupKey(Number(k));
      return;
    }
    switch (k) {
      case ' ':
        e.preventDefault();
        this.jump();
        return;
      case 'Escape':
        e.preventDefault();
        this.controller.cancel();
        return;
      case 'h':
      case 'H':
        this.goHome();
        return;
      case 'p':
      case 'P':
        app.togglePause?.();
        return;
      case 'F1':
      case '?':
        e.preventDefault();
        app.toggleHelp?.();
        return;
      case '+':
      case '=':
        app.changeSpeed?.(1);
        return;
      case '-':
      case '_':
        app.changeSpeed?.(-1);
        return;
      case 'm':
      case 'M':
        app.debugMoney?.();
        return;
      case 'Delete':
        e.preventDefault();
        this.controller.handleHotkey('Entf');
        return;
      default:
        break;
    }
    if (k.length === 1 && /[a-zA-Z]/.test(k)) {
      if (this.controller.handleHotkey(k.toUpperCase())) e.preventDefault();
    }
  }
}

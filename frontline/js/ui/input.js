// Eingabe (docs/verlauf.md §5 ui/input.js): Maus und Tastatur → Controller und Kamera. Hält keinen Spielzustand.
// `app` (optional) liefert Aktionen aus main.js: overlayOpen, closeOverlay, togglePause, toggleHelp, changeSpeed, debugMoney.
const DRAG_PX = 6; // ab dieser Strecke ist ein Druck ein Ziehen: Maus links = Rahmenauswahl, Maus rechts und Finger = Karte verschieben
const EDGE_PX = 10; // Randscrollen: Abstand zum Fensterrand
const SCROLL_PX = 900; // Kamerageschwindigkeit in Bildschirm-Pixeln je Sekunde

export class Input {
  constructor({ canvas, minimap, camera, controller, hud = null, app = {} }) {
    this.canvas = canvas;
    this.minimap = minimap;
    this.camera = camera;
    this.controller = controller;
    this.hud = hud;
    this.app = app;
    this.down = null; // linker Druck auf dem Canvas {sx, sy, cx, cy, shift, dragging, mode}; dragging: Rahmen, panning: Karte schieben
    this.touches = new Map(); // aktive Finger (pointerId → Client-Position), zwei Finger = Zoomen und Verschieben
    this.pinch = null; // {dist, cx, cy} der letzten Zweifingergeste
    this.rdown = null; // rechte Maustaste gedrückt {x, y, wx, wy, panning}: kurz = Befehl, ziehen = Karte schieben
    this.pan = null; // mittlere Maustaste: Verschieben {x, y} (Client-Koordinaten)
    this.mmDrag = null; // Druck auf der Minimap
    this.keys = new Set();
    this.mouse = null; // Mausposition im Canvas (CSS-Pixel), nur wenn darüber
    this.inCanvas = false;
    this.edgeMouse = null; // Mausposition im Fenster (auch über der Bedienleiste), nur fürs Randscrollen

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
      out: (e) => {
        if (!e.relatedTarget) this.edgeMouse = null; // Maus hat das Fenster verlassen
      },
    };
    const h = this.h;
    canvas.addEventListener('pointerdown', h.down);
    canvas.addEventListener('mouseenter', h.enter);
    canvas.addEventListener('mouseleave', h.leave);
    canvas.addEventListener('wheel', h.wheel, { passive: false });
    canvas.addEventListener('contextmenu', h.noMenu);
    minimap.canvas.addEventListener('pointerdown', h.mmDown);
    minimap.canvas.addEventListener('contextmenu', h.noMenu);
    window.addEventListener('pointermove', h.move);
    window.addEventListener('pointerup', h.up);
    window.addEventListener('pointercancel', h.up);
    window.addEventListener('keydown', h.key);
    window.addEventListener('keyup', h.keyUp);
    window.addEventListener('blur', h.blur);
    window.addEventListener('mouseout', h.out);
  }

  destroy() {
    const h = this.h;
    this.canvas.removeEventListener('pointerdown', h.down);
    this.canvas.removeEventListener('mouseenter', h.enter);
    this.canvas.removeEventListener('mouseleave', h.leave);
    this.canvas.removeEventListener('wheel', h.wheel);
    this.canvas.removeEventListener('contextmenu', h.noMenu);
    this.minimap.canvas.removeEventListener('pointerdown', h.mmDown);
    this.minimap.canvas.removeEventListener('contextmenu', h.noMenu);
    window.removeEventListener('pointermove', h.move);
    window.removeEventListener('pointerup', h.up);
    window.removeEventListener('pointercancel', h.up);
    window.removeEventListener('keydown', h.key);
    window.removeEventListener('keyup', h.keyUp);
    window.removeEventListener('blur', h.blur);
    window.removeEventListener('mouseout', h.out);
  }

  reset() {
    this.keys.clear();
    this.edgeMouse = null;
    this.down = null;
    this.pan = null;
    this.rdown = null;
    this.mmDrag = null;
    this.touches.clear();
    this.pinch = null;
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
    // Randscrollen gilt am Fensterrand, auch wenn dort Statusleiste oder Bedienfelder über dem Spielfeld liegen
    if (!dx && !dy && this.edgeMouse && !this.down && !this.pan && this.mmDrag === null && !this.app.overlayOpen?.()) {
      const { x, y } = this.edgeMouse;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (x < EDGE_PX) dx -= 1;
      else if (x > w - EDGE_PX) dx += 1;
      if (y < EDGE_PX) dy -= 1;
      else if (y > h - EDGE_PX) dy += 1;
    }
    if (!dx && !dy) return;
    const len = Math.hypot(dx, dy);
    const step = (SCROLL_PX * dt) / this.camera.zoom / len;
    this.camera.pan(-dx * step * this.camera.zoom, -dy * step * this.camera.zoom);
  }

  rightAt(wx, wy) {
    if (this.controller.view.mode !== 'normal') this.controller.cancel();
    else this.controller.rightClick(wx, wy);
  }

  /** Zwei Finger: Zoomen (Abstand) und Verschieben (Mittelpunkt). */
  pinchStep() {
    const [a, b] = [...this.touches.values()];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const last = this.pinch;
    this.pinch = { dist, cx, cy };
    if (!last) return;
    this.camera.pan(cx - last.cx, cy - last.cy);
    const r = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(dist / last.dist, cx - r.left, cy - r.top);
  }

  onCanvasDown(e) {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        // zweiter Finger: laufende Einzelgeste verwerfen
        this.down = null;
        this.controller.setDragBox(null);
        this.pinch = null;
        this.pinchStep();
        return;
      }
    }
    if (e.button === 1) {
      e.preventDefault();
      this.pan = { x: e.clientX, y: e.clientY };
      return;
    }
    const p = this.pos(e, this.canvas);
    const w = this.camera.screenToWorld(p.x, p.y);
    if (e.button === 2) {
      this.rdown = { x: e.clientX, y: e.clientY, wx: w.x, wy: w.y, panning: false };
      return;
    }
    if (e.button !== 0) return;
    const c = this.controller;
    this.down = { sx: p.x, sy: p.y, cx: e.clientX, cy: e.clientY, shift: e.shiftKey, dragging: false, panning: false, mode: c.view.mode };
    if (c.view.mode === 'wall') c.beginWall(w.x, w.y);
  }

  onMove(e) {
    if (e.pointerType === 'touch') {
      if (!this.touches.has(e.pointerId)) return;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        this.pinchStep();
        return;
      }
    } else {
      this.edgeMouse = { x: e.clientX, y: e.clientY };
    }
    const p = this.pos(e, this.canvas);
    // Ziel des Ereignisses entscheidet: liegt das HUD über dem Canvas, ist der Zeiger nicht „im Spielfeld“.
    this.inCanvas = e.target === this.canvas;
    this.mouse = this.inCanvas ? p : null;
    const r = this.rdown;
    if (r) {
      if (!r.panning && Math.hypot(e.clientX - r.x, e.clientY - r.y) >= DRAG_PX) r.panning = true;
      if (r.panning) {
        this.camera.pan(e.clientX - r.x, e.clientY - r.y);
        r.x = e.clientX;
        r.y = e.clientY;
      }
    }
    if (this.pan) {
      this.camera.pan(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan = { x: e.clientX, y: e.clientY };
    }
    if (this.mmDrag !== null) this.minimapGo(e);
    const d = this.down;
    if (d) {
      if (!d.dragging && !d.panning && d.mode !== 'wall' && Math.hypot(p.x - d.sx, p.y - d.sy) >= DRAG_PX) {
        // Maus: Rahmenauswahl; Finger: Ziehen schiebt die Karte
        if (e.pointerType !== 'touch' && d.mode === 'normal') d.dragging = true;
        else if (e.pointerType === 'touch') d.panning = true;
      }
      if (d.dragging) this.controller.setDragBox({ x1: d.sx, y1: d.sy, x2: p.x, y2: p.y });
      else if (d.panning) {
        this.camera.pan(e.clientX - d.cx, e.clientY - d.cy);
        d.cx = e.clientX;
        d.cy = e.clientY;
      }
    }
    if (this.inCanvas || d) {
      const w = this.camera.screenToWorld(p.x, p.y);
      this.controller.updatePointer(w.x, w.y);
    }
  }

  onUp(e) {
    if (e.pointerType === 'touch') {
      if (!this.touches.delete(e.pointerId)) return;
      if (e.type === 'pointercancel' || this.pinch) {
        // Ende einer Zweifingergeste: kein Tipp
        if (!this.touches.size) this.pinch = null;
        this.down = null;
        this.mmDrag = null;
        return;
      }
    }
    if (e.button === 1) {
      this.pan = null;
      return;
    }
    if (e.button === 2 && this.rdown) {
      const r = this.rdown;
      this.rdown = null;
      if (!r.panning) this.rightAt(r.wx, r.wy); // kurzer Rechtsklick = Befehl
      return;
    }
    if (e.button === 0 && this.mmDrag !== null) {
      this.mmDrag = null;
      return;
    }
    if (e.type === 'pointercancel') {
      this.down = null;
      this.controller.setDragBox(null);
      return;
    }
    if (e.button !== 0 || !this.down) return;
    const d = this.down;
    this.down = null;
    const c = this.controller;
    c.setDragBox(null);
    if (d.panning) return; // Karte geschoben: kein Klick
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
    if (e.target !== this.canvas && !d.dragging && e.pointerType !== 'touch') return; // Loslassen über dem HUD löst keinen Klick aus
    c.leftClickWorld(w.x, w.y, e.shiftKey, e.pointerType);
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

  /** Leertaste: Auswahl, sonst letzte Meldung, sonst Haupt-FOB. */
  jump() {
    const c = this.controller;
    const center = c.selectionCenter() || c.lastEvent;
    if (center) this.camera.centerOn(center.x, center.y);
    else this.goHome();
  }

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
      case 'v':
      case 'V':
        app.toggleView?.();
        return;
      case ',':
        app.rotateView?.(-1);
        return;
      case '.':
        app.rotateView?.(1);
        return;
      case 'p':
      case 'P':
        app.togglePause?.();
        return;
      case 'F2':
        e.preventDefault();
        app.toggleSound?.();
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

// Eingabe: Touch (Pointer Events) und Tastatur → einfacher Zustand für Game.update (PLAN §7, PRD §8).
// Koordinaten: CSS-Pixel × dpr / scale = interne Pixel (viewW × viewH). Alle Positionen stehen in internen Pixeln.

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  ArrowDown: 'dig', KeyS: 'dig',
  KeyX: 'fire', KeyJ: 'fire',
  Escape: 'pause',
};

export class Input {
  // getLayout() -> { viewW, viewH, scale, dpr }
  constructor(canvasEl, getLayout) {
    this.canvas = canvasEl;
    this.getLayout = getLayout;
    this.state = {
      left: false, right: false, jump: false, dig: false, fire: false,
      jumpPressed: false, digPressed: false, firePressed: false, pausePressed: false,
    };
    this.fireVisible = false;
    this._zones = new Map();                                  // pointerId -> Zone
    this._touch = { left: false, right: false, jump: false, dig: false, fire: false };
    this._keys = { left: false, right: false, jump: false, dig: false, fire: false };

    this._bLeft = { id: 'left', x: 0, y: 0, r: 24, down: false, visible: true };
    this._bRight = { id: 'right', x: 0, y: 0, r: 24, down: false, visible: true };
    this._bJump = { id: 'jump', x: 0, y: 0, r: 30, down: false, visible: true };
    this._bDig = { id: 'dig', x: 0, y: 0, r: 24, down: false, visible: true };
    this._bFire = { id: 'fire', x: 0, y: 0, r: 20, down: false, visible: false };
    this._bPause = { id: 'pause', x: 0, y: 0, r: 12, down: false, visible: true };
    this._list = [this._bLeft, this._bRight, this._bJump, this._bDig, this._bFire, this._bPause];

    this._bind();
  }

  // Knöpfe in internen Pixeln; die Liste wird bei jedem Zugriff aktuell ausgerichtet (keine Allokation).
  get buttons() {
    this._place(this.getLayout());
    return this._list;
  }

  setFireVisible(v) {
    const on = !!v;
    if (on === this.fireVisible) return;
    this.fireVisible = on;
    this._bFire.visible = on;
    if (!on) {
      for (const [id, z] of this._zones) if (z === 'fire') this._zones.set(id, 'none');
    }
    this._recalc();
  }

  // Nach jedem Simulationsschritt aufrufen: Einmal-Flags zurücksetzen.
  endStep() {
    const s = this.state;
    s.jumpPressed = false;
    s.digPressed = false;
    s.firePressed = false;
    s.pausePressed = false;
  }

  _place(L) {
    const W = L.viewW, H = L.viewH;
    this._bLeft.x = 36; this._bLeft.y = H - 36;
    this._bRight.x = 92; this._bRight.y = H - 36;
    this._bJump.x = W - 44; this._bJump.y = H - 40;
    this._bDig.x = W - 44 - 30 - 10 - 24; this._bDig.y = H - 38;
    this._bFire.x = W - 44; this._bFire.y = H - 40 - 30 - 10 - 20;
    this._bPause.x = W - 16; this._bPause.y = 16;
  }

  _pos(e, L) {
    const r = this.canvas.getBoundingClientRect();
    const k = L.dpr / L.scale;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }

  // Zone eines Punkts: pause (oben rechts), left/right (linke Hälfte, Grenze zwischen den Knöpfen),
  // rechte Hälfte: dig (Grabkreis + 8 px), fire (Feuerkreis + 8 px, nur sichtbar), sonst jump.
  _zoneAt(x, y, L) {
    this._place(L);
    const W = L.viewW;
    if (x >= W - 28 && x <= W - 4 && y >= 4 && y <= 28) return 'pause';
    if (x < W / 2) return x < (this._bLeft.x + this._bRight.x) / 2 ? 'left' : 'right';
    const d = this._bDig;
    const ddx = x - d.x, ddy = y - d.y, dr = d.r + 8;
    if (ddx * ddx + ddy * ddy <= dr * dr) return 'dig';
    if (this.fireVisible) {
      const f = this._bFire;
      const dx = x - f.x, dy = y - f.y, rr = f.r + 8;
      if (dx * dx + dy * dy <= rr * rr) return 'fire';
    }
    return 'jump';
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    const up = (e) => this._up(e);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this._reset());
  }

  _down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const L = this.getLayout();
    const p = this._pos(e, L);
    const z = this._zoneAt(p.x, p.y, L);
    if (z === 'pause') {
      this.state.pausePressed = true;
      return;
    }
    this._zones.set(e.pointerId, z);
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ohne Capture weiter */ }
    this._recalc();
  }

  // Zuordnung wird bei jeder Bewegung neu bestimmt: der Daumen kann von ◀ nach ▶ oder zum Springen rutschen.
  _move(e) {
    if (!this._zones.has(e.pointerId)) return;
    const L = this.getLayout();
    const p = this._pos(e, L);
    let z = this._zoneAt(p.x, p.y, L);
    if (z === 'pause') z = 'none';
    if (this._zones.get(e.pointerId) === z) return;
    this._zones.set(e.pointerId, z);
    this._recalc();
  }

  _up(e) {
    if (this._zones.delete(e.pointerId)) this._recalc();
  }

  _recalc() {
    const t = this._touch;
    t.left = t.right = t.jump = t.dig = t.fire = false;
    for (const z of this._zones.values()) {
      if (z !== 'none') t[z] = true;
    }
    this._combine();
  }

  // Touch und Tastatur zusammenführen; Einmal-Flags beim Übergang von aus nach an.
  _combine() {
    const s = this.state, t = this._touch, k = this._keys;
    const jump = t.jump || k.jump;
    const dig = t.dig || k.dig;
    const fire = (t.fire || k.fire) && this.fireVisible;
    if (jump && !s.jump) s.jumpPressed = true;
    if (dig && !s.dig) s.digPressed = true;
    if (fire && !s.fire) s.firePressed = true;
    s.jump = jump;
    s.dig = dig;
    s.fire = fire;
    s.left = t.left || k.left;
    s.right = t.right || k.right;
    this._bLeft.down = s.left;
    this._bRight.down = s.right;
    this._bJump.down = s.jump;
    this._bDig.down = s.dig;
    this._bFire.down = s.fire;
  }

  _key(e, down) {
    const act = KEYS[e.code];
    if (!act) return;
    e.preventDefault();
    if (act === 'pause') {
      if (down && !e.repeat) this.state.pausePressed = true;
      return;
    }
    if (e.repeat) return;
    this._keys[act] = down;
    this._combine();
  }

  _reset() {
    this._zones.clear();
    for (const k of Object.keys(this._keys)) this._keys[k] = false;
    this._recalc();
  }
}

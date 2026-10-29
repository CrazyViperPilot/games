// Eingabe: Touch (Pointer Events) und Tastatur → einfacher Zustand für Game.update (PLAN §7, PRD §8).
// Koordinaten: CSS-Pixel × dpr / scale = interne Pixel (viewW × viewH). Alle Positionen stehen in internen Pixeln.

// Knopfgröße (Einstellung klein/normal/groß): Faktor auf Radius und Zeichnung der Bedienknöpfe.
export const BTN_SCALE = { small: 0.85, normal: 1, large: 1.2 };
// Grundradien (interne Pixel bei Faktor 1), Abstand zum Rand und zwischen den Knöpfen.
const BASE_R = { left: 24, right: 24, jump: 30, dig: 24, stair: 24, fire: 20 };
const PAD = 6, GAP = 8;

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  ArrowDown: 'dig', KeyS: 'dig',
  KeyE: 'stair', ShiftLeft: 'stair',
  KeyX: 'fire', KeyJ: 'fire',
  Escape: 'pause',
};

export class Input {
  // getLayout() -> { viewW, viewH, scale, dpr }
  constructor(canvasEl, getLayout) {
    this.canvas = canvasEl;
    this.getLayout = getLayout;
    this.state = {
      left: false, right: false, jump: false, dig: false, stair: false, fire: false,
      jumpPressed: false, digPressed: false, firePressed: false, pausePressed: false,
    };
    this.fireVisible = false;
    this.controlsOn = false;                                  // Knöpfe nur im Spiel (mode 'play')
    this.buttonScale = 1;
    this._zones = new Map();                                  // pointerId -> Zone
    this._touch = { left: false, right: false, jump: false, dig: false, stair: false, fire: false };
    this._keys = { left: false, right: false, jump: false, dig: false, stair: false, fire: false };

    // base = Grundradius; r = aktueller Radius (base × Knopfgröße). drawControls skaliert die Zeichnung mit r / base.
    this._bLeft = { id: 'left', x: 0, y: 0, r: 24, base: 24, down: false, visible: false };
    this._bRight = { id: 'right', x: 0, y: 0, r: 24, base: 24, down: false, visible: false };
    this._bJump = { id: 'jump', x: 0, y: 0, r: 30, base: 30, down: false, visible: false };
    this._bDig = { id: 'dig', x: 0, y: 0, r: 24, base: 24, down: false, visible: false };
    this._bStair = { id: 'stair', x: 0, y: 0, r: 24, base: 24, down: false, visible: false };
    this._bFire = { id: 'fire', x: 0, y: 0, r: 20, base: 20, down: false, visible: false };
    this._bPause = { id: 'pause', x: 0, y: 0, r: 12, base: 12, down: false, visible: true };
    this._list = [this._bLeft, this._bRight, this._bJump, this._bDig, this._bStair, this._bFire, this._bPause];

    this._bind();
  }

  // Knöpfe in internen Pixeln; die Liste wird bei jedem Zugriff aktuell ausgerichtet (keine Allokation).
  get buttons() {
    this._place(this.getLayout());
    return this._list;
  }

  // Knöpfe ein- oder ausblenden (aus: keine Berührung, Zonen leer). Tastatur bleibt aktiv.
  setControlsOn(v) {
    const on = !!v;
    if (on === this.controlsOn) return;
    this.controlsOn = on;
    this._applyVisible();
    if (!on) this._zones.clear();
    this._recalc();
  }

  // Knopfgröße 0.85 / 1 / 1.2 (BTN_SCALE). Radien und Zonen folgen über _place().
  setButtonScale(k) {
    this.buttonScale = k > 0 ? k : 1;
  }

  _applyVisible() {
    const on = this.controlsOn;
    this._bLeft.visible = on;
    this._bRight.visible = on;
    this._bJump.visible = on;
    this._bDig.visible = on;
    this._bStair.visible = on;
    this._bFire.visible = on && this.fireVisible;
  }

  setFireVisible(v) {
    const on = !!v;
    if (on === this.fireVisible) return;
    this.fireVisible = on;
    this._applyVisible();
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

  // Knöpfe liegen unten in den Ecken: links ◀ ▶, rechts Graben (links von) und Springen, Feuer über Springen,
  // Treppe (schräg hoch graben) über Graben.
  _place(L) {
    const W = L.viewW, H = L.viewH, k = this.buttonScale;
    const bl = this._bLeft, br = this._bRight, bj = this._bJump, bd = this._bDig, bs = this._bStair, bf = this._bFire;
    bl.r = BASE_R.left * k; br.r = BASE_R.right * k; bj.r = BASE_R.jump * k;
    bd.r = BASE_R.dig * k; bs.r = BASE_R.stair * k; bf.r = BASE_R.fire * k;
    bl.x = PAD + bl.r; bl.y = H - PAD - bl.r;
    br.x = bl.x + bl.r + GAP + br.r; br.y = bl.y;
    bj.x = W - PAD - bj.r; bj.y = H - PAD - bj.r;
    bd.x = bj.x - bj.r - GAP - bd.r; bd.y = H - PAD - bd.r;
    bs.x = bd.x; bs.y = bd.y - bd.r - GAP - bs.r;
    bf.x = bj.x; bf.y = bj.y - bj.r - GAP - bf.r;
    this._bPause.x = W - 16; this._bPause.y = 16;
  }

  _pos(e, L) {
    const r = this.canvas.getBoundingClientRect();
    const k = L.dpr / L.scale;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }

  // Zone eines Punkts: pause (oben rechts), left/right (linke Hälfte, Grenze zwischen den Knöpfen),
  // rechte Hälfte: dig (Grabkreis + 8 px), stair (Treppenkreis + 8 px), fire (Feuerkreis + 8 px, nur sichtbar), sonst jump.
  _zoneAt(x, y, L) {
    this._place(L);
    const W = L.viewW;
    if (x >= W - 28 && x <= W - 4 && y >= 4 && y <= 28) return 'pause';
    if (x < W / 2) return x < (this._bLeft.x + this._bRight.x) / 2 ? 'left' : 'right';
    const d = this._bDig;
    const ddx = x - d.x, ddy = y - d.y, dr = d.r + 8;
    if (ddx * ddx + ddy * ddy <= dr * dr) return 'dig';
    const s = this._bStair;
    const sdx = x - s.x, sdy = y - s.y, sr = s.r + 8;
    if (sdx * sdx + sdy * sdy <= sr * sr) return 'stair';
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
    if (!this.controlsOn) return;
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
    t.left = t.right = t.jump = t.dig = t.stair = t.fire = false;
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
    const stair = t.stair || k.stair;
    const fire = (t.fire || k.fire) && this.fireVisible;
    if (jump && !s.jump) s.jumpPressed = true;
    if (dig && !s.dig) s.digPressed = true;
    if (fire && !s.fire) s.firePressed = true;
    s.jump = jump;
    s.dig = dig;
    s.stair = stair;
    s.fire = fire;
    s.left = t.left || k.left;
    s.right = t.right || k.right;
    this._bLeft.down = s.left;
    this._bRight.down = s.right;
    this._bJump.down = s.jump;
    this._bDig.down = s.dig;
    this._bStair.down = s.stair;
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

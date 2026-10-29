// Neon Stack – Spiellogik (reines Tetris, ohne DOM). Läuft im Browser (window.NeonLogic) und in Node (Tests).
// Regeln angelehnt an den Tetris-Guideline: SRS-Rotation mit Wall Kicks, 7er-Beutel, Hold, Ghost, Lock Delay,
// T-Spin-Erkennung (3-Ecken-Regel), Combo, Back-to-Back, Perfect Clear.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLS = 10;
  const VISIBLE = 20;
  const HIDDEN = 3;
  const ROWS = VISIBLE + HIDDEN;
  const LOCK_DELAY = 500; // ms
  const MAX_LOCK_RESETS = 15;
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const ID = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

  // Grundform (Rotation 0) als [x, y] in der Matrix (n×n)
  const BASE = {
    I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { n: 4, c: [[1, 0], [2, 0], [1, 1], [2, 1]] },
    T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };

  // SHAPES[typ][rot] = 4 Zellen [x, y]; Rotation 0 → 1 (R) → 2 → 3 (L) im Uhrzeigersinn
  const SHAPES = {};
  for (const t of TYPES) {
    const { n, c } = BASE[t];
    const states = [c];
    for (let r = 1; r < 4; r++) {
      states.push(t === 'O' ? c : states[r - 1].map(([x, y]) => [n - 1 - y, x]));
    }
    SHAPES[t] = states;
  }

  // SRS-Kicks, Notation [dx, dy] mit y nach oben (wie in der Wiki-Tabelle); beim Anwenden wird y gespiegelt.
  const KICKS_JLSTZ = {
    '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I = {
    '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };

  const LINE_SCORE = [0, 100, 300, 500, 800];
  const TSPIN_SCORE = [400, 800, 1200, 1600];
  const MINI_SCORE = [100, 200, 400];
  const PERFECT_SCORE = [0, 800, 1200, 1800, 2000];

  // ---- Zufall (Mulberry32, Zustand ist eine Zahl → speicherbar) ----
  function rand(g) {
    g.rng = (g.rng + 0x6d2b79f5) >>> 0;
    let t = g.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function refill(g) {
    while (g.queue.length < 7) {
      const bag = TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rand(g) * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      g.queue.push(...bag);
    }
  }

  function emptyBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  }

  function cells(type, rot, x, y) {
    return SHAPES[type][rot].map(([cx, cy]) => [x + cx, y + cy]);
  }

  function collides(board, type, rot, x, y) {
    for (const [cx, cy] of SHAPES[type][rot]) {
      const px = x + cx;
      const py = y + cy;
      if (px < 0 || px >= COLS || py < 0 || py >= ROWS) return true;
      if (board[py][px]) return true;
    }
    return false;
  }

  function gravityMs(level) {
    const l = Math.min(Math.max(level, 1), 20);
    return Math.max(0.5, 1000 * Math.pow(0.8 - (l - 1) * 0.007, l - 1));
  }

  // ---- Spiel anlegen ----
  function createGame(opts = {}) {
    const g = {
      board: emptyBoard(),
      cur: null,
      hold: null,
      holdUsed: false,
      queue: [],
      rng: (opts.seed == null ? (Math.random() * 4294967296) >>> 0 : opts.seed >>> 0),
      score: 0,
      lines: 0,
      startLevel: opts.startLevel || 1,
      level: opts.startLevel || 1,
      combo: -1,
      b2b: false,
      over: false,
      pieces: 0,
      gravAcc: 0,
      lockTimer: 0,
      lockResets: 0,
      lowestY: 0,
      lastRot: false, // letzte erfolgreiche Aktion war eine Drehung
      lastKick: 0, // Index des benutzten Kicks
      tspinTried: null,
      events: [],
    };
    refill(g);
    spawn(g, g.queue.shift());
    refill(g);
    return g;
  }

  function spawn(g, type) {
    g.cur = { type, rot: 0, x: 3, y: 2 };
    g.gravAcc = 0;
    g.lockTimer = 0;
    g.lockResets = 0;
    g.lowestY = g.cur.y;
    g.lastRot = false;
    g.lastKick = 0;
    g.pieces++;
    if (collides(g.board, type, 0, g.cur.x, g.cur.y)) {
      g.over = true;
      g.events.push({ t: 'over', why: 'block' });
    } else {
      g.events.push({ t: 'spawn', type });
    }
  }

  function grounded(g) {
    const c = g.cur;
    return collides(g.board, c.type, c.rot, c.x, c.y + 1);
  }

  // Nach erfolgreicher Bewegung/Drehung: Lock-Timer zurücksetzen (begrenzt)
  function afterMove(g) {
    const c = g.cur;
    if (c.y > g.lowestY) {
      g.lowestY = c.y;
      g.lockResets = 0;
    }
    if (grounded(g)) {
      if (g.lockResets < MAX_LOCK_RESETS) {
        g.lockTimer = 0;
        g.lockResets++;
      }
    } else {
      g.lockTimer = 0;
    }
  }

  function move(g, dx) {
    if (g.over) return false;
    const c = g.cur;
    if (collides(g.board, c.type, c.rot, c.x + dx, c.y)) return false;
    c.x += dx;
    g.lastRot = false;
    afterMove(g);
    g.events.push({ t: 'move' });
    return true;
  }

  // dir: +1 im Uhrzeigersinn, -1 dagegen
  function rotate(g, dir) {
    if (g.over) return false;
    const c = g.cur;
    if (c.type === 'O') {
      g.events.push({ t: 'rotate', kick: 0 });
      return true;
    }
    const to = (c.rot + dir + 4) % 4;
    const table = c.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    const kicks = table['' + c.rot + to];
    for (let i = 0; i < kicks.length; i++) {
      const nx = c.x + kicks[i][0];
      const ny = c.y - kicks[i][1];
      if (!collides(g.board, c.type, to, nx, ny)) {
        c.rot = to;
        c.x = nx;
        c.y = ny;
        g.lastRot = true;
        g.lastKick = i;
        afterMove(g);
        g.events.push({ t: 'rotate', kick: i });
        return true;
      }
    }
    return false;
  }

  function softDrop(g) {
    if (g.over) return false;
    const c = g.cur;
    if (collides(g.board, c.type, c.rot, c.x, c.y + 1)) return false;
    c.y++;
    g.score += 1;
    g.gravAcc = 0;
    g.lastRot = false;
    afterMove(g);
    return true;
  }

  function ghostY(g) {
    const c = g.cur;
    let y = c.y;
    while (!collides(g.board, c.type, c.rot, c.x, y + 1)) y++;
    return y;
  }

  function hardDrop(g) {
    if (g.over) return null;
    const c = g.cur;
    const dist = ghostY(g) - c.y;
    if (dist > 0) {
      c.y += dist;
      g.score += 2 * dist;
      g.lastRot = false;
    }
    return lock(g, true, dist);
  }

  function holdPiece(g) {
    if (g.over || g.holdUsed) return false;
    const type = g.cur.type;
    if (g.hold) {
      const swap = g.hold;
      g.hold = type;
      spawn(g, swap);
    } else {
      g.hold = type;
      spawn(g, g.queue.shift());
      refill(g);
    }
    g.holdUsed = true;
    g.events.push({ t: 'hold' });
    return true;
  }

  // 3-Ecken-Regel: '' | 'mini' | 'full'
  function detectTSpin(g) {
    const c = g.cur;
    if (c.type !== 'T' || !g.lastRot) return '';
    const occ = (dx, dy) => {
      const px = c.x + dx;
      const py = c.y + dy;
      return px < 0 || px >= COLS || py >= ROWS || (py >= 0 && g.board[py][px] !== 0);
    };
    // Ecken der 3×3-Matrix: A=oben links, B=oben rechts, C=unten rechts, D=unten links
    const corners = [occ(0, 0), occ(2, 0), occ(2, 2), occ(0, 2)];
    const count = corners.filter(Boolean).length;
    if (count < 3) return '';
    // „Vordere“ Ecken liegen auf der Seite, in die die Spitze des T zeigt
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][c.rot];
    const frontBoth = corners[front[0]] && corners[front[1]];
    if (frontBoth || g.lastKick === 4) return 'full';
    return 'mini';
  }

  function lock(g, hard, dist) {
    const c = g.cur;
    const tspin = detectTSpin(g);
    const placed = cells(c.type, c.rot, c.x, c.y);
    let allHidden = true;
    for (const [px, py] of placed) {
      g.board[py][px] = ID[c.type];
      if (py >= HIDDEN) allHidden = false;
    }
    // volle Zeilen suchen
    const full = [];
    for (let y = 0; y < ROWS; y++) if (g.board[y].every((v) => v)) full.push(y);
    const rowData = full.map((y) => g.board[y].slice());
    if (full.length) {
      g.board = g.board.filter((_, y) => !full.includes(y));
      while (g.board.length < ROWS) g.board.unshift(new Array(COLS).fill(0));
    }
    const n = full.length;
    let gain = 0;
    const lvl = g.level;
    let difficult = false;
    if (tspin === 'full') {
      gain = TSPIN_SCORE[n] * lvl;
      difficult = n > 0;
    } else if (tspin === 'mini') {
      gain = MINI_SCORE[n] * lvl;
      difficult = n > 0;
    } else {
      gain = LINE_SCORE[n] * lvl;
      difficult = n === 4;
    }
    let b2bHit = false;
    if (n > 0) {
      if (difficult) {
        if (g.b2b) {
          gain = Math.floor(gain * 1.5);
          b2bHit = true;
        }
        g.b2b = true;
      } else {
        g.b2b = false;
      }
      g.combo++;
      if (g.combo > 0) gain += 50 * g.combo * lvl;
    } else {
      g.combo = -1;
    }
    const perfect = n > 0 && g.board.every((row) => row.every((v) => !v));
    if (perfect) gain += PERFECT_SCORE[n] * lvl;
    g.score += gain;
    g.lines += n;
    const newLevel = g.startLevel + Math.floor(g.lines / 10);
    const levelUp = newLevel > g.level;
    g.level = newLevel;

    const result = {
      t: 'lock',
      type: c.type, rot: c.rot, x: c.x, y: c.y,
      cells: placed, hard: !!hard, dist: dist || 0,
      rows: full, rowData, lines: n, tspin, combo: g.combo, b2b: b2bHit, perfect, gain,
      levelUp, level: g.level,
    };
    g.events.push(result);

    g.holdUsed = false;
    if (allHidden) {
      g.over = true;
      g.cur = null;
      g.events.push({ t: 'over', why: 'lockout' });
      return result;
    }
    spawn(g, g.queue.shift());
    refill(g);
    return result;
  }

  // Zeitfortschritt in ms: Schwerkraft und Lock-Delay
  function tick(g, dt) {
    if (g.over) return;
    let guard = 0;
    if (grounded(g)) {
      g.lockTimer += dt;
      if (g.lockTimer >= LOCK_DELAY) lock(g, false, 0);
      return;
    }
    g.gravAcc += dt;
    const gm = gravityMs(g.level);
    while (g.gravAcc >= gm && guard++ < 40) {
      g.gravAcc -= gm;
      const c = g.cur;
      if (collides(g.board, c.type, c.rot, c.x, c.y + 1)) { g.gravAcc = 0; break; }
      c.y++;
      g.lastRot = false;
      if (c.y > g.lowestY) { g.lowestY = c.y; g.lockResets = 0; }
    }
  }

  function drainEvents(g) {
    const e = g.events;
    g.events = [];
    return e;
  }

  // Zustand für localStorage: plain JSON
  function serialize(g) {
    const copy = Object.assign({}, g, { events: [] });
    return JSON.stringify(copy);
  }
  function deserialize(str) {
    const g = JSON.parse(str);
    if (!g || !Array.isArray(g.board) || g.board.length !== ROWS || !Array.isArray(g.queue)) return null;
    g.events = [];
    return g;
  }

  return {
    COLS, VISIBLE, HIDDEN, ROWS, LOCK_DELAY, MAX_LOCK_RESETS, TYPES, ID, SHAPES,
    createGame, spawn, move, rotate, softDrop, hardDrop, holdPiece, tick, lock,
    ghostY, collides, cells, grounded, gravityMs, drainEvents, serialize, deserialize, emptyBoard, refill, rand,
  };
});

// Tore: Zahlentore (add/mul) und Waffentore (gesperrt bis freigeschossen).
import { CFG } from '../config.js';
import { BAL, applyAddGate, applyMulGate, gatePointCost, weaponGateHp } from '../data/balance.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { burst, emit, floatText } from './particles.js';
import { upgradeWeapon } from './squad.js';

const GATE_H = 44;
const SPAWN_Y = -40;
const LEFT_X = 6;
const GOOD = CFG.COLORS.good;
const BAD = CFG.COLORS.bad;
const MUL_SHOT_CAP = BAL.MUL_STEPS.indexOf(BAL.MUL_SHOT_MAX);
const TOP_OFFSET = 30; // Text-Position über der Truppenlinie

function makeNumGate(game, x, w, def, row) {
  return {
    kind: 'num',
    x,
    w,
    y: SPAWN_Y,
    h: GATE_H,
    op: def.op === 'mul' ? 'mul' : 'add',
    value: def.v,
    base: def.v,
    progress: 0,
    pointCost: gatePointCost(game.levelNum),
    used: false,
    locked: false,
    unlockHp: 0,
    unlockMax: 0,
    flash: 0,
    row,
  };
}

function makeWeaponGate(game, x, w, row) {
  const hp = weaponGateHp(game.levelNum);
  return {
    kind: 'weapon',
    x,
    w,
    y: SPAWN_Y,
    h: GATE_H,
    op: null,
    value: 0,
    base: 0,
    progress: 0,
    pointCost: 0,
    used: false,
    locked: true,
    unlockHp: hp,
    unlockMax: hp,
    flash: 0,
    row,
  };
}

// Index der nächsten Stufe in MUL_STEPS (robust gegen Rundungsabweichungen).
function stepIndex(v) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < BAL.MUL_STEPS.length; i++) {
    const d = Math.abs(BAL.MUL_STEPS[i] - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Anzeigetext: +5 / -5, x2 / x3 / x1 / ÷2 / ÷3; Waffentor: "WAFFE".
export function gateLabel(g) {
  if (g.kind === 'weapon') return 'WAFFE';
  if (g.op === 'add') return (g.value >= 0 ? '+' : '') + g.value;
  const v = g.value;
  if (v < 1) return '÷' + Math.round(1 / v);
  return 'x' + v;
}

// Zwei Tore (linke/rechte Hälfte) bzw. ein Einzeltor bzw. Waffentor (+ optionales Zahlentor) erzeugen.
// Alle Tore einer Reihe teilen sich `row`: man kann nur eines nehmen.
export function spawnGateRow(game, ev) {
  const half = game.W / 2;
  const row = ++game.rowSeq;
  const rightX = half + 3;
  const w = half - 9;

  if (ev.t === 'gates') {
    game.gates.push(makeNumGate(game, LEFT_X, w, ev.left, row));
    game.gates.push(makeNumGate(game, rightX, w, ev.right, row));
  } else if (ev.t === 'gate') {
    const x = ev.side === 'right' ? rightX : LEFT_X;
    game.gates.push(makeNumGate(game, x, w, ev.g, row));
  } else if (ev.t === 'weapon') {
    const sideX = ev.side === 'right' ? rightX : LEFT_X;
    const otherX = ev.side === 'right' ? LEFT_X : rightX;
    game.gates.push(makeWeaponGate(game, sideX, w, row));
    if (ev.other) game.gates.push(makeNumGate(game, otherX, w, ev.other, row));
  }
  // Optional: ev.yFrac platziert die Reihe direkt auf dem Bildschirm (Start-Tor jedes Levels).
  if (ev.yFrac !== undefined) {
    const gates = game.gates;
    for (let i = 0; i < gates.length; i++) if (gates[i].row === row) gates[i].y = game.SQUAD_Y * ev.yFrac;
  }
}

// Schaden auf ein Tor. Zahlentor: Fortschritt zur nächsten Stufe. Waffentor: HP-Balken bis zur Freischaltung.
export function hitGate(game, gate, dmg) {
  gate.flash = 1;

  if (gate.kind === 'weapon') {
    if (!gate.locked) return;
    gate.unlockHp -= dmg;
    if (gate.unlockHp <= 0) {
      gate.unlockHp = 0;
      gate.locked = false;
      audio.coin();
      haptics.tap();
      burst(game, 'spark', gate.x + gate.w / 2, gate.y, 10, { speed: 150 });
      emit(game, 'ring', gate.x + gate.w / 2, gate.y, { size: 10 });
      floatText(game, gate.x + gate.w / 2, gate.y, 'FREI!', GOOD);
    }
    return;
  }

  if (gate.used) return;

  // Größere Trupps schießen mehr Schaden → Punkte kosten proportional mehr (kein Sofort-Maximum).
  dmg /= 1 + game.squad.count / BAL.GATE_COST_SQUAD_DIV;

  if (gate.op === 'add') {
    const max = gate.base + BAL.GATE_MAX_GAIN;
    if (gate.value >= max) {
      gate.progress = 0;
      return;
    }
    gate.progress += dmg / gate.pointCost;
    while (gate.progress >= 1 && gate.value < max) {
      gate.value++;
      gate.progress -= 1;
    }
    if (gate.value >= max) gate.progress = 0;
  } else {
    let idx = stepIndex(gate.value);
    const maxIdx = Math.max(stepIndex(gate.base), Math.min(MUL_SHOT_CAP, stepIndex(gate.base) + BAL.MUL_MAX_SHOT_STEPS));
    if (idx >= maxIdx) {
      gate.progress = 0;
      return;
    }
    gate.progress += dmg / (gate.pointCost * BAL.MUL_STEP_COST_FACTOR);
    while (gate.progress >= 1 && idx < maxIdx) {
      idx++;
      gate.progress -= 1;
    }
    gate.value = BAL.MUL_STEPS[idx];
    if (idx >= maxIdx) gate.progress = 0;
  }
}

// Alle Tore derselben Reihe werden verbraucht.
function markRow(game, row) {
  const gates = game.gates;
  for (let i = 0; i < gates.length; i++) {
    if (gates[i].row === row) gates[i].used = true;
  }
}

// Truppe durchläuft ein Tor: Wirkung anwenden, Reihe verbrauchen.
function passGate(game, g) {
  const sq = game.squad;
  const topY = game.SQUAD_Y - TOP_OFFSET;
  g.used = true;
  markRow(game, g.row);

  if (g.kind === 'weapon') {
    if (g.locked) {
      floatText(game, sq.x, topY, 'GESPERRT', BAD);
      audio.click();
    } else {
      upgradeWeapon(game);
    }
    return;
  }

  const before = sq.count;
  const after = g.op === 'mul' ? applyMulGate(before, g.value) : applyAddGate(before, g.value);
  sq.count = Math.min(BAL.MAX_SOLDIERS, after);
  const good = sq.count >= before;

  audio.gate(good);
  haptics.tap();
  floatText(game, sq.x, topY, gateLabel(g), good ? GOOD : BAD);
  emit(game, 'ring', sq.x, game.SQUAD_Y - 10, { color: good ? GOOD : BAD });
}

// Tore scrollen; Truppe passiert ein Tor, wenn die Torlinie die Truppenlinie kreuzt und sie darunter steht.
export function updateGates(game, dt) {
  const gates = game.gates;
  const sq = game.squad;
  const sqY = game.SQUAD_Y;
  const speed = game.objSpeed;
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    g.y += speed * dt;
    g.flash *= Math.max(0, 1 - dt * 10);
    if (g.y > game.H + 60) {
      gates.splice(i, 1);
      continue;
    }
    if (!g.used &&
        g.y + g.h / 2 >= sqY - 10 && g.y - g.h / 2 <= sqY &&
        sq.x >= g.x && sq.x <= g.x + g.w) {
      passGate(game, g);
    }
  }
}

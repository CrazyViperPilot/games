// Speicherstand in localStorage (PRD §7). Schlüssel 'mariocraft-save', Format v1.
// Alle Zugriffe sind abgesichert: ohne Speicher läuft das Spiel mit Standardwerten weiter.
const KEY = 'mariocraft-save';
const POWERS = ['small', 'big', 'fire'];

// Save = { v, lang, sound, unlocked, lives, coins, power, levels }
// lang: null (noch nicht gewählt, dann Gerätesprache) | 'de' | 'pl'
export function defaultSave() {
  return {
    v: 1,
    lang: null,
    sound: true,
    unlocked: 'w1-1',
    lives: 3,
    coins: 0,
    power: 'small',
    levels: {},
  };
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return base;
    const s = { ...base };
    if (d.lang === 'de' || d.lang === 'pl') s.lang = d.lang;
    if (typeof d.sound === 'boolean') s.sound = d.sound;
    if (typeof d.unlocked === 'string') s.unlocked = d.unlocked;
    if (Number.isInteger(d.lives) && d.lives >= 1 && d.lives <= 99) s.lives = d.lives;
    if (Number.isInteger(d.coins) && d.coins >= 0) s.coins = d.coins;
    if (POWERS.includes(d.power)) s.power = d.power;
    if (d.levels && typeof d.levels === 'object') s.levels = d.levels;
    return s;
  } catch (_) {
    return base;
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (_) {
    // Kein Speicher verfügbar (privater Modus, blockierte Website-Daten): Spiel läuft weiter.
  }
}

// Speicherstand in localStorage (PRD §9). Schlüssel 'mariocraft-save', Format v2 (Blockwelt).
// Alle Zugriffe sind abgesichert: ohne Speicher läuft das Spiel mit Standardwerten weiter.
const KEY = 'mariocraft-save';
const POWERS = ['plain', 'armor', 'bow'];

// Save = { v, lang, sound, unlocked, lives, emeralds, power, pick, levels }
// lang: null (noch nicht gewählt, dann Gerätesprache) | 'de' | 'pl'
// power: 'plain' | 'armor' | 'bow'; pick: beste Spitzhacke 0..3
// levels: { [id]: { done, bestTime, emeralds, diamonds: [b, b, b] } }
export function defaultSave() {
  return {
    v: 2,
    lang: null,
    sound: true,
    unlocked: 'w1-1',
    lives: 3,
    emeralds: 0,
    power: 'plain',
    pick: 0,
    levels: {},
  };
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const d = JSON.parse(raw);
    if (!d) return base;
    // Alter v1-Stand (Mario-Stil): zurücksetzen, nur Sprache und Ton bleiben.
    if (d.v === 1) {
      if (d.lang === 'de' || d.lang === 'pl') base.lang = d.lang;
      if (typeof d.sound === 'boolean') base.sound = d.sound;
      return base;
    }
    if (d.v !== 2) return base;
    const s = { ...base };
    if (d.lang === 'de' || d.lang === 'pl') s.lang = d.lang;
    if (typeof d.sound === 'boolean') s.sound = d.sound;
    if (typeof d.unlocked === 'string') s.unlocked = d.unlocked;
    if (Number.isInteger(d.lives) && d.lives >= 1 && d.lives <= 99) s.lives = d.lives;
    if (Number.isInteger(d.emeralds) && d.emeralds >= 0) s.emeralds = d.emeralds;
    if (POWERS.includes(d.power)) s.power = d.power;
    if (Number.isInteger(d.pick) && d.pick >= 0 && d.pick <= 3) s.pick = d.pick;
    if (d.levels && typeof d.levels === 'object' && !Array.isArray(d.levels)) s.levels = d.levels;
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

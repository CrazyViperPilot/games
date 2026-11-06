// Musik (PRD §14, Paket P4 v5.68): wie die Geräusche mit WebAudio selbst erzeugt, keine Audiodateien. Ein Stück in d-Moll mit der
// Akkordfolge Dm – B♭ – F – C (je ein Takt, endlos). Zwei Schichten laufen immer, nur ihre Pegel ändern sich: ruhig (weiche Flächen
// und Glocke) und Gefecht (Marschtrommel, Pauke, Bass). Die Lage `intensity` 0…1 folgt den Kampfeffekten der Partie.
// Reines Browser-Modul wie sound.js: liest das Spiel und ändert es nicht. Math.random ist hier erlaubt (nicht in js/game).
// Der Vorausplaner erzeugt die Noten nur hier, nie in der Bildschleife selbst.

// ---- Werte der Musik (Geschmackssache, kein Einfluss auf die Partie) --------------------------------------------------------------

const BPM = 96; // Tempo: Viertelnoten je Minute
const STEP = 60 / BPM / 2; // s je Achtel: das Raster, auf dem geplant wird
const BAR_STEPS = 8; // ein Takt 4/4 = acht Achtel
const LOOKAHEAD = 0.25; // s: so weit im Voraus werden Noten geplant
const MUSIC_MASTER = 0.5; // Grundlautstärke der Musik, vor dem Regler (Standard 50 % → 0,25)
const PAUSE_MUL = 0.3; // Pause: Musik auf 30 %, nicht stumm
const END_TC = 0.8; // s: Zeitkonstante beim Spielende; nach 3 s ist die Musik fast stumm
const BATTLE_EFFECTS = 6; // so viele Kampfeffekte …
const BATTLE_WINDOW = 6; // … in so vielen Sekunden Spielzeit (oder ein Alarm „Basis wird angegriffen“) bedeuten Gefecht
const NEAR_OWN = 240; // Weltpunkte: Kampf nahe eigenen Einheiten oder Gebäuden zählt auch außerhalb des Bilds
const RISE = 2; // s, bis die Lage von ruhig auf Gefecht steht
const FALL = 8; // s, bis sie wieder ruhig ist
const QUIET_DUCK = 0.6; // im Gefecht sinkt die ruhige Schicht auf 1 − 0,6 = 0,4
const PAD_GAIN = 0.05; // Flächen je Oszillator
const PAD_ATTACK = 1.0; // s, langsames Einblenden je Akkord
const BELL_GAIN = 0.09; // Glocke
const BELL_DECAY = 1.2; // s
const KICK_GAIN = 0.5; // Pauke auf 1 und 3
const SNARE_GAIN = 0.25; // Marschtrommel
const BASS_GAIN = 0.12; // Bass-Ostinato
const DRUM_PATTERN = 'x.xxx.x.'; // Trommel je Achtel im Takt: x . x x | x . x . (ein Zeichen je Achtel)
const BELL_ORDER = [0, 1, 2, 1]; // welcher Glockenton je Halbtakt (zyklisch über vier Halbtakte)

/** Akkorde: Bass-Grundton, zwei Flächentöne (Grundton und Quinte), drei Glockentöne (Hz). */
const CHORDS = [
  { root: 73.42, pad: [146.83, 220.0], bell: [293.66, 349.23, 440.0] }, // Dm: D2 · D3 A3 · D4 F4 A4
  { root: 58.27, pad: [116.54, 174.61], bell: [293.66, 349.23, 466.16] }, // B♭: B♭1 · B♭2 F3 · D4 F4 B♭4
  { root: 87.31, pad: [174.61, 261.63], bell: [349.23, 440.0, 523.25] }, // F: F2 · F3 C4 · F4 A4 C5
  { root: 65.41, pad: [130.81, 196.0], bell: [261.63, 329.63, 392.0] }, // C: C2 · C3 G3 · C4 E4 G4
];

/** Kampfeffekte (game.effects), die als Gefecht zählen: Schuss, Mündung, Einschlag, Explosion, Tod. */
export const BATTLE_TYPES = new Set(['tracer', 'muzzle', 'shell', 'explosion', 'death']);

/** Hüllkurve: Anstieg auf `peak` in `atk` s, dann Abklingen bis `t + dur`. */
function envelope(g, t, peak, atk, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

export class Music {
  /** `ctx`: AudioContext; `noise`: Rausch-Puffer (von Sound erzeugt). `level`: Musik-Regler 0–1. */
  constructor(ctx, noise, level = 0.5) {
    this.ctx = ctx;
    this.noise = noise;
    this.level = level;
    this.ring = new Float64Array(BATTLE_EFFECTS).fill(-1e9); // Spielzeit der letzten Kampfeffekte
    this.ringAt = 0; // ältester Eintrag im Ring
    this.alarmUntil = -1e9; // Spielzeit, bis zu der ein Alarm gilt
    this.intensity = 0; // Lage 0 ruhig … 1 Gefecht
    this.next = 0; // AudioContext-Zeit des nächsten Achtels
    this.step = 0; // laufende Nummer des Achtels (bestimmt Akkord und Takt)
    this.last = { bus: -1, quiet: -1, battle: -1 }; // zuletzt gesetzte Pegel (nur bei Änderung neu setzen)
    this.build();
  }

  /** Ausgänge: Musik-Bus direkt zum Ausgang (nicht durch den Kompressor der Geräusche), zwei Schichten, Filter. */
  build() {
    const ctx = this.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(ctx.destination);
    this.quiet = ctx.createGain();
    this.quiet.gain.value = 1;
    this.quiet.connect(this.bus);
    this.battle = ctx.createGain();
    this.battle.gain.value = 0;
    this.battle.connect(this.bus);
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padFilter.connect(this.quiet);
    this.bassFilter = ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.value = 320;
    this.bassFilter.connect(this.battle);
    this.drumFilter = ctx.createBiquadFilter();
    this.drumFilter.type = 'bandpass';
    this.drumFilter.frequency.value = 2000;
    this.drumFilter.Q.value = 1.2;
    this.drumFilter.connect(this.battle);
  }

  /** Neues Spiel: Lage und Ring zurücksetzen (die Spielzeit beginnt bei 0). */
  reset() {
    this.ring.fill(-1e9);
    this.ringAt = 0;
    this.alarmUntil = -1e9;
    this.intensity = 0;
  }

  setLevel(v) {
    this.level = Math.min(1, Math.max(0, v));
  }

  /** Sofort leise (Ton aus, Partie beendet, Menü): keine neuen Noten, Bus blendet aus. */
  silence() {
    const now = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(0, now, 0.1);
    this.last.bus = 0;
    this.next = now + 0.05;
  }

  /** Ein Kampfeffekt (Spielzeit `clock`) in Bildnähe oder bei eigenen Einheiten. */
  hit(clock) {
    this.ring[this.ringAt] = clock;
    this.ringAt = (this.ringAt + 1) % BATTLE_EFFECTS;
  }

  /** Alarm „Basis wird angegriffen“: gilt wie Gefecht für BATTLE_WINDOW s. */
  alert(clock) {
    this.alarmUntil = clock + BATTLE_WINDOW;
  }

  /**
   * Einmal je Bild: Lage nachführen, Pegel setzen und die Noten der nächsten LOOKAHEAD Sekunden planen.
   * `game`: die laufende Partie (liest game.time und game.winner); `paused`: Pause (Musik leiser, nicht stumm).
   */
  update(dt, game, paused) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const clock = game.time;
    // Lage: Gefecht, wenn sechs Kampfeffekte im Fenster liegen oder der Alarm gilt; weich nachgeführt
    const battle = clock - this.ring[this.ringAt] <= BATTLE_WINDOW || this.alarmUntil > clock;
    const d = (battle ? 1 : 0) - this.intensity;
    this.intensity += Math.sign(d) * Math.min(Math.abs(d), dt / (d > 0 ? RISE : FALL));
    // Pegel: Spielende blendet aus, Pause senkt auf 30 %
    const ended = game.winner !== null;
    const bus = ended ? 0 : this.level * MUSIC_MASTER * (paused ? PAUSE_MUL : 1);
    this.setTo(this.bus.gain, 'bus', bus, now, ended ? END_TC : 0.3);
    this.setTo(this.quiet.gain, 'quiet', 1 - QUIET_DUCK * this.intensity, now, 0.5);
    this.setTo(this.battle.gain, 'battle', this.intensity, now, 0.5);
    // Ohne hörbaren Pegel (Musik 0 %, Spielende) keine Noten; beim Wiederbeginn nichts nachholen
    if (bus < 0.001) {
      this.next = now + 0.05;
      return;
    }
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + LOOKAHEAD) {
      this.planStep(this.step, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  /** Pegel nur setzen, wenn er sich merklich ändert (keine Flut von Automationsereignissen je Bild). */
  setTo(param, key, v, now, tc) {
    if (Math.abs(v - this.last[key]) < 0.002) return;
    this.last[key] = v;
    param.setTargetAtTime(v, now, tc);
  }

  /** Alle Stimmen eines Achtels (Index `s`) zur Zeit `t`. */
  planStep(s, t) {
    const p = s % BAR_STEPS;
    const bar = Math.floor(s / BAR_STEPS);
    const chord = CHORDS[bar % CHORDS.length];
    if (p === 0) this.pad(chord, t);
    if (p % 4 === 0) this.bell(chord, t, Math.floor(s / 4));
    if (p === 0 || p === 4) this.kick(t);
    if (DRUM_PATTERN.charAt(p) === 'x') this.snare(t);
    this.bass(chord, t);
  }

  /** Fläche für einen Takt: zwei verstimmte Sägezahn-Oszillatoren durch den Tiefpass, langsam eingeblendet. */
  pad(chord, t) {
    const ctx = this.ctx;
    const dur = BAR_STEPS * STEP;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(PAD_GAIN, t + PAD_ATTACK);
    g.gain.setValueAtTime(PAD_GAIN, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
    g.connect(this.padFilter);
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(chord.pad[i], t);
      o.detune.setValueAtTime(i === 0 ? -6 : 6, t);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.9);
    }
  }

  /** Glocke (Sinus) je Halbtakt, ein Ton aus dem Akkord. */
  bell(chord, t, half) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(chord.bell[BELL_ORDER[half & 3]], t);
    const g = ctx.createGain();
    envelope(g, t, BELL_GAIN, 0.01, BELL_DECAY);
    o.connect(g);
    g.connect(this.quiet);
    o.start(t);
    o.stop(t + BELL_DECAY + 0.05);
  }

  /** Pauke: tiefer Sinus mit fallender Tonhöhe. */
  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const g = ctx.createGain();
    envelope(g, t, KICK_GAIN, 0.005, 0.3);
    o.connect(g);
    g.connect(this.battle);
    o.start(t);
    o.stop(t + 0.35);
  }

  /** Marschtrommel: kurzes Rauschen durch das Bandfilter. */
  snare(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const g = ctx.createGain();
    envelope(g, t, SNARE_GAIN, 0.002, 0.09);
    src.connect(g);
    g.connect(this.drumFilter);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.1);
  }

  /** Bass-Ostinato: Grundton in jedem Achtel, Rechteck durch den Tiefpass. */
  bass(chord, t) {
    const ctx = this.ctx;
    const dur = STEP * 0.85;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(chord.root, t);
    const g = ctx.createGain();
    envelope(g, t, BASS_GAIN, 0.01, dur);
    o.connect(g);
    g.connect(this.bassFilter);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

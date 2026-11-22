// API-Client und kleine Helfer. Einstellungen liegen im localStorage unter "sv:".
// Auf GitHub Pages läuft nur die Oberfläche; das PHP-Backend liegt auf phpexpert.de.
const API_URL = location.hostname.endsWith('github.io')
  ? 'https://phpexpert.de/games/schiffe-versenken/api.php'
  : 'api.php';

const store = {
  get(k, d = '') { try { return localStorage.getItem('sv:' + k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('sv:' + k, v); } catch (e) { /* privater Modus */ } },
  del(k) { try { localStorage.removeItem('sv:' + k); } catch (e) { /* egal */ } },
};

async function apiCall(body, query = '') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(API_URL + query, {
      method: body ? 'POST' : 'GET',
      // text/plain vermeidet den CORS-Preflight für POST
      headers: body ? { 'X-SV-Token': store.get('token'), 'Content-Type': 'text/plain' } : { 'X-SV-Token': store.get('token') },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const data = await res.json();
    data.status = res.status;
    if (!res.ok && !data.error) data.error = 'Serverfehler ' + res.status;
    if (data.token) store.set('token', data.token);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Sound (synthetisch, ohne Dateien) ---------- */
const Sound = {
  ctx: null,
  on: store.get('sound', '1') === '1',
  unlock() {
    if (this.ctx || !this.on) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  noise(dur, freq, q, gain, type = 'lowpass') {
    const a = this.ctx; if (!a) return;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(a.destination); src.start();
  },
  tone(f0, f1, dur, gain, type = 'sine') {
    const a = this.ctx; if (!a) return;
    const o = a.createOscillator(); o.type = type;
    const g = a.createGain();
    o.frequency.setValueAtTime(f0, a.currentTime); o.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur);
    g.gain.setValueAtTime(gain, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  },
  play(kind) {
    if (!this.on || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (kind === 'fire') { this.noise(0.25, 900, 0.7, 0.5); this.tone(180, 60, 0.2, 0.4, 'triangle'); }
    else if (kind === 'miss') { this.noise(0.5, 2400, 0.4, 0.35, 'bandpass'); this.tone(500, 900, 0.15, 0.06); }
    else if (kind === 'hit') { this.noise(0.7, 400, 0.8, 0.9); this.tone(120, 40, 0.5, 0.5, 'sawtooth'); }
    else if (kind === 'sunk') { this.noise(1.3, 300, 0.8, 1); this.tone(90, 30, 1.1, 0.6, 'sawtooth'); }
    else if (kind === 'turn') { this.tone(660, 880, 0.12, 0.08); setTimeout(() => this.tone(880, 990, 0.12, 0.08), 120); }
    else if (kind === 'chat') this.tone(1200, 1500, 0.08, 0.05);
  },
};

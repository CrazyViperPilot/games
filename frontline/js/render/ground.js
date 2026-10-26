// Gelände in 3D für die isometrische Ansicht (WebGL): Höhennetz (Feinraster 32 px) mit dem Bodenbild als Textur, Licht aus
// der Hangneigung, Fels an steilen Hängen, Seen mit bewegtem Wasser, Erdschnitt am Kartenrand und der Nebel des Krieges auf
// demselben Netz. Zeichnet in ein eigenes Canvas, das der Renderer in sein 2D-Bild kopiert (erst Boden, später Nebel).
import { BALANCE } from '../data/balance.js';
import { RELIEF, FINE_N } from '../game/relief.js';

const W = BALANCE.map.width;
const STEP = RELIEF.step;
const SKIRT_BOTTOM = -190; // Unterkante des Erdschnitts am Kartenrand
const DEPTH_K = 1 / 26000; // Tiefe → Clip-Raum (Karte samt Höhen passt hinein)
export const LIGHT_ELEV = 0.62; // Lichthöhe (z-Anteil des Lichtvektors)

const VS = `
attribute vec2 aPos;
attribute vec3 aH;
uniform vec2 uCam;
uniform vec4 uM;
uniform vec2 uView;
uniform vec2 uDepthDir;
uniform float uZoom;
uniform float uWater;
uniform float uFlat;
varying vec2 vPos;
varying float vH;
varying vec2 vG;
void main() {
  float hd = uFlat > 0.5 ? aH.x : max(aH.x, uWater);
  vec2 d = aPos - uCam;
  vec2 s = vec2(uM.x * d.x + uM.z * d.y, uM.y * d.x + uM.w * d.y - hd * uZoom);
  float depth = dot(uDepthDir, d) + 0.3536 * hd;
  gl_Position = vec4(s.x * 2.0 / uView.x, -s.y * 2.0 / uView.y, -depth * ${DEPTH_K.toExponential(6)}, 1.0);
  vPos = aPos;
  vH = aH.x;
  vG = aH.yz;
}`;

// Rauschen kommt aus einer kachelbaren Textur (noiseTexture), das ist auf Handys viel billiger als sin()-Hashes:
// r, g = Neigung der Felsstruktur h (0,5 = eben), b = h (Grate hell, Rinnen dunkel), a = weiches Rauschen für Farbe und Wasser.
const FS_GROUND = `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uNoise;
uniform vec3 uLight;
uniform float uTime;
uniform float uWater;
uniform float uSkirt;
uniform float uSnow; // Winter (1): Schnee auf flachem Fels, Ufer und am Rand der Seen Eis
varying vec2 vPos;
varying float vH;
varying vec2 vG;
float nz(vec2 p, float s) { return texture2D(uNoise, p / (256.0 * s)).a; }
void main() {
  if (uSkirt > 0.5) {
    // Erdschnitt: Schichten aus Humus, Lehm und Stein, nach außen gerichtete Normale in vG
    float band = sin(vH * 0.09 + nz(vPos, 6.0) * 3.0);
    vec3 soil = mix(vec3(0.27, 0.21, 0.15), vec3(0.38, 0.30, 0.21), 0.5 + 0.5 * band);
    float l = 0.55 + 0.45 * max(dot(normalize(vec3(vG, 0.25)), uLight), 0.0);
    vec4 t = texture2D(uNoise, vec2(vPos.x + vPos.y, vH * 3.0) / 300.0);
    gl_FragColor = vec4(soil * l * (0.85 + 0.3 * t.b), 1.0);
    return;
  }
  vec3 base = texture2D(uTex, vPos / ${W.toFixed(1)}).rgb;
  float slope = length(vG);
  float hh = clamp((vH - 70.0) / 220.0, 0.0, 1.0);
  float n1 = nz(vPos, 5.75);
  float n2 = nz(vPos + 91.0, 1.1);
  // Gras: oben trockener und heller
  base *= mix(vec3(1.0), vec3(1.10, 1.05, 0.84), hh * (1.0 - uSnow));
  vec3 n = normalize(vec3(-vG * 1.9, 1.0));
  float lit = clamp(1.0 + 1.05 * (dot(n, uLight) - uLight.z), 0.6, 1.35);
  float rk = max(smoothstep(${RELIEF.rock.toFixed(2)}, ${(RELIEF.steep + 0.03).toFixed(2)}, slope + (n1 - 0.5) * 0.1), smoothstep(${(RELIEF.peak - 40).toFixed(1)}, ${RELIEF.peak.toFixed(1)}, vH));
  vec3 col = base;
  float shade = lit;
  if (rk > 0.002) {
    // Fels: Rinnen und Rippen laufen hangabwärts (Textur senkrecht auf die Hangseiten projiziert, gestreckt entlang der
    // Höhe), dazu feine Zacken; beides wirkt als Relief im Licht, die Rinnen sind zusätzlich dunkler.
    // Fels aus Blöcken (Voronoi-Zellen in der Textur): jeder Block ist eigen gekippt, die Fugen sind dunkel; große
    // Blöcke und kleine Kanten übereinander.
    vec2 warp = (vec2(n1, nz(vPos + 211.0, 3.0)) - 0.5) * 0.03; // unregelmäßige Fugen
    vec4 v1 = texture2D(uNoise, vPos / 720.0 + 0.25 + warp);
    vec4 v2 = texture2D(uNoise, vPos / 260.0 + vec2(0.61, 0.13) + warp * 2.0);
    vec2 tilt = (v1.rg - 0.5) / 0.6 * 0.9 + (v2.rg - 0.5) / 0.6 * 0.45;
    vec3 nr = normalize(vec3(-vG * 1.9 - tilt * smoothstep(0.12, 0.35, slope), 1.0));
    float rl = clamp(1.0 + 1.35 * (dot(nr, uLight) - uLight.z), 0.42, 1.45);
    vec3 rock = mix(vec3(0.36, 0.34, 0.30), vec3(0.58, 0.55, 0.49), clamp(0.15 + hh * 0.35 + n1 * 0.35, 0.0, 1.0));
    rock *= (0.5 + 0.6 * v1.b) * (0.85 + 0.2 * v2.b);
    // Winter: auf den flacheren Blöcken liegt Schnee, steile Wände bleiben dunkel
    float drift = uSnow * (1.0 - smoothstep(${RELIEF.rock.toFixed(2)}, ${(RELIEF.steep + 0.08).toFixed(2)}, slope - (v1.b - 0.5) * 0.12));
    rock = mix(rock, vec3(0.80, 0.83, 0.87) * (0.9 + 0.2 * v2.b), drift * 0.75);
    col = mix(col, rock, rk);
    shade = mix(lit, rl, rk);
  }
  // Geröll am Fuß der Felsen
  float scree = smoothstep(${(RELIEF.rock - 0.1).toFixed(2)}, ${RELIEF.rock.toFixed(2)}, slope) * (1.0 - rk);
  col = mix(col, vec3(0.42, 0.40, 0.33) * (0.85 + 0.3 * n2), scree * 0.45 * (1.0 - 0.6 * uSnow));
  // Ufer: Sand und nasser Kies (im Winter verschneit)
  float shore = 1.0 - smoothstep(uWater + 1.0, uWater + 10.0, vH);
  col = mix(col, mix(vec3(0.60, 0.55, 0.41), vec3(0.80, 0.83, 0.86), uSnow * 0.8), shore * 0.85);
  col *= shade * (0.95 + 0.1 * nz(vPos + 37.0, 0.5));
  if (vH < uWater) {
    float dpt = uWater - vH;
    vec3 w = mix(vec3(0.30, 0.50, 0.50), vec3(0.10, 0.22, 0.31), smoothstep(0.0, 50.0, dpt));
    vec2 q = vPos + 9.0 * vec2(sin(vPos.y / 37.0 + uTime * 0.7), sin(vPos.x / 41.0 + uTime * 0.6));
    float rip = nz(q + vec2(uTime * 24.0, uTime * 11.0), 2.6) + nz(q - vec2(uTime * 20.0, -uTime * 8.0) + 53.0, 1.6);
    w += vec3(0.06, 0.08, 0.08) * smoothstep(1.1, 1.55, rip);
    w += vec3(0.05, 0.06, 0.06) * (1.0 - smoothstep(0.0, 14.0, dpt)); // heller Saum im flachen Wasser
    w = mix(w, vec3(0.78, 0.84, 0.82), (1.0 - smoothstep(0.0, 2.2, dpt)) * 0.55);
    // Winter: kälteres Wasser, am Ufer ein Eisrand
    w = mix(w, w * vec3(0.82, 0.95, 1.08), uSnow);
    w = mix(w, vec3(0.80, 0.87, 0.92), uSnow * (1.0 - smoothstep(2.0, 9.0 + 6.0 * n2, dpt)) * 0.85);
    col = w;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const FS_FOG = `
precision mediump float;
uniform sampler2D uFog;
varying vec2 vPos;
varying float vH;
varying vec2 vG;
void main() {
  float a = texture2D(uFog, vPos / ${W.toFixed(1)}).r;
  gl_FragColor = vec4(vec3(0.024, 0.031, 0.039) * a, a);
}`;

const NOISE_N = 256;
const NOISE_CELLS = 16; // Felsblöcke je Achse und Kachel

/**
 * Kachelbare Rauschtextur (NOISE_N², RGBA), fester Startwert. Felsblöcke als Voronoi-Zellen: r, g = Neigung des Blocks
 * (eigene Kippung je Block plus leichte Wölbung, Wert = 0,5 + 0,6 × Neigung), b = Helligkeit (je Block verschieden, in
 * den Fugen dunkel). a = weiches Wertrauschen für Farbe und Wasser.
 */
function noiseTexture() {
  const N = NOISE_N;
  const G = NOISE_CELLS;
  const cs = N / G;
  let seed = 0x2f6b1d;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cells = [];
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const ang = rand() * Math.PI * 2;
      const mag = 0.12 + rand() * 0.38;
      cells.push({ x: (i + 0.15 + rand() * 0.7) * cs, y: (j + 0.15 + rand() * 0.7) * cs, tx: Math.cos(ang) * mag, ty: Math.sin(ang) * mag, lum: rand() });
    }
  }
  const L = 32;
  const lat = Float32Array.from({ length: L * L }, rand);
  const soft = (x, y) => {
    const u = (x / N) * L;
    const v = (y / N) * L;
    const i = Math.floor(u);
    const j = Math.floor(v);
    let fu = u - i;
    let fv = v - j;
    fu = fu * fu * (3 - 2 * fu);
    fv = fv * fv * (3 - 2 * fv);
    const at = (a, b) => lat[(b % L) * L + (a % L)];
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fu;
    const bot = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu;
    return top + (bot - top) * fv;
  };
  const out = new Uint8Array(N * N * 4);
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const near = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const ci = Math.floor(px / cs);
      const cj = Math.floor(py / cs);
      near.length = 0;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ii = ci + di;
          const jj = cj + dj;
          const c = cells[((jj + G) % G) * G + ((ii + G) % G)];
          // Kachelung: Zellen jenseits des Randes an die richtige Stelle verschieben
          const cx = c.x + (ii < 0 ? -N : ii >= G ? N : 0);
          const cy = c.y + (jj < 0 ? -N : jj >= G ? N : 0);
          near.push({ c, x: cx, y: cy, d: (px - cx) ** 2 + (py - cy) ** 2 });
        }
      }
      let best = near[0];
      for (const q of near) if (q.d < best.d) best = q;
      // Abstand zur nächsten Zellgrenze (Mittelsenkrechte zum nächsten Nachbarn)
      let edge = Infinity;
      for (const q of near) {
        if (q === best) continue;
        const ex = q.x - best.x;
        const ey = q.y - best.y;
        const el = Math.hypot(ex, ey);
        const e = ((px - (best.x + q.x) / 2) * -ex + (py - (best.y + q.y) / 2) * -ey) / el;
        if (e < edge) edge = e;
      }
      const c = best.c;
      const tx = c.tx + ((px - best.x) / cs) * 0.35;
      const ty = c.ty + ((py - best.y) / cs) * 0.35;
      const crack = Math.min(1, Math.max(0, (edge - 0.3) / 1.1));
      const k = (y * N + x) * 4;
      out[k] = byte(0.5 + 0.6 * tx);
      out[k + 1] = byte(0.5 + 0.6 * ty);
      out[k + 2] = byte((0.5 + 0.5 * crack) * (0.62 + 0.38 * c.lum));
      out[k + 3] = byte(soft(x, y));
    }
  }
  return out;
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader');
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.bindAttribLocation(p, 1, 'aH');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'Programm');
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

class Ground {
  constructor() {
    this.canvas = document.createElement('canvas');
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, preserveDrawingBuffer: false };
    const gl = this.canvas.getContext('webgl2', opts) || this.canvas.getContext('webgl', opts);
    if (!gl) throw new Error('Kein WebGL');
    this.gl = gl;
    this.gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (!this.gl2 && !gl.getExtension('OES_element_index_uint')) throw new Error('Kein 32-Bit-Index');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.ground = program(gl, VS, FS_GROUND);
    this.fogProg = program(gl, VS, FS_FOG);
    this.buildMesh();
    this.relief = null;
    this.version = -1;
    this.texSrc = null;
    this.tex = gl.createTexture();
    this.fogTex = gl.createTexture();
    this.fogSize = 0;
    this.noiseTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NOISE_N, NOISE_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D); // Zweierpotenz: geht auch mit WebGL 1
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  /** Statisches Netz: Lage der Feinpunkte und Dreiecke; dazu der Erdschnitt am Rand (eigene Puffer). */
  buildMesh() {
    const gl = this.gl;
    const n = FINE_N;
    const pos = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        pos[(j * n + i) * 2] = i * STEP;
        pos[(j * n + i) * 2 + 1] = j * STEP;
      }
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        idx[k++] = a;
        idx[k++] = a + 1;
        idx[k++] = a + n;
        idx[k++] = a + 1;
        idx[k++] = a + n + 1;
        idx[k++] = a + n;
      }
    }
    this.count = k;
    this.posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    this.idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.hData = new Float32Array(n * n * 3);
    this.hBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.hBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.hData.byteLength, gl.DYNAMIC_DRAW);
    // Rand: vier Seiten, je Feinpunkt oben (Geländehöhe) und unten; Normale zeigt nach außen
    const sides = [
      (t) => [t * STEP, 0, 0, -1],
      (t) => [W, t * STEP, 1, 0],
      (t) => [W - t * STEP, W, 0, 1],
      (t) => [0, W - t * STEP, -1, 0],
    ];
    this.skirtSide = sides;
    this.skirtPos = new Float32Array(4 * n * 2 * 2);
    this.skirtH = new Float32Array(4 * n * 2 * 3);
    const sidx = [];
    let v = 0;
    for (const side of sides) {
      for (let t = 0; t < n; t++) {
        const [x, y] = side(t);
        this.skirtPos.set([x, y, x, y], v * 2);
        if (t < n - 1) sidx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        v += 2;
      }
    }
    this.skirtCount = sidx.length;
    this.skirtPosBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skirtPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.skirtPos, gl.STATIC_DRAW);
    this.skirtHBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skirtHBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.skirtH.byteLength, gl.DYNAMIC_DRAW);
    this.skirtIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skirtIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(sidx), gl.STATIC_DRAW);
  }

  /**
   * Höhen und Neigungen der Feinpunkte hochladen (bei neuem Gelände oder nach Änderung im Editor). Bei demselben Gelände nur
   * die seit dem letzten Mal geänderten Zeilen (relief.rows, eine Zeile Rand für die Neigung).
   */
  uploadRelief(relief) {
    const gl = this.gl;
    const n = FINE_N;
    const F = relief.fine;
    const D = this.hData;
    const part = relief === this.relief && relief.rows;
    const r0 = part ? Math.max(0, relief.rows[0] - 1) : 0;
    const r1 = part ? Math.min(n - 1, relief.rows[1] + 1) : n - 1;
    for (let j = r0; j <= r1; j++) {
      const jm = Math.max(0, j - 1) * n;
      const jp = Math.min(n - 1, j + 1) * n;
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const im = Math.max(0, i - 1);
        const ip = Math.min(n - 1, i + 1);
        D[k * 3] = F[k];
        D[k * 3 + 1] = (F[j * n + ip] - F[j * n + im]) / ((ip - im) * STEP);
        D[k * 3 + 2] = (F[jp + i] - F[jm + i]) / (((jp - jm) / n) * STEP);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.hBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, r0 * n * 3 * 4, D.subarray(r0 * n * 3, (r1 + 1) * n * 3));
    relief.rows = null;
    // Rand oben = sichtbare Geländehöhe (Seen: Wasserspiegel), unten fest
    const S = this.skirtH;
    let v = 0;
    for (const side of this.skirtSide) {
      for (let t = 0; t < n; t++) {
        const [x, y, nx, ny] = side(t);
        const h = Math.max(RELIEF.water, relief.heightAt(x, y));
        S.set([h, nx, ny, SKIRT_BOTTOM, nx, ny], v * 3);
        v += 2;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skirtHBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, S);
    this.relief = relief;
    this.version = relief.version;
  }

  /** Bodenbild (Canvas) als Textur, mit Mipmaps (WebGL 2) und anisotroper Filterung, wo vorhanden. */
  uploadTexture(src) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.gl2) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    if (this.aniso) {
      const max = gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
      gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
    this.texSrc = src;
  }

  /** Canvas auf Bildgröße bringen, Netz und Projektion für die Kamera setzen. */
  begin(cam, cssW, cssH, dpr, relief, prog) {
    const gl = this.gl;
    const pw = Math.max(1, Math.round(cssW * dpr));
    const ph = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    gl.viewport(0, 0, pw, ph);
    if (relief !== this.relief || relief.version !== this.version) this.uploadRelief(relief);
    const { p, u } = prog;
    gl.useProgram(p);
    const [a, b, c, d] = cam.isoMatrix();
    gl.uniform2f(u.uCam, cam.x, cam.y); // die Kamera-Mitte liegt in der Bildmitte
    gl.uniform4f(u.uM, a, b, c, d);
    gl.uniform2f(u.uView, cssW, cssH);
    gl.uniform1f(u.uZoom, cam.zoom);
    gl.uniform1f(u.uWater, RELIEF.water);
    gl.uniform1f(u.uFlat, 0);
    const [dx, dy] = cam.depthDir();
    gl.uniform2f(u.uDepthDir, dx, dy);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    return u;
  }

  bindMesh(posBuf, hBuf, idxBuf) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, hBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  }

  /**
   * Boden zeichnen. tex = Bodenbild (Canvas ohne Gebäude und Bäume), light = Lichtvektor in Weltkoordinaten (z nach oben),
   * snow = 1 im Winter (Schnee auf Fels und Ufer, Eisrand an den Seen).
   * Liefert das Canvas (Hintergrund bg außerhalb der Karte).
   */
  render(cam, cssW, cssH, dpr, relief, tex, light, time, bg, snow = 0) {
    const gl = this.gl;
    if (tex !== this.texSrc) this.uploadTexture(tex);
    const u = this.begin(cam, cssW, cssH, dpr, relief, this.ground);
    gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.uTex, 0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.uniform1i(u.uNoise, 2);
    gl.uniform3f(u.uLight, light[0], light[1], light[2]);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uSnow, snow);
    gl.uniform1f(u.uSkirt, 0);
    this.bindMesh(this.posBuf, this.hBuf, this.idxBuf);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.uniform1f(u.uSkirt, 1);
    gl.uniform1f(u.uFlat, 1);
    this.bindMesh(this.skirtPosBuf, this.skirtHBuf, this.skirtIdx);
    gl.drawElements(gl.TRIANGLES, this.skirtCount, gl.UNSIGNED_INT, 0);
    return this.canvas;
  }

  /** Nebel des Krieges auf dem Gelände: fog = { cols, rows, data: Uint8Array (0 frei … 255 schwarz) }. Liefert das Canvas. */
  renderFog(cam, cssW, cssH, dpr, relief, fog) {
    const gl = this.gl;
    const u = this.begin(cam, cssW, cssH, dpr, relief, this.fogProg);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fogTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.fogSize !== fog.cols * 10000 + fog.rows) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, fog.cols, fog.rows, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, fog.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.fogSize = fog.cols * 10000 + fog.rows;
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, fog.cols, fog.rows, gl.LUMINANCE, gl.UNSIGNED_BYTE, fog.data);
    gl.uniform1i(u.uFog, 1);
    this.bindMesh(this.posBuf, this.hBuf, this.idxBuf);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    return this.canvas;
  }
}

let shared; // undefined = noch nicht versucht, null = kein WebGL

/** Gemeinsamer WebGL-Boden (ein Kontext für Spiel und Editor) oder null, wenn WebGL fehlt oder verloren ging. */
export function getGround() {
  if (shared === undefined) {
    try {
      shared = typeof document !== 'undefined' && !/[?&]gl=0\b/.test(location.search) ? new Ground() : null;
    } catch (err) {
      console.warn('Frontline: 3D-Gelände nicht verfügbar', err);
      shared = null;
    }
  }
  return shared && !shared.lost ? shared : null;
}

// Erzeugt die Bilder von Kampfpanzer, Schützenpanzer und Infanterie (assets/iso/vehicles/tank-*, ifv-*, assets/iso/units/rifleman-*, at-*, sniper-*).
// Eigene Grafik: ein kleiner Software-Renderer (Flächen mit Licht von links oben) malt Modelle aus einfachen Körpern in 8 Richtungen
// und zwei Teamfarben auf Canvas, keine fremden Ressourcen. Aufruf: node tools/gen-troops.mjs
// Danach die Anker in js/render/isodata.js (Infanterie) und MODEL_VIEW in js/render/isosprites.js (Fahrzeuge) prüfen, falls Größen geändert werden.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../assets/iso/', import.meta.url));

const page = await (await chromium.launch()).newPage();
const out = await page.evaluate(() => {
  const K = Math.SQRT1_2;
  const ZK = 0.9; // Höhenmaßstab im Bild
  const SECT = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']; // Bildschirmrichtung, 0° = rechts, im Uhrzeigersinn
  const rng = (seed) => {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => {
    const A = hex(a);
    const B = hex(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(...a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };

  // ---------- Körper ----------
  const box = (x0, x1, y0, y1, z0, z1, col) => ({
    col,
    faces: [
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]],
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
    ],
    c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
  const prismXY = (poly, z0, z1, col) => {
    const faces = [poly.map(([x, y]) => [x, y, z1]), poly.map(([x, y]) => [x, y, z0])];
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      faces.push([[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]]);
    }
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    return { col, faces, c: [cx, cy, (z0 + z1) / 2] };
  };
  const prismXZ = (prof, y0, y1, col) => {
    const faces = [prof.map(([x, z]) => [x, y0, z]), prof.map(([x, z]) => [x, y1, z])];
    for (let i = 0; i < prof.length; i++) {
      const [ax, az] = prof[i];
      const [bx, bz] = prof[(i + 1) % prof.length];
      faces.push([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]]);
    }
    const cx = prof.reduce((s, p) => s + p[0], 0) / prof.length;
    const cz = prof.reduce((s, p) => s + p[1], 0) / prof.length;
    return { col, faces, c: [cx, (y0 + y1) / 2, cz] };
  };
  /** Zylinder (oder Kegelstumpf) von p0 nach p1, Radius r0 → r1. */
  const cyl = (p0, p1, r0, r1, n, col) => {
    const ax = norm(sub(p1, p0));
    const t = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = norm(cross(ax, t));
    const w = cross(ax, u);
    const ring = (p, r) => Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [p[0] + (u[0] * Math.cos(a) + w[0] * Math.sin(a)) * r, p[1] + (u[1] * Math.cos(a) + w[1] * Math.sin(a)) * r, p[2] + (u[2] * Math.cos(a) + w[2] * Math.sin(a)) * r];
    });
    const A = ring(p0, r0);
    const B = ring(p1, r1);
    const faces = [A, B];
    for (let i = 0; i < n; i++) faces.push([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]]);
    return { col, faces, c: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2] };
  };
  const sphere = (c, rx, ry, rz, col, n = 9, m = 6) => {
    const P = (i, j) => {
      const th = (i / m) * Math.PI;
      const ph = (j / n) * Math.PI * 2;
      return [c[0] + Math.sin(th) * Math.cos(ph) * rx, c[1] + Math.sin(th) * Math.sin(ph) * ry, c[2] + Math.cos(th) * rz];
    };
    const faces = [];
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) faces.push([P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)]);
    return { col, faces, c };
  };

  // ---------- Renderer ----------
  const LIGHT = norm([-0.55, -0.2, 0.8]);
  const VIEW = [1, 1, K / ZK];
  /** Zeichnet die Körper um den Winkel yaw (Welt) gedreht; Bodenpunkt des Modells = (ox, oy), sc = Maßstab. */
  function render(ctx, solids, yaw, ox, oy, sc, shadow) {
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const rot = (p) => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs, p[2]];
    const proj = (p) => [ox + (p[0] - p[1]) * K * sc, oy + (p[0] + p[1]) * K * 0.5 * sc - p[2] * ZK * sc];
    if (shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      shadow.forEach(([x, y], i) => {
        const q = proj(rot([x + 5, y + 4, 0]));
        if (i) ctx.lineTo(...q);
        else ctx.moveTo(...q);
      });
      ctx.closePath();
      ctx.fill();
    }
    const items = solids.map((s) => {
      const c = rot(s.c);
      return { s, key: dot(c, VIEW) };
    });
    items.sort((a, b) => a.key - b.key);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.8;
    for (const { s } of items) {
      for (const f of s.faces) {
        const pts = f.map(rot);
        let nrm = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
        const fc = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
        if (dot(nrm, sub(fc, rot(s.c))) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
        if (dot(nrm, VIEW) <= 0) continue; // Rückseite
        const sh = 0.5 + 0.62 * Math.max(0, dot(nrm, LIGHT)) + (nrm[2] < -0.3 ? -0.15 : 0);
        const [r, g, b] = hex(s.col).map((v) => Math.max(0, Math.min(255, Math.round(v * sh))));
        const fill = `rgb(${r},${g},${b})`;
        ctx.globalAlpha = s.alpha ?? 1;
        ctx.fillStyle = fill;
        ctx.strokeStyle = `rgb(${Math.round(r * 0.78)},${Math.round(g * 0.78)},${Math.round(b * 0.78)})`;
        ctx.beginPath();
        pts.map(proj).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        if (s.alpha === undefined) ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  /** Weltwinkel, unter dem ein Modell im Bild nach Sektor s (0 = rechts, im Uhrzeigersinn) blickt. */
  const yawOf = (s) => {
    const phi = (s * Math.PI) / 4;
    const X = (Math.cos(phi) + 2 * Math.sin(phi)) / (2 * K);
    const Y = (2 * Math.sin(phi) - Math.cos(phi)) / (2 * K);
    return Math.atan2(Y, X);
  };

  const TEAM = {
    blue: { base: '#4f78a8', vest: '#3f74c2', dark: '#2f4d73' },
    red: { base: '#a94f48', vest: '#c2423a', dark: '#733029' },
  };
  const METAL = '#3a3e41';
  const TRACK = '#2a2c2e';

  // ---------- Kampfpanzer ----------
  function tank(team) {
    const T = TEAM[team];
    const body = mix(T.base, '#6b6f66', 0.3);
    const dark = mix(body, '#000000', 0.3);
    const light = mix(body, '#ffffff', 0.18);
    const S = [];
    for (const s of [-1, 1]) {
      const y0 = s > 0 ? 24 : -35;
      const y1 = s > 0 ? 35 : -24;
      S.push(prismXZ([[-46, 0], [46, 0], [55, 8], [46, 15], [-46, 15], [-55, 8]], y0, y1, TRACK));
      S.push(box(-38, 42, s > 0 ? 35 : -37.2, s > 0 ? 37.2 : -35, 6, 18, dark)); // Seitenschürze
      for (const x of [-47, 47]) S.push(cyl([x, s * 35.1, 7.5], [x, s * 35.6, 7.5], 7, 7, 10, '#44484b')); // Leit- und Antriebsrad
    }
    S.push(prismXZ([[-50, 10], [-50, 22], [30, 22], [53, 15], [53, 10]], -24, 24, body));
    S.push(box(-50, -26, -20, 20, 22, 24.2, dark)); // Motordeck
    S.push(prismXY([[-26, -19], [6, -19], [26, -9], [26, 9], [6, 19], [-26, 19]], 22, 33, body)); // Turm
    S.push(prismXY([[-18, -14], [4, -14], [18, -6], [18, 6], [4, 14], [-18, 14]], 33, 34.5, light)); // Dach
    S.push(box(-38, -26, -17, 17, 24, 32, dark)); // Turmheck
    S.push(box(21, 31, -8, 8, 24, 32, dark)); // Waffenblende
    S.push(cyl([26, 0, 28.5], [88, 0, 28.5], 2.8, 2.4, 8, '#2b2f31')); // Rohr
    S.push(cyl([76, 0, 28.5], [82, 0, 28.5], 3.6, 3.6, 8, '#2b2f31')); // Mündungsbremse
    S.push(cyl([-8, 10, 34.5], [-8, 10, 37.5], 4, 4, 8, METAL)); // Kommandantenluke
    S.push(box(8, 14, -11, -5, 34.5, 38, METAL)); // Richtschützenoptik
    S.push(cyl([-24, -15, 32], [-24, -15, 60], 0.7, 0.5, 4, '#15171a')); // Antenne
    S.push(box(-24.3, -23.7, -15, -9, 54, 59, T.vest)); // Teamwimpel
    for (const [x, y, w, h] of [[-12, 4, 10, 6], [-30, -8, 8, 7]]) S.push(box(x, x + w, y, y + h, 24, 24.3, mix(body, '#2e3a25', 0.35))); // Tarnflecken auf dem Deck
    return { solids: S, shadow: [[-56, -37], [56, -37], [56, 37], [-56, 37]] };
  }

  // ---------- Schützenpanzer ----------
  function ifv(team) {
    const T = TEAM[team];
    const body = mix(T.base, '#6b6f66', 0.3);
    const dark = mix(body, '#000000', 0.3);
    const S = [];
    for (const s of [-1, 1]) {
      const y0 = s > 0 ? 19 : -28;
      const y1 = s > 0 ? 28 : -19;
      S.push(prismXZ([[-34, 0], [34, 0], [41, 7], [34, 12], [-34, 12], [-41, 7]], y0, y1, TRACK));
      S.push(box(-32, 36, s > 0 ? 28 : -30, s > 0 ? 30 : -28, 5, 16, dark));
      for (const x of [-38, 38]) S.push(cyl([x, s * 28.1, 6], [x, s * 28.6, 6], 6, 6, 10, '#44484b'));
    }
    S.push(prismXZ([[-42, 8], [-42, 19], [22, 19], [44, 12], [44, 8]], -19, 19, body));
    S.push(prismXZ([[-36, 19], [-36, 22.5], [6, 22.5], [14, 19]], -15, 15, mix(body, '#ffffff', 0.08)));
    S.push(prismXY([[-12, -11], [6, -11], [15, -6], [15, 6], [6, 11], [-12, 11]], 22.5, 30, body)); // Turm
    S.push(cyl([14, 2, 26.5], [54, 2, 26.5], 2.0, 1.8, 8, '#2b2f31')); // Maschinenkanone
    S.push(box(-5, 8, 11, 16, 25, 31, dark)); // Lenkflugkörperwerfer
    S.push(box(-4, 5, -4, 4, 30, 34, METAL)); // Sensor
    S.push(cyl([-30, -13, 22.5], [-30, -13, 48], 0.7, 0.5, 4, '#15171a')); // Antenne
    S.push(box(-30.3, -29.7, -13, -7.5, 42, 47, T.vest)); // Teamwimpel
    S.push(box(-44, -42, -14, 14, 9, 19, dark)); // Heckrampe
    return { solids: S, shadow: [[-46, -30], [46, -30], [46, 30], [-46, 30]] };
  }


  // ---------- Flakpanzer, Flugabwehrrakete, Transporthubschrauber ----------
  function hullKit(team, S) {
    const T = TEAM[team];
    const body = mix(T.base, '#6b6f66', 0.3);
    const dark = mix(body, '#000000', 0.3);
    for (const s of [-1, 1]) {
      const y0 = s > 0 ? 19 : -28;
      const y1 = s > 0 ? 28 : -19;
      S.push(prismXZ([[-34, 0], [34, 0], [41, 7], [34, 12], [-34, 12], [-41, 7]], y0, y1, TRACK));
      S.push(box(-32, 36, s > 0 ? 28 : -30, s > 0 ? 30 : -28, 5, 16, dark));
      for (const x of [-38, 38]) S.push(cyl([x, s * 28.1, 6], [x, s * 28.6, 6], 6, 6, 10, '#44484b'));
    }
    S.push(prismXZ([[-42, 8], [-42, 19], [22, 19], [44, 12], [44, 8]], -19, 19, body));
    return { T, body, dark };
  }
  function flak(team) {
    const S = [];
    const { T, body, dark } = hullKit(team, S);
    S.push(prismXY([[-24, -17], [10, -17], [20, -10], [20, 10], [10, 17], [-24, 17]], 19, 36, body)); // großer Turm
    S.push(box(-20, 12, -13, 13, 36, 37.5, mix(body, '#ffffff', 0.12)));
    for (const y of [-9, 9]) {
      S.push(box(14, 24, y - 3, y + 3, 24, 32, dark)); // Rohrwiege
      S.push(cyl([20, y, 28], [62, y, 28], 2.2, 1.9, 8, '#2b2f31')); // Doppelrohr
    }
    S.push(cyl([-12, 0, 37], [-12, 0, 46], 1.6, 1.6, 6, METAL)); // Radarmast
    S.push(cyl([-12, -9, 52], [-12, 9, 52], 9, 9, 12, mix(body, '#ffffff', 0.15))); // Suchradarscheibe
    S.push(cyl([4, 0, 38], [4, 0, 41], 4, 4, 8, METAL));
    S.push(cyl([-30, -12, 19], [-30, -12, 44], 0.7, 0.5, 4, '#15171a'));
    S.push(box(-30.3, -29.7, -12, -6.5, 38, 43, T.vest));
    return { solids: S, shadow: [[-46, -30], [46, -30], [46, 30], [-46, 30]] };
  }
  function sam(team) {
    const S = [];
    const { T, body, dark } = hullKit(team, S);
    S.push(prismXY([[-14, -14], [8, -14], [14, -8], [14, 8], [8, 14], [-14, 14]], 19, 26, body)); // Drehkranz
    S.push(box(-18, 8, -12, 12, 26, 29, dark)); // Startgestell
    for (const y of [-8, 8]) {
      for (const dz of [0, 9]) {
        S.push(cyl([-20, y, 33 + dz], [24, y, 49 + dz], 4.4, 4.4, 8, '#d9dcd4')); // Rakete im Behälter
        S.push(cyl([24, y, 49 + dz], [31, y, 52 + dz], 4.4, 1.2, 8, '#a8432f')); // Spitze
      }
    }
    S.push(box(-14, 6, -11, 11, 29, 33, dark));
    S.push(box(2, 10, -5, 5, 22, 30, METAL)); // Radar vorn
    S.push(cyl([-32, -12, 19], [-32, -12, 44], 0.7, 0.5, 4, '#15171a'));
    S.push(box(-32.3, -31.7, -12, -6.5, 38, 43, T.vest));
    return { solids: S, shadow: [[-46, -30], [46, -30], [46, 30], [-46, 30]] };
  }
  function chinook(team) {
    const T = TEAM[team];
    const body = mix(T.base, '#6b6f66', 0.25);
    const dark = mix(body, '#000000', 0.3);
    const S = [];
    for (const s of [-1, 1]) {
      S.push(cyl([-30, s * 9, 6], [30, s * 9, 6], 1.4, 1.4, 6, METAL)); // Kufen
      for (const x of [-22, 22]) S.push(cyl([x, s * 9, 6], [x, s * 9, 15], 1, 1, 5, METAL));
      S.push(box(-30, 30, s * 9 - 0.7, s * 9 + 0.7, 5.5, 6.5, METAL));
    }
    S.push(prismXZ([[-46, 16], [-46, 30], [-30, 34], [22, 34], [38, 31], [46, 24], [46, 16], [30, 14], [-30, 14]], -12, 12, body)); // Rumpf
    S.push(prismXZ([[34, 21], [34, 30], [44, 26], [44, 21]], -11, 11, mix('#1c2830', body, 0.1))); // Cockpitscheiben
    S.push(box(-47, -44, -10, 10, 15, 28, dark)); // Heckrampe
    for (const x of [-30, -16, -2, 12]) S.push(box(x, x + 6, 12, 12.4, 22, 28, '#25323d')); // Fenster
    S.push(box(-40, -26, -4, 4, 34, 52, mix(body, '#000000', 0.12))); // Heckpylon
    S.push(cyl([30, 0, 34], [30, 0, 42], 3, 3, 8, METAL)); // Mast vorn
    S.push(cyl([-33, 0, 52], [-33, 0, 55], 3, 3, 8, METAL)); // Mast hinten
    for (const [x, z] of [[30, 43], [-33, 56]]) {
      const d = cyl([x, 0, z], [x, 0, z + 0.6], 38, 38, 20, '#c9ced0');
      d.alpha = 0.22;
      S.push(d);
      for (const a of [0.4, 2.1, 3.6]) S.push(cyl([x, 0, z + 0.3], [x + Math.cos(a) * 38, Math.sin(a) * 38, z + 0.3], 0.9, 0.9, 4, '#2b2d2f')); // Blattschatten
    }
    S.push(box(-1, 1, -11.5, -6, 35, 41, T.vest));
    return { solids: S, shadow: null };
  }

  // ---------- Soldaten ----------
  const SKIN = '#d9ae8a';
  const OLIVE = '#5b6b45';
  function soldier(type, team) {
    const T = TEAM[team];
    const S = [];
    const sniper = type === 'sniper';
    const trousers = mix(OLIVE, '#2e3624', 0.25);
    for (const s of [-1, 1]) {
      S.push(cyl([0, s * 5.5, 5], [0, s * 5.5, 40], 5, 5.6, 7, trousers)); // Bein
      S.push(box(-4, 8, s * 5.5 - 4.5, s * 5.5 + 4.5, 0, 6, '#2b2a27')); // Stiefel
    }
    S.push(box(-8, 8, -13, 13, 38, 70, OLIVE)); // Oberkörper
    S.push(box(-9, 9.5, -12, 12, 44, 66, T.vest)); // Weste in Teamfarbe
    S.push(box(-7.5, 7.5, -12.5, 12.5, 38, 42, '#3a3626')); // Gürtel
    S.push(cyl([0, 0, 68], [0, 0, 72], 5, 5, 8, SKIN)); // Hals
    S.push(sphere([1, 0, 80], 8, 8, 9, SKIN, 9, 6)); // Kopf
    S.push(sphere([0, 0, 83], 10.2, 10.2, 8.8, type === 'at' ? '#5e6e48' : '#566340', 9, 6)); // Helm
    const hand = type === 'at' ? [8, 9, 62] : [16, 5, 53];
    const hand2 = type === 'at' ? [14, -4, 66] : [25, -5, 55];
    S.push(cyl([0, 14, 65], hand, 3.6, 3.2, 6, OLIVE)); // Arm rechts (Bildseite)
    S.push(cyl([0, -14, 65], hand2, 3.6, 3.2, 6, OLIVE)); // Arm links
    if (type === 'at') {
      S.push(cyl([-26, 10, 70], [26, 10, 72], 4.6, 4.6, 8, '#4a5640')); // Rohr
      S.push(cyl([-26, 10, 70], [-31, 10, 70.2], 5.8, 5.2, 8, '#30382b')); // Heckdüse
      S.push(cyl([26, 10, 72], [34, 10, 72.3], 3, 6.4, 8, '#8c4a35')); // Rakete
      S.push(cyl([34, 10, 72.3], [40, 10, 72.4], 6.4, 2, 8, '#6a3a2a'));
    } else if (!sniper) {
      S.push(box(6, 36, -1.6, 1.6, 52, 56, '#2f3032')); // Gewehr
      S.push(box(12, 14, -1.2, 1.2, 46, 52, '#26272a')); // Magazin
      S.push(cyl([36, 0, 54], [46, 0, 54], 1, 1, 6, '#1d1e20')); // Lauf
    }
    if (sniper) {
      // Tarnanzug aus Büscheln, zufällig fest
      const r = rng(team === 'blue' ? 31 : 37);
      const greens = ['#4f6b34', '#5d7a3a', '#3f5a2c', '#6b6a36', '#7a6a3a', '#35502a'];
      const put = (cx, cy, cz, spread, n, size) => {
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * spread;
          const rr = size * (0.7 + r() * 0.6);
          S.push(sphere([cx + Math.cos(a) * d, cy + Math.sin(a) * d, cz + (r() - 0.5) * size], rr, rr, rr * 0.85, greens[Math.floor(r() * greens.length)], 6, 4));
        }
      };
      put(0, 0, 55, 10, 14, 7); // Rumpf
      put(0, 0, 82, 5, 7, 6.5); // Kapuze
      put(0, 13, 62, 3, 4, 5); // Schultern
      put(0, -13, 62, 3, 4, 5);
      put(0, 5.5, 22, 4, 5, 6); // Beine
      put(0, -5.5, 22, 4, 5, 6);
      S.push(cyl([4, 0, 54], [58, 0, 56], 1.9, 1.4, 8, '#2a2b2b')); // langes Gewehr
      S.push(cyl([22, 0, 59], [34, 0, 59.4], 2.6, 2.6, 8, '#1d1e20')); // Zielfernrohr
    }
    return { solids: S, shadow: [[-12, -14], [12, -14], [12, 14], [-12, 14]] };
  }

  // ---------- Ausgabe ----------
  const res = {};
  const draw = (key, W, H, ox, oy, sc, model, yaw) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    render(ctx, model.solids, yaw, ox, oy, sc, model.shadow);
    res[key] = c.toDataURL('image/png');
  };
  for (const team of ['blue', 'red']) {
    const t = tank(team);
    const f = ifv(team);
    const fl = flak(team);
    const sm = sam(team);
    const ch = chinook(team);
    const rf = { rifleman: soldier('rifleman', team), at: soldier('at', team), sniper: soldier('sniper', team) };
    SECT.forEach((sec, s) => {
      const yaw = yawOf(s);
      draw(`vehicles/tank-${team}-${sec}.png`, 144, 120, 72, 82, 0.86, t, yaw);
      draw(`vehicles/ifv-${team}-${sec}.png`, 144, 120, 72, 82, 0.95, f, yaw);
      draw(`vehicles/flak-${team}-${sec}.png`, 144, 120, 72, 86, 0.92, fl, yaw);
      draw(`vehicles/sam-${team}-${sec}.png`, 144, 120, 72, 86, 0.92, sm, yaw);
      draw(`vehicles/transporter-${team}-${sec}.png`, 144, 120, 72, 90, 0.9, ch, yaw);
      for (const type of ['rifleman', 'at', 'sniper']) draw(`units/${type}-${team}-${sec}.png`, 80, 112, 40, 100, 0.95, rf[type], yaw);
    });
  }
  return res;
});
for (const [file, url] of Object.entries(out)) {
  mkdirSync(`${ROOT}${file.split('/')[0]}`, { recursive: true });
  writeFileSync(`${ROOT}${file}`, Buffer.from(url.split(',')[1], 'base64'));
}
await page.context().browser().close();

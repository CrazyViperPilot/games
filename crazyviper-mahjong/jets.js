// Kampfjet-Kacheln: 36 Typen, Draufsicht-Silhouette aus wenigen Formparametern.
// Koordinaten: Jet 100 Einheiten lang (Nase y=0), mittig bei x=0.
const JET_BASE = {
  swept:    { fw: 5, wy: 42, wr: 30, ws: 34, wsw: 22, wt: 10, ty: 80, tr: 14, ts: 18, tsw: 8, tt: 6, cn: 0, cy: 28, fins: 1, eng: 1 },
  delta:    { fw: 5, wy: 46, wr: 50, ws: 36, wsw: 40, wt: 6, ty: 0, tr: 0, ts: 0, tsw: 0, tt: 0, cn: 0, cy: 28, fins: 1, eng: 1 },
  swing:    { fw: 6, wy: 44, wr: 26, ws: 42, wsw: 6, wt: 14, ty: 80, tr: 16, ts: 20, tsw: 8, tt: 7, cn: 0, cy: 28, fins: 1, eng: 2 },
  straight: { fw: 5, wy: 38, wr: 22, ws: 46, wsw: 0, wt: 20, ty: 78, tr: 12, ts: 20, tsw: 2, tt: 10, cn: 0, cy: 28, fins: 2, eng: 2 },
  sabre:    { fw: 4.5, wy: 40, wr: 28, ws: 38, wsw: 30, wt: 10, ty: 80, tr: 14, ts: 16, tsw: 10, tt: 6, cn: 0, cy: 28, fins: 1, eng: 1 },
  stealth:  { fw: 7, wy: 28, wr: 62, ws: 42, wsw: 54, wt: 10, ty: 0, tr: 0, ts: 0, tsw: 0, tt: 0, cn: 0, cy: 28, fins: 0, eng: 2 },
};
// [Beschriftung, Farbe, Grundform, Abweichungen]
const US = '#2b5aa8', RU = '#b8382c', EU = '#2e8a52', FR = '#1b8fa3', SE = '#d98a00', CN = '#8e2f66', AS = '#6a4fb0', GB = '#55616e';
const JET_DEFS = [
  ['Typhoon', EU, 'delta', { cn: 18, cy: 26, eng: 2, wy: 50, wr: 44, fw: 5.5 }],
  ['F-16', US, 'swept', { ws: 30, wy: 46, wr: 28, ty: 82, ts: 20 }],
  ['F/A-18', US, 'swept', { fins: 2, eng: 2, ws: 36, wy: 44, fw: 6, wsw: 14 }],
  ['F-22', US, 'swept', { fins: 2, eng: 2, ws: 32, wsw: 26, wr: 38, wy: 40, ty: 78, tr: 18, ts: 22, fw: 6.5 }],
  ['F-35', US, 'swept', { ws: 36, wsw: 16, wr: 34, wt: 12, wy: 42, fins: 2, fw: 7.5, ts: 20 }],
  ['F-15', US, 'swept', { fins: 2, eng: 2, ws: 40, wsw: 16, wr: 36, wy: 44, fw: 6.5, ts: 22, tr: 18 }],
  ['F-14', US, 'swing', { fins: 2, ws: 44, wsw: 4, wr: 30, wy: 40, fw: 7 }],
  ['F-4', US, 'swept', { fins: 1, eng: 2, ws: 36, wsw: 22, wr: 38, wy: 40, fw: 6.5, ty: 78, ts: 22, tr: 18 }],
  ['F-117', US, 'stealth', {}],
  ['A-10', US, 'straight', { ws: 48, wy: 44, wr: 24, wt: 22, fins: 2, fw: 4.5, ty: 82, tr: 12, ts: 18 }],
  ['Tornado', EU, 'swing', { ws: 38, wy: 46, wsw: 14, wr: 28, fw: 6 }],
  ['Rafale', FR, 'delta', { cn: 15, cy: 30, fins: 1, eng: 2, wy: 52, wr: 38, ws: 33 }],
  ['Gripen', SE, 'delta', { cn: 14, cy: 30, ws: 28, wy: 52, wr: 38, wsw: 32, fw: 4.5 }],
  ['M-2000', FR, 'delta', { ws: 38, wsw: 36, wy: 44, wr: 52, wt: 4 }],
  ['MiG-29', RU, 'swept', { fins: 2, eng: 2, ws: 33, wsw: 14, wr: 36, wy: 44, fw: 6.5, tr: 20, ts: 20 }],
  ['MiG-21', RU, 'delta', { ws: 26, wsw: 38, wy: 42, wr: 50, wt: 4, fw: 4 }],
  ['Su-27', RU, 'swept', { fins: 2, eng: 2, ws: 34, wsw: 22, wr: 40, wy: 38, fw: 6.5, ty: 74, ts: 20, tr: 20 }],
  ['Su-57', RU, 'swept', { fins: 2, eng: 2, ws: 33, wsw: 28, wr: 44, wy: 36, fw: 7, cn: 10, cy: 24, ts: 24, ty: 76 }],
  ['J-20', CN, 'swept', { cn: 18, cy: 28, ws: 36, wsw: 28, wr: 46, wy: 44, fins: 2, eng: 2, fw: 6, ty: 82, ts: 12 }],
  ['J-10', CN, 'delta', { cn: 16, cy: 30, ws: 30, wsw: 34, wy: 52, wr: 40, fw: 5 }],
  ['KF-21', AS, 'swept', { fins: 2, eng: 2, ws: 30, wsw: 20, wr: 36, wy: 44, fw: 6, cn: 0 }],
  ['Tejas', AS, 'delta', { ws: 28, wsw: 30, wy: 50, wr: 42, wt: 6, fw: 4.5 }],
  ['F-5', US, 'straight', { ws: 28, wsw: 8, wy: 46, wr: 24, wt: 10, fins: 1, eng: 2, fw: 4.5, ty: 78, ts: 16 }],
  ['F-104', US, 'straight', { ws: 18, wy: 50, wr: 20, wt: 12, ty: 84, ts: 22, fins: 1, eng: 1, fw: 4 }],
  ['Harrier', GB, 'straight', { ws: 34, wsw: 12, wy: 44, wr: 28, wt: 10, fins: 1, eng: 2, fw: 6, ty: 82, ts: 18 }],
  ['Su-25', RU, 'straight', { ws: 46, wy: 40, wr: 26, wt: 18, fins: 1, eng: 2, fw: 5, ty: 80 }],
  ['MiG-15', RU, 'sabre', { ws: 36, wy: 42, wsw: 28 }],
  ['F-86', US, 'sabre', { ws: 38, wsw: 24, wy: 38, ty: 82 }],
  ['Viggen', SE, 'delta', { cn: 18, cy: 30, ws: 28, wsw: 24, wy: 56, wr: 30, wt: 8, fw: 5 }],
  ['Draken', SE, 'delta', { ws: 32, wsw: 44, wy: 46, wr: 54, wt: 3, fw: 4 }],
  ['MiG-25', RU, 'swept', { fins: 2, eng: 2, ws: 38, wsw: 10, wr: 40, wy: 44, wt: 18, fw: 7, ty: 74, ts: 20 }],
  ['Su-24', RU, 'swing', { ws: 40, wsw: 18, wr: 32, wy: 44, fw: 6.5 }],
  ['F-111', US, 'swing', { ws: 46, wsw: 10, wr: 34, wy: 38, fw: 7 }],
  ['MiG-23', RU, 'swing', { ws: 36, wsw: 22, wr: 38, wy: 46, fw: 6 }],
  ['Lightning', GB, 'swept', { eng: 2, ws: 32, wsw: 32, wr: 38, wy: 42, fw: 6, ty: 82, ts: 14 }],
  ['Jaguar', GB, 'swept', { eng: 2, ws: 34, wsw: 10, wr: 24, wy: 46, wt: 12, fins: 1, fw: 5, ty: 80 }],
].map((d, i) => ({ id: i, label: d[0], color: d[1], p: Object.assign({}, JET_BASE[d[2]], d[3]) }));

function drawJet(ctx, jet, cx, cy, size) {
  const p = jet.p, s = size / 100;
  const X = (x) => cx + x * s, Y = (y) => cy - size / 2 + y * s;
  const col = jet.color, dark = shade(col, -45), light = shade(col, 35);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, s * 2.2);
  ctx.strokeStyle = dark;
  const poly = (pts, fill) => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1]))));
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  };
  const plane = (y, root, half, sweep, tip, fill) => {
    if (!half) return;
    const f = p.fw * 0.8;
    [-1, 1].forEach((m) => poly([[m * f, y], [m * half, y + sweep], [m * half, y + sweep + tip], [m * f, y + root]], fill));
  };
  plane(p.cy, 10, p.cn, 8, 4, light);                        // Canard
  plane(p.wy, p.wr, p.ws, p.wsw, p.wt, light);               // Tragflächen
  plane(p.ty, p.tr, p.ts, p.tsw, p.tt, light);               // Höhenleitwerk
  // Rumpf
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  ctx.quadraticCurveTo(X(p.fw * 0.9), Y(14), X(p.fw), Y(34));
  ctx.lineTo(X(p.fw * 0.85), Y(98));
  ctx.lineTo(X(-p.fw * 0.85), Y(98));
  ctx.lineTo(X(-p.fw), Y(34));
  ctx.quadraticCurveTo(X(-p.fw * 0.9), Y(14), X(0), Y(0));
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.stroke();
  // Seitenleitwerke
  if (p.fins === 1) poly([[-1.4, 72], [1.4, 72], [1.4, 94], [-1.4, 94]], dark);
  if (p.fins === 2) [-1, 1].forEach((m) => poly([[m * p.fw * 0.8 - 1.3, 72], [m * p.fw * 0.8 + 1.3, 72], [m * p.fw * 0.8 + 1.3, 94], [m * p.fw * 0.8 - 1.3, 94]], dark));
  // Düsen
  ctx.fillStyle = '#ffb44a';
  const n = p.eng === 2 ? [-p.fw * 0.42, p.fw * 0.42] : [0];
  n.forEach((x) => { ctx.beginPath(); ctx.ellipse(X(x), Y(99), Math.max(1, s * 2.2), Math.max(1, s * 2.6), 0, 0, 7); ctx.fill(); });
  // Kanzel
  ctx.fillStyle = '#bfe6ff';
  ctx.beginPath(); ctx.ellipse(X(0), Y(24), s * 2.6, s * 7, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return 'rgb(' + c(n >> 16) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
}

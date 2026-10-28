// Bosse und Kristalle (PRD §9, PLAN §7). Zeichenraster entstehen im Code aus einfachen Formen; '.' = transparent.
// Export: BOSS_ART = { name: { pal, frames: [Zeichenraster, ...] } }. Kontur dunkel (Zeichen k).

// ---------- Hilfsfunktionen ----------
const grid = (w, h, f) => {
  const out = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += f(x, y) || '.';
    out.push(s);
  }
  return out;
};
// Außenkontur: jedes Pixel mit transparentem Nachbarn (Bildrand zählt als transparent) wird zu ch.
function outline(g, ch = 'k') {
  const h = g.length, w = g[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : g[y][x]);
  return g.map((row, y) => row.split('').map((p, x) => {
    if (p === '.') return '.';
    const edge = at(x - 1, y) === '.' || at(x + 1, y) === '.' || at(x, y - 1) === '.' || at(x, y + 1) === '.';
    return edge ? ch : p;
  }).join(''));
}
// Zeichen überlagern: f(x, y) liefert ein Zeichen oder null (dann bleibt das Pixel).
const overlay = (g, f) => g.map((row, y) => row.split('').map((p, x) => f(x, y) || p).join(''));
const inEll = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const superEll = (x, y, cx, cy, rx, ry, n) => Math.abs((x + 0.5 - cx) / rx) ** n + Math.abs((y + 0.5 - cy) / ry) ** n <= 1;
// Punkt-in-Polygon (Strahlverfahren), geprüft wird die Pixelmitte; pts = [[x, y], ...]
function inPoly(x, y, pts) {
  const px = x + 0.5, py = y + 0.5;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Pixelmitte nahe einer Strecke a-b (Radius r)
function nearSeg(x, y, a, b, r) {
  const px = x + 0.5, py = y + 0.5;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  const qx = a[0] + t * dx - px, qy = a[1] + t * dy - py;
  return qx * qx + qy * qy <= r * r;
}

// ---------- Riesenschleim (48×48 und 32×32) ----------
const PAL_SLIME = {
  k: '#16471f', g: '#5fe06ab3', c: '#2f9e44cc', h: '#dfffdcea', e: '#0e1f10', w: '#ffffff',
};
function slimeFrame(S, squash) {
  const cx = S / 2;
  const rx = squash ? S * 0.47 : S * 0.43;
  const ry = squash ? S * 0.30 : S * 0.40;
  const cy = squash ? S * 0.62 : S * 0.52;
  const body = grid(S, S, (x, y) => (superEll(x, y, cx, cy, rx, ry, 4) ? 'g' : null));
  const g = outline(body, 'k').map((row, y) => row.split('').map((p, x) => {
    if (p !== 'g') return p;
    if (superEll(x, y, cx, cy + S * 0.05, rx * 0.56, ry * 0.52, 4)) return 'c';   // dichterer Kern
    if (superEll(x, y, cx - rx * 0.5, cy - ry * 0.5, rx * 0.2, ry * 0.2, 2)) return 'h'; // Glanz
    return p;
  }).join(''));
  const ew = Math.max(2, Math.round(S / 14)), eh = Math.max(3, Math.round(S / 11));
  const ey = Math.round(cy - S * 0.07);
  const eyeL = Math.round(cx - S * 0.2 - ew / 2), eyeR = Math.round(cx + S * 0.2 - ew / 2);
  const mouthY = Math.round(cy + S * 0.14);
  return overlay(g, (x, y) => {
    for (const ex of [eyeL, eyeR]) {
      if (inRect(x, y, ex, ey, ex + ew - 1, ey + eh - 1)) return x === ex && y === ey ? 'w' : 'e';
    }
    if (y === mouthY && x >= cx - S * 0.1 && x < cx + S * 0.1) return 'e';
    return null;
  });
}

// ---------- Dreikopf (48×40) ----------
const PAL_BONE = {
  k: '#0b0a10', K: '#1d1a26', L: '#3f3858', p: '#c77dff', b: '#d9d0b5', B: '#8f8673', v: '#5b2a86c8', V: '#2f1550d8',
};
function dreikopfFrame(f) {
  const skulls = [[11, 13], [24, 9], [37, 13]];
  const hem = (x) => 34 + ((x * 7 + f * 3) % 5);           // unterer Saum des Umhangs, je Frame anders
  const skull = (x, y, cx, cy) => {
    if (!(inEll(x, y, cx, cy, 6, 6) || inRect(x, y, cx - 4, cy + 3, cx + 4, cy + 6))) return null;
    if (inRect(x, y, cx - 3, cy - 1, cx - 2, cy) || inRect(x, y, cx + 2, cy - 1, cx + 3, cy)) return 'p';
    if (y === cy + 5 && Math.abs(x - cx) <= 3 && (x - cx) % 2 === 0) return 'b';   // Zähne
    if (inEll(x, y, cx - 1.5, cy - 2.5, 3, 2.5)) return 'L';                      // Glanz
    return 'K';
  };
  const rib = (x, y) => {
    if (y < 18 || y > 34) return null;
    const d = Math.abs(x + 0.5 - 24);
    if (d > 12 - (y - 18) * 0.2) return null;
    if (d < 1.2) return 'b';                                  // Wirbelsäule
    // Rippen sind Bögen: an den Seiten tiefer als in der Mitte
    const r = (y - 18 - Math.floor((d / 12) ** 2 * 4)) % 4;
    return r >= 0 && r < 2 ? (r === 1 ? 'B' : 'b') : null;
  };
  const cloak = (x, y) => {
    if (y < 26) return null;
    if (Math.abs(x + 0.5 - 24) > 13 - (y - 26) * 0.35) return null;
    if (y > hem(x)) return null;
    return (x + y + f) % 3 === 0 ? 'V' : 'v';
  };
  const g = grid(48, 40, (x, y) => {
    for (const [cx, cy] of skulls) {
      const s = skull(x, y, cx, cy);
      if (s) return s;
    }
    return rib(x, y) || cloak(x, y);
  });
  return outline(g, 'k');
}

// ---------- Drache (64×32, Flügelschlag, Blick nach rechts) ----------
const PAL_DRAGON = {
  k: '#0a0610', b: '#2b1640', B: '#1a0d2b', p: '#5a2d7d', m: '#4b1f6e', r: '#140a20', w: '#e8e0c8', e: '#c77dff', E: '#f3d9ff',
};
function dragonFrame(f) {
  const wing = f === 0
    ? { m: [[33, 14], [21, 1], [14, 4], [19, 10], [26, 12], [30, 17]],
      b: [[[33, 14], [21, 1]], [[33, 14], [14, 4]], [[33, 14], [19, 10]]] }
    : { m: [[33, 14], [29, 25], [21, 29], [12, 25], [18, 18], [26, 16]],
      b: [[[33, 14], [29, 25]], [[33, 14], [12, 25]], [[33, 14], [18, 18]]] };
  const tail = [[18, 16], [17, 23], [8, 28], [2, 27], [8, 24], [15, 21], [18, 20]];
  const horn = [[46, 7], [42, 1], [49, 6]];
  const snout = [[54, 7], [63, 9], [63, 12], [54, 13]];
  const jaw = [[52, 12], [61, 12], [58, 14], [51, 13]];
  const spikes = [20, 24, 28, 32, 36, 40].map((sx) => [[sx, 13], [sx + 1.5, 8.5], [sx + 3, 13]]);
  const g = grid(64, 32, (x, y) => {
    if (inRect(x, y, 48, 9, 49, 10)) return x === 48 && y === 9 ? 'E' : 'e';
    if (inPoly(x, y, horn)) return 'w';
    if (inEll(x, y, 51, 10, 6, 4.5) || inEll(x, y, 43, 13, 5, 4.5) || inPoly(x, y, snout) || inPoly(x, y, jaw)) {
      return y >= 13 ? 'p' : 'b';
    }
    if (spikes.some((s) => inPoly(x, y, s))) return 'r';
    if (inEll(x, y, 30, 19, 13, 6.5)) return y >= 20 ? 'p' : 'b';
    if (inRect(x, y, 36, 21, 39, 28) || inRect(x, y, 36, 28, 41, 29)) return 'B';   // Vorderbein, Fuß
    if (inRect(x, y, 22, 21, 25, 28) || inRect(x, y, 20, 28, 25, 29)) return 'B';   // Hinterbein, Fuß
    if (inPoly(x, y, tail)) return 'B';
    if (wing.b.some(([a, b]) => nearSeg(x, y, a, b, 0.6))) return 'r';
    if (inPoly(x, y, wing.m)) return 'm';
    return null;
  });
  return outline(g, 'k');
}

// ---------- Sitzender Drache (48×40) ----------
function dragonPerchFrame() {
  const folded = [[18, 17], [8, 6], [11, 12], [7, 19], [14, 26], [20, 26]];
  const tail = [[16, 34], [9, 36], [4, 38], [2, 36], [8, 33], [14, 31]];
  const horn = [[28, 5], [25, 0], [31, 4]];
  const snout = [[35, 6], [43, 8], [43, 10], [35, 11]];
  const g = grid(48, 40, (x, y) => {
    if (inRect(x, y, 33, 7, 34, 8)) return x === 33 && y === 7 ? 'E' : 'e';
    if (inPoly(x, y, horn)) return 'w';
    if (inEll(x, y, 31, 9, 6, 4.5) || inEll(x, y, 27, 15, 4.5, 5) || inPoly(x, y, snout)) return 'b';
    if (inEll(x, y, 24, 26, 4.5, 8)) return 'p';
    if (inEll(x, y, 22, 24, 9, 11)) return 'b';
    if (inEll(x, y, 20, 31, 8, 6) || inRect(x, y, 24, 33, 27, 36) || inRect(x, y, 23, 36, 30, 37)) return 'B';
    if (inRect(x, y, 14, 35, 20, 36)) return 'B';                                  // Hinterfuß
    if (inPoly(x, y, tail)) return 'B';
    if (nearSeg(x, y, [18, 17], [8, 6], 0.6) || nearSeg(x, y, [18, 17], [7, 19], 0.6)) return 'r';
    if (inPoly(x, y, folded)) return 'm';
    return null;
  });
  return outline(g, 'k');
}

// ---------- Kristall im Käfig (12×18, glimmt) ----------
const PAL_CRYSTAL = { k: '#0a0610', c: '#ff7ad9', d: '#9b4dff', h: '#ffd6f5', W: '#ffffff', g: '#8d93a3', G: '#c3c9d6' };
function crystalFrame(f) {
  const crystal = outline(grid(12, 18, (x, y) => {
    const dx = Math.abs(x + 0.5 - 6) / 3.6, dy = Math.abs(y + 0.5 - 9) / 6.2;
    if (dx + dy > 1) return null;
    if (f === 0 ? (x <= 4 && y >= 4 && y <= 8) : (x <= 3 && y >= 7 && y <= 11)) return 'h';
    return x + 0.5 < 6 ? 'c' : 'd';
  }), 'k');
  return overlay(crystal, (x, y) => {
    if (f === 0 && x === 8 && y === 4) return 'W';        // Glimmer
    if (f === 1 && x === 7 && y === 13) return 'W';
    // Käfig hinter dem Kristall: Rahmen aus Stäben
    if (x === 0 || x === 11 || y === 0 || y === 17) return x === 0 || y === 0 ? 'G' : 'g';
    return null;
  });
}


// ---------- Riesenschildkröte (52×32) ----------
const PAL_TURTLE = {
  k: '#0f2411', g: '#1f5424', G: '#2e7a35', h: '#4aa653',
  y: '#d4a233', s: '#3ea853', e: '#0a170c', w: '#ffffff', p: '#143818',
};

function turtleFrame(walk) {
  const g = grid(52, 32, (x, y) => {
    // Kopf vorn rechts (cols 38..48, rows 10..22)
    if (inEll(x, y, 43, 16, 7, 5)) {
      if (inRect(x, y, 44, 13, 46, 15)) return x === 45 && y === 14 ? 'w' : 'e'; // Auge
      return 's';
    }
    // Beine unten (vorn und hinten)
    const legOff = walk ? 2 : -2;
    if (inRect(x, y, 14 + legOff, 23, 20 + legOff, 30) || inRect(x, y, 32 - legOff, 23, 38 - legOff, 30)) {
      return 's';
    }
    // Bauch / Gelber Rand (rows 22..24)
    if (inEll(x, y, 26, 22, 19, 4)) return 'y';
    // Panzer (Kuppel rows 4..22, cols 8..44)
    if (inEll(x, y, 26, 15, 18, 11)) {
      // Panzer-Schuppen (Muster)
      if (inEll(x, y, 26, 11, 6, 4) || inEll(x, y, 16, 15, 4, 4) || inEll(x, y, 35, 15, 4, 4)) return 'p';
      if (inEll(x, y, 26, 7, 12, 4)) return 'h'; // Glanz oben
      return inEll(x, y, 26, 15, 14, 8) ? 'G' : 'g';
    }
    return null;
  });
  return outline(g, 'k');
}

function turtleShellFrame(spin) {
  const g = grid(52, 32, (x, y) => {
    // Bauch / Gelber Rand
    if (inEll(x, y, 26, 23, 20, 5)) return 'y';
    // Geschlossener Panzer
    if (inEll(x, y, 26, 16, 21, 12)) {
      const off = spin ? 3 : -3;
      if (inEll(x, y, 26 + off, 12, 6, 4) || inEll(x, y, 15 + off, 16, 5, 4) || inEll(x, y, 36 + off, 16, 5, 4)) return 'p';
      if (inEll(x, y, 26, 8, 14, 4)) return 'h';
      return inEll(x, y, 26, 16, 16, 9) ? 'G' : 'g';
    }
    return null;
  });
  return outline(g, 'k');
}

// ---------- Eisengolem (40×48) ----------
const PAL_GOLEM = {
  k: '#1a1a20', b: '#dcd8cf', B: '#aba79e', d: '#747068',
  v: '#4b7d42', r: '#d32f2f', w: '#ffffff', n: '#ba9a76',
};

function golemFrame(walk) {
  const g = grid(40, 48, (x, y) => {
    // Kopf cols 14..25, rows 4..13
    if (inRect(x, y, 14, 4, 25, 13)) {
      if (y === 8 && (x === 17 || x === 22)) return 'r';
      if (inRect(x, y, 19, 8, 20, 12)) return 'n';
      if (y >= 12) return 'B';
      return 'b';
    }
    // Rumpf/Brust cols 11..28, rows 14..29
    if (inRect(x, y, 11, 14, 28, 29)) {
      if (x < 13 || x > 26 || y > 27) return 'B';
      if (inRect(x, y, 13, 17, 16, 22)) return 'v';
      return 'b';
    }
    // Arme
    const armOff = walk ? 2 : -2;
    if (inRect(x, y, 5, 15 - armOff, 10, 35 - armOff)) {
      if (y > 32 - armOff) return 'd';
      return 'B';
    }
    if (inRect(x, y, 29, 15 + armOff, 34, 35 + armOff)) {
      if (y > 32 + armOff) return 'd';
      return 'B';
    }
    // Beine cols 13..18 und 21..26, rows 30..45
    const legOff = walk ? 2 : -2;
    if (inRect(x, y, 13, 30 + legOff, 18, 45 + legOff) || inRect(x, y, 21, 30 - legOff, 26, 45 - legOff)) {
      if (y > 42) return 'd';
      return 'b';
    }
    return null;
  });
  return outline(g, 'k');
}

export const BOSS_ART = {
  boss_slime_l: { pal: PAL_SLIME, frames: [slimeFrame(48, false), slimeFrame(48, true)] },
  boss_slime_m: { pal: PAL_SLIME, frames: [slimeFrame(32, false), slimeFrame(32, true)] },
  boss_dreikopf: { pal: PAL_BONE, frames: [dreikopfFrame(0), dreikopfFrame(1)] },
  boss_drache: { pal: PAL_DRAGON, frames: [dragonFrame(0), dragonFrame(1)] },
  boss_drache_perch: { pal: PAL_DRAGON, frames: [dragonPerchFrame()] },
  boss_schildkroete: { pal: PAL_TURTLE, frames: [turtleFrame(false), turtleFrame(true)] },
  boss_schildkroete_shell: { pal: PAL_TURTLE, frames: [turtleShellFrame(false), turtleShellFrame(true)] },
  boss_eisengolem: { pal: PAL_GOLEM, frames: [golemFrame(false), golemFrame(true)] },
  crystal: { pal: PAL_CRYSTAL, frames: [crystalFrame(0), crystalFrame(1)] },
};

// Catsweeper – Spiellogik (ohne DOM, per Node testbar).
(function (root) {
  const LEVELS = {
    easy:   { name: 'Leicht', cols: 12, rows: 7,  cats: 10 },
    medium: { name: 'Mittel', cols: 18, rows: 9,  cats: 28 },
    hard:   { name: 'Schwer', cols: 24, rows: 11, cats: 60 },
  };

  function neighbors(g, i) {
    const x = i % g.cols, y = (i / g.cols) | 0, out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < g.cols && ny < g.rows) out.push(ny * g.cols + nx);
    }
    return out;
  }

  function newGame(level) {
    const L = LEVELS[level], n = L.cols * L.rows;
    return {
      level, cols: L.cols, rows: L.rows, catCount: L.cats,
      cat: new Array(n).fill(0), count: new Array(n).fill(0),
      open: new Array(n).fill(0), flag: new Array(n).fill(0),
      placed: false, state: 'play', hit: -1, time: 0, moves: 0,
    };
  }

  // Katzen werden erst beim ersten Aufdecken verteilt: erste Zelle samt Nachbarn bleibt katzenfrei.
  function place(g, safe, rnd) {
    rnd = rnd || Math.random;
    const banned = new Set([safe, ...neighbors(g, safe)]);
    const pool = [];
    for (let i = 0; i < g.cat.length; i++) if (!banned.has(i)) pool.push(i);
    for (let k = pool.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; [pool[k], pool[j]] = [pool[j], pool[k]]; }
    pool.slice(0, g.catCount).forEach((i) => { g.cat[i] = 1; });
    for (let i = 0; i < g.cat.length; i++) g.count[i] = neighbors(g, i).reduce((s, n) => s + g.cat[n], 0);
    g.placed = true;
  }

  function reveal(g, i, rnd) {
    if (g.state !== 'play' || g.open[i] || g.flag[i]) return;
    if (!g.placed) place(g, i, rnd);
    g.moves++;
    if (g.cat[i]) { g.state = 'lost'; g.hit = i; return; }
    const stack = [i];
    while (stack.length) {
      const c = stack.pop();
      if (g.open[c] || g.flag[c]) continue;
      g.open[c] = 1;
      if (g.count[c] === 0) neighbors(g, c).forEach((n) => { if (!g.open[n]) stack.push(n); });
    }
    checkWin(g);
  }

  // Tipp auf eine Zahl: stimmen die Flaggen ringsum mit der Zahl überein, werden die übrigen Nachbarn aufgedeckt.
  function chord(g, i, rnd) {
    if (g.state !== 'play' || !g.open[i] || !g.count[i]) return;
    const nb = neighbors(g, i);
    if (nb.filter((n) => g.flag[n]).length !== g.count[i]) return;
    for (const n of nb) { if (!g.open[n] && !g.flag[n]) { reveal(g, n, rnd); if (g.state !== 'play') return; } }
  }

  function toggleFlag(g, i) {
    if (g.state !== 'play' || g.open[i]) return;
    g.flag[i] = g.flag[i] ? 0 : 1;
  }

  function checkWin(g) {
    for (let i = 0; i < g.cat.length; i++) if (!g.cat[i] && !g.open[i]) return;
    g.state = 'won';
    for (let i = 0; i < g.cat.length; i++) if (g.cat[i]) g.flag[i] = 1;
  }

  function flagsLeft(g) { return g.catCount - g.flag.reduce((s, v) => s + v, 0); }

  // Hinweis: sichere Zelle durch einfache Schlussfolgerung (Zahl erfüllt oder alle Reste sind Katzen). null, wenn keine.
  function hint(g) {
    if (!g.placed) return { type: 'safe', cell: (g.rows >> 1) * g.cols + (g.cols >> 1) };
    for (let i = 0; i < g.cat.length; i++) {
      if (!g.open[i] || !g.count[i]) continue;
      const hidden = neighbors(g, i).filter((n) => !g.open[n]);
      const flags = hidden.filter((n) => g.flag[n]).length;
      const rest = hidden.filter((n) => !g.flag[n]);
      if (!rest.length) continue;
      if (flags === g.count[i]) return { type: 'safe', cell: rest[0] };
      if (hidden.length === g.count[i] && rest.some((n) => !g.flag[n])) return { type: 'cat', cell: rest[0] };
    }
    for (let i = 0; i < g.cat.length; i++) if (!g.cat[i] && !g.open[i] && !g.flag[i]) return { type: 'guess', cell: i };
    return null;
  }

  const api = { LEVELS, neighbors, newGame, place, reveal, chord, toggleFlag, flagsLeft, hint, checkWin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CatLogic = api;
})(typeof self !== 'undefined' ? self : this);

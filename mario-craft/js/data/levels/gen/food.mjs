// Gemeinsamer Generator-Schritt: Essen im Level verteilen (Zeichen a = Brot, q = Steak), damit sich Herzen
// regenerieren lassen. Etwa alle SPACING Spalten ein Stück, abwechselnd Brot/Steak, nur auf erreichbarem
// Boden (Flutfüllung ab dem Start P), mit Freiraum darüber, nicht neben anderen Entitäten.
const SPACING = 28;
const FLOOR = new Set('GAS#CBWTYNREJ'.split(''));
const PASSABLE = (ch) => ch === undefined ? false : ch === '.' || !'ZGAS#CBWTY12345MXNREU?!LJ'.includes(ch);
const ENTITY = new Set('Pc zsrmfgeKF@yaq'.split('').filter((c) => c !== ' '));

export function addFood(g, W, H) {
  const at = (c, r) => (c < 0 || c >= W || r < 0 || r >= H ? undefined : g[r][c]);
  // Flutfüllung (4er-Nachbarschaft, ohne Sprunggrenzen) ab P: erfasst abgeschottete Taschen.
  const seen = new Uint8Array(W * H);
  let sr = -1, sc = -1;
  for (let r = 0; r < H && sr < 0; r++) for (let c = 0; c < W; c++) if (g[r][c] === 'P') { sr = r; sc = c; break; }
  if (sr < 0) return 0;
  const stack = [[sc, sr]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || c >= W || r < 0 || r >= H || seen[r * W + c] || !PASSABLE(g[r][c])) continue;
    seen[r * W + c] = 1;
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  const free = (c, r) => seen[r * W + c] && at(c, r) === '.';
  const spot = (c) => {
    for (let r = 4; r < H - 1; r++) {
      if (!free(c, r) || !FLOOR.has(at(c, r + 1))) continue;
      let ok = true;
      for (let k = 1; k <= 3; k++) if (!free(c, r - k)) ok = false;
      for (let dc = -2; dc <= 2; dc++) for (let dr = -3; dr <= 0; dr++) if (ENTITY.has(at(c + dc, r + dr))) ok = false;
      if (ok && FLOOR.has(at(c - 1, r + 1)) && FLOOR.has(at(c + 1, r + 1))) return r;
    }
    return -1;
  };
  let n = 0;
  const count = Math.max(2, Math.round(W / SPACING));
  for (let i = 1; i <= count; i++) {
    const target = Math.round((W * i) / (count + 1));
    for (let d = 0; d <= 25; d++) {
      let done = false;
      for (const c of d === 0 ? [target] : [target - d, target + d]) {
        const r = spot(c);
        if (r >= 0) { g[r][c] = n % 2 === 0 ? 'a' : 'q'; n++; done = true; break; }
      }
      if (done) break;
    }
  }
  return n;
}

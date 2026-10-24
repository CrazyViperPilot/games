// Gemeinsamer Generator-Schritt: Kopffreiheit vor Skeletten (Zeichen 's').
// Skelett-Pfeile fliegen auf ca. 1 Kachel Höhe; man weicht ihnen nur aus, wenn man sie überspringen kann.
// Dafür braucht der Boden im Schussfeld (SIGHT Kacheln links/rechts, solange man ebenerdig gehen kann)
// MIN_CLEAR freie Zeilen (Füße-Zeile mitgezählt). Zu niedrige Decken werden bis TARGET Zeilen ausgeschnitten.
// Nur Gestein/Erde wird entfernt; Grundgestein, Truhen, TNT, Spawner, Leitern, Flüssigkeiten bleiben.
const SIGHT = 10;
const MIN_CLEAR = 4;
const TARGET = 5;
const SOLID = new Set('GAS#CBWTY12345NREUMX?!ZJ'.split(''));
const KEEP = new Set('ZX?!M'.split(''));          // nie ausschneiden

const isSolid = (ch) => ch === undefined || SOLID.has(ch);
const isFloor = (ch) => isSolid(ch) || ch === '=';   // Slabs tragen, sind aber von unten durchlässig

export function ensureHeadroom(g, W, H) {
  const at = (c, r) => (c < 0 || c >= W || r < 0 || r >= H ? undefined : g[r][c]);
  let carved = 0;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (g[r][c] !== 's') continue;
      let fr = r;
      while (!isFloor(at(c, fr + 1)) && fr < H - 2) fr++;
      for (const dir of [-1, 1]) {
        for (let k = 0; k <= SIGHT; k++) {
          const cc = c + dir * k;
          if (isSolid(at(cc, fr)) || !isFloor(at(cc, fr + 1))) break;
          let h = 0;
          while (!isSolid(at(cc, fr - h)) && h < TARGET) h++;
          if (h >= MIN_CLEAR) continue;
          for (let rr = fr - h; rr > fr - TARGET; rr--) {
            const ch = at(cc, rr);
            if (ch === undefined || KEEP.has(ch)) break;
            if (isSolid(ch)) { g[rr][cc] = '.'; carved++; }
          }
        }
      }
    }
  }
  return carved;
}

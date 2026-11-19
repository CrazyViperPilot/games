import { newCity, tick, applyTool, placeBuilding, canPlace, refresh } from '../js/sim.js';
import { N } from '../js/data.js';
/** Pumpwerke an gültigen Uferstellen (canPlace), möglichst nahe am Stadtzentrum, mit Abstand untereinander. */
export function placePumps(s, count, cx = 32, cy = 32) {
  const cands = [];
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) if (canPlace(s, 'pump', x, y) === '') cands.push([x, y, Math.hypot(x - cx, y - cy)]);
  cands.sort((a, b) => a[2] - b[2]);
  const placed = [];
  for (const [x, y] of cands) {
    if (placed.length >= count) break;
    if (placed.some(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) < 4)) continue;
    if (placeBuilding(s, 'pump', x, y).ok) placed.push([x, y]);
  }
  return placed.length;
}
export function buildCity(s) {
  placePumps(s, 6);
  for (const [x,y] of [[15,19],[33,19],[45,19],[15,37],[33,37],[45,37]]) placeBuilding(s,'gas',x,y);
  // Raster aus Straßen oberhalb des Flusses, Zonen dazwischen
  const g = 6;
  for (let y = 18; y < 46; y++) for (let x = 14; x < 50; x++) {
    if (x % g === 0 || y % g === 0) applyTool(s, 'road', x, y);
  }
  const svc = ['police','fire','park','school','apple','clinic','park','park'];
  let k = 0;
  for (let by = 3; by < 8; by++) for (let bx = 2; bx < 9; bx++) { if ((bx + by) % 2) continue; placeBuilding(s, svc[(k++) % svc.length], bx * 6 + 1, by * 6 + 1); }
  // Wassertürme in der Mitte der Blöcke (verteilen nur mit Pumpwerk)
  for (let by = 3; by < 8; by++) for (let bx = 2; bx < 9; bx++) { if (!((bx + by) % 2)) continue; placeBuilding(s, 'tower', bx * 6 + 3, by * 6 + 3); }
  for (let y = 18; y < 46; y++) for (let x = 14; x < 50; x++) {
    if (x % g === 0 || y % g === 0) continue;
    const bx = Math.floor(x / g), by = Math.floor(y / g);
    const t = (bx * 7 + by * 3) % 5;
    const z = t < 2 ? 1 : t === 2 ? 2 : t === 3 ? 3 : 1;
    applyTool(s, 'zone' + z, x, y);
  }
  return s;
}
if (process.argv[1].endsWith('bot.mjs')) {
  const s = newCity({ seed: 5 }); s.disasters = false; s.money = 1e6;
  s.peakPop = 1e6; buildCity(s);
  for (const [x,y] of [[16,20],[40,20],[22,38],[40,38]]) { placeBuilding(s,'police',x,y); placeBuilding(s,'fire',x+2,y+1); }
  placeBuilding(s,'school',19,32);
  for (let t = 0; t < 12 * 25; t++) {
    tick(s);
    if (t % 24 === 0) console.log(s.year, s.month, 'pop', s.stats.pop, 'lots', s.stats.lots, 'jobs', s.stats.jobs, 'happy', s.stats.happy.toFixed(0), 'dem', Object.values(s.demand).map(v => v.toFixed(2)).join('/'), 'money', Math.round(s.money), 'net', Math.round(s.fin.net), 'pow', s.powerRatio.toFixed(2));
  }
}

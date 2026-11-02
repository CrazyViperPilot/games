import { newCity, tick, applyTool, placeBuilding, refresh } from '../js/sim.js';
import { N } from '../js/data.js';
export function buildCity(s) {
  for (const [x,y] of [[15,19],[33,19],[45,19],[15,37],[33,37],[45,37]]) placeBuilding(s,'gas',x,y);
  // Raster aus Straßen oberhalb des Flusses, Zonen dazwischen
  const g = 6;
  for (let y = 18; y < 46; y++) for (let x = 14; x < 50; x++) {
    if (x % g === 0 || y % g === 0) applyTool(s, 'road', x, y);
  }
  const svc = ['police','fire','park','school','apple','clinic','park','park'];
  let k = 0;
  for (let by = 3; by < 8; by++) for (let bx = 2; bx < 9; bx++) { if ((bx + by) % 2) continue; placeBuilding(s, svc[(k++) % svc.length], bx * 6 + 1, by * 6 + 1); }
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

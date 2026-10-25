// Mahjong-Solitaire-Logik (ohne DOM, per Node testbar).
// Einheiten: eine Kachel belegt 2x2 Einheiten (x, y); z ist die Ebene.
const MahjongLogic = (function () {
  const LAYOUTS = [
    { id: 'start', name: 'Landeanflug', info: 'Klein, zum Warmwerden',
      layers: [ { ox: 0, oy: 0, rows: ['########', '########', '########', '########'] },
                { ox: 2, oy: 1, rows: ['####', '####'] } ] },
    { id: 'pyramide', name: 'Pyramide', info: 'Klassischer Aufbau',
      layers: [ { ox: 0, oy: 0, rows: Array(6).fill('############') },
                { ox: 1, oy: 1, rows: Array(4).fill('##########') },
                { ox: 2, oy: 2, rows: Array(2).fill('########') },
                { ox: 4, oy: 2, rows: ['####'] } ] },
    { id: 'festung', name: 'Festung', info: 'Türme und Hof',
      layers: [ { ox: 0, oy: 0, rows: ['############', '############', '###      ###', '###      ###', '############', '############'] },
                { ox: 0, oy: 0, rows: ['###      ###', '###      ###', '', '', '###      ###', '###      ###'] },
                { ox: 0, oy: 0, rows: ['##      ##', '##      ##', '', '', '##      ##', '##      ##'] },
                { ox: 4, oy: 0, rows: ['####', '', '', '', '', '####'] } ] },
    { id: 'schildkroete', name: 'Schildkröte', info: 'Groß und knifflig',
      layers: [ { ox: 0, oy: 0, rows: ['  ########  ', ' ########## ', '############', '############', '############', '############', ' ########## ', '  ########  '] },
                { ox: 3, oy: 1, rows: Array(6).fill('######') },
                { ox: 4, oy: 2, rows: Array(4).fill('####') },
                { ox: 5, oy: 3, rows: ['##', '##'] } ] },
  ];

  function positions(layout) {
    const out = [];
    layout.layers.forEach((L, z) => L.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') out.push({ x: (L.ox + c) * 2, y: (L.oy + r) * 2, z });
    }));
    return out;
  }

  const covered = (t, all) => all.some((o) => !o.removed && o.z === t.z + 1 && Math.abs(o.x - t.x) < 2 && Math.abs(o.y - t.y) < 2);
  const blocked = (t, all, dx) => all.some((o) => !o.removed && o.z === t.z && o.x === t.x + dx && Math.abs(o.y - t.y) < 2);
  function isFree(t, all) {
    return !t.removed && !covered(t, all) && (!blocked(t, all, -2) || !blocked(t, all, 2));
  }

  function freeTiles(all) { return all.filter((t) => isFree(t, all)); }

  function findMoves(all) {
    const free = freeTiles(all), moves = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) if (free[i].type === free[j].type) moves.push([free[i], free[j]]);
    return moves;
  }

  function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

  // Verteilt die Typen so, dass eine Lösung garantiert ist: Paare werden rückwärts
  // (Abräumreihenfolge) aus zufällig gewählten freien Kacheln gebildet. `pairTypes` = Typ je Paar.
  function assign(tiles, pairTypes, rnd) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const work = tiles.map((t) => ({ x: t.x, y: t.y, z: t.z, removed: false }));
      const order = [];
      let ok = true;
      for (let n = 0; n < tiles.length / 2; n++) {
        const free = freeTiles(work);
        if (free.length < 2) { ok = false; break; }
        const a = pick(free, rnd);
        const b = pick(free.filter((t) => t !== a), rnd);
        a.removed = b.removed = true;
        order.push([work.indexOf(a), work.indexOf(b)]);
      }
      if (!ok) continue;
      const types = pairTypes.slice();
      for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
      order.forEach(([a, b], i) => { tiles[a].type = tiles[b].type = types[i]; });
      return true;
    }
    return false;
  }

  function deal(layout, typeCount, rnd) {
    const tiles = positions(layout).map((p, id) => ({ id, x: p.x, y: p.y, z: p.z, type: 0, removed: false }));
    const pairs = tiles.length / 2;
    const bag = [];
    for (let i = 0; i < typeCount; i++) bag.push(i);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    const pairTypes = [];
    for (let i = 0; i < pairs; i++) pairTypes.push(bag[i % bag.length]);
    if (!assign(tiles, pairTypes, rnd)) throw new Error('Keine Verteilung gefunden');
    return tiles;
  }

  // Mischt die noch liegenden Kacheln neu (weiterhin lösbar).
  function reshuffle(tiles, rnd) {
    const rest = tiles.filter((t) => !t.removed);
    const counts = {};
    rest.forEach((t) => { counts[t.type] = (counts[t.type] || 0) + 1; });
    const pairTypes = [];
    Object.keys(counts).forEach((k) => { for (let i = 0; i < counts[k] / 2; i++) pairTypes.push(+k); });
    return assign(rest, pairTypes, rnd);
  }

  return { LAYOUTS, positions, isFree, freeTiles, findMoves, deal, reshuffle };
})();
if (typeof module !== 'undefined') module.exports = MahjongLogic;

// Tests für das Speichersystem: node simfurt/test/save.test.js
// Ohne IndexedDB (Node) → Ersatz localStorage; Webspace per fetch-Attrappe offline bzw. mit 404-HTML.
import assert from 'node:assert';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; return new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } }); };

const { newCity, tick, applyTool, placeBuilding } = await import('../js/sim.js');
const save = await import('../js/save.js');

let n = 0;
async function test(name, fn) { try { await fn(); n++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } }
const city = (seed = 3, size = 64) => { const s = newCity({ seed, size }); s.disasters = false; s.money = 1e6; s.peakPop = 1e6; for (let x = 10; x < 30; x++) applyTool(s, 'road', x, 10); placeBuilding(s, 'park', 12, 12); for (let k = 0; k < 5; k++) tick(s); return s; };

await test('Speichern ohne IndexedDB landet im Browser-Speicher und lädt wieder', async () => {
  const s = city(); s.money = 4242;
  const r = await save.saveSlot(1, s);
  assert.strictEqual(r.where, 'Browser-Speicher');
  assert.strictEqual(await r.remote, false); // 404-HTML → nicht erreichbar, kein Absturz
  const l = await save.loadSlot(1);
  assert.ok(l && l.state); assert.strictEqual(Math.round(l.state.money), 4242); assert.strictEqual(l.state.bld.length, s.bld.length);
  assert.deepStrictEqual(l.state.road, s.road);
});

await test('Webspace wird nach einem Fehler für eine Weile nicht mehr gefragt', async () => {
  const before = fetchCalls; await save.listSlots(true); await save.loadSlot(1);
  assert.strictEqual(fetchCalls, before); assert.strictEqual(save.storageInfo().remote, 'nicht erreichbar');
});

await test('Notfall-Schnappschuss gewinnt, wenn er neuer ist', async () => {
  const s = city(); s.money = 111; await save.saveSlot(2, s);
  await new Promise((r) => setTimeout(r, 5));
  s.money = 222; assert.ok(save.snapshot(s, 2));
  const l = await save.loadSlot(2); assert.strictEqual(Math.round(l.state.money), 222);
  const list = await save.listSlots(false); assert.strictEqual(list[1].local.money, 222);
});

await test('Datei-Export (gzip) und Import ergeben denselben Stand, auch 128er-Karte', async () => {
  const s = city(4, 128);
  const blob = await save.exportBlob(s);
  const u8 = new Uint8Array(await blob.arrayBuffer()); assert.strictEqual(u8[0], 0x1f);
  const t = await save.importFile(blob);
  assert.strictEqual(t.size, 128); assert.deepStrictEqual(t.terrain, s.terrain); assert.strictEqual(t.money, s.money);
  const plain = new Blob([save.serialize(s)]); const t2 = await save.importFile(plain); assert.deepStrictEqual(t2.road, s.road);
  assert.match(save.fileName(s), /\.simfurt$/);
});

await test('Alte Stände (Format 1) lassen sich laden, Unsinn gibt eine klare Fehlermeldung', async () => {
  const s = city(); const o = JSON.parse(save.serialize(s)); o.format = 1; delete o.flood;
  const t = save.deserialize(JSON.stringify(o)); assert.deepStrictEqual(t.zone, s.zone);
  assert.throws(() => save.deserialize('{"hallo":1}'), /Format/);
  await assert.rejects(save.importFile(new Blob(['kein json'])), /kein Simfurt/);
});

await test('Löschen entfernt Platz und Schnappschuss', async () => {
  await save.deleteSlot(2); const list = await save.listSlots(false); assert.strictEqual(list[1].local, null);
});

console.log(`${n} Speicher-Tests ok`);

// Vorschau der Einheiten-Modelle (Rezept docs/rezept-einheiten.md): malt Modelle aus js/render/unitpaint.js in ein PNG, damit ein
// Mensch oder ein Modell (KI) die Form prüfen kann, ohne eine Partie zu starten. Je Einheit eine Zeile: 8 Iso-Richtungen (Blau),
// 2D von oben, Rot schräg, am Boden (Fahrwerk/Waffen, nur Luftfahrzeuge) und „Spielgröße“ (so klein wie im Spiel bei Zoom 1).
// Zum Vergleich stehen Referenzmodelle (Standard: f16 und tank) mit im Bild, im selben Maßstab.
//
//   node tools/unitpreview.mjs f22                    → .preview/units.png (f22 neben f16 und tank)
//   node tools/unitpreview.mjs f22 u2 --ref tank      → eigene Referenzen (--ref none: keine)
//   node tools/unitpreview.mjs f22 --scale 6 --out /tmp/x.png
//   node tools/unitpreview.mjs --list                 → alle Modelle
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { serve } from './smoke.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const list = args.includes('--list');
if (list) args.splice(args.indexOf('--list'), 1);
const scale = Number(opt('scale', 4));
const out = resolve(opt('out', '.preview/units.png'));
const refArg = opt('ref', 'f16,tank');
const refs = refArg === 'none' ? [] : refArg.split(',').filter(Boolean);
const types = [...args, ...refs.filter((r) => !args.includes(r))];

let pw;
try {
  pw = await import('playwright');
} catch {
  pw = createRequire(import.meta.url)('playwright');
}
const { srv, port } = await serve();
const browser = await pw.chromium.launch();
try {
  const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  await page.goto(`http://127.0.0.1:${port}/frontline/manifest.json`); // gleiche Herkunft für die Modul-Importe
  const res = await page.evaluate(
    async ({ types, scale, list }) => {
      const U = await import('/frontline/js/render/unitpaint.js');
      const { ISO_K: K } = await import('/frontline/js/render/camera.js');
      const { UNITS } = await import('/frontline/js/data/units.js');
      const all = U.unitModelTypes();
      if (list) return { list: all };
      const bad = types.filter((t) => !all.includes(t));
      if (bad.length) return { error: `unbekannt: ${bad.join(', ')} (Modelle: ${all.join(', ')})` };
      const { paintSolids, boundsOf } = U.PAINT;
      const TAU = Math.PI * 2;
      const HEAD = 8; // Iso-Richtungen in der Vorschau (das Spiel nutzt 16)
      const ISO_SCALE = 1.35; // wie unitpaint.js: Iso-Modelle im Spiel etwas größer
      // Zellen je Zeile: [Beschriftung, team, yaw, iso, look, s]
      const rowCells = (t) => {
        const air = !!UNITS[t]?.air || !!UNITS[t]?.jet;
        const c = [];
        for (let k = 0; k < HEAD; k++) c.push([`Iso ${k * 45}°`, 0, (k / HEAD) * TAU, true, {}, scale]);
        c.push(['2D oben', 0, -Math.PI / 2, false, {}, scale]);
        c.push(['Rot', 1, TAU / 8, true, {}, scale]);
        if (air) c.push(['am Boden', 0, TAU / 8, true, { gear: true }, scale]);
        c.push(['Spielgröße', 0, TAU / 8, true, {}, ISO_SCALE]);
        return c;
      };
      // Maße je Zelle vorab (Platz im Bild)
      const rows = types.map((t) => {
        const cells = rowCells(t).map(([label, team, yaw, iso, look, s]) => {
          const m = U.unitModel(t, team, look);
          const b = [...boundsOf(m, m.S, yaw, iso)];
          if (m.turret) {
            // Turm (Rohr) mit in die Grenzen, an seinem Drehpunkt verschoben
            const tb = boundsOf(m.turret, m.turret.S, yaw, iso);
            const px = m.turret.x * Math.cos(yaw);
            const py = m.turret.x * Math.sin(yaw);
            const dx = iso ? (px - py) * K : px;
            const dy = iso ? (px + py) * K * 0.5 : py;
            b[0] = Math.min(b[0], tb[0] + dx);
            b[1] = Math.min(b[1], tb[1] + dy);
            b[2] = Math.max(b[2], tb[2] + dx);
            b[3] = Math.max(b[3], tb[3] + dy);
          }
          return { label, team, yaw, iso, look, s, m, w: (b[2] - b[0]) * s, h: (b[3] - b[1]) * s, b };
        });
        return { t, cells };
      });
      const PAD = 14;
      const LABEL = 16;
      const cellW = Math.ceil(Math.max(...rows.flatMap((r) => r.cells.map((c) => c.w)), 60)) + PAD;
      const cellH = Math.ceil(Math.max(...rows.flatMap((r) => r.cells.map((c) => c.h)), 40)) + PAD + LABEL;
      const nCol = Math.max(...rows.map((r) => r.cells.length));
      const head = 22;
      const cv = document.createElement('canvas');
      cv.width = nCol * cellW + 90;
      cv.height = rows.length * cellH + head;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#7d8a6a'; // Boden wie Gras im Spiel, damit Kontrast und Farben stimmen
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#10140e';
      ctx.fillText(`Maßstab ${scale} Pixel je Welt-Pixel (Spielgröße: ${ISO_SCALE}) · Nase zeigt bei Iso 0° nach rechts unten, 2D nach oben`, 8, 15);
      rows.forEach((r, ri) => {
        const y0 = head + ri * cellH;
        ctx.fillStyle = '#10140e';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(r.t, 8, y0 + cellH / 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.moveTo(0, y0 + 0.5);
        ctx.lineTo(cv.width, y0 + 0.5);
        ctx.stroke();
        r.cells.forEach((c, ci) => {
          const x0 = 90 + ci * cellW;
          ctx.font = '11px sans-serif';
          ctx.fillStyle = '#1d2418';
          ctx.fillText(c.label, x0 + 4, y0 + 13);
          // Modell mittig in die Zelle: Mitte der Grenzen auf die Zellmitte
          const cx = x0 + cellW / 2 - ((c.b[0] + c.b[2]) / 2) * c.s;
          const cy = y0 + LABEL + (cellH - LABEL) / 2 - ((c.b[1] + c.b[3]) / 2) * c.s;
          ctx.save();
          ctx.translate(cx, cy);
          paintSolids(ctx, c.m.S, c.yaw, { iso: c.iso, s: c.s });
          if (c.m.turret) {
            // Turm im Drehpunkt (wie drawUnitIso / drawUnitTop), gleiche Richtung wie die Wanne
            const px = c.m.turret.x * Math.cos(c.yaw);
            const py = c.m.turret.x * Math.sin(c.yaw);
            if (c.iso) ctx.translate((px - py) * K * c.s, (px + py) * K * 0.5 * c.s);
            else ctx.translate(px * c.s, py * c.s);
            paintSolids(ctx, c.m.turret.S, c.yaw, { iso: c.iso, s: c.s });
          }
          ctx.restore();
        });
      });
      return { png: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
    },
    { types, scale, list },
  );
  if (res.list) console.log(res.list.join(' '));
  else if (res.error) {
    console.error(res.error);
    process.exitCode = 1;
  } else {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(res.png.split(',')[1], 'base64'));
    console.log(`${out} (${res.w} × ${res.h}): ${types.join(', ')}`);
  }
} finally {
  await browser.close();
  srv.close();
}

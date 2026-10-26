// Erzeugt die PNG-Icons aus public/icons/icon.svg (node scripts/icons.mjs, braucht Playwright).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright ist global installiert (nicht in package.json).
const { chromium } = createRequire(import.meta.url)('playwright');

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(size, file, maskable) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable: Hintergrund randlos, Motiv in der sicheren Mitte (80 %).
  const inner = maskable ? svg.replace('rx="22"', 'rx="0"').replace('translate(14 10) scale(0.72)', 'translate(21 19) scale(0.58)') : svg;
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname, omitBackground: true });
}
await shot(192, 'icon-192.png');
await shot(512, 'icon-512.png');
await shot(512, 'maskable-512.png', true);
await browser.close();

// Browser-Prüfung (Rauchtest) für Frontline (seit v5.81): startet einen eigenen Webserver über dem Repo, öffnet das Spiel mit
// ?debug=1 in Chromium (Playwright) und läuft einen festen Rundgang ab: Startmenü, Partie, 2D, Iso, Hilfe, Pausenmenü,
// Baumodus der Stadt, Ressourcenanzeige, ein gewähltes Ausbildungsgebäude. Bildschirmfotos landen im Ausgabeordner,
// Konsolen- und Seitenfehler werden gesammelt; Exit-Code 1, wenn es welche gab.
//
// Aufruf (im Ordner frontline/):  npm run smoke                      → Fotos in .smoke/
//                                  node tools/smoke.mjs --seed 7 --out /tmp/x --scale 2
// Braucht Playwright mit Chromium (`npm i -D playwright` bzw. vorinstalliert); nicht Teil von `npm test`.
//
// Bausteine für eigene Prüfungen (z. B. einen Fehler nachstellen):
//   import { openGame } from './tools/smoke.mjs';
//   const g = await openGame({ seed: 3 });            // { page, browser, close(), errors, run(fn, arg), shot(name) }
//   await g.run(() => window.__frontline.session().game.time);   // im Browser auswerten (Zugriff auf die Partie)
//   await g.shot('vorher');  await g.close();
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // Repo-Wurzel (games/): das Spiel lädt nur aus frontline/
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

/** Playwright laden: als ES-Modul oder, wenn es nur global installiert ist (NODE_PATH), über require. */
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return createRequire(import.meta.url)('playwright');
  }
}

/** Statischer Webserver über der Repo-Wurzel auf einem freien Port. */
export function serve() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
      const file = join(ROOT, path.endsWith('/') || path === '' ? join(path, 'index.html') : path);
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/**
 * Spiel öffnen und eine Partie starten. opts: seed, query (weitere URL-Parameter, z. B. 'weather=summer&wx=clear'), scale
 * (Gerätepixel, 1 für eigene Prüfungen, 2 für Bilder, die ein Mensch ansieht), out (Ordner für shot), width, height, start (false =
 * im Startmenü bleiben). Fehler im Browser (Konsole, Seite) sammelt `errors`; Netzwerkfehler externer Adressen zählen nicht.
 */
export async function openGame({ seed = 3, query = '', scale = 1, out = '.smoke', width = 1280, height = 800, start = true } = {}) {
  const { chromium } = await loadPlaywright();
  const { srv, port } = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`Seite: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_(TUNNEL|NAME|INTERNET|PROXY|CONNECTION)/.test(m.text())) errors.push(`Konsole: ${m.text()}`);
  });
  await mkdir(out, { recursive: true });
  await page.goto(`http://127.0.0.1:${port}/frontline/?debug=1&seed=${seed}${query ? '&' + query : ''}`);
  await page.waitForTimeout(1000);
  if (start) {
    await page.click('button.primary');
    await page.waitForFunction(() => window.__frontline?.session()?.game);
    await page.waitForTimeout(1500);
  }
  return {
    page,
    browser,
    errors,
    /** Funktion im Browser ausführen (window.__frontline.session() ist die laufende Partie). */
    run: (fn, arg) => page.evaluate(fn, arg),
    /** Bildschirmfoto `<out>/<name>.png`. */
    shot: (name) => page.screenshot({ path: join(out, `${name}.png`) }),
    close: async () => {
      await browser.close();
      srv.close();
    },
  };
}

/** Fester Rundgang. Ergebnis: Liste der Schritte mit ok/Fehlertext und die gesammelten Browserfehler. */
export async function smoke(opts = {}) {
  const g = await openGame(opts);
  const steps = [];
  const step = async (name, fn) => {
    try {
      await fn();
      steps.push({ name, ok: true });
    } catch (e) {
      steps.push({ name, ok: false, error: e.message.split('\n')[0] });
    }
  };
  try {
    await step('2D', () => g.shot('01-2d'));
    await step('Iso', async () => {
      await g.page.keyboard.press('v');
      await g.page.waitForTimeout(1200);
      await g.shot('02-iso');
      await g.page.keyboard.press('v');
    });
    await step('Hilfe (F1)', async () => {
      await g.page.keyboard.press('F1');
      await g.page.waitForTimeout(400);
      await g.shot('03-hilfe');
      await g.page.keyboard.press('Escape');
    });
    await step('Pausenmenü', async () => {
      await g.page.keyboard.press('p');
      await g.page.waitForTimeout(400);
      if (!(await g.page.$('input[type=range]'))) throw new Error('keine Lautstärkeregler im Pausenmenü');
      await g.shot('04-pause');
      await g.page.keyboard.press('p');
    });
    await step('Baumodus (Y)', async () => {
      await g.page.keyboard.press('y');
      await g.page.waitForTimeout(600);
      await g.shot('05-baumodus');
      await g.page.keyboard.press('y');
    });
    await step('Ressourcenanzeige', async () => {
      const b = await g.page.$('[data-act=flow]');
      if (!b) throw new Error('Knopf „Ressourcen“ fehlt');
      await b.click();
      await g.page.waitForTimeout(600);
      await g.shot('06-ressourcen');
      await b.click();
    });
    await step('Ausbildungsgebäude wählen', async () => {
      const n = await g.run(() => {
        const s = window.__frontline.session();
        const e = [...(s.game.city?.[0]?.ents.values() ?? [])].find((x) => x.alive && x.produces?.length);
        if (!e) return 0;
        s.controller.view.selection.clear();
        s.controller.view.selection.add(e.id);
        return 1;
      });
      if (!n) throw new Error('kein Ausbildungsgebäude (Stadt aus?)');
      await g.page.waitForTimeout(600);
      if (!(await g.page.$('.cbtn'))) throw new Error('Befehlskarte leer');
      await g.shot('07-ausbildung');
    });
    await step('10 s Spiel bei 10× Tempo', async () => {
      await g.run(() => {
        window.__frontline.session().loop.speed = 10;
      });
      await g.page.waitForTimeout(10000);
      const t = await g.run(() => window.__frontline.session().game.time);
      if (!(t > 20)) throw new Error(`Spielzeit steht (${t} s)`);
      await g.shot('08-nach-100s');
    });
  } finally {
    await g.close();
  }
  return { steps, errors: g.errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const out = arg('out', '.smoke');
  const { steps, errors } = await smoke({ seed: Number(arg('seed', 3)), out, scale: Number(arg('scale', 1)), query: arg('query', '') });
  for (const s of steps) console.log(`${s.ok ? 'ok  ' : 'FEHL'} ${s.name}${s.ok ? '' : ': ' + s.error}`);
  for (const e of errors) console.log(`Browserfehler: ${e}`);
  console.log(`Bilder in ${out}/`);
  process.exit(steps.every((s) => s.ok) && !errors.length ? 0 : 1);
}

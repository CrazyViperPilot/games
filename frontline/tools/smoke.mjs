// Browser-Prüfung (Rauchtest) für Frontline (seit v5.81): startet einen eigenen Webserver über dem Repo, öffnet das Spiel mit
// ?debug=1 in Chromium (Playwright) und läuft einen festen Rundgang ab: Startmenü, Partie, 2D, Iso, Hilfe, Pausenmenü,
// Baumodus der Stadt, Ressourcenanzeige, ein gewähltes Ausbildungsgebäude. Bildschirmfotos landen im Ausgabeordner,
// Konsolen- und Seitenfehler werden gesammelt; Exit-Code 1, wenn es welche gab.
// Geräteprofile (seit dem Paket „Rauchtest Tablet und Telefon“): desktop (1280 × 800, Maus und Tastatur), tablet (iPad Pro 11 quer)
// und phone (Pixel 7 quer); auf Touch-Geräten tippt der Rundgang auf die Knöpfe der Leiste statt Tasten zu drücken. Dazu misst er
// je Ansicht (2D, Iso) 10 s lang bei 3× Tempo die Bildrate per requestAnimationFrame (nur Ausgabe, kein Fehler: schwankt je Rechner).
//
// Aufruf (im Ordner frontline/):  npm run smoke                      → Fotos in .smoke/desktop/
//                                  npm run smoke -- --device phone    → Fotos in .smoke/phone/ (desktop|tablet|phone|all)
//                                  node tools/smoke.mjs --seed 7 --out /tmp/x --scale 2
//                                  npm run smoke -- --long 20         langer Lauf: 20 Spielminuten bei 10× Tempo, beide Seiten KI
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
/** Geräteprofile: Playwright-Gerät (Name) oder eigene Werte. Bei benannten Geräten setzt Playwright Bildschirm und Pixeldichte. */
export const DEVICES = { desktop: null, tablet: 'iPad Pro 11 landscape', phone: 'Pixel 7 landscape' };

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
 * im Startmenü bleiben), device ('desktop', 'tablet', 'phone': Bildschirm, Pixeldichte und Touch des Geräts; width/height/scale
 * gelten dann nicht). Fehler im Browser (Konsole, Seite) sammelt `errors`; Netzwerkfehler externer Adressen zählen nicht.
 */
export async function openGame({ seed = 3, query = '', scale = 1, out = '.smoke', width = 1280, height = 800, start = true, device = 'desktop' } = {}) {
  const { chromium, devices } = await loadPlaywright();
  if (!(device in DEVICES)) throw new Error(`unbekanntes Gerät „${device}“ (${Object.keys(DEVICES).join(', ')})`);
  const { srv, port } = await serve();
  const browser = await chromium.launch();
  let ctx = { viewport: { width, height }, deviceScaleFactor: scale };
  if (DEVICES[device]) {
    const { defaultBrowserType, ...d } = devices[DEVICES[device]]; // wir nehmen immer Chromium
    ctx = d;
  }
  const page = await (await browser.newContext(ctx)).newPage();
  const touch = !!ctx.hasTouch;
  const errors = [];
  page.on('pageerror', (e) => errors.push(`Seite: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_(TUNNEL|NAME|INTERNET|PROXY|CONNECTION)/.test(m.text())) errors.push(`Konsole: ${m.text()}`);
  });
  await mkdir(out, { recursive: true });
  await page.goto(`http://127.0.0.1:${port}/frontline/?debug=1&seed=${seed}${query ? '&' + query : ''}`);
  await page.waitForTimeout(1000);
  /** Knopf drücken: auf Touch-Geräten tippen, sonst klicken. */
  const press = (sel) => (touch ? page.tap(sel, { timeout: 15000 }) : page.click(sel, { timeout: 15000 }));
  /** Liegt die Mitte des Elements sichtbar im Bildschirm (nicht abgeschnitten, nicht verdeckt)? */
  const reachable = (sel) =>
    page.evaluate((sel) => {
      const e = document.querySelector(sel);
      if (!e || !e.offsetParent) return false;
      // in einem scrollbaren Feld (z. B. lange Hilfe) darf der Knopf erst ins Bild gescrollt werden, wie mit dem Finger
      for (let p = e.parentElement; p; p = p.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(p).overflowY + getComputedStyle(p).overflowX)) {
          e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          break;
        }
      }
      const r = e.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      return e.contains(document.elementFromPoint(x, y));
    }, sel);
  if (start) {
    await press('button.primary');
    await page.waitForFunction(() => window.__frontline?.session()?.game);
    await page.waitForTimeout(1500);
  }
  return {
    page,
    browser,
    errors,
    touch,
    press,
    reachable,
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

/** Im Browser `ms` Millisekunden lang Bilder zählen (requestAnimationFrame): Mittel in fps und langsamstes Bild in ms. */
export function measureFps(g, ms = 10000) {
  return g.run(
    (ms) =>
      new Promise((done) => {
        let n = 0,
          worst = 0,
          t0 = null,
          last = 0;
        const tick = (t) => {
          if (t0 === null) t0 = last = t;
          else {
            n++;
            worst = Math.max(worst, t - last);
            last = t;
          }
          if (t - t0 < ms) requestAnimationFrame(tick);
          else done({ fps: (n * 1000) / (t - t0), worst });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
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
  const fps = [];
  const notes = []; // Auffälligkeiten (z. B. Knopf außerhalb des Bildschirms): nur Hinweis, kein Fehler
  const { page } = g;
  // Auf Touch-Geräten über die Knöpfe der Leiste, sonst über die Tasten (wie ein Spieler am jeweiligen Gerät).
  const viaKey = async (key, sel) => {
    if (!g.touch) return page.keyboard.press(key);
    if (await g.reachable(sel)) return g.press(sel);
    notes.push(`Knopf ${sel} nicht antippbar (außerhalb des Bildschirms oder verdeckt), Taste ${key} benutzt`);
    return page.keyboard.press(key);
  };
  const setSpeed = (v) => g.run((v) => (window.__frontline.session().loop.speed = v), v);
  try {
    await step('2D', () => g.shot('01-2d'));
    await step('Iso', async () => {
      await viaKey('v', '[data-act=view]');
      await page.waitForTimeout(1200);
      if (!(await g.run(() => window.__frontline.session().camera.iso))) throw new Error('Ansicht nicht isometrisch');
      await g.shot('02-iso');
      await viaKey('v', '[data-act=view]');
    });
    await step('Hilfe (F1)', async () => {
      await viaKey('F1', '[data-act=help]');
      await page.waitForTimeout(400);
      await g.shot('03-hilfe');
      await viaKey('Escape', '#overlay [data-act=close]');
    });
    await step('Pausenmenü', async () => {
      await viaKey('p', '[data-act=pause]');
      await page.waitForTimeout(400);
      if (!(await page.$('input[type=range]'))) throw new Error('keine Lautstärkeregler im Pausenmenü');
      await g.shot('04-pause');
      await viaKey('p', '#overlay [data-act=resume]');
    });
    await step('Baumodus (Y)', async () => {
      await viaKey('y', '.city-fab[data-act=city]');
      await page.waitForTimeout(600);
      await g.shot('05-baumodus');
      await viaKey('y', '.city-done'); // im Baumodus ist der Stadt-Knopf verborgen: „Fertig“
    });
    await step('Ressourcenanzeige', async () => {
      if (!(await page.$('[data-act=flow]'))) throw new Error('Knopf „Ressourcen“ fehlt');
      await g.press('[data-act=flow]');
      await page.waitForTimeout(600);
      if (!(await g.run(() => document.body.classList.contains('flow-open')))) throw new Error('Ressourcenanzeige nicht offen');
      await g.shot('06-ressourcen');
      // schließen: über denselben Knopf, oder mit ✕, wenn die Anzeige ihn verdeckt (Telefon)
      await g.press((await g.reachable('[data-act=flow]')) ? '[data-act=flow]' : '[data-fl-close]');
      await page.waitForTimeout(300);
      if (await g.run(() => document.body.classList.contains('flow-open'))) throw new Error('Ressourcenanzeige geht nicht zu');
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
      if (!n) throw new Error('kein Ausbildungsgebäude der Stadt');
      await page.waitForTimeout(600);
      if (!(await page.$('.cbtn'))) throw new Error('Befehlskarte leer');
      await g.shot('07-ausbildung');
      await g.run(() => window.__frontline.session().controller.view.selection.clear());
    });
    await step('Bildrate 2D (10 s, 3×)', async () => {
      await setSpeed(3);
      fps.push({ view: '2D', ...(await measureFps(g)) });
    });
    await step('Bildrate Iso (10 s, 3×)', async () => {
      await viaKey('v', '[data-act=view]');
      await page.waitForTimeout(500);
      fps.push({ view: 'Iso', ...(await measureFps(g)) });
      await g.shot('08-iso-3x');
      await viaKey('v', '[data-act=view]');
    });
    await step('10 s Spiel bei 10× Tempo', async () => {
      await setSpeed(10);
      await page.waitForTimeout(10000);
      const t = await g.run(() => window.__frontline.session().game.time);
      if (!(t > 40)) throw new Error(`Spielzeit steht (${t} s)`);
      await g.shot('09-nach-160s');
    });
  } finally {
    await g.close();
  }
  return { steps, errors: g.errors, fps, notes };
}

/**
 * Langer Lauf (`--long [Minuten]`, seit dem Paket „Langer Rauchtest“): spielt eine Partie bis `minutes` Spielminuten bei 10× Tempo, Blau
 * und Rot von der KI gesteuert. Die Kamera wechselt reihum zwischen eigener Basis, Front, gegnerischer Stadt, dem größten Gefecht und
 * dem Fliegerhorst, abwechselnd 2D und Iso und mit wechselndem Zoom; ab und zu gehen Ressourcen- und Forschungsfenster auf und zu.
 * Prüft Browserfehler, stehende Spielzeit (Einfrieren der Simulation) und stehende Bildschleife (Einfrieren des Zeichnens) sowie das
 * langsamste Einzelbild. Je 5 Spielminuten eine Zeile (log), alle 10 Spielminuten ein Foto. Ergebnis: { lines, errors, freezes, shots }.
 */
export async function longRun({ minutes = 20, log = () => {}, ...opts } = {}) {
  const g = await openGame(opts);
  const { page } = g;
  const freezes = [];
  const lines = [];
  const shots = [];
  const say = (t) => {
    lines.push(t);
    log(t);
  };
  try {
    // Blau mit KI (dasselbe Modul wie im Spiel), Bildzähler im Browser, 10× Tempo
    await g.run(async () => {
      const { AI } = await import('/frontline/js/ai/ai.js');
      const s = window.__frontline.session();
      const blue = new AI(s.game, 0, 'normal');
      const step = s.game.update.bind(s.game);
      s.game.update = (dt) => {
        blue.update(dt);
        step(dt);
      };
      s.loop.speed = 10;
      const w = (window.__long = { frames: 0, worst: 0, last: 0, since: 0 });
      const tick = (t) => {
        if (w.last) w.worst = Math.max(w.worst, t - w.last);
        w.last = t;
        w.frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Ziele der Kamera (im Browser bestimmt, je Durchgang neu)
    const aim = (k) =>
      g.run((k) => {
        const s = window.__frontline.session();
        const game = s.game;
        const alive = game.units.filter((u) => u.alive);
        const p = [
          () => game.mainFob(0),
          () => game.zone,
          () => game.mainFob(1),
          () => {
            // größtes Gefecht: Einheit mit den meisten Gegnern in 500 px
            let best = null;
            let bn = 0;
            for (let i = 0; i < alive.length; i += 3) {
              const u = alive[i];
              const n = alive.filter((e) => e.team !== u.team && Math.abs(e.x - u.x) < 500 && Math.abs(e.y - u.y) < 500).length;
              if (n > bn) {
                bn = n;
                best = u;
              }
            }
            return best;
          },
          () => [...(game.city?.[k % 2]?.ents.values() ?? [])].find((e) => e.produces?.includes?.('f16')) ?? game.mainFob(k % 2),
        ][k % 5]() ?? game.zone;
        s.camera.x = p.x;
        s.camera.y = p.y;
        s.camera.zoom = [0.6, 1, 1.6][k % 3];
        const iso = Math.floor(k / 5) % 2 === 1;
        if (s.camera.iso !== iso) document.querySelector('[data-act=view]')?.click();
        // ab und zu Fenster auf und zu (Ressourcen, Forschung)
        if (k % 7 === 3) document.querySelector('[data-act=flow]')?.click();
        if (k % 7 === 4) document.querySelector('[data-act=flow]')?.click();
        if (k % 11 === 5) document.querySelector('[data-act=research]')?.click();
        if (k % 11 === 6) document.querySelector('.overlay:not([hidden]) [data-act=close], .research [data-close], [data-rs-close]')?.click();
        return { t: game.time, units: alive.length, winner: game.winner ?? null };
      }, k);
    const stats = () => g.run(() => ({ t: window.__frontline.session().game.time, frames: window.__long.frames, worst: window.__long.worst }));
    const reset = () => g.run(() => Object.assign(window.__long, { worst: 0 }));
    const realCap = Date.now() + minutes * 60 * 1000 + 120000; // langsamer als Echtzeit (Spielminute je Minute): Abbruch mit Meldung
    let k = 0;
    let lastT = -1;
    let lastFrames = -1;
    let stuckT = 0;
    let stuckF = 0;
    let nextLine = 5;
    let nextShot = 10;
    let f0 = await stats();
    let wall0 = Date.now();
    while (true) {
      const info = await aim(k++);
      await page.waitForTimeout(3000);
      const st = await stats();
      // Einfrieren: Spielzeit oder Bildzähler steht über mehrere Durchgänge
      stuckT = st.t <= lastT ? stuckT + 1 : 0;
      stuckF = st.frames <= lastFrames ? stuckF + 1 : 0;
      if (stuckT === 3) freezes.push(`Spielzeit steht bei ${st.t.toFixed(0)} s`);
      if (stuckF === 3) freezes.push(`Bildschleife steht bei ${st.t.toFixed(0)} s`);
      lastT = st.t;
      lastFrames = st.frames;
      if (st.t / 60 >= nextLine || info.winner !== null || st.t / 60 >= minutes) {
        const fps = ((st.frames - f0.frames) * 1000) / Math.max(1, Date.now() - wall0);
        say(`${(st.t / 60).toFixed(0).padStart(3)} min · Einheiten ${info.units} · ${fps.toFixed(1)} fps · langsamstes Bild ${st.worst.toFixed(0)} ms · Fehler ${g.errors.length}`);
        nextLine += 5;
        f0 = st;
        wall0 = Date.now();
        await reset();
      }
      if (st.t / 60 >= nextShot) {
        // Fenster zu, damit das Foto die Karte zeigt
        await g.run(() => {
          if (document.body.classList.contains('flow-open')) document.querySelector('[data-fl-close]')?.click();
          document.querySelector('[data-rs-close]')?.offsetParent && document.querySelector('[data-rs-close]').click();
        });
        await page.waitForTimeout(300);
        const name = `long-${String(nextShot).padStart(2, '0')}min`;
        await g.shot(name);
        shots.push(name);
        nextShot += 10;
      }
      if (info.winner !== null) {
        say(`Partie entschieden: Sieger Team ${info.winner}`);
        break;
      }
      if (st.t / 60 >= minutes || freezes.length) break;
      if (Date.now() > realCap) {
        freezes.push(`zu langsam: nach der Zeitgrenze erst ${(st.t / 60).toFixed(1)} von ${minutes} Spielminuten`);
        break;
      }
    }
  } finally {
    await g.close();
  }
  return { lines, errors: g.errors, freezes, shots };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const base = arg('out', '.smoke');
  const dev = arg('device', 'desktop');
  const list = dev === 'all' ? Object.keys(DEVICES) : [dev];
  let fail = false;
  const li = process.argv.indexOf('--long');
  if (li > 0) {
    // Langer Lauf: --long [Spielminuten] (Standard 20), je Gerät
    const minutes = Number(process.argv[li + 1]) > 0 ? Number(process.argv[li + 1]) : 20;
    for (const device of list) {
      const out = join(base, device);
      const p = device.padEnd(7);
      const r = await longRun({ minutes, seed: Number(arg('seed', 3)), out, scale: Number(arg('scale', 1)), query: arg('query', ''), device, log: (t) => console.log(`${p} ${t}`) });
      for (const f of r.freezes) console.log(`${p} EINGEFROREN: ${f}`);
      for (const e of r.errors) console.log(`${p} Browserfehler: ${e}`);
      console.log(`${p} ${r.freezes.length || r.errors.length ? 'FEHL' : 'ok  '} langer Lauf, Fotos: ${r.shots.join(', ') || '–'}`);
      fail ||= r.freezes.length > 0 || r.errors.length > 0;
    }
    console.log(`Bilder in ${base}/<gerät>/`);
    process.exit(fail ? 1 : 0);
  }
  for (const device of list) {
    const out = join(base, device);
    const { steps, errors, fps, notes } = await smoke({ seed: Number(arg('seed', 3)), out, scale: Number(arg('scale', 1)), query: arg('query', ''), device });
    const p = device.padEnd(7);
    for (const s of steps) console.log(`${p} ${s.ok ? 'ok  ' : 'FEHL'} ${s.name}${s.ok ? '' : ': ' + s.error}`);
    for (const f of fps) console.log(`${p} fps  ${f.view.padEnd(3)} Mittel ${f.fps.toFixed(1)} fps, langsamstes Bild ${f.worst.toFixed(0)} ms`);
    for (const n of notes) console.log(`${p} Hinweis: ${n}`);
    for (const e of errors) console.log(`${p} Browserfehler: ${e}`);
    fail ||= !steps.every((s) => s.ok) || errors.length > 0;
  }
  console.log(`Bilder in ${base}/<gerät>/`);
  process.exit(fail ? 1 : 0);
}

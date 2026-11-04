// Ressourcenanzeige (PRD §15 „Ressourcenanzeige“, seit v5.07): Fenster mit dem Fluss der Rohstoffe durch die Kette, geöffnet
// über den Knopf „Ressourcen“ rechts oben (unter „Forschung“). Links die Förderung (Gebäude, Rohstoff/s), dann die Werke, rechts
// die Lager mit Erzeugung und Verbrauch; Linienbreite = Menge je s. Rot = Engpass, gelb = Werk wartet oder Rohstoff verfällt.
// Unten die Engpässe in Worten. Der Graph kommt aus js/game/flow.js (CITY.chain), hier wird er nur gezeichnet. Das Spiel läuft weiter.
import { resourceFlow, FlowMeter, fmtFlow } from '../game/flow.js';

const NW = 140; // Breite eines Knotens (SVG-Einheiten)
const NH = 56; // Höhe
const PITCH = 66; // Abstand der Reihen
const W = 860; // Breite des Graphen
const TOP = 18; // Platz für die Spaltenköpfe
const COLOR = { wood: '#7fa650', stone: '#a3a8ad', ore: '#c0714f', oil: '#7d6aa8', bm: '#b58248', iron: '#b9a48a', metal: '#8fb3c9', fuel: '#9b7bc4', kero: '#56b3e6', mun: '#d9b600' };
const UNIT = { bm: 'BM', iron: 'Roheisen', metal: 'Stahl', fuel: 'TS', kero: 'Kerosin', mun: 'MUN' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const int = (v) => Math.floor(v).toLocaleString('de-DE');

export class FlowPanel {
  constructor(parent, game, team) {
    this.game = game;
    this.team = team;
    this.open = false;
    this.meter = new FlowMeter(60, 1);
    const root = document.createElement('div');
    root.className = 'flow';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Ressourcen');
    root.innerHTML = `
      <div class="fl-head"><b>📊 Ressourcen</b><div class="fl-chips" data-fl-chips></div>
        <button type="button" class="btn-sm fl-close" data-fl-close title="Schließen (Esc)" aria-label="Schließen">✕</button></div>
      <svg class="fl-graph" data-fl-svg preserveAspectRatio="xMidYMin meet"></svg>
      <ul class="fl-issues" data-fl-issues></ul>`;
    parent.appendChild(root);
    this.root = root;
    this.svg = root.querySelector('[data-fl-svg]');
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-fl-close]')) this.toggle(false);
    });
  }

  toggle(on = !this.open) {
    this.open = on;
    this.root.hidden = !on;
    document.body.classList.toggle('flow-open', on);
    if (on) this.update(true);
  }

  /** Jedes Bild: Messung (auch geschlossen, damit der Verbrauch beim Öffnen schon da ist), Zeichnen nur offen, alle 0,5 s. */
  update(force = false) {
    this.meter.sample(this.game, this.team);
    if (!this.open) return;
    const now = performance.now();
    if (!force && now - (this.last || 0) < 500) return;
    this.last = now;
    const f = resourceFlow(this.game, this.team, this.meter.rates());
    if (!f) return;
    const F = f.factors;
    const chip = (label, v, bad) => `<span class="fl-chip${bad ? ' bad' : ''}">${label} <b>${v}</b></span>`;
    this.root.querySelector('[data-fl-chips]').innerHTML =
      chip('Arbeiter', `${Math.round(F.fill * 100)} %`, F.fill < 0.95) +
      chip('Strom', `${Math.round(F.power * 100)} %`, F.power < 0.999) +
      chip('Zufrieden', `${Math.round(F.happy * 100)} %`, F.happy < 0.5) +
      chip('Steuern', `+${fmtFlow(f.money)} G/s`, false);
    this.svg.innerHTML = this.draw(f);
    const list = f.issues.slice(0, 4);
    this.root.querySelector('[data-fl-issues]').innerHTML = list.length
      ? list.map((i) => `<li class="${i.sev >= 1.5 ? 'bad' : 'warn'}">⚠ ${esc(i.text)} <small>${esc(i.tip)}</small></li>`).join('')
      : '<li class="ok">✓ Keine Engpässe: alles fließt.</li>';
  }

  /** Graph als SVG: Spaltenköpfe, Linien (Breite = Menge je s), Knoten. */
  draw(f) {
    const H = TOP + (f.rows - 1) * PITCH + NH + 4;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const step = f.cols > 1 ? (W - NW) / (f.cols - 1) : 0;
    const nodes = Object.values(f.nodes);
    const pos = (n) => ({ x: n.col * step, y: TOP + n.row * PITCH });
    let h = '';
    // Spaltenköpfe
    for (let c = 0; c < f.cols; c++) {
      const here = nodes.filter((n) => n.col === c);
      const works = here.filter((n) => n.type === 'works');
      const later = works.some((n) => n.ins.some((id) => f.nodes[id].type === 'store')); // Werk nimmt aus einem Lager
      const t = c === 0 ? 'Förderung' : c === f.cols - 1 ? 'Lager · Verbrauch' : later ? 'Weiterverarbeitung' : works.length ? 'Werke' : here.some((n) => n.type === 'mid') ? 'Zwischenprodukt' : 'Zwischenlager';
      h += `<text class="fl-col" x="${c * step + NW / 2}" y="11">${t}</text>`;
    }
    // Linien: Anschlüsse je Knoten nach Reihe der Gegenseite gestaffelt
    const max = Math.max(0.5, ...f.links.map((l) => l.rate));
    const port = (n, id, side) => {
      const list = side === 'out' ? n.outs : n.ins;
      const sorted = [...list].sort((a, b) => f.nodes[a].row - f.nodes[b].row);
      const i = sorted.indexOf(id);
      return pos(n).y + NH / 2 + (i - (sorted.length - 1) / 2) * 12;
    };
    let labels = '';
    for (const l of f.links) {
      const a = f.nodes[l.from];
      const b = f.nodes[l.to];
      const x1 = pos(a).x + NW;
      const x2 = pos(b).x;
      const y1 = port(a, b.id, 'out');
      const y2 = port(b, a.id, 'in');
      const xm = (x1 + x2) / 2;
      const on = l.rate > 0.005;
      const w = on ? 2 + (12 * l.rate) / max : 1.5;
      h += `<path class="fl-link${on ? '' : ' off'}" d="M${x1} ${y1} C${xm} ${y1} ${xm} ${y2} ${x2} ${y2}" stroke="${COLOR[l.good] ?? '#9aa596'}" stroke-width="${w.toFixed(1)}"/>`;
      if (on) labels += `<text class="fl-rate" x="${x1 + 4}" y="${y1 - w / 2 - 3}">${fmtFlow(l.rate)}</text>`;
    }
    // Knoten
    for (const n of nodes) {
      const { x, y } = pos(n);
      let t1 = esc(n.name);
      let t2 = '';
      let bar = '';
      if (n.type === 'raw') {
        t1 += ` ×${n.count}`;
        t2 = `${fmtFlow(n.rate)} ${esc(n.unit)}/s`;
      } else if (n.type === 'works') {
        t1 += ` ×${n.count}`;
        t2 = `${fmtFlow(n.out)} / ${fmtFlow(n.cap)} ${UNIT[n.good] ?? n.good}/s`;
        if (n.count > 0) bar = `<rect class="fl-bar" x="10" y="${NH - 6}" width="${((NW - 20) * Math.min(1, n.util ?? 0)).toFixed(1)}" height="3" rx="1.5"/>`;
      } else if (n.type === 'mid') {
        // Zwischenprodukt (Roheisen): kein Lager, nur Menge je s
        t2 = `${fmtFlow(n.rate)} ${esc(n.unit)}/s · ohne Lager`;
      } else {
        t1 += `<tspan class="fl-where"> ${esc(n.where)}</tspan>`;
        t2 = n.made === null ? int(n.stock) : `${int(n.stock)} · +${fmtFlow(n.made)} −${fmtFlow(n.use)}/s`;
      }
      h +=
        `<g class="fl-node ${n.status}" transform="translate(${x.toFixed(1)} ${y})"><rect class="fl-box" width="${NW}" height="${NH}" rx="7"/>` +
        `<rect x="0" y="0" width="5" height="${NH}" rx="2" fill="${COLOR[n.type === 'works' ? n.good : n.key] ?? '#9aa596'}"/>` +
        `<text class="fl-t1" x="11" y="17">${t1}</text><text class="fl-t2" x="11" y="33">${t2}</text>` +
        `<text class="fl-t3" x="11" y="47">${esc(n.note)}</text>${bar}</g>`;
    }
    return h + labels;
  }

  destroy() {
    document.body.classList.remove('flow-open');
    this.root.remove();
  }
}

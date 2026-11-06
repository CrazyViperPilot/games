// Baumodus der Stadt (PRD §15, seit v4.82 direkt auf der Karte): Werkzeugleiste rechts, schmaler Streifen mit Zahlen oben.
// Mit einem Finger oder der linken Maustaste zieht man auf der Karte ein Rechteck (Input ruft begin/move/end), zwei Finger
// schieben und zoomen weiter. Das Spiel läuft weiter. Liest game.city und ändert es nur über game.issue(team, { type: 'city', … }).
// Dazu das Marktmenü (MarketPanel, seit v4.94): Fenster zum Handeln, geöffnet über Geldanzeige, Markt-Auswahl oder „Handel“.
import { CITY } from '../data/city.js';
import { BALANCE } from '../data/balance.js';
import { KINDS, KIND_NAME, GOODS, CITY_STORE_GOODS, cellAt, hasMarket, sizeOf, bigAnchorAt } from '../game/city.js';

// Farben je Zellenart (Werkzeug, Grundstück, Symbol auf der Karte): Wohnen grün (privat), Gewerbe blau (kommerziell), Werke erdig,
// Markt gold, Militär (Kaserne, Fabrikhalle, Heliport) oliv. Symbole: Werkzeugleiste und Schilder über den Gebäuden (citylayer.js).
export const CITY_COLORS = { road: '#8a8f86', res: '#4f9a5a', com: '#3f7fd0', bm: '#b0743c', mun: '#8b96a8', fuel: '#9b7bc4', steel: '#7f8c99', mine: '#c9a14a', market: '#e6b422', power: '#e0c040', uni: '#6fa8dc', dc: '#4fc3c7', barracks: '#7d8f45', factory: '#7d8f45', heliport: '#7d8f45', hospital: '#e8707e', airport: '#7d8f45', runway: '#5b5f63', taxi: '#a9a89f', stand: '#6f7d4a', atc: '#4f7fa8', ktank: '#56b3e6', mdepot: '#b88a3a', smelter: '#a0522d', kero: '#56b3e6', erase: '#d05050' };
export const CITY_ICON = { road: '▬', res: '⌂', com: '▣', bm: '⚒', mun: '✸', fuel: '⛽', steel: '⛓', mine: '⛏', market: '⚖', power: '⚡', uni: '🎓', dc: '🖥', barracks: '⚔', factory: '🔧', heliport: '🚁', hospital: '✚', airport: '✈', runway: '🛫', taxi: '▦', stand: '✈', atc: '📡', ktank: '⛽', mdepot: '🚀', smelter: '🔥', kero: '🛢', erase: '✕' };
const ICON = CITY_ICON;
const CARE = CITY.care.by;
const SHORT = { road: 'Straße', res: 'Wohnen', com: 'Gewerbe', bm: 'BM-Werk', mun: 'Mun.-Werk', fuel: 'Raffinerie', steel: 'Stahlwerk', smelter: 'Hütte', kero: 'Kerosin-Raf.', mine: 'Förderung', market: 'Markt', power: 'Kraftwerk', uni: 'Universität', dc: 'Rechenz.', barracks: 'Kaserne', factory: 'Fabrikhalle', heliport: 'Heliport', hospital: 'Krankenhaus', airport: 'Flughafen', runway: 'Bahn', taxi: 'Rollfeld', stand: 'Stellplatz', atc: 'Tower', ktank: 'Kero-Tank', mdepot: 'Mun.-Lager', erase: 'Räumen' };
export const CITY_TIP = {
  taxi: 'Rollfeld (seit v5.37): Beton wie eine Straße ziehen, sofort fertig. Flugzeuge rollen darüber zwischen Stellplätzen und Bahn; ein Stellplatz braucht Rollfeld, Bahn oder Straße direkt daneben und darüber einen Weg zur Bahn',
  runway: `Start-/Landebahn (seit v5.35): Zellen wie eine Straße ziehen; ein gerader Streifen ${CITY.air.runwayWidth} breit und mindestens ${CITY.air.runwayMin} lang (waagrecht oder senkrecht) ist die Bahn, weitere Bahnzellen daneben zählen als Rollfeld. Flugzeuge rollen über Bahn, Rollfeld und Straßen zu den Stellplätzen. Jeder Start und jede Landung sperrt die Bahn ${CITY.air.sep} s (mit Tower ${CITY.air.sepAtc} s); mehr Bahnen = mehr Flugbetrieb`,
  stand: `Großbau 2 × 2 (seit v5.35): Stellplatz für ein Kampfflugzeug, baut es auch (F-16). Gebaut als offener Stellplatz; ausbauen nur am gewählten Stellplatz mit „Ausbauen“ (U): Stufe 2 Überdachung (${CITY.air.upgrade[2].money} G + ${CITY.air.upgrade[2].bm} BM, halber Schaden), Stufe 3 Stahlbeton-Shelter (${CITY.air.upgrade[3].money} G + ${CITY.air.upgrade[3].bm} BM + ${CITY.air.upgrade[3].steel} Stahl, ${Math.round(CITY.air.shelter[3] * 100)} % Schaden). Braucht eine Straße oder Bahn daneben, über die das Flugzeug zur Bahn rollt`,
  atc: `Großbau 2 × 2 (seit v5.35): Tower mit Radar. Bahnen im Umkreis von ${CITY.air.atcRadius} Feldern sind nach jedem Start oder jeder Landung schon nach ${CITY.air.sepAtc} statt ${CITY.air.sep} s wieder frei; weite Sicht`,
  ktank: `Großbau 2 × 2 (seit v5.35): Kerosintank. Wird über die Straße aus dem Kerosin des Stadtlagers befüllt; Flugzeuge auf Stellplätzen im Umkreis von ${CITY.air.supplyRadius} Feldern tanken daraus`,
  mdepot: `Großbau 2 × 2 (seit v5.35): Munitionslager. Wird über die Straße aus dem Lager der Hauptstadt befüllt; Flugzeuge auf Stellplätzen im Umkreis von ${CITY.air.supplyRadius} Feldern laden daraus nach`,
  bm: 'Großbau 2 × 2 (Ziegelei mit Holzlager): Baumaterial aus Holz und Stein (Holzfäller, Steinbruch)', mun: 'Großbau 2 × 2 (Bunker mit Riesenpatrone): Munition aus Stahl',
  fuel: 'Großbau 2 × 2 (großer Öltank, Destillationstürme): Treibstoff aus Öl (Ölquelle)',
  steel: 'Großbau 2 × 2 (Stahlwerk mit Walzstraße): Stahl aus Roheisen (Hütte)', smelter: `Großbau ${CITY.size.smelter} × ${CITY.size.smelter} Zellen (Hochofen mit Glut und Schornstein): Roheisen aus Erz (Erzmine); das Roheisen fährt zum Stahlwerk`,
  kero: `Großbau ${CITY.size.kero} × ${CITY.size.kero} Zellen (Kugeltanks mit blauen Tankringen): Kerosin aus Öl (Ölquelle), Vorrat im Stadtlager; für den Kerosintank des Fliegerhorsts (F-16 und Hubschrauber)`, mine: 'Nur auf Rohstoffvorkommen: Holzfäller, Steinbruch, Erzmine oder Ölquelle; braucht eine Straße zum passenden Werk (Holz, Stein → BM-Werk, Erz → Hütte, Öl → Raffinerie)',
  market: 'Handel: Überschuss verkaufen, Knappes teuer kaufen (Knopf Handel, Markt antippen oder Geldanzeige oben)', road: 'Kostet Baumaterial aus dem Lager der Hauptstadt',
  power: `Großbau ${CITY.size.power} × ${CITY.size.power} Zellen: Strom für Werke, Förderung, Uni und Rechenzentrum (stadtweit); ohne genug Strom arbeiten sie langsamer`,
  uni: 'Großbau 3 × 3 Zellen (antippen, das Quadrat folgt dem Finger; Straße an einer Seite); ohne fertige Universität ruht jede Forschung (eine reicht)',
  dc: `Beschleunigt die Forschung: jede Stufe jedes Rechenzentrums +${Math.round(CITY.research.dcSpeed * 100)} % (höchstens ${CITY.research.maxSpeed}-fach)`,
  barracks: `Großbau ${CITY.size.barracks} × ${CITY.size.barracks} Zellen: bildet Soldaten aus (Schützen, Panzerabwehr, Scharfschützen, Kommandeur); bezahlt direkt aus der Stadt. Heilt Soldaten im Umkreis von ${CARE.barracks.radius} Feldern`,
  factory: `Großbau ${CITY.size.factory} × ${CITY.size.factory} Zellen: baut alle Fahrzeuge (LKW, Baufahrzeug, Schützen- und Kampfpanzer, Flak, SAM); bezahlt direkt aus der Stadt. Repariert Bodenfahrzeuge im Umkreis von ${CARE.factory.radius} Feldern (kostet Stahl)`,
  heliport: `Landeplatz für einen Hubschrauber (seit v5.50): baut ihn (Little Bird, Transporter, AH-64, bezahlt aus der Stadt), er startet und landet hier senkrecht. Gelandet tankt und lädt er aus Kerosintank und Munitionslager im Umkreis von ${CITY.air.supplyRadius} Feldern; Tower in der Nähe: Luftraum nach Start/Landung ${CITY.air.heli.sepAtc} statt ${CITY.air.heli.sep} s gesperrt. Repariert Hubschrauber im Umkreis von ${CARE.heliport.radius} Feldern (kostet Stahl)`,
  airport: `Großbau ${CITY.size.airport} × ${CITY.size.airport} Zellen mit zwei Start- und Landebahnen und Tower; baut F-16 (bezahlt direkt aus der Stadt) und bietet Platz für ${BALANCE.jets.capacity} Flugzeuge, die dort landen, tanken, nachladen und repariert werden`,
  erase: 'Entfernt eigene Stadtzellen (ohne Erstattung), fällt Bäume und Wald und reißt leere Häuser, Hallen und Fabriken der Karte ab, damit dort gebaut werden kann (Fels, Wasser, Türme, besetzte Häuser bleiben)',
  hospital: `Heilt eigene Soldaten im Umkreis von ${CARE.hospital.radius} Feldern, schneller als die Kaserne (${Math.round(CARE.hospital.rate * 100)} % HP/s auf Stufe 1)`,
};
const GOOD_NAME = { bm: 'BM', mun: 'MUN', fuel: 'TS', metal: 'Stahl', kero: 'Kerosin' };
const GOOD_LONG = { bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff', metal: 'Stahl', kero: 'Kerosin' };
/**
 * Werkzeuge in Gruppen (seit v5.36, Daniels Wunsch „Baumenü strukturieren“): Straße und Räumen, Wohnen und Gewerbe, Förderung,
 * Werke (Ressourcen), Einheiten, Stadtdienste, Fliegerhorst. Alte, nicht mehr baubare Arten (Flughafen) fehlen; eine neue Art ohne
 * Gruppe landet unter „Weitere“, damit sie nicht verloren geht.
 */
const GROUPS = [
  ['Grundlagen', ['road', 'erase']],
  ['Wohnen & Gewerbe', ['res', 'com', 'market']],
  ['Förderung', ['mine']],
  ['Ressourcen', ['bm', 'smelter', 'steel', 'mun', 'fuel', 'kero', 'power']],
  ['Einheiten', ['barracks', 'factory', 'heliport']],
  ['Stadt', ['uni', 'dc', 'hospital']],
  ['Fliegerhorst', ['runway', 'taxi', 'stand', 'atc', 'ktank', 'mdepot']],
];
const GROUPED = new Set(GROUPS.flatMap(([, ks]) => ks));
const REST = KINDS.filter((k) => !GROUPED.has(k) && !CITY.retired?.includes(k));
if (REST.length) GROUPS.push(['Weitere', REST]);
export const TOOL_GROUPS = GROUPS.map(([name, ks]) => [name, ks.filter((k) => k === 'erase' || (KINDS.includes(k) && !CITY.retired?.includes(k)))]);
const fmt = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

export class CityPanel {
  constructor(parent, game, team, onMessage = () => {}, onShow = null, onTrade = null) {
    this.onShow = onShow; // (x, y) => Kamera auf die Stadt (main.js)
    this.onTrade = onTrade; // () => Marktmenü öffnen (main.js)
    this.game = game;
    this.team = team;
    this.onMessage = onMessage;
    this.tool = 'road';
    this.drag = null; // { c0, r0, c1, r1 } in Kartenzellen, während ein Rechteck gezogen wird
    this.open = false;
    const strip = document.createElement('div');
    strip.className = 'city-strip';
    strip.hidden = true;
    const root = document.createElement('div');
    root.className = 'city-bar';
    root.hidden = true;
    root.innerHTML = `
      <div class="city-tools">${TOOL_GROUPS.map(([group, tools]) => `<div class="ctool-head">${group}</div>${tools.map((k) => {
        const n = k === 'erase' ? 1 : sizeOf(k);
        const price = k === 'erase' ? 'gratis' : [CITY.cost[k] ? `${CITY.cost[k]} G` : '', CITY.costBm[k] ? `${CITY.costBm[k]} BM` : '', n > 1 ? `${n}×${n}` : ''].filter(Boolean).join(' + ').replace(/ \+ (\d+×)/, ' · $1');
        const name = k === 'erase' ? 'Räumen' : KIND_NAME[k];
        return `<button type="button" class="ctool" data-tool="${k}" title="${name}${CITY_TIP[k] ? `: ${CITY_TIP[k]}` : ''}" style="--c:${CITY_COLORS[k]}"><i>${ICON[k]}</i><span>${SHORT[k]}</span><small>${price}</small></button>`;
      }).join('')}`).join('')}</div>
      <div class="city-acts"><button type="button" class="btn-sm city-fold" data-fold title="Menü einklappen (Stadt-Knopf klappt es wieder auf)">▴ Einklappen</button><button type="button" class="btn-sm" data-tradeview title="Marktmenü: kaufen und verkaufen (braucht einen fertigen Markt)">Handel</button><button type="button" class="btn-sm" data-show>Zur Stadt</button><button type="button" class="btn-sm city-done" data-close>Fertig (Y)</button></div>`;
    parent.appendChild(strip);
    parent.appendChild(root);
    this.root = root;
    this.strip = strip;
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.toggle(false);
      if (e.target.closest('[data-fold]')) this.fold(true);
      if (e.target.closest('[data-show]')) {
        const m = this.game.mainFob(this.team);
        if (m) this.onShow?.(m.x, m.y);
      }
      if (e.target.closest('[data-tradeview]')) this.onTrade?.();
      const t = e.target.closest('[data-tool]');
      if (t) {
        this.tool = t.dataset.tool;
        this.mark();
      }
    });
    this.mark();
  }

  mark() {
    this.root.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
  }

  /** Menü einklappen (Baumodus bleibt, mehr Platz auf dem Bildschirm) oder wieder aufklappen. */
  fold(on) {
    this.folded = on;
    this.root.hidden = on || !this.open;
    this.strip.hidden = on || !this.open;
    document.body.classList.toggle('city-folded', on && this.open);
    if (!on && this.open) this.update(true);
  }

  toggle(on = !this.open) {
    this.open = on;
    this.folded = false;
    document.body.classList.remove('city-folded');
    this.root.hidden = !on;
    this.strip.hidden = !on;
    this.drag = null;
    document.body.classList.toggle('city-mode', on);
    if (on) this.update(true);
  }

  /** Zelle unter einem Weltpunkt, auf die Karte begrenzt. */
  cell(wx, wy) {
    const c = this.game.city[this.team];
    const [col, row] = cellAt(c, wx, wy);
    return [Math.min(c.cols - 1, Math.max(0, col)), Math.min(c.rows - 1, Math.max(0, row))];
  }

  begin(wx, wy) {
    const [c, r] = this.cell(wx, wy);
    this.drag = { c0: c, r0: r, c1: c, r1: r };
    if (sizeOf(this.tool) > 1) this.move(wx, wy);
  }

  move(wx, wy) {
    if (!this.drag) return;
    [this.drag.c1, this.drag.r1] = this.cell(wx, wy);
    if (sizeOf(this.tool) > 1) {
      // Großbau: das Quadrat folgt dem Finger (seit v5.08 mit der Mitte am Finger, auch bei gerader Kantenlänge)
      [this.drag.c1, this.drag.r1] = bigAnchorAt(this.game.city[this.team], this.tool, wx, wy);
      [this.drag.c0, this.drag.r0] = [this.drag.c1, this.drag.r1];
    }
  }

  cancel() {
    this.drag = null;
  }

  end(wx, wy) {
    if (!this.drag) return;
    this.move(wx, wy);
    const d = this.drag;
    this.drag = null;
    const res = this.game.issue(this.team, { type: 'city', kind: this.tool, ...d });
    if (!res.ok) this.onMessage(res.reason);
    else if (res.broke) this.onMessage(this.tool === 'road' ? 'Zu wenig Baumaterial für alle Zellen' : 'Zu wenig Geld für alle Zellen');
    else if (res.occupied) this.onMessage('Belegte Zellen bleiben, wie sie sind: erst räumen');
    else if (res.kept) this.onMessage('Geräumt; Rohstoffvorkommen und Förderanlagen bleiben stehen (Förderanlage einzeln wählen und abreißen)');
    else if (res.felled) this.onMessage(`Bäume gefällt: ${res.felled} ${res.felled === 1 ? 'Zelle' : 'Zellen'} frei zum Bauen`);
    else if (res.noRoad) this.onMessage('Gebäude wachsen nur mit Straße daneben (Wohnen/Gewerbe auch über eine Zelle gleicher Art)');
    this.update(true);
  }

  update(force = false) {
    if (!this.open) return;
    const now = performance.now();
    if (!force && now - (this.last || 0) < 250) return;
    this.last = now;
    const g = this.game;
    const s = g.city[this.team].stats;
    const m = g.mainFob(this.team);
    const fled = s.fled ? ` (${fmt(s.fled)} geflohen)` : '';
    const raw = s.raw;
    const c = g.city[this.team];
    const stahl = `Stahl ${fmt(c.metal)} ${s.metal >= 0 ? '+' : ''}${fmt(s.metal, 1)}`;
    const kero = `Kerosin ${fmt(c.kero)} +${fmt(s.kero, 1)}`; // Kerosin im Stadtlager, Ertrag je s (seit v5.20)
    const store = m ? `${stahl} · Förderung Holz ${fmt(raw.wood, 1)} Stein ${fmt(raw.stone, 1)} Erz ${fmt(raw.ore, 1)} Öl ${fmt(raw.oil, 1)} · Lager BM ${fmt(m.store.bm)} +${fmt(s.bm, 1)} · MUN ${fmt(m.store.mun)} +${fmt(s.mun, 1)} · TS ${fmt(m.store.fuel)} +${fmt(s.fuel, 1)} · ${kero}` : `${stahl} · ${kero} · Hauptstadt zerstört`;
    // Straßentransport (seit v5.20): kleinster Stau-Faktor auf den benutzten Straßen, Waren ohne Weg je s
    const jam = s.jam ?? 1;
    const jamTxt = Math.round(jam * 100) < 100 ? ` · <b class="warn">Stau ${fmt(Math.round(jam * 100))} %</b>` : '';
    const lostTxt = (s.lost ?? 0) > 0 ? ` · <b class="warn">ohne Weg ${fmt(s.lost, 1)}/s</b>` : '';
    this.strip.innerHTML = `<span>Strom ${fmt(s.powerSupply)}/${fmt(s.powerUse)}${s.powerRatio < 1 ? ' ⚠' : ''} · Zufriedenheit ${fmt(s.happy * 100)} % · Einwohner ${fmt(s.pop)}/${fmt(s.housing)}${fled} · Truppen ${fmt(s.drafted)} · frei ${fmt(Math.max(0, s.free))} · Arbeit ${fmt(s.workers)}/${fmt(s.jobs)} · Steuern +${fmt(s.money, 1)}/s</span><span class="city-store">${store}${jamTxt}${lostTxt}</span>`;
  }

  destroy() {
    document.body.classList.remove('city-mode');
    this.root.remove();
    this.strip.remove();
  }
}

/**
 * Marktmenü (PRD §15, seit v4.94): kleines Fenster oben in der Mitte, das Spiel läuft weiter. Je Ware Bestand, Verkaufen und
 * Kaufen in Losen (CITY.market.lot). Öffnet über die Geldanzeige oben, die Aktion „Handel“ eines gewählten Markts oder den
 * Knopf „Handel“ im Baumodus, nur mit fertigem Markt. Handelt nur über game.issue(team, { type: 'trade', … }).
 */
export class MarketPanel {
  constructor(parent, game, team, onMessage = () => {}) {
    this.game = game;
    this.team = team;
    this.onMessage = onMessage;
    this.open = false;
    const M = CITY.market;
    const root = document.createElement('div');
    root.className = 'market';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Markt');
    root.innerHTML = `
      <div class="mk-head"><b>⚖ Markt</b><span class="mk-money" data-mk-money></span><button type="button" class="btn-sm mk-close" data-mk-close title="Schließen (Esc)" aria-label="Schließen">✕</button></div>
      <div class="mk-rows">${GOODS.map((g) => `<div class="mk-row"><span class="mk-good" title="${GOOD_LONG[g]}${CITY_STORE_GOODS.includes(g) ? ' (Stadtlager)' : ' (Lager der Hauptstadt)'}"><b>${GOOD_NAME[g]}</b><small data-mk-have="${g}">0</small></span>` +
        `<button type="button" class="btn-sm mk-sell" data-trade="${g}" data-dir="sell" title="${M.lot} ${GOOD_LONG[g]} verkaufen">Verkaufen <b>+${M.sell[g]}</b></button>` +
        `<button type="button" class="btn-sm mk-buy" data-trade="${g}" data-dir="buy" title="${M.lot} ${GOOD_LONG[g]} kaufen">Kaufen <b>−${M.buy[g]}</b></button></div>`).join('')}</div>
      <small class="mk-note">Je ${M.lot} Stück, Preise in Geld. BM, MUN, TS im Lager der Hauptstadt, Stahl und Kerosin im Stadtlager.</small>`;
    parent.appendChild(root);
    this.root = root;
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-mk-close]')) {
        this.toggle(false);
        return;
      }
      const tr = e.target.closest('[data-trade]');
      if (!tr) return;
      const res = this.game.issue(this.team, { type: 'trade', good: tr.dataset.trade, dir: tr.dataset.dir });
      if (!res.ok) this.onMessage(res.reason);
      this.update(true);
    });
  }

  /** Öffnen (nur mit fertigem Markt, sonst Hinweis) oder schließen. */
  toggle(on = !this.open) {
    if (on && !hasMarket(this.game, this.team)) {
      this.onMessage('Erst einen Markt bauen: Stadt (Y) → Werkzeug Markt');
      on = false;
    }
    this.open = on;
    this.root.hidden = !on;
    if (on) this.update(true);
  }

  update(force = false) {
    if (!this.open) return;
    const now = performance.now();
    if (!force && now - (this.last || 0) < 250) return;
    this.last = now;
    if (!hasMarket(this.game, this.team)) {
      this.toggle(false); // Markt zerstört oder abgerissen
      this.onMessage('Kein Markt mehr: Handel geschlossen');
      return;
    }
    const g = this.game;
    const M = CITY.market;
    const L = BALANCE.logistics;
    const money = g.teams[this.team].res.money;
    const main = g.mainFob(this.team);
    this.root.querySelector('[data-mk-money]').textContent = `Geld ${fmt(Math.floor(money))}`;
    for (const k of GOODS) {
      const inCity = CITY_STORE_GOODS.includes(k);
      const have = inCity ? g.city[this.team][k] : main ? main.store[k] : 0;
      this.root.querySelector(`[data-mk-have="${k}"]`).textContent = main || inCity ? fmt(Math.floor(have)) : '–';
      const sell = this.root.querySelector(`[data-trade="${k}"][data-dir="sell"]`);
      const buy = this.root.querySelector(`[data-trade="${k}"][data-dir="buy"]`);
      // ausgegraut, aber antippbar: der Grund kommt dann als Meldung
      sell.classList.toggle('off', (!main && !inCity) || have < M.lot);
      buy.classList.toggle('off', (!main && !inCity) || money < M.buy[k] || have + M.lot > (inCity ? L.storeCap : L.capitalCap));
    }
  }

  destroy() {
    this.root.remove();
  }
}

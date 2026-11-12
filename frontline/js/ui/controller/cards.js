// Spieler-Steuerung, Befehlskarte: Einträge je Auswahl und Gebäude, Gründe für gesperrte Einträge (Geld, Lager, Ausbildung).
// Methoden der Klasse Controller (js/ui/controller.js), eingehängt über Object.assign. Kein DOM.

import { freePop, crewOf } from '../../game/city/query.js';
import { KINDS as CITY_KINDS } from '../../data/citykinds.js';
import { trainCheck, standsOf, standRoute } from '../../game/aircraft.js';
import { heliTrainCheck, isHeliport } from '../../game/helipad.js';
import { CITY } from '../../data/city.js';
import { BALANCE } from '../../data/balance.js';
import { UNITS } from '../../data/units.js';
import { BUILDINGS } from '../../data/buildings.js';
import { canBuild } from '../../game/construction.js';
import { canGarrison } from '../../game/garrison.js';
import { FORMATION_NAMES } from '../../game/formation.js';
import { hasCommander } from '../../game/commander.js';
import { hasUnlock } from '../../game/research.js';
import { RESEARCH } from '../../data/research.js';
import { canShellRoads } from '../../game/roadwar.js';
import { isCarrier } from './util.js';
import { MODES } from './modes.js';

const BUILD_MENU = Object.keys(BUILDINGS).filter((k) => BUILDINGS[k].hotkey && BUILDINGS[k].buildable !== false);
const FORTIFY_KEYS = [['sandbags', 'Z'], ['mgnest', 'N'], ['wire', 'W']];
const FW = BALANCE.garrison.works; // Wirkung der Ausbauten aus den Daten (Prozente)
const pct = (x) => Math.round(x * 100);
const FORTIFY_TIPS = {
  sandbags: `Das Haus hält ${pct(FW.sandbags.hpMult - 1)} % mehr aus, Splitter treffen die Besatzung nur mit ${pct(FW.sandbags.spillMult)} %.`,
  mgnest: `Die Besatzer schießen ${pct(FW.mgnest.fire - 1)} % schneller.`,
  wire: `Stürmer machen nur ${pct(FW.wire.stormMult)} % Schaden.`,
};
const RES_KEYS = ['money', 'bm', 'mun', 'fuel'];
const CARGO_KEYS = ['bm', 'mun', 'fuel']; // Lagersorten (FOB-Lager, LKW-Ladung)
const SHORT = { money: 'G', bm: 'BM', mun: 'MUN', fuel: 'TS' };

// Kurznamen für die Befehlskarte (der volle Name steht im Tooltip)
const RADIO_TIP = `. Zweite Siegbedingung: steht er fertig ${Math.round(BALANCE.radio.hold / 60)} min, gewinnst du. Der Gegner sieht ihn dann überall. Nur einer je Team.`;
const CMD = BALANCE.commander;
const COMMANDER_TIP = `. Einmalig, belegt keinen Platz. Aura ${CMD.aura} px: eigene Einheiten schießen ${Math.round((CMD.fireRate - 1) * 100)} % schneller, verletzte Infanterie heilt. Fällt er, bekommt der Gegner ${CMD.deathPoints} Punkte.`;

// Ladungsart: Taste, Kurzname, Bezeichnung
const PRESET_BTN = [
  ['mix', 'Q', 'Gemischt', 'Gemischt'],
  ['bm', 'W', 'Baumat.', 'Baumaterial'],
  ['mun', 'E', 'Munition', 'Munition'],
  ['fuel', 'R', 'Treibstoff', 'Treibstoff'],
];

/** Lager (FOB oder LKW) deckt die Kosten (nur Sorten bm/mun/fuel). */
const covers = (st, cost) => CARGO_KEYS.every((k) => (st[k] || 0) >= (cost[k] || 0));

/** Kosten kurz für Schaltflächen: "400 BM". */
export function costText(cost) {
  return RES_KEYS.filter((k) => cost[k]).map((k) => `${cost[k]} ${SHORT[k]}`).join(' · ');
}

function longCost(cost) {
  return RES_KEYS.filter((k) => cost[k]).map((k) => `${cost[k]} ${BALANCE.resNames[k]}`).join(', ');
}

/** Eintrag der Befehlskarte. */
function entry(label, hotkey, o = {}) {
  return {
    label,
    hotkey,
    cost: o.cost || '',
    tip: o.tip || label,
    enabled: o.enabled !== false,
    reason: o.reason || '',
    active: !!o.active,
    action: o.action,
  };
}

export const cardMethods = {
  // ---- Modi ---------------------------------------------------------------------

  /** Wer darf bauen: 'all' (Baufahrzeug), 'fort' (nur Infanterie: Mauer/Tor) oder null (mit Grund). */
  buildPermission() {
    const units = this.selectedUnits();
    if (units.some((u) => u.def.builder === 'all')) return { level: 'all', reason: '' };
    if (units.some((u) => u.def.builder === 'fort')) return { level: 'fort', reason: '' };
    return { level: null, reason: 'Baufahrzeug oder Infanterie wählen' };
  },

  // ---- Gründe für gesperrte Schaltflächen ----------------------------------------

  /** Fehlt Geld für die Kosten? Text „Fehlt: n Geld“ oder "". */
  moneyReason(cost) {
    const have = this.game.teams[this.team].res.money;
    const need = cost.money || 0;
    return have >= need ? '' : `Fehlt: ${Math.ceil(need - have)} ${BALANCE.resNames.money}`;
  },

  /** Hat eine fertige eigene FOB ein Lager, das alle Sorten der Kosten deckt? */
  anyFobCovers(cost) {
    return this.game.buildings.some((b) => b.alive && b.built && b.team === this.team && b.type === 'fob' && covers(b.store, cost));
  },

  /** Grund, wenn kein FOB-Lager die Sorten der Kosten deckt (ohne Ort: für Befehlskarte). */
  lagerReason(cost) {
    const fobs = this.game.buildings.filter((b) => b.alive && b.built && b.team === this.team && b.type === 'fob');
    if (!fobs.length) return 'Keine fertige FOB';
    const miss = CARGO_KEYS.filter((k) => (cost[k] || 0) > 0 && !fobs.some((f) => f.store[k] >= cost[k])).map(
      (k) => BALANCE.resNames[k],
    );
    if (miss.length) return `FOB-Lager: zu wenig ${miss.join(', ')}`;
    return 'FOB-Lager: keine einzelne FOB deckt alle Kosten';
  },

  /** Grund für ein Gebäude im Baumenü: Geld, dann Lager (Mauer/Tor prüft die Platzierung selbst). */
  buildReason(key) {
    const def = BUILDINGS[key];
    if (def.unique && this.game.buildings.some((b) => b.alive && b.team === this.team && b.type === key)) return `Nur ein ${def.name} je Team`;
    const cost = def.cost;
    const money = this.moneyReason(cost);
    if (money) return money;
    if (key === 'wall' || key === 'gate') return '';
    return this.anyFobCovers(cost) ? '' : this.lagerReason(cost);
  },

  /** Grund für Ausbildung in der Hauptstadt: Geld oder Einheitenlimit. */
  trainReason(cost) {
    const money = this.moneyReason(cost);
    if (money) return money;
    return '';
  },

  /** Befehlskarte für Auswahl bzw. Modus. Einträge: { label, hotkey, cost, tip, enabled, reason, active, action }. */
  commandCard() {
    const m = this.view.mode;
    if (MODES[m]?.target) {
      return [entry('Abbruch', 'Esc', { tip: 'Abbrechen (Esc)', action: () => this.cancel() })];
    }
    if (m === 'build') return this.buildCard();
    const card = this.selectionCard();
    // Abwählen auch per Touch (Tippen auf den Boden schickt gewählte Einheiten sonst los)
    if (this.view.selection.size) {
      card.push(entry('Abwählen', 'Esc', { tip: 'Auswahl aufheben (Esc)', action: () => this.view.selection.clear() }));
    }
    return card;
  },

  /** Baumenü: Baufahrzeug alles, Infanterie nur Mauer/Tor (FOBs: FOB-Fahrzeug, Aufbauen). */
  buildCard() {
    const perm = this.buildPermission();
    const card = [];
    if (perm.level) {
      for (const key of BUILD_MENU) {
        if (perm.level === 'fort' && !canBuild({ builder: 'fort' }, key)) continue;
        const def = BUILDINGS[key];
        if (def.radio && !this.game.radioWin) continue; // Sendemast nur, wenn in der Partie eingeschaltet
        const reason = this.buildReason(key);
        card.push(
          entry(def.short || def.name, def.hotkey, {
            cost: costText(def.cost),
            tip: `${def.name}: ${longCost(def.cost)}${def.slots > 1 ? `, ${def.slots} Plätze` : ''}${def.radio ? RADIO_TIP : ''}`,
            enabled: !reason,
            reason,
            action: () => this.beginPlacement(key),
          }),
        );
      }
    }
    card.push(entry('Zurück', 'Esc', { tip: 'Zurück zu den Befehlen (Esc)', action: () => this.cancel() }));
    return card;
  },

  selectionCard() {
    const sel = this.selected();
    const units = sel.filter((e) => e.kind === 'unit');
    const blds = sel.filter((e) => e.kind === 'building');
    if (!units.length && blds.length === 1 && blds[0].type === 'city') return this.cityCard(blds[0]);
    if (!units.length && blds.length) return this.buildingCard(blds);

    const perm = this.buildPermission();
    const card = [];
    // Hubschrauber bauen nicht: ohne Bodeneinheit in der Auswahl entfällt das Baumenü
    if (!units.length || units.some((u) => !u.def.air)) {
      card.push(
        entry('Bauen', 'B', {
          tip: perm.level ? 'Baumenü öffnen (B)' : perm.reason,
          enabled: !!perm.level,
          reason: perm.reason,
          action: () => this.startBuildMenu(),
        }),
      );
    }
    card.push(
      entry('Angriff', 'A', {
        tip: 'Angriffsbewegung (A, dann Ziel anklicken). Auf eine Brücke geklickt: die Einheiten beschießen sie, bis sie einstürzt.',
        enabled: units.length > 0,
        reason: 'Keine Einheit gewählt',
        action: () => this.startAttackMove(),
      }),
      entry('Stopp', 'S', {
        tip: 'Gewählte Einheiten anhalten (S)',
        enabled: units.length > 0,
        reason: 'Keine Einheit gewählt',
        action: () => this.stop(),
      }),
      entry(FORMATION_NAMES[this.formation], 'F', {
        tip: 'Formation (F): Locker, Linie, Keil oder Kolonne für Marsch- und Angriffsbefehle. Panzer vorn, Infanterie dahinter; die Gruppe hält das Tempo der langsamsten Einheit.',
        active: this.formation !== 'loose',
        enabled: units.filter((u) => !u.def.air).length >= 2,
        reason: 'Formation braucht mindestens zwei Bodeneinheiten',
        action: () => this.cycleFormation(),
      }),
    );
    if (this.game.research) {
      const ground = units.filter((u) => !u.def.armor || u.def.armor !== 'inf');
      if (ground.length && hasUnlock(this.game, this.team, 'smoke')) {
        const cd = Math.ceil(Math.max(0, ...ground.map((u) => u.abilityCd || 0)));
        card.push(
          entry('Nebel', 'N', {
            tip: `Nebelwand (N): legt an der Stelle der gewählten Fahrzeuge Rauch (${RESEARCH.smoke.life} s). Eigene Einheiten darin nehmen halb so viel Schaden. Ladezeit ${RESEARCH.smoke.cd} s.`,
            enabled: units.every((u) => !(u.abilityCd > 0)) || ground.some((u) => !(u.abilityCd > 0)),
            reason: `Noch nicht bereit (${cd} s)`,
            action: () => this.issue({ type: 'smoke', ids: ground.map((u) => u.id) }),
          }),
        );
      }
      const engs = units.filter((u) => u.type === 'engineer');
      if (engs.length && hasUnlock(this.game, this.team, 'mines')) {
        card.push(
          entry('Mine', 'Z', {
            tip: `Mine legen (Z): das Baufahrzeug legt an seiner Stelle eine Mine, unsichtbar für den Gegner. Sie trifft Bodeneinheiten des Gegners im Umkreis ${RESEARCH.mine.blast} px mit ${RESEARCH.mine.damage} Schaden. Höchstens ${RESEARCH.mine.max}, Ladezeit ${RESEARCH.mine.cd} s.`,
            enabled: engs.some((u) => !(u.abilityCd > 0)),
            reason: 'Noch nicht bereit',
            action: () => this.issue({ type: 'mine', ids: engs.map((u) => u.id) }),
          }),
        );
      }
      if (units.some((u) => u.def.bridgelayer)) {
        card.push(
          entry('Brücke legen', 'C', {
            tip: 'Brücke legen (C): der Brückenleger legt auf einer Flusszelle am Ufer eine Behelfsbrücke (nach 8 s befahrbar, eine je Fahrzeug).',
            action: () => this.setMode('layBridge'),
          }),
        );
      }
      const sappers = units.filter((u) => u.type === 'sapper');
      if (sappers.length) {
        card.push(
          entry('Mine legen', 'Q', {
            tip: 'Mine legen (Q): der Pionier legt an der Klickstelle eine getarnte Panzermine (Munition aus dem Teamlager, je Pionier nur wenige aktiv). Sie löst bei gegnerischen Fahrzeugen aus, Infanterie nicht.',
            action: () => this.setMode('layMine'),
          }),
        );
      }
    }
    const deployers = units.filter((u) => u.def.deploys);
    if (deployers.length) {
      const p = this.game.deploySpot(this.team, 'fob', deployers[0].x, deployers[0].y);
      const share = Math.round(BALANCE.fob.startStock * 100);
      card.push(
        entry('Aufbauen', 'D', {
          tip: `Aufbauen (D): das FOB-Fahrzeug wird an seiner Stelle (oder der nächsten freien daneben) sofort zur fertigen FOB, ohne Bauzeit. Sie startet mit ${share} % ihres Lagers je Sorte (${Math.round(BALANCE.logistics.storeCap * BALANCE.fob.startStock)} Baumaterial, Munition und Treibstoff). Abstand zu eigenen FOBs mindestens ${BALANCE.fob.minDistOwn} px, zu Gegnern ${BALANCE.fob.minDistEnemy} px, höchstens ${BALANCE.fob.max} FOBs.`,
          enabled: p.ok || deployers.length > 1,
          reason: p.reason,
          action: () => this.issue({ type: 'deploy', ids: deployers.map((u) => u.id) }),
        }),
      );
    }
    const guns = units.filter((u) => u.def.indirect);
    if (guns.length) {
      const w = guns[0].weapons.find((x) => x.spec.shell)?.spec;
      card.push(
        entry('Feuer auf Punkt', 'G', {
          tip: `Artillerie (G): Punkt anklicken; die Panzerhaubitze schießt dorthin (${w?.minRange ?? 0}–${w?.range ?? 0} px), bis du das Ziel löschst, sie bewegst oder stoppst. Ohne Ziel feuert sie selbst auf Gegner, die dein Team sieht.`,
          action: () => this.setMode('mortarTarget'),
        }),
        entry('Ziel löschen', 'C', {
          tip: 'Feuerziel löschen (C): die Artillerie sucht wieder selbst Ziele',
          enabled: guns.some((u) => u.fireTarget),
          reason: 'Kein Ziel gewählt',
          action: () => this.issue({ type: 'mortarTarget', ids: guns.map((u) => u.id) }),
        }),
      );
    }
    const jets = units.filter((u) => u.def.jet);
    const rotors = this.game.city ? units.filter((u) => u.def.air && !u.def.jet) : []; // Heliports gibt es nur mit Stadt
    if (jets.length || rotors.length) {
      const c = this.game.city?.[this.team];
      const pads = c ? [...c.ents.values()].some((e) => isHeliport(this.game, e)) : false;
      const any = (jets.length && standsOf(this.game, this.team).length > 0) || (rotors.length && pads);
      card.push(
        entry('Landen', units.some(isCarrier) ? null : 'L', {
          tip: 'Landen (L): Flugzeuge danach einen eigenen Stellplatz anklicken (Platzrunde, Landebahn, Rollen zum Stellplatz), Hubschrauber einen eigenen Heliport (senkrecht landen, seit v5.51); auch Rechtsklick darauf. Dort wird betankt und munitioniert (Kerosintank, Munitionslager in der Nähe).',
          enabled: !!any,
          reason: jets.length ? 'Kein eigener Stellplatz' : 'Kein eigener Heliport',
          action: () => this.setMode('landAt'),
        }),
      );
    }
    if (units.some((u) => u.def.digger)) {
      card.push(
        entry('Baggern', 'G', {
          tip: 'Baggern (G): danach eine Zelle anklicken (Shift: mehrere). Der Bagger fährt hin und räumt sie: Zonenstraßen der Karte (nicht Brücken) verschwinden für beide Seiten, Bäume und leere Häuser werden geräumt, eigene Stadtgebäude abgerissen. Gegnerische Gebäude greift er mit der Schaufel an (langsam).',
          action: () => this.setMode('dig'),
        }),
      );
    }
    // Straßen beschießen und Schutt räumen (Paket „Straßen“, Teil 3)
    if (units.some((u) => canShellRoads(u) && !u.house)) {
      card.push(
        entry('Beschuss', 'E', {
          tip: `Beschuss (E): Straße beschießen, danach eine Straßenzelle anklicken (Shift: weitere). Einheiten mit Granaten oder Raketen fahren in Reichweite und schießen, bis die Zelle zu Schutt wird (${CITY.roadWar.hp} Trefferpunkte). Schutt unterbricht alle Wege über die Straße: Lieferungen, Pendler, die Versorgung der Ausbildung. Eigene Straßen und Stadtstraßen auch, Brücken, Bahn und Rollfeld nicht. Von selbst schießt niemand auf Straßen.`,
          action: () => this.setMode('shellRoad'),
        }),
      );
    }
    if (units.some((u) => u.def.builder === 'all' && !u.house)) {
      card.push(
        entry('Schutt räumen', 'R', {
          tip: `Schutt räumen (R): danach eine Zelle mit Schutt anklicken (Shift: weitere). Das Baufahrzeug räumt ihn in ${CITY.roadWar.clearTime} s, die Straße ist wieder da (eigene Straßen und Stadtstraßen). Bagger räumen Schutt mit „Baggern“.`,
          action: () => this.setMode('clearRubble'),
        }),
      );
    }
    const riders = units.filter((u) => u.def.canRide);
    if (riders.length) {
      card.push(
        entry('Einsteigen', 'I', {
          tip: 'Einsteigen (I): danach LKW, Baufahrzeug, Schützenpanzer, Transporthubschrauber oder ein Haus der Stadt anklicken (oder Rechtsklick darauf)',
          action: () => this.setMode('board'),
        }),
      );
    }
    const trucks = units.filter(isCarrier);
    if (trucks.length) {
      card.push(
        entry('Laden', 'L', {
          tip: 'Laden (L): LKW fährt zur eigenen FOB und lädt; FOB anklicken',
          action: () => this.startTruckMode('loadFob'),
        }),
        entry('Entladen', 'U', {
          tip: 'Entladen (U): eigene FOB anklicken',
          action: () => this.startTruckMode('unloadFob'),
        }),
        entry('Pendeln', 'T', {
          tip: 'Pendeln (T): Start eigene FOB oder Werk, dann Ziel-FOB anklicken',
          action: () => this.startTruckMode('routeFrom'),
        }),
      );
      for (const [preset, key, label, long] of PRESET_BTN) {
        card.push(
          entry(label, key, {
            tip: `Ladungsart ${long} (${key})`,
            active: trucks.every((t) => t.preset === preset),
            action: () => this.issue({ type: 'setPreset', ids: trucks.map((t) => t.id), preset }),
          }),
        );
      }
    }
    const carriers = units.filter((u) => u.crate);
    if (carriers.length) {
      card.push(
        entry('Ablegen', 'K', {
          tip: 'Kiste ablegen (K): sie bleibt liegen, bis jemand sie wieder aufhebt. Rechtsklick auf eine eigene FOB bringt sie dorthin.',
          action: () => this.issue({ type: 'dropCrate', ids: carriers.map((u) => u.id) }),
        }),
      );
    }
    const inside = units.filter((u) => u.house);
    if (units.some(canGarrison) && inside.length < units.length) {
      card.push(
        entry('Stürmen', 'X', {
          tip: 'Stürmen (X): danach ein vom Gegner besetztes Haus anklicken. Die Soldaten laufen an die Wand, kämpfen gegen die Besatzung (Besatzer sind in Deckung) und ziehen ein, wenn das Haus leer ist. Mit Überzahl und Deckung lohnt es sich, allein sind sie unter Feuer.',
          action: () => this.setMode('storm'),
        }),
      );
    }
    const homes = [...new Set(inside.map((u) => this.game.getEntity(u.house)).filter(Boolean))];
    if (homes.length === 1) {
      const home = homes[0];
      for (const [key, hotkey] of FORTIFY_KEYS) {
        const w = BALANCE.garrison.works[key];
        card.push(
          entry(w.name, hotkey, {
            cost: costText(w.cost),
            tip: `${w.name} (${hotkey}): ${FORTIFY_TIPS[key]} Kostet ${w.cost.money} ${BALANCE.resNames.money}, ${w.time} s Bauzeit, nur mit Besatzung im Haus.`,
            active: !!home.works[key] || home.building?.work === key,
            enabled: !home.works[key] && !home.building,
            reason: home.works[key] ? 'Schon gebaut' : 'Es wird schon ausgebaut',
            action: () => this.issue({ type: 'fortifyHouse', houseId: home.id, work: key }),
          }),
        );
      }
    }
    const helis = units.filter((u) => u.def.seats > 0);
    if (inside.length) {
      card.push(
        entry('Raus', 'O', {
          tip: 'Gebäude verlassen (O). Jeder Marschbefehl führt ebenfalls hinaus.',
          action: () => this.issue({ type: 'ungarrison', ids: inside.map((u) => u.id) }),
        }),
      );
    } else if (helis.length) {
      card.push(
        entry('Absetzen', 'O', {
          tip: 'Passagiere absetzen (O): Zielpunkt anklicken. Einsteigen: Infanterie wählen, Einsteigen (I) oder Rechtsklick auf das Fahrzeug.',
          enabled: helis.some((h) => h.passengers.length > 0),
          reason: 'Keine Passagiere an Bord',
          action: () => this.setMode('dropoff'),
        }),
      );
    }
    const planes = units.filter((u) => u.type === 'c130');
    if (planes.length) {
      card.push(
        entry('Fallschirm absetzen', null, {
          tip: 'Fallschirm absetzen (ohne Taste): Zielpunkt anklicken. Die C-130 fliegt hin, Passagiere landen im Umkreis 80 px und schießen 3 s lang nicht.',
          enabled: planes.some((p) => p.passengers.length > 0),
          reason: 'Keine Passagiere an Bord',
          action: () => this.setMode('paradrop'),
        }),
      );
    }
    return card;
  },

  /** Gewähltes Stadtgebäude: Handel (nur Markt), Baumodus, Abreißen (wie „Räumen“ im Baumodus, ohne Erstattung). */
  cityCard(b) {
    const c = this.game.city[b.team];
    const i = b.cityCell;
    const col = i % c.cols;
    const row = (i - col) / c.cols;
    const card = b.produces ? this.trainEntries([b]) : []; // Kaserne, Fabrikhalle, Heliport (seit v4.96)
    if (['stand', 'atc'].includes(CITY_KINDS[c.kind[i] - 1])) {
      // Fliegerhorst (seit v5.35): alle Flugzeuge der Stellplätze, die mit derselben Bahn verbunden sind (am Boden und in der Luft)
      const g = this.game;
      const key = CITY_KINDS[c.kind[i] - 1] === 'stand' ? standRoute(g, b)?.rw.key : null;
      const stands = standsOf(g, this.team).filter((s) => key == null || standRoute(g, s)?.rw.key === key);
      const ids = new Set(stands.map((s) => s.id));
      const jets = g.units.filter((u) => u.alive && u.team === this.team && ids.has(u.jet?.home));
      card.push(
        entry('Staffel', 'W', {
          tip: `Alle ${jets.length} Flugzeuge dieses Fliegerhorsts wählen (W); Befehl = Start (Rollen zur Bahn, Startlauf), sobald betankt; Landen (L) oder Rechtsklick auf einen eigenen Stellplatz = landen`,
          enabled: jets.length > 0,
          reason: 'Keine Flugzeuge stationiert',
          action: () => {
            this.view.selection.clear();
            for (const u of jets) this.view.selection.add(u.id);
          },
        }),
      );
    }
    if (CITY_KINDS[c.kind[i] - 1] === 'heliport') {
      // Heliport (seit v5.51): sein Hubschrauber (gelandet oder in der Luft)
      const helis = this.game.units.filter((u) => u.alive && u.team === this.team && u.heli?.home === b.id);
      card.push(
        entry('Hubschrauber', 'W', {
          tip: 'Den Hubschrauber dieses Heliports wählen (W); ein Befehl lässt ihn senkrecht starten, Landen (L) oder Rechtsklick auf den Heliport holt ihn zurück',
          enabled: helis.length > 0,
          reason: 'Kein Hubschrauber stationiert',
          action: () => {
            this.view.selection.clear();
            for (const u of helis) this.view.selection.add(u.id);
          },
        }),
      );
    }
    if (CITY_KINDS[c.kind[i] - 1] === 'stand') {
      // Ausbau (seit v5.39): nur auf Befehl, Stufe 2 Überdachung, Stufe 3 Stahlbeton-Shelter
      const lv = c.level[i];
      const up = CITY.air.upgrade[lv + 1];
      const main = this.game.mainFob(this.team);
      let reason = '';
      if (!up) reason = 'Schon voll ausgebaut (Stahlbeton-Shelter)';
      else if (this.game.teams[this.team].res.money < up.money) reason = `Zu wenig Geld (${up.money} nötig)`;
      else if (up.bm && (!main || main.store.bm < up.bm)) reason = `Zu wenig Baumaterial (${up.bm} nötig)`;
      else if (up.steel && c.metal < up.steel) reason = `Zu wenig Stahl (${up.steel} nötig)`;
      card.push(
        entry('Ausbauen', 'U', {
          cost: up ? `${up.money} G` : '',
          tip: up
            ? `Ausbauen (U) zu ${CITY.air.standName[lv + 1]}: ${up.money} Geld, ${up.bm} Baumaterial${up.steel ? `, ${up.steel} Stahl` : ''}. Schaden am abgestellten Flugzeug dann ${Math.round(CITY.air.shelter[lv + 1] * 100)} % statt ${Math.round(CITY.air.shelter[lv] * 100)} %`
            : 'Stahlbeton-Shelter: höchste Stufe',
          enabled: !reason,
          reason,
          action: () => this.issue({ type: 'cityUpgrade', buildingId: b.id }),
        }),
      );
    }
    if (CITY_KINDS[c.kind[i] - 1] === 'market') {
      card.push(entry('Handel', 'T', { tip: 'Marktmenü: Waren kaufen und verkaufen (T, auch über die Geldanzeige oben)', action: () => this.onMarket?.() }));
    }
    card.push(
      entry('Baumodus', 'Y', { tip: 'Baumodus der Stadt öffnen (Y)', action: () => this.onCity?.() }),
      entry('Abreißen', 'Entf', {
        tip: `${b.def.name} abreißen (Entf): kostenlos, keine Erstattung`,
        action: () => {
          this.issue({ type: 'city', kind: 'erase', c0: col, r0: row, c1: col, r1: row, demolish: true }); // gewähltes Gebäude: auch eine Förderanlage
          this.view.selection.delete(b.id);
        },
      }),
    );
    if (b.produces) {
      card.push(
        entry('Abbruch', null, {
          tip: 'Letzten Auftrag abbrechen (Geld und Stahl werden erstattet)',
          enabled: b.queue.length > 0,
          reason: 'Nichts in der Warteschlange',
          action: () => this.cancelTrain(),
        }),
      );
    }
    return card;
  },

  /** Ausbildungs-Einträge der Befehlskarte für die gewählten Gebäude (Hauptstadt bzw. Ausbildungsgebäude der Stadt). */
  trainEntries(blds) {
    const card = [];
    const types = [];
    for (const b of blds) {
      for (const u of b.produces) if (!types.includes(u)) types.push(u);
    }
    for (const u of types) {
      const def = UNITS[u];
      const producers = blds.filter((b) => b.produces.includes(u));
      const ready = producers.find((b) => b.built && b.queue.length < BALANCE.queueMax);
      let reason = '';
      if (!producers.some((b) => b.built)) reason = 'Gebäude ist noch im Bau';
      else if (!ready) reason = 'Warteschlange ist voll';
      else if (this.game.slotsUsed(ready.team) + (def.slots ?? 1) > BALANCE.slotCap) reason = 'Einheitenlimit erreicht';
      else if (def.hero && hasCommander(this.game, ready.team)) reason = 'Nur ein Kommandeur je Team';
      else if (this.game.city && freePop(this.game, ready.team) < crewOf(u)) reason = 'Zu wenig freie Einwohner (Stadt: Wohnen ausbauen)';
      else if (this.game.city && this.game.city[ready.team].metal < (CITY.metalCost[u] ?? 0)) reason = 'Zu wenig Stahl (Stadt: Erzmine, Hütte und Stahlwerk oder Markt)';
      else reason = trainCheck(this.game, ready, u) ?? (def.air && !def.jet ? heliTrainCheck(this.game, ready) : null) ?? this.trainReason(def.cost); // Stellplatz bzw. Heliport: ein Luftfahrzeug je Platz
      card.push(
        entry(def.short || def.name, def.hotkey, {
          cost: costText(def.cost),
          tip: `${def.name}: ${longCost(def.cost)}${this.game.city && CITY.metalCost[u] ? `, ${CITY.metalCost[u]} Stahl, ${crewOf(u)} Einwohner` : this.game.city ? `, ${crewOf(u)} Einwohner` : ''}${def.hero ? COMMANDER_TIP : ''}`,
          enabled: !reason,
          reason,
          action: () => this.train(u),
        }),
      );
    }
    return card;
  },

  buildingCard(blds) {
    const card = this.trainEntries(blds);
    const mortars = blds.filter((b) => b.built && b.def.weapon && b.def.weapon.shell);
    if (mortars.length) {
      card.push(
        entry('Ziel wählen', 'G', {
          tip: 'Mörser-Ziel (G): Punkt anklicken oder Rechtsklick. Schießt alle 20 s, solange die FOB Munition hat.',
          action: () => this.setMode('mortarTarget'),
        }),
        entry('Ziel löschen', 'C', {
          tip: 'Gewähltes Ziel löschen (C): Mörser feuert wieder automatisch',
          enabled: mortars.some((b) => b.fireTarget),
          reason: 'Kein Ziel gewählt',
          action: () => this.issue({ type: 'mortarTarget', ids: mortars.map((b) => b.id) }),
        }),
      );
    }
    const towers = blds.filter((b) => b.type === 'tower' && b.built);
    if (towers.length) {
      const bare = towers.filter((b) => !b.roof && !b.roofJob);
      for (const [kind, r] of Object.entries(BUILDINGS.tower.roofs)) {
        card.push(
          entry(r.short, r.hotkey, {
            cost: costText(r.cost),
            tip: `Dachaufbau ${r.name} (${r.hotkey}): ${longCost(r.cost)}, ${r.time} s Bauzeit. Feuert nur, solange ein Soldat im Turm sitzt; Munition kommt aus dem FOB-Lager.`,
            enabled: bare.length > 0,
            reason: 'Das Dach trägt schon einen Aufbau',
            action: () => {
              for (const b of bare) this.issue({ type: 'roof', buildingId: b.id, kind });
            },
          }),
        );
      }
      const crew = towers.flatMap((b) => b.occupants);
      card.push(
        entry('Raus', 'O', {
          tip: 'Besatzung verlässt den Turm (O). Soldaten hinein: Rechtsklick auf den Turm.',
          enabled: crew.length > 0,
          reason: 'Niemand im Turm',
          action: () => this.issue({ type: 'ungarrison', ids: crew.map((u) => u.id) }),
        }),
      );
    }
    const fobs = blds.filter((b) => b.type === 'fob' && b.built);
    if (fobs.length) {
      card.push(
        entry('Festung', 'I', {
          tip: `FOB zur Festung ausbauen (I): Mauerring mit vier Toren und ${BALANCE.fortress.towers} Gefechtstürmen an den Ecken zum Gegner. Material aus dem FOB-Lager, Baufahrzeuge und Soldaten bauen selbst. Erneut drücken ergänzt, was fehlt.`,
          action: () => {
            for (const f of fobs) this.issue({ type: 'fortify', buildingId: f.id });
          },
        }),
      );
    }
    const main = blds.find((b) => b.main && b.built);
    if (main && this.game.research) {
      const tech = this.game.teams[this.team].tech;
      card.push(
        entry('Forschung', 'U', {
          tip: `Forschungsmenü (U, auch Knopf „Forschung“ rechts oben): Stufe ${tech.tier} von ${RESEARCH.tiers}, ${tech.done.length} erforscht. Alle Einheiten sind frei; Forschungen verbessern sie (bis zu ${RESEARCH.queueMax} warten in der Warteschlange).`,
          active: !!tech.cur,
          action: () => this.onResearch?.(),
        }),
      );
    }
    const drills = blds.filter((b) => b.built && b.drill);
    if (drills.length) {
      const ready = drills.filter((b) => b.drill.state === 'ready');
      card.push(
        entry('Aktivieren', 'G', {
          tip: 'Bohrer aktivieren (G): 2 min aktiv, braucht Treibstoff aus der FOB, zieht die Hot Zone an; danach 5 min Pause',
          enabled: ready.length > 0,
          reason: drills.some((b) => b.drill.state === 'active') ? 'Bohrer läuft bereits' : 'Bohrer wärmt auf oder kühlt ab',
          action: () => this.issue({ type: 'drill', ids: ready.map((b) => b.id) }),
        }),
      );
    }
    card.push(
      entry('Abbruch', null, {
        tip: 'Letzten Auftrag abbrechen (Kosten werden erstattet)',
        enabled: blds.some((b) => b.queue.length > 0),
        reason: 'Nichts in der Warteschlange',
        action: () => this.cancelTrain(),
      }),
    );
    card.push(
      entry('Abreißen', 'Entf', {
        tip: 'Gebäude abreißen (25 % des Baumaterials zurück)',
        action: () => this.demolish(),
      }),
    );
    return card;
  },
};

// Forschungsbaum (seit v5.04, PRD §7 „Forschung“): 10 Stufen, 8 Äste (seit v5.19), je Ast und Stufe eine Verbesserung (80 insgesamt).
// Inspiration: die Freischaltungen der Fahrzeuge in Battlefield 4 / Battlefield 6 (Optik, Munition, Panzerung, Gegenmaßnahmen,
// Wartung) und die Ausbaustufen aus Wardogs, als Baum wie in Civilization (Stufen als Spalten, Äste als Zeilen, Linien zum Vorgänger).
// Regeln: Auf jeder Stufe müssen perTier Forschungen fertig sein, bevor Stufe + 1 offen ist. Jede Forschung braucht ihren Vorgänger
// im selben Ast (die Stufe davor). Einheiten sind von Anfang an alle frei; die Forschung verbessert nur.
// Alle Zahlen hier einstellbar; nach Änderungen `npm run docs` und PRD §7 prüfen.
//
// Wirkung fx: { Gruppe: { Wert: Faktor } }. Faktoren mehrerer Forschungen multiplizieren sich (regen addiert sich).
//   Gruppen: inf Infanterie · tank Kampfpanzer · ifv Schützenpanzer · aa Flak und SAM · log LKW und Baufahrzeug · heli Hubschrauber ·
//   jet Kampfflugzeuge · spaa Flakpanzer Gepard · art Panzerhaubitze · veh alle Bodenfahrzeuge · air Hubschrauber und Jets · all alle Einheiten · bld Militärgebäude (FOB, Mörser,
//   Flugabwehr, Phalanx, Gefechtsturm, Mauern, Bohrer, Sendemast); Stadtgebäude zählen nicht.
//   Werte: range Waffenreichweite · sight Sicht · dmg Schaden · dmgInf / dmgVeh / dmgAir Schaden gegen Infanterie / Fahrzeuge
//   (und Gebäude) / Luftziele · rof Nachladezeit (kleiner = schneller) · armor erlittener Schaden (kleiner = besser; ein Schuss, der das
//   unverletzte Ziel sofort tötet, bleibt tödlich) · speed Tempo · fuel Treibstoffverbrauch (kleiner = größere Reichweite) · acc
//   Trefferchance gelenkter Waffen (Flak, SAM, Gepard, Raketen der F-16, Abfangen; bei der Artillerie: Streuung ÷ acc) · evade Trefferchance gegnerischer gelenkter Waffen ·
//   regen Selbstheilung (Anteil der HP je s, nach 6 s ohne Treffer) · rearm Bodenzeit der Jets · build Bautempo · repair Reparatur ·
//   abilityCd Abklingzeit von Nebel und Minen.
//   unlock: schaltet eine Fähigkeit frei (smoke Nebelwand, mines Minen, autoturret Dachwaffen ohne Besatzung).

export const RESEARCH = {
  tiers: 10,
  perTier: 3, // so viele fertige Forschungen einer Stufe öffnen die nächste
  queueMax: 3, // so viele Forschungen dürfen hinter der laufenden warten (bezahlt beim Einreihen, Abbruch erstattet)
  money: [250, 350, 450, 550, 700, 850, 1000, 1200, 1400, 1600], // Preis je Stufe (Geld)
  time: [30, 38, 46, 54, 62, 70, 78, 86, 94, 102], // Forschungszeit je Stufe (s, ohne Rechenzentrum)
  // Einheit → Gruppe oder Liste von Gruppen (fehlt = keine eigene Gruppe, dann gelten nur all, veh und air); der Gepard zählt auch zu aa
  groups: {
    rifleman: 'inf', medic: 'inf', at: 'inf', manpads: ['inf', 'aa'], flamer: 'inf', mortarteam: 'inf', sniper: 'inf', commander: 'inf',
    tank: 'tank', ifv: 'ifv', flak: 'aa', sam: 'aa', gepard: ['spaa', 'aa'], pzh: 'art', mlrs: 'art', truck: 'log', engineer: 'log',
    littlebird: 'heli', transporter: 'heli', gunship: 'heli', f16: 'jet', f22: 'jet', u2: 'jet', su27: 'jet',
  },
  // Äste in Reihenfolge der Zeilen im Menü; je Ast 10 Forschungen (Stufe 1 bis 10)
  lanes: {
    inf: {
      name: 'Infanterie',
      icon: '🪖',
      items: [
        { name: 'Gefechtsausbildung', short: 'Ausbildung', fx: { inf: { dmg: 1.08 } } },
        { name: 'Schutzwesten', short: 'Westen', fx: { inf: { armor: 0.9 } } },
        { name: 'Zielfernrohre', short: 'Zielfernr.', fx: { inf: { range: 1.08, sight: 1.05 } } },
        { name: 'Erweiterte Magazine', short: 'Magazine', fx: { inf: { rof: 0.92 } } },
        { name: 'Feldsanitäter', short: 'Sanitäter', fx: { inf: { regen: 0.012 } } },
        { name: 'Keramikplatten', short: 'Platten', fx: { inf: { armor: 0.88 } } },
        { name: 'Tandem-Gefechtskopf', short: 'Tandem', fx: { inf: { dmgVeh: 1.18 } } },
        { name: 'Leichtes Sturmgepäck', short: 'Gepäck', fx: { inf: { speed: 1.1 } } },
        { name: 'Wärmebildvisier', short: 'Wärmebild', fx: { inf: { sight: 1.12, range: 1.06 } } },
        { name: 'Spezialkräfte', short: 'Spezialkr.', fx: { inf: { dmg: 1.1, rof: 0.9, armor: 0.9 } } },
      ],
    },
    tank: {
      name: 'Kampfpanzer',
      icon: '🛡',
      items: [
        { name: 'Richtoptik', short: 'Optik', fx: { tank: { range: 1.06, sight: 1.05 } } },
        { name: 'Zusatztanks', short: 'Tanks', fx: { tank: { fuel: 0.85 } } },
        { name: 'Wuchtgeschosse (APFSDS)', short: 'APFSDS', fx: { tank: { dmg: 1.1 } } },
        { name: 'Verbundpanzerung', short: 'Verbund', fx: { tank: { armor: 0.9 } } },
        { name: 'Ladeautomat', short: 'Ladeaut.', fx: { tank: { rof: 0.88 } } },
        { name: 'Gasturbine', short: 'Turbine', fx: { tank: { speed: 1.12 } } },
        { name: 'Feuerleitrechner', short: 'Feuerleit.', fx: { tank: { range: 1.1 } } },
        { name: 'Reaktivpanzerung', short: 'Reaktiv', fx: { tank: { armor: 0.88 } } },
        { name: 'Bordwerkstatt', short: 'Werkstatt', fx: { tank: { regen: 0.008, fuel: 0.9 } } },
        { name: 'Kampfwertsteigerung', short: 'KWS', fx: { tank: { dmg: 1.1, range: 1.06, armor: 0.92 } } },
      ],
    },
    mech: {
      name: 'Schützenpanzer und Flugabwehr',
      icon: '⚙',
      items: [
        { name: 'Maschinenkanone', short: 'MK', fx: { ifv: { dmg: 1.1 } } },
        { name: 'Suchradar', short: 'Radar I', fx: { aa: { range: 1.08, sight: 1.1 } } },
        { name: 'Leichtbaupanzerung', short: 'Leichtbau', fx: { ifv: { armor: 0.9 }, aa: { armor: 0.9 } } },
        { name: 'Zusatztanks', short: 'Tanks', fx: { ifv: { fuel: 0.85 }, aa: { fuel: 0.85 } } },
        { name: 'Annäherungszünder', short: 'Zünder', fx: { aa: { acc: 1.1 } } },
        { name: 'Programmierbare Munition', short: 'Prog.-Mun.', fx: { ifv: { rof: 0.88, dmgInf: 1.1 } } },
        { name: 'Feuerleitradar', short: 'Radar II', fx: { aa: { range: 1.1 } } },
        { name: 'Panzerabwehrlenkwaffe', short: 'PAL', fx: { ifv: { dmgVeh: 1.2, range: 1.06 } } },
        { name: 'Allradantrieb', short: 'Allrad', fx: { ifv: { speed: 1.1 }, aa: { speed: 1.1 } } },
        { name: 'Vernetzte Flugabwehr', short: 'Vernetzt', fx: { aa: { dmg: 1.15, acc: 1.1 }, ifv: { armor: 0.92 } } },
      ],
    },
    art: {
      name: 'Artillerie und Gepard',
      icon: '🎯',
      items: [
        { name: 'Ballistikrechner', short: 'Ballistik', fx: { art: { range: 1.08 } } },
        { name: 'Zusatztanks', short: 'Tanks', fx: { art: { fuel: 0.85 }, spaa: { fuel: 0.85 } } },
        { name: 'Zielfolgeradar', short: 'Radar', fx: { spaa: { range: 1.08, sight: 1.1 } } },
        { name: 'Wetter- und Vermessungsdaten', short: 'Vermessung', fx: { art: { acc: 1.25 } } },
        { name: 'Automatischer Lader', short: 'Lader', fx: { art: { rof: 0.85 }, spaa: { rof: 0.92 } } },
        { name: 'Programmierbare Zerlegemunition', short: 'Zerlegem.', fx: { spaa: { acc: 1.12, dmg: 1.1 } } },
        { name: 'Minenschutz und Zusatzpanzerung', short: 'Schutz', fx: { art: { armor: 0.9 }, spaa: { armor: 0.9 } } },
        { name: 'Reichweitengesteigerte Granaten', short: 'Reichw.', fx: { art: { range: 1.12 } } },
        { name: 'Feuerleitrechner mit Laser', short: 'Feuerleit.', fx: { spaa: { rof: 0.88, range: 1.06 } } },
        { name: 'GPS-gelenkte Granaten', short: 'GPS', fx: { art: { acc: 1.4, dmg: 1.1 } } },
      ],
    },
    air: {
      name: 'Luftwaffe',
      icon: '✈',
      items: [
        { name: 'Rotorwartung', short: 'Rotor', fx: { heli: { fuel: 0.85 } } },
        { name: 'Stabilisierte Bordkanone', short: 'Kanone', fx: { heli: { dmg: 1.08 } } },
        { name: 'Nachbrenner', short: 'Nachbr.', fx: { jet: { speed: 1.08 } } },
        { name: 'Panzerglaskanzel', short: 'Kanzel', fx: { heli: { armor: 0.9 }, jet: { armor: 0.9 } } },
        { name: 'Täuschkörper (Flares)', short: 'Flares', fx: { air: { evade: 0.85 } } },
        { name: 'Konforme Tanks', short: 'Tanks', fx: { jet: { fuel: 0.8 }, heli: { fuel: 0.9 } } },
        { name: 'Panzerabwehrraketen (Hellfire)', short: 'Hellfire', fx: { heli: { dmgVeh: 1.15, range: 1.08 } } },
        { name: 'Mittelstrecken-Lenkwaffen', short: 'Lenkwaffe', fx: { jet: { range: 1.12, acc: 1.06 } } },
        { name: 'Schnellwartung', short: 'Wartung', fx: { jet: { rearm: 0.7 }, heli: { regen: 0.008 } } },
        { name: 'Luftüberlegenheit', short: 'Überleg.', fx: { air: { dmg: 1.1, armor: 0.92 } } },
      ],
    },
    log: {
      name: 'Logistik und Pioniere',
      icon: '🔧',
      items: [
        { name: 'Geländereifen', short: 'Reifen', fx: { log: { speed: 1.1 } } },
        { name: 'Schnellbau', short: 'Schnellbau', fx: { all: { build: 1.2 } } },
        { name: 'Zusatzkanister', short: 'Kanister', fx: { log: { fuel: 0.8 } } },
        { name: 'Reparaturset', short: 'Rep.-Set', fx: { all: { repair: 1.5 } } },
        { name: 'Nebelwerfer', short: 'Nebel', unlock: 'smoke', fx: {} },
        { name: 'Fertigteilbau', short: 'Fertigteile', fx: { all: { build: 1.2 } } },
        { name: 'Minenleger', short: 'Minen', unlock: 'mines', fx: {} },
        { name: 'Gepanzerte LKW', short: 'Pz.-LKW', fx: { log: { armor: 0.85 } } },
        { name: 'Feldwerkstatt', short: 'Werkstatt', fx: { veh: { regen: 0.005 }, all: { repair: 1.3 } } },
        { name: 'Pionierbataillon', short: 'Pioniere', fx: { all: { build: 1.25, abilityCd: 0.6 } } },
      ],
    },
    def: {
      name: 'Stellungen',
      icon: '🏰',
      items: [
        { name: 'Sandsäcke', short: 'Sandsäcke', fx: { bld: { armor: 0.9 } } },
        { name: 'Schwere MG', short: 'Schw. MG', fx: { bld: { dmg: 1.1 } } },
        { name: 'Mörser-Feuerleitung', short: 'Feuerleit.', fx: { bld: { range: 1.08 } } },
        { name: 'Stahlbeton', short: 'Beton', fx: { bld: { armor: 0.88 } } },
        { name: 'Autonome Türme', short: 'Auto-Turm', unlock: 'autoturret', fx: {} },
        { name: 'Schnellladung', short: 'Laden', fx: { bld: { rof: 0.88 } } },
        { name: 'Radarstellung', short: 'Radar', fx: { bld: { sight: 1.15 } } },
        { name: 'Abfangsystem (C-RAM)', short: 'C-RAM', fx: { bld: { acc: 1.12 } } },
        { name: 'Bunkerbau', short: 'Bunker', fx: { bld: { armor: 0.9, range: 1.05 } } },
        { name: 'Festungsartillerie', short: 'Festung', fx: { bld: { dmg: 1.12, rof: 0.9 } } },
      ],
    },
    elec: {
      name: 'Elektronik und KI',
      icon: '🖥',
      items: [
        { name: 'Gefechtsfunk', short: 'Funk', fx: { all: { sight: 1.05 } } },
        { name: 'Aufklärungsdrohnen', short: 'Drohnen', fx: { all: { sight: 1.1 } } },
        { name: 'Störsender', short: 'Störsender', fx: { air: { evade: 0.8 } } },
        { name: 'Datenlink', short: 'Datenlink', fx: { all: { rof: 0.95 } } },
        { name: 'KI-Zielerfassung', short: 'KI-Ziel', fx: { all: { dmg: 1.08 } } },
        { name: 'GPS-Navigation', short: 'GPS', fx: { veh: { speed: 1.05, fuel: 0.95 } } },
        { name: 'Elektronische Gegenmaßnahmen', short: 'Gegenm.', fx: { all: { armor: 0.95 } } },
        { name: 'Satellitenaufklärung', short: 'Satellit', fx: { all: { sight: 1.1, range: 1.04 } } },
        { name: 'Gefechtsfeld-KI', short: 'Gefechts-KI', fx: { all: { acc: 1.08 }, bld: { acc: 1.05 } } },
        { name: 'Vernetzte Operationsführung', short: 'Vernetzt', fx: { all: { dmg: 1.08, rof: 0.95 } } },
      ],
    },
  },
  // Einsatzfähigkeiten (Tasten V und M): Rauch senkt den Schaden eigener Einheiten darin, Minen treffen Bodeneinheiten des Gegners
  smoke: { r: 110, life: 14, cd: 45, taken: 0.5 },
  mine: { trigger: 30, blast: 55, damage: 150, cd: 12, max: 8 },
  regenDelay: 6, // s ohne Treffer, bevor die Selbstheilung (regen) wirkt
};

// Abgeleitet: alle Forschungen mit Schlüssel `<Ast><Stufe>` (z. B. tank5), Stufe, Ast, Preis, Zeit und Vorgänger
RESEARCH.items = {};
for (const [lane, L] of Object.entries(RESEARCH.lanes)) {
  L.items.forEach((it, i) => {
    const tier = i + 1;
    RESEARCH.items[`${lane}${tier}`] = {
      ...it,
      lane,
      tier,
      money: it.money ?? RESEARCH.money[i],
      time: it.time ?? RESEARCH.time[i],
      req: tier > 1 ? `${lane}${tier - 1}` : null,
    };
  });
}

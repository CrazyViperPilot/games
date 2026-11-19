// Simfurt – Zeitung & Bürgerstimmen (Runde 4, Paket Z1). Reine Logik: ohne DOM, ohne rand(s).
// Eine Ausgabe entsteht aus dem Zustand (Kennzahlen, Ereignisse der letzten Monate, Budget, Verordnungen).
// Die Textauswahl nutzt einen eigenen Hash aus Jahr, Monat, Seed und Kennzahlen (kleiner PRNG nur lokal),
// damit die Simulation dadurch nicht verändert wird und jede Ausgabe bei gleichem Stand gleich aussieht.
import { BUILD, MILESTONES, MONTHS, BUDGET_DEFAULT, GARBAGE_MIN_POP } from './data.js';

export const NEWS_PAPER = 'Simfurter Rundschau';
export const NEWS_MAX = 12;

/** Schwellen für die Themenwahl (nur Schlagzeilen, keine Wirkung auf die Simulation). */
const LIM = {
  tax: 13, cong: 0.8, crime: 40, unemp: 0.25, pol: 40, garbage: 0.2, budget: 80, housing: 0.5,
  covHealth: 0.35, covEdu: 0.35, popSvc: 800, popPark: 500, popBudget: 200, recentMonths: 1,
};

// ---------------------------------------------------------------- Hilfsfunktionen
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const obj = (v) => (v && typeof v === 'object' ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const de = (v) => Math.round(num(v)).toLocaleString('de-DE');
const eur = (v) => `${de(v)} €`;
const say1 = (x, F) => (typeof x === 'function' ? x(F) : x);
function countNZ(a) {
  let n = 0;
  if (a && a.length) for (let i = 0; i < a.length; i++) if (a[i]) n++;
  return n;
}
/** FNV-1a über einen Text → 32-Bit-Zahl. */
function hashStr(str) {
  let h = 0x811C9DC5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** Kleiner, lokaler PRNG (mulberry32). Nicht s.rng: der Spielstand bleibt unberührt. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (R, list) => list[Math.floor(R() * list.length)];
function shuffled(R, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------- Fakten aus dem Zustand (robust gegen fehlende Felder)
function facts(s) {
  const st = obj(s.stats), p = obj(st.parts), fin = obj(s.fin), rates = obj(s.rates), bl = arr(s.bld);
  const year = num(s.year, 1990), month = num(s.month);
  const pop = num(st.pop), jobs = num(st.jobs), lots = num(st.lots);
  const parts = {};
  for (const k of Object.keys(p)) parts[k] = num(p[k]);
  // Durchschnittssteuer: aus den Statistiken, sonst gewichtet aus den Steuersätzen
  let avgTax = num(st.avgTax, NaN);
  if (!Number.isFinite(avgTax)) {
    const w = pop + jobs;
    avgTax = w > 0
      ? (num(rates.r, 9) * pop + num(rates.c, 9) * (num(st.jobsC) + num(st.jobsB)) + num(rates.i, 9) * num(st.jobsI)) / w
      : num(rates.r, 9);
  }
  // Niedrigstes Ressort-Budget (fehlt es im alten Stand, gilt der Standard)
  const budget = obj(s.budget);
  let budgetMin = Infinity;
  for (const k of Object.keys(BUDGET_DEFAULT)) budgetMin = Math.min(budgetMin, num(budget[k], BUDGET_DEFAULT[k]));
  if (!Number.isFinite(budgetMin)) budgetMin = 100;
  // Ereignisse der letzten Monate (say() schreibt y/m an jede Meldung)
  const cur = year * 12 + month;
  const recent = arr(s.msgs).filter((m) => {
    if (!m || typeof m.text !== 'string') return false;
    const d = cur - (num(m.y) * 12 + num(m.m));
    return d >= 0 && d <= LIM.recentMonths;
  });
  let milestone = null;
  for (const m of recent) for (const ms of MILESTONES) if (m.text.startsWith(ms.title + '!')) milestone = ms;
  // Wahrzeichen: Zahl und neuestes; „eröffnet“ = seit der letzten Ausgabe mehr Wahrzeichen
  let lmCount = 0, newestLm = null, newestId = -Infinity;
  for (const b of bl) {
    const d = b ? BUILD[b.type] : null;
    if (!d || d.kind !== 'happy') continue;
    lmCount++;
    if (num(b.id) >= newestId) { newestId = num(b.id); newestLm = d; }
  }
  const issues = arr(obj(s.news).issues);
  const prev = issues.length ? issues[issues.length - 1] : null;
  const prevLm = prev && prev.meta && Number.isFinite(prev.meta.lm) ? prev.meta.lm : null;
  const landmarkNew = !!newestLm && (prevLm === null || lmCount > prevLm);
  const hasPower = Number.isFinite(s.powerCap), hasWater = Number.isFinite(s.waterCap);
  const powerCap = num(s.powerCap), waterCap = num(s.waterCap);
  const garbage = num(s.garbage), garbageLeft = num(s.garbageLeft);
  const dem = obj(s.demand);
  return {
    y: year, m: month, seed: num(s.seed), bldCount: bl.length,
    pop, jobs, lots, happy: num(st.happy, 50), money: num(s.money), net: num(fin.net), avgTax,
    crime: num(st.crime), pollution: num(st.pollution), unemp: num(st.unemp), cong: num(st.cong),
    covHealth: num(st.covHealth), covEdu: num(st.covEdu), parts, budgetMin,
    demandR: num(dem.r), milestone, fireMsg: recent.some((m) => m.text.startsWith('Feuer')),
    floodMsg: recent.some((m) => m.text.startsWith('Hochwasser')),
    fires: countNZ(s.fire), floods: countNZ(s.flood),
    lmCount, newestLm, landmarkNew,
    hasPower, powerCap, powerRatio: num(s.powerRatio, powerCap > 0 ? 1 : 0),
    hasWater, waterCap, waterRatio: num(s.waterRatio, waterCap > 0 ? 1 : 0), waterDry: num(st.waterDry),
    garbage, garbageLeft, garbageRatio: num(s.garbageRatio, garbage > 0 ? garbageLeft / garbage : 0),
    dumps: num(st.dumps), dumpLeft: num(st.dumpLeft, Infinity),
  };
}

// ---------------------------------------------------------------- Themen und Bewertung
const TOPIC_ORDER = ['milestone', 'flood', 'fire', 'power', 'water', 'tax', 'money', 'budget', 'garbage', 'traffic', 'crime',
  'jobs', 'pol', 'housing', 'health', 'edu', 'park', 'landmark', 'calm'];

/** Punktzahl je Thema (0 = nicht aktuell). Größer = wichtiger; alles Aktive liegt über 0,3. */
const SCORE = {
  milestone: (F) => (F.milestone ? 1.35 : 0),
  flood: (F) => (F.floods > 0 ? 1.2 : F.floodMsg ? 0.9 : 0),
  fire: (F) => (F.fires > 0 ? Math.min(1.25, 1 + 0.08 * F.fires) : F.fireMsg ? 0.85 : 0),
  power: (F) => {
    if (!F.hasPower || F.lots <= 0) return 0;
    if (F.powerCap <= 0) return 1.3;
    return F.powerRatio < 0.99 ? Math.min(1.2, 0.6 + (1 - F.powerRatio) * 2) : 0;
  },
  water: (F) => {
    if (!F.hasWater || F.lots <= 0) return 0;
    if (F.waterCap <= 0) return 1.1;
    if (F.waterRatio < 0.99) return Math.min(1.1, 0.5 + (1 - F.waterRatio) * 1.5);
    return F.waterDry > F.lots * 0.3 ? 0.7 : 0;
  },
  tax: (F) => (F.pop > 0 && F.avgTax > LIM.tax ? Math.min(2, 0.4 + (F.avgTax - LIM.tax) / 4) : 0),
  money: (F) => (F.money < 0 ? 1.5 : F.net < 0 ? 0.7 : 0),
  budget: (F) => (F.pop >= LIM.popBudget && F.budgetMin < LIM.budget ? 0.4 + (LIM.budget - F.budgetMin) / 200 : 0),
  garbage: (F) => {
    if (F.pop < GARBAGE_MIN_POP) return 0;
    if (F.dumps > 0 && F.dumpLeft < 1 && F.garbageLeft > 0) return 1.05;
    return F.garbageRatio > LIM.garbage ? Math.min(1.5, 0.5 + F.garbageRatio) : 0;
  },
  traffic: (F) => (F.cong > LIM.cong ? Math.min(1.2, 0.5 + (F.cong - LIM.cong) * 2) : 0),
  crime: (F) => (F.crime > LIM.crime ? Math.min(1.2, 0.5 + (F.crime - LIM.crime) / 40) : 0),
  jobs: (F) => (F.pop > 0 && F.unemp > LIM.unemp ? Math.min(1.2, 0.5 + (F.unemp - LIM.unemp) * 2) : 0),
  pol: (F) => (F.pollution > LIM.pol ? Math.min(1, 0.4 + (F.pollution - LIM.pol) / 60) : 0),
  housing: (F) => (F.lots >= 4 && F.demandR > LIM.housing ? Math.min(1, 0.4 + (F.demandR - LIM.housing) * 1.2) : 0),
  health: (F) => (F.pop >= LIM.popSvc && F.covHealth < LIM.covHealth ? Math.min(0.9, 0.4 + (LIM.covHealth - F.covHealth) * 1.5) : 0),
  edu: (F) => (F.pop >= LIM.popSvc && F.covEdu < LIM.covEdu ? Math.min(0.8, 0.4 + (LIM.covEdu - F.covEdu) * 1.2) : 0),
  park: (F) => (F.pop >= LIM.popPark && num(F.parts.park) < 2 ? 0.35 : 0),
  landmark: (F) => (F.landmarkNew ? 0.95 : 0),
  calm: () => 0.1,
};

function rankTopics(F) {
  const list = [];
  TOPIC_ORDER.forEach((key, i) => {
    const score = SCORE[key](F);
    if (score >= 0.3 || key === 'calm') list.push({ key, i, score });
  });
  list.sort((a, b) => b.score - a.score || a.i - b.i);
  return list;
}

// ---------------------------------------------------------------- Textbausteine je Thema
// heads: Schlagzeilen (Funktion oder Text); bodies: Artikeltexte; demands: Forderungen mit Tipp.
// Jede Schlagzeile enthält das Stichwort des Themas (Steuer, Strom, Wasser, Müll, …).
const TEXT = {
  milestone: {
    heads: [
      (F) => `Meilenstein erreicht: ${F.milestone.title}!`,
      (F) => `Jubel am Mainufer – Simfurt ist jetzt ${F.milestone.title}`,
      (F) => `${de(F.pop)} Menschen: Simfurt feiert den nächsten Schritt`,
    ],
    bodies: [
      (F) => `${F.milestone.msg} Im Rathaus wurde angestoßen, und am Abend war jede Äppelwoi-Wirtschaft voll.`,
      (F) => `Die Stadt zählt jetzt ${de(F.pop)} Einwohner. ${F.milestone.msg}`,
    ],
    demands: ['Weiter so: Bei der nächsten Stufe den Römer und die Schulen nicht vergessen.', 'Den Erfolg feiern – mit einem Stadtfest am Mainufer.'],
  },
  flood: {
    heads: ['Hochwasser: Der Main hat die Ufer überspült', 'Wasser in den Kellern am Ufer', 'Nach dem Hochwasser: Was schützt uns am Fluss?'],
    bodies: [
      'Der Main ist über die Ufer getreten und hat die Keller in Ufernähe unter Wasser gesetzt. Helfer pumpen seit Tagen, und die Anwohner sind für jede helfende Hand dankbar.',
      'Am Ufer stand das Wasser bis zur Bordsteinkante. Wer einen Deich hat, kam diesmal glimpflich davon – die anderen hoffen auf einen ruhigeren Pegel im nächsten Frühjahr.',
    ],
    demands: ['Deiche am Ufer bauen – sie schützen den Umkreis vor Hochwasser.', 'Hochwasserschutz für die Viertel am Ufer, bevor der Pegel wieder steigt.'],
  },
  fire: {
    heads: ['Rauch über den Dächern: Feuer beschäftigt die Stadt', 'Brand in der Innenstadt – die Feuerwehr war im Einsatz', 'Feuer! Wie gut ist unser Brandschutz wirklich?'],
    bodies: [
      'Ein Altbau hat Feuer gefangen, Nachbarn haben mit Eimern gelöscht, bis die Löschzüge kamen. Die Stadt prüft nun, wo nachgerüstet werden muss.',
      'Mehrere Brände haben die Stadt in Atem gehalten. Wo die Feuerwache weit weg liegt, breiten sich die Flammen schneller aus, sagen die Fachleute am Römer.',
    ],
    demands: ['Feuerwache in die Viertel mit Altbau setzen und das Feuerwehr-Budget auf 100 % halten.', 'Mehr Löschkraft nahe den Zonen: eine zweite Feuerwehr bauen.'],
  },
  power: {
    heads: [
      (F) => (F.powerCap <= 0 ? 'Kein Strom in den Zonen: Die Lichter bleiben aus' : 'Stromengpass: Die Kraftwerke reichen nicht'),
      (F) => (F.powerCap <= 0 ? 'Stromausfall in den Vierteln – wer baut ein Kraftwerk?' : 'Strom knapp: Viertel am Rand bleiben abends dunkel'),
      (F) => (F.powerCap <= 0 ? 'Strom weg, Kühlschränke stehen still' : 'Zu wenig Strom für die wachsende Stadt'),
    ],
    bodies: [
      (F) => (F.powerCap <= 0
        ? 'Bebaute Zonen ohne Kraftwerk: Büros arbeiten im Kerzenschein, und der Bäcker backt mit Gas. Ein Kraftwerk in der Nähe der Zonen würde sofort helfen.'
        : `Die Nachfrage nach Strom ist größer als das Angebot – ${Math.round(F.powerRatio * 100)} % sind gedeckt. Die Ränder der Stadt spüren den Ausfall zuerst.`),
      'Beim Abendessen geht das Licht aus, im Treppenhaus stehen alle im Dunkeln. Die Stadtwerke verweisen auf fehlende Kraftwerke im Umkreis.',
    ],
    demands: ['Gaskraftwerk oder Windpark bauen – die Leistung muss für alle Zonen reichen.', 'Einen Solarpark oder ein Kraftwerk am Rand der Wohnviertel setzen.'],
  },
  water: {
    heads: ['Wasser knapp: Pumpwerk gefragt', 'Wassermangel in den Vierteln', 'Trockene Hähne – Wasser ist das Thema der Woche'],
    bodies: [
      (F) => (F.waterCap <= 0
        ? 'Am Morgen kam aus vielen Hähnen nur Luft. Ohne Pumpwerk am Ufer bleibt das Wasser in der Stadt aus.'
        : 'Das Pumpwerk kommt nicht hinterher. Ein Teil der Viertel bekommt nur wenig Druck, und in den höheren Häusern wird es eng.'),
      'Viele Haushalte warten auf einen Wasserturm in der Nachbarschaft. Ein zweites Pumpwerk am Ufer wäre die schnelle Hilfe.',
    ],
    demands: ['Pumpwerk am Ufer setzen und Wassertürme in die Viertel bringen.', 'Eine Kläranlage bauen, damit alle Pumpwerke mehr Kapazität bekommen.'],
  },
  tax: {
    heads: [
      (F) => `Steuern auf ${Math.round(F.avgTax)} Prozent: Die Stadt murrt`,
      'Steuerzahler ächzen – die Abgaben werden zum Streitthema',
      'Rathaus bittet zur Kasse: Die Steuern sorgen für Ärger',
    ],
    bodies: [
      (F) => `Im Schnitt zahlen die Simfurter ${Math.round(F.avgTax)} Prozent. Am Stammtisch in Sachsenhausen wird nachgerechnet, und mancher denkt schon ans Umland.`,
      'Die Kasse freut sich, die Geldbörsen der Bürger weniger. Gewerbetreibende klagen, Simfurt sei teuer geworden, und Banken prüfen ihren Standort.',
    ],
    demands: ['Steuersatz im Rat (Steuersätze) um 2 bis 3 Punkte senken – das wirkt spürbar auf die Zufriedenheit.', 'Den höchsten der drei Steuersätze zuerst senken – dort drückt der Schuh am meisten.'],
  },
  money: {
    heads: ['Kasse leer! Die Stadt muss sparen', 'Haushalt im Minus – der Rat rechnet nach', 'Stadtsäckel leer: Ausgaben stehen auf dem Prüfstand'],
    bodies: [
      'Die Ausgaben für Unterhalt, Straßen und Dienste liegen über den Einnahmen. Kämmerei und Stadtverordnete suchen nach Einsparungen.',
      (F) => `Die Bilanz ist im Minus (${eur(F.net)} pro Monat). Der Kredit hilft nur kurz, denn die Zinsen fressen den Rest.`,
    ],
    demands: ['Ausgaben prüfen: Verordnungen abwählen oder die Steuern moderat anheben.', 'Den Kredit nicht weiter aufstocken, erst die laufenden Kosten in den Griff bekommen.'],
  },
  budget: {
    heads: ['Sparkurs im Rathaus: Ressorts müssen Federn lassen', 'Weniger Geld für Polizei, Feuerwehr und Schulen?', 'Budget gekürzt – die Bürger fragen nach den Folgen'],
    bodies: [
      'Der Rat hat einzelne Ressorts gedrosselt. Das spart Geld, schwächt aber die Wirkung: Streifen kommen seltener, Schulen werden knapper.',
      'Gespart wird bei den Diensten. Wer die Regler wieder auf 100 % stellt, holt die volle Wirkung zurück – aber auch die volle Rechnung.',
    ],
    demands: ['Budget-Regler im Rat wieder auf 100 % stellen, zuerst bei Polizei und Feuerwehr.', 'Bei Schulen und Straßen nicht sparen, sonst wird es teurer.'],
  },
  garbage: {
    heads: [
      (F) => (F.dumps > 0 && F.dumpLeft < 1 ? 'Deponie voll: Wohin mit dem Müll?' : 'Müllberg wächst: Der Abfall bleibt liegen'),
      'Müll bleibt liegen – Dreck und Ärger im Viertel',
      'Mülltonnen quellen über: Recycling als Ausweg?',
    ],
    bodies: [
      'Die Müllabfuhr kommt mit dem Aufkommen nicht mehr mit. Am Straßenrand stapeln sich die Säcke, und der Geruch zieht bis in die Hinterhöfe.',
      'Ein Teil des Mülls findet keinen Platz mehr. Die Umwelt leidet, die Laune der Anwohner auch.',
    ],
    demands: ['Recyclinghof bauen oder eine Müllverbrennung errichten; Recyclingpflicht im Rat beschließen.', 'Eine neue Deponie anlegen, bis die Verbrennung läuft.'],
  },
  traffic: {
    heads: ['Dauerstau: Pendler stehen vor der Stadt', 'Verkehr am Limit – die Ampeln kommen nicht nach', 'Stau in Simfurt: Die Straßen platzen aus allen Nähten'],
    bodies: [
      'Zur Rushhour geht auf den Hauptstraßen nichts mehr. Wer vom Ostend in die Innenstadt will, braucht eine halbe Stunde für zwei Kilometer.',
      'Die Autos stauen sich bis zum Main. Verkehrsplaner fordern mehr Straßen oder eine U-Bahn-Station am Brennpunkt.',
    ],
    demands: ['Eine U-Bahn-Station oder mehr Straßen an den Stau-Abschnitten bauen.', 'Tempo 30 im Rat beschließen – das beruhigt die Innenstadt.'],
  },
  crime: {
    heads: ['Kriminalität steigt: Anwohner fordern mehr Streifen', 'Einbrüche und Diebstähle verunsichern die Viertel', 'Nachts unsicher: Die Polizei steht unter Druck'],
    bodies: [
      'Fahrraddiebstähle und Einbrüche häufen sich, vor allem in den Hinterhöfen. Die Bürgerinitiative hat dem Rat eine Liste mit Brennpunkten geschickt.',
      'Viele meiden abends die Unterführung am Bahnhof. Die Revierleitung sagt, man sei unterbesetzt und tue, was möglich ist.',
    ],
    demands: ['Polizeireviere in die betroffenen Viertel setzen und das Polizei-Budget auf 100 % halten.', 'Die Nachbarschaftswache im Rat beschließen – mehr Augen auf der Straße.'],
  },
  jobs: {
    heads: ['Arbeitslosigkeit: Viele suchen vergeblich eine Stelle', 'Jobs gesucht: Gewerbe und Industrie fehlen', 'Stellenmarkt leer – Simfurt braucht Arbeitsplätze'],
    bodies: [
      (F) => `Rund ${Math.round(F.unemp * 100)} Prozent der Arbeitswilligen finden in Simfurt keine Stelle. Die Jungen ziehen weg, heißt es im Jobcenter.`,
      'Lehrstellen bleiben unbesetzt, Ladenlokale stehen leer. Wer Arbeit sucht, pendelt – wenn er kann.',
    ],
    demands: ['Gewerbe- und Industriezonen ausweisen – Arbeitsplätze kommen zu den Leuten.', 'Mehr Büroflächen für Dienstleister, damit auch Hochqualifizierte bleiben.'],
  },
  pol: {
    heads: ['Dicke Luft: Dreck liegt über den Vierteln', 'Umwelt unter Druck – die Luft wird schlechter', 'Industrieruß auf den Balkonen'],
    bodies: [
      'Morgens liegt ein grauer Film auf den Fensterbänken. Die Industrie ist den Wohngebieten zu nah gerückt.',
      'Wer am Main spazieren geht, merkt den Unterschied: Der Wind trägt den Dreck von den Zonen herüber.',
    ],
    demands: ['Industrie weg von den Wohngebieten planen und eine Kläranlage in die Nähe der Dreckzonen setzen.', 'Grüne Dächer per Verordnung einführen – sie filtern die Luft.'],
  },
  housing: {
    heads: ['Wohnungsnot: Wer hier bauen will, braucht Zonen', 'Viele wollen nach Simfurt – aber wo sollen sie wohnen?', 'Mietenbarometer im roten Bereich'],
    bodies: [
      'Die Nachfrage nach Wohnungen ist hoch, die Wartelisten werden länger. Junge Familien weichen schon in die Nachbarstädte aus.',
      'Wer aus Offenbach, Hanau oder Darmstadt kommt, sucht hier eine Bleibe. Der Rat sollte Wohnzonen am Rand der Stadt ausweisen.',
    ],
    demands: ['Wohnzonen ausweisen – aber nur mit Straße und Strom, sonst wächst dort nichts.', 'Neue Wohnviertel am Stadtrand planen, damit die Mieten nicht explodieren.'],
  },
  health: {
    heads: ['Lange Wartezeiten in den Praxen', 'Gesundheitsversorgung hinkt hinterher', 'Krankenhaus gesucht: Viertel fühlen sich allein gelassen'],
    bodies: [
      'Beim Hausarzt gibt es Termine erst im nächsten Quartal. Die Notaufnahmen sind abends voll.',
      'Viele Viertel liegen weit weg von der nächsten Klinik. Der Rat prüft, wo ein Krankenhaus hin soll.',
    ],
    demands: ['Ein Krankenhaus bauen oder das Gesundheits-Budget auf 100 % und mehr stellen.', 'Mehr Praxen in die Viertel, nicht nur ins Zentrum.'],
  },
  edu: {
    heads: ['Schulen platzen aus allen Nähten', 'Bildung: Wo sollen die Kinder hin?', 'Klassen zu groß – Eltern schlagen Alarm'],
    bodies: [
      'In der Grundschule am Platz sitzen die Kinder inzwischen zu dritt an einem Tisch. Der Elternbeirat fordert einen Erweiterungsbau.',
      'Wer studieren will, muss bislang aus Simfurt wegfahren. Bildung zieht Banken an, sagt man am Main – und die Familien gleich mit.',
    ],
    demands: ['Eine Schule bauen oder die Goethe-Uni ansiedeln – Bildung lockt Banken an.', 'Das Bildungs-Budget nicht kürzen, sonst leidet der Nachwuchs.'],
  },
  park: {
    heads: ['Kaum Grün in Simfurt', 'Wo sind die Parks? Hundebesitzer schlagen Alarm', 'Asphalt statt Grün: Die Stadt braucht Luft'],
    bodies: [
      'Zwischen den Häusern gibt es kaum Bäume. Im Sommer wird es in den Hinterhöfen drückend heiß.',
      'Die Kinder spielen auf dem Parkplatz, weil kein Park in Gehweite liegt.',
    ],
    demands: ['Parks zwischen den Vierteln anlegen – ein Park kostet wenig und hebt die Stimmung.', 'Eine Äppelwoi-Wirtschaft ans Grün setzen, dann wird der Park auch abends voll.'],
  },
  landmark: {
    heads: [
      (F) => `${F.newestLm ? F.newestLm.name : 'Ein Wahrzeichen'} eröffnet: Die Skyline bekommt ein neues Gesicht`,
      (F) => `Feierstunde am Main: ${F.newestLm ? F.newestLm.name : 'das Wahrzeichen'} ist fertig`,
      'Neues Wahrzeichen zieht Blicke auf sich',
    ],
    bodies: [
      'Der Bürgermeister durchschnitt das Band, die Kapelle spielte, und am Abend strömten die Leute zum Ufer. Das Wahrzeichen bringt Besucher und Stolz.',
      'Reiseführer werden bald Simfurt empfehlen, meint der Verkehrsverein – und der Apfelwein fließt ohnehin.',
    ],
    demands: ['Das nächste Wahrzeichen planen – es bringt Touristen und Stolz.', 'Grünflächen rund um das neue Wahrzeichen anlegen.'],
  },
  calm: {
    heads: ['Ruhige Woche in Simfurt: Alles im grünen Bereich', 'Nichts Dramatisches am Main', 'Stadt im Gleichgewicht – die Redaktion gähnt'],
    bodies: [
      'Keine großen Aufreger: Die Straßen sind frei, die Zonen wachsen gemächlich, und abends sitzt man wieder in der Äppelwoi-Wirtschaft.',
      'Ein ruhiger Monat. Die Stadt arbeitet, die Bürger arbeiten – und die Bankentürme glänzen, als wäre nichts gewesen.',
    ],
    demands: [],
  },
};

/** Ersatz-Forderungen, falls die Lage zu ruhig für zwei echte Themen ist. */
const FALLBACK_DEMANDS = [
  { key: 'park', text: 'Mehr Parks und Bänke am Main: Grün macht glücklich.' },
  { key: 'culture', text: 'Ein Stadtfest am Römer mit Ebbelwei und Live-Musik.' },
  { key: 'bike', text: 'Radwege entlang des Mains, damit Pendler das Auto stehen lassen.' },
];
const ART_HEADS = ['Aus dem Viertel', 'Was die Stadt bewegt', 'Gespräch am Stammtisch', 'Die Lage am Main'];
const FACT_HEADS = ['Die Stadt in Zahlen', 'Blick ins Rathaus', 'Zahlen der Woche'];

// ---------------------------------------------------------------- Bürgerstimmen
/** Erfundene Personen: Name, Alter, Beruf, Viertel. Keine realen Personen. */
const PEOPLE = [
  { name: 'Gerda Lindner', age: 71, job: 'Rentnerin', quarter: 'Bornheim' },
  { name: 'Ahmet Yildiz', age: 38, job: 'Taxifahrer', quarter: 'Gallus' },
  { name: 'Sabine Kowalczyk', age: 44, job: 'Krankenschwester', quarter: 'Höchst' },
  { name: 'Jürgen Hellmann', age: 58, job: 'Bankkaufmann', quarter: 'Westend' },
  { name: 'Lea Brandt', age: 26, job: 'Studentin', quarter: 'Bockenheim' },
  { name: 'Oskar Wendt', age: 67, job: 'Rentner', quarter: 'Sachsenhausen' },
  { name: 'Mira Okafor', age: 33, job: 'Ärztin', quarter: 'Nordend' },
  { name: 'Peter Scholz', age: 49, job: 'Busfahrer', quarter: 'Griesheim' },
  { name: 'Anja Bergmann', age: 41, job: 'Bäckereichefin', quarter: 'Seckbach' },
  { name: 'Kemal Aydın', age: 29, job: 'Koch', quarter: 'Oststadt' },
  { name: 'Ingrid Vogt', age: 63, job: 'Verkäuferin', quarter: 'Fechenheim' },
  { name: 'Tobias Roth', age: 35, job: 'Informatiker', quarter: 'Ostend' },
  { name: 'Eva Mertens', age: 52, job: 'Lehrerin', quarter: 'Niederrad' },
  { name: 'Dragan Petrović', age: 45, job: 'Schweißer', quarter: 'Heddernheim' },
  { name: 'Hannah Weiß', age: 22, job: 'Auszubildende', quarter: 'Bornheim' },
  { name: 'Klaus Dörr', age: 74, job: 'Apotheker i. R.', quarter: 'Sachsenhausen' },
  { name: 'Nadia Haddad', age: 36, job: 'Architektin', quarter: 'Westend' },
  { name: 'Michael Frank', age: 55, job: 'Speditionskaufmann', quarter: 'Gutleut' },
  { name: 'Sophie Lang', age: 31, job: 'Erzieherin', quarter: 'Nordend' },
  { name: 'Wilhelm Hartig', age: 80, job: 'Rentner', quarter: 'Alt-Höchst' },
  { name: 'Yasmin Keller', age: 27, job: 'Fahrradkurierin', quarter: 'Bockenheim' },
  { name: 'Dieter Stolz', age: 60, job: 'Hausmeister', quarter: 'Praunheim' },
  { name: 'Carla Mendes', age: 39, job: 'Reinigungskraft', quarter: 'Gallus' },
  { name: 'Florian Brenner', age: 30, job: 'Gründer eines Start-ups', quarter: 'Ostend' },
  { name: 'Helga Krämer', age: 68, job: 'Marktfrau', quarter: 'Innenstadt' },
];

/** Stimmen, die zu einem schlechten Zufriedenheitsteil passen (Schlüssel = stats.parts). */
const BAD_VOICE = {
  tax: ['Die Steuern fressen mein Plus komplett auf. Für den Feierabend-Ebbelwei bleibt nichts.', 'Jeden Monat dieselbe Rechnung. Wer soll das noch zahlen?'],
  crime: ['Nach zehn Uhr gehe ich nicht mehr allein durch die Unterführung.', 'Schon wieder ein Fahrrad weg. Die Streife kommt nur, wenn alles vorbei ist.'],
  pol: ['Morgens liegt der Ruß auf dem Balkon. Die Wäsche bleibt lieber drinnen.', 'Am Main riecht es manchmal, als hätte jemand die Kläranlage vergessen.'],
  traffic: ['Zur Rushhour brauche ich für zwei Kilometer eine halbe Stunde.', 'Der Bus steht im Stau, und der Pendler neben mir schimpft wie ein Rohrspatz.'],
  health: ['Beim Hausarzt bekomme ich erst im nächsten Quartal einen Termin.', 'Die Notaufnahme war am Samstag voll bis zur Tür.'],
  edu: ['Meine Tochter sitzt in einer Klasse mit 31 Kindern. Das kann nicht gut gehen.', 'Die Schule hat keinen Platz mehr für die neuen Familien im Viertel.'],
  police: ['Die Streife kommt meist erst, wenn schon etwas passiert ist.', 'Ein Revier für drei Viertel – das ist doch kein Witz.'],
  fire: ['Nach dem Brand im Hinterhof hat es ewig gedauert, bis die Löschzüge kamen.', 'Die Feuerwache liegt so weit weg, dass wir in den Altbauten nachts bangen.'],
  park: ['Wo ist hier das Grün? Mein Hund kennt nur Asphalt und Hydranten.', 'Die Kinder spielen auf dem Parkplatz, weil es keinen Park gibt.'],
  jobs: ['Seit dem Frühjahr keine Stelle gefunden. Die Firmen stellen einfach nicht ein.', 'Mein Sohn pendelt jetzt nach Offenbach. Hier gibt es nichts für Leute wie ihn.'],
  power: ['Der Kühlschrank ist wieder aus. Ich koche auf dem Gaskocher, das nervt.', 'Abends Kerzenlicht im ganzen Block – der Strom fällt einfach aus.'],
  water: ['Am Morgen kam aus dem Hahn nur ein Rinnsal.', 'Die Dusche wird zum Tröpfeln, seit das Wasser knapp ist.'],
  garbage: ['Die Tonne stinkt, aber die Abfuhr kommt nicht. Wohin mit dem Sperrmüll?', 'Der Müll stapelt sich im Hof, und die Ratten freuen sich.'],
  landmark: ['Der Fluglärm über den Dächern nervt, seit das neue Wahrzeichen steht.', 'Die Besucherströme am Wahrzeichen verstopfen die Gassen.'],
  ords: ['Die neuen Regeln verstehe ich nicht. Wer soll das alles bezahlen?', 'Ständig neue Verordnungen – im Viertel weiß keiner mehr, was gilt.'],
};
/** Stimmen zu einem guten Zufriedenheitsteil. */
const GOOD_VOICE = {
  tax: ['Die Abgaben sind vernünftig. So bleibt noch Geld für den Laden um die Ecke.', 'Die Steuern tun nicht weh, und dafür gibt es ordentliche Straßen.'],
  crime: ['Die Streife am Ufer ist freundlich. Man kennt sich wieder im Viertel.', 'Abends fühlt man sich auf dem Heimweg sicher, auch allein.'],
  pol: ['Der Wind vom Main bringt frische Luft in die Gassen, das merkt man sofort.', 'Seit die Industrie weiter weg ist, riecht es morgens nach Brot statt nach Ruß.'],
  traffic: ['Seit der U-Bahn bin ich in zwanzig Minuten mitten in der Innenstadt.', 'Die Straßen sind frei, zumindest um diese Uhrzeit.'],
  health: ['Das neue Krankenhaus hat meinem Mann das Leben gerettet. Danke an alle dort.', 'Die Praxis am Platz nimmt endlich wieder neue Patienten auf.'],
  edu: ['Die Schule hat einen neuen Garten bekommen. Die Kinder lieben ihn.', 'Die Lehrer sind engagiert, auch wenn die Klassen voll sind.'],
  police: ['Die Revierbeamten kennen unsere Straße beim Namen – das gibt Sicherheit.', 'Die Streife grüßt, wenn sie vorbeifährt. Das tut gut.'],
  fire: ['Die Feuerwehr war in fünf Minuten da. Das beruhigt ungemein.', 'Die Übungen der Löschzüge auf dem Platz sind ein Spektakel für die Kinder.'],
  park: ['Die Bänke am Park sind voll, die Kinder spielen bis in die Dämmerung.', 'Im Sommer sitzt man unter den Bäumen und vergisst den Verkehr.'],
  jobs: ['In meiner Firma werden gerade wieder Leute eingestellt. Endlich!', 'Die Lehrstelle hat geklappt. Ich bin richtig stolz.'],
  power: ['Strom läuft, das Licht ist an – alles gut im Viertel.', 'Der Strom ist zuverlässig, seit die neuen Kraftwerke laufen.'],
  water: ['Seit das Pumpwerk läuft, schmeckt das Wasser richtig gut.', 'Der Druck im Hahn ist wieder da. Das merkt man in der Dusche.'],
  garbage: ['Der Recyclinghof ist super: Glas, Papier und Altmetall an einem Ort.', 'Die Müllabfuhr kommt wieder pünktlich. Das war nicht immer so.'],
  landmark: ['Seit das neue Wahrzeichen steht, gehe ich abends extra am Main entlang.', 'Die Touristen bringen Leben in die Cafés. Gut für die Stadt.'],
  ords: ['Die neue Verordnung finde ich vernünftig, auch wenn sie etwas kostet.', 'Die Regeln sind klar, und man weiß, woran man ist.'],
};
/** Allgemeine Stimmen (Auffüllung auf 3–5). */
const INFO_VOICE = [
  'Ich wohne seit 1978 hier. Wenn die Stadt nicht zu schnell wächst, bin ich zufrieden.',
  'Ich pendle jeden Tag über den Main. Hauptsache, die Verbindungen stimmen.',
  'Abends am Ufer ist es schön, egal was in den Zahlen steht.',
  'Die Äppelwoi-Wirtschaft an der Ecke hat den besten Tisch. Dort bleiben wir.',
  'Mehr Bäume wären schön. Und ein Eisstand am Ufer.',
  'Ich verstehe die Politik nicht ganz, aber der Handkäs’ schmeckt.',
  'Frankfurt hat Banken, Brezeln und Bahnen. Mal sehen, was Simfurt daraus macht.',
  'Wer hier wohnt, will Ruhe. Wer hier arbeitet, will schnell an den Schreibtisch.',
];

function voicesFor(F, R) {
  const bad = [], good = [];
  for (const k of Object.keys(F.parts)) {
    const v = F.parts[k];
    if (v <= -0.5 && BAD_VOICE[k]) bad.push({ k, v });
    else if (v >= 0.5 && GOOD_VOICE[k]) good.push({ k, v });
  }
  bad.sort((a, b) => a.v - b.v || (a.k < b.k ? -1 : 1));
  good.sort((a, b) => b.v - a.v || (a.k < b.k ? -1 : 1));
  const want = 3 + Math.floor(R() * 3); // 3 bis 5 Stimmen
  const people = shuffled(R, PEOPLE);
  const out = [];
  const add = (mood, text) => {
    const p = people[out.length % people.length];
    out.push({ who: `${p.name}, ${p.age}, ${p.job} aus ${p.quarter}`, text, mood });
  };
  // Schlechte und gute Stimmen abwechselnd, zuerst die stärksten Ausschläge
  const seq = [
    bad[0] && ['bad', bad[0].k], bad[1] && ['bad', bad[1].k], good[0] && ['good', good[0].k],
    bad[2] && ['bad', bad[2].k], good[1] && ['good', good[1].k], bad[3] && ['bad', bad[3].k],
  ];
  for (const e of seq) {
    if (!e || out.length >= want) continue;
    add(e[0], pick(R, e[0] === 'bad' ? BAD_VOICE[e[1]] : GOOD_VOICE[e[1]]));
  }
  const infos = shuffled(R, INFO_VOICE); // ohne Wiederholung innerhalb einer Ausgabe
  for (let i = 0; out.length < want; i++) add('info', infos[i % infos.length]);
  return out;
}

// ---------------------------------------------------------------- Ausgabe
function seedKey(F) {
  return [F.y, F.m, F.seed, F.pop, Math.round(F.happy), Math.round(F.money / 100), Math.round(F.crime), Math.round(F.cong * 100),
    Math.round(F.unemp * 100), Math.round(F.avgTax * 10), Math.round(F.pollution), Math.round(F.powerCap), Math.round(F.waterCap),
    Math.round(F.garbage * 10), F.fires, F.floods, F.bldCount, F.lots, F.jobs].join('|');
}
function factsText(F) {
  if (F.pop <= 0) return 'Noch wohnt niemand in Simfurt. Wer die ersten Straßen zieht, schreibt die Geschichte der Stadt.';
  return `Simfurt zählt ${de(F.pop)} Einwohner und ${de(F.jobs)} Arbeitsplätze, dazu ${eur(F.money)} in der Stadtkasse. Die Zufriedenheit liegt bei ${de(F.happy)} von 100 Punkten.`;
}

/**
 * Erzeugt die Ausgabe zum aktuellen Stand: { y, m, title, headline, topic, articles, voices, demands, meta }.
 * Rein und deterministisch: gleicher Stand → gleiche Ausgabe. Ändert s nicht.
 */
export function makeIssue(s) {
  const F = facts(s);
  const R = prng(hashStr(seedKey(F)));
  const ranked = rankTopics(F);
  const head = ranked[0];
  const T = TEXT[head.key];
  const headline = say1(pick(R, T.heads), F);
  const second = ranked.find((t) => t.key !== head.key && t.key !== 'calm' && t.score >= 0.3) || null;
  const articles = [
    { head: pick(R, ART_HEADS), text: say1(pick(R, T.bodies), F) },
    { head: pick(R, FACT_HEADS), text: factsText(F) + (second ? ' ' + say1(pick(R, TEXT[second.key].bodies), F) : '') },
  ];
  const voices = voicesFor(F, R);
  // Forderungen: die zwei drängendsten Themen mit konkretem Tipp, sonst Ersatz
  const demands = [];
  for (const t of ranked) {
    if (demands.length >= 2) break;
    if (t.key === 'calm') continue;
    demands.push({ key: t.key, text: pick(R, TEXT[t.key].demands) });
  }
  for (const f of FALLBACK_DEMANDS) {
    if (demands.length >= 2) break;
    if (!demands.some((d) => d.key === f.key)) demands.push({ key: f.key, text: f.text });
  }
  return { y: F.y, m: F.m, title: NEWS_PAPER, headline, topic: head.key, articles, voices, demands, meta: { lm: F.lmCount } };
}

/** Stellt s.news sicher her (alte Stände und neue Städte). Gibt s.news zurück. */
export function ensureNews(s) {
  if (!s.news || typeof s.news !== 'object') s.news = { issues: [], unread: false, last: null };
  const n = s.news;
  if (!Array.isArray(n.issues)) n.issues = [];
  n.unread = !!n.unread;
  if (!n.last || typeof n.last !== 'object') n.last = null;
  return n;
}

/**
 * Nach jedem Monatswechsel aufrufen: legt die Ausgabe für den neuen Monat an (nur bei > 0 Einwohnern,
 * höchstens eine je Monat, höchstens NEWS_MAX behalten). Gibt die neue Ausgabe oder null zurück.
 */
export function publishNews(s) {
  const n = ensureNews(s);
  if (!(num(obj(s.stats).pop) > 0)) return null;
  if (n.last && n.last.y === s.year && n.last.m === s.month) return null;
  const issue = makeIssue(s);
  n.issues.push(issue);
  while (n.issues.length > NEWS_MAX) n.issues.shift();
  n.last = { y: s.year, m: s.month };
  n.unread = true;
  return issue;
}

/** Name des Monats für Anzeige, z. B. „Nov 2026“. */
export const issueDate = (is) => `${MONTHS[is.m] ?? ''} ${is.y}`;

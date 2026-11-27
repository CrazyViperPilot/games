// Datumslogik und Türchen-Reihenfolge (ohne DOM, in Node testbar).
(function (root) {
  'use strict';

  // Adventssaison: Dezember → Jahr des Dezembers; Januar zählt noch zur Saison davor.
  function saisonJahr(d) {
    return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  }

  // Bis zu welchem Türchen (0–24) darf geöffnet werden?
  // Dezember: bis zum heutigen Tag. Januar: alle (zum Nachlesen). Sonst: keins.
  function offenBis(d) {
    const m = d.getMonth();
    if (m === 11) return Math.min(24, d.getDate());
    if (m === 0) return 24;
    return 0;
  }

  // Wie oft noch schlafen bis zum Türchen „tag“? (0 = heute oder schon offen)
  function tageBis(tag, d) {
    if (offenBis(d) >= tag) return 0;
    const heute = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let ziel = new Date(saisonJahr(d), 11, tag);
    if (ziel < heute) ziel = new Date(d.getFullYear(), 11, tag); // Februar bis November: kommender Dezember
    return Math.round((ziel - heute) / 86400000);
  }

  // Feste, aber gemischte Reihenfolge der Türchen je Kind (wie bei einem gedruckten Kalender).
  function reihenfolge(seedText) {
    let h = 2166136261;
    for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
    let s = h >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const a = Array.from({ length: 24 }, (_, i) => i + 1);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // „?heute=2026-12-10“ in der Adresse überschreibt das Datum (zum Ausprobieren für Eltern).
  function datumAusAdresse(search, jetzt) {
    const m = /[?&]heute=(\d{4})-(\d{2})-(\d{2})/.exec(search || '');
    if (!m) return jetzt;
    return new Date(+m[1], +m[2] - 1, +m[3], 12);
  }

  const api = { saisonJahr, offenBis, tageBis, reihenfolge, datumAusAdresse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdventLogik = api;
})(typeof window !== 'undefined' ? window : globalThis);

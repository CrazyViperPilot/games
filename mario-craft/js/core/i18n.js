// Texte: t(key, vars) liefert den Text der aktuellen Sprache (PRD §1). Platzhalter: {name}.
import { STRINGS } from '../data/strings.js';

export const LANGS = ['de', 'pl'];
let lang = 'de';

// Gerätesprache: Polnisch, wenn navigator.language mit 'pl' beginnt, sonst Deutsch.
export function defaultLang() {
  try {
    const n = (globalThis.navigator && navigator.language) || '';
    return /^pl/i.test(n) ? 'pl' : 'de';
  } catch (_) {
    return 'de';
  }
}

export function setLang(l) {
  lang = LANGS.includes(l) ? l : 'de';
}

export function getLang() {
  return lang;
}

export function t(key, vars) {
  let s = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.de[key];
  if (s === undefined) return key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  }
  return s;
}

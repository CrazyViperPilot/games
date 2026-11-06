// Testhilfen ohne eigene Tests (node --test lädt die Datei mit, findet aber nichts).

/**
 * Setzt `obj[key] = value` für die Dauer von `fn()` und stellt danach den alten Wert wieder her, auch wenn `fn` wirft
 * (fehlgeschlagene Zusicherung). Liefert das Ergebnis von `fn`. Für Werte aus js/data/, die ein Test kurz verstellt.
 */
export function withValue(obj, key, value, fn) {
  const old = obj[key];
  obj[key] = value;
  try {
    return fn();
  } finally {
    obj[key] = old;
  }
}

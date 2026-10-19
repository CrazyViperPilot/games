// Generischer Objekt-Pool. Objekte müssen ein Feld `active` (bool) besitzen.
export class Pool {
  constructor(factory, size = 0) {
    this._factory = factory;
    this._cursor = 0;
    this.items = [];
    for (let i = 0; i < size; i++) {
      const o = factory();
      o.active = false;
      this.items.push(o);
    }
  }

  // Liefert ein inaktives Objekt (ringförmige Suche), wächst bei Bedarf.
  // Der Aufrufer initialisiert die Felder.
  get() {
    const items = this.items;
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const idx = (this._cursor + i) % n;
      const o = items[idx];
      if (!o.active) {
        this._cursor = (idx + 1) % n;
        o.active = true;
        return o;
      }
    }
    const o = this._factory();
    o.active = true;
    items.push(o);
    this._cursor = 0;
    return o;
  }

  release(o) {
    o.active = false;
  }

  // Iteriert nur aktive Objekte (klassische for-Schleife, keine Allokation).
  forEach(fn) {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (o.active) fn(o);
    }
  }

  get activeCount() {
    let c = 0;
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].active) c++;
    }
    return c;
  }

  clear() {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      items[i].active = false;
    }
  }
}

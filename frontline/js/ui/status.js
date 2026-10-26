// Lesende Hilfen für UI und Renderer: Bauzustand von Baustellen, Auftragstext, FOB-Namen (kein DOM, keine Änderung am Spiel).
import { BALANCE } from '../data/balance.js';
import { canBuild } from '../game/construction.js';
import { footDist } from '../game/movement.js';

/**
 * Bauzustand einer Baustelle: 'near' (Bauer steht daneben oder arbeitet), 'assigned' (Bauer unterwegs),
 * 'none' (kein passender Bauer in Sicht). Spiegelt die Regeln von construction.js (helperRange, Auftrag build).
 */
export function builderState(game, b) {
  let state = 'none';
  for (const u of game.units) {
    if (!u.alive || u.house || !canBuild(u.def, b.type)) continue;
    if (u.order.type === 'build' && u.order.targetId === b.id) {
      if (footDist(u.x, u.y, b) <= BALANCE.construction.helperRange) return 'near';
      state = 'assigned';
    } else if (u.order.type === 'idle' && footDist(u.x, u.y, b) <= BALANCE.construction.helperRange) {
      return 'near';
    }
  }
  return state;
}

/** Name einer eigenen FOB nach Reihenfolge der Gründung: „FOB 2“ bzw. „FOB 2 (Baustelle)“. */
export function fobLabel(game, b) {
  if (!b) return 'FOB';
  if (b.main) return 'Haupt-FOB';
  const own = game.buildings.filter((x) => x.alive && x.team === b.team && x.type === 'fob' && !x.main);
  const i = own.indexOf(b);
  const n = i >= 0 ? i + 1 : '';
  return `FOB ${n}${b.built ? '' : ' (Baustelle)'}`.trim();
}

/** Kurztext des Auftrags einer eigenen Einheit (Auftragstyp aus Engine). */
export function orderText(game, u) {
  const o = u.order;
  switch (o.type) {
    case 'idle':
      if (u.house) return 'Im Gebäude';
      if (u.crate) return 'Trägt eine Versorgungskiste';
      return u.def.builder ? 'Bereit (hilft bei Baustellen)' : 'Bereit';
    case 'move':
      return 'Bewegung';
    case 'attackMove':
      return 'Angriffsbewegung';
    case 'attack':
      return u.house ? 'Angriff aus dem Gebäude' : 'Angriff';
    case 'garrison': {
      const h = game.getEntity(o.targetId);
      return h ? `Unterwegs ins Gebäude (${h.def.name})` : 'Bereit';
    }
    case 'pickup':
      return 'Holt eine Versorgungskiste';
    case 'deliver':
      return `Bringt die Kiste zu ${fobLabel(game, game.getEntity(o.targetId))}`;
    case 'build': {
      const s = game.getEntity(o.targetId);
      return s ? `Baut ${s.type === 'fob' ? fobLabel(game, s) : s.def.name}` : 'Baustelle fertig';
    }
    case 'repair': {
      const b = game.getEntity(o.targetId);
      return b ? `Repariert ${b.def.name}` : 'Reparatur beendet';
    }
    case 'load': {
      const f = game.getEntity(o.targetId);
      return `Lädt an ${fobLabel(game, f)}`;
    }
    case 'unload': {
      const f = game.getEntity(o.targetId);
      return `Entlädt an ${fobLabel(game, f)}`;
    }
    case 'route': {
      const from = fobLabel(game, game.getEntity(o.fromId));
      const to = fobLabel(game, game.getEntity(o.toId));
      return o.phase === 'load' ? `Pendelt ${from} → ${to} (lädt)` : `Pendelt ${from} → ${to} (liefert)`;
    }
    default:
      return 'Bereit';
  }
}

// Attachments (PLAN.md §4). Reine Daten + Helfer.
// mods: nur die relevanten Keys; fehlende Multiplikatoren wirken als 1.

export const ATTACHMENTS = {
  reddot: { id: 'reddot', name: 'Rotpunkt', short: 'RD', icon: 'reddot', color: '#ff3b30',
    mods: { rangeMul: 1.2 } },
  comp: { id: 'comp', name: 'Kompensator', short: 'KMP', icon: 'comp', color: '#9aa3a8',
    mods: { fireRateMul: 1.10, spreadMul: 0.5 } },
  extmag: { id: 'extmag', name: 'Erw. Magazin', short: 'MAG', icon: 'extmag', color: '#c9b458',
    mods: { fireRateMul: 1.15 } },
  hollow: { id: 'hollow', name: 'Hohlspitz', short: 'HP', icon: 'hollow', color: '#6fb7ff',
    mods: { damageMul: 1.25 } },
  ugl: { id: 'ugl', name: 'Unterlauf-GL', short: 'GL', icon: 'ugl', color: '#7fd16a',
    mods: { grenade: true } },
};

export const ATTACHMENT_IDS = Object.keys(ATTACHMENTS);

// Endwerte einer Waffe mit Attachments und permanenten Upgrades.
// upgrades darf undefined sein; damage/fireRate sind Stufen (0..max).
export function computeStats(weapon, attachmentIds, upgrades) {
  const up = upgrades || {};
  const dmgLvl = up.damage || 0;
  const frLvl = up.fireRate || 0;

  let damage = weapon.damage * (1 + 0.08 * dmgLvl);
  let fireRate = weapon.fireRate * (1 + 0.06 * frLvl);
  let range = weapon.range;
  let spread = weapon.spread;
  let grenade = false;

  const ids = attachmentIds || [];
  for (let i = 0; i < ids.length; i++) {
    const att = ATTACHMENTS[ids[i]];
    if (!att) continue;
    const m = att.mods;
    if (m.damageMul !== undefined) damage *= m.damageMul;
    if (m.fireRateMul !== undefined) fireRate *= m.fireRateMul;
    if (m.rangeMul !== undefined) range *= m.rangeMul;
    if (m.spreadMul !== undefined) spread *= m.spreadMul;
    if (m.grenade) grenade = true;
  }

  return {
    damage,
    fireRate,
    range,
    spread,
    bulletSpeed: weapon.bulletSpeed,
    pierce: weapon.pierce,
    grenade,
  };
}

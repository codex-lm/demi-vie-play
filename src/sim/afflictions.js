import { AFFLICTIONS, TIME } from '../data/balance.js';
import { excavationAt, insideExcavation } from './networks.js';

function diseaseType(disease) {
  return typeof disease === 'string' ? disease : disease.type;
}

export function hasDisease(colonist, type) {
  return (colonist.diseases ?? []).some((disease) => diseaseType(disease) === type);
}

export function hasInfection(colonist) {
  return hasDisease(colonist, 'infection');
}

// Un malade travaille 30 % moins vite, partout où sa vitesse compte.
export function infectionWorkFactor(colonist) {
  return hasInfection(colonist) ? AFFLICTIONS.INFECTION_WORK_FACTOR : 1;
}

// Comme l'école attend son instituteur : un poste « produire » de l'infirmerie
// tenu par un habitant présent dans la salle.
export function infirmaryHealerPresent(sim, room) {
  if (!room) return false;
  for (const job of sim.jobs) {
    if (job.type !== 'produce' || job.roomType !== 'infirmary'
      || job.status !== 'active' || job.excavationId !== room.id) continue;
    const healer = sim.colonists.find((person) => person.id === job.colonistId);
    if (!healer || healer.health <= 0 || healer.dead) continue;
    if (!insideExcavation(sim, room, healer.x, healer.y)) continue;
    return true;
  }
  return false;
}

// Hors infirmerie, chaque affection finit par s'éteindre seule : une blessure
// en quelques jours, une maladie en une dizaine. L'infirmerie reste le bon
// choix : une heure et un médicament au lieu de jours de fièvre.
export function updateNaturalRecovery(sim, colonist) {
  if (sim.tick % TIME.TICKS_PER_HOUR !== 0) return;
  const progress = (afflictions, days) => {
    let healed = false;
    const perHour = TIME.TICKS_PER_HOUR / (days * TIME.TICKS_PER_DAY);
    for (const affliction of afflictions) {
      affliction.recovery = (affliction.recovery ?? 0) + perHour;
      if (affliction.recovery >= 1) healed = true;
    }
    return healed ? afflictions.filter((affliction) => affliction.recovery < 1) : afflictions;
  };
  colonist.injuries = progress(colonist.injuries, AFFLICTIONS.NATURAL_INJURY_DAYS);
  colonist.diseases = progress(colonist.diseases, AFFLICTIONS.NATURAL_DISEASE_DAYS);
  colonist.injured = colonist.injuries.length > 0;
}

// Une fois par jour, chaque porteur de fièvre a une faible chance de gagner un
// habitant qui partage sa salle — un seul tirage par porteur et par jour, qui
// désigne aussi la cible. Hasard déterministe via le générateur de la simulation.
export function spreadInfections(sim) {
  if (sim.tick === 0 || sim.tick % TIME.TICKS_PER_DAY !== 0) return;
  const living = sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead);
  const chance = AFFLICTIONS.INFECTION_SPREAD_CHANCE_PER_DAY;
  for (const carrier of living) {
    if (!hasInfection(carrier)) continue;
    const room = excavationAt(sim, carrier.x, carrier.y);
    if (!room) continue;
    const candidates = living.filter((other) => other.id !== carrier.id && !hasInfection(other)
      && excavationAt(sim, other.x, other.y)?.id === room.id);
    if (candidates.length === 0) continue;
    const roll = sim.rng.next();
    if (roll >= chance) continue;
    const other = candidates[Math.min(candidates.length - 1, Math.floor(roll / chance * candidates.length))];
    other.diseases.push({ type: 'infection', recovery: 0, sourceId: carrier.id, sinceTick: sim.tick });
    sim.log('warning', 'eventInfectionSpread', {
      id: other.id, name: carrier.name, otherId: other.id, otherName: other.name,
    });
  }
}

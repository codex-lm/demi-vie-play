export const LAW_VOTE_COOLDOWN_TICKS = 10 * 1440;

export const FACTION_IDS = Object.freeze(['remonteurs', 'profonds']);

export const FACTION_RULES = Object.freeze({
  UNLOCK_TICK: 365 * 1440,
  INITIAL_SUPPORT: 50,
  MIN_SUPPORT: 0,
  MAX_SUPPORT: 100,
  CONFLICT_SUPPORT: 35,
  STRIKE_SUPPORT: 25,
  STRIKE_DURATION_DAYS: 3,
  STRIKE_DURATION_TICKS: 3 * 1440,
  STRIKE_COOLDOWN_TICKS: 7 * 1440,
});

export const LAWS = Object.freeze([
  { id: 'rationing', group: 'meals', effects: { morale: -6, foodRation: 0.75, remonteurs: 2, profonds: 5 } },
  { id: 'sharedMeals', group: 'meals', effects: { morale: 6, foodRation: 1.1, socialCare: 1, remonteurs: 4, profonds: -2 } },
  { id: 'work12', group: 'hours', effects: { morale: 5, workHours: 12, workFactor: 0.9, remonteurs: 4, profonds: -4 } },
  { id: 'work16', group: 'hours', effects: { morale: -10, workHours: 16, workFactor: 1.15, remonteurs: -6, profonds: 7 } },
  { id: 'teenWork', group: 'teens', effects: { morale: -5, workAge: 14, workFactor: 1.06, remonteurs: -3, profonds: 5 } },
  { id: 'birthQuota', group: 'births', effects: { morale: -4, birthFactor: 0.25, remonteurs: 5, profonds: -3 } },
  { id: 'birthBoost', group: 'births', effects: { morale: 4, birthFactor: 2, socialCare: 1, remonteurs: -4, profonds: 5 } },
  { id: 'expeditionLottery', group: 'expeditions', effects: { morale: -3, expeditionFactor: 1, remonteurs: 3, profonds: 2 } },
  { id: 'expeditionVolunteers', group: 'expeditions', effects: { morale: 3, expeditionFactor: 1.2, foodRation: 1.05, remonteurs: 6, profonds: -3 } },
  { id: 'quarantine', group: 'care', effects: { morale: -2, careDustExposure: 0.8, carriedDustExposure: 0.2, remonteurs: -2, profonds: 4 } },
  { id: 'childrenFirst', group: 'care', effects: { morale: 4, childCareFactor: 1.5, remonteurs: 3, profonds: 2 } },
  { id: 'openGate', group: 'outsiders', effects: { morale: 3, outsiderFactor: 1.5, remonteurs: 8, profonds: -6 } },
  { id: 'closedShelter', group: 'outsiders', effects: { morale: -3, outsiderFactor: 0, remonteurs: -7, profonds: 7 } },
  { id: 'evenings', group: 'evenings', effects: { morale: 8, socialCare: 1, socialFactor: 1.5, remonteurs: 4, profonds: -3 } },
  { id: 'curfew', group: 'evenings', effects: { morale: -6, socialFactor: 0.6, remonteurs: -5, profonds: 5 } },
  { id: 'schoolMandatory', group: 'education', effects: { morale: 3, teachFactor: 1.5, socialCare: 1, remonteurs: 2, profonds: 3 } },
]);

export function lawDefinition(id) {
  return LAWS.find((law) => law.id === id) ?? null;
}

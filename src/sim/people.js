import { PEOPLE, TRAITS, TRAIT_IDS, WORK_TYPES } from '../data/people.js';
import { RNG, hashString } from './rng.js';

export function createPersonProfile(seed, id) {
  const rng = new RNG(hashString(`${seed}:person:${id}`));
  const firstTrait = rng.int(0, TRAIT_IDS.length - 1);
  let secondTrait = rng.int(0, TRAIT_IDS.length - 2);
  if (secondTrait >= firstTrait) secondTrait += 1;
  const priorities = {};
  for (const type of WORK_TYPES) priorities[type] = 3;
  return {
    age: rng.int(20, 58),
    sex: rng.chance(0.5) ? 'female' : 'male',
    traits: [TRAIT_IDS[firstTrait], TRAIT_IDS[secondTrait]],
    portrait: {
      skin: rng.int(0, 4), hair: rng.int(0, 5), eyes: rng.int(0, 3), style: rng.int(0, 4),
    },
    relations: {},
    coupleId: null,
    pregnancy: null,
    lastBirthTick: null,
    moraleValue: null,
    moraleCauses: [],
    moraleEvents: [],
    moraleHistory: [],
    moraleTrend: 0,
    moraleTrend24h: 0,
    neglectDays: 0,
    moraleAlertLevel: null,
    moraleAlertResolvedTick: null,
    moraleAlertJournalLevel: null,
    crisis: { level: null, behavior: null, since: null, until: null, nextTick: null, episode: 0 },
    priorities,
    automaticPriorities: true,
    lifeStage: 'adult',
    bodyLocation: 'colony',
    ossuaryId: null,
  };
}

// Needs are percentages of a person's capacity: smaller portions restore the
// same percentage for young children, without halving consumption twice.
export function consumptionFactor(colonist) {
  return (colonist.age ?? PEOPLE.ADULT_AGE) < PEOPLE.YOUNG_CHILD_AGE ? PEOPLE.YOUNG_CHILD_NEEDS_FACTOR : 1;
}

function traitValue(colonist, key, fallback = 1) {
  let value = fallback;
  for (const trait of colonist.traits ?? []) {
    const effect = TRAITS[trait]?.[key];
    if (Number.isFinite(effect)) value *= effect;
  }
  return value;
}

export function initializePeople(sim) {
  sim.nextColonistId ??= Math.max(0, ...sim.colonists.map((colonist) => colonist.id + 1));
  for (const colonist of sim.colonists) {
    const profile = createPersonProfile(sim.seed, colonist.id);
    for (const [key, value] of Object.entries(profile)) {
      if (colonist[key] === undefined || colonist[key] === null) colonist[key] = value;
    }
    if (!Number.isFinite(colonist.lastBirthTick)) {
      const births = sim.colonists.filter((child) => child.parentIds?.[0] === colonist.id && Number.isFinite(child.birthTick));
      colonist.lastBirthTick = births.length ? Math.max(...births.map((child) => child.birthTick)) : null;
    }
    colonist.morale ??= PEOPLE.INITIAL_MORALE;
    colonist.moraleValue ??= colonist.morale;
    colonist.moraleCauses = Array.isArray(colonist.moraleCauses) ? colonist.moraleCauses : [];
    colonist.moraleEvents = Array.isArray(colonist.moraleEvents) ? colonist.moraleEvents : [];
    colonist.moraleHistory = Array.isArray(colonist.moraleHistory) ? colonist.moraleHistory : [];
    colonist.relations ??= {};
    colonist.priorities ??= { ...profile.priorities };
    colonist.crisis = { ...profile.crisis, ...(colonist.crisis ?? {}) };
    colonist.workFactor = traitValue(colonist, 'workFactor');
    colonist.damageFactor = traitValue(colonist, 'damageFactor');
    colonist.sleepFactor = traitValue(colonist, 'sleepFactor');
    colonist.factionFactor = traitValue(colonist, 'factionFactor');
  }
  for (const colonist of sim.colonists) {
    for (const other of sim.colonists) {
      if (other.id === colonist.id || colonist.relations[other.id] !== undefined) continue;
      const rng = new RNG(hashString(`${sim.seed}:relation:${Math.min(colonist.id, other.id)}:${Math.max(colonist.id, other.id)}`));
      colonist.relations[other.id] = rng.int(-12, 22);
    }
  }
  for (const colonist of sim.colonists) {
    if (!colonist.traits.includes('gentle') || colonist.gentleRelationsInitialized) continue;
    for (const other of sim.colonists) {
      if (other.id === colonist.id) continue;
      const bonus = TRAITS.gentle.relationBonus;
      colonist.relations[other.id] = Math.min(100, (colonist.relations[other.id] ?? 0) + bonus);
      other.relations[colonist.id] = Math.min(100, (other.relations[colonist.id] ?? 0) + bonus);
    }
    colonist.gentleRelationsInitialized = true;
  }
  const first = sim.colonists.find((colonist) => colonist.id === 0);
  const second = sim.colonists.find((colonist) => colonist.id === 1);
  // Old games keep their historical couple, including when loading an old save.
  // Opening games have a couple chosen once; never recreate it on save/load.
  if (!sim.seededIdentities && first && second && first.health > 0 && second.health > 0) {
    first.coupleId ??= 1;
    second.coupleId ??= 0;
    first.relations[1] = Math.max(85, first.relations[1]);
    second.relations[0] = Math.max(85, second.relations[0]);
  }
  sim.nextColonistId = Math.max(sim.nextColonistId, ...sim.colonists.map((colonist) => colonist.id + 1));
}

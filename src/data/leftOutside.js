import { TIME } from './balance.js';

export const LEFT_OUTSIDE_RULES = Object.freeze({
  MIN_ITEMS: 4,
  MAX_ITEMS: 5,
  MAX_CREW: 2,
  PRICE_DELAY_DAYS: 1,
  PERSONAL_MORALE: 4,
});

const item = (id, group, durationHours, deadlineDay, deadlineHour, xOffset, reward, deduction = reward, extra = {}) => Object.freeze({
  id, group, durationHours, deadlineDay, deadlineHour, xOffset,
  deadlineTick: (deadlineDay - 1) * TIME.TICKS_PER_DAY + deadlineHour * TIME.TICKS_PER_HOUR,
  titleKey: `${id}Title`, storyKey: `${id}Story`, rewardKey: `${id}Reward`, deadlineKey: `${id}Deadline`,
  reward: Object.freeze(reward), deduction: Object.freeze(deduction), ...extra,
});

// One draw per group: only seeds and medicine are withheld from the stock.
// Tools, books and the van are earned outside; construction supplies stay intact.
// One animal pair replaces 5 medicines (20 kit-score points).
export const LEFT_OUTSIDE_ITEMS = Object.freeze([
  item('outsideSchoolSeeds', 'seeds', 1.5, 5, 12, -7, { seeds: 2 }),
  item('outsideGreenhouseSeeds', 'seeds', 2, 4, 18, 12, { seeds: 2 }),
  item('outsideGardenSeeds', 'seeds', 1, 6, 8, -4, { seeds: 2 }),
  item('outsideMechanicTools', 'tools', 2, 7, 18, 14, { tools: 1 }, {}),
  item('outsidePumpHandle', 'tools', 1.5, 4, 8, -9, { tools: 1 }, {}),
  item('outsideMinerPick', 'tools', 2.5, 8, 18, 18, { tools: 1 }, {}),
  item('outsideSchoolBooks', 'books', 1.5, 3, 18, -8, { books: 1 }, {}),
  item('outsideLibraryAtlas', 'books', 2.5, 6, 18, 19, { books: 1 }, {}),
  item('outsideMedicalBook', 'books', 2, 5, 8, 11, { books: 1 }, {}),
  item('outsideRabbits', 'living', 1, 2, 18, -3, { animalPairs: 1 }, { meds: 5 }),
  item('outsideHens', 'living', 2, 3, 8, 13, { animalPairs: 1 }, { meds: 5 }),
  item('outsideNeighbor', 'living', 1, 2, 12, 2, {}, { meds: 5 }, { recruit: true }),
  item('outsideVan', 'personal', 2.5, 9, 18, -20, { metal: 3, wood: 2 }, {}),
  item('outsideMedicineBag', 'personal', 1.5, 4, 12, 6, { meds: 4 }),
  item('outsideFamilyAlbum', 'personal', 1, 3, 18, -5, {}, {}, { morale: LEFT_OUTSIDE_RULES.PERSONAL_MORALE }),
]);

import { TIME } from '../balance.js';
import { M5 } from '../m5.js';

export const POI_RULES = Object.freeze({
  MIN_COUNT: 4,
  MAX_COUNT: 7,
  PLACEMENT_ATTEMPTS: 240,
  HORIZONTAL_MARGIN: 2,
  VERTICAL_MARGIN: 1,
});

export const SONAR_RULES = Object.freeze({
  RADIUS: M5.SONAR_RADIUS,
  ENERGY_KWH: M5.SONAR_ENERGY_KWH,
  SAMPLE_SPACING: 4,
  CONFIDENCE: 0.65,
});

export const ANNEX_RULES = Object.freeze({
  CELLS_PER_EXPEDITION: 6,
  TICKS_PER_CELL: TIME.TICKS_PER_HOUR / 2,
});

export const POI_CONTENT_RULES = Object.freeze({
  FRAGILE_LOSS_FACTOR: 1.5,
  FISH_FOOD_PER_FISH_DAY: 0.25,
  RAT_FOOD_PER_RAT_DAY: 0.1,
});

export const GUANO_RULES = Object.freeze({
  YIELD_FACTOR: 2,
  UNITS_PER_HARVEST: 1,
});

export const ENCOUNTER_RULES = Object.freeze({
  TRADE_COST: Object.freeze({ food: 5 }),
  TRADE_LOOT: Object.freeze({ meds: 2, scrap: 3 }),
  RECRUIT_COUNT: 1,
});

export const DOMESTICATION_RULES = Object.freeze({
  FOOD_COST: 4,
});

export const ENCOUNTER_CHOICES = Object.freeze([
  Object.freeze({ id: 'recruit', labelKey: 'poiEncounterRecruit', descriptionKey: 'poiEncounterRecruitEffect' }),
  Object.freeze({ id: 'trade', labelKey: 'poiEncounterTrade', descriptionKey: 'poiEncounterTradeEffect' }),
  Object.freeze({ id: 'leave', labelKey: 'poiEncounterLeave', descriptionKey: 'poiEncounterLeaveEffect' }),
]);

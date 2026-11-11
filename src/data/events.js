import { TIME } from './balance.js';
import { M5 } from './m5.js';

export const STORYTELLER_RULES = Object.freeze({
  MIN_EVENT_DELAY_TICKS: 2 * TIME.TICKS_PER_DAY,
  EVENT_DELAY_VARIABILITY_TICKS: 3 * TIME.TICKS_PER_DAY,
  MIN_WARNING_TICKS: TIME.TICKS_PER_DAY,
  MAJOR_COOLDOWN_TICKS: M5.MAJOR_COOLDOWN,
  HISTORY_LIMIT: 200,
  EARTHQUAKE_MIN_LOSS: 5,
  EARTHQUAKE_MAX_LOSS: 20,
  EARTHQUAKE_STRESS_THRESHOLD: 0.7,
  CONTAMINATION_DOSE: 0.2,
  QUARREL_RELATION_LOSS: 12,
  QUARREL_MORALE_LOSS: 4,
  CLAUSTROPHOBIA_MORALE_LOSS: 12,
  FESTIVAL_MORALE_GAIN: 8,
  FESTIVAL_FOOD_COST: 6,
  OLD_AGE_COMFORT_MORALE: 2,
  RAIDER_BASE_STRENGTH: 2,
  RAIDER_MIN_STRENGTH: 1,
  BLACK_RAIN_CHANCE: 0.5,
  RELATION_MIN: -100,
  RELATION_MAX: 100,
  BLACK_RAIN_DURATION_TICKS: 12 * TIME.TICKS_PER_HOUR,
  DUST_STORM_DURATION_TICKS: 18 * TIME.TICKS_PER_HOUR,
  MODES: Object.freeze({
    veilleur: Object.freeze({
      warningFactor: 2,
      majorCooldownTicks: 20 * TIME.TICKS_PER_DAY,
      majorWeight: 0.4,
      raiderWeight: 0.6,
      severity: 0.5,
      epidemicCount: 1,
      oldAgeLethal: false,
    }),
    chroniqueur: Object.freeze({
      warningFactor: 1,
      majorCooldownTicks: M5.MAJOR_COOLDOWN,
      majorWeight: 1,
      raiderWeight: 1,
      severity: 1,
      epidemicCount: 2,
      oldAgeLethal: true,
    }),
    implacable: Object.freeze({
      warningFactor: 1,
      majorCooldownTicks: 10 * TIME.TICKS_PER_DAY,
      majorWeight: 1.5,
      raiderWeight: 3,
      severity: 1.25,
      epidemicCount: 3,
      oldAgeLethal: true,
    }),
  }),
});

export const STORY_EVENTS = Object.freeze([
  Object.freeze({ id: 'fire', major: true, weight: 0.85, warningTicks: 2 * TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'raiders', major: true, weight: 1, warningTicks: 3 * TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'flood', major: true, weight: 0.8, warningTicks: 2 * TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'earthquake', major: true, weight: 0.8, warningTicks: 2 * TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'breakdown', major: true, weight: 1, warningTicks: TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'epidemic', major: true, weight: 0.8, warningTicks: 2 * TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'contamination', major: true, weight: 0.7, warningTicks: 3 * TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'weather', major: true, weight: 0.8, warningTicks: 2 * TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'birth', major: false, weight: 0.8, warningTicks: TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'oldAge', major: true, weight: 0.7, warningTicks: 2 * TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'quarrel', major: false, weight: 1.4, warningTicks: TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'radio', major: false, weight: 1, warningTicks: TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'claustrophobia', major: false, weight: 1.1, warningTicks: TIME.TICKS_PER_DAY }),
  Object.freeze({ id: 'festival', major: false, weight: 1.1, warningTicks: TIME.TICKS_PER_DAY }),
]);

export function storyEventDefinition(id) {
  return STORY_EVENTS.find((definition) => definition.id === id) ?? null;
}

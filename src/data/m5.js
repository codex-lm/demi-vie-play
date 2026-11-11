import { TIME } from './balance.js';

export const M5 = Object.freeze({
  PROTECTED_TICKS: 10 * TIME.TICKS_PER_DAY,
  DILEMMA_MIN_DELAY: 10 * TIME.TICKS_PER_DAY,
  DILEMMA_VARIABILITY: 10 * TIME.TICKS_PER_DAY,
  MAJOR_COOLDOWN: 15 * TIME.TICKS_PER_DAY,
  CALENDAR_DAYS: 30,
  SONAR_RADIUS: 40,
  SONAR_ENERGY_KWH: 8,
  FIND_VOLUME_M3: 30,
  THAW_FIRST_DAY: 20,
  THAW_WARNING_DAYS: 10,
  THAW_DURATION_DAYS: 20,
  THAW_RISE_METERS: 3,
});

export const STORYTELLER_MODES = Object.freeze(['veilleur', 'chroniqueur', 'implacable']);
export const SEASON_IDS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

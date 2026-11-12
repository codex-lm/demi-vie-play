import { TIME } from './balance.js';

/** Only opening-created games opt in. Dates use the game's one-based day. */
export const VEILLEE = Object.freeze({
  HOUR: 20,
  NIGHT_END_HOUR: 6,
  FIRST_WEEK: 7,
  WEEKLY_UNTIL: 49,
  WEEK_DAYS: 7,
  MONTH_DAYS: 30,
  MAX_SUBJECTS: 2,
  SAFE_TARGET_HEALTH: 100,
  DEADLINE_NOTICE_TICKS: 1,
  MILESTONE_DAYS: Object.freeze([7, 30, 90]),
  MILESTONE_KINDS: Object.freeze(['week', 'month', 'season']),
  YEAR_DAYS: TIME.DAYS_PER_YEAR,
  SEASON_DAYS: TIME.DAYS_PER_SEASON,
});

export const VEILLEE_INSCRIPTIONS = Object.freeze({
  week: Object.freeze(['veilleeInscriptionWeek0', 'veilleeInscriptionWeek1']),
  month: Object.freeze(['veilleeInscriptionMonth0', 'veilleeInscriptionMonth1']),
  season: Object.freeze(['veilleeInscriptionSeason0', 'veilleeInscriptionSeason1']),
  year: Object.freeze(['veilleeInscriptionYear0', 'veilleeInscriptionYear1']),
});

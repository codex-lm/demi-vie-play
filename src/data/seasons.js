import { TIME } from './balance.js';
import { M5, SEASON_IDS } from './m5.js';

export const SEASONS = Object.freeze({
  DAYS_PER_SEASON: TIME.DAYS_PER_SEASON,
  FORECAST_DAYS: M5.CALENDAR_DAYS,
  CALENDAR_RULE_VERSION: 2,
  THAW_MIN_FROZEN_DAYS: 30,
  THAW_MAX_DEPTH_METERS: 60,
  THAW_WARNING_DAYS: M5.THAW_WARNING_DAYS,
  THAW_DURATION_DAYS: M5.THAW_DURATION_DAYS,
  THAW_MIN_RISE_METERS: 2,
  THAW_MAX_RISE_METERS: 4,
  THAW_RISE_METERS: M5.THAW_RISE_METERS,
  THAW_RECOVERY_DAYS: 20,
  THAW_RECHARGE_PER_METER_PER_DAY: 1,
  SUMMER_DOSE_FACTOR: 0.85,
  SUMMER_DURATION_FACTOR: 0.9,
  WINTER_DOSE_FACTOR: 1.1,
  WINTER_DURATION_FACTOR: 1.2,
  WINTER_MAX_EXPEDITION_HOURS: 8,
  AUTUMN_BLACK_RAIN_FACTOR: 1.5,
  AUTUMN_BLACK_RAIN_CHANCE: 0.28,
  AUTUMN_HARVEST_FOOD_PER_DAY: 3,
});

const season = (index, labelKey, extra = {}) => Object.freeze({
  index,
  labelKey,
  doseFactor: 1,
  durationFactor: 1,
  longExpeditionsBlocked: false,
  maxExpeditionHours: null,
  harvestSeason: false,
  blackRainFactor: 1,
  ...extra,
});

export const SEASON_DEFINITIONS = Object.freeze({
  spring: season(0, 'seasonSpring'),
  summer: season(1, 'seasonSummer', {
    doseFactor: SEASONS.SUMMER_DOSE_FACTOR,
    durationFactor: SEASONS.SUMMER_DURATION_FACTOR,
  }),
  autumn: season(2, 'seasonAutumn', {
    harvestSeason: true,
    blackRainFactor: SEASONS.AUTUMN_BLACK_RAIN_FACTOR,
  }),
  winter: season(3, 'seasonWinter'),
});

export const SEASON_TEXTS = Object.freeze({
  seasonSpring: 'Printemps',
  seasonSummer: 'Été',
  seasonAutumn: 'Automne',
  seasonWinter: 'Hiver',
  calendarNext30Days: 'Calendrier des 30 prochains jours',
  calendarThaw: 'Dégel : nappe +{meters} m pendant {days} jours',
  calendarHarvest: 'Récolte de surface au-dessus de 5 °C avec un collecteur et une serre alimentée',
  calendarBlackRain: 'Les pluies noires d’automne deviennent plus rares à mesure que l’hiver nucléaire se termine',
  eventThawWarning: 'Dégel dans {days} jours : la nappe montera de {meters} m pendant {duration} jours.',
  eventThawStart: 'Le dégel commence : la nappe monte progressivement de {meters} m.',
  eventThawEnd: 'Le dégel est terminé ; la nappe redescend progressivement.',
  eventHarvest: 'Récolte d’automne : {amount} nourriture déposée près du collecteur.',
  expeditionSeasonBlocked: 'Le gel limite les expéditions à 8 heures. Attendez le dégel.',
  sonarCavity: 'Cavité',
  sonarWater: 'Eau',
  sonarGas: 'Gaz',
  sonarSignals: 'Échos du dernier sondage',
  annexProgress: '{explored} / {total} cellules explorées',
});

export { SEASON_IDS };

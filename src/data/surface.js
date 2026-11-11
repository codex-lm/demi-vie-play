import { TIME } from './balance.js';

export const RADIATION = Object.freeze({
  R1: 450,
  RCS: 0.004,
  START_HOURS: 24,
  FALLOUT_EXPONENT: 1.2,
  CESIUM_HALF_LIFE_YEARS: 30,
  SAFE_RATE: 0.005,
  HEALTHY_MAX_MSV: 250,
  ACUTE_MSV: 1000,
  ACUTE_WARNING_MSV: 600,
  // Une source de dose n'est annoncée qu'à partir de 1 mSv pas encore signalé
  // (la limite annuelle du public) : bien avant les 100 mSv exigés par M4, et
  // sans bruit pour les quelques millièmes de mSv par heure de l'aération non
  // filtrée.
  SOURCE_ALERT_MSV: 1,
  ACUTE_WINDOW_TICKS: 2 * TIME.TICKS_PER_DAY,
  ACUTE_DAMAGE_DELAY_TICKS: TIME.TICKS_PER_DAY,
  ACUTE_DAMAGE_PER_DAY: 18,
  SUIT_PROTECTION: 0.5,
  REINFORCED_SUIT_PROTECTION: 0.8,
  DUST_BREACH_MSV: 18,
  DUST_CLOUD_TICKS: 6 * TIME.TICKS_PER_HOUR,
  VENTILATION_DUST_MSV_PER_HOUR: 0.002,
  VENTILATION_DUST_DECAY_TICKS: TIME.DAYS_PER_YEAR * TIME.TICKS_PER_DAY,
  RADON_VENTILATION_FACTOR: 3,
  RADON_SEAL_DIVISOR: 2,
  MONTHLY_ILLNESS_TICKS: 30 * TIME.TICKS_PER_DAY,
  EXPORT_FILE: 'colonie-demi-vie.json',
});

export const WEATHER = Object.freeze({
  FIRST_EVENT_TICK: 5 * TIME.TICKS_PER_DAY,
  EVENT_INTERVAL_TICKS: 7 * TIME.TICKS_PER_DAY,
  MIN_WARNING_TICKS: 12 * TIME.TICKS_PER_HOUR,
  ANTENNA_WARNING_TICKS: 24 * TIME.TICKS_PER_HOUR,
  BLACK_RAIN_TICKS: 12 * TIME.TICKS_PER_HOUR,
  RAIN_TICKS: TIME.TICKS_PER_DAY,
  DUST_STORM_TICKS: 18 * TIME.TICKS_PER_HOUR,
  CLEARING_TICKS: 2 * TIME.TICKS_PER_DAY,
  BLACK_RAIN_SURFACE_FACTOR: 1.5,
  BLACK_RAIN_NAPPE_DOSE: 0.35,
  NAPPE_HALF_LIFE_DAYS: 180,
  NAPPE_CONTAMINATION_THRESHOLD: 0.05,
  DUST_FILTER_FACTOR: 3,
  DUST_DOSE_FACTOR: 3,
  STORM_SOLAR_FACTOR: 0.25,
  RAIN_SOLAR_FACTOR: 0.45,
  CLEARING_SOLAR_FACTOR: 1.3,
});

export const SURFACE_STRUCTURES = Object.freeze({
  antenna: Object.freeze({ cost: Object.freeze({ metal: 8, electronics: 2 }), crew: 2, workHours: 6 }),
  geiger: Object.freeze({ cost: Object.freeze({ metal: 5, electronics: 1 }), crew: 1, workHours: 4 }),
  solarPanel: Object.freeze({ cost: Object.freeze({ metal: 6, electronics: 1 }), crew: 2, workHours: 6, generationKw: 6 }),
  rainCollector: Object.freeze({ cost: Object.freeze({ metal: 5 }), crew: 1, workHours: 4, waterPerDay: 48 }),
  ventShaft: Object.freeze({ cost: Object.freeze({ metal: 4 }), crew: 1, workHours: 5 }),
  lookout: Object.freeze({ cost: Object.freeze({ wood: 4, metal: 2 }), crew: 1, workHours: 4 }),
});

export const SURFACE_SLOTS = Object.freeze([43, 46, 50, 53, 56, 59]);

export const SURFACE_SITES = Object.freeze([
  Object.freeze({ id: 'supermarket', x: 18, durationHours: 6, revealAfter: 0, encounterChance: 0.15, loot: Object.freeze({ food: [8, 16], seeds: [1, 3], wood: [1, 3] }) }),
  Object.freeze({ id: 'hospital', x: 76, durationHours: 8, revealAfter: 0, encounterChance: 0.25, loot: Object.freeze({ meds: [4, 8] }) }),
  Object.freeze({ id: 'gasStation', x: 12, durationHours: 5, revealAfter: 1, encounterChance: 0.15, loot: Object.freeze({ fuel: [8, 16] }) }),
  Object.freeze({ id: 'library', x: 82, durationHours: 6, revealAfter: 2, encounterChance: 0.1, loot: Object.freeze({ books: [5, 9] }) }),
  Object.freeze({ id: 'farm', x: 8, durationHours: 8, revealAfter: 3, encounterChance: 0.2, loot: Object.freeze({ seeds: [4, 7], tools: [2, 4], animalPairs: [1, 1], wood: [3, 6] }) }),
  Object.freeze({ id: 'militaryDepot', x: 88, durationHours: 10, revealAfter: 4, encounterChance: 0.4, loot: Object.freeze({ metal: [8, 14], tools: [2, 4] }) }),
  Object.freeze({ id: 'electronicsFactory', x: 68, durationHours: 8, revealAfter: 5, encounterChance: 0.25, loot: Object.freeze({ electronics: [3, 6], scrap: [8, 14] }) }),
  Object.freeze({ id: 'fireStation', x: 28, durationHours: 7, revealAfter: 6, encounterChance: 0.25, loot: Object.freeze({ tools: [3, 5], metal: [4, 8] }) }),
  Object.freeze({ id: 'waterPlant', x: 91, durationHours: 9, revealAfter: 7, encounterChance: 0.2, loot: Object.freeze({ filters: [4, 8], scrap: [4, 8] }) }),
  Object.freeze({ id: 'distantShelter', x: 55, durationHours: 10, revealAfter: 8, encounterChance: 0.8, loot: Object.freeze({ books: [2, 4], meds: [2, 4] }) }),
]);

// Un lieu fouillé s'épuise : chaque visite retire 5 % de butin futur, sans jamais
// descendre sous 30 % du stock de départ, et se régénère très lentement.
export const SITE_DEPLETION = Object.freeze({
  VISIT_FACTOR: 0.95,
  FLOOR: 0.3,
  REGEN_PER_DAY: 0.01,
});

export const EXPEDITION = Object.freeze({
  MIN_CREW: 1,
  MAX_CREW: 4,
  AIRLOCK_TICKS: TIME.TICKS_PER_HOUR,
  RETURN_DOSE_FACTOR: 1,
  SCOUT_DOSE_SKILL: 0.04,
  // Une personne porte 8 unités : le butin d'une expédition est plafonné à ce que
  // l'équipe peut ramener, la fourchette du site restant le stock disponible.
  CARRY_UNITS_PER_PERSON: 8,
});

export const EXODUS = Object.freeze({
  KIT_WORK_MINUTES: 8 * TIME.TICKS_PER_HOUR,
  // Twelve people, one 90-day growing season and thirty days of food margin.
  KIT_REQUIREMENTS: Object.freeze({ seeds: 10, tools: 4, metal: 10, books: 6, animalPairs: 1, meds: 5, food: 1440, fuel: 60 }),
  COLONY_FOOD_BUFFER_DAYS: 45,
  COLONY_FUEL_BUFFER: 45,
  KIT_SCORE_VALUES: Object.freeze({ seeds: 2, tools: 5, metal: 1, books: 3, animalPairs: 20, meds: 4, food: 1, fuel: 1 }),
  FIRST_YEAR_MONTHS: 12,
  DAYS_PER_MONTH: 30,
  FIRST_YEAR_DOSE_HOURS: 8640,
  HARVEST_MIN_TEMPERATURE: 5,
  GROWING_SEASON_DAYS: 90,
  HARVEST_FOOD_PER_SEED: 360,
  FOOD_PER_COLONIST_DAY: 1,
  FUEL_PER_COLD_DAY: 3,
  STARVATION_DEATH_RATE: 0.2,
  COLD_DEATH_RATE: 0.15,
  HEALTHY_SCORE: 100,
  OTHER_LIVING_SCORE: 40,
  SKILL_SCORE: 10,
  DEFEAT_MORALE: 10,
  DEFEAT_TICKS: 20 * TIME.TICKS_PER_DAY,
  EXPORT_VERSION: 1,
});

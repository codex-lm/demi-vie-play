export const WORLD = Object.freeze({
  WIDTH: 96,
  SKY_HEIGHT: 12,
  SURFACE_Y: 12,
  DEPTH: 400,
  BEDROCK_Y: 412,
  HEIGHT: 416,
  REVEAL_RADIUS: 2,
  INITIAL_REVEAL_RADIUS: 10,
  CHUNK_SIZE: 32,
});

export const TIME = Object.freeze({
  TICKS_PER_DAY: 1440,
  TICKS_PER_HOUR: 60,
  START_HOUR: 6,
  // Real-time pace only: the simulation never reads the tick rate. At speed 1
  // ("Vivre") a day of 1 440 ticks lasts ten real minutes; the faster speeds
  // are multiples of it (10 = one day per minute, the former x1). Names, day
  // lengths and the rules attached to a speed live in data/speeds.js.
  TICKS_PER_SECOND_AT_X1: 2.4,
  SPEEDS: [0, 1, 10, 30, 100, 300],
  MAX_TICKS_PER_FRAME: 400,
  DAYS_PER_SEASON: 90,
  DAYS_PER_YEAR: 360,
});

export const CELL = Object.freeze({ SOLID: 0, EMPTY: 1 });

export const EXCAVATION = Object.freeze({
  ROOM_MIN_W: 3,
  ROOM_MAX_W: 24,
  ROOM_MIN_H: 3,
  ROOM_MAX_H: 8,
  GALLERY_MIN_H: 2,
  GALLERY_MAX_H: 3,
  SHAFT_MIN_W: 1,
  SHAFT_MAX_W: 3,
  GALLERY_SECTION: 2,
  MIN_DIMENSION: 1,
  MAX_DIMENSION: 64,
  DOOR_WIDTH: 1,
  DOOR_HEIGHT: 2,
});

export const STRUCTURE = Object.freeze({
  INITIAL_INTEGRITY: 100,
  STABLE_RATIO: 0.7,
  FAILURE_RATIO: 1,
  DEPTH_SCALE: 250,
  SLAB_MIN: 2,
  SLAB_FACTOR: 0.35,
  SLAB_EXPONENT: 1.5,
  RUBBLE_SLAB_WEIGHT: 0.5,
  WALL_HEIGHT_FACTOR: 0.25,
  WALL_LOAD_FACTOR: 0.25,
  WALL_MATERIAL_FACTOR: 8,
  TUNNEL_SEGMENT_LENGTH: 6,
  TUNNEL_COLLAPSE_MARGIN: 1,
  DOOR_WALL_MULTIPLIER: 1.25,
  DAILY_RECOVERY: 0,
  YELLOW_LOSS: 20,
  RED_BASE_LOSS: 6,
  RED_STRESS_LOSS: 60,
  INTEGRITY_MAX_LOSS_PER_DAY: 35,
  HUMIDITY_MULTIPLIER: 2,
  VIBRATION_MULTIPLIER: 1.5,
  CLAY_MULTIPLIER: 1.3,
  REPAIR_PER_WORKER_DAY: 10,
  REPAIR_STONE_COST: 1,
  UNSAFE_REPAIR_CAP: 50,
  CRACK_INTEGRITY: 70,
  DUST_INTEGRITY: 40,
  DANGER_INTEGRITY: 15,
  COLLAPSE_DEATH_CHANCE: 0.6,
  COLLAPSE_RECOVERABLE: 0.3,
  ROCKFALL_INJURY_CHANCE_PER_HOUR: 0.05,
  SUPPORT_ROT_PER_DAY: 1,
  // Solidité à partir de laquelle un étai pourri est signalé et remplaçable.
  SUPPORT_ROT_WARNING: 25,
});

export const SHAPES = Object.freeze({
  flat: { factor: 1, digFactor: 1 },
  vault: { factor: 1.5, digFactor: 1.25 },
  round: { factor: 1.9, digFactor: 1.4, minHeightRatio: 0.6 },
});

export const WORK = Object.freeze({
  MINUTES_PER_HOUR: 60,
  WALK_CELLS_PER_MINUTE: 2.4,
  LADDER_CELLS_PER_MINUTE: 0.4 * 60,
  ELEVATOR_CELLS_PER_MINUTE: 2 * 60,
  GRAVITY_CELLS_PER_MINUTE: 8,
  // A one-row step (ledge) is walked: one cell across plus one cell up or
  // down, so it costs two walked cells, the time the move really takes.
  STEP_WALK_CELLS: 2,
  // Hours a living colonist may stay cut off from every reachable food or
  // clean-water stock before the stranded warning is raised (once).
  STRANDED_WARNING_HOURS: 3,
  // Rule C: a digger whose loosened cell waits for the rock above stays on it
  // only when that rock falls within these ticks; otherwise it takes other work.
  DIG_WAIT_UPPER_TICKS: 10,
  SAFE_FALL_CELLS: 3,
  // A rock cell someone stands on, whose opening would drop them further than
  // SAFE_FALL_CELLS, waits: its excavation looks again after these ticks.
  DIG_STANDER_RETRY_TICKS: 10,
  // Somebody cut off on a rock pillar over a cave may be dropped (the floor
  // under them dug) when the fall leaves them at least this much health: any
  // fall they survive, as before the dig safety rules (waiting would starve
  // them; a fall that would kill them waits for the player to reach them).
  RESCUE_FALL_MIN_HEALTH: 1,
  FALL_DAMAGE_PER_CELL: 15,
  CARRY_CAPACITY: 6,
  HAUL_MINUTES_PER_UNIT: 12,
  MAX_DIGGERS_PER_EXCAVATION: 8,
  DIGGERS_PER_SHAFT_FACE: 2,
  SHAFT_CLEAR_WORK_PER_TICK: 2,
  IDLE_WANDER_TICKS: 45,
  IDLE_WANDER_RADIUS: 1,
  IDLE_WANDER_STAGGER: 3,
  BASE_DIG_SKILL: 1,
  DIG_SKILL_BONUS: 0.65,
  HUNGER_PER_DAY: 80,
  SLEEP_PER_DAY: 100,
  HUNGER_RESTORE: 100,
  SLEEP_RESTORE_PER_HOUR: 100 / 8,
  WORK_START_HOUR: 8,
  WORK_END_HOUR: 22,
  DEFAULT_WORK_HOURS: 14,
  FOOD_PER_MEAL: 1,
  EAT_MINUTES: 20,
});

export const STARTING_RESOURCES = Object.freeze({
  stone: 0,
  clayRes: 0,
  sandRes: 0,
  coal: 0,
  ironOre: 0,
  copperOre: 0,
  leadOre: 0,
  uraniumOre: 0,
  wood: 20,
  metal: 30,
  cement: 0,
  food: 360,
  waterClean: 600,
  waterDirty: 0,
  fuel: 60,
  meds: 20,
  filters: 10,
  seeds: 12,
});

export const WATER = Object.freeze({
  MAX_PER_CELL: 100,
  LEGACY_MAX_PER_CELL: 8,
  DEFAULT_TABLE_DEPTH: 24,
  ABOVE_TABLE_SEEP_FACTOR: 0.02,
  CLAY_SHIELD_METERS: 2,
  UPDATE_INTERVAL: 10,
  INFILTRATION_PERMEABILITY: 2,
  FLOW_PER_UPDATE: 50,
  FLOOD_UNUSABLE_RATIO: 0.3,
  WADING_MIN_RATIO: 0.12,
  WADING_SPEED_FACTOR: 0.45,
  // Fraction of the head cell filled with water (not the room average).
  HEAD_CELL_OFFSET: 1,
  DROWNING_RATIO: 0.75,
  DROWNING_DAMAGE_PER_HOUR: 40,
  // Décision de Demi-Vie : une immersion sans préavis tue en 2 à 3 h. Le rouge
  // part dès que la tête est restée trois ticks consécutifs sous l'eau (les
  // transitoires de jonction d'un tick ne comptent pas) et les dégâts ne
  // commencent qu'après ce court temps de débattue, compté depuis le premier
  // tick d'immersion. Une remontée d'un instant ne referme pas l'épisode :
  // il faut une heure complète au sec.
  SUDDEN_IMMERSION_GRACE_TICKS: 15,
  SUDDEN_IMMERSION_CONFIRM_TICKS: 3,
  SUDDEN_IMMERSION_DRY_TICKS: 60,
  WARNING_LEAD_TICKS: TIME.TICKS_PER_DAY,
  FLOOD_RED_CONFIRM_TICKS: 12,
  // Une alerte d'inondation de pièce, une fois levée, tient jusqu'à ce que sa
  // propre condition de levée ait duré une heure d'affilée : la même heure au
  // sec que celle qui referme une immersion soudaine.
  FLOOD_ALERT_CLEAR_TICKS: TIME.TICKS_PER_HOUR,
  FLOOD_ESCAPE_RETRY_TICKS: 30,
  PUMP_UNITS_PER_HOUR: 24,
  HAUL_MINUTES_PER_UNIT: 2,
  WELL_UNITS_PER_DAY: 360,
  FILTER_UNITS_PER_DAY: 240,
  FILTER_UNITS_PER_FILTER: 900,
  RECYCLER_UNITS_PER_DAY: 120,
  DECON_UNITS_PER_DAY: 80,
  CISTERN_CAPACITY: 600,
  GREY_WATER_PER_PERSON_DAY: 1,
  CONTAMINATED_DEPTH: 40,
  // The fallout sinks through the ground: shallow aquifers stay merely dirty for
  // the first months, then turn radioactive as the front passes them.
  FALLOUT_DESCENT_PER_DAY: 0.2,
  // Il faut des semaines pour réunir une décontamination (électronique en expédition)
  // ou descendre jusqu'au grès : prévenir un mois avant.
  WELL_CONTAMINATION_WARNING_DAYS: 30,
  CLEAN_WATER_PER_DRINK: 3,
});

export const AIR = Object.freeze({
  REFERENCE_ROOM_CELLS: 20,
  WARNING_LEAD_TICKS: TIME.TICKS_PER_DAY,
  DIESEL_CO2_PER_HOUR: 1.5,
  FORGE_CO2_PER_HOUR: 0.5,
  ALGAE_CO2_PER_HOUR: 0.6,
  HYDROPONICS_O2_PER_HOUR: 0.2,
  HYDROPONICS_CO2_PER_HOUR: 0.15,
  INITIAL_O2: 100,
  INITIAL_CO2: 0,
  SURFACE_O2: 100,
  SURFACE_CO2: 0,
  O2_PER_PERSON_DAY: 4,
  CO2_PER_PERSON_DAY: 2.5,
  CO2_DESCEND_PER_HOUR: 0.08,
  CONNECTED_EXCHANGE_PER_HOUR: 0.04,
  VENT_EXCHANGE_PER_HOUR: 0.35,
  NETWORK_VENTILATION_FACTOR: 0.5,
  MANUAL_EXCHANGE_PER_HOUR: 0.55,
  MANUAL_WORK_RADIUS: 4,
  MANUAL_DISTANCE_DECAY: 0.65,
  MANUAL_DISTANCE_SCALE: 6,
  MANUAL_MIN_FACTOR: 0.05,
  TREND_WARMUP_DAYS: 2,
  SCRUBBER_CO2_PER_HOUR: 1.5,
  ALGAE_O2_PER_HOUR: 0.8,
  ALGAE_FOOD_PER_DAY: 1,
  FILTERS_PER_DAY: 0.25,
  ALERT_O2: 80,
  ALERT_CO2: 5,
  ALERT_RED_O2: 50,
  ALERT_RED_CO2: 15,
  DANGER_O2: 30,
  DANGER_CO2: 20,
  HEALTH_DAMAGE_PER_HOUR: 4,
});

export const ALERTS = Object.freeze({
  YELLOW_FORECAST_DAYS: 2,
  // Eau et nourriture : réparer une chaîne (courant, filtres, station) prend des jours.
  STOCK_YELLOW_FORECAST_DAYS: 5,
  // Les filtres : il faut creuser jusqu'au sable ou au charbon, aménager un
  // atelier et fabriquer, ou attendre le dégel pour la station de traitement.
  // Dix jours ne suffisaient pas : prévenir un mois avant.
  FILTER_YELLOW_FORECAST_DAYS: 30,
  // Une salle de vie sous 8 °C : l'hiver approche, il reste le temps de descendre.
  COLD_SETTLING_C: 8,
  COLD_SETTLING_DEPTH: 40,
  COLD_SETTLING_LEAD_DAYS: 120,
  RED_FORECAST_DAYS: 0.5,
  TREND_RESPONSE_TICKS: 60,
  MIN_LEVEL_TICKS: 240,
  RESOLVED_REEMIT_TICKS: 12 * TIME.TICKS_PER_HOUR,
  STOCK_EPSILON: 1e-6,
  JOURNAL_MAX_ENTRIES: 400,
});

export const INDUSTRY = Object.freeze({
  NO_INPUT_LOG_DELAY_TICKS: TIME.TICKS_PER_HOUR,
  NO_INPUT_REEMIT_TICKS: 12 * TIME.TICKS_PER_HOUR,
});

export const HEAT = Object.freeze({
  INITIAL_ROOM: 12,
  SURFACE_START: -20,
  SURFACE_FINAL: 12,
  NUCLEAR_WINTER_DAYS: 1200,
  SEASON_AMPLITUDE: 8,
  SEASON_PHASE_DAYS: TIME.DAYS_PER_SEASON / 2,
  GEO_BASE: 12,
  GEO_GRADIENT: 0.1,
  ROCK_DIFFUSIVITY_M2_PER_DAY: 0.0864,
  ROCK_TIME_CONSTANT_DAYS: 2,
  WALL_EXCHANGE_KW_PER_C_M: 0.0445,
  INSULATION_FACTOR: 3,
  COMFORT_MIN: 16,
  COMFORT_MAX: 26,
  ALERT_COLD: 12,
  ALERT_HOT: 22,
  DANGER_MIN: 5,
  DANGER_MAX: 38,
  COLD_DAMAGE_MID_C: 0,
  COLD_DAMAGE_MID_PER_HOUR: 0.5,
  COLD_DAMAGE_SEVERE_C: -10,
  COLD_DAMAGE_SEVERE_PER_HOUR: 2,
  SLEEP_BLANKET_C: 4,
  SURFACE_SUIT_C: 15,
  WARNING_LEAD_TICKS: TIME.TICKS_PER_DAY,
  PERSON_KW: 0.1,
  DIESEL_KW: 15,
  FORGE_KW: 20,
  GEOTHERMAL_RESIDUAL_KW: 10,
  HEALTH_DAMAGE_PER_HOUR: 2,
  MAX_FATIGUE_FACTOR: 2,
  HEATER_KW_TO_ROOM: 6,
  HEAT_PUMP_KW: 1.5,
  WASTE_HEAT_FRACTION: 0.8,
  AIR_ROCK_WARMING_M: 12,
  EXCHANGER_RECOVERY: 0.6,
  CONNECTED_EXCHANGE_PER_HOUR: 0.012,
  VENTILATION_CONNECTED_FACTOR: 0.02,
  VENTILATION_DIRECT_FACTOR: 0.015,
});

export const POWER = Object.freeze({
  DIESEL_KW: 20,
  DIESEL_FUEL_HOURS: 8,
  DIESEL_IDLE_FUEL_FACTOR: 0.25,
  BIKE_KW: 0.3,
  MICRO_HYDRO_MIN_KW: 5,
  MICRO_HYDRO_MAX_KW: 15,
  GEOTHERMAL_KW: 40,
  GEOTHERMAL_MIN_DEPTH: 330,
  GEOTHERMAL_MIN_ROCK_TEMP: 45,
  RTG_KW: 8,
  BATTERY_KWH: 200,
  SOLAR_MAX_KW: 6,
  SOLAR_DAYLIGHT_HOURS: 12,
  SOLAR_DAYLIGHT_AMPLITUDE: 4,
  SOLAR_NOON_HOUR: 12,
  SOLAR_PEAK_FACTOR: 0.45,
  SOLAR_PEAK_AMPLITUDE: 0.2,
  UPDATE_INTERVAL: 10,
  PRIORITIES: ['air', 'water', 'infirmary', 'food', 'other'],
});

export const NEEDS = Object.freeze({
  THIRST_PER_DAY: 100,
  THIRST_RESTORE: 100,
  WATER_PER_DRINK: 3,
  DIRTY_WATER_INFECTION_CHANCE: 0.15,
  DRINK_MINUTES: 12,
  SOCIAL_PER_DAY: 18,
  LIGHT_PER_DAY: 12,
  INTIMACY_PER_DAY: 10,
  PURPOSE_PER_DAY: 8,
  NEED_RESTORE_PER_HOUR: 12,
  LOW_NEED_THRESHOLD: 30,
  CRITICAL_NEED_THRESHOLD: 80,
  MEAL_REST_THRESHOLD: 80,
  STARVATION_DAMAGE_PER_HOUR: 0.15,
  STARVATION_WORK_FACTOR: 0.6,
  DEHYDRATION_DAMAGE_PER_HOUR: 5,
  HEALTH_RECOVERY_PER_HOUR: 0.25,
  INFIRMARY_RECOVERY_PER_HOUR: 2,
  INITIAL_MORALE: 75,
});

// Infections et blessures non soignées : elles affaiblissent, ralentissent le
// travail et se transmettent ; l'infirmerie les efface avec des médicaments.
export const AFFLICTIONS = Object.freeze({
  INFECTION_DAMAGE_PER_HOUR: 0.3,
  INJURY_DAMAGE_PER_HOUR: 0.2,
  INFECTION_WORK_FACTOR: 0.7,
  INFECTION_SPREAD_CHANCE_PER_DAY: 0.05,
  INFIRMARY_MEDS_PER_CURE: 1,
  // Sans médicament, une blessure met deux fois plus de temps à guérir.
  INFIRMARY_SLOW_INJURY_FACTOR: 2,
  // Hors infirmerie, le temps fait son œuvre : une blessure s'éteint en trois
  // jours, une maladie en six. Le drainage dure jusqu'à la guérison.
  NATURAL_INJURY_DAYS: 3,
  NATURAL_DISEASE_DAYS: 6,
});

export const CULTIVATION = Object.freeze({
  FIT_MINUTES: 120,
  WATER_BUFFER_LOADS: 2,
  PRODUCTION_INTERVAL: 60,
  MUSHROOM_FOOD_PER_DAY: 8,
  MUSHROOM_WATER_PER_DAY: 8,
  MUSHROOM_WASTE_PER_DAY: 4,
  HYDROPONICS_FOOD_PER_DAY: 14,
  HYDROPONICS_WATER_PER_DAY: 18,
  INSECT_FOOD_PER_DAY: 4,
  INSECT_WASTE_PER_DAY: 12,
  ORGANIC_WASTE_PER_FOOD: 1,
  RAT_FOOD_PER_DAY: 3,
  RAT_WASTE_PER_DAY: 6,
  FISH_FOOD_PER_DAY: 10,
  // Twelve adults provide about ten waste units/day; leave a feeding margin.
  FISH_WASTE_PER_DAY: 8,
  FISH_WATER_PER_DAY: 8,
  KITCHEN_NUTRITION_BONUS: 0.2,
  CANTEEN_WASTE_REDUCTION: 0.2,
  COLD_PANTRY_TEMPERATURE: 10,
  COLD_PANTRY_CONSERVATION_FACTOR: 2,
  FOOD_SPOIL_PER_DAY: 0.005,
});

export const CAMERA = Object.freeze({
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 3,
  SMOOTHING: 14,
  PAN_SPEED: 24,
  SURFACE_SCREEN_RATIO: 0.1,
});

export const SAVE_VERSION = 1;

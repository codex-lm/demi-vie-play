import { AIR, CULTIVATION, HEAT, POWER, WATER } from './balance.js';

const definition = (minW, minH, cost, category, extra = {}) => Object.freeze({
  minW, minH, cost: Object.freeze(cost), category, jobs: 0, powerKw: 0, ...extra,
});

export const ROOM_DEFS = Object.freeze({
  dorm: definition(6, 3, { wood: 4 }, 'other', { bedsPerSixMeters: 4 }),
  canteen: definition(6, 3, { wood: 6, metal: 2 }, 'food', { jobs: 1, mealsPerDay: 24, wasteReduction: CULTIVATION.CANTEEN_WASTE_REDUCTION }),
  washroom: definition(3, 3, { metal: 4 }, 'water', { powerKw: 1, greyWaterPerPersonDay: WATER.GREY_WATER_PER_PERSON_DAY }),
  infirmary: definition(5, 3, { metal: 8, meds: 2 }, 'infirmary', { jobs: 1, powerKw: 2 }),
  commons: definition(6, 4, { wood: 6 }, 'other', { powerKw: 1 }),
  school: definition(5, 3, { wood: 4, books: 1 }, 'other', { jobs: 1, powerKw: 1 }),
  chapel: definition(4, 3, { wood: 3, stone: 2 }, 'other', { powerKw: 1 }),
  archive: definition(4, 3, { wood: 4, books: 2 }, 'other', { jobs: 1, powerKw: 1 }),
  workshop: definition(5, 3, { wood: 4, metal: 5 }, 'other', { jobs: 2, powerKw: 0 }),
  lab: definition(5, 3, { metal: 5, books: 1 }, 'other', { jobs: 2, powerKw: 3 }),
  exodusDepot: definition(6, 3, { wood: 6, metal: 4 }, 'other', { jobs: 1, powerKw: 0, storage: 'exodus' }),
  ossuary: definition(3, 3, { stone: 4 }, 'other', { powerKw: 1 }),
  mushroom: definition(6, 3, { wood: 4 }, 'food', { jobs: 1, scalesWithSize: true, foodPerDay: CULTIVATION.MUSHROOM_FOOD_PER_DAY, waterPerDay: CULTIVATION.MUSHROOM_WATER_PER_DAY, inputResource: 'organicWaste', inputPerDay: CULTIVATION.MUSHROOM_WASTE_PER_DAY, acceptsGuano: true }),
  hydroponics: definition(6, 3, { metal: 6, seeds: 2 }, 'food', { jobs: 2, scalesWithSize: true, powerKw: 4, foodPerDay: CULTIVATION.HYDROPONICS_FOOD_PER_DAY, waterPerDay: CULTIVATION.HYDROPONICS_WATER_PER_DAY, acceptsGuano: true, airHelp: 'airHelp_hydroponics' }),
  insectFarm: definition(4, 3, { wood: 3 }, 'food', { jobs: 1, scalesWithSize: true, foodPerDay: CULTIVATION.INSECT_FOOD_PER_DAY, inputResource: 'organicWaste', inputPerDay: CULTIVATION.INSECT_WASTE_PER_DAY }),
  ratFarm: definition(4, 3, { wood: 2 }, 'food', { jobs: 1, scalesWithSize: true, foodPerDay: CULTIVATION.RAT_FOOD_PER_DAY, inputResource: 'organicWaste', inputPerDay: CULTIVATION.RAT_WASTE_PER_DAY }),
  fishTank: definition(6, 3, { metal: 5 }, 'food', { jobs: 1, scalesWithSize: true, powerKw: 2, foodPerDay: CULTIVATION.FISH_FOOD_PER_DAY, inputResource: 'organicWaste', inputPerDay: CULTIVATION.FISH_WASTE_PER_DAY, waterPerDay: CULTIVATION.FISH_WATER_PER_DAY, requiresCaveWater: true }),
  kitchen: definition(5, 3, { metal: 4 }, 'food', { jobs: 2, powerKw: 1, mealsPerDay: 24, nutritionBonus: CULTIVATION.KITCHEN_NUTRITION_BONUS }),
  pantry: definition(4, 3, { wood: 4 }, 'food', { storage: 'food' }),
  well: definition(5, 3, { metal: 5 }, 'water', { jobs: 1, powerKw: 0, waterPerDay: WATER.WELL_UNITS_PER_DAY, outputResource: 'waterDirty', requiresAquifer: true }),
  filterPlant: definition(5, 3, { metal: 5, filters: 1 }, 'water', { jobs: 1, powerKw: 1, waterPerDay: WATER.FILTER_UNITS_PER_DAY, inputResource: 'waterDirty', outputResource: 'waterClean' }),
  recycler: definition(5, 3, { metal: 8 }, 'water', { jobs: 1, powerKw: 3, waterPerDay: WATER.RECYCLER_UNITS_PER_DAY, inputResource: 'waterGrey', outputResource: 'waterDirty' }),
  cistern: definition(4, 3, { metal: 6 }, 'water', { storage: 'water', capacity: WATER.CISTERN_CAPACITY }),
  decon: definition(5, 3, { metal: 10, electronics: 2 }, 'water', { jobs: 1, powerKw: 6, waterPerDay: WATER.DECON_UNITS_PER_DAY, inputResource: 'waterRadioactive', outputResource: 'waterClean' }),
  pump: definition(3, 3, { metal: 5 }, 'water', { jobs: 1, powerKw: 2, pumpUnitsPerHour: WATER.PUMP_UNITS_PER_HOUR }),
  diesel: definition(4, 3, { metal: 10 }, 'other', { generationKw: POWER.DIESEL_KW, heatKw: HEAT.DIESEL_KW, airHelp: 'airHelp_diesel' }),
  bikeDynamo: definition(4, 3, { metal: 3 }, 'other', { jobs: 4, generationPerWorkerKw: POWER.BIKE_KW }),
  microHydro: definition(6, 3, { metal: 12 }, 'other', { generationKw: POWER.MICRO_HYDRO_MAX_KW, requiresRiver: true }),
  geothermal: definition(6, 4, { metal: 30, electronics: 4 }, 'other', { generationKw: POWER.GEOTHERMAL_KW, heatKw: HEAT.GEOTHERMAL_RESIDUAL_KW, requiresGeothermal: true }),
  rtg: definition(4, 3, { rtg: 1 }, 'other', { generationKw: POWER.RTG_KW }),
  battery: definition(4, 3, { metal: 6, copperOre: 4, leadOre: 2 }, 'other', { capacityKwh: POWER.BATTERY_KWH }),
  surfaceSolar: definition(2, 2, { metal: 6, electronics: 1 }, 'other', { generationKw: POWER.SOLAR_MAX_KW, surfaceOnly: true, kinds: ['room', 'quarry'] }),
  ventShaft: definition(1, 3, { metal: 4 }, 'air', { powerKw: 1, kinds: ['shaft'], requiresSurfaceConnection: true, exchangePerHour: AIR.VENT_EXCHANGE_PER_HOUR, airHelp: 'airHelp_ventShaft' }),
  elevator: definition(2, 3, { metal: 12, electronics: 2 }, 'other', { powerKw: 2, kinds: ['shaft'] }),
  airFilter: definition(4, 3, { metal: 6, filters: 1 }, 'air', { jobs: 1, powerKw: 2, airHelp: 'airHelp_airFilter' }),
  gasDetector: definition(3, 3, { metal: 4, electronics: 1 }, 'air', { powerKw: 1 }),
  scrubber: definition(4, 3, { metal: 8 }, 'air', { jobs: 1, powerKw: 3, scrubberCo2PerHour: AIR.SCRUBBER_CO2_PER_HOUR, airHelp: 'airHelp_scrubber' }),
  algaeTank: definition(5, 3, { metal: 5, seeds: 1 }, 'air', { jobs: 1, powerKw: 2, algaeO2PerHour: AIR.ALGAE_O2_PER_HOUR, foodPerDay: AIR.ALGAE_FOOD_PER_DAY, acceptsGuano: true, airHelp: 'airHelp_algaeTank' }),
  heater: definition(3, 3, { metal: 4 }, 'other', { powerKw: HEAT.HEAT_PUMP_KW, heatKw: HEAT.HEATER_KW_TO_ROOM, heatHelp: 'heatHelp_heater' }),
  heatExchanger: definition(3, 3, { metal: 8 }, 'other', { powerKw: 1, exchanger: true, heatHelp: 'heatHelp_exchanger' }),
  storage: definition(3, 3, { wood: 3 }, 'other', { kinds: ['room', 'gallery'], galleryMaxW: 3, storage: 'general' }),
});

export const FITTABLE_ROOMS = Object.freeze(Object.keys(ROOM_DEFS));

// Comme les lits du dortoir, une culture rend par tranche de sa taille minimale :
// production, consommation d'intrants et postes sont multipliés par
// floor(w / minW). Les salles hors culture (transformation, eau, air) ne
// grandissent pas. Sans largeur connue (fiche générique du menu), échelle 1.
export function productionScale(definition, excavation) {
  if (!definition?.scalesWithSize || !Number.isFinite(excavation?.w)) return 1;
  return Math.max(1, Math.floor(excavation.w / definition.minW));
}

// Les intrants sont simultanés : un support ou aliment ne remplace pas l'eau.
export function foodInputsPerDay(definition, excavation) {
  const scale = productionScale(definition, excavation);
  const inputs = {};
  if (definition.inputResource && definition.inputPerDay > 0) {
    inputs[definition.inputResource] = definition.inputPerDay * scale;
  }
  if (definition.waterPerDay > 0) {
    inputs.waterClean = (inputs.waterClean ?? 0) + definition.waterPerDay * scale;
  }
  return inputs;
}

export function roomJobCount(definition, excavation) {
  return (definition?.jobs ?? 0) * productionScale(definition, excavation);
}

export function roomDefinition(roomType) {
  return ROOM_DEFS[roomType] ?? null;
}

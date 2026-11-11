import { CULTIVATION, POWER, TIME, WATER, WORK, WORLD, AFFLICTIONS } from '../data/balance.js';
import { GUANO_RULES } from '../data/poi/rules.js';
import { PEOPLE } from '../data/people.js';
import { foodInputsPerDay, productionScale, roomDefinition, roomJobCount } from '../data/rooms.js';
import { rockTemperature } from './heat.js';
import { excavationOccupants, insideExcavation } from './networks.js';
import { excavationReachable } from './nav.js';
import { addToStock, createStock, hasResources, spendResources, spendableAmount } from './resources.js';
import * as waterSystem from './water.js';
import { researchEffect } from './research.js';
import { lawMultiplier } from './laws.js';
import { isResearched } from './research.js';
import { infirmaryHealerPresent, infectionWorkFactor } from './afflictions.js';
import { starvingWorkFactor } from './condition.js';

function waterFeature(sim, excavation, feature) {
  const capitalized = feature[0].toUpperCase() + feature.slice(1);
  const names = [`has${capitalized}Access`, `has${capitalized}`, feature, `is${capitalized}`, `${feature}At`];
  const x = excavation.x + Math.floor(excavation.w / 2);
  const y = excavation.y + excavation.h - 1;
  for (const name of names) {
    const check = waterSystem[name];
    if (typeof check !== 'function') continue;
    return Boolean(check.length >= 3 ? check(sim, x, y) : check(sim, excavation));
  }
  if (feature === 'caveWater' && typeof waterSystem.hasRiverAccess === 'function') {
    return Boolean(waterSystem.hasRiverAccess(sim, excavation));
  }
  return false;
}

// Même règle que l'air (air.js) et la chaleur (heat.js) : le puits lui-même doit
// déboucher à la surface. Un puits court relié à la trappe de l'abri ne fait
// circuler aucun air ; on refusait de le dire et l'objectif le comptait.
function connectedToSurface(sim, excavation) {
  return (excavation.dugCells ?? []).some((index) => sim.world.coords(index).y === WORLD.SURFACE_Y);
}

export function fittingError(sim, excavation, roomType) {
  const definition = roomDefinition(roomType);
  if (!definition || definition.foundOnly || !excavation
    || excavation.state === 'collapsed' || excavation.state === 'planned' || excavation.state === 'digging') return 'invalidPlacement';
  if (roomType === 'elevator' && !isResearched(sim, 'elevator')) return 'researchLocked';
  if (excavation.roomType) return 'overlap';
  const kinds = definition.kinds ?? ['room'];
  if (!kinds.includes(excavation.kind) && excavation.kind === 'quarry') return 'invalidPlacement';
  if (!kinds.includes(excavation.kind) || excavation.w < definition.minW || excavation.h < definition.minH) return 'invalidSize';
  if (excavation.kind === 'gallery' && (roomType !== 'storage' || excavation.w > definition.galleryMaxW)) return 'invalidSize';
  if (definition.surfaceOnly && !excavation.cells.some((index) => sim.world.coords(index).y === WORLD.SURFACE_Y)) return 'invalidPlacement';
  if (definition.requiresAquifer && !waterFeature(sim, excavation, 'aquifer')) return 'noAquifer';
  if (definition.requiresRiver && !waterFeature(sim, excavation, 'river')) return 'noRiver';
  if (definition.requiresCaveWater && !waterFeature(sim, excavation, 'caveWater')) return 'noCaveWater';
  if (definition.requiresSurfaceConnection && !connectedToSurface(sim, excavation)) return 'noSurfaceConnection';
  if (definition.requiresGeothermal) {
    const depth = excavation.y - WORLD.SURFACE_Y;
    if (depth < POWER.GEOTHERMAL_MIN_DEPTH || rockTemperature(sim, depth) + 1e-6 < POWER.GEOTHERMAL_MIN_ROCK_TEMP) return 'invalidGeothermal';
  }
  return null;
}

export function queueFitting(sim, excavation, roomType) {
  const error = fittingError(sim, excavation, roomType);
  if (error) return { ok: false, error };
  if (!excavationReachable(sim, excavation)) return { ok: false, error: 'roomUnreachable' };
  const definition = roomDefinition(roomType);
  if (!hasResources(sim, definition.cost)) return { ok: false, error: 'noResources' };
  const existing = sim.jobs.find((job) => job.type === 'fit' && job.excavationId === excavation.id && job.status !== 'done');
  if (existing) return { ok: false, error: 'overlap' };
  const job = {
    id: sim.nextJobId++, type: 'fit', excavationId: excavation.id, roomType,
    status: 'queued', colonistId: null, phase: 'work', work: 0,
    requiredWork: CULTIVATION.FIT_MINUTES, retryTick: 0, cost: { ...definition.cost }, paid: false,
  };
  sim.jobs.push(job);
  return { ok: true, job };
}

function needsStock(definition) {
  return Boolean(definition.storage || definition.foodPerDay || definition.waterPerDay
    || definition.mealsPerDay || definition.greyWaterPerPersonDay);
}

function ensureRoomStock(sim, excavation, definition) {
  if (!needsStock(definition)) return null;
  const id = `room-${excavation.id}`;
  let stock = sim.stocks.find((candidate) => candidate.id === id);
  if (!stock) {
    stock = createStock(id, excavation.x + Math.floor((excavation.w - 1) / 2), excavation.y + excavation.h - 1);
    stock.excavationId = excavation.id;
    stock.roomType = excavation.roomType;
    stock.storage = definition.storage ?? null;
    if (definition.capacity !== undefined) stock.capacity = definition.capacity;
    sim.stocks.push(stock);
  }
  excavation.stockId = id;
  return stock;
}

export function completeFitting(sim, job) {
  const excavation = sim.excavation(job.excavationId);
  const definition = roomDefinition(job.roomType);
  if (!excavation || !definition || excavation.state === 'collapsed'
    || (excavation.roomType && excavation.roomType !== job.roomType)) return null;
  if (excavation.roomType === job.roomType && excavation.state === 'fitted') return excavation;
  excavation.roomType = job.roomType;
  excavation.state = 'fitted';
  excavation.production = { workMinutes: 0, produced: 0, status: 'idle' };
  if (definition.bedsPerSixMeters) excavation.beds = Math.floor(excavation.w / definition.minW) * definition.bedsPerSixMeters;
  excavation.nutritionBonus = definition.nutritionBonus ?? 0;
  excavation.wasteReduction = definition.wasteReduction ?? 0;
  const stock = ensureRoomStock(sim, excavation, definition);
  if (stock) {
    stock.nutritionBonus = definition.nutritionBonus ?? 0;
    stock.wasteReduction = definition.wasteReduction ?? 0;
  }
  sim.log('info', 'eventFitted', { id: excavation.id, roomType: job.roomType }, excavation);
  sim.events.push({ type: 'fit', tick: sim.tick, excavationId: excavation.id, roomType: job.roomType, x: excavation.x, y: excavation.y });
  return excavation;
}

function roomStock(sim, excavation) {
  return sim.stocks.find((stock) => stock.id === excavation.stockId)
    ?? sim.stocks.find((stock) => stock.excavationId === excavation.id)
    ?? ensureRoomStock(sim, excavation, roomDefinition(excavation.roomType));
}

function unavailableStatus(excavation, definition) {
  if (excavation.disabled) return 'disabled';
  if ((excavation.floodRatio ?? 0) > WATER.FLOOD_UNUSABLE_RATIO) return 'flooded';
  if (definition.powerKw > 0 && (!excavation.powered || excavation.powerShed)) return 'noPower';
  return null;
}

function produceRatio(sim, excavation, definition) {
  if (!definition.jobs) return 1;
  let weighted = 0;
  const counted = new Set();
  for (const job of sim.jobs) {
    if (job.type !== 'produce' || job.excavationId !== excavation.id || job.status !== 'active' || job.colonistId === null) continue;
    if (counted.has(job.colonistId)) continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    if (!colonist || colonist.health <= 0 || (colonist.age ?? PEOPLE.MINIMUM_WORK_AGE) < PEOPLE.MINIMUM_WORK_AGE) continue;
    if (!insideExcavation(sim, excavation, colonist.x, colonist.y)) continue;
    // Un travailleur malade compte 30 % de moins dans la cadence de la salle,
    // un affamé au maximum de la faim 40 % de moins.
    counted.add(colonist.id);
    weighted += infectionWorkFactor(colonist) * starvingWorkFactor(colonist);
  }
  return Math.min(1, weighted / roomJobCount(definition, excavation));
}

function takeRoomResource(stock, resource, amount) {
  if (amount <= 0) return true;
  if ((stock.resources[resource] ?? 0) + 1e-9 < amount) return false;
  stock.resources[resource] -= amount;
  if (stock.resources[resource] <= 0) delete stock.resources[resource];
  return true;
}

function runProduction(sim, excavation, definition, perDay, produce) {
  const production = excavation.production ??= { workMinutes: 0, produced: 0, status: 'idle' };
  const unavailable = unavailableStatus(excavation, definition);
  if (unavailable) {
    production.status = unavailable;
    return false;
  }
  const ratio = produceRatio(sim, excavation, definition);
  if (ratio <= 0) {
    production.status = 'noWorkers';
    return false;
  }
  production.workMinutes = Math.min(CULTIVATION.PRODUCTION_INTERVAL,
    (production.workMinutes ?? 0) + ratio * lawMultiplier(sim, 'workFactor', 1));
  if (production.workMinutes + 1e-9 < CULTIVATION.PRODUCTION_INTERVAL) {
    production.status = 'working';
    return false;
  }
  const amount = perDay * CULTIVATION.PRODUCTION_INTERVAL / TIME.TICKS_PER_DAY;
  const produced = produce(amount);
  if (!produced) {
    production.status = 'noInput';
    production.workMinutes = CULTIVATION.PRODUCTION_INTERVAL;
    return false;
  }
  production.workMinutes = 0;
  production.produced = (production.produced ?? 0) + (typeof produced === 'number' ? produced : amount);
  production.status = 'producing';
  return true;
}

function updateFoodProduction(sim, excavation, definition) {
  const stock = roomStock(sim, excavation);
  if (!stock) return;
  const yieldFactor = excavation.roomType === 'hydroponics' ? researchEffect(sim, 'hydroponicsFactor', 1) : 1;
  // Une culture large rend par tranche de sa taille minimale, et boit autant.
  const scale = productionScale(definition, excavation);
  runProduction(sim, excavation, definition, definition.foodPerDay * yieldFactor * scale, (amount) => {
    const inputs = Object.entries(foodInputsPerDay(definition, excavation))
      .map(([resource, perDay]) => [resource, perDay * CULTIVATION.PRODUCTION_INTERVAL / TIME.TICKS_PER_DAY]);
    // Vérifier la recette entière avant de prélever évite de perdre le support
    // quand l'eau manque, ou l'eau quand les animaux ne sont pas nourris.
    if (inputs.some(([resource, needed]) => (stock.resources[resource] ?? 0) + 1e-9 < needed)) return false;
    for (const [resource, needed] of inputs) takeRoomResource(stock, resource, needed);
    const boosted = definition.acceptsGuano && spendResources(sim, { guano: GUANO_RULES.UNITS_PER_HARVEST });
    const produced = amount * (boosted ? GUANO_RULES.YIELD_FACTOR : 1);
    if (boosted) {
      excavation.production.guanoConsumed = (excavation.production.guanoConsumed ?? 0) + GUANO_RULES.UNITS_PER_HARVEST;
    }
    addToStock(stock, 'food', produced);
    return produced;
  });
}

function mealNutrition(sim, excludedStockId) {
  let bonus = 0;
  for (const stock of sim.stocks) {
    if (stock.id !== excludedStockId && (stock.resources.meals ?? 0) > 0) bonus = Math.max(bonus, stock.nutritionBonus ?? 0);
  }
  return bonus;
}

function updateMealProduction(sim, excavation, definition) {
  const stock = roomStock(sim, excavation);
  if (!stock) return;
  const inputResource = excavation.roomType === 'kitchen' ? 'food' : 'meals';
  const nutritionBonus = excavation.roomType === 'canteen'
    ? Math.max(stock.nutritionBonus ?? 0, mealNutrition(sim, stock.id)) : definition.nutritionBonus;
  runProduction(sim, excavation, definition, definition.mealsPerDay, (amount) => {
    const inputAmount = amount * WORK.FOOD_PER_MEAL;
    if (!takeRoomResource(stock, inputResource, inputAmount)) return false;
    addToStock(stock, 'meals', amount);
    stock.nutritionBonus = nutritionBonus ?? 0;
    stock.wasteReduction = definition.wasteReduction ?? 0;
    return true;
  });
}

function updateWaterProduction(sim, excavation, definition) {
  if (definition.requiresAquifer && !waterFeature(sim, excavation, 'aquifer')) {
    excavation.production ??= { workMinutes: 0, produced: 0, status: 'idle' };
    excavation.production.status = 'noAquifer';
    return;
  }
  const stock = roomStock(sim, excavation);
  if (!stock) return;
  const yieldFactor = excavation.roomType === 'recycler' ? researchEffect(sim, 'recyclerFactor', 1)
    : excavation.roomType === 'decon' ? researchEffect(sim, 'deconFactor', 1) : 1;
  runProduction(sim, excavation, definition, definition.waterPerDay * yieldFactor, (amount) => {
    const filterCapacity = WATER.FILTER_UNITS_PER_FILTER * researchEffect(sim, 'filterFactor', 1);
    const filtersNeeded = excavation.roomType === 'filterPlant' ? amount / filterCapacity : 0;
    if (definition.inputResource && !takeRoomResource(stock, definition.inputResource, amount)) return false;
    if (!takeRoomResource(stock, 'filters', filtersNeeded)) return false;
    addToStock(stock, definition.outputResource, amount);
    return true;
  });
  // Sans filtre nulle part dans l'abri, dire la vraie raison de l'arrêt plutôt
  // que « matière première manquante » ou « aucun travailleur ».
  if (excavation.roomType === 'filterPlant' && ['noInput', 'noWorkers'].includes(excavation.production?.status)
    && !sim.stocks.some((candidate) => (candidate.resources.filters ?? 0) > 1e-6)) {
    excavation.production.status = 'noFilters';
  }
}

function updateWashroom(sim, excavation, definition) {
  const production = excavation.production ??= { workMinutes: 0, produced: 0, status: 'idle' };
  const unavailable = unavailableStatus(excavation, definition);
  if (unavailable) {
    production.status = unavailable;
    return;
  }
  const occupants = excavationOccupants(sim, excavation.id).length;
  if (!occupants) {
    production.status = 'idle';
    return;
  }
  const amount = occupants * definition.greyWaterPerPersonDay / TIME.TICKS_PER_DAY;
  const stock = roomStock(sim, excavation);
  if (!stock) return;
  addToStock(stock, 'waterGrey', amount);
  production.produced = (production.produced ?? 0) + amount;
  production.status = 'producing';
}

function pantryForStock(sim, stock) {
  return sim.excavations.find((excavation) => excavation.roomType === 'pantry'
    && excavation.state !== 'collapsed' && excavation.state !== 'planned' && excavation.state !== 'digging'
    && (stock.excavationId === excavation.id || (stock.x >= excavation.x && stock.x < excavation.x + excavation.w
      && stock.y >= excavation.y && stock.y < excavation.y + excavation.h))) ?? null;
}

function foodConservation(sim, stock) {
  const pantry = pantryForStock(sim, stock);
  return pantry && pantry.temperature < CULTIVATION.COLD_PANTRY_TEMPERATURE
    ? CULTIVATION.COLD_PANTRY_CONSERVATION_FACTOR : 1;
}

// What the stocks lose to spoilage per day at the current rate: food and meals
// lose FOOD_SPOIL_PER_DAY of their amount, half that in a cold pantry. Read by
// the reserve panel so the loss is not a hidden rule.
export function foodSpoilageModel(sim) {
  let stored = 0;
  let perDay = 0;
  let coldStored = 0;
  for (const stock of sim.stocks ?? []) {
    const amount = (stock.resources?.food ?? 0) + (stock.resources?.meals ?? 0);
    if (amount <= 0) continue;
    const conservation = foodConservation(sim, stock);
    stored += amount;
    perDay += amount * CULTIVATION.FOOD_SPOIL_PER_DAY / conservation;
    if (conservation > 1) coldStored += amount;
  }
  return { stored, perDay, coldStored };
}

function updateFoodSpoilage(sim) {
  for (const stock of sim.stocks) {
    const conservation = foodConservation(sim, stock);
    const lossRatio = CULTIVATION.FOOD_SPOIL_PER_DAY / TIME.TICKS_PER_DAY / conservation;
    for (const resource of ['food', 'meals']) {
      const amount = stock.resources[resource] ?? 0;
      if (amount > 0) stock.resources[resource] = Math.max(0, amount - amount * lossRatio);
    }
  }
}

// L'infirmerie ne produit rien : son état dit si les patients au lit sont
// soignés, et ce qui manque quand ils attendent (soignant, médicaments).
function updateInfirmaryStatus(sim, excavation, definition) {
  const production = excavation.production ??= { workMinutes: 0, produced: 0, status: 'idle' };
  const unavailable = unavailableStatus(excavation, definition);
  if (unavailable) {
    production.status = unavailable;
    return;
  }
  const patients = sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead
    && colonist.personal?.type === 'care' && colonist.personal.phase === 'caring'
    && colonist.personal.excavationId === excavation.id);
  if (patients.length === 0) {
    production.status = 'idle';
    return;
  }
  if (patients.some((colonist) => colonist.diseases.length > 0) && !infirmaryHealerPresent(sim, excavation)) {
    production.status = 'noHealer';
    return;
  }
  if (spendableAmount(sim, 'meds') < AFFLICTIONS.INFIRMARY_MEDS_PER_CURE) {
    production.status = 'noMeds';
    return;
  }
  production.status = 'working';
}

export function updateRooms(sim) {
  updateFoodSpoilage(sim);
  for (const excavation of sim.excavations) {
    if (!excavation.roomType || (excavation.state !== 'fitted' && excavation.state !== 'dug')) continue;
    const definition = roomDefinition(excavation.roomType);
    if (!definition) continue;
    if (definition.greyWaterPerPersonDay) updateWashroom(sim, excavation, definition);
    if (definition.foodPerDay) updateFoodProduction(sim, excavation, definition);
    else if (definition.mealsPerDay) updateMealProduction(sim, excavation, definition);
    else if (definition.waterPerDay && definition.outputResource) updateWaterProduction(sim, excavation, definition);
    if (excavation.roomType === 'infirmary') updateInfirmaryStatus(sim, excavation, definition);
  }
}

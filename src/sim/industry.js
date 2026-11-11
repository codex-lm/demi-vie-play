import { INDUSTRY, TIME, WATER } from '../data/balance.js';
import { recipeDefinition } from '../data/recipes.js';
import { roomDefinition } from '../data/rooms.js';
import { requestRoomResources } from './jobs.js';
import { insideExcavation } from './networks.js';
import { addToStock, ensureRoomStock, spendResources } from './resources.js';
import { isResearched, researchEffect } from './research.js';
import { lawMultiplier } from './laws.js';
import { starvingWorkFactor } from './condition.js';

function usableWorkshop(excavation) {
  if (!excavation || excavation.roomType !== 'workshop' || excavation.state === 'collapsed'
    || (excavation.state !== 'fitted' && !excavation.initial) || excavation.disabled
    || (excavation.floodRatio ?? 0) > WATER.FLOOD_UNUSABLE_RATIO) return false;
  const definition = roomDefinition('workshop');
  return definition.powerKw <= 0 || (excavation.powered && !excavation.powerShed);
}

function presentWorkers(sim, excavation) {
  const colonistIds = new Set();
  let output = 0;
  for (const job of sim.jobs) {
    if (job.type !== 'produce' || job.excavationId !== excavation.id || job.status !== 'active') continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    if (!colonist || colonist.health <= 0) continue;
    if (!insideExcavation(sim, excavation, colonist.x, colonist.y)) continue;
    // Un affamé au maximum de la faim ne compte que pour une fraction d'ouvrier.
    if (colonistIds.has(colonist.id)) continue;
    colonistIds.add(colonist.id);
    output += starvingWorkFactor(colonist);
  }
  return output;
}

function hasLocalResources(stock, cost) {
  return Object.entries(cost).every(([resource, amount]) => (stock.resources[resource] ?? 0) + 1e-9 >= amount);
}

export function setWorkshopRecipe(sim, excavationId, recipeId) {
  const excavation = sim.excavation(excavationId);
  const recipe = recipeDefinition(recipeId);
  if (!excavation || excavation.roomType !== 'workshop' || !recipe) return { ok: false, error: 'invalidPlacement' };
  if (recipe.research && !isResearched(sim, recipe.research)) return { ok: false, error: 'researchLocked' };
  if (excavation.recipeId !== recipeId) {
    excavation.recipeId = recipeId;
    const production = excavation.production ??= { workMinutes: 0, produced: 0, status: 'idle' };
    production.workMinutes = 0;
    production.status = 'idle';
  }
  return { ok: true, recipe };
}

function flushWorkshopDay(sim, excavation) {
  const production = excavation.production ??= { workMinutes: 0, produced: 0, status: 'idle' };
  const day = Math.floor(sim.tick / TIME.TICKS_PER_DAY);
  production.dailyDay ??= day;
  production.dailyOutputs ??= {};
  if (production.dailyDay === day) return;
  for (const [resource, amount] of Object.entries(production.dailyOutputs)) {
    if (amount > 0) sim.log('info', 'eventWorkshopDaily', { id: excavation.id, amount, resource }, excavation);
  }
  production.dailyDay = day;
  production.dailyOutputs = {};
}

function stopForInputs(sim, excavation, production) {
  const incoming = sim.jobs.some((job) => job.type === 'stockHaul' && job.destinationStockId === excavation.stockId
    && (job.status === 'queued' || job.status === 'active'));
  if (incoming) {
    production.noInputSince = null;
    production.status = 'noInput';
    return;
  }
  production.noInputSince ??= sim.tick;
  const durable = sim.tick - production.noInputSince >= INDUSTRY.NO_INPUT_LOG_DELAY_TICKS;
  const cooledDown = sim.tick - (production.lastNoInputLogTick ?? -Infinity) >= INDUSTRY.NO_INPUT_REEMIT_TICKS;
  if (durable && cooledDown) {
    sim.log('warning', 'eventWorkshopNoInput', { id: excavation.id }, excavation);
    production.lastNoInputLogTick = sim.tick;
  }
  production.status = 'noInput';
}

function updateWorkshop(sim, excavation) {
  const production = excavation.production ??= { workMinutes: 0, produced: 0, status: 'idle' };
  if (!usableWorkshop(excavation)) {
    production.status = excavation.disabled ? 'disabled' : 'noPower';
    return;
  }
  const recipe = recipeDefinition(excavation.recipeId ?? 'filters');
  if (!recipe || (recipe.research && !isResearched(sim, recipe.research))) {
    production.status = 'researchLocked';
    return;
  }
  const stock = ensureRoomStock(sim, excavation);
  requestRoomResources(sim, excavation, recipe.inputs);
  if (!hasLocalResources(stock, recipe.inputs)) {
    stopForInputs(sim, excavation, production);
    return;
  }
  production.noInputSince = null;
  const workers = presentWorkers(sim, excavation);
  if (workers === 0) {
    production.status = 'noWorkers';
    return;
  }
  production.workMinutes += workers * researchEffect(sim, 'workFactor', 1) * lawMultiplier(sim, 'workFactor', 1);
  production.status = 'working';
  if (production.workMinutes + 1e-9 < recipe.workMinutes) return;
  if (!spendResources(sim, recipe.inputs, stock)) {
    stopForInputs(sim, excavation, production);
    return;
  }
  production.workMinutes = Math.max(0, production.workMinutes - recipe.workMinutes);
  production.produced = (production.produced ?? 0) + recipe.amount;
  production.status = 'producing';
  production.dailyOutputs ??= {};
  production.dailyOutputs[recipe.output] = (production.dailyOutputs[recipe.output] ?? 0) + recipe.amount;
  addToStock(stock, recipe.output, recipe.amount);
}

export function updateIndustry(sim) {
  for (const excavation of sim.excavations) {
    if (excavation.roomType !== 'workshop') continue;
    flushWorkshopDay(sim, excavation);
    updateWorkshop(sim, excavation);
  }
  return sim.excavations;
}

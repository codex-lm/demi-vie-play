import { recipeDefinition } from '../data/recipes.js';
import { ROOM_DEFS, foodInputsPerDay } from '../data/rooms.js';
import { EXODUS } from '../data/surface.js';
import { headSubmerged } from './immersion.js';
import { isWalkableIn, navigationComponent, navigationTargets, rebuildNav } from './nav.js';

export function createStock(id, x, y, resources = {}) {
  return { id, x, y, resources: { ...resources } };
}

export function resourceTotals(sim) {
  const totals = {};
  for (const stock of sim.stocks) {
    for (const [key, amount] of Object.entries(stock.resources)) totals[key] = (totals[key] ?? 0) + amount;
  }
  return totals;
}

const RESERVE_OF = Object.freeze({ food: 'food', meals: 'food', waterClean: 'water', fuel: 'fuel', filters: 'filters' });

// One-off arrivals and departures (expedition loot, radio trades, dilemma aid,
// raider theft) are not a consumption trend. Rebase the 24 h reserve history as
// if they had always been there, so the "days left" reading stays honest
// instead of jumping to "no consumption" or 145 days after a supply run.
export function recordReserveShift(sim, resource, amount) {
  const key = RESERVE_OF[resource];
  if (!key || !Number.isFinite(amount) || amount === 0) return;
  for (const entry of sim.reserveHistory ?? []) {
    if (Number.isFinite(entry[key])) entry[key] += amount;
  }
}

export function addToStock(stock, resource, amount) {
  if (amount <= 0) return;
  stock.resources[resource] = Math.max(0, (stock.resources[resource] ?? 0) + amount);
}

export function spendableAmount(sim, resource) {
  let total = 0;
  for (const stock of sim.stocks) {
    if (!isExodusStockReserved(sim, stock, resource)) total += stock.resources[resource] ?? 0;
  }
  return total;
}

export function hasResources(sim, cost) {
  return Object.entries(cost).every(([key, amount]) => spendableAmount(sim, key) >= amount);
}

export function isExodusStockReserved(sim, stock, resource = null) {
  const craft = sim.exodus?.craft;
  if (!craft || craft.status === 'noDepot' || stock?.excavationId !== craft.excavationId) return false;
  return resource === null || Object.hasOwn(craft.requirements ?? EXODUS.KIT_REQUIREMENTS, resource);
}

export function spendResources(sim, cost, localStock = null) {
  const available = localStock
    ? Object.entries(cost).every(([resource, amount]) => (localStock.resources[resource] ?? 0) >= amount)
    : Object.entries(cost).every(([resource, amount]) => sim.stocks
      .filter((stock) => !isExodusStockReserved(sim, stock, resource))
      .reduce((total, stock) => total + (stock.resources[resource] ?? 0), 0) >= amount);
  if (!available) return false;
  for (const [resource, remainingAmount] of Object.entries(cost)) {
    let remaining = remainingAmount;
    for (const stock of localStock ? [localStock] : sim.stocks) {
      if (!localStock && isExodusStockReserved(sim, stock, resource)) continue;
      const taken = Math.min(remaining, stock.resources[resource] ?? 0);
      stock.resources[resource] = (stock.resources[resource] ?? 0) - taken;
      remaining -= taken;
      if (remaining <= 0) break;
    }
    // Un filtre posé dans une nouvelle installation n'est pas de l'usure : il ne
    // doit pas faire croire que la filtration en consomme un par jour.
    if (resource === 'filters') recordReserveShift(sim, 'filters', -remainingAmount);
  }
  return true;
}

export function stockNavigationTargets(sim, stock, origin = null) {
  const targets = navigationTargets(sim, stock.x, stock.y);
  if (stock.excavationId === undefined || stock.excavationId === null) {
    return targets.filter((target) => !headSubmerged(sim, target.x, target.y));
  }
  const excavation = sim.excavation(stock.excavationId);
  if (excavation?.state === 'collapsed') return [];
  if (!excavation) return targets.filter((target) => !headSubmerged(sim, target.x, target.y));
  const nav = rebuildNav(sim);
  const reference = origin ?? stock;
  const roomTargets = [];
  for (const index of excavation.dugCells ?? []) {
    const { x, y } = sim.world.coords(index);
    if (isWalkableIn(sim.world, nav, x, y)) {
      roomTargets.push({ x, y, index, distance: Math.abs(x - reference.x) + Math.abs(y - reference.y) });
    }
  }
  roomTargets.sort((a, b) => a.distance - b.distance || a.index - b.index);
  const seen = new Set(targets.map((target) => `${target.x}:${target.y}`));
  for (const target of roomTargets.slice(0, 5)) {
    const key = `${target.x}:${target.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ x: target.x, y: target.y });
  }
  return targets.filter((target) => !headSubmerged(sim, target.x, target.y));
}

export function stockConsumesResource(sim, stock, resource) {
  if (!resource || stock?.excavationId == null) return false;
  const room = sim.excavation(stock.excavationId);
  const definition = ROOM_DEFS[room?.roomType];
  if (!definition) return false;
  if (definition.foodPerDay && Object.hasOwn(foodInputsPerDay(definition, room), resource)) return true;
  if (definition.mealsPerDay && resource === (room.roomType === 'kitchen' ? 'food' : 'meals')) return true;
  if (definition.waterPerDay && definition.outputResource && resource === definition.inputResource) return true;
  if (room.roomType === 'workshop') {
    const recipe = recipeDefinition(room.recipeId ?? 'filters');
    if (recipe && Object.hasOwn(recipe.inputs, resource)) return true;
  }
  if (room.roomType === 'diesel' && resource === 'fuel') return true;
  return room.roomType === 'filterPlant' && resource === 'filters';
}

export function stockReachable(sim, colonist, stock) {
  if (!stock || !colonist) return false;
  const x = Math.round(colonist.x);
  const y = Math.round(colonist.y);
  const component = navigationComponent(sim, x, y);
  if (component < 0) return false;
  return stockNavigationTargets(sim, stock, colonist)
    .some((target) => navigationComponent(sim, target.x, target.y) === component);
}

export function stocksConnected(sim, source, destination) {
  if (!source || !destination) return false;
  return stockNavigationTargets(sim, source, destination)
    .some((origin) => stockReachable(sim, origin, destination));
}

export function nearestStock(sim, x, y, predicate = null, colonist = null, resource = null, originStock = null) {
  let best = null;
  let bestDistance = Infinity;
  const origin = originStock ?? { x, y };
  for (const stock of sim.stocks) {
    if (stockConsumesResource(sim, stock, resource) || (predicate && !predicate(stock))) continue;
    const reachable = colonist ? stockReachable(sim, colonist, stock) : stocksConnected(sim, origin, stock);
    if (!reachable) continue;
    const distance = Math.abs(stock.x - x) + Math.abs(stock.y - y);
    if (distance < bestDistance || (distance === bestDistance && String(stock.id) < String(best?.id))) {
      best = stock;
      bestDistance = distance;
    }
  }
  return best;
}

export function nearestStockResult(sim, x, y, predicate = null, colonist = null, resource = null, originStock = null) {
  const stock = nearestStock(sim, x, y, predicate, colonist, resource, originStock);
  return stock
    ? { ok: true, stock, error: null }
    : { ok: false, stock: null, error: sim.stocks.length ? 'noAccessibleStock' : 'noStock' };
}

export function reserveStock(sim, x = 0, y = 0) {
  const exact = sim.stocks.find((stock) => stock.id === 'reserve');
  if (exact) return exact;
  return nearestStock(sim, x, y, (stock) => stock.excavationId == null && !String(stock.id).startsWith('drop-'));
}

export function roomStock(sim, excavation) {
  if (!excavation) return null;
  return sim.stocks.find((stock) => stock.id === excavation.stockId)
    ?? sim.stocks.find((stock) => stock.excavationId === excavation.id)
    ?? null;
}

export function ensureRoomStock(sim, excavation) {
  const existing = roomStock(sim, excavation);
  if (existing) {
    excavation.stockId = existing.id;
    return existing;
  }
  if (excavation.roomType === 'pantry') {
    const reserve = reserveStock(sim, excavation.x, excavation.y);
    if (reserve && reserve.x >= excavation.x && reserve.x < excavation.x + excavation.w
      && reserve.y >= excavation.y && reserve.y < excavation.y + excavation.h) {
      excavation.stockId = reserve.id;
      return reserve;
    }
  }
  const stock = createStock(`room-${excavation.id}`, excavation.x + Math.floor(excavation.w / 2), excavation.y + excavation.h - 1);
  stock.excavationId = excavation.id;
  sim.stocks.push(stock);
  excavation.stockId = stock.id;
  return stock;
}

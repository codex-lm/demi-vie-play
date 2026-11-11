import { ALERTS, STARTING_RESOURCES, TIME, WATER } from '../data/balance.js';
import { ROOM_DEFS } from '../data/rooms.js';
import { reserveStock, roomStock } from '../sim/resources.js';

// Illustration scales, not storage limits: a 4 m pantry shows the starting
// provisions; one fuel can stands for up to five remaining days. These values
// never enter the simulation or its serialization.
const FOOD_STEPS = 24, WATER_STEPS = 20, MATERIAL_STEPS = 12;
export const FUEL_DAYS_PER_CAN = 5;
const TRACKED = new Set(['pantry', 'diesel', 'cistern', 'filterPlant', 'storage', 'workshop', 'decon', 'well']);
const samples = new WeakMap();
const amount = value => Number.isFinite(value) ? Math.max(0, value) : 0;
const fill = (value, reference, steps) => value > ALERTS.STOCK_EPSILON
  ? Math.min(1, Math.max(1, Math.round(value / reference * steps)) / steps) : 0;

function hourlySample(sim) {
  const hour = Math.floor((sim.tick ?? 0) / TIME.TICKS_PER_HOUR);
  let cache = samples.get(sim);
  if (!cache || cache.hour !== hour) {
    let fuel = 0, filters = 0;
    for (const stock of sim.stocks) {
      fuel += amount(stock.resources?.fuel);
      filters += amount(stock.resources?.filters);
    }
    // The official reserve includes cartridges carried between stocks. It is
    // a colony meter, never presented as physical cartridges in this room.
    const reserveFilters = sim.reserves?.filters;
    const colonyFilters = Number.isFinite(reserveFilters?.amount) ? amount(reserveFilters.amount) : filters;
    const filterDays = reserveFilters?.days;
    const days = sim.reserves?.fuel?.days;
    const empty = fuel <= ALERTS.STOCK_EPSILON;
    // null means no measured consumption, not an empty fuel reserve.
    const fuelDays = empty ? 0 : Number.isFinite(days) ? Math.max(0, days) : Infinity;
    cache = { hour, samples: (cache?.samples ?? 0) + 1, roomSamples: cache?.roomSamples ?? 0,
      rooms: new Map(), fuelCans: empty ? 0 : Math.min(5, Math.max(1, Math.ceil(fuelDays / FUEL_DAYS_PER_CAN))),
      fuelStatus: fuelDays > 10 ? 'green' : fuelDays >= 3 ? 'amber' : 'red', fuelEmpty: empty,
      colonyFiltersFill: fill(colonyFilters, STARTING_RESOURCES.filters, WATER_STEPS),
      colonyFiltersStatus: colonyFilters <= ALERTS.STOCK_EPSILON ? 'red'
        : Number.isFinite(filterDays) && filterDays < ALERTS.FILTER_YELLOW_FORECAST_DAYS ? 'amber' : 'green' };
    samples.set(sim, cache);
  }
  return cache;
}

/** Read-only, hourly snapshot. All mutable caches live outside the simulation. */
export function roomReserveArt(sim, excavation, type = excavation.roomType) {
  if (!TRACKED.has(type) || !Array.isArray(sim?.stocks)) return undefined;
  const cache = hourlySample(sim);
  if (cache.rooms.has(excavation)) return cache.rooms.get(excavation);
  let stock = roomStock(sim, excavation);
  if (!stock) {
    const reserve = reserveStock(sim, excavation.x, excavation.y);
    // The starting pantry is not linked to its reserve until its first update.
    // Never let a newly fitted empty pantry display the colony's global food.
    if (reserve && reserve.x >= excavation.x && reserve.x < excavation.x + excavation.w
      && reserve.y >= excavation.y && reserve.y < excavation.y + excavation.h) stock = reserve;
  }
  const resources = stock?.resources ?? {};
  const widthScale = Math.max(1, (excavation.w ?? ROOM_DEFS.pantry.minW) / ROOM_DEFS.pantry.minW);
  const result = Object.freeze({
    foodFill: fill(amount(resources.food) + amount(resources.meals), STARTING_RESOURCES.food * widthScale, FOOD_STEPS),
    waterFill: type === 'filterPlant'
      // The logistics buffer is one hour of input, not a day of production.
      ? fill(amount(resources.waterDirty), WATER.FILTER_UNITS_PER_DAY * TIME.TICKS_PER_HOUR / TIME.TICKS_PER_DAY, WATER_STEPS)
      : fill(amount(resources.waterClean), ROOM_DEFS.cistern.capacity, WATER_STEPS),
    // Separate glasses retain the distinction even when both kinds coexist.
    dirtyWaterFill: fill(amount(resources.waterDirty), ROOM_DEFS.cistern.capacity, WATER_STEPS),
    radioactiveWaterFill: fill(amount(resources.waterRadioactive), ROOM_DEFS.cistern.capacity, WATER_STEPS),
    localFilters: amount(resources.filters),
    localFiltersFill: fill(amount(resources.filters), 1, WATER_STEPS),
    colonyFiltersFill: cache.colonyFiltersFill, colonyFiltersStatus: cache.colonyFiltersStatus,
    fuelCans: cache.fuelCans, fuelStatus: cache.fuelStatus, fuelEmpty: cache.fuelEmpty,
    stoneFill: fill(amount(resources.stone), 24, MATERIAL_STEPS),
    woodFill: fill(amount(resources.wood), STARTING_RESOURCES.wood, MATERIAL_STEPS),
    metalFill: fill(amount(resources.metal), STARTING_RESOURCES.metal, MATERIAL_STEPS),
  });
  cache.rooms.set(excavation, result);
  cache.roomSamples += 1;
  return result;
}

export function getRoomReserveCacheStats(sim) {
  const cache = samples.get(sim);
  return { samples: cache?.samples ?? 0, roomSamples: cache?.roomSamples ?? 0,
    hour: cache?.hour ?? null, rooms: cache?.rooms.size ?? 0 };
}

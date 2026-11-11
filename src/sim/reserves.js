import { AIR, ALERTS, POWER, TIME, WATER, WORK } from '../data/balance.js';
import { consumptionFactor } from './people.js';
import { activeExcavation, excavationOccupants } from './networks.js';

const RESERVE_RESOURCES = Object.freeze(['water', 'food', 'fuel', 'filters']);
const CARRIED_RESERVE = Object.freeze({ waterClean: 'water', food: 'food', meals: 'food', fuel: 'fuel', filters: 'filters' });

function resourceTotals(sim) {
  const totals = { water: 0, food: 0, fuel: 0, filters: 0 };
  for (const stock of sim.stocks) {
    totals.water += stock.resources.waterClean ?? 0;
    totals.food += (stock.resources.food ?? 0) + (stock.resources.meals ?? 0);
    totals.fuel += stock.resources.fuel ?? 0;
    totals.filters += stock.resources.filters ?? 0;
  }
  // Ce qu'un habitant porte d'une réserve à l'autre reste dans l'abri : sans
  // cela, un seul filtre en chemin passait pour un filtre usé en une journée.
  for (const colonist of sim.colonists) {
    const carried = colonist.health > 0 ? colonist.carrying : null;
    const key = carried && CARRIED_RESERVE[carried.resource];
    if (key && Number.isFinite(carried.amount)) totals[key] += carried.amount;
  }
  return totals;
}

function updateAirTrend(sim, excavation) {
  const o2 = excavation.o2 ?? AIR.INITIAL_O2;
  const co2 = excavation.co2 ?? AIR.INITIAL_CO2;
  excavation.airHistory ??= [];
  excavation.airTrendStartedTick ??= sim.tick;
  const history = excavation.airHistory;
  if (history.length === 0 || sim.tick - history[history.length - 1].tick >= TIME.TICKS_PER_HOUR) {
    history.push({ tick: sim.tick, o2, co2 });
  }
  const cutoff = sim.tick - TIME.TICKS_PER_DAY;
  while (history.length > 1 && history[1].tick <= cutoff) history.shift();
  let oldest = history[0];
  const next = history[1];
  if (next && oldest.tick < cutoff && next.tick > cutoff) {
    const ratio = (cutoff - oldest.tick) / (next.tick - oldest.tick);
    oldest = {
      tick: cutoff,
      o2: history[0].o2 + (next.o2 - history[0].o2) * ratio,
      co2: history[0].co2 + (next.co2 - history[0].co2) * ratio,
    };
  }
  const elapsed = sim.tick - oldest.tick;
  const measured = elapsed >= TIME.TICKS_PER_DAY
    && sim.tick - excavation.airTrendStartedTick >= AIR.TREND_WARMUP_DAYS * TIME.TICKS_PER_DAY;
  excavation.airO2PerDay = measured ? (o2 - oldest.o2) * TIME.TICKS_PER_DAY / elapsed : 0;
  excavation.airCo2PerDay = measured ? (co2 - oldest.co2) * TIME.TICKS_PER_DAY / elapsed : 0;
  excavation.airO2InstantPerDay = excavation.airO2PerDay;
  excavation.airCo2InstantPerDay = excavation.airCo2PerDay;
}

export function airDays(excavation) {
  const o2 = excavation.o2 ?? AIR.INITIAL_O2;
  const co2 = excavation.co2 ?? AIR.INITIAL_CO2;
  if (o2 < AIR.DANGER_O2 || co2 > AIR.DANGER_CO2) return 0;
  const o2Rate = excavation.airO2PerDay ?? 0;
  const co2Rate = excavation.airCo2PerDay ?? 0;
  const forecasts = [];
  if (o2Rate < -ALERTS.STOCK_EPSILON) forecasts.push((o2 - AIR.DANGER_O2) / -o2Rate);
  if (co2Rate > ALERTS.STOCK_EPSILON) forecasts.push((AIR.DANGER_CO2 - co2) / co2Rate);
  if (forecasts.length === 0) return null;
  return Math.max(0, Math.min(...forecasts));
}

function theoreticalRates(sim) {
  const alive = sim.colonists.filter((colonist) => colonist.health > 0).reduce((sum, colonist) => sum + consumptionFactor(colonist), 0);
  const dieselFuelPerDay = sim.excavations.filter((excavation) => excavation.roomType === 'diesel'
    && activeExcavation(excavation) && !excavation.disabled && !excavation.machineBroken
    && (excavation.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO)
    .reduce((total, excavation) => total + (excavation.fuelPerDay
      ?? POWER.DIESEL_IDLE_FUEL_FACTOR * TIME.TICKS_PER_DAY / (TIME.TICKS_PER_HOUR * POWER.DIESEL_FUEL_HOURS)), 0);
  const filterPlants = sim.excavations.filter((excavation) => excavation.roomType === 'filterPlant'
    && excavation.state === 'fitted' && !excavation.disabled).length;
  return {
    water: alive * WATER.CLEAN_WATER_PER_DRINK,
    food: alive * WORK.FOOD_PER_MEAL,
    fuel: dieselFuelPerDay,
    filters: filterPlants * WATER.FILTER_UNITS_PER_DAY / WATER.FILTER_UNITS_PER_FILTER,
  };
}

function updateStockReserve(entry, amount, previous, elapsedTicks, theoreticalRate) {
  entry.amount = amount;
  const measured = previous !== undefined && elapsedTicks >= TIME.TICKS_PER_DAY;
  entry.ratePerDay = measured
    ? Math.max(0, (previous - amount) * TIME.TICKS_PER_DAY / elapsedTicks)
    : theoreticalRate;
  entry.estimated = !measured;
  entry.days = entry.ratePerDay > ALERTS.STOCK_EPSILON ? amount / entry.ratePerDay : null;
}

export function updateReserves(sim) {
  const totals = resourceTotals(sim);
  sim.reserveHistory ??= [];
  if (sim.reserveHistory.length === 0 || sim.tick - sim.reserveHistory[sim.reserveHistory.length - 1].tick >= TIME.TICKS_PER_HOUR) {
    sim.reserveHistory.push({ tick: sim.tick, ...totals });
  }
  const cutoff = sim.tick - TIME.TICKS_PER_DAY;
  while (sim.reserveHistory.length > 1 && sim.reserveHistory[1].tick <= cutoff) sim.reserveHistory.shift();
  let oldest = sim.reserveHistory[0];
  const next = sim.reserveHistory[1];
  if (next && oldest.tick < cutoff && next.tick > cutoff) {
    const ratio = (cutoff - oldest.tick) / (next.tick - oldest.tick);
    oldest = { tick: cutoff };
    for (const resource of RESERVE_RESOURCES) oldest[resource] = sim.reserveHistory[0][resource] + (next[resource] - sim.reserveHistory[0][resource]) * ratio;
  }
  const elapsed = sim.tick - oldest.tick;
  const theoretical = theoreticalRates(sim);
  sim.reserves ??= {};
  for (const resource of RESERVE_RESOURCES) {
    sim.reserves[resource] ??= { days: null };
    updateStockReserve(sim.reserves[resource], totals[resource], oldest[resource], elapsed, theoretical[resource]);
  }
  let minimumAirDays = null;
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation) || excavation.dugCells.length === 0) continue;
    updateAirTrend(sim, excavation);
    if (excavationOccupants(sim, excavation.id).length === 0) continue;
    const days = airDays(excavation);
    if (days !== null) minimumAirDays = minimumAirDays === null ? days : Math.min(minimumAirDays, days);
  }
  sim.reserves.air = { days: minimumAirDays };
  return sim.reserves;
}

import { HEAT, POWER, TIME, WATER, WORLD } from '../data/balance.js';
import { roomDefinition } from '../data/rooms.js';
import { PEOPLE } from '../data/people.js';
import { SURFACE_STRUCTURES } from '../data/surface.js';
import { activeExcavation, excavationNetworks, insideExcavation, rockTemperature, surfaceConnectionNetworkIds } from './networks.js';
import { requestRoomResources } from './jobs.js';
import { ensureRoomStock, spendResources } from './resources.js';
import { researchEffect } from './research.js';

const EPSILON = 1e-9;

function flooded(excavation) {
  return (excavation.floodRatio ?? 0) > WATER.FLOOD_UNUSABLE_RATIO;
}

function operational(excavation) {
  const pumpCanDrain = excavation.roomType === 'pump';
  return activeExcavation(excavation) && excavation.roomType && !excavation.disabled && !excavation.machineBroken && (!flooded(excavation) || pumpCanDrain);
}

function bikeWorkers(sim, excavation) {
  const workers = new Set();
  for (const job of sim.jobs) {
    if (job.type !== 'produce' || job.excavationId !== excavation.id || job.status !== 'active' || job.colonistId === null) continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    if (colonist?.health > 0 && (colonist.age ?? PEOPLE.ADULT_AGE) >= PEOPLE.MINIMUM_WORK_AGE
      && insideExcavation(sim, excavation, colonist.x, colonist.y)) workers.add(colonist.id);
  }
  return workers.size;
}

function adjacentWater(sim, excavation) {
  let amount = 0;
  const inspected = new Set();
  for (const index of excavation.dugCells ?? []) {
    const { x, y } = sim.world.coords(index);
    for (const [xx, yy] of [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!sim.world.inBounds(xx, yy)) continue;
      const next = sim.world.index(xx, yy);
      if (inspected.has(next)) continue;
      inspected.add(next);
      amount = Math.max(amount, sim.world.water[next]);
    }
  }
  return amount;
}

function solarOutput(sim, definition) {
  const day = sim.tick / TIME.TICKS_PER_DAY;
  const hour = (sim.tick % TIME.TICKS_PER_DAY) / TIME.TICKS_PER_HOUR;
  const season = Math.sin((Math.floor(day) % TIME.DAYS_PER_YEAR) / TIME.DAYS_PER_YEAR * Math.PI * 2);
  const daylightHours = POWER.SOLAR_DAYLIGHT_HOURS + POWER.SOLAR_DAYLIGHT_AMPLITUDE * season;
  const sunrise = POWER.SOLAR_NOON_HOUR - daylightHours / 2;
  if (hour <= sunrise || hour >= sunrise + daylightHours) return 0;
  const daylight = Math.sin((hour - sunrise) / daylightHours * Math.PI);
  const peakFactor = POWER.SOLAR_PEAK_FACTOR + POWER.SOLAR_PEAK_AMPLITUDE * season;
  const clearSky = Math.min(1, Math.max(0, day) / HEAT.NUCLEAR_WINTER_DAYS);
  return definition.generationKw * daylight * peakFactor * clearSky * (sim.weather?.solarFactor ?? 1);
}

function sourceOutput(sim, excavation, definition) {
  if (excavation.roomType === 'bikeDynamo') {
    return Math.min(definition.jobs, bikeWorkers(sim, excavation)) * definition.generationPerWorkerKw;
  }
  if (excavation.roomType === 'microHydro') {
    const water = adjacentWater(sim, excavation);
    if (water <= 0) return 0;
    const flow = Math.min(1, water / WATER.MAX_PER_CELL);
    return POWER.MICRO_HYDRO_MIN_KW + (POWER.MICRO_HYDRO_MAX_KW - POWER.MICRO_HYDRO_MIN_KW) * flow;
  }
  if (excavation.roomType === 'geothermal') {
    const depth = excavation.y - WORLD.SURFACE_Y;
    if (depth < POWER.GEOTHERMAL_MIN_DEPTH || rockTemperature(sim, depth) + 1e-6 < POWER.GEOTHERMAL_MIN_ROCK_TEMP) return 0;
    return definition.generationKw * researchEffect(sim, 'geothermalFactor', 1);
  }
  if (excavation.roomType === 'surfaceSolar') return solarOutput(sim, definition);
  return definition.generationKw ?? 0;
}

function priorityRank(sim, excavation, definition) {
  const priority = POWER.PRIORITIES.includes(excavation.powerPriority) ? excavation.powerPriority : definition.category;
  const rank = sim.powerPriorities.indexOf(priority);
  return rank >= 0 ? rank : POWER.PRIORITIES.length;
}

function chargeBatteries(batteries, amount) {
  let remaining = amount;
  for (const { excavation, capacityKwh } of batteries) {
    const stored = excavation.storedKwh;
    const added = Math.min(remaining, Math.max(0, capacityKwh - stored));
    excavation.storedKwh = stored + added;
    remaining -= added;
    if (remaining <= EPSILON) break;
  }
}

function dischargeBatteries(batteries, amount) {
  let remaining = amount;
  for (const { excavation } of batteries) {
    const stored = excavation.storedKwh;
    const removed = Math.min(remaining, stored);
    excavation.storedKwh = Math.max(0, stored - removed);
    remaining -= removed;
    if (remaining <= EPSILON) break;
  }
}

export function consumeStoredEnergy(sim, kwh) {
  if (!Number.isFinite(kwh) || kwh < 0) return false;
  const batteries = sim.excavations.filter((excavation) => operational(excavation)
    && (roomDefinition(excavation.roomType)?.capacityKwh ?? 0) > 0)
    .sort((a, b) => a.id - b.id);
  const available = batteries.reduce((total, excavation) => total + Math.max(0, excavation.storedKwh ?? 0), 0);
  if (available + EPSILON < kwh) return false;
  dischargeBatteries(batteries.map((excavation) => ({
    excavation, capacityKwh: roomDefinition(excavation.roomType).capacityKwh,
  })), kwh);
  const byId = new Map(batteries.map((excavation) => [excavation.id, excavation.storedKwh ?? 0]));
  sim.power.storedKwh = batteries.reduce((total, excavation) => total + (excavation.storedKwh ?? 0), 0);
  for (const network of sim.power.networks ?? []) {
    network.storedKwh = network.excavationIds.reduce((total, id) => total + (byId.get(id) ?? 0), 0);
  }
  return true;
}

function updateNetwork(sim, network, intervalHours, surfaceGeneratedKw = 0) {
  const sources = [];
  const diesels = [];
  const consumers = [];
  const batteries = [];
  let generatedKw = surfaceGeneratedKw;
  let demandKw = 0;
  let capacityKwh = 0;
  let initialStoredKwh = 0;
  let dieselCapacityKw = 0;
  let fuelPerDay = 0;
  const fullFuel = intervalHours / POWER.DIESEL_FUEL_HOURS;

  for (const id of network.excavationIds) {
    const excavation = sim.excavation(id);
    if (!operational(excavation)) continue;
    const definition = roomDefinition(excavation.roomType);
    if (!definition) continue;
    excavation.powerDemandKw = definition.powerKw;
    excavation.powerGenerationKw = 0;
    if (definition.powerKw > 0) {
      consumers.push({ excavation, definition });
      demandKw += definition.powerKw;
    }
    if (definition.generationKw > 0 || definition.generationPerWorkerKw > 0) {
      sources.push(excavation);
      if (excavation.roomType === 'diesel') {
        requestRoomResources(sim, excavation, { fuel: 1 });
        const stock = ensureRoomStock(sim, excavation);
        const capacityKw = definition.generationKw * Math.min(1, (stock.resources.fuel ?? 0) / fullFuel);
        diesels.push({ excavation, definition, stock, capacityKw });
        dieselCapacityKw += capacityKw;
      } else {
        const output = sourceOutput(sim, excavation, definition);
        excavation.powerGenerationKw = output;
        excavation.powered = output > EPSILON;
        generatedKw += output;
      }
    }
    if (definition.capacityKwh > 0) {
      excavation.storedKwh = Math.max(0, Math.min(definition.capacityKwh, excavation.storedKwh ?? 0));
      batteries.push({ excavation, capacityKwh: definition.capacityKwh });
      capacityKwh += definition.capacityKwh;
      initialStoredKwh += excavation.storedKwh;
    }
  }

  consumers.sort((a, b) => priorityRank(sim, a.excavation, a.definition) - priorityRank(sim, b.excavation, b.definition)
    || a.excavation.id - b.excavation.id);
  batteries.sort((a, b) => a.excavation.id - b.excavation.id);

  // Choose whole machines by priority against the available supply before dispatching
  // diesel: shed loads and energy which cannot fit in a battery consume no fuel.
  const dischargeBudgetKw = Math.min(Math.max(0, demandKw - generatedKw - dieselCapacityKw), initialStoredKwh / intervalHours);
  let availableKw = generatedKw + dieselCapacityKw + dischargeBudgetKw;
  let consumedKw = 0;
  for (const { excavation, definition } of consumers) {
    if (definition.powerKw <= availableKw + EPSILON) {
      excavation.powered = true;
      excavation.powerShed = false;
      availableKw = Math.max(0, availableKw - definition.powerKw);
      consumedKw += definition.powerKw;
    } else {
      excavation.powered = false;
      excavation.powerShed = true;
    }
  }

  const chargingDemandKw = (capacityKwh - initialStoredKwh) / intervalHours;
  const dieselOutputKw = Math.min(dieselCapacityKw, Math.max(0, consumedKw + chargingDemandKw - generatedKw));
  for (const { excavation, definition, stock, capacityKw } of diesels) {
    // Share load in proportion to available capacity, independently of room order.
    const output = dieselCapacityKw > EPSILON ? dieselOutputKw * capacityKw / dieselCapacityKw : 0;
    const load = Math.max(POWER.DIESEL_IDLE_FUEL_FACTOR, output / definition.generationKw);
    const fuel = Math.min(stock.resources.fuel ?? 0, fullFuel * load);
    spendResources(sim, { fuel }, stock);
    excavation.powerGenerationKw = output;
    excavation.powered = fuel > EPSILON;
    excavation.fuelPerDay = fuel * TIME.TICKS_PER_DAY / POWER.UPDATE_INTERVAL;
    fuelPerDay += excavation.fuelPerDay;
    generatedKw += output;
  }

  let chargeKw = 0;
  let dischargeKw = 0;
  if (consumedKw >= generatedKw) {
    dischargeKw = Math.min(dischargeBudgetKw, consumedKw - generatedKw);
    dischargeBatteries(batteries, dischargeKw * intervalHours);
  } else {
    chargeKw = Math.min(generatedKw - consumedKw, batteries.reduce((free, battery) => free + battery.capacityKwh - battery.excavation.storedKwh, 0) / intervalHours);
    chargeBatteries(batteries, chargeKw * intervalHours);
  }

  const storedKwh = batteries.reduce((total, battery) => total + battery.excavation.storedKwh, 0);
  // An idling, fueled generator still keeps voltage on the unloaded network.
  const energized = generatedKw > EPSILON || storedKwh > EPSILON
    || diesels.some(({ excavation }) => excavation.powered);
  const sourceIds = new Set(sources.map((excavation) => excavation.id));
  const consumerIds = new Set(consumers.map(({ excavation }) => excavation.id));
  const batteryIds = new Set(batteries.map(({ excavation }) => excavation.id));
  for (const id of network.excavationIds) {
    const excavation = sim.excavation(id);
    if (!activeExcavation(excavation) || excavation.disabled || flooded(excavation)) continue;
    if (!excavation.roomType || (!sourceIds.has(id) && !consumerIds.has(id) && !batteryIds.has(id))) excavation.powered = energized;
    if (batteryIds.has(id)) excavation.powered = energized;
  }

  return {
    id: network.id,
    excavationIds: [...network.excavationIds],
    generatedKw,
    consumedKw,
    demandKw,
    fuelPerDay,
    balance: generatedKw - consumedKw,
    storedKwh,
    capacityKwh,
    chargeKw,
    dischargeKw,
    deficit: consumedKw + EPSILON < demandKw,
  };
}

function emptyNetwork(network) {
  return {
    id: network.id,
    excavationIds: [...network.excavationIds],
    generatedKw: 0,
    consumedKw: 0,
    demandKw: 0,
    fuelPerDay: 0,
    balance: 0,
    storedKwh: 0,
    capacityKwh: 0,
    chargeKw: 0,
    dischargeKw: 0,
    deficit: false,
  };
}

function updateSurfacePanels(sim) {
  let total = 0;
  for (const structure of sim.surface?.structures ?? []) {
    if (structure.type !== 'solarPanel') continue;
    structure.powerGenerationKw = structure.state === 'built' ? solarOutput(sim, SURFACE_STRUCTURES.solarPanel) : 0;
    total += structure.powerGenerationKw;
  }
  return total;
}

function standaloneSurfaceNetwork(generatedKw) {
  return {
    id: 'surface', excavationIds: [], generatedKw, consumedKw: 0, demandKw: 0, fuelPerDay: 0,
    balance: generatedKw, storedKwh: 0, capacityKwh: 0, chargeKw: 0, dischargeKw: 0, deficit: false,
  };
}

export function updatePower(sim) {
  sim.power ??= {
    generatedKw: 0, consumedKw: 0, demandKw: 0, balance: 0,
    storedKwh: 0, capacityKwh: 0, deficit: false, networks: [],
  };
  if (sim.tick % POWER.UPDATE_INTERVAL !== 0) return sim.power;

  for (const excavation of sim.excavations) {
    excavation.powered = false;
    excavation.powerShed = false;
    excavation.powerDemandKw = 0;
    excavation.powerGenerationKw = 0;
    if (excavation.roomType === 'diesel') excavation.fuelPerDay = 0;
  }

  const surfaceGeneratedKw = updateSurfacePanels(sim);
  const intervalHours = POWER.UPDATE_INTERVAL / TIME.TICKS_PER_HOUR;
  const cache = excavationNetworks(sim);
  const networks = cache.networks.filter((network) => network.excavationIds.length > 0);
  const surfaceConnections = [...surfaceConnectionNetworkIds(sim)];
  if (surfaceConnections.length === 0 && networks.length === 1) surfaceConnections.push(networks[0].id);
  const surfaceNetworkId = surfaceConnections[0];
  let assignedSurfaceKw = 0;
  const summaries = networks.map((network) => {
    const extraKw = network.id === surfaceNetworkId ? surfaceGeneratedKw : 0;
    assignedSurfaceKw += extraKw;
    return operationalNetwork(sim, network) || extraKw > 0 ? updateNetwork(sim, network, intervalHours, extraKw) : emptyNetwork(network);
  });
  if (assignedSurfaceKw < surfaceGeneratedKw) summaries.push(standaloneSurfaceNetwork(surfaceGeneratedKw - assignedSurfaceKw));
  sim.power.generatedKw = summaries.reduce((total, network) => total + network.generatedKw, 0);
  sim.power.consumedKw = summaries.reduce((total, network) => total + network.consumedKw, 0);
  sim.power.demandKw = summaries.reduce((total, network) => total + network.demandKw, 0);
  sim.power.fuelPerDay = summaries.reduce((total, network) => total + network.fuelPerDay, 0);
  sim.power.balance = sim.power.generatedKw - sim.power.consumedKw;
  sim.power.storedKwh = summaries.reduce((total, network) => total + network.storedKwh, 0);
  sim.power.capacityKwh = summaries.reduce((total, network) => total + network.capacityKwh, 0);
  sim.power.chargeKw = summaries.reduce((total, network) => total + network.chargeKw, 0);
  sim.power.dischargeKw = summaries.reduce((total, network) => total + network.dischargeKw, 0);
  sim.power.surfaceGeneratedKw = surfaceGeneratedKw;
  sim.power.deficit = summaries.some((network) => network.deficit);
  sim.power.networks = summaries;
  return sim.power;
}

function operationalNetwork(sim, network) {
  return network.excavationIds.some((id) => operational(sim.excavation(id)));
}

export function isPowered(sim, excavation) {
  return Boolean(excavation?.powered);
}

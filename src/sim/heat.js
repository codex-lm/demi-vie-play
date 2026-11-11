import { AIR, HEAT, POWER, TIME, WATER, WORLD } from '../data/balance.js';
import { roomDefinition } from '../data/rooms.js';
import { surfaceTemperature } from './climate.js';
import { thermalDamageReady } from './thermalExposure.js';
import {
  activeExcavation,
  excavationAt,
  excavationNetworks,
  poweredVentilationShaft,
  rockTemperature,
  surfaceVentilationNetworks,
  ventilationRockProfiles,
} from './networks.js';

// Reuse temporary containers; rebuild the id index every update so direct edits,
// duplicate ids and changes of room order retain Sim.excavation's first match.
const workspaces = new WeakMap();
const geometries = new WeakMap();

function workspace(sim) {
  let work = workspaces.get(sim);
  if (!work) {
    work = { byId: new Map(), ventilation: new Map(), recovery: new Map(), vents: new Set(), rooms: [] };
    workspaces.set(sim, work);
  }
  work.byId.clear();
  for (const room of sim.excavations) {
    if (!work.byId.has(room.id)) work.byId.set(room.id, room);
  }
  return work;
}

function findRoom(work, id) {
  return Number.isNaN(id) ? null : work.byId.get(id) ?? null;
}

function occupantCount(sim, room) {
  if (!room) return 0;
  return sim.colonists.reduce((count, colonist) => count + (colonist.health > 0
    && colonist.x >= room.x && colonist.x < room.x + room.w
    && colonist.y >= room.y && colonist.y < room.y + room.h ? 1 : 0), 0);
}

function roomGeometry(room) {
  let geometry = geometries.get(room);
  if (!geometry || geometry.y !== room.y || geometry.h !== room.h
    || geometry.w !== room.w || geometry.coating !== room.coating) {
    const depth = room.y + (room.h - 1) / 2 - WORLD.SURFACE_Y;
    const perimeter = 2 * (room.w + room.h);
    const baseExchange = HEAT.WALL_EXCHANGE_KW_PER_C_M * perimeter;
    const insulation = room.coating === 'insulation' ? HEAT.INSULATION_FACTOR : 1;
    const wallExchange = baseExchange / insulation;
    const heatCapacity = baseExchange * HEAT.ROCK_TIME_CONSTANT_DAYS * 24;
    const rockRate = wallExchange / heatCapacity;
    geometry = { y: room.y, h: room.h, w: room.w, coating: room.coating,
      depth, heatCapacity, rockRate, insulation, ventilationRate: undefined };
    geometries.set(room, geometry);
  }
  return geometry;
}

export { rockTemperature } from './networks.js';
export { surfaceTemperature } from './climate.js';

export function temperatureComfort(temperature) {
  if (temperature < HEAT.COMFORT_MIN) {
    return Math.max(0, Math.min(1, (temperature - HEAT.DANGER_MIN) / (HEAT.COMFORT_MIN - HEAT.DANGER_MIN)));
  }
  if (temperature > HEAT.COMFORT_MAX) {
    return Math.max(0, Math.min(1, (HEAT.DANGER_MAX - temperature) / (HEAT.DANGER_MAX - HEAT.COMFORT_MAX)));
  }
  return 1;
}

export function temperatureDanger(temperature) {
  return temperature < HEAT.DANGER_MIN || temperature > HEAT.DANGER_MAX;
}

export function coldDamagePerHour(temperature) {
  if (temperature >= HEAT.DANGER_MIN) return 0;
  if (temperature >= HEAT.COLD_DAMAGE_MID_C) {
    return HEAT.COLD_DAMAGE_MID_PER_HOUR * (HEAT.DANGER_MIN - temperature)
      / (HEAT.DANGER_MIN - HEAT.COLD_DAMAGE_MID_C);
  }
  const fraction = Math.min(1, (HEAT.COLD_DAMAGE_MID_C - temperature)
    / (HEAT.COLD_DAMAGE_MID_C - HEAT.COLD_DAMAGE_SEVERE_C));
  return HEAT.COLD_DAMAGE_MID_PER_HOUR
    + fraction * (HEAT.COLD_DAMAGE_SEVERE_PER_HOUR - HEAT.COLD_DAMAGE_MID_PER_HOUR);
}

export function colonistFeltTemperature(sim, colonist) {
  if (colonist.y < WORLD.SURFACE_Y) {
    return surfaceTemperature(sim.tick / TIME.TICKS_PER_DAY) + HEAT.SURFACE_SUIT_C;
  }
  const room = excavationAt(sim, colonist.x, colonist.y);
  const temperature = activeExcavation(room) && Number.isFinite(room.temperature)
    ? room.temperature : rockTemperature(sim, Math.max(0, colonist.y - WORLD.SURFACE_Y));
  const sleepingInBed = activeExcavation(room) && room.roomType === 'dorm'
    && colonist.personal?.type === 'sleep' && colonist.personal.phase === 'sleeping'
    && colonist.personal.excavationId === room.id;
  return temperature + (sleepingInBed ? HEAT.SLEEP_BLANKET_C : 0);
}

function operational(excavation) {
  return activeExcavation(excavation) && excavation.roomType && !excavation.disabled && !excavation.machineBroken
    && ((excavation.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO || excavation.roomType === 'pump');
}

function hasRequiredPower(excavation, definition) {
  return !definition?.powerKw || (excavation.powered && !excavation.powerShed);
}

function machineHeatKw(excavation) {
  if (!operational(excavation)) return 0;
  const definition = roomDefinition(excavation.roomType);
  if (!hasRequiredPower(excavation, definition)) return 0;
  let loadFactor = 1;
  if (excavation.roomType === 'diesel' && Number.isFinite(excavation.fuelPerDay)) {
    // An idling engine still burns fuel and releases heat, even at zero electrical output.
    loadFactor = Math.min(1, excavation.fuelPerDay * POWER.DIESEL_FUEL_HOURS * TIME.TICKS_PER_HOUR / TIME.TICKS_PER_DAY);
  } else if (definition?.generationKw > 0) {
    const output = excavation.powerGenerationKw ?? 0;
    if (output <= 0) return 0;
    loadFactor = Math.min(1, output / definition.generationKw);
  }
  let heatKw = 0;
  if (excavation.roomType === 'forge') heatKw += HEAT.FORGE_KW;
  if (definition?.heatKw) heatKw += definition.heatKw;
  // The pump's stated 6 kW already include its electrical input.
  if (excavation.roomType !== 'heater') heatKw += (definition?.powerKw ?? 0) * HEAT.WASTE_HEAT_FRACTION;
  return heatKw * loadFactor;
}

function ventilationRates(sim, work) {
  const cache = excavationNetworks(sim);
  const surfaceHeads = surfaceVentilationNetworks(sim);
  const rates = work.ventilation;
  const surfaceStart = WORLD.SURFACE_Y * sim.world.width;
  const surfaceEnd = surfaceStart + sim.world.width;
  rates.clear();
  work.recovery.clear();
  for (const network of cache.networks) {
    if (network.excavationIds.length === 0) continue;
    let exchangePerHour = 0;
    let temperatures = 0;
    let roomCount = 0;
    let recuperator = false;
    work.vents.clear();
    for (const id of network.excavationIds) {
      const excavation = findRoom(work, id);
      if (activeExcavation(excavation)) {
        temperatures += Number.isFinite(excavation.temperature) ? excavation.temperature : HEAT.INITIAL_ROOM;
        roomCount += 1;
      }
      if (excavation?.roomType === 'heatExchanger' && operational(excavation)
        && hasRequiredPower(excavation, roomDefinition(excavation.roomType))) recuperator = true;
      if (!poweredVentilationShaft(excavation) || !excavation.dugCells.some((index) => index >= surfaceStart
        && index < surfaceEnd && cache.components[index] === network.id)) continue;
      work.vents.add(id);
      exchangePerHour += roomDefinition(excavation.roomType).exchangePerHour;
    }
    exchangePerHour += (surfaceHeads.get(network.id) ?? 0) * AIR.VENT_EXCHANGE_PER_HOUR;
    if (exchangePerHour === 0) continue;
    for (const id of network.excavationIds) {
      const connectedFactor = work.vents.has(id) ? HEAT.VENTILATION_DIRECT_FACTOR : HEAT.VENTILATION_CONNECTED_FACTOR;
      rates.set(id, (rates.get(id) ?? 0) + exchangePerHour * connectedFactor);
      if (recuperator && roomCount) work.recovery.set(id, temperatures / roomCount);
    }
  }
  return rates;
}

function applyConnectedHeat(sim, work) {
  const fraction = 1 - Math.exp(-HEAT.CONNECTED_EXCHANGE_PER_HOUR / TIME.TICKS_PER_HOUR);
  for (const network of excavationNetworks(sim).networks) {
    const rooms = work.rooms;
    rooms.length = 0;
    for (const id of network.excavationIds) {
      const room = findRoom(work, id);
      if (activeExcavation(room)) rooms.push(room);
    }
    if (rooms.length < 2) continue;
    const average = rooms.reduce((sum, excavation) => sum + excavation.temperature, 0) / rooms.length;
    for (const excavation of rooms) excavation.temperature += (average - excavation.temperature) * fraction;
  }
}

function updateColonistComfort(sim) {
  for (const colonist of sim.colonists) {
    if (colonist.health <= 0) continue;
    const excavation = excavationAt(sim, colonist.x, colonist.y);
    const temperature = colonistFeltTemperature(sim, colonist);
    const comfort = temperatureComfort(temperature);
    const danger = temperatureDanger(temperature);
    colonist.heatComfort = comfort;
    colonist.heatDanger = danger;
    colonist.warmth = comfort * 100;
    const cold = coldDamagePerHour(temperature);
    const room = activeExcavation(excavation) ? excavation : null;
    const damage = cold > 0
      ? (thermalDamageReady(sim, room, colonist, 'cold') ? cold : 0)
      : (temperature > HEAT.DANGER_MAX && thermalDamageReady(sim, room, colonist, 'heat')
        ? HEAT.HEALTH_DAMAGE_PER_HOUR : 0);
    if (damage > 0) {
      colonist.lastDamageCauses = [cold > 0 ? 'hypothermia' : 'hyperthermia'];
      colonist.health = Math.max(0, colonist.health - damage * (colonist.damageFactor ?? 1) / TIME.TICKS_PER_HOUR);
    }
  }
}

export function updateHeat(sim) {
  const surface = surfaceTemperature(sim.tick / TIME.TICKS_PER_DAY);
  const work = workspace(sim);
  const ventilation = ventilationRates(sim, work);
  const profiles = ventilationRockProfiles(sim);
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation)) continue;
    excavation.temperature = Number.isFinite(excavation.temperature) ? excavation.temperature : HEAT.INITIAL_ROOM;
    const geometry = roomGeometry(excavation);
    const rock = rockTemperature(sim, geometry.depth);
    const { heatCapacity, rockRate } = geometry;
    // Insulation reduces heat exchange at the walls and air entry alike.
    // Ventilation and filters still move the same air in air.js.
    const ventilationRate = (ventilation.get(excavation.id) ?? 0) / geometry.insulation;
    const profile = profiles.get(excavation.id);
    // Apply the same exponential exchange along each metre of the intake.
    // The geometry cache groups its weights by depth; rock follows diffusion.
    let incoming = rock;
    if (profile && ventilationRate > 0) {
      incoming = surface * profile.surfaceFactor;
      for (const { depth, weight } of profile.depthWeights) {
        incoming += rockTemperature(sim, depth) * weight;
      }
    }
    const exhaust = work.recovery.get(excavation.id);
    if (exhaust !== undefined) incoming += HEAT.EXCHANGER_RECOVERY * (exhaust - incoming);
    const occupants = occupantCount(sim, findRoom(work, excavation.id));
    const sourceKw = occupants * HEAT.PERSON_KW + machineHeatKw(excavation);
    if (geometry.ventilationRate !== ventilationRate) {
      geometry.ventilationRate = ventilationRate;
      geometry.totalRate = rockRate + ventilationRate;
      geometry.fraction = 1 - Math.exp(-geometry.totalRate / TIME.TICKS_PER_HOUR);
    }
    const totalRate = geometry.totalRate;
    const equilibrium = totalRate > 0
      ? (rock * rockRate + incoming * ventilationRate + sourceKw / heatCapacity) / totalRate
      : excavation.temperature;
    excavation.temperature += (equilibrium - excavation.temperature)
      * geometry.fraction;
  }
  applyConnectedHeat(sim, work);
  for (const excavation of sim.excavations) {
    excavation.heatComfort = temperatureComfort(excavation.temperature);
    excavation.heatDanger = temperatureDanger(excavation.temperature);
  }
  updateColonistComfort(sim);
}

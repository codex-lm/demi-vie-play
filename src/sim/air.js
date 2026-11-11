import { AIR, POWER, TIME, WORLD } from '../data/balance.js';
import { PEOPLE } from '../data/people.js';
import {
  activeExcavation, connectedExcavations, excavationNetworks, excavationOccupants, surfaceVentilationNetworks,
} from './networks.js';

export function roomAirVolume(room) {
  return Math.max(1, room.dugCells?.length ?? 0) / AIR.REFERENCE_ROOM_CELLS;
}

function clampGas(value) {
  return Math.max(AIR.SURFACE_CO2, Math.min(AIR.SURFACE_O2, value));
}

// Exhaust follows the fuel actually burned, like the engine heat (heat.js):
// full load gives DIESEL_CO2_PER_HOUR, an idling engine still burns and emits
// DIESEL_IDLE_FUEL_FACTOR of it, a stopped or empty one nothing.
function dieselLoad(excavation) {
  const load = Number.isFinite(excavation.fuelPerDay)
    ? excavation.fuelPerDay * POWER.DIESEL_FUEL_HOURS * TIME.TICKS_PER_HOUR / TIME.TICKS_PER_DAY
    : (excavation.powerGenerationKw ?? 0) / POWER.DIESEL_KW;
  return Math.min(1, Math.max(0, load));
}

function machineActive(excavation) {
  return excavation.powered && !excavation.disabled;
}

function reachesSurface(sim, excavation) {
  return excavation.dugCells.some((index) => sim.world.coords(index).y === WORLD.SURFACE_Y);
}

function filterStock(sim) {
  return sim.stocks.reduce((total, stock) => total + (stock.resources.filters ?? 0), 0);
}

function consumeFilters(sim, amount) {
  let remaining = amount;
  for (const stock of sim.stocks) {
    const available = stock.resources.filters ?? 0;
    const taken = Math.min(remaining, available);
    if (taken > 0) stock.resources.filters = available - taken;
    remaining -= taken;
    if (remaining <= 0) break;
  }
}

function updateFilters(sim, excavations) {
  const consumption = (AIR.FILTERS_PER_DAY ?? 0) * (sim.weather?.filterMultiplier ?? 1) / TIME.TICKS_PER_DAY;
  for (const excavation of excavations) {
    if (excavation.roomType !== 'airFilter') continue;
    const ventilated = [excavation, ...connectedExcavations(sim, excavation)]
      .some((room) => (room.unfilteredAirSupplyRate ?? 0) > 0);
    excavation.airFilterActive = machineActive(excavation) && ventilated && filterStock(sim) >= consumption;
    if (excavation.airFilterActive && consumption > 0) consumeFilters(sim, consumption);
  }
}

const airCaches = new WeakMap();

function airState(sim) {
  const networks = excavationNetworks(sim);
  const rooms = sim.excavations;
  let cache = airCaches.get(sim);
  let valid = cache?.networks === networks && cache.refs.length === rooms.length;
  for (let i = 0; valid && i < rooms.length; i += 1) {
    const room = rooms[i];
    const previous = cache.geometry[i];
    valid = cache.refs[i] === room && Object.is(previous.id, room.id)
      && previous.active === Boolean(activeExcavation(room))
      && previous.dugLength === room.dugCells?.length
      && Object.is(previous.y, room.y) && Object.is(previous.h, room.h);
  }
  if (valid) return cache;

  const excavations = rooms.filter((room) => activeExcavation(room) && room.dugCells.length > 0);
  const states = new Map();
  for (const room of excavations) states.set(room.id, { o2: 0, co2: 0, deltaO2: 0, deltaCo2: 0, volume: roomAirVolume(room) });
  const plan = excavations.map((room) => {
    const connected = connectedExcavations(sim, room).filter((other) => states.has(other.id));
    return {
      state: states.get(room.id),
      volume: roomAirVolume(room) + connected.reduce((sum, other) => sum + roomAirVolume(other), 0),
      pairs: connected.filter((other) => !(other.id <= room.id)).map((other) => states.get(other.id)),
      lower: connected.filter((other) => other.y + other.h > room.y + room.h).map((other) => states.get(other.id)),
    };
  });
  cache = {
    networks, refs: rooms.slice(),
    geometry: rooms.map((room) => ({ id: room.id, active: Boolean(activeExcavation(room)),
      dugLength: room.dugCells?.length, y: room.y, h: room.h })),
    excavations, states, plan,
  };
  airCaches.set(sim, cache);
  return cache;
}

function updateConnections(sim, excavations, states, plan) {
  const exchange = AIR.CONNECTED_EXCHANGE_PER_HOUR / TIME.TICKS_PER_HOUR;
  const descent = AIR.CO2_DESCEND_PER_HOUR / TIME.TICKS_PER_HOUR;

  // Exchange amounts, then convert back to concentrations. Dividing by the
  // network volume prevents splitting a room from accelerating the mixing.
  for (const entry of plan) {
    const source = entry.state;
    for (const target of entry.pairs) {
      const exchangedVolume = source.volume * target.volume / entry.volume;
      const o2Flow = (source.o2 - target.o2) * exchange * exchangedVolume;
      const co2Flow = (source.co2 - target.co2) * exchange * exchangedVolume;
      source.deltaO2 -= o2Flow / source.volume;
      target.deltaO2 += o2Flow / target.volume;
      source.deltaCo2 -= co2Flow / source.volume;
      target.deltaCo2 += co2Flow / target.volume;
    }
    if (entry.lower.length === 0) continue;
    const total = source.co2 * source.volume * descent;
    const lowerVolume = entry.lower.reduce((sum, target) => sum + target.volume, 0);
    source.deltaCo2 -= total / source.volume;
    for (const target of entry.lower) target.deltaCo2 += total / lowerVolume;
  }
  for (const entry of plan) {
    entry.state.o2 += entry.state.deltaO2;
    entry.state.co2 += entry.state.deltaCo2;
  }
}

// A network machine has one capacity, shared by the actual volume of air.
function recycleNetwork(sim, excavation, states, oxygen, carbonDioxide) {
  const targets = [excavation, ...connectedExcavations(sim, excavation)]
    .map((room) => states.get(room.id)).filter(Boolean);
  const volume = targets.reduce((total, state) => total + state.volume, 0);
  const carbon = targets.reduce((total, state) => total + Math.max(0, state.co2) * state.volume, 0);
  const removed = Math.min(carbon, carbonDioxide / TIME.TICKS_PER_HOUR);
  for (const state of targets) {
    state.o2 += oxygen / TIME.TICKS_PER_HOUR / volume;
    // Draw available CO2 throughout the network without discarding capacity in
    // an empty machine room, or creating negative concentrations.
    if (carbon > 0) state.co2 -= removed * Math.max(0, state.co2) / carbon;
  }
}

function updateMachines(sim, excavations, states) {
  for (const excavation of excavations) {
    const state = states.get(excavation.id);
    excavation.scrubberActive = false;
    excavation.algaeActive = false;
    if (!machineActive(excavation)) continue;
    if (excavation.roomType === 'diesel') {
      state.co2 += AIR.DIESEL_CO2_PER_HOUR * dieselLoad(excavation) / TIME.TICKS_PER_HOUR / state.volume;
    } else if (excavation.roomType === 'forge') {
      state.co2 += AIR.FORGE_CO2_PER_HOUR / TIME.TICKS_PER_HOUR / state.volume;
    } else if (excavation.roomType === 'scrubber') {
      excavation.scrubberActive = true;
      recycleNetwork(sim, excavation, states, 0, AIR.SCRUBBER_CO2_PER_HOUR);
    } else if (excavation.roomType === 'algaeTank') {
      excavation.algaeActive = true;
      recycleNetwork(sim, excavation, states, AIR.ALGAE_O2_PER_HOUR, AIR.ALGAE_CO2_PER_HOUR);
    } else if (excavation.roomType === 'hydroponics') {
      state.o2 += AIR.HYDROPONICS_O2_PER_HOUR / TIME.TICKS_PER_HOUR / state.volume;
      state.co2 = Math.max(0, state.co2 - AIR.HYDROPONICS_CO2_PER_HOUR / TIME.TICKS_PER_HOUR / state.volume);
    }
  }
}

function supplyAir(room, rate, unfiltered = true) {
  const received = rate / roomAirVolume(room);
  room.airSupplyRate += received;
  if (unfiltered) room.unfilteredAirSupplyRate += received;
}

function updatePoweredVentilation(sim, excavations, states) {
  for (const excavation of excavations) {
    if (excavation.roomType !== 'ventShaft' || !machineActive(excavation) || !reachesSurface(sim, excavation)) continue;
    excavation.ventilationActive = true;
    for (const target of [excavation, ...connectedExcavations(sim, excavation)]) {
      if (!states.has(target.id)) continue;
      const factor = target.id === excavation.id ? 1 : AIR.NETWORK_VENTILATION_FACTOR;
      supplyAir(target, AIR.VENT_EXCHANGE_PER_HOUR * factor);
    }
  }
}

function updateSurfaceVentilation(sim, states) {
  const heads = (sim.surface?.structures ?? []).filter((structure) => structure.type === 'ventShaft' && structure.state === 'built');
  for (const head of heads) {
    head.ventilationActive = false;
    head.ventilationFiltered = false;
  }
  const ventilated = surfaceVentilationNetworks(sim);
  const cache = excavationNetworks(sim);
  for (const [networkId, headCount] of ventilated) {
    for (const head of heads) head.ventilationActive = true;
    for (const id of cache.networks[networkId].excavationIds) {
      if (!states.has(id)) continue;
      const excavation = sim.excavation(id);
      const direct = excavation.label === 'accessShaft' || excavation.manualVentilation;
      const factor = direct ? 1 : AIR.NETWORK_VENTILATION_FACTOR;
      supplyAir(excavation, AIR.VENT_EXCHANGE_PER_HOUR * headCount * factor);
    }
  }
}

function applyVentilation(sim, excavations, states) {
  updateFilters(sim, excavations);
  for (const excavation of excavations) {
    const filtered = [excavation, ...connectedExcavations(sim, excavation)]
      .some((room) => room.airFilterActive);
    if (filtered) excavation.unfilteredAirSupplyRate = 0;
    excavation.ventilationFiltered = excavation.airSupplyRate > 0 && excavation.unfilteredAirSupplyRate === 0;
    const state = states.get(excavation.id);
    const exchange = Math.min(1, excavation.airSupplyRate / TIME.TICKS_PER_HOUR);
    state.o2 += (AIR.SURFACE_O2 - state.o2) * exchange;
    state.co2 += (AIR.SURFACE_CO2 - state.co2) * exchange;
  }
  const ids = [...surfaceVentilationNetworks(sim).keys()];
  const cache = excavationNetworks(sim);
  const filtered = ids.length > 0 && ids.every((id) => cache.networks[id].excavationIds
    .filter((roomId) => states.has(roomId)).every((roomId) => sim.excavation(roomId).ventilationFiltered));
  for (const head of sim.surface?.structures ?? []) {
    if (head.type === 'ventShaft' && head.state === 'built') head.ventilationFiltered = filtered;
  }
}

function manualWorker(sim, source) {
  for (const job of sim.jobs) {
    if (job.type !== 'crank' || job.excavationId !== source.id || job.status !== 'active') continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    const baseY = source.y + source.h;
    if (colonist?.health > 0 && (colonist.age ?? PEOPLE.ADULT_AGE) >= PEOPLE.MINIMUM_WORK_AGE && colonist.task === 'crank'
      && Math.abs(colonist.x - source.x) + Math.abs(colonist.y - baseY) <= AIR.MANUAL_WORK_RADIUS) return colonist;
  }
  return null;
}

export function manualDistances(sim, source) {
  const closedKey = sim.doors.map((door) => `${door.id}:${door.open === false ? 0 : 1}`).join(',');
  if (sim._manualAirCache?.revision === sim.world.revision && sim._manualAirCache.closedKey === closedKey) return sim._manualAirCache.distances;
  const distances = new Map();
  const cellDistances = new Map();
  const visited = new Uint8Array(sim.world.width * sim.world.height);
  const queue = [];
  const closedCells = new Set();
  for (const door of sim.doors) {
    if (door.open !== false) continue;
    closedCells.add(sim.world.index(door.x, door.y));
    closedCells.add(sim.world.index(door.x, door.y + 1));
  }
  for (const index of source.dugCells) {
    if (closedCells.has(index)) continue;
    visited[index] = 1;
    cellDistances.set(index, 0);
    queue.push(index);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const { x, y } = sim.world.coords(index);
    const distance = cellDistances.get(index);
    const owner = sim.world.cellExcavation[index];
    if (owner >= 0 && !distances.has(owner)) distances.set(owner, distance);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!sim.world.inBounds(xx, yy) || yy < WORLD.SURFACE_Y || !sim.world.isEmpty(xx, yy)) continue;
      const next = sim.world.index(xx, yy);
      if (visited[next] || closedCells.has(next)) continue;
      visited[next] = 1;
      cellDistances.set(next, distance + 1);
      queue.push(next);
    }
  }
  sim._manualAirCache = { revision: sim.world.revision, closedKey, distances };
  return distances;
}

function updateManualVentilation(sim, excavations, states) {
  const source = excavations.find((excavation) => excavation.label === 'accessShaft' || excavation.manualVentilation);
  for (const excavation of excavations) {
    excavation.manualVentilationFactor = 0;
    excavation.manualVentilationDistance = null;
  }
  if (!source) return;
  source.manualVentilationActive = Boolean(manualWorker(sim, source));
  if (!source.manualVentilationActive) return;
  const distances = manualDistances(sim, source);
  for (const excavation of excavations) {
    const distance = distances.get(excavation.id);
    if (distance === undefined) continue;
    const factor = Math.max(AIR.MANUAL_MIN_FACTOR, AIR.MANUAL_DISTANCE_DECAY ** (distance / AIR.MANUAL_DISTANCE_SCALE));
    // The starting hand crank has its own permanent filter (SPEC 1.1).
    supplyAir(excavation, AIR.MANUAL_EXCHANGE_PER_HOUR * factor, false);
    excavation.manualVentilationFactor = factor;
    excavation.manualVentilationDistance = distance;
  }
}

function updateAlert(sim, excavation) {
  const lowOxygen = excavation.o2 < AIR.DANGER_O2;
  const highCarbonDioxide = excavation.co2 > AIR.DANGER_CO2;
  excavation.airDanger = lowOxygen || highCarbonDioxide;
  excavation.airAlert = excavation.airDanger;
  excavation.airAlertReason = lowOxygen && highCarbonDioxide ? 'o2+co2' : (lowOxygen ? 'o2' : (highCarbonDioxide ? 'co2' : null));
  sim.emergency = sim.emergency || excavation.airDanger;
}

export function updateAir(sim) {
  const { excavations, states, plan } = airState(sim);
  for (const state of states.values()) {
    state.deltaO2 = 0;
    state.deltaCo2 = 0;
  }
  for (const excavation of excavations) {
    excavation.airSupplyRate = 0;
    excavation.unfilteredAirSupplyRate = 0;
    excavation.ventilationActive = false;
    excavation.ventilationFiltered = false;
    excavation.airFilterActive = false;
    excavation.o2 = clampGas(excavation.o2 ?? AIR.INITIAL_O2);
    excavation.co2 = clampGas(excavation.co2 ?? AIR.INITIAL_CO2);
    const occupants = excavationOccupants(sim, excavation.id).length;
    const state = states.get(excavation.id);
    state.o2 = excavation.o2 - occupants * AIR.O2_PER_PERSON_DAY / TIME.TICKS_PER_DAY / state.volume;
    state.co2 = excavation.co2 + occupants * AIR.CO2_PER_PERSON_DAY / TIME.TICKS_PER_DAY / state.volume;
  }

  updateConnections(sim, excavations, states, plan);
  updateMachines(sim, excavations, states);
  updatePoweredVentilation(sim, excavations, states);
  updateSurfaceVentilation(sim, states);
  updateManualVentilation(sim, excavations, states);
  applyVentilation(sim, excavations, states);

  for (const excavation of excavations) {
    const state = states.get(excavation.id);
    excavation.o2 = clampGas(state.o2);
    excavation.co2 = clampGas(state.co2);
    updateAlert(sim, excavation);
  }
}

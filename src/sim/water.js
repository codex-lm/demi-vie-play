import { HEAT, TIME, WATER, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { ROOM_DEFS } from '../data/rooms.js';
import { createStock } from './resources.js';
import { activeExcavation } from './networks.js';
import { WEATHER } from '../data/surface.js';
import { aquiferContact, clayProtected, currentWaterTableDepth, seepRate } from './groundwater.js';

export const WATER_QUALITY = Object.freeze({ clean: 0, dirty: 1, radioactive: 2, grey: 3 });

// Transient storage belongs to the World and never enters a save or digest.
const flowBuffers = new WeakMap();
const geometryCaches = new WeakMap();

function geometryCache(world) {
  let cache = geometryCaches.get(world);
  if (!cache || cache.revision !== world.revision || cache.states !== world.states
    || cache.width !== world.width || cache.height !== world.height) {
    cache = { revision: world.revision, states: world.states, width: world.width,
      height: world.height, rooms: new WeakMap(), active: null };
    geometryCaches.set(world, cache);
  }
  return cache;
}

function unchangedDugCells(excavation, snapshot, world = null) {
  const cells = excavation?.dugCells;
  if (cells !== snapshot.dugCells || (cells?.length ?? 0) !== snapshot.contents.length) return false;
  for (let i = 0; i < snapshot.contents.length; i += 1) {
    if (cells[i] !== snapshot.contents[i]
      || (world && world.states[cells[i]] !== snapshot.cellStates[i])) return false;
  }
  return true;
}

function roomCells(world, excavation) {
  // Empty placement previews do not need a World. Preserve the original
  // empty filter's lazy behavior before consulting the geometry cache.
  if (!excavation || !excavation.dugCells?.length) return [];
  const cache = geometryCache(world);
  let entry = cache.rooms.get(excavation);
  if (!entry || !unchangedDugCells(excavation, entry, world)) {
    const cells = excavation.dugCells ?? [];
    entry = {
      dugCells: excavation.dugCells,
      contents: cells.slice(),
      cellStates: cells.map((index) => world.states[index]),
      empty: cells.filter((index) => {
        const { x, y } = world.coords(index);
        return world.isEmpty(x, y);
      }),
    };
    cache.rooms.set(excavation, entry);
  }
  return entry.empty;
}

function unchangedActiveGeometry(sim, cached) {
  if (!cached || cached.excavations !== sim.excavations || cached.rooms.length !== sim.excavations.length) return false;
  for (let i = 0; i < cached.rooms.length; i += 1) {
    const previous = cached.rooms[i];
    const excavation = sim.excavations[i];
    if (previous.excavation !== excavation || previous.state !== excavation?.state
      || !unchangedDugCells(excavation, previous)) return false;
  }
  // The public state grid can also be edited in place by fixtures/import tools.
  // Check only the relevant cell stencil, rather than scanning the whole world.
  for (let i = 0; i < cached.watchedIndices.length; i += 1) {
    if (sim.world.states[cached.watchedIndices[i]] !== cached.watchedStates[i]) return false;
  }
  return true;
}

const QUALITY_INITIALIZED = 255;
const AQUIFER_MATERIALS = new Set([MATERIAL.SAND, MATERIAL.SANDSTONE, MATERIAL.LIMESTONE]);

function waterAt(sim, index) {
  return sim.world.water[index] ?? 0;
}

function qualityAt(sim, index) {
  return sim.world.waterQuality[index] ?? WATER_QUALITY.clean;
}

/** Depth in metres reached by the fallout front; 0 once the nuclear winter is over. */
export function falloutFrontDepth(sim, tick = sim.tick) {
  if (tick >= HEAT.NUCLEAR_WINTER_DAYS * TIME.TICKS_PER_DAY) return 0;
  return Math.min(WATER.CONTAMINATED_DEPTH, tick / TIME.TICKS_PER_DAY * WATER.FALLOUT_DESCENT_PER_DAY);
}

/** True when shallow ground water at row y is radioactive (fallout front or black rain). */
export function shallowWaterContaminated(sim, y, x = null) {
  const depth = y - WORLD.SURFACE_Y;
  if (depth >= WATER.CONTAMINATED_DEPTH || clayProtected(sim.world, x, y)) return false;
  const blackRain = Math.max(sim.weather?.nappeContamination ?? 0, sim.radiation?.waterContamination ?? 0)
    >= WEATHER.NAPPE_CONTAMINATION_THRESHOLD;
  return blackRain || depth < falloutFrontDepth(sim);
}

function aquiferQuality(sim, material, y, x) {
  if (material === MATERIAL.SANDSTONE) return WATER_QUALITY.dirty;
  return shallowWaterContaminated(sim, y, x) ? WATER_QUALITY.radioactive : WATER_QUALITY.dirty;
}

export function contaminateNappe(sim) {
  const { world } = sim;
  for (let index = 0; index < world.water.length; index += 1) {
    if (world.water[index] <= 0) continue;
    const { x, y } = world.coords(index);
    if (y - WORLD.SURFACE_Y < WATER.CONTAMINATED_DEPTH && !clayProtected(world, x, y)) {
      world.waterQuality[index] = Math.max(world.waterQuality[index], WATER_QUALITY.radioactive);
    }
  }
}

function initializeWaterQuality(sim) {
  const { world } = sim;
  if (world.waterQuality[0] === QUALITY_INITIALIZED) return;
  for (let index = 0; index < world.water.length; index += 1) {
    if (world.water[index] === 0 || world.cellExcavation[index] >= 0) continue;
    const { x, y } = world.coords(index);
    const neighbors = [
      world.material(x - 1, y), world.material(x + 1, y),
      world.material(x, y - 1), world.material(x, y + 1),
    ];
    if (neighbors.includes(MATERIAL.LIMESTONE)) world.waterQuality[index] = WATER_QUALITY.clean;
    else if (neighbors.includes(MATERIAL.SANDSTONE)) world.waterQuality[index] = WATER_QUALITY.dirty;
    else if (neighbors.includes(MATERIAL.SAND)) world.waterQuality[index] = aquiferQuality(sim, MATERIAL.SAND, y, x);
    else world.waterQuality[index] = WATER_QUALITY.dirty;
  }
  world.waterQuality[0] = QUALITY_INITIALIZED;
}

function activeCells(sim) {
  const { world } = sim;
  const cache = geometryCache(world);
  if (unchangedActiveGeometry(sim, cache.active)) return cache.active.sources;
  const cells = new Set();
  const watched = new Set();
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation)) continue;
    for (const index of excavation.dugCells ?? []) {
      const { x, y } = world.coords(index);
      for (let yy = y - 1; yy <= y + 1; yy += 1) {
        for (let xx = x - 1; xx <= x + 1; xx += 1) {
          if (world.inBounds(xx, yy)) watched.add(world.index(xx, yy));
        }
      }
      if (!world.isEmpty(x, y)) continue;
      cells.add(index);
      for (let yy = y - 1; yy <= y + 1; yy += 1) {
        for (let xx = x - 1; xx <= x + 1; xx += 1) {
          if (world.inBounds(xx, yy) && world.isEmpty(xx, yy)) cells.add(world.index(xx, yy));
        }
      }
    }
  }
  const sources = [...cells].sort((a, b) => b - a);
  const watchedIndices = [...watched];
  cache.active = { excavations: sim.excavations, sources, watchedIndices,
    watchedStates: watchedIndices.map((index) => world.states[index]),
    rooms: sim.excavations.map((excavation) => ({
    excavation, state: excavation?.state, dugCells: excavation?.dugCells,
    contents: excavation?.dugCells?.slice() ?? [],
  })) };
  return sources;
}

function moveWater(next, nextQuality, source, target, amount) {
  if (amount <= 0) return 0;
  const moved = Math.min(amount, next[source], WATER.MAX_PER_CELL - next[target]);
  if (moved <= 0) return 0;
  if (next[target] === 0) nextQuality[target] = nextQuality[source];
  else nextQuality[target] = Math.max(nextQuality[target], nextQuality[source]);
  next[target] += moved;
  next[source] -= moved;
  return moved;
}

function flowWater(sim, cells) {
  const { world } = sim;
  let buffers = flowBuffers.get(world);
  if (!buffers || buffers.next.length !== world.water.length
    || buffers.nextQuality.length !== world.waterQuality.length
    || buffers.next.constructor !== world.water.constructor
    || buffers.nextQuality.constructor !== world.waterQuality.constructor) {
    buffers = { next: world.water.slice(), nextQuality: world.waterQuality.slice() };
    flowBuffers.set(world, buffers);
  }
  const { next, nextQuality } = buffers;
  next.set(world.water);
  nextQuality.set(world.waterQuality);
  const sources = cells;
  const phase = Math.floor(sim.tick / WATER.UPDATE_INTERVAL);
  for (const source of sources) {
    const original = world.water[source];
    if (original <= 0 || next[source] <= 0) continue;
    const { x, y } = world.coords(source);
    let available = Math.min(original, next[source]);
    if (world.isEmpty(x, y + 1)) {
      const target = world.index(x, y + 1);
      const moved = moveWater(next, nextQuality, source, target, Math.min(WATER.FLOW_PER_UPDATE, available));
      available -= moved;
    }
    if (available <= 0) continue;
    const directions = (x + y + phase) % 2 === 0 ? [-1, 1] : [1, -1];
    for (const dx of directions) {
      if (available <= 0 || !world.isEmpty(x + dx, y)) continue;
      const target = world.index(x + dx, y);
      if (next[target] >= next[source]) continue;
      const transferable = Math.max(0, Math.floor((next[source] - next[target]) / 2));
      const moved = moveWater(next, nextQuality, source, target, Math.min(WATER.FLOW_PER_UPDATE, available, transferable));
      available -= moved;
    }
  }
  world.water.set(next);
  world.waterQuality.set(nextQuality);
}

function infiltrate(sim) {
  const { world } = sim;
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation) || excavation.coating === 'waterproof') continue;
    excavation.waterInfiltration ??= {};
    for (const target of excavation.dugCells ?? []) {
      const point = world.coords(target);
      for (const [x, y] of [
        [point.x - 1, point.y], [point.x + 1, point.y],
        [point.x, point.y - 1], [point.x, point.y + 1],
      ]) {
        if (!world.inBounds(x, y) || !world.isSolid(x, y)) continue;
        const material = world.material(x, y);
        const perDay = seepRate(sim, x, y);
        if (perDay <= 0 || !world.isEmpty(point.x, point.y)) continue;
        const key = `${target}:${world.index(x, y)}`;
        const rate = perDay * WATER.UPDATE_INTERVAL / TIME.TICKS_PER_DAY;
        let accumulated = (excavation.waterInfiltration[key] ?? 0) + rate;
        const capacity = WATER.MAX_PER_CELL - world.water[target];
        const wholeUnits = Math.floor(accumulated + Number.EPSILON * TIME.TICKS_PER_DAY);
        if (capacity > 0 && wholeUnits > 0) {
          const amount = Math.min(capacity, wholeUnits);
          const quality = aquiferQuality(sim, material, y, x);
          const previous = world.water[target];
          world.waterQuality[target] = previous === 0 ? quality : Math.max(world.waterQuality[target], quality);
          world.water[target] += amount;
          accumulated -= amount;
        } else if (capacity === 0) accumulated = Math.min(accumulated, 1);
        excavation.waterInfiltration[key] = accumulated;
      }
    }
  }
}

function excavationCellsForWater(sim, excavation) {
  return roomCells(sim.world, excavation);
}

export function roomWaterRatio(sim, excavation) {
  const cells = excavationCellsForWater(sim, excavation);
  if (cells.length === 0) return 0;
  let amount = 0;
  for (const index of cells) amount += waterAt(sim, index);
  // While a room is being dug, measure its water against the room it will become.
  // Otherwise the first cell opened under a puddle reads as a fully flooded room
  // and drowns the digger with no warning (LAB-A1).
  const capacityCells = excavation.state === 'digging'
    ? Math.max(cells.length, excavation.cells?.length ?? 0) : cells.length;
  return amount / (capacityCells * WATER.MAX_PER_CELL);
}

function touchesMaterial(sim, excavation, materials) {
  const { world } = sim;
  for (const index of excavationCellsForWater(sim, excavation)) {
    const { x, y } = world.coords(index);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (aquiferContact(world, xx, yy, currentWaterTableDepth(sim)) && materials.has(world.material(xx, yy))) return true;
    }
  }
  return false;
}

export function hasAquiferAccess(sim, excavation) {
  return activeExcavation(excavation) && touchesMaterial(sim, excavation, AQUIFER_MATERIALS);
}

function limestoneNearby(sim, x, y) {
  const { world } = sim;
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([xx, yy]) => world.inBounds(xx, yy) && world.material(xx, yy) === MATERIAL.LIMESTONE);
}

export function hasRiverAccess(sim, excavation) {
  if (!activeExcavation(excavation)) return false;
  const { world } = sim;
  const candidates = new Set(excavationCellsForWater(sim, excavation));
  for (const index of [...candidates]) {
    const { x, y } = world.coords(index);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (world.inBounds(xx, yy) && world.isEmpty(xx, yy)) candidates.add(world.index(xx, yy));
    }
  }
  for (const index of candidates) {
    if (waterAt(sim, index) <= 0 || qualityAt(sim, index) !== WATER_QUALITY.clean) continue;
    const { x, y } = world.coords(index);
    if (limestoneNearby(sim, x, y)) return true;
  }
  return false;
}

function ensureCisternStocks(sim) {
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation) || excavation.roomType !== 'cistern') continue;
    const existing = sim.stocks.find((stock) => stock.excavationId === excavation.id);
    if (existing) {
      // Le stock créé à l'aménagement n'avait ni type ni capacité.
      existing.storage ??= 'water';
      existing.capacity ??= ROOM_DEFS.cistern.capacity;
      continue;
    }
    const x = excavation.x + Math.floor(excavation.w / 2);
    const y = excavation.y + excavation.h - 1;
    const stock = createStock(`room-${excavation.id}`, x, y);
    stock.excavationId = excavation.id;
    stock.roomType = excavation.roomType;
    stock.storage = 'water';
    stock.capacity = ROOM_DEFS.cistern.capacity;
    excavation.stockId = stock.id;
    sim.stocks.push(stock);
  }
}

function stockDistance(stock, excavation) {
  return Math.abs(stock.x - (excavation.x + excavation.w / 2))
    + Math.abs(stock.y - (excavation.y + excavation.h / 2));
}

function sortedStocks(sim, excavation) {
  return sim.stocks.map((stock, order) => ({ stock, order })).sort((a, b) => stockDistance(a.stock, excavation) - stockDistance(b.stock, excavation)
    || String(a.stock.id).localeCompare(String(b.stock.id)) || a.order - b.order).map(({ stock }) => stock);
}

function roomWaterStock(sim, excavation) {
  return sim.stocks.find((stock) => stock.id === excavation.stockId)
    ?? sim.stocks.find((stock) => stock.excavationId === excavation.id) ?? null;
}

function stockWaterAmount(stock) {
  return (stock.resources.waterClean ?? 0) + (stock.resources.waterDirty ?? 0)
    + (stock.resources.waterGrey ?? 0) + (stock.resources.waterRadioactive ?? 0);
}

function stockFreeCapacity(stock) {
  return Math.max(0, (stock.capacity ?? Infinity) - stockWaterAmount(stock));
}

function addWaterToStocks(sim, excavation, quality, amount) {
  let remaining = amount;
  for (const stock of sortedStocks(sim, excavation)) {
    const accepted = Math.min(remaining, stockFreeCapacity(stock));
    if (accepted <= 0) continue;
    if (quality === WATER_QUALITY.clean) stock.resources.waterClean = (stock.resources.waterClean ?? 0) + accepted;
    else if (quality === WATER_QUALITY.grey) stock.resources.waterGrey = (stock.resources.waterGrey ?? 0) + accepted;
    else if (quality === WATER_QUALITY.radioactive) stock.resources.waterRadioactive = (stock.resources.waterRadioactive ?? 0) + accepted;
    else stock.resources.waterDirty = (stock.resources.waterDirty ?? 0) + accepted;
    remaining -= accepted;
    if (remaining <= 0) break;
  }
  return amount - remaining;
}

// Vide l'eau stagnante d'une pièce dans les réserves, au débit donné.
function drainRoom(sim, excavation, unitsPerHour, key) {
  excavation.waterWork ??= {};
  excavation.waterWork[key] = (excavation.waterWork[key] ?? 0) + unitsPerHour / TIME.TICKS_PER_HOUR;
  let requested = Math.floor(excavation.waterWork[key]);
  if (requested <= 0) return;
  const initialRequest = requested;
  const cells = excavationCellsForWater(sim, excavation).filter((index) => waterAt(sim, index) > 0).sort((a, b) => b - a);
  let movedTotal = 0;
  for (const index of cells) {
    while (requested > 0 && waterAt(sim, index) > 0) {
      const quality = qualityAt(sim, index);
      const accepted = addWaterToStocks(sim, excavation, quality, 1);
      if (accepted < 1) {
        requested = 0;
        break;
      }
      sim.world.water[index] -= 1;
      requested -= 1;
      movedTotal += 1;
    }
  }
  excavation.waterWork[key] -= movedTotal;
  if (movedTotal < initialRequest) excavation.waterWork[key] = Math.min(1, excavation.waterWork[key]);
}

function updatePump(sim, excavation) {
  drainRoom(sim, excavation, WATER.PUMP_UNITS_PER_HOUR, 'pump');
}

// Un puits noyé puise l'eau qui le noie, au rythme du puits, sans ouvrier :
// une inondation au fond du conduit ne coupe plus l'eau de la colonie pour toujours.
function updateFloodedWell(sim, excavation) {
  if (excavation.roomType !== 'well' || excavation.state !== 'fitted' || excavation.disabled
    || !activeExcavation(excavation) || !((excavation.floodRatio ?? 0) > 0)) return;
  drainRoom(sim, excavation, WATER.WELL_UNITS_PER_DAY / (TIME.TICKS_PER_DAY / TIME.TICKS_PER_HOUR), 'wellDrain');
}

function wellQuality(sim, excavation) {
  const { world } = sim;
  let quality = WATER_QUALITY.dirty;
  for (const index of excavationCellsForWater(sim, excavation)) {
    const { x, y } = world.coords(index);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!world.inBounds(xx, yy) || !world.isSolid(xx, yy)) continue;
      const material = world.material(xx, yy);
      if (!aquiferContact(world, xx, yy, currentWaterTableDepth(sim))) continue;
      if (aquiferQuality(sim, material, yy, xx) === WATER_QUALITY.radioactive) return WATER_QUALITY.radioactive;
    }
  }
  return quality;
}

/** Shallowest sand row touched by a room, or null. Sandstone never turns radioactive. */
function shallowestSandContact(sim, excavation) {
  const { world } = sim;
  let shallowest = null;
  for (const index of excavationCellsForWater(sim, excavation)) {
    const { x, y } = world.coords(index);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!aquiferContact(world, xx, yy, currentWaterTableDepth(sim))
        || world.material(xx, yy) === MATERIAL.SANDSTONE || clayProtected(world, xx, yy)) continue;
      if (shallowest === null || yy < shallowest) shallowest = yy;
    }
  }
  return shallowest;
}

/**
 * What a well will give, and until when: read-only, for the interface.
 * quality: 'dirty' | 'radioactive' | null (no aquifer);
 * contaminationTick: tick at which the fallout reaches its sand, or null.
 */
export function wellOutlook(sim, excavation) {
  if (excavation?.roomType !== 'well' || !hasAquiferAccess(sim, excavation)) {
    return { quality: null, contaminationTick: null, daysUntilContamination: null, sandDepth: null };
  }
  const quality = wellQuality(sim, excavation) === WATER_QUALITY.radioactive ? 'radioactive' : 'dirty';
  const sandY = shallowestSandContact(sim, excavation);
  const sandDepth = sandY === null ? null : sandY - WORLD.SURFACE_Y;
  let contaminationTick = null;
  if (quality === 'dirty' && sandDepth !== null && sandDepth < WATER.CONTAMINATED_DEPTH) {
    const tick = Math.ceil(sandDepth / WATER.FALLOUT_DESCENT_PER_DAY * TIME.TICKS_PER_DAY);
    if (tick > sim.tick && tick < HEAT.NUCLEAR_WINTER_DAYS * TIME.TICKS_PER_DAY) contaminationTick = tick;
  }
  return {
    quality,
    contaminationTick,
    daysUntilContamination: contaminationTick === null ? null : (contaminationTick - sim.tick) / TIME.TICKS_PER_DAY,
    sandDepth,
  };
}

function warnWellContamination(sim, excavation) {
  if (excavation.roomType !== 'well' || sim.tick % TIME.TICKS_PER_HOUR !== 0 || !activeExcavation(excavation)) return;
  const work = excavation.waterWork ??= {};
  const outlook = wellOutlook(sim, excavation);
  if (outlook.quality === 'radioactive') {
    if (work.contaminationWarned && !work.contaminationLogged) {
      work.contaminationLogged = true;
      sim.log('warning', 'eventWellContaminated', { id: excavation.id }, excavation);
    }
    return;
  }
  const days = outlook.daysUntilContamination;
  if (days === null || days > WATER.WELL_CONTAMINATION_WARNING_DAYS || work.contaminationWarned) return;
  work.contaminationWarned = true;
  sim.log('warning', 'eventWellContaminationSoon', { id: excavation.id, days: Math.max(1, Math.round(days)) }, excavation);
}

function normalizeWellProduction(sim, excavation) {
  if (excavation.roomType !== 'well') return;
  excavation.waterWork ??= {};
  const produced = excavation.production?.produced ?? 0;
  const previous = excavation.waterWork.seenProduction ?? 0;
  const amount = Math.max(0, produced - previous);
  excavation.waterWork.seenProduction = produced;
  if (amount <= 0 || wellQuality(sim, excavation) !== WATER_QUALITY.radioactive) return;
  const stock = roomWaterStock(sim, excavation);
  if (!stock) return;
  const converted = Math.min(amount, stock.resources.waterDirty ?? 0);
  stock.resources.waterDirty -= converted;
  stock.resources.waterRadioactive = (stock.resources.waterRadioactive ?? 0) + converted;
}

function updateWaterRooms(sim) {
  ensureCisternStocks(sim);
  for (const excavation of sim.excavations) {
    normalizeWellProduction(sim, excavation);
    warnWellContamination(sim, excavation);
    updateFloodedWell(sim, excavation);
    if (excavation.roomType === 'pump'
      && activeExcavation(excavation) && excavation.powered && !excavation.disabled) {
      updatePump(sim, excavation);
    }
  }
}

function updateFlooding(sim) {
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation)) {
      excavation.floodRatio = 0;
      excavation.flooded = false;
      excavation.disabledByFlood = false;
      continue;
    }
    const ratio = roomWaterRatio(sim, excavation);
    const wasFlooded = Boolean(excavation.flooded);
    const flooded = ratio > WATER.FLOOD_UNUSABLE_RATIO;
    excavation.floodRatio = ratio;
    excavation.flooded = flooded;
    excavation.disabledByFlood = flooded;
    if (flooded && !wasFlooded) {
      sim.log('warning', 'eventFlood', { id: excavation.id, ratio }, excavation);
      sim.events.push({ type: 'flood', tick: sim.tick, excavationId: excavation.id, ratio });
      const definition = ROOM_DEFS[excavation.roomType];
      if (definition && (definition.powerKw > 0 || definition.generationKw > 0 || definition.generationPerWorkerKw > 0)) {
        excavation.machineDamaged = true;
        sim.log('danger', 'eventMachineDamage', { id: excavation.id }, excavation);
        sim.events.push({ type: 'machineDamage', tick: sim.tick, excavationId: excavation.id });
      }
    } else if (!flooded && wasFlooded) sim.log('info', 'eventFloodRecovered', { id: excavation.id, ratio }, excavation);
  }
}

export function updateWater(sim) {
  if (!sim?.world?.water || !sim.world.waterQuality) return;
  initializeWaterQuality(sim);
  updateWaterRooms(sim);
  if (sim.tick % WATER.UPDATE_INTERVAL === 0) {
    flowWater(sim, activeCells(sim));
    infiltrate(sim);
  }
  updateFlooding(sim);
}

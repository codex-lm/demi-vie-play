import { CELL, CULTIVATION, STARTING_RESOURCES, TIME, WORLD } from './balance.js';
import { MATERIAL } from './materials.js';
import { PEOPLE } from './people.js';
import { EXODUS, WEATHER } from './surface.js';
import { Sim } from '../sim/sim.js';
import { createInitialColonists } from '../sim/colonists.js';
import { createExcavation, excavationCells } from '../sim/excavation.js';
import { EXTINGUISH_WATER_RESOURCES, HAZARDS } from './hazards.js';
import { REPAIRS } from './repairs.js';
import { createStock, ensureRoomStock, resourceTotals } from '../sim/resources.js';
import { loadHumanBase } from './base-m2-j120.js';
import { refreshMoraleCauses } from '../sim/morale.js';
import { safeDateTick, surfaceDoseRate } from '../sim/radiation.js';
import { scheduleStoryEvent } from '../sim/storyteller.js';
import { leaveSouvenir } from '../sim/souvenirs.js';

export const SCENARIOS = ['collapse-demo', 'stacked-rooms', 'thin-wall', 'flood-demo', 'co2-demo', 'heat-demo', 'base-m2-j120', 'people-demo', 'exodus-demo', 'm5-demo', 'm6-demo'];

export const EXODUS_DEMO = Object.freeze({
  YEAR: 4,
  EARLY_THRESHOLD: 0.025,
  FOOD_BUFFER_DAYS: 15,
  DEPOT_ORDER: Object.freeze({ type: 'dig', kind: 'room', x: 56, y: 82, w: 6, h: 4, shape: 'vault', lining: 'none' }),
});

export const PEOPLE_DEMO = Object.freeze({
  DISPLAYED_DAY: 60,
  BIRTH_DELAY_TICKS: 12 * TIME.TICKS_PER_HOUR,
  REMONTEURS_SUPPORT: 72,
  PROFONDS_SUPPORT: 28,
});

// Keep the shelter roof intact by motorizing its existing access shaft.
// Same-column rooms keep at least three metres of rock between them so their
// slabs hold; across the shaft, floors and ceilings never share a row; and
// every room avoids the natural cavities of seed 7 (the east flank x>=50 and
// the west x<=40 are riddled with caves between rows 48 and 78). The descent
// crosses the clay and sand bands that span the whole map at rows 34-40, so
// the shaft stays yellow and slowly erodes: the replay repairs it with stone
// whenever its integrity falls to 60. Fires are extinguished with real water
// before smoke spreads. The infirmary is fitted early because the
// storyteller's day-12 fever would otherwise drop an untreated colonist
// below health 50. Construction spends the thirty starting metal exactly;
// the 35 m coal gallery feeds fuel and charcoal filters, and the metal its
// digging turns up is kept for machine repairs: the workshop never runs the
// metal filter recipe. Dry crop rooms stay uncoated so the whole itinerary
// fits in thirty orders (lumber for a timber lining would starve the farms).
export const HUMAN_BASE_DIGS = Object.freeze([
  { key: 'lowerShaft', roomType: null, order: { type: 'dig', kind: 'shaft', x: 47, y: 32, w: 1, h: 64, shape: 'vault', lining: 'none' } },
  { key: 'well', roomType: 'well', order: { type: 'dig', kind: 'room', x: 41, y: 44, w: 6, h: 3, shape: 'vault', lining: 'none' } },
  { key: 'filter', roomType: 'filterPlant', order: { type: 'dig', kind: 'room', x: 48, y: 47, w: 6, h: 4, shape: 'vault', lining: 'none' } },
  { key: 'infirmary', roomType: 'infirmary', order: { type: 'dig', kind: 'room', x: 41, y: 88, w: 6, h: 3, shape: 'vault', lining: 'none' } },
  { key: 'cultureNorth', roomType: 'mushroom', coating: 'none', order: { type: 'dig', kind: 'room', x: 41, y: 56, w: 6, h: 3, shape: 'vault', lining: 'none' } },
  { key: 'cultureWest', roomType: 'mushroom', coating: 'none', order: { type: 'dig', kind: 'room', x: 41, y: 68, w: 6, h: 3, shape: 'vault', lining: 'none' } },
  { key: 'cultureEast', roomType: 'mushroom', order: { type: 'dig', kind: 'room', x: 41, y: 74, w: 6, h: 3, shape: 'vault', lining: 'none' } },
  { key: 'cultureSouth', roomType: 'mushroom', coating: 'none', order: { type: 'dig', kind: 'room', x: 41, y: 80, w: 6, h: 3, shape: 'vault', lining: 'none' } },
  { key: 'bikeNorth', roomType: 'bikeDynamo', order: { type: 'dig', kind: 'room', x: 48, y: 77, w: 6, h: 3, shape: 'vault', lining: 'none' } },
  { key: 'workshop', roomType: 'workshop', order: { type: 'dig', kind: 'room', x: 48, y: 85, w: 6, h: 3, shape: 'vault', lining: 'none' } },
  { key: 'coalGallery', roomType: null, coating: 'none', order: { type: 'dig', kind: 'gallery', x: 12, y: 94, w: 35, h: 2, shape: 'flat', lining: 'none' } },
]);

function prepareWorld(sim) {
  for (let y = 0; y < WORLD.HEIGHT; y += 1) {
    for (let x = 0; x < WORLD.WIDTH; x += 1) {
      if (y < WORLD.SURFACE_Y) sim.world.setCell(x, y, MATERIAL.AIR, CELL.EMPTY);
      else if (y >= WORLD.BEDROCK_Y) sim.world.setCell(x, y, MATERIAL.BEDROCK, CELL.SOLID);
      else sim.world.setCell(x, y, MATERIAL.LIMESTONE, CELL.SOLID);
    }
  }
}

function revealArea(sim, x, y, w, h) {
  for (let yy = Math.max(WORLD.SURFACE_Y, y); yy < Math.min(WORLD.BEDROCK_Y, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(WORLD.WIDTH, x + w); xx += 1) {
      sim.world.reveal(xx, yy, 0);
    }
  }
}

function addDugRoom(sim, order) {
  const excavation = createExcavation(sim.nextExcavationId++, { kind: 'room', ...order, initial: true });
  const cells = excavationCells(excavation);
  excavation.cells = cells.map(({ x, y }) => sim.world.index(x, y));
  for (const { x, y } of cells) sim.world.setCell(x, y, MATERIAL.AIR, CELL.EMPTY, excavation.id);
  excavation.dugCells = [...excavation.cells].sort((a, b) => a - b);
  excavation.state = 'dug';
  sim.excavations.push(excavation);
  revealArea(sim, excavation.x - 4, excavation.y - 4, excavation.w + 8, excavation.h + 8);
  return excavation;
}

function createPreparedSim(id) {
  const sim = new Sim(1, { empty: true });
  sim.tick = TIME.START_HOUR * TIME.TICKS_PER_HOUR;
  sim.scenario = id;
  prepareWorld(sim);
  sim.colonists = [];
  sim.jobs = [];
  sim.stocks = [];
  sim.doors = [];
  sim.journal = [];
  sim.events = [];
  sim.structureDirty = true;
  return sim;
}

function collapseDemo() {
  const sim = createPreparedSim('collapse-demo');
  const upper = addDugRoom(sim, { x: 36, y: 66, w: 12, h: 4, shape: 'flat', lining: 'none' });
  upper.supports.push({ x: 42, y: 69, material: 'metal', solidity: 100 });
  addDugRoom(sim, { x: 36, y: 72, w: 12, h: 4, shape: 'flat', lining: 'none' });
  return sim;
}

function stackedRooms() {
  const sim = createPreparedSim('stacked-rooms');
  addDugRoom(sim, { x: 40, y: 13, w: 6, h: 4, shape: 'flat', lining: 'none' });
  addDugRoom(sim, { x: 40, y: 20, w: 6, h: 4, shape: 'flat', lining: 'none' });
  addDugRoom(sim, { x: 40, y: 29, w: 6, h: 4, shape: 'vault', lining: 'none' });
  return sim;
}

function thinWall() {
  const sim = createPreparedSim('thin-wall');
  addDugRoom(sim, { x: 36, y: 72, w: 6, h: 4, shape: 'flat', lining: 'none' });
  addDugRoom(sim, { x: 43, y: 72, w: 6, h: 4, shape: 'flat', lining: 'none' });
  revealArea(sim, 32, 66, 21, 16);
  return sim;
}

function sandBank(sim, x, y, w, h) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) sim.world.setCell(xx, yy, MATERIAL.SAND, CELL.SOLID);
  }
  for (let xx = x; xx < x + w; xx += 1) {
    sim.world.setCell(xx, y + 2, MATERIAL.LIMESTONE, CELL.SOLID);
    sim.world.setCell(xx, y + 3, MATERIAL.LIMESTONE, CELL.SOLID);
  }
}

function floodDemo() {
  const sim = createPreparedSim('flood-demo');
  sandBank(sim, 20, 44, 14, 12);
  sandBank(sim, 56, 44, 14, 12);
  const open = addDugRoom(sim, { x: 24, y: 48, w: 6, h: 4, shape: 'vault', label: 'floodOpen' });
  const sealed = addDugRoom(sim, { x: 60, y: 48, w: 6, h: 4, shape: 'vault', label: 'floodSealed' });
  open.lining = 'shotcrete';
  sealed.lining = 'shotcrete';
  sealed.coating = 'waterproof';
  return sim;
}

function co2Demo() {
  const sim = createPreparedSim('co2-demo');
  const upper = addDugRoom(sim, { x: 36, y: 48, w: 8, h: 4, shape: 'vault', label: 'shelterDorm', roomType: 'dorm' });
  addDugRoom(sim, { kind: 'shaft', x: 39, y: 52, w: 1, h: 16, shape: 'flat', label: 'co2Shaft' });
  const lower = addDugRoom(sim, { x: 36, y: 68, w: 8, h: 4, shape: 'vault', label: 'co2Bottom', roomType: 'commons' });
  upper.lining = 'shotcrete';
  lower.lining = 'shotcrete';
  sim.stocks.push(createStock('co2-reserve', 37, 51, STARTING_RESOURCES));
  sim.colonists = createInitialColonists({ x: 37, y: 71 });
  for (const colonist of sim.colonists) {
    const room = colonist.id < 4 ? upper : lower;
    const offset = colonist.id < 4 ? colonist.id : colonist.id - 4;
    colonist.x = room.x + 1 + offset % (room.w - 2);
    colonist.y = room.y + room.h - 1;
    colonist.prevX = colonist.x;
    colonist.prevY = colonist.y;
    colonist.restX = colonist.x;
    colonist.restY = colonist.y;
    colonist.bedX = colonist.x;
    colonist.bedY = colonist.y;
  }
  return sim;
}

function heatDemo() {
  const sim = createPreparedSim('heat-demo');
  const plain = addDugRoom(sim, { x: 24, y: 72, w: 6, h: 4, shape: 'vault', label: 'heatPlain', roomType: 'dorm' });
  const insulated = addDugRoom(sim, { x: 44, y: 72, w: 6, h: 4, shape: 'vault', label: 'heatInsulated', roomType: 'dorm' });
  const diesel = addDugRoom(sim, { x: 64, y: 72, w: 6, h: 4, shape: 'vault', label: 'heatDiesel', roomType: 'diesel' });
  for (const room of [plain, insulated, diesel]) room.lining = 'shotcrete';
  insulated.coating = 'insulation';
  const reserve = createStock('heat-reserve', 67, 75, { fuel: STARTING_RESOURCES.fuel });
  reserve.excavationId = diesel.id;
  sim.stocks.push(reserve);
  return sim;
}

export const HUMAN_BASE_REACTION_TYPES = Object.freeze(['fireExtinguish', 'repair', 'machineRepair']);
// Integrity at which the prudent replay repairs an eroding excavation.
export const HUMAN_BASE_REPAIR_INTEGRITY = 60;
// Fuel reserve the workshop rebuilds from coal before it turns to charcoal filters.
export const HUMAN_BASE_FUEL_TARGET = 150;

export function replayHumanBase(days = 120, onHour = null, seed = 7, balanceProfile = 'm6', { onTick = null } = {}) {
  const sim = new Sim(seed, { storyteller: 'chroniqueur', balanceProfile });
  sim.scenario = 'base-m2-j120';
  const specs = HUMAN_BASE_DIGS;
  const orders = [];
  const reactionOrders = [];
  const rooms = new Map();
  const fitQueued = new Set();

  function apply(order) {
    const result = sim.apply({ ...order });
    const list = HUMAN_BASE_REACTION_TYPES.includes(order.type) ? reactionOrders : orders;
    list.push({ tick: sim.tick, order: { ...order }, ok: result.ok, error: result.error ?? null });
    return result;
  }

  function dig(spec) {
    const result = apply(spec.order);
    if (!result.ok) return;
    rooms.set(spec.key, result.excavation);
    if (spec.coating !== 'none') apply({ type: 'coating', excavationId: result.excavation.id, coating: 'waterproof' });
    if (spec.supportX !== undefined) apply({ type: 'support', excavationId: result.excavation.id, x: spec.supportX, material: 'metal' });
  }

  apply({ type: 'fit', excavationId: 3, roomType: 'ventShaft' });
  for (const spec of specs.filter((candidate) => ['lowerShaft', 'well'].includes(candidate.key))) dig(spec);
  let expansionStarted = false;
  let fuelRecipeStarted = false;
  let coalFiltersStarted = false;
  // One acknowledged repair per breakdown, keyed by room and breakdown start.
  const machineRepairsOrdered = new Set();
  onTick?.(sim);

  for (let hour = 0; hour < days * 24; hour += 1) {
    if (!expansionStarted && rooms.get('well')?.roomType === 'well') {
      expansionStarted = true;
      for (const spec of specs.filter((candidate) => !rooms.has(candidate.key))) dig(spec);
    }
    // The shaft crosses the seed's sand and coal bands and slowly erodes:
    // like a prudent player, repair it each time it falls to the trigger and
    // no stone repair is already waiting.
    const shaft = rooms.get('lowerShaft');
    const shaftRepairPending = shaft && sim.jobs.some((job) => job.type === 'repair'
      && job.excavationId === shaft.id && job.status !== 'done');
    if (shaft && shaft.state !== 'collapsed' && shaft.integrity <= HUMAN_BASE_REPAIR_INTEGRITY && !shaftRepairPending) {
      apply({ type: 'repair', excavationId: shaft.id });
    }
    // A storyteller breakdown disables a machine until a builder pays one
    // spare part or two metal: confirm the repair order once per breakdown.
    for (const breakdown of sim.m5?.storyteller?.breakdowns ?? []) {
      const key = `${breakdown.excavationId}:${breakdown.sinceTick}`;
      if (machineRepairsOrdered.has(key) || !sim.excavation(breakdown.excavationId)?.machineBroken) continue;
      machineRepairsOrdered.add(key);
      apply({ type: 'machineRepair', excavationId: breakdown.excavationId });
    }
    for (const fire of sim.m5?.hazards?.fires ?? []) {
      if (fire.state !== 'burning') continue;
      const totals = resourceTotals(sim);
      const water = EXTINGUISH_WATER_RESOURCES.reduce((sum, key) => sum + (totals[key] ?? 0), 0);
      if (water >= HAZARDS.FIRE.EXTINGUISH_WATER_UNITS) apply({ type: 'fireExtinguish', fireId: fire.id });
    }
    for (const spec of specs) {
      const excavation = rooms.get(spec.key);
      if (!spec.roomType || !excavation || excavation.roomType || fitQueued.has(spec.key)) continue;
      if (excavation.state !== 'dug' || (spec.coating !== 'none' && excavation.coating !== 'waterproof')) continue;
      const result = apply({ type: 'fit', excavationId: excavation.id, roomType: spec.roomType });
      if (result.ok) fitQueued.add(spec.key);
    }
    const workshop = rooms.get('workshop');
    // The floor-aligned coal gallery provides both fuel and renewable charcoal
    // filters. The workshop switches to coal fuel as soon as it is fitted, so
    // its default metal filter recipe never eats the repair metal; once the
    // fuel reserve is rebuilt it makes charcoal filters with the rest of the seam.
    if (!fuelRecipeStarted && workshop?.roomType === 'workshop') {
      fuelRecipeStarted = apply({ type: 'recipe', excavationId: workshop.id, recipeId: 'coalFuel' }).ok;
    }
    if (fuelRecipeStarted && !coalFiltersStarted && (resourceTotals(sim).fuel ?? 0) >= HUMAN_BASE_FUEL_TARGET) {
      coalFiltersStarted = apply({ type: 'recipe', excavationId: workshop.id, recipeId: 'coalFilters' }).ok;
    }
    if (onTick) {
      for (let minute = 0; minute < TIME.TICKS_PER_HOUR; minute += 1) {
        sim.step();
        onTick(sim);
      }
    } else sim.step(TIME.TICKS_PER_HOUR);
    onHour?.(sim);
  }
  return { sim, orders, reactionOrders };
}

function shiftTimeline(value, delta) {
  if (Array.isArray(value)) {
    for (const entry of value) shiftTimeline(entry, delta);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && (/tick$/i.test(key) || key === 'until' || key === 'since')) value[key] = entry + delta;
    else shiftTimeline(entry, delta);
  }
}

function requireDemoRoom(sim, roomType) {
  const room = sim.excavations.find((candidate) => candidate.roomType === roomType && candidate.state !== 'collapsed');
  if (!room) throw new Error(`${sim.scenario} requires a ${roomType} room`);
  return room;
}

function supportDemoRoom(room) {
  for (const fraction of [1 / 3, 2 / 3]) {
    const x = room.x + Math.floor(room.w * fraction);
    if (!room.supports.some((support) => support.x === x && !support.failed)) {
      room.supports.push({ x, y: room.y + room.h - 1, material: 'metal', solidity: 100 });
    }
  }
}

function prepareDemoSlab(sim, room, thickness = Math.max(2, Math.ceil(0.35 * room.w))) {
  for (let x = room.x; x < room.x + room.w; x += 1) {
    for (let y = room.y - thickness; y < room.y; y += 1) {
      const owner = sim.excavation(sim.world.cellExcavation[sim.world.index(x, y)]);
      if (owner?.kind === 'shaft' && room.kind === 'gallery') continue;
      if (owner) {
        throw new Error(`${sim.scenario}: slab above ${room.roomType} overlaps an excavation at ${x},${y}`);
      }
      sim.world.setCell(x, y, MATERIAL.CONCRETE, CELL.SOLID, -1);
    }
  }
}

function supportDemoBase(sim) {
  for (const roomType of ['filterPlant', 'bikeDynamo', 'workshop']) supportDemoRoom(requireDemoRoom(sim, roomType));
  const foodRooms = sim.excavations.filter((room) => ['mushroom', 'insectFarm'].includes(room.roomType));
  if (foodRooms.length === 0) throw new Error(`${sim.scenario} requires food production rooms`);
  for (const room of foodRooms) supportDemoRoom(room);
  const deepShaft = sim.excavations.filter((room) => room.kind === 'shaft' && !room.roomType)
    .sort((a, b) => b.y + b.h - a.y - a.h)[0];
  if (!deepShaft) throw new Error(`${sim.scenario} requires a deep access shaft`);
  deepShaft.lining = 'bolts';
  // Keep the inherited powered intake working; its position belongs to the base plan.
  requireDemoRoom(sim, 'ventShaft').disabled = false;
}

function peopleDemo() {
  const sim = loadHumanBase();
  const targetTick = (PEOPLE_DEMO.DISPLAYED_DAY - 1) * TIME.TICKS_PER_DAY + TIME.START_HOUR * TIME.TICKS_PER_HOUR;
  shiftTimeline(sim, targetTick - sim.tick);
  sim.scenario = 'people-demo';
  sim.journal = [];
  sim.events = [];
  sim.alerts = {};
  sim.alertLevels = {};
  sim.emergency = false;
  for (const room of sim.excavations) {
    room.alertLevels = {};
    room.alertChangeTicks = {};
    room.alertResolvedTicks = {};
    room.alertJournalLevels = {};
  }
  const deceased = sim.colonists.find((colonist) => colonist.id === 11);
  Object.assign(deceased, {
    dead: true, health: 0, deathTick: sim.tick - 2 * TIME.TICKS_PER_DAY,
    bodyLocation: 'ossuary', ossuaryId: 13, mourningProcessed: true, task: 'dead',
    x: 25, y: 49, personal: null, jobId: null,
  });
  for (const colonist of sim.colonists) {
    delete colonist.relations[11];
    Object.assign(colonist, {
      social: 75, intimacy: 85, purpose: 85,
      morale: 65, moraleValue: 65, neglectDays: 0,
      moraleCauses: [], moraleEvents: [], moraleHistory: [], moraleTrend: 0, moraleTrend24h: 0,
      moraleAlertLevel: null, moraleAlertResolvedTick: null, moraleAlertJournalLevel: null,
      crisis: { level: null, behavior: null, since: null, until: null, nextTick: null, warningSince: null, episode: 0 },
    });
  }

  const socialRooms = [
    { key: 'ossuary', x: 24, y: 47, w: 3, h: 4 },
    { key: 'commons', x: 30, y: 47, w: 6, h: 4 },
    { key: 'school', x: 8, y: 47, w: 5, h: 4 },
    { key: 'workshop', x: 57, y: 47, w: 5, h: 4 },
    { key: 'lab', x: 65, y: 47, w: 5, h: 4 },
    { key: 'heater', x: 73, y: 47, w: 3, h: 4 },
    { key: 'diesel', x: 79, y: 47, w: 4, h: 4 },
    { key: 'heater', x: 86, y: 47, w: 3, h: 4 },
    { key: 'heatExchanger', x: 92, y: 47, w: 3, h: 4 },
    // Recycle diesel exhaust while keeping the social shelter warm.
    { key: 'scrubber', x: 17, y: 47, w: 4, h: 4 },
  ];
  for (const spec of socialRooms) {
    const room = addDugRoom(sim, { ...spec, shape: 'vault', lining: 'shotcrete', roomType: spec.key });
    if (spec.key === 'school') prepareDemoSlab(sim, room);
    room.roomType = spec.key;
    room.state = 'fitted';
    room.lining = 'shotcrete';
    room.coating = 'waterproof';
    room.temperature = 19;
    room.powered = true;
    room.production = { workMinutes: 0, produced: 0, status: 'idle' };
    const supportCount = spec.w >= 5 ? 2 : 1;
    for (let index = 1; index <= supportCount; index += 1) {
      room.supports.push({ x: spec.x + Math.floor(index * spec.w / (supportCount + 1)), y: spec.y + spec.h - 1, material: 'metal', solidity: 100 });
    }
    if (['workshop', 'lab', 'diesel'].includes(spec.key)) {
      const resources = spec.key === 'lab' ? { books: 4 }
        : spec.key === 'diesel' ? { fuel: 180 } : { metal: 4, sandRes: 8 };
      const stock = createStock(`room-${room.id}`, room.x + 1, room.y + room.h - 1, resources);
      stock.excavationId = room.id;
      room.stockId = stock.id;
      sim.stocks.push(stock);
    }
  }
  supportDemoBase(sim);
  for (const room of sim.excavations.filter((candidate) => ['dorm', 'commons', 'canteen'].includes(candidate.roomType))) {
    room.temperature = 19;
    room.coating = room.roomType === 'commons' ? 'waterproof' : 'insulation';
  }
  const ossuary = sim.excavations.find((room) => room.roomType === 'ossuary');
  ossuary.bodyIds = [deceased.id];
  deceased.ossuaryId = ossuary.id;
  for (const [start, end] of [[13, 17], [21, 24], [27, 30], [36, 48], [54, 57], [62, 65], [70, 73], [76, 79], [83, 86], [89, 92]]) {
    const passage = addDugRoom(sim, { kind: 'gallery', x: start, y: 49, w: end - start, h: 2, shape: 'vault' });
    prepareDemoSlab(sim, passage, 2);
    passage.lining = 'shotcrete';
    passage.coating = 'waterproof';
    passage.temperature = 19;
    passage.supports.push({ x: start + Math.floor((end - start) / 2), y: 50, material: 'metal', solidity: 100 });
  }
  for (let x = 8; x <= 95; x += 1) sim.world.setCell(x, 51, MATERIAL.CONCRETE, CELL.SOLID, -1);
  for (const shaft of sim.excavations.filter((room) => room.kind === 'shaft' && room.y <= 51 && room.y + room.h > 51)) {
    for (let x = shaft.x; x < shaft.x + shaft.w; x += 1) sim.world.setCell(x, 51, MATERIAL.AIR, CELL.EMPTY, shaft.id);
  }
  const reserve = sim.stocks.find((stock) => stock.id === 'reserve');
  for (const [resource, amount] of Object.entries({ books: 30, metal: 50, sandRes: 50, scrap: 20, fuel: 200 })) {
    reserve.resources[resource] = (reserve.resources[resource] ?? 0) + amount;
  }
  const generatorStock = ensureRoomStock(sim, requireDemoRoom(sim, 'diesel'));
  generatorStock.resources.fuel = 180;
  sim.structureDirty = true;

  const father = sim.colonists.find((colonist) => colonist.id === 0);
  const mother = sim.colonists.find((colonist) => colonist.id === 1);
  // Give the parent an explicit production priority with the new air station.
  sim.apply({ type: 'workPriority', colonistId: father.id, work: 'produce', priority: 4 });
  father.age = 34;
  mother.age = 34;
  mother.pregnancy = {
    partnerId: father.id,
    startTick: sim.tick + PEOPLE_DEMO.BIRTH_DELAY_TICKS - PEOPLE.PREGNANCY_DAYS * TIME.TICKS_PER_DAY,
    dueTick: sim.tick + PEOPLE_DEMO.BIRTH_DELAY_TICKS,
  };

  const crisisCandidate = sim.colonists.find((colonist) => colonist.id === 10);
  crisisCandidate.morale = 30;
  crisisCandidate.moraleValue = 30;
  crisisCandidate.moraleEvents = [{
    type: 'mourning', sourceId: deceased.id, value: -80,
    startTick: sim.tick - 2 * TIME.TICKS_PER_DAY,
    until: sim.tick + 18 * TIME.TICKS_PER_DAY,
  }];

  sim.factions = {
    unlocked: true,
    remonteurs: { support: PEOPLE_DEMO.REMONTEURS_SUPPORT, members: [0, 2, 4, 6, 8, 10] },
    profonds: { support: PEOPLE_DEMO.PROFONDS_SUPPORT, members: [1, 3, 5, 7, 9] },
    strikeUntil: 0,
    lastConflictTick: null,
  };
  return sim;
}

function exodusDemo() {
  const sim = loadHumanBase();
  const targetTick = (EXODUS_DEMO.YEAR - 1) * 360 * TIME.TICKS_PER_DAY
    + TIME.START_HOUR * TIME.TICKS_PER_HOUR;
  shiftTimeline(sim, targetTick - sim.tick);
  sim.scenario = 'exodus-demo';
  sim.journal = [];
  sim.events = [];
  sim.exodus.storyArchive = [];
  sim.exodus.storyJournalCursor = -1;
  sim.emergency = false;
  for (const colonist of sim.colonists) {
    Object.assign(colonist, {
      health: 100, dose: 0, doseHistory: [], radiationStatus: 'healthy', unauthorizedSurface: false,
      hunger: 20, thirst: 20, sleep: 20, warmth: 80, air: 90, light: 80,
      social: 75, intimacy: 75, purpose: 75, morale: 70, moraleValue: 70,
      neglectDays: 0, moraleEvents: [], moraleHistory: [], moraleTrend: 0, moraleTrend24h: 0,
      crisis: { level: null, behavior: null, since: null, until: null, nextTick: null, warningSince: null, episode: 0 },
    });
  }

  const workshop = requireDemoRoom(sim, 'workshop');
  const floorY = workshop.y + workshop.h - 1;
  const depot = addDugRoom(sim, { ...EXODUS_DEMO.DEPOT_ORDER,
    x: workshop.x + workshop.w + 2, y: floorY - EXODUS_DEMO.DEPOT_ORDER.h + 1, roomType: 'exodusDepot' });
  Object.assign(depot, {
    roomType: 'exodusDepot', state: 'fitted', lining: 'shotcrete', coating: 'waterproof',
    temperature: 19, powered: true, production: { workMinutes: 0, produced: 0, status: 'idle' },
  });
  depot.supports.push(
    { x: depot.x + 2, y: depot.y + depot.h - 1, material: 'metal', solidity: 100 },
    { x: depot.x + 4, y: depot.y + depot.h - 1, material: 'metal', solidity: 100 },
  );
  const depotPassage = addDugRoom(sim, { kind: 'gallery', x: workshop.x + workshop.w,
    y: floorY - 1, w: depot.x - workshop.x - workshop.w, h: 2, shape: 'vault', lining: 'shotcrete' });
  depotPassage.coating = 'waterproof';
  const commons = addDugRoom(sim, { x: 32, y: 47, w: 6, h: 4, shape: 'vault', roomType: 'commons' });
  prepareDemoSlab(sim, commons);
  Object.assign(commons, {
    roomType: 'commons', state: 'fitted', lining: 'shotcrete', coating: 'waterproof',
    temperature: 19, powered: true, production: { workMinutes: 0, produced: 0, status: 'idle' },
  });
  commons.supports.push(
    { x: commons.x + 2, y: commons.y + commons.h - 1, material: 'metal', solidity: 100 },
    { x: commons.x + 4, y: commons.y + commons.h - 1, material: 'metal', solidity: 100 },
  );
  const filterPlant = requireDemoRoom(sim, 'filterPlant');
  const commonsPassage = addDugRoom(sim, { kind: 'gallery', x: commons.x + commons.w,
    y: commons.y + commons.h - 2, w: filterPlant.x - commons.x - commons.w, h: 2, shape: 'vault', lining: 'shotcrete' });
  // Two metres of intact lintel below the well keep this short tunnel separate.
  prepareDemoSlab(sim, commonsPassage, 2);
  commonsPassage.coating = 'waterproof';
  supportDemoBase(sim);

  const reserve = sim.stocks.find((stock) => stock.id === 'reserve');
  for (const [resource, required] of Object.entries(EXODUS.KIT_REQUIREMENTS)) {
    reserve.resources[resource] = Math.max(reserve.resources[resource] ?? 0, required);
  }
  // Machine repairs draw on the same metal as the kit. Keep two metal for each
  // inherited breakdown plus one spare repair, so a machine fixed while the
  // player looks around never leaves the kit short of metal.
  const openBreakdowns = sim.excavations.filter((room) => room.machineBroken && room.state !== 'collapsed').length;
  reserve.resources.metal = Math.max(reserve.resources.metal ?? 0,
    EXODUS.KIT_REQUIREMENTS.metal + REPAIRS.METAL_COST.metal * (openBreakdowns + 1));
  const living = sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead).length;
  const foodGoal = Math.ceil((EXODUS.KIT_REQUIREMENTS.food + living * EXODUS_DEMO.FOOD_BUFFER_DAYS)
    / (1 - CULTIVATION.FOOD_SPOIL_PER_DAY) ** EXODUS_DEMO.FOOD_BUFFER_DAYS);
  reserve.resources.food = Math.max(reserve.resources.food ?? 0, foodGoal);
  reserve.resources.fuel = Math.max(reserve.resources.fuel ?? 0, 90);
  // The depot starts empty: workers must haul every kit resource from the reserve.
  ensureRoomStock(sim, depot);

  const safest = sim.radiation.hotspots.reduce((best, hotspot) => hotspot.multiplier < best.multiplier ? hotspot : best);
  sim.radiation.selectedX = safest.x;
  sim.radiation.safeThreshold = EXODUS_DEMO.EARLY_THRESHOLD;
  const rainEndTick = sim.tick + WEATHER.BLACK_RAIN_TICKS;
  Object.assign(sim.weather, {
    current: 'blackRain', startTick: sim.tick, endTick: rainEndTick, until: rainEndTick,
    activeEvent: { id: 'demo-black-rain', type: 'blackRain', startTick: sim.tick, endTick: rainEndTick },
    nextEvent: null, nextEventTick: rainEndTick, nappeContamination: WEATHER.BLACK_RAIN_NAPPE_DOSE,
    filterMultiplier: 1, solarFactor: WEATHER.RAIN_SOLAR_FACTOR, expeditionsBlocked: false,
    forecast: [{ type: 'blackRain', startTick: sim.tick, endTick: rainEndTick }],
  });
  sim.radiation.surfaceDose = surfaceDoseRate(sim);
  sim.radiation.safeTick = safeDateTick(sim);
  sim.radiation.safeDay = sim.radiation.safeTick / TIME.TICKS_PER_DAY;
  sim.structureDirty = true;
  sim.log('warning', 'eventWeatherStart', { weather: 'blackRain' });
  return sim;
}

function m5Demo() {
  const sim = new Sim(7, { storyteller: 'chroniqueur' });
  sim.scenario = 'm5-demo';
  sim.surface.structures.push({
    id: sim.surface.nextStructureId++, type: 'antenna', x: 43, state: 'built',
    workTicks: 360, requiredTicks: 360, colonistIds: [], crew: null,
  });
  const battery = addDugRoom(sim, { x: 56, y: 47, w: 4, h: 3, shape: 'vault', roomType: 'battery' });
  Object.assign(battery, {
    roomType: 'battery', state: 'fitted', lining: 'shotcrete', coating: 'waterproof',
    temperature: 19, powered: true, storedKwh: 40,
  });
  sim.research.completed.push('sonar');
  sim.m5.poi.nextFindVolume = 4;
  sim.m5.dilemmas.nextDilemmaTick = sim.tick + 300;
  sim.m5.radio.neighbors[0].contactInTicks = 60;
  sim.m5.poi.items[0] = {
    id: 'cellar', type: 'cellar', x: 58, y: 30, w: 3, h: 2,
    cells: [{ x: 58, y: 30 }, { x: 59, y: 30 }, { x: 60, y: 30 }, { x: 58, y: 31 }, { x: 59, y: 31 }, { x: 60, y: 31 }],
    discovered: false, explored: false, discoveryTick: null, discoveryMethod: null,
    approximate: null, loot: null, annexId: null, encounterId: null,
  };
  const protectedUntil = sim.m5.storyteller.protectedUntil;
  sim.m5.storyteller.protectedUntil = sim.tick;
  scheduleStoryEvent(sim, 'fire', sim.tick + 900, {
    excavationId: 2, name: 'Générateur de l’abri', cause: 'overheat',
  });
  sim.m5.storyteller.protectedUntil = protectedUntil;
  sim.apply({ type: 'dig', kind: 'gallery', x: 56, y: 30, w: 4, h: 2, shape: 'flat', lining: 'none' });
  return sim;
}

function m6Demo() {
  const sim = peopleDemo();
  sim.scenario = 'm6-demo';
  const ossuary = sim.excavations.find((room) => room.roomType === 'ossuary');
  const school = sim.excavations.find((room) => room.roomType === 'school');
  const deceased = sim.colonists.find((colonist) => colonist.bodyLocation === 'ossuary');
  deceased.traits = [];
  deceased.skills = { dig: 2, build: 1, farm: 1, medic: 0, tech: 1, cook: 20, scout: 1, teach: 2 };
  deceased.lastDamageCauses = ['oldAge'];
  leaveSouvenir(sim, deceased, ossuary);

  const child = JSON.parse(JSON.stringify(sim.colonists[0]));
  child.id = 10;
  child.name = 'Jules Delaunay';
  child.parentIds = [0, 1];
  child.birthTick = sim.tick - 10 * PEOPLE.DAYS_PER_YEAR * TIME.TICKS_PER_DAY;
  child.age = 10;
  child.lifeStage = 'school';
  child.skills = { dig: 0, build: 0, farm: 0, medic: 0, tech: 0, cook: 0, scout: 0, teach: 0 };
  child.relations = {};
  child.x = school.x + 1;
  child.y = school.y + school.h - 1;
  child.prevX = child.x;
  child.prevY = child.y;
  child.task = 'study';
  child.jobId = null;
  child.personal = { type: 'study', phase: 'studying', excavationId: school.id };
  child.health = 100;
  child.dead = false;
  sim.colonists.splice(10, 1, child);
  sim.nextColonistId = Math.max(...sim.colonists.map((colonist) => colonist.id)) + 1;

  const teacher = sim.colonists[2];
  teacher.x = school.x + school.w - 2;
  teacher.y = school.y + school.h - 1;
  teacher.task = 'working';
  teacher.personal = null;
  const teachingJob = {
    id: sim.nextJobId++, type: 'produce', excavationId: school.id, roomType: 'school',
    status: 'active', colonistId: teacher.id, phase: 'work', work: 0, retryTick: 0,
  };
  sim.jobs.push(teachingJob);
  teacher.jobId = teachingJob.id;

  sim.exodus.kit = { ...EXODUS.KIT_REQUIREMENTS };
  const safest = sim.radiation.hotspots.reduce((best, hotspot) => hotspot.multiplier < best.multiplier ? hotspot : best);
  sim.radiation.selectedX = safest.x;
  sim.radiation.safeThreshold = EXODUS_DEMO.EARLY_THRESHOLD;
  sim.radiation.safeTick = safeDateTick(sim);
  sim.radiation.safeDay = sim.radiation.safeTick / TIME.TICKS_PER_DAY;
  return sim;
}

export function createScenario(id) {
  let sim;
  if (id === 'collapse-demo') sim = collapseDemo();
  else if (id === 'stacked-rooms') sim = stackedRooms();
  else if (id === 'thin-wall') sim = thinWall();
  else if (id === 'flood-demo') sim = floodDemo();
  else if (id === 'co2-demo') sim = co2Demo();
  else if (id === 'heat-demo') sim = heatDemo();
  else if (id === 'base-m2-j120') sim = loadHumanBase();
  else if (id === 'people-demo') sim = peopleDemo();
  else if (id === 'exodus-demo') sim = exodusDemo();
  else if (id === 'm5-demo') sim = m5Demo();
  else if (id === 'm6-demo') sim = m6Demo();
  else throw new RangeError(`Unknown scenario: ${id}`);
  refreshMoraleCauses(sim);
  return sim;
}

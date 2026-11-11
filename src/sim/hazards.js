import { AIR, CELL, TIME, WATER, WORLD } from '../data/balance.js';
import { MATERIAL, materialAt } from '../data/materials.js';
import { EXTINGUISH_WATER_RESOURCES, HAZARDS, RAID_THEFT_RESOURCES } from '../data/hazards.js';
import { activeExcavation, connectedExcavations, excavationOccupants } from './networks.js';
import { surfaceHatch } from './surface.js';
import { roomWaterRatio, WATER_QUALITY } from './water.js';
import { findPath } from './nav.js';
import { roomAirVolume } from './air.js';
import { recordReserveShift } from './resources.js';

const LEVEL_RANK = Object.freeze({ null: 0, warning: 1, danger: 2 });
const ALERT_CODES = Object.freeze({
  smoke: ['alertSmokeYellow', 'alertSmokeRed'],
  methane: ['alertMethaneYellow', 'alertMethaneRed'],
  water: ['alertWaterPocketYellow', 'alertWaterPocketRed'],
  raiders: ['alertRaidersYellow', 'alertRaidersRed'],
});

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

function usableRoom(sim, excavationId) {
  const excavation = sim.excavation(excavationId);
  return activeExcavation(excavation) && excavation.dugCells.length > 0 ? excavation : null;
}

function nextNumericId(items) {
  return items.reduce((next, item) => Math.max(next, (item.id ?? -1) + 1), 0);
}

function gasState(sim, excavationId) {
  const hazards = sim.m5.hazards;
  hazards.gas[excavationId] ??= { methane: 0, smoke: 0 };
  hazards.gas[excavationId].methane = finite(hazards.gas[excavationId].methane, 0);
  hazards.gas[excavationId].smoke = finite(hazards.gas[excavationId].smoke, 0);
  return hazards.gas[excavationId];
}

function setHazardAlert(sim, category, id, level, params = {}, focus = null) {
  const hazards = sim.m5.hazards;
  const key = `${category}:${id}`;
  const previous = hazards.alertLevels[key] ?? null;
  if (previous === level) return;
  hazards.alertLevels[key] = level;
  if (!level) return;
  const code = ALERT_CODES[category][level === 'danger' ? 1 : 0];
  const excavationId = category === 'raiders' ? params.excavationId : id;
  sim.log(level, code, { id, ...(excavationId === undefined ? {} : { excavationId }), ...params }, focus);
  if (level === 'danger') sim.emergency = true;
}

function rebuildAlerts(sim) {
  const hazards = sim.m5.hazards;
  hazards.alerts = {};
  for (const category of Object.keys(ALERT_CODES)) hazards.alerts[category] = { level: null, ids: [] };
  for (const key of Object.keys(hazards.alertLevels).sort()) {
    const level = hazards.alertLevels[key];
    if (!level) continue;
    const separator = key.indexOf(':');
    const category = key.slice(0, separator);
    const rawId = key.slice(separator + 1);
    const id = Number.isFinite(Number(rawId)) ? Number(rawId) : rawId;
    const aggregate = hazards.alerts[category];
    if (!aggregate) continue;
    if (LEVEL_RANK[level] > LEVEL_RANK[aggregate.level]) aggregate.level = level;
    aggregate.ids.push(id);
  }
  hazards.level = Object.values(hazards.alerts).reduce((highest, alert) => (
    LEVEL_RANK[alert.level] > LEVEL_RANK[highest] ? alert.level : highest
  ), null);
}

export function initializeHazards(sim) {
  sim.m5 ??= {};
  sim.m5.hazards ??= {};
  const hazards = sim.m5.hazards;
  hazards.fires ??= [];
  hazards.methanePockets ??= [];
  hazards.waterPockets ??= [];
  hazards.raiders ??= [];
  hazards.raids ??= [];
  hazards.detectors ??= [];
  hazards.gas ??= {};
  hazards.smoke ??= [];
  hazards.alerts ??= {};
  hazards.alertLevels ??= {};
  hazards.processedDigEvents ??= [];
  hazards.nextFireId ??= nextNumericId(hazards.fires);
  hazards.nextMethanePocketId ??= nextNumericId(hazards.methanePockets);
  hazards.nextWaterPocketId ??= nextNumericId(hazards.waterPockets);
  hazards.nextRaidId ??= nextNumericId(hazards.raids);
  hazards.nextRaiderId ??= nextNumericId(hazards.raiders);
  hazards.level ??= null;
}

function burningFire(sim, excavationId) {
  return sim.m5.hazards.fires.find((fire) => fire.excavationId === excavationId && fire.state === 'burning') ?? null;
}

function openSmokeEpisode(sim, fire, excavation) {
  if (fire.smokeEpisodes[excavation.id]) return;
  const warningTick = sim.tick;
  fire.smokeEpisodes[excavation.id] = {
    warningTick,
    redTick: warningTick + TIME.TICKS_PER_DAY,
    damageTick: warningTick + HAZARDS.FIRE.FIRST_DAMAGE_DELAY_TICKS,
  };
  gasState(sim, excavation.id);
  if (sim.m5.hazards.alertLevels[`smoke:${excavation.id}`] !== 'danger') {
    setHazardAlert(sim, 'smoke', excavation.id, 'warning', {}, excavation);
  }
}

function updateFireVisuals(sim, fire) {
  const excavation = sim.excavation(fire.excavationId);
  if (!excavation || fire.state !== 'burning') {
    fire.flames = [];
    fire.sparks = [];
    return;
  }
  fire.flames = [];
  fire.sparks = [];
  for (let index = 0; index < HAZARDS.FIRE.FLAME_COUNT; index += 1) {
    const phase = ((sim.tick + fire.id * 17 + index * 23) % 40) / 40;
    fire.flames.push({
      x: excavation.x + (index + 1) * excavation.w / (HAZARDS.FIRE.FLAME_COUNT + 1),
      y: excavation.y + excavation.h - 0.5,
      height: 0.5 + fire.intensity * (0.5 + phase * 0.5),
    });
  }
  for (let index = 0; index < HAZARDS.FIRE.SPARK_COUNT; index += 1) {
    const phase = ((sim.tick + fire.id * 11 + index * 29) % 60) / 60;
    fire.sparks.push({
      x: excavation.x + (index + 1) * excavation.w / (HAZARDS.FIRE.SPARK_COUNT + 1),
      y: excavation.y + excavation.h - 1 - phase,
      alpha: 1 - phase,
    });
  }
}

export function startFire(sim, excavationId, source = 'storyteller') {
  initializeHazards(sim);
  const excavation = usableRoom(sim, excavationId);
  if (!excavation) return null;
  const existing = burningFire(sim, excavationId);
  if (existing) return existing;
  const sourceType = typeof source === 'string' ? source : source?.type ?? 'storyteller';
  const spreadFrom = typeof source === 'object' ? source.from ?? null : null;
  const fireId = sim.m5.hazards.nextFireId++;
  const campaignId = spreadFrom === null ? fireId
    : sim.m5.hazards.fires.find((candidate) => candidate.excavationId === spreadFrom)?.campaignId ?? fireId;
  const fire = {
    id: fireId,
    campaignId,
    excavationId,
    source: sourceType,
    spreadFrom,
    state: 'burning',
    startedTick: sim.tick,
    endedTick: null,
    intensity: HAZARDS.FIRE.BASE_INTENSITY,
    fuel: 1,
    spreadCount: 0,
    smokeEpisodes: {},
    smoke: [],
    flames: [],
    sparks: [],
    harmedColonistIds: [],
    damageDone: 0,
    waterUsed: 0,
    x: excavation.x + excavation.w / 2,
    y: excavation.y + excavation.h - 1,
  };
  sim.m5.hazards.fires.push(fire);
  openSmokeEpisode(sim, fire, excavation);
  updateFireVisuals(sim, fire);
  const spread = sourceType === 'spread';
  const code = spread ? 'eventFireSpread' : 'eventFireStart';
  sim.log('warning', code, { id: excavationId, source: sourceType, from: spreadFrom }, excavation);
  sim.events.push({
    type: spread ? 'fireSpread' : 'fireStart', tick: sim.tick, fireId: fire.id,
    excavationId, source: sourceType, from: spreadFrom, x: fire.x, y: fire.y,
  });
  return fire;
}

function endFire(sim, fire, state) {
  if (fire.state !== 'burning') return;
  fire.state = state;
  fire.endedTick = sim.tick;
  fire.intensity = 0;
  fire.fuel = 0;
  fire.flames = [];
  fire.sparks = [];
}

// Derived topology: only traverse a short, open passage to the first room.
// Cached until rock, doors or room ownership changes; no per-tick grid flood fill.
const hazardNeighborCaches = new WeakMap();

function nearbyRooms(sim, origin) {
  if (!activeExcavation(origin)) return [];
  const rooms = sim.excavations;
  const doorKey = sim.doors.map((door) => `${door.id}:${door.x}:${door.y}:${door.open === false}`).join(',');
  let cache = hazardNeighborCaches.get(sim);
  let valid = cache?.revision === sim.world.revision && cache.doorKey === doorKey
    && cache.refs.length === rooms.length;
  for (let i = 0; valid && i < rooms.length; i += 1) {
    valid = cache.refs[i] === rooms[i] && cache.ids[i] === rooms[i].id
      && cache.active[i] === Boolean(activeExcavation(rooms[i]))
      && cache.dugLengths[i] === rooms[i].dugCells.length;
  }
  if (!valid) {
    cache = { revision: sim.world.revision, doorKey, refs: rooms.slice(),
      ids: rooms.map((room) => room.id), active: rooms.map((room) => Boolean(activeExcavation(room))),
      dugLengths: rooms.map((room) => room.dugCells.length), byRoom: new Map(),
      rooms: new Map(rooms.filter(activeExcavation).map((room) => [room.id, room])), closed: new Set() };
    for (const door of sim.doors) {
      if (door.open !== false) continue;
      cache.closed.add(sim.world.index(door.x, door.y));
      cache.closed.add(sim.world.index(door.x, door.y + 1));
    }
    hazardNeighborCaches.set(sim, cache);
  }
  if (cache.byRoom.has(origin.id)) return cache.byRoom.get(origin.id);
  const queue = [];
  const visited = new Set();
  const distances = new Map();
  for (const index of origin.dugCells) {
    const { x, y } = sim.world.coords(index);
    if (!sim.world.isEmpty(x, y) || cache.closed.has(index)) continue;
    queue.push({ index, distance: 0 });
    visited.add(index);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const { index, distance } = queue[head];
    if (distance >= HAZARDS.NEIGHBOR_PATH_CELLS) continue;
    const { x, y } = sim.world.coords(index);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (yy < WORLD.SURFACE_Y || !sim.world.isEmpty(xx, yy)) continue;
      const next = sim.world.index(xx, yy);
      if (visited.has(next) || cache.closed.has(next)) continue;
      visited.add(next);
      const owner = sim.world.cellExcavation[next];
      if (owner !== origin.id && cache.rooms.has(owner)) {
        if (!distances.has(owner)) distances.set(owner, distance + 1);
        continue;
      }
      queue.push({ index: next, distance: distance + 1 });
    }
  }
  const neighbors = [...distances.keys()].map((id) => cache.rooms.get(id))
    .sort((a, b) => distances.get(a.id) - distances.get(b.id) || a.y - b.y || a.x - b.x || a.id - b.id);
  cache.byRoom.set(origin.id, neighbors);
  return neighbors;
}

function spreadFire(sim, fire) {
  const campaignFires = sim.m5.hazards.fires.filter((candidate) => candidate.campaignId === fire.campaignId);
  const affected = new Set(campaignFires.map((candidate) => candidate.excavationId));
  const spreadCount = campaignFires.filter((candidate) => candidate.spreadFrom !== null).length;
  const remaining = Math.max(0, HAZARDS.FIRE.MAX_SPREAD - spreadCount);
  const elapsed = sim.tick - fire.startedTick;
  const due = Math.min(fire.spreadCount + remaining, Math.floor(elapsed / HAZARDS.FIRE.SPREAD_INTERVAL_TICKS));
  while (fire.spreadCount < due) {
    const origin = sim.excavation(fire.excavationId);
    const candidates = nearbyRooms(sim, origin)
      .filter((excavation) => excavation.dugCells.length > 0 && !affected.has(excavation.id));
    if (candidates.length === 0) break;
    affected.add(candidates[0].id);
    startFire(sim, candidates[0].id, { type: 'spread', from: fire.excavationId });
    fire.spreadCount += 1;
  }
}

function smokeRooms(sim, fire) {
  const origin = sim.excavation(fire.excavationId);
  if (!origin) return [];
  const upper = connectedExcavations(sim, origin)
    .filter((excavation) => excavation.y < origin.y && excavation.dugCells.length > 0);
  return [origin, ...upper].sort((a, b) => a.id - b.id);
}

function anotherActiveSmokeSource(sim, excavationId, excludedFireId) {
  return sim.m5.hazards.fires.some((fire) => fire.id !== excludedFireId
    && fire.state === 'burning' && fire.smokeEpisodes[excavationId]);
}

function applySmokeDamage(sim, fire, excavation, level) {
  fire.damageByColonist ??= {};
  for (const colonist of excavationOccupants(sim, excavation.id)) {
    if (colonist.dead || colonist.health <= 0) continue;
    const previous = sim.m5.hazards.fires.filter((candidate) => candidate.campaignId === fire.campaignId)
      .reduce((total, candidate) => total + (candidate.damageByColonist?.[colonist.id] ?? 0), 0);
    const remaining = Math.max(0, HAZARDS.FIRE.MAX_DAMAGE_PER_COLONIST - previous);
    if (remaining <= 0) continue;
    const amount = Math.min(remaining, HAZARDS.FIRE.SMOKE_DAMAGE_PER_HOUR * level / 100 / TIME.TICKS_PER_HOUR)
      * (colonist.damageFactor ?? 1);
    colonist.health = clamp(colonist.health - amount);
    colonist.lastDamageCauses = ['smoke'];
    fire.damageByColonist[colonist.id] = previous + amount;
    fire.damageDone += amount;
    if (fire.harmedColonistIds.includes(colonist.id)) continue;
    fire.harmedColonistIds.push(colonist.id);
    colonist.injured = true;
    colonist.injuries ??= [];
    colonist.injuries.push({ type: 'smoke', recovery: 0, fireId: fire.id });
    sim.events.push({
      type: 'injury', tick: sim.tick, colonistId: colonist.id, excavationId: excavation.id,
      injury: 'smoke', fireId: fire.id, amount, x: colonist.x, y: colonist.y,
    });
  }
}

const quiescentFireCaches = new WeakMap();
const SMOKE_RECORD_KEYS = ['excavationId', 'x', 'y', 'level', 'warningTick', 'damageTick'];

function quiescentRooms(sim, hazards) {
  const rooms = sim.excavations;
  let cache = quiescentFireCaches.get(hazards);
  let valid = cache && cache.refs.length === rooms.length;
  for (let i = 0; valid && i < rooms.length; i += 1) {
    valid = cache.refs[i] === rooms[i] && Object.is(cache.ids[i], rooms[i].id);
  }
  if (!valid) {
    cache = { refs: rooms.slice(), ids: rooms.map((room) => room.id), byId: new Map(), handled: new Set() };
    for (const room of rooms) {
      if (!cache.byId.has(room.id)) cache.byId.set(room.id, room);
    }
    quiescentFireCaches.set(hazards, cache);
  }
  cache.handled.clear();
  return cache;
}

function exactClearSmokeRecord(record, room, episode) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || !Object.is(record.excavationId, room.id)
    || !Object.is(record.x, room.x + room.w / 2) || !Object.is(record.y, room.y)
    || !Object.is(record.level, 0) || !Object.is(record.warningTick, episode.warningTick)
    || !Object.is(record.damageTick, episode.damageTick)) return false;
  let index = 0;
  for (const key in record) {
    if (!Object.hasOwn(record, key)) continue;
    if (key !== SMOKE_RECORD_KEYS[index++]) return false;
  }
  return index === SMOKE_RECORD_KEYS.length;
}

function updateQuiescentFires(sim, hazards) {
  const cache = quiescentRooms(sim, hazards);
  for (const fire of hazards.fires) {
    if (!Array.isArray(fire.flames) || fire.flames.length !== 0) fire.flames = [];
    if (!Array.isArray(fire.sparks) || fire.sparks.length !== 0) fire.sparks = [];
    const previous = Array.isArray(fire.smoke) ? fire.smoke : [];
    let next = Array.isArray(fire.smoke) ? null : [];
    let count = 0;
    for (const key in fire.smokeEpisodes) {
      if (!Object.hasOwn(fire.smokeEpisodes, key)) continue;
      const id = Number(key);
      const room = Number.isNaN(id) ? null : cache.byId.get(id);
      if (!room) continue;
      const episode = fire.smokeEpisodes[room.id];
      if (!episode) continue;
      if (!cache.handled.has(room.id)) {
        // gasState also normalizes methane and creates absent gas records.
        // Do it in the first episode's original order, before clearing alerts.
        gasState(sim, room.id);
        setHazardAlert(sim, 'smoke', room.id, null, {}, room);
        cache.handled.add(room.id);
      }
      let record = previous[count];
      if (!exactClearSmokeRecord(record, room, episode)) {
        next ??= previous.slice(0, count);
        record = { excavationId: room.id, x: room.x + room.w / 2, y: room.y,
          level: 0, warningTick: episode.warningTick, damageTick: episode.damageTick };
      }
      if (next) next.push(record);
      count += 1;
    }
    // Preserve old records only when their serialized shape and values match;
    // additions, removals, mutations and changed geometry replace them exactly.
    if (next) fire.smoke = next;
    else if (previous.length !== count) fire.smoke = previous.slice(0, count);
  }
  if (!Array.isArray(hazards.smoke) || hazards.smoke.length !== 0) hazards.smoke = [];
}

function updateFires(sim) {
  const hazards = sim.m5.hazards;
  // With no burning fire, updateFires cannot create a new smoke source.
  const hasBurningFires = hazards.fires.some((fire) => fire.state === 'burning');
  let quiescent = !hasBurningFires;
  for (const state of Object.values(hazards.gas)) {
    state.smoke = Math.max(0, finite(state.smoke, 0) - HAZARDS.FIRE.SMOKE_DISSIPATION_PER_HOUR / TIME.TICKS_PER_HOUR);
    if (state.smoke !== 0) quiescent = false;
  }
  if (quiescent && hazards.fires.every((fire) => fire.smokeEpisodes && typeof fire.smokeEpisodes === 'object')) {
    updateQuiescentFires(sim, hazards);
    return;
  }
  const damageRooms = new Map();

  for (const fire of [...hazards.fires]) {
    const origin = sim.excavation(fire.excavationId);
    if (fire.state === 'burning' && !origin) endFire(sim, fire, 'burnedOut');
    if (fire.state === 'burning') {
      const age = sim.tick - fire.startedTick;
      if (age >= HAZARDS.FIRE.DURATION_TICKS) {
        endFire(sim, fire, 'burnedOut');
        sim.log('info', 'eventFireBurnedOut', { id: fire.excavationId }, origin);
      } else {
        fire.fuel = 1 - age / HAZARDS.FIRE.DURATION_TICKS;
        fire.intensity = Math.min(HAZARDS.FIRE.MAX_INTENSITY,
          HAZARDS.FIRE.BASE_INTENSITY + age / TIME.TICKS_PER_HOUR * HAZARDS.FIRE.INTENSITY_GROWTH_PER_HOUR);
        const volume = roomAirVolume(origin);
        origin.o2 = clamp((origin.o2 ?? AIR.INITIAL_O2)
          - HAZARDS.FIRE.O2_PER_HOUR * fire.intensity / TIME.TICKS_PER_HOUR / volume);
        origin.co2 = clamp((origin.co2 ?? AIR.INITIAL_CO2)
          + HAZARDS.FIRE.CO2_PER_HOUR * fire.intensity / TIME.TICKS_PER_HOUR / volume);
        spreadFire(sim, fire);
      }
    }
    updateFireVisuals(sim, fire);
    fire.smoke = [];
    const rooms = fire.state === 'burning' ? smokeRooms(sim, fire) : Object.keys(fire.smokeEpisodes)
      .map((id) => sim.excavation(Number(id))).filter(Boolean);
    for (const excavation of rooms) {
      if (fire.state === 'burning') openSmokeEpisode(sim, fire, excavation);
      const episode = fire.smokeEpisodes[excavation.id];
      if (!episode) continue;
      const state = gasState(sim, excavation.id);
      if (fire.state === 'burning') {
        const factor = excavation.id === fire.excavationId ? 1 : HAZARDS.FIRE.UPPER_SMOKE_FACTOR;
        const elapsed = Math.max(0, sim.tick - episode.warningTick);
        const produced = Math.min(100, elapsed * HAZARDS.FIRE.SMOKE_PER_HOUR * factor / TIME.TICKS_PER_HOUR);
        state.smoke = Math.max(state.smoke, produced);
        if (sim.tick >= episode.redTick && state.smoke >= HAZARDS.FIRE.SMOKE_RED_LEVEL) {
          setHazardAlert(sim, 'smoke', excavation.id, 'danger', { level: state.smoke }, excavation);
        }
      }
      fire.smoke.push({
        excavationId: excavation.id, x: excavation.x + excavation.w / 2, y: excavation.y,
        level: state.smoke, warningTick: episode.warningTick, damageTick: episode.damageTick,
      });
      if (fire.state === 'burning' && sim.tick >= episode.damageTick && state.smoke >= HAZARDS.FIRE.SMOKE_DAMAGE_LEVEL) {
        if ((damageRooms.get(excavation.id)?.level ?? 0) < state.smoke) {
          damageRooms.set(excavation.id, { fire, excavation, level: state.smoke });
        }
      }
      if (fire.state !== 'burning' && state.smoke <= HAZARDS.FIRE.SMOKE_CLEAR_LEVEL
        && (!hasBurningFires || !anotherActiveSmokeSource(sim, excavation.id, fire.id))) {
        setHazardAlert(sim, 'smoke', excavation.id, null, {}, excavation);
      }
    }
  }

  for (const { fire, excavation, level } of damageRooms.values()) applySmokeDamage(sim, fire, excavation, level);
  hazards.smoke = [];
  for (const key of Object.keys(hazards.gas).sort((a, b) => Number(a) - Number(b))) {
    const excavationId = Number(key);
    const excavation = sim.excavation(excavationId);
    const level = hazards.gas[key].smoke;
    if (!excavation || level <= 0) continue;
    hazards.smoke.push({ excavationId, x: excavation.x + excavation.w / 2, y: excavation.y, level });
  }
}

function consumeExtinguishingWater(sim, amount) {
  const available = sim.stocks.reduce((total, stock) => total + EXTINGUISH_WATER_RESOURCES
    .reduce((sum, resource) => sum + finite(stock.resources[resource], 0), 0), 0);
  if (available + 1e-9 < amount) return false;
  let remaining = amount;
  for (const resource of EXTINGUISH_WATER_RESOURCES) {
    for (const stock of sim.stocks) {
      const taken = Math.min(remaining, finite(stock.resources[resource], 0));
      if (taken > 0) {
        stock.resources[resource] -= taken;
        remaining -= taken;
      }
      if (remaining <= 1e-9) return true;
    }
  }
  return true;
}

export function extinguishFire(sim, order) {
  initializeHazards(sim);
  const fire = order.fireId !== undefined
    ? sim.m5.hazards.fires.find((candidate) => candidate.id === order.fireId && candidate.state === 'burning')
    : burningFire(sim, order.excavationId);
  if (!fire) return { ok: false, error: 'noActiveFire' };
  const amount = HAZARDS.FIRE.EXTINGUISH_WATER_UNITS;
  if (!consumeExtinguishingWater(sim, amount)) return { ok: false, error: 'noResources', required: { water: amount } };
  endFire(sim, fire, 'extinguished');
  fire.waterUsed += amount;
  const excavation = sim.excavation(fire.excavationId);
  sim.log('info', 'eventFireExtinguished', { id: fire.excavationId, amount }, excavation);
  sim.events.push({ type: 'fireExtinguish', tick: sim.tick, fireId: fire.id, excavationId: fire.excavationId, amount });
  return { ok: true, fire, waterUsed: amount };
}

export function applyHazardOrder(sim, order) {
  if (order?.type !== 'fireExtinguish') return null;
  return extinguishFire(sim, order);
}

export function startMethanePocket(sim, excavationId, options = {}) {
  initializeHazards(sim);
  if (typeof excavationId === 'object') {
    options = excavationId;
    excavationId = options.excavationId;
  }
  const excavation = usableRoom(sim, excavationId);
  if (!excavation) return null;
  const x = finite(options.x, excavation.x + excavation.w / 2);
  const y = finite(options.y, excavation.y + excavation.h - 1);
  const existing = sim.m5.hazards.methanePockets.find((pocket) => pocket.excavationId === excavationId
    && pocket.x === x && pocket.y === y && pocket.state !== 'exploded');
  if (existing) return existing;
  const pocket = {
    id: sim.m5.hazards.nextMethanePocketId++,
    excavationId,
    x,
    y,
    source: options.source ?? 'storyteller',
    state: 'open',
    startedTick: sim.tick,
    warningTick: sim.tick,
    redAlertTick: null,
    earliestExplosionTick: sim.tick + HAZARDS.METHANE.MIN_WARNING_TICKS,
    explodedTick: null,
    level: clamp(finite(options.level, HAZARDS.METHANE.INITIAL_LEVEL), 0, HAZARDS.METHANE.MAX_LEVEL),
    remaining: Math.max(0, finite(options.remaining, HAZARDS.METHANE.INITIAL_RESERVOIR)),
    releasePerHour: Math.max(0, finite(options.releasePerHour, HAZARDS.METHANE.RELEASE_PER_HOUR)),
  };
  sim.m5.hazards.methanePockets.push(pocket);
  const gas = gasState(sim, excavationId);
  gas.methane = Math.min(HAZARDS.METHANE.MAX_LEVEL, gas.methane + pocket.level);
  sim.log('warning', 'eventMethanePocket', { id: excavationId, excavationId }, excavation);
  setHazardAlert(sim, 'methane', excavationId, 'warning', { level: Math.round(pocket.level) }, excavation);
  sim.events.push({ type: 'methanePocket', tick: sim.tick, pocketId: pocket.id, excavationId, x, y, level: pocket.level });
  return pocket;
}

function updateMethaneLevels(sim) {
  const hazards = sim.m5.hazards;
  for (const state of Object.values(hazards.gas)) state.methane = 0;
  const levels = new Map();
  const byRoom = new Map();
  for (const pocket of hazards.methanePockets) {
    if (pocket.state === 'exploded') continue;
    pocket.warningTick ??= pocket.startedTick ?? sim.tick;
    pocket.redAlertTick ??= null;
    pocket.earliestExplosionTick ??= pocket.warningTick + HAZARDS.METHANE.MIN_WARNING_TICKS;
    pocket.level = Math.max(0, finite(pocket.level, 0));
    if (pocket.state === 'open') {
      const released = Math.min(pocket.remaining, pocket.releasePerHour / TIME.TICKS_PER_HOUR);
      pocket.level += released;
      pocket.remaining = Math.max(0, pocket.remaining - released);
      if (pocket.remaining <= 0) pocket.state = 'depleted';
    }
    if (!byRoom.has(pocket.excavationId)) byRoom.set(pocket.excavationId, []);
    byRoom.get(pocket.excavationId).push(pocket);
  }
  for (const [excavationId, pockets] of byRoom) {
    const room = sim.excavation(excavationId);
    const total = pockets.reduce((sum, pocket) => sum + pocket.level, 0);
    const clearance = (room?.airSupplyRate > 0 ? HAZARDS.METHANE.VENT_CLEAR_PER_HOUR
      : HAZARDS.METHANE.NATURAL_CLEAR_PER_HOUR) / TIME.TICKS_PER_HOUR;
    const level = Math.max(0, Math.min(HAZARDS.METHANE.MAX_LEVEL, total) - clearance);
    // A room receives one clearance budget, even when it contains several pockets.
    const factor = total > 0 ? level / total : 0;
    for (const pocket of pockets) pocket.level *= factor;
    gasState(sim, excavationId).methane = level;
    levels.set(excavationId, level);
  }
  return levels;
}

function updateDetectors(sim, levels) {
  const hazards = sim.m5.hazards;
  const monitored = new Set();
  hazards.detectors = [];
  for (const detectorRoom of sim.excavations.filter((excavation) => excavation.roomType === 'gasDetector'
    && activeExcavation(excavation)).sort((a, b) => a.id - b.id)) {
    const powered = Boolean(detectorRoom.powered && !detectorRoom.disabled && !detectorRoom.powerShed && !detectorRoom.disabledByFlood);
    const monitoredIds = [detectorRoom.id, ...connectedExcavations(sim, detectorRoom).map((room) => room.id)]
      .filter((id, index, ids) => ids.indexOf(id) === index).sort((a, b) => a - b);
    const readings = monitoredIds.map((excavationId) => ({ excavationId, methane: levels.get(excavationId) ?? 0 }));
    hazards.detectors.push({
      id: `detector-${detectorRoom.id}`, excavationId: detectorRoom.id, powered,
      monitoredIds, readings, maxMethane: readings.reduce((max, reading) => Math.max(max, reading.methane), 0),
      alertLevel: null,
    });
    for (const excavationId of monitoredIds) monitored.add(excavationId);
  }

  for (const excavationId of new Set([...levels.keys(), ...monitored])) {
    const level = levels.get(excavationId) ?? 0;
    const excavation = sim.excavation(excavationId);
    let alert = null;
    if (level >= HAZARDS.METHANE.RED_LEVEL) alert = 'danger';
    else if (level > 0) alert = 'warning';
    setHazardAlert(sim, 'methane', excavationId, alert, { level: Math.round(level) }, excavation);
    if (alert !== 'danger') continue;
    for (const pocket of hazards.methanePockets) {
      if (pocket.excavationId === excavationId && pocket.state !== 'exploded' && pocket.redAlertTick === null) {
        pocket.redAlertTick = sim.tick;
      }
    }
  }
  for (const detector of hazards.detectors) {
    detector.alertLevel = detector.monitoredIds.reduce((highest, excavationId) => {
      const level = hazards.alertLevels[`methane:${excavationId}`] ?? null;
      return LEVEL_RANK[level] > LEVEL_RANK[highest] ? level : highest;
    }, null);
  }
}

function ignitionNear(sim, excavation) {
  const rooms = [excavation, ...nearbyRooms(sim, excavation)];
  const ids = new Set(rooms.map((room) => room.id));
  if (sim.m5.hazards.fires.some((fire) => fire.state === 'burning' && ids.has(fire.excavationId))) return 'flame';
  for (const room of rooms) {
    if (room.disabled || room.disabledByFlood || room.powerShed) continue;
    if (room.roomType === 'forge' && room.powered && activeExcavation(room)) return 'forge';
    if (room.roomType === 'diesel' && room.powered && activeExcavation(room)) return 'generator';
  }
  return null;
}

function updateMethaneExplosions(sim, levels) {
  for (const excavationId of [...levels.keys()].sort((a, b) => a - b)) {
    if (levels.get(excavationId) < HAZARDS.METHANE.EXPLOSION_LEVEL) continue;
    const pockets = sim.m5.hazards.methanePockets.filter((pocket) => pocket.excavationId === excavationId
      && pocket.state !== 'exploded');
    if (pockets.some((pocket) => sim.tick < pocket.earliestExplosionTick
      || pocket.redAlertTick === null || sim.tick <= pocket.redAlertTick)) continue;
    const excavation = sim.excavation(excavationId);
    const ignition = ignitionNear(sim, excavation);
    if (!ignition) continue;
    for (const pocket of pockets) {
      pocket.state = 'exploded';
      pocket.explodedTick = sim.tick;
      pocket.level = 0;
      pocket.remaining = 0;
    }
    gasState(sim, excavationId).methane = 0;
    excavation.integrity = clamp(excavation.integrity - HAZARDS.METHANE.EXPLOSION_INTEGRITY_DAMAGE);
    excavation.machineDamaged = true;
    const level = levels.get(excavationId);
    sim.log('danger', 'eventMethaneExplosion', { id: excavationId, excavationId, ignition, level }, excavation);
    sim.events.push({ type: 'methaneExplosion', tick: sim.tick, excavationId, ignition, level, x: excavation.x + excavation.w / 2, y: excavation.y + excavation.h - 1 });
    setHazardAlert(sim, 'methane', excavationId, null, {}, excavation);
    startFire(sim, excavationId, 'methane');
  }
}

function releasePocketWater(sim, excavation, amount) {
  const cells = [...excavation.dugCells].sort((a, b) => b - a);
  let remaining = amount;
  let released = 0;
  for (const index of cells) {
    if (sim.world.states[index] !== CELL.EMPTY) continue;
    const capacity = WATER.MAX_PER_CELL - sim.world.water[index];
    const added = Math.min(capacity, remaining);
    if (added <= 0) continue;
    if (sim.world.water[index] === 0) sim.world.waterQuality[index] = WATER_QUALITY.dirty;
    else sim.world.waterQuality[index] = Math.max(sim.world.waterQuality[index], WATER_QUALITY.dirty);
    sim.world.water[index] += added;
    remaining -= added;
    released += added;
    if (remaining <= 0) break;
  }
  return released;
}

export function startWaterPocket(sim, excavationId, options = {}) {
  initializeHazards(sim);
  if (typeof excavationId === 'object') {
    options = excavationId;
    excavationId = options.excavationId;
  }
  const excavation = usableRoom(sim, excavationId);
  if (!excavation || excavation.coating === 'waterproof') return null;
  const x = finite(options.x, excavation.x + excavation.w / 2);
  const y = finite(options.y, excavation.y + excavation.h - 1);
  const existing = sim.m5.hazards.waterPockets.find((pocket) => pocket.excavationId === excavationId
    && (options.source === 'digCell' || pocket.state === 'seeping'));
  if (existing) return existing;
  const warningTicks = Math.max(HAZARDS.WATER_POCKET.MIN_WARNING_TICKS,
    Math.floor(finite(options.warningTicks, HAZARDS.WATER_POCKET.DEFAULT_WARNING_TICKS)));
  const pocket = {
    id: sim.m5.hazards.nextWaterPocketId++,
    excavationId,
    x,
    y,
    source: options.source ?? 'storyteller',
    state: 'seeping',
    startedTick: sim.tick,
    redTick: sim.tick + warningTicks - HAZARDS.WATER_POCKET.RED_LEAD_TICKS,
    breachTick: sim.tick + warningTicks,
    breachedTick: null,
    seepCount: 0,
    released: 0,
    breachAmount: 0,
    volume: Math.max(0, Math.floor(Number.isFinite(options.volume) ? options.volume
      : sim.rng.int(HAZARDS.WATER_POCKET.MIN_VOLUME, HAZARDS.WATER_POCKET.MAX_VOLUME))),
    level: roomWaterRatio(sim, excavation),
  };
  sim.m5.hazards.waterPockets.push(pocket);
  sim.log('warning', 'eventWaterSeep', { id: excavationId }, excavation);
  sim.events.push({ type: 'waterSeep', tick: sim.tick, pocketId: pocket.id, excavationId, x, y, breachTick: pocket.breachTick });
  setHazardAlert(sim, 'water', excavationId, 'warning', { breachTick: pocket.breachTick }, excavation);
  return pocket;
}

function updateWaterPockets(sim) {
  for (const pocket of sim.m5.hazards.waterPockets) {
    const excavation = sim.excavation(pocket.excavationId);
    if (!excavation) continue;
    // Old saves retain their released water; only unopened reservoirs need a default.
    pocket.volume ??= pocket.state === 'seeping' ? HAZARDS.WATER_POCKET.DEFAULT_VOLUME : pocket.released;
    if (pocket.state === 'seeping') {
      if (excavation.coating === 'waterproof') {
        pocket.state = 'sealed';
        setHazardAlert(sim, 'water', excavation.id, null, {}, excavation);
        continue;
      }
      if (sim.tick >= pocket.redTick) setHazardAlert(sim, 'water', excavation.id, 'danger', {}, excavation);
      const dueSeeps = Math.min(HAZARDS.WATER_POCKET.MAX_SEEPS,
        Math.floor((sim.tick - pocket.startedTick) / HAZARDS.WATER_POCKET.SEEP_INTERVAL_TICKS));
      while (pocket.seepCount < dueSeeps) {
        pocket.released += releasePocketWater(sim, excavation,
          Math.min(HAZARDS.WATER_POCKET.SEEP_UNITS, Math.max(0, pocket.volume - pocket.released)));
        pocket.seepCount += 1;
      }
      if (sim.tick >= pocket.breachTick) {
        pocket.state = 'breached';
        pocket.breachedTick = sim.tick;
        pocket.breachAmount = releasePocketWater(sim, excavation,
          Math.max(0, pocket.volume - pocket.released));
        pocket.released += pocket.breachAmount;
        setHazardAlert(sim, 'water', excavation.id, 'danger', {}, excavation);
        sim.log('danger', 'eventWaterPocketBreach', { id: excavation.id, amount: pocket.breachAmount }, excavation);
        sim.events.push({
          type: 'waterPocketBreach', tick: sim.tick, pocketId: pocket.id, excavationId: excavation.id,
          amount: pocket.breachAmount, x: pocket.x, y: pocket.y,
        });
      }
    }
    if (pocket.state === 'breached' && pocket.released < pocket.volume) {
      pocket.released += releasePocketWater(sim, excavation, pocket.volume - pocket.released);
    }
    pocket.level = roomWaterRatio(sim, excavation);
    if (pocket.state === 'breached' && pocket.level < WATER.WADING_MIN_RATIO) {
      setHazardAlert(sim, 'water', excavation.id, null, {}, excavation);
    }
  }
}

function isGuard(sim, colonist) {
  if (colonist.health <= 0 || colonist.dead || colonist.surfaceCrewId) return false;
  if (['guard', 'lookout'].includes(colonist.role) || ['guard', 'lookout'].includes(colonist.duty)
    || ['guard', 'lookout'].includes(colonist.task) || colonist.job === 'guard'
    || colonist.personal?.type === 'guard' || colonist.priorities?.guard === 0) return true;
  return sim.jobs.some((job) => job.type === 'guard' && job.colonistId === colonist.id
    && !['done', 'cancelled'].includes(job.status));
}

function raidDefense(sim) {
  const lookouts = (sim.surface?.structures ?? []).filter((structure) => structure.type === 'lookout' && structure.state === 'built').length;
  const guards = sim.colonists.filter((colonist) => isGuard(sim, colonist)).length;
  const hatch = surfaceHatch(sim).door;
  const closed = hatch?.open === false;
  const armored = Boolean(hatch && (hatch.armored || hatch.reinforced || hatch.kind === 'armoredHatch'));
  const camouflage = Boolean(sim.surface?.camouflage || (sim.surface?.camouflageLevel ?? 0) > 0
    || (sim.surface?.structures ?? []).some((structure) => structure.type === 'camouflage' && structure.state === 'built'));
  const weapons = sim.stocks.reduce((total, stock) => total + (stock.resources.weapons ?? 0), 0);
  const parts = {
    weapons: weapons * HAZARDS.RAIDERS.WEAPON_DEFENSE,
    lookout: lookouts * HAZARDS.RAIDERS.LOOKOUT_DEFENSE,
    guards: guards * HAZARDS.RAIDERS.GUARD_DEFENSE,
    door: hatch ? HAZARDS.RAIDERS.DOOR_DEFENSE : 0,
    closedDoor: closed ? HAZARDS.RAIDERS.CLOSED_DOOR_DEFENSE : 0,
    armoredDoor: armored ? HAZARDS.RAIDERS.ARMORED_DOOR_DEFENSE : 0,
    camouflage: camouflage ? HAZARDS.RAIDERS.CAMOUFLAGE_DEFENSE : 0,
  };
  parts.total = Object.values(parts).reduce((sum, value) => sum + value, 0);
  return parts;
}

export function startRaiders(sim, options = {}) {
  initializeHazards(sim);
  const hazards = sim.m5.hazards;
  const hatch = surfaceHatch(sim);
  const count = clamp(Math.floor(finite(options.count,
    sim.rng.int(HAZARDS.RAIDERS.DEFAULT_MIN_COUNT, HAZARDS.RAIDERS.DEFAULT_MAX_COUNT))),
  HAZARDS.RAIDERS.MIN_COUNT, HAZARDS.RAIDERS.MAX_COUNT);
  const approachTicks = Math.max(HAZARDS.RAIDERS.MIN_APPROACH_TICKS,
    Math.floor(finite(options.approachTicks, HAZARDS.RAIDERS.DEFAULT_APPROACH_TICKS)));
  const direction = options.side === 'left' ? -1 : 1;
  const annex = sim.m5.poi?.annexes?.find((candidate) => candidate.type === 'sewer' && candidate.exploredCount > 0
    && (!options.originAnnexId || candidate.id === options.originAnnexId));
  const spawnX = annex ? annex.worldEntry.x : clamp(finite(options.x, hatch.x + direction * HAZARDS.RAIDERS.SPAWN_DISTANCE), 0, sim.world.width - 1);
  const spawnY = annex ? annex.worldEntry.y : hatch.y - 1;
  const route = annex ? [{ x: spawnX, y: spawnY },
    ...findPath(sim, { x: spawnX, y: spawnY }, { x: hatch.x, y: hatch.y }).map(({ x, y }) => ({ x, y }))] : null;
  const tunnel = annex && route.length < 2;
  if (tunnel) {
    for (let x = spawnX; x !== hatch.x; x += Math.sign(hatch.x - x)) route.push({ x, y: spawnY });
    route.push({ x: hatch.x, y: spawnY });
    for (let y = spawnY; y !== hatch.y; y += Math.sign(hatch.y - y)) route.push({ x: hatch.x, y });
  }
  const raid = {
    id: hazards.nextRaidId++,
    state: 'approaching',
    origin: annex ? 'sewer' : 'surface',
    originAnnexId: annex?.id ?? null,
    spawnY,
    route,
    tunnel,
    tunnelCells: [],
    outcome: null,
    startedTick: sim.tick,
    redTick: sim.tick + approachTicks - HAZARDS.RAIDERS.RED_LEAD_TICKS,
    breachTick: sim.tick + approachTicks,
    resolvedTick: null,
    retreatEndTick: null,
    spawnX,
    targetX: hatch.x,
    targetY: hatch.y,
    count,
    attack: count * HAZARDS.RAIDERS.ATTACK_PER_RAIDER,
    actorIds: [],
    defense: null,
    stolen: {},
    injuryCount: 0,
    moraleLoss: 0,
  };
  hazards.raids.push(raid);
  for (let index = 0; index < count; index += 1) {
    const actor = {
      id: hazards.nextRaiderId++, raidId: raid.id, kind: 'raider',
      x: spawnX + index * HAZARDS.RAIDERS.ACTOR_SPACING, y: spawnY,
      state: 'approaching', health: 100,
    };
    raid.actorIds.push(actor.id);
    hazards.raiders.push(actor);
  }
  sim.log('warning', annex ? 'eventRaidersSewerApproach' : 'eventRaidersApproach', { count }, { x: spawnX, y: spawnY, w: 1, h: 1 });
  sim.events.push({ type: 'raidersApproach', tick: sim.tick, raidId: raid.id, count, breachTick: raid.breachTick, x: spawnX, y: spawnY, origin: raid.origin });
  setHazardAlert(sim, 'raiders', raid.id, 'warning', { count }, { x: hatch.x, y: hatch.y, w: 1, h: 1 });
  return raid;
}

function stealForRaid(sim, raid, deficit) {
  let remaining = deficit * HAZARDS.RAIDERS.THEFT_PER_DEFICIT;
  for (const resource of RAID_THEFT_RESOURCES) {
    for (const stock of sim.stocks) {
      const taken = Math.min(remaining, finite(stock.resources[resource], 0));
      if (taken <= 0) continue;
      stock.resources[resource] -= taken;
      raid.stolen[resource] = (raid.stolen[resource] ?? 0) + taken;
      recordReserveShift(sim, resource, -taken);
      remaining -= taken;
      if (remaining <= 0) return;
    }
  }
}

function injureForRaid(sim, raid, deficit) {
  const victims = sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead && !colonist.surfaceCrewId)
    .sort((a, b) => Number(isGuard(sim, b)) - Number(isGuard(sim, a)) || a.id - b.id)
    .slice(0, deficit);
  for (const colonist of victims) {
    colonist.health = Math.max(1, colonist.health - HAZARDS.RAIDERS.INJURY_DAMAGE);
    colonist.injured = true;
    colonist.injuries ??= [];
    colonist.injuries.push({ type: 'raiders', recovery: 0, raidId: raid.id });
    colonist.lastDamageCauses = ['raiders'];
    raid.injuryCount += 1;
    sim.events.push({
      type: 'injury', tick: sim.tick, colonistId: colonist.id, injury: 'raiders', raidId: raid.id,
      amount: HAZARDS.RAIDERS.INJURY_DAMAGE, x: colonist.x, y: colonist.y,
    });
  }
}

function lowerMoraleForRaid(sim, raid) {
  for (const colonist of sim.colonists) {
    if (colonist.health <= 0 || colonist.dead) continue;
    colonist.morale = clamp(colonist.morale - HAZARDS.RAIDERS.MORALE_LOSS);
    if (Number.isFinite(colonist.moraleValue)) colonist.moraleValue = clamp(colonist.moraleValue - HAZARDS.RAIDERS.MORALE_LOSS);
    colonist.moraleEvents ??= [];
    colonist.moraleEvents.push({
      type: 'raid', code: 'raid', sourceId: raid.id, value: -HAZARDS.RAIDERS.MORALE_LOSS,
      tick: sim.tick, startTick: sim.tick, until: sim.tick + HAZARDS.RAIDERS.MORALE_DURATION_TICKS,
      duration: HAZARDS.RAIDERS.MORALE_DURATION_TICKS,
    });
  }
  raid.moraleLoss = HAZARDS.RAIDERS.MORALE_LOSS;
}

function resolveRaid(sim, raid) {
  raid.resolvedTick = sim.tick;
  raid.defense = raidDefense(sim);
  const deficit = Math.max(0, raid.attack - raid.defense.total);
  raid.outcome = deficit === 0 ? 'repelled' : 'breached';
  raid.state = 'retreating';
  raid.retreatEndTick = sim.tick + HAZARDS.RAIDERS.RETREAT_TICKS;
  for (const actor of sim.m5.hazards.raiders.filter((candidate) => candidate.raidId === raid.id)) actor.state = 'retreating';
  if (deficit === 0) {
    sim.log('info', 'eventRaidersRepelled', { defense: raid.defense.total, attack: raid.attack });
    setHazardAlert(sim, 'raiders', raid.id, null);
  } else {
    stealForRaid(sim, raid, deficit);
    injureForRaid(sim, raid, deficit);
    lowerMoraleForRaid(sim, raid);
    const stolen = Object.values(raid.stolen).reduce((sum, amount) => sum + amount, 0);
    sim.log('danger', 'eventRaidersBreach', {
      defense: raid.defense.total, attack: raid.attack, stolen, injuries: raid.injuryCount,
    });
  }
  sim.events.push({
    type: 'raidResolved', tick: sim.tick, raidId: raid.id, outcome: raid.outcome,
    defense: raid.defense.total, attack: raid.attack, stolen: { ...raid.stolen }, injuries: raid.injuryCount,
  });
}

function raidPosition(raid, progress) {
  if (!raid.route || raid.route.length < 2) {
    return { x: raid.spawnX + (raid.targetX - raid.spawnX) * progress, y: raid.spawnY + (raid.targetY - raid.spawnY) * progress };
  }
  const position = progress * (raid.route.length - 1);
  const index = Math.min(raid.route.length - 2, Math.floor(position));
  const fraction = position - index;
  const from = raid.route[index];
  const to = raid.route[index + 1];
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

function carveRaidTunnel(sim, raid, progress) {
  if (!raid.tunnel) return;
  const reached = Math.min(raid.route.length - 1, Math.floor(progress * (raid.route.length - 1)));
  for (let index = 1; index <= reached; index += 1) {
    const { x, y } = raid.route[index];
    if (sim.world.isEmpty(x, y)) continue;
    sim.world.setCell(x, y, MATERIAL.AIR, CELL.EMPTY, -1);
    sim.world.reveal(x, y);
    raid.tunnelCells.push({ x, y });
    sim.events.push({ type: 'raiderTunnel', tick: sim.tick, raidId: raid.id, x, y });
    sim.structureDirty = true;
  }
}

function updateRaiders(sim) {
  const hazards = sim.m5.hazards;
  for (const raid of hazards.raids) {
    const actors = hazards.raiders.filter((actor) => actor.raidId === raid.id);
    if (raid.state === 'approaching') {
      const progress = clamp((sim.tick - raid.startedTick) / (raid.breachTick - raid.startedTick), 0, 1);
      carveRaidTunnel(sim, raid, progress);
      const position = raidPosition(raid, progress);
      for (let index = 0; index < actors.length; index += 1) {
        const actor = actors[index];
        actor.x = position.x + index * HAZARDS.RAIDERS.ACTOR_SPACING * (1 - progress);
        actor.y = position.y;
      }
      if (sim.tick >= raid.redTick) setHazardAlert(sim, 'raiders', raid.id, 'danger', { count: raid.count });
      if (sim.tick >= raid.breachTick) resolveRaid(sim, raid);
    } else if (raid.state === 'retreating') {
      const progress = clamp((sim.tick - raid.resolvedTick) / HAZARDS.RAIDERS.RETREAT_TICKS, 0, 1);
      const position = raidPosition(raid, 1 - progress);
      for (const actor of actors) Object.assign(actor, position);
      if (sim.tick >= raid.retreatEndTick) {
        raid.state = 'gone';
        for (const actor of actors) actor.state = 'gone';
        setHazardAlert(sim, 'raiders', raid.id, null);
      }
    }
  }
  hazards.raiders = hazards.raiders.filter((actor) => actor.state !== 'gone');
}

function processDigCellEvents(sim) {
  const hazards = sim.m5.hazards;
  for (const event of sim.events) {
    if (event.type !== 'digCell') continue;
    const key = `${event.tick}:${event.excavationId}:${event.x}:${event.y}`;
    if (hazards.processedDigEvents.includes(key)) continue;
    hazards.processedDigEvents.push(key);
    const options = { x: event.x, y: event.y, source: 'digCell' };
    if ((event.yields?.coal ?? 0) > 0 && sim.rng.chance(HAZARDS.METHANE.DIG_CHANCE)) {
      startMethanePocket(sim, event.excavationId, options);
    }
    const excavation = sim.excavation(event.excavationId);
    if (event.materialId === MATERIAL.AIR
      || (event.materialId === undefined && !Object.values(event.yields ?? {}).some((amount) => amount > 0))) continue;
    if (!excavation || hazards.waterPockets.some((pocket) => pocket.excavationId === excavation.id)) continue;
    // One saved draw per excavation. A later, more permeable contact can reveal
    // the same reservoir, but opening more cells never buys another random draw.
    const contacts = [event.materialId];
    for (const [x, y] of [[event.x - 1, event.y], [event.x + 1, event.y],
      [event.x, event.y - 1], [event.x, event.y + 1]]) {
      if (sim.world.inBounds(x, y) && sim.world.isSolid(x, y)) contacts.push(sim.world.material(x, y));
    }
    const chance = contacts.reduce((highest, material) => [MATERIAL.SAND, MATERIAL.SANDSTONE, MATERIAL.LIMESTONE].includes(material)
      ? Math.max(highest, materialAt(material).permeability * HAZARDS.WATER_POCKET.DIG_PERMEABILITY_CHANCE) : highest, 0);
    if (chance <= 0) continue;
    excavation.waterPocketRoll ??= sim.rng.next();
    if (excavation.waterPocketRoll < chance) startWaterPocket(sim, excavation.id, options);
  }
  if (hazards.processedDigEvents.length > HAZARDS.EVENTS.PROCESSED_DIG_LIMIT) {
    hazards.processedDigEvents.splice(0, hazards.processedDigEvents.length - HAZARDS.EVENTS.PROCESSED_DIG_LIMIT);
  }
}

export function updateHazards(sim) {
  initializeHazards(sim);
  if (sim.scenario !== 'm5-demo') processDigCellEvents(sim);
  updateFires(sim);
  const methaneLevels = updateMethaneLevels(sim);
  updateDetectors(sim, methaneLevels);
  updateMethaneExplosions(sim, methaneLevels);
  updateWaterPockets(sim);
  updateRaiders(sim);
  rebuildAlerts(sim);
}

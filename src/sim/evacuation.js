import { AIR, HEAT, WATER, WORLD } from '../data/balance.js';
import { EVACUATION } from '../data/evacuation.js';
import { ROOM_DEFS } from '../data/rooms.js';
import { findPath, isWalkable, rebuildNav } from './nav.js';
import { excavationAt, insideExcavation } from './networks.js';
import { headSubmerged, waterRatioAt } from './immersion.js';
import { isRescueJob, releaseJob } from './jobs.js';

const alive = person => !person.dead && person.health > 0;

export function roomRedDanger(sim, room) {
  if (!room || room.state === 'collapsed') return false;
  if ((room.structuralAlertLevel ?? (Number.isInteger(room.alertLevel) ? room.alertLevel : 0)) >= 3) return true;
  if (Object.entries(room.alertLevels ?? {}).some(([key, value]) => key !== 'rescue' && value === 'danger')) return true;
  if (['air', 'cold', 'heat', 'flood'].some(key => room[key + 'AlertLevel'] === 'danger')) return true;
  return ['smoke', 'water', 'methane'].some(key => sim.m5?.hazards?.alertLevels?.[`${key}:${room.id}`] === 'danger');
}

export function evacuatedAt(sim, x, y) {
  if (!sim.evacuationCount) return null;
  return sim.excavations.find(room => room.evacuation && insideExcavation(sim, room, x, y)) ?? null;
}

export function jobEvacuated(sim, job) {
  if (!sim.evacuationCount || !job) return false;
  if (sim.excavation(job.excavationId)?.evacuation) return true;
  return [job.sourceStockId, job.targetStockId, job.destinationStockId, job.stockId].some(id => {
    const stock = id == null ? null : sim.stocks.find(item => item.id === id);
    return stock && (sim.excavation(stock.excavationId)?.evacuation || evacuatedAt(sim, stock.x, stock.y));
  });
}

function cannotWalk(person) {
  // Babies already walk in the existing simulation, as do living patients.
  return person.trappedIn != null;
}

function safeRoom(sim, room) {
  return room && ['dug', 'fitted'].includes(room.state) && !room.evacuation && !roomRedDanger(sim, room)
    && (room.temperature ?? HEAT.INITIAL_ROOM) >= HEAT.DANGER_MIN
    && (room.temperature ?? HEAT.INITIAL_ROOM) < HEAT.DANGER_MAX
    && (room.o2 ?? 100) > AIR.DANGER_O2 && (room.co2 ?? 0) < AIR.DANGER_CO2
    && (room.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO
    && !sim.m5?.hazards?.fires?.some(fire => fire.excavationId === room.id && fire.state === 'burning');
}

function refugeTargets(sim, source) {
  const targets = [];
  const nav = rebuildNav(sim);
  for (const room of sim.excavations) {
    if (room === source || !safeRoom(sim, room)) continue;
    for (const index of room.dugCells ?? []) {
      if (!nav.walkable[index]) continue;
      const point = sim.world.coords(index);
      if (point.y >= WORLD.SURFACE_Y && !insideExcavation(sim, source, point.x, point.y)
        && !headSubmerged(sim, point.x, point.y)) targets.push(point);
    }
  }
  return targets;
}

export function evacuationStepAllowed(sim, source, x, y) {
  if (source && insideExcavation(sim, source, x, y)) return true;
  const room = excavationAt(sim, x, y);
  return y >= WORLD.SURFACE_Y && !headSubmerged(sim, x, y)
    && (!room || safeRoom(sim, room));
}

export function evacuationPath(sim, person, source) {
  const targets = refugeTargets(sim, source);
  return findPath(sim, person, targets, undefined, undefined, {
    evacuationSource: source.id,
    allowed: (x, y) => evacuationStepAllowed(sim, source, x, y),
    cost: (x, y) => {
      const room = excavationAt(sim, x, y);
      const warned = room && ((room.structuralAlertLevel ?? 0) > 0
        || Object.values(room.alertLevels ?? {}).includes('warning'));
      return (warned ? EVACUATION.WARNING_PATH_COST : 0)
        + waterRatioAt(sim, x, y) * EVACUATION.WARNING_PATH_COST;
    },
  });
}

function emergencyExitPath(sim, person, source) {
  const targets = [];
  const nav = rebuildNav(sim);
  for (let index = WORLD.SURFACE_Y * sim.world.width; index < nav.walkable.length; index++) {
    if (!nav.walkable[index]) continue;
    const point = sim.world.coords(index);
    if (!insideExcavation(sim, source, point.x, point.y)) targets.push(point);
  }
  // A dangerous route is still preferable to trapping people at the door.
  return findPath(sim, person, targets, undefined, undefined, { evacuationSource: source.id });
}

function roomOccupants(sim, room) {
  return sim.colonists.filter(person => alive(person) && insideExcavation(sim, room, person.x, person.y));
}

function essentialSupplies(sim, room) {
  const result = [];
  const category = ROOM_DEFS[room.roomType]?.category;
  for (const key of ['food', 'water']) {
    const holds = stock => key === 'food' ? (stock.resources?.food ?? 0) + (stock.resources?.meals ?? 0) > 0
      : (stock.resources?.waterClean ?? 0) > 0;
    const belongs = stock => stock.excavationId === room.id || insideExcavation(sim, room, stock.x, stock.y);
    const serves = category === key || sim.stocks.some(stock => belongs(stock) && holds(stock));
    const alternative = sim.excavations.some(other => other !== room && !other.evacuation
      && ['dug', 'fitted'].includes(other.state) && ROOM_DEFS[other.roomType]?.category === key)
      || sim.stocks.some(stock => !belongs(stock) && !sim.excavation(stock.excavationId)?.evacuation && holds(stock));
    if (serves && !alternative) result.push(key);
  }
  return result;
}

export function evacuationStatus(sim, room) {
  const active = Boolean(room?.evacuation);
  const occupants = room ? roomOccupants(sim, room) : [];
  const available = room && ['dug', 'fitted', 'digging'].includes(room.state);
  let canEvacuate = Boolean(available);
  let error = canEvacuate ? null : 'evacuationUnavailable';
  if (canEvacuate && !active) {
    const mobile = occupants.filter(person => !cannotWalk(person) && person.carriedBy == null);
    const origins = mobile.length ? mobile : (room.dugCells ?? []).map(index => sim.world.coords(index))
      .filter(point => isWalkable(sim, point.x, point.y));
    const paths = origins.map(person => evacuationPath(sim, person, room).length > 0);
    canEvacuate = mobile.length ? paths.every(Boolean) : paths.some(Boolean);
    if (!canEvacuate) error = 'evacuationNoSafePlace';
  }
  return { active, automatic: Boolean(room?.evacuation?.automatic), red: roomRedDanger(sim, room),
    immobileNames: occupants.filter(person => cannotWalk(person) || active && person.carriedBy == null
      && !evacuationPath(sim, person, room).length && !emergencyExitPath(sim, person, room).length).map(person => person.name),
    essential: room ? essentialSupplies(sim, room) : [], canEvacuate, error };
}

function interrupt(sim, person) {
  if (person.jobId != null) {
    const job = sim.jobs.find(item => item.id === person.jobId);
    if (person.carrying && job) {
      // A carried load stays physical and belongs to its interrupted haul.
      // Keep the paid job and phase; restore the same carrier after reopening.
      job.status = 'suspended';
      person.evacuationJobId = job.id;
      person.jobId = null;
    } else releaseJob(sim, person);
  }
  person.personal = null;
  person.idleActivity = null;
  if (person.activity?.type !== 'carryingChild') delete person.activity;
  else person.evacuationCarryingChild = true;
  delete person.celebration;
  person.path = [];
  person.pathIndex = 0;
  person.pathGoal = null;
  person.task = 'idle';
  person.needRetryTick = 0;
}

export function evacuateRoom(sim, room) {
  const status = evacuationStatus(sim, room);
  if (status.active) return { ok: true };
  if (!status.canEvacuate) return { ok: false, error: status.error };
  room.evacuation = { startedTick: sim.tick, automatic: status.red };
  sim.evacuationCount = (sim.evacuationCount ?? 0) + 1;
  for (const person of sim.colonists) {
    if (!alive(person)) continue;
    if (isRescueJob(sim, sim.jobs.find(job => job.id === person.jobId))) continue;
    const inside = insideExcavation(sim, room, person.x, person.y);
    const future = person.path?.slice(person.pathIndex ?? 0).some(point => insideExcavation(sim, room, point.x, point.y));
    if (inside || future || person.personal?.excavationId === room.id
      || jobEvacuated(sim, sim.jobs.find(job => job.id === person.jobId))) interrupt(sim, person);
    if (inside && person.carriedBy == null) {
      person.evacuationFrom = room.id;
      if (!cannotWalk(person)) prepareEscape(sim, person, room);
    }
  }
  sim.rescueRelationsEnabled = true;
  sim.log('warning', 'eventEvacuationStarted', { id: room.id, excavationId: room.id, automatic: status.red }, room);
  return { ok: true };
}

function clearEvacuation(sim, room) {
  delete room.evacuation;
  sim.evacuationCount = Math.max(0, (sim.evacuationCount ?? 1) - 1);
  for (const person of sim.colonists) {
    if (person.evacuationFrom === room.id) {
      delete person.evacuationFrom;
      delete person.evacuationRetryTick;
      delete person.evacuationFallback;
      person.path = [];
      person.pathIndex = 0;
      person.pathGoal = null;
    }
  }
}

export function cancelEvacuation(sim, room, automatic = false) {
  if (!room?.evacuation) return { ok: false, error: 'evacuationUnavailable' };
  clearEvacuation(sim, room);
  resumeCarriedJobs(sim);
  sim.log('info', 'eventEvacuationEnded', { id: room.id, excavationId: room.id, automatic }, room);
  return { ok: true };
}

function putDownEvacuatedLoad(sim, person, job) {
  const load = person.carrying;
  if (!load || !job) return;
  const stock = { id: `evacuation-${job.id}-${sim.tick}`, x: Math.round(person.x), y: Math.round(person.y),
    resources: { [load.resource]: load.amount } };
  sim.stocks.push(stock);
  // Continue the same delivery from its new physical pickup point. In
  // particular, do not strand a thirsty carrier holding a load for days.
  job.type = 'stockHaul';
  job.sourceStockId = stock.id;
  job.destinationStockId ??= job.stockId;
  job.resource = load.resource;
  job.amount = load.amount;
  job.phase = 'pickup';
  job.status = 'queued';
  job.colonistId = null;
  person.carrying = null;
  delete person.evacuationJobId;
}

function resumeCarriedJobs(sim) {
  for (const person of sim.colonists) {
    if (person.evacuationJobId == null) continue;
    const job = sim.jobs.find(item => item.id === person.evacuationJobId);
    if (job && person.carrying && (!alive(person) || !evacuatedAt(sim, person.x, person.y))) {
      putDownEvacuatedLoad(sim, person, job);
      continue;
    }
    if (jobEvacuated(sim, job) || evacuatedAt(sim, person.x, person.y)) continue;
    delete person.evacuationJobId;
    if (!job) continue;
    person.jobId = job.id;
    job.colonistId = person.id;
    job.status = 'active';
    person.path = [];
    person.pathIndex = 0;
    person.pathGoal = null;
    if (!alive(person)) releaseJob(sim, person);
  }
}

export function restoreEvacuations(sim) {
  const count = sim.excavations.filter(room => room.evacuation).length;
  if (count) sim.evacuationCount = count;
}

export function updateEvacuations(sim) {
  if (!sim.evacuationCount) return;
  for (const room of sim.excavations) {
    if (room.evacuation && room.state === 'collapsed') clearEvacuation(sim, room);
    else if (room.evacuation?.automatic && !roomRedDanger(sim, room)) {
      cancelEvacuation(sim, room, true);
    }
  }
  resumeCarriedJobs(sim);
}

function prepareEscape(sim, person, room) {
  person.path = evacuationPath(sim, person, room);
  delete person.evacuationFallback;
  if (!person.path.length) {
    person.path = emergencyExitPath(sim, person, room);
    if (person.path.length) person.evacuationFallback = true;
  }
  person.pathIndex = 0;
  person.pathGoal = 'evacuate';
  person.navRevision = sim.world.revision;
  person.evacuationRetryTick = sim.tick + EVACUATION.RETRY_TICKS;
  person.targetX = person.path.at(-1)?.x ?? null;
  person.targetY = person.path.at(-1)?.y ?? null;
}

// The colonist update moves this path with its usual speed, gravity and child
// carrying rules. This function never teleports or changes health/needs.
export function prepareEvacuationMove(sim, person) {
  if (!sim.evacuationCount && person.evacuationFrom == null) return false;
  const job = sim.jobs.find(item => item.id === person.jobId);
  if (isRescueJob(sim, job)) {
    delete person.evacuationFrom;
    delete person.evacuationRetryTick;
    delete person.evacuationFallback;
    return false;
  }
  const destination = person.path?.at(-1);
  if (person.evacuationFrom == null && person.pathGoal !== 'evacuate'
    && person.pathIndex < person.path.length && destination && !evacuatedAt(sim, destination.x, destination.y)) return false;
  const room = sim.excavation(person.evacuationFrom) ?? evacuatedAt(sim, person.x, person.y);
  if (!room?.evacuation) {
    delete person.evacuationFrom;
    delete person.evacuationRetryTick;
    delete person.evacuationFallback;
    return false;
  }
  if (!insideExcavation(sim, room, person.x, person.y)) {
    delete person.evacuationFrom;
    delete person.evacuationRetryTick;
    delete person.evacuationFallback;
    person.path = [];
    person.pathIndex = 0;
    person.pathGoal = null;
    return false;
  }
  person.evacuationFrom = room.id;
  if (cannotWalk(person)) {
    person.task = 'sit';
    return true;
  }
  const next = person.path?.[person.pathIndex ?? 0];
  if (person.navRevision !== sim.world.revision
    || next && !isWalkable(sim, next.x, next.y)
    || person.pathGoal === 'evacuate' && !person.evacuationFallback && next && !evacuationStepAllowed(sim, room, next.x, next.y)
    || (person.pathGoal !== 'evacuate' || !next) && sim.tick >= (person.evacuationRetryTick ?? 0)) {
    interrupt(sim, person);
    prepareEscape(sim, person, room);
  }
  return person.pathGoal === 'evacuate' && person.pathIndex < person.path.length;
}

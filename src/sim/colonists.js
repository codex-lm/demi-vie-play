import { evacuatedAt, evacuationStepAllowed, prepareEvacuationMove } from './evacuation.js';
import { AFFLICTIONS, AIR, CULTIVATION, HEAT, NEEDS, TIME, WATER, WORK, WORLD } from '../data/balance.js';
import { M6 } from '../data/m6.js';
import { PEOPLE } from '../data/people.js';
import { consumptionFactor } from './people.js';
import { NAMES } from '../data/strings.fr.js';
import { canWork, getJob, getJobTask, isLifeSupportJob, isRescueJob, performJob, releaseJob } from './jobs.js';
import { isEligibleForWork, schoolRoomFor } from './lifecycle.js';
import { lawEffect, lawMultiplier } from './laws.js';
import { researchEffect } from './research.js';
import { COATINGS } from '../data/linings.js';
import { ROOM_DEFS } from '../data/rooms.js';
import { findPath, isWalkable, isWalkableIn, navigationComponent, navigationTargets, rebuildNav } from './nav.js';
import { excavationAt, insideExcavation } from './networks.js';
import { coldDamagePerHour, colonistFeltTemperature, temperatureComfort } from './heat.js';
import { clearActivity, hasCriticalNeed, updateCelebration, usableActivityRoom } from './activities.js';
import { hasInfection, infirmaryHealerPresent, updateNaturalRecovery } from './afflictions.js';
import { addToStock, nearestStock, spendableAmount, spendResources, stockNavigationTargets, stockReachable } from './resources.js';
import { surfaceHatch } from './surface.js';
import { recordDeath } from './causes.js';
import { recordMealNarrative } from './journalNarrative.js';
import { findFloodEscape, headSubmerged, waterRatioAt } from './immersion.js';
import { floodDamageReady, noteDirtyWater, updateSuddenImmersion } from './alerts.js';
import { rescueCutOffRoom, resumeRoomRescue, roomReconnected, roomRescueEnded } from './collapseRescue.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function createInitialColonists(spawn) {
  return Array.from({ length: 12 }, (_, id) => ({
    id,
    bedIndex: id,
    bedX: spawn.x + id % 4,
    bedY: spawn.y - Math.floor(id / 4),
    restX: spawn.x + id,
    restY: spawn.y,
    x: spawn.x + id % 5,
    y: spawn.y,
    prevX: spawn.x + id % 5,
    prevY: spawn.y,
    name: `${NAMES.given[id % NAMES.given.length]} ${NAMES.family[(id * 7 + 3) % NAMES.family.length]}`,
    health: 100,
    hunger: 0,
    thirst: 0,
    sleep: 0,
    warmth: 100,
    air: 100,
    light: 100,
    social: 100,
    intimacy: 100,
    purpose: 100,
    morale: NEEDS.INITIAL_MORALE,
    injuries: [],
    diseases: [],
    dose: 0,
    dead: false,
    task: 'idle',
    jobId: null,
    personal: null,
    needRetryTick: 0,
    carrying: null,
    idleReason: null,
    idleActivity: null,
    skills: {
      dig: 1 + id % 4, build: 1 + (id + 1) % 4, farm: 1 + (id + 2) % 4,
      medic: 1 + id % 3, tech: 1 + (id + 3) % 4, cook: 1 + (id + 1) % 4,
      scout: 1, teach: 1,
    },
    path: [],
    pathIndex: 0,
    pathGoal: null,
    navRevision: -1,
    targetX: null,
    targetY: null,
    direction: id % 2 === 0 ? 1 : -1,
    animation: id * 0.7,
  }));
}

function normalizeColonist(colonist) {
  colonist.health = clamp(finite(colonist.health, 100));
  colonist.hunger = clamp(finite(colonist.hunger, 0));
  colonist.thirst = clamp(finite(colonist.thirst, 0));
  colonist.sleep = clamp(finite(colonist.sleep, 0));
  colonist.warmth = clamp(finite(colonist.warmth, 100));
  colonist.air = clamp(finite(colonist.air, 100));
  colonist.light = clamp(finite(colonist.light, 100));
  colonist.social = clamp(finite(colonist.social, 100));
  colonist.intimacy = clamp(finite(colonist.intimacy, 100));
  colonist.purpose = clamp(finite(colonist.purpose, 100));
  colonist.morale = clamp(finite(colonist.morale, NEEDS.INITIAL_MORALE));
  colonist.dose = Math.max(0, finite(colonist.dose, 0));
  colonist.injuries = Array.isArray(colonist.injuries) ? colonist.injuries : [];
  colonist.diseases = Array.isArray(colonist.diseases) ? colonist.diseases : [];
  if (colonist.injured && colonist.injuries.length === 0) colonist.injuries.push({ type: 'trauma', recovery: 0 });
  colonist.dead = Boolean(colonist.dead || colonist.health <= 0);
  colonist.jobId ??= null;
  colonist.personal ??= null;
  colonist.surfaceCrewId ??= null;
  colonist.suit ??= false;
  colonist.doseHistory = Array.isArray(colonist.doseHistory) ? colonist.doseHistory : [];
  colonist.carrying ??= null;
  colonist.idleActivity ??= null;
  colonist.idleReason ??= null;
  colonist.needRetryTick = finite(colonist.needRetryTick, 0);
  colonist.path = Array.isArray(colonist.path) ? colonist.path : [];
  colonist.pathIndex = finite(colonist.pathIndex, 0);
  colonist.pathGoal ??= null;
  colonist.navRevision = finite(colonist.navRevision, -1);
  colonist.restX = finite(colonist.restX, colonist.x);
  colonist.restY = finite(colonist.restY, colonist.y);
  colonist.prevX = finite(colonist.prevX, colonist.x);
  colonist.prevY = finite(colonist.prevY, colonist.y);
  colonist.animation = finite(colonist.animation, 0);
  colonist.fallDistance = finite(colonist.fallDistance, 0);
}

function hourOfDay(sim) {
  return Math.floor(sim.tick / TIME.TICKS_PER_HOUR) % 24;
}

function workEndHour(sim) {
  return WORK.WORK_START_HOUR + lawEffect(sim, 'workHours', WORK.DEFAULT_WORK_HOURS);
}

function isWorkHour(sim) {
  const hour = hourOfDay(sim);
  return hour >= WORK.WORK_START_HOUR && hour < workEndHour(sim);
}

function usableRoom(excavation) {
  return excavation && excavation.state !== 'collapsed' && excavation.state !== 'planned' && excavation.state !== 'digging'
    && !excavation.disabled && !excavation.evacuation && (excavation.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

// Leisure and rest must remain safe even when the room average hides a deep puddle.
function safeActivityPosition(sim, x, y) {
  const room = excavationAt(sim, Math.round(x), Math.round(y));
  return (!room || usableActivityRoom(room)) && !headSubmerged(sim, x, y);
}

function couplePartner(sim, colonist) {
  if (colonist.coupleId === null || colonist.coupleId === undefined) return null;
  const partner = sim.colonists.find((person) => person.id === colonist.coupleId);
  return partner?.health > 0 && !partner.dead ? partner : null;
}

function dormitory(sim, colonist) {
  const partner = couplePartner(sim, colonist);
  if (partner?.personal?.type === 'sleep') {
    const partnerRoom = sim.excavation(partner.personal.excavationId);
    if ((partnerRoom?.roomType === 'dorm' || partnerRoom?.label === 'shelterDorm') && usableRoom(partnerRoom)) return partnerRoom;
  }
  let best = null;
  let bestScore = Infinity;
  for (const room of sim.excavations) {
    if ((room.roomType !== 'dorm' && room.label !== 'shelterDorm') || !usableRoom(room)) continue;
    const occupants = sim.colonists.filter((person) => person.health > 0
      && person.personal?.type === 'sleep' && person.personal.excavationId === room.id).length;
    const capacity = room.beds ?? (room.label === 'shelterDorm' ? 12 : 4);
    const x = room.x + (room.w - 1) / 2;
    const y = room.y + room.h - 1;
    const score = Math.abs(x - colonist.x) + Math.abs(y - colonist.y) + (occupants >= capacity ? 10000 : 0);
    if (score < bestScore || (score === bestScore && room.id < best.id)) {
      best = room;
      bestScore = score;
    }
  }
  return best;
}

function infirmary(sim) {
  return sim.excavations.find((excavation) => excavation.roomType === 'infirmary' && usableRoom(excavation)
    && excavation.powered && !excavation.powerShed) ?? null;
}

function nearestResourceStock(sim, colonist, resource, amount) {
  return nearestStock(sim, colonist.x, colonist.y,
    (stock) => (stock.resources[resource] ?? 0) >= amount, colonist);
}

function mealPortion(sim, colonist, stock, resource) {
  return WORK.FOOD_PER_MEAL * consumptionFactor(colonist) * lawMultiplier(sim, 'foodRation', 1)
    * (1 - (resource === 'meals' ? stock?.wasteReduction ?? 0 : 0));
}

function foodStock(sim, colonist) {
  return nearestStock(sim, colonist.x, colonist.y, (stock) => sim.excavation(stock.excavationId)?.roomType !== 'exodusDepot'
    && ((stock.resources.food ?? 0) >= mealPortion(sim, colonist, stock, 'food')
      || (stock.resources.meals ?? 0) >= mealPortion(sim, colonist, stock, 'meals')), colonist);
}

function drinkStock(sim, colonist) {
  const portion = NEEDS.WATER_PER_DRINK * consumptionFactor(colonist);
  return nearestResourceStock(sim, colonist, 'waterClean', portion)
    ?? (colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD
      ? nearestResourceStock(sim, colonist, 'waterDirty', portion) : null);
}

function drinkResource(sim, colonist, stock) {
  const portion = NEEDS.WATER_PER_DRINK * consumptionFactor(colonist);
  if ((stock?.resources.waterClean ?? 0) >= portion) return 'waterClean';
  // Recheck at the tap: clean water may have arrived while the person was walking.
  if (colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD
    && (stock?.resources.waterDirty ?? 0) >= portion
    && !nearestResourceStock(sim, colonist, 'waterClean', portion)) return 'waterDirty';
  return null;
}

function dirtyWaterRisk(sim, colonist, resource) {
  if (resource === 'waterDirty') {
    noteDirtyWater(sim, colonist);
    ensureDisease(colonist, 'infection', sim.rng.chance(NEEDS.DIRTY_WATER_INFECTION_CHANCE));
  }
}

function needsDrink(sim, colonist) {
  return colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD
    || (hourOfDay(sim) >= workEndHour(sim) && colonist.thirst >= NEEDS.LOW_NEED_THRESHOLD);
}

// Leisure normally runs its course (up to IDLE_WANDER_TICKS) before needs are
// seen to, but a critical hunger or thirst that a stock can meet now does not
// sit it out. A leisure drink is short and already paid for: let it finish.
function criticalNeedOverridesLeisure(sim, colonist) {
  if (colonist.needRetryTick > sim.tick || colonist.idleActivity?.type === 'drink') return false;
  return (colonist.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD && Boolean(foodStock(sim, colonist)))
    || (colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD && Boolean(drinkStock(sim, colonist)));
}

function beginPersonal(sim, colonist) {
  if (colonist.personal || colonist.carrying) return;
  if (colonist.idleActivity?.phase === 'active' && !criticalNeedOverridesLeisure(sim, colonist)) return;
  const hour = hourOfDay(sim);
  const rescuing = isRescueJob(sim, getJob(sim, colonist.jobId));
  const restHour = !rescuing && (hour >= workEndHour(sim) || hour < WORK.WORK_START_HOUR);
  const hungry = colonist.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD || (restHour && colonist.hunger >= NEEDS.MEAL_REST_THRESHOLD);
  const thirsty = needsDrink(sim, colonist);
  const tired = colonist.sleep >= WORK.SLEEP_PER_DAY * 0.8 || (!rescuing && (hour >= workEndHour(sim) || hour < 6));
  const needsCare = colonist.health < 100 || colonist.injuries.length > 0 || colonist.diseases.length > 0;
  const careRoom = needsCare ? infirmary(sim) : null;
  const school = !isEligibleForWork(sim, colonist) && colonist.age >= PEOPLE.SCHOOL_START_AGE
    && colonist.age < PEOPLE.SCHOOL_END_AGE && isWorkHour(sim) ? schoolRoomFor(sim, colonist) : null;
  // Un affamé que la réserve ne peut pas nourrir garde son poste et travaille
  // moins vite (STARVATION_WORK_FACTOR) : la faim ne doit l'écarter de son
  // travail que si un repas est réellement disponible.
  const hungryForFood = hungry && colonist.needRetryTick <= sim.tick && foodStock(sim, colonist);
  if (!hungryForFood && !thirsty && !tired && !restHour && !careRoom && !school) return;
  if (colonist.needRetryTick > sim.tick && !restHour) return;
  if (colonist.jobId !== null) releaseJob(sim, colonist);
  colonist.idleActivity = null;

  // Boire et manger passent avant les soins quand le besoin est critique et
  // qu'il y a de quoi : le patient ira se faire soigner une fois réglé. Sans
  // eau ni vivres à portée, il va quand même à l'infirmerie.
  const urgentDrink = colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD && drinkStock(sim, colonist);
  const urgentMeal = colonist.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD && foodStock(sim, colonist);
  if (careRoom && !urgentDrink && !urgentMeal) {
    colonist.personal = { type: 'care', phase: 'go', excavationId: careRoom.id };
    colonist.pathGoal = null;
    return;
  }
  if (thirsty && colonist.needRetryTick <= sim.tick) {
    const stock = drinkStock(sim, colonist);
    if (stock) {
      colonist.personal = { type: 'drink', phase: 'go', stockId: stock.id, timer: 0 };
      colonist.pathGoal = null;
      return;
    }
  }
  if (hungry && colonist.needRetryTick <= sim.tick) {
    const stock = foodStock(sim, colonist);
    if (stock) {
      colonist.personal = { type: 'eat', phase: 'go', stockId: stock.id, timer: 0 };
      colonist.pathGoal = null;
      return;
    }
  }
  if (careRoom) {
    colonist.personal = { type: 'care', phase: 'go', excavationId: careRoom.id };
    colonist.pathGoal = null;
    return;
  }
  if (school && !tired) {
    colonist.personal = { type: 'study', phase: 'go', excavationId: school.id };
    colonist.pathGoal = null;
    return;
  }
  if (tired || restHour) {
    const dorm = dormitory(sim, colonist);
    if (dorm && colonist.needRetryTick <= sim.tick) {
      colonist.personal = { type: 'sleep', phase: 'go', excavationId: dorm.id };
      colonist.pathGoal = null;
    } else {
      colonist.personal = { type: 'rest' };
      colonist.pathGoal = null;
    }
  }
}

function roomTargets(sim, room, colonist) {
  if (!room) return [];
  const nav = rebuildNav(sim);
  const dorm = room.roomType === 'dorm' || room.label === 'shelterDorm';
  const isDugTarget = (x, y) => sim.world.inBounds(x, y) && room.dugCells?.includes(sim.world.index(x, y));
  const partner = couplePartner(sim, colonist);
  if (dorm && partner?.personal?.type === 'sleep' && partner.personal.excavationId === room.id) {
    const partnerInRoom = partner.x >= room.x && partner.x < room.x + room.w && partner.y >= room.y && partner.y < room.y + room.h;
    const x = partner.personal.phase === 'sleeping' ? partner.bedX : (partnerInRoom ? partner.x : partner.restX);
    const y = partner.personal.phase === 'sleeping' ? partner.bedY : (partnerInRoom ? partner.y : partner.restY);
    if (isDugTarget(x, y) && isWalkableIn(sim.world, nav, x, y) && safeActivityPosition(sim, x, y)) return [{ x, y }];
  }
  const restInRoom = isDugTarget(colonist.restX, colonist.restY);
  if (dorm && restInRoom && isWalkableIn(sim.world, nav, colonist.restX, colonist.restY)
    && safeActivityPosition(sim, colonist.restX, colonist.restY)) return [{ x: colonist.restX, y: colonist.restY }];
  const targets = [];
  for (const index of room.dugCells ?? []) {
    const { x, y } = sim.world.coords(index);
    if (isWalkableIn(sim.world, nav, x, y) && safeActivityPosition(sim, x, y)) targets.push({ x, y, distance: Math.abs(x - colonist.x) + Math.abs(y - colonist.y), index });
  }
  targets.sort((a, b) => a.distance - b.distance || a.index - b.index);
  return targets.map(({ x, y }) => ({ x, y }));
}

function carriedChild(sim, colonist) {
  const childId = colonist.activity?.type === 'carryingChild'
    ? colonist.activity.childId : colonist.personal?.type === 'carryChild' ? colonist.personal.childId : null;
  return sim.colonists.find((person) => person.id === childId) ?? null;
}

function synchronizeCarriedChild(sim, colonist) {
  const child = carriedChild(sim, colonist);
  if (!child || child.carriedBy !== colonist.id) return;
  child.x = colonist.x;
  child.y = colonist.y;
}

function dropCarriedChild(sim, colonist, completed = false) {
  const child = carriedChild(sim, colonist)
    ?? sim.colonists.find((person) => person.carriedBy === colonist.id) ?? null;
  clearActivity(colonist, 'carryingChild');
  if (colonist.personal?.type === 'carryChild') colonist.personal = null;
  colonist.pathGoal = null;
  if (!child) return;
  if (child.carriedBy !== colonist.id) {
    child.awaitingCarry = child.health > 0 && !child.dead;
    return;
  }
  delete child.carriedBy;
  child.awaitingCarry = !completed && child.health > 0 && !child.dead;
  child.x = colonist.x;
  child.y = colonist.y;
  child.prevX = colonist.x;
  child.prevY = colonist.y;
  child.path = [];
  child.pathIndex = 0;
  child.pathGoal = null;
  child.task = child.health > 0 && !child.dead ? 'idle' : 'dead';
}

function lyingInDorm(sim, room, child) {
  const x = Math.round(child.x);
  const y = Math.round(child.y);
  return sim.world.inBounds(x, y) && Boolean(room?.dugCells?.includes(sim.world.index(x, y)))
    && isWalkableIn(sim.world, rebuildNav(sim), x, y) && safeActivityPosition(sim, x, y);
}

function pickUpChild(sim, colonist, child) {
  if (!child || child.dead || child.health <= 0 || child.jobId !== null
    || Math.round(child.x) !== Math.round(colonist.x) || Math.round(child.y) !== Math.round(colonist.y)) return false;
  child.awaitingCarry = false;
  if (lyingInDorm(sim, sim.excavation(colonist.personal.excavationId), child)) {
    // Already in the dorm: there is nowhere to carry the baby to. A carry here
    // ended on the next tick, often on this very cell (the drop spot can be
    // the parent's own spot, or a partner who walks up to it), a one-tick
    // 'carried' blink. Settle it where it lies.
    colonist.personal = null;
    colonist.pathGoal = null;
    return true;
  }
  child.carriedBy = colonist.id;
  child.personal = null;
  child.idleActivity = null;
  child.path = [];
  child.pathIndex = 0;
  child.pathGoal = null;
  child.task = 'carried';
  colonist.personal.phase = 'go';
  colonist.activity = { type: 'carryingChild', phase: 'active', childId: child.id };
  colonist.task = 'carrying';
  colonist.pathGoal = null;
  synchronizeCarriedChild(sim, colonist);
  return true;
}

function accessibleDormitory(sim, colonist) {
  const rooms = sim.excavations.filter((room) => (room.roomType === 'dorm' || room.label === 'shelterDorm')
    && usableActivityRoom(room)).sort((a, b) => {
    const distance = (room) => Math.abs(room.x + (room.w - 1) / 2 - colonist.x)
      + Math.abs(room.y + room.h - 1 - colonist.y);
    return distance(a) - distance(b) || a.id - b.id;
  });
  for (const room of rooms) {
    const targets = roomTargets(sim, room, colonist);
    if (targets.some((target) => Math.abs(target.x - colonist.x) < 1e-6 && Math.abs(target.y - colonist.y) < 1e-6)
      || findPath(sim, colonist, targets).length > 0) return room;
  }
  return null;
}

function beginChildCarry(sim, colonist) {
  if (colonist.jobId !== null || colonist.personal || colonist.surfaceCrewId || colonist.carrying
    || colonist.needRetryTick > sim.tick || hasCriticalNeed(colonist)) return;
  const child = sim.colonists.filter((person) => person.awaitingCarry && person.health > 0 && !person.dead
    && person.jobId === null && person.carriedBy == null && person.parentIds?.includes(colonist.id))
    .sort((a, b) => (a.birthTick ?? 0) - (b.birthTick ?? 0) || a.id - b.id)[0];
  if (!child) return;
  const room = accessibleDormitory(sim, colonist);
  if (!room) return;
  clearActivity(colonist, 'music');
  colonist.idleActivity = null;
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
  colonist.personal = { type: 'carryChild', phase: 'pickup', childId: child.id, excavationId: room.id };
  pickUpChild(sim, colonist, child);
}

function validMourningRoom(sim, personal) {
  const room = sim.excavation(personal.excavationId);
  const deceased = sim.colonists.find((person) => person.id === personal.deceasedId);
  return usableActivityRoom(room, 'ossuary') && room.state === 'fitted' && room.powered && !room.powerShed
    && deceased?.bodyLocation === 'ossuary' && deceased.ossuaryId === room.id ? room : null;
}

function beginMourning(sim, colonist) {
  const visit = colonist.mourningVisit;
  if (!visit || hasCriticalNeed(colonist) || colonist.surfaceCrewId) return;
  if (colonist.personal && colonist.personal.type !== 'rest') return;
  if (colonist.jobId !== null) releaseJob(sim, colonist);
  clearActivity(colonist, 'music');
  colonist.mourningVisit = null;
  colonist.personal = { type: 'mourning', phase: 'go', ...visit };
  colonist.idleActivity = null;
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
}

function stockTargets(sim, stock) {
  return navigationTargets(sim, stock.x, stock.y);
}

function personalTask(sim, colonist) {
  const personal = colonist.personal;
  if (!personal || personal.type === 'rest') return null;
  if (personal.type === 'eat' || personal.type === 'drink') {
    const activePhase = personal.type === 'eat' ? 'eating' : 'drinking';
    if (personal.phase === activePhase) return { key: `${personal.type}:${personal.stockId}`, targets: [], range: 0, arrived: true };
    let stock = sim.stocks.find((candidate) => candidate.id === personal.stockId);
    if (!stock || !stockReachable(sim, colonist, stock)) {
      stock = personal.type === 'eat' ? foodStock(sim, colonist) : drinkStock(sim, colonist);
      if (!stock) {
        colonist.personal = null;
        colonist.needRetryTick = sim.tick + TIME.TICKS_PER_HOUR;
        return null;
      }
      personal.stockId = stock.id;
      personal.phase = 'go';
      colonist.pathGoal = null;
    }
    return { key: `${personal.type}:${stock.id}`, targets: stockTargets(sim, stock), range: 0 };
  }
  if (personal.type === 'carryChild' && personal.phase === 'pickup') {
    const child = sim.colonists.find((person) => person.id === personal.childId);
    if (!child) return null;
    const target = { x: Math.round(child.x), y: Math.round(child.y) };
    return { key: `carryChild:pickup:${child.id}:${target.x}:${target.y}`, targets: [target], range: 0 };
  }
  const room = sim.excavation(personal.excavationId);
  if (!room) return null;
  const activePhase = personal.type === 'sleep' ? 'sleeping'
    : personal.type === 'study' ? 'studying'
      : personal.type === 'mourning' ? 'visiting' : 'caring';
  if (personal.phase === activePhase) return { key: `${personal.type}:${room.id}`, targets: [], range: 0, arrived: true };
  return { key: `${personal.type}:${room.id}`, targets: roomTargets(sim, room, colonist), range: 0 };
}

function atTask(sim, colonist, task) {
  if (task.arrived) return true;
  if (task.range > 0) {
    const x = Math.round(colonist.x);
    const y = Math.round(colonist.y);
    return task.targets.some((target) => target.x === x && target.y === y) && isWalkable(sim, x, y);
  }
  return task.targets.some((target) => Math.abs(colonist.x - target.x) < 1e-6 && Math.abs(colonist.y - target.y) < 1e-6);
}

function moveAlongPath(sim, colonist) {
  const nav = rebuildNav(sim);
  let moved = 0;
  while (colonist.pathIndex < colonist.path.length) {
    const next = colonist.path[colonist.pathIndex];
    const closed = evacuatedAt(sim, next.x, next.y);
    const destination = colonist.path.at(-1);
    const crosses = closed && destination && !evacuatedAt(sim, destination.x, destination.y);
    if ((closed && !crosses && colonist.pathGoal !== 'floodEscape'
        && !isRescueJob(sim, getJob(sim, colonist.jobId))
        && !(colonist.pathGoal === 'evacuate' && colonist.evacuationFrom === closed.id))
      || (colonist.pathGoal === 'evacuate' && !colonist.evacuationFallback
        && !evacuationStepAllowed(sim, sim.excavation(colonist.evacuationFrom), next.x, next.y))) {
      colonist.path = [];
      colonist.pathIndex = 0;
      colonist.pathGoal = null;
      break;
    }
    // Power changes invalidate shaft navigation without a terrain revision.
    // Read live elevator flags even when continuing an already planned escape.
    const elevator = next.climb && (nav.elevators[sim.world.index(next.x, next.y)]
      || nav.elevators[sim.world.index(Math.round(colonist.x), Math.round(colonist.y))]);
    let speed = next.climb
      ? (elevator ? WORK.ELEVATOR_CELLS_PER_MINUTE : WORK.LADDER_CELLS_PER_MINUTE)
      : WORK.WALK_CELLS_PER_MINUTE;
    const waterRatio = Math.max(waterRatioAt(sim, colonist.x, colonist.y), waterRatioAt(sim, next.x, next.y));
    if (waterRatio >= WATER.WADING_MIN_RATIO) speed *= WATER.WADING_SPEED_FACTOR;
    let remaining = speed - moved;
    if (remaining <= 1e-9) break;
    const dx = next.x - colonist.x;
    const dy = next.y - colonist.y;
    const distance = Math.abs(dx) + Math.abs(dy);
    // A one-row step is never left half done: its midpoint is the open corner
    // above the ledge, which is not a standing cell. Start it on a fresh move.
    if (next.step && distance > remaining && moved > 0) break;
    if (distance <= remaining || distance < 1e-9 || next.step) {
      colonist.x = next.x;
      colonist.y = next.y;
      moved += distance;
      colonist.pathIndex += 1;
    } else {
      colonist.x += Math.sign(dx) * Math.min(Math.abs(dx), remaining);
      remaining -= Math.abs(dx);
      if (remaining > 0) colonist.y += Math.sign(dy) * Math.min(Math.abs(dy), remaining);
      moved = speed;
    }
    if (dx !== 0) colonist.direction = Math.sign(dx);
    colonist.task = next.climb ? 'climb'
      : (colonist.carrying || colonist.activity?.type === 'carryingChild' ? 'carrying' : 'walk');
    if (moved >= speed - 1e-9) break;
  }
  colonist.animation += moved * 2;
  synchronizeCarriedChild(sim, colonist);
  return moved;
}

function failTask(sim, colonist) {
  if (colonist.personal) {
    if (colonist.personal.type === 'carryChild') dropCarriedChild(sim, colonist);
    clearActivity(colonist, 'mourning');
    colonist.personal = null;
    colonist.needRetryTick = sim.tick + TIME.TICKS_PER_HOUR;
  } else if (colonist.jobId !== null) {
    releaseJob(sim, colonist, TIME.TICKS_PER_HOUR);
  }
  colonist.task = 'idle';
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
}

function careFactor(sim, colonist) {
  const childFactor = colonist.age < PEOPLE.ADULT_AGE ? lawMultiplier(sim, 'childCareFactor', 1) : 1;
  return researchEffect(sim, 'infirmaryFactor', 1) * childFactor;
}

// Guérir coûte 1 médicament par affection ; les maladies exigent en plus un
// soignant au poste. Sans médicament, une blessure guérit quand même, deux
// fois plus lentement ; une maladie attend médicament et soignant.
function recoverAfflictions(sim, colonist, room) {
  const perHour = NEEDS.INFIRMARY_RECOVERY_PER_HOUR;
  colonist.careRecovery = Math.min(perHour * AFFLICTIONS.INFIRMARY_SLOW_INJURY_FACTOR,
    (colonist.careRecovery ?? 0) + perHour * careFactor(sim, colonist) / TIME.TICKS_PER_HOUR);
  const injury = colonist.injuries[0] ?? null;
  const disease = injury ? null : colonist.diseases[0] ?? null;
  if (!injury && !disease) return;
  const hasMeds = spendableAmount(sim, 'meds') >= AFFLICTIONS.INFIRMARY_MEDS_PER_CURE;
  if (disease && (!hasMeds || !infirmaryHealerPresent(sim, room))) {
    colonist.careRecovery = Math.min(colonist.careRecovery, perHour);
    return;
  }
  const threshold = injury && !hasMeds ? perHour * AFFLICTIONS.INFIRMARY_SLOW_INJURY_FACTOR : perHour;
  if (colonist.careRecovery + 1e-9 < threshold) return;
  if (hasMeds && !spendResources(sim, { meds: AFFLICTIONS.INFIRMARY_MEDS_PER_CURE })) return;
  colonist.careRecovery = Math.max(0, colonist.careRecovery - threshold);
  if (injury) colonist.injuries.shift();
  else colonist.diseases.shift();
  colonist.injured = colonist.injuries.length > 0;
}

function updatePersonal(sim, colonist) {
  const personal = colonist.personal;
  if (!personal) return;
  if (personal.type === 'sleep' && (!usableActivityRoom(sim.excavation(personal.excavationId))
    || (personal.phase === 'sleeping' && !safeActivityPosition(sim, colonist.x, colonist.y)))) {
    colonist.personal = null;
    colonist.path = [];
    colonist.pathIndex = 0;
    colonist.pathGoal = null;
    return;
  }
  if (personal.type === 'mourning') {
    const room = validMourningRoom(sim, personal);
    if (!room || hasCriticalNeed(colonist)) {
      clearActivity(colonist, 'mourning');
      colonist.personal = null;
      colonist.pathGoal = null;
      return;
    }
    if (personal.phase !== 'visiting') {
      clearActivity(colonist, 'mourning');
      return;
    }
    if (personal.timer <= 1 || !insideExcavation(sim, room, colonist.x, colonist.y)) {
      clearActivity(colonist, 'mourning');
      colonist.personal = null;
      colonist.pathGoal = null;
      colonist.task = 'idle';
      return;
    }
    colonist.activity = { type: 'mourning', phase: 'active' };
    personal.timer -= 1;
    colonist.task = 'mourning';
    colonist.animation += 0.01;
    return;
  }
  if (personal.type === 'carryChild') {
    const child = sim.colonists.find((person) => person.id === personal.childId);
    const room = sim.excavation(personal.excavationId);
    if (!child || child.health <= 0 || child.dead || hasCriticalNeed(colonist)
      || !usableActivityRoom(room) || (room.roomType !== 'dorm' && room.label !== 'shelterDorm')) {
      dropCarriedChild(sim, colonist);
      return;
    }
    if (personal.phase === 'pickup') {
      clearActivity(colonist, 'carryingChild');
      return;
    }
    if (child.carriedBy !== colonist.id) {
      dropCarriedChild(sim, colonist);
      return;
    }
    colonist.activity = { type: 'carryingChild', phase: 'active', childId: child.id };
    synchronizeCarriedChild(sim, colonist);
    return;
  }
  if (personal.type === 'rest') {
    colonist.task = 'idle';
    colonist.sleep = Math.max(0, colonist.sleep - NEEDS.NEED_RESTORE_PER_HOUR / TIME.TICKS_PER_HOUR);
    colonist.intimacy = clamp(colonist.intimacy + NEEDS.NEED_RESTORE_PER_HOUR / TIME.TICKS_PER_HOUR);
    const needsMeal = colonist.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD && foodStock(sim, colonist);
    const needsWater = colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD && drinkStock(sim, colonist);
    if (needsMeal || needsWater) {
      colonist.personal = null;
      colonist.pathGoal = null;
      return;
    }
    if (isWorkHour(sim) && (colonist.sleep < WORK.SLEEP_PER_DAY * 0.8
      || colonist.hunger >= WORK.HUNGER_PER_DAY * 0.6 || colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD)) colonist.personal = null;
    return;
  }
  if (personal.type === 'eat' && personal.phase === 'eating') {
    colonist.task = 'eat';
    colonist.animation += 0.04;
    personal.timer -= 1;
    if (personal.timer <= 0) {
      colonist.hunger = Math.max(0, colonist.hunger - WORK.HUNGER_RESTORE * (personal.rationFactor ?? 1)
        * (1 + (personal.nutritionBonus ?? 0)));
      const wasteStock = sim.stocks.find((stock) => stock.id === personal.stockId)
        ?? nearestStock(sim, Math.round(colonist.x), Math.round(colonist.y));
      const eaten = personal.mealAmount ?? WORK.FOOD_PER_MEAL * consumptionFactor(colonist) * (personal.rationFactor ?? 1);
      if (wasteStock) addToStock(wasteStock, 'organicWaste', eaten * CULTIVATION.ORGANIC_WASTE_PER_FOOD);
      recordMealNarrative(sim, colonist, { resource: personal.mealResource, amount: personal.mealAmount });
      colonist.personal = null;
      colonist.pathGoal = null;
    }
    return;
  }
  if (personal.type === 'drink' && personal.phase === 'drinking') {
    colonist.task = 'drink';
    personal.timer -= 1;
    if (personal.timer <= 0) {
      colonist.thirst = Math.max(0, colonist.thirst - NEEDS.THIRST_RESTORE);
      colonist.personal = null;
      colonist.pathGoal = null;
    }
    return;
  }
  if (personal.type === 'sleep' && personal.phase === 'sleeping') {
    colonist.task = 'sleeping';
    colonist.sleep = Math.max(0, colonist.sleep - WORK.SLEEP_RESTORE_PER_HOUR * (colonist.sleepFactor ?? 1) / TIME.TICKS_PER_HOUR);
    colonist.intimacy = clamp(colonist.intimacy + NEEDS.NEED_RESTORE_PER_HOUR / TIME.TICKS_PER_HOUR);
    const needsMeal = colonist.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD && foodStock(sim, colonist);
    const needsWater = colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD && drinkStock(sim, colonist);
    if (needsMeal || needsWater) {
      colonist.personal = null;
      colonist.pathGoal = null;
      // Go and eat or drink right away: left idle, the sleeper could start a
      // 45-tick idle 'sit' first, and an active idle activity blocks meals.
      beginPersonal(sim, colonist);
      return;
    }
    const hour = hourOfDay(sim);
    // Wake only once rest hours are over. beginPersonal still treats the hours
    // before WORK_START_HOUR as rest and would put an earlier riser straight
    // back to bed on the next tick: bunk <-> floor every tick, a visible strobe.
    if (colonist.sleep <= 0 && hour >= WORK.WORK_START_HOUR && hour < workEndHour(sim)) {
      colonist.personal = null;
      colonist.pathGoal = null;
    }
    return;
  }
  if (personal.type === 'study' && personal.phase === 'studying') {
    const school = schoolRoomFor(sim, colonist);
    const needsMeal = colonist.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD && foodStock(sim, colonist);
    const needsWater = colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD && drinkStock(sim, colonist);
    if (!isWorkHour(sim) || isEligibleForWork(sim, colonist) || school?.id !== personal.excavationId || needsMeal || needsWater) {
      colonist.personal = null;
      colonist.pathGoal = null;
      return;
    }
    colonist.task = 'study';
    colonist.animation += 0.01;
    return;
  }
  if (personal.type === 'care' && personal.phase === 'caring') {
    const room = infirmary(sim);
    if (room?.id !== personal.excavationId) {
      colonist.personal = null;
      colonist.pathGoal = null;
      return;
    }
    colonist.task = 'caring';
    // Comme le sommeil : on quitte le lit pour boire et manger si c'est
    // critique, puis on revient se faire soigner.
    const needsMeal = colonist.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD && foodStock(sim, colonist);
    const needsWater = colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD && drinkStock(sim, colonist);
    if (needsMeal || needsWater) {
      colonist.personal = null;
      colonist.pathGoal = null;
      return;
    }
    // Medical care cannot compensate for continuing cold exposure.
    if (coldDamagePerHour(colonistFeltTemperature(sim, colonist)) === 0) {
      colonist.health = clamp(colonist.health + NEEDS.INFIRMARY_RECOVERY_PER_HOUR * careFactor(sim, colonist) / TIME.TICKS_PER_HOUR);
    }
    recoverAfflictions(sim, colonist, room);
    if (colonist.health >= 100 && colonist.injuries.length === 0 && colonist.diseases.length === 0) {
      colonist.personal = null;
      colonist.pathGoal = null;
    }
  }
}

function takeStock(sim, colonist, personal, resource, amount) {
  const stock = sim.stocks.find((candidate) => candidate.id === personal.stockId);
  if (!stock || (stock.resources[resource] ?? 0) < amount) {
    colonist.personal = null;
    colonist.needRetryTick = sim.tick + TIME.TICKS_PER_HOUR;
    return false;
  }
  stock.resources[resource] -= amount;
  if (stock.resources[resource] <= 0) delete stock.resources[resource];
  return true;
}

function arrivePersonal(sim, colonist) {
  const personal = colonist.personal;
  if (personal.type === 'eat') {
    const stock = sim.stocks.find((candidate) => candidate.id === personal.stockId);
    const resource = (stock?.resources.meals ?? 0) >= mealPortion(sim, colonist, stock, 'meals') ? 'meals' : 'food';
    personal.nutritionBonus = resource === 'meals' ? stock?.nutritionBonus ?? 0 : 0;
    personal.rationFactor = lawMultiplier(sim, 'foodRation', 1);
    const amount = mealPortion(sim, colonist, stock, resource);
    if (!takeStock(sim, colonist, personal, resource, amount)) return;
    personal.mealResource = resource;
    personal.mealAmount = amount;
    personal.phase = 'eating';
    personal.timer = WORK.EAT_MINUTES;
    colonist.task = 'eat';
  } else if (personal.type === 'drink') {
    const stock = sim.stocks.find((candidate) => candidate.id === personal.stockId);
    const resource = drinkResource(sim, colonist, stock);
    if (!resource) {
      colonist.personal = null;
      colonist.pathGoal = null;
      return;
    }
    if (!takeStock(sim, colonist, personal, resource, NEEDS.WATER_PER_DRINK * consumptionFactor(colonist))) return;
    dirtyWaterRisk(sim, colonist, resource);
    personal.phase = 'drinking';
    personal.timer = NEEDS.DRINK_MINUTES;
    colonist.task = 'drink';
  } else if (personal.type === 'sleep') {
    const dorm = sim.excavation(personal.excavationId);
    const partner = couplePartner(sim, colonist);
    const shared = partner?.personal?.type === 'sleep' && partner.personal.phase === 'sleeping'
      && partner.personal.excavationId === personal.excavationId;
    if (shared) {
      colonist.x = partner.x;
      colonist.y = partner.y;
      colonist.bedX = partner.bedX;
      colonist.bedY = partner.bedY;
    } else if (dorm && dorm.label !== 'shelterDorm') {
      colonist.bedX = colonist.x;
      colonist.bedY = colonist.y;
    }
    personal.phase = 'sleeping';
    colonist.task = 'sleeping';
  } else if (personal.type === 'study') {
    personal.phase = 'studying';
    colonist.task = 'study';
  } else if (personal.type === 'care') {
    personal.phase = 'caring';
    colonist.task = 'caring';
  } else if (personal.type === 'mourning') {
    personal.phase = 'visiting';
    personal.timer = M6.MOURNING_VISIT_TICKS;
    colonist.activity = { type: 'mourning', phase: 'active' };
    colonist.task = 'mourning';
  } else if (personal.type === 'carryChild') {
    if (personal.phase === 'pickup') {
      const child = sim.colonists.find((person) => person.id === personal.childId);
      if (!pickUpChild(sim, colonist, child)) {
        colonist.personal = null;
        colonist.pathGoal = null;
        colonist.needRetryTick = sim.tick + TIME.TICKS_PER_HOUR;
        colonist.task = 'idle';
      }
      return;
    }
    dropCarriedChild(sim, colonist, true);
    colonist.task = 'idle';
  }
}

function applyGravity(sim, colonist) {
  if (colonist.pathIndex < colonist.path.length) return;
  const x = Math.round(colonist.x);
  const y = Math.round(colonist.y);
  if (isWalkable(sim, x, y)) {
    const excess = Math.max(0, colonist.fallDistance - WORK.SAFE_FALL_CELLS);
    if (excess > 0) {
      sim.log('error', 'alertFallRed', { colonistId: colonist.id, id: colonist.id, name: colonist.name });
      const damage = excess * WORK.FALL_DAMAGE_PER_CELL;
      colonist.health = Math.max(0, colonist.health - damage);
      colonist.lastDamageCauses = ['fall'];
      colonist.injured = true;
      colonist.injuries.push({ type: 'fall', recovery: 0 });
      sim.events.push({ type: 'injury', tick: sim.tick, colonistId: colonist.id, injury: 'fall', amount: damage, x, y });
    }
    colonist.fallDistance = 0;
    return;
  }
  if (!sim.world.isEmpty(x, y) || !sim.world.isEmpty(x, y + 1)) return;
  colonist.x = x;
  colonist.y = y + Math.min(1, WORK.GRAVITY_CELLS_PER_MINUTE);
  colonist.fallDistance += 1;
  if (colonist.fallDistance === WORK.SAFE_FALL_CELLS + 1) {
    sim.log('warning', 'alertFallYellow', { colonistId: colonist.id, id: colonist.id, name: colonist.name });
  }
  colonist.task = 'fall';
  colonist.pathGoal = null;
}

function approach(value, target, amount) {
  return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
}

function returnFromSurface(sim, colonist) {
  const hatch = surfaceHatch(sim);
  const surfaceWalkY = WORLD.SURFACE_Y - 1;
  if (colonist.y < surfaceWalkY) {
    colonist.y = approach(colonist.y, surfaceWalkY, WORK.LADDER_CELLS_PER_MINUTE);
    colonist.task = 'climb';
    return true;
  }
  if (Math.abs(colonist.x - hatch.x) > 1e-9) {
    colonist.x = approach(colonist.x, hatch.x, WORK.WALK_CELLS_PER_MINUTE);
    colonist.direction = Math.sign(hatch.x - colonist.x) || colonist.direction;
    colonist.task = 'walk';
    return true;
  }
  const interiorY = Math.max(hatch.y, colonist.restY ?? hatch.y,
    hatch.excavation ? hatch.excavation.y + hatch.excavation.h - 1 : hatch.y);
  if (colonist.y < interiorY) {
    colonist.y = approach(colonist.y, interiorY, WORK.LADDER_CELLS_PER_MINUTE);
    colonist.task = 'climb';
    return true;
  }
  return false;
}

function ensureDisease(colonist, type, active) {
  if (active && !colonist.diseases.some((disease) => (typeof disease === 'string' ? disease : disease.type) === type)) {
    colonist.diseases.push({ type, recovery: 0 });
  }
}

function sameRoom(sim, colonist, other, room) {
  return room && other.x >= room.x && other.x < room.x + room.w
    && other.y >= room.y && other.y < room.y + room.h;
}

function hasSocialContact(sim, colonist, room) {
  const partner = couplePartner(sim, colonist);
  if (partner && colonist.personal?.type === 'sleep' && colonist.personal.phase === 'sleeping'
    && partner.personal?.type === 'sleep' && partner.personal.phase === 'sleeping'
    && partner.personal.excavationId === colonist.personal.excavationId
    && Math.abs(partner.x - colonist.x) <= 1.25 && Math.abs(partner.y - colonist.y) < 0.5) return true;
  if (room?.roomType === 'commons' && usableRoom(room) && sim.colonists.some((other) => other.id !== colonist.id
    && other.health > 0 && !other.dead && sameRoom(sim, colonist, other, room))) return true;
  if (sim.charter?.active?.meals === 'sharedMeals'
    && colonist.personal?.type === 'eat' && colonist.personal.phase === 'eating') {
    return sim.colonists.some((other) => other.id !== colonist.id && other.health > 0 && !other.dead
      && other.personal?.type === 'eat' && other.personal.phase === 'eating'
      && (other.personal.stockId === colonist.personal.stockId || sameRoom(sim, colonist, other, room)));
  }
  return colonist.idleActivity?.type === 'socialize' && colonist.idleActivity.phase === 'active'
    && Boolean(socialPartner(sim, colonist));
}

function updateNeeds(sim, colonist) {
  colonist.hunger = clamp(colonist.hunger + WORK.HUNGER_PER_DAY / TIME.TICKS_PER_DAY);
  colonist.thirst = clamp(colonist.thirst + NEEDS.THIRST_PER_DAY / TIME.TICKS_PER_DAY);
  const room = excavationAt(sim, colonist.x, colonist.y);
  const temperature = colonistFeltTemperature(sim, colonist);
  const o2 = finite(room?.o2, AIR.SURFACE_O2);
  const co2 = finite(room?.co2, AIR.SURFACE_CO2);
  const warmthTarget = temperatureComfort(temperature) * 100;
  const fatigueFactor = 1 + (1 - warmthTarget / 100) * (HEAT.MAX_FATIGUE_FACTOR - 1);
  colonist.sleep = clamp(colonist.sleep + WORK.SLEEP_PER_DAY / TIME.TICKS_PER_DAY * fatigueFactor);
  const oxygenTarget = clamp((o2 - AIR.DANGER_O2) / (AIR.INITIAL_O2 - AIR.DANGER_O2) * 100);
  const co2Target = clamp((AIR.DANGER_CO2 - co2) / AIR.DANGER_CO2 * 100);
  const restoration = NEEDS.NEED_RESTORE_PER_HOUR / TIME.TICKS_PER_HOUR;
  colonist.warmth = approach(colonist.warmth, warmthTarget, restoration);
  colonist.air = approach(colonist.air, Math.min(oxygenTarget, co2Target), restoration);
  const hour = hourOfDay(sim);
  const lit = (room?.powered && !room.powerShed && !room.disabled)
    || (colonist.y < WORLD.SURFACE_Y && hour >= WORK.WORK_START_HOUR && hour < workEndHour(sim));
  const lightFactor = 1 + (COATINGS[room?.coating]?.lightBonus ?? 0);
  colonist.light = clamp(colonist.light + (lit ? restoration * lightFactor : -NEEDS.LIGHT_PER_DAY / TIME.TICKS_PER_DAY / lightFactor));
  const socialRecovery = hasSocialContact(sim, colonist, room)
    ? restoration * lawMultiplier(sim, 'socialFactor', 1) : 0;
  colonist.social = clamp(colonist.social + socialRecovery - NEEDS.SOCIAL_PER_DAY / TIME.TICKS_PER_DAY);
  colonist.intimacy = clamp(colonist.intimacy - NEEDS.INTIMACY_PER_DAY / TIME.TICKS_PER_DAY);
  colonist.purpose = clamp(colonist.purpose + (colonist.jobId !== null ? restoration : -NEEDS.PURPOSE_PER_DAY / TIME.TICKS_PER_DAY));

  let damage = 0;
  let damageCauses = null;
  // Decision 4: sudden-immersion damage ignores the personal damage factor —
  // a healthy colonist drowns in the same 2 h 45 whatever their traits.
  let suddenDamage = 0;
  if (colonist.hunger >= 100) {
    damage += NEEDS.STARVATION_DAMAGE_PER_HOUR;
    (damageCauses ??= []).push('starvation');
  }
  if (colonist.thirst >= 100) {
    damage += NEEDS.DEHYDRATION_DAMAGE_PER_HOUR;
    (damageCauses ??= []).push('dehydration');
  }
  const temperatureDanger = coldDamagePerHour(temperature) > 0 || temperature > HEAT.DANGER_MAX;
  const airDanger = o2 < AIR.DANGER_O2 || co2 > AIR.DANGER_CO2;
  // updateHeat alone applies thermal damage, including outside excavations.
  // A sudden combustion spike must still leave a full day to react after the
  // yellow warning, and the red warning must have appeared before any damage.
  const airWarningReady = Number.isFinite(room?.airWarningSince)
    && sim.tick - room.airWarningSince >= AIR.WARNING_LEAD_TICKS
    && room.airAlertLevel === 'danger'
    && (room.alertChangeTicks?.air ?? sim.tick) < sim.tick;
  if (airDanger && airWarningReady) {
    damage += AIR.HEALTH_DAMAGE_PER_HOUR;
    (damageCauses ??= []).push('air');
  }
  const submerged = headSubmerged(sim, colonist.x, colonist.y);
  const floodRoom = excavationAt(sim, Math.round(colonist.x), Math.round(colonist.y))
    ?? excavationAt(sim, Math.round(colonist.x), Math.round(colonist.y) - WATER.HEAD_CELL_OFFSET);
  // An unwarned immersion is sudden: red once the head has stayed three ticks
  // under water, damage after the struggle delay counted from the first
  // immersion tick. Leaving the water stops the damage; only a full dry hour
  // closes the episode.
  updateSuddenImmersion(sim, colonist, submerged);
  if (submerged && floodDamageReady(sim, floodRoom, colonist)) {
    if (colonist.suddenImmersion) {
      suddenDamage += WATER.DROWNING_DAMAGE_PER_HOUR;
      colonist.firstSuddenDamageTick ??= sim.tick;
      (damageCauses ??= []).push('suddenImmersion');
    } else {
      damage += WATER.DROWNING_DAMAGE_PER_HOUR;
      (damageCauses ??= []).push('drowning');
    }
  }
  if (hasInfection(colonist)) {
    damage += AFFLICTIONS.INFECTION_DAMAGE_PER_HOUR;
    (damageCauses ??= []).push('infection');
  }
  if (colonist.injuries.length > 0) {
    damage += AFFLICTIONS.INJURY_DAMAGE_PER_HOUR;
    (damageCauses ??= []).push('injury');
  }
  if (damage > 0 || suddenDamage > 0) colonist.lastDamageCauses = damageCauses;
  colonist.health = clamp(colonist.health
    - (damage * (colonist.damageFactor ?? 1) + suddenDamage) / TIME.TICKS_PER_HOUR);
  ensureDisease(colonist, 'malnutrition', colonist.hunger >= 100);
  ensureDisease(colonist, 'dehydration', colonist.thirst >= 100);
  ensureDisease(colonist, 'asphyxia', colonist.air <= NEEDS.LOW_NEED_THRESHOLD);
  ensureDisease(colonist, 'hypothermia', temperature < HEAT.DANGER_MIN);
  ensureDisease(colonist, 'hyperthermia', temperature > HEAT.DANGER_MAX);
  updateNaturalRecovery(sim, colonist);
  if (damage === 0 && !temperatureDanger && !airDanger && !submerged && colonist.personal?.type !== 'care') {
    colonist.health = clamp(colonist.health + NEEDS.HEALTH_RECOVERY_PER_HOUR / TIME.TICKS_PER_HOUR);
  }
  // Preserve reduce's initial +0 and every addition in its original order.
  let satisfaction = 0;
  satisfaction += 100 - colonist.hunger;
  satisfaction += 100 - colonist.thirst;
  satisfaction += 100 - colonist.sleep;
  satisfaction += colonist.warmth;
  satisfaction += colonist.air;
  satisfaction += colonist.light;
  satisfaction += colonist.social;
  satisfaction += colonist.intimacy;
  satisfaction += colonist.purpose;
  colonist.morale = clamp(satisfaction / 9);
}

function handleDeath(sim, colonist) {
  if (colonist.jobId !== null) releaseJob(sim, colonist);
  if (colonist.activity?.type === 'carryingChild' || colonist.personal?.type === 'carryChild') {
    dropCarriedChild(sim, colonist);
  }
  if (colonist.carriedBy != null) {
    const parent = sim.colonists.find((person) => person.id === colonist.carriedBy);
    if (parent) dropCarriedChild(sim, parent);
    delete colonist.carriedBy;
  }
  clearActivity(colonist);
  delete colonist.suddenImmersion;
  delete colonist.suddenImmersionStreak;
  colonist.health = 0;
  colonist.dead = true;
  colonist.task = 'dead';
  colonist.personal = null;
  colonist.idleActivity = null;
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
  if (colonist.deathTick == null) {
    colonist.deathTick = sim.tick;
    sim.events.push({ type: 'death', tick: sim.tick, colonistId: colonist.id, x: colonist.x, y: colonist.y, causes: colonist.lastDamageCauses ?? [] });
    sim.log('error', 'eventDeath', { id: colonist.id, causes: colonist.lastDamageCauses ?? [] });
    recordDeath(sim, colonist);
  }
}

function idleDestination(sim, colonist, sequence, activity) {
  if (activity === 'drink') {
    const stock = drinkStock(sim, colonist);
    if (stock) return { x: stock.x, y: stock.y, stockId: stock.id };
  }
  const rooms = sim.excavations.filter((excavation) => usableActivityRoom(excavation));
  const pairId = colonist.id - colonist.id % 2;
  const room = rooms[(pairId * 3 + sequence) % Math.max(1, rooms.length)];
  if (!room) return safeActivityPosition(sim, colonist.restX, colonist.restY)
    ? { x: colonist.restX, y: colonist.restY } : { x: colonist.x, y: colonist.y };
  const targets = [];
  const nav = rebuildNav(sim);
  for (const index of room.dugCells ?? []) {
    const { x, y } = sim.world.coords(index);
    if (isWalkableIn(sim.world, nav, x, y) && safeActivityPosition(sim, x, y)) targets.push({ x, y, index });
  }
  targets.sort((a, b) => a.index - b.index);
  if (!targets.length) return { x: colonist.x, y: colonist.y };
  return targets[(pairId * 5 + sequence * 7) % targets.length];
}

export function socialPartner(sim, colonist, requireTask = true) {
  const partner = sim.colonists.find((person) => person.id === (colonist.id ^ 1));
  if (!partner || partner.health <= 0 || partner.jobId !== null
    || (partner.personal && partner.personal.type !== 'rest')) return null;
  if (partner.idleActivity?.type !== 'socialize' || partner.idleActivity.phase !== 'active') return null;
  if (requireTask && partner.task !== 'socialize') return null;
  return Math.abs(partner.x - colonist.x) <= 1.25 && Math.abs(partner.y - colonist.y) < 0.5 ? partner : null;
}

// Leisure never walks into unsafe ground, but it may lead a colonist off the
// unsafe cell it already stands on (a disabled shaft, a deep puddle).
function idlePathEntersUnsafe(sim, colonist, path) {
  let onSafeGround = safeActivityPosition(sim, colonist.x, colonist.y);
  for (const point of path) {
    if (safeActivityPosition(sim, point.x, point.y)) onSafeGround = true;
    else if (onSafeGround) return true;
  }
  return false;
}

// A colonist on unsafe ground starts no leisure in place: it walks off to a
// safe spot, or, with no way out, stays plainly idle so that beginPersonal can
// act, and looks again later. An in-place sit there was cancelled by the safety
// check at the top of updateIdleWander on the next tick and restarted at once,
// every tick, and an active idle activity keeps beginPersonal from sending the
// colonist to bed or to a meal: people sat all night on the people-demo vent
// shaft beside the reserve, hungry, until a job came at 08:00.
function strandIdle(sim, colonist) {
  colonist.idleActivity = null;
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
  colonist.task = 'idle';
  colonist.nextWanderTick = sim.tick + WORK.IDLE_WANDER_TICKS;
}

function idleTargets(sim, colonist, activity) {
  if (activity.type === 'drink') {
    const stock = sim.stocks.find((candidate) => candidate.id === activity.stockId);
    return stock ? stockTargets(sim, stock) : [];
  }
  if (Number.isFinite(activity.targetX) && Number.isFinite(activity.targetY)) {
    return [{ x: activity.targetX, y: activity.targetY }];
  }
  const target = idleDestination(sim, colonist, activity.sequence ?? 0, activity.type);
  activity.targetX = target.x;
  activity.targetY = target.y;
  return [target];
}

function startIdleActivity(sim, colonist, activity) {
  if (activity.type === 'drink') {
    const stock = sim.stocks.find((candidate) => candidate.id === activity.stockId);
    if (!stock || !atTask(sim, colonist, { targets: stockTargets(sim, stock), range: 0 })) return;
    const resource = drinkResource(sim, colonist, stock);
    if (!needsDrink(sim, colonist) || !resource) {
      colonist.idleActivity = null;
      colonist.needRetryTick = sim.tick;
      return;
    }
    stock.resources[resource] -= NEEDS.WATER_PER_DRINK * consumptionFactor(colonist);
    if (stock.resources[resource] <= 0) delete stock.resources[resource];
    dirtyWaterRisk(sim, colonist, resource);
  }
  activity.phase = 'active';
  activity.until = sim.tick + (activity.type === 'drink' ? NEEDS.DRINK_MINUTES : WORK.IDLE_WANDER_TICKS);
  if (activity.type === 'socialize') {
    const partner = socialPartner(sim, colonist, false);
    if (partner) {
      partner.idleActivity.until = activity.until;
      colonist.task = 'socialize';
      partner.task = 'socialize';
    }
  }
}

function applyIdleActivity(sim, colonist) {
  const activity = colonist.idleActivity;
  const restoration = NEEDS.NEED_RESTORE_PER_HOUR / TIME.TICKS_PER_HOUR;
  colonist.task = activity.type;
  if (activity.type === 'sit') {
    colonist.sleep = Math.max(0, colonist.sleep - restoration);
    colonist.intimacy = clamp(colonist.intimacy + restoration);
  } else if (activity.type === 'socialize') {
    colonist.direction = colonist.id % 2 === 0 ? 1 : -1;
  } else if (activity.type === 'drink') {
    colonist.thirst = Math.max(0, colonist.thirst - NEEDS.THIRST_RESTORE / NEEDS.DRINK_MINUTES);
  } else if (activity.type === 'walk') {
    colonist.purpose = clamp(colonist.purpose + restoration);
  }
  colonist.animation += activity.type === 'socialize' ? 0.035 : 0.006;
}

function updateIdleWander(sim, colonist) {
  if (colonist.jobId !== null || (colonist.personal && colonist.personal.type !== 'rest')) return;
  if ((colonist.age ?? PEOPLE.ADULT_AGE) < 1) {
    colonist.idleActivity = null;
    colonist.path = [];
    colonist.pathIndex = 0;
    colonist.pathGoal = null;
    colonist.task = 'idle';
    return;
  }
  let activity = colonist.idleActivity;
  const stranded = !safeActivityPosition(sim, colonist.x, colonist.y);
  // A walk in progress may cross the unsafe cell it set off from; the path
  // check below still stops it from entering unsafe ground.
  if (activity && ((stranded && activity.phase !== 'go')
    || (Number.isFinite(activity.targetX) && Number.isFinite(activity.targetY)
      && !safeActivityPosition(sim, activity.targetX, activity.targetY)))) {
    colonist.idleActivity = null;
    colonist.path = [];
    colonist.pathIndex = 0;
    colonist.pathGoal = null;
    colonist.nextWanderTick = sim.tick;
    activity = null;
  }
  if (activity?.phase === 'go') {
    const targets = idleTargets(sim, colonist, activity);
    if (atTask(sim, colonist, { targets, range: 0 })) startIdleActivity(sim, colonist, activity);
    else {
      if (colonist.pathGoal !== `idle:${activity.type}:${activity.startedTick}`
        || colonist.navRevision !== sim.world.revision || colonist.pathIndex >= colonist.path.length) {
        const path = findPath(sim, colonist, targets);
        if (path.length === 0 && stranded) {
          strandIdle(sim, colonist);
          return;
        }
        if (path.length === 0) {
          colonist.idleActivity = { type: 'sit', phase: 'active', until: sim.tick + WORK.IDLE_WANDER_TICKS };
          colonist.path = [];
          colonist.pathIndex = 0;
          colonist.pathGoal = null;
          colonist.task = 'sit';
          return;
        }
        colonist.path = path;
        colonist.pathIndex = 0;
        colonist.pathGoal = `idle:${activity.type}:${activity.startedTick}`;
        colonist.navRevision = sim.world.revision;
      }
      if (idlePathEntersUnsafe(sim, colonist, colonist.path.slice(colonist.pathIndex))) {
        colonist.idleActivity = null;
        colonist.path = [];
        colonist.pathIndex = 0;
        colonist.pathGoal = null;
        colonist.task = 'idle';
        return;
      }
      moveAlongPath(sim, colonist);
      return;
    }
    activity = colonist.idleActivity;
  }
  if (activity && activity.until > sim.tick) {
    if (activity.type === 'socialize' && !socialPartner(sim, colonist)) {
      colonist.task = 'sit';
      return;
    }
    applyIdleActivity(sim, colonist);
    return;
  }
  colonist.idleActivity = null;
  colonist.task = 'idle';
  colonist.nextWanderTick ??= sim.tick + WORK.IDLE_WANDER_TICKS + colonist.id * WORK.IDLE_WANDER_STAGGER;
  if (sim.tick < colonist.nextWanderTick) return;
  const pairSequence = Math.floor(sim.tick / WORK.IDLE_WANDER_TICKS) + Math.floor(colonist.id / 2) * 3;
  const activities = ['walk', 'socialize', 'sit', 'drink', 'sit', 'walk'];
  // Off unsafe ground the only leisure is to walk away to a safe spot.
  let type = stranded ? 'walk' : activities[pairSequence % activities.length];
  if (type === 'drink' && (!needsDrink(sim, colonist) || !drinkStock(sim, colonist))) type = 'sit';
  if (type === 'socialize') {
    const partner = sim.colonists.find((person) => person.id === (colonist.id ^ 1));
    if (!partner || partner.health <= 0 || partner.jobId !== null
      || (partner.personal && partner.personal.type !== 'rest')
      || (partner.task !== 'idle' && partner.idleActivity?.type !== 'socialize')) type = 'sit';
    else partner.nextWanderTick = Math.min(partner.nextWanderTick ?? sim.tick, sim.tick);
  }
  const target = idleDestination(sim, colonist, pairSequence, type);
  const targets = type === 'drink' ? stockTargets(sim, target) : [target];
  let path = findPath(sim, colonist, targets);
  if (idlePathEntersUnsafe(sim, colonist, path)) path = [];
  if (stranded && (path.length === 0 || !safeActivityPosition(sim, target.x, target.y))) {
    strandIdle(sim, colonist);
    return;
  }
  if (!safeActivityPosition(sim, target.x, target.y)
    || (path.length === 0 && !atTask(sim, colonist, { targets, range: 0 }))) type = 'sit';
  const duration = type === 'drink' ? NEEDS.DRINK_MINUTES : WORK.IDLE_WANDER_TICKS;
  const stagger = type === 'socialize' ? Math.floor(colonist.id / 2) * WORK.IDLE_WANDER_STAGGER : colonist.id * WORK.IDLE_WANDER_STAGGER;
  colonist.nextWanderTick = sim.tick + duration + WORK.IDLE_WANDER_TICKS + stagger;
  colonist.idleActivity = {
    type, phase: path.length > 0 && type !== 'sit' ? 'go' : 'active', until: sim.tick + duration,
    stockId: target.stockId ?? null, targetX: target.x, targetY: target.y, sequence: pairSequence, startedTick: sim.tick,
  };
  if (colonist.idleActivity.phase === 'active') startIdleActivity(sim, colonist, colonist.idleActivity);
  if (path.length === 0 || type === 'sit') {
    colonist.task = type === 'socialize' && !socialPartner(sim, colonist) ? 'sit' : type;
    return;
  }
  colonist.path = path;
  colonist.pathIndex = 0;
  colonist.pathGoal = `idle:${type}:${sim.tick}`;
  colonist.navRevision = sim.world.revision;
  colonist.targetX = path[path.length - 1].x;
  colonist.targetY = path[path.length - 1].y;
  moveAlongPath(sim, colonist);
}

function escapeFlood(sim, colonist) {
  const submerged = headSubmerged(sim, colonist.x, colonist.y);
  const resting = ['rest', 'sleep'].includes(colonist.personal?.type) || colonist.idleActivity
    || colonist.activity?.type === 'celebrating';
  const room = excavationAt(sim, Math.round(colonist.x), Math.round(colonist.y));
  const unsafeRest = resting && (room?.floodRatio ?? 0) > WATER.FLOOD_UNUSABLE_RATIO;
  if (!submerged && !unsafeRest && !colonist.floodEscape) return false;

  if (!submerged && !unsafeRest && (waterRatioAt(sim, colonist.x, colonist.y) < WATER.WADING_MIN_RATIO
    || colonist.pathIndex >= colonist.path.length)) {
    delete colonist.floodEscape;
    colonist.path = [];
    colonist.pathIndex = 0;
    colonist.pathGoal = null;
    if (colonist.activity?.type === 'carryingChild') dropCarriedChild(sim, colonist, true);
    return false;
  }
  if (colonist.jobId !== null) releaseJob(sim, colonist, WATER.FLOOD_ESCAPE_RETRY_TICKS);
  // Carry an already picked-up child to safety; never leave a dangling carriedBy link.
  if (colonist.activity?.type !== 'carryingChild') clearActivity(colonist);
  colonist.personal = null;
  colonist.idleActivity = null;
  const escape = colonist.floodEscape ??= { retryTick: sim.tick };
  const next = colonist.path[colonist.pathIndex];
  const target = colonist.path.at(-1);
  const invalid = colonist.pathGoal !== 'floodEscape' || colonist.navRevision !== sim.world.revision
    || (next && !isWalkable(sim, next.x, next.y))
    || (target && headSubmerged(sim, target.x, target.y));
  if (invalid || (!next && sim.tick >= escape.retryTick)) {
    const path = findFloodEscape(sim, colonist,
      submerged ? null : (x, y) => safeActivityPosition(sim, x, y));
    colonist.path = path;
    colonist.pathIndex = 0;
    colonist.pathGoal = 'floodEscape';
    colonist.navRevision = sim.world.revision;
    colonist.targetX = path.at(-1)?.x ?? null;
    colonist.targetY = path.at(-1)?.y ?? null;
    escape.retryTick = sim.tick + WATER.FLOOD_ESCAPE_RETRY_TICKS;
  }
  colonist.task = 'idle';
  moveAlongPath(sim, colonist);
  return true;
}

function applyCrisisBehavior(sim, colonist) {
  const crisis = colonist.crisis;
  if (colonist.personal || !crisis?.behavior || (crisis.until ?? 0) <= sim.tick) return false;
  const job = colonist.jobId === null ? null : getJob(sim, colonist.jobId);
  if (job && isLifeSupportJob(sim, job)) return false;
  if (colonist.jobId !== null) releaseJob(sim, colonist);
  colonist.idleActivity = null;
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
  colonist.task = crisis.behavior;
  colonist.animation += crisis.behavior === 'argue' ? 0.06 : 0.005;
  if (crisis.behavior === 'argue') {
    const other = sim.colonists.filter((person) => person.id !== colonist.id && person.health > 0 && !person.dead)
      .sort((a, b) => (Math.abs(a.x - colonist.x) + Math.abs(a.y - colonist.y))
        - (Math.abs(b.x - colonist.x) + Math.abs(b.y - colonist.y)) || a.id - b.id)[0];
    if (other) colonist.direction = Math.sign(other.x - colonist.x) || colonist.direction;
  }
  return true;
}

// Ticks a clearer keeps its pose after its face broke, waiting for the next
// face (the tick it broke included).
const CLEARING_HOLD_TICKS = 4;

// Living people inside the colony, standing underground under their own
// steam (not on the surface, carried, buried or isolated by a collapse).
function strandedWatch(sim, colonist) {
  const x = Math.round(colonist.x);
  const y = Math.round(colonist.y);
  return !colonist.dead && colonist.health > 0 && colonist.trappedIn == null
    && colonist.isolatedByCollapse == null && !colonist.surfaceCrewId && colonist.carriedBy == null
    && !colonist.returningFromSurface && sim.world.inBounds(x, y) && y >= WORLD.SURFACE_Y;
}

// Stocks holding the resource, split into those the colony's home walks to
// (`colony`) and all of them (`all`). A stock the home cannot reach (the
// autumn harvest crate at the surface collector, a pocket sealed by rock)
// says nothing about one person being cut off: in a famine everybody lacks
// food, nobody is stranded.
function colonyStocks(sim, origins, holds) {
  const all = sim.stocks.filter(holds);
  return { all, colony: all.filter((stock) => origins.some((origin) => stockReachable(sim, origin, stock))) };
}

const holdsFood = (sim, stock) => sim.excavation(stock.excavationId)?.roomType !== 'exodusDepot'
  && ((stock.resources.food ?? 0) > 0 || (stock.resources.meals ?? 0) > 0);
const holdsWater = (sim, stock) => (stock.resources.waterClean ?? 0) > 0;

// Cut off from a resource, standing on `spot`: the colony's home reaches some
// of it, the spot none at all. The stocks of a wing cut off by a collapse
// still feed the people inside it, who are not stranded while they last; the
// same rule judges where a colonist would land when he steps off a ledge.
function cutOffFrom(sim, spot, stocks) {
  return stocks.colony.length > 0 && !stocks.all.some((stock) => stockReachable(sim, spot, stock));
}

// The colony's home, where its stocks are counted from: the first cell the
// shelter reserve is reached from. Without a reserve (or one nobody can stand
// next to), the largest group of people inside the colony who share one
// navigation component, people already stranded left out of the count;
// between groups as large, the one that walks to more kinds of supplies (food,
// water), then the one with more people. Size comes first: a hauler stranded
// with his dropped load must not become the home of a starving colony.
// Somebody outside that component (a hauler stranded in a pocket with his
// dropped load, a worker in a wing cut off by a collapse) never widens what
// the colony reaches: in a famine, his little food would make everybody at
// home look cut off from food.
function colonyOrigins(sim) {
  const reserve = sim.stocks.find((stock) => stock.id === 'reserve');
  const target = reserve ? stockNavigationTargets(sim, reserve)[0] : null;
  if (target) return [target];
  const groups = new Map();
  for (const person of sim.colonists) {
    if (!strandedWatch(sim, person)) continue;
    const component = navigationComponent(sim, Math.round(person.x), Math.round(person.y));
    if (component < 0) continue;
    if (!groups.has(component)) groups.set(component, { people: [], settled: [] });
    const group = groups.get(component);
    group.people.push(person);
    if (person.strandedSince == null) group.settled.push(person);
  }
  // Kinds of supplies (food, water) the group walks to: 0, 1 or 2.
  const supplies = (group) => [holdsFood, holdsWater].filter((holds) => sim.stocks
    .some((stock) => holds(sim, stock) && stockReachable(sim, group.people[0], stock))).length;
  const rank = (group) => [group.settled.length, supplies(group), group.people.length];
  const outranks = (a, b) => {
    const index = a.findIndex((value, i) => value !== b[i]);
    return index >= 0 && a[index] > b[index];
  };
  let home = null;
  for (const group of groups.values()) {
    group.rank = rank(group);
    if (!home || outranks(group.rank, home.rank)) home = group;
  }
  if (!home) return [];
  return home.settled.length ? home.settled : home.people;
}

// A buried reserve can leave a lone survivor as the only group in
// colonyOrigins. The shelter's real entrance still gives us a way out to
// check, even when there is nobody left on the other side.
function strandedHomeComponent(sim, origins) {
  const reserve = sim.stocks.find((stock) => stock.id === 'reserve');
  let origin = reserve ? stockNavigationTargets(sim, reserve)[0] : null;
  if (!origin) {
    const hatch = surfaceHatch(sim);
    if (hatch.door || hatch.excavation) {
      const entrance = navigationComponent(sim, hatch.x, hatch.y);
      if (entrance >= 0) return entrance;
    }
    [origin] = origins;
  }
  return origin ? navigationComponent(sim, Math.round(origin.x), Math.round(origin.y)) : -1;
}

// A colonist cut off on a ledge steps off it when a drop of at most
// SAFE_FALL_CELLS rows beside it lands somewhere the same watch deems safe.
// Two rows cannot be climbed, but they can be jumped down.
function dropFromLedge(sim, colonist, isStrandedAt) {
  const x = Math.round(colonist.x);
  const y = Math.round(colonist.y);
  if (!isWalkable(sim, x, y)) return false;
  for (const side of [-1, 1]) {
    const column = x + side;
    if (!sim.world.inBounds(column, y) || !sim.world.isEmpty(column, y) || isWalkable(sim, column, y)) continue;
    let landing = -1;
    for (let row = y + 1; row <= y + WORK.SAFE_FALL_CELLS && sim.world.inBounds(column, row); row += 1) {
      if (!sim.world.isEmpty(column, row)) break;
      if (isWalkable(sim, column, row)) {
        landing = row;
        break;
      }
    }
    if (landing < 0) continue;
    const spot = { x: column, y: landing };
    if (isStrandedAt(spot)) continue;
    colonist.x = column;
    colonist.path = [];
    colonist.pathIndex = 0;
    colonist.pathGoal = null;
    return true;
  }
  return false;
}

// A living colonist cut off from every stock of food or clean water the rest
// of the colony reaches (a pit two rows deep, a sealed pocket) steps off a
// ledge when it can, and otherwise gets one warning per episode after a few
// hours. People buried or isolated by a collapse already have the rescue path.
function updateStranded(sim, origins) {
  let food = null;
  let water = null;
  let homeComponent = null;
  const isStrandedAt = (spot) => {
    if (cutOffFrom(sim, spot, food) || cutOffFrom(sim, spot, water)) return true;
    if (food.colony.length || water.colony.length) return false;
    // A shortage at home alone is not isolation. When both supplies are
    // missing there, only a separate pocket with no accessible supplies
    // needs the stranded warning.
    homeComponent ??= strandedHomeComponent(sim, origins);
    if (homeComponent < 0) return false;
    const component = navigationComponent(sim, Math.round(spot.x), Math.round(spot.y));
    return component >= 0 && component !== homeComponent
      && !food.all.some((stock) => stockReachable(sim, spot, stock))
      && !water.all.some((stock) => stockReachable(sim, spot, stock));
  };
  for (const colonist of sim.colonists) {
    if (!strandedWatch(sim, colonist)) {
      delete colonist.strandedSince;
      delete colonist.strandedWarned;
      continue;
    }
    // A digger at work on the face of a dig is not judged yet: the face it
    // stands on keeps changing until the job ends (the top row of a gallery
    // is often a short ledge until the row below it is open). An episode
    // already under way is kept: picking up dig jobs from a pit does not
    // restart its delay nor raise its warning again.
    if (colonist.jobId != null && getJob(sim, colonist.jobId)?.type === 'dig') continue;
    food ??= colonyStocks(sim, origins, (stock) => holdsFood(sim, stock));
    water ??= colonyStocks(sim, origins, (stock) => holdsWater(sim, stock));
    if (!isStrandedAt(colonist) || dropFromLedge(sim, colonist, isStrandedAt)) {
      delete colonist.strandedSince;
      delete colonist.strandedWarned;
      continue;
    }
    colonist.strandedSince ??= sim.tick;
    if (colonist.strandedWarned || sim.tick - colonist.strandedSince < WORK.STRANDED_WARNING_HOURS * TIME.TICKS_PER_HOUR) continue;
    colonist.strandedWarned = true;
    const x = Math.round(colonist.x);
    const y = Math.round(colonist.y);
    sim.log('warning', 'alertColonistStranded', { colonistId: colonist.id, name: colonist.name, x, y },
      { x, y, w: 0, h: 0 });
  }
}

// A fitted water or food room the colony could walk to, and no longer can (a
// collapse cut the gallery or shaft leading to it), gets one warning: its
// production and its stock are lost to the colony until a passage is dug
// again. The game plans that rescue passage itself when a safe one exists
// (collapseRescue.js), and the warning says which; each hour it completes a
// passage that no longer holds, or tries again when there was no safe one,
// and the warning says so when that changes. The journal says when the room
// is linked again. The colony is its home (colonyOrigins): where the shelter
// reserve is, where most of its people are without one.
function updateCutOffRooms(sim, origins) {
  let homes = null;
  const warn = (room, rescue) => sim.log('warning', rescue === 'planned' ? 'alertRoomCutOffRescue' : 'alertRoomCutOffNoPassage',
    { id: room.id, excavationId: room.id }, room);
  // A snapshot: planning or abandoning a passage changes the list.
  for (const room of [...sim.excavations]) {
    const category = ROOM_DEFS[room.roomType]?.category;
    if (room.state !== 'fitted' || (category !== 'water' && category !== 'food')) {
      // It caved in or serves something else: nothing to dig towards any more.
      if (room.cutOffRescue != null) roomRescueEnded(sim, room);
      continue;
    }
    if (!homes) {
      homes = new Set(origins.map((origin) => navigationComponent(sim, Math.round(origin.x), Math.round(origin.y))));
      homes.delete(-1);
    }
    const reachable = (room.dugCells ?? []).some((index) => {
      const { x, y } = sim.world.coords(index);
      return homes.has(navigationComponent(sim, x, y));
    });
    if (reachable) {
      if (room.colonyReachable === false) roomReconnected(sim, room, origins);
      room.colonyReachable = true;
      continue;
    }
    if (room.colonyReachable === false) {
      const before = room.cutOffRescue;
      const rescue = resumeRoomRescue(sim, room, homes);
      if (rescue && rescue !== before) warn(room, rescue);
      continue;
    }
    if (room.colonyReachable !== true) continue;
    room.colonyReachable = false;
    warn(room, rescueCutOffRoom(sim, room, homes));
  }
}

function updateReachability(sim) {
  if (sim.tick % TIME.TICKS_PER_HOUR !== 0) return;
  const origins = colonyOrigins(sim);
  updateStranded(sim, origins);
  updateCutOffRooms(sim, origins);
}

export function updateColonists(sim) {
  updateReachability(sim);
  for (const colonist of sim.colonists) {
    normalizeColonist(colonist);
    colonist.prevX = colonist.x;
    colonist.prevY = colonist.y;
    if (colonist.dead) {
      handleDeath(sim, colonist);
      continue;
    }
    if (colonist.carriedBy != null) {
      const parent = sim.colonists.find((person) => person.id === colonist.carriedBy);
      if (!parent || parent.dead || parent.health <= 0 || parent.activity?.type !== 'carryingChild') {
        delete colonist.carriedBy;
      } else {
        updateNeeds(sim, colonist);
        if (colonist.health <= 0) {
          handleDeath(sim, colonist);
          continue;
        }
        colonist.x = parent.x;
        colonist.y = parent.y;
        colonist.task = 'carried';
        colonist.path = [];
        colonist.pathIndex = 0;
        colonist.pathGoal = null;
        continue;
      }
    }
    if (colonist.surfaceCrewId) {
      colonist.returningFromSurface = true;
      updateNeeds(sim, colonist);
      // A crew member still underground and off its path (waiting for the
      // others, or with no way to the hatch yet) is subject to gravity like
      // everybody else: nobody floats over a cell dug out under them.
      if (colonist.health > 0 && colonist.y >= WORLD.SURFACE_Y && colonist.task !== 'climb') applyGravity(sim, colonist);
      if (colonist.health <= 0) handleDeath(sim, colonist);
      continue;
    }
    updateNeeds(sim, colonist);
    if (colonist.health <= 0) {
      handleDeath(sim, colonist);
      continue;
    }
    const baby = (colonist.age ?? PEOPLE.ADULT_AGE) < 1;
    if (colonist.returningFromSurface && returnFromSurface(sim, colonist)) continue;
    colonist.returningFromSurface = false;
    applyGravity(sim, colonist);
    if (colonist.health <= 0) {
      handleDeath(sim, colonist);
      continue;
    }
    if (colonist.trappedIn != null) {
      colonist.task = 'sit';
      continue;
    }
    if (prepareEvacuationMove(sim, colonist)) {
      moveAlongPath(sim, colonist);
      continue;
    }
    if (colonist.evacuationCarryingChild) {
      dropCarriedChild(sim, colonist);
      delete colonist.evacuationCarryingChild;
    }
    if (escapeFlood(sim, colonist)) continue;
    if (updateCelebration(sim, colonist)) continue;
    if (colonist.jobId !== null && (baby || !canWork(sim, colonist, getJob(sim, colonist.jobId)))) releaseJob(sim, colonist);
    if (colonist.personal?.type === 'study' && isEligibleForWork(sim, colonist)) {
      colonist.personal = null;
      colonist.pathGoal = null;
    }
    beginMourning(sim, colonist);
    beginChildCarry(sim, colonist);
    beginPersonal(sim, colonist);
    updatePersonal(sim, colonist);
    if (applyCrisisBehavior(sim, colonist)) continue;

    const job = colonist.jobId === null ? null : getJob(sim, colonist.jobId);
    const previousTask = colonist.task;
    const task = colonist.personal ? personalTask(sim, colonist) : (job ? getJobTask(sim, colonist, job) : null);
    if (!task) {
      // The digger just broke the shaft face this clearer worked on: keep the
      // clearing pose instead of flashing 'idle' (or starting an idle
      // activity) until the next face is assigned, which usually takes one to
      // three ticks and may go to someone else first (seed 11, prudent player:
      // four ticks at 536-540 since the human base's second pass). Capped, so
      // a clearer with no next face does stop.
      if (job?.type === 'dig' && job.role === 'clear' && job.status === 'done' && previousTask === 'clearing') {
        colonist.task = 'clearing';
        colonist.clearingHoldUntil = sim.tick + CLEARING_HOLD_TICKS;
        continue;
      }
      if (colonist.jobId === null && !colonist.personal && previousTask === 'clearing' && colonist.clearingHoldUntil > sim.tick) {
        colonist.task = 'clearing';
        continue;
      }
      if (colonist.clearingHoldUntil !== undefined) delete colonist.clearingHoldUntil;
      updateIdleWander(sim, colonist);
      continue;
    }
    if (colonist.clearingHoldUntil !== undefined) delete colonist.clearingHoldUntil;
    if (atTask(sim, colonist, task)) {
      colonist.path = [];
      colonist.pathIndex = 0;
      if (colonist.personal?.phase === 'go'
        || (colonist.personal?.type === 'carryChild' && colonist.personal.phase === 'pickup')) arrivePersonal(sim, colonist);
      else if (job) performJob(sim, colonist, job);
      continue;
    }

    if (colonist.pathGoal !== task.key || colonist.navRevision !== sim.world.revision || colonist.pathIndex >= colonist.path.length) {
      const path = findPath(sim, colonist, task.targets, undefined, undefined,
        sim.evacuationCount && !colonist.personal && isRescueJob(sim, job) ? { rescue: true } : null);
      if (path.length === 0) {
        failTask(sim, colonist);
        continue;
      }
      colonist.path = path;
      colonist.pathIndex = 0;
      colonist.pathGoal = task.key;
      colonist.navRevision = sim.world.revision;
      colonist.targetX = path[path.length - 1].x;
      colonist.targetY = path[path.length - 1].y;
    }
    moveAlongPath(sim, colonist);
    if (atTask(sim, colonist, task)) {
      colonist.path = [];
      colonist.pathIndex = 0;
      if (colonist.personal?.phase === 'go'
        || (colonist.personal?.type === 'carryChild' && colonist.personal.phase === 'pickup')) arrivePersonal(sim, colonist);
      else if (job) performJob(sim, colonist, job);
    }
  }
}

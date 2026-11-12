import { evacuatedAt, jobEvacuated } from './evacuation.js';
import { recordRescueDig } from './rescueNarrative.js';
import { AIR, CELL, CULTIVATION, EXCAVATION, NEEDS, SHAPES, STRUCTURE, TIME, WATER, WORK, WORLD } from '../data/balance.js';
import { M6 } from '../data/m6.js';
import { PEOPLE } from '../data/people.js';
import { COATINGS, LININGS, SUPPORT_PROPS } from '../data/linings.js';
import { materialAt } from '../data/materials.js';
import { poiDefinition } from '../data/poi/definitions.js';
import { ROOM_DEFS, foodInputsPerDay, productionScale, roomJobCount } from '../data/rooms.js';
import { REPAIRS } from '../data/repairs.js';
import { EXODUS } from '../data/surface.js';
import { recipeDefinition } from '../data/recipes.js';
import { digCell, finishIfDug, remainingCells } from './excavation.js';
import { excavationReachable, findPath, isWalkable, isWalkableIn, navigationComponent, navigationTargets, pathCost, rebuildNav } from './nav.js';
import { completeFitting } from './rooms.js';
import { addToStock, createStock, ensureRoomStock, hasResources, isExodusStockReserved, nearestStock, reserveStock, roomStock, spendResources, stockConsumesResource, stockNavigationTargets, stockReachable, stocksConnected } from './resources.js';
import { isEligibleForWork } from './lifecycle.js';
import { infectionWorkFactor } from './afflictions.js';
import { isStriking, lawEffect, lawMultiplier } from './laws.js';
import { isResearched } from './research.js';
import { supportReplaceable } from './structure.js';
import { starvingWorkFactor } from './condition.js';
import { headSubmerged } from './immersion.js';

// The urgency of shoring (or serving the shoring of) a room about to give way.
const STRUCTURAL_URGENCY = -9000;

function makeJob(sim, type, excavationId, extra = {}) {
  const job = {
    id: sim.nextJobId++,
    type,
    excavationId,
    status: 'queued',
    colonistId: null,
    phase: 'work',
    work: 0,
    retryTick: 0,
    createdTick: sim.tick,
    ...extra,
  };
  sim.jobs.push(job);
  return job;
}

function existingJob(sim, type, excavationId) {
  return sim.jobs.find((job) => job.type === type && job.excavationId === excavationId && job.status !== 'done') ?? null;
}

export function getJob(sim, id) {
  return sim.jobs.find((job) => job.id === id) ?? null;
}

// Avant de planifier quoi que ce soit : un ordre de creusage dont le soutènement
// choisi n'est pas payable est refusé avec la raison. Sinon la salle était
// creusée nue et s'effondrait sans que personne ne dise pourquoi.
// Le plafond d'un hall ou d'une galerie suit sa largeur ; les parois d'un
// puits suivent sa hauteur. Même métrage pour la réservation et pour la pose.
function liningLength(excavation) {
  return excavation.kind === 'shaft' ? excavation.h : excavation.w;
}

export function digLiningAvailable(sim, order) {
  const lining = order?.lining ?? 'none';
  if (lining === 'none') return { ok: true };
  const definition = LININGS[lining];
  if (!definition) return { ok: false, error: 'invalidPlacement' };
  if (definition.locked && !isResearched(sim, lining)) return { ok: false, error: 'researchLocked' };
  // Hors dimensions valides, laisser planExcavation donner son propre motif.
  const length = liningLength(order);
  if (!Number.isInteger(length) || length < 1 || length > EXCAVATION.MAX_DIMENSION) return { ok: true };
  const cost = Object.fromEntries(Object.entries(definition.cost).map(([resource, amount]) => [resource, amount * length]));
  if (!hasResources(sim, cost)) return { ok: false, error: 'digLiningNoResources', cost };
  return { ok: true };
}

export function queueExcavation(sim, excavation) {
  if (!excavation || excavation.state === 'collapsed') return { ok: false, error: 'invalidPlacement' };
  if (excavation.targetLining && excavation.targetLining !== 'none') {
    const lining = queueLining(sim, excavation, excavation.targetLining);
    if (!lining.ok) {
      // Ne jamais creuser en silence une salle dont le soutènement a été refusé.
      excavation.targetLining = 'none';
      return lining.error === 'noResources' ? { ok: false, error: 'digLiningNoResources' } : lining;
    }
  }
  replenishDigJobs(sim, excavation);
  return { ok: true, job: sim.jobs.find((job) => job.type === 'dig' && job.excavationId === excavation.id && job.status !== 'done') ?? null };
}

export function queueLining(sim, excavation, lining) {
  const definition = LININGS[lining];
  if (!excavation || !definition || excavation.state === 'collapsed') return { ok: false, error: 'invalidPlacement' };
  if (definition.locked && !isResearched(sim, lining)) return { ok: false, error: 'researchLocked' };
  if (lining === 'none') {
    excavation.targetLining = 'none';
    return { ok: true, job: null };
  }
  const cost = Object.fromEntries(Object.entries(definition.cost).map(([resource, amount]) => [resource, amount * liningLength(excavation)]));
  const existing = existingJob(sim, 'lining', excavation.id);
  if (existing?.paid && existing.lining !== lining) refundJob(sim, existing);
  if (!hasResources(sim, cost)) return { ok: false, error: 'noResources' };
  excavation.targetLining = lining;
  if (existing) {
    existing.lining = lining;
    existing.cost = cost;
    return { ok: true, job: existing };
  }
  return { ok: true, job: makeJob(sim, 'lining', excavation.id, { lining, cost, paid: false }) };
}

export function queueCoating(sim, excavation, coating) {
  if (!excavation || !COATINGS[coating] || excavation.state === 'collapsed') return { ok: false, error: 'invalidPlacement' };
  if (!['none', 'waterproof'].includes(coating) && !isResearched(sim, coating)) return { ok: false, error: 'researchLocked' };
  // Le doublage en plomb consomme le minerai extrait : au mètre de longueur,
  // comme un soutènement, et refus lisible si le plomb manque.
  const coatingCost = (cost, width) => Object.fromEntries(Object.entries(cost)
    .map(([resource, amount]) => [resource, amount * width]));
  const cost = COATINGS[coating].cost ? coatingCost(COATINGS[coating].cost, liningLength(excavation)) : null;
  if (cost && !hasResources(sim, cost)) return { ok: false, error: 'noResources' };
  const existing = existingJob(sim, 'coating', excavation.id);
  if (existing) {
    if (existing.coating !== coating) {
      if (existing.paid && existing.cost) refundJob(sim, existing);
      existing.coating = coating;
      existing.cost = cost;
      existing.paid = false;
    }
    return { ok: true, job: existing };
  }
  return { ok: true, job: makeJob(sim, 'coating', excavation.id, { coating, ...(cost ? { cost, paid: false } : {}) }) };
}

export function queueSupport(sim, excavation, x, material = 'wood') {
  const definition = SUPPORT_PROPS[material];
  if (!excavation || !definition || !Number.isInteger(x) || x < excavation.x || x >= excavation.x + excavation.w || excavation.state === 'collapsed') {
    return { ok: false, error: 'invalidPlacement' };
  }
  const occupied = excavation.supports.find((support) => (typeof support === 'number' ? support : support.x) === x);
  if (occupied !== undefined && !supportReplaceable(occupied)) return { ok: false, error: 'supportOccupied' };
  const existing = sim.jobs.find((job) => job.type === 'support' && job.excavationId === excavation.id && job.x === x && job.status !== 'done');
  if (existing) return { ok: false, error: 'supportPending' };
  if (!hasResources(sim, definition.cost)) return { ok: false, error: 'noResources' };
  return { ok: true, job: makeJob(sim, 'support', excavation.id, { x, material, cost: { ...definition.cost }, paid: false }) };
}

export function queueRepair(sim, excavation) {
  if (excavation?.machineBroken) return queueMachineRepair(sim, excavation);
  if (!excavation || excavation.state === 'collapsed') return { ok: false, error: 'invalidPlacement' };
  const cap = repairCap(excavation);
  if (excavation.integrity >= 100) return { ok: false, error: 'repairNotNeeded' };
  if (excavation.integrity >= cap) return { ok: false, error: 'repairCapped' };
  const existing = existingJob(sim, 'repair', excavation.id);
  if (existing) return { ok: true, job: existing };
  const cost = { stone: STRUCTURE.REPAIR_STONE_COST };
  // Le coût n'est affiché nulle part ailleurs : dire ce qui manque et où le trouver.
  if (!hasResources(sim, cost)) return { ok: false, error: 'repairNeedsStone', missing: cost };
  return { ok: true, job: makeJob(sim, 'repair', excavation.id, { cost, paid: false }) };
}

export function isMachineRoom(excavation) {
  const definition = ROOM_DEFS[excavation?.roomType];
  return Boolean(definition && (definition.powerKw > 0 || definition.generationKw > 0
    || definition.generationPerWorkerKw > 0));
}

export function queueMachineRepair(sim, excavation) {
  if (!excavation?.machineBroken || excavation.state === 'collapsed' || !isMachineRoom(excavation)) {
    return { ok: false, error: 'repairNotNeeded' };
  }
  const existing = existingJob(sim, 'machineRepair', excavation.id);
  if (existing) return { ok: true, job: existing };
  return { ok: true, job: makeJob(sim, 'machineRepair', excavation.id, {
    roomType: excavation.roomType, paid: false, cost: null, requiredWork: null,
  }) };
}

function prepareMachineRepair(sim, excavation, job) {
  if (job.paid) return true;
  // A delivered or carried part stays allocated to this repair until payment.
  const incoming = sim.jobs.some((candidate) => candidate.type === 'stockHaul'
    && candidate.status !== 'done' && candidate.parentJobId === job.id);
  if (!incoming) {
    const parts = hasResources(sim, REPAIRS.PARTS_COST);
    const metal = !parts && hasResources(sim, REPAIRS.METAL_COST);
    if (!parts && !metal) return false;
    job.cost = { ...(parts ? REPAIRS.PARTS_COST : REPAIRS.METAL_COST) };
    job.requiredWork = parts ? REPAIRS.PARTS_WORK_TICKS : REPAIRS.METAL_WORK_TICKS;
  }
  return job.cost && requestRoomResources(sim, excavation, job.cost, false, job.id);
}

function ensureHaulJobs(sim, excavation) {
  if (excavation.state === 'collapsed') return;
  excavation.loose ??= {};
  const reserved = {};
  for (const job of sim.jobs) {
    if (job.type !== 'haul' || job.excavationId !== excavation.id || job.status === 'done' || job.phase !== 'pickup' || !job.resource) continue;
    reserved[job.resource] = (reserved[job.resource] ?? 0) + job.amount;
  }
  for (const resource of Object.keys(excavation.loose).sort()) {
    let available = Math.max(0, excavation.loose[resource] - (reserved[resource] ?? 0));
    while (available > 0) {
      const amount = Math.min(WORK.CARRY_CAPACITY, available);
      makeJob(sim, 'haul', excavation.id, { phase: 'pickup', resource, amount, stockId: null });
      available -= amount;
    }
  }
}

function digSkill(sim, colonist) {
  const base = 1 + ((colonist.skills.dig ?? WORK.BASE_DIG_SKILL) - WORK.BASE_DIG_SKILL) * WORK.DIG_SKILL_BONUS;
  return base * (colonist.workFactor ?? 1) * infectionWorkFactor(colonist) * lawMultiplier(sim, 'workFactor', 1);
}

function requiredDigWork(sim, excavation, index) {
  const hardness = materialAt(sim.world.materials[index]).hardness;
  const shapeFactor = SHAPES[excavation.shape]?.digFactor ?? SHAPES.flat.digFactor;
  return hardness * WORK.MINUTES_PER_HOUR * shapeFactor;
}

// Lecture seule : la salle n'a qu'une tâche d'attente, faute de front de taille
// qu'un mineur puisse atteindre (pas de galerie, de puits ni de porte jusqu'à elle).
export function digWaitingAccess(sim, excavation, minimumTicks = TIME.TICKS_PER_HOUR) {
  if (!excavation || !['planned', 'digging'].includes(excavation.state)) return false;
  const jobs = sim.jobs.filter((job) => job.type === 'dig' && job.excavationId === excavation.id && job.status !== 'done');
  if (jobs.length === 0 || jobs.some((job) => job.cellIndex !== null)) return false;
  return jobs.some((job) => sim.tick - (job.createdTick ?? sim.tick) >= minimumTicks);
}

// Une fois par salle, après une demi-journée sans accès, et seulement si aucun
// autre creusage n'est en train d'ouvrir un chemin vers elle.
function warnDigWithoutAccess(sim, excavation) {
  if (sim.tick % TIME.TICKS_PER_HOUR !== 0 || !digWaitingAccess(sim, excavation, TIME.TICKS_PER_DAY / 2)) return;
  if (sim.jobs.some((job) => job.type === 'dig' && job.status !== 'done' && job.cellIndex !== null && job.excavationId !== excavation.id)) return;
  if (sim.journal.some((entry) => entry.code === 'eventDigNoAccess' && entry.params?.id === excavation.id)) return;
  sim.log('warning', 'eventDigNoAccess', { id: excavation.id, excavationId: excavation.id }, excavation);
}

// Held cells. The dig-safety rules hold back every cell an excavation has
// left: none is free to be worked from a safe stand that somebody can reach,
// or its opening would drop or cut off somebody (rules A and D, with what a
// hidden place opens). Cells handed out earlier stay queued, so the room's
// only task is never a waiting one and eventDigNoAccess stays silent: the
// room was "being dug" for ever and the game said nothing (review of
// 4615b3c: v5b pre 205, the corner next to the opened sewer). Nobody is at
// work on it, and somebody can dig: a room that waits for a free digger, a
// night, a meal or a crisis is not held. Returns 'cells' then.
// A room with no face anybody can reach (only a waiting task, for half a day)
// is eventDigNoAccess's, once per room, while no other room's handed-out cell
// may still open a way to it. Returns 'access' when that warning stays silent
// although nothing can move: it spoke before the room got a face again and
// lost it (a second wait), or the cells other rooms keep handed out are left
// over on a finished room (ms bur 80) or held for half a day (hz two 172).
// Read only.
function digHeld(sim, excavation, remaining) {
  const jobs = sim.jobs.filter((job) => job.type === 'dig' && job.excavationId === excavation.id && job.status !== 'done');
  if (jobs.length === 0 || jobs.some((job) => job.status === 'active')) return null;
  if (!sim.colonists.some((person) => canWork(sim, person, { type: 'dig' }))) return null;
  if (jobs.some((job) => job.cellIndex !== null)) return cellsHeld(sim, excavation, remaining, jobs);
  if (!digWaitingAccess(sim, excavation, TIME.TICKS_PER_DAY / 2)) return null;
  const waitingSince = Math.min(...jobs.map((job) => job.createdTick ?? sim.tick));
  if (sim.journal.some((entry) => entry.code === 'eventDigNoAccess' && entry.params?.id === excavation.id && entry.tick >= waitingSince)) return null;
  const blockers = sim.jobs.filter((job) => job.type === 'dig' && job.status !== 'done' && job.cellIndex !== null && job.excavationId !== excavation.id);
  return blockers.every((job) => {
    const other = sim.excavation(job.excavationId);
    if (!other || !['planned', 'digging'].includes(other.state) || !remainingCells(sim, other).includes(job.cellIndex)) return true;
    return other.digHold != null && other.digHold.since !== null && sim.tick - other.digHold.since >= TIME.TICKS_PER_DAY / 2;
  }) ? 'access' : null;
}

// A safe face can make progress only if it has a job or the queue has room
// for one. An unreachable queued job can otherwise keep a free face idle.
function cellsHeld(sim, excavation, remaining, jobs) {
  const reserved = new Set(jobs.map((job) => job.cellIndex));
  const full = jobs.length >= WORK.MAX_DIGGERS_PER_EXCAVATION;
  const workable = digWorkability(sim, excavation);
  const nav = rebuildNav(sim);
  if (remaining.some((index) => (!full || reserved.has(index))
    && digFrontOpen(sim, excavation, index, reserved.has(index - sim.world.width), workable, nav))) return null;
  return full && !remaining.some(workable) ? 'unreached' : 'cells';
}

// A room with only a waiting task may have a face within reach that the rules
// hold back (rules A and D): somebody stands on it, or opening it would cut
// somebody off (v5b pre 226: two stranded colonists stand on its last cell).
// Its warning then speaks of falls, not of reach. Returns that cell.
function heldFace(sim, excavation, remaining) {
  const workable = digWorkability(sim, excavation);
  const nav = rebuildNav(sim);
  return remaining.find((index) => workable(index) && !digGateBlocks(sim, excavation, index, false, workable)
    && (dropsStander(sim, excavation, index, nav) || cutsWayBack(sim, excavation, index, nav)));
}

// One warning per episode, half a day after the room stopped, focused on a
// held cell (or on the room nobody can reach). The excavation keeps
// digHold = { since, left, told } while it is held, and once told until it
// makes progress (fewer cells left): it is saved with the game, so a game
// reloaded in mid-episode says it at the same tick. since is null while a
// told room is not held. A new episode needs a new half day. Nothing else
// changes: no job, order, speed or pause depends on it.
function warnDigHeld(sim, excavation, remaining) {
  if (sim.tick % TIME.TICKS_PER_HOUR !== 0) return;
  let hold = excavation.digHold ?? null;
  if (hold && hold.left !== remaining.length) {
    delete excavation.digHold;
    hold = null;
  }
  const reason = digHeld(sim, excavation, remaining);
  if (!reason) {
    if (hold?.told) hold.since = null;
    else if (hold) delete excavation.digHold;
    return;
  }
  const waitingSince = Math.min(...sim.jobs.filter((job) => job.type === 'dig' && job.excavationId === excavation.id
    && job.status !== 'done').map((job) => job.createdTick ?? sim.tick));
  const since = reason === 'access' ? waitingSince : sim.tick;
  if (!hold) hold = excavation.digHold = { since, left: remaining.length, told: false };
  else if (hold.since === null) hold.since = since;
  if (hold.told || sim.tick - hold.since < TIME.TICKS_PER_DAY / 2) return;
  hold.told = true;
  const params = { id: excavation.id, excavationId: excavation.id, count: remaining.length };
  const face = reason === 'access' ? heldFace(sim, excavation, remaining) : undefined;
  if (reason === 'unreached' || (reason === 'access' && face === undefined)) {
    sim.log('warning', 'eventDigUnreached', params, excavation);
    return;
  }
  const queued = sim.jobs.find((job) => job.type === 'dig' && job.excavationId === excavation.id && job.status !== 'done'
    && remaining.includes(job.cellIndex));
  sim.log('warning', 'eventDigHeld', params, sim.world.coords(face ?? (queued ? queued.cellIndex : remaining[0])));
}

// The excavation panel's hint: held now, and told (no progress since). A
// room nobody can reach keeps its own hint (digNoAccessHint).
export function digHeldHint(sim, excavation) {
  const hold = excavation?.digHold;
  return Boolean(hold?.told) && hold.since !== null && ['planned', 'digging'].includes(excavation.state)
    && remainingCells(sim, excavation).length === hold.left && !digWaitingAccess(sim, excavation);
}

// Rooms and galleries never widen a lower row under rock: a cell next to an
// already open cell of its own row is not opened while the cell right above
// it, in the same excavation, is still rock that a healthy colonist can work.
// Several diggers on a floor otherwise run a lower row wider than the row
// above it, under a rock roof that is not meant to carry it (a red structure
// flash during normal digging). Such a cell is only handed out together with
// the rock above it (a face advances as a whole wall): its digger loosens it
// while the rock above is worked, but opens it only once that rock has fallen.
// A digger does not stand idle on a loosened cell: unless the rock above is
// about to fall (WORK.DIG_WAIT_UPPER_TICKS), it leaves the loosened work on
// the cell and takes other work, and the cell is handed out again (and opened
// at once) when the rock above has fallen. A row's first opening, from
// a shaft or a gallery outside the excavation, spans one cell and may go first.
// When nobody can reach the upper cell the lower one is dug anyway: digging
// never stalls on this rule. Shafts are dug from their open end and are not
// concerned.
function undercutsWorkableCell(sim, excavation, index, workable) {
  if (excavation.kind !== 'room' && excavation.kind !== 'gallery') return false;
  return undercutsCell(sim, excavation, index) && workable(index - sim.world.width);
}

// Geometry only: opening this cell would widen its row under rock of the same
// excavation.
function undercutsCell(sim, excavation, index) {
  const { width } = sim.world;
  const upper = index - width;
  if (upper < 0 || sim.world.states[upper] !== CELL.SOLID || !excavation.cells.includes(upper)) return false;
  const x = index % width;
  const openInRow = (side) => sim.world.states[side] === CELL.EMPTY && excavation.cells.includes(side);
  return (x > 0 && openInRow(index - 1)) || (x + 1 < width && openInRow(index + 1));
}

// Hand-out gate of rule C. A cell that would widen its row under workable rock
// is handed out only while that rock is itself reserved, and only if nobody
// has loosened it yet: a loosened cell waits, without a digger, for the rock
// above to fall.
function digGateBlocks(sim, excavation, index, upperReserved, workable) {
  if (upperReserved && !((excavation.work?.[index] ?? 0) > 0)) return false;
  return undercutsWorkableCell(sim, excavation, index, workable);
}

function digFrontOpen(sim, excavation, index, upperReserved, workable, nav) {
  return workable(index) && !digGateBlocks(sim, excavation, index, upperReserved, workable)
    && !dropsStander(sim, excavation, index, nav) && !cutsWayBack(sim, excavation, index, nav);
}

// Memoized "a healthy colonist can work this cell" for one synchronous pass.
function digWorkability(sim, excavation, first = null) {
  let healthy = null;
  const cells = new Map();
  return (index) => {
    if (!cells.has(index)) {
      const { x, y } = sim.world.coords(index);
      healthy ??= sim.colonists.filter((person) => person !== first && canWork(sim, person, { type: 'dig' }));
      cells.set(index, Boolean(first && canWorkCell(sim, first, excavation, x, y))
        || healthy.some((person) => canWorkCell(sim, person, excavation, x, y)));
    }
    return cells.get(index);
  };
}

// Rows a colonist standing right on this rock cell drops once it is opened:
// down through it to the first cell that stands on rock or hangs on a ladder.
// 0 when that cell is no floor: the colonist above hangs on a ladder, or the
// cell belongs to a shaft (it becomes a ladder, its landing holds).
// With `opened` (a set), those other rock cells count as open too: the cells a
// hidden place opens at the same time (revealedWith).
function openingFall(sim, excavation, index, nav, opened = null) {
  if (excavation.kind === 'shaft') return 0;
  const { width, height } = sim.world;
  if (index < width || nav.ladders[index - width]) return 0;
  const x = index % width;
  const top = (index - x) / width;
  let row = top;
  while (row + 1 < height) {
    const cell = row * width + x;
    const under = cell + width;
    if (nav.ladders[cell] || nav.ladders[under] || (sim.world.states[under] === CELL.SOLID && !opened?.has(under))) break;
    row += 1;
  }
  return row - top + 1;
}

// Rock cells a hidden place (a point of interest not explored yet: a sewer, a
// cave pocket) opens at once when this cell is dug (discoverPoi opens all its
// cells): its other cells. Empty when the cell belongs to no such place.
function revealedWith(sim, index) {
  const items = sim.m5?.poi?.items;
  if (!items || items.length === 0) return [];
  const { width } = sim.world;
  const x = index % width;
  const y = (index - x) / width;
  const cells = [];
  for (const poi of items) {
    if (poi.explored || !poiDefinition(poi.type)?.open || !poi.cells.some((cell) => cell.x === x && cell.y === y)) continue;
    for (const cell of poi.cells) {
      const other = sim.world.index(cell.x, cell.y);
      if (other !== index && sim.world.states[other] === CELL.SOLID) cells.push(other);
    }
  }
  return cells;
}

// The cells opened when this one is dug: itself, and what a hidden place
// opens with it (null when nothing else opens). Memoized per world revision:
// a place opens only by changing cells.
const revealMemo = new WeakMap();

function openedWith(sim, index) {
  let memo = revealMemo.get(sim.world);
  if (!memo || memo.revision !== sim.world.revision || memo.items !== sim.m5?.poi?.items) {
    memo = { revision: sim.world.revision, items: sim.m5?.poi?.items, cells: new Map() };
    revealMemo.set(sim.world, memo);
  }
  if (!memo.cells.has(index)) {
    const revealed = revealedWith(sim, index);
    memo.cells.set(index, revealed.length > 0 ? new Set([index, ...revealed]) : null);
  }
  return memo.cells.get(index);
}

function living(person) {
  return !person.dead && person.health > 0 && person.carriedBy == null;
}

// Navigation components of the colony's home: the shelter reserve's, or the
// diggers' when there is no reserve.
function homeComponents(sim) {
  const reserve = sim.stocks.find((stock) => stock.id === 'reserve');
  const anchor = reserve ? stockNavigationTargets(sim, reserve)[0] : null;
  const label = anchor ? navigationComponent(sim, anchor.x, anchor.y) : -1;
  return label >= 0 ? new Set([label]) : colonyComponents(sim);
}

// A colonist cut off from the colony (on a rock pillar over a cave whose
// surroundings were dug away) has no way out but down: the floor under them may
// be opened when the fall leaves them alive (WORK.RESCUE_FALL_MIN_HEALTH left),
// as the game did before the dig safety rules. Waiting would starve them where
// they stand; landing in a closed cave leaves them no worse off. A fall that
// would kill them waits: the player has until they starve to reach them.
function cutOffFromHome(sim, person) {
  const label = navigationComponent(sim, Math.round(person.x), Math.round(person.y));
  return !homeComponents(sim).has(label) && !waitingComponents(sim).has(label);
}

// The cells next to the rubble of a collapse: the passage the rescue digs
// through that rubble (collapseRescue.js planRescue) arrives there. A rock
// pillar does not touch it.
function rubbleSides(sim) {
  const { width } = sim.world;
  const size = width * sim.world.height;
  const sides = [];
  for (const source of sim.excavations) {
    if (source.state !== 'collapsed') continue;
    for (const index of source.cells ?? []) {
      if (sim.world.states[index] !== CELL.SOLID) continue;
      const x = index % width;
      if (x > 0) sides.push(index - 1);
      if (x < width - 1) sides.push(index + 1);
      if (index >= width) sides.push(index - width);
      if (index + width < size) sides.push(index + width);
    }
  }
  return sides;
}

// What a part of the colony cut off from the shelter must reach for the
// people there to wait (it is no pillar): food and clean water (a wing a
// collapse cut off with its own farm and cistern, as colonists.js cutOffFrom
// judges it); or a water or food room the game digs a passage to
// (collapseRescue.js); or, for people a collapse isolated, the rubble the
// rescue digs its passage through (a wing without stocks of its own). Each
// need is a list of groups of cells: a part waits when it holds a cell of
// every group of one need. The isolated are those standing in `isolated`
// (navigation components), by default where somebody isolated stands now.
function waitingNeeds(sim, isolated = null) {
  const { width } = sim.world;
  const label = (index) => navigationComponent(sim, index % width, (index - (index % width)) / width);
  const stands = (holds) => sim.stocks.filter(holds)
    .flatMap((stock) => stockNavigationTargets(sim, stock).map(({ x, y }) => y * width + x));
  const needs = [[
    stands((stock) => sim.excavation(stock.excavationId)?.roomType !== 'exodusDepot'
      && ((stock.resources.food ?? 0) > 0 || (stock.resources.meals ?? 0) > 0)),
    stands((stock) => (stock.resources.waterClean ?? 0) > 0),
  ], [sim.excavations.filter((room) => room.cutOffRescue === 'planned').flatMap((room) => room.dugCells ?? [])]];
  if (!isolated) {
    isolated = new Set(sim.colonists.filter((person) => living(person) && person.isolatedByCollapse != null)
      .map((person) => navigationComponent(sim, Math.round(person.x), Math.round(person.y))));
    isolated.delete(-1);
  }
  if (isolated.size > 0) needs.push([rubbleSides(sim).filter((index) => isolated.has(label(index)))]);
  return needs;
}

// The parts of the colony where people wait cut off from the shelter (their
// navigation components): each holds what one need asks (waitingNeeds).
// People there wait: the rescue (rule A) lets nobody down from there, and the
// way back (rule D) takes such a part as home while it still reaches what it
// waits on (mapStands).
function waitingComponents(sim, needs = waitingNeeds(sim)) {
  const { width } = sim.world;
  const label = (index) => navigationComponent(sim, index % width, (index - (index % width)) / width);
  const labels = new Set();
  for (const need of needs) {
    const [first, ...others] = need.map((cells) => new Set(cells.map(label)));
    for (const part of first) if (part >= 0 && others.every((held) => held.has(part))) labels.add(part);
  }
  return labels;
}

function survivesFall(person, fall) {
  const damage = Math.max(0, fall - WORK.SAFE_FALL_CELLS) * WORK.FALL_DAMAGE_PER_CELL;
  return person.health - damage >= WORK.RESCUE_FALL_MIN_HEALTH;
}

// The rescue, for everybody a cell would drop further than SAFE_FALL_CELLS.
// It applies only when all of them stand on the cell above (nobody in the air)
// and are cut off from the colony: nobody there has another way out. Then the
// cell is opened when at least one of them survives the fall, as the game did
// before the dig safety rules (those who would not survive die of the fall, as
// they did then; waiting would starve the whole group). When none of them
// would survive, it waits. Anybody with a way out, or in the air, keeps the
// cell shut (rule A).
function rescueDrop(sim, drops) {
  if (drops.length === 0) return false;
  if (drops.some(({ standing }) => !standing)) return false;
  // Everybody standing on that one cell shares its navigation component; a
  // hidden place opening at the same time may drop others elsewhere.
  if (drops.some(({ person }) => !cutOffFromHome(sim, person))) return false;
  return drops.some(({ person, fall }) => survivesFall(person, fall));
}

// Everybody whose fall ends on the cell right above this rock cell, with the
// rows each would drop in all once it is opened: whoever stands there, and
// whoever is still above it over open cells of the same column (dropping from
// a floor dug a tick before, or walking a path over it), counting the rows
// already fallen. Two stacked cells opened on consecutive ticks must not add
// up to a long drop for somebody still in the air (review of f194802: a miner
// opened her own floor, one row, and the loosened cell under it was opened
// the next tick, before she landed: a twelve-row fall).
function dropsOnOpening(sim, excavation, index, nav, opened = null) {
  const { width } = sim.world;
  const x = index % width;
  const top = (index - x) / width - 1;
  const fall = openingFall(sim, excavation, index, nav, opened);
  const drops = [];
  if (fall === 0) return drops;
  for (const person of sim.colonists) {
    if (!living(person) || Math.round(person.x) !== x) continue;
    const row = Math.round(person.y);
    if (row > top) continue;
    let rests = true;
    for (let above = row; above < top && rests; above += 1) {
      const cell = above * width + x;
      rests = !nav.ladders[cell] && !nav.ladders[cell + width] && sim.world.states[cell + width] !== CELL.SOLID;
    }
    if (!rests) continue;
    const fallen = person.fallDistance > 0 ? person.fallDistance : 0;
    drops.push({ person, fall: fall + (top - row) + fallen, standing: row === top && fallen === 0 });
  }
  return drops;
}

// Nobody opens a floor that drops someone further than WORK.SAFE_FALL_CELLS
// (a cell over a natural cave): the cell waits for them to step away (or to
// land and step away), and the miners dig other cells meanwhile. A shorter
// drop stays allowed: it does not hurt. So does the drop that frees a group
// standing there cut off, when one of them at least survives it (rescueDrop).
// A cell of a hidden place opens the whole place at once: whoever stands over
// any of its cells counts, with the fall through all of them.
function dropsStander(sim, excavation, index, nav = rebuildNav(sim)) {
  if (index < sim.world.width) return false;
  const opened = openedWith(sim, index);
  const drops = (opened ? [...opened] : [index])
    .flatMap((cell) => dropsOnOpening(sim, excavation, cell, nav, opened))
    .filter(({ fall }) => fall > WORK.SAFE_FALL_CELLS);
  return drops.length > 0 && !rescueDrop(sim, drops);
}

// A miner does not work a rock cell standing on it when opening it would drop
// them further than WORK.SAFE_FALL_CELLS, unless that drop is the way out of
// a pillar they are cut off on (colonist given and standing there, and the
// rescue lets the group standing there down).
// Standing over a cell of a hidden place that this one opens counts the same.
function overDrop(sim, excavation, x, y, standX, standY, nav, colonist = null) {
  const index = sim.world.index(x, y);
  if (sim.world.states[index] !== CELL.SOLID) return false;
  const floor = sim.world.index(standX, standY + 1);
  let opened = null;
  if (floor !== index) {
    if (sim.world.states[floor] !== CELL.SOLID) return false;
    opened = openedWith(sim, index);
    if (!opened?.has(floor)) return false;
  } else opened = openedWith(sim, index);
  const fall = openingFall(sim, excavation, floor, nav, opened);
  if (fall <= WORK.SAFE_FALL_CELLS) return false;
  if (!colonist || Math.round(colonist.x) !== standX || Math.round(colonist.y) !== standY) return true;
  const standers = (opened ? [...opened] : [index])
    .flatMap((cell) => dropsOnOpening(sim, excavation, cell, nav, opened))
    .filter(({ standing, fall: drop }) => standing && drop > WORK.SAFE_FALL_CELLS);
  return !(standers.some(({ person }) => person === colonist) && rescueDrop(sim, standers));
}

// The way back. A miner working from a ledge of rock still to be dug (to reach
// a far cell over a cave) must keep a way back to the colony while he stands
// there: once cut off, the floor under him cannot be opened either (rule A),
// and he would starve on his pillar. The same holds on the floor of a room
// whose only way to the shaft crosses rock still to be dug over a cave. So a
// rock cell is not opened while that would cut off from the colony's home
// someone who could not get out by having his own floor dug within
// WORK.SAFE_FALL_CELLS. A short drop stays as it was: a miner cut off
// over one row (the top row of a room being dug top-down) is freed when his
// floor is dug. The cell waits, the miners dig other cells, and whoever stands
// beyond it walks back when his work is done.
//
// Opening a cell only takes away the stand right above it, so nothing is
// computed unless that stand is on a way the colony walks. Connectivity is a
// flood fill of the excavation's surroundings on the current geometry, from
// the stands that reach home (the shelter, or the part of the colony cut off
// from it where one waits: mapStands) without crossing any rock this
// excavation will dig; it is memoized per navigation map, and per opened cell.
const wayBackPlans = new WeakMap();

function digBox(sim, excavation) {
  const { width, height } = sim.world;
  const range = excavation.h + 1;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const index of excavation.cells) {
    const x = index % width;
    const y = (index - x) / width;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const pad = range + 1;
  const box = {
    range,
    x0: Math.max(0, minX - pad),
    x1: Math.min(width - 1, maxX + pad),
    y0: Math.max(1, minY - pad),
    y1: Math.min(height - 2, maxY + pad),
  };
  box.cols = box.x1 - box.x0 + 1;
  return box;
}

function boxCell(sim, plan, index) {
  const { width } = sim.world;
  const x = index % width;
  const y = (index - x) / width;
  if (x < plan.x0 || x > plan.x1 || y < plan.y0 || y > plan.y1) return -1;
  return (y - plan.y0) * plan.cols + (x - plan.x0);
}

// Walkable cells of the box in the given components that no digging of the
// excavation can take away: on a ladder, or on rock outside the excavation.
function robustSeeds(sim, plan, components) {
  const { width } = sim.world;
  const { nav } = plan;
  const seeds = [];
  for (let y = plan.y0; y <= plan.y1; y += 1) {
    for (let x = plan.x0; x <= plan.x1; x += 1) {
      const index = y * width + x;
      if (!nav.walkable[index]) continue;
      const below = index + width;
      if (plan.planned.has(below) && !nav.ladders[index] && !nav.ladders[below]) continue;
      if (components.has(navigationComponent(sim, x, y))) seeds.push(index);
    }
  }
  return seeds;
}

function wayBackPlan(sim, excavation, nav) {
  if (excavation.kind === 'shaft' || excavation.cells.length === 0) return null;
  const cached = wayBackPlans.get(excavation);
  const fresh = cached && cached.reachability === nav.reachability && cached.cells === excavation.cells
    && cached.revision === sim.world.revision;
  // The reserve does not move between two changes of the map; the diggers do.
  if (fresh && cached.anchor >= 0) return cached;
  let anchor = -1;
  let home = null;
  if (!fresh) {
    const reserve = sim.stocks.find((stock) => stock.id === 'reserve');
    const target = reserve ? stockNavigationTargets(sim, reserve)[0] : null;
    if (target && nav.walkable[sim.world.index(target.x, target.y)]) anchor = sim.world.index(target.x, target.y);
  }
  if (anchor < 0) {
    home = colonyComponents(sim);
    if (home.size === 0) return null;
  }
  const homeKey = anchor >= 0 ? `a${anchor}` : [...home].sort((a, b) => a - b).join(',');
  if (fresh && cached.homeKey === homeKey) return cached;
  const states = sim.world.states;
  const plan = {
    anchor,
    ...digBox(sim, excavation),
    reachability: nav.reachability,
    revision: sim.world.revision,
    homeKey,
    cells: excavation.cells,
    excavation,
    nav,
    planned: new Set(excavation.cells),
    afterOpening: new Map(),
  };
  if (anchor >= 0) {
    // The stands that reach home without standing on any rock of the
    // excavation still to be dug.
    plan.waiting = waitingAway(sim, anchor);
    plan.seeds = boxSeeds(sim, plan, mapStands(sim, plan, (index) => states[index] === CELL.SOLID && !plan.planned.has(index),
      (index) => states[index] === CELL.EMPTY, false));
  } else {
    plan.seeds = robustSeeds(sim, plan, home);
  }
  plan.seedSet = new Set(plan.seeds);
  plan.reach = digStands(sim, plan, (index) => states[index] === CELL.SOLID, (index) => states[index] === CELL.EMPTY);
  let final = null;
  plan.final = () => {
    if (final) return final;
    // The finished excavation, with what the hidden places it meets open
    // with it: their cells are no floor, and the stands that reach home are
    // taken again on the whole map without them.
    const ahead = revealsAhead(sim, plan);
    const solid = (index) => states[index] === CELL.SOLID && !plan.planned.has(index) && !ahead.has(index);
    const open = (index) => states[index] === CELL.EMPTY || plan.planned.has(index) || ahead.has(index);
    let view = plan;
    if (ahead.size > 0 && plan.anchor >= 0) {
      const anchored = mapStands(sim, plan, solid, (index) => states[index] === CELL.EMPTY || ahead.has(index), true);
      view = { ...plan, seeds: boxSeeds(sim, plan, anchored) };
    }
    final = digStands(sim, view, solid, open);
    return final;
  };
  wayBackPlans.set(excavation, plan);
  return plan;
}

// Stands of the whole map reached from home, for a given idea of floors and
// open cells; indexed by map cell. Home is the shelter reserve (the plan has
// one) and, for people cut off from it, the part of the colony where they
// wait (waitingComponents) as long as it still reaches, with those floors and
// openings, what it waits on: its food and water, the room its passage is dug
// to, the rubble. A hidden place that splits such a part leaves home only the
// side that still reaches it. `opening`: a hidden place opens in that
// geometry (waitingAway).
function mapStands(sim, plan, solidFloor, open, opening) {
  const { width, height } = sim.world;
  const flood = (seeds) => digStands(sim, { nav: plan.nav, x0: 0, x1: width - 1, y0: 0, y1: height - 2, cols: width, seeds },
    solidFloor, open);
  const seeds = [plan.anchor];
  for (const need of plan.waiting[opening ? 'opening' : 'now']) {
    const reached = need.map(flood);
    for (let index = 0; index < reached[0].length; index += 1) if (reached.every((stands) => stands[index])) seeds.push(index);
  }
  return flood(seeds);
}

// The needs (waitingNeeds) of the parts of the colony where people wait cut
// off from the shelter, other than the reserve's own part: each group keeps
// its cells in those parts. `now`: the rubble counts where somebody is
// isolated now. `opening`, for a geometry where a hidden place opens:
// everybody in those parts counts as isolated, since the opening may take
// their food or water away, and the game then isolates them (collapseRescue.js
// isolates whoever a collapse cuts off unsupplied) and digs its passage to them
// through the rubble. Not without an opening: the wing its own room cuts in
// two would count as home through its rubble, and the hidden place, with all
// that is dug through it, would stay shut for it (FIX-DIG J7).
function waitingAway(sim, anchor) {
  const { width } = sim.world;
  const label = (index) => navigationComponent(sim, index % width, (index - (index % width)) / width);
  const waiting = waitingComponents(sim);
  waiting.delete(label(anchor));
  if (waiting.size === 0) return { now: [], opening: [] };
  const away = (needs) => needs.map((need) => need.map((cells) => cells.filter((index) => waiting.has(label(index)))))
    .filter((need) => need.every((cells) => cells.length > 0));
  return { now: away(waitingNeeds(sim)), opening: away(waitingNeeds(sim, waiting)) };
}

function boxSeeds(sim, plan, anchored) {
  const { width } = sim.world;
  const seeds = [];
  for (let y = plan.y0; y <= plan.y1; y += 1) {
    for (let x = plan.x0; x <= plan.x1; x += 1) if (anchored[y * width + x]) seeds.push(y * width + x);
  }
  return seeds;
}

// Rock cells that the hidden places meeting the excavation's rock still to be
// dug open with it (as openedWith gives them): whichever of their cells is dug
// first, they are open by the time the excavation is finished.
function revealsAhead(sim, plan) {
  if (plan.ahead) return plan.ahead;
  const ahead = new Set();
  const states = sim.world.states;
  for (const poi of sim.m5?.poi?.items ?? []) {
    if (poi.explored || !poiDefinition(poi.type)?.open) continue;
    const cells = poi.cells.map((cell) => sim.world.index(cell.x, cell.y));
    if (!poiCellsInside(sim, poi).some((cell) => plan.planned.has(cell) && states[cell] === CELL.SOLID)) continue;
    for (const cell of cells) if (states[cell] === CELL.SOLID) ahead.add(cell);
  }
  plan.ahead = ahead;
  return ahead;
}

// The cells of a hidden place inside the world: only those can be dug, and
// open it (revealedWith). A place generated beyond the edge of a small world
// has no cell inside; its coordinates must not wrap onto the next row.
function poiCellsInside(sim, poi) {
  return poi.cells.filter((cell) => sim.world.inBounds(cell.x, cell.y)).map((cell) => sim.world.index(cell.x, cell.y));
}

// The excavation's rock that waits for a hidden place it meets to open: its
// own cells in that place and, rows going top-down (rule C), its cells under
// them. They stay rock until the place opens, and nobody knows when that is:
// rules A and D hold it while it would drop or cut off somebody.
function shutAhead(sim, plan) {
  if (plan.shut) return plan.shut;
  const { width } = sim.world;
  const states = sim.world.states;
  const ahead = revealsAhead(sim, plan);
  const shut = new Set();
  for (const cell of plan.cells) {
    if (!ahead.has(cell)) continue;
    for (let below = cell; plan.planned.has(below); below += width) if (states[below] === CELL.SOLID) shut.add(below);
  }
  plan.shut = shut;
  return shut;
}

// The way back once `index` is open, with every cell a hidden place opens
// with it (openedWith, as rule A sees it): the cells that open, the seeds that
// still reach home (mapStands), and the stands connected to them. A hidden
// place opens the same cells whichever of its cells is dug: one analysis
// serves them all. The finished excavation (plan.final) already has those
// cells open.
function wayBackAfter(sim, plan, index) {
  const opened = openedWith(sim, index) ?? new Set([index]);
  const key = opened.size > 1 ? [...opened].sort((a, b) => a - b).join(',') : index;
  let after = plan.afterOpening.get(key);
  if (after) return after;
  const { width } = sim.world;
  const states = sim.world.states;
  const isOpen = (cell) => opened.has(cell) || states[cell] === CELL.EMPTY;
  const rock = (cell) => !opened.has(cell) && states[cell] === CELL.SOLID;
  let view = plan;
  if (opened.size > 1) {
    // A hidden place may open under a stand that no digging of the
    // excavation could take away, or under the way from it to home.
    const seeds = plan.anchor >= 0
      ? boxSeeds(sim, plan, mapStands(sim, plan, (cell) => rock(cell) && !plan.planned.has(cell), isOpen, true))
      : plan.seeds.filter((seed) => !opened.has(seed + width));
    view = { ...plan, seeds };
  }
  let everywhere = null;
  let shutFinal = null;
  after = {
    opened,
    seedSet: view === plan ? plan.seedSet : new Set(view.seeds),
    stands: digStands(sim, view, rock, isOpen),
    final: plan.final,
    // The finished excavation while the hidden places it meets stay shut: all
    // dug but the rock that waits for them (shutAhead).
    shutFinal: () => {
      if (!shutFinal) {
        const shut = shutAhead(sim, plan);
        shutFinal = digStands(sim, view, (cell) => rock(cell) && (!plan.planned.has(cell) || shut.has(cell)),
          (cell) => isOpen(cell) || (plan.planned.has(cell) && !shut.has(cell)));
      }
      return shutFinal;
    },
    // The stands of the whole map that still reach home once the cells are
    // open, on the present geometry otherwise.
    everywhere: () => {
      everywhere ??= mapStands(sim, plan, rock, isOpen, opened.size > 1);
      return everywhere;
    },
  };
  plan.afterOpening.set(key, after);
  return after;
}

// Getting down from `stand` (the cells of `after` open) as the excavation's
// rock under it is dug, top-down: each drop, from one floor to the next, stays
// within WORK.SAFE_FALL_CELLS, and the last landing (on rock the excavation
// keeps, or a ladder) reaches the shelter once the excavation is finished.
// The cells a hidden place met by the excavation opens are no floor: they
// open, at the latest, when the excavation's cell in that place is dug. And
// the way down must not wait for that place to open either: it must also hold
// with the place shut, and the rock waiting for it undug (shutAhead).
function digsDownToSafety(sim, plan, after, stand, nav) {
  if (!landsSafely(sim, plan, after, stand, nav, false)) return false;
  return after.opened.size > 1 || shutAhead(sim, plan).size === 0 || landsSafely(sim, plan, after, stand, nav, true);
}

function landsSafely(sim, plan, after, stand, nav, shutMode) {
  const { width } = sim.world;
  const size = width * sim.world.height;
  const states = sim.world.states;
  const ahead = shutMode ? null : revealsAhead(sim, plan);
  const shut = shutMode ? shutAhead(sim, plan) : null;
  let landed = stand;
  let cell = stand;
  for (;;) {
    const below = cell + width;
    if (below >= size) return false;
    const held = nav.ladders[cell] || nav.ladders[below];
    const floor = states[below] === CELL.SOLID && !after.opened.has(below) && !ahead?.has(below);
    if (!held && !floor) {
      cell = below;
      continue;
    }
    if ((cell - landed) / width > WORK.SAFE_FALL_CELLS) return false;
    landed = cell;
    if (held || !plan.planned.has(below) || shut?.has(below)) break;
    cell = below;
  }
  const local = boxCell(sim, plan, landed);
  return local >= 0 && (shutMode ? after.shutFinal() : after.final())[local] === 1;
}

// First cell someone standing right over an opened cell lands on.
function landingUnder(sim, cell, nav, opened) {
  const { width } = sim.world;
  const size = width * sim.world.height;
  while (cell + width < size && !nav.ladders[cell] && !nav.ladders[cell + width]
    && (sim.world.states[cell + width] !== CELL.SOLID || opened.has(cell + width))) cell += width;
  return cell;
}

// Standing on `stand`, connected to the colony now, one would be cut off once
// `index` opens, with what a hidden place opens with it (or, standing right
// over a cell that opens, land where the colony is not), with no way down to
// it either as the rest of the excavation is dug. A stand that reaches the
// shelter whatever is dug is never cut off.
function cutOffThere(sim, excavation, plan, index, stand, nav) {
  const local = boxCell(sim, plan, stand);
  if (local < 0 || !plan.reach[local]) return false;
  const after = wayBackAfter(sim, plan, index);
  const onIt = after.opened.has(stand + sim.world.width);
  if (!onIt && after.seedSet.has(stand)) return false;
  const here = boxCell(sim, plan, onIt ? landingUnder(sim, stand + sim.world.width, nav, after.opened) : stand);
  if (here >= 0 && after.stands[here]) return false;
  return !digsDownToSafety(sim, plan, after, stand, nav);
}

// Standing away from the excavation's surroundings, connected to home now
// (mapStands: the shelter, or the part of the colony one waits in), one would
// not be once a hidden place opens (or, standing right over one of its cells,
// would land where home is not reached). A hidden place can be much larger
// than those surroundings: the sewer runs under the floor of a room across
// the shaft, and its opening cuts that room off. No digging of the excavation
// gives a way down there.
function cutOffAway(sim, plan, after, stand, nav) {
  if (plan.anchor < 0 || boxCell(sim, plan, stand) >= 0) return false;
  const states = sim.world.states;
  plan.mapReach ??= mapStands(sim, plan, (cell) => states[cell] === CELL.SOLID, (cell) => states[cell] === CELL.EMPTY, false);
  if (!plan.mapReach[stand]) return false;
  const below = stand + sim.world.width;
  return !after.everywhere()[after.opened.has(below) ? landingUnder(sim, below, nav, after.opened) : stand];
}

// Opening this rock cell would cut somebody off. Opening a cell takes away
// only the stand right above it: nothing is computed unless that stand is on
// a way the colony walks. A hidden place opens many cells at once, some of
// them maybe under the way from the box to home, or under people away from
// the excavation: always computed, for everybody.
function cutsWayBack(sim, excavation, index, nav = rebuildNav(sim)) {
  const plan = wayBackPlan(sim, excavation, nav);
  if (!plan) return false;
  const hidden = openedWith(sim, index);
  if (!hidden) {
    const above = boxCell(sim, plan, index - sim.world.width);
    if (above < 0 || !plan.reach[above]) return false;
  }
  const { width } = sim.world;
  return sim.colonists.some((person) => {
    if (!living(person)) return false;
    const stand = Math.round(person.y) * width + Math.round(person.x);
    return cutOffThere(sim, excavation, plan, index, stand, nav)
      || (hidden !== null && cutOffAway(sim, plan, wayBackAfter(sim, plan, index), stand, nav));
  });
}

// A miner working this rock cell from that stand would be cut off there.
function standCutOff(sim, excavation, x, y, standX, standY, nav) {
  const plan = wayBackPlan(sim, excavation, nav);
  return Boolean(plan) && cutOffThere(sim, excavation, plan, sim.world.index(x, y), sim.world.index(standX, standY), nav);
}

// Navigation components of the diggers: the colony's home when there is no
// shelter reserve.
function colonyComponents(sim) {
  const labels = new Set();
  for (const person of sim.colonists) {
    if (!canWork(sim, person, { type: 'dig' })) continue;
    const label = navigationComponent(sim, Math.round(person.x), Math.round(person.y));
    if (label >= 0) labels.add(label);
  }
  return labels;
}

// Flood fill of the stands reachable from the plan's seeds, for a given idea
// of which floors are rock (solidFloor) and which cells are open (by default
// the planned geometry: every cell of the excavation counts as open).
function digStands(sim, plan, solidFloor, open = (index) => sim.world.states[index] === CELL.EMPTY || plan.planned.has(index)) {
  const { width } = sim.world;
  const { nav, x0, x1, y0, y1, cols } = plan;
  const minIndex = plan.nav.surfaceRestricted ? WORLD.SURFACE_Y * width : 0;
  const visited = new Uint8Array(cols * (y1 - y0 + 1));
  const stack = [];
  const visit = (index) => {
    const x = index % width;
    const y = (index - x) / width;
    if (x < x0 || x > x1 || y < y0 || y > y1 || index < minIndex) return;
    const local = (y - y0) * cols + (x - x0);
    if (visited[local] || !open(index)) return;
    const below = index + width;
    if (!nav.ladders[index] && !nav.ladders[below] && !solidFloor(below)) return;
    visited[local] = 1;
    stack.push(index);
  };
  for (const seed of plan.seeds) visit(seed);
  while (stack.length > 0) {
    const current = stack.pop();
    const x = current % width;
    visit(current - 1);
    visit(current + 1);
    const below = current + width;
    const above = current - width;
    if (nav.ladders[current] || nav.ladders[below]) visit(below);
    if (nav.ladders[current] || nav.ladders[above]) visit(above);
    // One-row steps, as in rebuildNav, on the planned geometry.
    if (!solidFloor(below) || !open(above)) continue;
    for (const side of [-1, 1]) {
      if (x + side < x0 || x + side > x1) continue;
      const upper = above + side;
      if (solidFloor(current + side) && open(upper - width)) visit(upper);
      const lower = below + side;
      if (open(current + side) && solidFloor(lower + width)) visit(lower);
    }
  }
  return visited;
}

function replenishDigJobs(sim, excavation) {
  if (!excavation) return;
  if (excavation.state === 'collapsed' || excavation.state === 'dug' || excavation.state === 'fitted') {
    if (excavation.digHold) delete excavation.digHold;
    return;
  }
  warnDigWithoutAccess(sim, excavation);
  const remaining = remainingCells(sim, excavation);
  if (remaining.length === 0) {
    if (excavation.digHold) delete excavation.digHold;
    finishIfDug(sim, excavation);
    return;
  }
  warnDigHeld(sim, excavation, remaining);
  excavation.workRequired ??= {};
  const jobs = sim.jobs.filter((job) => job.type === 'dig' && job.excavationId === excavation.id && job.status !== 'done');
  if (excavation.digQueueRevision === sim.world.revision && excavation.digQueueCount === jobs.length && (excavation.digQueueRetryTick ?? 0) > sim.tick) return;
  excavation.digQueueRevision = sim.world.revision;
  excavation.digQueueCount = jobs.length;
  excavation.digQueueRetryTick = sim.tick + TIME.TICKS_PER_HOUR;
  const reservations = new Map();
  for (const job of jobs) {
    if (job.cellIndex !== null) reservations.set(job.cellIndex, (reservations.get(job.cellIndex) ?? 0) + 1);
  }
  const workable = digWorkability(sim, excavation);
  const nav = rebuildNav(sim);
  let slots = WORK.MAX_DIGGERS_PER_EXCAVATION - jobs.length;
  // Free a saturated queue only if none of its jobs can advance and a
  // different face can take over. The normal hand-out pass below rechecks
  // reach and all safety rules, so it cannot immediately recreate these jobs.
  const reclaim = slots <= 0 && jobs.every((job) => job.status === 'queued' && job.cellIndex !== null)
    && !remaining.some((index) => reservations.has(index)
      && digFrontOpen(sim, excavation, index, reservations.has(index - sim.world.width), workable, nav))
    && remaining.some((index) => !reservations.has(index)
      && digFrontOpen(sim, excavation, index, false, workable, nav));
  if (reclaim) {
    for (const job of jobs) job.status = 'done';
    reservations.clear();
    slots = WORK.MAX_DIGGERS_PER_EXCAVATION;
  }
  // Rows come top-down: the rock above a cell is reserved before the cell.
  for (const index of remaining) {
    if (slots <= 0) break;
    if (!workable(index)
      || digGateBlocks(sim, excavation, index, Boolean(reservations.get(index - sim.world.width)), workable)) continue;
    if (dropsStander(sim, excavation, index, nav) || cutsWayBack(sim, excavation, index, nav)) {
      excavation.digQueueRetryTick = Math.min(excavation.digQueueRetryTick, sim.tick + WORK.DIG_STANDER_RETRY_TICKS);
      continue;
    }
    const requiredWork = requiredDigWork(sim, excavation, index);
    excavation.workRequired[index] = requiredWork;
    const faceSlots = excavation.kind === 'shaft' ? WORK.DIGGERS_PER_SHAFT_FACE : 1;
    while ((reservations.get(index) ?? 0) < faceSlots && slots > 0) {
      const role = (reservations.get(index) ?? 0) === 0 ? 'dig' : 'clear';
      makeJob(sim, 'dig', excavation.id, { cellIndex: index, requiredWork, role });
      reservations.set(index, (reservations.get(index) ?? 0) + 1);
      slots -= 1;
    }
  }
  const fixedJobs = sim.jobs.filter((job) => job.type === 'dig' && job.excavationId === excavation.id && job.status !== 'done' && job.cellIndex !== null);
  for (const job of jobs) {
    if (job.cellIndex === null && fixedJobs.length > 0) job.status = 'done';
  }
  if (fixedJobs.length === 0 && !jobs.some((job) => job.cellIndex === null && job.status !== 'done')) {
    makeJob(sim, 'dig', excavation.id, { cellIndex: null, requiredWork: 0 });
  }
  if (reclaim) excavation.digQueueCount = fixedJobs.length;
}

function workingHour(sim) {
  const hour = Math.floor(sim.tick / TIME.TICKS_PER_HOUR) % 24;
  const hours = lawEffect(sim, 'workHours', WORK.WORK_END_HOUR - WORK.WORK_START_HOUR);
  return hour >= WORK.WORK_START_HOUR && hour < WORK.WORK_START_HOUR + hours;
}

function workType(sim, job) {
  if (job.type === 'dig') return 'dig';
  if (job.type === 'haul' || job.type === 'stockHaul') return 'haul';
  if (['fit', 'support', 'lining', 'coating', 'repair'].includes(job.type)) return 'build';
  if (job.type === 'crank') return 'crank';
  if (job.type === 'produce') {
    if (job.roomType === 'infirmary') return 'medic';
    if (job.roomType === 'school') return 'teach';
    return 'produce';
  }
  return 'build';
}

export function isRescueJob(sim, job) {
  if (job?.type !== 'dig') return false;
  const sourceId = sim.excavation(job.excavationId)?.rescueSourceId;
  if (sourceId == null) return false;
  const ids = sim.excavation(sourceId)?.trappedColonistIds ?? [];
  return sim.colonists.some((person) => ids.includes(person.id) && person.health > 0 && !person.dead);
}

// A room the game digs a passage to when a collapse cuts it off
// (collapseRescue.js): a fitted water or food room.
export function rescuableRoom(room) {
  const category = ROOM_DEFS[room?.roomType]?.category;
  return room?.state === 'fitted' && (category === 'water' || category === 'food');
}

// The excavations of the passage the game digs to a cut-off water or food
// room (collapseRescue.js), while that room is still a fitted water or food
// room waiting for it: the pieces planned for it, and the tunnels of others
// its route crosses (a person rescue's, the player's own planned dig). A
// tunnel that caved in is rubble: none of its jobs leads anywhere.
export function roomRescueSiteIds(sim) {
  const rooms = new Set();
  const via = new Set();
  for (const room of sim.excavations) {
    if (room.cutOffRescue !== 'planned' || !rescuableRoom(room)) continue;
    rooms.add(room.id);
    for (const id of room.cutOffRescueVia ?? []) via.add(id);
  }
  const ids = new Set();
  if (!rooms.size) return ids;
  for (const excavation of sim.excavations) {
    if (excavation.state !== 'collapsed' && (rooms.has(excavation.rescueRoomId) || via.has(excavation.id))) ids.add(excavation.id);
  }
  return ids;
}

// A cell of that passage. sites: roomRescueSiteIds, when already known.
export function isRoomRescueJob(sim, job, sites = null) {
  return job?.type === 'dig' && (sites ?? roomRescueSiteIds(sim)).has(job.excavationId);
}

export function isLifeSupportJob(sim, job) {
  if (job?.type === 'crank' || job?.roomType === 'bikeDynamo') return true;
  if (ROOM_DEFS[job?.roomType]?.category === 'food') return true;
  return ['well', 'filterPlant', 'recycler', 'decon', 'pump', 'ventShaft', 'airFilter', 'scrubber', 'algaeTank', 'infirmary'].includes(job?.roomType);
}

export function canWork(sim, colonist, job) {
  if (!colonist || !job) return false;
  if (sim.evacuationCount) {
    if (colonist.evacuationJobId != null) return false;
    const destination = colonist.path?.at(-1);
    const crossing = colonist.jobId === job.id && destination && colonist.pathIndex < colonist.path.length
      && !evacuatedAt(sim, destination.x, destination.y);
    if (!isRescueJob(sim, job) && (colonist.evacuationFrom != null || jobEvacuated(sim, job)
      || evacuatedAt(sim, colonist.x, colonist.y) && !crossing)) return false;
  }
  if (colonist.trappedIn != null) return false;
  if ((colonist.age ?? PEOPLE.ADULT_AGE) < PEOPLE.MINIMUM_WORK_AGE) return false;
  if (colonist.surfaceCrewId || (colonist.age ?? 1) < 1 || colonist.carriedBy != null) return false;
  if ((!isEligibleForWork(sim, colonist) && !isLifeSupportJob(sim, job)) || isStriking(sim, colonist)) return false;
  return (colonist.priorities?.[workType(sim, job)] ?? 3) > 0;
}

function assignmentPriority(sim, colonist, job) {
  const type = workType(sim, job);
  if (!colonist.automaticPriorities) return colonist.priorities?.[type] ?? 3;
  if (type === 'haul' || type === 'crank') return 3;
  const skills = colonist.skills ?? {};
  const skill = type === 'dig' ? skills.dig
    : type === 'build' ? skills.build
      : type === 'medic' ? skills.medic
        : type === 'teach' ? skills.teach
          : ['mushroom', 'hydroponics', 'insectFarm', 'ratFarm', 'fishTank', 'algaeTank'].includes(job.roomType) ? skills.farm
            : ['kitchen', 'canteen'].includes(job.roomType) ? skills.cook : skills.tech;
  return Number.isFinite(skill) ? Math.max(1, Math.min(4, Math.round(skill / 2))) : 3;
}

function stopListeningRock(colonist) {
  if (colonist?.activity?.type === 'listeningRock') delete colonist.activity;
}

function assignJob(colonist, job) {
  stopListeningRock(colonist);
  job.status = 'active';
  job.colonistId = colonist.id;
  colonist.jobId = job.id;
  colonist.task = 'walk';
  colonist.idleReason = null;
  colonist.idleActivity = null;
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
}

function digAssignmentScore(sim, colonist, job) {
  const excavation = sim.excavation(job.excavationId);
  if (!excavation || job.cellIndex === null) return Infinity;
  const { x, y } = sim.world.coords(job.cellIndex);
  const targets = digTargets(sim, excavation, colonist, x, y);
  const currentX = Math.round(colonist.x);
  const currentY = Math.round(colonist.y);
  const travel = targets.some((target) => target.x === currentX && target.y === currentY)
    ? 0 : pathCost(findPath(sim, colonist, targets, undefined, undefined,
      sim.evacuationCount && isRescueJob(sim, job) ? { rescue: true } : null));
  const priority = Math.max(1, assignmentPriority(sim, colonist, job));
  // A cell handed out under the reserved rock of its own room (rule C) opens
  // only after that rock: the rock above, which holds the face back, is
  // taken first.
  const upper = job.cellIndex - sim.world.width;
  const held = (excavation.kind === 'room' || excavation.kind === 'gallery') && undercutsCell(sim, excavation, job.cellIndex)
    && sim.jobs.some((other) => other.type === 'dig' && other.status !== 'done' && other.excavationId === excavation.id
      && other.cellIndex === upper)
    ? requiredDigWork(sim, excavation, upper) : 0;
  return Number.isFinite(travel) ? (travel + job.requiredWork + held) / (digSkill(sim, colonist) * priority) : Infinity;
}

function productionRecipe(excavation, definition, recipeId) {
  const roomType = excavation.roomType;
  if (roomType === 'workshop') {
    const recipe = recipeDefinition(recipeId ?? 'filters');
    if (recipe) return {
      inputResource: null,
      inputPerDay: 0,
      outputResource: recipe.output,
      outputPerDay: recipe.amount * TIME.TICKS_PER_DAY / recipe.workMinutes,
    };
  }
  // Une culture rend par tranche de sa taille minimale : intrants et sortie
  // suivent la largeur de la salle, comme les lits du dortoir.
  const scale = productionScale(definition, excavation);
  if (definition.foodPerDay) {
    return {
      inputs: foodInputsPerDay(definition, excavation),
      outputResource: 'food',
      outputPerDay: definition.foodPerDay * scale,
    };
  }
  if (definition.mealsPerDay) {
    return {
      inputResource: roomType === 'kitchen' ? 'food' : 'meals',
      inputPerDay: definition.mealsPerDay * WORK.FOOD_PER_MEAL,
      outputResource: 'meals',
      outputPerDay: definition.mealsPerDay,
    };
  }
  if (definition.waterPerDay && definition.outputResource) {
    return {
      inputResource: definition.inputResource ?? null,
      inputPerDay: definition.inputResource ? definition.waterPerDay : 0,
      outputResource: definition.outputResource,
      outputPerDay: definition.waterPerDay,
    };
  }
  return null;
}

function productionHasInputs(sim, job) {
  if (job.type === 'machineRepair') {
    const room = sim.excavation(job.excavationId);
    return room?.machineBroken && room.state !== 'collapsed' && prepareMachineRepair(sim, room, job);
  }
  if (job.type !== 'produce') return true;
  const excavation = sim.excavation(job.excavationId);
  const definition = ROOM_DEFS[excavation?.roomType];
  if (!usableRoom(excavation) || (definition.powerKw > 0 && (!excavation.powered || excavation.powerShed))) return false;
  if (job.roomType === 'bikeDynamo' && sim.power.demandKw > 0 && sim.power.generatedKw >= sim.power.demandKw) return false;
  const recipe = definition ? productionRecipe(excavation, definition, excavation.recipeId) : null;
  if (!recipe) return true;
  const stock = ensureRoomStock(sim, excavation);
  const inputs = recipe.inputs ?? (recipe.inputResource ? { [recipe.inputResource]: recipe.inputPerDay } : {});
  if (Object.keys(inputs).some((resource) => (stock.resources[resource] ?? 0) <= 0)) return false;
  return excavation.roomType !== 'filterPlant' || (stock.resources.filters ?? 0) > 0;
}

function usableRoom(excavation) {
  return excavation && (excavation.state === 'fitted' || (excavation.initial && excavation.roomType))
    && excavation.state !== 'collapsed' && !excavation.disabled && !excavation.evacuation && (excavation.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

function stockTransfer(sim, source, destination, resource, amount, excavationId, parallel = false, parentJobId = null) {
  if (!source || !destination || source.id === destination.id || amount <= 0
    || !stocksConnected(sim, source, destination)) return null;
  const matching = sim.jobs.filter((job) => job.type === 'stockHaul' && job.status !== 'done'
    && (!parallel || job.sourceStockId === source.id)
    && job.destinationStockId === destination.id && job.resource === resource);
  const workers = Math.max(1, sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead && !colonist.surfaceCrewId).length);
  if (matching.length > 0 && (!parallel || matching.length >= workers)) {
    if (parentJobId !== null) matching[0].parentJobId ??= parentJobId;
    return matching[0];
  }
  return makeJob(sim, 'stockHaul', excavationId, {
    phase: 'pickup', resource, amount, sourceStockId: source.id, destinationStockId: destination.id, stockId: destination.id,
    ...(parallel ? { kitCraft: true } : {}),
    ...(parentJobId === null ? {} : { parentJobId }),
  });
}

function reservedPickup(sim, stockId, resource, except = null) {
  return sim.jobs.filter((job) => job.type === 'stockHaul' && job.status !== 'done' && job.phase === 'pickup'
    && job.sourceStockId === stockId && job.resource === resource && job.id !== except?.id)
    .reduce((sum, job) => sum + job.amount, 0);
}

function reservedDelivery(sim, stockId, resource) {
  return sim.jobs.filter((job) => job.type === 'stockHaul' && job.status !== 'done'
    && job.destinationStockId === stockId && job.resource === resource)
    .reduce((sum, job) => sum + job.amount, 0);
}

export function requestRoomResources(sim, excavation, cost, parallel = false, parentJobId = null) {
  const stock = ensureRoomStock(sim, excavation);
  let ready = true;
  for (const [resource, required] of Object.entries(cost)) {
    const missing = required - (stock.resources[resource] ?? 0);
    if (missing <= 1e-9) continue;
    ready = false;
    const incoming = reservedDelivery(sim, stock.id, resource);
    const needed = Math.max(0, missing - incoming);
    if (needed <= 0) {
      if (parentJobId !== null) {
        for (const job of sim.jobs) {
          if (job.type === 'stockHaul' && job.status !== 'done' && job.destinationStockId === stock.id && job.resource === resource) {
            job.parentJobId ??= parentJobId;
          }
        }
      }
      continue;
    }
    const transferAmount = Math.min(WORK.CARRY_CAPACITY, needed);
    const colonyBuffer = !parallel || required <= EXODUS.KIT_REQUIREMENTS[resource] + WORK.CARRY_CAPACITY ? 0 : resource === 'food'
      ? sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead).length * EXODUS.COLONY_FOOD_BUFFER_DAYS
      : resource === 'fuel' ? EXODUS.COLONY_FUEL_BUFFER : 0;
    const accessible = (candidate) => !parallel || candidate.y > WORLD.SURFACE_Y
      || navigationTargets(sim, candidate.x, candidate.y).length > 0;
    const unreserved = (candidate) => candidate.id !== stock.id && accessible(candidate)
      && !isExodusStockReserved(sim, candidate, resource)
      ? Math.max(0, (candidate.resources[resource] ?? 0) - reservedPickup(sim, candidate.id, resource)) : 0;
    const shippingAvailable = Math.max(0, sim.stocks.reduce((total, candidate) => total + unreserved(candidate), 0)
      - colonyBuffer - (colonyBuffer > 0 ? WORK.CARRY_CAPACITY : 0));
    // A room stock over a void (the middle of a floor that a natural cave took
    // away) has no standing cell of its own: sources are looked for from the
    // room's nearest standing cell, where its deliveries go anyway.
    const origin = navigationTargets(sim, stock.x, stock.y).length > 0 ? stock : (stockNavigationTargets(sim, stock)[0] ?? stock);
    const source = nearestStock(sim, origin.x, origin.y,
      (candidate) => unreserved(candidate) >= transferAmount && shippingAvailable > 0, null, resource, stock)
      ?? nearestStock(sim, origin.x, origin.y,
        (candidate) => unreserved(candidate) > 0 && shippingAvailable > 0, null, resource, stock);
    const available = source ? Math.min(unreserved(source), shippingAvailable) : 0;
    if (available > 0) stockTransfer(sim, source, stock, resource, Math.min(transferAmount, available), excavation.id, parallel, parentJobId);
  }
  return ready;
}

// Une citerne aménagée ne recevait jamais d'eau : toute l'eau propre partait
// au garde-manger de l'abri. Elle va maintenant à la citerne atteignable la plus
// proche qui a de la place, puis à la réserve. L'accessibilité ne change qu'avec
// le terrain : on la garde en cache par révision du monde.
const cisternReachCache = new Map();
function cisternReachable(sim, cistern) {
  const key = `${cistern.id}:${sim.world?.revision ?? 0}:${cistern.state}`;
  if (!cisternReachCache.has(key)) {
    if (cisternReachCache.size > 256) cisternReachCache.clear();
    cisternReachCache.set(key, excavationReachable(sim, cistern));
  }
  return cisternReachCache.get(key);
}

function cleanWaterDestination(sim, excavation, reserve) {
  let best = null;
  for (const cistern of sim.excavations) {
    if (cistern.roomType !== 'cistern' || cistern.state !== 'fitted' || cistern.disabled) continue;
    if ((cistern.floodRatio ?? 0) > WATER.FLOOD_UNUSABLE_RATIO) continue;
    const candidate = roomStock(sim, cistern);
    if (!candidate || candidate.id === reserve.id) continue;
    const capacity = candidate.capacity ?? ROOM_DEFS.cistern.capacity;
    const room = capacity - (candidate.resources.waterClean ?? 0) - reservedDelivery(sim, candidate.id, 'waterClean');
    if (room < 1) continue;
    const distance = Math.abs(candidate.x - excavation.x) + Math.abs(candidate.y - excavation.y);
    if (best && (distance > best.distance || (distance === best.distance && String(candidate.id) >= String(best.stock.id)))) continue;
    if (!cisternReachable(sim, cistern)) continue;
    best = { stock: candidate, room, distance };
  }
  return best ?? { stock: reserve, room: Infinity };
}

function ensureRoomLogistics(sim, excavation, definition) {
  const recipe = productionRecipe(excavation, definition, excavation.recipeId);
  if (!recipe) return;
  const stock = ensureRoomStock(sim, excavation);
  const reserve = reserveStock(sim, excavation.x, excavation.y);
  if (!stock || !reserve || stock.id === reserve.id) return;
  const available = Math.max(0, (stock.resources[recipe.outputResource] ?? 0) - reservedPickup(sim, stock.id, recipe.outputResource));
  const intermediateWater = ['waterDirty', 'waterGrey', 'waterRadioactive'].includes(recipe.outputResource);
  // Harvests remain edible in the room. Ship full loads instead of reserving a
  // separate return trip for every fractional ration produced by a small farm.
  const outputReady = !definition.foodPerDay || available >= WORK.CARRY_CAPACITY;
  if (available > 0 && !intermediateWater && outputReady) {
    const destination = recipe.outputResource === 'waterClean' ? cleanWaterDestination(sim, excavation, reserve) : { stock: reserve, room: Infinity };
    stockTransfer(sim, stock, destination.stock, recipe.outputResource, Math.min(WORK.CARRY_CAPACITY, available, destination.room), excavation.id);
  }
  const inputs = recipe.inputs ?? (recipe.inputResource ? { [recipe.inputResource]: recipe.inputPerDay } : {});
  for (const [resource, perDay] of Object.entries(inputs)) {
    const hourlyInput = perDay * TIME.TICKS_PER_HOUR / TIME.TICKS_PER_DAY;
    const organic = resource === 'organicWaste';
    const cropWater = Boolean(definition.foodPerDay) && resource === 'waterClean';
    // A crop keeps a load in reserve while the next full bucket travels. Tiny
    // hourly top-ups otherwise occupy its workers with repeated round trips.
    const inputBuffer = cropWater ? Math.max(hourlyInput, CULTIVATION.WATER_BUFFER_LOADS * WORK.CARRY_CAPACITY)
      : organic ? WORK.CARRY_CAPACITY : hourlyInput;
    const incoming = reservedDelivery(sim, stock.id, resource);
    const needed = Math.max(0, inputBuffer - (stock.resources[resource] ?? 0) - incoming);
    const minimumTransfer = cropWater ? WORK.CARRY_CAPACITY : organic ? Math.min(1, inputBuffer) : 0;
    const transferAmount = Math.min(WORK.CARRY_CAPACITY, needed);
    const unreserved = (candidate) => candidate.id !== stock.id
      ? Math.max(0, (candidate.resources[resource] ?? 0)
        - reservedPickup(sim, candidate.id, resource)) : 0;
    const fallback = stockConsumesResource(sim, reserve, resource) ? null : reserve;
    const source = needed >= minimumTransfer
      ? (organic || cropWater
        ? nearestStock(sim, stock.x, stock.y,
          (candidate) => unreserved(candidate) >= transferAmount, null, resource, stock)
          ?? nearestStock(sim, stock.x, stock.y,
            (candidate) => unreserved(candidate) > 0, null, resource, stock) ?? fallback
        : nearestStock(sim, stock.x, stock.y,
          (candidate) => candidate.id !== stock.id && (candidate.resources[resource] ?? 0) > 0, null, resource, stock) ?? fallback)
      : null;
    const sourceAvailable = source ? unreserved(source) : 0;
    if (needed >= minimumTransfer && sourceAvailable > 0) {
      stockTransfer(sim, source, stock, resource, Math.min(transferAmount, sourceAvailable), excavation.id);
    }
  }
  if (excavation.roomType === 'filterPlant') {
    const incoming = reservedDelivery(sim, stock.id, 'filters');
    const needed = Math.max(0, 1 - (stock.resources.filters ?? 0) - incoming);
    const fallback = stockConsumesResource(sim, reserve, 'filters') ? null : reserve;
    const source = nearestStock(sim, stock.x, stock.y,
      (candidate) => candidate.id !== stock.id && (candidate.resources.filters ?? 0) > 0, null, 'filters', stock) ?? fallback;
    const sourceAvailable = source
      ? Math.max(0, (source.resources.filters ?? 0) - reservedPickup(sim, source.id, 'filters')) : 0;
    if (needed > 0 && sourceAvailable > 0) {
      stockTransfer(sim, source, stock, 'filters', Math.min(WORK.CARRY_CAPACITY, needed, sourceAvailable), excavation.id);
    }
  }
}

function ensureProductionJobs(sim, excavation) {
  if (!excavation.roomType || !usableRoom(excavation)) return;
  const definition = ROOM_DEFS[excavation.roomType];
  if (!definition) return;
  if (productionRecipe(excavation, definition, excavation.recipeId) || definition.storage) ensureRoomStock(sim, excavation);
  const jobs = sim.jobs.filter((job) => job.type === 'produce' && job.excavationId === excavation.id && job.status !== 'done');
  for (let slot = jobs.length; slot < roomJobCount(definition, excavation); slot += 1) {
    jobs.push(makeJob(sim, 'produce', excavation.id, { roomType: excavation.roomType, slot }));
  }
  excavation.productionWorkers = jobs.filter((job) => job.status === 'active').length;
  if (definition.jobs > 0) ensureRoomLogistics(sim, excavation, definition);
}

function ensureManualVentilationJob(sim, excavation) {
  if (excavation.label !== 'accessShaft' && !excavation.manualVentilation) return;
  if (!['dug', 'fitted'].includes(excavation.state) || excavation.disabled
    || (excavation.floodRatio ?? 0) > WATER.FLOOD_UNUSABLE_RATIO) return;
  if (!sim.jobs.some((job) => job.type === 'crank' && job.excavationId === excavation.id && job.status !== 'done')) {
    makeJob(sim, 'crank', excavation.id, { roomType: 'manualVentilation', slot: 0 });
  }
}

export function updateJobs(sim) {
  sim.jobs = sim.jobs.filter((job) => job.status !== 'done');
  for (const job of sim.jobs) {
    job.work ??= 0;
    job.retryTick ??= 0;
    job.phase ??= 'work';
    if (job.status !== 'active') continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    if (!colonist || colonist.jobId !== job.id || !canWork(sim, colonist, job)
      || (job.roomType === 'bikeDynamo' && !productionHasInputs(sim, job))) {
      if (colonist?.carrying && (job.type === 'haul' || job.type === 'stockHaul')) {
        dropCarrying(sim, colonist, job);
        job.status = 'done';
      } else {
        job.status = 'queued';
      }
      job.colonistId = null;
      stopListeningRock(colonist);
      if (colonist?.jobId === job.id) {
        colonist.jobId = null;
        colonist.task = 'idle';
        colonist.path = [];
        colonist.pathIndex = 0;
        colonist.pathGoal = null;
      }
    }
  }
  for (const excavation of sim.excavations) {
    excavation.productionWorkers = 0;
    if (excavation.evacuation) continue;
    replenishDigJobs(sim, excavation);
    ensureHaulJobs(sim, excavation);
    ensureProductionJobs(sim, excavation);
    ensureManualVentilationJob(sim, excavation);
    if (excavation.machineBroken) queueMachineRepair(sim, excavation);
  }
  const hasDigWork = sim.excavations.some((excavation) => excavation.state === 'planned' || excavation.state === 'digging');
  for (const colonist of sim.colonists) {
    // Only the tick that completed a job is drawn from it (holdWorkPose).
    if (colonist.heldWork !== undefined) delete colonist.heldWork;
    colonist.idleReason = colonist.jobId === null && !colonist.personal && !colonist.surfaceCrewId
      ? (hasDigWork ? 'waitDigFront' : 'nothingToDo')
      : null;
  }
  const workHour = workingHour(sim);
  const rescueJobs = sim.jobs.filter((job) => job.status === 'queued' && job.cellIndex != null && isRescueJob(sim, job));
  if (!workHour && rescueJobs.length === 0) return;
  // Rescue can interrupt ordinary work or scheduled rest, including at night.
  // Critical needs and existing life-support assignments still take precedence.
  if (rescueJobs.length) {
    let needed = rescueJobs.length;
    for (const person of sim.colonists) {
      if (needed <= 0) break;
      if (person.health <= 0 || person.dead || person.trappedIn != null || person.surfaceCrewId || person.carrying
        || person.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD || person.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD
        || person.sleep >= WORK.SLEEP_PER_DAY * 0.8) continue;
      const job = getJob(sim, person.jobId);
      if (job && (isRescueJob(sim, job) || isLifeSupportJob(sim, job))) continue;
      if (person.personal && !['sleep', 'rest'].includes(person.personal.type)) continue;
      if (!rescueJobs.some((candidate) => canWork(sim, person, candidate) && Number.isFinite(digAssignmentScore(sim, person, candidate)))) continue;
      if (job) releaseJob(sim, person);
      person.personal = null;
      person.idleActivity = null;
      person.activity = null;
      needed -= 1;
    }
  }

  const available = sim.colonists.filter((person) => person.health > 0 && !person.surfaceCrewId
    && person.jobId === null && !person.personal && !person.carrying && !person.floodEscape && person.activity?.type !== 'celebrating');
  const assignedJobs = new Set();
  const assignedColonists = new Set();
  // undefined : plus personne de libre pour ce type de travail, on s'arrête.
  // null : des colons libres, mais aucun ne peut mener cette navette ; elle
  // attend en file sans être abandonnée ni recréée, et les suivantes passent.
  const availableFor = (job) => {
    const workers = available
      .filter((person) => !assignedColonists.has(person.id) && canWork(sim, person, job))
      .sort((a, b) => assignmentPriority(sim, b, job) - assignmentPriority(sim, a, job) || a.id - b.id);
    if (workers.length === 0) return undefined;
    return workers.find((person) => canServeJob(sim, person, job)) ?? null;
  };
  const jobPriority = (job) => available.reduce((best, person) => canWork(sim, person, job)
    ? Math.max(best, assignmentPriority(sim, person, job)) : best, 0);
  const digPriority = sim.jobs.filter((job) => job.type === 'dig' && job.status === 'queued' && job.cellIndex !== null)
    .reduce((best, job) => Math.max(best, jobPriority(job)), 0);
  const urgent = (job) => {
    if (job.type === 'crank') return -10000;
    if (job.kitCraft) return -7000;
    if (job.type === 'machineRepair') return REPAIRS.JOB_URGENCY;
    const parent = sim.jobs.find((candidate) => candidate.id === job.parentJobId);
    if (parent?.type === 'machineRepair') return REPAIRS.JOB_URGENCY;
    if (parent && ['repair', 'support', 'lining'].includes(parent.type)) {
      const parentRoom = sim.excavation(parent.excavationId);
      const parentRatio = parentRoom?.stress?.ratio ?? 0;
      if (parentRatio > STRUCTURE.FAILURE_RATIO || parentRoom?.integrity < STRUCTURE.DANGER_INTEGRITY) return STRUCTURAL_URGENCY;
      if (parent.type === 'repair' && (parentRatio > STRUCTURE.STABLE_RATIO || parentRoom?.integrity < 45
        || (parent.paid && parentRoom?.state !== 'collapsed' && parentRoom.integrity < repairCap(parentRoom)))) return -8000;
    }
    const room = sim.excavation(job.excavationId);
    const ratio = room?.stress?.ratio ?? 0;
    if (['support', 'lining'].includes(job.type) && ratio > STRUCTURE.FAILURE_RATIO) return STRUCTURAL_URGENCY;
    if (job.type === 'repair' && room?.integrity < STRUCTURE.DANGER_INTEGRITY) return STRUCTURAL_URGENCY;
    if (job.type === 'repair' && (ratio > STRUCTURE.STABLE_RATIO || room?.integrity < 45
      || (job.paid && room?.state !== 'collapsed' && room.integrity < repairCap(room)))) return -8000;
    return 0;
  };
  const lifeSupportJobs = sim.jobs.filter((job) => {
    if (job.status !== 'queued' || job.retryTick > sim.tick) return false;
    if (!productionHasInputs(sim, job)) return false;
    if (job.type === 'crank') return true;
    if (job.type === 'stockHaul' && job.createdTick === undefined) return true;
    if ((job.type === 'support' || job.type === 'lining')
      && (sim.excavation(job.excavationId)?.stress?.ratio ?? 0) > STRUCTURE.FAILURE_RATIO) return true;
    if (job.type === 'produce' && job.roomType === 'bikeDynamo') return true;
    const category = ROOM_DEFS[job.roomType]?.category;
    const lifeSupport = category === 'water' || category === 'air' || category === 'infirmary';
    if (job.type === 'fit' && lifeSupport) return true;
    if (job.type === 'stockHaul') return true;
    if (['fit', 'support', 'lining', 'coating', 'repair', 'machineRepair'].includes(job.type)) return true;
    if (job.type !== 'produce') return false;
    if (jobPriority(job) > digPriority) return true;
    return lifeSupport || category === 'food';
  }).sort((a, b) => {
    const rank = (job) => {
      if (job.type === 'crank') return -2;
      if (job.kitCraft) return -1;
      if (['support', 'lining', 'repair'].includes(job.type)
        && (sim.excavation(job.excavationId)?.stress?.ratio ?? 0) > STRUCTURE.STABLE_RATIO) return -1;
      if (job.type === 'stockHaul' && String(job.resource).startsWith('water')) return 0;
      if (job.type === 'stockHaul' && job.resource === 'filters') return 0;
      if (job.type === 'stockHaul' && job.resource === 'fuel') return 2;
      if (job.type === 'stockHaul' && job.resource === 'organicWaste') return 3;
      if (job.type === 'stockHaul' && ['wood', 'metal', 'stone', 'cement', 'electronics', 'copperOre', 'leadOre', 'meds'].includes(job.resource)) return 2;
      if (job.type === 'stockHaul' && ['food', 'meals'].includes(job.resource)) return 4;
      const category = ROOM_DEFS[job.roomType]?.category;
      if (category === 'water') return 1;
      if (category === 'air') return 2;
      if (category === 'infirmary') return 3;
      if (category === 'food') return 4;
      return job.type === 'produce' && job.roomType === 'bikeDynamo' ? 5 : 6;
    };
    return urgent(a) - urgent(b) || jobPriority(b) - jobPriority(a) || rank(a) - rank(b) || a.id - b.id;
  });
  const assignDigJobs = (only = null, skip = null) => {
    const scores = [];
    for (const job of sim.jobs) {
      if (job.type !== 'dig' || job.status !== 'queued' || job.cellIndex === null || job.retryTick > sim.tick
        || (only && !only(sim, job))) continue;
      for (const colonist of available) {
        if (assignedColonists.has(colonist.id) || !canWork(sim, colonist, job) || skip?.(colonist, job)) continue;
        const score = digAssignmentScore(sim, colonist, job);
        if (Number.isFinite(score)) scores.push({ job, colonist, score });
      }
    }
    scores.sort((a, b) => a.job.excavationId - b.job.excavationId || a.score - b.score || a.job.id - b.job.id || a.colonist.id - b.colonist.id);
    for (const { job, colonist } of scores) {
      if (assignedJobs.has(job.id) || assignedColonists.has(colonist.id)) continue;
      assignJob(colonist, job);
      assignedJobs.add(job.id);
      assignedColonists.add(colonist.id);
    }
  };
  assignDigJobs(isRescueJob);
  if (!workHour) return;
  // Next, during working hours only, the passage to a cut-off water or food
  // room: before life support and ordinary digging, after buried people.
  // Two exceptions: shoring a room about to give way goes first (a cascade
  // right after a collapse costs more than an hour of digging), and a
  // colonist the player ranked a waiting life-support job above digging
  // (work priorities set by hand) takes that job first.
  const roomSites = roomRescueSiteIds(sim);
  if (roomSites.size) {
    // The shoring comes in the usual order (lifeSupportJobs): a waiting
    // crank, which goes before it, keeps from it the colonist it would take.
    // The passage, which goes before the crank, takes that colonist below,
    // as it would without any shoring. Without a passage nothing changes.
    const keptForCrank = [];
    for (const job of lifeSupportJobs) {
      const urgency = urgent(job);
      if (urgency > STRUCTURAL_URGENCY) break;
      const colonist = availableFor(job);
      if (!colonist) continue;
      assignedColonists.add(colonist.id);
      if (urgency !== STRUCTURAL_URGENCY) {
        keptForCrank.push(colonist.id);
        continue;
      }
      assignJob(colonist, job);
      assignedJobs.add(job.id);
    }
    for (const id of keptForCrank) assignedColonists.delete(id);
    const supportRank = new Map();
    const ranksSupportFirst = (colonist, job) => {
      if (colonist.automaticPriorities) return false;
      if (!supportRank.has(colonist.id)) {
        supportRank.set(colonist.id, lifeSupportJobs.reduce((best, other) => !assignedJobs.has(other.id)
          && canWork(sim, colonist, other) ? Math.max(best, assignmentPriority(sim, colonist, other)) : best, 0));
      }
      return supportRank.get(colonist.id) > assignmentPriority(sim, colonist, job);
    };
    assignDigJobs((_, job) => roomSites.has(job.excavationId), ranksSupportFirst);
  }
  const supportPriority = lifeSupportJobs.reduce((best, job) => Math.max(best, jobPriority(job)), 0);
  if (digPriority > supportPriority) assignDigJobs();
  for (const job of lifeSupportJobs) {
    if (assignedJobs.has(job.id)) continue;
    const colonist = availableFor(job);
    if (colonist === null) {
      dropUnfeasibleHaul(sim, job);
      continue;
    }
    if (!colonist) break;
    assignJob(colonist, job);
    assignedJobs.add(job.id);
    assignedColonists.add(colonist.id);
  }
  if (digPriority <= supportPriority) assignDigJobs();
  const otherJobs = sim.jobs.filter((job) => job.type !== 'dig' && job.status === 'queued' && job.retryTick <= sim.tick
    && productionHasInputs(sim, job))
    .sort((a, b) => jobPriority(b) - jobPriority(a)
      || Number(a.type === 'produce') - Number(b.type === 'produce') || a.id - b.id);
  for (const job of otherJobs) {
    const colonist = availableFor(job);
    if (colonist === null) {
      dropUnfeasibleHaul(sim, job);
      continue;
    }
    if (!colonist) break;
    assignJob(colonist, job);
    assignedColonists.add(colonist.id);
  }
}

export function finishJob(sim, colonist, job) {
  stopListeningRock(colonist);
  job.status = 'done';
  job.colonistId = null;
  if (colonist.jobId === job.id) colonist.jobId = null;
  colonist.task = 'idle';
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
}

// The blow that completes a job is still work. The next job is only handed out
// by updateJobs at the start of the next tick, so drawing 'idle' for this one
// tick flashes an idle pose between two jobs whenever the worker is already at
// the next one (a digger between two cells; seed 7, prudent player: a fitter or
// a shorer who goes straight on to a dig face up the ladder). A worker left
// without work shows 'idle' from the next tick on.
function finishWorkedJob(sim, colonist, job) {
  finishJob(sim, colonist, job);
  holdWorkPose(colonist, job);
}

// On that held tick colonist.jobId no longer names the job, so the renderer
// draws the gesture from colonist.heldWork (a fitter keeps fitting instead of
// swinging a dusty pick); updateJobs drops it at the start of the next tick.
// A digger needs none: a working colonist without a job is drawn digging.
function holdWorkPose(colonist, job) {
  colonist.task = 'working';
  if (job.type !== 'dig') colonist.heldWork = { type: job.type, excavationId: job.excavationId };
}

export function releaseJob(sim, colonist, retryDelay = 0) {
  stopListeningRock(colonist);
  const job = getJob(sim, colonist.jobId);
  if (!job) {
    colonist.jobId = null;
    return;
  }
  if ((job.type === 'haul' || job.type === 'stockHaul') && colonist.carrying) {
    dropCarrying(sim, colonist, job);
    job.status = 'done';
  } else {
    job.status = 'queued';
  }
  job.colonistId = null;
  job.retryTick = sim.tick + retryDelay;
  colonist.jobId = null;
  colonist.task = 'idle';
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
}

function refundJob(sim, job) {
  if (!job.paid || !job.cost) return;
  const excavation = sim.excavation(job.excavationId);
  const stock = roomStock(sim, excavation) ?? reserveStock(sim, excavation?.x ?? 0, excavation?.y ?? 0);
  if (!stock) return;
  for (const [resource, amount] of Object.entries(job.cost)) addToStock(stock, resource, amount);
  job.paid = false;
}

function dropCarrying(sim, colonist, job) {
  if (!colonist.carrying) return;
  const stock = createStock(`drop-${job.id}`, Math.round(colonist.x), Math.round(colonist.y));
  addToStock(stock, colonist.carrying.resource, colonist.carrying.amount);
  sim.stocks.push(stock);
  colonist.carrying = null;
}

export function cancelJobsFor(sim, excavation) {
  for (const job of sim.jobs) {
    if (job.excavationId !== excavation.id || job.status === 'done') continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    if (colonist) {
      stopListeningRock(colonist);
      if (job.type === 'haul' || job.type === 'stockHaul') dropCarrying(sim, colonist, job);
      colonist.jobId = null;
      colonist.task = 'idle';
      colonist.path = [];
      colonist.pathIndex = 0;
      colonist.pathGoal = null;
    }
    refundJob(sim, job);
    job.status = 'done';
    job.colonistId = null;
  }
}

function exposedDigCell(sim, x, y) {
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    .some(([xx, yy]) => sim.world.isEmpty(xx, yy));
}

function clearReach(sim, fromX, fromY, x, y, horizontalFirst, plannedCells) {
  const intermediate = [];
  const horizontal = (yy) => {
    for (let xx = fromX + Math.sign(x - fromX); xx !== x; xx += Math.sign(x - fromX)) intermediate.push([xx, yy]);
  };
  const vertical = (xx) => {
    for (let yy = fromY + Math.sign(y - fromY); yy !== y; yy += Math.sign(y - fromY)) intermediate.push([xx, yy]);
  };
  if (horizontalFirst) {
    horizontal(fromY);
    vertical(x);
  } else {
    vertical(fromX);
    horizontal(y);
  }
  return intermediate.every(([xx, yy]) => sim.world.isEmpty(xx, yy) || plannedCells.has(sim.world.index(xx, yy)));
}

function openDigReach(sim, fromX, fromY, x, y, range, plannedCells) {
  if (Math.abs(fromX - x) + Math.abs(fromY - y) > range || !exposedDigCell(sim, x, y)) return false;
  return clearReach(sim, fromX, fromY, x, y, true, plannedCells) || clearReach(sim, fromX, fromY, x, y, false, plannedCells);
}

function digTargets(sim, excavation, colonist, x, y) {
  const range = excavation.h + 1;
  const plannedCells = new Set(excavation.cells);
  const targets = [];
  const nav = rebuildNav(sim);
  for (let yy = y - range; yy <= y + range; yy += 1) {
    for (let xx = x - range; xx <= x + range; xx += 1) {
      if (!openDigReach(sim, xx, yy, x, y, range, plannedCells) || !isWalkableIn(sim.world, nav, xx, yy)
        || overDrop(sim, excavation, x, y, xx, yy, nav, colonist) || standCutOff(sim, excavation, x, y, xx, yy, nav)) continue;
      targets.push({ x: xx, y: yy, distance: Math.abs(xx - colonist.x) + Math.abs(yy - colonist.y), index: sim.world.index(xx, yy) });
    }
  }
  targets.sort((a, b) => a.distance - b.distance || a.index - b.index);
  return targets.map(({ x: targetX, y: targetY }) => ({ x: targetX, y: targetY }));
}

function canWorkCell(sim, colonist, excavation, x, y) {
  const currentX = Math.round(colonist.x);
  const currentY = Math.round(colonist.y);
  const plannedCells = new Set(excavation.cells);
  const nav = rebuildNav(sim);
  if (openDigReach(sim, currentX, currentY, x, y, excavation.h + 1, plannedCells) && isWalkable(sim, currentX, currentY)
    && !overDrop(sim, excavation, x, y, currentX, currentY, nav, colonist)
    && !standCutOff(sim, excavation, x, y, currentX, currentY, nav)) return true;
  return findPath(sim, colonist, digTargets(sim, excavation, colonist, x, y), undefined, undefined,
    sim.evacuationCount && isRescueJob(sim, { type: 'dig', excavationId: excavation.id }) ? { rescue: true } : null).length > 0;
}

function prepareDig(sim, colonist, job) {
  const excavation = sim.excavation(job.excavationId);
  if (!excavation || excavation.state === 'collapsed') return null;
  const remaining = remainingCells(sim, excavation);
  if (remaining.length === 0) {
    finishIfDug(sim, excavation);
    finishJob(sim, colonist, job);
    return null;
  }
  if (job.cellIndex !== null) {
    if (!remaining.includes(job.cellIndex)) {
      finishJob(sim, colonist, job);
      return null;
    }
    excavation.workRequired ??= {};
    job.requiredWork ??= requiredDigWork(sim, excavation, job.cellIndex);
    excavation.workRequired[job.cellIndex] = job.requiredWork;
    return excavation;
  }
  if (job.retryTick > sim.tick) return null;
  const coworkers = sim.jobs.filter((candidate) => candidate.type === 'dig' && candidate.status !== 'done' && candidate.id !== job.id && candidate.cellIndex !== null);
  const workable = digWorkability(sim, excavation, colonist);
  const nav = rebuildNav(sim);
  for (const index of remaining) {
    const faceJobs = coworkers.filter((candidate) => candidate.cellIndex === index);
    const faceSlots = excavation.kind === 'shaft' ? WORK.DIGGERS_PER_SHAFT_FACE : 1;
    if (faceJobs.length >= faceSlots) continue;
    const { x, y } = sim.world.coords(index);
    if (!canWorkCell(sim, colonist, excavation, x, y)) continue;
    if (digGateBlocks(sim, excavation, index,
      coworkers.some((candidate) => candidate.cellIndex === index - sim.world.width), workable)) continue;
    if (dropsStander(sim, excavation, index, nav) || cutsWayBack(sim, excavation, index, nav)) continue;
    job.cellIndex = index;
    job.role = faceJobs.some((candidate) => candidate.role === 'dig') ? 'clear' : 'dig';
    job.requiredWork = requiredDigWork(sim, excavation, index);
    excavation.workRequired ??= {};
    excavation.workRequired[index] = job.requiredWork;
    job.retryTick = 0;
    colonist.pathGoal = null;
    return excavation;
  }
  job.retryTick = sim.tick + TIME.TICKS_PER_HOUR;
  colonist.task = 'idle';
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
  return null;
}

function excavationTargets(sim, excavation, colonist) {
  const targets = [];
  const nav = rebuildNav(sim);
  for (const index of excavation.dugCells) {
    const { x, y } = sim.world.coords(index);
    if (isWalkableIn(sim.world, nav, x, y)) targets.push({ x, y, distance: Math.abs(x - colonist.x) + Math.abs(y - colonist.y), index });
  }
  targets.sort((a, b) => a.distance - b.distance || a.index - b.index);
  return targets.map(({ x, y }) => ({ x, y }));
}

function stockTargets(sim, stock) {
  return stockNavigationTargets(sim, stock);
}

function abandonHaul(sim, colonist, job) {
  if (colonist.carrying) dropCarrying(sim, colonist, job);
  logHaulAbandoned(sim, job);
  finishJob(sim, colonist, job);
  return null;
}

function logHaulAbandoned(sim, job) {
  job.failureReason = 'noAccessibleStock';
  // Une même demande (source, destination, ressource) n'est signalée qu'une
  // fois par jour : un abandon répété ne vide plus le journal de ses entrées.
  const room = sim.excavation(job.excavationId);
  const key = `${job.sourceStockId ?? 'loose'}>${job.destinationStockId ?? job.stockId ?? 'none'}:${job.resource}`;
  const logged = room ? (room.haulAbandonTicks ??= {}) : {};
  if (!(sim.tick - (logged[key] ?? -Infinity) < TIME.TICKS_PER_DAY)) {
    for (const [other, tick] of Object.entries(logged)) {
      if (sim.tick - tick >= TIME.TICKS_PER_DAY) delete logged[other];
    }
    logged[key] = sim.tick;
    sim.log('warning', 'eventHaulAbandoned', {
      jobId: job.id, resource: job.resource, reason: job.failureReason,
    });
  }
}

// Une source ne cède pas une ressource qu'elle consomme, quelle que soit la
// destination : un chantier ou le dépôt de l'Exode déroutés ne vident ni le
// filtre d'une station en marche ni le carburant d'un diesel. Seule exception,
// le stock de la salle qui a créé la navette : une salle ne part de son propre
// stock que pour expédier sa sortie (ses intrants y arrivent, et une navette ne
// va jamais d'un stock à lui-même). La cantine consomme des repas et renvoie
// ses repas améliorés à la réserve ; sans cette exception, sa navette de
// sortie, créée à chaque tick, était abandonnée au tick même.
function haulSourceAllowed(sim, job, stock) {
  return stock.excavationId === job.excavationId || !stockConsumesResource(sim, stock, job.resource);
}

// Une source saine pour la navette, quel que soit le colon : permise et reliée
// à la destination. Toute source choisie à la création l'est (sortie de la
// salle, ou stock non consommateur trouvé par nearestStock et relié).
function haulSourceUsable(sim, job, source, destination) {
  return Boolean(source && destination) && source.id !== destination.id
    && haulSourceAllowed(sim, job, source) && stocksConnected(sim, source, destination);
}

// Une autre source : saine et pourvue de la ressource. Le déroutage d'un colon
// et l'abandon pour tous jugent avec ce même prédicat ; s'ils divergeaient,
// une navette pouvait être créée puis abandonnée en boucle.
function haulAlternativeUsable(sim, job, candidate, destination) {
  return (candidate.resources[job.resource] ?? 0) > 0 && haulSourceUsable(sim, job, candidate, destination);
}

// Une navette en file que des colons libres ne peuvent pas mener attend un
// colon qui l'atteint. Si plus aucune source saine n'est reliée à sa
// destination, quel que soit le colon, elle est abandonnée lisiblement ; elle
// n'est pas recréée, puisque sa création exige une telle source.
function dropUnfeasibleHaul(sim, job) {
  if (jobEvacuated(sim, job)) return;
  if (job.type !== 'stockHaul' || job.status !== 'queued' || job.phase !== 'pickup') return;
  const destination = sim.stocks.find((stock) => stock.id === job.destinationStockId);
  const source = sim.stocks.find((stock) => stock.id === job.sourceStockId);
  if (haulSourceUsable(sim, job, source, destination)
    || sim.stocks.some((candidate) => haulAlternativeUsable(sim, job, candidate, destination))) return;
  logHaulAbandoned(sim, job);
  job.status = 'done';
  job.colonistId = null;
}

// Ce que ferait la navette avec ce colon, sans rien modifier : la source ou la
// destination prévue si elle est atteignable, sinon une autre issue saine, ou
// null.
function stockHaulPlan(sim, colonist, job) {
  const destination = sim.stocks.find((stock) => stock.id === job.destinationStockId);
  if (job.phase === 'pickup') {
    const source = sim.stocks.find((stock) => stock.id === job.sourceStockId);
    if (stockReachable(sim, colonist, source) && haulSourceUsable(sim, job, source, destination)) return { stock: source };
    const alternative = nearestStock(sim, colonist.x, colonist.y,
      (candidate) => haulAlternativeUsable(sim, job, candidate, destination), colonist);
    return alternative ? { stock: alternative, sourceStockId: alternative.id } : null;
  }
  if (destination && stockReachable(sim, colonist, destination)) return { stock: destination };
  if (job.kitCraft) return null;
  const alternative = nearestStock(sim, colonist.x, colonist.y,
    (candidate) => candidate.id !== job.destinationStockId, colonist, job.resource);
  return alternative ? { stock: alternative, destinationStockId: alternative.id } : null;
}

// Un colon ne reçoit une navette que s'il peut la mener : atteindre sa
// destination et sa source, ou une autre source reliée. Isolé par un
// effondrement, il la recevait, l'abandonnait aussitôt, elle était recréée au
// tick suivant et n'allait jamais au colon qui pouvait la faire.
function canServeJob(sim, colonist, job) {
  if (job.type !== 'stockHaul') return true;
  if (job.phase === 'pickup'
    && !stockReachable(sim, colonist, sim.stocks.find((stock) => stock.id === job.destinationStockId))) return false;
  return stockHaulPlan(sim, colonist, job) !== null;
}

function stockHaulTarget(sim, colonist, job) {
  const plan = stockHaulPlan(sim, colonist, job);
  if (!plan) return abandonHaul(sim, colonist, job);
  if (plan.sourceStockId !== undefined) {
    job.sourceStockId = plan.sourceStockId;
    colonist.pathGoal = null;
  }
  if (plan.destinationStockId !== undefined) {
    job.destinationStockId = plan.destinationStockId;
    job.stockId = plan.destinationStockId;
    colonist.pathGoal = null;
  }
  return plan.stock;
}

export function getJobTask(sim, colonist, job) {
  const excavation = sim.excavation(job.excavationId);
  if (!excavation || excavation.state === 'collapsed') {
    releaseJob(sim, colonist);
    return null;
  }
  if (job.type === 'dig') {
    if (!prepareDig(sim, colonist, job)) return null;
    const { x, y } = sim.world.coords(job.cellIndex);
    if (listensToRock(sim, colonist, job, excavation)) {
      // Listen against the rock only from a neighbour where the head stays dry
      // and that the geologist can walk to (a ledge left inside a room being
      // dug top-down is no listening post); otherwise the ordinary digging
      // positions are used.
      const home = navigationComponent(sim, Math.round(colonist.x), Math.round(colonist.y));
      const targets = navigationTargets(sim, x, y).filter((target) => (target.x !== x || target.y !== y)
        && !headSubmerged(sim, target.x, target.y) && navigationComponent(sim, target.x, target.y) === home);
      if (targets.length > 0) return { key: `dig:${job.id}:${job.cellIndex}:listen`, targets, x, y, range: 0 };
    }
    return { key: `dig:${job.id}:${job.cellIndex}`, targets: digTargets(sim, excavation, colonist, x, y), x, y, range: excavation.h + 1 };
  }
  if (job.type === 'haul') {
    if (job.phase === 'pickup') {
      if (Object.values(excavation.loose).every((amount) => amount <= 0)) {
        finishJob(sim, colonist, job);
        return null;
      }
      return { key: `haul:${job.id}:pickup`, targets: excavationTargets(sim, excavation, colonist), range: 0 };
    }
    let stock = sim.stocks.find((candidate) => candidate.id === job.stockId);
    if (!stock || !stockReachable(sim, colonist, stock)) {
      stock = nearestStock(sim, colonist.x, colonist.y, null, colonist);
      job.stockId = stock?.id ?? null;
      colonist.pathGoal = null;
    }
    if (!stock) return abandonHaul(sim, colonist, job);
    return { key: `haul:${job.id}:deliver:${stock.id}`, targets: stockTargets(sim, stock), range: 0 };
  }
  if (job.type === 'stockHaul') {
    const stock = stockHaulTarget(sim, colonist, job);
    if (!stock) return null;
    return { key: `stockHaul:${job.id}:${job.phase}:${stock.id}`, targets: stockTargets(sim, stock), range: 0 };
  }
  if (excavation.state !== 'dug' && excavation.state !== 'fitted'
    && !(['coating', 'lining'].includes(job.type) && excavation.dugCells.length > 0)) {
    releaseJob(sim, colonist, TIME.TICKS_PER_HOUR);
    return null;
  }
  if (['coating', 'lining'].includes(job.type) && excavation.state === 'digging') {
    const index = [...excavation.dugCells].sort((a, b) => {
      const left = sim.world.coords(a);
      const right = sim.world.coords(b);
      return Math.abs(left.x - colonist.x) + Math.abs(left.y - colonist.y)
        - Math.abs(right.x - colonist.x) - Math.abs(right.y - colonist.y) || a - b;
    })[0];
    const { x, y } = sim.world.coords(index);
    return { key: `coating:${job.id}`, targets: digTargets(sim, excavation, colonist, x, y), x, y, range: excavation.h + 1 };
  }
  if (job.type === 'crank') {
    const baseY = excavation.y + excavation.h;
    const targets = [];
    const nav = rebuildNav(sim);
    for (let y = baseY - AIR.MANUAL_WORK_RADIUS; y <= baseY + AIR.MANUAL_WORK_RADIUS; y += 1) {
      for (let x = excavation.x - AIR.MANUAL_WORK_RADIUS; x <= excavation.x + AIR.MANUAL_WORK_RADIUS; x += 1) {
        const distance = Math.abs(x - excavation.x) + Math.abs(y - baseY);
        if (distance <= AIR.MANUAL_WORK_RADIUS && isWalkableIn(sim.world, nav, x, y)) {
          targets.push({ x, y, distance: Math.abs(x - colonist.x) + Math.abs(y - colonist.y), index: sim.world.index(x, y) });
        }
      }
    }
    targets.sort((a, b) => a.distance - b.distance || a.index - b.index);
    return { key: `crank:${job.id}`, targets: targets.map(({ x, y }) => ({ x, y })), range: 0 };
  }
  const targets = excavationTargets(sim, excavation, colonist);
  if (job.type === 'support') return { key: `support:${job.id}`, targets, range: 0 };
  return { key: `${job.type}:${job.id}`, targets, range: 0 };
}

function payForJob(sim, colonist, job) {
  if (job.paid || !job.cost) return true;
  const excavation = sim.excavation(job.excavationId);
  if (!excavation || !requestRoomResources(sim, excavation, job.cost, false, job.id)
    || !spendResources(sim, job.cost, ensureRoomStock(sim, excavation))) {
    releaseJob(sim, colonist, TIME.TICKS_PER_HOUR);
    return false;
  }
  job.paid = true;
  return true;
}

function isGeologist(sim, colonist) {
  const geologist = (sim.colonists ?? []).filter((person) => person.health > 0 && !person.dead)
    .sort((a, b) => (b.skills?.dig ?? 0) - (a.skills?.dig ?? 0) || a.id - b.id)[0];
  return geologist != null && colonist?.id != null && geologist.id === colonist.id;
}

// The geologist listens against a fresh cell before digging it. A listen, once
// started, runs its full M6.LISTENING_ROCK_TICKS; it does not start when a
// coworker already holds the same face, since the coworker clears it on the
// first tick and the listen would be cut after one tick (a visible pose blink).
function listensToRock(sim, colonist, job, excavation) {
  if (job.role === 'clear' || job.rockListened || !isGeologist(sim, colonist)) return false;
  if (colonist.activity?.type === 'listeningRock' && job.rockListenerId === colonist.id) return true;
  if ((excavation.work?.[job.cellIndex] ?? 0) > 0) return false;
  return !sim.jobs.some((other) => other !== job && other.type === 'dig' && other.status === 'active'
    && other.cellIndex === job.cellIndex && other.colonistId != null && other.colonistId !== colonist.id);
}

// Ticks before this rock cell of a room falls, counting the rock above it
// that must fall first (rule C): Infinity when nobody is at work on it.
function rockOpensIn(sim, excavation, index, depth = 0) {
  if (sim.world.states[index] !== CELL.SOLID) return 0;
  const job = sim.jobs.find((other) => other.type === 'dig' && other.status === 'active'
    && other.excavationId === excavation.id && other.cellIndex === index && other.role !== 'clear');
  const digger = job && sim.colonists.find((person) => person.id === job.colonistId);
  if (!digger || !['working', 'listeningRock'].includes(digger.task) || depth > excavation.h) return Infinity;
  const listening = digger.task === 'listeningRock' ? Math.max(0, (job.rockListenUntil ?? sim.tick) - sim.tick) : 0;
  const own = listening + Math.max(0, (job.requiredWork ?? requiredDigWork(sim, excavation, index)) / digSkill(sim, digger)
    - (excavation.work?.[index] ?? 0));
  const above = undercutsCell(sim, excavation, index) ? rockOpensIn(sim, excavation, index - sim.world.width, depth + 1) + 1 : 0;
  return Math.max(own, above);
}

// The rock above this loosened cell is still standing and workable: let the
// row above open first. The loosened work stays on the cell. The digger waits
// only when that rock is about to fall (its digger is at the end of the work);
// when nobody is at work on it, the digger takes it itself if it can reach
// it. Returns false otherwise: the job ends and the digger takes other work
// (standing idle on a loosened cell would hold a digger slot for nothing).
function takeUpperRock(sim, colonist, job, excavation, index) {
  const upper = index - sim.world.width;
  if (rockOpensIn(sim, excavation, upper) <= WORK.DIG_WAIT_UPPER_TICKS) return true;
  const others = sim.jobs.filter((other) => other.type === 'dig' && other.excavationId === excavation.id
    && other.status !== 'done' && other.cellIndex === upper && other.id !== job.id);
  if (others.some((other) => other.status === 'active')) return false;
  const { x, y } = sim.world.coords(upper);
  if (!canWorkCell(sim, colonist, excavation, x, y)) return false;
  for (const other of others) other.status = 'done';
  stopListeningRock(colonist);
  delete job.rockListened;
  delete job.rockListenUntil;
  delete job.rockListenerId;
  job.cellIndex = upper;
  job.role = 'dig';
  job.requiredWork = requiredDigWork(sim, excavation, upper);
  excavation.workRequired[upper] = job.requiredWork;
  colonist.pathGoal = null;
  return true;
}

function performDig(sim, colonist, job, excavation) {
  const index = job.cellIndex;
  const { x, y } = sim.world.coords(index);
  if (job.role === 'clear') {
    stopListeningRock(colonist);
    excavation.work[index] = (excavation.work[index] ?? 0) + WORK.SHAFT_CLEAR_WORK_PER_TICK * digSkill(sim, colonist) * starvingWorkFactor(colonist);
    colonist.task = 'clearing';
    colonist.animation += 0.08;
    return;
  }
  const listening = listensToRock(sim, colonist, job, excavation);
  if (!listening) stopListeningRock(colonist);
  if (listening) {
    if (colonist.activity?.type !== 'listeningRock' || job.rockListenerId !== colonist.id) {
      job.rockListenerId = colonist.id;
      job.rockListenUntil = sim.tick + M6.LISTENING_ROCK_TICKS;
      colonist.activity = { type: 'listeningRock', phase: 'active' };
    }
    if (job.rockListenUntil > sim.tick) {
      colonist.task = 'listeningRock';
      colonist.animation += 0.01;
      return;
    }
    stopListeningRock(colonist);
    job.rockListened = true;
  }
  const skill = digSkill(sim, colonist);
  job.requiredWork ??= requiredDigWork(sim, excavation, index);
  excavation.workRequired ??= {};
  excavation.workRequired[index] = job.requiredWork;
  const required = job.requiredWork / skill;
  excavation.state = 'digging';
  excavation.work[index] = (excavation.work[index] ?? 0) + starvingWorkFactor(colonist);
  colonist.task = 'working';
  colonist.animation += 0.12 * skill;
  if (excavation.work[index] + 1e-9 < required) return;
  if (undercutsWorkableCell(sim, excavation, index, digWorkability(sim, excavation, colonist))) {
    if (!takeUpperRock(sim, colonist, job, excavation, index)) finishWorkedJob(sim, colonist, job);
    return;
  }
  // Somebody stands on this cell over a long drop, or would be cut off over
  // one: the loosened work stays on it, the digger takes other work and the
  // cell is handed out again (and opened at once) when that is no longer so.
  if (dropsStander(sim, excavation, index) || cutsWayBack(sim, excavation, index)) {
    excavation.digQueueRetryTick = Math.min(excavation.digQueueRetryTick ?? Infinity, sim.tick + WORK.DIG_STANDER_RETRY_TICKS);
    finishWorkedJob(sim, colonist, job);
    return;
  }
  const materialKey = materialAt(sim.world.materials[index]).key;
  digCell(sim, excavation, x, y);
  recordRescueDig(sim, excavation, colonist);
  colonist.materialCounts ??= {};
  colonist.materialCounts[materialKey] = (colonist.materialCounts[materialKey] ?? 0) + 1;
  delete excavation.work[index];
  delete excavation.workRequired[index];
  colonist.pathGoal = null;
  sim.events.push({ type: 'dig', tick: sim.tick, x, y });
  finishIfDug(sim, excavation);
  finishWorkedJob(sim, colonist, job);
}

function performHaul(sim, colonist, job, excavation) {
  if (job.phase === 'pickup') {
    const resource = job.resource ?? Object.keys(excavation.loose).filter((key) => excavation.loose[key] > 0).sort()[0];
    if (!resource || (excavation.loose[resource] ?? 0) <= 0) {
      finishJob(sim, colonist, job);
      return;
    }
    const amount = Math.min(job.amount || WORK.CARRY_CAPACITY, excavation.loose[resource]);
    job.work += infectionWorkFactor(colonist) * starvingWorkFactor(colonist);
    if (job.work < amount * WORK.HAUL_MINUTES_PER_UNIT) {
      colonist.task = 'working';
      return;
    }
    job.work = 0;
    excavation.loose[resource] -= amount;
    if (excavation.loose[resource] <= 0) delete excavation.loose[resource];
    colonist.carrying = { resource, amount };
    job.resource = resource;
    job.amount = amount;
    job.phase = 'deliver';
    job.stockId = nearestStock(sim, colonist.x, colonist.y)?.id ?? null;
    colonist.pathGoal = null;
    colonist.task = 'carrying';
    return;
  }
  const stock = sim.stocks.find((candidate) => candidate.id === job.stockId) ?? nearestStock(sim, colonist.x, colonist.y);
  if (!stock || !colonist.carrying) return;
  job.work += infectionWorkFactor(colonist) * starvingWorkFactor(colonist);
  if (job.work < colonist.carrying.amount * WORK.HAUL_MINUTES_PER_UNIT) {
    colonist.task = 'carrying';
    return;
  }
  job.work = 0;
  addToStock(stock, colonist.carrying.resource, colonist.carrying.amount);
  sim.events.push({ type: 'resource', tick: sim.tick, x: stock.x, y: stock.y, resource: colonist.carrying.resource, amount: colonist.carrying.amount });
  colonist.carrying = null;
  finishJob(sim, colonist, job);
}

function performStockHaul(sim, colonist, job) {
  const minutesPerUnit = String(job.resource).startsWith('water') ? WATER.HAUL_MINUTES_PER_UNIT : WORK.HAUL_MINUTES_PER_UNIT;
  if (job.phase === 'pickup') {
    const source = sim.stocks.find((stock) => stock.id === job.sourceStockId);
    if (isExodusStockReserved(sim, source, job.resource) && job.destinationStockId !== source.id) {
      finishJob(sim, colonist, job);
      return;
    }
    const amount = Math.min(job.amount ?? WORK.CARRY_CAPACITY, source?.resources[job.resource] ?? 0);
    if (!source || amount <= 0) {
      finishJob(sim, colonist, job);
      return;
    }
    job.work += infectionWorkFactor(colonist) * starvingWorkFactor(colonist);
    colonist.task = 'working';
    if (job.work < amount * minutesPerUnit) return;
    job.work = 0;
    job.amount = amount;
    source.resources[job.resource] -= amount;
    if (source.resources[job.resource] <= 0) delete source.resources[job.resource];
    colonist.carrying = { resource: job.resource, amount };
    job.phase = 'deliver';
    colonist.pathGoal = null;
    colonist.task = 'carrying';
    return;
  }
  const destination = sim.stocks.find((stock) => stock.id === job.destinationStockId);
  if (!destination || !colonist.carrying) {
    if (colonist.carrying) dropCarrying(sim, colonist, job);
    finishJob(sim, colonist, job);
    return;
  }
  job.work += infectionWorkFactor(colonist) * starvingWorkFactor(colonist);
  colonist.task = 'carrying';
  if (job.work < colonist.carrying.amount * minutesPerUnit) return;
  addToStock(destination, colonist.carrying.resource, colonist.carrying.amount);
  sim.events.push({ type: 'resource', tick: sim.tick, x: destination.x, y: destination.y, resource: colonist.carrying.resource, amount: colonist.carrying.amount });
  colonist.carrying = null;
  finishJob(sim, colonist, job);
}

function performFitting(sim, colonist, job) {
  if (!payForJob(sim, colonist, job)) return;
  job.work += infectionWorkFactor(colonist) * starvingWorkFactor(colonist);
  colonist.task = 'working';
  colonist.animation += 0.1;
  if (job.work < (job.requiredWork ?? CULTIVATION.FIT_MINUTES)) return;
  if (completeFitting(sim, job)) finishWorkedJob(sim, colonist, job);
}

function performProduce(sim, colonist, job, excavation) {
  const definition = ROOM_DEFS[excavation.roomType];
  if (!definition || !usableRoom(excavation) || (definition.powerKw > 0 && (!excavation.powered || excavation.powerShed))) {
    releaseJob(sim, colonist, TIME.TICKS_PER_HOUR);
    return;
  }
  job.work += (colonist.workFactor ?? 1) * infectionWorkFactor(colonist) * starvingWorkFactor(colonist) * lawMultiplier(sim, 'workFactor', 1);
  colonist.task = 'working';
  colonist.animation += excavation.roomType === 'bikeDynamo' ? 0.16 : 0.08;
  if (job.work < CULTIVATION.PRODUCTION_INTERVAL) return;
  job.work = 0;
  const logisticsWaiting = sim.jobs.some((candidate) => candidate.type === 'stockHaul'
    && candidate.excavationId === excavation.id && candidate.status === 'queued');
  if (logisticsWaiting) {
    releaseJob(sim, colonist);
    holdWorkPose(colonist, job); // this tick's work, as in finishWorkedJob
  }
}

function performMachineRepair(sim, colonist, job, excavation) {
  if (!excavation.machineBroken || excavation.state === 'collapsed') {
    finishJob(sim, colonist, job);
    return;
  }
  if (!prepareMachineRepair(sim, excavation, job) || !payForJob(sim, colonist, job)) {
    if (colonist.jobId === job.id) releaseJob(sim, colonist, TIME.TICKS_PER_HOUR);
    return;
  }
  job.work += 1;
  colonist.task = 'repairing';
  colonist.animation += 0.08;
  if (job.work < job.requiredWork) return;
  const breakdowns = sim.m5?.storyteller?.breakdowns ?? [];
  const breakdown = breakdowns.find((entry) => entry.excavationId === excavation.id);
  excavation.machineBroken = false;
  excavation.disabled = breakdown?.wasDisabled ?? false;
  if (sim.m5?.storyteller) {
    sim.m5.storyteller.breakdowns = breakdowns.filter((entry) => entry.excavationId !== excavation.id);
  }
  sim.log('info', 'eventBreakdownEnd', {
    excavationId: excavation.id, name: breakdown?.name,
  }, excavation);
  finishJob(sim, colonist, job);
}

function repairCap(excavation) {
  return excavation.stress?.ratio > 1 ? STRUCTURE.UNSAFE_REPAIR_CAP : 100;
}

export function performJob(sim, colonist, job) {
  if (!canWork(sim, colonist, job)) {
    if (colonist.jobId === job.id) releaseJob(sim, colonist);
    return;
  }
  const excavation = sim.excavation(job.excavationId);
  if (!excavation) {
    finishJob(sim, colonist, job);
    return;
  }
  if (job.type === 'dig') {
    performDig(sim, colonist, job, excavation);
    return;
  }
  if (job.type === 'haul') {
    performHaul(sim, colonist, job, excavation);
    return;
  }
  if (job.type === 'stockHaul') {
    performStockHaul(sim, colonist, job);
    return;
  }
  if (job.type === 'fit') {
    performFitting(sim, colonist, job);
    return;
  }
  if (job.type === 'produce') {
    performProduce(sim, colonist, job, excavation);
    return;
  }
  if (job.type === 'crank') {
    job.work += starvingWorkFactor(colonist);
    colonist.task = 'crank';
    colonist.animation += 0.1;
    excavation.manualVentilationWorkerId = colonist.id;
    return;
  }
  if (job.type === 'machineRepair') {
    performMachineRepair(sim, colonist, job, excavation);
    return;
  }
  if (job.type === 'repair') {
    if (!payForJob(sim, colonist, job)) return;
    const cap = repairCap(excavation);
    const workDay = (WORK.WORK_END_HOUR - WORK.WORK_START_HOUR) * TIME.TICKS_PER_HOUR;
    excavation.integrity = Math.min(cap, excavation.integrity
      + STRUCTURE.REPAIR_PER_WORKER_DAY / workDay * infectionWorkFactor(colonist) * starvingWorkFactor(colonist));
    colonist.task = 'repairing';
    colonist.animation += 0.08;
    if (excavation.integrity >= cap - 1e-9) {
      excavation.integrity = cap;
      sim.structureDirty = true;
      sim.log('info', 'eventRepair', { id: excavation.id }, excavation);
      finishJob(sim, colonist, job);
    }
    return;
  }
  if (!payForJob(sim, colonist, job)) return;
  job.work += infectionWorkFactor(colonist) * starvingWorkFactor(colonist);
  colonist.task = 'working';
  colonist.animation += 0.1;
  if (job.work < TIME.TICKS_PER_HOUR) return;
  if (job.type === 'lining') {
    excavation.lining = job.lining;
    excavation.targetLining = job.lining;
    sim.log('info', 'eventSupport', { id: excavation.id }, excavation);
  } else if (job.type === 'support') {
    const replaced = excavation.supports.findIndex((support) => (typeof support === 'number' ? support : support.x) === job.x);
    if (replaced >= 0) excavation.supports.splice(replaced, 1);
    excavation.supports.push({ x: job.x, y: excavation.y + excavation.h - 1, material: job.material });
    excavation.supports.sort((a, b) => a.x - b.x);
    sim.log('info', 'eventSupport', { id: excavation.id }, excavation);
  } else if (job.type === 'coating') {
    excavation.coating = job.coating;
  }
  sim.structureDirty = true;
  finishWorkedJob(sim, colonist, job);
}

import { CELL, EXCAVATION, STRUCTURE, WATER, WORLD } from '../data/balance.js';
import { RESCUE_SUPPORTS } from '../data/collapseRescue.js';
import { MATERIAL, materialAt } from '../data/materials.js';
import { cancelExcavation, excavationCells, planExcavation } from './excavation.js';
import { cancelJobsFor, digLiningAvailable, queueExcavation, queueLining, releaseJob, rescuableRoom } from './jobs.js';
import { findPath, forEachStep, isWalkable, navigationComponent, rebuildNav } from './nav.js';
import { evaluateProspect } from './structure.js';
import { collapseAccess } from './collapseAccess.js';
import { aquiferMaterial, currentWaterTableDepth } from './groundwater.js';
import { splitTunnelFragments } from './structureFragments.js';
import { observeRescueNarrative } from './rescueNarrative.js';

const accessChecks = new WeakMap();
const initializedCollapses = new WeakSet();
const isolationChecks = new WeakMap();

export function trappedSurvivors(sim, excavation) {
  const ids = excavation?.trappedColonistIds;
  if (!ids?.length) return [];
  return sim.colonists.filter((person) => ids.includes(person.id) && person.health > 0 && !person.dead);
}

function trap(sim, excavation, person) {
  for (const source of sim.excavations) {
    if (source !== excavation && source.trappedColonistIds?.includes(person.id)) {
      source.trappedColonistIds = source.trappedColonistIds.filter((id) => id !== person.id);
    }
  }
  const oldJob = sim.jobs.find((job) => job.id === person.jobId);
  // A carried load is buried too; keep it with the recoverable debris.
  if (person.carrying) {
    excavation.loose ??= {};
    const { resource, amount } = person.carrying;
    excavation.loose[resource] = (excavation.loose[resource] ?? 0) + amount;
    person.carrying = null;
  }
  if (person.jobId != null) releaseJob(sim, person);
  if (oldJob && ['haul', 'stockHaul'].includes(oldJob.type)) oldJob.status = 'done';
  person.trappedIn = excavation.id;
  delete person.isolatedByCollapse;
  person.personal = null;
  person.idleActivity = null;
  person.activity = null;
  person.path = [];
  person.pathIndex = 0;
  person.pathGoal = null;
  person.task = 'sit';
}

function initializeTrapped(sim, excavation) {
  if (Array.isArray(excavation.trappedColonistIds) || initializedCollapses.has(excavation)) return;
  initializedCollapses.add(excavation);
  const cells = new Set(excavation.cells ?? []);
  const trappedIds = [];
  for (const person of sim.colonists) {
    if (person.health <= 0 || person.dead || person.trappedIn != null) continue;
    const x = Math.round(person.x);
    const y = Math.round(person.y);
    const index = sim.world.index(x, y);
    if (!sim.world.inBounds(x, y) || !cells.has(index)
      || sim.world.states[index] !== CELL.SOLID || sim.world.materials[index] !== MATERIAL.RUBBLE) continue;
    trappedIds.push(person.id);
    trap(sim, excavation, person);
  }
  // Missing means no rescue, including legacy/test rooms merely marked collapsed.
  if (trappedIds.length) excavation.trappedColonistIds = trappedIds;
}

function escapeTargets(sim, excavation) {
  const targets = [];
  // An exit is a walkable cell just outside the buried footprint, reached by
  // a real navigation path. It must not depend on where the rescuers now stand.
  for (let y = excavation.y - 1; y <= excavation.y + excavation.h; y += 1) {
    for (let x = excavation.x - 1; x <= excavation.x + excavation.w; x += 1) {
      if (x >= excavation.x && x < excavation.x + excavation.w
        && y >= excavation.y && y < excavation.y + excavation.h) continue;
      if (isWalkable(sim, x, y)) targets.push({ x, y });
    }
  }
  return targets;
}

// Read-only counterpart of the release check below, used solely to identify
// the worker whose cell opened each survivor's route. It never plans a route.
export function rescueExitOpen(sim, source, person) {
  if (!isWalkable(sim, Math.round(person.x), Math.round(person.y))) return false;
  const access = collapseAccess(sim, sim.excavations.filter(room => room.state === 'collapsed'));
  if (access.hasStocks || person.isolatedByCollapse != null) return access.supplied(person);
  const targets = escapeTargets(sim, source);
  return targets.some(target => Math.round(person.x) === target.x && Math.round(person.y) === target.y)
    || findPath(sim, person, targets).length > 0;
}

function planRescue(sim, source, survivors) {
  const floor = source.y + source.h - 1;
  const buried = survivors.filter((person) => person.trappedIn != null);
  const top = Math.min(source.y, ...buried.map((person) => Math.round(person.y)));
  const left = Math.min(source.x, ...buried.map((person) => Math.round(person.x)));
  const right = Math.max(source.x + source.w, ...buried.map((person) => Math.round(person.x) + 1));
  const orders = source.kind === 'shaft'
    ? [{ kind: 'shaft', x: source.x, y: top, w: source.w,
      h: Math.max(floor, ...buried.map((person) => Math.round(person.y))) - top + 1 }]
    : [{ kind: 'gallery', x: left, y: Math.max(source.y, floor - EXCAVATION.GALLERY_MIN_H + 1),
      w: right - left, h: EXCAVATION.GALLERY_MIN_H }];
  if (source.kind !== 'shaft') {
    // Someone on a former ladder can be far above the floor. A horizontal band
    // there is unreachable from below: restore a real vertical working route.
    for (const x of [...new Set(survivors.filter((person) => Math.round(person.y) < floor)
      .map((person) => Math.round(person.x)))].sort((a, b) => a - b)) {
      const top = Math.min(source.y, ...survivors.filter((person) => Math.round(person.x) === x).map((person) => Math.round(person.y)));
      orders.push({ kind: 'shaft', x, y: top, w: EXCAVATION.SHAFT_MIN_W, h: floor - top + 1 });
    }
  }
  for (const order of orders) {
    placeRescueOrder(sim, order, (passage) => {
      passage.rescueSourceId = source.id;
      passage.originalExcavationId = source.originalExcavationId ?? source.collapseSourceId ?? source.id;
    });
  }
}

// The first support recipe that keeps a rescue order stable (`support`), and
// the one it is planned with (`chosen`): the first recipe when none does.
function rescueSupport(sim, order) {
  const support = RESCUE_SUPPORTS.find((candidate) => {
    const prospect = evaluateProspect(sim, { ...order, ...candidate }, { neighbors: false });
    return prospect.ok && prospect.ratio <= STRUCTURE.STABLE_RATIO;
  });
  return { support, chosen: support ?? RESCUE_SUPPORTS[0] };
}

// Plans one rescue order, the same way for buried people and for a cut-off
// water or food room: nothing when a rescue passage already covers it or when
// open tunnels already do, the support recipe, the junction rules and real
// dig jobs. `mark` names what the passage is for. Returns the passage, or null.
function placeRescueOrder(sim, order, mark) {
  const existing = sim.excavations.find((room) => room.rescueSourceId != null
    && room.state !== 'collapsed' && room.kind === order.kind
    && room.x <= order.x && room.x + room.w >= order.x + order.w
    && room.y <= order.y && room.y + room.h >= order.y + order.h);
  if (existing) return null;
  const activeTunnels = sim.excavations.filter((room) => room.state !== 'collapsed'
    && ['gallery', 'shaft'].includes(room.kind));
  const reusable = new Set(activeTunnels.filter((room) => room.kind === order.kind || order.kind === 'gallery')
    .flatMap((room) => room.cells));
  if (excavationCells(order).every(({ x, y }) => reusable.has(sim.world.index(x, y)))) return null;
  // If no recipe can guarantee stability, keep rescue possible and explicitly
  // report the remaining risk; never grant free or magical reinforcement.
  const { support, chosen } = rescueSupport(sim, order);
  // A rescue passage keeps its historical junction rule: it may run through
  // a neighbouring room rather than be trimmed or refused.
  const result = planExcavation(sim, { ...order, shape: chosen.shape, rescue: true });
  if (!result.ok) return null;
  // A partial second collapse can leave a fragment inside the new order.
  // Keep each physical cell in one air/heat volume. At a vertical junction,
  // the shaft owns the cell so navigation retains its ladder.
  const passage = result.excavation;
  const covered = new Set();
  const cells = new Set(passage.cells);
  for (const other of activeTunnels) {
    if (order.kind === 'shaft' && other.kind === 'gallery') {
      const before = other.cells.length;
      other.cells = other.cells.filter((index) => !cells.has(index));
      other.dugCells = other.dugCells.filter((index) => !cells.has(index));
      if (other.cells.length !== before) splitTunnelFragments(sim, other);
    } else {
      for (const index of other.cells) covered.add(index);
    }
  }
  passage.cells = passage.cells.filter((index) => !covered.has(index));
  passage.dugCells = passage.dugCells.filter((index) => !covered.has(index));
  mark(passage);
  passage.rescueLining = chosen.lining;
  passage.rescueSupportQueued = false;
  if (!digLiningAvailable(sim, { ...order, lining: chosen.lining }).ok) {
    sim.log('warning', chosen.lining === 'timber' ? 'eventRescueNoWood' : 'eventRescueNoSupport',
      { id: passage.id, excavationId: passage.id, material: chosen.lining }, passage);
  } else if (!support) {
    sim.log('warning', 'eventRescueSupportInsufficient', { id: passage.id, excavationId: passage.id }, passage);
  }
  for (const fragment of splitTunnelFragments(sim, passage)) queueExcavation(sim, fragment);
  return passage;
}

// Geometry/path searches run only after a terrain change. The per-tick pass
// merely checks the small list of people involved in an existing collapse.
export function updateRescues(sim) {
  observeRescueNarrative(sim);
  updateRescuesCore(sim);
  observeRescueNarrative(sim);
}

// The rescue planner and its route/working safety rules are unchanged.
function updateRescuesCore(sim) {
  let checks = accessChecks.get(sim);
  if (!checks) accessChecks.set(sim, checks = new Map());
  const sources = sim.excavations.filter((source) => source.state === 'collapsed');
  if (!sources.length) return;
  closeCollapsedRoomPieces(sim, sources);
  for (const source of sources) initializeTrapped(sim, source);
  const access = collapseAccess(sim, sources);
  if (isolationChecks.get(sim) !== access) {
    isolationChecks.set(sim, access);
    for (const person of sim.colonists) {
      if (person.health <= 0 || person.dead || person.trappedIn != null || person.surfaceCrewId) continue;
      const x = Math.round(person.x);
      const y = Math.round(person.y);
      if (!sim.world.inBounds(x, y)) continue;
      let source;
      if (sim.world.states[sim.world.index(x, y)] === CELL.SOLID) {
        const distance = (room) => Math.max(room.x - x, 0, x - (room.x + room.w - 1))
          + Math.max(room.y - y, 0, y - (room.y + room.h - 1));
        source = [...sources].sort((a, b) => distance(a) - distance(b) || a.id - b.id)[0];
        trap(sim, source, person);
      } else {
        source = access.separatingSource(person);
        if (source) {
          const previous = sim.excavation(person.isolatedByCollapse);
          if (previous && previous !== source) previous.trappedColonistIds = (previous.trappedColonistIds ?? []).filter((id) => id !== person.id);
          person.isolatedByCollapse = source.id;
        }
      }
      if (source) {
        source.trappedColonistIds ??= [];
        if (!source.trappedColonistIds.includes(person.id)) source.trappedColonistIds.push(person.id);
      }
    }
  }
  for (const source of sources) {
    initializeTrapped(sim, source);
    let survivors = trappedSurvivors(sim, source);
    if (!survivors.length) {
      if (source.trappedColonistIds?.length) source.trappedColonistIds = [];
      continue;
    }
    const signature = `${access.signature}:${survivors.map((person) => `${person.id},${Math.round(person.x)},${Math.round(person.y)}`).join(';')}`;
    if (checks.get(source.id) !== signature) {
      checks.set(source.id, signature);
      const targets = escapeTargets(sim, source);
      survivors = survivors.filter((person) => {
        const walkable = isWalkable(sim, Math.round(person.x), Math.round(person.y));
        const canEscape = access.hasStocks || person.isolatedByCollapse != null ? access.supplied(person)
          : targets.some((target) => Math.round(person.x) === target.x && Math.round(person.y) === target.y)
            || findPath(sim, person, targets).length > 0;
        if (!walkable || !canEscape) return true;
        delete person.trappedIn;
        delete person.isolatedByCollapse;
        person.personal = null;
        person.path = [];
        person.pathIndex = 0;
        person.pathGoal = null;
        person.needRetryTick = 0;
        person.task = 'idle';
        return false;
      });
    }
    source.trappedColonistIds = survivors.map((person) => person.id);
    if (survivors.length) planRescue(sim, source, survivors);
  }
  for (const passage of sim.excavations) {
    if (passage.rescueSourceId == null || !passage.rescueLining || passage.rescueSupportQueued
      || !['dug', 'fitted'].includes(passage.state)) continue;
    const result = queueLining(sim, passage, passage.rescueLining);
    if (result.ok) passage.rescueSupportQueued = true;
  }
}

// ---------------------------------------------------------------------------
// Rescue passage to a cut-off water or food room.
//
// A fitted water or food room the colony could walk to, and no longer can (a
// collapse cut its gallery or shaft), gets the same help as buried people: the
// game plans a passage to it, a gallery and/or a shaft dug by the colonists
// with the usual jobs. Its jobs come right after those that free people
// buried alive (jobs.js, isRoomRescueJob). The passage is the shortest dig
// (in work) from the part of the colony that still reaches the room, and it
// never opens a cell that holds water or touches it, a cell of the water
// table, the cell someone stands on, nor one whose opening would turn a
// neighbouring room red. Without such a passage nothing is dug: the warning
// asks the player to dig. room.cutOffRescue keeps the episode: 'planned',
// 'unsafe' or 'cancelled' (the player cancelled it: not planned again until
// the room has been reached again and cut off anew). While it is 'planned',
// room.cutOffRescueRoute keeps the cells the route relies on and
// room.cutOffRescueVia the tunnels of others it crosses (a person rescue's,
// another room's, the player's own planned dig): their jobs get the same
// priority (jobs.js, roomRescueSiteIds). The pieces the game planned for the
// room carry rescueRoomId only while the room waits for them.

// Search weights, in minutes of digging: a move costs a step, a change between
// gallery and shaft a few more, so that of two equal digs the straighter wins.
const ROUTE_STEP = 1;
const ROUTE_TURN = 10;
// A route refused by the structural check is searched again around the
// refused order, a few times at most.
const ROUTE_ATTEMPTS = 4;
// What a person stands on in a route state: an existing walkable cell, the
// floor of a new gallery, a new shaft cell (ladder), or the excavated air
// under a new shaft (its ladder will hang through it).
const STAND = 0;
const GALLERY = 1;
const SHAFT = 2;
const AIR_UNDER_SHAFT = 3;
const MODES = 4;
// Water a route neither opens nor digs beside: from the depth at which a
// person wades (a film of a few hundredths is not water to the game).
const ROUTE_WATER_MIN = WATER.WADING_MIN_RATIO * WATER.MAX_PER_CELL;
const holdsWater = (world, index) => world.water[index] >= ROUTE_WATER_MIN;

export function roomRescuePassages(sim, room) {
  return sim.excavations.filter((passage) => passage.rescueRoomId === room.id && passage.state !== 'collapsed'
    && ['gallery', 'shaft'].includes(passage.kind));
}

function unfinishedPassages(sim, room) {
  return roomRescuePassages(sim, room).filter((passage) => ['planned', 'digging'].includes(passage.state));
}

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(cost, state) {
    const items = this.items;
    items.push([cost, state]);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.less(items[index], items[parent])) break;
      [items[index], items[parent]] = [items[parent], items[index]];
      index = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = 2 * index + 1;
        const right = left + 1;
        let best = index;
        if (left < items.length && this.less(items[left], items[best])) best = left;
        if (right < items.length && this.less(items[right], items[best])) best = right;
        if (best === index) break;
        [items[index], items[best]] = [items[best], items[index]];
        index = best;
      }
    }
    return top;
  }
  less(a, b) { return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]); }
}

// Cell kinds of a route search.
const BLOCKED = 0;
const ROCK = 1; // dug by the passage
const VOID = 2; // a natural void the passage takes
const TUNNEL = 3; // open or planned by another tunnel: crossed, not dug again

// What a route may do with each cell, computed lazily once per search.
function routeTerrain(sim, forbidden) {
  const { world } = sim;
  const size = world.width * world.height;
  const reserved = new Map();
  for (const excavation of sim.excavations) {
    if (excavation.state === 'collapsed') continue;
    for (const index of excavation.cells ?? []) reserved.set(index, excavation);
    for (const index of excavation.dugCells ?? []) reserved.set(index, excavation);
  }
  // The cell under someone's feet.
  const under = new Set();
  for (const person of sim.colonists) {
    if (person.dead || person.health <= 0) continue;
    const x = Math.round(person.x);
    const y = Math.round(person.y) + 1;
    if (world.inBounds(x, y)) under.add(world.index(x, y));
  }
  const tableDepth = currentWaterTableDepth(sim);
  const wet = (x, y) => world.inBounds(x, y) && holdsWater(world, world.index(x, y));
  const bottom = Math.min(world.height, WORLD.HEIGHT);
  const kinds = new Int8Array(size).fill(-1);
  const kind = (index) => {
    if (kinds[index] >= 0) return kinds[index];
    const x = index % world.width;
    const y = (index - x) / world.width;
    const owner = reserved.get(index);
    let value = ROCK;
    if (forbidden.has(index) || y < WORLD.SURFACE_Y || y + 1 >= bottom || wet(x, y)) value = BLOCKED;
    // Rock left in a finished tunnel (rubble a fontis poured into it) is dug
    // by nobody, and a new order cannot take it from its tunnel.
    else if (owner) {
      value = ['gallery', 'shaft'].includes(owner.kind) && (world.states[index] === CELL.EMPTY
        || ['planned', 'digging'].includes(owner.state)) ? TUNNEL : BLOCKED;
    }
    else if (world.states[index] === CELL.EMPTY) value = world.cellExcavation[index] < 0 ? VOID : BLOCKED;
    else if (!world.isDiggable(x, y) || under.has(index)
      || wet(x - 1, y) || wet(x + 1, y) || wet(x, y - 1) || wet(x, y + 1)
      || (y - WORLD.SURFACE_Y >= tableDepth && aquiferMaterial(world.materials[index]))) value = BLOCKED;
    kinds[index] = value;
    return value;
  };
  const cost = (index) => kind(index) === ROCK ? materialAt(world.materials[index]).hardness * 60 : 0;
  const opens = (index) => kind(index) === ROCK || kind(index) === VOID;
  return { kind, cost, opens, owner: (index) => reserved.get(index) };
}

// The cheapest passage, as the route states from the room's side to the
// colony's side, or null. homes: navigation components of the colony.
function searchRoute(sim, room, homes, forbidden) {
  const { world } = sim;
  const { width } = world;
  const size = width * world.height;
  const nav = rebuildNav(sim);
  const component = (index) => navigationComponent(sim, index % width, Math.floor(index / width));
  const starts = new Set();
  for (const index of room.dugCells ?? []) {
    if (nav.walkable[index]) starts.add(component(index));
  }
  starts.delete(-1);
  if (!starts.size || !homes.size) return null;
  const terrain = routeTerrain(sim, forbidden);
  const dist = new Float64Array(size * MODES).fill(Infinity);
  const previous = new Int32Array(size * MODES).fill(-1);
  const heap = new MinHeap();
  for (let index = 0; index < size; index += 1) {
    if (!nav.walkable[index] || !starts.has(component(index))) continue;
    dist[index * MODES + STAND] = 0;
    heap.push(0, index * MODES + STAND);
  }
  let goal = null;
  const relax = (from, index, mode, cost) => {
    const state = index * MODES + mode;
    if (cost >= dist[state]) return;
    dist[state] = cost;
    previous[state] = from;
    heap.push(cost, state);
  };
  const reachGoal = (from, cost) => {
    if (!goal || cost < goal.cost || (cost === goal.cost && from < goal.from)) goal = { from, cost };
  };
  // An existing walkable cell: the colony (the goal), the room's own side
  // (already a start), or somewhere else the route walks through.
  const walkInto = (from, index, cost) => {
    const label = component(index);
    if (homes.has(label)) reachGoal(from, cost);
    else if (!starts.has(label)) relax(from, index, STAND, cost);
  };
  const excavatedAir = (index) => world.states[index] === CELL.EMPTY && world.cellExcavation[index] >= 0
    && !holdsWater(world, index) && !nav.walkable[index];
  const canStartHangingShaft = (state, index, landing) => {
    if (!terrain.opens(index)) {
      const owner = terrain.owner(index);
      return owner?.kind === 'shaft' && landing - index <= (owner.h + 1) * width;
    }
    // The finished ladder reaches the floor, but a miner on that floor
    // must first reach the rock that the ladder will hang from. Count only
    // the new shaft piece at this end (routeOrders splits it at MAX_DIMENSION).
    let length = 1;
    let end = index;
    for (let from = previous[state]; from >= 0 && from % MODES === SHAFT; from = previous[from]) {
      const cell = Math.floor(from / MODES);
      if (Math.abs(cell - end) !== width || !terrain.opens(cell)) break;
      length += 1;
      end = cell;
    }
    const height = (length - 1) % EXCAVATION.MAX_DIMENSION + 1;
    return landing - index <= (height + 1) * width;
  };
  while (heap.size) {
    const [cost, state] = heap.pop();
    if (cost > dist[state]) continue;
    if (goal && cost >= goal.cost) break;
    const index = Math.floor(state / MODES);
    const mode = state % MODES;
    const x = index % width;
    const y = (index - x) / width;
    // Sideways: a gallery two rows high whose floor row is this one.
    if (mode !== AIR_UNDER_SHAFT && y >= 1 && y + 1 < world.height) {
      for (const dx of [-1, 1]) {
        if (x + dx < 0 || x + dx >= width) continue;
        const next = index + dx;
        if (nav.walkable[next]) {
          walkInto(state, next, cost + ROUTE_STEP);
          continue;
        }
        const head = next - width;
        if (!terrain.kind(next) || !terrain.kind(head) || world.states[next + width] !== CELL.SOLID) continue;
        relax(state, next, GALLERY, cost + ROUTE_STEP + terrain.cost(next) + terrain.cost(head)
          + (mode === SHAFT ? ROUTE_TURN : 0));
      }
    }
    // Up: a shaft; from a gallery floor, first its own head cell, which the
    // ladder of the shaft above will hang through.
    if (y >= 1) {
      const next = index - width;
      if (mode === GALLERY) {
        relax(state, next, AIR_UNDER_SHAFT, cost + ROUTE_STEP + ROUTE_TURN);
      } else if (excavatedAir(next) && mode !== SHAFT) {
        relax(state, next, AIR_UNDER_SHAFT, cost + ROUTE_STEP);
      } else if (nav.walkable[next]) {
        if (mode === SHAFT && (world.cellExcavation[next] >= 0 || nav.ladders[next])) walkInto(state, next, cost + ROUTE_STEP);
      } else if (terrain.kind(next) && (mode !== STAND || world.states[next] === CELL.SOLID)) {
        relax(state, next, SHAFT, cost + ROUTE_STEP + terrain.cost(next));
      }
    }
    // Down: a shaft through the floor; the ladder of a shaft can also hang
    // into an excavation of the colony below.
    if (mode !== AIR_UNDER_SHAFT && y + 2 < world.height) {
      const next = index + width;
      if (mode === SHAFT && world.states[next] === CELL.EMPTY && world.cellExcavation[next] >= 0) {
        let landing = next;
        while (landing + width < size && world.states[landing + width] === CELL.EMPTY
          && world.cellExcavation[landing + width] >= 0) landing += width;
        if (nav.walkable[landing] && homes.has(component(landing)) && canStartHangingShaft(state, index, landing)) {
          reachGoal(state, cost + ROUTE_STEP);
        }
      } else if (terrain.kind(next) && (mode === SHAFT || world.states[next] === CELL.SOLID)) {
        relax(state, next, SHAFT, cost + ROUTE_STEP + terrain.cost(next) + (mode === GALLERY ? ROUTE_TURN : 0));
      }
    }
  }
  if (!goal) return null;
  const route = [];
  for (let state = goal.from; state >= 0; state = previous[state]) route.push(state);
  return route.reverse().map((state) => ({ index: Math.floor(state / MODES), mode: state % MODES }));
}

// The dig orders of a route: one gallery per straight stretch of new gallery
// floor, one shaft per straight stretch of new shaft cells, cut at the largest
// excavation the game allows. A stretch that only crosses open tunnels opens
// nothing and is left out.
function routeOrders(sim, route, forbidden) {
  const { width } = sim.world;
  const terrain = routeTerrain(sim, forbidden);
  const orders = [];
  let current = null;
  for (const { index, mode } of route) {
    const x = index % width;
    const y = (index - x) / width;
    const opens = mode === GALLERY ? terrain.opens(index) || terrain.opens(index - width)
      : mode === SHAFT && terrain.opens(index);
    if (!opens) {
      current = null;
      continue;
    }
    const kind = mode === GALLERY ? 'gallery' : 'shaft';
    const order = current?.kind === kind ? current : null;
    if (order && kind === 'gallery' && order.w < EXCAVATION.MAX_DIMENSION && order.y + order.h - 1 === y
      && (x === order.x - 1 || x === order.x + order.w)) {
      order.x = Math.min(order.x, x);
      order.w += 1;
      continue;
    }
    if (order && kind === 'shaft' && order.h < EXCAVATION.MAX_DIMENSION && order.x === x
      && (y === order.y - 1 || y === order.y + order.h)) {
      order.y = Math.min(order.y, y);
      order.h += 1;
      continue;
    }
    current = kind === 'gallery'
      ? { kind, x, y: y - EXCAVATION.GALLERY_MIN_H + 1, w: 1, h: EXCAVATION.GALLERY_MIN_H }
      : { kind, x, y, w: EXCAVATION.SHAFT_MIN_W, h: 1 };
    orders.push(current);
  }
  return orders;
}

// The cells a route relies on: those it walks, crosses or opens (a new
// gallery floor with its head cell).
function routeCells(sim, route) {
  const cells = new Set();
  for (const { index, mode } of route) {
    cells.add(index);
    if (mode === GALLERY) cells.add(index - sim.world.width);
  }
  return [...cells].sort((a, b) => a - b);
}

// The cheapest safe passage to the room: its orders ([] when open or planned
// tunnels already make one) and the cells it relies on; null when there is no
// safe passage.
function safeRoomRoute(sim, room, homes) {
  const forbidden = new Set();
  for (let attempt = 0; attempt < ROUTE_ATTEMPTS; attempt += 1) {
    const route = searchRoute(sim, room, homes, forbidden);
    if (!route) return null;
    const orders = routeOrders(sim, route, forbidden);
    const refused = orders.find((order) => {
      const { chosen } = rescueSupport(sim, order);
      const prospect = evaluateProspect(sim, { ...order, shape: chosen.shape, lining: chosen.lining, rescue: true });
      return !prospect.ok || (prospect.neighborRisk ?? []).some((risk) => risk.color === 'red');
    });
    if (!refused) return { orders, cells: routeCells(sim, route) };
    for (const { x, y } of excavationCells(refused)) {
      const index = sim.world.index(x, y);
      if (sim.world.states[index] === CELL.SOLID) forbidden.add(index);
    }
  }
  return null;
}

// The cells of tunnels still to dig (planned or being dug), by owner.
function pendingTunnelCells(sim) {
  const owners = new Map();
  for (const excavation of sim.excavations) {
    if (!['gallery', 'shaft'].includes(excavation.kind) || !['planned', 'digging'].includes(excavation.state)) continue;
    for (const index of excavation.cells ?? []) owners.set(index, excavation);
  }
  return owners;
}

// The tunnels of others the room's route crosses while they are still to dig.
function setRoomRoute(sim, room, cells, owners = pendingTunnelCells(sim)) {
  room.cutOffRescueRoute = cells;
  const via = new Set();
  for (const index of cells) {
    const owner = owners.get(index);
    if (owner && owner.rescueRoomId !== room.id) via.add(owner.id);
  }
  if (via.size) room.cutOffRescueVia = [...via].sort((a, b) => a - b);
  else delete room.cutOffRescueVia;
}

// Whether the route the room waits for no longer holds: a cell it relies on
// is rock no tunnel will dig any more (a piece or a crossed tunnel caved in,
// was cancelled or is gone), or every cell is open and the room is still cut
// off. A route that holds is left alone: nothing is searched again.
function routeBroken(sim, room, owners) {
  const route = room.cutOffRescueRoute;
  if (!route?.length) return true;
  let open = true;
  for (const index of route) {
    if (sim.world.states[index] === CELL.EMPTY) continue;
    open = false;
    if (!owners.has(index)) return true;
  }
  return open;
}

// Ends what the game planned for the room: unfinished pieces are abandoned
// when `abandon` is set; the others are kept as ordinary tunnels.
function closeRoomRescue(sim, room, abandon) {
  for (const passage of sim.excavations.filter((candidate) => candidate.rescueRoomId === room.id)) {
    if (abandon && ['gallery', 'shaft'].includes(passage.kind) && ['planned', 'digging'].includes(passage.state)) {
      abandonPassage(sim, passage);
    } else {
      delete passage.rescueRoomId;
    }
  }
  delete room.cutOffRescueRoute;
  delete room.cutOffRescueVia;
}

// Plans the cheapest safe passage, or what is missing of it: open, planned
// and dug pieces are crossed without cost, so only the gaps get new pieces,
// and a piece the new route no longer uses is abandoned. Without a safe
// passage, the unfinished pieces are abandoned. Returns 'planned' or 'unsafe'.
function planRoomRescue(sim, room, homes) {
  const route = safeRoomRoute(sim, room, homes);
  if (!route) {
    closeRoomRescue(sim, room, true);
    room.cutOffRescue = 'unsafe';
    return 'unsafe';
  }
  for (const order of route.orders) {
    placeRescueOrder(sim, order, (passage) => {
      passage.rescueSourceId = room.id;
      passage.rescueRoomId = room.id;
    });
  }
  const cells = new Set(route.cells);
  for (const passage of unfinishedPassages(sim, room)) {
    if (!passage.cells.some((index) => cells.has(index))) abandonPassage(sim, passage);
  }
  room.cutOffRescue = 'planned';
  setRoomRoute(sim, room, route.cells);
  return 'planned';
}

// Called once when a fitted water or food room passes from reached to cut
// off (colonists.js). Returns 'planned' or 'unsafe'. A rescue passage still
// planned or being dug (the person rescue's, another room's, or a tunnel the
// player planned) is crossed by the search without cost and covers its own
// orders (placeRescueOrder): nothing is planned twice.
export function rescueCutOffRoom(sim, room, homes) {
  return planRoomRescue(sim, room, homes);
}

// Each hour while the room stays cut off (colonists.js). A route that no
// longer holds (part of it caved in, a crossed tunnel was cancelled, it is
// all dug and the room is still cut off) is completed or planned anew; a
// room without a safe passage is tried again, since water drains and people
// move. A passage the player cancelled is not. Returns the new state when it
// searched, null otherwise.
export function resumeRoomRescue(sim, room, homes) {
  if (room.cutOffRescue === 'planned') {
    const owners = pendingTunnelCells(sim);
    if (!routeBroken(sim, room, owners)) {
      // Tunnels split or planned again keep the passage's priority.
      setRoomRoute(sim, room, room.cutOffRescueRoute, owners);
      return null;
    }
  } else if (room.cutOffRescue !== 'unsafe') {
    return null;
  }
  return planRoomRescue(sim, room, homes);
}

// A fitted water or food room that is one no longer (it caved in, it was
// fitted for something else): its passage is abandoned, its episode ends.
export function roomRescueEnded(sim, room) {
  closeRoomRescue(sim, room, true);
  delete room.cutOffRescue;
}

function forgetRescue(passage) {
  delete passage.rescueSourceId;
  delete passage.rescueRoomId;
  delete passage.rescueLining;
  delete passage.rescueSupportQueued;
}

// The usual cancellation: what was already dug stays, as a quarry, without
// the rescue's support.
function abandonPassage(sim, passage) {
  cancelJobsFor(sim, passage);
  cancelExcavation(sim, passage);
  forgetRescue(passage);
}

// Each minute (updateRescues): a piece of a room's passage that caved in
// whole is rubble. Its leftover jobs are closed, and it no longer belongs to
// the passage; the hourly check plans what is missing. Left queued, each of
// those jobs would hand a free colonist the same dead cell every minute
// (getJobTask releases it at once), and keep him from any other work.
function closeCollapsedRoomPieces(sim, sources) {
  for (const piece of sources) {
    if (piece.rescueRoomId == null) continue;
    cancelJobsFor(sim, piece);
    forgetRescue(piece);
  }
}

// The player cancelled a tunnel (sim.js, after the usual cancellation;
// cells: the tunnel's cells before it). A rescue passage cancelled is a
// rescue stopped: every room whose route relies on one of its cells (its own
// pieces, or another rescue's tunnel it crosses) loses the rest of its
// passage, and that passage is not planned again while the room stays cut
// off. A room that is no longer a fitted water or food room (it caved in)
// just ends its rescue, without a word. A tunnel of the player's own leaves
// the rooms waiting: the hourly check fills the gap. So does a person rescue
// that still has someone to free, which plans its passage again at once
// (updateRescues).
export function cancelRoomRescue(sim, passage, cells = passage.cells ?? []) {
  const ownRoomId = passage.rescueRoomId;
  const sourceId = passage.rescueSourceId;
  if (ownRoomId != null) forgetRescue(passage);
  if (sourceId == null || (ownRoomId == null && trappedSurvivors(sim, sim.excavation(sourceId)).length)) return;
  const cancelled = new Set(cells);
  for (const room of [...sim.excavations]) {
    if (room.cutOffRescue !== 'planned' || !(room.cutOffRescueRoute ?? []).some((index) => cancelled.has(index))) continue;
    closeRoomRescue(sim, room, true);
    if (!rescuableRoom(room)) {
      delete room.cutOffRescue;
      continue;
    }
    room.cutOffRescue = 'cancelled';
    sim.log('info', 'eventRoomRescueCancelled', { id: room.id, excavationId: room.id }, room);
  }
}

// Whether the colony's home (origins: colonists.js, colonyOrigins) walks to
// the room without the cells these passages opened.
function reachedWithout(sim, room, origins, passages) {
  const { world } = sim;
  const { width } = world;
  const size = width * world.height;
  const nav = rebuildNav(sim);
  const blocked = new Set(passages.flatMap((passage) => passage.dugCells ?? []));
  const targets = new Set(room.dugCells ?? []);
  const seen = new Uint8Array(size);
  const queue = [];
  const offer = (next) => {
    if (next < 0 || next >= size || seen[next] || !nav.walkable[next] || blocked.has(next)) return;
    seen[next] = 1;
    queue.push(next);
  };
  for (const origin of origins) {
    const x = Math.round(origin.x);
    const y = Math.round(origin.y);
    if (world.inBounds(x, y)) offer(world.index(x, y));
  }
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (targets.has(current)) return true;
    const x = current % width;
    if (x > 0) offer(current - 1);
    if (x + 1 < width) offer(current + 1);
    if (nav.ladders[current] || nav.ladders[current + width]) offer(current + width);
    if (nav.ladders[current] || nav.ladders[current - width]) offer(current - width);
    if (nav.steps[current]) forEachStep(nav, current, width, offer);
  }
  return false;
}

// A cut-off room the colony reaches again (colonists.js): an unfinished
// rescue passage is abandoned when another way reached the room, and kept to
// its end when it is what reached it, as an ordinary tunnel (it no longer
// outranks other work, and a later cut-off starts afresh). The journal says
// the room is linked.
export function roomReconnected(sim, room, origins) {
  const passages = unfinishedPassages(sim, room);
  if (passages.length && reachedWithout(sim, room, origins, passages)) {
    for (const passage of passages) abandonPassage(sim, passage);
  }
  closeRoomRescue(sim, room, false);
  delete room.cutOffRescue;
  sim.log('info', 'eventRoomReconnected', { id: room.id, excavationId: room.id }, room);
}

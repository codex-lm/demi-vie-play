import { CELL, WORK, WORLD } from '../data/balance.js';

const caches = new WeakMap();

// One-row steps between laterally adjacent standing cells (both on solid
// ground). Bits of nav.steps, per cell: where a step from this cell lands.
export const STEP_UP_LEFT = 1;
export const STEP_UP_RIGHT = 2;
export const STEP_DOWN_LEFT = 4;
export const STEP_DOWN_RIGHT = 8;

// Calls visit(target) for each one-row step target of a cell. Every graph
// search over the navigation map uses it, so all of them agree with findPath.
export function forEachStep(nav, index, width, visit) {
  const steps = nav.steps[index];
  if (steps === 0) return;
  if (steps & STEP_UP_LEFT) visit(index - width - 1);
  if (steps & STEP_UP_RIGHT) visit(index - width + 1);
  if (steps & STEP_DOWN_LEFT) visit(index + width - 1);
  if (steps & STEP_DOWN_RIGHT) visit(index + width + 1);
}

// A path point reached by a one-row step (a diagonal move between ledges).
export function isStepMove(width, from, to) {
  return from >= 0 && from % width !== to % width && Math.floor(from / width) !== Math.floor(to / width);
}

// Keep the same invalidation fields as the former shaft-version string, but
// compare their values directly: isWalkable can query this hundreds of times
// within a tick. The snapshot is private to the navigation cache.
function shaftsUnchanged(sim, snapshots) {
  let index = 0;
  for (const excavation of sim.excavations ?? []) {
    if (excavation.kind !== 'shaft') continue;
    const previous = snapshots[index++];
    if (!previous || previous.id !== excavation.id || previous.state !== excavation.state
      || previous.length !== excavation.dugCells.length || previous.roomType !== excavation.roomType
      || previous.powered !== excavation.powered || previous.powerShed !== excavation.powerShed
      || previous.disabled !== excavation.disabled) return false;
  }
  return index === snapshots.length;
}

function snapshotShafts(sim) {
  const snapshots = [];
  for (const excavation of sim.excavations ?? []) {
    if (excavation.kind !== 'shaft') continue;
    snapshots.push({
      id: excavation.id, state: excavation.state, length: excavation.dugCells.length,
      roomType: excavation.roomType, powered: excavation.powered,
      powerShed: excavation.powerShed, disabled: excavation.disabled,
    });
  }
  return snapshots;
}

export function rebuildNav(sim) {
  const world = sim.world;
  const size = world.width * world.height;
  let nav = caches.get(world);
  if (!nav) {
    nav = {
      revision: -1,
      shafts: [],
      walkable: new Uint8Array(size),
      ladders: new Uint8Array(size),
      elevators: new Uint8Array(size),
      steps: new Uint8Array(size),
      seen: new Uint32Array(size),
      closed: new Uint32Array(size),
      parent: new Int32Array(size),
      score: new Float64Array(size),
      heap: new Int32Array(size),
      heapPosition: new Int32Array(size),
      heapScore: new Float64Array(size),
      stamp: 0,
    };
    nav.heapPosition.fill(-1);
    caches.set(world, nav);
  }
  const surfaceRestricted = (sim.doors ?? []).some((door) => door.kind === 'hatch');
  if (nav.revision === world.revision && nav.surfaceRestricted === surfaceRestricted
    && shaftsUnchanged(sim, nav.shafts)) return nav;

  nav.revision = world.revision;
  nav.shafts = snapshotShafts(sim);
  nav.surfaceRestricted = surfaceRestricted;
  nav.reachability = new Map();
  nav.walkable.fill(0);
  nav.ladders.fill(0);
  nav.elevators.fill(0);
  for (const excavation of sim.excavations ?? []) {
    if (excavation.kind !== 'shaft' || excavation.state === 'collapsed') continue;
    const elevator = excavation.roomType === 'elevator' && excavation.powered && !excavation.powerShed && !excavation.disabled;
    for (const index of excavation.dugCells) {
      if (elevator) nav.elevators[index] = 1;
      if (index < 0 || index >= size || world.states[index] !== CELL.EMPTY) continue;
      nav.ladders[index] = 1;
      const above = index - world.width;
      if (above >= 0 && world.states[above] === CELL.EMPTY && world.cellExcavation[above] >= 0
        && world.cellExcavation[above] !== excavation.id) nav.ladders[above] = 1;
      // Below the shaft's own cells the ladder keeps hanging through every
      // excavated empty cell, whoever owns it (room, gallery, quarry, another
      // order that re-owned part of a room), down to the first cell standing on
      // solid ground. Ownership is not geometry: a ladder cut by a re-owned
      // cell left people stranded on the rungs above a room's floor.
      const below = index + world.width;
      if (below >= size || world.states[below] !== CELL.EMPTY || world.cellExcavation[below] < 0
        || world.cellExcavation[below] === excavation.id) continue;
      for (let cell = below; cell < size; cell += world.width) {
        if (world.states[cell] !== CELL.EMPTY || world.cellExcavation[cell] < 0) break;
        nav.ladders[cell] = 1;
        const under = cell + world.width;
        if (under >= size || world.states[under] === CELL.SOLID) break;
      }
    }
  }
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const index = world.index(x, y);
      if ((surfaceRestricted && y < WORLD.SURFACE_Y) || world.states[index] !== CELL.EMPTY) continue;
      const floor = y + 1 < world.height && world.states[index + world.width] === CELL.SOLID;
      const landing = y + 1 < world.height && nav.ladders[index + world.width] === 1;
      if (floor || nav.ladders[index] || landing) nav.walkable[index] = 1;
    }
  }
  // A colonist steps up or down one row between two laterally adjacent cells
  // that both stand on solid ground, with head room on both sides: the cell
  // above the lower one (the step passes through it) and the cell above the
  // upper one (where the head ends up) are open. Two rows need a ladder.
  nav.steps.fill(0);
  const width = world.width;
  const headRoom = (upper) => upper >= width && world.states[upper - width] === CELL.EMPTY;
  for (let lower = width; lower < size - width; lower += 1) {
    if (!nav.walkable[lower] || world.states[lower + width] !== CELL.SOLID
      || world.states[lower - width] !== CELL.EMPTY) continue;
    const x = lower % width;
    // The upper cell stands on the lower cell's lateral neighbour.
    if (x > 0 && world.states[lower - 1] === CELL.SOLID && nav.walkable[lower - width - 1] && headRoom(lower - width - 1)) {
      nav.steps[lower] |= STEP_UP_LEFT;
      nav.steps[lower - width - 1] |= STEP_DOWN_RIGHT;
    }
    if (x + 1 < width && world.states[lower + 1] === CELL.SOLID && nav.walkable[lower - width + 1] && headRoom(lower - width + 1)) {
      nav.steps[lower] |= STEP_UP_RIGHT;
      nav.steps[lower - width + 1] |= STEP_DOWN_LEFT;
    }
  }
  return nav;
}

export function isWalkable(sim, x, y) {
  if (!sim.world.inBounds(x, y)) return false;
  return rebuildNav(sim).walkable[sim.world.index(x, y)] === 1;
}

// A target search does not mutate terrain or shaft power. Its callers can reuse
// one validated navigation map for that synchronous search instead of checking
// the entire shaft snapshot again for every candidate cell.
export function isWalkableIn(world, nav, x, y) {
  return world.inBounds(x, y) && nav.walkable[world.index(x, y)] === 1;
}

export function navigationTargets(sim, x, y, includeCenter = true) {
  if (!includeCenter) return [];
  const targets = [];
  const cells = [{ x, y }, { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }];
  let nav;
  for (const cell of cells) {
    if (!sim.world.inBounds(cell.x, cell.y)) continue;
    nav ??= rebuildNav(sim);
    if (isWalkableIn(sim.world, nav, cell.x, cell.y)) targets.push(cell);
  }
  return targets;
}

function normalizePoint(point) {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function navigationComponent(sim, x, y) {
  const world = sim.world;
  const nav = rebuildNav(sim);
  if (!world.inBounds(x, y)) return -1;
  nav.reachability ??= new Map();
  let labels = nav.reachability.get('components');
  if (!labels) {
    const size = world.width * world.height;
    labels = new Int32Array(size);
    labels.fill(-1);
    const queue = new Int32Array(size);
    let component = 0;
    for (let start = 0; start < size; start += 1) {
      if (!nav.walkable[start] || labels[start] >= 0) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      labels[start] = component;
      while (head < tail) {
        const current = queue[head++];
        const currentX = current % world.width;
        const currentY = Math.floor(current / world.width);
        const offer = (next) => {
          if (!nav.walkable[next] || labels[next] >= 0) return;
          labels[next] = component;
          queue[tail++] = next;
        };
        if (currentX > 0) offer(current - 1);
        if (currentX + 1 < world.width) offer(current + 1);
        const below = current + world.width;
        const above = current - world.width;
        if (currentY + 1 < world.height && (nav.ladders[current] || nav.ladders[below])) offer(below);
        if (currentY > 0 && (nav.ladders[current] || nav.ladders[above])) offer(above);
        if (nav.steps[current]) forEachStep(nav, current, world.width, offer);
      }
      component += 1;
    }
    nav.reachability.set('components', labels);
  }
  return labels[world.index(x, y)];
}

export function pathCost(path) {
  if (!path || path.length === 0) return Infinity;
  return path.reduce((total, cell) => total + (cell.step ? WORK.STEP_WALK_CELLS : 1) / (cell.climb
    ? (cell.elevator ? WORK.ELEVATOR_CELLS_PER_MINUTE : WORK.LADDER_CELLS_PER_MINUTE)
    : WORK.WALK_CELLS_PER_MINUTE), 0);
}

export function findPath(sim, start, goal, goalX, goalY) {
  let origin;
  let requestedGoals;
  if (typeof start === 'number') {
    origin = { x: start, y: goal };
    requestedGoals = [{ x: goalX, y: goalY }];
  } else {
    origin = normalizePoint(start);
    requestedGoals = Array.isArray(goal) ? goal : [goal];
  }
  const world = sim.world;
  const nav = rebuildNav(sim);
  if (!world.inBounds(origin.x, origin.y)) return [];
  const startIndex = world.index(origin.x, origin.y);
  if (!nav.walkable[startIndex]) return [];

  const goalIndices = new Set();
  for (const requested of requestedGoals) {
    if (!requested) continue;
    const point = normalizePoint(requested);
    if (!world.inBounds(point.x, point.y)) continue;
    const index = world.index(point.x, point.y);
    if (nav.walkable[index]) goalIndices.add(index);
  }
  if (goalIndices.size === 0) return [];
  if (goalIndices.has(startIndex)) {
    // An interrupted walk can stop between cell centres. Being in the target
    // cell is not yet arrival: personal tasks require its exact coordinates.
    if (typeof start !== 'number' && (start.x !== origin.x || start.y !== origin.y)) {
      return [{ ...origin, climb: start.y !== origin.y && Boolean(nav.ladders[startIndex]),
        elevator: Boolean(nav.elevators[startIndex]) }];
    }
    return [];
  }
  const goals = [...goalIndices];

  for (let i = 0; i < (nav.heapLength ?? 0); i += 1) nav.heapPosition[nav.heap[i]] = -1;
  nav.heapLength = 0;
  nav.stamp += 1;
  if (nav.stamp === 0xffffffff) {
    nav.seen.fill(0);
    nav.closed.fill(0);
    nav.stamp = 1;
  }
  const stamp = nav.stamp;

  const heuristic = (index) => {
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    let best = Infinity;
    for (const goalIndex of goals) {
      const distance = Math.abs(x - (goalIndex % world.width)) + Math.abs(y - Math.floor(goalIndex / world.width));
      if (distance < best) best = distance;
    }
    return best / WORK.WALK_CELLS_PER_MINUTE;
  };

  const less = (a, b) => {
    const nodeA = nav.heap[a];
    const nodeB = nav.heap[b];
    return nav.heapScore[a] < nav.heapScore[b]
      || (nav.heapScore[a] === nav.heapScore[b] && nodeA < nodeB);
  };
  const swap = (a, b) => {
    const node = nav.heap[a];
    const score = nav.heapScore[a];
    nav.heap[a] = nav.heap[b];
    nav.heapScore[a] = nav.heapScore[b];
    nav.heapPosition[nav.heap[a]] = a;
    nav.heap[b] = node;
    nav.heapScore[b] = score;
    nav.heapPosition[node] = b;
  };
  const offer = (index, scoreValue) => {
    let position = nav.heapPosition[index];
    if (position < 0) {
      position = nav.heapLength++;
      nav.heap[position] = index;
      nav.heapPosition[index] = position;
    }
    nav.heapScore[position] = scoreValue;
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (!less(position, parent)) break;
      swap(position, parent);
      position = parent;
    }
  };
  const take = () => {
    const result = nav.heap[0];
    nav.heapLength -= 1;
    nav.heapPosition[result] = -1;
    if (nav.heapLength > 0) {
      nav.heap[0] = nav.heap[nav.heapLength];
      nav.heapScore[0] = nav.heapScore[nav.heapLength];
      nav.heapPosition[nav.heap[0]] = 0;
      let position = 0;
      while (true) {
        const left = position * 2 + 1;
        const right = left + 1;
        let smallest = position;
        if (left < nav.heapLength && less(left, smallest)) smallest = left;
        if (right < nav.heapLength && less(right, smallest)) smallest = right;
        if (smallest === position) break;
        swap(position, smallest);
        position = smallest;
      }
    }
    return result;
  };

  nav.seen[startIndex] = stamp;
  nav.score[startIndex] = 0;
  nav.parent[startIndex] = -1;
  offer(startIndex, heuristic(startIndex));
  const horizontalCost = 1 / WORK.WALK_CELLS_PER_MINUTE;
  const ladderCost = 1 / WORK.LADDER_CELLS_PER_MINUTE;
  const verticalCost = (from, to) => nav.elevators[from] || nav.elevators[to]
    ? 1 / WORK.ELEVATOR_CELLS_PER_MINUTE : ladderCost;
  const stepCost = WORK.STEP_WALK_CELLS / WORK.WALK_CELLS_PER_MINUTE;
  let found = -1;
  let stepFrom = -1;
  const visitStep = (to) => visit(stepFrom, to, stepCost);

  const visit = (from, to, cost) => {
    if (nav.closed[to] === stamp) return;
    const nextScore = nav.score[from] + cost;
    if (nav.seen[to] === stamp && nextScore >= nav.score[to]) return;
    nav.seen[to] = stamp;
    nav.score[to] = nextScore;
    nav.parent[to] = from;
    offer(to, nextScore + heuristic(to));
  };

  while (nav.heapLength > 0) {
    const current = take();
    if (goalIndices.has(current)) {
      found = current;
      break;
    }
    nav.closed[current] = stamp;
    const x = current % world.width;
    const y = Math.floor(current / world.width);
    if (x > 0 && nav.walkable[current - 1]) visit(current, current - 1, horizontalCost);
    if (x + 1 < world.width && nav.walkable[current + 1]) visit(current, current + 1, horizontalCost);
    const below = current + world.width;
    const above = current - world.width;
    if (y + 1 < world.height && nav.walkable[below] && (nav.ladders[current] || nav.ladders[below])) visit(current, below, verticalCost(current, below));
    if (y > 0 && nav.walkable[above] && (nav.ladders[current] || nav.ladders[above])) visit(current, above, verticalCost(current, above));
    if (nav.steps[current]) {
      stepFrom = current;
      forEachStep(nav, current, world.width, visitStep);
    }
  }
  if (found < 0) return [];

  const reversed = [];
  let current = found;
  while (current !== startIndex) {
    const previous = nav.parent[current];
    const point = {
      x: current % world.width,
      y: Math.floor(current / world.width),
      climb: previous >= 0 && (nav.ladders[current] || nav.ladders[previous]) && current % world.width === previous % world.width,
      elevator: previous >= 0 && Boolean(nav.elevators[current] || nav.elevators[previous]),
    };
    // Only step points carry the flag: other points keep their saved shape.
    if (isStepMove(world.width, previous, current)) point.step = true;
    reversed.push(point);
    current = previous;
  }
  return reversed.reverse();
}

// Une salle est atteignable si une de ses cases praticables est reliée à la réserve de l'abri.
// Sans réserve (scénarios de test préparés), on ne bloque rien.
export function excavationReachable(sim, excavation) {
  const reserve = sim.stocks?.find((stock) => stock.id === 'reserve');
  if (!reserve || !excavation) return true;
  const nav = rebuildNav(sim);
  const targets = (excavation.dugCells ?? []).map((index) => sim.world.coords(index))
    .filter(({ x, y }) => isWalkableIn(sim.world, nav, x, y));
  if (targets.length === 0) return false;
  const start = navigationTargets(sim, reserve.x, reserve.y)[0];
  if (!start || targets.some((target) => target.x === start.x && target.y === start.y)) return true;
  return findPath(sim, start, targets).length > 0;
}

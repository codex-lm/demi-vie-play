import { WATER } from '../data/balance.js';
import {
  STEP_DOWN_LEFT, STEP_DOWN_RIGHT, STEP_UP_LEFT, STEP_UP_RIGHT, isStepMove, rebuildNav,
} from './nav.js';

export function waterRatioAt(sim, x, y) {
  const xx = Math.round(x);
  const yy = Math.round(y);
  return sim.world.inBounds(xx, yy)
    ? (sim.world.water[sim.world.index(xx, yy)] ?? 0) / WATER.MAX_PER_CELL : 0;
}

export function headSubmerged(sim, x, y) {
  return waterRatioAt(sim, Math.round(x), Math.round(y) - WATER.HEAD_CELL_OFFSET) >= WATER.DROWNING_RATIO;
}

const searches = new WeakMap();

function searchBuffers(world) {
  let search = searches.get(world);
  const size = world.width * world.height;
  if (!search || search.queue.length !== size) {
    search = { queue: new Int32Array(size), parent: new Int32Array(size), seen: new Uint32Array(size), stamp: 0 };
    searches.set(world, search);
  }
  search.stamp += 1;
  if (search.stamp === 0xffffffff) {
    search.seen.fill(0);
    search.stamp = 1;
  }
  return search;
}

/** Search only when an evacuation starts or its path needs a retry. Geometry is
 * shared with ordinary navigation; water is read live, never cached by revision.
 * Prefer a dry refuge at the same height or above. If none exists, a lower dry
 * refuge beats remaining submerged; a breathable wet landing is the fallback. */
export function findFloodEscape(sim, start, acceptTarget = null) {
  const { world } = sim;
  const startX = Math.round(start.x);
  const startY = Math.round(start.y);
  if (!world.inBounds(startX, startY)) return [];
  const nav = rebuildNav(sim);
  const origin = world.index(startX, startY);
  if (!nav.walkable[origin]) return [];
  const search = searchBuffers(world);
  const { queue, parent, seen, stamp } = search;
  let length = 1;
  queue[0] = origin;
  parent[origin] = -1;
  seen[origin] = stamp;
  let dryBelow = -1;
  let breathableAbove = -1;
  let breathableBelow = -1;
  let found = -1;
  const visit = (from, to) => {
    if (!nav.walkable[to] || seen[to] === stamp) return;
    seen[to] = stamp;
    parent[to] = from;
    queue[length++] = to;
  };
  for (let cursor = 0; cursor < length; cursor += 1) {
    const current = queue[cursor];
    const x = current % world.width;
    const y = Math.floor(current / world.width);
    if ((!acceptTarget || acceptTarget(x, y)) && !headSubmerged(sim, x, y)) {
      if (waterRatioAt(sim, x, y) < WATER.WADING_MIN_RATIO) {
        if (y <= startY) {
          found = current;
          break;
        }
        if (dryBelow < 0) dryBelow = current;
      }
      if (y <= startY && breathableAbove < 0) breathableAbove = current;
      else if (y > startY && breathableBelow < 0) breathableBelow = current;
    }
    const above = current - world.width;
    const below = current + world.width;
    // Stable ties favour rising, then left, right and finally descending.
    // One-row steps come after the straight move of the same direction.
    const steps = nav.steps[current];
    if (y > 0 && (nav.ladders[current] || nav.ladders[above])) visit(current, above);
    if (steps & STEP_UP_LEFT) visit(current, above - 1);
    if (steps & STEP_UP_RIGHT) visit(current, above + 1);
    if (x > 0) visit(current, current - 1);
    if (x + 1 < world.width) visit(current, current + 1);
    if (steps & STEP_DOWN_LEFT) visit(current, below - 1);
    if (steps & STEP_DOWN_RIGHT) visit(current, below + 1);
    if (y + 1 < world.height && (nav.ladders[current] || nav.ladders[below])) visit(current, below);
  }
  if (found < 0) found = dryBelow >= 0 ? dryBelow : breathableAbove >= 0 ? breathableAbove : breathableBelow;
  if (found < 0 || found === origin) return [];
  const path = [];
  for (let current = found; current !== origin; current = parent[current]) {
    const previous = parent[current];
    path.push({
      x: current % world.width,
      y: Math.floor(current / world.width),
      climb: Boolean((nav.ladders[current] || nav.ladders[previous]) && current % world.width === previous % world.width),
      elevator: Boolean(nav.elevators[current] || nav.elevators[previous]),
      ...(isStepMove(world.width, previous, current) ? { step: true } : {}),
    });
  }
  return path.reverse();
}

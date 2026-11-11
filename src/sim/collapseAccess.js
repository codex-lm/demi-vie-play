import { CELL } from '../data/balance.js';
import { forEachStep, rebuildNav, navigationTargets } from './nav.js';

const caches = new WeakMap();

// Components use exactly the horizontal/ladder/step edges accepted by findPath.
// Collapsed footprints then form a small graph of possible rescue passages.
export function collapseAccess(sim, sources) {
  const nav = rebuildNav(sim);
  const stocks = sim.stocks.filter((stock) => sim.world.isEmpty(stock.x, stock.y)
    && sim.excavation(stock.excavationId)?.state !== 'collapsed');
  const edible = (stock) => sim.excavation(stock.excavationId)?.roomType !== 'exodusDepot'
    && (stock.resources.food > 0 || stock.resources.meals > 0);
  const signature = `${sim.world.revision}:${sources.map((s) => `${s.id},${s.cells.length}`).join(';')}:`
    + stocks.map((s) => `${s.id},${s.x},${s.y},${Boolean(edible(s))},${Boolean(s.resources.waterClean > 0)}`).join(';');
  const cached = caches.get(sim);
  if (cached?.signature === signature && cached.shafts === nav.shafts) return cached;
  const { width, height } = sim.world;
  const components = new Int32Array(width * height).fill(-1);
  let count = 0;
  for (let origin = 0; origin < components.length; origin += 1) {
    if (!nav.walkable[origin] || components[origin] !== -1) continue;
    const queue = [origin];
    components[origin] = count;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % width;
      const adjacent = [];
      if (x > 0) adjacent.push(index - 1);
      if (x + 1 < width) adjacent.push(index + 1);
      for (const next of [index - width, index + width]) {
        if (next >= 0 && next < components.length && (nav.ladders[index] || nav.ladders[next])) adjacent.push(next);
      }
      forEachStep(nav, index, width, (next) => adjacent.push(next));
      for (const next of adjacent) {
        if (!nav.walkable[next] || components[next] !== -1) continue;
        components[next] = count;
        queue.push(next);
      }
    }
    count += 1;
  }
  const food = new Set();
  const water = new Set();
  const stockComponents = new Set();
  for (const stock of stocks) {
    for (const target of navigationTargets(sim, stock.x, stock.y)) {
      const component = components[sim.world.index(target.x, target.y)];
      stockComponents.add(component);
      if (edible(stock)) food.add(component);
      if (stock.resources.waterClean > 0) water.add(component);
    }
  }
  const graph = new Map();
  const connect = (a, b) => {
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a).add(b);
    graph.get(b).add(a);
  };
  const owners = new Map();
  for (const source of sources) {
    for (const index of source.cells ?? []) {
      if (sim.world.states[index] === CELL.SOLID) {
        if (owners.has(index)) connect(source, owners.get(index));
        owners.set(index, source);
      }
    }
  }
  for (const [index, source] of owners) {
    const x = index % width;
    const neighbors = [index - width, index + width];
    if (x > 0) neighbors.push(index - 1);
    if (x + 1 < width) neighbors.push(index + 1);
    for (const next of neighbors) {
      if (next < 0 || next >= components.length) continue;
      if (components[next] >= 0) connect(source, components[next]);
      if (owners.has(next) && owners.get(next) !== source) connect(source, owners.get(next));
    }
  }
  const componentOf = (person) => components[sim.world.index(Math.round(person.x), Math.round(person.y))] ?? -1;
  const supplied = (component) => component >= 0
    && (food.size ? food.has(component) : stockComponents.has(component))
    && (water.size ? water.has(component) : stockComponents.has(component));
  function separatingSource(person) {
    const origin = componentOf(person);
    if (origin < 0 || supplied(origin)) return null;
    const wanted = food.size && !food.has(origin) ? food : water.size && !water.has(origin) ? water : stockComponents;
    const queue = [{ node: origin, first: null }];
    const seen = new Set([origin]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const { node, first } = queue[cursor];
      if (typeof node === 'number' && wanted.has(node)) return first;
      for (const neighbor of graph.get(node) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push({ node: neighbor, first: first ?? (typeof neighbor === 'object' ? neighbor : null) });
      }
    }
    return null;
  }
  const result = { signature, shafts: nav.shafts, supplied: (person) => supplied(componentOf(person)),
    hasStocks: stockComponents.size > 0, separatingSource };
  caches.set(sim, result);
  return result;
}

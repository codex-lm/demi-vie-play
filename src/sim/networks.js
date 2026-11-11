import { HEAT, TIME, WATER, WORLD } from '../data/balance.js';
import { rockTemperatureAt } from './rockTemperature.js';
export { rockTemperatureAt } from './rockTemperature.js';

const connectionIds = new WeakMap();
const roomIndexes = new WeakMap();
const airDistanceCaches = new WeakMap();

// Validate references and ids so direct edits, reordering and save restoration
// cannot leave stale objects in the derived index. Preserve the first match.
function roomIndex(sim) {
  const rooms = sim.excavations;
  let index = roomIndexes.get(rooms);
  let valid = index && index.refs.length === rooms.length;
  for (let i = 0; valid && i < rooms.length; i += 1) {
    valid = index.refs[i] === rooms[i] && index.ids[i] === rooms[i].id;
  }
  if (!valid) {
    index = { refs: rooms.slice(), ids: rooms.map((room) => room.id), byId: new Map() };
    for (const room of rooms) {
      if (!index.byId.has(room.id)) index.byId.set(room.id, room);
    }
    roomIndexes.set(rooms, index);
  }
  return index.byId;
}

export function activeExcavation(excavation) {
  return excavation && excavation.state !== 'collapsed' && excavation.state !== 'planned';
}

// Dans la salle : dans son rectangle prévu, ou debout sur une de ses vraies cases.
// Une salle qui a percé une cavité naturelle a son sol plus bas que prévu.
export function insideExcavation(sim, excavation, x, y) {
  if (x >= excavation.x && x < excavation.x + excavation.w && y >= excavation.y && y < excavation.y + excavation.h) return true;
  if (excavation.kind !== 'room' && excavation.kind !== 'quarry') return false;
  const cellX = Math.round(x);
  const cellY = Math.round(y);
  if (cellX >= excavation.x && cellX < excavation.x + excavation.w && cellY >= excavation.y && cellY < excavation.y + excavation.h) return false;
  return sim.world.inBounds(cellX, cellY) && sim.world.cellExcavation[sim.world.index(cellX, cellY)] === excavation.id;
}

export function excavationOccupants(sim, excavationId) {
  const excavation = sim.excavation(excavationId);
  if (!excavation) return [];
  return sim.colonists.filter((colonist) => colonist.health > 0 && insideExcavation(sim, excavation, colonist.x, colonist.y));
}

export function excavationAt(sim, x, y) {
  if (!sim.world.inBounds(x, y)) return null;
  const id = sim.world.cellExcavation[sim.world.index(Math.floor(x), Math.floor(y))];
  return id >= 0 ? sim.excavation(id) : null;
}

export function excavationNetworks(sim) {
  if (sim._networkCache?.revision === sim.world.revision) return sim._networkCache;
  const { world } = sim;
  const components = new Int32Array(world.width * world.height);
  components.fill(-1);
  const networks = [];
  const queue = new Int32Array(components.length);
  for (let y = WORLD.SURFACE_Y; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const start = world.index(x, y);
      if (!world.isEmpty(x, y) || components[start] >= 0) continue;
      const id = networks.length;
      const cells = [];
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      components[start] = id;
      while (head < tail) {
        const index = queue[head++];
        cells.push(index);
        const point = world.coords(index);
        for (const [xx, yy] of [[point.x - 1, point.y], [point.x + 1, point.y], [point.x, point.y - 1], [point.x, point.y + 1]]) {
          if (!world.inBounds(xx, yy) || yy < WORLD.SURFACE_Y || !world.isEmpty(xx, yy)) continue;
          const next = world.index(xx, yy);
          if (components[next] >= 0) continue;
          components[next] = id;
          queue[tail++] = next;
        }
      }
      networks.push({ id, cells, excavationIds: [] });
    }
  }
  const byExcavation = new Map();
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation)) continue;
    const ids = new Set();
    for (const index of excavation.dugCells ?? []) {
      const id = components[index];
      if (id < 0) continue;
      ids.add(id);
      if (!networks[id].excavationIds.includes(excavation.id)) networks[id].excavationIds.push(excavation.id);
    }
    for (const id of ids) networks[id].excavationIds.sort((a, b) => a - b);
    byExcavation.set(excavation.id, [...ids].sort((a, b) => a - b));
  }
  sim._networkCache = { revision: world.revision, components, networks, byExcavation };
  return sim._networkCache;
}

export function connectedExcavations(sim, excavation) {
  if (!excavation) return [];
  const cache = excavationNetworks(sim);
  let byRoom = connectionIds.get(cache);
  if (!byRoom) {
    byRoom = new Map();
    connectionIds.set(cache, byRoom);
  }
  let ids = byRoom.get(excavation.id);
  if (!ids) {
    const unique = new Set();
    for (const networkId of cache.byExcavation.get(excavation.id) ?? []) {
      for (const id of cache.networks[networkId].excavationIds) unique.add(id);
    }
    unique.delete(excavation.id);
    ids = [...unique].sort((a, b) => a - b);
    byRoom.set(excavation.id, ids);
  }
  const rooms = roomIndex(sim);
  const connected = [];
  for (const id of ids) {
    const other = Number.isNaN(id) ? null : rooms.get(id);
    if (activeExcavation(other)) connected.push(other);
  }
  return connected;
}

export function surfaceConnectionNetworkIds(sim) {
  const hatch = sim.excavation(sim.surface?.hatch?.excavationId)
    ?? sim.excavations.find((excavation) => excavation.label === 'accessShaft' || excavation.manualVentilation);
  if (!activeExcavation(hatch)) return [];
  return excavationNetworks(sim).byExcavation.get(hatch.id) ?? [];
}

export function surfaceVentilationNetworks(sim) {
  const heads = (sim.surface?.structures ?? []).filter((structure) => structure.type === 'ventShaft' && structure.state === 'built').length;
  const rates = new Map();
  if (heads === 0) return rates;
  for (const id of surfaceConnectionNetworkIds(sim)) rates.set(id, heads);
  return rates;
}

export function poweredVentilationShaft(room) {
  return activeExcavation(room) && room.roomType === 'ventShaft'
    && room.powered && !room.powerShed && !room.disabled && !room.machineBroken
    && (room.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

// Air follows the dug network, starting at its actual surface openings, not
// at the foot of a shaft. Surface heads use the existing hatch duct; their
// count changes the flow, but not the length of that shared route.
function ventilationGeometry(sim) {
  const network = excavationNetworks(sim);
  const hasSurfaceHead = (sim.surface?.structures ?? [])
    .some((structure) => structure.type === 'ventShaft' && structure.state === 'built');
  const hatchId = hasSurfaceHead ? sim.surface?.hatch?.excavationId : null;
  const sources = sim.excavations.filter((room) => activeExcavation(room)
    && (poweredVentilationShaft(room) || room.label === 'accessShaft'
      || room.manualVentilation || (hatchId != null && room.id === hatchId)));
  const cached = airDistanceCaches.get(network);
  if (cached && cached.sources.length === sources.length
    && sources.every((source, index) => cached.sources[index] === source)) return cached;

  const { world } = sim;
  const cellDistances = new Int32Array(network.components.length);
  cellDistances.fill(-1);
  const parents = new Int32Array(cellDistances.length);
  parents.fill(-1);
  const queue = new Int32Array(cellDistances.length);
  let head = 0;
  let tail = 0;
  const openings = new Set();
  for (const source of sources) {
    for (const index of source.dugCells ?? []) {
      if (Math.floor(index / world.width) !== WORLD.SURFACE_Y
        || network.components[index] < 0) continue;
      openings.add(index);
    }
  }
  // Stable seed order makes equal-length routes independent of room ordering.
  for (const index of [...openings].sort((a, b) => a - b)) {
    cellDistances[index] = 0;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    const visit = (next) => {
      if (network.components[next] < 0 || cellDistances[next] >= 0) return;
      cellDistances[next] = cellDistances[index] + 1;
      parents[next] = index;
      queue[tail++] = next;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < world.width) visit(index + 1);
    if (y > WORLD.SURFACE_Y) visit(index - world.width);
    if (y + 1 < world.height) visit(index + world.width);
  }
  const byExcavation = new Map();
  const profiles = new Map();
  const segmentRetention = Math.exp(-1 / HEAT.AIR_ROCK_WARMING_M);
  const segmentExchange = 1 - segmentRetention;
  for (const room of sim.excavations) {
    if (!activeExcavation(room)) continue;
    let nearest = Infinity;
    let arrival = -1;
    for (const index of room.dugCells ?? []) {
      const distance = cellDistances[index];
      if (distance < 0 || distance > nearest || (distance === nearest && index >= arrival)) continue;
      nearest = distance;
      arrival = index;
    }
    if (!Number.isFinite(nearest)) continue;
    byExcavation.set(room.id, nearest);
    // Unroll Tin' = Trock(cell) + (Tin - Trock(cell)) * exp(-1/L).
    // Only the geometry is cached. Rock temperatures still evolve with time.
    const weights = new Map();
    let weight = segmentExchange;
    for (let index = arrival; parents[index] >= 0; index = parents[index]) {
      const depth = Math.floor(index / world.width) - WORLD.SURFACE_Y;
      weights.set(depth, (weights.get(depth) ?? 0) + weight);
      weight *= segmentRetention;
    }
    profiles.set(room.id, { distance: nearest,
      surfaceFactor: Math.exp(-nearest / HEAT.AIR_ROCK_WARMING_M),
      depthWeights: [...weights].sort(([a], [b]) => a - b).map(([depth, value]) => ({ depth, weight: value })),
    });
  }
  const geometry = { sources, byExcavation, profiles };
  airDistanceCaches.set(network, geometry);
  return geometry;
}

export function ventilationDistances(sim) {
  return ventilationGeometry(sim).byExcavation;
}

export function ventilationRockProfiles(sim) {
  return ventilationGeometry(sim).profiles;
}

export function rockTemperature(sim, depth) {
  return rockTemperatureAt(sim.tick / TIME.TICKS_PER_DAY, depth);
}

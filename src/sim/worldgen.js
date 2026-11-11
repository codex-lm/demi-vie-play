import { CELL, HEAT, STARTING_RESOURCES, WATER, WORLD } from '../data/balance.js';
import { DEPOSIT, MATERIAL } from '../data/materials.js';
import { World } from './world.js';
import { deriveWaterTableDepth } from './groundwater.js';
import { RNG } from './rng.js';
import { createExcavation, excavationCells } from './excavation.js';
import { createStock } from './resources.js';
import { rockTemperatureAt } from './rockTemperature.js';

const STRATA = Object.freeze([
  { key: 'topsoil', material: MATERIAL.TOPSOIL, min: 3, max: 8 },
  { key: 'clay', material: MATERIAL.CLAY, min: 6, max: 20 },
  { key: 'sand', material: MATERIAL.SAND, min: 0, max: 15 },
  { key: 'limestone', material: MATERIAL.LIMESTONE, min: 40, max: 120 },
  { key: 'coal', material: MATERIAL.COAL, min: 0, max: 25 },
  { key: 'sandstone', material: MATERIAL.SANDSTONE, min: 30, max: 80 },
]);

const DEPOSIT_TABLES = Object.freeze({
  clay: { count: 4, entries: [[DEPOSIT.IRON, 5], [DEPOSIT.LEAD, 1], [DEPOSIT.GEODE, 2]] },
  limestone: { count: 16, entries: [[DEPOSIT.IRON, 3], [DEPOSIT.COPPER, 2], [DEPOSIT.LEAD, 2], [DEPOSIT.GEODE, 3]] },
  coal: { count: 5, entries: [[DEPOSIT.IRON, 4], [DEPOSIT.COPPER, 1], [DEPOSIT.GEODE, 2]] },
  sandstone: { count: 10, entries: [[DEPOSIT.IRON, 3], [DEPOSIT.COPPER, 3], [DEPOSIT.LEAD, 1], [DEPOSIT.GEODE, 2]] },
  granite: { count: 22, entries: [[DEPOSIT.IRON, 3], [DEPOSIT.COPPER, 3], [DEPOSIT.LEAD, 1], [DEPOSIT.URANIUM, 1], [DEPOSIT.GEODE, 2]] },
});

const SHELTER = Object.freeze({
  shellX: 39,
  shellY: WORLD.SURFACE_Y + 14,
  shellW: 19,
  shellH: 8,
  roomY: WORLD.SURFACE_Y + 16,
  roomH: 4,
  shaftX: 43,
  shaftY: WORLD.SURFACE_Y,
  shaftH: 16,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothNoise(width, rng, min, max) {
  const period = rng.int(8, 22);
  const anchors = Array.from({ length: Math.ceil(width / period) + 3 }, () => rng.range(min, max));
  return Array.from({ length: width }, (_, x) => {
    const position = x / period;
    const index = Math.floor(position);
    const fraction = position - index;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    return anchors[index] + (anchors[index + 1] - anchors[index]) * smooth;
  });
}

function layerThickness(spec, rng) {
  if (spec.key === 'sand' && rng.chance(0.18)) return new Uint8Array(WORLD.WIDTH);
  if (spec.key === 'coal' && rng.chance(0.06)) return new Uint8Array(WORLD.WIDTH);

  const base = rng.range(spec.min, spec.max);
  const amplitude = rng.int(1, 6);
  const wave = smoothNoise(WORLD.WIDTH, rng, -amplitude, amplitude);
  const thickness = Uint8Array.from(wave, (value) => clamp(Math.round(base + value), spec.min, spec.max));

  if (spec.key === 'coal') {
    const continuity = smoothNoise(WORLD.WIDTH, rng, 0, 1);
    for (let x = 0; x < thickness.length; x += 1) {
      thickness[x] = continuity[x] < 0.34 ? 0 : Math.max(1, thickness[x]);
    }
    if (thickness.every((value) => value > 0)) {
      const start = rng.int(0, WORLD.WIDTH - 8);
      const end = Math.min(WORLD.WIDTH, start + rng.int(5, 12));
      thickness.fill(0, start, end);
    } else if (thickness.every((value) => value === 0)) {
      const start = rng.int(0, WORLD.WIDTH - 12);
      const end = Math.min(WORLD.WIDTH, start + rng.int(8, 16));
      thickness.fill(rng.int(4, 15), start, end);
    }
  }
  return thickness;
}

function buildStrata(world, root) {
  const layers = STRATA.map((spec) => ({
    ...spec,
    thickness: layerThickness(spec, root.fork(`strata:${spec.key}`)),
    top: new Int16Array(WORLD.WIDTH),
    bottom: new Int16Array(WORLD.WIDTH),
  }));
  const granite = {
    key: 'granite',
    material: MATERIAL.GRANITE,
    top: new Int16Array(WORLD.WIDTH),
    bottom: new Int16Array(WORLD.WIDTH),
  };

  for (let x = 0; x < world.width; x += 1) {
    let y = WORLD.SURFACE_Y;
    for (const layer of layers) {
      layer.top[x] = y;
      y += layer.thickness[x];
      layer.bottom[x] = y;
      for (let yy = layer.top[x]; yy < layer.bottom[x]; yy += 1) world.setCell(x, yy, layer.material, CELL.SOLID);
    }
    granite.top[x] = y;
    granite.bottom[x] = WORLD.BEDROCK_Y;
    for (let yy = y; yy < WORLD.BEDROCK_Y; yy += 1) world.setCell(x, yy, MATERIAL.GRANITE, CELL.SOLID);
  }
  layers.push(granite);
  return layers;
}

function addLenses(world, layers, rng) {
  const count = rng.int(24, 34);
  for (let lens = 0; lens < count; lens += 1) {
    const boundary = rng.int(0, layers.length - 3);
    const upper = layers[boundary];
    const lower = layers[boundary + 1];
    const centerX = rng.int(0, world.width - 1);
    if (upper.top[centerX] === upper.bottom[centerX] || lower.top[centerX] === lower.bottom[centerX]) continue;
    const upperIncluded = rng.chance(0.5);
    const included = upperIncluded ? upper : lower;
    const host = upperIncluded ? lower : upper;
    const centerY = lower.top[centerX];
    const width = rng.int(5, 15);
    const height = rng.int(2, 6);
    const radiusX = width / 2;
    const radiusY = height / 2;
    for (let y = Math.floor(centerY - radiusY); y <= Math.ceil(centerY + radiusY); y += 1) {
      for (let x = Math.floor(centerX - radiusX); x <= Math.ceil(centerX + radiusX); x += 1) {
        if (!world.inBounds(x, y) || y < WORLD.SURFACE_Y || y >= WORLD.BEDROCK_Y) continue;
        const ellipse = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
        if (ellipse <= 1 && world.material(x, y) === host.material) world.setCell(x, y, included.material, CELL.SOLID);
      }
    }
  }
}

function addCaves(world, limestone, rng) {
  const count = rng.int(12, 18);
  for (let cave = 0; cave < count; cave += 1) {
    const width = rng.int(4, 20);
    const height = rng.int(2, 8);
    const radiusX = width / 2;
    const radiusY = height / 2;
    const centerX = rng.int(Math.ceil(radiusX), world.width - Math.ceil(radiusX) - 1);
    const margin = Math.ceil(radiusY) + 1;
    const top = limestone.top[centerX] + margin;
    const bottom = limestone.bottom[centerX] - margin;
    if (bottom < top) continue;
    const centerY = rng.int(top, bottom);
    for (let y = Math.floor(centerY - radiusY); y <= Math.ceil(centerY + radiusY); y += 1) {
      for (let x = Math.floor(centerX - radiusX); x <= Math.ceil(centerX + radiusX); x += 1) {
        if (!world.inBounds(x, y)) continue;
        const ellipse = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
        if (ellipse <= 1 && world.material(x, y) === MATERIAL.LIMESTONE) world.setCell(x, y, MATERIAL.AIR, CELL.EMPTY);
      }
    }
  }
}

function addRiver(world, limestone, rng) {
  if (!rng.chance(0.35)) return;
  const startX = rng.int(8, 24);
  const endX = Math.min(world.width - 8, startX + rng.int(28, 58));
  let y = rng.int(limestone.top[startX] + 3, limestone.bottom[startX] - 4);
  for (let x = startX; x <= endX; x += 1) {
    y = clamp(y + rng.int(-1, 1), limestone.top[x] + 3, limestone.bottom[x] - 4);
    for (let yy = y - 1; yy <= y; yy += 1) {
      if (world.material(x, yy) === MATERIAL.LIMESTONE) world.setCell(x, yy, MATERIAL.AIR, CELL.EMPTY);
    }
    const index = world.index(x, y);
    if (world.states[index] === CELL.EMPTY) world.water[index] = Math.round(rng.int(3, 7) * WATER.MAX_PER_CELL / WATER.LEGACY_MAX_PER_CELL);
  }
}

function weightedDeposit(rng, entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let roll = rng.range(0, total);
  for (const [deposit, weight] of entries) {
    roll -= weight;
    if (roll < 0) return deposit;
  }
  return entries[entries.length - 1][0];
}

function growVein(world, layer, length, rng) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = rng.int(0, world.width - 1);
    if (layer.bottom[x] <= layer.top[x]) continue;
    const y = rng.int(layer.top[x], layer.bottom[x] - 1);
    if (world.material(x, y) !== layer.material || world.deposits[world.index(x, y)] !== DEPOSIT.NONE) continue;
    const path = [{ x, y }];
    const used = new Set([world.index(x, y)]);
    while (path.length < length) {
      const current = path[path.length - 1];
      const direction = rng.int(0, 3);
      const dx = direction === 0 ? 1 : direction === 1 ? -1 : 0;
      const dy = direction === 2 ? 1 : direction === 3 ? -1 : 0;
      const next = { x: current.x + dx, y: current.y + dy };
      if (!world.inBounds(next.x, next.y)) break;
      const index = world.index(next.x, next.y);
      if (used.has(index) || world.materials[index] !== layer.material || world.states[index] !== CELL.SOLID || world.deposits[index] !== DEPOSIT.NONE) break;
      path.push(next);
      used.add(index);
    }
    if (path.length === length) return path;
  }
  return null;
}

function addDeposits(world, layers, rng) {
  for (const layer of layers) {
    const table = DEPOSIT_TABLES[layer.key];
    if (!table) continue;
    for (let vein = 0; vein < table.count; vein += 1) {
      const deposit = weightedDeposit(rng, table.entries);
      const path = growVein(world, layer, rng.int(3, 12), rng);
      if (!path) continue;
      for (const { x, y } of path) world.setDeposit(x, y, deposit);
    }
  }
}

function clearCell(world, x, y, material, state, excavationId = -1) {
  world.setCell(x, y, material, state, excavationId);
  const index = world.index(x, y);
  world.deposits[index] = DEPOSIT.NONE;
  world.water[index] = 0;
}

function initialExcavation(id, order) {
  const excavation = createExcavation(id, { ...order, initial: true });
  excavation.cells = excavationCells(excavation).map(({ x, y }) => WORLD.WIDTH * y + x);
  excavation.dugCells = [...excavation.cells].sort((a, b) => a - b);
  excavation.state = 'dug';
  excavation.integrity = 100;
  const depth = excavation.y + (excavation.h - 1) / 2 - WORLD.SURFACE_Y;
  // Preserve the historical preheated starting state. This stored room heat is
  // not the climatic rock boundary: updateHeat uses rockTemperature for that.
  const preheatedBaseline = rockTemperatureAt(0, depth);
  const exchange = HEAT.WALL_EXCHANGE_KW_PER_C_M * 2 * (excavation.w + excavation.h);
  const sourceKw = excavation.roomType === 'diesel' ? HEAT.DIESEL_KW
    : excavation.roomType === 'dorm' ? 12 * HEAT.PERSON_KW : 0;
  excavation.temperature = preheatedBaseline + sourceKw / exchange;
  return excavation;
}

function buildShelter(world) {
  for (let y = SHELTER.shellY; y < SHELTER.shellY + SHELTER.shellH; y += 1) {
    for (let x = SHELTER.shellX; x < SHELTER.shellX + SHELTER.shellW; x += 1) clearCell(world, x, y, MATERIAL.CONCRETE, CELL.SOLID);
  }

  const excavations = [
    initialExcavation(0, { kind: 'room', label: 'shelterDorm', roomType: 'dorm', x: 41, y: SHELTER.roomY, w: 5, h: SHELTER.roomH }),
    initialExcavation(1, { kind: 'room', label: 'shelterPantry', roomType: 'pantry', x: 47, y: SHELTER.roomY, w: 4, h: SHELTER.roomH }),
    initialExcavation(2, { kind: 'room', label: 'shelterGenerator', roomType: 'diesel', x: 52, y: SHELTER.roomY, w: 4, h: SHELTER.roomH }),
    initialExcavation(3, { kind: 'shaft', label: 'accessShaft', x: SHELTER.shaftX, y: SHELTER.shaftY, w: 1, h: SHELTER.shaftH }),
  ];
  excavations[3].manualVentilation = true;
  excavations[3].engineeredShelterShaft = true;
  for (const excavation of excavations) {
    for (const index of excavation.cells) {
      const { x, y } = world.coords(index);
      clearCell(world, x, y, MATERIAL.AIR, CELL.EMPTY, excavation.id);
    }
  }

  const doors = [];
  function addDoor(x, y, excavationIds, kind = 'door') {
    const door = { id: doors.length, x, y, excavationId: excavationIds[0], kind, open: true };
    doors.push(door);
    for (const id of excavationIds) excavations[id].doors.push(door.id);
    if (kind === 'door') {
      clearCell(world, x, y, MATERIAL.AIR, CELL.EMPTY);
      clearCell(world, x, y + 1, MATERIAL.AIR, CELL.EMPTY);
    }
  }
  addDoor(46, SHELTER.roomY + 2, [0, 1]);
  addDoor(51, SHELTER.roomY + 2, [1, 2]);
  addDoor(SHELTER.shaftX, WORLD.SURFACE_Y, [3], 'hatch');

  for (let x = 0; x < world.width; x += 1) {
    for (let y = 0; y <= WORLD.SURFACE_Y; y += 1) world.reveal(x, y, 0);
  }
  for (const excavation of excavations) {
    for (const index of excavation.dugCells) {
      const { x, y } = world.coords(index);
      world.reveal(x, y);
    }
  }
  world.reveal(48, SHELTER.roomY + SHELTER.roomH / 2, WORLD.INITIAL_REVEAL_RADIUS);

  return {
    excavations,
    doors,
    spawn: { x: 41, y: SHELTER.roomY + SHELTER.roomH - 1 },
    stocks: [createStock('reserve', 48, SHELTER.roomY + SHELTER.roomH - 1, STARTING_RESOURCES)],
  };
}

// Every colony must be able to reach an aquifer within its starting water.
// Worlds without sand near the shelter receive a small sand lens beside it.
const WATER_GUARANTEE = Object.freeze({ marginX: 14, minDepth: 10, maxDepth: 32, lensW: 12, lensH: 5, depth: 23 });

function hasNearbySand(world) {
  const x0 = Math.max(0, SHELTER.shellX - WATER_GUARANTEE.marginX);
  const x1 = Math.min(world.width - 1, SHELTER.shellX + SHELTER.shellW + WATER_GUARANTEE.marginX);
  for (let y = WORLD.SURFACE_Y + WATER_GUARANTEE.minDepth; y <= WORLD.SURFACE_Y + WATER_GUARANTEE.maxDepth; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (world.isSolid(x, y) && world.material(x, y) === MATERIAL.SAND) return true;
    }
  }
  return false;
}

function ensureShallowAquifer(world, rng) {
  if (hasNearbySand(world)) return null;
  const centerX = SHELTER.shellX + SHELTER.shellW + 6 + rng.int(-2, 2);
  const centerY = WORLD.SURFACE_Y + WATER_GUARANTEE.depth + rng.int(-2, 2);
  const radiusX = WATER_GUARANTEE.lensW / 2;
  const radiusY = WATER_GUARANTEE.lensH / 2;
  let cells = 0;
  for (let y = Math.floor(centerY - radiusY); y <= Math.ceil(centerY + radiusY); y += 1) {
    for (let x = Math.floor(centerX - radiusX); x <= Math.ceil(centerX + radiusX); x += 1) {
      if (!world.inBounds(x, y) || ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 > 1) continue;
      const material = world.material(x, y);
      if (!world.isSolid(x, y) || material === MATERIAL.CONCRETE || material === MATERIAL.BEDROCK) continue;
      world.setCell(x, y, MATERIAL.SAND, CELL.SOLID);
      world.setDeposit(x, y, DEPOSIT.NONE);
      cells += 1;
    }
  }
  return { x: centerX, y: centerY, cells };
}

export function generateWorld(seed = 1) {
  const root = new RNG(seed);
  const world = new World();
  for (let y = 0; y < WORLD.SURFACE_Y; y += 1) {
    for (let x = 0; x < world.width; x += 1) world.setCell(x, y, MATERIAL.AIR, CELL.EMPTY);
  }
  for (let y = WORLD.BEDROCK_Y; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) world.setCell(x, y, MATERIAL.BEDROCK, CELL.SOLID);
  }

  const layers = buildStrata(world, root);
  addLenses(world, layers, root.fork('lenses'));
  const limestone = layers.find((layer) => layer.key === 'limestone');
  addCaves(world, limestone, root.fork('karst-caves'));
  addRiver(world, limestone, root.fork('underground-river'));
  const shelter = buildShelter(world);
  addDeposits(world, layers, root.fork('ore-veins'));
  ensureShallowAquifer(world, root.fork('water-guarantee'));
  world.waterTableDepth = deriveWaterTableDepth(world);

  return { world, ...shelter };
}

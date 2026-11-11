import { WATER, WORLD } from '../data/balance.js';
import { MATERIAL, materialAt } from '../data/materials.js';

// A single, immutable depth per map: the shallowest top of its first sand layer.
// Starting at the top keeps the guaranteed shallow lens available to wells.
export function deriveWaterTableDepth(world) {
  const depths = [];
  for (let x = 0; x < world.width; x += 1) {
    for (let y = WORLD.SURFACE_Y; y < world.height; y += 1) {
      if (world.material(x, y) !== MATERIAL.SAND) continue;
      depths.push(y - WORLD.SURFACE_Y);
      break;
    }
  }
  depths.sort((a, b) => a - b);
  return depths.length ? depths[0] : WATER.DEFAULT_TABLE_DEPTH;
}

export function waterTableDepth(world) {
  return world?.waterTableDepth ?? WATER.DEFAULT_TABLE_DEPTH;
}

export function currentWaterTableDepth(sim) {
  return waterTableDepth(sim.world) - (sim.m5?.calendar?.waterTable?.delta ?? 0);
}

export function aquiferMaterial(material) {
  return material === MATERIAL.SAND || material === MATERIAL.SANDSTONE || material === MATERIAL.LIMESTONE;
}

export function aquiferContact(world, x, y, depth = waterTableDepth(world)) {
  return world.inBounds(x, y) && world.isSolid(x, y)
    && y - WORLD.SURFACE_Y >= depth && aquiferMaterial(world.material(x, y));
}

export function seepRate(sim, x, y) {
  const material = sim.world.material(x, y);
  if (!aquiferMaterial(material)) return 0;
  const saturated = y - WORLD.SURFACE_Y >= currentWaterTableDepth(sim);
  return materialAt(material).permeability * WATER.INFILTRATION_PERMEABILITY
    * (saturated ? 1 : WATER.ABOVE_TABLE_SEEP_FACTOR);
}

// Rebuilt only on terrain changes; querying a column is then constant time.
const shielding = new WeakMap();
export function clayProtected(world, x, y) {
  if (!world || !Number.isInteger(x) || !world.inBounds(x, y)) return false;
  let cache = shielding.get(world);
  if (!cache || cache.revision !== world.revision || cache.states !== world.states
    || cache.materials !== world.materials) {
    cache = { revision: world.revision, states: world.states, materials: world.materials, columns: new Map() };
    shielding.set(world, cache);
  }
  if (!cache.columns.has(x)) {
    const column = new Uint8Array(world.height);
    let run = 0;
    let protectedLayer = false;
    for (let yy = WORLD.SURFACE_Y; yy < world.height; yy += 1) {
      column[yy] = Number(protectedLayer);
      run = world.isSolid(x, yy) && world.material(x, yy) === MATERIAL.CLAY ? run + 1 : 0;
      protectedLayer ||= run >= WATER.CLAY_SHIELD_METERS;
    }
    cache.columns.set(x, column);
  }
  return cache.columns.get(x)[y] === 1;
}

import { MATERIAL } from '../materials.js';
import { WATER } from '../balance.js';

function rectangle(width, height) {
  return Array.from({ length: width * height }, (_, index) => ({ x: index % width, y: Math.floor(index / width) }));
}

function ellipse(width, height) {
  const cells = [];
  const radiusX = width / 2;
  const radiusY = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x + 0.5 - radiusX) / radiusX;
      const dy = (y + 0.5 - radiusY) / radiusY;
      if (dx * dx + dy * dy <= 1) cells.push({ x, y });
    }
  }
  return cells;
}

function annex(width, height, loot) {
  const entry = { x: 0, y: Math.floor(height / 2) };
  const keys = new Set();
  const add = (x, y) => keys.add(`${x},${y}`);
  for (let x = 0; x < width; x += 1) add(x, entry.y);
  const upperBranch = Math.floor(width / 3);
  const lowerBranch = Math.floor(width * 2 / 3);
  for (let y = 0; y < entry.y; y += 1) add(upperBranch, y);
  for (let y = entry.y + 1; y < height; y += 1) add(lowerBranch, y);
  for (let x = upperBranch - 1; x <= upperBranch + 1; x += 1) add(x, 0);
  for (let x = lowerBranch - 1; x <= lowerBranch + 1; x += 1) add(x, height - 1);
  const cells = [...keys].map((key) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  return { width, height, cells, entry, loot };
}

export const POI_DEFS = Object.freeze({
  sewer: Object.freeze({
    id: 'sewer', nameKey: 'poiSewerName', depth: [6, 20], cells: rectangle(7, 3),
    open: true, loot: { scrap: 8 }, water: { count: 5, amount: WATER.MAX_PER_CELL / 2, quality: 1 }, rats: 6,
    annex: annex(14, 5, { scrap: 12, electronics: 1 }),
  }),
  metro: Object.freeze({
    id: 'metro', nameKey: 'poiMetroName', depth: [25, 50], cells: rectangle(12, 4),
    open: true, loot: { scrap: 20, wood: 8 }, encounterChance: 0.65,
    annex: annex(24, 5, { scrap: 15, wood: 10, books: 1 }),
  }),
  neighborShelter: Object.freeze({
    id: 'neighborShelter', nameKey: 'poiNeighborShelterName', depth: [30, 120], cells: rectangle(8, 5),
    open: true, loot: { food: 12, books: 2, meds: 2 }, aliveChance: 0.6,
  }),
  govBunker: Object.freeze({
    id: 'govBunker', nameKey: 'poiGovBunkerName', depth: [150, 350], cells: rectangle(10, 6),
    open: true, loot: { electronics: 6, weapons: 3, books: 5, rtg: 1 }, doorWork: 40,
  }),
  karstCave: Object.freeze({
    id: 'karstCave', nameKey: 'poiKarstCaveName', depth: [20, 180], hostMaterials: [MATERIAL.LIMESTONE],
    cells: ellipse(13, 7), open: true, waterChance: 0.35,
    water: { count: 8, amount: Math.round(WATER.MAX_PER_CELL * 5 / WATER.LEGACY_MAX_PER_CELL), quality: 0 },
  }),
  undergroundRiver: Object.freeze({
    id: 'undergroundRiver', nameKey: 'poiUndergroundRiverName', depth: [20, 180], hostMaterials: [MATERIAL.LIMESTONE],
    cells: ellipse(15, 5), open: true, water: { count: 20, amount: WATER.MAX_PER_CELL * 3 / 4, quality: 0 }, fish: 4, microHydro: true,
  }),
  batColony: Object.freeze({
    id: 'batColony', nameKey: 'poiBatColonyName', depth: [20, 180], requiresCave: true,
    cells: ellipse(7, 5), open: true, loot: { guano: 12 }, morale: 2,
  }),
  oldQuarry: Object.freeze({
    id: 'oldQuarry', nameKey: 'poiOldQuarryName', depth: [10, 60], cells: rectangle(12, 6),
    open: true, loot: { stone: 16, wood: 5 }, fragile: true, integrity: 65,
  }),
  cellar: Object.freeze({
    id: 'cellar', nameKey: 'poiCellarName', depth: [5, 15], cells: rectangle(6, 4),
    open: true, loot: { food: 10, wood: 6, meds: 2 },
  }),
  animalBurrow: Object.freeze({
    id: 'animalBurrow', nameKey: 'poiAnimalBurrowName', depth: [5, 40], cells: ellipse(7, 5),
    open: true, animalGroups: [['badger', 'badger'], ['rabbit', 'rabbit', 'rabbit'], ['dog'], ['hen', 'hen', 'hen', 'hen']],
  }),
  fossilBed: Object.freeze({
    id: 'fossilBed', nameKey: 'poiFossilBedName', depth: [20, 160], hostMaterials: [MATERIAL.SANDSTONE],
    cells: ellipse(6, 3), loot: { books: 2 }, morale: 3,
  }),
  gasPocket: Object.freeze({
    id: 'gasPocket', nameKey: 'poiGasPocketName', depth: [10, 180], hostMaterials: [MATERIAL.COAL],
    cells: ellipse(5, 3), gas: 18,
  }),
  waterPocket: Object.freeze({
    id: 'waterPocket', nameKey: 'poiWaterPocketName', depth: [5, 140], hostMaterials: [MATERIAL.LIMESTONE, MATERIAL.SAND],
    cells: ellipse(5, 3), water: { count: 8, amount: 10, quality: 1 }, pressurized: true,
  }),
});

export const POI_IDS = Object.freeze(Object.keys(POI_DEFS));

export function poiDefinition(id) {
  return POI_DEFS[id] ?? null;
}

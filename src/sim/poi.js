import { CELL, TIME, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { FIND_DEFS, FIND_RULES } from '../data/poi/finds.js';
import { POI_IDS, poiDefinition } from '../data/poi/definitions.js';
import {
  ANNEX_RULES, DOMESTICATION_RULES, ENCOUNTER_CHOICES, ENCOUNTER_RULES, POI_CONTENT_RULES, POI_RULES, SONAR_RULES,
} from '../data/poi/rules.js';
import { POI_TEXT } from '../data/poiText.js';
import { startMethanePocket, startWaterPocket } from './hazards.js';
import { createPersonProfile } from './people.js';
import { consumeStoredEnergy } from './power.js';
import { reserveStock, spendResources } from './resources.js';
import { RNG, hashString } from './rng.js';

function randomFor(sim, channel) {
  return new RNG(hashString(`${sim.seed}:m5:poi:${channel}`));
}

function absoluteCells(x, y, cells) {
  return cells.map((cell) => ({ x: x + cell.x, y: y + cell.y }));
}

function placementValid(sim, definition, x, y, occupied) {
  const cells = absoluteCells(x, y, definition.cells);
  let hostFound = !definition.hostMaterials;
  let caveFound = !definition.requiresCave;
  for (const cell of cells) {
    if (!sim.world.inBounds(cell.x, cell.y) || cell.y < WORLD.SURFACE_Y || cell.y >= WORLD.BEDROCK_Y) return false;
    const index = sim.world.index(cell.x, cell.y);
    if (occupied.has(index) || sim.world.cellExcavation[index] >= 0 || sim.world.materials[index] === MATERIAL.CONCRETE) return false;
    if (definition.hostMaterials?.includes(sim.world.materials[index])) hostFound = true;
    if (sim.world.isEmpty(cell.x, cell.y)) caveFound = true;
  }
  return hostFound && caveFound;
}

function placePois(sim) {
  const rng = randomFor(sim, 'placement');
  const target = rng.int(POI_RULES.MIN_COUNT, POI_RULES.MAX_COUNT);
  const order = [...POI_IDS];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    [order[index], order[other]] = [order[other], order[index]];
  }
  const occupied = new Set();
  const items = [];
  for (const type of order) {
    if (items.length >= target) break;
    const definition = poiDefinition(type);
    const width = Math.max(...definition.cells.map((cell) => cell.x)) + 1;
    const height = Math.max(...definition.cells.map((cell) => cell.y)) + 1;
    const minY = WORLD.SURFACE_Y + definition.depth[0];
    const maxY = Math.min(WORLD.BEDROCK_Y - height - POI_RULES.VERTICAL_MARGIN,
      WORLD.SURFACE_Y + definition.depth[1] - height + 1);
    if (maxY < minY) continue;
    for (let attempt = 0; attempt < POI_RULES.PLACEMENT_ATTEMPTS; attempt += 1) {
      const x = rng.int(POI_RULES.HORIZONTAL_MARGIN, sim.world.width - width - POI_RULES.HORIZONTAL_MARGIN - 1);
      const y = rng.int(minY, maxY);
      if (!placementValid(sim, definition, x, y, occupied)) continue;
      const cells = absoluteCells(x, y, definition.cells);
      for (const cell of cells) occupied.add(sim.world.index(cell.x, cell.y));
      items.push({
        id: type,
        type,
        x,
        y,
        w: width,
        h: height,
        cells,
        discovered: false,
        explored: false,
        discoveryTick: null,
        discoveryMethod: null,
        approximate: null,
        loot: null,
        annexId: null,
        encounterId: null,
      });
      break;
    }
  }
  return items;
}

function nextFindVolume(sim, sequence) {
  return FIND_RULES.VOLUME_M3 + randomFor(sim, `find-spacing:${sequence}`)
    .int(-FIND_RULES.SPACING_JITTER_M3, FIND_RULES.SPACING_JITTER_M3);
}

export function initializePois(sim) {
  sim.m5 ??= {};
  sim.m5.poi ??= {};
  const state = sim.m5.poi;
  const needsPlacement = !Array.isArray(state.items);
  state.items ??= [];
  if (needsPlacement || state.placed !== true) {
    if (state.items.length === 0) state.items = placePois(sim);
    state.placed = true;
  }
  state.finds ??= [];
  state.findSequence ??= 0;
  state.digVolume ??= 0;
  state.nextFindVolume ??= nextFindVolume(sim, state.findSequence);
  state.scans ??= [];
  state.annexes ??= [];
  state.encounters ??= [];
  state.encounter ??= null;
  state.animals ??= [];
  for (const annex of state.annexes) {
    annex.expedition ??= null;
    annex.nextExpeditionId ??= 0;
    annex.lootExcavationId ??= null;
    for (const cell of annex.cells) cell.explored ??= false;
    annex.exploredCount ??= annex.cells.filter((cell) => cell.explored).length;
  }
}

function addLoose(excavation, loot) {
  if (!excavation) return null;
  excavation.loose ??= {};
  for (const [resource, amount] of Object.entries(loot ?? {})) {
    excavation.loose[resource] = (excavation.loose[resource] ?? 0) + amount;
  }
  return excavation;
}

function excavationForPoi(sim, poi, excavation = null) {
  if (excavation) return excavation;
  const recorded = sim.excavation(poi.lootExcavationId);
  if (recorded) return recorded;
  for (const cell of poi.cells) {
    const owner = sim.world.cellExcavation[sim.world.index(cell.x, cell.y)];
    const found = sim.excavation(owner);
    if (found) return found;
  }
  return null;
}

function addMorale(sim, amount) {
  if (!amount) return;
  for (const colonist of sim.colonists ?? []) {
    if (colonist.dead || colonist.health <= 0) continue;
    const morale = Math.min(FIND_RULES.MORALE_CAP, (colonist.morale ?? 0) + amount);
    colonist.morale = morale;
    colonist.moraleValue = morale;
  }
}

function openCells(sim, poi, excavation) {
  for (const cell of poi.cells) {
    const index = sim.world.index(cell.x, cell.y);
    const owner = excavation?.id ?? sim.world.cellExcavation[index];
    sim.world.setCell(cell.x, cell.y, MATERIAL.AIR, CELL.EMPTY, owner);
    sim.world.deposits[index] = 0;
    sim.world.water[index] = 0;
    sim.world.waterQuality[index] = 0;
    sim.world.reveal(cell.x, cell.y);
    const target = sim.excavation(owner);
    if (!target) continue;
    if (!target.cells.includes(index)) target.cells.push(index);
    if (!target.dugCells.includes(index)) target.dugCells.push(index);
    target.cells.sort((a, b) => a - b);
    target.dugCells.sort((a, b) => a - b);
  }
  sim.structureDirty = true;
}

function applyWater(sim, poi, definition, excavation) {
  if (!definition.water) return;
  if (poi.type === 'karstCave') {
    poi.hasLake = randomFor(sim, `${poi.id}:lake`).chance(definition.waterChance);
    if (!poi.hasLake) return;
  }
  if (poi.type === 'waterPocket' && excavation) {
    const pocket = startWaterPocket(sim, excavation.id, { x: poi.x, y: poi.y, source: 'poi' });
    if (pocket) {
      poi.hazardPocketId = pocket.id;
      return;
    }
  }
  for (const cell of poi.cells.slice(0, definition.water.count)) {
    const index = sim.world.index(cell.x, cell.y);
    if (sim.world.states[index] !== CELL.EMPTY) sim.world.setCell(cell.x, cell.y, MATERIAL.AIR, CELL.EMPTY);
    sim.world.water[index] = Math.max(sim.world.water[index], definition.water.amount);
    sim.world.waterQuality[index] = definition.water.quality;
  }
}

function createAnnex(sim, poi, definition) {
  if (!definition.annex) return null;
  const id = `annex-${poi.id}`;
  const annex = {
    id,
    poiId: poi.id,
    type: poi.type,
    width: definition.annex.width,
    height: definition.annex.height,
    entry: { ...definition.annex.entry },
    worldEntry: { x: poi.x, y: poi.y },
    cells: definition.annex.cells.map((cell) => ({ ...cell, explored: false })),
    explored: false,
    exploredCount: 0,
    remainingLoot: { ...definition.annex.loot },
    collectedLoot: null,
    lootExcavationId: poi.lootExcavationId ?? null,
    expedition: null,
    nextExpeditionId: 0,
  };
  sim.m5.poi.annexes.push(annex);
  poi.annexId = id;
  sim.log('info', 'eventAnnexOpened', { poi: POI_TEXT[definition.nameKey], poiId: poi.id, annexId: id }, poi);
  return annex;
}

function createEncounter(sim, poi) {
  const id = `underground-${poi.id}`;
  const encounter = {
    id,
    poiId: poi.id,
    kind: 'survivors',
    dialogueKey: 'poiEncounterDialogue',
    choices: ENCOUNTER_CHOICES.map((choice) => ({ ...choice })),
    choiceIndex: null,
    choiceId: null,
    outcome: null,
  };
  sim.m5.poi.encounters.push(encounter);
  sim.m5.poi.encounter = sim.m5.poi.encounters.find((candidate) => candidate.choiceIndex === null) ?? null;
  poi.encounterId = id;
  return encounter;
}

function applySpecialContents(sim, poi, definition, excavation) {
  if (definition.gas && excavation) {
    excavation.methane = (excavation.methane ?? 0) + definition.gas;
    const pocket = startMethanePocket(sim, excavation.id, {
      x: poi.x, y: poi.y, source: 'poi', level: definition.gas, remaining: definition.gas,
    });
    if (pocket) poi.hazardPocketId = pocket.id;
  }
  if (excavation) {
    excavation.poiId = poi.id;
    excavation.poiType = poi.type;
    if (definition.fragile) {
      excavation.fragile = true;
      excavation.integrity = Math.min(excavation.integrity ?? 100, definition.integrity);
    }
  }
  if (definition.doorWork) {
    poi.doorForced = true;
    poi.doorWorkTicks = definition.doorWork * TIME.TICKS_PER_HOUR;
  }
  if (definition.fragile) {
    poi.fragile = true;
    poi.integrity = definition.integrity;
  }
  if (definition.microHydro) poi.microHydro = true;
  if (definition.fish) poi.fish = definition.fish;
  if (definition.rats) poi.rats = definition.rats;
  if (poi.type === 'batColony') {
    const count = 12;
    poi.bats = { kind: 'bat', count, x: poi.x, y: poi.y };
    sim.m5.poi.animals.push({ poiId: poi.id, animals: Array(count).fill('bat'), domesticated: false });
  }
  if (definition.animalGroups) {
    const rng = randomFor(sim, `${poi.id}:animals`);
    const animals = [...rng.pick(definition.animalGroups)];
    poi.animals = animals;
    poi.domesticated = false;
    sim.m5.poi.animals.push({ poiId: poi.id, animals: [...animals], domesticated: false });
  }
  addMorale(sim, definition.morale ?? 0);
}

export function discoverPoi(sim, poiOrId, method = 'dig', excavation = null) {
  initializePois(sim);
  const poi = typeof poiOrId === 'string' ? sim.m5.poi.items.find((item) => item.id === poiOrId) : poiOrId;
  if (!poi) return { ok: false, error: 'poiUnavailable' };
  const definition = poiDefinition(poi.type);
  if (!definition) return { ok: false, error: 'poiUnavailable' };
  if (method === 'sonar') {
    if (!definition.open) return { ok: true, poi, identified: false };
    if (!poi.discovered) {
      poi.discovered = true;
      poi.discoveryTick = sim.tick;
      poi.discoveryMethod = 'sonar';
      poi.approximate = {
        x: Math.round(poi.x / SONAR_RULES.SAMPLE_SPACING) * SONAR_RULES.SAMPLE_SPACING,
        y: Math.round(poi.y / SONAR_RULES.SAMPLE_SPACING) * SONAR_RULES.SAMPLE_SPACING,
      };
      sim.log('info', 'eventPoiSensed', { poi: POI_TEXT[definition.nameKey], poiId: poi.id, ...poi.approximate },
        { x: poi.approximate.x, y: poi.approximate.y });
    }
    return { ok: true, poi, identified: true };
  }
  if (poi.explored) return { ok: true, poi };
  poi.discovered = true;
  poi.explored = true;
  poi.discoveryTick = sim.tick;
  poi.discoveryMethod = 'dig';
  poi.approximate = null;
  if (definition.open) openCells(sim, poi, excavation);
  applyWater(sim, poi, definition, excavation);
  applySpecialContents(sim, poi, definition, excavation);

  let inhabited = false;
  if (poi.type === 'neighborShelter') {
    inhabited = randomFor(sim, `${poi.id}:inhabited`).chance(definition.aliveChance);
    poi.inhabited = inhabited;
    if (!inhabited) sim.log('info', 'eventPoiNeighborStory', { poiId: poi.id }, poi);
  }
  if (!inhabited) {
    const target = excavationForPoi(sim, poi, excavation);
    addLoose(target, definition.loot);
    poi.loot = { ...(definition.loot ?? {}) };
    poi.lootExcavationId = target?.id ?? null;
  } else {
    poi.loot = {};
  }
  if (poi.type === 'metro' && randomFor(sim, `${poi.id}:encounter`).chance(definition.encounterChance)) createEncounter(sim, poi);
  if (inhabited) createEncounter(sim, poi);
  createAnnex(sim, poi, definition);
  sim.log(definition.gas || definition.pressurized ? 'warning' : 'info', 'eventPoiDiscovered', {
    poi: POI_TEXT[definition.nameKey], poiId: poi.id, loot: { ...poi.loot }, discoveryMethod: 'dig',
  }, poi);
  return { ok: true, poi };
}

function chooseFind(sim, sequence) {
  const rng = randomFor(sim, `find:${sequence}`);
  const total = FIND_DEFS.reduce((sum, definition) => sum + definition.weight, 0);
  let roll = rng.range(0, total);
  for (const definition of FIND_DEFS) {
    roll -= definition.weight;
    if (roll < 0) return definition;
  }
  return FIND_DEFS[FIND_DEFS.length - 1];
}

function createFind(sim, excavation, x, y) {
  const state = sim.m5.poi;
  const sequence = state.findSequence;
  const definition = chooseFind(sim, sequence);
  const id = `find-${sequence}`;
  addLoose(excavation, definition.loot);
  addMorale(sim, definition.morale);
  const find = {
    id,
    sequence,
    kind: definition.id,
    tick: sim.tick,
    x,
    y,
    volume: state.digVolume,
    loot: { ...definition.loot },
    morale: definition.morale,
    excavationId: excavation.id,
    textKey: definition.textKey,
  };
  state.finds.push(find);
  state.findSequence += 1;
  state.nextFindVolume = state.digVolume + nextFindVolume(sim, state.findSequence);
  sim.log('info', 'eventFind', { findId: id, kind: find.kind, text: POI_TEXT[definition.textKey], loot: { ...find.loot } }, find);
  return find;
}

export function recordDigCell(sim, excavation, x, y, wasSolid = true) {
  initializePois(sim);
  for (const poi of sim.m5.poi.items) {
    if (!poi.explored && poi.cells.some((cell) => cell.x === x && cell.y === y)) discoverPoi(sim, poi, 'dig', excavation);
  }
  if (!wasSolid) return null;
  const state = sim.m5.poi;
  state.digVolume += 1;
  if (state.digVolume < state.nextFindVolume) return null;
  return createFind(sim, excavation, x, y);
}

function addRecruit(sim, poi) {
  const source = (sim.colonists ?? []).find((colonist) => !colonist.dead && colonist.health > 0);
  if (!source) return null;
  const id = Math.max(sim.nextColonistId ?? 0, ...sim.colonists.map((colonist) => colonist.id + 1));
  const recruit = JSON.parse(JSON.stringify(source));
  const stock = reserveStock(sim, poi.x, poi.y);
  Object.assign(recruit, createPersonProfile(sim.seed, id), {
    id,
    name: POI_TEXT.poiRecruitName,
    x: stock?.x ?? poi.x,
    y: stock?.y ?? poi.y,
    prevX: stock?.x ?? poi.x,
    prevY: stock?.y ?? poi.y,
    health: source.health,
    dead: false,
    deathTick: null,
    jobId: null,
    task: 'idle',
    carrying: null,
    path: [],
    pathGoal: null,
    surfaceCrewId: null,
    injured: false,
    injuries: [],
    dose: 0,
  });
  sim.colonists.push(recruit);
  sim.nextColonistId = id + 1;
  return recruit;
}

export function choosePoiEncounter(sim, order) {
  initializePois(sim);
  const encounter = sim.m5.poi.encounters.find((candidate) => candidate.id === order.encounterId)
    ?? (order.encounterId == null ? sim.m5.poi.encounter : null);
  if (!encounter || encounter.choiceIndex !== null || !Number.isInteger(order.choiceIndex)
    || order.choiceIndex < 0 || order.choiceIndex >= encounter.choices.length) return { ok: false, error: 'encounterUnavailable' };
  const choice = encounter.choices[order.choiceIndex];
  const poi = sim.m5.poi.items.find((item) => item.id === encounter.poiId);
  if (choice.id === 'trade' && !spendResources(sim, ENCOUNTER_RULES.TRADE_COST)) return { ok: false, error: 'encounterNoFood' };
  const outcome = { code: choice.id, textKey: `poiOutcome${choice.id[0].toUpperCase()}${choice.id.slice(1)}` };
  if (choice.id === 'recruit') {
    const recruit = addRecruit(sim, poi);
    outcome.recruitId = recruit?.id ?? null;
  } else if (choice.id === 'trade') {
    const target = excavationForPoi(sim, poi);
    addLoose(target, ENCOUNTER_RULES.TRADE_LOOT);
    outcome.loot = { ...ENCOUNTER_RULES.TRADE_LOOT };
    outcome.excavationId = target?.id ?? null;
  }
  encounter.choiceIndex = order.choiceIndex;
  encounter.choiceId = choice.id;
  encounter.outcome = outcome;
  sim.m5.poi.encounter = sim.m5.poi.encounters.find((candidate) => candidate.choiceIndex === null) ?? null;
  sim.log('info', 'eventPoiEncounter', {
    poiId: poi.id, encounterId: encounter.id, choice: choice.id,
    summary: POI_TEXT[outcome.textKey], outcome: { ...outcome },
  }, poi);
  return { ok: true, encounter, outcome };
}

function annexTargets(annex) {
  const byKey = new Map(annex.cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
  const queue = [byKey.get(`${annex.entry.x},${annex.entry.y}`)];
  const visited = new Set();
  const targets = [];
  while (queue.length > 0 && targets.length < ANNEX_RULES.CELLS_PER_EXPEDITION) {
    const cell = queue.shift();
    if (!cell) continue;
    const key = `${cell.x},${cell.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (!cell.explored) targets.push({ x: cell.x, y: cell.y });
    for (const neighbor of [
      byKey.get(`${cell.x},${cell.y - 1}`), byKey.get(`${cell.x - 1},${cell.y}`),
      byKey.get(`${cell.x + 1},${cell.y}`), byKey.get(`${cell.x},${cell.y + 1}`),
    ]) {
      if (neighbor) queue.push(neighbor);
    }
  }
  return targets;
}

function completeAnnex(sim, annex) {
  if (annex.exploredCount !== annex.cells.length) return;
  annex.explored = true;
  const poi = sim.m5.poi.items.find((item) => item.id === annex.poiId);
  const target = excavationForPoi(sim, poi, sim.excavation(annex.lootExcavationId));
  addLoose(target, annex.remainingLoot);
  annex.collectedLoot = { ...annex.remainingLoot };
  annex.remainingLoot = {};
  annex.lootExcavationId = target?.id ?? null;
  sim.log('info', 'eventAnnexExplored', {
    poi: POI_TEXT[poiDefinition(poi.type).nameKey], poiId: poi.id, annexId: annex.id, loot: { ...annex.collectedLoot },
  }, poi);
}

export function exploreAnnex(sim, annexId) {
  initializePois(sim);
  const annex = sim.m5.poi.annexes.find((candidate) => candidate.id === annexId);
  if (!annex) return { ok: false, error: 'annexUnavailable' };
  if (annex.explored) return { ok: true, annex, started: false, exploredCells: 0 };
  if (annex.expedition) return { ok: true, annex, expedition: annex.expedition, started: false, exploredCells: 0 };
  const targets = annexTargets(annex);
  if (targets.length === 0) return { ok: false, error: 'annexUnavailable' };
  const expedition = {
    id: annex.nextExpeditionId++,
    startTick: sim.tick,
    elapsedTicks: 0,
    durationTicks: targets.length * ANNEX_RULES.TICKS_PER_CELL,
    cells: targets,
    exploredCells: 0,
  };
  annex.expedition = expedition;
  const poi = sim.m5.poi.items.find((item) => item.id === annex.poiId);
  sim.log('info', 'eventAnnexStarted', {
    poi: POI_TEXT[poiDefinition(poi.type).nameKey], poiId: poi.id, annexId: annex.id,
    hours: expedition.durationTicks / TIME.TICKS_PER_HOUR,
  }, poi);
  return { ok: true, annex, expedition, started: true, exploredCells: 0 };
}

function updateAnnex(sim, annex) {
  const expedition = annex.expedition;
  if (!expedition) return 0;
  expedition.elapsedTicks = Math.min(expedition.durationTicks, expedition.elapsedTicks + 1);
  const targetCount = Math.min(expedition.cells.length,
    Math.floor(expedition.elapsedTicks * expedition.cells.length / expedition.durationTicks));
  const byKey = new Map(annex.cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
  let exploredCells = 0;
  while (expedition.exploredCells < targetCount) {
    const point = expedition.cells[expedition.exploredCells];
    const cell = byKey.get(`${point.x},${point.y}`);
    if (cell && !cell.explored) {
      cell.explored = true;
      annex.exploredCount += 1;
      exploredCells += 1;
    }
    expedition.exploredCells += 1;
  }
  if (expedition.elapsedTicks >= expedition.durationTicks) {
    annex.expedition = null;
    completeAnnex(sim, annex);
  }
  return exploredCells;
}

export function domesticateAnimals(sim, poiId) {
  initializePois(sim);
  const poi = sim.m5.poi.items.find((item) => item.id === poiId && item.type === 'animalBurrow');
  const record = sim.m5.poi.animals.find((candidate) => candidate.poiId === poiId);
  if (!poi?.explored || !record || record.domesticated) return { ok: false, error: 'animalsUnavailable' };
  if (!spendResources(sim, { food: DOMESTICATION_RULES.FOOD_COST })) return { ok: false, error: 'domesticationNoFood' };
  record.domesticated = true;
  record.animalPairs = Math.floor(record.animals.length / 2);
  poi.domesticated = true;
  sim.exodus ??= {};
  sim.exodus.kit ??= {};
  sim.exodus.kit.animalPairs = (sim.exodus.kit.animalPairs ?? 0) + record.animalPairs;
  sim.exodus.kit.animals ??= [];
  sim.exodus.kit.animals.push(...record.animals);
  sim.log('info', 'eventAnimalsDomesticated', { poiId, animals: [...record.animals], animalPairs: record.animalPairs }, poi);
  return { ok: true, animals: [...record.animals], animalPairs: record.animalPairs };
}

function gasAt(sim, x, y) {
  const excavation = sim.excavations.find((candidate) => candidate.methane > 0
    && x >= candidate.x && x < candidate.x + candidate.w && y >= candidate.y && y < candidate.y + candidate.h);
  if (excavation) return true;
  return sim.m5.poi.items.some((poi) => poi.type === 'gasPocket' && !poi.explored
    && poi.cells.some((cell) => cell.x === x && cell.y === y));
}

function coarseSignal(sim, left, top, centerX, centerY) {
  const endX = Math.min(sim.world.width - 1, left + SONAR_RULES.SAMPLE_SPACING - 1);
  const endY = Math.min(sim.world.height - 1, top + SONAR_RULES.SAMPLE_SPACING - 1);
  let cavity = false;
  let water = false;
  let gas = false;
  for (let y = Math.max(WORLD.SURFACE_Y, top); y <= endY; y += 1) {
    for (let x = Math.max(0, left); x <= endX; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 > SONAR_RULES.RADIUS ** 2) continue;
      const index = sim.world.index(x, y);
      const hidden = sim.m5.poi.items.find((poi) => !poi.explored
        && poi.cells.some((cell) => cell.x === x && cell.y === y));
      const definition = hidden ? poiDefinition(hidden.type) : null;
      const hiddenWater = definition?.water && (hidden.type !== 'karstCave'
        || randomFor(sim, `${hidden.id}:lake`).chance(definition.waterChance));
      if (hiddenWater || sim.world.water[index] > 0) water = true;
      else if (definition?.open || sim.world.states[index] === CELL.EMPTY) cavity = true;
      if (gasAt(sim, x, y)) gas = true;
    }
  }
  if (gas) return 'gas';
  if (water) return 'water';
  if (cavity) return 'cavity';
  return null;
}

export function scanSonar(sim, order) {
  initializePois(sim);
  if (!sim.research?.completed?.includes('sonar')) return { ok: false, error: 'researchLocked', order };
  if (!Number.isInteger(order.x) || !Number.isInteger(order.y)
    || !sim.world.inBounds(order.x, order.y) || order.y < WORLD.SURFACE_Y) return { ok: false, error: 'invalidPlacement', order };
  if (!consumeStoredEnergy(sim, SONAR_RULES.ENERGY_KWH)) return { ok: false, error: 'insufficientEnergy', order };
  const signals = [];
  const spacing = SONAR_RULES.SAMPLE_SPACING;
  const startX = Math.floor((order.x - SONAR_RULES.RADIUS) / spacing) * spacing;
  const startY = Math.floor((order.y - SONAR_RULES.RADIUS) / spacing) * spacing;
  for (let top = startY; top <= order.y + SONAR_RULES.RADIUS; top += spacing) {
    for (let left = startX; left <= order.x + SONAR_RULES.RADIUS; left += spacing) {
      const x = left + Math.floor(spacing / 2);
      const y = top + Math.floor(spacing / 2);
      if ((x - order.x) ** 2 + (y - order.y) ** 2 > SONAR_RULES.RADIUS ** 2) continue;
      const kind = coarseSignal(sim, left, top, order.x, order.y);
      if (kind) signals.push({ x, y, kind, confidence: SONAR_RULES.CONFIDENCE });
    }
  }
  for (const poi of sim.m5.poi.items) {
    if (poi.discovered || !poiDefinition(poi.type)?.open) continue;
    const dx = poi.x + poi.w / 2 - order.x;
    const dy = poi.y + poi.h / 2 - order.y;
    if (dx * dx + dy * dy <= SONAR_RULES.RADIUS ** 2) discoverPoi(sim, poi, 'sonar');
  }
  const scan = {
    id: sim.m5.poi.scans.length,
    tick: sim.tick,
    x: order.x,
    y: order.y,
    radius: SONAR_RULES.RADIUS,
    energyKwh: SONAR_RULES.ENERGY_KWH,
    signals,
  };
  sim.m5.poi.scans.push(scan);
  sim.events.push({ type: 'sonar', tick: sim.tick, x: order.x, y: order.y, radius: SONAR_RULES.RADIUS });
  sim.log('info', 'eventSonarScan', { signals: signals.length, radius: scan.radius, energy: scan.energyKwh, x: scan.x, y: scan.y });
  return { ok: true, scan };
}

export function updatePois(sim) {
  initializePois(sim);
  if (sim.m5.poi.encounters.length > 0) {
    sim.m5.poi.encounter = sim.m5.poi.encounters.find((candidate) => candidate.choiceIndex === null) ?? null;
  }
  for (const annex of sim.m5.poi.annexes) updateAnnex(sim, annex);
  if (sim.tick % TIME.TICKS_PER_DAY !== 0) return;
  for (const poi of sim.m5.poi.items.filter((item) => item.explored)) {
    const target = excavationForPoi(sim, poi);
    if ((poi.fish ?? 0) > 0) addLoose(target, { food: poi.fish * POI_CONTENT_RULES.FISH_FOOD_PER_FISH_DAY });
    if ((poi.rats ?? 0) > 0) {
      for (const stock of sim.stocks) {
        if (stock.excavationId !== target?.id && stock.id !== 'reserve') continue;
        stock.resources.food = Math.max(0, (stock.resources.food ?? 0) - poi.rats * POI_CONTENT_RULES.RAT_FOOD_PER_RAT_DAY);
      }
    }
  }
}

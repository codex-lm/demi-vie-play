import { TIME, WORK } from '../data/balance.js';
import { EXODUS, RADIATION } from '../data/surface.js';
import { radioText } from '../data/radioText.js';
import { surfaceTemperature } from './climate.js';
import { baseRadiationRate, hotspotAt } from './radiation.js';
import { requestRoomResources } from './jobs.js';
import { addToStock, createStock, ensureRoomStock, reserveStock, resourceTotals, roomStock, spendResources, stocksConnected } from './resources.js';
import { RNG, hashString } from './rng.js';
import { exportRadioNeighbors, exportSurvivingNeighbors } from './radio.js';
import { buildEndStory } from './endStory.js';
import { starvingWorkFactor } from './condition.js';
import { M6 } from '../data/m6.js';

const STORY_CATEGORIES = Object.freeze({
  eventWelcome: 'origin', eventDug: 'firstRoom', eventBirth: 'birth', eventDeath: 'death',
  eventFactionConflict: 'crisis', eventStrike: 'crisis', alertMoraleRed: 'crisis', eventLawSigned: 'law',
  eventResearchComplete: 'research', eventExpeditionDeparture: 'expedition', eventExpeditionReturn: 'expedition',
  eventExpeditionLost: 'expedition', eventEncounter: 'expedition', eventCollapse: 'threat', eventCascade: 'threat',
  eventFlood: 'threat', eventRepair: 'recovery', eventSupport: 'recovery', eventFloodRecovered: 'recovery',
  eventKitReady: 'kit', eventExodus: 'exodus', eventDefeat: 'exodus',
});
const STORY_EVENTS = new Set(Object.keys(STORY_CATEGORIES));
const STORY_CATEGORY_ORDER = Object.freeze(['birth', 'death', 'law', 'crisis', 'expedition', 'threat', 'recovery',
  'research', 'kit']);

function normalizedStoryEntry(entry, hasFirstRoom) {
  if (!STORY_EVENTS.has(entry.code)) return null;
  if (entry.code === 'eventDug' && (entry.params?.kind !== 'room' || hasFirstRoom)) return null;
  const copy = {
    id: entry.id,
    tick: entry.code === 'eventWelcome' ? TIME.START_HOUR * TIME.TICKS_PER_HOUR : entry.tick,
    level: entry.level,
    code: entry.code,
    params: { ...(entry.params ?? {}) },
  };
  if (entry.focus) copy.focus = { ...entry.focus };
  return copy;
}

function archiveStory(sim) {
  const archive = sim.exodus.storyArchive;
  let cursor = sim.exodus.storyJournalCursor;
  let hasFirstRoom = archive.some((entry) => entry.code === 'eventDug');
  for (const entry of sim.journal) {
    if (entry.id <= cursor) continue;
    cursor = Math.max(cursor, entry.id);
    const copy = normalizedStoryEntry(entry, hasFirstRoom);
    if (!copy) continue;
    if (copy.code === 'eventDug') hasFirstRoom = true;
    archive.push(copy);
  }
  sim.exodus.storyJournalCursor = cursor;
}

export function initializeExodus(sim) {
  sim.exodus ??= {};
  const backfillStory = sim.exodus.storyArchive === undefined;
  sim.exodus.kit ??= Object.fromEntries(Object.keys(EXODUS.KIT_REQUIREMENTS).map((resource) => [resource, 0]));
  sim.exodus.craft ??= null;
  sim.exodus.preview ??= null;
  sim.exodus.result ??= null;
  sim.exodus.lowMoraleSince ??= null;
  sim.exodus.storyArchive ??= [];
  sim.exodus.storyJournalCursor ??= -1;
  if (backfillStory) archiveStory(sim);
}

function scoredKitAmount(kit, resource, startingKit = kit) {
  const remaining = kit?.[resource] ?? 0;
  // Harvests are food, not additional kit value: their uneaten surplus must
  // never reward a departure that loses more people during the first year.
  return resource === 'food' ? Math.min(remaining, startingKit?.food ?? 0) : remaining;
}

export function kitScoreValue(kit, startingKit = kit) {
  return Object.entries(EXODUS.KIT_SCORE_VALUES).reduce((total, [resource, value]) =>
    total + scoredKitAmount(kit, resource, startingKit) * value, 0);
}

export function kitStatus(sim) {
  const contents = Object.fromEntries(Object.entries(EXODUS.KIT_REQUIREMENTS).map(([resource, required]) => {
    const amount = sim.exodus.kit[resource] ?? 0;
    const unitValue = EXODUS.KIT_SCORE_VALUES[resource];
    return [resource, {
      amount,
      required,
      complete: amount >= required,
      unitValue,
      value: amount * unitValue,
    }];
  }));
  const value = kitScoreValue(sim.exodus.kit);
  return {
    contents,
    complete: Object.values(contents).every((entry) => entry.complete),
    value,
    scoreValue: value,
    craft: sim.exodus.craft,
  };
}

function craftRequirements(order = {}, kit = {}) {
  const fuel = order.fuel === undefined ? EXODUS.KIT_REQUIREMENTS.fuel : Number(order.fuel);
  const food = order.food === undefined ? EXODUS.KIT_REQUIREMENTS.food : Number(order.food);
  const target = {
    ...EXODUS.KIT_REQUIREMENTS,
    food: Number.isFinite(food) ? Math.max(EXODUS.KIT_REQUIREMENTS.food, Math.floor(food)) : EXODUS.KIT_REQUIREMENTS.food,
    fuel: Number.isFinite(fuel) ? Math.max(EXODUS.KIT_REQUIREMENTS.fuel, Math.floor(fuel)) : EXODUS.KIT_REQUIREMENTS.fuel,
  };
  // A finished legacy kit keeps its contents: fabrication tops up only what is missing.
  return Object.fromEntries(Object.entries(target)
    .map(([resource, amount]) => [resource, Math.max(0, amount - (kit[resource] ?? 0))])
    .filter(([, amount]) => amount > 0));
}

function missingKitResources(sim, requirements) {
  const totals = resourceTotals(sim);
  return Object.fromEntries(Object.entries(requirements)
    .map(([resource, required]) => [resource, Math.max(0, required - (totals[resource] ?? 0))])
    .filter(([, missing]) => missing > 1e-9));
}

// What a kitCraft order would ask for (only what the kit still lacks) and what
// the colony cannot supply of it. The depot panel and the order share this.
export function kitCraftShortfall(sim, order = {}) {
  const requirements = craftRequirements(order, sim.exodus?.kit ?? {});
  return { requirements, missing: missingKitResources(sim, requirements) };
}

function kitDeliveryRequirements(requirements) {
  return {
    ...requirements,
    ...(requirements.food > 0 ? { food: requirements.food + WORK.CARRY_CAPACITY } : {}),
    ...(requirements.fuel > 0 ? { fuel: requirements.fuel + WORK.CARRY_CAPACITY } : {}),
  };
}

export function startKitCraft(sim, order) {
  const depot = sim.excavation(order.excavationId);
  if (!depot || depot.roomType !== 'exodusDepot' || depot.state !== 'fitted') return { ok: false, error: 'exodusDepotRequired' };
  if (kitStatus(sim).complete) return { ok: false, error: 'kitComplete' };
  if (sim.exodus.craft) return { ok: false, error: 'kitCraftActive' };
  const { requirements, missing } = kitCraftShortfall(sim, order);
  if (Object.keys(missing).length > 0) return { ok: false, error: 'noResources', missing };
  ensureRoomStock(sim, depot);
  sim.exodus.craft = {
    excavationId: depot.id, work: 0, required: EXODUS.KIT_WORK_MINUTES, status: 'awaitingResources',
    requirements, reservedResources: null,
  };
  requestRoomResources(sim, depot, kitDeliveryRequirements(requirements), true);
  return { ok: true, craft: sim.exodus.craft };
}

function hasLocalKitResources(stock, requirements) {
  return Object.entries(requirements)
    .every(([resource, required]) => (stock.resources[resource] ?? 0) >= required);
}

function drawFoodFromColony(sim, depot, stock, requirements) {
  const missing = (requirements.food ?? 0) - (stock.resources.food ?? 0);
  if (missing <= 1e-9) return;
  const otherResourcesReady = Object.entries(requirements)
    .every(([resource, required]) => resource === 'food' || (stock.resources[resource] ?? 0) >= required);
  if (!otherResourcesReady) return;
  const deliveryPending = sim.jobs.some((job) => job.kitCraft && job.type === 'stockHaul'
    && job.excavationId === depot.id && job.status !== 'done');
  if (deliveryPending) return;
  const sources = sim.stocks.filter((candidate) => candidate.id !== stock.id && stocksConnected(sim, stock, candidate));
  const available = sources.reduce((total, candidate) => total + (candidate.resources.food ?? 0), 0);
  if (available + 1e-9 < missing) return;
  let remaining = missing;
  for (const candidate of sources) {
    if (remaining <= 1e-9) continue;
    const amount = Math.min(remaining, candidate.resources.food ?? 0);
    if (amount <= 0) continue;
    candidate.resources.food -= amount;
    if (candidate.resources.food <= 0) delete candidate.resources.food;
    addToStock(stock, 'food', amount);
    remaining -= amount;
  }
  sim.log('info', 'eventKitColonyReserve', { amount: missing }, depot);
}

export function cancelKitCraft(sim) {
  const craft = sim.exodus.craft;
  if (!craft) return { ok: false, error: 'kitCraftNotActive' };
  const depot = sim.excavation(craft.excavationId);
  const deliveredStock = roomStock(depot) ?? sim.stocks.find((stock) => stock.excavationId === craft.excavationId) ?? null;
  let colonyStock = reserveStock(sim, depot?.x ?? deliveredStock?.x ?? 0, depot?.y ?? deliveredStock?.y ?? 0);
  const refundedResources = {};
  const refund = (resource, amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (!colonyStock) {
      colonyStock = createStock(`kit-refund-${craft.excavationId}`, deliveredStock?.x ?? 0, deliveredStock?.y ?? 0);
      sim.stocks.push(colonyStock);
    }
    addToStock(colonyStock, resource, amount);
    refundedResources[resource] = (refundedResources[resource] ?? 0) + amount;
  };
  for (const [resource, amount] of Object.entries(craft.reservedResources ?? {})) refund(resource, amount);
  for (const resource of Object.keys(craft.requirements ?? EXODUS.KIT_REQUIREMENTS)) {
    const amount = deliveredStock?.resources[resource] ?? 0;
    if (amount <= 0) continue;
    refund(resource, amount);
    delete deliveredStock.resources[resource];
  }
  for (const job of sim.jobs) {
    if (!job.kitCraft || job.type !== 'stockHaul' || job.excavationId !== craft.excavationId || job.status === 'done') continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    if (colonist?.jobId === job.id) {
      if (colonist.carrying) {
        refund(colonist.carrying.resource, colonist.carrying.amount);
        colonist.carrying = null;
      }
      colonist.jobId = null;
      colonist.task = 'idle';
      colonist.path = [];
      colonist.pathIndex = 0;
      colonist.pathGoal = null;
    }
    job.status = 'done';
    job.colonistId = null;
  }
  sim.exodus.craft = null;
  return { ok: true, refundedResources };
}

function presentKitWorkers(sim, depot) {
  const colonistIds = new Set();
  let output = 0;
  for (const job of sim.jobs) {
    if (job.type !== 'produce' || job.excavationId !== depot.id || job.status !== 'active') continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    if (!colonist || colonist.health <= 0 || colonist.dead
      || colonist.x < depot.x || colonist.x >= depot.x + depot.w
      || colonist.y < depot.y || colonist.y >= depot.y + depot.h) continue;
    // Un affamé au maximum de la faim ne compte que pour une fraction d'ouvrier.
    if (colonistIds.has(colonist.id)) continue;
    colonistIds.add(colonist.id);
    output += starvingWorkFactor(colonist);
  }
  return output;
}

function updateKitCraft(sim) {
  const craft = sim.exodus.craft;
  if (!craft) return;
  const depot = sim.excavation(craft.excavationId);
  if (!depot || depot.roomType !== 'exodusDepot' || depot.state !== 'fitted') {
    craft.status = 'noDepot';
    return;
  }
  if (!craft.reservedResources) {
    const requirements = craft.requirements ?? craftRequirements({}, sim.exodus.kit);
    const stock = ensureRoomStock(sim, depot);
    requestRoomResources(sim, depot, kitDeliveryRequirements(requirements), true);
    drawFoodFromColony(sim, depot, stock, requirements);
    if (!hasLocalKitResources(stock, requirements)) {
      craft.status = 'awaitingResources';
      return;
    }
    if (!spendResources(sim, requirements, stock)) {
      craft.status = 'awaitingResources';
      return;
    }
    craft.reservedResources = { ...requirements };
  }
  const workers = presentKitWorkers(sim, depot);
  if (workers === 0) {
    craft.status = 'noWorkers';
    return;
  }
  craft.status = 'working';
  craft.work += workers;
  if (craft.work + 1e-9 < craft.required) return;
  for (const [resource, amount] of Object.entries(craft.reservedResources)) {
    sim.exodus.kit[resource] = (sim.exodus.kit[resource] ?? 0) + amount;
  }
  sim.exodus.craft = null;
  sim.log('info', 'eventKitReady', { value: kitScoreValue(sim.exodus.kit) }, depot);
}

function isLiving(colonist) {
  return colonist.health > 0 && !colonist.dead;
}

function killProjectedColonists(sim, population, month, cause, probability) {
  let deaths = 0;
  for (const person of population) {
    if (!person.alive) continue;
    const rng = new RNG(hashString(`${sim.seed}:exodus-first-year:${sim.tick}:${month}:${person.source.id}:${cause}`));
    if (!rng.chance(probability)) continue;
    person.alive = false;
    person.deathCause = cause;
    person.deathMonth = month;
    deaths += 1;
  }
  return deaths;
}

export function projectFirstYear(sim) {
  const population = sim.colonists.filter(isLiving).map((source) => ({
    source, alive: true, deathCause: null, deathMonth: null,
  }));
  const startingLiving = population.length;
  const startingKit = Object.fromEntries(Object.keys(EXODUS.KIT_SCORE_VALUES)
    .map((resource) => [resource, Math.max(0, sim.exodus.kit?.[resource] ?? 0)]));
  startingKit.souvenirs = (sim.m6?.balanceProfile === 'baseline' ? 0 : sim.m6?.souvenirs?.length ?? 0);
  const remainingKit = { ...startingKit };
  const monthDays = EXODUS.DAYS_PER_MONTH;
  const months = Array.from({ length: EXODUS.FIRST_YEAR_MONTHS }, (_, index) => {
    const dailyTemperatures = Array.from({ length: monthDays }, (_, day) => surfaceTemperature(
      sim.tick / TIME.TICKS_PER_DAY + index * monthDays + day,
    ));
    return {
      month: index + 1,
      dailyTemperatures,
      temperature: dailyTemperatures.reduce((total, value) => total + value, 0) / monthDays,
    };
  });
  // When seeds sown on departure would ripen, whatever the kit holds today:
  // the preview shows it so a kit can be planned before its seeds are packed.
  let seedHarvestDay = null;
  let seedGrowingDays = 0;
  let elapsedDays = 0;
  for (const month of months) {
    for (const temperature of month.dailyTemperatures) {
      elapsedDays += 1;
      if (seedHarvestDay !== null) continue;
      seedGrowingDays = temperature > EXODUS.HARVEST_MIN_TEMPERATURE ? seedGrowingDays + 1 : 0;
      if (seedGrowingDays >= EXODUS.GROWING_SEASON_DAYS) seedHarvestDay = elapsedDays;
    }
  }
  let firstHarvestMonth = null;
  let growingDays = 0;
  const harvestYield = startingKit.seeds * EXODUS.HARVEST_FOOD_PER_SEED;
  const coldest = months.reduce((current, month) => month.temperature < current.temperature ? month : current, months[0]);

  for (const month of months) {
    month.startingLiving = population.filter((person) => person.alive).length;
    month.foodStart = remainingKit.food;
    month.fuelStart = remainingKit.fuel;
    month.harvest = false;
    month.harvestFood = 0;
    month.growingDaysStart = growingDays;
    month.foodRequired = monthDays * month.startingLiving * EXODUS.FOOD_PER_COLONIST_DAY;
    month.foodConsumed = 0;
    for (const temperature of month.dailyTemperatures) {
      const meal = Math.min(remainingKit.food, month.startingLiving * EXODUS.FOOD_PER_COLONIST_DAY);
      remainingKit.food -= meal;
      month.foodConsumed += meal;
      if (firstHarvestMonth !== null || harvestYield <= 0 || month.startingLiving === 0) continue;
      growingDays = temperature > EXODUS.HARVEST_MIN_TEMPERATURE ? growingDays + 1 : 0;
      if (growingDays < EXODUS.GROWING_SEASON_DAYS) continue;
      // The last growing day's meal still comes from provisions. This one finite
      // crop is stored at day's end and can feed later months, including winter.
      firstHarvestMonth = month.month;
      month.harvest = true;
      month.harvestFood = harvestYield;
      remainingKit.food += harvestYield;
    }
    month.growingDaysEnd = growingDays;
    month.starvationDeaths = month.foodConsumed + 1e-9 < month.foodRequired
      ? killProjectedColonists(sim, population, month.month, 'starvation', EXODUS.STARVATION_DEATH_RATE) : 0;

    month.fuelRequired = month.temperature < 0 ? monthDays * EXODUS.FUEL_PER_COLD_DAY : 0;
    month.fuelConsumed = Math.min(month.fuelStart, month.fuelRequired);
    remainingKit.fuel = Math.max(0, month.fuelStart - month.fuelConsumed);
    month.coldDeaths = month.fuelConsumed + 1e-9 < month.fuelRequired
      ? killProjectedColonists(sim, population, month.month, 'cold', EXODUS.COLD_DEATH_RATE) : 0;
    month.foodEnd = remainingKit.food;
    month.fuelEnd = remainingKit.fuel;
    month.food = month.foodEnd;
    month.fuel = month.fuelEnd;
    month.living = population.filter((person) => person.alive).length;
    month.endingLiving = month.living;
    month.deaths = month.starvationDeaths + month.coldDeaths;
  }

  const zoneMultiplier = hotspotAt(sim, sim.radiation.selectedX);
  let additionalDose = 0;
  for (let hour = 0; hour < EXODUS.FIRST_YEAR_DOSE_HOURS; hour += 1) {
    additionalDose += baseRadiationRate(sim.tick + hour * TIME.TICKS_PER_HOUR) * zoneMultiplier;
  }
  const projectedColonists = population.map((person) => {
    const currentDose = person.source.dose ?? 0;
    const projectedDose = currentDose + additionalDose;
    return {
      id: person.source.id,
      alive: person.alive,
      deathCause: person.deathCause,
      deathMonth: person.deathMonth,
      currentDose,
      additionalDose,
      projectedDose,
      healthy: person.alive && projectedDose <= RADIATION.HEALTHY_MAX_MSV,
      skills: { ...person.source.skills },
    };
  });
  const living = projectedColonists.filter((person) => person.alive);
  const averageCurrentDose = startingLiving
    ? projectedColonists.reduce((total, person) => total + person.currentDose, 0) / startingLiving : 0;
  const averageCumulativeDose = startingLiving ? averageCurrentDose + additionalDose : 0;
  const kitValue = kitScoreValue(remainingKit, startingKit);
  return {
    startingLiving,
    living: living.length,
    healthy: living.filter((person) => person.healthy).length,
    firstMonthTemperature: months[0].temperature,
    coldestMonth: coldest.month,
    coldestTemperature: coldest.temperature,
    firstHarvestMonth,
    seedHarvestDay,
    seedHarvestMonth: seedHarvestDay === null ? null : Math.ceil(seedHarvestDay / monthDays),
    foodDays: startingLiving ? startingKit.food / (startingLiving * EXODUS.FOOD_PER_COLONIST_DAY) : 0,
    fuelDays: startingKit.fuel / EXODUS.FUEL_PER_COLD_DAY,
    starvationDeaths: months.reduce((total, month) => total + month.starvationDeaths, 0),
    coldDeaths: months.reduce((total, month) => total + month.coldDeaths, 0),
    averageCurrentDose,
    averageAdditionalDose: startingLiving ? additionalDose : 0,
    averageFirstYearDose: startingLiving ? additionalDose : 0,
    averageCumulativeDose,
    averageProjectedDose: averageCumulativeDose,
    startingKit,
    kit: remainingKit,
    remainingKit: { ...remainingKit },
    kitValue,
    kitScoreValue: kitValue,
    colonists: projectedColonists,
    firstYear: {
      days: EXODUS.FIRST_YEAR_MONTHS * monthDays,
      doseHours: EXODUS.FIRST_YEAR_DOSE_HOURS,
      months,
    },
  };
}

export function heritageScore(sim, projection = null) {
  const projected = projection ?? projectFirstYear(sim);
  const living = projected.colonists.filter((person) => person.alive);
  const healthy = living.filter((person) => person.projectedDose <= RADIATION.HEALTHY_MAX_MSV);
  const skillPoints = living.reduce((total, colonist) => total + Object.values(colonist.skills ?? {})
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)
    .slice(0, 2)
    .reduce((sum, value) => sum + value, 0), 0);
  const kitLines = Object.entries(EXODUS.KIT_SCORE_VALUES).map(([resource, unitValue]) => {
    const count = scoredKitAmount(projected.kit, resource, projected.startingKit);
    return { code: resource, count, unitValue, value: count * unitValue };
  });
  const kitValue = kitLines.reduce((total, line) => total + line.value, 0);
  const souvenirCount = projected.kit?.souvenirs ?? (sim.m6?.balanceProfile === 'baseline' ? 0 : sim.m6?.souvenirs?.length ?? 0);
  const souvenirValue = souvenirCount * M6.SOUVENIR_HERITAGE;
  const lines = [
    { code: 'healthy', count: healthy.length, unitValue: EXODUS.HEALTHY_SCORE, value: healthy.length * EXODUS.HEALTHY_SCORE },
    { code: 'otherLiving', count: living.length - healthy.length, unitValue: EXODUS.OTHER_LIVING_SCORE, value: (living.length - healthy.length) * EXODUS.OTHER_LIVING_SCORE },
    { code: 'skills', count: skillPoints, unitValue: EXODUS.SKILL_SCORE, value: skillPoints * EXODUS.SKILL_SCORE },
    { code: 'kit', count: kitValue, unitValue: 1, value: kitValue },
    ...(souvenirCount > 0 ? [{ code: 'souvenirs', count: souvenirCount, unitValue: M6.SOUVENIR_HERITAGE, value: souvenirValue }] : []),
  ];
  return {
    total: lines.reduce((total, line) => total + line.value, 0),
    lines,
    kitLines,
    kitValue,
    souvenirCount,
    souvenirValue,
    healthy: healthy.length,
    living: living.length,
    startingLiving: projected.startingLiving,
    skillPoints,
  };
}

function publicStoryEntry(entry) {
  return { tick: entry.tick, code: entry.code, params: { ...(entry.params ?? {}) } };
}

function radioStoryEntry(sim) {
  const neighbors = exportRadioNeighbors(sim);
  const names = (entries) => entries.length > 0
    ? entries.map((neighbor) => radioText(neighbor.nameKey)).join(', ') : 'aucun';
  return {
    id: `radio-neighbors-${sim.tick}`,
    tick: sim.tick,
    code: 'storyRadioNeighbors',
    params: {
      surviving: names(neighbors.filter((neighbor) => neighbor.survived)),
      silent: names(neighbors.filter((neighbor) => neighbor.fate === 'silent')),
    },
  };
}

function completeStory(sim, entries) {
  const completed = [...entries];
  if (completed.length < 8) {
    const projection = sim.exodus.preview ?? projectFirstYear(sim);
    const candidates = [];
    if (!completed.some((entry) => entry.code === 'eventDug')) {
      candidates.push({ tick: sim.tick, code: 'storyNoRoom', params: {} });
    }
    if (!completed.some((entry) => entry.code === 'eventExpeditionDeparture')) {
      candidates.push({ tick: sim.tick, code: 'storyNoExpedition', params: {} });
    }
    candidates.push(
      { tick: sim.tick, code: 'storyColonyState', params: { living: projection.startingLiving } },
      { tick: sim.tick, code: 'storyKitSummary', params: { value: kitScoreValue(projection.startingKit) } },
      { tick: sim.tick, code: 'storyProjection', params: { living: projection.living, healthy: projection.healthy } },
      { tick: sim.tick, code: projection.firstHarvestMonth === null ? 'storyNoHarvest' : 'storyClimate', params: { month: projection.firstHarvestMonth } },
    );
    const endingIndex = completed.findLastIndex((entry) => entry.code === 'eventExodus' || entry.code === 'eventDefeat');
    completed.splice(endingIndex >= 0 ? endingIndex : completed.length, 0, ...candidates.slice(0, 8 - completed.length));
  }
  return completed.map(publicStoryEntry);
}

export function colonyStory(sim) {
  let hasFirstRoom = false;
  const normalized = [...sim.exodus.storyArchive, ...sim.journal].map((entry) => {
    const copy = normalizedStoryEntry(entry, hasFirstRoom);
    if (copy?.code === 'eventDug') hasFirstRoom = true;
    return copy;
  }).filter(Boolean);
  const unique = [...new Map(normalized.map((entry) => [`${entry.id}:${entry.code}`, entry])).values()]
    .sort((a, b) => a.tick - b.tick || a.id - b.id || a.code.localeCompare(b.code));
  const radioEntry = radioStoryEntry(sim);
  const withRadio = [...unique];
  const endingIndex = unique.findLastIndex((entry) => entry.code === 'eventExodus' || entry.code === 'eventDefeat');
  withRadio.splice(endingIndex >= 0 ? endingIndex : withRadio.length, 0, radioEntry);
  if (withRadio.length <= 15) return completeStory(sim, withRadio);

  const anchors = [unique.find((entry) => entry.code === 'eventWelcome'),
    unique.find((entry) => entry.code === 'eventDug'),
    unique.findLast((entry) => entry.code === 'eventExodus' || entry.code === 'eventDefeat'),
    radioEntry].filter(Boolean);
  const selected = new Map(anchors.map((entry) => [`${entry.id}:${entry.code}`, entry]));
  const groups = new Map(STORY_CATEGORY_ORDER.map((category) => [category, unique.filter((entry) =>
    STORY_CATEGORIES[entry.code] === category && !selected.has(`${entry.id}:${entry.code}`))]));
  while (selected.size < 15 && [...groups.values()].some((entries) => entries.length > 0)) {
    for (const category of STORY_CATEGORY_ORDER) {
      const entry = groups.get(category).shift();
      if (entry) selected.set(`${entry.id}:${entry.code}`, entry);
      if (selected.size >= 15) break;
    }
  }
  for (const entry of unique) {
    if (selected.size >= 15) break;
    selected.set(`${entry.id}:${entry.code}`, entry);
  }
  const ordered = [...selected.values()]
    .sort((a, b) => a.tick - b.tick || a.id - b.id || a.code.localeCompare(b.code));
  const finalIndex = ordered.findLastIndex((entry) => entry.code === 'eventExodus' || entry.code === 'eventDefeat');
  if (finalIndex >= 0) ordered.push(ordered.splice(finalIndex, 1)[0]);
  return ordered.map(publicStoryEntry);
}

export function createColonyExport(sim, projection = null) {
  const projected = projection ?? projectFirstYear(sim);
  const projectedById = new Map(projected.colonists.map((person) => [person.id, person]));
  return {
    exportVersion: EXODUS.EXPORT_VERSION,
    seed: sim.seed,
    tick: sim.tick,
    date: { year: Math.floor(sim.tick / (360 * TIME.TICKS_PER_DAY)) + 1, day: Math.floor(sim.tick / TIME.TICKS_PER_DAY) % 360 + 1 },
    zone: { x: sim.radiation.selectedX, threshold: sim.radiation.safeThreshold, doseRate: sim.radiation.surfaceDose },
    colonists: sim.colonists.map((colonist) => {
      const person = projectedById.get(colonist.id);
      return {
        id: colonist.id,
        name: colonist.name,
        age: colonist.age,
        health: person && !person.alive ? 0 : colonist.health,
        dead: person ? !person.alive : Boolean(colonist.dead),
        dose: person?.projectedDose ?? colonist.dose ?? 0,
        firstYearDose: person?.additionalDose ?? 0,
        projectionDeathCause: person?.deathCause ?? null,
        skills: { ...colonist.skills },
        relations: { ...colonist.relations },
        coupleId: colonist.coupleId ?? null,
      };
    }),
    startingKit: { ...projected.startingKit },
    kit: { ...projected.kit },
    kitSouvenirs: projected.kit?.souvenirs ?? 0,
    souvenirs: (sim.m6?.souvenirs ?? []).map((souvenir) => ({ ...souvenir })),
    firstYear: projected.firstYear,
    projection: projected,
    radioNeighbors: exportRadioNeighbors(sim),
    survivingNeighbors: exportSurvivingNeighbors(sim),
    score: heritageScore(sim, projected),
    ...(sim.veillee ? { veillee: {
      marks: [...sim.veillee.marks],
      inscriptions: sim.veillee.inscriptions.map(inscription => ({ ...inscription })),
    } } : {}),
  };
}

export function previewExodus(sim) {
  const projected = projectFirstYear(sim);
  const preview = {
    ...projected,
    kitStatus: kitStatus(sim),
    score: heritageScore(sim, projected),
  };
  sim.exodus.preview = preview;
  return { ok: true, preview };
}

function finishColony(sim, type, reason) {
  if (sim.exodus.result) return sim.exodus.result;
  const projection = projectFirstYear(sim);
  const score = heritageScore(sim, projection);
  sim.log(type === 'exodus' ? 'info' : 'error', type === 'exodus' ? 'eventExodus' : 'eventDefeat', { reason, score: score.total });
  archiveStory(sim);
  const entries = colonyStory(sim);
  sim.exodus.result = {
    type,
    reason,
    tick: sim.tick,
    score,
    story: null,
    export: null,
  };
  sim.exodus.result.story = buildEndStory(sim, entries, projection);
  sim.exodus.result.export = createColonyExport(sim, projection);
  return sim.exodus.result;
}

export function launchExodus(sim, order) {
  if (!sim.exodus.preview || order.confirmed !== true) return { ok: false, error: 'exodusPreviewRequired' };
  if (!kitStatus(sim).complete) return { ok: false, error: 'kitIncomplete' };
  if (!sim.colonists.some((colonist) => colonist.health > 0 && !colonist.dead)) return { ok: false, error: 'noLivingColonists' };
  return { ok: true, result: finishColony(sim, 'exodus', 'departure') };
}

function updateDefeat(sim) {
  const living = sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead);
  if (sim.colonists.length > 0 && living.length === 0) {
    finishColony(sim, 'defeat', 'extinction');
    return;
  }
  const morale = living.length ? living.reduce((total, colonist) => total
    + (Number.isFinite(colonist.morale) ? colonist.morale : (colonist.moraleValue ?? 0)), 0) / living.length
    : EXODUS.DEFEAT_MORALE;
  if (morale < EXODUS.DEFEAT_MORALE) sim.exodus.lowMoraleSince ??= sim.tick;
  else sim.exodus.lowMoraleSince = null;
  if (sim.exodus.lowMoraleSince !== null && sim.tick - sim.exodus.lowMoraleSince >= EXODUS.DEFEAT_TICKS) {
    finishColony(sim, 'defeat', 'socialCollapse');
  }
}

export function updateExodus(sim) {
  archiveStory(sim);
  if (sim.exodus.result) return;
  updateKitCraft(sim);
  updateDefeat(sim);
}

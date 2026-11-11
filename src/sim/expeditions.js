import { EXPEDITION } from '../data/surface.js';
import { PEOPLE } from '../data/people.js';
import { HEAT, NEEDS, TIME, WORK } from '../data/balance.js';
import { trFrench as tr } from '../data/strings.fr.js';
import { surfaceTemperature } from './climate.js';
import { addDose, surfaceDoseRate, suitProtection } from './radiation.js';
import { revealSurfaceSites, siteDefinition, siteLootFactor, depleteSite, regenerateSurfaceSites, surfaceHatch } from './surface.js';
import { canJoinSurfaceCrew, createSurfaceCrew, releaseSurfaceCrew, sendSurfaceCrewHome, updateSurfaceCrew } from './surfaceCrew.js';
import { RNG, hashString } from './rng.js';
import { addToStock, createStock, isExodusStockReserved, recordReserveShift, reserveStock, spendResources } from './resources.js';
import { lawMultiplier } from './laws.js';
import { createInitialColonists } from './colonists.js';
import { createPersonProfile } from './people.js';
import { recordExpeditionMessage } from './radio.js';

export const ENCOUNTER_DIALOGUES = Object.freeze({
  survivors: Object.freeze({
    dialogueKey: 'encounterSurvivorsDialogue',
    choices: Object.freeze([
      Object.freeze({ id: 'recruit', labelKey: 'encounterRecruit', descriptionKey: 'encounterRecruitEffect' }),
      Object.freeze({ id: 'trade', labelKey: 'encounterTrade', descriptionKey: 'encounterTradeEffect' }),
      Object.freeze({ id: 'leave', labelKey: 'encounterLeave', descriptionKey: 'encounterLeaveEffect' }),
    ]),
  }),
  raiders: Object.freeze({
    dialogueKey: 'encounterRaidersDialogue',
    choices: Object.freeze([
      Object.freeze({ id: 'flee', labelKey: 'encounterFlee', descriptionKey: 'encounterFleeEffect' }),
      Object.freeze({ id: 'cede', labelKey: 'encounterCede', descriptionKey: 'encounterCedeEffect' }),
      Object.freeze({ id: 'negotiate', labelKey: 'encounterNegotiate', descriptionKey: 'encounterNegotiateEffect' }),
    ]),
  }),
});

function encounterFor(expeditionId, kind) {
  const definition = ENCOUNTER_DIALOGUES[kind];
  return {
    id: `encounter-${expeditionId}`,
    expeditionId,
    kind,
    type: kind,
    dialogueKey: definition.dialogueKey,
    choices: definition.choices.map((choice) => ({ ...choice })),
    choiceIndex: null,
    choiceId: null,
    outcome: null,
  };
}

function expeditionRng(sim, expeditionId) {
  return new RNG(hashString(`${sim.seed}:expedition:${expeditionId}`));
}

function availableCrew(sim, colonistIds) {
  const ids = [...new Set(colonistIds ?? [])].sort((a, b) => a - b);
  const crew = ids.map((id) => sim.colonists.find((colonist) => colonist.id === id))
    .filter((colonist) => colonist && colonist.health > 0 && !colonist.surfaceCrewId
      && (colonist.age ?? PEOPLE.ADULT_AGE) >= PEOPLE.MINIMUM_WORK_AGE
      && (colonist.bodyLocation ?? 'colony') === 'colony' && canJoinSurfaceCrew(sim, colonist));
  return { ids, crew };
}

function departureMeal(sim, colonist) {
  const rationFactor = lawMultiplier(sim, 'foodRation', 1);
  const candidates = [];
  for (const stock of sim.stocks) {
    for (const resource of ['meals', 'food']) {
      if (isExodusStockReserved(sim, stock, resource)) continue;
      const amount = WORK.FOOD_PER_MEAL * rationFactor
        * (1 - (resource === 'meals' ? stock.wasteReduction ?? 0 : 0));
      if (amount <= 0 || (stock.resources[resource] ?? 0) < amount) continue;
      const nutritionBonus = resource === 'meals' ? stock.nutritionBonus ?? 0 : 0;
      candidates.push({
        stock, resource, amount,
        restoration: WORK.HUNGER_RESTORE * rationFactor * (1 + nutritionBonus),
        distance: Math.abs(stock.x - colonist.x) + Math.abs(stock.y - colonist.y),
      });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || String(a.stock.id).localeCompare(String(b.stock.id))
    || (a.resource === b.resource ? 0 : a.resource === 'meals' ? -1 : 1));
  return candidates[0] ?? null;
}

function fillDepartureNeeds(sim, crew) {
  for (const colonist of crew) {
    if (spendResources(sim, { waterClean: NEEDS.WATER_PER_DRINK })) {
      colonist.thirst = Math.max(0, colonist.thirst - NEEDS.THIRST_RESTORE);
    }
    const meal = departureMeal(sim, colonist);
    if (meal && spendResources(sim, { [meal.resource]: meal.amount }, meal.stock)) {
      colonist.hunger = Math.max(0, colonist.hunger - meal.restoration);
    }
  }
}

function needsDurationTicks(sim, crew, definition, durationTicks) {
  const previewSim = {
    ...sim,
    colonists: sim.colonists.map((colonist) => ({
      ...colonist, jobId: null, activity: null, personal: null, carrying: null,
      path: [], pathIndex: 0, pathGoal: null,
    })),
  };
  const surfaceCrew = createSurfaceCrew(previewSim, {
    id: 'needs-preview', kind: 'expedition', colonistIds: crew.map((colonist) => colonist.id), destinationX: definition.x,
  });
  const limit = Math.max(1000, sim.world.width * sim.world.height);
  let outbound = 0;
  while (surfaceCrew.phase !== 'surface' && outbound < limit) {
    updateSurfaceCrew(previewSim, surfaceCrew);
    outbound += 1;
  }
  sendSurfaceCrewHome(surfaceCrew);
  let returning = 0;
  while (surfaceCrew.phase !== 'inside' && returning < limit) {
    updateSurfaceCrew(previewSim, surfaceCrew);
    returning += 1;
  }
  if (outbound >= limit || returning >= limit) return limit;
  return Math.max(outbound, durationTicks) + returning;
}

function previewNeedsRisk(sim, crew, durationTicks) {
  const previewSim = {
    ...sim,
    stocks: sim.stocks.map((stock) => ({ ...stock, resources: { ...stock.resources } })),
  };
  const projectedCrew = crew.map((colonist) => ({ ...colonist }));
  fillDepartureNeeds(previewSim, projectedCrew);
  const needsRisk = [];
  for (const colonist of projectedCrew) {
    const durationDays = durationTicks / TIME.TICKS_PER_DAY;
    const projected = {
      thirst: colonist.thirst + NEEDS.THIRST_PER_DAY * durationDays,
      hunger: colonist.hunger + WORK.HUNGER_PER_DAY * durationDays,
    };
    for (const need of ['thirst', 'hunger']) {
      if (projected[need] >= NEEDS.CRITICAL_NEED_THRESHOLD) needsRisk.push({ id: colonist.id, need });
    }
  }
  return needsRisk;
}

function previewLoot(definition, factor = 1) {
  return Object.fromEntries(Object.entries(definition.loot).map(([resource, range]) => [
    resource,
    [Math.max(1, Math.round(range[0] * factor)), Math.max(1, Math.round(range[1] * factor))],
  ]));
}

// L'équipe ne ramène que ce qu'elle peut porter : on laisse sur place, une à une,
// les plus grosses piles jusqu'à rentrer dans la capacité totale de port.
function capLootToCapacity(loot, capacity) {
  let total = Object.values(loot).reduce((sum, amount) => sum + amount, 0);
  while (total > capacity) {
    const heaviest = Object.entries(loot).filter(([, amount]) => amount > 1)
      .sort(([resourceA, amountA], [resourceB, amountB]) => amountB - amountA || resourceA.localeCompare(resourceB))[0];
    if (!heaviest) break;
    loot[heaviest[0]] -= 1;
    total -= 1;
  }
  return loot;
}

function expeditionsBlocked(sim) {
  return sim.weather.current === 'dustStorm' || sim.weather.expeditionsBlocked;
}

function roundedDose(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function lootText(loot) {
  return Object.entries(loot ?? {})
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, amount]) => `${amount} ${tr(resource)}`)
    .join(tr('resourceListSeparator'));
}

function returnSummary(loot, averageDose) {
  const values = { loot: lootText(loot) || tr('none'), dose: roundedDose(averageDose) };
  const key = 'eventExpeditionReturnSummary';
  const translated = tr(key, values);
  return translated === key ? `${values.loot}${tr('resourceListSeparator')}${values.dose} mSv` : translated;
}

export function initializeExpeditions(sim) {
  sim.expeditions ??= {};
  sim.expeditions.active ??= [];
  sim.expeditions.nextId ??= 1;
  sim.expeditions.prepared ??= null;
  sim.expeditions.pendingEncounter ??= null;
  sim.expeditions.completed ??= 0;
  sim.expeditions.history ??= [];

  for (const expedition of sim.expeditions.active) {
    expedition.startDoses ??= {};
    expedition.siteResolved ??= false;
    expedition.loot ??= null;
    expedition.recruitPending ??= false;
    expedition.recruitId ??= null;
    if (!expedition.encounter) continue;
    expedition.encounter.expeditionId ??= expedition.id;
    expedition.encounter.choiceIndex ??= null;
    expedition.encounter.choiceId ??= null;
    expedition.encounter.outcome ??= null;
  }
  const pending = sim.expeditions.active.filter((expedition) => expedition.state === 'encounter'
    && expedition.encounter?.choiceIndex === null).sort((a, b) => a.id - b.id)[0];
  sim.expeditions.pendingEncounter = pending?.encounter ?? null;
}

function nextSurfaceThawTick(tick) {
  const startTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  if (surfaceTemperature(startTick / TIME.TICKS_PER_DAY) >= 0) return null;
  const lastDay = Math.ceil(HEAT.NUCLEAR_WINTER_DAYS) + TIME.DAYS_PER_YEAR;
  let low = startTick;
  for (let day = Math.floor(startTick / TIME.TICKS_PER_DAY) + 1; day <= lastDay; day += 1) {
    let high = day * TIME.TICKS_PER_DAY;
    if (surfaceTemperature(high / TIME.TICKS_PER_DAY) < 0) {
      low = high;
      continue;
    }
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (surfaceTemperature(middle / TIME.TICKS_PER_DAY) < 0) low = middle;
      else high = middle;
    }
    return high;
  }
  return null;
}

function frostPreview(sim, seasonal, definition) {
  const maxDurationHours = seasonal.maxExpeditionHours ?? Infinity;
  if (!seasonal.longExpeditionsBlocked || !Number.isFinite(maxDurationHours)) return null;
  const thawTick = nextSurfaceThawTick(sim.tick);
  const thawDay = thawTick === null ? null : Math.floor(thawTick / TIME.TICKS_PER_DAY);
  return {
    reason: 'frost',
    maxDurationHours,
    durationFactor: seasonal.durationFactor ?? 1,
    thawTick,
    thawDay,
    daysRemaining: thawDay === null ? null : Math.max(0, thawDay - Math.floor(sim.tick / TIME.TICKS_PER_DAY)),
    nominalDurationHours: definition.durationHours,
    siteOutOfReach: definition.durationHours > maxDurationHours,
  };
}

// Le gel met-il ce site hors d'atteinte des sorties, et jusqu'à quand ? Le même
// calcul que l'aperçu d'expédition, pour les alertes qui conseillent un site.
// null si le gel ne limite pas les sorties. Lecture seule.
export function siteFrostOutlook(sim, siteId) {
  const definition = siteDefinition(siteId);
  if (!definition) return null;
  return frostPreview(sim, sim.m5?.calendar ?? {}, definition);
}

export function previewExpedition(sim, order) {
  sim.expeditions.prepared = null;
  const site = sim.surface.sites.find((candidate) => candidate.id === order.siteId && candidate.revealed);
  const definition = siteDefinition(order.siteId);
  const { ids: colonistIds, crew } = availableCrew(sim, order.colonistIds);
  if (!site || !definition || crew.length !== colonistIds.length
    || crew.length < EXPEDITION.MIN_CREW || crew.length > EXPEDITION.MAX_CREW) return { ok: false, error: 'expeditionUnavailable' };
  if (expeditionsBlocked(sim)) return { ok: false, error: 'expeditionWeatherBlocked' };
  const seasonal = sim.m5?.calendar ?? {};
  const frost = frostPreview(sim, seasonal, definition);
  const durationHours = definition.durationHours * (seasonal.durationFactor ?? 1);
  const durationTicks = Math.round(durationHours * TIME.TICKS_PER_HOUR);
  const protection = suitProtection(sim, { suit: true });
  const dosePerPerson = surfaceDoseRate(sim, definition.x) * durationHours * (1 - protection);
  const preview = {
    id: sim.expeditions.nextId,
    previewTick: sim.tick,
    season: seasonal.season ?? null,
    siteId: definition.id,
    colonistIds,
    durationTicks,
    durationHours,
    dosePerPerson,
    needsRisk: previewNeedsRisk(sim, crew, needsDurationTicks(sim, crew, definition, durationTicks)),
    loot: previewLoot(definition, siteLootFactor(site)),
    carryCapacity: colonistIds.length * EXPEDITION.CARRY_UNITS_PER_PERSON,
    encounterChance: definition.encounterChance,
    risks: ['radiation', definition.encounterChance >= 0.3 ? 'raiders' : 'injury'],
    ...(frost ? { frost } : {}),
  };
  if (frost?.siteOutOfReach) return { ok: false, error: 'expeditionSeasonBlocked', preview, frost };
  sim.expeditions.prepared = preview;
  return { ok: true, preview };
}

export function launchExpedition(sim, order) {
  const prepared = sim.expeditions.prepared;
  if (!prepared || prepared.id !== order.previewId) return { ok: false, error: 'expeditionPreviewRequired' };
  if (expeditionsBlocked(sim)) return { ok: false, error: 'expeditionWeatherBlocked' };
  const definition = siteDefinition(prepared.siteId);
  const seasonal = sim.m5?.calendar ?? {};
  if (seasonal.longExpeditionsBlocked && definition.durationHours > (seasonal.maxExpeditionHours ?? Infinity)) {
    return { ok: false, error: 'expeditionSeasonBlocked' };
  }
  const site = sim.surface.sites.find((candidate) => candidate.id === prepared.siteId && candidate.revealed);
  const { ids, crew } = availableCrew(sim, prepared.colonistIds);
  if (!definition || !site || ids.length !== prepared.colonistIds.length || crew.length !== ids.length) {
    return { ok: false, error: 'expeditionUnavailable' };
  }
  fillDepartureNeeds(sim, crew);
  const id = prepared.id;
  const expedition = {
    id,
    siteId: prepared.siteId,
    colonistIds: [...prepared.colonistIds],
    state: 'outbound',
    startTick: sim.tick,
    readyTick: sim.tick + prepared.durationTicks,
    dosePreview: prepared.dosePerPerson,
    startDoses: Object.fromEntries(crew.map((colonist) => [colonist.id, colonist.dose ?? 0])),
    siteResolved: false,
    resolvedTick: null,
    returnTick: null,
    loot: null,
    encounter: null,
    recruitPending: false,
    recruitId: null,
    crew: createSurfaceCrew(sim, {
      id: `expedition-${id}`,
      kind: 'expedition',
      colonistIds: prepared.colonistIds,
      destinationX: definition.x,
    }),
  };
  sim.expeditions.nextId += 1;
  sim.expeditions.prepared = null;
  sim.expeditions.active.push(expedition);
  sim.log('info', 'eventExpeditionDeparture', {
    site: prepared.siteId,
    siteId: prepared.siteId,
    count: prepared.colonistIds.length,
    dose: prepared.dosePerPerson,
  });
  recordExpeditionMessage(sim, expedition, 'radioExpeditionDeparture', {
    site: tr(`site_${prepared.siteId}`), dose: prepared.dosePerPerson,
  });
  return { ok: true, expedition };
}

function rollSiteResult(sim, expedition) {
  const definition = siteDefinition(expedition.siteId);
  const rng = expeditionRng(sim, expedition.id);
  const lootFactor = lawMultiplier(sim, 'expeditionFactor');
  const site = sim.surface.sites.find((candidate) => candidate.id === expedition.siteId);
  const depletion = siteLootFactor(site);
  const loot = {};
  for (const [resource, range] of Object.entries(definition.loot)) {
    loot[resource] = Math.max(1, Math.round(rng.int(range[0], range[1]) * lootFactor * depletion));
  }
  capLootToCapacity(loot, EXPEDITION.CARRY_UNITS_PER_PERSON * expedition.colonistIds.length);
  expedition.loot = loot;
  expedition.siteResolved = true;
  expedition.resolvedTick = sim.tick;
  if (!rng.chance(definition.encounterChance)) return null;
  return encounterFor(expedition.id, rng.int(0, 1) === 0 ? 'survivors' : 'raiders');
}

function beginReturn(expedition, sim) {
  if (expedition.state === 'returning' || expedition.state === 'returned') return;
  expedition.state = 'returning';
  expedition.returnTick = sim.tick;
  sendSurfaceCrewHome(expedition.crew);
  recordExpeditionMessage(sim, expedition, 'radioExpeditionReturn', {
    site: tr(`site_${expedition.siteId}`),
    loot: lootText(expedition.loot) || tr('none'),
  });
}

function resolveSite(sim, expedition) {
  recordExpeditionMessage(sim, expedition, 'radioExpeditionArrived', {
    site: tr(`site_${expedition.siteId}`), dose: averageCrewDose(sim, expedition),
  });
  const encounter = rollSiteResult(sim, expedition);
  if (!encounter) {
    beginReturn(expedition, sim);
    return;
  }
  expedition.encounter = encounter;
  expedition.state = 'encounter';
  sim.expeditions.pendingEncounter ??= encounter;
}

function tradeWithSurvivors(expedition, outcome) {
  const amount = expedition.loot.food ?? 0;
  if (amount <= 0) {
    outcome.code = 'tradeUnavailable';
    outcome.textKey = 'encounterOutcomeTradeUnavailable';
    return;
  }
  delete expedition.loot.food;
  expedition.loot.meds = (expedition.loot.meds ?? 0) + amount;
  Object.assign(outcome, { from: 'food', to: 'meds', amount });
}

function cedeLargestStack(expedition, outcome) {
  const entry = Object.entries(expedition.loot)
    .filter(([, amount]) => amount > 0)
    .sort(([resourceA, amountA], [resourceB, amountB]) => amountB - amountA || resourceA.localeCompare(resourceB))[0];
  if (!entry) {
    outcome.code = 'cedeUnavailable';
    outcome.textKey = 'encounterOutcomeCedeUnavailable';
    return;
  }
  const [resource, amount] = entry;
  delete expedition.loot[resource];
  Object.assign(outcome, { resource, amount });
}

function negotiateWithRaiders(expedition, outcome) {
  for (const [resource, amount] of Object.entries(expedition.loot)) {
    const kept = Math.floor(amount / 2);
    if (kept > 0) expedition.loot[resource] = kept;
    else delete expedition.loot[resource];
  }
  outcome.keptLoot = { ...expedition.loot };
}

function applyEncounterEffect(sim, expedition, choice) {
  const outcome = { code: choice.id, textKey: `encounterOutcome${choice.id[0].toUpperCase()}${choice.id.slice(1)}` };
  if (expedition.encounter.kind === 'survivors') {
    if (choice.id === 'recruit') {
      expedition.recruitPending = true;
      outcome.recruit = true;
    } else if (choice.id === 'trade') tradeWithSurvivors(expedition, outcome);
  } else if (choice.id === 'flee') {
    outcome.abandonedLoot = { ...expedition.loot };
    expedition.loot = {};
  } else if (choice.id === 'cede') cedeLargestStack(expedition, outcome);
  else if (choice.id === 'negotiate') negotiateWithRaiders(expedition, outcome);
  return outcome;
}

export function chooseEncounter(sim, order) {
  const expedition = sim.expeditions.active.find((candidate) => candidate.id === order.expeditionId);
  const encounter = expedition?.encounter;
  if (!encounter || expedition.state !== 'encounter' || encounter.choiceIndex !== null
    || sim.expeditions.pendingEncounter?.expeditionId !== expedition.id
    || !Number.isInteger(order.choiceIndex) || order.choiceIndex < 0 || order.choiceIndex >= encounter.choices.length) {
    return { ok: false, error: 'encounterUnavailable' };
  }
  const choice = encounter.choices[order.choiceIndex];
  encounter.choiceIndex = order.choiceIndex;
  encounter.choiceId = choice.id;
  encounter.outcome = applyEncounterEffect(sim, expedition, choice);
  sim.log(encounter.kind === 'raiders' ? 'warning' : 'info', 'eventEncounter', {
    site: expedition.siteId,
    siteId: expedition.siteId,
    expeditionId: expedition.id,
    choice: choice.id,
    outcome: encounter.outcome.code,
    summary: tr(encounter.outcome.textKey, encounter.outcome),
  });
  beginReturn(expedition, sim);
  const next = sim.expeditions.active.filter((candidate) => candidate.state === 'encounter'
    && candidate.encounter?.choiceIndex === null).sort((a, b) => a.id - b.id)[0];
  sim.expeditions.pendingEncounter = next?.encounter ?? null;
  return { ok: true, choiceIndex: order.choiceIndex, choice, outcome: encounter.outcome, expedition };
}

function averageCrewDose(sim, expedition) {
  if (expedition.colonistIds.length === 0) return 0;
  let total = 0;
  for (const colonistId of expedition.colonistIds) {
    const colonist = sim.colonists.find((candidate) => candidate.id === colonistId);
    const currentDose = colonist?.dose ?? expedition.startDoses[colonistId] ?? 0;
    total += Math.max(0, currentDose - (expedition.startDoses[colonistId] ?? 0));
  }
  return total / expedition.colonistIds.length;
}

function depositLoot(sim, expedition) {
  if (expedition.lootDeposited) return;
  const hatch = surfaceHatch(sim);
  let stock = reserveStock(sim, hatch.x, hatch.y);
  if (!stock) {
    stock = createStock(`expedition-return-${expedition.id}`, hatch.x, hatch.y);
    sim.stocks.push(stock);
  }
  for (const [resource, amount] of Object.entries(expedition.loot ?? {})) {
    addToStock(stock, resource, amount);
    if (amount > 0) recordReserveShift(sim, resource, amount);
  }
  expedition.lootDeposited = true;
  expedition.depositedStockId = stock.id;
}

function addRecruit(sim, expedition, averageDose) {
  if (!expedition.recruitPending || expedition.recruitId !== null) return;
  const hatch = surfaceHatch(sim);
  const room = hatch.excavation;
  const x = room?.x ?? hatch.x;
  const y = room ? room.y + room.h - 1 : hatch.y + 1;
  const id = Math.max(sim.nextColonistId ?? 0, ...sim.colonists.map((colonist) => colonist.id + 1));
  const template = createInitialColonists({ x, y })[id % 12];
  const recruit = {
    ...template,
    ...createPersonProfile(sim.seed, id),
    id,
    name: template.name,
    bedIndex: id,
    bedX: x,
    bedY: y,
    restX: x,
    restY: y,
    x,
    y,
    prevX: x,
    prevY: y,
    direction: id % 2 === 0 ? 1 : -1,
    animation: id * 0.7,
  };
  sim.nextColonistId = id + 1;
  sim.colonists.push(recruit);
  addDose(sim, recruit, averageDose, 'surface');
  expedition.recruitId = id;
}

function hasLivingCrew(sim, expedition) {
  return expedition.crew.colonistIds.some((id) => {
    const colonist = sim.colonists.find((candidate) => candidate.id === id);
    return colonist && colonist.health > 0 && !colonist.dead;
  });
}

function abortExpedition(sim, expedition) {
  if (expedition.state === 'lost' || expedition.state === 'returned') return;
  releaseSurfaceCrew(sim, expedition.crew);
  expedition.state = 'lost';
  expedition.completedTick = sim.tick;
  expedition.loot = null;
  expedition.recruitPending = false;
  if (sim.expeditions.pendingEncounter?.expeditionId === expedition.id) {
    const next = sim.expeditions.active.filter((candidate) => candidate.state === 'encounter'
      && candidate.encounter?.choiceIndex === null).sort((a, b) => a.id - b.id)[0];
    sim.expeditions.pendingEncounter = next?.encounter ?? null;
  }
  sim.expeditions.history.push({ id: expedition.id, siteId: expedition.siteId, completedTick: sim.tick, state: 'lost', loot: null });
  sim.log('error', 'eventExpeditionLost', { site: expedition.siteId, siteId: expedition.siteId });
}

function completeExpedition(sim, expedition) {
  if (expedition.state === 'returned') return;
  if (!hasLivingCrew(sim, expedition)) {
    abortExpedition(sim, expedition);
    return;
  }
  const averageDose = averageCrewDose(sim, expedition);
  depositLoot(sim, expedition);
  addRecruit(sim, expedition, averageDose);
  releaseSurfaceCrew(sim, expedition.crew);
  expedition.state = 'returned';
  expedition.completedTick = sim.tick;
  expedition.averageDose = averageDose;
  sim.expeditions.completed += 1;
  const site = sim.surface.sites.find((candidate) => candidate.id === expedition.siteId);
  if (site && expedition.siteResolved) depleteSite(sim, site);
  const record = {
    id: expedition.id,
    siteId: expedition.siteId,
    completedTick: sim.tick,
    loot: { ...expedition.loot },
    averageDose,
    encounter: expedition.encounter ? {
      kind: expedition.encounter.kind,
      choiceId: expedition.encounter.choiceId,
      outcome: expedition.encounter.outcome,
    } : null,
    recruitId: expedition.recruitId,
  };
  sim.expeditions.history.push(record);
  sim.log('info', 'eventExpeditionReturn', {
    site: expedition.siteId,
    siteId: expedition.siteId,
    expeditionId: expedition.id,
    loot: { ...expedition.loot },
    averageDose,
    dose: roundedDose(averageDose),
    summary: returnSummary(expedition.loot, averageDose),
  });
  revealSurfaceSites(sim);
}

export function updateExpeditions(sim) {
  initializeExpeditions(sim);
  if (sim.tick > 0 && sim.tick % TIME.TICKS_PER_DAY === 0) regenerateSurfaceSites(sim);
  for (const expedition of [...sim.expeditions.active]) {
    if (expedition.state === 'returned' || expedition.state === 'lost') continue;
    if (!hasLivingCrew(sim, expedition)) {
      abortExpedition(sim, expedition);
      continue;
    }
    updateSurfaceCrew(sim, expedition.crew);
    if (expedition.crew.childRecall && expedition.state !== 'returning') {
      beginReturn(expedition, sim);
      if (sim.expeditions.pendingEncounter?.expeditionId === expedition.id) sim.expeditions.pendingEncounter = null;
    }
    if (expedition.state === 'returning' && expedition.crew.phase === 'inside') {
      completeExpedition(sim, expedition);
      continue;
    }
    if (expedition.crew.phase !== 'surface' || expedition.siteResolved || expedition.state === 'returning') continue;
    if (expedition.state === 'outbound') expedition.state = 'searching';
    if (sim.tick < expedition.readyTick) continue;
    resolveSite(sim, expedition);
  }
  sim.expeditions.active = sim.expeditions.active.filter((expedition) => expedition.state !== 'returned' && expedition.state !== 'lost');
  revealSurfaceSites(sim);
}

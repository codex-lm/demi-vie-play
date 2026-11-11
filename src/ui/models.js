import { ALERTS, NEEDS, POWER, TIME, WATER, WORK } from '../data/balance.js';
import { productionScale, roomDefinition, roomJobCount } from '../data/rooms.js';
import { EXODUS, RADIATION } from '../data/surface.js';
import { fittingError } from '../sim/rooms.js';
import { excavationOccupants } from '../sim/networks.js';
import { resourceTotals } from '../sim/resources.js';
import { trappedSurvivors } from '../sim/collapseRescue.js';
import { bodyPendingWarning, personFloodRedHeld, roomFloodRedHeld } from '../sim/alerts.js';
import { kitCraftShortfall, kitStatus } from '../sim/exodus.js';
import { waterChainModel } from '../sim/waterChain.js';
import { tr } from '../data/strings.fr.js';
import { formatNumber } from './tooltips.js';

export const RESERVE_KEYS = Object.freeze(['air', 'water', 'filters', 'food', 'fuel']);
export const RESERVE_OVERLAYS = Object.freeze({ air: 'air', water: 'water', filters: 'water', fuel: 'power', food: null });

// Les filtres prennent les couleurs de leurs alertes : rouge sans filtre quand une
// station de filtration en a besoin ou sous une demi-journée de filtration (le
// seuil de l'alerte rouge), jaune sous le seuil de l'alerte jaune (le temps de
// creuser et de fabriquer).
export function filterSeverity(days, count, needed = true) {
  if (Number.isFinite(count) && count <= ALERTS.STOCK_EPSILON) return needed ? 'red' : 'neutral';
  if (days === null || days === undefined || !Number.isFinite(Number(days))) return 'neutral';
  if (Number(days) <= ALERTS.RED_FORECAST_DAYS) return 'red';
  return Number(days) <= ALERTS.FILTER_YELLOW_FORECAST_DAYS ? 'yellow' : 'green';
}

// Couleur du compteur d'eau propre : vert au-delà de 10 jours, jaune au-delà de
// 3, rouge sinon ; sans fin prévue, vert tant que la colonie boit une réserve.
export function waterSeverity(days, consuming, stock) {
  if (days === null || days === undefined) return consuming && stock > 0 ? 'green' : 'neutral';
  return days > 10 ? 'green' : days > 3 ? 'yellow' : 'red';
}

// Au-delà d'un an, un rythme mesuré sur deux jours ne dit plus rien de précis
// (saisons, dégel, nouvelles stations) : le compteur affiche « > 1 an » plutôt
// qu'un nombre à quatre chiffres qui saute dès que le solde frôle zéro.
export const RESERVE_HORIZON_DAYS = 365;

export function reserveDaysLabel(days) {
  const value = measuredDays(days);
  return value !== null && value > RESERVE_HORIZON_DAYS ? tr('reserveBeyondYear') : formatReserveDays(value);
}

// Une station de filtration aménagée et en marche, comme pour l'alerte de filtres.
function filtering(sim) {
  return (sim.excavations ?? []).some((excavation) => excavation.roomType === 'filterPlant'
    && excavation.state === 'fitted' && !excavation.disabled);
}

export const NEED_KEYS = Object.freeze([
  'hunger', 'thirst', 'sleep', 'warmth', 'air', 'light', 'social', 'intimacy', 'purpose',
]);

const ACCUMULATING_NEEDS = new Set(['hunger', 'thirst', 'sleep']);
const finiteOrNull = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function fittingModel(sim, excavation, roomType) {
  const definition = roomDefinition(roomType);
  if (!excavation) return { ok: false, error: 'noTarget', definition, missing: [] };
  if (!definition) return { ok: false, error: 'invalidPlacement', definition, missing: [] };
  let error = fittingError(sim, excavation, roomType);
  if (error === 'invalidPlacement' && ['planned', 'digging'].includes(excavation.state)) error = 'roomNotDug';
  if (error === 'invalidSize') {
    const kinds = definition.kinds ?? ['room'];
    error = excavation.kind === 'gallery' && roomType === 'storage'
      && excavation.w >= definition.minW && excavation.h >= definition.minH ? 'galleryStorageTooWide'
      : kinds.includes(excavation.kind) ? 'roomSizeRequired' : 'roomKindInvalid';
  }
  if (error === 'overlap') error = excavation.roomType ? 'roomAlreadyFitted' : 'fitAlreadyQueued';
  if (!error && (sim.jobs ?? []).some((job) => job.type === 'fit' && job.excavationId === excavation.id && job.status !== 'done')) error = 'fitAlreadyQueued';
  const totals = resourceTotals(sim);
  const missing = Object.entries(definition.cost).map(([key, required]) => ({
    key, required, available: totals[key] ?? 0,
  })).filter((entry) => entry.available < entry.required);
  if (!error && missing.length) error = 'noResources';
  return { ok: !error, error, definition, missing };
}

export function effectiveRoomType(excavation) {
  if (excavation?.roomType) return excavation.roomType;
  if (excavation?.label === 'shelterDorm') return 'dorm';
  if (excavation?.label === 'shelterPantry') return 'pantry';
  if (excavation?.label === 'shelterGenerator') return 'diesel';
  return null;
}

export function excavationDisplayName(excavations = [], target) {
  const excavation = typeof target === 'object' && target !== null
    ? target : excavations.find((candidate) => candidate.id === target);
  if (!excavation) return tr('roomNumber', { id: Number(target) + 1 });
  const originalId = excavation.originalExcavationId ?? excavation.collapseSourceId;
  if (excavation.state === 'collapsed' && originalId != null && originalId !== excavation.id) {
    const original = excavations.find((candidate) => candidate.id === originalId)
      ?? { ...excavation, id: originalId };
    return tr('collapseRubbleName', { name: excavationBaseName(excavations, original) });
  }
  return excavationBaseName(excavations, excavation);
}

function excavationBaseName(excavations, excavation) {
  const roomType = effectiveRoomType(excavation);
  if (!roomType) return excavation.label ? tr(excavation.label) : `${tr(excavation.kind)} ${excavation.id + 1}`;
  const peers = excavations.filter((candidate) => effectiveRoomType(candidate) === roomType)
    .sort((a, b) => a.id - b.id);
  const base = tr(roomType === 'diesel' ? 'generatorRoom' : roomType);
  if (peers.length < 2) return base;
  const index = peers.findIndex((candidate) => candidate.id === excavation.id);
  return tr('roomTypeNumber', { name: base, id: index + 1 });
}

export function roomProductionModel(excavation) {
  const roomType = effectiveRoomType(excavation);
  const definition = roomDefinition(roomType);
  if (!definition) return { roomType, definition: null, entries: [] };
  // Les cultures rendent par tranche de taille minimale : la fiche d'une salle
  // réelle suit sa largeur, celle du menu décrit la taille minimale.
  const scale = productionScale(definition, excavation);
  const entries = [];
  const add = (code, value, extra = {}) => {
    if (Number.isFinite(value) && value !== 0) entries.push({ code, values: { value, ...extra } });
  };
  add('foodPerDay', definition.foodPerDay * scale);
  if (definition.inputResource) add('resourceConsumptionPerDay', definition.inputPerDay * scale, { resource: definition.inputResource });
  if (definition.outputResource) add('waterPerDay', definition.waterPerDay * scale, { resource: definition.outputResource });
  else add('waterConsumptionPerDay', definition.waterPerDay * scale);
  add('mealsPerDay', definition.mealsPerDay);
  add('greyWaterPerPersonDay', definition.greyWaterPerPersonDay);
  if (definition.generationKw > 0 || definition.generationPerWorkerKw > 0) {
    entries.push({ code: 'generationKw', values: { value: excavation.powerGenerationKw ?? 0 } });
  }
  add('generationPerWorkerKw', definition.generationPerWorkerKw);
  add('pumpUnitsPerHour', definition.pumpUnitsPerHour);
  add('exchangePerHour', definition.exchangePerHour);
  add('scrubberCo2PerHour', definition.scrubberCo2PerHour);
  add('algaeO2PerHour', definition.algaeO2PerHour);
  add('bedsPerSixMeters', definition.bedsPerSixMeters);
  add('roomJobs', roomJobCount(definition, excavation));
  add('storageCapacity', definition.capacity);
  add('batteryCapacity', definition.capacityKwh);
  if (definition.airHelp) entries.unshift({ code: definition.airHelp, values: {} });
  if (definition.heatHelp) entries.unshift({ code: definition.heatHelp, values: {} });
  return {
    roomType, definition, entries,
    status: excavation.production?.status ?? null,
    produced: finiteOrNull(excavation.production?.produced),
  };
}

export function roomEnvironmentModel(sim, excavation) {
  let floodRatio = finiteOrNull(excavation?.floodRatio);
  if (floodRatio === null && excavation && sim?.world?.water) {
    let water = 0;
    for (const index of excavation.dugCells ?? []) water += sim.world.water[index] ?? 0;
    const capacity = Math.max(1, (excavation.dugCells?.length ?? 0) * WATER.MAX_PER_CELL);
    floodRatio = water / capacity;
  }
  return {
    temperature: finiteOrNull(excavation?.temperature),
    o2: finiteOrNull(excavation?.o2),
    co2: finiteOrNull(excavation?.co2),
    floodRatio: floodRatio ?? 0,
    occupants: excavation ? excavationOccupants(sim, excavation.id).length : 0,
    powered: Boolean(excavation?.powered),
    powerShed: Boolean(excavation?.powerShed),
    disabled: Boolean(excavation?.disabled),
    priority: POWER.PRIORITIES.includes(excavation?.powerPriority)
      ? excavation.powerPriority : roomDefinition(effectiveRoomType(excavation))?.category ?? 'other',
  };
}

export function colonistModel(colonist) {
  const needs = NEED_KEYS.map((key) => {
    const rawValue = finiteOrNull(colonist?.[key]) ?? 0;
    const value = ACCUMULATING_NEEDS.has(key) ? 100 - rawValue : rawValue;
    const severity = value <= NEEDS.LOW_NEED_THRESHOLD ? 'red'
      : value <= 100 - NEEDS.LOW_NEED_THRESHOLD ? 'yellow' : 'green';
    return { key, value, severity };
  });
  const inactive = (colonist?.jobId === null || colonist?.jobId === undefined)
    && ['idle', 'sit', 'socialize'].includes(colonist?.task);
  return {
    needs,
    health: finiteOrNull(colonist?.health) ?? 0,
    morale: finiteOrNull(colonist?.morale) ?? 0,
    idleReason: colonist?.idleReason ?? (inactive ? 'nothingToDo' : null),
  };
}

function dieselConsumers(sim) {
  return (sim.excavations ?? []).filter((excavation) => effectiveRoomType(excavation) === 'diesel'
    && !excavation.disabled && (excavation.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO
    && ['dug', 'fitted'].includes(excavation.state)).length;
}

export function resourceStatusModel(sim, totals = resourceTotals(sim)) {
  const alive = (sim.colonists ?? []).filter((colonist) => (colonist.health ?? 100) > 0);
  const population = alive.length;
  const healthy = alive.filter((colonist) => (colonist.dose ?? 0) <= 250).length;
  const foodPerDay = population * WORK.FOOD_PER_MEAL;
  const waterPerDay = population * WATER.CLEAN_WATER_PER_DRINK;
  const fuelPerDay = finiteOrNull(sim.power?.fuelPerDay)
    ?? dieselConsumers(sim) * POWER.DIESEL_IDLE_FUEL_FACTOR * TIME.TICKS_PER_DAY / (POWER.DIESEL_FUEL_HOURS * TIME.TICKS_PER_HOUR);
  const foodStock = (totals.food ?? 0) + (totals.meals ?? 0);
  const waterStock = totals.waterClean ?? totals.water ?? 0;
  const fuelStock = totals.fuel ?? 0;
  const days = (stock, rate) => rate > 0 ? stock / rate : stock > 0 ? Infinity : 0;
  const generatedKw = finiteOrNull(sim.power?.generatedKw ?? sim.electricity?.generatedKw);
  const consumedKw = finiteOrNull(sim.power?.consumedKw ?? sim.electricity?.consumedKw);
  const demandKw = finiteOrNull(sim.power?.demandKw ?? sim.electricity?.demandKw);
  const balance = finiteOrNull(sim.power?.balance ?? sim.electricity?.balance)
    ?? (generatedKw === null || consumedKw === null ? null : generatedKw - consumedKw);
  return {
    population,
    healthy,
    stocks: { food: foodStock, water: waterStock, fuel: fuelStock },
    days: {
      food: days(foodStock, foodPerDay),
      water: days(waterStock, waterPerDay),
      fuel: days(fuelStock, fuelPerDay),
    },
    power: {
      balance,
      generatedKw,
      consumedKw,
      demandKw,
      storedKwh: finiteOrNull(sim.power?.storedKwh),
      capacityKwh: finiteOrNull(sim.power?.capacityKwh),
      deficit: Boolean(sim.power?.deficit),
    },
  };
}

function measuredDays(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function wholeDays(value) {
  const days = measuredDays(value);
  return days === null ? null : Math.floor(days);
}

// `water` : le modèle de la chaîne de l'eau s'il est déjà calculé. Dans une
// partie qui tient l'historique des réserves, l'eau suit le compteur d'eau
// propre au rythme réel, le même que le bandeau (le menu de construction
// l'affiche aussi) ; sinon l'ancienne estimation sur 24 h.
export function reserveStatusModel(sim, totals = resourceTotals(sim), water = null) {
  const fallback = resourceStatusModel(sim, totals);
  const chain = water ?? (Array.isArray(sim.reserveHistory) && sim.reserveHistory.length > 0 ? waterChainModel(sim) : null);
  const model = {};
  for (const key of RESERVE_KEYS) {
    const hasContract = Boolean(sim.reserves && Object.prototype.hasOwnProperty.call(sim.reserves, key));
    const contractEntry = hasContract ? sim.reserves[key] : null;
    const contractDays = contractEntry && typeof contractEntry === 'object' ? contractEntry.days : contractEntry;
    if (key === 'water' && chain) {
      const days = measuredDays(chain.cleanReserveDays);
      model.water = {
        key,
        days: wholeDays(days),
        beyondHorizon: days !== null && days > RESERVE_HORIZON_DAYS,
        severity: waterSeverity(days, chain.cleanConsumptionPerDay > 0 || chain.drinkingPerDay > 0, chain.drinkingWater),
        overlay: RESERVE_OVERLAYS.water,
      };
      continue;
    }
    const measured = measuredDays(hasContract ? contractDays : key === 'air' ? null : fallback.days[key]);
    const filterCount = key === 'filters' ? finiteOrNull(contractEntry?.amount) ?? totals.filters ?? 0 : null;
    model[key] = {
      key,
      days: wholeDays(measured),
      severity: key === 'filters' ? filterSeverity(measured, filterCount, filtering(sim))
        : measured === null ? 'neutral' : measured > 10 ? 'green' : measured > 3 ? 'yellow' : 'red',
      overlay: RESERVE_OVERLAYS[key],
    };
  }
  return model;
}

export function formatReserveDays(reserve) {
  if (reserve && typeof reserve === 'object' && reserve.beyondHorizon) return tr('reserveBeyondYear');
  const days = wholeDays(reserve && typeof reserve === 'object' ? reserve.days : reserve);
  return days === null ? tr('unknown') : tr('daysShort', { value: formatNumber(days, true) });
}

const ALERT_SUFFIXES = Object.freeze({ air: 'Air', water: 'Water', food: 'Food', fuel: 'Fuel', cold: 'Cold', heat: 'Heat', flood: 'Flood', morale: 'Morale', radiation: 'Radiation', rescue: 'Rescue', dirtyWater: 'DirtyWater', contagion: 'Contagion', bodyPending: 'BodyPending', unburiedBody: 'UnburiedBody' });

function activeAlertCodes(sim, excavationId) {
  const excavation = excavationId === null ? null : sim.excavations?.find((item) => item.id === excavationId);
  const levels = excavationId === null ? sim.alertLevels : excavation?.alertLevels;
  if (!levels || Object.keys(levels).length === 0) return null;
  const codes = new Set();
  for (const [category, suffix] of Object.entries(ALERT_SUFFIXES)) {
    if (levels[category] === 'warning') codes.add(`alert${suffix}Yellow`);
    if (levels[category] === 'danger') codes.add(`alert${suffix}Red`);
  }
  // A sudden immersion is a person-level red: it stays active while the trapped
  // colonist lives, even if their room's own flood alert is still yellow.
  const suddenRoomIds = new Set((sim.colonists ?? [])
    .filter((person) => person.health > 0 && !person.dead && person.suddenImmersion)
    .map((person) => person.suddenImmersion.roomId));
  if (excavationId === null ? suddenRoomIds.size > 0 : suddenRoomIds.has(excavationId)) {
    codes.add('alertSuddenImmersionRed');
  }
  return codes;
}

function alertCategory(code) {
  return Object.keys(ALERT_SUFFIXES).find((category) => code.startsWith(`alert${ALERT_SUFFIXES[category]}`)) ?? null;
}

export function latestAlertModel(sim, excavationId = null) {
  const newer = (entry, current) => !current
    || (entry.tick ?? 0) > (current.entry.tick ?? 0)
    || ((entry.tick ?? 0) === (current.entry.tick ?? 0) && (entry.id ?? 0) > (current.entry.id ?? 0));
  let latestRed = null;
  let latestHeldRed = null;
  let latestYellow = null;
  // A flood red held through its dry hour that has gone quiet (nobody exposed
  // for a confirmation window since its last x1) ranks below every other red,
  // but above the yellows.
  const heldFloodRed = (entry) => {
    if (entry.code !== 'alertFloodRed') return false;
    if (entry.params?.excavationId === null && Number.isInteger(entry.params?.colonistId)) {
      return personFloodRedHeld(sim.colonists?.find((person) => person.id === entry.params.colonistId));
    }
    const target = entry.params?.excavationId ?? entry.params?.id;
    return roomFloodRedHeld(sim.excavations?.find((room) => room.id === target));
  };
  // Keep rescues after journal eviction, but let a newer red alert take priority.
  // Count only survivors still trapped, without re-emitting history.
  for (const excavation of sim.excavations ?? []) {
    if (excavationId !== null && excavation.id !== excavationId) continue;
    const entry = excavation.rescueAlertEntry;
    if (!entry) continue;
    const count = trappedSurvivors(sim, excavation).length;
    if (count === 0) continue;
    if (newer(entry, latestRed)) latestRed = { entry: { ...entry, params: { ...entry.params, count } }, severity: 'red' };
  }
  const activeCodes = activeAlertCodes(sim, excavationId);
  if (activeCodes?.size === 0) return latestRed;
  for (let index = (sim.journal ?? []).length - 1; index >= 0; index -= 1) {
    const entry = sim.journal[index];
    if (!/^alert[A-Z]/.test(entry.code ?? '') || entry.code === 'alertRescueRed') continue;
    if (activeCodes && !activeCodes.has(entry.code)) continue;
    const target = entry.params?.excavationId ?? entry.params?.id;
    if (excavationId !== null && target !== excavationId) continue;
    if (excavationId === null && activeCodes && target !== undefined) {
      const category = alertCategory(entry.code);
      if (entry.code === 'alertSuddenImmersionRed') {
        const person = sim.colonists?.find((candidate) => candidate.id === entry.params?.colonistId);
        if (!person || person.dead || person.health <= 0 || !person.suddenImmersion) continue;
      } else if ((category === 'flood' || category === 'cold' || category === 'heat') && entry.params?.excavationId === null
        && Number.isInteger(entry.params?.colonistId)) {
        const person = sim.colonists?.find((candidate) => candidate.id === entry.params.colonistId);
        const exposure = category === 'flood' ? person?.floodExposure : person?.thermalExposure?.[category];
        if (!person || person.dead || person.health <= 0 || exposure?.level !== entry.level) continue;
      } else {
        const room = sim.excavations?.find((item) => item.id === target);
        if (!room || !category || room.alertLevels?.[category] !== entry.level) continue;
      }
    }
    if (entry.level === 'warning') {
      if (newer(entry, latestYellow)) latestYellow = { entry, severity: 'yellow' };
    } else if (heldFloodRed(entry)) {
      if (newer(entry, latestHeldRed)) latestHeldRed = { entry, severity: 'red' };
    } else if (newer(entry, latestRed)) latestRed = { entry, severity: 'red' };
  }
  return liveAlert(sim, latestRed ?? latestHeldRed ?? latestYellow);
}

// The journal line of a waiting body keeps the hours left when it opened; the
// banner counts them down.
function liveAlert(sim, alert) {
  if (alert?.entry.code !== 'alertBodyPendingYellow') return alert;
  const pending = bodyPendingWarning(sim);
  if (!pending) return alert;
  return { ...alert, entry: { ...alert.entry, params: { ...alert.entry.params, hours: pending.hours } } };
}

export function calendarDate(tick) {
  const safeTick = Number.isFinite(Number(tick)) ? Math.max(0, Number(tick)) : 0;
  return {
    year: Math.floor(safeTick / (TIME.TICKS_PER_DAY * 360)) + 1,
    day: Math.floor(safeTick / TIME.TICKS_PER_DAY) % 360 + 1,
  };
}

export function surfaceHudModel(sim) {
  const radiation = sim.radiation ?? {};
  const safeTick = finiteOrNull(radiation.safeTick)
    ?? (finiteOrNull(radiation.safeDay) === null ? null : Number(radiation.safeDay) * TIME.TICKS_PER_DAY);
  return {
    dose: finiteOrNull(radiation.surfaceDose ?? radiation.current ?? sim.surface?.dose),
    selectedX: radiation.selectedX ?? sim.surface?.hatch?.x ?? 48,
    threshold: finiteOrNull(radiation.safeThreshold) ?? RADIATION.SAFE_RATE,
    safeTick,
    forecastDate: safeTick === null ? null : calendarDate(safeTick),
    weather: sim.weather?.current ?? 'clear',
  };
}

export function radiationDoseModel(colonist, tick = 0) {
  const dose = finiteOrNull(colonist?.dose) ?? 0;
  const cutoff = tick - RADIATION.ACUTE_WINDOW_TICKS;
  const recentDose = (colonist?.doseHistory ?? []).filter((entry) => entry.tick >= cutoff)
    .reduce((total, entry) => total + (finiteOrNull(entry.amount) ?? 0), 0);
  const acute = recentDose >= RADIATION.ACUTE_MSV || colonist?.radiationStatus === 'acute';
  const high = dose > RADIATION.HEALTHY_MAX_MSV;
  return {
    dose,
    recentDose,
    healthy: !high,
    status: acute ? 'acute' : high ? 'high' : 'healthy',
    labelKey: acute ? 'radiationAcute' : high ? 'radiationHigh' : 'radiationHealthy',
    effectKeys: [acute ? 'doseAcuteEffect' : high ? 'doseHighEffect' : 'doseHealthyEffect'],
  };
}

export function expeditionLootModel(loot = {}) {
  return Object.entries(loot).map(([resource, range]) => {
    const values = Array.isArray(range) ? range : [range, range];
    return {
      resource,
      min: finiteOrNull(values[0]) ?? 0,
      max: finiteOrNull(values[1] ?? values[0]) ?? 0,
    };
  });
}

export function exodusKitModel(sim, excavation = null) {
  const status = sim.exodus ? kitStatus(sim) : {
    contents: Object.fromEntries(Object.entries(EXODUS.KIT_REQUIREMENTS).map(([resource, required]) => [resource, {
      amount: 0, required, complete: false,
    }])),
    complete: false,
    scoreValue: 0,
    craft: null,
  };
  const totals = resourceTotals(sim);
  // Price only what the kit still lacks, exactly as the kitCraft order does:
  // a legacy kit with 360 rations needs 1 080 more, not a second full kit.
  const shortfall = kitCraftShortfall(sim);
  const missing = Object.entries(shortfall.requirements).map(([resource, required]) => ({
    resource, required, available: totals[resource] ?? 0, sufficient: !(shortfall.missing[resource] > 0),
  }));
  const craft = status.craft;
  const progress = craft ? Math.min(1, craft.work / Math.max(1, craft.required)) : 0;
  return {
    ...status,
    missing,
    progress,
    canCraft: Boolean(excavation && excavation.roomType === 'exodusDepot' && excavation.state === 'fitted'
      && !status.complete && !craft && Object.keys(shortfall.missing).length === 0),
  };
}

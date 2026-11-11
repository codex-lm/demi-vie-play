import { HEAT, TIME, WATER, WORLD } from '../data/balance.js';
import { MATERIAL, materialAt } from '../data/materials.js';
import { SEASON_DEFINITIONS, SEASON_IDS, SEASONS } from '../data/seasons.js';
import { surfaceTemperature } from './climate.js';
import { EXODUS } from '../data/surface.js';
import { thawAtTick, thawDeltaAtTick, upcomingThaw } from './thaw.js';
export { upcomingThaw } from './thaw.js';
import { activeExcavation } from './networks.js';
import { shallowWaterContaminated, WATER_QUALITY } from './water.js';
import { addToStock, createStock } from './resources.js';
import { recordSeasonNarrative } from './journalNarrative.js';
import { aquiferMaterial, clayProtected, waterTableDepth } from './groundwater.js';
import { blackRainChance } from './weather.js';

const THAW_RECOVERY_TICKS = SEASONS.THAW_RECOVERY_DAYS * TIME.TICKS_PER_DAY;

function safeTick(tick) {
  return Number.isFinite(tick) ? Math.max(0, tick) : 0;
}

export function seasonAtTick(tick) {
  const day = Math.floor(safeTick(tick) / TIME.TICKS_PER_DAY);
  return SEASON_IDS[Math.floor((day % TIME.DAYS_PER_YEAR) / TIME.DAYS_PER_SEASON)];
}

export function seasonalTemperatureAnomaly(tick) {
  const day = safeTick(tick) / TIME.TICKS_PER_DAY;
  const recovery = Math.min(1, day / HEAT.NUCLEAR_WINTER_DAYS);
  const annualMean = HEAT.SURFACE_START + (HEAT.SURFACE_FINAL - HEAT.SURFACE_START) * recovery;
  return surfaceTemperature(day) - annualMean;
}

function dateAtTick(tick) {
  const safe = safeTick(tick);
  const day = Math.floor(safe / TIME.TICKS_PER_DAY);
  const dayOfYear = day % TIME.DAYS_PER_YEAR;
  const season = seasonAtTick(safe);
  return {
    year: Math.floor(day / TIME.DAYS_PER_YEAR) + 1,
    day,
    dayOfYear: dayOfYear + 1,
    season,
    seasonIndex: SEASON_DEFINITIONS[season].index,
    seasonDay: dayOfYear % TIME.DAYS_PER_SEASON + 1,
  };
}

function expeditionState(definition, tick) {
  if (surfaceTemperature(tick / TIME.TICKS_PER_DAY) < 0) return {
    doseFactor: SEASONS.WINTER_DOSE_FACTOR,
    durationFactor: SEASONS.WINTER_DURATION_FACTOR,
    longExpeditionsBlocked: true,
    maxExpeditionHours: SEASONS.WINTER_MAX_EXPEDITION_HOURS,
  };
  return {
    doseFactor: definition.doseFactor,
    durationFactor: definition.durationFactor,
    longExpeditionsBlocked: definition.longExpeditionsBlocked,
    maxExpeditionHours: definition.maxExpeditionHours,
  };
}

function harvestInfrastructure(sim) {
  const collectors = (sim.surface?.structures ?? []).filter((structure) => structure.type === 'rainCollector'
    && structure.state === 'built').length;
  const greenhouses = sim.excavations.filter((excavation) => excavation.roomType === 'hydroponics'
    && excavation.state === 'fitted' && !excavation.disabled
    && excavation.powered && !excavation.powerShed && !excavation.machineBroken && !excavation.disabledByFlood).length;
  return { collectors, greenhouses };
}

function harvestState(season, infrastructure, tick) {
  const available = season.harvestSeason && infrastructure.collectors > 0 && infrastructure.greenhouses > 0
    && surfaceTemperature(tick / TIME.TICKS_PER_DAY) > EXODUS.HARVEST_MIN_TEMPERATURE;
  return {
    season: season.harvestSeason,
    available,
    collectors: infrastructure.collectors,
    greenhouses: infrastructure.greenhouses,
  };
}

function blackRainState(sim, season, tick = sim.tick) {
  return {
    season: season.id === 'autumn',
    possible: season.id === 'autumn' && blackRainChance(tick) > 0,
    active: sim.weather?.current === 'blackRain',
    riskFactor: season.blackRainFactor * Math.max(0, 1 - tick / (HEAT.NUCLEAR_WINTER_DAYS * TIME.TICKS_PER_DAY)),
  };
}

function thawForecastEvent(schedule, type, phase) {
  return {
    id: `thaw-${schedule.riseStartTick}`,
    type,
    phase,
    tick: type === 'thawWarning' ? schedule.warningTick
      : type === 'thawEnd' ? schedule.riseEndTick : schedule.riseStartTick,
    startTick: schedule.riseStartTick,
    endTick: schedule.riseEndTick,
    year: schedule.year,
    riseMeters: SEASONS.THAW_RISE_METERS,
    durationDays: SEASONS.THAW_DURATION_DAYS,
  };
}

export function calendarForecast(sim, days = SEASONS.FORECAST_DAYS) {
  const startTick = safeTick(sim?.tick);
  const firstDay = Math.floor(startTick / TIME.TICKS_PER_DAY);
  const count = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : SEASONS.FORECAST_DAYS;
  const infrastructure = harvestInfrastructure(sim);
  const forecast = [];
  for (let offset = 0; offset < count; offset += 1) {
    const tick = (firstDay + offset) * TIME.TICKS_PER_DAY;
    const date = dateAtTick(tick);
    const definition = SEASON_DEFINITIONS[date.season];
    const schedule = thawAtTick(tick);
    const eventSchedule = thawAtTick(tick + TIME.TICKS_PER_DAY - 1);
    const events = [];
    if (eventSchedule && Math.floor(eventSchedule.warningTick / TIME.TICKS_PER_DAY) === date.day) {
      events.push(thawForecastEvent(eventSchedule, 'thawWarning', 'warning'));
    }
    if (eventSchedule && Math.floor(eventSchedule.riseStartTick / TIME.TICKS_PER_DAY) === date.day) {
      events.push(thawForecastEvent(eventSchedule, 'thaw', 'start'));
    }
    if (eventSchedule && Math.floor(eventSchedule.riseEndTick / TIME.TICKS_PER_DAY) === date.day) {
      events.push(thawForecastEvent(eventSchedule, 'thawEnd', 'end'));
    }
    if (date.seasonDay === 1) {
      events.push({ type: 'seasonChange', tick, season: date.season, labelKey: definition.labelKey });
    }
    const harvest = harvestState(definition, infrastructure, tick);
    const blackRain = blackRainState(sim, { ...definition, id: date.season }, tick);
    if (harvest.available && date.seasonDay === 1) events.push({ type: 'harvest', tick });
    if (blackRain.possible && date.seasonDay === 1) events.push({ type: 'blackRain', tick });
    forecast.push({
      tick,
      ...date,
      labelKey: definition.labelKey,
      ...expeditionState(definition, tick),
      harvest,
      harvestAvailable: harvest.available,
      blackRain,
      blackRainPossible: blackRain.possible,
      thawActive: Boolean(schedule && tick >= schedule.riseStartTick && tick < schedule.riseEndTick),
      waterTableDelta: thawDeltaAtTick(tick),
      events,
    });
  }
  return forecast;
}

function ensureCalendar(sim) {
  sim.m5 ??= {};
  sim.m5.calendar ??= {};
  const calendar = sim.m5.calendar;
  calendar.season ??= seasonAtTick(sim.tick);
  calendar.waterTable ??= {};
  const waterTable = calendar.waterTable;
  waterTable.baseLevel = -waterTableDepth(sim.world);
  waterTable.level ??= waterTable.baseLevel;
  waterTable.delta ??= 0;
  waterTable.riseStartTick ??= null;
  waterTable.riseEndTick ??= null;
  waterTable.riseMeters ??= SEASONS.THAW_RISE_METERS;
  waterTable.minRiseMeters ??= SEASONS.THAW_MIN_RISE_METERS;
  waterTable.maxRiseMeters ??= SEASONS.THAW_MAX_RISE_METERS;
  waterTable.warningYear ??= null;
  waterTable.warningStartTick ??= null;
  waterTable.startedStartTick ??= null;
  waterTable.endedStartTick ??= null;
  waterTable.startYear ??= null;
  waterTable.thawCount ??= 0;
  waterTable.endYear ??= null;
  waterTable.announcedTick ??= null;
  waterTable.rechargeUnits ??= 0;
  calendar.forecast ??= [];
  return calendar;
}

function refreshCalendar(sim) {
  const calendar = ensureCalendar(sim);
  const date = dateAtTick(sim.tick);
  const definition = SEASON_DEFINITIONS[date.season];
  Object.assign(calendar, date, {
    labelKey: definition.labelKey,
    temperatureAnomaly: seasonalTemperatureAnomaly(sim.tick),
    ...expeditionState(definition, sim.tick),
  });
  calendar.expedition = expeditionState(definition, sim.tick);
  const infrastructure = harvestInfrastructure(sim);
  calendar.harvest = { ...calendar.harvest, ...harvestState(definition, infrastructure, sim.tick) };
  calendar.harvestAvailable = calendar.harvest.available;
  calendar.blackRain = blackRainState(sim, { ...definition, id: date.season });
  calendar.blackRainPossible = calendar.blackRain.possible;

  const schedule = thawAtTick(sim.tick);
  const waterTable = calendar.waterTable;
  waterTable.active = Boolean(schedule && sim.tick >= schedule.riseStartTick && sim.tick < schedule.riseEndTick
    && surfaceTemperature(sim.tick / TIME.TICKS_PER_DAY) > 0);
  waterTable.delta = thawDeltaAtTick(sim.tick);
  waterTable.level = waterTable.baseLevel + waterTable.delta;
  waterTable.riseStartTick = schedule?.riseStartTick ?? null;
  waterTable.riseEndTick = schedule?.riseEndTick ?? null;
  const nextSchedule = upcomingThaw(sim.tick);
  waterTable.warningTick = nextSchedule?.warningTick ?? null;
  waterTable.nextRiseStartTick = nextSchedule?.riseStartTick ?? null;
  waterTable.warningDays = SEASONS.THAW_WARNING_DAYS;
  waterTable.durationDays = SEASONS.THAW_DURATION_DAYS;
  waterTable.announced = Boolean(schedule && waterTable.warningStartTick === schedule.riseStartTick);
  if (!waterTable.announced) waterTable.announcedTick = null;
  calendar.nextThaw = nextSchedule ? {
    year: nextSchedule.year,
    warningTick: nextSchedule.warningTick,
    startTick: nextSchedule.riseStartTick,
    endTick: nextSchedule.riseEndTick,
    riseMeters: waterTable.riseMeters,
    durationDays: SEASONS.THAW_DURATION_DAYS,
  } : null;
  const infrastructureKey = `${infrastructure.collectors}:${infrastructure.greenhouses}`;
  if (calendar.forecastDay !== date.day || calendar.forecastInfrastructure !== infrastructureKey
    || calendar.forecast.length !== SEASONS.FORECAST_DAYS) {
    calendar.forecast = calendarForecast(sim);
    calendar.forecastDay = date.day;
    calendar.forecastInfrastructure = infrastructureKey;
  }
  return calendar;
}

function rechargeQuality(sim, material, y, x) {
  if (material === MATERIAL.SANDSTONE) return WATER_QUALITY.dirty;
  return shallowWaterContaminated(sim, y, x) ? WATER_QUALITY.radioactive : WATER_QUALITY.dirty;
}

function thawDepthFactor(y) {
  return Math.max(0, 1 - Math.max(0, y - WORLD.SURFACE_Y) / SEASONS.THAW_MAX_DEPTH_METERS);
}

// Geometry and clay shielding change with terrain, not with every minute.
const rechargeContacts = new WeakMap();
function thawContacts(sim, excavation) {
  const world = sim.world;
  let cache = rechargeContacts.get(world);
  const depth = waterTableDepth(world);
  if (!cache || cache.revision !== world.revision || cache.depth !== depth
    || cache.materials !== world.materials || cache.states !== world.states) {
    cache = { revision: world.revision, depth, materials: world.materials, states: world.states, rooms: new WeakMap() };
    rechargeContacts.set(world, cache);
  }
  let entry = cache.rooms.get(excavation);
  if (entry?.cells === excavation.dugCells && entry.count === excavation.dugCells?.length) return entry.contacts;
  const contacts = [];
  for (const target of excavation.dugCells ?? []) {
    const point = world.coords(target);
    if (!world.isEmpty(point.x, point.y)) continue;
    for (const [x, y] of [
      [point.x - 1, point.y], [point.x + 1, point.y],
      [point.x, point.y - 1], [point.x, point.y + 1],
    ]) {
      if (!world.inBounds(x, y) || !world.isSolid(x, y)) continue;
      const material = world.material(x, y);
      const depthFactor = thawDepthFactor(y);
      if (!aquiferMaterial(material) || depthFactor <= 0 || clayProtected(world, x, y)
        || Math.abs(y - WORLD.SURFACE_Y - depth) > SEASONS.THAW_RISE_METERS) continue;
      contacts.push({ target, x, y, material, key: `${target}:${world.index(x, y)}`,
        factor: materialAt(material).permeability * depthFactor });
    }
  }
  entry = { cells: excavation.dugCells, count: excavation.dugCells?.length, contacts };
  cache.rooms.set(excavation, entry);
  return contacts;
}

function rechargeAquifers(sim) {
  const waterTable = sim.m5.calendar.waterTable;
  if (!waterTable.active || waterTable.delta <= 0 || !sim.world?.water
    || sim.tick % WATER.UPDATE_INTERVAL !== 0) return;
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation) || excavation.coating === 'waterproof') continue;
    excavation.thawInfiltration ??= {};
    for (const { target, x, y, material, key, factor } of thawContacts(sim, excavation)) {
      const rate = waterTable.delta * factor * SEASONS.THAW_RECHARGE_PER_METER_PER_DAY
        * WATER.UPDATE_INTERVAL / TIME.TICKS_PER_DAY;
      let accumulated = (excavation.thawInfiltration[key] ?? 0) + rate;
      const capacity = WATER.MAX_PER_CELL - sim.world.water[target];
      const wholeUnits = Math.floor(accumulated + Number.EPSILON * TIME.TICKS_PER_DAY);
      if (capacity > 0 && wholeUnits > 0) {
        const amount = Math.min(capacity, wholeUnits);
        const quality = rechargeQuality(sim, material, y, x);
        sim.world.waterQuality[target] = sim.world.water[target] === 0
          ? quality : Math.max(sim.world.waterQuality[target], quality);
        sim.world.water[target] += amount;
        waterTable.rechargeUnits += amount;
        accumulated -= amount;
      } else if (capacity <= 0) {
        accumulated = Math.min(accumulated, 1);
      }
      excavation.thawInfiltration[key] = accumulated;
    }
  }
}

function recordThawEvent(sim, type, level, code, schedule) {
  const parameters = {
    year: schedule.year,
    startTick: schedule.riseStartTick,
    endTick: schedule.riseEndTick,
    days: SEASONS.THAW_WARNING_DAYS,
    duration: SEASONS.THAW_DURATION_DAYS,
    meters: SEASONS.THAW_RISE_METERS,
  };
  sim.log(level, code, parameters);
  sim.events.push({
    type,
    tick: sim.tick,
    year: schedule.year,
    startTick: schedule.riseStartTick,
    endTick: schedule.riseEndTick,
    riseMeters: SEASONS.THAW_RISE_METERS,
  });
}

function updateThawTransitions(sim) {
  const schedule = thawAtTick(sim.tick);
  if (!schedule) return;
  const waterTable = sim.m5.calendar.waterTable;
  if (sim.tick >= schedule.warningTick && sim.tick < schedule.riseStartTick
    && waterTable.warningStartTick !== schedule.riseStartTick) {
    waterTable.warningYear = schedule.year;
    waterTable.warningStartTick = schedule.riseStartTick;
    waterTable.announcedTick = sim.tick;
    waterTable.announced = true;
    recordThawEvent(sim, 'thawWarning', 'warning', 'eventThawWarning', schedule);
  }
  if (sim.tick >= schedule.riseStartTick && sim.tick < schedule.riseEndTick
    && waterTable.startedStartTick !== schedule.riseStartTick) {
    waterTable.startYear = schedule.year;
    waterTable.startedStartTick = schedule.riseStartTick;
    waterTable.thawCount += 1;
    recordThawEvent(sim, 'thawStart', 'warning', 'eventThawStart', schedule);
  }
  if (sim.tick >= schedule.riseEndTick && sim.tick < schedule.riseEndTick + THAW_RECOVERY_TICKS
    && waterTable.endedStartTick !== schedule.riseStartTick) {
    waterTable.endYear = schedule.year;
    waterTable.endedStartTick = schedule.riseStartTick;
    recordThawEvent(sim, 'thawEnd', 'info', 'eventThawEnd', schedule);
  }
}

function updateThawExposure(sim) {
  const schedule = thawAtTick(sim.tick);
  const announced = schedule && sim.tick >= schedule.warningTick && sim.tick < schedule.riseEndTick;
  for (const excavation of sim.excavations) {
    excavation.thawExposure = false;
    if (!announced || !activeExcavation(excavation) || excavation.coating === 'waterproof') continue;
    excavation.thawExposure = thawContacts(sim, excavation).length > 0;
  }
}

function updateAutumnHarvest(sim, calendar) {
  const harvest = calendar.harvest;
  harvest.yieldToday = 0;
  harvest.totalFood ??= 0;
  if (!harvest.available || sim.tick % TIME.TICKS_PER_DAY !== 0
    || harvest.lastYieldDay === calendar.day) return;
  const collector = sim.surface.structures.find((structure) => structure.type === 'rainCollector' && structure.state === 'built');
  if (!collector) return;
  let stock = sim.stocks.find((candidate) => candidate.id === `autumn-collector-${collector.id ?? collector.x}`);
  if (!stock) {
    stock = createStock(`autumn-collector-${collector.id ?? collector.x}`, collector.x, WORLD.SURFACE_Y - 1);
    stock.kind = 'autumnHarvest';
    sim.stocks.push(stock);
  }
  const amount = SEASONS.AUTUMN_HARVEST_FOOD_PER_DAY * harvest.collectors * harvest.greenhouses;
  addToStock(stock, 'food', amount);
  harvest.lastYieldDay = calendar.day;
  harvest.yieldToday = amount;
  harvest.totalFood += amount;
  sim.log('info', 'eventHarvest', { amount, stockId: stock.id, day: calendar.day }, collector);
  sim.events.push({ type: 'autumnHarvest', tick: sim.tick, amount, stockId: stock.id, x: stock.x, y: stock.y });
}

export function initializeCalendar(sim) {
  const legacy = sim.m5?.calendar?.ruleVersion !== SEASONS.CALENDAR_RULE_VERSION
    || sim.m5?.calendar?.waterTable?.baseLevel === 0;
  if (legacy && sim.m5?.calendar) {
    sim.m5.calendar.forecastDay = null;
  }
  if (!sim.m5?.calendar || legacy) {
    refreshCalendar(sim);
    updateThawExposure(sim);
  } else ensureCalendar(sim);
  sim.m5.calendar.ruleVersion = SEASONS.CALENDAR_RULE_VERSION;
}

export function updateCalendar(sim) {
  const previousSeason = sim.m5?.calendar?.season ?? null;
  const calendar = refreshCalendar(sim);
  recordSeasonNarrative(sim, previousSeason, calendar.season);
  updateThawExposure(sim);
  updateAutumnHarvest(sim, sim.m5.calendar);
  rechargeAquifers(sim);
  updateThawTransitions(sim);
}

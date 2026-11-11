import { WEATHER } from '../data/surface.js';
import { HEAT, TIME } from '../data/balance.js';
import { hashString, RNG } from './rng.js';
import { surfaceTemperature } from './climate.js';
import { builtSurfaceStructure } from './surfaceStructures.js';
import { contaminateNappe } from './water.js';
import { seasonAtTick } from './seasons.js';
import { SEASONS } from '../data/seasons.js';

const EVENT_TYPES = Object.freeze(['rain', 'dustStorm', 'clearing']);

function eventDuration(type) {
  if (type === 'blackRain') return WEATHER.BLACK_RAIN_TICKS;
  if (type === 'rain') return WEATHER.RAIN_TICKS;
  if (type === 'dustStorm') return WEATHER.DUST_STORM_TICKS;
  return WEATHER.CLEARING_TICKS;
}

export function blackRainChance(tick) {
  if (seasonAtTick(tick) !== 'autumn') return 0;
  const remainingWinter = Math.max(0, 1 - tick / (HEAT.NUCLEAR_WINTER_DAYS * TIME.TICKS_PER_DAY));
  return SEASONS.AUTUMN_BLACK_RAIN_CHANCE * SEASONS.AUTUMN_BLACK_RAIN_FACTOR * remainingWinter;
}

function eventType(sim, index, startTick) {
  const chance = blackRainChance(startTick);
  if (chance > 0) {
    const rain = new RNG(hashString(`${sim.seed}:autumn-rain:${index}`));
    if (rain.next() < chance) return 'blackRain';
  }
  // The starting collector has a useful ordinary shower before the first autumn.
  if (index === 0) return 'rain';
  const offset = new RNG(hashString(`${sim.seed}:weather-sequence`)).int(0, EVENT_TYPES.length - 1);
  return EVENT_TYPES[(offset + index) % EVENT_TYPES.length];
}

function scheduleNextEvent(sim) {
  const weather = sim.weather;
  const index = weather.nextEventIndex;
  const startTick = Math.max(weather.nextEventTick, sim.tick + WEATHER.MIN_WARNING_TICKS);
  const type = eventType(sim, index, startTick);
  weather.nextEvent = {
    id: index,
    type,
    startTick,
    endTick: startTick + eventDuration(type),
    announced: false,
  };
  weather.nextEventIndex = index + 1;
  weather.nextEventTick = weather.nextEvent.startTick + WEATHER.EVENT_INTERVAL_TICKS;
  return weather.nextEvent;
}

export function initializeWeather(sim) {
  sim.weather ??= {};
  sim.weather.current ??= 'clear';
  sim.weather.nextEventIndex ??= 0;
  sim.weather.nextEventTick ??= WEATHER.FIRST_EVENT_TICK;
  sim.weather.nextEvent ??= null;
  sim.weather.activeEvent ??= null;
  sim.weather.forecast ??= [];
  sim.weather.nappeContamination ??= 0;
  sim.weather.contaminationTick ??= sim.tick;
  sim.weather.filterMultiplier ??= 1;
  sim.weather.solarFactor ??= 1;
  sim.weather.expeditionsBlocked ??= false;
  sim.weather.temperature ??= surfaceTemperature(sim.tick / TIME.TICKS_PER_DAY);
  if (!sim.weather.nextEvent && !sim.weather.activeEvent) scheduleNextEvent(sim);
}

export function weatherForecast(sim) {
  return (sim.weather?.forecast ?? []).map((event) => ({ ...event }));
}

function journalParameters(event) {
  const durationTicks = Math.max(0, event.endTick - event.startTick);
  const durationHours = durationTicks / TIME.TICKS_PER_HOUR;
  return {
    weather: event.type,
    startTick: event.startTick,
    endTick: event.endTick,
    days: durationTicks / TIME.TICKS_PER_DAY,
    hours: durationHours,
    durationHours,
    surfaceFactor: event.type === 'blackRain' ? WEATHER.BLACK_RAIN_SURFACE_FACTOR : 1,
    filterFactor: event.type === 'dustStorm' ? WEATHER.DUST_FILTER_FACTOR : 1,
  };
}

function finishActiveEvent(sim) {
  const event = sim.weather.activeEvent;
  if (!event || sim.tick < event.endTick) return;
  sim.log('info', 'eventWeatherEnd', journalParameters(event));
  sim.weather.activeEvent = null;
  sim.weather.current = 'clear';
}

function startNextEvent(sim) {
  const weather = sim.weather;
  const event = weather.nextEvent;
  if (!event || sim.tick < event.startTick) return;
  weather.activeEvent = { ...event };
  weather.nextEvent = null;
  weather.current = event.type;
  weather.forecast = weather.forecast.filter((candidate) => candidate.id !== event.id);
  sim.log(event.type === 'clearing' || event.type === 'rain' ? 'info' : 'warning', 'eventWeatherStart', journalParameters(event));
  if (event.type === 'blackRain') contaminateNappe(sim);
  scheduleNextEvent(sim);
}

function announceNextEvent(sim) {
  const weather = sim.weather;
  const event = weather.nextEvent;
  if (!event || event.announced) return;
  const horizon = builtSurfaceStructure(sim, 'antenna') ? WEATHER.ANTENNA_WARNING_TICKS : WEATHER.MIN_WARNING_TICKS;
  const remaining = event.startTick - sim.tick;
  if (remaining > horizon) return;
  event.announced = true;
  const forecast = { ...event, announcedTick: sim.tick, warningTicks: Math.max(0, remaining) };
  delete forecast.announced;
  weather.forecast.push(forecast);
  sim.log(event.type === 'clearing' || event.type === 'rain' ? 'info' : 'warning', 'eventWeatherWarning', {
    ...journalParameters(event),
    hours: Math.ceil(Math.max(0, remaining) / TIME.TICKS_PER_HOUR),
  });
}

export function updateWeather(sim) {
  initializeWeather(sim);
  const elapsed = Math.max(0, sim.tick - sim.weather.contaminationTick);
  const dilution = Math.pow(0.5, elapsed / (WEATHER.NAPPE_HALF_LIFE_DAYS * TIME.TICKS_PER_DAY));
  sim.weather.nappeContamination *= dilution;
  if (sim.radiation) sim.radiation.waterContamination = (sim.radiation.waterContamination ?? 0) * dilution;
  sim.weather.contaminationTick = sim.tick;
  finishActiveEvent(sim);
  startNextEvent(sim);
  announceNextEvent(sim);
  const weather = sim.weather;
  weather.temperature = surfaceTemperature(sim.tick / TIME.TICKS_PER_DAY);
  weather.expeditionsBlocked = weather.current === 'dustStorm';
  weather.filterMultiplier = weather.current === 'dustStorm' ? WEATHER.DUST_FILTER_FACTOR : 1;
  weather.solarFactor = weather.current === 'dustStorm' ? WEATHER.STORM_SOLAR_FACTOR
    : weather.current === 'blackRain' || weather.current === 'rain' ? WEATHER.RAIN_SOLAR_FACTOR
      : weather.current === 'clearing' ? WEATHER.CLEARING_SOLAR_FACTOR : 1;
  if (weather.current === 'blackRain') {
    const dose = WEATHER.BLACK_RAIN_NAPPE_DOSE / WEATHER.BLACK_RAIN_TICKS;
    weather.nappeContamination += dose;
    sim.radiation.waterContamination = (sim.radiation.waterContamination ?? 0) + dose;
  }
  weather.forecast = weather.forecast.filter((event) => event.startTick > sim.tick);
}

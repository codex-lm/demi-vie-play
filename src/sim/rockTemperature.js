import { HEAT, TIME } from '../data/balance.js';
import { surfaceTemperature } from './climate.js';
import { erfc, integratedErfc2 } from './erfc.js';

const seasonalDepth = Math.sqrt(HEAT.ROCK_DIFFUSIVITY_M2_PER_DAY * TIME.DAYS_PER_YEAR / Math.PI);
const initialMeanChange = HEAT.SURFACE_START - HEAT.SURFACE_FINAL;
const recoveryPerDay = -initialMeanChange / HEAT.NUCLEAR_WINTER_DAYS;

// Only the current instant is retained. Air paths and rooms often ask for the
// same depth in one tick; nothing derived is serialized or changes the result.
let cachedDay = NaN;
const temperatures = new Map();

function safeDepth(depth) {
  return Number.isFinite(depth) ? Math.max(0, depth) : 0;
}

function safeDay(day) {
  return Number.isFinite(day) ? day : 0;
}

export function rockSeasonalAnomalyAt(day, depth) {
  const t = safeDay(day);
  const phaseDepth = safeDepth(depth) / seasonalDepth;
  return HEAT.SEASON_AMPLITUDE * Math.exp(-phaseDepth)
    * Math.sin(((t % TIME.DAYS_PER_YEAR) - HEAT.SEASON_PHASE_DAYS)
      / TIME.DAYS_PER_YEAR * Math.PI * 2 - phaseDepth);
}

export function rockWinterAnomalyAt(day, depth) {
  const t = safeDay(day);
  const d = safeDepth(depth);
  // The surface boundary jumps at t=0; the interior has not yet felt that
  // jump. This right-hand boundary convention reconciles W(d>0,0)=0 with
  // T_rock(0,0)=T_surface(0), including the day-zero acceptance check.
  if (d === 0 && t >= 0) {
    return initialMeanChange * (1 - Math.min(1, t / HEAT.NUCLEAR_WINTER_DAYS));
  }
  if (t <= 0) return 0;
  const eta = d / (2 * Math.sqrt(HEAT.ROCK_DIFFUSIVITY_M2_PER_DAY * t));
  let change = initialMeanChange * erfc(eta) + recoveryPerDay * t * integratedErfc2(eta);
  if (t > HEAT.NUCLEAR_WINTER_DAYS) {
    const elapsed = t - HEAT.NUCLEAR_WINTER_DAYS;
    const pastEta = d / (2 * Math.sqrt(HEAT.ROCK_DIFFUSIVITY_M2_PER_DAY * elapsed));
    change -= recoveryPerDay * elapsed * integratedErfc2(pastEta);
  }
  return change;
}

export function rockTemperatureAt(day, depth) {
  const t = safeDay(day);
  const d = safeDepth(depth);
  if (d === 0 && t >= 0) return surfaceTemperature(t);
  if (t !== cachedDay) {
    cachedDay = t;
    temperatures.clear();
  }
  let temperature = temperatures.get(d);
  if (temperature === undefined) {
    temperature = HEAT.GEO_BASE + HEAT.GEO_GRADIENT * d
      + rockSeasonalAnomalyAt(t, d) + rockWinterAnomalyAt(t, d);
    temperatures.set(d, temperature);
  }
  return temperature;
}

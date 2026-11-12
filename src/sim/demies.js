import { TIME } from '../data/balance.js';
import { DEMIES } from '../data/demies.js';
import { EXODUS, RADIATION } from '../data/surface.js';
import { projectFirstYear } from './exodus.js';
import { baseRadiationRate, hotspotAt, safeDateTick, surfaceDoseRate, suitProtection } from './radiation.js';
import { siteDefinition } from './surface.js';

// The shelter closes at 06:00, when the explosion is 24 hours old. Tick zero
// would describe the preceding midnight and give different (incorrect) dates.
const initialRate = baseRadiationRate(DEMIES.START_TICK);
const milestones = Object.freeze(Array.from({ length: DEMIES.COUNT }, (_, index) => {
  const number = index + 1;
  const factor = 2 ** number;
  const targetRate = initialRate / factor;
  let low = DEMIES.START_TICK;
  let high = low + TIME.TICKS_PER_DAY;
  while (baseRadiationRate(high) > targetRate) high = low + (high - low) * 2;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (baseRadiationRate(middle) <= targetRate) high = middle;
    else low = middle;
  }
  return Object.freeze({ number, tick: high, factor, targetRate });
}));

/** Half the local closing dose each time, independent of transient weather.
 * A hot/cold column multiplies both the starting and target dose, so its dates
 * stay the same. Demie 11 is a relative milestone, not the absolute safe rate.
 */
export function demieDates(sim = {}, x = sim.radiation?.selectedX) {
  const multiplier = hotspotAt(sim, x);
  if (multiplier === 1) return milestones;
  return Object.freeze(milestones.map((milestone) => Object.freeze({
    ...milestone, targetRate: milestone.targetRate * multiplier,
  })));
}

export function demieCount(tick) {
  return milestones.filter((milestone) => milestone.tick <= tick).length;
}

export function demieProgress(sim, x = sim.radiation?.selectedX) {
  const dates = demieDates(sim, x);
  const count = demieCount(sim.tick);
  const next = dates[count] ?? null;
  return {
    dates, count, next, divisionFactor: 2 ** count,
    remainingTicks: next ? Math.max(0, next.tick - sim.tick) : 0,
    safeTick: safeDateTick(sim, x),
  };
}

/** Instantaneous allowance at today's rate; does not predict future exposure.
 * Crew selection passes suit:true because an expedition equips its members.
 */
export function skyHours(sim, colonist, {
  x = sim.radiation?.selectedX, tick = sim.tick, suit = colonist?.suit,
} = {}) {
  const hourlyDose = surfaceDoseRate({ ...sim, tick }, x)
    * (1 - suitProtection(sim, { ...colonist, suit }));
  const remainingDose = Math.max(0, RADIATION.HEALTHY_MAX_MSV - (colonist?.dose ?? 0));
  return {
    hourlyDose, remainingDose, healthyThreshold: RADIATION.HEALTHY_MAX_MSV,
    hours: remainingDose === 0 ? 0 : hourlyDose > 0 ? remainingDose / hourlyDose : Infinity,
    negligible: hourlyDose < DEMIES.LOW_DOSE_RATE,
  };
}

/** Same estimate as previewExpedition, without preparing an order or touching
 * its crew. The future comparison holds weather, gear and trip length fixed;
 * it isolates radioactive decay, not an unknowable forecast of encounters.
 */
export function expeditionDosePrices(sim, previewOrOrder) {
  const definition = siteDefinition(previewOrOrder?.siteId);
  if (!definition) return null;
  const tick = previewOrOrder.previewTick ?? sim.tick;
  const durationHours = previewOrOrder.durationHours
    ?? definition.durationHours * (sim.m5?.calendar?.durationFactor ?? 1);
  const dosePerPerson = previewOrOrder.dosePerPerson
    ?? surfaceDoseRate({ ...sim, tick }, definition.x) * durationHours * (1 - suitProtection(sim, { suit: true }));
  const delayTicks = DEMIES.DELAY_DAYS * TIME.TICKS_PER_DAY;
  const laterDosePerPerson = dosePerPerson * baseRadiationRate(tick + delayTicks) / baseRadiationRate(tick);
  const crewSize = new Set(previewOrOrder.colonistIds ?? []).size;
  return {
    today: { dosePerPerson, teamDose: dosePerPerson * crewSize },
    later: { dosePerPerson: laterDosePerPerson, teamDose: laterDosePerPerson * crewSize },
    delayDays: DEMIES.DELAY_DAYS, durationHours, crewSize, siteId: definition.id, x: definition.x,
    negligible: dosePerPerson < DEMIES.LOW_TRIP_DOSE,
  };
}

/** First sampled departure with no projected deaths in the next year.
 * Uses the exact existing projection (including cold, food and seeded losses)
 * on the current people, and optionally tops up the existing kit to its minimum
 * requirements. It never predicts how those people or provisions will change
 * underground. The caller must state the completed-kit assumption and cache the
 * result at most once per game day. Seasons/random losses are not monotonic:
 * every intervening daily departure is checked, never binary-searched.
 */
export function firstDeathlessDeparture(sim, {
  startTick = sim.tick, endTick = milestones.at(-1).tick, assumeCompleteKit = true,
} = {}) {
  startTick = Math.max(0, Math.floor(startTick));
  endTick = Math.max(startTick, Math.floor(endTick));
  const actualKit = sim.exodus?.kit ?? {};
  const kit = { ...actualKit };
  let assumedKit = false;
  for (const [resource, required] of Object.entries(EXODUS.KIT_REQUIREMENTS)) {
    if ((kit[resource] ?? 0) >= required) continue;
    if (assumeCompleteKit) {
      kit[resource] = required;
      assumedKit = true;
    }
  }
  const result = { tick: null, projection: null, assumedKit, searchEndTick: endTick,
    resolutionTicks: TIME.TICKS_PER_DAY, kit };
  if (!sim.colonists.some((colonist) => colonist.health > 0 && !colonist.dead)) {
    return { ...result, reason: 'noLivingColonists' };
  }
  if (!assumeCompleteKit && Object.entries(EXODUS.KIT_REQUIREMENTS)
    .some(([resource, required]) => (kit[resource] ?? 0) < required)) {
    return { ...result, reason: 'kitIncomplete' };
  }
  const projectedSim = { ...sim, exodus: { ...sim.exodus, kit } };
  for (let tick = startTick; tick <= endTick;) {
    const projection = projectFirstYear({ ...projectedSim, tick });
    if (projection.startingLiving > 0 && projection.living === projection.startingLiving) {
      return { ...result, tick, projection, reason: null };
    }
    tick = (Math.floor(tick / TIME.TICKS_PER_DAY) + 1) * TIME.TICKS_PER_DAY;
  }
  return { ...result, reason: 'noDeathlessDeparture' };
}

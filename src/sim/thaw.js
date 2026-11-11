import { HEAT, TIME } from '../data/balance.js';
import { SEASONS } from '../data/seasons.js';
import { surfaceTemperature } from './climate.js';

const DAY = TIME.TICKS_PER_DAY;
let schedules;

// Surface temperature depends only on time. Compute its finite freeze/thaw
// history once, not once per tick or per room; no new saved state or RNG stream.
function thawSchedules() {
  if (schedules) return schedules;
  schedules = [];
  let frozen = surfaceTemperature(0) <= 0;
  let frozenSince = frozen ? 0 : null;
  const horizon = Math.ceil(HEAT.NUCLEAR_WINTER_DAYS) + TIME.DAYS_PER_YEAR;
  for (let day = 1; day <= horizon; day += 1) {
    const nowFrozen = surfaceTemperature(day) <= 0;
    if (nowFrozen === frozen) continue;
    let low = (day - 1) * DAY;
    let high = day * DAY;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if ((surfaceTemperature(middle / DAY) <= 0) === frozen) low = middle;
      else high = middle;
    }
    if (nowFrozen) frozenSince = high;
    else if (high - frozenSince >= SEASONS.THAW_MIN_FROZEN_DAYS * DAY) {
      schedules.push(Object.freeze({
        enabled: true,
        year: Math.floor(high / (TIME.DAYS_PER_YEAR * DAY)) + 1,
        riseStartTick: high,
        riseEndTick: high + SEASONS.THAW_DURATION_DAYS * DAY,
        warningTick: high - SEASONS.THAW_WARNING_DAYS * DAY,
        frozenTicks: high - frozenSince,
      }));
    }
    frozen = nowFrozen;
  }
  return schedules;
}

export function upcomingThaw(tick) {
  return thawSchedules().find((schedule) => schedule.riseEndTick > tick) ?? null;
}

export function thawAtTick(tick) {
  const all = thawSchedules();
  return all.findLast((schedule) => schedule.warningTick <= tick) ?? all[0] ?? null;
}

export function thawDeltaAtTick(tick) {
  if (surfaceTemperature(tick / DAY) <= 0) return 0;
  const schedule = thawSchedules().findLast((candidate) => candidate.riseStartTick <= tick);
  if (!schedule) return 0;
  if (tick < schedule.riseEndTick) {
    return SEASONS.THAW_RISE_METERS * (tick - schedule.riseStartTick)
      / (SEASONS.THAW_DURATION_DAYS * DAY);
  }
  return SEASONS.THAW_RISE_METERS * Math.exp(-(tick - schedule.riseEndTick)
    / (SEASONS.THAW_RECOVERY_DAYS * DAY));
}

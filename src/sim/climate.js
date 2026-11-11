import { HEAT, TIME } from '../data/balance.js';

export function surfaceTemperature(day) {
  const safeDay = Number.isFinite(day) ? day : 0;
  const recovery = Math.min(1, Math.max(0, safeDay) / HEAT.NUCLEAR_WINTER_DAYS);
  const seasonal = Math.sin(((safeDay % TIME.DAYS_PER_YEAR) - HEAT.SEASON_PHASE_DAYS) / TIME.DAYS_PER_YEAR * Math.PI * 2)
    * HEAT.SEASON_AMPLITUDE;
  return HEAT.SURFACE_START + (HEAT.SURFACE_FINAL - HEAT.SURFACE_START) * recovery + seasonal;
}

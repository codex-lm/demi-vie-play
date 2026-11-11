import { HEAT } from '../data/balance.js';

// A sudden exposure must leave the same response window as a gradual forecast.
// These fields are ordinary saved state; older saves start a fresh warning.
export function thermalDamageReady(sim, excavation, colonist, category) {
  if (excavation) {
    const since = excavation[`${category}WarningSince`];
    return Number.isFinite(since) && sim.tick - since >= HEAT.WARNING_LEAD_TICKS
      && excavation[`${category}AlertLevel`] === 'danger'
      && (excavation.alertChangeTicks?.[category] ?? sim.tick) < sim.tick;
  }
  const exposure = colonist?.thermalExposure?.[category];
  return Number.isFinite(exposure?.warningSince)
    && sim.tick - exposure.warningSince >= HEAT.WARNING_LEAD_TICKS
    && exposure.level === 'danger' && exposure.redSince < sim.tick;
}

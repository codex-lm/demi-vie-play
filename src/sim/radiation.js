import { ALERTS, CELL, TIME, WORLD } from '../data/balance.js';
import { RADIATION, WEATHER } from '../data/surface.js';
import { MATERIAL } from '../data/materials.js';
import { activeExcavation, excavationAt, insideExcavation } from './networks.js';
import { lawMultiplier } from './laws.js';
import { researchEffect } from './research.js';
import { hashString, RNG } from './rng.js';

export function explosionHours(tick) {
  return RADIATION.START_HOURS + (tick - TIME.START_HOUR * TIME.TICKS_PER_HOUR) / TIME.TICKS_PER_HOUR;
}

export function baseRadiationRate(tick) {
  const hours = Math.max(1, explosionHours(tick));
  const years = hours / (24 * 360);
  return RADIATION.R1 * hours ** -RADIATION.FALLOUT_EXPONENT
    + RADIATION.RCS * 2 ** (-years / RADIATION.CESIUM_HALF_LIFE_YEARS);
}

export function createHotspots(seed, width = WORLD.WIDTH) {
  const rng = new RNG(hashString(`${seed}:surface-hotspots`));
  const controls = Array.from({ length: Math.ceil(width / 8) + 1 }, () => 0.3 + rng.next() * 2.7);
  return Array.from({ length: width }, (_, x) => {
    const position = x / 8;
    const left = Math.floor(position);
    const fraction = position - left;
    const a = controls[Math.min(left, controls.length - 1)];
    const b = controls[Math.min(left + 1, controls.length - 1)];
    return { x, multiplier: Math.max(0.3, Math.min(3, a + (b - a) * fraction)) };
  });
}

export function hotspotAt(sim, x) {
  const hotspots = sim.radiation?.hotspots ?? [];
  const column = Math.max(0, Math.min(hotspots.length - 1, Math.round(x)));
  return hotspots[column]?.multiplier ?? 1;
}

export function surfaceDoseRate(sim, x = sim.radiation?.selectedX ?? 48) {
  const weatherFactor = sim.weather?.current === 'blackRain' ? WEATHER.BLACK_RAIN_SURFACE_FACTOR : 1;
  const seasonFactor = sim.m5?.calendar?.doseFactor ?? 1;
  return baseRadiationRate(sim.tick) * hotspotAt(sim, x) * weatherFactor * seasonFactor;
}

export function safeDateTick(sim, x = sim.radiation?.selectedX ?? 48, threshold = sim.radiation?.safeThreshold ?? RADIATION.SAFE_RATE) {
  const start = sim.weather?.current === 'blackRain' && (sim.weather.activeEvent?.endTick ?? 0) > sim.tick
    ? sim.weather.activeEvent.endTick : sim.tick;
  const rateAt = (tick) => baseRadiationRate(tick) * hotspotAt(sim, x);
  if (rateAt(start) <= threshold) return start;
  let low = start;
  let high = start + 100 * 360 * TIME.TICKS_PER_DAY;
  while (low + TIME.TICKS_PER_HOUR < high) {
    const middle = Math.floor((low + high) / 2);
    if (rateAt(middle) <= threshold) high = middle;
    else low = middle;
  }
  return high;
}

export function suitProtection(sim, colonist) {
  if (!colonist?.suit) return 0;
  return (sim.research?.completed ?? []).includes('reinforcedSuits')
    ? RADIATION.REINFORCED_SUIT_PROTECTION : RADIATION.SUIT_PROTECTION;
}

function hasDisease(colonist, type) {
  return (colonist.diseases ?? []).some((disease) => (typeof disease === 'string' ? disease : disease.type) === type);
}

function addDisease(colonist, type) {
  if (hasDisease(colonist, type)) return false;
  colonist.diseases ??= [];
  colonist.diseases.push({ type, recovery: 0 });
  return true;
}

function refreshDoseStatus(sim, colonist) {
  colonist.doseHistory = Array.isArray(colonist.doseHistory) ? colonist.doseHistory : [];
  const cutoff = sim.tick - RADIATION.ACUTE_WINDOW_TICKS;
  while (colonist.doseHistory.length && colonist.doseHistory[0].tick < cutoff) colonist.doseHistory.shift();
  const acuteDose = colonist.doseHistory.reduce((total, entry) => total + entry.amount, 0);
  colonist.acuteDose = acuteDose;
  colonist.radiationStatus = acuteDose >= RADIATION.ACUTE_MSV ? 'acute'
    : colonist.dose > RADIATION.HEALTHY_MAX_MSV ? 'high' : 'healthy';
  if (acuteDose >= RADIATION.ACUTE_MSV) addDisease(colonist, 'radiationAcute');
  return acuteDose;
}

const DOSE_SOURCE_CAUSE_KEYS = Object.freeze({
  surface: 'doseSourceSurface',
  dust: 'doseSourceDust',
  radon: 'doseSourceRadon',
});

// Like the other alerts, a dose source is announced once per episode and per
// colonist: the dose not yet announced must reach SOURCE_ALERT_MSV, and the
// episode only closes after RESOLVED_REEMIT_TICKS without dose from that
// source. A caller that logs its own alert (dust breach) passes notify = false,
// so its dose counts as announced.
function recordDoseSource(sim, colonist, amount, source, notify) {
  colonist.doseSourceAlerts ??= {};
  const previous = colonist.doseSourceAlerts[source];
  const continuing = previous && sim.tick - previous.lastDoseTick < ALERTS.RESOLVED_REEMIT_TICKS;
  // Saves made before this rule announced each exposure as soon as it began.
  let announced = Boolean(continuing && (previous.announced ?? true));
  let pendingDose = announced ? 0 : (previous?.pendingDose ?? 0) + amount;
  if (!announced && (!notify || pendingDose >= RADIATION.SOURCE_ALERT_MSV)) {
    if (notify) {
      const dose = Math.round(((colonist.dose ?? 0) + amount) * 100) / 100;
      sim.log('warning', 'alertDoseSource', {
        name: colonist.name, dose, source, cause: DOSE_SOURCE_CAUSE_KEYS[source] ?? 'risk_radiation',
      });
    }
    announced = true;
    pendingDose = 0;
  }
  colonist.doseSourceAlerts[source] = { lastDoseTick: sim.tick, announced, pendingDose };
  if (announced && sim.alertLevels.radiation !== 'danger') sim.alertLevels.radiation = 'warning';
}

// Caregiver protection also applies to dust intercepted at the entrance by
// registerDustBreach; the two factors stack, never removing absorbed dose.
function caregiverDustFactor(sim, colonist, source) {
  if (source !== 'dust') return 1;
  const factor = lawMultiplier(sim, 'careDustExposure', 1);
  if (factor === 1 || colonist.task !== 'working' || colonist.personal) return 1;
  const job = sim.jobs.find((candidate) => candidate.id === colonist.jobId);
  if (!job || job.status !== 'active' || job.type !== 'produce'
    || job.roomType !== 'infirmary' || job.colonistId !== colonist.id) return 1;
  const room = sim.excavations.find((candidate) => candidate.id === job.excavationId);
  return activeExcavation(room) && room.roomType === 'infirmary'
    && insideExcavation(sim, room, colonist.x, colonist.y) ? factor : 1;
}

export function addDose(sim, colonist, amount, source = 'surface', notify = true) {
  if (!colonist || colonist.health <= 0 || !Number.isFinite(amount) || amount <= 0) return 0;
  amount *= caregiverDustFactor(sim, colonist, source);
  recordDoseSource(sim, colonist, amount, source, notify);
  colonist.dose = Math.max(0, colonist.dose ?? 0) + amount;
  colonist.doseHistory ??= [];
  colonist.doseHistory.push({ tick: sim.tick, amount, source });
  refreshDoseStatus(sim, colonist);
  return amount;
}

export function registerDustBreach(sim, colonistIds = []) {
  if (sim.tick - (sim.radiation.lastDustBreachTick ?? -Infinity) < RADIATION.DUST_CLOUD_TICKS) return false;
  sim.radiation.lastDustBreachTick = sim.tick;
  sim.radiation.shelterDust = (sim.radiation.shelterDust ?? 0) + 1;
  const dose = RADIATION.DUST_BREACH_MSV * lawMultiplier(sim, 'carriedDustExposure', 1);
  const ids = new Set(colonistIds);
  for (const colonist of sim.colonists) {
    if (colonist.health <= 0) continue;
    addDose(sim, colonist, dose * (ids.size === 0 || ids.has(colonist.id) ? 1 : 0.25), 'dust', false);
  }
  sim.events?.push({ type: 'dustBreach', tick: sim.tick, dose, colonistIds: [...ids].sort((a, b) => a - b) });
  sim.log('warning', 'alertDustBreach', { dose });
  return true;
}

export function setExodusZone(sim, order) {
  const x = Math.max(0, Math.min(sim.world.width - 1, Math.round(order.x ?? sim.radiation.selectedX)));
  const threshold = Number(order.threshold);
  sim.radiation.selectedX = x;
  if (Number.isFinite(threshold) && threshold > 0) sim.radiation.safeThreshold = threshold;
  sim.radiation.safeTick = safeDateTick(sim);
  sim.radiation.safeDay = sim.radiation.safeTick / TIME.TICKS_PER_DAY;
  return { ok: true, x, threshold: sim.radiation.safeThreshold, safeTick: sim.radiation.safeTick };
}

export function initializeRadiation(sim) {
  sim.radiation ??= {};
  sim.radiation.hotspots ??= createHotspots(sim.seed, sim.world.width);
  const hatch = sim.doors.find((door) => door.kind === 'hatch');
  sim.radiation.selectedX ??= hatch?.x ?? 48;
  sim.radiation.safeThreshold ??= RADIATION.SAFE_RATE;
  sim.radiation.shelterDust ??= 0;
  sim.radiation.waterContamination ??= 0;
  sim.radiation.surfaceDose ??= surfaceDoseRate(sim);
  sim.radiation.safeTick ??= safeDateTick(sim);
  sim.radiation.safeDay ??= sim.radiation.safeTick / TIME.TICKS_PER_DAY;
}

function touchesGranite(sim, excavation) {
  for (const index of excavation.dugCells ?? []) {
    const { x, y } = sim.world.coords(index);
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!sim.world.inBounds(xx, yy)) continue;
      const neighbor = sim.world.index(xx, yy);
      if (sim.world.states[neighbor] === CELL.SOLID && sim.world.materials[neighbor] === MATERIAL.GRANITE) return true;
    }
  }
  return false;
}

const graniteContacts = new WeakMap();

function updateRadon(sim) {
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation)) {
      excavation.radon = 0;
      continue;
    }
    let contact = graniteContacts.get(excavation);
    if (!contact || contact.world !== sim.world || contact.revision !== sim.world.revision
      || contact.dugLength !== excavation.dugCells?.length) {
      contact = { world: sim.world, revision: sim.world.revision,
        dugLength: excavation.dugCells?.length, exposed: touchesGranite(sim, excavation) };
      graniteContacts.set(excavation, contact);
    }
    excavation.radonRevision = sim.world.revision;
    const sealed = excavation.coating === 'waterproof'
      || excavation.lining === 'shotcrete' || excavation.lining === 'boltsShotcrete';
    const ventilation = Math.max(0, excavation.airSupplyRate ?? 0);
    const divisor = (1 + RADIATION.RADON_VENTILATION_FACTOR * ventilation)
      * (sealed ? RADIATION.RADON_SEAL_DIVISOR : 1);
    excavation.radon = contact.exposed && excavation.coating !== 'leadLining' ? RADIATION.RCS / divisor : 0;
  }
}

export function ventilationDustDoseRate(sim, excavation) {
  if (!activeExcavation(excavation)) return 0;
  const supply = Math.max(0, excavation?.unfilteredAirSupplyRate ?? 0);
  const ageTicks = Math.max(0, sim.tick - TIME.START_HOUR * TIME.TICKS_PER_HOUR);
  const decay = 1 + ageTicks / RADIATION.VENTILATION_DUST_DECAY_TICKS;
  const weatherFactor = sim.weather?.current === 'dustStorm' ? WEATHER.DUST_DOSE_FACTOR : 1;
  return RADIATION.VENTILATION_DUST_MSV_PER_HOUR * supply * weatherFactor / decay;
}

function updateMonthlyIllness(sim, colonist) {
  colonist.nextRadiationIllnessTick ??= sim.tick + RADIATION.MONTHLY_ILLNESS_TICKS;
  if (sim.tick < colonist.nextRadiationIllnessTick) return;
  const month = Math.floor(sim.tick / RADIATION.MONTHLY_ILLNESS_TICKS);
  const months = Math.max(1, Math.floor((sim.tick - colonist.nextRadiationIllnessTick) / RADIATION.MONTHLY_ILLNESS_TICKS) + 1);
  colonist.nextRadiationIllnessTick += months * RADIATION.MONTHLY_ILLNESS_TICKS;
  const risk = Math.max(0, Math.min(1, (colonist.dose ?? 0) / RADIATION.ACUTE_MSV
    * TIME.TICKS_PER_DAY / RADIATION.MONTHLY_ILLNESS_TICKS));
  const rng = new RNG(hashString(`${sim.seed}:radiation-illness:${colonist.id}:${month}`));
  if (!rng.chance(risk) || !addDisease(colonist, 'radiationIllness')) return;
  sim.events?.push({ type: 'radiationIllness', tick: sim.tick, colonistId: colonist.id, dose: colonist.dose });
  sim.log('warning', 'alertRadiationIllness', { name: colonist.name, dose: Math.round(colonist.dose * 100) / 100 });
}

function setRadiationAlert(sim, colonist, level) {
  const previous = colonist.radiationAlertLevel ?? null;
  if (level !== null && previous === null) colonist.radiationWarningSince = sim.tick;
  colonist.radiationAlertLevel = level;
  if (level === null) {
    colonist.radiationWarningSince = null;
    if (previous !== null) colonist.radiationAlertResolvedTick = sim.tick;
    return;
  }
  if (level === previous) return;
  const rank = { null: 0, warning: 1, danger: 2 };
  const resolvedTick = colonist.radiationAlertResolvedTick ?? -Infinity;
  const journalLevel = colonist.radiationAlertJournalLevel ?? null;
  const newEpisode = previous === null && sim.tick - resolvedTick >= ALERTS.RESOLVED_REEMIT_TICKS;
  const escalation = rank[level] > rank[previous] && rank[level] > rank[journalLevel];
  if (!newEpisode && !escalation) return;
  const dose = Math.round(colonist.acuteDose * 100) / 100;
  if (level === 'danger' && previous === null && (newEpisode || journalLevel === null)) {
    sim.log('warning', 'alertRadiationYellow', { name: colonist.name, dose });
  }
  sim.log(level === 'danger' ? 'error' : 'warning', level === 'danger' ? 'alertRadiationRed' : 'alertRadiationYellow', {
    name: colonist.name, dose,
  });
  colonist.radiationAlertJournalLevel = level;
  if (level === 'danger') sim.emergency = true;
}

export function updateRadiation(sim) {
  sim.radiation.surfaceDose = surfaceDoseRate(sim);
  if (sim.tick % TIME.TICKS_PER_HOUR === 0 || sim.radiation.safeTick === undefined) {
    sim.radiation.safeTick = safeDateTick(sim);
    sim.radiation.safeDay = sim.radiation.safeTick / TIME.TICKS_PER_DAY;
  }
  updateRadon(sim);
  let colonyLevel = null;
  const acuteDamage = RADIATION.ACUTE_DAMAGE_PER_DAY * researchEffect(sim, 'radiationCare', 1) / TIME.TICKS_PER_DAY;
  for (const colonist of sim.colonists) {
    if (colonist.health <= 0) continue;
    const acuteDose = refreshDoseStatus(sim, colonist);
    const alertLevel = acuteDose >= RADIATION.ACUTE_MSV ? 'danger'
      : acuteDose >= RADIATION.ACUTE_WARNING_MSV ? 'warning' : null;
    setRadiationAlert(sim, colonist, alertLevel);
    if (alertLevel === 'danger') colonyLevel = 'danger';
    else if (alertLevel === 'warning' && colonyLevel !== 'danger') colonyLevel = 'warning';
    if (acuteDose >= RADIATION.ACUTE_MSV && colonist.radiationWarningSince !== null
      && sim.tick - colonist.radiationWarningSince >= RADIATION.ACUTE_DAMAGE_DELAY_TICKS) {
      colonist.health = Math.max(0, colonist.health - acuteDamage);
      colonist.lastDamageCauses = ['radiationAcute'];
    }
    updateMonthlyIllness(sim, colonist);
    if (colonist.y >= WORLD.SURFACE_Y) {
      colonist.unauthorizedSurface = false;
      const room = excavationAt(sim, colonist.x, colonist.y);
      if (room?.radon > 0) addDose(sim, colonist, room.radon / TIME.TICKS_PER_HOUR, 'radon');
      const ventilationDust = ventilationDustDoseRate(sim, room);
      if (ventilationDust > 0) addDose(sim, colonist, ventilationDust / TIME.TICKS_PER_HOUR, 'dust');
      continue;
    }
    if (!colonist.surfaceCrewId) {
      if (!colonist.unauthorizedSurface) registerDustBreach(sim, [colonist.id]);
      colonist.unauthorizedSurface = true;
    }
    const protection = suitProtection(sim, colonist);
    addDose(sim, colonist, surfaceDoseRate(sim, colonist.x) * (1 - protection) / TIME.TICKS_PER_HOUR, 'surface');
  }
  const sourceExposure = sim.colonists.some((colonist) => colonist.health > 0
    && Object.values(colonist.doseSourceAlerts ?? {})
      .some((entry) => entry.lastDoseTick === sim.tick && entry.announced !== false));
  if (sourceExposure && colonyLevel !== 'danger') colonyLevel = 'warning';
  sim.alertLevels.radiation = colonyLevel;
}

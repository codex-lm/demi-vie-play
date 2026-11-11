import { TIME } from '../data/balance.js';
import { excavationAt } from './networks.js';

const STRUCTURAL_ALERTS = new Set(['eventCrack', 'eventDust', 'eventDanger']);
const ROOM_ALERT_CODES = new Set([
  'alertAirYellow', 'alertAirRed', 'alertColdYellow', 'alertColdRed',
  'alertHeatYellow', 'alertHeatRed', 'alertFloodYellow', 'alertFloodRed',
  'alertSmokeYellow', 'alertSmokeRed', 'alertMethaneYellow', 'alertMethaneRed',
  'alertWaterPocketYellow', 'alertWaterPocketRed', 'alertRescueRed',
]);
const STOCK_ALERT_CODES = new Set([
  'alertFoodYellow', 'alertFoodRed', 'alertWaterYellow', 'alertWaterRed',
  'alertFiltersYellow', 'alertFiltersRed', 'eventColdSettling',
]);
const COLONIST_ALERT_CODES = new Set([
  'alertOldAgeYellow', 'alertOldAgeRed', 'alertFallYellow', 'alertFallRed',
  'alertRadiationYellow', 'alertRadiationRed', 'alertSuddenImmersionRed',
]);
const ALERT_CAUSES = Object.freeze({
  alertRescueRed: ['collapse', 'starvation', 'dehydration'],
  alertFoodYellow: ['starvation'], alertFoodRed: ['starvation'],
  alertWaterYellow: ['dehydration'], alertWaterRed: ['dehydration'],
  alertFiltersYellow: ['dehydration'], alertFiltersRed: ['dehydration'],
  eventColdSettling: ['hypothermia'],
  alertAirYellow: ['air'], alertAirRed: ['air'],
  alertColdYellow: ['hypothermia'], alertColdRed: ['hypothermia'],
  alertHeatYellow: ['hyperthermia'], alertHeatRed: ['hyperthermia'],
  alertFloodYellow: ['drowning'], alertFloodRed: ['drowning'],
  alertSuddenImmersionRed: ['drowning', 'suddenImmersion'],
  alertWaterPocketYellow: ['drowning'], alertWaterPocketRed: ['drowning'],
  alertSmokeYellow: ['smoke'], alertSmokeRed: ['smoke'],
  alertMethaneYellow: ['methane'], alertMethaneRed: ['methane'],
  alertOldAgeYellow: ['oldAge'], alertOldAgeRed: ['oldAge'],
  alertFallYellow: ['fall'], alertFallRed: ['fall'],
  alertRadiationYellow: ['radiation', 'radiationAcute'],
  alertRadiationRed: ['radiation', 'radiationAcute'],
});
const TIMED_WARNING_CAUSES = new Set([
  'starvation', 'dehydration', 'air', 'hypothermia', 'hyperthermia', 'drowning',
  'smoke', 'methane', 'radiation', 'radiationAcute', 'collapse', 'rockfall',
]);

function initializeCauses(sim) {
  sim.m5 ??= {};
  sim.m5.causes ??= {};
  sim.m5.causes.alerts ??= [];
  sim.m5.causes.deaths ??= [];
  sim.m5.causes.collapses ??= [];
}

function explicitTargets(sim, entry) {
  const params = { ...(entry.params ?? {}) };
  if ((ROOM_ALERT_CODES.has(entry.code) || STRUCTURAL_ALERTS.has(entry.code))
    && params.excavationId === undefined && params.id !== undefined) params.excavationId = params.id;
  if (COLONIST_ALERT_CODES.has(entry.code) && params.colonistId === undefined && params.name !== undefined) {
    const matches = (sim.colonists ?? []).filter((colonist) => colonist.name === params.name);
    if (matches.length === 1) params.colonistId = matches[0].id;
  }
  entry.params = params;
  return params;
}

export function captureJournal(sim, entry) {
  initializeCauses(sim);
  const alert = entry.code?.startsWith('alert') && ['warning', 'error', 'danger'].includes(entry.level);
  const oldAgeWarning = entry.code === 'eventStoryWarning' && entry.level === 'warning'
    && entry.params?.eventType === 'oldAge' && Number.isInteger(entry.params?.colonistId);
  if (!alert && !STRUCTURAL_ALERTS.has(entry.code) && !oldAgeWarning) return;
  explicitTargets(sim, entry);
  sim.m5.causes.alerts.push({ ...entry, params: { ...entry.params } });
  if (entry.code === 'alertRescueRed') {
    const source = sim.excavation(entry.params.excavationId);
    const collapse = sim.m5.causes.collapses.findLast((report) => source?.collapseReportId
      ? report.id === source.collapseReportId : report.excavationId === entry.params.excavationId);
    if (collapse && !collapse.steps.some((step) => step.id === entry.id)) collapse.steps.push({ ...entry, params: { ...entry.params } });
  }
  if (sim.m5.causes.alerts.length > 1000) sim.m5.causes.alerts.shift();
}

function causesForEntry(entry) {
  if (entry.code === 'eventStoryWarning' && entry.params?.eventType === 'oldAge') return ['oldAge'];
  if (STRUCTURAL_ALERTS.has(entry.code)) return ['collapse', 'rockfall'];
  return ALERT_CAUSES[entry.code] ?? [];
}

function relatedToDeath(entry, report) {
  const params = entry.params ?? {};
  const causes = causesForEntry(entry).filter((cause) => report.causes.includes(cause));
  if (report.causes.length === 0) return params.colonistId === report.colonistId;
  if (causes.length === 0) return false;
  if (entry.code === 'alertRescueRed' && !params.colonistIds?.includes(report.colonistId)) return false;
  if (STOCK_ALERT_CODES.has(entry.code)) return true;
  if (COLONIST_ALERT_CODES.has(entry.code) || entry.code === 'eventStoryWarning') {
    return params.colonistId === report.colonistId;
  }
  if (params.excavationId === null && Number.isInteger(params.colonistId)) {
    return params.colonistId === report.colonistId;
  }
  if (STRUCTURAL_ALERTS.has(entry.code) && report.collapseId != null) {
    return params.excavationId === report.collapseId;
  }
  return params.excavationId !== undefined && params.excavationId === report.excavationId;
}

export function hasYellowWarning(report) {
  if (!report) return false;
  const causes = report.causes ?? [];
  // Exception explicite (décision de Demi-Vie), limitée à la cause soudaine : une
  // mort par immersion soudaine n'a pas de jaune de 24 h. Seul le rouge soudain
  // de CET habitant, journalisé avant son premier dégât soudain, tient lieu
  // d'annonce — un blessé peut mourir avant deux heures. Toutes les autres
  // causes du même rapport gardent leur exigence de jaune.
  if (causes.includes('suddenImmersion')) {
    const announced = (report.steps ?? []).some((entry) => entry.code === 'alertSuddenImmersionRed'
      && entry.level === 'danger'
      && entry.params?.colonistId === report.colonistId
      && relatedToDeath(entry, report)
      && entry.tick < (report.firstSuddenDamageTick ?? report.tick));
    if (!announced) return false;
    // Injuries and infections never carry an alert: only the other causes that
    // the game can announce keep their yellow requirement.
    if (!causes.some((cause) => cause !== 'suddenImmersion' && TIMED_WARNING_CAUSES.has(cause))) return true;
  }
  return (report.steps ?? []).some((entry) => {
    if (entry.level !== 'warning' || entry.tick > report.tick || !relatedToDeath(entry, report)) return false;
    const direct = causesForEntry(entry).some((cause) => causes.includes(cause) && TIMED_WARNING_CAUSES.has(cause));
    return !direct || report.tick - entry.tick >= TIME.TICKS_PER_DAY;
  });
}

export function recordDeath(sim, colonist) {
  initializeCauses(sim);
  if (colonist.deathReport) return colonist.deathReport;
  const excavationId = colonist.trappedIn ?? colonist.isolatedByCollapse ?? colonist.collapseId ?? excavationAt(sim, colonist.x, colonist.y)?.id ?? null;
  const collapseId = colonist.trappedIn ?? colonist.isolatedByCollapse ?? colonist.collapseId ?? null;
  const report = {
    id: `death-${colonist.id}-${sim.tick}`,
    colonistId: colonist.id,
    name: colonist.name,
    excavationId,
    collapseId: sim.excavation(collapseId)?.originalExcavationId ?? sim.excavation(collapseId)?.collapseSourceId ?? collapseId,
    tick: sim.tick,
    causes: (colonist.lastDamageCauses ?? []).map((cause) => cause.code ?? cause),
    firstSuddenDamageTick: colonist.firstSuddenDamageTick ?? null,
    acceptedDilemmaId: colonist.acceptedDilemmaId ?? null,
    acceptedDilemmaDefinitionId: colonist.acceptedDilemmaDefinitionId ?? null,
    steps: [],
  };
  report.steps = sim.m5.causes.alerts.filter((entry) => entry.tick <= sim.tick && relatedToDeath(entry, report));
  sim.m5.causes.deaths.push(report);
  colonist.deathReport = report;
  return report;
}

export function recordCollapse(sim, excavation, parent = null) {
  initializeCauses(sim);
  if (excavation.collapseReport) return excavation.collapseReport;
  const parentExcavationId = parent?.id ?? excavation.collapseCauseId ?? null;
  const parentReport = sim.m5.causes.collapses.find((report) => report.excavationId === parentExcavationId) ?? null;
  const baseId = `collapse-${excavation.id}-${sim.tick}`;
  // Several tunnel slices can fail in the same tick. Their rescue alerts must
  // still identify one exact collapse report after a save/reload.
  const id = sim.m5.causes.collapses.some((report) => report.id === baseId)
    ? `${baseId}-${sim.m5.causes.collapses.length}` : baseId;
  const report = {
    id,
    excavationId: excavation.id,
    parentExcavationId,
    tick: sim.tick,
    stress: excavation.stress ? { ...excavation.stress } : null,
    steps: [
      ...(parentReport?.steps ?? []),
      ...sim.m5.causes.alerts.filter((entry) => entry.tick <= sim.tick
        && STRUCTURAL_ALERTS.has(entry.code) && entry.params?.excavationId === excavation.id),
    ],
  };
  sim.m5.causes.collapses.push(report);
  excavation.collapseReport = report;
  return report;
}

export function initializeCauseHistory(sim) {
  initializeCauses(sim);
}

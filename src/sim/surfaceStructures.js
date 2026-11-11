import { SURFACE_STRUCTURES, SURFACE_SLOTS } from '../data/surface.js';
import { PEOPLE } from '../data/people.js';
import { TIME } from '../data/balance.js';
import { addToStock, createStock, hasResources, reserveStock, spendResources } from './resources.js';
import { baseRadiationRate, hotspotAt, surfaceDoseRate, suitProtection } from './radiation.js';
import { revealSurfaceSites, siteDefinition } from './surface.js';
import { canJoinSurfaceCrew, createSurfaceCrew, releaseSurfaceCrew, sendSurfaceCrewHome, updateSurfaceCrew } from './surfaceCrew.js';

export function builtSurfaceStructure(sim, type) {
  return (sim.surface?.structures ?? []).find((structure) => structure.type === type && structure.state === 'built') ?? null;
}

export function previewSurfaceConstruction(sim, order) {
  const definition = SURFACE_STRUCTURES[order.structureType];
  const x = Math.round(order.x);
  if (!definition || !SURFACE_SLOTS.includes(x)) return { ok: false, error: 'invalidPlacement' };
  if (sim.surface.structures.some((structure) => structure.x === x && structure.state !== 'collapsed')) return { ok: false, error: 'overlap' };
  if (!hasResources(sim, definition.cost)) return { ok: false, error: 'noResources' };
  const colonistIds = sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.surfaceCrewId
    && (colonist.age ?? PEOPLE.ADULT_AGE) >= PEOPLE.MINIMUM_WORK_AGE && canJoinSurfaceCrew(sim, colonist))
    .slice(0, definition.crew).map((colonist) => colonist.id);
  if (colonistIds.length < definition.crew) return { ok: false, error: 'expeditionUnavailable' };
  const protection = suitProtection(sim, { suit: true });
  const dosePerWorker = surfaceDoseRate(sim, x) * definition.workHours * (1 - protection);
  return {
    ok: true,
    preview: {
      structureType: order.structureType,
      x,
      cost: { ...definition.cost },
      colonistIds,
      workHours: definition.workHours,
      requiredTicks: definition.workHours * TIME.TICKS_PER_HOUR,
      previewTick: sim.tick,
      dosePerWorker,
      risks: ['radiation'],
    },
  };
}

export function startSurfaceConstruction(sim, order) {
  const checked = previewSurfaceConstruction(sim, { ...order, x: order.x });
  if (!checked.ok) return checked;
  if (order.confirmedDose !== true || order.previewTick !== sim.tick) {
    return { ok: false, error: 'surfaceDoseConfirmationRequired', preview: checked.preview };
  }
  const preview = checked.preview;
  if (!spendResources(sim, preview.cost)) return { ok: false, error: 'noResources' };
  const id = sim.surface.nextStructureId++;
  const structure = {
    id,
    type: preview.structureType,
    x: preview.x,
    state: 'building',
    workTicks: 0,
    requiredTicks: preview.requiredTicks,
    colonistIds: preview.colonistIds,
    dosePreview: preview.dosePerWorker,
    paidCost: { ...preview.cost },
    crew: createSurfaceCrew(sim, { id: `construction-${id}`, kind: 'construction', colonistIds: preview.colonistIds, destinationX: preview.x }),
  };
  sim.surface.structures.push(structure);
  return { ok: true, structure, preview };
}

function updateGeiger(sim, structure) {
  structure.localDoseRate = surfaceDoseRate(sim, structure.x);
  structure.hotspotMultiplier = hotspotAt(sim, structure.x);
  sim.radiation.hotspotsRevealed = true;
  sim.surface.hotspotsRevealed = true;
  if (structure.measuredTick !== undefined && sim.tick - structure.measuredTick < TIME.TICKS_PER_HOUR) return;
  structure.measuredTick = sim.tick;
  const baseRate = baseRadiationRate(sim.tick);
  sim.surface.geigerReadings = sim.radiation.hotspots.map((hotspot) => ({
    x: hotspot.x,
    multiplier: hotspot.multiplier,
    doseRate: baseRate * hotspot.multiplier,
  }));
}

function updateRainCollector(sim, structure) {
  // Older saves could only contain black-rain water.
  structure.waterQuality ??= 'radioactive';
  structure.storedWater ??= 0;
  structure.collectedWater ??= 0;
  if (sim.weather.current === 'blackRain' || sim.weather.current === 'rain') {
    const incomingQuality = sim.weather.current === 'blackRain' ? 'radioactive' : 'dirty';
    if (structure.storedWater === 0 || incomingQuality === 'radioactive') structure.waterQuality = incomingQuality;
    structure.storedWater += SURFACE_STRUCTURES.rainCollector.waterPerDay / TIME.TICKS_PER_DAY;
  }
  if (structure.storedWater <= 0) return;
  const stock = reserveStock(sim, structure.x, sim.surface.hatch.y);
  if (!stock) return;
  const amount = structure.storedWater;
  addToStock(stock, structure.waterQuality === 'radioactive' ? 'waterRadioactive' : 'waterDirty', amount);
  structure.storedWater = 0;
  structure.collectedWater += amount;
}

function updateLookout(sim, structure) {
  const before = new Set(sim.surface.sites.filter((site) => site.revealed).map((site) => site.id));
  revealSurfaceSites(sim);
  const revealedByLookout = new Set(structure.revealedSiteIds ?? []);
  for (const site of sim.surface.sites) {
    if (site.revealed && !before.has(site.id)) revealedByLookout.add(site.id);
  }
  structure.revealedSiteIds = [...revealedByLookout];
  structure.riskReports = [];
  for (const site of sim.surface.sites) {
    if (!site.revealed) continue;
    const definition = siteDefinition(site.id);
    site.riskKnown = true;
    site.risk = definition.encounterChance >= 0.3 ? 'raiders' : 'injury';
    structure.riskReports.push({ siteId: site.id, risk: site.risk, encounterChance: definition.encounterChance });
  }
}

function updateBuiltStructure(sim, structure) {
  if (structure.type === 'geiger') updateGeiger(sim, structure);
  else if (structure.type === 'rainCollector') updateRainCollector(sim, structure);
  else if (structure.type === 'lookout') updateLookout(sim, structure);
}

export function updateSurfaceStructures(sim) {
  for (const structure of sim.surface.structures) {
    let phase = structure.crew ? updateSurfaceCrew(sim, structure.crew) : 'inside';
    if (structure.state === 'building' && structure.crew?.childRecall) {
      // There is no resume order for a surface site. Refund its reserved kit and
      // free the slot while the former crew returns by the normal route.
      let stock = reserveStock(sim, sim.surface.hatch.x, sim.surface.hatch.y);
      if (!stock) {
        stock = createStock(`surface-refund-${structure.id}`, sim.surface.hatch.x, sim.surface.hatch.y);
        sim.stocks.push(stock);
      }
      for (const [resource, amount] of Object.entries(structure.paidCost ?? SURFACE_STRUCTURES[structure.type]?.cost ?? {})) {
        addToStock(stock, resource, amount);
      }
      structure.state = 'collapsed';
      structure.cancelReason = 'underageCrew';
      continue;
    }
    if (structure.state === 'building' && phase === 'lost') {
      structure.state = 'lost';
      releaseSurfaceCrew(sim, structure.crew);
      continue;
    }
    if (structure.state === 'building') {
      if (phase === 'surface' && !structure.crew.returning) structure.workTicks += 1;
      if (structure.workTicks >= structure.requiredTicks) {
        structure.workTicks = structure.requiredTicks;
        structure.state = 'built';
        structure.completedTick = sim.tick;
        sendSurfaceCrewHome(structure.crew);
        sim.log('info', 'eventSurfaceBuilt', { type: structure.type }, { x: structure.x, y: sim.surface.hatch.y });
      }
      continue;
    }
    if (structure.state !== 'built') continue;
    if (phase === 'inside' && structure.crew && structure.crew.colonistIds.some((id) => sim.colonists.find((colonist) => colonist.id === id)?.surfaceCrewId === structure.crew.id)) {
      releaseSurfaceCrew(sim, structure.crew);
      phase = 'inside';
    }
    updateBuiltStructure(sim, structure);
  }
}

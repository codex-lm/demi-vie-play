import { SITE_DEPLETION, SURFACE_SITES } from '../data/surface.js';

export function surfaceHatch(sim) {
  const door = sim.doors.find((candidate) => candidate.kind === 'hatch') ?? null;
  const excavation = sim.excavations.find((room) => room.label === 'accessShaft' || room.manualVentilation) ?? null;
  return { door, excavation, x: door?.x ?? excavation?.x ?? 48, y: door?.y ?? 12 };
}

export function siteDefinition(siteId) {
  return SURFACE_SITES.find((site) => site.id === siteId) ?? null;
}

// Fraction du butin de départ encore disponible sur ce lieu (1 = intact).
export function siteLootFactor(site) {
  return Number.isFinite(site?.depletion) ? site.depletion : 1;
}

export function revealedSites(sim) {
  return (sim.surface?.sites ?? []).filter((site) => site.revealed);
}

export function revealSurfaceSites(sim) {
  const completed = sim.expeditions?.completed ?? 0;
  const lookout = (sim.surface?.structures ?? []).some((structure) => structure.type === 'lookout' && structure.state === 'built') ? 1 : 0;
  for (const site of sim.surface.sites) {
    const definition = siteDefinition(site.id);
    if (!site.revealed && completed + lookout >= definition.revealAfter) site.revealed = true;
  }
}

export function initializeSurface(sim) {
  sim.surface ??= {};
  const hatch = surfaceHatch(sim);
  sim.surface.hatch ??= { x: hatch.x, y: hatch.y, excavationId: hatch.excavation?.id ?? null, doorId: hatch.door?.id ?? null };
  sim.surface.sites ??= SURFACE_SITES.map((site) => ({ id: site.id, revealed: site.revealAfter === 0, visits: 0 }));
  for (const site of sim.surface.sites) site.depletion ??= 1;
  sim.surface.structures ??= [];
  sim.surface.nextStructureId ??= 1;
  revealSurfaceSites(sim);
}

// Chaque visite épuise un peu le lieu ; il se refait très lentement avec le temps.
export function depleteSite(sim, site) {
  site.visits = (site.visits ?? 0) + 1;
  site.depletion = Math.max(SITE_DEPLETION.FLOOR, siteLootFactor(site) * SITE_DEPLETION.VISIT_FACTOR);
}

export function regenerateSurfaceSites(sim) {
  for (const site of sim.surface?.sites ?? []) {
    site.depletion = Math.min(1, siteLootFactor(site) + SITE_DEPLETION.REGEN_PER_DAY);
  }
}

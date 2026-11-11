import { WATER } from '../data/balance.js';
import { RESEARCH_POINTS_PER_WORKER_TICK, researchDefinition } from '../data/research.js';
import { roomDefinition } from '../data/rooms.js';
import { requestRoomResources } from './jobs.js';
import { insideExcavation } from './networks.js';
import { ensureRoomStock, hasResources, spendResources } from './resources.js';
import { starvingWorkFactor } from './condition.js';

function usableLab(excavation) {
  if (!excavation || excavation.roomType !== 'lab' || excavation.state === 'collapsed'
    || (excavation.state !== 'fitted' && !excavation.initial) || excavation.disabled
    || (excavation.floodRatio ?? 0) > WATER.FLOOD_UNUSABLE_RATIO) return false;
  const definition = roomDefinition('lab');
  return definition.powerKw <= 0 || (excavation.powered && !excavation.powerShed);
}

function labs(sim) {
  return sim.excavations.filter(usableLab).sort((a, b) => a.id - b.id);
}

function presentWorkers(sim, excavation, counted) {
  let count = 0;
  for (const job of sim.jobs) {
    if (job.type !== 'produce' || job.excavationId !== excavation.id || job.status !== 'active') continue;
    const colonist = sim.colonists.find((person) => person.id === job.colonistId);
    if (!colonist || colonist.health <= 0 || counted.has(colonist.id)) continue;
    if (!insideExcavation(sim, excavation, colonist.x, colonist.y)) continue;
    counted.add(colonist.id);
    // Un affamé au maximum de la faim ne compte que pour une fraction d'ouvrier.
    count += starvingWorkFactor(colonist);
  }
  return count;
}

function payForCurrentResearch(sim, current, node, availableLabs) {
  if (current.booksPaid) return true;
  const lab = availableLabs.find((excavation) => excavation.id === current.labId) ?? availableLabs[0];
  if (!lab) return false;
  const stock = ensureRoomStock(sim, lab);
  requestRoomResources(sim, lab, { books: node.books });
  if (!spendResources(sim, { books: node.books }, stock)) return false;
  current.labId = lab.id;
  current.booksPaid = true;
  return true;
}

export function initializeResearch(sim) {
  sim.research ??= { completed: [], current: null, points: 0 };
  sim.research.completed ??= [];
  sim.research.current ??= null;
  sim.research.points ??= 0;
  if (sim.research.current) sim.research.current.booksPaid ??= false;
}

export function isResearched(sim, id) {
  return sim.research?.completed?.includes(id) ?? false;
}

export function researchEffect(sim, key, fallback = 0) {
  let value = fallback;
  for (const id of sim.research?.completed ?? []) {
    const effect = researchDefinition(id)?.effects?.[key];
    if (effect !== undefined) value = effect;
  }
  return value;
}

export function startResearch(sim, nodeId) {
  initializeResearch(sim);
  const node = researchDefinition(nodeId);
  if (!node || isResearched(sim, nodeId) || sim.research.current) return { ok: false, error: 'researchUnavailable' };
  if (!node.prerequisites.every((id) => isResearched(sim, id))) return { ok: false, error: 'researchPrerequisite' };
  const availableLabs = labs(sim);
  if (availableLabs.length === 0) return { ok: false, error: 'researchNoLab' };
  if (!hasResources(sim, { books: node.books })) return { ok: false, error: 'researchNoBooks' };
  const lab = availableLabs[0];
  sim.research.current = { nodeId, progress: 0, labId: lab.id, booksPaid: false, status: 'waitingBooks' };
  payForCurrentResearch(sim, sim.research.current, node, availableLabs);
  if (sim.research.current.booksPaid) sim.research.current.status = 'noWorkers';
  return { ok: true, node };
}

export function updateResearch(sim) {
  initializeResearch(sim);
  const current = sim.research.current;
  if (!current) return sim.research;
  const node = researchDefinition(current.nodeId);
  if (!node || isResearched(sim, node.id)) {
    sim.research.current = null;
    return sim.research;
  }
  const availableLabs = labs(sim);
  if (availableLabs.length === 0) {
    current.status = 'noLab';
    return sim.research;
  }
  if (!payForCurrentResearch(sim, current, node, availableLabs)) {
    current.status = 'waitingBooks';
    return sim.research;
  }
  const counted = new Set();
  const workers = availableLabs.reduce((total, lab) => total + presentWorkers(sim, lab, counted), 0);
  if (workers === 0) {
    current.status = 'noWorkers';
    return sim.research;
  }
  const gained = workers * RESEARCH_POINTS_PER_WORKER_TICK * researchEffect(sim, 'researchFactor', 1);
  current.progress = Math.min(node.points, current.progress + gained);
  sim.research.points += gained;
  current.status = 'researching';
  if (current.progress + 1e-9 < node.points) return sim.research;
  sim.research.completed.push(node.id);
  sim.research.current = null;
  const focus = sim.excavation(current.labId) ?? availableLabs[0];
  sim.log('info', 'eventResearchComplete', { nodeId: node.id }, focus);
  return sim.research;
}

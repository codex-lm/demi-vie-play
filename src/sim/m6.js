import { initializeObjectives, recordNotebookOrder, setNotebookSpeed, updateObjectives } from './objectives.js';
import { initializeSouvenirs, updateSouvenirs } from './souvenirs.js';

export function initializeM6(sim, options = {}) {
  sim.m6 ??= {};
  sim.m6.souvenirs ??= [];
  sim.m6.nextSouvenirId ??= 0;
  sim.m6.notebook ??= {
    completedIds: [],
    lastOrderTick: sim.tick,
    speed: 1,
    idleSince: null,
    suggestionObjectiveId: null,
    lastSuggestionTick: null,
  };
  sim.m6.balanceProfile = options.balanceProfile ?? sim.m6.balanceProfile ?? 'm6';
  initializeSouvenirs(sim);
  initializeObjectives(sim);
}

export function updateM6(sim) {
  if (sim.m6?.balanceProfile === 'baseline') return;
  updateSouvenirs(sim);
  updateObjectives(sim);
}

export function recordM6Order(sim, order, result) {
  return recordNotebookOrder(sim, order, result);
}

export function setM6Speed(sim, speed) {
  return setNotebookSpeed(sim, speed);
}

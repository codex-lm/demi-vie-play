import { initializeCalendar, updateCalendar } from './seasons.js';
import { initializeStoryteller, updateStoryteller } from './storyteller.js';
import { chooseDilemma, initializeDilemmas, updateDilemmas } from './dilemmas.js';
import { choosePoiEncounter, domesticateAnimals, exploreAnnex, initializePois, scanSonar, updatePois } from './poi.js';
import { applyRadioOrder, initializeRadio, updateRadio } from './radio.js';
import { updateRescues } from './rescue.js';
import { applyHazardOrder, initializeHazards, updateHazards } from './hazards.js';
import { captureJournal, initializeCauseHistory } from './causes.js';

export { captureJournal } from './causes.js';

export function initializeM5(sim, options = {}) {
  sim.m5 ??= {};
  initializeCalendar(sim);
  initializeStoryteller(sim, options);
  initializeDilemmas(sim);
  initializeRadio(sim);
  initializePois(sim);
  initializeHazards(sim);
  initializeCauseHistory(sim);
}

export function updateM5Clock(sim) {
  updateCalendar(sim);
}

export function updateM5(sim) {
  updateStoryteller(sim);
  updateDilemmas(sim);
  updateRadio(sim);
  updateRescues(sim);
  updatePois(sim);
  updateHazards(sim);
}

export function applyM5(sim, order) {
  if (order.type === 'sonarScan') return scanSonar(sim, order);
  if (order.type === 'dilemmaChoice') return chooseDilemma(sim, order);
  if (order.type === 'poiEncounterChoice') return choosePoiEncounter(sim, order);
  if (order.type === 'annexExplore') return exploreAnnex(sim, order.annexId);
  if (order.type === 'domesticateAnimals') return domesticateAnimals(sim, order.poiId);
  const radioResult = applyRadioOrder(sim, order);
  if (radioResult) return radioResult;
  return applyHazardOrder(sim, order);
}

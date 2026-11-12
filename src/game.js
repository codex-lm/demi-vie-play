import { createScenario } from './data/scenarios.js';
import { Game as GameRuntime } from './gameRuntime.js';

export { AUTOSAVE_SECONDS, pausedAlpha } from './gameRuntime.js';

/** Synchronous entry point for callers that select a prepared scenario. */
export class Game extends GameRuntime {
  constructor(options) {
    super(options, options.scenario ? createScenario(options.scenario) : null);
  }
}

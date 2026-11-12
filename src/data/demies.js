import { TIME } from './balance.js';

// Presentation only: these settings never alter the simulation's rules.
export const DEMIES = Object.freeze({
  COUNT: 11,
  START_TICK: TIME.START_HOUR * TIME.TICKS_PER_HOUR,
  MOMENT_SECONDS: 3,
  DELAY_DAYS: 5,
  LOW_DOSE_MSV: 0.1,
  LOW_TRIP_DOSE: 0.1,
  LOW_DOSE_RATE: 0.01,
  DOSE_DISPLAY_MIN: 0.001,
});

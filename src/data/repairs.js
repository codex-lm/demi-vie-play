import { TIME } from './balance.js';

export const REPAIRS = Object.freeze({
  JOB_URGENCY: -7500,
  PARTS_COST: Object.freeze({ spareParts: 1 }),
  PARTS_WORK_TICKS: 2 * TIME.TICKS_PER_HOUR,
  METAL_COST: Object.freeze({ metal: 2 }),
  METAL_WORK_TICKS: 6 * TIME.TICKS_PER_HOUR,
});

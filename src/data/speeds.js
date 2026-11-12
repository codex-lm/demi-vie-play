import { TIME } from './balance.js';

// The speeds of the game clock, as multiples of TIME.TICKS_PER_SECOND_AT_X1.
// Everything here is real-time pace for the game loop, the HUD and the
// renderer: the simulation only ever counts ticks.
export const SPEED = Object.freeze({ PAUSE: 0, LIVE: 1, WORK: 10, WATCH: 30, HURRY: 100, RUSH: 300 });

/** The five running speeds, slowest first: HUD buttons and keys 1 to 5. */
export const SPEED_STEPS = Object.freeze([
  Object.freeze({ speed: SPEED.LIVE, nameKey: 'speedLive' }),
  Object.freeze({ speed: SPEED.WORK, nameKey: 'speedWork' }),
  Object.freeze({ speed: SPEED.WATCH, nameKey: 'speedWatch' }),
  Object.freeze({ speed: SPEED.HURRY, nameKey: 'speedHurry' }),
  Object.freeze({ speed: SPEED.RUSH, nameKey: 'speedRush' }),
]);

/** A new game, and a page opened without a speed, start here. */
export const DEFAULT_SPEED = SPEED.LIVE;
/** A red alert brings any faster speed down to this one (the former x1). */
export const ALERT_SPEED = SPEED.WORK;
export const TOP_SPEED = SPEED.RUSH;
/** Work gestures were drawn for this tick rate; slower speeds keep its rhythm. */
export const GESTURE_SPEED = SPEED.WORK;

// Before the "Vivre" speed the table was pause, x1, x3, x10, x30 at 24 ticks
// per second. Each old value keeps its real duration in the new table.
const LEGACY_SPEEDS = Object.freeze({ 0: SPEED.PAUSE, 1: SPEED.WORK, 3: SPEED.WATCH, 10: SPEED.HURRY, 30: SPEED.RUSH });

export function isSpeed(value) {
  return TIME.SPEEDS.includes(value);
}

/** Same real-time speed for a value of the old table, or null when it had none. */
export function speedFromLegacy(value) {
  const number = Number(value);
  return Object.hasOwn(LEGACY_SPEEDS, number) ? LEGACY_SPEEDS[number] : null;
}

/** A requested speed (page address, tool): a value of the current table as it
 * is; x3, which only the old table had, keeps its real duration; anything
 * else falls back. */
export function speedFromRequest(value, fallback = DEFAULT_SPEED) {
  const number = Number(value);
  if (isSpeed(number)) return number;
  if (number === 3) return SPEED.WATCH;
  return fallback;
}

export function ticksPerSecond(speed) {
  const number = Number(speed);
  return Number.isFinite(number) && number > 0 ? TIME.TICKS_PER_SECOND_AT_X1 * number : 0;
}

/** Real seconds one game day lasts at this speed (Infinity while paused). */
export function daySeconds(speed) {
  const rate = ticksPerSecond(speed);
  return rate > 0 ? Math.round(TIME.TICKS_PER_DAY / rate * 1000) / 1000 : Infinity;
}

export function speedStep(speed) {
  return SPEED_STEPS.find((step) => step.speed === speed) ?? null;
}

/** Keys 1 to 5 choose the five running speeds; any other digit chooses none. */
export function speedForDigit(digit) {
  return SPEED_STEPS[Number(digit) - 1]?.speed ?? null;
}

/** The speed a red alert leaves: never faster than ALERT_SPEED, and a player
 * already slower (or paused) stays where they are. */
export function speedAfterAlert(speed) {
  return speed > ALERT_SPEED ? ALERT_SPEED : speed;
}

/** How much faster than the ticks a work gesture plays, so that it keeps the
 * rhythm it has at GESTURE_SPEED when the game runs slower than that. */
export function gestureGain(speed) {
  const number = Number(speed);
  return Number.isFinite(number) && number > 0 && number < GESTURE_SPEED ? GESTURE_SPEED / number : 1;
}

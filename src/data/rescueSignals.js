// Presentation only: these thresholds never change survival or rescue routes.
export const RESCUE_SIGNALS = Object.freeze({
  // A real collapse leaves survivors at 25 health: the signals must still
  // have room to weaken after that initial injury.
  WEAK_HEALTH: 20,
  FAINT_HEALTH: 12,
  WEAK_NEED: 80,
  FAINT_NEED: 95,
  WEAK_AIR: 40,
  FAINT_AIR: 15,
  PULSE_TICKS: 4,
  GAIN: 0.65,
  CADENCE: Object.freeze({
    holding: Object.freeze({ gap: 6, rest: 48 }),
    weak: Object.freeze({ gap: 9, rest: 72 }),
    faint: Object.freeze({ gap: 12, rest: 96 }),
  }),
});

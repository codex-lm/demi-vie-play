export const FIRE_TEXT_EN = Object.freeze({
  overheat: Object.freeze({
    warning: 'A machine in {name} is overheating dangerously. A fire could break out.',
    start: 'An overheated machine starts a fire in {name}. Smoke is starting to spread.',
  }),
  shortCircuit: Object.freeze({
    warning: 'A live cable is crackling in {name}. A short circuit could start a fire.',
    start: 'A short circuit starts a fire in {name}. Smoke is starting to spread.',
  }),
  kitchenWithoutHood: Object.freeze({
    warning: 'Grease is building up over the stoves in {name}. A kitchen fire could break out.',
    start: 'Grease vapors ignite in {name}. The fire consumes oxygen and releases CO₂ and smoke.',
  }),
});

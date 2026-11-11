import { DILEMMAS_EXTRA } from './proposals/dilemmas-extra.js';

export const DILEMMA_RULES = Object.freeze({
  MIN_DELAY_DAYS: 10,
  DELAY_VARIABILITY_DAYS: 10,
  RADIO_DELAY_DAYS: 2,
  RADIO_HELP_CONSEQUENCES: Object.freeze({
    rescue: Object.freeze({ morale: 10, stocks: Object.freeze({ meds: 4 }) }),
    supplies: Object.freeze({ morale: 6, stocks: Object.freeze({ meds: 4 }) }),
    decline: Object.freeze({ morale: -12, stocks: Object.freeze({ meds: -4 }) }),
  }),
});

const choice = (delayDays, effects) => Object.freeze({ delayDays, effects: Object.freeze(effects) });

const BASE_DILEMMAS = Object.freeze([
  Object.freeze({
    id: 'strangerAtHatch', target: 'colonist', gentle: true,
    choices: Object.freeze([
      choice(2, {
        resources: { meds: -2 }, targetDisease: 'infection', targetMorale: 3,
        arrivals: [{ age: 36 }, { age: 8 }], factions: { remonteurs: 4, profonds: -2 },
      }),
      choice(2, { resources: { food: -10 }, morale: -1, factions: { remonteurs: 2 } }),
      choice(3, { targetMorale: -4, factions: { remonteurs: -7, profonds: 4 } }),
    ]),
  }),
  Object.freeze({
    id: 'stolenRations', target: 'colonist', gentle: true,
    choices: Object.freeze([
      choice(1, { resources: { food: 4 }, morale: -2, targetMorale: 5, targetWorkBlockedDays: 1 }),
      choice(1, { law: 'curfew', targetMorale: -14, factions: { remonteurs: -5, profonds: -5 } }),
      choice(3, { resources: { food: -12 }, factions: { profonds: 2 } }),
    ]),
  }),
  Object.freeze({
    id: 'elderLastSky', target: 'elder', gentle: false,
    choices: Object.freeze([
      choice(1, { killTarget: true, morale: 3, factions: { remonteurs: 5 } }),
      choice(2, { targetMorale: -18, factions: { profonds: 3 } }),
      choice(2, { resources: { meds: -1 }, targetDose: 8, morale: 6, factions: { remonteurs: 3 } }),
    ]),
  }),
  Object.freeze({
    id: 'childQuota', target: 'couple', gentle: true,
    choices: Object.freeze([
      choice(3, { law: 'birthBoost', targetMorale: 10, factions: { remonteurs: -3, profonds: 5 } }),
      choice(2, { law: 'birthQuota', targetMorale: -10, factions: { remonteurs: 4, profonds: -4 } }),
      choice(2, { law: 'sharedMeals', resources: { food: -8 }, targetMorale: 3 }),
    ]),
  }),
  Object.freeze({
    id: 'gasPocket', target: 'miner', gentle: false,
    choices: Object.freeze([
      choice(2, { resources: { stone: -8 }, targetMorale: 2, factions: { profonds: -2 } }),
      choice(3, { resources: { metal: -4, wood: -2 }, morale: 2 }),
      choice(4, { resources: { coal: 12 }, targetMorale: -8, morale: -3, factions: { profonds: 3 } }),
    ]),
  }),
  Object.freeze({
    id: 'generatorShift', target: 'technician', gentle: true,
    choices: Object.freeze([
      choice(3, { law: 'work16', resources: { fuel: 10 }, targetMorale: -10, factions: { remonteurs: -3, profonds: 4 } }),
      choice(2, { law: 'work12', resources: { fuel: -8 }, targetMorale: 5, factions: { remonteurs: 4 } }),
      choice(4, { resources: { metal: -3, electronics: -1, fuel: 5 }, targetMorale: 2 }),
    ]),
  }),
  Object.freeze({
    id: 'waterRation', target: 'colonist', gentle: true,
    choices: Object.freeze([
      choice(2, { law: 'rationing', resources: { waterClean: 20 }, morale: -4 }),
      choice(2, { law: 'sharedMeals', resources: { waterClean: -20 }, morale: 4 }),
      choice(3, { resources: { meds: -1, waterClean: 8 }, factions: { remonteurs: 2, profonds: 2 } }),
    ]),
  }),
  Object.freeze({
    id: 'schoolCall', target: 'radio', gentle: true,
    choices: Object.freeze([
      choice(4, {
        resources: { food: -12, meds: -2 }, surfaceDeposit: { food: 12, meds: 2 },
        morale: 4, factions: { remonteurs: 6, profonds: -3 },
      }),
      choice(3, { resources: { food: -4 }, surfaceDeposit: { food: 4 }, factions: { remonteurs: 2 } }),
      choice(2, { law: 'closedShelter', targetMorale: -5, factions: { remonteurs: -6, profonds: 3 } }),
    ]),
  }),
  Object.freeze({
    id: 'seedStock', target: 'farmer', gentle: true,
    choices: Object.freeze([
      choice(5, { resources: { food: -20, seeds: 4 }, factions: { remonteurs: -2, profonds: 4 } }),
      choice(2, { resources: { food: 18, seeds: -3 }, factions: { remonteurs: 3, profonds: -3 } }),
      choice(3, { law: 'rationing', resources: { food: 8 }, morale: -3 }),
    ]),
  }),
  Object.freeze({
    id: 'eveningCurfew', target: 'colonist', gentle: true,
    choices: Object.freeze([
      choice(2, { law: 'evenings', resources: { food: -6 }, morale: 7, factions: { remonteurs: 4, profonds: -2 } }),
      choice(1, { law: 'curfew', morale: -7, factions: { remonteurs: -4, profonds: 5 } }),
      choice(3, { resources: { food: -2 }, targetMorale: 5, factions: { remonteurs: 1, profonds: 1 } }),
    ]),
  }),
  Object.freeze({
    id: 'quarantineMedic', target: 'medic', gentle: false,
    choices: Object.freeze([
      choice(2, { law: 'quarantine', resources: { waterClean: -6 }, targetMorale: -2, factions: { remonteurs: -3, profonds: 4 } }),
      choice(3, { law: 'childrenFirst', resources: { meds: -2 }, morale: 2, factions: { remonteurs: 3 } }),
      choice(4, { law: 'openGate', resources: { meds: 2 }, targetDisease: 'infection', factions: { remonteurs: 2, profonds: -5 } }),
    ]),
  }),
  Object.freeze({
    id: 'refugeesRadio', target: 'radio', gentle: false,
    choices: Object.freeze([
      choice(3, {
        law: 'openGate', resources: { food: -24 }, targetDisease: 'infection', morale: 4,
        arrivals: [{ age: 27 }, { age: 41 }], factions: { remonteurs: 6, profonds: -5 },
      }),
      choice(2, { law: 'closedShelter', morale: -5, factions: { remonteurs: -7, profonds: 5 } }),
      choice(4, { law: 'rationing', resources: { food: -10, meds: -1 }, factions: { remonteurs: 1, profonds: 1 } }),
    ]),
  }),
]);

export const DILEMMAS = BASE_DILEMMAS;
export const DILEMMAS_FULL = Object.freeze([...BASE_DILEMMAS, ...DILEMMAS_EXTRA]);

export function dilemmaDefinition(id) {
  return DILEMMAS_FULL.find((definition) => definition.id === id) ?? null;
}

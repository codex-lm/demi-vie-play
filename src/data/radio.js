import { TIME } from './balance.js';
import { RADIO_EVENT_IDS_EXTRA, RADIO_EVENTS_EXTRA, RADIO_NEIGHBORS_EXTRA } from './proposals/radio-extra.js';

export const RADIO = Object.freeze({
  NEIGHBOR_COUNT: 7,
  EVENT_MIN_DAYS: 20,
  EVENT_MAX_DAYS: 40,
  CONTACT_INTERVAL_TICKS: 6 * TIME.TICKS_PER_HOUR,
  SIGNAL_STRENGTH: 1,
  TRADE_PICKUP_TICKS: 2 * TIME.TICKS_PER_DAY,
  MAX_MESSAGES: 240,
  MORALE_MIN: 0,
  MORALE_MAX: 100,
  STOCK_MIN: 0,
  SILENCE_AFTER_MIN_EVENTS: 2,
  SILENCE_AFTER_MAX_EVENTS: 4,
  DISTANCE_MIN_KM: 3,
  DISTANCE_MAX_KM: 18,
  RESCUE_MIN_CREW: 1,
  RESCUE_MAX_CREW: 2,
  RESCUE_CELLS_PER_KM: 2,
});

const BASE_RADIO_NEIGHBORS = Object.freeze([
  Object.freeze({
    id: 'farmers', kind: 'farm', nameKey: 'radioNeighborFarmers', voiceKey: 'radioVoiceFarmers',
    contactKey: 'radioContactFarmers', silenceKey: 'radioSilenceFarmers',
    stocks: Object.freeze({ food: Object.freeze([42, 68]), waterClean: Object.freeze([45, 75]), seeds: Object.freeze([5, 11]) }),
    morale: Object.freeze([54, 72]),
    events: Object.freeze(['farmTradeSeeds', 'farmThaw', 'farmHarvest', 'farmRats']),
  }),
  Object.freeze({
    id: 'military', kind: 'bunker', nameKey: 'radioNeighborMilitary', voiceKey: 'radioVoiceMilitary',
    contactKey: 'radioContactMilitary', silenceKey: 'radioSilenceMilitary',
    stocks: Object.freeze({ food: Object.freeze([30, 50]), scrap: Object.freeze([20, 38]), filters: Object.freeze([5, 10]) }),
    morale: Object.freeze([43, 61]),
    events: Object.freeze(['militaryBolts', 'militaryTradeFilters', 'militaryDust', 'militarySong']),
  }),
  Object.freeze({
    id: 'school', kind: 'school', nameKey: 'radioNeighborSchool', voiceKey: 'radioVoiceSchool',
    contactKey: 'radioContactSchool', silenceKey: 'radioSilenceSchool',
    stocks: Object.freeze({ food: Object.freeze([24, 42]), waterClean: Object.freeze([35, 60]), books: Object.freeze([9, 18]) }),
    morale: Object.freeze([58, 76]),
    events: Object.freeze(['schoolTradeBooks', 'schoolGenerator', 'schoolPlay', 'schoolWater']),
  }),
  Object.freeze({
    id: 'hospital', kind: 'hospital', nameKey: 'radioNeighborHospital', voiceKey: 'radioVoiceHospital',
    contactKey: 'radioContactHospital', silenceKey: 'radioSilenceHospital',
    stocks: Object.freeze({ food: Object.freeze([24, 40]), waterClean: Object.freeze([35, 55]), meds: Object.freeze([4, 9]) }),
    morale: Object.freeze([48, 66]),
    events: Object.freeze(['hospitalHelp', 'hospitalTradeMeds', 'hospitalDysentery', 'hospitalBirth']),
  }),
  Object.freeze({
    id: 'metro', kind: 'metro', nameKey: 'radioNeighborMetro', voiceKey: 'radioVoiceMetro',
    contactKey: 'radioContactMetro', silenceKey: 'radioSilenceMetro',
    stocks: Object.freeze({ food: Object.freeze([20, 36]), scrap: Object.freeze([14, 28]), wood: Object.freeze([8, 16]), tools: Object.freeze([4, 8]) }),
    morale: Object.freeze([39, 59]),
    events: Object.freeze(['metroCollapse', 'metroTradeTools', 'metroMushrooms', 'metroNoise']),
  }),
]);

export const RADIO_NEIGHBORS = Object.freeze(BASE_RADIO_NEIGHBORS.map((neighbor) => Object.freeze({
  ...neighbor,
  events: Object.freeze([...neighbor.events, ...(RADIO_EVENT_IDS_EXTRA[neighbor.id] ?? [])]),
})));

export const RADIO_NEIGHBORS_FULL = Object.freeze([...RADIO_NEIGHBORS, ...RADIO_NEIGHBORS_EXTRA]);

const BASE_RADIO_EVENTS = Object.freeze({
  farmTradeSeeds: Object.freeze({
    textKey: 'radioFarmTradeSeeds',
    trade: Object.freeze({ give: Object.freeze({ food: 12 }), receive: Object.freeze({ seeds: 3 }), morale: 3 }),
  }),
  farmThaw: Object.freeze({
    textKey: 'radioFarmThaw', hint: true,
    deltas: Object.freeze({ stocks: Object.freeze({ food: -8, waterClean: -22 }), morale: -7 }),
  }),
  farmHarvest: Object.freeze({
    textKey: 'radioFarmHarvest',
    deltas: Object.freeze({ stocks: Object.freeze({ food: 28 }), morale: 8 }),
  }),
  farmRats: Object.freeze({
    textKey: 'radioFarmRats',
    deltas: Object.freeze({ stocks: Object.freeze({ food: -10 }), morale: 2 }),
  }),
  militaryBolts: Object.freeze({
    textKey: 'radioMilitaryBolts', hint: true,
    deltas: Object.freeze({ stocks: Object.freeze({ scrap: -6, wood: -3 }), morale: -9 }),
  }),
  militaryTradeFilters: Object.freeze({
    textKey: 'radioMilitaryTradeFilters',
    trade: Object.freeze({ give: Object.freeze({ scrap: 8 }), receive: Object.freeze({ filters: 3 }), morale: 2 }),
  }),
  militaryDust: Object.freeze({
    textKey: 'radioMilitaryDust', hint: true,
    deltas: Object.freeze({ stocks: Object.freeze({ filters: -2 }), morale: -4 }),
  }),
  militarySong: Object.freeze({
    textKey: 'radioMilitarySong',
    deltas: Object.freeze({ stocks: Object.freeze({}), morale: 6 }),
  }),
  schoolTradeBooks: Object.freeze({
    textKey: 'radioSchoolTradeBooks',
    trade: Object.freeze({ give: Object.freeze({ meds: 3 }), receive: Object.freeze({ books: 4 }), morale: 4 }),
  }),
  schoolGenerator: Object.freeze({
    textKey: 'radioSchoolGenerator',
    deltas: Object.freeze({ stocks: Object.freeze({ food: -4 }), morale: -5 }),
  }),
  schoolPlay: Object.freeze({
    textKey: 'radioSchoolPlay',
    deltas: Object.freeze({ stocks: Object.freeze({}), morale: 10 }),
  }),
  schoolWater: Object.freeze({
    textKey: 'radioSchoolWater', hint: true,
    deltas: Object.freeze({ stocks: Object.freeze({ waterClean: -18 }), morale: -6 }),
  }),
  hospitalHelp: Object.freeze({
    textKey: 'radioHospitalHelp',
    help: Object.freeze({
      titleKey: 'radioHospitalHelpTitle',
      supplies: Object.freeze({ meds: 4 }),
      choices: Object.freeze([
        Object.freeze({ id: 'rescue', labelKey: 'radioHelpRescue', descriptionKey: 'radioHelpRescueEffect' }),
        Object.freeze({ id: 'supplies', labelKey: 'radioHelpSupplies', descriptionKey: 'radioHelpSuppliesEffect' }),
        Object.freeze({ id: 'decline', labelKey: 'radioHelpDecline', descriptionKey: 'radioHelpDeclineEffect' }),
      ]),
    }),
    deltas: Object.freeze({ stocks: Object.freeze({ meds: -2 }), morale: -8 }),
  }),
  hospitalTradeMeds: Object.freeze({
    textKey: 'radioHospitalTradeMeds',
    trade: Object.freeze({ give: Object.freeze({ food: 10 }), receive: Object.freeze({ meds: 4 }), morale: 3 }),
  }),
  hospitalDysentery: Object.freeze({
    textKey: 'radioHospitalDysentery', hint: true,
    deltas: Object.freeze({ stocks: Object.freeze({ waterClean: -15, meds: -3 }), morale: -8 }),
  }),
  hospitalBirth: Object.freeze({
    textKey: 'radioHospitalBirth',
    deltas: Object.freeze({ stocks: Object.freeze({ food: -4 }), morale: 12 }),
  }),
  metroCollapse: Object.freeze({
    textKey: 'radioMetroCollapse', hint: true,
    deltas: Object.freeze({ stocks: Object.freeze({ scrap: -5, wood: -4 }), morale: -10 }),
  }),
  metroTradeTools: Object.freeze({
    textKey: 'radioMetroTradeTools',
    trade: Object.freeze({ give: Object.freeze({ electronics: 2 }), receive: Object.freeze({ tools: 3 }), morale: 2 }),
  }),
  metroMushrooms: Object.freeze({
    textKey: 'radioMetroMushrooms',
    deltas: Object.freeze({ stocks: Object.freeze({ food: 15 }), morale: 4 }),
  }),
  metroNoise: Object.freeze({
    textKey: 'radioMetroNoise',
    deltas: Object.freeze({ stocks: Object.freeze({}), morale: -3 }),
  }),
});

export const RADIO_EVENTS = Object.freeze({ ...BASE_RADIO_EVENTS, ...RADIO_EVENTS_EXTRA });

import { TIME } from './balance.js';
import { OBJECTIVES_EXTRA } from './proposals/objectives-extra.js';

export const NOTEBOOK = Object.freeze({
  VISIBLE_OBJECTIVES: 3,
  IDLE_SUGGESTION_TICKS: 3 * TIME.TICKS_PER_DAY,
  MORALE_REWARD: 2,
  BOOK_REWARD: 1,
});

const morale = () => Object.freeze({ type: 'morale', amount: NOTEBOOK.MORALE_REWARD });
const books = () => Object.freeze({ type: 'books', amount: NOTEBOOK.BOOK_REWARD });
const extraById = new Map(OBJECTIVES_EXTRA.map((definition) => [definition.id, definition]));

function define(id, condition, reward) {
  return Object.freeze({
    id,
    textKey: `m6Objective${id[0].toUpperCase()}${id.slice(1)}`,
    hintKey: `m6Objective${id[0].toUpperCase()}${id.slice(1)}Hint`,
    donePhraseKey: `m6Objective${id[0].toUpperCase()}${id.slice(1)}Done`,
    condition: Object.freeze(condition),
    reward,
  });
}

function extra(id) {
  const definition = extraById.get(id);
  if (!definition) throw new Error(`Missing objective proposal: ${id}`);
  return define(id, definition.condition, definition.reward);
}

export const OBJECTIVE_DEFS = Object.freeze([
  define('digRoom', { type: 'digRoom' }, morale()),
  define('findWater', { type: 'room', roomType: 'well' }, morale()),
  define('filterWater', { type: 'room', roomType: 'filterPlant' }, morale()),
  // La nourriture de départ dure environ 25 jours : la champignonnière vient
  // juste après l'eau, sinon un joueur qui suit le carnet meurt de faim.
  define('growFood', { type: 'room', roomType: 'mushroom' }, books()),
  define('fitDorm', { type: 'room', roomType: 'dorm' }, books()),
  define('ventilate', { type: 'room', roomType: 'ventShaft' }, books()),
  define('repairRoom', { type: 'journal', code: 'eventRepair' }, morale()),
  define('buildCommons', { type: 'room', roomType: 'commons' }, books()),
  define('firstExpedition', { type: 'expeditionSeeds' }, morale()),
  define('buildWorkshop', { type: 'room', roomType: 'workshop' }, books()),
  extra('waterReserve'),
  extra('foodReserve'),
  extra('insects'),
  define('storeFood', { type: 'room', roomType: 'pantry' }, morale()),
  define('buildCanteen', { type: 'room', roomType: 'canteen' }, books()),
  define('addSupport', { type: 'support' }, books()),
  define('lineRoom', { type: 'lining' }, morale()),
  define('waterproofRoom', { type: 'coating', coating: 'waterproof' }, books()),
  extra('storage'),
  define('buildSchool', { type: 'room', roomType: 'school' }, morale()),
  extra('lab'),
  define('completeResearch', { type: 'research' }, books()),
  extra('workshopMethods'),
  extra('filterWeaving'),
  extra('archive'),
  define('buildInfirmary', { type: 'room', roomType: 'infirmary' }, morale()),
  define('storePower', { type: 'room', roomType: 'battery' }, morale()),
  define('heatRoom', { type: 'room', roomType: 'heater' }, books()),
  extra('threeExpeditions'),
  extra('fiveFinds'),
  define('buildAntenna', { type: 'surfaceStructure', structureType: 'antenna' }, morale()),
  define('contactNeighbors', { type: 'radioContact' }, books()),
  extra('radio'),
  define('signLaw', { type: 'law' }, morale()),
  extra('evenings'),
  extra('work12'),
  define('prepareExodus', { type: 'exodusDepot' }, books()),
  extra('kit'),
]);

export function objectiveDefinition(id) {
  return OBJECTIVE_DEFS.find((definition) => definition.id === id) ?? null;
}

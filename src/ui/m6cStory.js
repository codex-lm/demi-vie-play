const DILEMMA_CHOICE_KINDS = Object.freeze({
  'strangerAtHatch:0': 'generousChoice',
  'strangerAtHatch:1': 'generousChoice',
  'strangerAtHatch:2': 'cruelChoice',
  'stolenRations:1': 'cruelChoice',
  'elderLastSky:1': 'cruelChoice',
  'elderLastSky:2': 'generousChoice',
  'childQuota:1': 'cruelChoice',
  'childQuota:2': 'generousChoice',
  'gasPocket:2': 'cruelChoice',
  'generatorShift:0': 'cruelChoice',
  'schoolCall:0': 'generousChoice',
  'schoolCall:1': 'generousChoice',
  'schoolCall:2': 'cruelChoice',
  'eveningCurfew:0': 'generousChoice',
  'eveningCurfew:1': 'cruelChoice',
  'eveningCurfew:2': 'generousChoice',
  'refugeesRadio:0': 'generousChoice',
  'refugeesRadio:1': 'cruelChoice',
  'refugeesRadio:2': 'generousChoice',
  'labDryBoots:0': 'generousChoice',
  'labDryBoots:2': 'generousChoice',
  'labLastPencil:2': 'generousChoice',
  'labCrackedCup:1': 'cruelChoice',
  'labSoupName:0': 'generousChoice',
  'labSoupName:2': 'generousChoice',
  'labNightKnock:2': 'cruelChoice',
  'labBorrowedShift:1': 'cruelChoice',
  'labSavedSeeds:2': 'cruelChoice',
  'labQuietBench:0': 'generousChoice',
  'labQuietBench:1': 'generousChoice',
  'labQuietBench:2': 'cruelChoice',
  'labCleanSheet:0': 'generousChoice',
  'labCleanSheet:2': 'generousChoice',
  'labWeddingWire:0': 'generousChoice',
  'labWeddingWire:1': 'generousChoice',
  'labRadioRecipe:0': 'generousChoice',
  'labQuietPatient:2': 'cruelChoice',
  'labBadBatch:2': 'cruelChoice',
  'labWornMask:2': 'cruelChoice',
  'labReturnToken:0': 'generousChoice',
  'labReturnToken:1': 'generousChoice',
  'labSharedSilence:0': 'generousChoice',
  'labSharedSilence:1': 'generousChoice',
  'labUnsentLetter:0': 'generousChoice',
  'labUnsentLetter:2': 'cruelChoice',
  'labRadioWrongName:1': 'generousChoice',
});

const DIRECT_KINDS = Object.freeze({
  eventBirth: 'birth',
  m6StoryChild: 'birth',
  m6StoryChildren: 'birth',
  labStoryBirth: 'birth',
  labStoryBirths: 'birth',
  labStoryFirstSky: 'birth',
  labStoryNeighbors: 'radioSaved',
  labStoryRescue: 'radioSaved',
  labStorySilencedNeighbors: 'radioSilent',
  eventFireStart: 'fire',
  eventFireSpread: 'fire',
  eventFireExtinguished: 'fire',
  eventFireBurnedOut: 'fire',
  labStoryFires: 'fire',
  eventFlood: 'flood',
  eventFloodRecovered: 'flood',
  eventCollapse: 'collapse',
  eventCascade: 'collapse',
  labStoryCollapses: 'collapse',
});

const STORY_EVENT_KINDS = Object.freeze({ fire: 'fire', flood: 'flood', epidemic: 'epidemic' });

const DEATH_KINDS = Object.freeze({
  hunger: 'famine',
  starvation: 'famine',
  malnutrition: 'famine',
  infection: 'epidemic',
  epidemic: 'epidemic',
  disease: 'epidemic',
  dysentery: 'epidemic',
  fire: 'fire',
  smoke: 'fire',
  burn: 'fire',
  burns: 'fire',
  flood: 'flood',
  drowning: 'flood',
  suddenImmersion: 'flood',
  collapse: 'collapse',
  rockfall: 'collapse',
});

const DEATH_CODES = new Set(['eventDeath', 'm6StoryDeaths', 'm6StoryDeathsNoCold', 'labStoryDeath']);
const DEPARTURE_CODES = new Set(['eventExodus', 'labStoryDeparture', 'labStoryProjectedHealth', 'storyProjection']);

function deathCauses(causes) {
  return (Array.isArray(causes) ? causes : [causes])
    .map((cause) => cause?.code ?? cause)
    .filter((cause) => typeof cause === 'string');
}

function deathKind(causes) {
  const list = deathCauses(causes);
  if (list.length === 0) return null;
  const kinds = new Set(list.map((cause) => DEATH_KINDS[cause] ?? null));
  return kinds.size === 1 && !kinds.has(null) ? [...kinds][0] : null;
}

function coldAvoidedKind(causes, provenKind) {
  if (provenKind) return provenKind;
  return deathCauses(causes).some((cause) => DEATH_KINDS[cause]) ? null : 'coldAvoided';
}

function projectedDeaths(projection, key) {
  if (Number.isFinite(projection?.[key])) return projection[key];
  const months = projection?.firstYear?.months;
  if (!Array.isArray(months) || months.length !== 12
    || months.some((month) => !Number.isFinite(month?.[key]))) return null;
  return months.reduce((total, month) => total + month[key], 0);
}

function departureKind(projection) {
  const coldDeaths = projectedDeaths(projection, 'coldDeaths');
  if (coldDeaths > 0) return 'earlyDeparture';
  const months = projection?.firstYear?.months;
  const complete = Number.isFinite(projection?.starvationDeaths)
    && Number.isFinite(projection?.coldDeaths)
    && Array.isArray(months) && months.length === 12
    && months.every((month) => Number.isFinite(month?.starvationDeaths) && Number.isFinite(month?.coldDeaths));
  if (complete && coldDeaths === 0 && projection.starvationDeaths === 0
    && Number.isFinite(projection.firstHarvestMonth)) return 'timelyDeparture';
  return null;
}

function neighborsKind(params) {
  if (params.saved > 0 && params.silent === 0 && params.unknown === 0) return 'radioSaved';
  if (params.silent > 0 && params.saved === 0 && params.unknown === 0) return 'radioSilent';
  return null;
}

export function endStoryKind(entry, projection = null) {
  const code = entry?.code ?? '';
  const params = entry?.params ?? {};
  if (code === 'm6StoryLaw') return params.long === true ? 'longLaw' : null;
  if (code === 'labStoryLongShifts') return params.days >= 30 ? 'longLaw' : null;
  if (code === 'm6StoryNoColdDeaths') return params.count === 0 ? 'noLoss' : 'coldAvoided';
  if (code === 'm6StoryDilemmas') {
    return DILEMMA_CHOICE_KINDS[`${params.definitionId}:${params.choiceIndex}`] ?? null;
  }
  if (code === 'm6StoryNeighbors') return neighborsKind(params);
  if (code === 'm6StorySouvenirs') return params.count > 0 ? 'heirloomPassed' : null;
  if (DEATH_CODES.has(code)) {
    const kind = deathKind(params.causes);
    return code === 'm6StoryDeathsNoCold' ? coldAvoidedKind(params.causes, kind) : kind;
  }
  if (code === 'labStoryNoColdDeath') return 'coldAvoided';
  if (code === 'eventStoryStart') return STORY_EVENT_KINDS[params.eventType] ?? null;
  if (DEPARTURE_CODES.has(code)) return departureKind(projection);
  return DIRECT_KINDS[code] ?? null;
}

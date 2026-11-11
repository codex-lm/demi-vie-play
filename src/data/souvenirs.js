export const SOUVENIR_RULES = Object.freeze({
  STUDY_TICKS: 120,
  SKILL_BONUS: 1,
  MINER_RISK_FACTOR: 0.9,
  SONGS_MORALE: 2,
  EVENING_START_HOUR: 18,
  EVENING_END_HOUR: 24,
  DEFAULT_MATERIAL: 'limestone',
  DEFAULT_TYPE: 'songs',
});

export const SOUVENIR_DEFINITIONS = Object.freeze({
  recipeBook: Object.freeze({
    type: 'recipeBook',
    skill: 'cook',
    nameKey: 'm6SouvenirRecipeBook',
    effectKey: 'm6SouvenirRecipeBookEffect',
  }),
  minerJournal: Object.freeze({
    type: 'minerJournal',
    skill: null,
    nameKey: 'm6SouvenirMinerJournal',
    effectKey: 'm6SouvenirMinerJournalEffect',
  }),
  songs: Object.freeze({
    type: 'songs',
    skill: null,
    nameKey: 'm6SouvenirSongs',
    effectKey: 'm6SouvenirSongsEffect',
  }),
  gardenNotes: Object.freeze({
    type: 'gardenNotes',
    skill: 'farm',
    nameKey: 'm6SouvenirGardenNotes',
    effectKey: 'm6SouvenirGardenNotesEffect',
  }),
  medicManual: Object.freeze({
    type: 'medicManual',
    skill: 'medic',
    nameKey: 'm6SouvenirMedicManual',
    effectKey: 'm6SouvenirMedicManualEffect',
  }),
  engineerNotebook: Object.freeze({
    type: 'engineerNotebook',
    skill: 'tech',
    nameKey: 'm6SouvenirEngineerNotebook',
    effectKey: 'm6SouvenirEngineerNotebookEffect',
  }),
});

export const SOUVENIR_TRAITS = Object.freeze({
  brave: 'minerJournal',
  robust: 'minerJournal',
  gentle: 'songs',
  leader: 'songs',
  believer: 'songs',
  resourceful: 'engineerNotebook',
});

export const SOUVENIR_SKILLS = Object.freeze({
  cook: 'recipeBook',
  dig: 'minerJournal',
  farm: 'gardenNotes',
  medic: 'medicManual',
  tech: 'engineerNotebook',
  build: 'engineerNotebook',
  teach: 'songs',
  scout: 'songs',
});

export const M6 = Object.freeze({
  SAVE_KEY: 'demi-vie-save-v1',
  OPTIONS_KEY: 'demi-vie-options-v1',
  LANGUAGE_KEY: 'demi-vie-language',
  CREAK_INTEGRITY: 85,
  SOUVENIR_HERITAGE: 15,
  GEOLOGIST_MIN_SKILL: 1,
  GEOLOGIST_EXPERT_SKILL: 7,
  MOURNING_VISIT_TICKS: 30,
  FESTIVAL_TICKS: 60,
  LISTENING_ROCK_TICKS: 12,
});

// Palettes de l'interface : un bloc par nom dans src/ui/themes.css.
export const M6_THEMES = Object.freeze(['shelter', 'blueprint', 'soot']);

export const DEFAULT_M6_OPTIONS = Object.freeze({
  textScale: 0, // 0 = automatique, selon la taille de l'écran
  theme: 'blueprint',
  colorblind: false,
  volume: 0.7,
  music: 0.5,
  geiger: 0.5,
  reduceMotion: false,
  veilleePause: true,
});

// Presentation-only labels pending their consolidation in src/data by Kimi.
export const INTEG5_TEXT = Object.freeze({
  skip: 'Passer le film',
  replay: 'Revoir le premier ciel',
  film: 'Le premier ciel',
  elder: 'La doyenne de l’abri',
  expressions: Object.freeze({neutral: 'attentive', proud: 'fière', worried: 'inquiète', sad: 'endeuillée', amused: 'souriante'}),
});

const INTEG5_TEXT_EN = Object.freeze({
  skip: 'Skip the film',
  replay: 'Watch The First Sky again',
  film: 'The First Sky',
  elder: 'The shelter elder',
  expressions: Object.freeze({ neutral: 'attentive', proud: 'proud', worried: 'worried', sad: 'grieving', amused: 'smiling' }),
});

export function integ5Text(language) {
  return language === 'en' ? INTEG5_TEXT_EN : INTEG5_TEXT;
}

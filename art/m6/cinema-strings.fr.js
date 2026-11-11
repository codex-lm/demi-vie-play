export const CINEMA_TEXT = Object.freeze({
  firstSky: 'Le premier ciel',
  subtitle: 'Ceux qui ont tenu. Ceux qui nous ont transmis.',
  titleSubtitle: 'Sous la pierre, la vie continue.',
  childCaption: 'Né sous terre. Le ciel, enfin.',
  childrenCaption: 'Ils n’avaient jamais vu le ciel.',
  emptyChildren: 'Nous avions gardé une place pour le ciel.',
  peopleCaption: 'Une dernière échelle. Une autre vie.',
  sequences: Object.freeze(['La trappe', 'La lumière', 'La montée', 'Les enfants', 'L’horizon', 'Le premier ciel']),
});

const CINEMA_TEXT_EN = Object.freeze({
  firstSky: 'The First Sky',
  subtitle: 'Those who endured. Those who passed it on.',
  titleSubtitle: 'Beneath the rock, life goes on.',
  childCaption: 'Born underground. At last, the sky.',
  childrenCaption: 'They had never seen the sky.',
  emptyChildren: 'We had kept a place for the sky.',
  peopleCaption: 'One last ladder. Another life.',
  sequences: Object.freeze(['The Hatch', 'The Light', 'The Climb', 'The Children', 'The Horizon', 'The First Sky']),
});

export function cinemaText(language) {
  return language === 'en' ? CINEMA_TEXT_EN : CINEMA_TEXT;
}

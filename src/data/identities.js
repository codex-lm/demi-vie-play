// Proper names are shared verbatim by the French and English presentation.
// Keep the historical NAMES bank separate: reference games retain those names.
export const IDENTITY_NAMES = Object.freeze({
  female: Object.freeze([
    'Adèle', 'Agnès', 'Alice', 'Béatrice', 'Claire', 'Denise', 'Élise', 'Françoise',
    'Gabrielle', 'Hélène', 'Isabelle', 'Jeanne', 'Karine', 'Lucie', 'Madeleine',
    'Nadine', 'Odile', 'Pauline', 'Rose', 'Simone', 'Thérèse', 'Valérie', 'Yvonne',
    'Zoé', 'Chloé', 'Manon', 'Léa',
  ]),
  male: Object.freeze([
    'Alain', 'André', 'Benoît', 'Baptiste', 'Charles', 'Damien', 'Émile', 'Étienne',
    'François', 'Gérard', 'Henri', 'Hugo', 'Idriss', 'Jacques', 'Karim', 'Louis',
    'Marc', 'Nicolas', 'Olivier', 'Pierre', 'Quentin', 'Rémi', 'Simon', 'Thomas',
    'Vincent', 'Yann', 'Xavier',
  ]),
  mixed: Object.freeze(['Camille', 'Claude', 'Dominique', 'Alex', 'Sacha', 'Alix']),
  family: Object.freeze([
    'Aubry', 'Besson', 'Chabert', 'Delmas', 'Evrard', 'Fleury', 'Gallet', 'Hamelin',
    'Jacquet', 'Lenoir', 'Maillet', 'Noguès', 'Perrier', 'Roussel', 'Tessier',
    'Vannier', 'Bailly', 'Collet', 'Drouet', 'Faucher', 'Guérin', 'Joly', 'Morel',
    'Paquet', 'Rolland', 'Texier', 'Valette', 'Verdier', 'Vial', 'Villard',
  ]),
});

// Prevent recognizable associations found while reviewing this bank. This is
// deliberately a small editorial exclusion list, not a guarantee against every
// coincidental namesake of these common names.
export const IDENTITY_EXCLUSIONS = Object.freeze([
  'Thomas Joly', 'Nicolas Joly', 'François Morel', 'Claude Besson', 'Claude Lenoir',
  'Henri Roussel', 'Gérard Morel', 'François Rolland', 'Manon Aubry', 'Étienne Lenoir',
  'Jacques Morel', 'Jacques Besson', 'Pierre Perrier', 'Hugo Besson', 'Alain Jacquet',
  'André Besson', 'Claude Fleury', 'Henri Collet', 'Louis Gallet', 'Pierre Gallet',
]);

export const IDENTITY_RULES = Object.freeze({
  MIN_FAMILIES: 3,
  MAX_FAMILIES: 4,
  MAX_COUPLE_AGE_GAP: 10,
  INITIAL_COUPLE_RELATION: 85,
});

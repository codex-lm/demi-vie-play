const rows = [
  ['waterReserve', { type: 'stock', resource: 'waterClean', perPerson: 9 }, { type: 'morale', amount: 1 },
    'Constitue une réserve d’eau potable',
    'Garde neuf unités d’eau potable par habitant dans les stocks.',
    'Voilà de quoi boire sans compter chaque gorgée.'],
  ['foodReserve', { type: 'stock', resource: 'food', perPerson: 5 }, { type: 'morale', amount: 1 },
    'Constitue une réserve de vivres',
    'Garde cinq portions de nourriture par habitant dans les stocks.',
    'Ces repas-là resteront dans la réserve. Leur seule présence fait du bien.'],
  ['insects', { type: 'room', roomType: 'insectFarm' }, { type: 'morale', amount: 1 },
    'Prépare un élevage d’insectes',
    'Aménage un élevage d’insectes pour diversifier la production de nourriture.',
    'L’élevage est prêt. « Petites protéines » a gagné le premier vote.'],
  ['lab', { type: 'room', roomType: 'lab' }, { type: 'books', amount: 1 },
    'Ouvre un laboratoire',
    'Aménage un laboratoire alimenté pour lancer les recherches.',
    'Le laboratoire est ouvert. Gardons-y aussi la place pour nous tromper.'],
  ['archive', { type: 'room', roomType: 'archive' }, { type: 'morale', amount: 1 },
    'Donne une salle aux archives',
    'Aménage des archives pour conserver les livres et améliorer la recherche.',
    'Les livres sont rangés. Nous pouvons enfin chercher sans tout déplacer.'],
  ['storage', { type: 'room', roomType: 'storage' }, { type: 'morale', amount: 1 },
    'Ajoute une réserve',
    'Aménage une nouvelle réserve pour ranger les pièces et les matériaux.',
    'Chaque caisse a désormais une chance de retrouver sa place.'],
  ['workshopMethods', { type: 'research', nodeId: 'workshopMethods' }, { type: 'morale', amount: 1 },
    'Étudie les méthodes d’atelier',
    'Termine précisément la recherche « Méthodes d’atelier ».',
    'Les nouvelles méthodes sont notées. Montrons-les aussi aux nouveaux.'],
  ['filterWeaving', { type: 'research', nodeId: 'filterWeaving' }, { type: 'morale', amount: 1 },
    'Améliore le tissage des filtres',
    'Termine précisément la recherche « Tissage des filtres ».',
    'Le procédé est compris. Les anciennes notes restent à côté pour comparer.'],
  ['evenings', { type: 'law', lawId: 'evenings' }, { type: 'morale', amount: 1 },
    'Inscris les veillées dans la Charte',
    'Adopte la loi « Veillées » et garde-la active.',
    'C’est écrit : le soir nous appartient un peu.'],
  ['work12', { type: 'law', lawId: 'work12' }, { type: 'morale', amount: 1 },
    'Adopte la journée de douze heures',
    'Adopte la loi « Journée de douze heures » et garde-la active.',
    'La relève sait quand elle finit. Cela change déjà les conversations.'],
  ['threeExpeditions', { type: 'expeditions', minimum: 3 }, { type: 'books', amount: 1 },
    'Fais revenir trois expéditions',
    'Ramène trois expéditions à l’abri ; les départs et les équipes perdues ne comptent pas.',
    'Trois retours. Nos cartes portent maintenant la poussière du dehors.'],
  ['fiveFinds', { type: 'finds', minimum: 5 }, { type: 'morale', amount: 1 },
    'Recueille cinq trouvailles',
    'Déniche cinq trouvailles pendant les travaux de creusage.',
    'Cinq objets sauvés de la brouette. Leurs propriétaires nous restent inconnus, mais leurs gestes un peu moins.'],
  ['radio', { type: 'radioMessages', minimum: 10 }, { type: 'morale', amount: 2 },
    'Écoute dix messages des voisins',
    'Reçois dix messages de contact, de nouvelles, d’aide ou de troc venus des abris voisins.',
    'Dix messages au carnet. Il commence à ressembler à un voisinage.'],
  ['kit', { type: 'kit' }, { type: 'morale', amount: 2 },
    'Complète le kit minimal de l’Exode',
    'Fabrique le kit minimal dans le dépôt de l’Exode et garde-le prêt pour le départ.',
    'Le kit est complet. Cela nous donne un choix, pas une obligation de partir.'],
];

function suffix(id) {
  return id[0].toUpperCase() + id.slice(1);
}

export const OBJECTIVES_EXTRA = Object.freeze(rows.map(([id, condition, reward]) => Object.freeze({
  id,
  condition: Object.freeze(condition),
  reward: Object.freeze(reward),
})));

export const OBJECTIVE_TEXT_EXTRA = Object.freeze(Object.fromEntries(rows.flatMap(([
  id, , , text, hint, done,
]) => {
  const key = `m6Objective${suffix(id)}`;
  return [[key, text], [`${key}Hint`, hint], [`${key}Done`, done]];
})));

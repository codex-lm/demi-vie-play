import { RADIO_TEXT_EXTRA } from './proposals/radio-extra.js';

export const RADIO_TEXT = Object.freeze({
  radio: 'Radio des abris',
  radioOffline: 'Aucune antenne construite : les autres abris sont hors de portée.',
  radioOnline: 'L’antenne capte sept fréquences. Derrière les parasites, des voix répondent.',
  radioSignal: 'Réception {value} %',
  radioNeighborFarmers: 'Les Trois-Sillons',
  radioNeighborMilitary: 'Bunker Bélier',
  radioNeighborSchool: 'L’école Jules-Verne',
  radioNeighborHospital: 'Hôpital Saint-Blaise',
  radioNeighborMetro: 'Les gens de la ligne 9',
  radioVoiceFarmers: 'Mara, une agricultrice qui parle aux plants comme à des enfants capricieux.',
  radioVoiceMilitary: 'Le sergent Varel, précis dans ses rapports et beaucoup moins dans ses chansons.',
  radioVoiceSchool: 'Nino, instituteur improvisé d’une classe qui a survécu avec lui.',
  radioVoiceHospital: 'Docteur Sarr, épuisée, mais incapable de terminer une émission sans rassurer tout le monde.',
  radioVoiceMetro: 'Isa, conductrice de rame devenue passeuse entre les stations habitées.',

  radioContactFarmers: '« Ici Mara, des Trois-Sillons. Nous avons des semences, douze bouches et une chèvre qui prétend diriger l’abri. Si vous avez du pain, ne le dites pas à la chèvre. »',
  radioContactMilitary: '« Bunker Bélier, sergent Varel. Effectif : neuf. Discipline : passable. Café : inexistant. Nous écoutons sur cette fréquence à chaque créneau. »',
  radioContactSchool: '« École Jules-Verne. Ici Nino. Il reste sept élèves, deux adultes et un manuel de physique sans la moitié des pages. Les enfants vous font un grand bonjour. »',
  radioContactHospital: '« Saint-Blaise, docteur Sarr. Nous tenons une salle de soins sous les ruines. Si vous entendez des applaudissements, c’est seulement Marin qui a réparé la pompe. »',
  radioContactMetro: '« Ligne 9, station Saint-Ambroise. Isa à la radio. Nous passons de quai en quai. Évitez le tunnel nord : il craque plus fort que mon genou, et c’est mauvais signe. »',

  radioFarmTradeSeeds: '« Les semences de haricot ont bien pris. Contre 12 portions de nourriture, nous pouvons laisser 3 sachets à votre trappe. Les haricots ne posent pas de questions sur votre passé, c’est leur principal mérite. »',
  radioFarmThaw: '« Le dégel a noyé notre puits et pourri la réserve basse. Nous avions creusé sans cuvelage. Si votre nappe monte, ne faites pas comme nous : murez avant de goûter l’eau. »',
  radioFarmHarvest: '« Première vraie récolte sous les lampes ! Les rangs sont tordus, les racines aussi, mais nous mangeons à notre faim. La chèvre a voté deux fois. »',
  radioFarmRats: '« Les rats ont ouvert un sac sans abîmer le nœud. Nous soupçonnons un ancien marin. Nous perdons des vivres, mais franchement, nous admirons le geste. »',

  radioMilitaryBolts: '« La galerie s’est affaissée à l’ancien poste 4. Pas de boulons dans le grès : nous avons confondu roche dure et roche sûre. Soutenez vos portées, même quand elles vous semblent belles. »',
  radioMilitaryTradeFilters: '« Nous avons démonté trois filtres intacts. Contre 8 unités de ferraille, ils sont à vous. Varel précise que les filtres n’ont jamais servi à filtrer le café. C’est précisément le problème du café. »',
  radioMilitaryDust: '« Tempête de poussière : deux filtres grillés en une nuit. Prévoyez-en davantage quand le ciel devient couleur de rouille. Les poumons ne comprennent pas les ordres de tenir bon. »',
  radioMilitarySong: '« Varel a chanté la marche du régiment. Deux habitants ont retrouvé le moral, trois ont demandé à changer d’abri. Nous classons l’opération : résultats mitigés. »',

  radioSchoolTradeBooks: '« Nous avons recopié quatre livres. Échange proposé contre 3 médicaments. Attention, le chapitre sur les ponts comporte maintenant des dessins de dragons ; les élèves assurent que cela améliore la portée. »',
  radioSchoolGenerator: '« Le groupe électrogène s’est arrêté en pleine leçon de longue division. Les enfants ont applaudi, puis nous avons tous eu froid. Une panne est une leçon qui dure plus longtemps. »',
  radioSchoolPlay: '« Ce soir, les élèves jouent “Le Voyage au centre de la Terre”. Comme nous sommes déjà au centre, la pièce est courte, mais le moral est remonté jusqu’à la surface. »',
  radioSchoolWater: '« Notre réserve sent le marais depuis les pluies. Boire sans filtrer a rendu deux enfants malades. Une eau claire n’est pas forcément une eau propre ; répétez-le à vos équipes. »',

  radioHospitalHelp: '« Nos médicaments arrivent au bout. Quatre doses nous permettraient de stabiliser les malades. Si vous pouvez envoyer une équipe, nous ouvrirons le sas ; sans aide, certains risquent d’y rester. »',
  radioHospitalTradeMeds: '« La dernière livraison laisse 4 médicaments disponibles. Nous demandons 10 portions de nourriture. Le docteur promet de ne pas ajouter une ordonnance pour manger des légumes, si vous êtes rapides. »',
  radioHospitalDysentery: '« Dysenterie dans le dortoir bas : la nappe a contaminé le réservoir. Filtrez après le dégel, même si l’eau paraît limpide. Nous avons payé cette leçon avec trois journées de fièvre. »',
  radioHospitalBirth: '« Une petite Alma est née à 3 h 12. Elle crie plus fort que l’alerte d’incendie et, pour une fois, personne ne demande à réduire le volume. »',

  radioMetroCollapse: '« Un pan de voûte a barré le tunnel nord. Il n’y avait ni cintres ni étais. Les gravats ont gagné. Ne mesurez pas une galerie seulement en mètres de marche : regardez ce qui la retient. »',
  radioMetroTradeTools: '« Nous avons dégagé 3 outils d’une cabine de maintenance. Échange contre 2 composants électroniques. Marteaux légèrement cabossés, mais ils frappent encore avec conviction. »',
  radioMetroMushrooms: '« Les champignons ont colonisé l’ancien buffet. Nous avons d’abord appelé ça une catastrophe. Puis nous avons trouvé du sel. Les définitions changent vite, ici. »',
  radioMetroNoise: '« Un bruit régulier vient de la rame bloquée. Nous avons accouru avec les lampes : c’était une alarme de micro-ondes. Personne n’a osé demander ce qu’il réchauffait depuis tout ce temps. »',

  radioSilenceFarmers: 'Les Trois-Sillons n’ont pas répondu au créneau convenu. Seul le souffle régulier de la porteuse occupe la fréquence.',
  radioSilenceMilitary: 'Bunker Bélier a manqué son rapport. Le sergent Varel ne laissait jamais une phrase inachevée ; cette fois, il n’en reste aucune.',
  radioSilenceSchool: 'La fréquence de l’école reste silencieuse. On attend un chant, une leçon, même une mauvaise réponse. Rien ne vient.',
  radioSilenceHospital: 'Saint-Blaise ne répond plus. La radio grésille doucement, comme une respiration que personne ne saurait retenir.',
  radioSilenceMetro: 'La ligne 9 ne diffuse plus. Isa devait pourtant passer à l’aube ; son microphone est resté muet.',

  radioHospitalHelpTitle: 'Quatre doses pour Saint-Blaise',
  radioHelpRescue: 'Envoyer une expédition de secours',
  radioHelpRescueEffect: 'Prévoir 4 médicaments et une équipe : dose de surface et risques de voyage. Les médicaments seront portés jusqu’au voisin avant le retour à la trappe.',
  radioHelpSupplies: 'Déposer les médicaments',
  radioHelpSuppliesEffect: 'Donner 4 médicaments sans envoyer d’équipe. Leur sort dépendra ensuite de leurs propres forces.',
  radioHelpDecline: 'Garder nos réserves',
  radioHelpDeclineEffect: 'Aucune dépense. Le message annonce explicitement que des malades peuvent mourir sans ces médicaments.',

  radioTradeAccepted: 'Dépôt de troc préparé à la trappe. Les voisins viendront le chercher.',
  radioTradeCompleted: 'Le dépôt a été enlevé ; les ressources échangées attendent dans le stock de surface.',
  radioTradeUnavailable: 'Cette proposition de troc n’est plus disponible.',
  radioTradeAbandoned: 'Plus personne ne viendra chercher le dépôt de troc : nos ressources restent à la trappe.',
  radioNeighborSilent: 'Ce voisin ne répond plus : le troc est annulé.',
  radioNeighborShort: 'Le voisin n’a plus de quoi honorer ce troc.',
  radioExpeditionDeparture: '« Nous quittons la trappe pour {site}. Dose prévue : {dose} mSv. »',
  radioExpeditionArrived: '« Arrivés à {site}. Le toit tient. Dose relevée : {dose} mSv. »',
  radioExpeditionDose: '« Dose moyenne de l’équipe : {dose} mSv. Nous continuons tant que les combinaisons tiennent. »',
  radioExpeditionReturn: '« Nous repartons vers la trappe. Butin : {loot}. »',
  radioExpeditionRecall: '« Ordre reçu : nous abandonnons la fouille et rentrons immédiatement. »',
  radioRescueDeparture: '« Notre équipe quitte la trappe pour {neighbor} avec les médicaments réservés. »',
  radioRescueDelivered: '« {neighbor} a bien reçu les médicaments. Notre équipe revient vers la trappe. »',
  radioRescueReturned: '« L’équipe de secours est rentrée de {neighbor}. Dose moyenne reçue : {dose} mSv. »',
  radioRescueLost: '« L’équipe de secours partie vers {neighbor} est perdue. Les médicaments n’ont pas été crédités. »',
  radioRescueUnavailable: '« Le secours vers {neighbor} n’a pas pu être livré. Aucune ressource n’a été fabriquée ni créditée. »',
  storyRadioNeighbors: 'Voisins encore en vie : {surviving}. Fréquences tombées au silence : {silent}.',

  eventRadioOnline: 'Antenne en service : {text}',
  eventRadioOffline: 'Antenne hors service : les voisins sont injoignables.',
  eventRadioMessage: '{text}',
  eventRadioSilence: '{text}',
  eventRadioTradeAccepted: '{text}',
  eventRadioTradeCompleted: '{text}',
  eventRadioTradeAbandoned: '{text}',
  ...RADIO_TEXT_EXTRA,
});

export function radioText(key, values = {}) {
  let text = RADIO_TEXT[key] ?? key;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

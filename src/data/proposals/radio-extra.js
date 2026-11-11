// Source unique des événements supplémentaires, importée par radio.js et radioText.js.
const news = (stocks, morale, hint = false) => ({ deltas: { stocks, morale }, ...(hint ? { hint: true } : {}) });
const trade = (give, receive, morale = 2) => ({ trade: { give, receive, morale } });

// Seize nouveaux messages par voisin existant : 80 au total.
const existing = {
  farmers: [
    ['SeedLabels', 'Mara, Trois-Sillons. Nous avons échangé les étiquettes des graines. Personne ne saura avant la récolte si le dîner sera un succès ou une explication.', news({ seeds: -1 }, -1)],
    ['BucketMeasure', 'Nous mesurons l’eau avec le même seau depuis toujours. Rien qu’hier, cinq personnes ont relevé cinq niveaux différents. Les racines apprécient cette soudaine précision.', news({ waterClean: 6 }, 2, true)],
    ['GoatInventory', 'Inventaire terminé : douze sachets, onze retrouvés. La chèvre nous regarde avec l’air d’un témoin qui demande un avocat.', news({ seeds: -1 }, 1)],
    ['Roots', 'Les premières racines ont atteint le fond des caisses. Nous avons déplacé les lampes au lieu de les arroser davantage. Elles avaient besoin de place, pas d’une piscine.', news({ food: 8 }, 3, true)],
    ['SeedExchange', 'Nous pouvons laisser deux sachets de semences contre quatre unités de bois. Nos caisses tiennent par habitude, et l’habitude n’est pas un bon clou.', trade({ wood: 4 }, { seeds: 2 })],
    ['NightHarvest', 'Nous avons récolté pendant que les autres dormaient. Un panier est tombé. Tout le monde est maintenant levé et personne ne croit à notre discrétion.', news({ food: 12 }, 3)],
    ['DryReserve', 'Une fuite a touché les sacs du bas. Ceux sur les étagères sont secs. La prochaine fois, nous construirons les étagères avant de leur trouver une utilité.', news({ food: -6, wood: -2 }, -3, true)],
    ['WeatherMemory', 'Mon père disait que ses genoux annonçaient la pluie. Ici, ils annoncent les escaliers. Nous suivons plutôt vos relevés pour les sorties.', news({}, 2)],
    ['GreenGift', 'Nous proposons huit portions de légumes contre six unités d’eau propre. Mara insiste : les tiges tordues nourrissent autant que les droites.', trade({ waterClean: 6 }, { food: 8 }, 3)],
    ['Pollination', 'Pollinisation au pinceau aujourd’hui. Luc a demandé un grade d’abeille. Nous lui avons accordé le titre, sans supplément de ration.', news({ food: 7 }, 2)],
    ['LampBreak', 'Une lampe est tombée. Nous avons sauvé les plants, moins bien le repas de demain. Contrôlez vos attaches avant d’accuser les graines.', news({ food: -7, scrap: 1 }, -3, true)],
    ['FirstSmell', 'Une tomate a senti la tomate avant même d’être coupée. On l’a fait passer de main en main. Le dîner a commencé avec un léger retard.', news({ food: 4 }, 5)],
    ['GardenNames', 'Nous avons nommé les rangs d’après nos anciennes rues. Le meilleur rendement vient de l’impasse des Acacias. La mairie aurait été surprise.', news({}, 4)],
    ['CompostTrade', 'Contre six unités de déchets organiques, nous proposons deux sachets de graines. Le compost ne fait pas une belle monnaie, mais personne ici ne l’a encore contrefait.', trade({ organicWaste: 6 }, { seeds: 2 })],
    ['ThawWatch', 'La marque d’eau monte sur la paroi. Nous avons sorti les sacs du coin bas avant le dégel. C’est plus simple de porter des sacs que de les essorer.', news({ wood: -2 }, 2, true)],
    ['TableSet', 'Nous avons mis la table pour douze et la chèvre a pris la treizième place. Il y avait assez. Je répète, parce que cela fait du bien : il y avait assez.', news({ food: -6 }, 7)],
  ],
  military: [
    ['RollCall', 'Bélier. Neuf présents à l’appel. Nous étions neuf hier. Le sergent souhaite que cette excellente statistique soit maintenue.', news({}, 3)],
    ['BootPolish', 'Varel a ordonné de cirer les bottes. Nous avons répondu que le cirage pourrait servir de combustible. L’ordre est en cours de réexamen.', news({}, 1)],
    ['BoltCount', 'Contrôle des boulons effectué. Deux manquaient derrière une affiche de sécurité. L’affiche est désormais fixée ailleurs.', news({ scrap: -3 }, 2, true)],
    ['FilterTrade', 'Deux filtres disponibles contre cinq unités de ferraille. État vérifié. Nous n’employons plus le mot « impeccable » depuis l’affaire des couvertures.', trade({ scrap: 5 }, { filters: 2 })],
    ['Cupboard', 'Une armoire condamnée contenait six rations et deux outils. Le registre disait « mobilier sans intérêt ». Nous avons corrigé les deux mots.', news({ food: 6, tools: 2 }, 3)],
    ['DoubleWatch', 'Deux gardes avaient reçu la même relève. Ils ont surveillé mutuellement leur sommeil pendant une heure. Le planning est maintenant écrit en entier.', news({}, -2)],
    ['DustMark', 'Une ligne de poussière traverse le plafond. Nous l’avons datée au crayon pour voir si elle s’allonge. Ce qui bouge se signale parfois très poliment.', news({ scrap: -2 }, -1, true)],
    ['Songs', 'Répétition de chant interrompue : le sergent avait changé de couplet sans prévenir. L’état-major promet une meilleure coordination.', news({}, 4)],
    ['TinTrade', 'Nous échangeons huit unités de ferraille contre six portions de nourriture. Les boîtes vides sont robustes. Nous serions ravis de vérifier celles qui ne le sont pas encore.', trade({ food: 6 }, { scrap: 8 })],
    ['SignalDrill', 'Exercice radio réussi. Chacun sait annoncer une panne. Le prochain exercice portera sur l’art de préciser quelle machine.', news({}, 3, true)],
    ['WaterPipe', 'Une canalisation gelée a fendu son joint. Nous avons isolé le tronçon. L’eau immobile supporte mal les coins froids, même sur ordre.', news({ waterClean: -8, scrap: -2 }, -4, true)],
    ['LostStripe', 'Varel a perdu un galon dans la soupe. Personne n’a demandé une promotion. Nous considérons cette retenue comme un progrès collectif.', news({}, 3)],
    ['Spares', 'Le même joint avait été compté dans trois caisses de secours. Nous en possédons toujours un, mais notre confiance en l’inventaire a baissé.', news({ scrap: -2 }, -2)],
    ['ToolTrade', 'Deux outils révisés contre deux médicaments. Ils tiennent bien en main, y compris dans celle du sergent, ce qui constitue notre essai le plus sévère.', trade({ meds: 2 }, { tools: 2 })],
    ['EveningPost', 'Le poste du soir entend les voisins finir leurs repas. Nous avons cessé de couper le micro tout de suite. Fin de communication, mais pas d’écoute.', news({}, 5)],
    ['CivilianDay', 'Le dimanche sera sans grades, a décidé Varel. Quelqu’un lui a demandé lequel. La discussion est très civile.', news({ food: -3 }, 6)],
  ],
  school: [
    ['MapMargin', 'Nino, Jules-Verne. Les enfants dessinent la surface de mémoire. La boulangerie prend beaucoup de place. Elle doit être à l’échelle du manque.', news({}, 4)],
    ['Fractions', 'Nous avons étudié les fractions avec les rations. Les enfants ont immédiatement demandé à étudier les additions. Leur sens pédagogique progresse.', news({}, 2)],
    ['BookExchange', 'Trois livres recopiés contre quatre unités de bois. Il manque des virgules, mais toutes les recettes et tous les schémas ont été vérifiés deux fois.', trade({ wood: 4 }, { books: 3 })],
    ['PlantLesson', 'La plante de la classe a donné quelques graines. Sept enfants les surveillent. Si l’attention faisait pousser, nous aurions déjà une forêt.', news({ seeds: 3, food: 2 }, 5)],
    ['AirLesson', 'La classe a compris pourquoi on n’obstrue pas la ventilation avec des dessins. Nous avons déménagé la galerie d’art. L’air circule mieux et les dragons aussi.', news({}, 2, true)],
    ['WrongBell', 'La cloche a sonné une heure trop tôt. Les élèves étaient prêts. L’instituteur un peu moins. Nous appellerons cela un exercice.', news({}, 1)],
    ['Ink', 'Nous fabriquons de l’encre avec du charbon. Les doigts sont noirs, les phrases visibles. Aucun parent ne peut venir se plaindre de l’écriture.', news({ books: 1 }, 2)],
    ['CareParcel', 'Nous avons préparé deux livres d’histoires contre un médicament. Choisissez celui que vous voulez. Le second est pour la personne qui vous le lira.', trade({ meds: 1 }, { books: 2 }, 3)],
    ['WaterMark', 'Les élèves ont tracé une marque sur le réservoir. L’eau baisse plus vite les jours de lessive. Voilà une observation que même les adultes ont notée.', news({ waterClean: 3 }, 2, true)],
    ['Attendance', 'Tout le monde était là ce matin. Nous avons laissé l’appel durer un peu plus longtemps. C’est parfois la meilleure partie de la leçon.', news({}, 5)],
    ['ShadowShow', 'Spectacle d’ombres sur un drap : une main fait le chien, deux font la montagne. Pour la mer, nous avons demandé l’aide du public.', news({ food: -2 }, 6)],
    ['ColdDesk', 'Le coin des petits refroidit. Nous avons déplacé les tables loin de la paroi et rapproché les couvertures. Les chiffres étaient devenus difficiles à tracer.', news({ wood: -1 }, -1, true)],
    ['Spelling', 'Dictée du jour : « plus tard ». Personne n’a demandé ce que cela voulait dire. Je me permets d’y voir un bon signe.', news({}, 3)],
    ['SeedTrade', 'Deux sachets de graines de la classe contre six unités d’eau propre. Nous garderons une graine pour la leçon. Les élèves ont négocié cette clause.', trade({ waterClean: 6 }, { seeds: 2 })],
    ['Birthday', 'Nous ne connaissons pas la date d’anniversaire de Sami. Il a choisi demain. Les autres trouvent le délai raisonnable pour dessiner les cadeaux.', news({ food: -3 }, 5)],
    ['WindowWord', 'Le mot du jour était « fenêtre ». Les enfants nés ici ont demandé la différence avec une porte. Nous avons pris le temps de répondre.', news({}, 4)],
  ],
  hospital: [
    ['ChairSleep', 'Sarr, Saint-Blaise. Marin a réparé une chaise assez confortable pour que je m’y endorme. Il appelle cela un équipement médical. Je ne le contredis pas.', news({}, 3)],
    ['HandWash', 'Nous avons ajouté une cruche près de la salle de soins. Se laver les mains avant d’entrer est une consigne très courte. Nous continuons à la répéter.', news({ waterClean: -5 }, 2, true)],
    ['MedsTrade', 'Deux médicaments contre cinq portions de nourriture. Les emballages sont lisibles et les doses vérifiées. Notre écriture, malheureusement, reste celle d’un hôpital.', trade({ food: 5 }, { meds: 2 })],
    ['PatientWalk', 'Notre patient du lit trois est rentré chez lui. Les trois médicaments prévus restent en réserve. Nous avons applaudi assez doucement pour qu’il puisse prétendre ne pas l’avoir remarqué.', news({ meds: 3 }, 5)],
    ['FilterCheck', 'Nous avons trouvé un filtre arrivé en fin de service. L’eau était encore claire. Notez les dates : la couleur ne donne pas toujours l’alerte.', news({ filters: -1 }, -1, true)],
    ['BandageFold', 'Les bandes sont pliées par taille et le manuel de soins recopié. Quelqu’un range les plus petites bandes dans une boîte à bijoux. C’est plus logique qu’il n’y paraît.', news({ books: 1 }, 2)],
    ['NightFeed', 'Le dernier bébé mange à heures fixes. Il est le seul ici à savoir lesquelles. Sa mère vous remercie pour les nouvelles du matin.', news({ food: -3 }, 5)],
    ['ManualTrade', 'Un manuel de soins contre trois unités d’eau propre. Les pages les plus utiles ont des coins pliés. Les autres aussi, après réflexion.', trade({ waterClean: 3 }, { books: 1 })],
    ['Thermometer', 'Nous avons comparé nos thermomètres. Celui qui annonçait toujours une bonne nouvelle est cassé. Les nouvelles suivantes seront moins agréables, mais plus utiles.', news({ scrap: 1 }, -1, true)],
    ['CleanCorner', 'La réserve de linge est sèche depuis que nous l’avons éloignée du mur suintant. Certains traitements commencent avec une étagère bien placée.', news({ wood: -1 }, 2, true)],
    ['Tea', 'Une patiente a préparé une boisson chaude pour l’équipe. Je lui avais prescrit du repos. Elle me rappelle qu’on ne peut pas faire respecter toutes les prescriptions.', news({ waterClean: -2 }, 4)],
    ['LongCough', 'Deux toux traînent depuis plusieurs jours. Nous avons séparé les couchettes et vérifié l’air. Attendre ne devient pas un traitement parce qu’on attend longtemps.', news({ meds: -1 }, -3, true)],
    ['SupplyTrade', 'Trois médicaments disponibles contre deux filtres. Nous préférons traiter les gens plutôt que ce qui vient du robinet, mais les deux se rejoignent vite.', trade({ filters: 2 }, { meds: 3 })],
    ['MendedApron', 'Mon tablier a été raccommodé en fil bleu. Je reconnais les points de quatre personnes. Il protège à peine mieux. Je le porte avec beaucoup plus de soin.', news({}, 4)],
    ['EmptyBed', 'Un lit s’est libéré parce que son occupant est rentré chez lui. Je précise la raison. Nous savons tous ce que laisse entendre une phrase incomplète.', news({}, 6)],
    ['RestOrder', 'L’équipe m’a prescrit une heure sans radio. Je trouve leur méthode autoritaire et leur diagnostic probablement juste. Saint-Blaise reprendra à la prochaine fenêtre.', news({}, 3)],
  ],
  metro: [
    ['PlatformClock', 'Isa, ligne 9. L’horloge du quai marche de nouveau. Elle ne donne pas la bonne heure, mais elle y travaille régulièrement.', news({ scrap: -1 }, 3)],
    ['TunnelEcho', 'Nous entendions des pas dans le tunnel ouest. C’étaient les nôtres, avec un détour. Nous avons raccourci la liste des visiteurs attendus.', news({}, 1)],
    ['TimberTrade', 'Quatre unités de bois contre cinq portions de nourriture. Ce sont des planches de banc. Elles ont déjà supporté beaucoup de monde fatigué.', trade({ food: 5 }, { wood: 4 })],
    ['Drain', 'Le caniveau bouché faisait monter l’eau contre la porte. Une heure de nettoyage, deux seaux de boue. Regardez par terre avant de creuser un nouvel étage.', news({ waterClean: -3 }, 2, true)],
    ['LostProperty', 'Objets trouvés : une chaussure, un bouton, une photographie et une clé à molette. Quelqu’un a repris le bouton. La clé retourne à l’atelier.', news({ tools: 1 }, 2)],
    ['BoltSong', 'On vérifie les cintres en suivant les couplets d’une chanson. Ça évite d’en oublier. Maintenant, personne ne veut entendre le refrain au dîner.', news({ scrap: -2 }, 2, true)],
    ['MushroomTray', 'Nouvelle récolte derrière l’ancien distributeur. Nous lui avons laissé son étiquette « produits frais ». Pour la première fois, elle dit vrai.', news({ food: 9 }, 4)],
    ['ToolSwap', 'Un outil révisé contre trois unités de bois. La poignée d’origine était excellente en théorie et glissante dans la main.', trade({ wood: 3 }, { tools: 1 })],
    ['StationNames', 'Nous rebaptisons les stations d’après ce qu’on y trouve. Saint-Ambroise devient Chaussettes-Sèches. C’est moins noble et beaucoup plus précis.', news({}, 4)],
    ['HotRail', 'La conduite chaude a dilaté sa fixation. Nous avons laissé du jeu après réparation. Même sous terre, les choses ont besoin de place pour changer.', news({ scrap: -2 }, 1, true)],
    ['Announcement', 'Essai des haut-parleurs : « attention à la marche ». Toute la station a levé le pied en même temps. Les vieux réflexes voyagent bien.', news({}, 3)],
    ['LeakNight', 'Une fuite nous a réveillés. Les lits sur palettes sont restés secs, les autres moins. Nous reconstruirons le dortoir en commençant par ses pieds.', news({ wood: -3, food: -4 }, -3, true)],
    ['ScrapSwap', 'Six unités de ferraille contre un filtre. Nous en avons trouvé derrière la cabine. Le filtre, lui, ne se laisse toujours pas découvrir.', trade({ filters: 1 }, { scrap: 6 })],
    ['TrainGarden', 'Trois caisses de champignons occupent maintenant la première classe. Le contrôleur aurait eu du mal à décider combien de billets demander.', news({ food: 6 }, 3)],
    ['NorthReturn', 'Le passage nord est de nouveau praticable. Les étais sont numérotés, les équipes aussi. On préfère compter deux fois que manquer quelqu’un.', news({ wood: -4 }, 5, true)],
    ['LastService', 'Dernier service du soir. Aucun train annoncé, six personnes rentrées, une casserole encore chaude. On appelle toujours cela le trafic.', news({ food: -2 }, 6)],
  ],
};

// Deux arcs de huit nouvelles chacun ; leur issue utilise les états existants active/silent.
const newcomers = {
  lockkeepers: [
    ['WaterMark', 'Jo, écluse des Saules. Nous avons trouvé la marque de la dernière crue à hauteur de menton. Nous dormons désormais un peu plus haut.', news({ wood: -2 }, 1, true)],
    ['Wheel', 'Le volant de vanne tourne enfin. Un quart de tour, puis du repos pour tout le monde. La machine et nous avons à peu près le même âge.', news({ scrap: -2 }, 3)],
    ['RopeTrade', 'Nous échangeons cinq unités de bois sec contre trois unités de ferraille. Le bois vient des anciennes passerelles. Nous avons testé chaque planche avec la personne la plus méfiante.', trade({ scrap: 3 }, { wood: 5 })],
    ['Pressure', 'La pression remonte derrière la vanne. Nous avons préparé un second barrage avant de toucher au premier. L’eau ne lit pas les plans de réparation.', news({ wood: -3 }, -2, true)],
    ['Gauge', 'Notre jauge est un flotteur attaché à une cuillère. Elle fonctionne. Jo a demandé qu’on cesse de l’emprunter pour la soupe.', news({}, 3)],
    ['DryRoom', 'La salle basse est sèche depuis deux jours. Nous y descendons seulement les outils, pour commencer. La confiance aussi se remplit lentement.', news({ scrap: 4 }, 4)],
    ['Reeds', 'Un carré de roseaux pousse au-dessus du canal. Nous l’apercevons depuis l’ouverture haute. Personne n’avait prévu qu’une mauvaise herbe fasse taire une pièce entière.', news({}, 6)],
    ['WatchKept', 'Les trois tours de garde tiennent. Si vous sortez un jour par le canal, appelez l’écluse des Saules. Nous laisserons une lanterne du bon côté.', news({ food: -2 }, 5)],
  ],
  printers: [
    ['TypeCase', 'Salomé, imprimerie du Passage. Nous avons trié les caractères. Beaucoup de E, très peu de points. Cela ressemble assez à nos conversations.', news({}, 3)],
    ['PaperDry', 'Le papier boit l’humidité du mur. Nous avons relevé les piles sur des palettes. Les nouvelles patienteront ; elles doivent d’abord sécher.', news({ wood: -2, books: -1 }, -2, true)],
    ['ManualTrade', 'Trois manuels imprimés contre deux unités de ferraille. Les illustrations sont modestes. Les dimensions ont été contrôlées, ce qui nous paraît plus urgent.', trade({ scrap: 2 }, { books: 3 })],
    ['PressShift', 'La presse exige deux bras de plus que prévu. Nous alternons les équipes. Chaque feuille porte un peu de l’épaule de chacun.', news({ books: 3, food: -3 }, 2)],
    ['Correction', 'Rectificatif : notre fiche disait de fermer la sortie d’air. Il fallait lire de la dégager. Nous avons récupéré chaque exemplaire. Gardez les corrections avec les plans.', news({ books: -1 }, -3, true)],
    ['NamesBook', 'Nous imprimons les noms de ceux dont vous voulez garder trace. Pas de tarif. Envoyez l’orthographe lentement ; elle mérite qu’on prenne du temps.', news({ books: 2 }, 5)],
    ['BlueInk', 'Un pot d’encre bleue a survécu. Nous ne l’utilisons que pour les cartes. Les enfants nous demandent où nous avons trouvé autant de ciel.', news({ books: 1 }, 5)],
    ['NextEdition', 'Le registre des abris compte une page de plus. Nous avons laissé de la place entre les noms. La prochaine édition pourrait contenir des adresses de surface.', news({ books: 2 }, 6)],
  ],
};

const texts = {
  radioLabNeighborLockkeepers: 'L’écluse des Saules',
  radioLabVoiceLockkeepers: 'Jo, ancienne éclusière, parle lentement et vérifie ses mesures avant ses espoirs.',
  radioLabContactLockkeepers: '« Écluse des Saules, ici Jo. Nous sommes six sous la maison des vannes. Si vous entendez couler, c’est normal. Si je m’arrête de parler pour écouter, un peu moins. »',
  radioLabSilenceLockkeepers: 'L’écluse des Saules ne répond plus. Au dernier appel, Jo comptait les coups contre la vanne. Le créneau suivant reste vide.',
  radioLabNeighborPrinters: 'L’imprimerie du Passage',
  radioLabVoicePrinters: 'Salomé, typographe attentive aux noms, corrige ses erreurs publiquement et garde l’humour en petites lettres.',
  radioLabContactPrinters: '« Imprimerie du Passage. Salomé au micro. Cinq personnes, une presse à bras et assez de papier pour les nouvelles importantes. Nous cherchons encore comment les reconnaître. »',
  radioLabSilencePrinters: 'L’imprimerie du Passage ne répond plus. Une feuille corrigée attendait encore son deuxième passage sous la presse. Nous gardons leur fréquence dans le registre.',
};
const events = {};
const idsByNeighbor = {};

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

for (const [neighborId, rows] of Object.entries({ ...existing, ...newcomers })) {
  idsByNeighbor[neighborId] = rows.map(([suffix, text, mechanics]) => {
    const id = `lab${neighborId[0].toUpperCase()}${neighborId.slice(1)}${suffix}`;
    const textKey = `radio${id[0].toUpperCase()}${id.slice(1)}`;
    texts[textKey] = `« ${text} »`;
    events[id] = deepFreeze({ textKey, ...mechanics });
    return id;
  });
}

export const RADIO_EVENT_IDS_EXTRA = deepFreeze(idsByNeighbor);
export const RADIO_EVENTS_EXTRA = deepFreeze(events);
export const RADIO_TEXT_EXTRA = deepFreeze(texts);
export const RADIO_NEIGHBORS_EXTRA = deepFreeze([
  {
    id: 'lockkeepers', kind: 'lock', nameKey: 'radioLabNeighborLockkeepers', voiceKey: 'radioLabVoiceLockkeepers',
    contactKey: 'radioLabContactLockkeepers', silenceKey: 'radioLabSilenceLockkeepers',
    stocks: { food: [28, 44], waterClean: [35, 60], wood: [18, 28], scrap: [10, 18] },
    morale: [46, 65], events: idsByNeighbor.lockkeepers,
  },
  {
    id: 'printers', kind: 'printshop', nameKey: 'radioLabNeighborPrinters', voiceKey: 'radioLabVoicePrinters',
    contactKey: 'radioLabContactPrinters', silenceKey: 'radioLabSilencePrinters',
    stocks: { food: [24, 42], waterClean: [28, 48], books: [15, 24], wood: [8, 16], scrap: [6, 12] },
    morale: [50, 69], events: idsByNeighbor.printers,
  },
]);

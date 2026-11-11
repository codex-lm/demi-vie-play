// Source unique des dilemmes supplémentaires, importée par dilemmas.js et storytellerText.js.
// Chaque option est [délai en jours, effets, libellé, conséquence racontée].
const entries = [
  ['labDryBoots', 'miner', true, 'Les bottes de trop',
    '{name} a trouvé une paire de bottes sèches. Trois personnes les réclament pour le prochain chantier.', [
      [1, { resources: { wood: -2 }, targetMorale: 5, targetWorkBlockedDays: 1 }, 'Fabriquer des semelles pour les autres. Un jour de travail et du bois y passeront.', 'Les semelles grincent, mais personne ne travaille pieds mouillés. {name} reprend demain.'],
      [2, { targetMorale: -4, factions: { profonds: 3, remonteurs: -2 } }, 'Réserver les bottes au chantier profond. {name} devra attendre son tour.', 'Les bottes descendent. {name} regarde encore la flaque au pied de son lit.'],
      [1, { resources: { food: -3 }, morale: 2 }, 'Organiser des tours et offrir un repas chaud aux équipes. Les vivres diminueront.', 'On se passe les bottes avec la gamelle. Le règlement tient sur un bout de ficelle.'],
    ]],
  ['labLastPencil', 'colonist', true, 'Le dernier crayon',
    '{name} veut noter les histoires de chacun. L’atelier demande le même crayon pour ses mesures.', [
      [2, { resources: { books: 1, wood: -1 }, targetWorkBlockedDays: 1, targetMorale: 3 }, 'Laisser {name} copier les récits sur des planchettes. Cela prendra une journée.', 'Un petit livre de bois sèche près de l’atelier. Les marges sentent encore la sciure.'],
      [1, { resources: { metal: 2 }, targetMorale: -4 }, 'Donner le crayon à l’atelier pour trier les pièces récupérables. Les récits attendront.', 'Deux pièces de métal ont échappé au rebut. {name} raconte désormais sans écrire.'],
      [2, { resources: { food: -2 }, morale: 2 }, 'Partager le crayon autour d’un repas. Les mesures d’abord, les souvenirs ensuite.', 'Les cotes et les anniversaires partagent une feuille. Personne ne confond encore les deux.'],
    ]],
  ['labCrackedCup', 'colonist', true, 'La tasse fêlée',
    '{name} garde une tasse venue de la surface. Elle fuit. La réserve réclame son morceau de métal.', [
      [1, { resources: { metal: -1 }, targetMorale: 6 }, 'Réparer la tasse avec une petite pièce de métal. Elle compte pour {name}.', 'La réparation est laide. {name} boit lentement, comme si la tasse était neuve.'],
      [1, { resources: { scrap: 2 }, targetMorale: -6 }, 'La récupérer pour la ferraille. {name} perdra son souvenir.', 'La tasse a rejoint les pièces détachées. Sa place reste vide à côté du lit.'],
      [2, { targetMorale: 2, factions: { remonteurs: 2, profonds: -1 } }, 'La garder comme mesure pour les semences. Les Profonds trouvent cela sentimental.', 'La tasse ne garde plus l’eau, mais elle mesure très bien les graines.'],
    ]],
  ['labFalseDawn', 'technician', true, 'Un faux matin',
    '{name} propose une lampe qui s’allumerait avant le réveil. L’atelier manque déjà de composants.', [
      [3, { resources: { electronics: -1 }, morale: 5 }, 'Consacrer un composant au réveil lumineux. Le dortoir gagnera un peu de moral.', 'Une lumière douce précède la cloche. Quelqu’un demande s’il faut maintenant inventer les dimanches.'],
      [2, { resources: { fuel: -3 }, targetMorale: 3 }, 'Essayer quelques jours avec les lampes actuelles. Cela consommera du combustible.', 'Le dortoir a connu trois aubes et une panne. {name} a tout noté.'],
      [1, { targetMorale: -3, factions: { profonds: 2 } }, 'Garder les composants pour les machines. {name} range son dessin.', 'La lampe reste sur le papier. Le réveil garde son bruit de casserole.'],
    ]],
  ['labSoupName', 'farmer', true, 'Comment appeler la soupe',
    '{name} refuse d’écrire « ragoût » sur une marmite d’insectes. Le repas refroidit pendant le débat.', [
      [1, { law: 'sharedMeals', resources: { food: -4 }, morale: 2 }, 'Servir ensemble et annoncer la recette. Les repas partagés entreront dans la Charte.', 'La recette a fait grincer quelques dents. Les bols sont revenus vides.'],
      [1, { law: 'rationing', targetMorale: -4, factions: { profonds: 2 } }, 'Peser les portions et couper court. Les rations seront réduites par la loi.', 'La balance a clos la discussion. {name} continue d’appeler cela de la soupe.'],
      [2, { resources: { food: -2 }, targetMorale: 4 }, 'Laisser {name} préparer une dégustation avec un peu des réserves.', 'Trois noms ont été proposés. « Ce qui tient au ventre » a remporté le vote.'],
    ]],
  ['labNightKnock', 'colonist', false, 'Deux coups dans le tuyau',
    '{name} entend chaque nuit deux coups dans une conduite. Certains veulent ouvrir le passage condamné.', [
      [2, { resources: { metal: -2 }, targetWorkBlockedDays: 1, targetMorale: 4 }, 'Faire inspecter et caler la conduite. Une journée et deux pièces seront nécessaires.', 'Un collier desserré cognait contre la paroi. {name} a enfin dormi jusqu’à la cloche.'],
      [1, { law: 'curfew', morale: -3, factions: { profonds: 3 } }, 'Interdire les sorties nocturnes. Le couvre-feu calmera les galeries, pas toutes les inquiétudes.', 'Les coups continuent après le couvre-feu. Personne ne va plus les compter à voix haute.'],
      [2, { targetMorale: -7, factions: { remonteurs: -2 } }, 'Ne rien entreprendre. {name} restera seul avec le bruit.', 'La conduite sonne toujours deux fois. {name} change son oreiller de côté.'],
    ]],
  ['labBorrowedShift', 'technician', true, 'Une relève empruntée',
    '{name} n’a pas quitté l’atelier depuis deux services. Une panne mineure attend encore.', [
      [1, { law: 'work12', resources: { metal: -2 }, targetMorale: 6 }, 'Raccourcir les journées et remplacer la pièce entière. Cela coûtera du métal.', 'La pièce est changée. {name} découvre que sa couchette est toujours à la même place.'],
      [2, { law: 'work16', resources: { scrap: 5 }, targetMorale: -9 }, 'Allonger les journées pour récupérer les pièces. {name} en sortira épuisé et amer.', 'Le tas de ferraille a grandi. {name} ne regarde plus l’horloge.'],
      [2, { targetWorkBlockedDays: 2, resources: { fuel: -4 }, targetMorale: 4 }, 'Mettre {name} au repos et utiliser le secours. Du combustible sera consommé.', 'Le secours ronfle. Pour une fois, ce n’est pas {name} qui doit le surveiller.'],
    ]],
  ['labSavedSeeds', 'farmer', true, 'Les graines de la poche',
    '{name} sort quelques graines d’une poche cousue. Elles étaient destinées à un jardin précis, disparu.', [
      [4, { resources: { seeds: 3, waterClean: -8 }, targetMorale: 5 }, 'Consacrer de l’eau aux essais de germination. Les graines viables rejoindront la réserve.', 'Trois lots ont germé. {name} a donné à chacun le nom d’une ancienne allée.'],
      [2, { resources: { seeds: 1 }, targetMorale: 1 }, 'Conserver un lot au sec, sans promettre de le planter.', 'Un sachet porte maintenant le nom de {name}. Rien n’en sort encore, mais rien n’est perdu.'],
      [1, { resources: { food: 3 }, targetMorale: -6, factions: { profonds: 2 } }, 'Les ajouter au prochain repas. Ce petit gain coûtera un espoir à {name}.', 'Les graines ont épaissi la soupe. {name} n’a pas demandé une seconde louche.'],
    ]],
  ['labQuietBench', 'elder', true, 'Un banc dans le passage',
    '{name} s’arrête de plus en plus souvent dans le couloir. Un banc gênerait les charges les plus larges.', [
      [2, { resources: { wood: -3 }, targetMorale: 7, morale: 1 }, 'Construire le banc. On portera les charges autrement.', 'Le banc accueille déjà deux personnes. Le détour est devenu une occasion de saluer.'],
      [1, { targetWorkBlockedDays: 1, targetMorale: 3 }, 'Aider {name} à réorganiser son coin. Une journée sera consacrée au déménagement.', 'La couchette est plus proche de la porte. {name} dit que ce n’est pas encore un palais.'],
      [1, { targetMorale: -5, factions: { profonds: 2, remonteurs: -2 } }, 'Garder le passage libre. {name} devra se reposer ailleurs.', 'Le couloir reste dégagé. {name} attend désormais assis sur sa caisse à outils.'],
    ]],
  ['labCleanSheet', 'medic', true, 'Un drap presque blanc',
    '{name} a gardé le dernier drap propre pour les soins. Une famille le demande pour une séparation de couchettes.', [
      [2, { resources: { waterClean: -10 }, morale: 3, targetMorale: 2 }, 'Laver d’autres draps pour satisfaire les deux demandes. Cela prendra de l’eau.', 'Les tissus sèchent côte à côte. Le presque blanc paraît blanc quand on les regarde de loin.'],
      [1, { targetMorale: 4, factions: { remonteurs: -2 } }, 'Réserver le drap à l’infirmerie. {name} sera rassuré, la famille moins.', 'Le drap attend un malade. La famille a tendu deux vestes entre ses couchettes.'],
      [2, { resources: { wood: -2 }, morale: 1, targetMorale: 2 }, 'Fabriquer une cloison légère pour la famille. Le drap restera aux soins.', 'La cloison ne coupe pas les ronflements. Elle suffit pourtant à faire une porte imaginaire.'],
    ]],
  ['labMeasureWall', 'miner', false, 'La mesure contestée',
    '{name} a inscrit une largeur maximale sur le mur. L’équipe suivante prétend qu’on peut gagner encore un mètre.', [
      [2, { resources: { metal: -3 }, targetMorale: 5, factions: { profonds: -2 } }, 'Mettre du métal de côté pour le soutènement et respecter la mesure. Le plan restera à réaliser.', 'Le métal est réservé et la marque repeinte. {name} accepte enfin de prêter sa règle.'],
      [1, { targetWorkBlockedDays: 1, morale: -1, targetMorale: 3 }, 'Suspendre une journée le travail de {name} pour refaire les calculs.', 'Les calculs donnent la même largeur. Ils ont cette fois trois signatures.'],
      [1, { targetMorale: -8, factions: { profonds: 4, remonteurs: -3 } }, 'Laisser l’équipe préparer un plan plus large. Aucun creusage ne sera fait automatiquement.', 'La nouvelle ligne dépasse l’ancienne. {name} refuse d’y inscrire son nom.'],
    ]],
  ['labWeddingWire', 'couple', true, 'Deux anneaux de cuivre',
    '{name} veut célébrer son union. Deux petits anneaux et un repas, rien de plus, assure le couple.', [
      [2, { resources: { copperOre: -1, food: -6 }, morale: 5, targetMorale: 8 }, 'Accorder le cuivre et le repas. Toute la salle pourra venir.', 'Les anneaux laissent les doigts verts. Le couple les montre tout de même à chacun.'],
      [2, { resources: { wood: -1 }, targetMorale: 5 }, 'Tailler les anneaux dans le bois et garder les vivres pour les repas ordinaires.', 'Les anneaux sont un peu larges. {name} a attaché le sien avec un fil.'],
      [1, { targetMorale: -6, factions: { profonds: 2 } }, 'Reporter la fête jusqu’à de meilleures réserves. Aucune date ne sera promise.', 'Les invitations retournent dans une poche. {name} a laissé le jour en blanc.'],
    ]],
  ['labRadioRecipe', 'radio', true, 'La recette sans farine',
    '{name} reçoit une recette des Trois-Sillons. Il manque presque tous les ingrédients, sauf l’envie de l’essayer.', [
      [3, { resources: { food: -5 }, morale: 5 }, 'Essayer avec ce qu’on a. Quelques vivres seront consacrés à l’expérience.', 'Le résultat ne ressemble pas au dessin. On a pourtant demandé la recette une seconde fois.'],
      [2, { resources: { books: 1 }, targetWorkBlockedDays: 1, targetMorale: 3 }, 'Faire recopier les recettes par {name}. Le carnet prendra une journée.', 'Le carnet comporte une colonne « quand on en aura ». Elle est presque pleine.'],
      [1, { targetMorale: -3, factions: { profonds: 2 } }, 'Réserver la radio aux échanges utiles. {name} écourtera la conversation.', 'La fréquence a retrouvé ses chiffres. {name} a tout de même retenu le temps de cuisson.'],
    ]],
  ['labMissingSpanner', 'technician', true, 'La clé dans le lit',
    '{name} retrouve une clé d’atelier sous une couverture. Son propriétaire dit qu’elle le rassure.', [
      [1, { resources: { metal: -1 }, targetMorale: 4, morale: 1 }, 'Fabriquer une copie sans usage mécanique. La vraie clé retournera au travail.', 'La copie ne serre aucun écrou. Elle remplit tout de même sa fonction.'],
      [1, { resources: { tools: 1 }, targetMorale: -5 }, 'Récupérer la clé pour la réserve commune. {name} supportera la dispute.', 'La clé a retrouvé son crochet. Le lit paraît plus vide que ne le justifie sa taille.'],
      [2, { targetWorkBlockedDays: 1, targetMorale: 2 }, 'Chercher ensemble une autre manière de dormir. Une journée de {name} sera prise.', 'La clé retourne à l’atelier. Une lourde rondelle a pris sa place sous l’oreiller.'],
    ]],
  ['labGreyLaundry', 'medic', true, 'Le jour de lessive',
    '{name} veut laver les couvertures avant qu’elles ne tiennent debout seules. La réserve d’eau proteste.', [
      [2, { resources: { waterClean: -18 }, morale: 4, targetMorale: 3 }, 'Faire une vraie lessive. L’eau propre diminuera.', 'Les couvertures pendent entre les lits. Tout l’abri sent le tissu humide et le savon ancien.'],
      [1, { resources: { waterClean: -5 }, targetMorale: 2 }, 'Laver seulement les couvertures des soins. Les autres attendront.', 'Une pile propre porte une étiquette. {name} demande qu’on la lise avant de se servir.'],
      [1, { targetMorale: -5, morale: -1 }, 'Reporter encore. {name} devra expliquer pourquoi.', 'La lessive reste au calendrier. Quelqu’un a ajouté un point d’interrogation au crayon gras.'],
    ]],
  ['labCalendarDispute', 'elder', true, 'Le jour qu’on a perdu',
    '{name} soutient que le calendrier a un jour de retard. Personne ne sait depuis quand.', [
      [2, { targetWorkBlockedDays: 1, resources: { books: 1 }, targetMorale: 4 }, 'Comparer les carnets avec {name}. Une journée donnera un registre commun.', 'Le registre porte deux dates pour le même anniversaire. On a gardé les deux.'],
      [1, { law: 'evenings', resources: { food: -4 }, morale: 3 }, 'Récupérer le jour avec une veillée. Les soirées seront reconnues dans la Charte.', 'Personne ne sait quel jour on a fêté. Tout le monde sait ce qu’on y a mangé.'],
      [1, { targetMorale: -4, factions: { profonds: 2 } }, 'Conserver le calendrier actuel. Les équipes ont besoin d’un repère commun.', 'La date n’a pas bougé. {name} garde un petit calendrier personnel près du lit.'],
    ]],
  ['labWarmPipe', 'colonist', true, 'La meilleure place',
    '{name} a déplacé sa couchette contre un tuyau tiède. Tout le dortoir demande désormais une rotation.', [
      [2, { resources: { wood: -2 }, morale: 3, targetMorale: -1 }, 'Aménager un siège commun près du tuyau. {name} rendra la place.', 'Le siège ne désemplit pas. On a inscrit « vingt minutes » sur le mur, sans grand succès.'],
      [1, { targetMorale: 4, factions: { profonds: -2, remonteurs: -2 } }, 'Laisser la place à {name}. Les deux factions trouveront le traitement injuste.', 'La couchette n’a pas bougé. Les regards, eux, se sont faits plus froids.'],
      [1, { targetWorkBlockedDays: 1, morale: 1, targetMorale: 1 }, 'Organiser une rotation et consacrer une journée à déplacer les couchettes.', 'Les couchettes changent de place à chaque tour. Le tuyau, au moins, reste ponctuel.'],
    ]],
  ['labUnsentLetter', 'radio', true, 'La lettre sans adresse',
    '{name} voudrait lire une lettre à la radio. Elle commence par un prénom que personne ne reconnaît.', [
      [2, { targetWorkBlockedDays: 1, targetMorale: 7, factions: { remonteurs: 3 } }, 'Chercher la bonne fréquence avec {name}. Une journée y passera.', 'La lettre a été lue deux fois. Aucune réponse, mais {name} a cessé de la froisser.'],
      [1, { resources: { books: 1 }, targetMorale: 2 }, 'Classer la lettre avec les récits de l’abri pour un envoi futur.', 'Le registre garde une adresse incomplète. {name} sait maintenant où la retrouver.'],
      [1, { targetMorale: -7, factions: { profonds: 3 } }, 'Refuser d’utiliser la fréquence pour une recherche personnelle.', 'La lettre retourne sous la couverture. Le prénom n’a pas franchi la trappe.'],
    ]],
  ['labBadBatch', 'farmer', false, 'Le lot douteux',
    '{name} montre un lot de provisions à l’odeur inhabituelle. La faim rend les avis très assurés.', [
      [1, { resources: { food: -10 }, targetMorale: 3 }, 'Écarter le lot. Dix portions seront perdues.', 'Le lot a été retiré. {name} a lavé la caisse deux fois avant de la rendre.'],
      [2, { resources: { meds: -2, food: -3 }, targetWorkBlockedDays: 1, morale: 1 }, 'Trier sous contrôle des soins. Des médicaments, des portions et une journée seront consommés.', 'Une partie du lot a été conservée. Les étiquettes sentent encore le désinfectant.'],
      [2, { resources: { food: 6 }, targetDisease: 'infection', targetMorale: -7 }, 'Laisser {name} goûter pour récupérer des portions. Une infection potentiellement mortelle est possible.', 'Des portions ont été récupérées. {name} est tombé malade après le repas.'],
    ]],
  ['labWornMask', 'miner', false, 'Le masque rapiécé',
    '{name} rapporte un masque dont les coutures lâchent. L’atelier propose une réparation rapide.', [
      [2, { resources: { filters: -1, metal: -1 }, targetMorale: 5 }, 'Remplacer les éléments usés. Un filtre et une pièce de métal seront pris en réserve.', 'Le masque neuf serre le nez de {name}. Personne ne l’a entendu s’en plaindre.'],
      [1, { targetWorkBlockedDays: 2, targetMorale: 2 }, 'Mettre {name} au repos en attendant une solution. Deux jours de travail seront perdus.', 'Le masque attend sur un établi. {name} aide de loin, avec beaucoup de commentaires.'],
      [2, { targetDose: 12, targetMorale: -5, resources: { scrap: 4 } }, 'Accepter une récupération avec le masque usé. {name} prendra 12 mSv supplémentaires et rapportera de la ferraille.', 'La ferraille est rentrée avec {name}. Le dosimètre a enregistré les 12 mSv annoncés.'],
    ]],
  ['labQuietPatient', 'medic', false, 'Celui qui ne demande rien',
    '{name} signale un habitant qui cache ses symptômes pour ne pas prendre de place aux soins.', [
      [2, { resources: { meds: -3 }, targetMorale: 5, morale: 2 }, 'Accorder les médicaments et le temps d’écoute. {name} pourra s’en occuper.', 'Les médicaments sont sortis de la réserve. Le patient a enfin demandé une deuxième couverture.'],
      [2, { law: 'quarantine', targetMorale: -3, factions: { profonds: 3 } }, 'Adopter la douche de décontamination pour réduire l’exposition aux poussières des soignants au poste. La Charte changera.', 'La nouvelle règle est affichée. {name} prépare les soins sans isoler les personnes irradiées.'],
      [3, { targetDisease: 'infection', targetMorale: -6, factions: { remonteurs: -3 } }, 'Ne rien engager. {name} risque une infection potentiellement mortelle en poursuivant les visites.', '{name} a continué les visites et présente désormais la même fièvre.'],
    ]],
  ['labReturnToken', 'colonist', true, 'Un jeton pour revenir',
    '{name} veut donner un petit jeton à chaque personne qui sort. Il faudra le rendre au retour.', [
      [2, { resources: { metal: -2 }, morale: 3, targetMorale: 4 }, 'Fabriquer les jetons en métal. Le tableau des retours coûtera deux pièces.', 'Les jetons tintent contre le tableau. Le bruit est devenu agréable sans qu’on sache quand.'],
      [2, { resources: { wood: -1 }, targetMorale: 3 }, 'Les tailler en bois. Le tableau sera plus modeste.', 'Chaque jeton porte des entailles différentes. {name} les reconnaît tous au toucher.'],
      [1, { targetMorale: -3, factions: { profonds: 2 } }, 'Garder la liste habituelle. Aucun matériel ne sera consacré au rituel.', 'La liste reste accrochée au sas. {name} souligne les noms revenus avec un soin nouveau.'],
    ]],
  ['labSharedSilence', 'elder', true, 'Une minute sans machine',
    '{name} demande une minute de silence pour les absents. Le groupe électrogène couvrira tout, comme toujours.', [
      [2, { resources: { fuel: -2 }, morale: 4, targetMorale: 5 }, 'Préparer une relève pour que chacun puisse participer. Elle consommera du combustible.', 'Le moteur a continué. Tous les noms ont pourtant été entendus.'],
      [1, { law: 'evenings', targetMorale: 4, factions: { remonteurs: 2 } }, 'Réserver une veillée aux souvenirs et l’inscrire dans la Charte.', 'La veillée a débordé sur la suivante. {name} n’était pas seul à avoir une liste.'],
      [1, { targetMorale: -5, factions: { profonds: 2 } }, 'Laisser chacun se recueillir sur son temps de repos. {name} espérait davantage.', 'Quelques noms ont été murmurés au changement d’équipe. {name} les a tous répétés.'],
    ]],
  ['labRadioWrongName', 'radio', true, 'Le nom mal entendu',
    '{name} a compris « nous avons perdu Luc » sur la radio. Le message disait peut-être « le sucre ».', [
      [1, { targetWorkBlockedDays: 1, targetMorale: 4 }, 'Consacrer une journée à retrouver le contact avant de diffuser la nouvelle.', 'C’était le sucre. Luc était au micro suivant et n’a pas compris pourquoi on lui souhaitait longue vie.'],
      [2, { resources: { food: -4 }, surfaceDeposit: { food: 4 }, factions: { remonteurs: 3 }, targetMorale: 2 }, 'Déposer des vivres en surface et attendre. Le geste servira dans les deux cas.', 'Le dépôt a été emporté. Un message remercie pour les vivres, signé Luc.'],
      [1, { targetMorale: -4, morale: -2 }, 'Diffuser la nouvelle telle quelle. L’incertitude pèsera sur tout l’abri.', 'Le démenti est arrivé tard. Luc est vivant, mais quelques personnes avaient déjà pleuré.'],
    ]],
];

const texts = {};
const freezeEffects = (effects) => Object.freeze(Object.fromEntries(Object.entries(effects)
  .map(([key, value]) => [key, value && typeof value === 'object' ? Object.freeze(value) : value])));

export const DILEMMAS_EXTRA = Object.freeze(entries.map(([id, target, gentle, title, body, options]) => {
  texts[`dilemma_${id}_title`] = title;
  texts[`dilemma_${id}_body`] = body;
  return Object.freeze({ id, target, gentle, choices: Object.freeze(options.map(([delayDays, effects, label, result], index) => {
    texts[`dilemma_${id}_choice_${index}`] = label;
    texts[`dilemma_${id}_result_${index}`] = result;
    return Object.freeze({ delayDays, effects: freezeEffects(effects) });
  })) });
}));

export const DILEMMA_TEXT_EXTRA = Object.freeze(texts);

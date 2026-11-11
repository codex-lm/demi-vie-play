export const FIRE_TEXT = Object.freeze({
  overheat: Object.freeze({
    label: 'surchauffe',
    warning: 'La machine de {name} surchauffe dangereusement : un incendie peut se déclarer.',
    start: 'La surchauffe de la machine met le feu à {name}. La fumée commence à circuler.',
  }),
  shortCircuit: Object.freeze({
    label: 'court-circuit',
    warning: 'Un câble sous tension crépite dans {name} : un court-circuit menace de déclencher un incendie.',
    start: 'Un court-circuit met le feu à {name}. La fumée commence à circuler.',
  }),
  kitchenWithoutHood: Object.freeze({
    label: 'graisse de cuisine',
    warning: 'La graisse s’accumule au-dessus des fourneaux de {name} : un incendie de cuisine menace.',
    start: 'Les vapeurs de graisse s’enflamment dans {name}. Le feu consomme l’oxygène et produit du CO₂ et de la fumée.',
  }),
});

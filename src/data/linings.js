export const LININGS = Object.freeze({
  none: { factor: 1, cost: {} },
  timber: { factor: 1.3, cost: { wood: 1 }, organic: true },
  bolts: { factor: 1.5, cost: { metal: 1 } },
  steelArch: { factor: 1.7, cost: { metal: 2 } },
  shotcrete: { factor: 2.2, cost: { cement: 2, waterClean: 1 } },
  boltsShotcrete: { factor: 2.6, cost: { metal: 1, cement: 2, waterClean: 1 }, locked: true },
});

export const COATINGS = Object.freeze({
  none: {},
  waterproof: { waterproof: true },
  insulation: { heatDivisor: 3 },
  leadLining: { radiationBlock: 0.9, radonBlock: true, cost: { leadOre: 2 } },
  whitewash: { lightBonus: 0.2 },
});

export const SUPPORT_PROPS = Object.freeze({
  wood: { cost: { wood: 2 } },
  metal: { cost: { metal: 2 } },
  concrete: { cost: { cement: 3 } },
});

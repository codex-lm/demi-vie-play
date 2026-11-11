export const WORKSHOP_RECIPES = Object.freeze({
  filters: { inputs: { metal: 1, sandRes: 2 }, output: 'filters', amount: 2, workMinutes: 240 },
  spareParts: { inputs: { metal: 2 }, output: 'spareParts', amount: 1, workMinutes: 180 },
  improvedFilters: { inputs: { metal: 1, sandRes: 2, coal: 1 }, output: 'filters', amount: 4, workMinutes: 240, research: 'filterWeaving' },
  reinforcedParts: { inputs: { metal: 2, scrap: 1 }, output: 'spareParts', amount: 3, workMinutes: 180, research: 'spareEngineering' },
  coalFuel: { inputs: { coal: 2 }, output: 'fuel', amount: 12, workMinutes: 120 },
  coalFilters: { inputs: { coal: 1, organicWaste: 2 }, output: 'filters', amount: 4, workMinutes: 240 },
  limeKiln: { inputs: { stone: 2, clayRes: 1, coal: 1 }, output: 'cement', amount: 2, workMinutes: 240 },
  forgeIron: { inputs: { ironOre: 2, coal: 1 }, output: 'metal', amount: 1, workMinutes: 180 },
  forgeScrap: { inputs: { scrap: 3 }, output: 'metal', amount: 1, workMinutes: 120 },
  electronicsCraft: { inputs: { copperOre: 2, scrap: 1 }, output: 'electronics', amount: 1, workMinutes: 300 },
});

export function recipeDefinition(id) {
  return WORKSHOP_RECIPES[id] ?? null;
}

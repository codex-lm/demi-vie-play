export const RESEARCH_POINTS_PER_WORKER_TICK = 1;

const node = (id, points, books, prerequisites, column, row, effects) => Object.freeze({
  id, points, books, prerequisites: Object.freeze(prerequisites), column, row, effects: Object.freeze(effects),
});

export const RESEARCH_NODES = Object.freeze([
  node('workshopMethods', 20, 1, [], 0, 0, { workFactor: 1.1 }),
  node('whitewash', 25, 1, [], 0, 1, { coating: 'whitewash' }),
  node('insulation', 30, 1, [], 0, 2, { coating: 'insulation' }),
  node('filterWeaving', 30, 1, [], 0, 3, { recipe: 'improvedFilters' }),
  node('schoolMethods', 35, 1, [], 0, 4, { teachFactor: 1.5 }),
  node('boltsShotcrete', 45, 2, ['whitewash'], 1, 0, { lining: 'boltsShotcrete' }),
  node('spareEngineering', 45, 2, ['workshopMethods'], 1, 1, { recipe: 'reinforcedParts' }),
  node('hydroYield', 45, 2, ['filterWeaving'], 1, 2, { hydroponicsFactor: 1.25 }),
  node('preventiveCare', 45, 2, ['schoolMethods'], 1, 3, { infirmaryFactor: 1.5 }),
  node('socialContract', 50, 2, ['schoolMethods'], 1, 4, { morale: 4 }),
  node('leadLining', 65, 2, ['insulation', 'boltsShotcrete'], 2, 0, { coating: 'leadLining' }),
  node('filterLongevity', 65, 2, ['filterWeaving', 'spareEngineering'], 2, 1, { filterFactor: 2 }),
  node('archiveMethods', 65, 2, ['schoolMethods'], 2, 2, { researchFactor: 1.2 }),
  node('waterRecycling', 70, 2, ['hydroYield'], 2, 3, { recyclerFactor: 1.25 }),
  node('childLearning', 70, 2, ['schoolMethods', 'socialContract'], 2, 4, { teachFactor: 2 }),
  node('elevator', 90, 3, ['spareEngineering', 'leadLining'], 3, 0, { unlock: 'elevator' }),
  node('sonar', 90, 3, ['archiveMethods', 'filterLongevity'], 3, 1, { unlock: 'sonar' }),
  node('geothermalControl', 95, 3, ['waterRecycling', 'spareEngineering'], 3, 2, { geothermalFactor: 1.2 }),
  node('waterDecontamination', 95, 3, ['waterRecycling', 'preventiveCare'], 3, 3, { deconFactor: 1.5 }),
  node('antiRadiationMedicine', 100, 3, ['preventiveCare', 'childLearning'], 3, 4, { radiationCare: 0.6 }),
  node('reinforcedSuits', 130, 4, ['leadLining', 'antiRadiationMedicine'], 4, 0, { suitProtection: 0.8 }),
  node('longRangeRadio', 140, 4, ['archiveMethods', 'sonar'], 4, 1, { unlock: 'longRangeRadio' }),
]);

export function researchDefinition(id) {
  return RESEARCH_NODES.find((node) => node.id === id) ?? null;
}

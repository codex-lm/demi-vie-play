export const MATERIALS = Object.freeze([
  { id: 0, key: 'air', hardness: 0, span: 0, permeability: 0, resource: null },
  { id: 1, key: 'topsoil', hardness: 0.5, span: 2, permeability: 0.3, resource: null },
  { id: 2, key: 'clay', hardness: 1, span: 3, permeability: 0, resource: 'clayRes' },
  { id: 3, key: 'sand', hardness: 0.7, span: 1, permeability: 1, resource: 'sandRes' },
  { id: 4, key: 'limestone', hardness: 3, span: 8, permeability: 0.2, resource: 'stone' },
  { id: 5, key: 'coal', hardness: 2, span: 4, permeability: 0.1, resource: 'coal' },
  { id: 6, key: 'sandstone', hardness: 4, span: 6, permeability: 0.4, resource: 'stone' },
  { id: 7, key: 'granite', hardness: 10, span: 14, permeability: 0, resource: 'stone' },
  { id: 8, key: 'rubble', hardness: 0.3, span: 1, permeability: 0.5, resource: 'stone' },
  { id: 9, key: 'concrete', hardness: 12, span: 12, permeability: 0, resource: 'stone' },
  { id: 10, key: 'bedrock', hardness: Infinity, span: 0, permeability: 0, resource: null },
]);

export const MATERIAL = Object.freeze(Object.fromEntries(MATERIALS.map((m) => [m.key.toUpperCase(), m.id])));
export const MATERIAL_BY_KEY = Object.freeze(Object.fromEntries(MATERIALS.map((m) => [m.key, m])));

export const DEPOSITS = Object.freeze(['none', 'iron', 'copper', 'lead', 'uranium', 'geode']);
export const DEPOSIT = Object.freeze(Object.fromEntries(DEPOSITS.map((key, id) => [key.toUpperCase(), id])));
export const DEPOSIT_RESOURCES = Object.freeze({ iron: 'ironOre', copper: 'copperOre', lead: 'leadOre', uranium: 'uraniumOre', geode: 'stone' });

export function materialAt(id) {
  return MATERIALS[id] ?? MATERIALS[0];
}

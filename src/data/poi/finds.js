import { M5 } from '../m5.js';
import { FIND_DEFS_EXTRA } from '../proposals/finds-extra.js';

export const FIND_RULES = Object.freeze({
  VOLUME_M3: M5.FIND_VOLUME_M3,
  SPACING_JITTER_M3: 6,
  MORALE_CAP: 100,
});

export const FIND_DEFS = Object.freeze([
  Object.freeze({ id: 'fossil', weight: 16, loot: Object.freeze({ books: 1 }), morale: 1, textKey: 'findFossil' }),
  Object.freeze({ id: 'coin', weight: 14, loot: Object.freeze({ metal: 1 }), morale: 0.5, textKey: 'findCoin' }),
  Object.freeze({ id: 'pipe', weight: 18, loot: Object.freeze({ scrap: 2 }), morale: 0, textKey: 'findPipe' }),
  Object.freeze({ id: 'bones', weight: 12, loot: Object.freeze({ organicWaste: 1 }), morale: 0, textKey: 'findBones' }),
  Object.freeze({ id: 'bottle', weight: 14, loot: Object.freeze({ waterClean: 1 }), morale: 0.25, textKey: 'findBottle' }),
  Object.freeze({ id: 'toy', weight: 13, loot: Object.freeze({ wood: 1 }), morale: 2, textKey: 'findToy' }),
  Object.freeze({ id: 'photo', weight: 13, loot: Object.freeze({ books: 1 }), morale: 2, textKey: 'findPhoto' }),
  ...FIND_DEFS_EXTRA,
]);

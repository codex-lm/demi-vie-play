// Prefer ordinary wood shoring. A vaulted passage can require stronger support
// under rubble; use existing, unlocked construction recipes and their real costs.
export const RESCUE_SUPPORTS = Object.freeze([
  { shape: 'flat', lining: 'timber' },
  { shape: 'vault', lining: 'timber' },
  { shape: 'vault', lining: 'bolts' },
  { shape: 'vault', lining: 'steelArch' },
  { shape: 'vault', lining: 'shotcrete' },
]);

// Shared, illustration-only colours. No simulation values live in this package.
export const P = Object.freeze({
  ink: '#2a2929', inkSoft: '#48413a', rock: '#222a2c', rockLight: '#3a4140',
  amber: '#e7b66c', cream: '#e6d7b6', ivory: '#f5e7cc', wood: '#ad7d43',
  woodDark: '#65452e', woodLight: '#d6ad69', metal: '#718784', metalDark: '#3c5152',
  metalLight: '#a6b4a5', rust: '#ac684c', teal: '#75948b', green: '#829468',
  red: '#ac6554', blue: '#637b8d', water: '#5d969c', shadow: '#161d20',
});
export const TAU = Math.PI * 2;
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export function hash(seed, salt = 0) {
  let n = (Number(seed) | 0) ^ Math.imul(salt + 1, 0x9e3779b1);
  n = Math.imul(n ^ n >>> 16, 0x21f0aaad);
  n = Math.imul(n ^ n >>> 15, 0x735a2d97);
  return ((n ^ n >>> 15) >>> 0) / 4294967296;
}

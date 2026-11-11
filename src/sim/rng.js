export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  return hashString(String(seed ?? '0'));
}

export class RNG {
  constructor(seed = 0) {
    this.state = normalizeSeed(seed);
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(values) {
    return values[this.int(0, values.length - 1)];
  }

  fork(name) {
    return new RNG((this.state ^ hashString(String(name))) >>> 0);
  }

  serialize() {
    return this.state >>> 0;
  }

  static restore(state) {
    const rng = new RNG(0);
    rng.state = state >>> 0;
    return rng;
  }
}

export function fnv1a(text) {
  return hashString(text).toString(16).padStart(8, '0');
}

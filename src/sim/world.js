import { CELL, WATER, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { deriveWaterTableDepth } from './groundwater.js';

function encodeBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

function decodeBase64(text) {
  if (typeof atob === 'function') {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(text, 'base64'));
}

function encodeInt16(array) {
  return encodeBase64(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
}

function decodeInt16(text) {
  const bytes = decodeBase64(text);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Int16Array(copy.buffer);
}

export class World {
  constructor(width = WORLD.WIDTH, height = WORLD.HEIGHT) {
    this.width = width;
    this.height = height;
    this.waterTableDepth = WATER.DEFAULT_TABLE_DEPTH;
    const size = width * height;
    this.materials = new Uint8Array(size);
    this.states = new Uint8Array(size);
    this.deposits = new Uint8Array(size);
    this.water = new Uint8Array(size);
    this.waterQuality = new Uint8Array(size);
    this.visibility = new Uint8Array(size);
    this.cellExcavation = new Int16Array(size);
    this.cellExcavation.fill(-1);
    this.revision = 0;
    this.visibilityRevision = 0;
    this.dirtyChunks = new Set();
  }

  index(x, y) {
    return y * this.width + x;
  }

  coords(index) {
    return { x: index % this.width, y: Math.floor(index / this.width) };
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  material(x, y) {
    return this.inBounds(x, y) ? this.materials[this.index(x, y)] : MATERIAL.BEDROCK;
  }

  state(x, y) {
    return this.inBounds(x, y) ? this.states[this.index(x, y)] : CELL.SOLID;
  }

  isSolid(x, y) {
    return this.state(x, y) === CELL.SOLID;
  }

  isEmpty(x, y) {
    return this.inBounds(x, y) && this.states[this.index(x, y)] === CELL.EMPTY;
  }

  isDiggable(x, y) {
    if (!this.inBounds(x, y) || y >= WORLD.BEDROCK_Y || y < WORLD.SURFACE_Y) return false;
    return this.material(x, y) !== MATERIAL.BEDROCK;
  }

  setCell(x, y, material, state = CELL.SOLID, excavationId = -1) {
    if (!this.inBounds(x, y)) return false;
    const index = this.index(x, y);
    if (this.materials[index] === material && this.states[index] === state && this.cellExcavation[index] === excavationId) return false;
    this.materials[index] = material;
    this.states[index] = state;
    this.cellExcavation[index] = excavationId;
    this.touch(x, y);
    return true;
  }

  setDeposit(x, y, deposit) {
    if (!this.inBounds(x, y)) return;
    const index = this.index(x, y);
    if (this.deposits[index] === deposit) return;
    this.deposits[index] = deposit;
    this.touch(x, y);
  }

  touch(x, y) {
    this.revision += 1;
    const size = WORLD.CHUNK_SIZE;
    this.dirtyChunks.add(`${Math.floor(x / size)},${Math.floor(y / size)}`);
  }

  reveal(x, y, radius = WORLD.REVEAL_RADIUS) {
    let changed = false;
    const minY = Math.max(0, y - radius);
    for (let yy = minY; yy <= Math.min(this.height - 1, y + radius); yy += 1) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(this.width - 1, x + radius); xx += 1) {
        if ((xx - x) ** 2 + (yy - y) ** 2 > radius ** 2 + 1) continue;
        const index = this.index(xx, yy);
        if (this.visibility[index] !== 0) continue;
        this.visibility[index] = 1;
        changed = true;
      }
    }
    if (changed) this.visibilityRevision += 1;
  }

  revealAll() {
    if (this.visibility.every((visible) => visible !== 0)) return;
    this.visibility.fill(1);
    this.visibilityRevision += 1;
  }

  isVisible(x, y) {
    return this.inBounds(x, y) && (y < WORLD.SURFACE_Y || this.visibility[this.index(x, y)] !== 0);
  }

  consumeDirtyChunks() {
    const dirty = [...this.dirtyChunks];
    this.dirtyChunks.clear();
    return dirty;
  }

  serialize() {
    return {
      width: this.width,
      height: this.height,
      waterTableDepth: this.waterTableDepth,
      waterUnitsPerCell: WATER.MAX_PER_CELL,
      materials: encodeBase64(this.materials),
      states: encodeBase64(this.states),
      deposits: encodeBase64(this.deposits),
      water: encodeBase64(this.water),
      waterQuality: encodeBase64(this.waterQuality),
      visibility: encodeBase64(this.visibility),
      cellExcavation: encodeInt16(this.cellExcavation),
      revision: this.revision,
      visibilityRevision: this.visibilityRevision,
    };
  }

  static deserialize(data) {
    const world = new World(data.width, data.height);
    world.materials = decodeBase64(data.materials);
    world.states = decodeBase64(data.states);
    world.deposits = decodeBase64(data.deposits);
    world.water = decodeBase64(data.water);
    const oldCapacity = data.waterUnitsPerCell ?? WATER.LEGACY_MAX_PER_CELL;
    if (oldCapacity !== WATER.MAX_PER_CELL) {
      world.water = world.water.map((amount) => Math.min(WATER.MAX_PER_CELL,
        Math.round(amount * WATER.MAX_PER_CELL / oldCapacity)));
    }
    world.waterTableDepth = data.waterTableDepth ?? deriveWaterTableDepth(world);
    world.waterQuality = data.waterQuality ? decodeBase64(data.waterQuality) : new Uint8Array(world.water.length);
    world.visibility = decodeBase64(data.visibility);
    world.cellExcavation = decodeInt16(data.cellExcavation);
    world.revision = data.revision ?? 0;
    world.visibilityRevision = data.visibilityRevision ?? 0;
    for (let y = 0; y < world.height; y += WORLD.CHUNK_SIZE) {
      for (let x = 0; x < world.width; x += WORLD.CHUNK_SIZE) world.touch(x, y);
    }
    world.revision = data.revision ?? 0;
    return world;
  }
}

import { CELL, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { strataTextureSteps, drawTerrainCell, STRATA_COLORS } from '../../art/terrain.js';
import { MATERIAL_IDS } from '../../art/data/world-catalog.js';

const MAX_CACHE_BYTES = 96 * 1024 * 1024;
// The geological field samples a three-cell border and searches six cells for
// enclosing solid rock. Invalidation must cover that full dependency, too.
const CACHE_REACH = 9;
const caches = new WeakMap();
const tiers = new Map();
let worker;
let pending;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hash(x, y, salt = 0) {
  let value = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function noise2D(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

export function fbm2D(x, y, seed = 0, octaves = 3) {
  let value = 0;
  let amplitude = 0.57;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += noise2D(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / total;
}


export function visibilityField(world, x, y, seed) {
  // The same warped world coordinates are used on both sides of chunk seams.
  // Small folds soften the survey's rectangular frontier without revealing any
  // hidden feature: only the rock pigment is blended here.
  const wx = x, wy = y;
  x += Math.sin(wx * 1.71 + wy * .83 + seed * .13) * .13
    + Math.sin(wx * 4.13 - wy * 2.19) * .045;
  y += Math.sin(wx * 1.09 - wy * 1.57 + seed * .17) * .13
    + Math.sin(wx * 2.81 + wy * 3.27) * .045;
  const visible = (xx, yy) => {
    if (!world.inBounds(xx, yy)) return 0;
    if (yy < WORLD.SURFACE_Y) return 1;
    return world.visibility[world.index(xx, yy)] === 0 ? 0 : 1;
  };
  const centerX = Math.floor(x);
  const centerY = Math.floor(y);
  let nearestVisible = Infinity;
  let nearestHidden = Infinity;
  for (let yy = centerY - 2; yy <= centerY + 2; yy += 1) {
    for (let xx = centerX - 2; xx <= centerX + 2; xx += 1) {
      if (!world.inBounds(xx, yy)) continue;
      const dx = Math.max(xx - x, 0, x - xx - 1);
      const dy = Math.max(yy - y, 0, y - yy - 1);
      const distance = dx * dx + dy * dy;
      if (visible(xx, yy)) nearestVisible = Math.min(nearestVisible, distance);
      else nearestHidden = Math.min(nearestHidden, distance);
    }
  }
  const signedDistance = Math.sqrt(nearestVisible) - Math.sqrt(nearestHidden);
  const base = clamp(0.5 - signedDistance / 3, 0, 1);
  const broad = (noise2D(x * 0.53, y * 0.53, seed + 293) - 0.5) * 0.08;
  const fine = (noise2D(x * 1.83, y * 1.83, seed + 307) - 0.5) * 0.04;
  return clamp(base + (broad + fine) * 4 * base * (1 - base), 0, 1);
}

export function fogReveal(world, x, y, seed) {
  const field = visibilityField(world, x, y, seed);
  const fade = clamp((field - 0.22) / 0.56, 0, 1);
  return fade * fade * (3 - 2 * fade);
}


export function terrainResolution(cellSize, pixelRatio = 1) {
  // Native 20/40px rasters at 1080p, also 40/80px on DPR2. Discrete tiers
  // avoid rebuilding every interpolated zoom frame, without a 96px ceiling.
  const pixels = cellSize * pixelRatio;
  return [12,16,20,24,32,40,48,64,80,96,128,160,192,256,384].find(size => size >= pixels)
    ?? Math.ceil(pixels / 64) * 64;
}

function createSurface(pixels) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(pixels, pixels);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = pixels;
  return canvas;
}

// The renderer reads the grid, but never consumes its dirty set or changes the
// simulation. The border includes both fog and geological interpolation.
function chunkSignature(world, chunkX, chunkY, chunkSize) {
  let result = 2166136261;
  const startX = Math.max(0, chunkX * chunkSize - CACHE_REACH);
  const endX = Math.min(world.width, (chunkX + 1) * chunkSize + CACHE_REACH);
  const startY = Math.max(WORLD.SURFACE_Y, chunkY * chunkSize - CACHE_REACH);
  const endY = Math.min(world.height, (chunkY + 1) * chunkSize + CACHE_REACH);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = world.index(x, y);
      result = Math.imul(result ^ world.visibility[index], 16777619);
      result = Math.imul(result ^ world.states[index], 16777619);
      result = Math.imul(result ^ world.materials[index], 16777619);
      result = Math.imul(result ^ world.deposits[index], 16777619);
      result = Math.imul(result ^ (world.cellExcavation?.[index] ?? -1), 16777619);
    }
  }
  return result >>> 0;
}

function rockMaterial(world, x, y) {
  const index = world.index(x, y);
  if (world.materials[index] !== MATERIAL.AIR && world.materials[index] !== MATERIAL.RUBBLE && world.states[index] !== CELL.EMPTY) return world.materials[index];
  for (let radius = 1; radius <= 6; radius += 1) {
    for (let offset = -radius; offset <= radius; offset += 1) {
      for (const [xx, yy] of [[x + offset, y - radius], [x + offset, y + radius], [x - radius, y + offset], [x + radius, y + offset]]) {
        if (!world.inBounds(xx, yy) || yy < WORLD.SURFACE_Y) continue;
        const other = world.index(xx, yy);
        if (world.states[other] === CELL.SOLID && world.materials[other] !== MATERIAL.RUBBLE) return world.materials[other];
      }
    }
  }
  return MATERIAL.LIMESTONE;
}

function* texturePixels(textures) {
  const pixels = [];
  for (const name of MATERIAL_IDS) {
    const tile = textures.tiles[name];
    pixels.push(tile?.getContext ? { pixels: tile.getContext('2d').getImageData(0, 0, tile.width, tile.height).data,
      size: tile.width } : null);
    yield;
  }
  return pixels;
}

// Interpolate geological boundaries, then choose their material; never blur
// pigments across a metre. Textures are sampled at absolute world coordinates.
function* paintRockFields(ctx, fogCtx, world, chunkX, chunkY, seed, pixels, CELL_PIXELS, CHUNK_SIZE) {
  const CHUNK_PIXELS = CHUNK_SIZE * CELL_PIXELS;
  const image = ctx.createImageData(CHUNK_PIXELS, CHUNK_PIXELS);
  const hidden = fogCtx.createImageData(CHUNK_PIXELS, CHUNK_PIXELS);
  const margin = 3, stride = CHUNK_SIZE + margin * 2;
  const originX = chunkX * CHUNK_SIZE, originY = chunkY * CHUNK_SIZE;
  const geology = new Uint8Array(stride * stride);
  for (let yy = 0; yy < stride; yy += 1) for (let xx = 0; xx < stride; xx += 1) {
    const x = originX + xx - margin, y = originY + yy - margin;
    geology[yy * stride + xx] = world.inBounds(x, y) && y >= WORLD.SURFACE_Y ? rockMaterial(world, x, y) : MATERIAL.TOPSOIL;
    if (xx + 1 === stride) yield;
  }
  const smooth = (value) => value * value * (3 - 2 * value);
  for (let py = 0; py < CHUNK_PIXELS; py += 1) {
    const wy = originY + (py + 0.5) / CELL_PIXELS;
    if (wy < WORLD.SURFACE_Y || wy >= world.height) continue;
    for (let px = 0; px < CHUNK_PIXELS; px += 1) {
      const wx = originX + (px + 0.5) / CELL_PIXELS;
      if (wx >= world.width) continue;
      const warpX = wx + Math.sin(wx * 1.13 + wy * 1.71 + seed) * 0.16;
      const warpY = wy + Math.sin(wx * 1.37 - wy * 0.61 + seed * 0.03) * 0.24;
      const gx = warpX - originX + margin - 0.5, gy = warpY - originY + margin - 0.5;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      const fx = smooth(gx - ix), fy = smooth(gy - iy);
      const a = geology[iy * stride + ix], b = geology[iy * stride + ix + 1];
      const c = geology[(iy + 1) * stride + ix], d = geology[(iy + 1) * stride + ix + 1];
      const offset = (py * CHUNK_PIXELS + px) * 4;
      let material = a, joint = 0;
      if (a !== b || a !== c || a !== d) {
        const materials = [a,b,c,d], weights = [(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
        // Merge equal-material corner weights before selecting a side of a seam.
        for(let n=3;n>0;n--)for(let m=0;m<n;m++)if(materials[n]===materials[m]){weights[m]+=weights[n];weights[n]=0;break;}
        let winner=0, runner=0;
        for(let n=1;n<4;n++)if(weights[n]>weights[winner])winner=n;
        for(let n=0;n<4;n++)if(n!==winner)runner=Math.max(runner,weights[n]);
        material = materials[winner];
        joint = runner > 0 ? Math.max(0,1-(weights[winner]-runner)*CELL_PIXELS)*.6 : 0;
      }
      const texture = pixels[material] ?? pixels[MATERIAL.LIMESTONE];
      if (!texture) continue;
      const tx = ((originX * CELL_PIXELS + px) % texture.size + texture.size) % texture.size;
      const ty = ((originY * CELL_PIXELS + py) % texture.size + texture.size) % texture.size;
      const source = (ty * texture.size + tx) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const pigment = texture.pixels[source + channel] * (1-joint);
        image.data[offset + channel] = pigment;
        // Opaque hidden rock still conceals cavities/ores. Its pigment carries
        // the same sharp mineral detail under a dark veil, never a blur/filter.
        hidden.data[offset + channel] = pigment*.38 + [3,5,7][channel]*.62;
      }
      image.data[offset + 3] = hidden.data[offset + 3] = 255;
    }
    if ((py & 3) === 3) yield;
  }
  ctx.putImageData(image, 0, 0);fogCtx.putImageData(hidden, 0, 0);
}

export function* buildChunk(world, chunkX, chunkY, seed, CELL_PIXELS, CHUNK_SIZE) {
  const tierKey = seed + ':' + CELL_PIXELS;
  let tier = tiers.get(tierKey);
  if (!tier) {
    const textures = yield* strataTextureSteps(CELL_PIXELS, seed);
    tier = { textures, pixels: yield* texturePixels(textures) };
  }
  tiers.delete(tierKey);
  tiers.set(tierKey, tier);
  const maxTiers = CELL_PIXELS > 64 ? 1 : 2;
  while (tiers.size > maxTiers) tiers.delete(tiers.keys().next().value);
  const { textures, pixels } = tier;
  const CHUNK_PIXELS = CHUNK_SIZE * CELL_PIXELS;
  const canvas = createSurface(CHUNK_PIXELS);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const fogCanvas = createSurface(CHUNK_PIXELS);
  const fogCtx = fogCanvas.getContext('2d');
  yield* paintRockFields(ctx, fogCtx, world, chunkX, chunkY, seed, pixels, CELL_PIXELS, CHUNK_SIZE);
  const startX = chunkX * CHUNK_SIZE;
  const startY = chunkY * CHUNK_SIZE;
  const endX = Math.min(world.width, startX + CHUNK_SIZE);
  const endY = Math.min(world.height, startY + CHUNK_SIZE);
  const cells = new Map();
  const cellAt = (x, y) => {
    if (!world.inBounds(x, y) || y < WORLD.SURFACE_Y) return false;
    const index = world.index(x, y);
    if (!cells.has(index)) {
      const visible = world.visibility[index] !== 0;
      cells.set(index, {
        material: rockMaterial(world, x, y), state: visible && (world.cellExcavation?.[index] ?? -1) < 0 ? world.states[index] : CELL.SOLID,
        wx: x, wy: y, seed, textures, revealed: true, background: false,
        deposit: visible ? world.deposits[index] : 0,
      });
    }
    return cells.get(index);
  };
  for (let y = Math.max(WORLD.SURFACE_Y, startY); y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const px = (x - startX) * CELL_PIXELS;
      const py = (y - startY) * CELL_PIXELS;
      const cell = cellAt(x, y);
      const neighbors = {
        top: cellAt(x, y - 1), right: cellAt(x + 1, y), bottom: cellAt(x, y + 1), left: cellAt(x - 1, y),
        topLeft: cellAt(x - 1, y - 1), topRight: cellAt(x + 1, y - 1), bottomLeft: cellAt(x - 1, y + 1), bottomRight: cellAt(x + 1, y + 1),
      };
      // The geological raster already contains uninterrupted solid rock.
      if (cell.deposit || cell.state === CELL.EMPTY || Object.values(neighbors).some(n => !n || n.state === CELL.EMPTY)) {
        drawTerrainCell(ctx, px, py, CELL_PIXELS, cell, neighbors);
      }
      if ((x & 3) === 3) yield;
    }
  }
  // Rasterise the tested signed distance field, rather than expanding each
  // revealed square separately. The transition straddles the survey edge over
  // 1–2 metres. Cache it with the rock; no pixel work happens on a normal frame.
  const mask = createSurface(CHUNK_PIXELS), maskCtx = mask.getContext('2d');
  const maskPixels = maskCtx.createImageData(CHUNK_PIXELS, CHUNK_PIXELS);
  // Fog geometry is sampled in world units, independently of texture density.
  const stride = CHUNK_SIZE * 6 + 1;
  const samplePixels = CELL_PIXELS / 6;
  const samples = new Float32Array(stride * stride);
  for (let y = 0; y < stride; y += 1) for (let x = 0; x < stride; x += 1) {
    samples[y * stride + x] = 1 - fogReveal(world, startX + x / 6, startY + y / 6, seed);
    if (x + 1 === stride) yield;
  }
  for (let y = 0; y < CHUNK_PIXELS; y += 1) for (let x = 0; x < CHUNK_PIXELS; x += 1) {
    const gx = (x + .5) / samplePixels, gy = (y + .5) / samplePixels, ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    const a = samples[iy * stride + ix], b = samples[iy * stride + ix + 1];
    const c = samples[(iy + 1) * stride + ix], d = samples[(iy + 1) * stride + ix + 1];
    maskPixels.data[(y * CHUNK_PIXELS + x) * 4 + 3] = Math.round(255 * (a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy));
    if (x + 1 === CHUNK_PIXELS && (y & 7) === 7) yield;
  }
  maskCtx.putImageData(maskPixels, 0, 0);
  fogCtx.globalCompositeOperation = 'destination-in';
  fogCtx.drawImage(mask, 0, 0);
  ctx.drawImage(fogCanvas, 0, 0);
  // Release large temporary backing stores immediately, especially on HiDPI.
  fogCanvas.width = fogCanvas.height = mask.width = mask.height = 1;
  return canvas;
}

// A cheap, world-aligned first image. Never draw undiscovered ore or openings.
// The normal room, water, people and work overlays keep their full detail.
function previewChunk(world, cx, cy, size) {
  const canvas = createSurface(size), ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let dy = 0; dy < size; dy++) {
    const y = cy * size + dy;
    if (y < WORLD.SURFACE_Y || y >= world.height) continue;
    for (let dx = 0; dx < size; dx++) {
      const x = cx * size + dx;
      if (x >= world.width) continue;
      const i = world.index(x, y);
      const visible = world.visibility[i] !== 0;
      const rock = world.materials[i];
      // rockMaterial reconstructs the enclosing stratum for hidden cavities.
      const material = visible && world.states[i] === CELL.EMPTY && world.cellExcavation[i] < 0 ? MATERIAL.AIR
        : (world.states[i] === CELL.EMPTY || rock === MATERIAL.AIR || rock === MATERIAL.RUBBLE ? rockMaterial(world, x, y) : rock);
      const color = STRATA_COLORS[MATERIAL_IDS[material]] ?? STRATA_COLORS.limestone;
      const offset = (dy * size + dx) * 4;
      const strength = visible ? 1 : .38;
      image.data[offset] = color[0] * strength + 3 * (1 - strength);
      image.data[offset + 1] = color[1] * strength + 5 * (1 - strength);
      image.data[offset + 2] = color[2] * strength + 7 * (1 - strength);
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function storeChunk(cache, key, entry) {
  const older = cache.chunks.get(key);
  if (older) {
    cache.bytes -= older.canvas.width * older.canvas.height * 4;
    older.canvas.close?.();
    cache.chunks.delete(key);
  }
  cache.chunks.set(key, entry);
  cache.bytes += entry.canvas.width * entry.canvas.height * 4;
  return entry;
}

// Remember the cells actually drawn, including the fog border. While workers
// dig, only repaint the changed squares and their immediate contours on top
// of the finished image. The rest of a room keeps its mineral detail.
function cellRecord(world, x, y) {
  if (!world.inBounds(x, y)) return 0;
  const i = world.index(x, y);
  return (world.visibility[i] ? 1 : 0) | world.materials[i] << 1 | world.states[i] << 5
    | world.deposits[i] << 6 | ((world.cellExcavation?.[i] ?? -1) + 1) << 10;
}

function chunkRecord(world, cx, cy, size) {
  const stride = size + 6;
  const record = new Int32Array(stride * stride);
  for (let y = 0; y < stride; y++) for (let x = 0; x < stride; x++) {
    record[y * stride + x] = cellRecord(world, cx * size + x - 3, cy * size + y - 3);
  }
  return record;
}

function changedPatch(entry, signature, world, cx, cy, size) {
  if (entry.patch?.signature === signature) return entry.patch;
  const stride = size + 6, mask = new Uint8Array(size * size);
  for (let y = -3; y < size + 3; y++) for (let x = -3; x < size + 3; x++) {
    const changed = entry.record[(y + 3) * stride + x + 3] ^ cellRecord(world, cx * size + x, cy * size + y);
    if (!changed) continue;
    const radius = changed & 1 ? 3 : 1;
    const lo = Math.max(0, x - radius), hi = Math.min(size, x + radius + 1);
    if (lo >= hi) continue;
    for (let row = Math.max(0, y - radius); row <= Math.min(size - 1, y + radius); row++) {
      mask.fill(1, row * size + lo, row * size + hi);
    }
  }
  const rows = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size;) {
    if (!mask[y * size + x]) { x++; continue; }
    const start = x;
    do { x++; } while (x < size && mask[y * size + x]);
    rows.push({ x: start, y, w: x - start });
  }
  entry.patch = { signature, rows, canvas: rows.length ? previewChunk(world, cx, cy, size) : null };
  return entry.patch;
}

function disableWorker() {
  worker?.terminate();
  worker = null;
  pending = null;
}

function terrainWorker() {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function'
    || typeof OffscreenCanvas.prototype.transferToImageBitmap !== 'function') return null;
  try {
    worker = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
    worker.onerror = disableWorker;
    worker.onmessageerror = disableWorker;
    worker.onmessage = ({ data: bitmap }) => {
      const { cache, key, position, resolution, signature, record } = pending;
      pending = null;
      if (cache.wanted.has(key)) {
        storeChunk(cache, key, { canvas: bitmap, signature, resolution, position, record });
      } else bitmap.close();
    };
  } catch { disableWorker(); } // Portals may disallow workers in an embedded game.
  return worker;
}

// Keep at most one job outstanding. After a pan or a zoom, the next frame
// requests what is visible now, without waiting for an abandoned work queue.
function refine(cache, jobs, world, seed, chunkSize) {
  if (!jobs.length) { cache.local = null; return; }
  if (pending) return;
  // Round-robin over missing visible chunks. A busy mine cannot starve its
  // neighbours, even if its inputs change faster than a bitmap can finish.
  const job = jobs.find(j => j.key === cache.local?.key)
    ?? jobs.find(j => j.order > (cache.lastOrder ?? -1)) ?? jobs[0];
  const { key, position, resolution, signature, x, y } = job;
  cache.lastOrder = job.order;
  if (!terrainWorker()) {
    // Keep a consistent input throughout sliced work. A later local change
    // can be patched over the result while the next version is prepared.
    if (cache.local?.key !== key) {
      const copy = Object.create(Object.getPrototypeOf(world));
      copy.width = world.width;
      copy.height = world.height;
      for (const field of ['materials', 'deposits', 'states', 'cellExcavation', 'visibility']) copy[field] = world[field].slice();
      cache.local = { key, signature, record: chunkRecord(world, x, y, chunkSize),
        steps: buildChunk(copy, x, y, seed, resolution, chunkSize) };
    }
    const deadline = performance.now() + 2;
    let step;
    do { step = cache.local.steps.next(); } while (!step.done && performance.now() < deadline);
    if (step.done) {
      storeChunk(cache, key, { canvas: step.value, signature: cache.local.signature,
        resolution, position, record: cache.local.record });
      cache.local = null;
    }
    return;
  }
  pending = { cache, key, position, resolution, signature, record: chunkRecord(world, x, y, chunkSize) };
  const { width, height, materials, deposits, states, cellExcavation, visibility } = world;
  try {
    worker.postMessage({ world: { width, height, materials, deposits, states, cellExcavation, visibility },
      seed, x, y, resolution, chunkSize });
  } catch { disableWorker(); }
}

export function drawTerrain(ctx, game, view) {
  const world = game.sim?.world;
  if (!world || view.cellSize <= 0) return;
  let cache = caches.get(world);
  if (!cache) {
    cache = { chunks: new Map(), wanted: new Map(), bytes: 0 };
    caches.set(world, cache);
  }
  const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
  // Build the destination detail level once throughout a smooth zoom.
  const targetCellSize = game.camera?.cellSize?.(game.camera.targetZoom) ?? view.cellSize;
  const animated = typeof requestAnimationFrame === 'function';
  // At 1080p even zoom 3 on DPR2 needs only 120 px/m. Beyond 128 px/m
  // scale the final raster instead of retaining hundreds of MiB of source
  // tiles on ultra-wide/high-density displays. Each staging image is <= 2K.
  const resolution = Math.min(128, terrainResolution(targetCellSize, ratio));
  const CHUNK_SIZE = resolution > 64 ? WORLD.CHUNK_SIZE / 2 : WORLD.CHUNK_SIZE;
  const minX = Math.max(0, Math.floor(view.left / CHUNK_SIZE));
  const maxX = Math.min(Math.ceil(world.width / CHUNK_SIZE) - 1, Math.floor((view.left + view.width / view.cellSize) / CHUNK_SIZE));
  const minY = Math.max(0, Math.floor(view.top / CHUNK_SIZE));
  const maxY = Math.min(Math.ceil(world.height / CHUNK_SIZE) - 1, Math.floor((view.top + view.height / view.cellSize) / CHUNK_SIZE));
  // A high-DPI viewport can need more than the normal LRU budget. Keep all
  // visible chunks resident: evicting one mid-frame would rebuild it forever.
  const visibleKeys = new Set();
  cache.wanted.clear();
  const jobs = [];
  ctx.save();
  const camera = game.camera;
  const moving = Math.abs(targetCellSize - view.cellSize) > .01
    || (camera && (Math.abs(camera.targetX - camera.x) + Math.abs(camera.targetY - camera.y)) * view.cellSize > .25);
  ctx.imageSmoothingQuality = moving ? 'low' : 'high';
  const transform = ctx.getTransform?.();
  const scaleX = Math.abs(transform?.a ?? ratio) || ratio, scaleY = Math.abs(transform?.d ?? ratio) || ratio;
  const offsetX = transform?.e ?? 0, offsetY = transform?.f ?? 0;
  const snapX = (value) => (Math.round(value * scaleX + offsetX) - offsetX) / scaleX;
  const snapY = (value) => (Math.round(value * scaleY + offsetY) - offsetY) / scaleY;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const position = CHUNK_SIZE + '/' + x + ',' + y;
      const key = resolution + ':' + position;
      const signature = chunkSignature(world, x, y, CHUNK_SIZE);
      cache.wanted.set(key, signature);
      visibleKeys.add(key);
      let entry = cache.chunks.get(key);
      if (!entry || entry.signature !== signature) {
        const seed = game.sim.seed ?? 0;
        if (animated) {
          jobs.push({ key, position, resolution, signature, x, y, order: y * world.width + x });
          // Prefer matching detail, then a sharp image with local patches,
          // then the low-resolution first image.
          entry = null;
          let best = -1;
          for (const alternate of cache.chunks.values()) {
            if (alternate.position !== position) continue;
            const matches = alternate.signature === signature;
            if (!matches && !alternate.record) continue;
            const rank = alternate.resolution + (matches && alternate.record ? 256 : 0);
            if (rank > best) { best = rank; entry = alternate; }
          }
        }
        if (!entry || (!animated && entry.signature !== signature)) {
          const size = animated ? 1 : resolution;
          let canvas;
          if (animated) canvas = previewChunk(world, x, y, CHUNK_SIZE);
          else {
            const steps = buildChunk(world, x, y, seed, size, CHUNK_SIZE);
            let step;
            do { step = steps.next(); } while (!step.done);
            canvas = step.value;
          }
          if (!canvas) continue;
          entry = storeChunk(cache, size + ':' + position, { canvas, signature, resolution: size, position });
        }
      }
      const displayedKey = entry.resolution + ':' + position;
      visibleKeys.add(displayedKey);
      cache.chunks.delete(displayedKey);
      cache.chunks.set(displayedKey, entry);
      ctx.imageSmoothingEnabled = view.cellSize * ratio !== entry.resolution;
      // Shared device-pixel boundaries prevent a dark antialiasing seam between
      // adjacent opaque chunk bitmaps, including fractional camera positions.
      // Include the fractional collapse shake in the device-pixel alignment.
      const left = snapX(view.sx(x * CHUNK_SIZE)), top = snapY(view.sy(y * CHUNK_SIZE));
      const right = snapX(view.sx((x + 1) * CHUNK_SIZE)), bottom = snapY(view.sy((y + 1) * CHUNK_SIZE));
      ctx.drawImage(entry.canvas, left, top, right - left, bottom - top);
      if (entry.signature !== signature) {
        const patch = changedPatch(entry, signature, world, x, y, CHUNK_SIZE);
        if (patch.canvas) {
          const dx = (right - left) / CHUNK_SIZE, dy = (bottom - top) / CHUNK_SIZE;
          ctx.save(); ctx.beginPath();
          for (const row of patch.rows) ctx.rect(left + row.x * dx, top + row.y * dy, row.w * dx, dy);
          ctx.clip();
          ctx.drawImage(patch.canvas, left, top, right - left, bottom - top);
          ctx.restore();
        }
      }
    }
  }
  for (const [key, entry] of cache.chunks) {
    if (cache.bytes <= MAX_CACHE_BYTES) break;
    if (visibleKeys.has(key)) continue;
    cache.bytes -= entry.canvas.width * entry.canvas.height * 4;
    entry.canvas.close?.();
    cache.chunks.delete(key);
  }
  ctx.restore();
  if (animated) refine(cache, jobs, world, game.sim.seed ?? 0, CHUNK_SIZE);
}

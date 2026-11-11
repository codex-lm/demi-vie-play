import { CELL, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { makeStrataTextures, drawTerrainCell } from '../../art/terrain.js';
import { MATERIAL_IDS } from '../../art/data/world-catalog.js';

const CHUNK_SIZE = WORLD.CHUNK_SIZE;
const MAX_CACHE_BYTES = 96 * 1024 * 1024;
// The geological field samples a three-cell border and searches six cells for
// enclosing solid rock. Invalidation must cover that full dependency, too.
const CACHE_REACH = 9;
const caches = new WeakMap();
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
function chunkSignature(world, chunkX, chunkY) {
  let result = 2166136261;
  const startX = Math.max(0, chunkX * CHUNK_SIZE - CACHE_REACH);
  const endX = Math.min(world.width, (chunkX + 1) * CHUNK_SIZE + CACHE_REACH);
  const startY = Math.max(WORLD.SURFACE_Y, chunkY * CHUNK_SIZE - CACHE_REACH);
  const endY = Math.min(world.height, (chunkY + 1) * CHUNK_SIZE + CACHE_REACH);
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

function texturePixels(textures) {
  return MATERIAL_IDS.map((name) => {
    const tile = textures.tiles[name];
    if (!tile?.getContext) return null;
    return { pixels: tile.getContext('2d').getImageData(0, 0, tile.width, tile.height).data,
      size: tile.width };
  });
}

// Interpolate geological boundaries, then choose their material; never blur
// pigments across a metre. Textures are sampled at absolute world coordinates.
function paintRockFields(ctx, fogCtx, world, chunkX, chunkY, seed, pixels, CELL_PIXELS) {
  const CHUNK_PIXELS = CHUNK_SIZE * CELL_PIXELS;
  const image = ctx.createImageData(CHUNK_PIXELS, CHUNK_PIXELS);
  const hidden = fogCtx.createImageData(CHUNK_PIXELS, CHUNK_PIXELS);
  const margin = 3, stride = CHUNK_SIZE + margin * 2;
  const originX = chunkX * CHUNK_SIZE, originY = chunkY * CHUNK_SIZE;
  const geology = new Uint8Array(stride * stride);
  for (let yy = 0; yy < stride; yy += 1) for (let xx = 0; xx < stride; xx += 1) {
    const x = originX + xx - margin, y = originY + yy - margin;
    geology[yy * stride + xx] = world.inBounds(x, y) && y >= WORLD.SURFACE_Y ? rockMaterial(world, x, y) : MATERIAL.TOPSOIL;
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
      const materials = [a,b,c,d], weights = [(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
      const offset = (py * CHUNK_PIXELS + px) * 4;
      // Merge equal-material corner weights before selecting a side of a seam.
      for(let n=3;n>0;n--)for(let m=0;m<n;m++)if(materials[n]===materials[m]){weights[m]+=weights[n];weights[n]=0;break;}
      let winner=0, runner=0;
      for(let n=1;n<4;n++)if(weights[n]>weights[winner])winner=n;
      for(let n=0;n<4;n++)if(n!==winner)runner=Math.max(runner,weights[n]);
      const texture = pixels[materials[winner]] ?? pixels[MATERIAL.LIMESTONE];
      if (!texture) continue;
      const tx = ((originX * CELL_PIXELS + px) % texture.size + texture.size) % texture.size;
      const ty = ((originY * CELL_PIXELS + py) % texture.size + texture.size) % texture.size;
      const source = (ty * texture.size + tx) * 4;
      const joint = runner > 0 ? Math.max(0,1-(weights[winner]-runner)*CELL_PIXELS)*.6 : 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const pigment = texture.pixels[source + channel] * (1-joint);
        image.data[offset + channel] = pigment;
        // Opaque hidden rock still conceals cavities/ores. Its pigment carries
        // the same sharp mineral detail under a dark veil, never a blur/filter.
        hidden.data[offset + channel] = pigment*.38 + [3,5,7][channel]*.62;
      }
      image.data[offset + 3] = hidden.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);fogCtx.putImageData(hidden, 0, 0);
}

function buildChunk(world, chunkX, chunkY, seed, textures, pixels, CELL_PIXELS) {
  const CHUNK_PIXELS = CHUNK_SIZE * CELL_PIXELS;
  const canvas = createSurface(CHUNK_PIXELS);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const fogCanvas = createSurface(CHUNK_PIXELS);
  const fogCtx = fogCanvas.getContext('2d');
  paintRockFields(ctx, fogCtx, world, chunkX, chunkY, seed, pixels, CELL_PIXELS);
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
      drawTerrainCell(ctx, px, py, CELL_PIXELS, cell, neighbors);

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
  }
  for (let y = 0; y < CHUNK_PIXELS; y += 1) for (let x = 0; x < CHUNK_PIXELS; x += 1) {
    const gx = (x + .5) / samplePixels, gy = (y + .5) / samplePixels, ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    const a = samples[iy * stride + ix], b = samples[iy * stride + ix + 1];
    const c = samples[(iy + 1) * stride + ix], d = samples[(iy + 1) * stride + ix + 1];
    maskPixels.data[(y * CHUNK_PIXELS + x) * 4 + 3] = Math.round(255 * (a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy));
  }
  maskCtx.putImageData(maskPixels, 0, 0);
  fogCtx.globalCompositeOperation = 'destination-in';
  fogCtx.drawImage(mask, 0, 0);
  ctx.drawImage(fogCanvas, 0, 0);
  // Release large temporary backing stores immediately, especially on HiDPI.
  fogCanvas.width = fogCanvas.height = mask.width = mask.height = 1;
  return canvas;
}

export function drawTerrain(ctx, game, view) {
  const world = game.sim?.world;
  if (!world || view.cellSize <= 0) return;
  let cache = caches.get(world);
  if (!cache) {
    cache = { chunks: new Map(), tiers: new Map(), bytes: 0 };
    caches.set(world, cache);
  }
  const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
  const resolution = terrainResolution(view.cellSize, ratio);
  const minX = Math.max(0, Math.floor(view.left / CHUNK_SIZE));
  const maxX = Math.min(Math.ceil(world.width / CHUNK_SIZE) - 1, Math.floor((view.left + view.width / view.cellSize) / CHUNK_SIZE));
  const minY = Math.max(0, Math.floor(view.top / CHUNK_SIZE));
  const maxY = Math.min(Math.ceil(world.height / CHUNK_SIZE) - 1, Math.floor((view.top + view.height / view.cellSize) / CHUNK_SIZE));
  // A high-DPI viewport can need more than the normal LRU budget. Keep all
  // visible chunks resident: evicting one mid-frame would rebuild it forever.
  const visibleKeys = new Set();
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) visibleKeys.add(resolution + ':' + x + ',' + y);
  ctx.save();
  ctx.imageSmoothingEnabled = view.cellSize * ratio < resolution;
  ctx.imageSmoothingQuality = 'high';
  const transform = ctx.getTransform?.();
  const scaleX = Math.abs(transform?.a ?? ratio) || ratio, scaleY = Math.abs(transform?.d ?? ratio) || ratio;
  const offsetX = transform?.e ?? 0, offsetY = transform?.f ?? 0;
  const snapX = (value) => (Math.round(value * scaleX + offsetX) - offsetX) / scaleX;
  const snapY = (value) => (Math.round(value * scaleY + offsetY) - offsetY) / scaleY;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const key = resolution + ':' + x + ',' + y;
      const signature = chunkSignature(world, x, y);
      let entry = cache.chunks.get(key);
      if (!entry || entry.signature !== signature) {
        let tier = cache.tiers.get(resolution);
        if (!tier) {
          const textures = makeStrataTextures(resolution, game.sim.seed ?? 0);
          tier = { textures, pixels: texturePixels(textures) };
        }
        cache.tiers.delete(resolution);
        cache.tiers.set(resolution, tier);
        // Compiled chunks no longer need their source tiles. Bound the extra
        // pixel copies as well as the chunk LRU when sweeping through zooms.
        while (cache.tiers.size > 2) cache.tiers.delete(cache.tiers.keys().next().value);
        const canvas = buildChunk(world, x, y, game.sim.seed ?? 0, tier.textures, tier.pixels, resolution);
        if (!canvas) continue;
        if (entry) cache.bytes -= entry.canvas.width * entry.canvas.height * 4;
        entry = { canvas, signature };
        cache.bytes += canvas.width * canvas.height * 4;
        cache.chunks.set(key, entry);
      }
      cache.chunks.delete(key);
      cache.chunks.set(key, entry);
      // Shared device-pixel boundaries prevent a dark antialiasing seam between
      // adjacent opaque chunk bitmaps, including fractional camera positions.
      // Include the fractional collapse shake in the device-pixel alignment.
      const left = snapX(view.sx(x * CHUNK_SIZE)), top = snapY(view.sy(y * CHUNK_SIZE));
      const right = snapX(view.sx((x + 1) * CHUNK_SIZE)), bottom = snapY(view.sy((y + 1) * CHUNK_SIZE));
      ctx.drawImage(entry.canvas, left, top, right - left, bottom - top);
    }
  }
  for (const [key, entry] of cache.chunks) {
    if (cache.bytes <= MAX_CACHE_BYTES) break;
    if (visibleKeys.has(key)) continue;
    cache.bytes -= entry.canvas.width * entry.canvas.height * 4;
    cache.chunks.delete(key);
  }
  ctx.restore();
}

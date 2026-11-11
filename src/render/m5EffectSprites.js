import { drawEffect } from '../../art/effects.js';

// All pixels come from the existing art. Only these slow, soft M5 effects use
// shared animation phases; the game loop and each simulated position stay live.
const FRAME_COUNT = 32;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ATLASES = 32;
const PERIODS = { flames: 2, smoke: 6.25, gas: 6.25 };
const atlases = new Map();
let bytes = 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mod = (value, size) => ((value % size) + size) % size;
const unitKey = value => Math.max(1 / 1024, Math.round(value * 1024) / 1024);

function releaseAtlas(entry) {
  if (entry.image !== entry.canvas) entry.image.close?.();
  entry.canvas.width = 0; entry.canvas.height = 0;
}

export function clearM5EffectSprites() {
  for (const entry of atlases.values()) releaseAtlas(entry);
  atlases.clear(); bytes = 0;
}

export function m5EffectSpriteStats() {
  return { entries: atlases.size, bytes, maxBytes: MAX_BYTES, maxEntries: MAX_ATLASES, frames: FRAME_COUNT };
}

function rasterSize(pixels) {
  return [32, 64, 96, 128, 192].find(size => size >= pixels) ?? 192;
}

function createAtlas(type, unitW, unitH, width, height, variant) {
  let canvas, ctx;
  try {
    if (typeof globalThis.OffscreenCanvas === 'function') canvas = new globalThis.OffscreenCanvas(width * FRAME_COUNT, height);
    else if (globalThis.document?.createElement) {
      canvas = globalThis.document.createElement('canvas'); canvas.width = width * FRAME_COUNT; canvas.height = height;
    }
    ctx = canvas?.getContext('2d');
  } catch { return null; }
  if (!ctx) return null;
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    ctx.save();
    ctx.setTransform(width / unitW, 0, 0, height / unitH, frame * width, 0);
    drawEffect(ctx, type, { x: 0, y: 0, w: unitW, h: unitH }, 1,
      { t: frame / FRAME_COUNT * PERIODS[type], seed: variant * 137 + 1, intensity: 1 });
    ctx.restore();
  }
  let image = canvas;
  // An immutable texture avoids revalidating the entire source canvas for
  // every clipped flame. Older browsers and command recorders retain canvas.
  if (typeof canvas.transferToImageBitmap === 'function') {
    try { image = canvas.transferToImageBitmap(); canvas.width = 0; canvas.height = 0; } catch { image = canvas; }
  }
  return { canvas, image, width, height, bytes: width * FRAME_COUNT * height * 4 };
}

function sprite(ctx, type, rect, cell, seed) {
  if (!ctx.canvas || !(type in PERIODS)) return null;
  // Flames keep their simulated height through destination scaling. A shared
  // 1.2m drawing prevents every tick's fractional height from creating an atlas.
  const unitW = type === 'flames' ? 1.06 : unitKey(rect.w / cell);
  const unitH = type === 'flames' ? 1.2 : unitKey(rect.h / cell);
  const width = type === 'flames' ? 96 : rasterSize(rect.w);
  const height = type === 'flames' ? 128 : rasterSize(rect.h);
  const variant = mod(Math.floor(seed), type === 'flames' ? 3 : 2);
  const key = [type, unitW, unitH, width, height, variant].join(':');
  let entry = atlases.get(key);
  if (entry) { atlases.delete(key); atlases.set(key, entry); return entry; }
  entry = createAtlas(type, unitW, unitH, width, height, variant);
  if (!entry) return null;
  while (atlases.size && (bytes + entry.bytes > MAX_BYTES || atlases.size >= MAX_ATLASES)) {
    const oldest = atlases.keys().next().value, evicted = atlases.get(oldest);
    bytes -= evicted.bytes; releaseAtlas(evicted); atlases.delete(oldest);
  }
  atlases.set(key, entry); bytes += entry.bytes; return entry;
}

export function drawM5Effect(ctx, type, rect, cell, options = {}) {
  const intensity = clamp(Number(options.intensity ?? 1) || 0, 0, 1);
  if (!intensity || ![rect?.x, rect?.y, rect?.w, rect?.h, cell].every(Number.isFinite)
    || rect.w <= 0 || rect.h <= 0 || cell <= 0) return;
  const seed = Number.isFinite(options.seed) ? options.seed : 1;
  const entry = sprite(ctx, type, rect, cell, seed);
  if (!entry) { drawEffect(ctx, type, rect, cell, options); return; }
  const time = Number.isFinite(options.t) ? options.t : 0;
  const phase = mod(time / PERIODS[type] + seed * .61803398875, 1);
  const frame = Math.min(FRAME_COUNT - 1, Math.floor(phase * FRAME_COUNT));
  ctx.save(); ctx.globalAlpha *= intensity;
  ctx.drawImage(entry.image, frame * entry.width, 0, entry.width, entry.height,
    rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

import { CELL, TIME } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';

const models = new WeakMap();
const rasters = new Map();
const RASTER_BYTES = 16 * 1024 * 1024;
let rasterBytes = 0;
function releaseRaster(region) {
  const entry = rasters.get(region);
  if (!entry) return;
  rasterBytes -= entry.bytes;rasters.delete(region);
  entry.canvas.width = 0;entry.canvas.height = 0;
}
const TAU = Math.PI * 2;
const noise = (a, b = 0) => {
  let n = Math.imul((a + 13) | 0, 1597334677) ^ Math.imul((b + 97) | 0, 3812015801);
  n = Math.imul(n ^ n >>> 16, 2246822507);
  return ((n ^ n >>> 13) >>> 0) / 4294967296;
};

// Read the remaining rubble, so clearing a collapse immediately clears its art.
// Connected cascades share one cavity and one heap rather than stacked rectangles.
export function rubbleRegions(sim) {
  const rooms = (sim.excavations ?? []).filter(r => r.state === 'collapsed');
  if (!rooms.length || !sim.world) return [];
  const world = sim.world;
  const signature = `${world.revision}:${rooms.map(r => `${r.id}/${r.lining}/${JSON.stringify(r.supports)}`).join('|')}`;
  const previous = models.get(world);
  if (previous?.signature === signature) return previous.regions;
  for (const region of previous?.regions ?? []) releaseRaster(region);
  const pending = new Set();
  for (let i = 0; i < world.materials.length; i++) {
    if (world.materials[i] === MATERIAL.RUBBLE && world.states[i] === CELL.SOLID) pending.add(i);
  }
  const regions = [];
  while (pending.size) {
    const first = pending.values().next().value;
    const queue = [first], cells = [];
    pending.delete(first);
    let left = Infinity, top = Infinity, right = 0, bottom = 0;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], { x, y } = world.coords(index);
      cells.push({ x, y, index });
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (!world.inBounds(xx, yy)) continue;
        const next = world.index(xx, yy);
        if (pending.delete(next)) queue.push(next);
      }
    }
    const members = rooms.filter(r => {
      const fontis = Math.min(r.stress?.slab ?? 0, Math.ceil((r.stress?.span ?? r.w) / 2));
      return r.x < right && r.x + r.w > left && r.y - fontis < bottom && r.y + r.h > top;
    });
    if (members.length) regions.push({ x: left, y: top, w: right - left, h: bottom - top, cells, rooms: members, seed: first });
  }
  models.set(world, { signature, regions });
  return regions;
}

function heapTop(region, x) {
  const t = x / region.w;
  return region.h * (.82 - .43 * Math.sin(Math.PI * Math.max(0, Math.min(1, t))))
    + .12 * Math.sin(x * 3.1 + region.seed);
}

function polygon(ctx, points) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) ctx[i ? 'lineTo' : 'moveTo'](...points[i]);
  ctx.closePath();
}

function block(ctx, x, y, radius, seed) {
  const points = Array.from({ length: 6 }, (_, n) => {
    const angle = n * TAU / 6 + noise(seed, 9) * .6;
    const r = radius * (.7 + noise(seed, n) * .4);
    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r * .75];
  });
  polygon(ctx, points);
  ctx.fillStyle = ['#695e4b', '#7e715a', '#554e42', '#8b7c61'][seed % 4]; ctx.fill();
  ctx.strokeStyle = '#292823'; ctx.lineWidth = .035; ctx.stroke();
  polygon(ctx, [points[2], points[3], points[4], [x + radius * .1, y - radius * .05]]);
  ctx.fillStyle = 'rgba(208,183,133,.22)'; ctx.fill();
  polygon(ctx, [points[0], points[1], points[2], [x + radius * .1, y - radius * .05]]);
  ctx.fillStyle = 'rgba(12,17,17,.27)'; ctx.fill();
}

function brokenBeam(ctx, x, y, length, angle, material) {
  const metal = material === 'metal', concrete = ['concrete', 'cement'].includes(material);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  polygon(ctx, [[0, -.12], [length, -.12], [length - .15, -.03], [length + .09, .01], [length - .12, .05], [length, .13], [0, .13]]);
  ctx.fillStyle = metal ? '#65706b' : concrete ? '#747365' : '#71513a'; ctx.fill();
  ctx.strokeStyle = '#24231f'; ctx.lineWidth = .045; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(.05, -.075); ctx.lineTo(length - .18, -.075);
  ctx.strokeStyle = metal ? '#a2aaa0' : concrete ? '#a9a58d' : '#b28b56'; ctx.lineWidth = .035; ctx.stroke();
  ctx.restore();
}

function paintCavity(ctx, region) {
  const { w, h, seed } = region;
  const background = ctx.createLinearGradient(0, 0, w * .7, h);
  background.addColorStop(0, '#141a19'); background.addColorStop(.5, '#242824'); background.addColorStop(1, '#3f3a2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
  // A broken, inward-facing lip hides the geometric cell boundary.
  ctx.beginPath();ctx.moveTo(0, h);
  for (let yy = h; yy >= 0; yy -= .45) ctx.lineTo(.06 + noise(seed, Math.round(yy * 10)) * .25, yy);
  for (let xx = 0; xx <= w; xx += .45) ctx.lineTo(xx, .1 + noise(seed + 1, Math.round(xx * 10)) * .5);
  for (let yy = 0; yy <= h; yy += .45) ctx.lineTo(w - .06 - noise(seed + 2, Math.round(yy * 10)) * .25, yy);
  ctx.strokeStyle = '#3c3e33';ctx.lineWidth = .08;ctx.stroke();
  const crest = [];
  for (let xx = 0; xx <= w + .01; xx += w / 32) crest.push([xx, heapTop(region, xx)]);
  polygon(ctx, [[0, h], ...crest, [w, h]]);
  const fill = ctx.createLinearGradient(0, h * .4, 0, h);
  fill.addColorStop(0, '#72634b');fill.addColorStop(1, '#3c382d');ctx.fillStyle = fill;ctx.fill();
  // Overlapping fragments follow the slope; none float in the cavity above it.
  for (let row = 0; row < Math.ceil(h / .5); row++) {
    const yy = h * .35 + row * .48;
    if (yy > h) break;
    for (let col = 0; col < Math.ceil(w / .7); col++) {
      const id = row * 101 + col + seed;
      const x = .24 + col * .69 + (noise(id, 7) - .5) * .34;
      const y = yy + noise(id, 8) * .27;
      const radius = .24 + noise(id, 6) ** 2 * .66;
      if (y - radius * .48 < heapTop(region, x)) continue;
      block(ctx, x, y, radius, id);
    }
  }
  for (const room of region.rooms) {
    const shored = ['timber', 'steelArch'].includes(room.lining) || room.supports?.length;
    if (!shored) continue;
    const material = room.lining === 'steelArch' ? 'metal' : room.lining === 'timber' ? 'wood'
      : room.supports.find(s => typeof s === 'object')?.material ?? 'wood';
    for (let n = 0; n < 3; n++) {
      const x = (room.x - region.x) + room.w * (.13 + n * .27);
      brokenBeam(ctx, x, Math.max(heapTop(region, x) + .2, room.y - region.y + room.h * .7),
        Math.min(['concrete', 'cement'].includes(material) ? .8 : 2.3, room.w * .27), (n % 2 ? -.35 : .45), material);
    }
  }
}

function drawSettlingDust(ctx, game, view, region) {
  const ids = new Set(region.rooms.map(r => r.id));
  const event = (game.sim.events ?? []).findLast(e => ['collapse', 'cascade'].includes(e.type) && ids.has(e.excavationId));
  if (!event) return;
  const age = game.sim.tick - event.tick;
  const lifetime = 6 * TIME.TICKS_PER_HOUR;
  if (age < 0 || age >= lifetime) return;
  const opacity = (1 - age / lifetime) ** 1.4;
  const now = view.now ?? game.renderTime ?? 0;
  ctx.save();
  for (let i = 0; i < 28; i++) {
    const phase = (now * (.035 + noise(region.seed, i) * .035) + noise(i, 97)) % 1;
    const x = region.w * (.05 + .9 * noise(i, region.seed));
    const y = .3 + phase * (heapTop(region, x) - .3);
    const radius = .09 + phase * .19;
    ctx.globalAlpha = opacity * Math.sin(phase * Math.PI) * .17;
    ctx.save();ctx.translate(x + Math.sin(now * .3 + i) * .15, y);ctx.scale(radius * 3.5, radius * 1.5);
    const dust = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    dust.addColorStop(0, '#c9b78f');dust.addColorStop(1, 'rgba(201,183,143,0)');
    ctx.fillStyle = dust;ctx.fillRect(-1, -1, 2, 2);ctx.restore();
    ctx.globalAlpha = opacity * Math.sin(phase * Math.PI) * .42;
    ctx.fillStyle = '#d5c29a';ctx.fillRect(x, y, .025, .045);
  }
  ctx.restore();
}

export function drawRubble(ctx, game, view) {
  for (const region of rubbleRegions(game.sim)) {
    if (view.sx(region.x + region.w) < 0 || view.sx(region.x) > view.width || view.sy(region.y + region.h) < 0 || view.sy(region.y) > view.height) continue;
    ctx.save();ctx.beginPath();
    for (const cell of region.cells) if (game.sim.world.visibility[cell.index]) {
      ctx.rect(view.sx(cell.x), view.sy(cell.y), view.cellSize, view.cellSize);
    }
    ctx.clip();ctx.translate(view.sx(region.x), view.sy(region.y));ctx.scale(view.cellSize, view.cellSize);
    const matrix = ctx.getTransform();
    const pixels = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
    const pw = Math.ceil(region.w * pixels), ph = Math.ceil(region.h * pixels);
    const bytes = pw * ph * 4;
    let entry = rasters.get(region);
    if (entry && (entry.canvas.width !== pw || entry.canvas.height !== ph)) { releaseRaster(region);entry = null; }
    if (!entry && typeof OffscreenCanvas === 'function' && pw > 0 && ph > 0 && bytes <= RASTER_BYTES) {
      let canvas, target;
      try { canvas = new OffscreenCanvas(pw, ph);target = canvas.getContext('2d'); } catch { /* Direct drawing remains available. */ }
      if (target) {
        while (rasters.size && (rasterBytes + bytes > RASTER_BYTES || rasters.size >= 32)) releaseRaster(rasters.keys().next().value);
        target.scale(pw / region.w, ph / region.h);paintCavity(target, region);
        entry = { canvas, bytes };rasters.set(region, entry);rasterBytes += bytes;
      }
    }
    if (entry) {
      rasters.delete(region);rasters.set(region, entry);
      ctx.drawImage(entry.canvas, 0, 0, region.w, region.h);
    } else paintCavity(ctx, region);
    drawSettlingDust(ctx, game, view, region);
    ctx.restore();
  }
}

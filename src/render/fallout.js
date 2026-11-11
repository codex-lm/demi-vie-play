import { TIME, WATER, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { falloutFrontDepth, shallowWaterContaminated, wellOutlook } from '../sim/water.js';
import { aquiferPreviewHint } from '../sim/waterChain.js';
import { colorblindEnabled } from './overlayPalette.js';

// Display snapshots are never attached to Sim or World. Geological sampling is
// bounded to the shallow contamination zone and happens once per game hour.
const samples = new WeakMap(), previews = new WeakMap();
const TAU = Math.PI * 2;
const normal = { stain: '#9e799a', edge: '#cfb8a9', water: '#c6a1d6', safe: '#a4d7dc', soon: '#edc582' };
const accessible = { stain: '#b9aa64', edge: '#f1df9a', water: '#ffedb0', safe: '#b9d6ef', soon: '#efce89' };
const palette = game => colorblindEnabled(game) ? accessible : normal;

export function falloutArtModel(sim) {
  const hour = Math.floor((sim.tick ?? 0) / TIME.TICKS_PER_HOUR);
  const old = samples.get(sim);
  if (old?.hour === hour) return old;
  const world = sim.world, depth = falloutFrontDepth(sim), frontY = WORLD.SURFACE_Y + depth;
  const sand = [], front = [], wells = [];
  const maxY = Math.min(world.height - 1, WORLD.SURFACE_Y + WATER.CONTAMINATED_DEPTH - 1);
  for (let y = WORLD.SURFACE_Y; y <= maxY; y++) {
    const contaminated = shallowWaterContaminated(sim, y);
    const reachesFront = depth > 0 && y < frontY + .22 && y + 1 > frontY - .42;
    let start = -1;
    for (let x = 0; x <= world.width; x++) {
      const knownSolid = x < world.width && world.isVisible(x, y) && world.isSolid(x, y);
      if (knownSolid && reachesFront) front.push({ x, y });
      const affected = knownSolid && contaminated && world.material(x, y) === MATERIAL.SAND;
      if (affected && start < 0) start = x;
      if (!affected && start >= 0) { sand.push({ x: start, y, w: x - start }); start = -1; }
    }
  }
  for (const room of sim.excavations ?? []) {
    if (room.roomType !== 'well' || !['dug', 'fitted'].includes(room.state)) continue;
    if (wellOutlook(sim, room).quality === 'radioactive') wells.push(room);
  }
  const model = { hour, depth, frontY, sand, front, wells, samples: (old?.samples ?? 0) + 1 };
  samples.set(sim, model);
  return model;
}

export function getFalloutCacheStats(sim) {
  const model = samples.get(sim), preview = previews.get(sim);
  return { hour: model?.hour ?? null, samples: model?.samples ?? 0,
    sandSpans: model?.sand.length ?? 0, frontCells: model?.front.length ?? 0,
    previewSamples: preview?.samples ?? 0 };
}

function visible(view, x, y, w = 1, h = 1) {
  return view.sx(x + w) >= 0 && view.sx(x) <= view.width
    && view.sy(y + h) >= 0 && view.sy(y) <= view.height;
}

/** Thin mineral stain, interrupted exactly at undiscovered cells and voids. */
export function drawFalloutTerrain(ctx, game, view) {
  const model = falloutArtModel(game.sim);
  if (!model.sand.length && !model.front.length) return;
  const colors = palette(game), cell = view.cellSize;
  ctx.save(); ctx.setLineDash([]);
  ctx.fillStyle = colors.stain; ctx.globalAlpha = .30;
  // The hourly sample supplies the hazard, not permission to paint a cell.
  // Excavation and visibility can change inside that hour. Split the sampled
  // rows into still-known, still-solid sand runs without resampling fallout.
  const world = game.sim.world;
  ctx.strokeStyle = colors.water; ctx.lineWidth = Math.max(.8, cell * .035);
  ctx.beginPath();
  for (const row of model.sand) if (visible(view, row.x, row.y, row.w)) {
    let start = -1;
    const end = row.x + row.w;
    for (let x = row.x; x <= end; x++) {
      const knownSand = x < end && world.isVisible(x, row.y) && world.isSolid(x, row.y)
        && world.material(x, row.y) === MATERIAL.SAND;
      if (knownSand && start < 0) start = x;
      if (!knownSand && start >= 0) {
        ctx.fillRect(view.sx(start), view.sy(row.y), (x - start) * cell, cell);
        // The diagonal dashes remain distinguishable in greyscale and cividis.
        for (let xx = start; xx < x; xx++) {
          const px = view.sx(xx), py = view.sy(row.y);
          ctx.moveTo(px + cell * .18, py + cell * .77); ctx.lineTo(px + cell * .58, py + cell * .37);
        }
        start = -1;
      }
    }
  }
  ctx.globalAlpha = .38; ctx.stroke();
  for (const point of model.front) if (visible(view, point.x, point.y)
    && world.isVisible(point.x, point.y) && world.isSolid(point.x, point.y)) {
    const x = view.sx(point.x), y = view.sy(point.y), edge = view.sy(model.frontY);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, cell, cell); ctx.clip();
    ctx.globalAlpha = .18; ctx.fillStyle = colors.stain;
    ctx.fillRect(x, edge - cell * .42, cell, cell * .64);
    ctx.globalAlpha = .72; ctx.strokeStyle = colors.edge; ctx.lineWidth = Math.max(1, cell * .045);
    ctx.beginPath(); ctx.moveTo(x, edge); ctx.lineTo(x + cell, edge); ctx.stroke();
    if (point.x % 4 === 0) {
      ctx.globalAlpha = .62; ctx.beginPath();
      ctx.moveTo(x + cell * .3, edge - cell * .2); ctx.lineTo(x + cell * .5, edge - cell * .04);
      ctx.lineTo(x + cell * .7, edge - cell * .2); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function radiationMark(ctx, x, y, radius, ink) {
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.arc(x, y, radius * .18, 0, TAU); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const start = -Math.PI / 2 + i * TAU / 3;
    ctx.beginPath(); ctx.arc(x, y, radius, start, start + Math.PI / 3);
    ctx.arc(x, y, radius * .35, start + Math.PI / 3, start, true); ctx.closePath(); ctx.fill();
  }
}

/** A stamped trefoil and tinted water surface identify each affected well. */
export function drawWellContamination(ctx, game, view) {
  const model = falloutArtModel(game.sim), colors = palette(game), cell = view.cellSize;
  if (!model.wells.length) return;
  ctx.save(); ctx.setLineDash([]);
  for (const room of model.wells) {
    if (!['dug', 'fitted'].includes(room.state) || !visible(view, room.x, room.y, room.w, room.h)) continue;
    // Same drawing-metre anchors as art/props-industrial.js's timber gantry.
    const count = Math.max(1, Math.floor((room.w - .4) / 5.5)), span = (room.w - .6) / count;
    for (let n = 0; n < count; n++) {
      const center = room.x + .3 + span * n + Math.min(span * .42, 2.1), floor = room.y + room.h - .08;
      const wx = center + .85, wy = floor - 1.23;
      if (!game.sim.world.isVisible(Math.floor(wx), Math.floor(wy))) continue;
      const x = view.sx(wx), y = view.sy(wy), r = Math.max(4.5, cell * .24);
      ctx.globalAlpha = .95; ctx.fillStyle = '#201d25';
      ctx.fillRect(x - r * 1.35, y - r * 1.35, r * 2.7, r * 2.7);
      ctx.strokeStyle = colors.water; ctx.lineWidth = Math.max(1, cell * .04);
      ctx.strokeRect(x - r * 1.35, y - r * 1.35, r * 2.7, r * 2.7);
      radiationMark(ctx, x, y, r, colors.water);
      ctx.globalAlpha = .8; ctx.fillStyle = colors.water;
      ctx.beginPath(); ctx.ellipse(view.sx(center), view.sy(floor - .79), cell * .65, cell * .055, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = .9; ctx.strokeStyle = '#eee3ed'; ctx.lineWidth = Math.max(.7, cell * .025);
      ctx.beginPath(); ctx.moveTo(view.sx(center - .35), view.sy(floor - .80));
      ctx.lineTo(view.sx(center + .20), view.sy(floor - .80)); ctx.stroke();
    }
  }
  ctx.restore();
}

export function aquiferPreviewModel(game) {
  if (game.tool?.type !== 'dig' || !game.drag) return null;
  let { x, y, w, h } = game.drag;
  if (![x, y, w, h].every(Number.isFinite) || w === 0 || h === 0) return null;
  if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
  x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
  const sim = game.sim, world = sim.world, hour = Math.floor(sim.tick / TIME.TICKS_PER_HOUR);
  const key = `${x}/${y}/${w}/${h}/${hour}/${world.revision}`;
  const old = previews.get(sim);
  if (old?.key === key) return old.model;
  const hint = aquiferPreviewHint(sim, { x, y, w, h });
  const contacts = [];
  if (hint) for (let yy = Math.max(WORLD.SURFACE_Y, y - 1); yy <= Math.min(world.height - 1, y + h); yy++) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(world.width - 1, x + w); xx++) {
      if (!world.isVisible(xx, yy) || !world.isSolid(xx, yy)) continue;
      const material = world.material(xx, yy);
      if (material !== MATERIAL.SAND && material !== MATERIAL.SANDSTONE) continue;
      const protectedWater = material === MATERIAL.SANDSTONE || yy - WORLD.SURFACE_Y >= WATER.CONTAMINATED_DEPTH;
      contacts.push({ x: xx, y: yy, material, protected: protectedWater,
        radioactive: !protectedWater && shallowWaterContaminated(sim, yy) });
    }
  }
  const model = hint && contacts.length ? { ...hint, contacts } : null;
  previews.set(sim, { key, model, samples: (old?.samples ?? 0) + 1 });
  return model;
}

function shield(ctx, x, y, r, ink) {
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.2, r * .18);
  ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r);
  ctx.lineTo(x + r * .8, y + r * .15); ctx.quadraticCurveTo(x + r * .5, y + r * .8, x, y + r);
  ctx.quadraticCurveTo(x - r * .5, y + r * .8, x - r * .8, y + r * .15); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * .45, y); ctx.lineTo(x - r * .08, y + r * .35);
  ctx.lineTo(x + r * .5, y - r * .4); ctx.stroke();
}

/** The touched grains pulse. No text duplicates the existing preview panel. */
export function drawAquiferPreview(ctx, game, view) {
  const model = aquiferPreviewModel(game);
  if (!model) return;
  const colors = palette(game), cell = view.cellSize;
  const time = game.options?.reduceMotion ? 0 : view.now ?? 0;
  const pulse = game.options?.reduceMotion ? .72 : .68 + .20 * Math.sin(time * 3.4);
  ctx.save(); ctx.setLineDash([]);
  let emblem;
  for (const contact of model.contacts) {
    if (!visible(view, contact.x, contact.y) || !game.sim.world.isVisible(contact.x, contact.y)
      || !game.sim.world.isSolid(contact.x, contact.y)
      || game.sim.world.material(contact.x, contact.y) !== contact.material) continue;
    const x = view.sx(contact.x), y = view.sy(contact.y);
    const ink = contact.radioactive ? colors.water : contact.protected ? colors.safe : colors.soon;
    ctx.globalAlpha = .22 + pulse * .16; ctx.fillStyle = ink; ctx.fillRect(x, y, cell, cell);
    ctx.globalAlpha = pulse; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.2, cell * .055);
    ctx.strokeRect(x + 1, y + 1, Math.max(1, cell - 2), Math.max(1, cell - 2));
    ctx.beginPath();
    if (contact.radioactive) {
      ctx.moveTo(x + cell * .15, y + cell * .82); ctx.lineTo(x + cell * .82, y + cell * .15);
      ctx.moveTo(x + cell * .15, y + cell * .15); ctx.lineTo(x + cell * .82, y + cell * .82);
    } else {
      ctx.moveTo(x + cell * .14, y + cell * .64);
      ctx.quadraticCurveTo(x + cell * .32, y + cell * .44, x + cell * .5, y + cell * .64);
      ctx.quadraticCurveTo(x + cell * .68, y + cell * .84, x + cell * .86, y + cell * .64);
    }
    ctx.stroke();
    // The emblem describes the prospect's actual quality, not whichever
    // contact happens to be deepest. A shallow contaminated contact makes a
    // mixed aquifer radioactive even while its deeper grains are still clean.
    // Never move that warning onto an unobserved contact to bypass the fog.
    const matchesHint = model.key === 'm6bAquiferRadioactive' ? contact.radioactive
      : ['m6bAquiferSandstone', 'm6bAquiferDeep'].includes(model.key) ? contact.protected
      : !contact.radioactive && !contact.protected;
    if (matchesHint && (!emblem || contact.y > emblem.y)) emblem = contact;
  }
  if (emblem) {
    const x = view.sx(emblem.x + .5), y = view.sy(emblem.y + .5), r = Math.max(5, cell * .27);
    const ink = emblem.radioactive ? colors.water : emblem.protected ? colors.safe : colors.soon;
    ctx.globalAlpha = 1; ctx.fillStyle = '#141e24'; ctx.beginPath(); ctx.arc(x, y, r * 1.4, 0, TAU); ctx.fill();
    if (emblem.radioactive) radiationMark(ctx, x, y, r, ink);
    else if (emblem.protected) shield(ctx, x, y, r * .85, ink);
    else {
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.1, cell * .045);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.moveTo(x, y - r * .65);
      ctx.lineTo(x, y); ctx.lineTo(x + r * .6, y + r * .2); ctx.stroke();
    }
  }
  ctx.restore();
}

import { TIME, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { SPEED, ticksPerSecond } from '../data/speeds.js';
import { drawEffect } from '../../art/effects.js';
import { drawM5Effect } from './m5EffectSprites.js';
import { drawColonist } from '../../art/colonist.js';
import { drawFind } from '../../art/finds.js';
import { drawRadioWaves } from '../../art/surface.js';
import { drawDrip, drawSeep, drawWaterTable } from '../../art/water.js';

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const clocks = new WeakMap();
const frames = new WeakMap();
const animals = new Set(['dog', 'hen', 'rabbit', 'bat', 'goat', 'badger']);

function identitySeed(value) {
  if (Number.isFinite(value)) return value;
  let hash = 2166136261;
  for (const character of String(value ?? '')) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function visible(sim, view, x, y, margin = 2) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const px = view.sx(x), py = view.sy(y), pad = view.cellSize * margin;
  return px >= -pad && px <= view.width + pad && py >= -pad && py <= view.height + pad
    && (y < WORLD.SURFACE_Y || sim.world.isVisible(Math.floor(x), Math.floor(y)));
}

function roomVisible(sim, view, room) {
  return room && !['planned', 'collapsed'].includes(room.state)
    && view.sx(room.x + room.w) >= 0 && view.sx(room.x) <= view.width
    && view.sy(room.y + room.h) >= 0 && view.sy(room.y) <= view.height
    && (room.dugCells ?? []).some(i => {
      const p = sim.world.coords(i); return sim.world.isVisible(p.x, p.y) && sim.world.isEmpty(p.x, p.y);
    });
}

function roomRect(room, view) {
  return { x: view.sx(room.x), y: view.sy(room.y), w: room.w * view.cellSize, h: room.h * view.cellSize };
}

function emptyCellRectangles(room, world) {
  const rows = new Map();
  for (const index of room.dugCells ?? []) {
    const p = world.coords(index);
    if (!world.isEmpty(p.x, p.y) || !world.isVisible(p.x, p.y)) continue;
    if (!rows.has(p.y)) rows.set(p.y, new Set());
    rows.get(p.y).add(p.x);
  }
  const rectangles = [];
  let previous = new Map(), previousY = -Infinity;
  for (const [y, columns] of [...rows].sort((a, b) => a[0] - b[0])) {
    const xs = [...columns].sort((a, b) => a - b), next = new Map();
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]; let right = x + 1;
      while (i + 1 < xs.length && xs[i + 1] === right) { i++; right++; }
      const w = right - x, key = `${x}:${w}`;
      let rectangle = previousY === y - 1 ? previous.get(key) : null;
      if (rectangle) rectangle.h++;
      else { rectangle = { x, y, w, h: 1 }; rectangles.push(rectangle); }
      next.set(key, rectangle);
    }
    previous = next; previousY = y;
  }
  return rectangles;
}

function clipRoom(ctx, room, view, world) {
  const { x, y, w, h } = roomRect(room, view);
  ctx.beginPath();
  if (room.shape === 'round') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (room.shape === 'vault') {
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * .3);
    ctx.bezierCurveTo(x + w * .16, y + h * .025, x + w * .34, y, x + w / 2, y);
    ctx.bezierCurveTo(x + w * .66, y, x + w * .84, y + h * .025, x + w, y + h * .3);
    ctx.lineTo(x + w, y + h); ctx.closePath();
  } else ctx.rect(x, y, w, h);
  ctx.clip();
  // A planned rectangle is not a cavity: intersect the curved room silhouette
  // with the known empty cells, including during partial digging and cave-ins.
  // Exact row/column unions keep holes but avoid a costly GPU clip per cell.
  ctx.beginPath();
  for (const rectangle of emptyCellRectangles(room, world)) {
    ctx.rect(view.sx(rectangle.x), view.sy(rectangle.y), rectangle.w * view.cellSize, rectangle.h * view.cellSize);
  }
  ctx.clip();
}

/** Finite visual age; pausing never leaves an old pulse blinking forever. */
export function transientAge(game, event, duration) {
  const now = game.renderTime ?? 0;
  let clock = clocks.get(event);
  if (!clock) {
    const ticks = game.sim.tick - event.tick;
    const frame = frames.get(game);
    // A real frame can execute hundreds of game minutes at high speed. Those
    // new events still deserve the beginning of their visual animation. Loaded
    // historical events do not: their timestamps precede the first frame.
    if (!Number.isFinite(ticks) || ticks < 0) return Infinity;
    if (frame?.sim === game.sim && event.tick < frame.startTick) {
      clocks.set(event, { start: now, initial: Infinity });
      return Infinity;
    }
    const freshBatch = frame?.sim === game.sim && ticks <= TIME.MAX_TICKS_PER_FRAME
      && (event.tick > frame.previousTick || (frame.first && ticks === 0));
    // An older event is aged at the pace of "Travailler" (the former x1), or
    // at the real pace when the game runs slower than that.
    const pace = ticksPerSecond(Math.min(SPEED.WORK, game.speed || game.previousSpeed || SPEED.WORK));
    if (!freshBatch && ticks > pace * duration) return Infinity;
    clock = { start: now, initial: freshBatch ? 0 : ticks / pace };
    clocks.set(event, clock);
  }
  return clock.initial + Math.max(0, now - clock.start);
}

function drawFireAndGas(ctx, game, view) {
  const sim = game.sim, hazards = sim.m5.hazards, t = game.options?.reduceMotion ? 0 : game.renderTime ?? view.now ?? 0;
  const firesByRoom = new Map();
  for (const fire of hazards.fires ?? []) {
    if (fire.state !== 'burning' || !(fire.intensity > 0)) continue;
    if (!firesByRoom.has(fire.excavationId)) firesByRoom.set(fire.excavationId, []);
    firesByRoom.get(fire.excavationId).push(fire);
  }
  for (const room of sim.excavations) {
    const gas = hazards.gas?.[room.id];
    const fires = firesByRoom.get(room.id) ?? [];
    if (!fires.length && !(gas?.methane > 0) && !(gas?.smoke > 0)) continue;
    if (!roomVisible(sim, view, room)) continue;
    ctx.save(); clipRoom(ctx, room, view, sim.world);
    const region = roomRect(room, view);
    if (gas?.methane > 0) drawM5Effect(ctx, 'gas', region, view.cellSize, { t, seed: room.id, intensity: clamp(gas.methane / 100) });
    for (const fire of fires) {
      for (const [index, flame] of (fire.flames ?? []).entries()) {
        if (!visible(sim, view, flame.x, flame.y) || !(flame.height > 0)) continue;
        const h = flame.height * view.cellSize;
        drawM5Effect(ctx, 'flames', { x: view.sx(flame.x) - view.cellSize * .53,
          y: view.sy(flame.y) - h, w: view.cellSize * 1.06, h }, view.cellSize,
        { t, seed: fire.id * 17 + index, intensity: clamp(fire.intensity) });
      }
      for (const spark of fire.sparks ?? []) {
        if (game.options?.reduceMotion) continue;
        if (!visible(sim, view, spark.x, spark.y) || !(spark.alpha > 0)) continue;
        ctx.save(); ctx.globalAlpha *= clamp(spark.alpha * fire.intensity);
        ctx.strokeStyle = '#ffd38b'; ctx.lineWidth = Math.max(.9, view.cellSize * .04);
        ctx.beginPath(); ctx.moveTo(view.sx(spark.x), view.sy(spark.y));
        ctx.lineTo(view.sx(spark.x + .035), view.sy(spark.y - .13)); ctx.stroke(); ctx.restore();
      }
    }
    if (gas?.smoke > 0) drawM5Effect(ctx, 'smoke', region, view.cellSize, { t, seed: room.id, intensity: clamp(gas.smoke / 100) });
    ctx.restore();
  }
  for (const event of sim.events ?? []) {
    if (event.type !== 'methaneExplosion' || !visible(sim, view, event.x, event.y)) continue;
    const age = transientAge(game, event, 1.8);
    if (age >= 1.8) continue;
    drawEffect(ctx, 'sparks', { x: view.sx(event.x - 1.4), y: view.sy(event.y - 1.8),
      w: view.cellSize * 2.8, h: view.cellSize * 2.4 }, view.cellSize,
    { t: game.options?.reduceMotion ? .5 : age, seed: event.tick, intensity: 1 - age / 1.8 });
  }
}

function drawPocketSeeps(ctx, game, view) {
  const sim = game.sim, cell = view.cellSize, t = game.options?.reduceMotion ? 0 : game.renderTime ?? view.now ?? 0;
  for (const pocket of sim.m5.hazards.waterPockets ?? []) {
    if (pocket.state !== 'seeping' || !visible(sim, view, pocket.x, pocket.y)) continue;
    const room = sim.excavations.find(r => r.id === pocket.excavationId);
    if (!roomVisible(sim, view, room) || room.coating === 'waterproof') continue;
    ctx.save(); clipRoom(ctx, room, view, sim.world);
    const height = Math.max(.1, Math.min(1.7, room.y + room.h - pocket.y));
    const region = { x: view.sx(pocket.x - .4), y: view.sy(pocket.y), w: cell * .8, h: cell * height };
    drawSeep(ctx, region, cell, { t, seed: pocket.id, dirty: true });
    drawDrip(ctx, region, cell, { t, seed: pocket.id, dirty: true });
    ctx.restore();
  }
}

/** The calendar level is a relative rise in metres, never an absolute map y.
 * Paint saturated wall rock only. Free water remains the cellular water layer. */
export function drawThawWalls(ctx, game, view) {
  const sim = game.sim, table = sim.m5?.calendar?.waterTable;
  const rise = Math.max(0, Number(table?.level ?? 0) - Number(table?.baseLevel ?? 0));
  if (rise <= 1e-6) return;
  const world = sim.world, cell = view.cellSize;
  for (const room of sim.excavations) {
    if ((!room.thawExposure && table.active) || !roomVisible(sim, view, room) || room.coating === 'waterproof') continue;
    const wallCells = new Map();
    for (const index of room.dugCells ?? []) {
      const p = world.coords(index);
      if (!world.isEmpty(p.x, p.y) || !world.isVisible(p.x, p.y)) continue;
      for (const [xx, yy] of [[p.x - 1, p.y], [p.x + 1, p.y], [p.x, p.y - 1], [p.x, p.y + 1]]) {
        if (world.isSolid(xx, yy) && world.isVisible(xx, yy)
          && [MATERIAL.SAND, MATERIAL.SANDSTONE].includes(world.material(xx, yy))) wallCells.set(`${xx}:${yy}`, [xx, yy]);
      }
    }
    if (!wallCells.size) continue;
    ctx.save(); ctx.beginPath();
    // Only permeable rock touching known excavation can carry this damp band.
    // Residual rise drains after the active interval, following the calendar.
    for (const [xx, yy] of wallCells.values()) ctx.rect(view.sx(xx), view.sy(yy), cell, cell);
    ctx.clip();
    // Damp mineral texture stays subordinate to actual free water. In
    // particular its thin meniscus must not read as a second flooded cavity.
    ctx.globalAlpha *= .35;
    drawWaterTable(ctx, { x: view.sx(room.x - 1), y: view.sy(room.y - 1), w: (room.w + 2) * cell, h: (room.h + 2) * cell }, cell,
      { level: clamp((rise + 1) / (room.h + 2)), t: game.options?.reduceMotion ? 0 : game.renderTime ?? view.now ?? 0 });
    ctx.restore();
  }
}

function floorCells(sim, poi) {
  return (poi.cells ?? []).filter(p => sim.world.isVisible(p.x, p.y) && sim.world.isEmpty(p.x, p.y)
    && !sim.world.isEmpty(p.x, p.y + 1));
}

/** Render-only placements; never seed the simulation RNG or create colonists. */
export function m5Actors(sim, time = 0) {
  const result = [];
  for (const raider of sim.m5?.hazards?.raiders ?? []) {
    if (raider.state === 'gone' || raider.health <= 0) continue;
    result.push({ kind: 'raider', x: raider.x + .5, y: raider.y + 1, seed: raider.id,
      pose: ['approaching', 'retreating'].includes(raider.state) ? 'walk' : 'idle', facing: raider.state === 'retreating' ? -1 : 1 });
  }
  const state = sim.m5?.poi;
  for (const poi of state?.items ?? []) {
    // Sonar discovery is deliberately insufficient to reveal life in a cavity.
    if (!poi.explored || !poi.discovered) continue;
    const floor = floorCells(sim, poi);
    if (!floor.length) continue;
    const encounter = (state.encounters ?? []).find(e => e.id === poi.encounterId);
    if (encounter?.choiceIndex === null) {
      for (let i = 0; i < Math.min(2, floor.length); i++) {
        const p = floor[i]; result.push({ kind: 'stranger', x: p.x + .5, y: p.y + 1, seed: p.x * 97 + p.y + i, pose: 'idle' });
      }
    }
    const record = (state.animals ?? []).find(a => a.poiId === poi.id);
    const kinds = record?.animals ?? poi.animals ?? (poi.bats ? Array(poi.bats.count).fill('bat') : []);
    for (let i = 0; i < kinds.length; i++) {
      if (!animals.has(kinds[i])) continue;
      const p = floor[i % floor.length], flying = kinds[i] === 'bat';
      const bob = flying ? .12 * Math.sin(time * 2.1 + i * 1.73) : 0;
      result.push({ kind: kinds[i], x: p.x + .32 + (i % 2) * .3,
        y: flying ? Math.max(poi.y + .7, p.y - .25 - (i % 3) * .42 + bob) : p.y + 1,
        seed: p.x * 97 + p.y + i, pose: 'idle', facing: i % 2 ? -1 : 1 });
    }
  }
  // Announced arrivals wait by the hatch until the scheduled consequence moves
  // them into sim.colonists; the scheduled item is then removed by the engine.
  const hatch = sim.surface?.hatch;
  if (hatch) for (const pending of sim.m5?.dilemmas?.scheduled ?? []) {
    for (const [i, person] of (pending.effects?.arrivals ?? []).entries()) result.push({
      kind: person.age < 18 ? 'strangerChild' : 'stranger', x: hatch.x + 2 + i * .85,
      y: WORLD.SURFACE_Y, seed: identitySeed(pending.dilemmaId) * 31 + i, pose: 'idle', facing: -1,
    });
  }
  return result;
}

export function drawM5World(ctx, game, view) {
  const sim = game.sim;
  if (!sim.m5) return;
  const previous = frames.get(game);
  const first = previous?.sim !== sim;
  frames.set(game, { sim, first, startTick: first ? sim.tick : previous.startTick,
    previousTick: first ? sim.tick : previous.tick, tick: sim.tick });
  const time = game.options?.reduceMotion ? 0 : game.renderTime ?? view.now ?? 0, cell = view.cellSize;
  ctx.save();
  drawThawWalls(ctx, game, view);
  drawPocketSeeps(ctx, game, view);
  for (const actor of m5Actors(sim, time)) {
    if (!visible(sim, view, actor.x, actor.y - .2)) continue;
    drawColonist(ctx, view.sx(actor.x), view.sy(actor.y), cell, { ...actor, t: time });
  }
  for (const find of sim.m5.poi?.finds ?? []) {
    if (!visible(sim, view, find.x, find.y)) continue;
    const age = transientAge(game, find, 10);
    if (age >= 10) continue;
    ctx.save(); ctx.globalAlpha *= clamp((10 - age) / 2);
    const lift = game.options?.reduceMotion ? .35 : (1 - clamp(age / 3)) * .65 + Math.sin(Math.min(age, 1.2) / 1.2 * Math.PI) * .35;
    // Lift the object clear of the room's stress label. The fine tether keeps
    // its true origin legible without adding text or moving the excavation.
    const x = view.sx(find.x + .5), y = view.sy(find.y - .6 - lift);
    const originY = view.sy(find.y + .5);
    ctx.save(); ctx.globalAlpha *= .72;
    ctx.strokeStyle = '#dbc79d'; ctx.lineWidth = Math.max(.9, cell * .025);
    ctx.setLineDash([Math.max(2, cell * .08), Math.max(2, cell * .075)]);
    ctx.beginPath(); ctx.moveTo(x, y + cell * .10); ctx.lineTo(x, originY); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); ctx.arc(x, originY, Math.max(1.3, cell * .06), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    drawFind(ctx, find.kind, x, y, cell * 1.15, { t: game.options?.reduceMotion ? 0 : age });
    ctx.restore();
  }
  for (const scan of sim.m5.poi?.scans ?? []) {
    if (!visible(sim, view, scan.x, scan.y)) continue;
    const age = transientAge(game, scan, 4);
    if (age >= 4) continue;
    drawRadioWaves(ctx, view.sx(scan.x + .5), view.sy(scan.y + .5), cell,
      { t: game.options?.reduceMotion ? 1 : age, strength: clamp((4 - age) / 2) });
    // The outward ring is an instrument pulse, not a reveal of terrain or POI.
    const radius = (game.options?.reduceMotion ? scan.radius : Math.min(scan.radius, age / 4 * scan.radius)) * cell;
    ctx.save(); ctx.globalAlpha *= (1 - age / 4) * .42;
    ctx.strokeStyle = '#b8ded0'; ctx.lineWidth = Math.max(1, cell * .035);
    ctx.beginPath(); ctx.arc(view.sx(scan.x + .5), view.sy(scan.y + .5), Math.max(0, radius), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  drawFireAndGas(ctx, game, view);
  ctx.restore();
}

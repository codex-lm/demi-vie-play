import { STRUCTURE, TIME } from '../data/balance.js';
import { digWaitingAccess } from '../sim/jobs.js';
import { excavationReachable } from '../sim/nav.js';
import { cascadeRisk } from '../sim/structure.js';

// Renderer-owned only: no flags, memoization fields or events on the simulation.
const caches = new WeakMap();
const active = room => room.state !== 'collapsed';
const finished = room => room.state === 'dug' || room.state === 'fitted';

function unchanged(rooms, saved) {
  if (rooms.length !== saved.length) return false;
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i], old = saved[i];
    if (old.room !== room || old.state !== room.state || old.stress !== room.stress
      || old.lining !== room.lining || old.roomType !== room.roomType || old.supports !== room.supports?.length
      || old.dug !== room.dugCells?.length || old.powered !== room.powered
      || old.shed !== room.powerShed || old.disabled !== room.disabled) return false;
  }
  return true;
}

function shaftsUnchanged(shafts) {
  // toggleRoom can switch an elevator off while paused without touching the
  // terrain or emitting an event. Only shafts affect the navigation topology.
  for (const old of shafts) {
    const room = old.room;
    if (old.state !== room.state || old.roomType !== room.roomType || old.dug !== room.dugCells?.length
      || old.powered !== room.powered || old.shed !== room.powerShed || old.disabled !== room.disabled) return false;
  }
  return true;
}

/** Heavy queries at most once per game hour, unless the structure changes.
 * All potential cascade roots are cached, so changing selection never repeats
 * cascadeRisk. Same-tick frames only compare navigation shafts, allocating nothing.
 */
export function hazardSnapshot(game) {
  const sim = game.sim, rooms = sim.excavations ?? [];
  const hour = Math.floor(sim.tick / TIME.TICKS_PER_HOUR);
  let cache = caches.get(sim);
  const lastEvent = sim.events?.at(-1), lastJournal = sim.journal?.at(-1);
  if (cache && cache.world === sim.world && cache.revision === sim.world.revision
    && cache.hour === hour && cache.rooms.length === rooms.length && sim.tick >= cache.tick) {
    if (cache.tick === sim.tick && cache.lastEvent === lastEvent && cache.lastJournal === lastJournal
      && shaftsUnchanged(cache.shafts)) return cache;
    if (unchanged(rooms, cache.rooms)) {
      cache.tick = sim.tick; cache.lastEvent = lastEvent; cache.lastJournal = lastJournal;
      return cache;
    }
  }
  const waiting = [], unreachable = [], cascades = [];
  for (const room of rooms) {
    if (!active(room)) continue;
    if (digWaitingAccess(sim, room)) waiting.push(room);
    if (finished(room) && !excavationReachable(sim, room)) unreachable.push(room);
    if (room.integrity < STRUCTURE.DANGER_INTEGRITY || room.stress?.ratio > STRUCTURE.FAILURE_RATIO) {
      const victims = cascadeRisk(sim, room);
      if (victims.length) cascades.push({ source: room, victims });
    }
  }
  cache = { world: sim.world, revision: sim.world.revision, hour, tick: sim.tick,
    lastEvent, lastJournal, generation: (cache?.generation ?? 0) + 1,
    rooms: rooms.map(room => ({ room, state: room.state, stress: room.stress,
      lining: room.lining, roomType: room.roomType, supports: room.supports?.length, dug: room.dugCells?.length,
      powered: room.powered, shed: room.powerShed, disabled: room.disabled })),
    waiting, unreachable, cascades };
  cache.shafts = cache.rooms.filter(old => old.room.kind === 'shaft');
  caches.set(sim, cache);
  return cache;
}

function rect(view, room) {
  const x = view.sx(room.x), y = view.sy(room.y), w = room.w * view.cellSize, h = room.h * view.cellSize;
  return x + w < 0 || x > view.width || y + h < 0 || y > view.height ? null : { x, y, w, h };
}

function badge(ctx, x, y, radius, color, kind) {
  ctx.save(); ctx.translate(x, y); ctx.scale(radius, radius);
  ctx.fillStyle = '#131c22'; ctx.strokeStyle = color; ctx.lineWidth = .095;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'pick') {
    ctx.strokeStyle = '#f3e5c8'; ctx.lineWidth = .13;
    ctx.beginPath(); ctx.moveTo(-.36, .48); ctx.lineTo(.27, -.4);
    ctx.moveTo(-.42, -.38); ctx.quadraticCurveTo(.17, -.73, .54, -.04); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = .17;
    ctx.beginPath(); ctx.moveTo(-.68, .67); ctx.lineTo(.65, -.68); ctx.stroke();
  } else {
    // The step and the interrupted ladder are a different silhouette from the
    // crossed pick: the excavation is complete, but feet cannot reach its floor.
    ctx.strokeStyle = '#e6eff1'; ctx.lineWidth = .12;
    ctx.beginPath(); ctx.moveTo(-.72, -.12); ctx.lineTo(-.12, -.12);
    ctx.lineTo(-.12, .55); ctx.lineTo(.7, .55); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = .1;
    ctx.setLineDash([.14, .12]);
    ctx.beginPath(); ctx.moveTo(.22, -.6); ctx.lineTo(.22, .34);
    ctx.moveTo(.55, -.6); ctx.lineTo(.55, .34); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(.23, -.42); ctx.lineTo(.54, -.42);
    ctx.moveTo(.23, .2); ctx.lineTo(.54, .2); ctx.stroke();
  }
  ctx.restore();
}

function drawAccess(ctx, view, room, walking) {
  const r = rect(view, room); if (!r) return;
  const color = walking ? '#a4dbe7' : '#f3c26a';
  const radius = Math.max(12, Math.min(20, view.cellSize * .65));
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2;
  if (!walking) {
    ctx.setLineDash([7, 5]); ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  } else {
    // Broken floor-level route. The gap points at the missing vertical link.
    ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h - 2); ctx.lineTo(r.x + r.w * .36, r.y + r.h - 2);
    ctx.moveTo(r.x + r.w * .64, r.y + r.h - 2); ctx.lineTo(r.x + r.w, r.y + r.h - 2); ctx.stroke();
  }
  ctx.restore();
  badge(ctx, r.x + r.w / 2, r.y + r.h / 2, radius, color, walking ? 'step' : 'pick');
}

function hatch(ctx, view, room, origin = false) {
  const r = rect(view, room); if (!r) return;
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.fillStyle = origin ? 'rgba(235,75,54,.13)' : 'rgba(235,120,74,.09)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = origin ? 'rgba(255,124,96,.65)' : 'rgba(255,172,112,.48)'; ctx.lineWidth = 1.5;
  const spacing = Math.max(10, view.cellSize * .6);
  ctx.beginPath();
  for (let x = r.x - r.h; x < r.x + r.w; x += spacing) { ctx.moveTo(x, r.y + r.h); ctx.lineTo(x + r.h, r.y); }
  ctx.stroke(); ctx.restore();
  ctx.save(); ctx.strokeStyle = '#ff9976'; ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.restore();
}

function drawChain(ctx, view, chain) {
  if (![chain.source, ...chain.victims].some(room => rect(view, room))) return;
  hatch(ctx, view, chain.source, true);
  // A common rail denotes membership in the same collapse, not an invented
  // parent/child relation (cascadeRisk exposes the whole affected set).
  const rail = view.sx(Math.min(chain.source.x, ...chain.victims.map(r => r.x))) - Math.max(9, view.cellSize * .5);
  const bottom = view.sy(chain.source.y + chain.source.h / 2);
  const top = Math.min(...chain.victims.map(r => view.sy(r.y + r.h / 2)));
  ctx.save(); ctx.strokeStyle = '#182025'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(rail, top); ctx.lineTo(rail, bottom); ctx.stroke();
  ctx.strokeStyle = '#ff9976'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rail, top); ctx.lineTo(rail, bottom);
  for (const room of [chain.source, ...chain.victims]) {
    const y = view.sy(room.y + room.h / 2), x = view.sx(room.x);
    ctx.moveTo(rail, y); ctx.lineTo(x - 2, y);
  }
  ctx.moveTo(rail - 5, bottom - 8); ctx.lineTo(rail, bottom); ctx.lineTo(rail + 5, bottom - 8);
  ctx.stroke(); ctx.restore();
  for (const room of chain.victims) hatch(ctx, view, room);
}

export function drawHazards(ctx, game, view) {
  const state = hazardSnapshot(game);
  // Empty caches cause no canvas operations, paths, sprites or animation work.
  for (const chain of state.cascades) {
    if (chain.source.integrity < STRUCTURE.DANGER_INTEGRITY
      || (game.selection?.type === 'excavation' && game.selection.id === chain.source.id
        && chain.source.stress?.ratio > STRUCTURE.FAILURE_RATIO)) drawChain(ctx, view, chain);
  }
  for (const room of state.waiting) drawAccess(ctx, view, room, false);
  for (const room of state.unreachable) drawAccess(ctx, view, room, true);
}

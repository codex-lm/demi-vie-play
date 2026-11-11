import { TIME } from '../data/balance.js';
import { SUPPORT_PROPS } from '../data/linings.js';
import { tr } from '../data/strings.fr.js';
import { suggestSupport, supportReplaceable } from '../sim/structure.js';
import { colorblindEnabled, CIVIDIS } from './overlayPalette.js';
import { drawSupport } from './supports.js';

const caches = new WeakMap();
const COLORS = { green: '#8ce2aa', yellow: '#f3c66e', red: '#ff8a70', neutral: '#e5dfc9' };
function costLabel(material) {
  return Object.entries(SUPPORT_PROPS[material].cost)
    .map(([resource, amount]) => `${amount} ${tr(resource).toLocaleLowerCase('fr')}`).join(' · ');
}

function targetRoom(game) {
  const id = game.tool?.type === 'support' && game.tool.excavationId != null
    ? game.tool.excavationId : game.selection?.type === 'excavation' ? game.selection.id : null;
  return id == null ? null : game.sim.excavation(id);
}

function activeRoom(room) {
  return room && (room.state === 'dug' || room.state === 'fitted');
}

function cacheFor(sim) {
  let cache = caches.get(sim);
  if (!cache || sim.tick < cache.tick) {
    cache = { rooms: new Map(), tick: sim.tick, stampHour: -1 };
    caches.set(sim, cache);
  }
  cache.tick = sim.tick;
  return cache;
}

// Terrain carries a revision, while paused orders can replace a neighbouring
// hall without touching terrain. Inspect the small structural list only on a
// hour/event transition, then compare its value rather than the journal entry:
// unrelated weather/needs messages must not run suggestSupport again.
function structureStamp(sim, cache) {
  const journal = sim.journal?.at(-1);
  const hour = Math.floor(sim.tick / TIME.TICKS_PER_HOUR);
  if (cache.stampHour === hour && cache.journal === journal
    && cache.revision === sim.world.revision && cache.dirty === sim.structureDirty
    && cache.roomCount === sim.excavations.length) return cache.stamp;
  cache.stampHour = hour;
  cache.journal = journal;
  cache.revision = sim.world.revision;
  cache.dirty = sim.structureDirty;
  cache.roomCount = sim.excavations.length;
  cache.stamp = JSON.stringify([sim.world.revision, sim.excavations.map(room => [
    room.id, room.kind, room.state, room.x, room.y, room.w, room.h, room.shape,
    room.lining, room.coating, room.dugCells?.length ?? 0,
    (room.supports ?? []).map(prop => typeof prop === 'number' ? prop
      : [prop.x, prop.material, Boolean(prop.failed), prop.solidity === 0, supportReplaceable(prop)]),
  ])]);
  return cache.stamp;
}

function ghost(room, x, color, ratio, material = 'wood') {
  return { x, y: room.y, w: 1, h: room.h, roomX: room.x, roomWidth: room.w,
    shape: room.shape ?? 'flat', color, ratio, material };
}

/** Pure display model. One costly advice query per room/hour or structural
 * change, even if the player alternates between selections in the same hour.
 * Null/green selections and the ordinary world have no structural scan.
 */
export function supportAdviceModel(game) {
  const room = targetRoom(game);
  if (!activeRoom(room) || !['room', 'quarry'].includes(room.kind)) return null;
  const sim = game.sim;
  if (room.stress?.color === 'green') {
    const cache = caches.get(sim);
    if (cache?.rooms.has(room.id)) cache.rooms.delete(room.id);
    return null;
  }
  const cache = cacheFor(sim), hour = Math.floor(sim.tick / TIME.TICKS_PER_HOUR);
  const stamp = structureStamp(sim, cache);
  const previous = cache.rooms.get(room.id);
  if (previous?.hour === hour && previous.stamp === stamp
    && previous.ratio === room.stress?.ratio) return previous.model;
  const advice = suggestSupport(sim, room);
  const material = advice?.wet ? 'metal' : 'wood';
  const model = advice?.helps ? { ...ghost(room, advice.x, advice.color, advice.ratio, material),
    excavationId: room.id, helps: true, offset: advice.offset, costLabel: costLabel(material),
    wet: Boolean(advice.wet), replaces: Boolean(advice.replaces),
    revision: sim.world.revision, hour } : null;
  cache.rooms.set(room.id, { hour, stamp, ratio: room.stress?.ratio, model });
  return model;
}

/** Last calculated model only; audio can observe an actually shown suggestion
 * without calling a simulation query or changing the renderer's cache.
 */
export function cachedSupportAdvice(game, excavationId) {
  const id = excavationId ?? (game.tool?.type === 'support' ? game.tool.excavationId : null)
    ?? (game.selection?.type === 'excavation' ? game.selection.id : null);
  return caches.get(game.sim)?.rooms.get(id)?.model ?? null;
}

/** InputController owns the prospect calculation; rendering just reads it. */
export function previewSupportModel(game) {
  if (game.tool?.type !== 'dig' || !game.drag || game.tool.kind !== 'room') return null;
  const preview = game.currentPreview, support = preview?.withSupport;
  if (!support || preview.ok === false || !['yellow', 'red'].includes(preview.color)) return null;
  const room = preview.order ?? { ...game.tool, ...game.drag };
  if (![room.x, room.y, room.w, room.h, support.x].every(Number.isFinite)
    || room.w <= 0 || room.h <= 0 || support.x < room.x || support.x >= room.x + room.w) return null;
  return ghost(room, support.x, support.color, support.ratio);
}

/** The ordinary hovered column is deliberately neutral: only the exact
 * recommended column promises the improvement measured on the real cavity.
 * A rectangular prospect would not reproduce a room opening into a cave.
 */
export function hoverSupportModel(game, advice = undefined) {
  if (game.tool?.type !== 'support' || !game.hover) return null;
  const room = targetRoom(game), { x, y } = game.hover;
  if (!room || room.state === 'collapsed' || !Number.isInteger(x) || !Number.isInteger(y)
    || x < room.x || x >= room.x + room.w || y < room.y || y >= room.y + room.h) return null;
  const existing = (room.supports ?? []).find(prop => (typeof prop === 'number' ? prop : prop.x) === x);
  if ((existing != null && !supportReplaceable(existing))
    || game.sim.jobs?.some(job => job.type === 'support' && job.excavationId === room.id && job.x === x && job.status !== 'done')) return null;
  const recommended = advice === undefined ? supportAdviceModel(game) : advice;
  const exact = recommended?.x === x;
  const material = SUPPORT_PROPS[game.tool.material] ? game.tool.material : 'wood';
  return { ...ghost(room, x, exact ? recommended.color : 'neutral', exact ? recommended.ratio : null, material),
    excavationId: room.id, hovered: true, replaces: existing != null };
}

function inkFor(game, color) {
  return colorblindEnabled(game) && color !== 'neutral'
    ? CIVIDIS[{ green: 0, yellow: 2, red: 3 }[color]] : COLORS[color] ?? COLORS.neutral;
}

function drawGhost(ctx, game, view, model, pulse = false, label = false) {
  const cell = view.cellSize, x = view.sx(model.x + .5);
  const top = view.sy(model.y), floor = view.sy(model.y + model.h) - cell * .16;
  const fraction = (model.x - model.roomX + .5) / model.roomWidth;
  const height = model.h * cell;
  const roof = top + (model.shape === 'round' ? height / 2 * (1 - Math.sqrt(Math.max(0, 1 - (fraction * 2 - 1) ** 2)))
    : model.shape === 'vault' ? height * .3 * (fraction * 2 - 1) ** 2 : 0) + cell * .12;
  if (x + cell < 0 || x - cell > view.width || floor + 28 < 0 || roof - 18 > view.height) return;
  const ink = inkFor(game, model.color);
  const wave = pulse && !game.options?.reduceMotion ? .5 + .5 * Math.sin((view.now ?? 0) * Math.PI) : .5;
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // A faint one-cell shaft shows exactly which floor square receives the prop.
  ctx.fillStyle = ink; ctx.globalAlpha = .1 + (pulse ? wave * .08 : 0);
  ctx.fillRect(x - cell * .46, roof, cell * .92, Math.max(1, floor - roof));
  // The same geometry as the built material, translucent over any broken prop.
  // Keep the leaning fragments visible on either side of the replacement.
  ctx.globalAlpha = (model.replaces ? .47 : .64) + wave * .13;
  drawSupport(ctx, { x, roof, floor, cell }, { material: model.material, solidity: 100 });
  ctx.strokeStyle = ink;
  // Dashed footing separates the suggestion from an already built prop.
  ctx.globalAlpha = .85; ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(x - cell * .46, floor - cell * .15, cell * .92, cell * .3);
  ctx.setLineDash([]);
  // A small check / dash / cross makes the promise legible without color.
  const r = Math.max(5, cell * .18), cy = roof + Math.min(cell * .85, (floor - roof) * .4);
  if (model.color !== 'neutral') {
    ctx.globalAlpha = .94; ctx.fillStyle = '#122026';
    ctx.beginPath(); ctx.arc(x, cy, r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath();
    if (model.color === 'green') {
      ctx.moveTo(x - r * .6, cy); ctx.lineTo(x - r * .1, cy + r * .5); ctx.lineTo(x + r * .65, cy - r * .55);
    } else if (model.color === 'yellow') {
      ctx.moveTo(x - r * .6, cy); ctx.lineTo(x + r * .6, cy);
    } else {
      ctx.moveTo(x - r * .5, cy - r * .5); ctx.lineTo(x + r * .5, cy + r * .5);
      ctx.moveTo(x + r * .5, cy - r * .5); ctx.lineTo(x - r * .5, cy + r * .5);
    }
    ctx.stroke();
  }
  if (label && model.costLabel) {
    const fontSize = Math.max(11, Math.min(14, cell * .5));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const width = ctx.measureText(model.costLabel).width + 14, cy = floor + fontSize * .9 + 8;
    ctx.globalAlpha = .94; ctx.fillStyle = '#142026';
    ctx.fillRect(x - width / 2, cy - fontSize * .7, width, fontSize * 1.4);
    ctx.globalAlpha = 1; ctx.fillStyle = '#f1ead6'; ctx.fillText(model.costLabel, x, cy);
  }
  ctx.restore();
}

export function drawSupportAdvice(ctx, game, view) {
  if (game.tool?.type === 'dig') {
    const preview = previewSupportModel(game);
    if (preview) drawGhost(ctx, game, view, preview);
    return;
  }
  if (game.selection?.type !== 'excavation' && game.tool?.type !== 'support') return;
  const advice = supportAdviceModel(game);
  const hover = hoverSupportModel(game, advice);
  // An explicit tool choice owns the placement preview. A metal recommendation
  // must not promise metal under the cursor while input would actually place
  // wood (or concrete). The recommendation returns when the cursor leaves.
  const chosenAtAdvice = hover && hover.x === advice?.x && hover.material !== advice.material;
  if (advice && !chosenAtAdvice) {
    drawGhost(ctx, game, view, advice, game.tool?.type === 'support', true);
    game.audio?.observeSupportAdvice?.(game);
  }
  if (chosenAtAdvice) drawGhost(ctx, game, view, { ...hover, costLabel: costLabel(hover.material) }, true, true);
  else if (hover && hover.x !== advice?.x) drawGhost(ctx, game, view, hover);
}

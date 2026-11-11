import { WORLD } from '../data/balance.js';

const selectedCache = new WeakMap();

/** A shaft must own an excavated surface cell; a path via another shaft is
 * deliberately irrelevant. The preview describes the drawn shaft's extent. */
export function shaftSkyModel(game) {
  if (game.tool?.type === 'dig' && game.tool.kind === 'shaft' && game.drag) {
    if (game.currentPreview?.ok === false) return null;
    const order = game.currentPreview?.order ?? game.drag;
    let { x, y, w, h } = order;
    if (![x, y, w, h].every(Number.isInteger) || !w || !h) return null;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    return { x, y, w, h, sky: y <= WORLD.SURFACE_Y && y + h > WORLD.SURFACE_Y, preview: true };
  }
  if (game.selection?.type !== 'excavation') return null;
  const sim = game.sim, room = sim.excavation(game.selection.id);
  if (room?.kind !== 'shaft' || !['dug', 'fitted'].includes(room.state)) return null;
  const cached = selectedCache.get(room);
  if (cached?.cells === room.dugCells && cached.count === (room.dugCells?.length ?? 0)
      && cached.revision === sim.world.revision) return cached.model;
  const sky = (room.dugCells ?? []).some(index => sim.world.coords(index).y === WORLD.SURFACE_Y);
  const model = { x: room.x, y: room.y, w: room.w, h: room.h, sky, preview: false };
  selectedCache.set(room, { cells: room.dugCells, count: room.dugCells?.length ?? 0, revision: sim.world.revision, model });
  return model;
}

export function drawShaftSky(ctx, game, view) {
  if (!(game.tool?.type === 'dig' && game.tool.kind === 'shaft' && game.drag)
      && game.selection?.type !== 'excavation') return;
  const model = shaftSkyModel(game);
  if (!model) return;
  const cell = view.cellSize, top = view.sy(model.y), right = view.sx(model.x + model.w);
  const radius = Math.max(10, Math.min(15, cell * .48));
  // Beside the mouth, below the numerical prospect badge. The short leader
  // makes the badge belong to this shaft even when neighbouring shafts touch.
  const cx = right + radius + 7, cy = top + radius + 3;
  if (cx + radius < 0 || cx - radius > view.width || cy + radius < 0 || top > view.height) return;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2;
  ctx.strokeStyle = '#e5dec6';
  ctx.beginPath(); ctx.moveTo(view.sx(model.x + model.w / 2), top + 1);
  ctx.lineTo(right + 4, top + 1); ctx.lineTo(cx - radius * .7, cy - radius * .7); ctx.stroke();
  ctx.fillStyle = '#101b20';
  ctx.beginPath(); ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = model.sky ? '#78c8e3' : '#70665a'; ctx.fill();
  ctx.strokeStyle = model.sky ? '#d9f6ff' : '#d0bfa2'; ctx.stroke();
  ctx.save(); ctx.clip();
  if (model.sky) {
    // Cloud and sun retain their meaning without relying on a green/red pair.
    ctx.fillStyle = '#fff0bc';
    ctx.beginPath(); ctx.arc(cx + radius * .35, cy - radius * .35, radius * .22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#effcff'; ctx.lineWidth = Math.max(3, radius * .28);
    ctx.beginPath(); ctx.moveTo(cx - radius * .65, cy + radius * .32);
    ctx.lineTo(cx + radius * .23, cy + radius * .32); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - radius * .22, cy + radius * .24, radius * .22, Math.PI, Math.PI * 2); ctx.stroke();
  } else {
    // Solid stone plug and seams, with no misleading ventilation arrow.
    ctx.strokeStyle = '#b6a38a'; ctx.lineWidth = 1.5;
    for (const offset of [-.5, .12, .7]) {
      ctx.beginPath(); ctx.moveTo(cx - radius, cy + radius * offset);
      ctx.lineTo(cx + radius, cy + radius * (offset - .25)); ctx.stroke();
    }
    ctx.strokeStyle = '#efe2c7'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - radius * .62, cy + radius * .5);
    ctx.lineTo(cx + radius * .62, cy - radius * .5); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

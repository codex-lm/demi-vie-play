import { EXCAVATION, STRUCTURE } from '../data/balance.js';
import { MATERIAL_BY_KEY } from '../data/materials.js';
import { doorWallRisk } from '../sim/structure.js';
import { colorblindEnabled, CIVIDIS } from './overlayPalette.js';

const doorCaches = new WeakMap();
const COLORS = { green: '#8ce2aa', yellow: '#f3c66e', red: '#ff8a70', neutral: '#b4b7ad' };

/** Read-only counterpart of InputController's target and planDoor's placement.
 * A pointer outside the two floor-level wall cells is never a green door.
 * The private cache contains display data only; no property is added to Sim.
 */
export function doorPreviewModel(game) {
  if (game.tool?.type !== 'door' || !game.hover) return null;
  const sim = game.sim, { x, y } = game.hover;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const id = game.tool.excavationId ?? (game.selection?.type === 'excavation' ? game.selection.id : null);
  const room = sim.excavation(id);
  const key = `${sim.world.revision}/${sim.excavations.length}/${id}/${room?.state}/${room?.x}/${room?.y}/${room?.w}/${room?.h}/${x}/${y}`;
  const cached = doorCaches.get(sim);
  // Cancel + re-plan can replace a neighbouring hall during pause without
  // changing either the solid terrain revision or the excavation count.
  const lastJournal = sim.journal?.at(-1);
  if (cached?.key === key && cached.lastJournal === lastJournal) return cached.model;
  const model = { x, y, w: 1, h: 1, level: 'neutral', risk: null, excavationId: id };
  if (room && room.state !== 'collapsed') {
    const doorY = room.y + room.h - EXCAVATION.DOOR_HEIGHT;
    const onSide = x === room.x - 1 || x === room.x + room.w;
    if (onSide && y >= doorY && y < room.y + room.h) {
      model.y = doorY;
      model.w = EXCAVATION.DOOR_WIDTH;
      model.h = EXCAVATION.DOOR_HEIGHT;
      let solidWall = true;
      for (let yy = doorY; yy < doorY + EXCAVATION.DOOR_HEIGHT; yy++) {
        if (!sim.world.isDiggable(x, yy) || !sim.world.isSolid(x, yy)) solidWall = false;
      }
      if (solidWall) {
        model.risk = doorWallRisk(sim, room, x, doorY, EXCAVATION.DOOR_HEIGHT);
        model.level = model.risk ? 'red' : 'green';
      }
    }
  }
  doorCaches.set(sim, { key, lastJournal, model });
  return model;
}

/** Reuse the prospect already computed by the input controller, without a
 * second structure evaluation in the animation loop. Geometry stays the
 * rectangular roof row used by evaluateProspect, even for a round silhouette.
 */
export function roofPreviewModel(game) {
  if (game.tool?.type !== 'dig' || !game.drag || game.tool.kind === 'shaft') return null;
  const stress = game.currentPreview?.stress ?? game.currentPreview?.evaluation ?? game.currentPreview;
  if (stress?.ok !== true) return null;
  let { x, y, w, h } = game.drag;
  if (![x, y, w, h].every(Number.isFinite) || w === 0 || h === 0) return null;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  const material = MATERIAL_BY_KEY[stress.material];
  if (!material) return null;
  const weak = material.span <= MATERIAL_BY_KEY.clay.span;
  // A strong lining can make a sandy roof viable. Keep its grains, but reserve
  // the red fracture for the actual ceiling ratio, not an unrelated side wall.
  const ratio = stress.spanRatio ?? stress.ratio;
  const level = ratio > STRUCTURE.FAILURE_RATIO ? 'red'
    : weak || ratio > STRUCTURE.STABLE_RATIO ? 'yellow' : 'green';
  return { x, y: y - 1, w, h: 1, roomHeight: h, material: material.key, weak, level, ratio };
}

function color(game, level) {
  return colorblindEnabled(game) && level !== 'neutral'
    ? CIVIDIS[{ green: 0, yellow: 2, red: 3 }[level]] : COLORS[level];
}

function drawDoor(ctx, game, view, model) {
  const cell = view.cellSize, x = view.sx(model.x), y = view.sy(model.y);
  const w = cell * model.w, h = cell * model.h;
  if (x + w < 0 || x > view.width || y + h < 0 || y > view.height) return;
  const ink = color(game, model.level), line = Math.max(2, cell * .075);
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = '#111a1f';
  ctx.globalAlpha = .85;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ink;
  ctx.lineWidth = line;
  if (model.level === 'neutral') {
    ctx.setLineDash([Math.max(3, cell * .2), Math.max(3, cell * .2)]);
    ctx.strokeRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2));
  } else {
    ctx.fillStyle = ink;
    ctx.globalAlpha = .22;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    // A real door jamb, including its threshold, stands out from selection.
    ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line);
    ctx.beginPath();
    if (model.level === 'green') {
      ctx.moveTo(x + w * .22, y + h * .49);
      ctx.lineTo(x + w * .43, y + h * .61);
      ctx.lineTo(x + w * .79, y + h * .35);
    } else {
      // Broken masonry reaches into both rooms, exposing the wall's role.
      ctx.moveTo(x - cell * .55, y - cell * .36);
      ctx.lineTo(x + w * .26, y + h * .21);
      ctx.lineTo(x + w * .06, y + h * .42);
      ctx.lineTo(x + w * .67, y + h * .59);
      ctx.lineTo(x + w * .48, y + h * .78);
      ctx.lineTo(x + w + cell * .4, y + h + cell * .24);
      ctx.moveTo(x + w * .06, y + h * .42);
      ctx.lineTo(x - cell * .34, y + h * .5);
      ctx.moveTo(x + w * .67, y + h * .59);
      ctx.lineTo(x + w + cell * .45, y + h * .4);
    }
    ctx.stroke();
    if (model.level === 'red') {
      const r = Math.max(7, cell * .3), cx = x + w / 2, cy = y - r - 5;
      ctx.fillStyle = '#251618'; ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - r * .5, cy - r * .5); ctx.lineTo(cx + r * .5, cy + r * .5);
      ctx.moveTo(cx + r * .5, cy - r * .5); ctx.lineTo(cx - r * .5, cy + r * .5); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRoof(ctx, game, view, model) {
  const cell = view.cellSize, x = view.sx(model.x), y = view.sy(model.y), w = model.w * cell;
  if (x + w < 0 || x > view.width || y + cell * 2 < 0 || y > view.height) return;
  const ink = color(game, model.level), base = y + cell;
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = .76;
  ctx.fillStyle = '#11191c'; ctx.fillRect(x - 2, y - 1, w + 4, cell + 3);
  ctx.globalAlpha = model.level === 'red' ? .72 : .38;
  ctx.fillStyle = ink; ctx.fillRect(x, y, w, cell);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, cell * .09);
  ctx.strokeRect(x, y, w, cell);
  for (let n = 0; n < model.w; n++) {
    const cx = x + (n + .5) * cell;
    ctx.lineWidth = Math.max(1, cell * .045);
    ctx.globalAlpha = .8;
    ctx.beginPath(); ctx.moveTo(x + n * cell, y + 2); ctx.lineTo(x + n * cell, base - 2); ctx.stroke();
    if (model.level === 'red') {
      ctx.globalAlpha = 1; ctx.lineWidth = Math.max(1.5, cell * .07);
      ctx.beginPath(); ctx.moveTo(cx - cell * .2, y + cell * .1);
      ctx.lineTo(cx + cell * .08, y + cell * .35); ctx.lineTo(cx - cell * .07, y + cell * .57);
      ctx.lineTo(cx + cell * .18, base - cell * .06); ctx.stroke();
    }
    if (model.weak) {
      // Screen-space time affects grains only. Reduced motion keeps a legible
      // static spill; no random state or simulation tick is consumed.
      const time = game.options?.reduceMotion ? 0 : view.now ?? 0;
      for (let grain = 0; grain < 2; grain++) {
        const phase = (time * .85 + n * .29 + grain * .43) % 1;
        const gx = cx + (grain ? .23 : -.22) * cell;
        const gy = base + cell * (.12 + phase * .75);
        ctx.globalAlpha = .95 - phase * .5;
        ctx.fillStyle = ink;
        const size = Math.max(2, cell * .085);
        ctx.fillRect(gx, gy, size, size);
      }
    }
  }
  ctx.restore();
}

export function drawDangerPreview(ctx, game, view) {
  // No model lookup, terrain scan, allocation or Canvas call without a tool.
  if (game.tool?.type === 'door') {
    const model = doorPreviewModel(game);
    if (model) drawDoor(ctx, game, view, model);
  } else if (game.tool?.type === 'dig' && game.drag) {
    const model = roofPreviewModel(game);
    if (model) drawRoof(ctx, game, view, model);
  }
}

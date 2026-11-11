import { COLONIST_ACTIONS } from '../../art/m6/actions.js';
import { drawGeologistSurvey } from '../../art/m6/geologist.js';
import { drawOssuary, drawSchool } from '../../art/m6/furniture.js';
import { colonistAppearance } from './portraits.js';
import { colorblindEnabled } from './overlayPalette.js';

const actions = new Set(COLONIST_ACTIONS);
const inside = (person, room) => room && person.x >= room.x && person.x < room.x + room.w
  && person.y >= room.y && person.y < room.y + room.h;

/** An animation follows an active task, never a morale score or an assumed visit. */
export function colonistM6Action(sim, person) {
  if (!(person.health > 0) || person.dead) return null;
  const activity = person.activity?.phase === 'active' ? person.activity : null;
  const explicit = actions.has(person.task) ? person.task : activity?.type;
  if (actions.has(explicit)) {
    // One simulation tick can finish the ascent and already walk on the surface.
    // Its activity still records the earlier upward motion; paint the final walk.
    if (explicit === 'climbingOut' && person.task === 'walk') return null;
    if (explicit === 'carryingChild') {
      const childId = activity?.childId ?? person.carriedChildId;
      const child = sim.colonists?.find(candidate => candidate.id === childId && candidate.health > 0 && !candidate.dead);
      return child ? { action: explicit, child } : null;
    }
    return { action: explicit };
  }
  if (person.task === 'study' && person.personal?.type === 'study' && person.personal.phase === 'studying') {
    const school = sim.excavations?.find(room => room.id === person.personal.excavationId && room.roomType === 'school');
    if (inside(person, school)) return { action: 'reading' };
  }
  if (person.task === 'working') {
    const job = sim.jobs?.find(candidate => candidate.id === person.jobId && candidate.colonistId === person.id
      && candidate.status === 'active' && candidate.type === 'produce');
    const school = job && sim.excavations?.find(room => room.id === job.excavationId && room.roomType === 'school');
    if (school?.state === 'fitted' && !school.disabled && inside(person, school)) return { action: 'teaching' };
  }
  return null;
}

/** A relative uncertainty interval controls the drawing only, never the risk. */
export function geologistArtModel(game) {
  const preview = game.currentPreview?.stress ?? game.currentPreview?.evaluation ?? game.currentPreview;
  if (game.tool?.type !== 'dig' || !game.drag || preview?.ok !== true || !preview.geologist) return null;
  const estimate = preview.geologist;
  const person = game.sim.colonists?.find(candidate => candidate.id === estimate.id);
  if (!person) return null;
  const spread = Math.max(0, Number(estimate.max) - Number(estimate.min));
  const confidence = 1 - spread / Math.max(1, Math.abs(Number(estimate.estimate)) * 2);
  return {
    identity: colonistAppearance(game.sim, person), seed: game.sim.seed,
    risk: ['green', 'yellow', 'red'].includes(preview.color) ? preview.color : 'yellow',
    precision: estimate.expert ? 1 : Math.max(.15, Math.min(.85, Number.isFinite(confidence) ? confidence : .15)),
    colorblind: colorblindEnabled(game), t: game.options?.reduceMotion ? 0 : game.renderTime ?? 0,
  };
}

/** Paint above, rather than over, the existing numerical preview and controls. */
export function drawM6Geologist(ctx, game, view) {
  const model = geologistArtModel(game);
  if (!model) return;
  const element = globalThis.document?.querySelector?.('#preview-panel.visible');
  const bounds = element?.getBoundingClientRect?.();
  const width = Math.min(260, Math.max(160, view.width * .24));
  const height = width * 420 / 800;
  let x = Math.max(8, Math.min(view.width - width - 8, (bounds?.x ?? (view.width - width) / 2)
    + ((bounds?.width ?? width) - width) / 2));
  const bottom = bounds?.top ?? view.height - 175;
  let y = Math.max((game.camera?.screenHudHeight ?? game.camera?.hudHeight ?? 90) + 8, bottom - height - 8);
  const controls = globalThis.document?.querySelectorAll?.('#m6-notebook, #m6-notebook-reopen') ?? [];
  for (const control of controls) {
    const rect = control.getBoundingClientRect();
    if (!rect.width || !rect.height || x + width <= rect.left || x >= rect.right || y + height <= rect.top || y >= rect.bottom) continue;
    if (rect.right + width + 16 <= view.width) x = rect.right + 8;
    else if (rect.left >= width + 16) x = rect.left - width - 8;
    else y = Math.min(y, rect.top - height - 8);
  }
  if (view.width < 1000 && Number.isFinite(game.drag?.x) && Number.isFinite(game.drag?.w)) {
    const besideGhost = view.sx(game.drag.x + game.drag.w) + 12;
    if (besideGhost + width + 8 <= view.width) x = Math.max(x, besideGhost);
  }
  // Small screens keep the reasons readable: the illustration can shrink, but
  // it never covers the preview panel when the HUD leaves too little room.
  const available = Math.min(height, bottom - y - 8);
  if (available < 50) return;
  ctx.save();
  drawGeologistSurvey(ctx, x, y, width, available, model);
  ctx.strokeStyle = '#a59a76'; ctx.lineWidth = 1; ctx.strokeRect(x, y, width, available);
  ctx.restore();
}

// Small bounded room illustrations. Decorative candle/lamp flicker is omitted
// in-world; the full pack keeps its animated gallery API. Actors remain live.
const roomCache = new Map();
let roomBytes = 0;
const MAX_BYTES = 16 * 1024 * 1024;

export function drawM6Room(ctx, type, box, room, sim) {
  const draw = type === 'school' ? drawSchool : type === 'ossuary' ? drawOssuary : null;
  if (!draw) return false;
  const bodyCount = room.bodyIds?.length ?? sim.colonists?.filter(person => person.ossuaryId === room.id && person.bodyLocation === 'ossuary').length ?? 0;
  const options = { seed: room.id, t: 0, bodyCount };
  const transform = ctx.getTransform?.();
  const scale = transform ? Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d)) : 1;
  const width = Math.min(2048, Math.max(1, Math.ceil(box.width * scale)));
  const height = Math.min(2048, Math.max(1, Math.ceil(box.height * scale)));
  const key = [type, room.id, bodyCount, width, height].join(':');
  let image = roomCache.get(key);
  if (!image) {
    let canvas;
    try {
      canvas = typeof globalThis.OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height)
        : globalThis.document?.createElement?.('canvas');
      if (canvas) {
        canvas.width = width; canvas.height = height;
        const target = canvas.getContext('2d');
        if (target) draw(target, 0, 0, width, height, options);
        else canvas = null;
      }
    } catch { canvas = null; }
    if (canvas) {
      const bytes = width * height * 4;
      while (roomCache.size && (roomBytes + bytes > MAX_BYTES || roomCache.size >= 32)) {
        const oldest = roomCache.keys().next().value, item = roomCache.get(oldest);
        roomCache.delete(oldest); roomBytes -= item.bytes; item.canvas.width = 0; item.canvas.height = 0;
      }
      image = { canvas, bytes }; roomCache.set(key, image); roomBytes += bytes;
    }
  } else { roomCache.delete(key); roomCache.set(key, image); }
  if (image) ctx.drawImage(image.canvas, box.left, box.top, box.width, box.height);
  else draw(ctx, box.left, box.top, box.width, box.height, options);
  return true;
}

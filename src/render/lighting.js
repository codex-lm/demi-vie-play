import { roomFloodArt, roomTypeFor, shownPowerArt } from './rooms.js';

import { excavationFeedback, roomOpening } from './excavationFeedback.js';

const masks = new WeakMap();

// Power shedding can drop a room and bring it back within a few game minutes.
// The light follows the power state the room art shows (rooms.js shownPowerArt,
// which ignores sheds shorter than POWER_ART_HOLD_SECONDS), then fades over this
// real-time duration, whatever the game speed, instead of switching within one
// frame. Only the frames of a fade rebuild the darkness mask; a settled light
// keeps the cached one.
export const LIGHT_FADE_SECONDS = .4;
const lightFades = new WeakMap();

/** Strength shown for a room whose target light is `target` at real time `now`. */
export function fadedLightStrength(room, target, now) {
  const fade = lightFades.get(room);
  // First sight, a frozen or backward clock (single renders, recorders) or a
  // room unseen for longer than a fade: show the light as it is.
  if (!fade || !Number.isFinite(now) || !(now > fade.seen) || now - fade.seen > LIGHT_FADE_SECONDS) {
    lightFades.set(room, { from: target, to: target, start: now, seen: now, value: target });
    return target;
  }
  fade.seen = now;
  if (target !== fade.to) {
    // Start from the light on screen, so a reversal mid-fade stays smooth.
    fade.from = fade.value; fade.to = target; fade.start = now;
  }
  const progress = Math.min(1, (now - fade.start) / LIGHT_FADE_SECONDS);
  fade.value = progress >= 1 ? fade.to : fade.from + (fade.to - fade.from) * progress * progress * (3 - 2 * progress);
  return fade.value;
}

function canvasFor(ctx, width, height) {
  let entry = masks.get(ctx);
  if (!entry) {
    let canvas;
    if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(width, height);
    else if (typeof document !== 'undefined') canvas = document.createElement('canvas');
    if (!canvas) return null;
    entry = { canvas, signature: null, sim: null };
    masks.set(ctx, entry);
  }
  if (entry.canvas.width !== width || entry.canvas.height !== height) {
    entry.canvas.width = width;
    entry.canvas.height = height;
    entry.signature = null;
  }
  return entry;
}

// Only geometry and illumination affect this mask. Neither the animation clock,
// people moving through it, nor the simulation tick requires another GPU upload.
// Store a lossless signature rather than a hash, so a collision cannot retain an
// old blackout or omit a newly excavated cell.
function maskSignature(rooms, game, view) {
  return JSON.stringify([view.width, view.height, view.cellSize, view.sx(0), view.sy(0),
    rooms.map(({ room, strength }) => [room.x, room.y, room.w, room.h, room.shape, room.state, strength,
      room.state === 'digging' ? (room.dugCells ?? []).map((index) => {
        const point = game.sim.world.coords(index);
        return [point.x, point.y];
      }) : null])]);
}

function compositeMask(ctx, canvas, view, game, rooms, feedback, cache) {
  let composite = canvas;
  if (feedback.openings.size && !game.options?.reduceMotion) {
    if (!cache.openingCanvas) {
      if (typeof OffscreenCanvas === 'function') cache.openingCanvas = new OffscreenCanvas(canvas.width, canvas.height);
      else if (typeof document !== 'undefined') cache.openingCanvas = document.createElement('canvas');
    }
    const transient = cache.openingCanvas;
    if (transient) {
      if (transient.width !== canvas.width || transient.height !== canvas.height) {
        transient.width = canvas.width; transient.height = canvas.height;
      }
      const mask = transient.getContext('2d');
      mask.save(); mask.setTransform(1, 0, 0, 1, 0, 0); mask.clearRect(0, 0, transient.width, transient.height);
      mask.globalCompositeOperation = 'source-over'; mask.drawImage(canvas, 0, 0);
      mask.setTransform(transient.width / view.width, 0, 0, transient.height / view.height, 0, 0);
      mask.globalCompositeOperation = 'destination-out';
      for (const room of rooms) {
        const opening = roomOpening(game, room, game.renderTime ?? view.now, feedback);
        if (!opening) continue;
        const geometry = openingGeometry(room, opening, view);
        mask.save(); roomPath(mask, room, view); mask.clip();
        const light = mask.createRadialGradient(geometry.x, geometry.y, 0, geometry.x, geometry.y, geometry.reach);
        light.addColorStop(0, `rgba(0,0,0,${.82 * geometry.fade})`);
        light.addColorStop(.55, `rgba(0,0,0,${.75 * geometry.fade})`);
        light.addColorStop(1, 'rgba(0,0,0,0)');
        mask.fillStyle = light; mask.fillRect(view.sx(room.x), view.sy(room.y), room.w * view.cellSize, room.h * view.cellSize);
        mask.restore();
      }
      mask.restore(); composite = transient;
    }
  }
  ctx.save();
  ctx.drawImage(composite, 0, 0, view.width, view.height);
  ctx.restore();
}

function roomPath(ctx, room, view, begin = true) {
  const x = view.sx(room.x), y = view.sy(room.y), w = room.w * view.cellSize, h = room.h * view.cellSize;
  if (begin) ctx.beginPath();
  if (room.shape === 'round') {
    ctx.moveTo(x + w, y + h / 2);
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
  }
  else if (room.shape === 'vault') {
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * .3);
    ctx.bezierCurveTo(x + w * .16, y + h * .025, x + w * .34, y, x + w / 2, y);
    ctx.bezierCurveTo(x + w * .66, y, x + w * .84, y + h * .025, x + w, y + h * .3);
    ctx.lineTo(x + w, y + h); ctx.closePath();
  } else ctx.rect(x, y, w, h);
}

function openingGeometry(room, opening, view) {
  const { entrance, progress, extent } = opening;
  const distance = Math.max(...[
    [room.x, room.y], [room.x + room.w, room.y],
    [room.x, room.y + room.h], [room.x + room.w, room.y + room.h],
  ].map(([px, py]) => Math.hypot(px - entrance.x, py - entrance.y))) * view.cellSize;
  return { x: view.sx(entrance.x), y: view.sy(entrance.y), reach: Math.max(1, distance * (.04 + extent * 1.25)),
    fade: Math.min(1, (1 - progress) / .23) };
}

function drawOpeningLights(ctx, game, rooms, view, feedback) {
  for (const room of rooms) {
    const opening = roomOpening(game, room, game.renderTime ?? view.now, feedback);
    if (!opening) continue;
    if (game.options?.reduceMotion) {
      ctx.save(); roomPath(ctx, room, view); ctx.strokeStyle = '#ddc18e';
      ctx.lineWidth = Math.max(1, view.cellSize * .04); ctx.stroke(); ctx.restore();
      continue;
    }
    const { x, y, reach, fade } = openingGeometry(room, opening, view);
    ctx.save(); roomPath(ctx, room, view); ctx.clip();
    // Reflected headlamp light expands from the physical entrance, revealing
    // the far wall before settling back to this unfitted room's ambient light.
    // This is transient: the stable darkness cache does not need rebuilding.
    const glow = ctx.createRadialGradient(x, y, 0, x, y, reach);
    glow.addColorStop(0, `rgba(255,176,77,${.10 * fade})`);
    glow.addColorStop(.55, `rgba(255,176,77,${.06 * fade})`);
    glow.addColorStop(1, 'rgba(255,176,77,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glow;
    ctx.fillRect(view.sx(room.x), view.sy(room.y), room.w * view.cellSize, room.h * view.cellSize);
    ctx.restore();
  }
}

/** Art owns warm lamp halos. This layer owns the only darkness pass, including
 * inhabitants and particles. Fog/solid rock are already shaded by terrain. */
export function drawLighting(ctx, game, view) {
  const feedback = excavationFeedback(game, game.renderTime ?? view.now);
  const visible = (game.sim?.excavations ?? []).filter((room) => room.state !== 'planned' && room.state !== 'collapsed'
    && room.w > 0 && room.h > 0 && view.sx(room.x + room.w) >= 0 && view.sx(room.x) <= view.width
    && view.sy(room.y + room.h) >= 0 && view.sy(room.y) <= view.height);
  if (!visible.length) return;
  const scale = .5;
  const now = game.renderTime ?? view.now;
  const rooms = visible.map((room) => {
    const { lit } = shownPowerArt(room, game.sim, now);
    const fitted = room.state === 'fitted' || (room.initial && roomTypeFor(room));
    // Reflected water remains legible in an unlit excavation. This is a cool
    // ambient reflection, below the warm illumination of an inhabited room.
    const target = fitted && lit ? .99 : roomFloodArt(room) ? .48 : .035;
    return { room, strength: fadedLightStrength(room, target, now) };
  });
  const cache = canvasFor(ctx, Math.ceil(view.width * scale), Math.ceil(view.height * scale));
  const canvas = cache?.canvas;
  const signature = cache ? maskSignature(rooms, game, view) : null;
  if (cache && cache.sim === game.sim && cache.signature === signature) {
    compositeMask(ctx, canvas, view, game, visible, feedback, cache);
    drawOpeningLights(ctx, game, visible, view, feedback);
    return;
  }
  const mask = canvas?.getContext('2d');
  if (mask) {
    mask.setTransform(scale, 0, 0, scale, 0, 0);
    mask.clearRect(0, 0, view.width, view.height);
    mask.globalCompositeOperation = 'source-over';
    mask.fillStyle = 'rgba(7,16,24,.72)';
    mask.beginPath();
    for (const room of visible) {
      if (room.state === 'digging') {
        // Only opened cells are darkened; planned rock keeps its terrain texture.
        for (const index of room.dugCells ?? []) {
          const point = game.sim.world.coords(index);
          mask.rect(view.sx(point.x), view.sy(point.y), view.cellSize, view.cellSize);
        }
      } else roomPath(mask, room, view, false);
    }
    mask.fill();
    mask.globalCompositeOperation = 'destination-out';
  }
  // A gradient is also valid on a Canvas recorder without a backing surface.
  // Without one we omit the compositing pass instead of erasing the main canvas.
  const target = mask ?? ctx;
  for (const { room, strength } of rooms) {
    const x = view.sx(room.x + room.w / 2), y = view.sy(room.y + room.h / 2);
    const radiusX = Math.max(1, room.w * view.cellSize * .75), radiusY = Math.max(1, room.h * view.cellSize * .9);
    target.save();
    if (mask) { roomPath(target, room, view); target.clip(); }
    target.translate(x, y); target.scale(radiusX, radiusY);
    const aperture = target.createRadialGradient(0, 0, 0, 0, 0, 1);
    aperture.addColorStop(0, `rgba(0,0,0,${strength})`);
    aperture.addColorStop(.65, `rgba(0,0,0,${strength * .98})`);
    aperture.addColorStop(1, 'rgba(0,0,0,0)');
    if (mask) {
      target.fillStyle = aperture;
      target.fillRect(-1, -1, 2, 2);
    }
    target.restore();
  }
  if (mask) {
    mask.globalCompositeOperation = 'source-over';
    cache.signature = signature;
    cache.sim = game.sim;
    compositeMask(ctx, canvas, view, game, visible, feedback, cache);
  }
  drawOpeningLights(ctx, game, visible, view, feedback);
}

import { HEAT, TIME, WATER } from '../data/balance.js';
import { samplePose, colonistFeatures } from '../../art/colonist.js';
import { sampleClimbingOut, sampleWorldClimbingOut } from '../../art/m6/actions.js';

// All thermal observations and frost geometry belong to the renderer. A change
// of camera or frame time never resamples temperature or rewrites the save.
const samples = new WeakMap();
const clamp = value => Math.max(0, Math.min(1, value));
const noise = (id, n) => {
  let h = Math.imul((id | 0) ^ Math.imul(n + 1, 374761393), 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
};

function roof(room, x) {
  const f = x / room.w;
  if (room.shape === 'round') return room.h / 2 * (1 - Math.sqrt(Math.max(0, 1 - (f * 2 - 1) ** 2)));
  return room.shape === 'vault' ? room.h * .3 * (f * 2 - 1) ** 2 : 0;
}

function crystal(lines, x, y, length, angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  lines.push([x, y, x + dx * length, y + dy * length]);
  for (const t of [.36, .66]) for (const side of [-1, 1]) {
    const bx = x + dx * length * t, by = y + dy * length * t;
    lines.push([bx, by, bx - dx * length * .18 - dy * length * .21 * side,
      by - dy * length * .18 + dx * length * .21 * side]);
  }
}

function utilityModules(room, preferred) {
  const count = Math.max(1, Math.floor((room.w - .35) / preferred));
  const slot = (room.w - .4) / count;
  const scale = Math.min(1, slot / preferred, (room.h - .25) / 2.7);
  return Array.from({ length: count }, (_, i) => ({ x: .2 + i * slot + (slot - preferred * scale) / 2,
    y: room.h - .1, scale }));
}

function glassPanels(room) {
  if (room.state !== 'fitted') return [];
  if (room.roomType === 'cistern') return utilityModules(room, 3.2).map(m => ({
    x: m.x + (1.12 - .47 / 2) * m.scale, y: m.y - 1.9 * m.scale, w: .47 * m.scale, h: 1.4 * m.scale,
  }));
  if (room.roomType === 'filterPlant') {
    const count = Math.max(1, Math.floor((room.w - .5) / 4.9)), span = (room.w - .6) / count;
    const scale = Math.min(1, (span - .1) / 4.7);
    return Array.from({ length: count }, (_, i) => ({ x: .3 + span * i + .52 * scale,
      y: room.h - .08 - 1.84 * scale, w: .638 * scale, h: 1.47 * scale }));
  }
  return [];
}

function frostGeometry(room, intensity) {
  const lines = [], rim = [];
  // White dendrites grow inward from masonry joints; never a full-screen blue
  // filter. Branch count and reach distinguish warning from dangerous cold.
  const spacing = .64 - intensity * .20;
  for (let x = .18, i = 0; x < room.w - .12; x += spacing, i++) {
    const y = roof(room, x) + .09;
    const length = (.12 + intensity * .55) * (.65 + noise(room.id, i) * .7);
    crystal(lines, x, y, length, Math.PI / 2 + (noise(room.id + 7, i) - .5) * .6);
    rim.push([x - .14, y, Math.min(room.w - .08, x + .24), roof(room, Math.min(room.w - .08, x + .24)) + .09]);
  }
  if (room.shape !== 'round') for (const side of [0, 1]) {
    const x = side ? room.w - .08 : .08;
    const top = room.shape === 'vault' ? room.h * .3 : 0;
    for (let y = top + .28, i = 0; y < room.h - .1; y += spacing, i++) {
      crystal(lines, x, y, (.14 + intensity * .5) * (.6 + noise(room.id + side, i + 41) * .6), side ? Math.PI : 0);
    }
  }
  const glass = glassPanels(room).map(pane => {
    const branches = [];
    for (let y = pane.y + .12; y < pane.y + pane.h; y += .22) {
      branches.push([pane.x, y, pane.x + pane.w * (.18 + intensity * .14), y + .1],
        [pane.x + pane.w, y, pane.x + pane.w * (.82 - intensity * .14), y - .1]);
    }
    return { ...pane, branches };
  });
  return { lines, rim, glass };
}

// Rooms start at HEAT.INITIAL_ROOM, which is exactly the cold alert threshold:
// a room resting there drifts a hair either side of it from hour to hour.
// Frost forms below the threshold and only clears once the room is clearly
// warmer, so it never blinks hour after hour (every fraction of a second at x30).
export const FROST_CLEAR_MARGIN = .5;

function hourlySample(sim) {
  const hour = Math.floor((sim.tick ?? 0) / TIME.TICKS_PER_HOUR);
  let cache = samples.get(sim);
  if (cache?.hour === hour) return cache;
  const previous = cache?.rooms;
  cache = { hour, samples: (cache?.samples ?? 0) + 1, rooms: new Map(), active: [] };
  for (const room of sim.excavations ?? []) {
    if (!['dug', 'fitted'].includes(room.state)) continue;
    const temperature = Number.isFinite(room.temperature) ? room.temperature : HEAT.INITIAL_ROOM;
    const wasCold = previous?.get(room.id)?.cold === true;
    const cold = wasCold ? temperature <= HEAT.ALERT_COLD + FROST_CLEAR_MARGIN : temperature < HEAT.ALERT_COLD;
    // The danger-threshold image is already frank at exactly 5 °C, while the
    // simulation remains the sole authority on damage strictly below it.
    const dangerous = cold && temperature <= HEAT.DANGER_MIN;
    const intensity = cold ? .18 + .82 * clamp((HEAT.ALERT_COLD - temperature) / (HEAT.ALERT_COLD - HEAT.DANGER_MIN)) : 0;
    const entry = { room, temperature, cold, dangerous, intensity,
      frost: cold ? frostGeometry(room, intensity) : null,
      heaters: room.roomType === 'heater' ? utilityModules(room, 3.25) : [] };
    cache.rooms.set(room.id, entry);
    if (cold || entry.heaters.length) cache.active.push(entry);
  }
  samples.set(sim, cache);
  return cache;
}

export function roomColdArt(sim, room) {
  return hourlySample(sim).rooms.get(room?.id) ?? null;
}

export function getColdCacheStats(sim) {
  const cache = samples.get(sim);
  return { hour: cache?.hour ?? null, samples: cache?.samples ?? 0, rooms: cache?.rooms.size ?? 0 };
}

/** Real occupied cell first, then the same rectangle convention as heat.js. */
export function colonistColdArt(sim, colonist) {
  if (!(colonist.health > 0) || colonist.dead || colonist.suit) return null;
  const cache = hourlySample(sim);
  if (!cache.active.length) return null;
  const world = sim.world, x = Math.floor(colonist.x), y = Math.floor(colonist.y);
  if (world?.inBounds?.(x, y) && world.cellExcavation) {
    const entry = cache.rooms.get(world.cellExcavation[world.index(x, y)]);
    if (entry) return entry.cold ? entry : null;
  }
  for (const entry of cache.active) {
    const room = entry.room;
    if (entry.cold && colonist.x >= room.x && colonist.x < room.x + room.w
      && colonist.y >= room.y && colonist.y < room.y + room.h) return entry;
  }
  return null;
}

export function heaterRadiates(room) {
  return room.roomType === 'heater' && room.state === 'fitted' && room.powered === true
    && !room.disabled && !room.powerShed && (room.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

function traceRoom(ctx, room) {
  const { w, h } = room;
  ctx.beginPath();
  if (room.shape === 'round') ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (room.shape === 'vault') {
    ctx.moveTo(0, h); ctx.lineTo(0, h * .3);
    ctx.bezierCurveTo(w * .16, h * .025, w * .34, 0, w / 2, 0);
    ctx.bezierCurveTo(w * .66, 0, w * .84, h * .025, w, h * .3);
    ctx.lineTo(w, h); ctx.closePath();
  } else ctx.rect(0, 0, w, h);
}

function drawLines(ctx, lines) {
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of lines) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
}

/** Paint after rooms, before inhabitants; all coordinates are cached in metres. */
export function drawColdRooms(ctx, game, view) {
  const cache = hourlySample(game.sim);
  for (const entry of cache.active) {
    const { room, intensity, frost } = entry;
    if (!['dug', 'fitted'].includes(room.state)) continue;
    const left = view.sx(room.x), top = view.sy(room.y), cell = view.cellSize;
    if (left + room.w * cell < 0 || left > view.width || top + room.h * cell < 0 || top > view.height) continue;
    if (game.sim.world?.isVisible && !game.sim.world.isVisible(Math.floor(room.x + room.w / 2), Math.floor(room.y + room.h / 2))) continue;
    ctx.save(); ctx.translate(left, top); ctx.scale(cell, cell); traceRoom(ctx, room); ctx.clip();
    if (frost) {
      ctx.fillStyle = `rgba(192,218,226,${.025 + intensity * .035})`;
      ctx.fillRect(0, 0, room.w, room.h);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(211,233,237,${.46 + intensity * .36})`;
      ctx.lineWidth = Math.max(.025, .8 / cell);
      drawLines(ctx, frost.lines);
      ctx.strokeStyle = `rgba(229,242,241,${.26 + intensity * .4})`;
      ctx.lineWidth = .035 + intensity * .07; drawLines(ctx, frost.rim);
      for (const pane of frost.glass) {
        ctx.save(); ctx.beginPath(); ctx.rect(pane.x, pane.y, pane.w, pane.h); ctx.clip();
        ctx.fillStyle = `rgba(216,235,238,${.06 + intensity * .12})`;
        ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
        ctx.lineWidth = .035 + intensity * .045;
        ctx.strokeStyle = '#d4e6e5';
        ctx.strokeRect(pane.x, pane.y, pane.w, pane.h);
        // The clear central strip keeps the real water level readable.
        drawLines(ctx, pane.branches); ctx.restore();
      }
    }
    if (heaterRadiates(room)) for (const m of entry.heaters) {
      ctx.save(); ctx.translate(m.x, m.y); ctx.scale(m.scale, m.scale);
      const glow = ctx.createRadialGradient(1.55, -.95, .15, 1.55, -.95, 2.05);
      glow.addColorStop(0, 'rgba(255,201,117,.30)'); glow.addColorStop(.5, 'rgba(234,160,70,.15)'); glow.addColorStop(1, 'rgba(234,160,70,0)');
      ctx.fillStyle = glow; ctx.fillRect(-.5, -3, 4.1, 4.1);
      ctx.strokeStyle = '#edc480'; ctx.lineWidth = .035;
      ctx.beginPath();
      for (let n = 0; n < 7; n++) { const x = .57 + n * .3; ctx.moveTo(x, -1.47); ctx.lineTo(x, -.40); }
      ctx.stroke();
      const time = game.options?.reduceMotion ? 0 : game.renderTime ?? view.now ?? 0;
      ctx.strokeStyle = 'rgba(249,213,152,.63)'; ctx.lineWidth = .035;
      ctx.beginPath();
      for (let n = 0; n < 3; n++) {
        const x = .85 + n * .62, lift = .07 * Math.sin(time * 1.4 + n);
        ctx.moveTo(x, -1.76 + lift);
        ctx.bezierCurveTo(x - .10, -1.94 + lift, x + .10, -2.05 + lift, x, -2.27 + lift);
      }
      ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
}

/** Small white exhalations attached to the actual face, not generic room fog. */
export function drawColdBreath(ctx, placement, colonist, cold, view, time = 0) {
  if (!cold || colonist.suit || !(colonist.health > 0)) return;
  const { options } = placement;
  const actionPoses = { reading: 'sit', teaching: 'talk', mourning: 'crisis', music: 'sit',
    celebrating: 'talk', listeningRock: 'idle', carryingChild: 'walk', climbingOut: 'climb' };
  const poseName = actionPoses[options.action] ?? options.pose;
  const pose = samplePose(poseName, options.t, options.age);
  const width = colonistFeatures(options.seed, options.age).width;
  const sleeping = poseName === 'sleep';
  let mx = sleeping ? .77 : pose.hip[0] + Math.cos(pose.lean) * width * .25 - Math.sin(pose.lean) * -.82;
  let my = sleeping ? -.29 : pose.hip[1] + Math.sin(pose.lean) * width * .25 + Math.cos(pose.lean) * -.82;
  let breathDirection = 1;
  if (options.action === 'mourning') [mx, my] = [Math.cos(.035) * mx - Math.sin(.035) * my, Math.sin(.035) * mx + Math.cos(.035) * my];
  if (options.action === 'celebrating') my -= Math.max(0, Math.sin(options.t * 2.7)) * .065 / placement.artScale;
  if (options.action === 'listeningRock') {
    const hx = -(mx - .02), hy = my + 1.31;
    mx = .07 + Math.cos(.18) * hx - Math.sin(.18) * hy;
    my = -1.31 + Math.sin(.18) * hx + Math.cos(.18) * hy;
    breathDirection = -1;
  }
  if (options.action === 'climbingOut') {
    const climb = options.worldLadder ? sampleWorldClimbingOut(options.worldLadder) : sampleClimbingOut(options.t);
    mx = .49 + width * .25 / placement.artScale;
    my = -1.58 + climb.bob + .02 / placement.artScale;
  }
  const scale = view.cellSize * placement.cellScale * placement.artScale;
  const facing = options.facing === -1 ? -1 : 1;
  const phase = ((time * .55 + (colonist.id ?? 0) * .173) % 1 + 1) % 1;
  ctx.save(); ctx.translate(view.sx(placement.x) + mx * scale * facing, view.sy(placement.y) + my * scale);
  ctx.scale(facing * breathDirection, 1);
  for (let n = 0; n < 3; n++) {
    const p = (phase + n * .20) % 1, fade = Math.sin(Math.PI * p);
    ctx.fillStyle = `rgba(228,241,241,${fade * (.30 + cold.intensity * .21)})`;
    ctx.beginPath(); ctx.ellipse((.06 + p * .41) * scale, -p * .12 * scale,
      (.05 + p * .14) * scale, (.025 + p * .065) * scale, -.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

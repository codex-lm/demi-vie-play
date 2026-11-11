import { ROOM_DEFS } from '../data/rooms.js';
import { drawRoomProps, ROOM_TYPES, drawDoor as drawArtDoor, drawLadder as drawArtLadder } from '../../art/props.js';
import { drawBackWall } from '../../art/walls.js';
import { drawTerrainSupport } from '../../art/terrain.js';
import { drawM6Room } from './m6-world.js';
import { roomReserveArt } from './roomReserves.js';
import { drawSupport, drawRoomHumidity, roomIsDamp } from './supports.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function noise(...values) {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= Math.floor(value * 1009) | 0;
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return (hash >>> 0) / 0xffffffff;
}

function boxFor(excavation, view) {
  const left = view.sx(excavation.x);
  const top = view.sy(excavation.y);
  return {
    left,
    top,
    right: view.sx(excavation.x + excavation.w),
    bottom: view.sy(excavation.y + excavation.h),
    width: excavation.w * view.cellSize,
    height: excavation.h * view.cellSize,
    cell: view.cellSize,
  };
}

function isVisible(box, view, margin = 0) {
  return box.right >= -margin && box.left <= view.width + margin
    && box.bottom >= -margin && box.top <= view.height + margin;
}

function traceRoom(ctx, box, shape) {
  const { left, top, right, bottom, width, height } = box;
  const centerX = (left + right) / 2;
  ctx.beginPath();
  if (shape === 'round') {
    ctx.ellipse(centerX, (top + bottom) / 2, width / 2, height / 2, 0, 0, TAU);
    return;
  }
  if (shape === 'vault') {
    const shoulder = top + height * 0.3;
    ctx.moveTo(left, bottom);
    ctx.lineTo(left, shoulder);
    ctx.bezierCurveTo(left + width * 0.16, top + height * 0.025, left + width * 0.34, top, centerX, top);
    ctx.bezierCurveTo(right - width * 0.34, top, right - width * 0.16, top + height * 0.025, right, shoulder);
    ctx.lineTo(right, bottom);
    ctx.closePath();
    return;
  }
  ctx.rect(left, top, width, height);
}

function traceCeiling(ctx, box, shape, offset = 0) {
  const { left, top, right, width, height } = box;
  const centerX = (left + right) / 2;
  ctx.beginPath();
  if (shape === 'round') {
    ctx.ellipse(centerX, (top + box.bottom) / 2, width / 2, height / 2, 0, Math.PI, TAU);
    return;
  }
  if (shape === 'vault') {
    const shoulder = top + height * 0.3 + offset;
    ctx.moveTo(left, shoulder);
    ctx.bezierCurveTo(left + width * 0.16, top + height * 0.025 + offset, left + width * 0.34, top + offset, centerX, top + offset);
    ctx.bezierCurveTo(right - width * 0.34, top + offset, right - width * 0.16, top + height * 0.025 + offset, right, shoulder);
    return;
  }
  ctx.moveTo(left, top + offset);
  ctx.lineTo(right, top + offset);
}

function roofAt(box, shape, fraction) {
  const t = clamp(fraction, 0, 1);
  if (shape === 'round') {
    const radius = box.height / 2;
    return (box.top + box.bottom) / 2 - radius * Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2));
  }
  if (shape === 'vault') return box.top + box.height * 0.3 * (t * 2 - 1) ** 2;
  return box.top;
}

function drawPlan(ctx, box, excavation, digging) {
  ctx.save();
  traceRoom(ctx, box, excavation.shape);
  ctx.fillStyle = digging ? 'rgba(19, 20, 19, 0.76)' : 'rgba(39, 48, 47, 0.34)';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = digging ? 'rgba(190, 152, 91, 0.09)' : 'rgba(137, 177, 174, 0.15)';
  ctx.lineWidth = 1;
  const spacing = Math.max(7, box.cell * 0.75);
  for (let x = box.left - box.height; x < box.right + box.height; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, box.bottom);
    ctx.lineTo(x + box.height, box.top);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  traceRoom(ctx, box, excavation.shape);
  ctx.setLineDash([Math.max(3, box.cell * 0.35), Math.max(2, box.cell * 0.22)]);
  ctx.lineDashOffset = digging ? 0 : -box.cell * 0.2;
  ctx.strokeStyle = digging ? 'rgba(211, 166, 92, 0.62)' : 'rgba(145, 190, 184, 0.78)';
  ctx.lineWidth = Math.max(1, box.cell * 0.055);
  ctx.stroke();
  ctx.restore();
}

function drawDugCells(ctx, game, view, excavation, box) {
  const world = game.sim.world;
  ctx.save();
  traceRoom(ctx, box, excavation.shape);
  ctx.clip();
  for (const index of excavation.dugCells ?? []) {
    const { x, y } = world.coords(index);
    const variation = noise(excavation.id, index);
    ctx.fillStyle = variation > 0.55 ? '#332b22' : '#2c2721';
    ctx.fillRect(view.sx(x) - 0.35, view.sy(y) - 0.35, view.cellSize + 0.7, view.cellSize + 0.7);
    ctx.fillStyle = 'rgba(224, 171, 93, 0.055)';
    ctx.fillRect(view.sx(x), view.sy(y), view.cellSize, Math.max(1, view.cellSize * 0.08));
  }
  ctx.restore();
}

function normalizedLabel(excavation) {
  return String(excavation.label ?? excavation.roomType ?? excavation.fitting ?? '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function roomTypeFor(excavation) {
  if (ROOM_DEFS[excavation.roomType] || ROOM_TYPES.includes(excavation.roomType)) return excavation.roomType;
  const label = normalizedLabel(excavation);
  if (label.includes('dorm')) return 'dorm';
  if (label.includes('pantry') || label.includes('reserve')) return 'pantry';
  if (label.includes('storage')) return 'storage';
  if (label.includes('generator') || label.includes('diesel') || label.includes('generateur')) return 'diesel';
  return null;
}

function line(ctx, points, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
}

function disk(ctx, x, y, radius, color, stroke = null) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(0.6, radius * 0.18);
    ctx.stroke();
  }
}

// Historical M2 catalogue retained for consumers of that exported contract.
// Actual drawing dispatch uses ROOM_TYPES and includes the M5 gas detector.
export const ROOM_FURNITURE_TYPES = Object.freeze(Object.keys(ROOM_DEFS).filter((type) => type !== 'gasDetector'));
export const ALL_ROOM_FURNITURE_TYPES = Object.freeze(Object.keys(ROOM_DEFS));

function drawPowerStatus(ctx, box, excavation, now, reserveArt, power) {
  if (excavation.state !== 'fitted' || !roomTypeFor(excavation)) return;
  const u = box.cell;
  const x = box.right - u * 0.42;
  const fraction = (x - box.left) / box.width;
  const y = roofAt(box, excavation.shape, fraction) + u * 0.48;
  const diesel = excavation.roomType === 'diesel';
  // The shed colour and slash follow the shown power state (shownPowerArt).
  const { noFilters, offline, shed } = power;
  const fuelColor = diesel && reserveArt ? { green: '#a7cf7d', amber: '#efb64f', red: '#ff6553' }[reserveArt.fuelStatus] : null;
  const color = noFilters ? '#ff6553' : excavation.disabled ? '#89918b' : fuelColor ?? (shed ? '#ef7655' : offline ? '#d29a58' : '#a7cf7d');
  ctx.fillStyle = '#202826';
  ctx.fillRect(x - u * 0.22, y - u * 0.24, u * 0.44, u * 0.48);
  ctx.strokeStyle = '#6c756d';
  ctx.lineWidth = Math.max(0.6, u * 0.035);
  ctx.strokeRect(x - u * 0.22, y - u * 0.24, u * 0.44, u * 0.48);
  const pulse = shed || (diesel && reserveArt?.fuelStatus === 'red' && !reserveArt.fuelEmpty)
    ? 0.65 + Math.sin(now * 5 + excavation.id) * 0.35 : 1;
  ctx.globalAlpha *= pulse;
  disk(ctx, x, y - u * 0.08, u * 0.075, color);
  ctx.globalAlpha /= pulse;
  line(ctx, [[x + u * 0.035, y - u * 0.01], [x - u * 0.055, y + u * 0.1], [x + u * 0.025, y + u * 0.1], [x - u * 0.035, y + u * 0.2]], color, Math.max(0.8, u * 0.045));
  if (offline) line(ctx, [[x - u * 0.17, y + u * 0.18], [x + u * 0.17, y - u * 0.18]], color, Math.max(1, u * 0.055));
  if (noFilters) {
    line(ctx, [[x - u * .15, y - u * .15], [x + u * .15, y + u * .15]], '#fff1da', Math.max(1, u * .05));
    line(ctx, [[x + u * .15, y - u * .15], [x - u * .15, y + u * .15]], '#fff1da', Math.max(1, u * .05));
  }
}

// The standing-water dressing of a room (damp back wall, the room water band,
// the cool reflected light) follows water a player can see, not a trace of a
// few litres that the flow solver moves in and out every few ticks. Measured
// like the drawn band, as a depth on the floor (floodRatio × height, in cells):
// it appears from 0.04 of a cell, where water.js starts to animate a surface
// instead of a flat film, and only leaves below half of that (hysteresis).
export const FLOOD_ART_ON_DEPTH = .04;
export const FLOOD_ART_OFF_DEPTH = .02;
const floodArtShown = new WeakMap();

/** Whether the room shows its standing-water art. Idempotent within a frame. */
export function roomFloodArt(excavation) {
  const ratio = Number(excavation?.floodRatio) || 0;
  const keyed = excavation !== null && typeof excavation === 'object';
  if (!(ratio > 0)) {
    if (keyed) floodArtShown.set(excavation, false);
    return false;
  }
  const depth = ratio * Math.max(1, Number(excavation.h) || 1);
  const shown = depth >= (keyed && floodArtShown.get(excavation) === true ? FLOOD_ART_OFF_DEPTH : FLOOD_ART_ON_DEPTH);
  if (keyed) floodArtShown.set(excavation, shown);
  return shown;
}

// Power shedding at x10 or x30 can cut a room for one frame and give it back on
// the next (base-m2-j120, filter plant: a 10-tick shed every 8 to 25 frames).
// Everything the art draws from the power state (ceiling lamps and their halos,
// running machines, the filter and gas readouts, the power icon) follows the
// simulation only once a change of its power flags has held for
// POWER_ART_HOLD_SECONDS of real time, at any game speed: a shorter shed, or a
// shorter restore, never reaches the screen. lighting.js takes its darkness
// target from the same shown state, then fades it. A player's own switch
// (disabled) shows at once.
export const POWER_ART_HOLD_SECONDS = .3;
const powerArtShown = new WeakMap();
const powerKey = (excavation) => `${Boolean(excavation.powerShed)}|${excavation.powered !== false}`;

function livePowerArt(excavation, sim) {
  const powered = !excavation.disabled && !excavation.powerShed && excavation.powered !== false;
  const definition = ROOM_DEFS[roomTypeFor(excavation)];
  const autonomousLight = Boolean(definition && !definition.powerKw);
  const workers = sim.colonists ?? [];
  const detector = excavation.roomType === 'gasDetector'
    ? sim.m5?.hazards?.detectors?.find((item) => item.excavationId === excavation.id) : null;
  const manuallyDriven = !powered && !excavation.disabled && workers.some((person) => person.alive !== false
    && (person.task === 'crank' || person.task === 'working')
    && (person.jobId != null && (sim.jobs ?? []).some((job) => job.id === person.jobId
      && job.excavationId === excavation.id && (job.type === 'crank' || excavation.roomType === 'bikeDynamo'))));
  return {
    powered: powered || (!excavation.disabled && manuallyDriven),
    lit: !excavation.disabled && !excavation.powerShed && (autonomousLight || powered),
    // Starvation stops the machine on the very first rendered frame, even inside
    // the hourly inventory sample; only an unconfirmed power change delays it.
    noFilters: excavation.roomType === 'filterPlant' && excavation.production?.status === 'noFilters',
    filterRunning: excavation.roomType !== 'filterPlant' || !excavation.production?.status
      || ['working', 'producing'].includes(excavation.production.status),
    detectorPowered: Boolean(detector?.powered),
    methane: detector?.powered && Number.isFinite(detector.maxMethane) ? detector.maxMethane : null,
    gasAlert: detector?.powered ? detector.alertLevel : null,
    shed: Boolean(excavation.powerShed),
    offline: Boolean(excavation.disabled || excavation.powerShed
      || ((definition?.powerKw > 0 || excavation.roomType === 'diesel') && excavation.powered === false)),
  };
}

/** Power-dependent art shown at real time `clock` (seconds). Idempotent within
 * a frame; without a finite clock it is the live state. */
export function shownPowerArt(excavation, sim = {}, clock = undefined) {
  const live = livePowerArt(excavation, sim);
  if (!Number.isFinite(clock)) return live;
  const key = powerKey(excavation), disabled = Boolean(excavation.disabled);
  const state = powerArtShown.get(excavation);
  // First sight, a backward clock, a room unseen for longer than a hold, a
  // player's switch, or flags changed under a frozen clock (single renders,
  // recorders): show the room as it is.
  if (!state || clock < state.seen || clock - state.seen > POWER_ART_HOLD_SECONDS || disabled !== state.disabled
    || (clock === state.seen && key !== state.pending)) {
    powerArtShown.set(excavation, { key, art: live, pending: key, since: clock, seen: clock, disabled });
    return live;
  }
  state.seen = clock;
  if (key === state.key) {
    state.pending = key; state.since = clock; state.art = live;
    return live;
  }
  if (key !== state.pending) { state.pending = key; state.since = clock; }
  if (clock - state.since >= POWER_ART_HOLD_SECONDS) {
    state.key = key; state.art = live;
    return live;
  }
  return state.art;
}

/** Options are a read-only projection of simulation state, shared with lighting.
 * With a real-time `clock`, the power-dependent part is the shown one. */
export function roomArtOptions(excavation, sim = {}, time = 0, clock = undefined) {
  return artOptions(excavation, sim, time, shownPowerArt(excavation, sim, clock));
}

function artOptions(excavation, sim, time, power) {
  const definition = ROOM_DEFS[roomTypeFor(excavation)];
  const autonomousLight = Boolean(definition && !definition.powerKw);
  return {
    reserveArt: roomReserveArt(sim, excavation, roomTypeFor(excavation)),
    noFilters: power.noFilters,
    filterRunning: power.filterRunning,
    t: time, seed: excavation.id, powered: power.powered,
    lit: power.lit, independentLight: autonomousLight, damage: clamp((100 - (excavation.integrity ?? 100)) / 100, 0, 1),
    flood: roomFloodArt(excavation) ? clamp(excavation.floodRatio ?? 0, 0, 1) : 0,
    receiving: excavation.roomType === 'radio' ? sim.m5?.radio?.receiving === true : excavation.receiving === true,
    detectorPowered: power.detectorPowered,
    methane: power.methane,
    gasAlert: power.gasAlert,
    souvenirs: Array.isArray(excavation.souvenirs) ? excavation.souvenirs : [],
    bedCount: excavation.beds ?? (excavation.label === 'shelterDorm' ? 12 : undefined),
    // Water is painted once from the real cell contour; darkness is composited
    // once after people/effects by lighting.js. Gallery defaults remain intact.
    water: false, shade: false,
  };
}

function drawInterior(ctx, game, view, excavation, box) {
  ctx.save();
  traceRoom(ctx, box, excavation.shape);
  ctx.clip();
  const type = roomTypeFor(excavation);
  const fitted = excavation.state === 'fitted' || (excavation.initial && type);
  const flooded = roomFloodArt(excavation);
  if (fitted) {
    const artType = type;
    if (flooded) {
      const wall = ctx.createLinearGradient(box.left, box.top, box.right, box.bottom);
      wall.addColorStop(0, '#625b44');wall.addColorStop(.5, '#414b40');wall.addColorStop(1, '#263b35');
      ctx.fillStyle = wall;ctx.fillRect(box.left, box.top, box.width, box.height);
    }
    const time = game.options?.reduceMotion ? 0 : game.renderTime ?? view.now;
    const power = shownPowerArt(excavation, game.sim, game.renderTime ?? view.now);
    const options = artOptions(excavation, game.sim, time, power);
    if (!drawM6Room(ctx, artType, box, excavation, game.sim)) {
      drawRoomProps(ctx, artType, { x: box.left, y: box.top, w: box.width, h: box.height }, box.cell,
        { ...options, backWall: !flooded });
    }
    drawPowerStatus(ctx, box, excavation, time, options.reserveArt, power);
  } else {
    // An empty excavation has rough rock and real shoring, never a free table,
    // completed room decoration or an electrically lit ceiling.
    ctx.save();
    ctx.translate(box.left, box.top);
    ctx.scale(box.cell, box.cell);
    // A continuous damp rock face keeps submerged walls free of masonry grids.
    if (flooded) {
      const wall = ctx.createLinearGradient(0, 0, excavation.w, excavation.h);
      wall.addColorStop(0, '#303c37');
      wall.addColorStop(.5, '#242e2c');
      wall.addColorStop(1, '#182523');
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, excavation.w, excavation.h);
    } else drawBackWall(ctx, '', excavation.w, excavation.h);
    ctx.restore();
  }
  ctx.restore();
}

function drawShell(ctx, box, excavation) {
  ctx.save();
  traceRoom(ctx, box, excavation.shape);
  ctx.strokeStyle = 'rgba(8, 10, 10, 0.88)';
  ctx.lineWidth = Math.max(2, box.cell * 0.2);
  ctx.stroke();
  traceRoom(ctx, box, excavation.shape);
  ctx.strokeStyle = excavation.initial ? '#8a887c' : '#71634f';
  ctx.lineWidth = Math.max(1, box.cell * 0.065);
  ctx.stroke();
  traceCeiling(ctx, box, excavation.shape, Math.max(1, box.cell * 0.055));
  ctx.strokeStyle = 'rgba(213, 184, 133, 0.24)';
  ctx.lineWidth = Math.max(0.7, box.cell * 0.025);
  ctx.stroke();
  ctx.restore();
}

function drawArtBoundary(ctx, box, excavation, lining, coating) {
  for (let y = 0; y < excavation.h; y += 1) {
    for (let x = 0; x < excavation.w; x += 1) {
      if (x > 0 && y > 0 && x < excavation.w - 1 && y < excavation.h - 1) continue;
      drawTerrainSupport(ctx, box.left + x * box.cell, box.top + y * box.cell, box.cell,
        { state: 'empty', lining, coating, wx: excavation.x + x, wy: excavation.y + y },
        { top: y === 0, right: x === excavation.w - 1, bottom: y === excavation.h - 1, left: x === 0 });
    }
  }
}

function drawCoating(ctx, box, excavation) {
  if (excavation.shape === 'flat') {
    if (excavation.coating && excavation.coating !== 'none') drawArtBoundary(ctx, box, excavation, 'none', excavation.coating);
    return;
  }
  const colors = {
    waterproof: '#56858a', insulation: '#aa8150', leadLining: '#777583', whitewash: '#c5bda5',
  };
  const color = colors[excavation.coating];
  if (!color) return;
  ctx.save();
  traceRoom(ctx, box, excavation.shape);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = Math.max(1, box.cell * (excavation.coating === 'waterproof' ? 0.11 : 0.07));
  ctx.stroke();
  if (excavation.coating === 'waterproof') {
    ctx.strokeStyle = 'rgba(176, 214, 208, 0.48)';
    ctx.lineWidth = Math.max(0.6, box.cell * 0.018);
    const panels = Math.max(2, Math.floor(excavation.w));
    for (let i = 1; i < panels; i += 1) {
      const x = box.left + box.width * i / panels;
      const y = roofAt(box, excavation.shape, i / panels);
      ctx.beginPath();
      ctx.moveTo(x, y + box.cell * 0.03);
      ctx.lineTo(x, y + box.cell * 0.16);
      ctx.stroke();
    }
    ctx.fillStyle = '#9bb8b2';
    ctx.fillRect(box.left, box.bottom - box.cell * 0.22, box.width, Math.max(1, box.cell * 0.035));
  }
  ctx.restore();
}

function drawBoltRow(ctx, box, excavation) {
  const count = Math.max(2, Math.ceil(excavation.w / 1.4));
  ctx.strokeStyle = '#9a9c91';
  ctx.fillStyle = '#c0bda9';
  ctx.lineWidth = Math.max(0.8, box.cell * 0.035);
  for (let i = 0; i <= count; i += 1) {
    const fraction = (i + 0.35) / (count + 0.7);
    const x = box.left + box.width * fraction;
    const y = roofAt(box, excavation.shape, fraction);
    const length = box.cell * (0.28 + noise(excavation.id, i) * 0.16);
    ctx.beginPath();
    ctx.moveTo(x, y + box.cell * 0.03);
    ctx.lineTo(x + (fraction - 0.5) * box.cell * 0.18, y - length);
    ctx.stroke();
    ctx.fillRect(x - box.cell * 0.065, y - box.cell * 0.015, box.cell * 0.13, Math.max(1, box.cell * 0.07));
  }
}

function drawTimber(ctx, box, excavation) {
  const color = '#765235';
  const highlight = '#a27648';
  if (excavation.kind === 'shaft') {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, box.cell * 0.12);
    for (const x of [box.left + box.cell * 0.12, box.right - box.cell * 0.12]) {
      ctx.beginPath();
      ctx.moveTo(x, box.top);
      ctx.lineTo(x, box.bottom);
      ctx.stroke();
    }
    for (let y = box.top + box.cell; y < box.bottom; y += box.cell * 2.5) {
      ctx.beginPath();
      ctx.moveTo(box.left, y);
      ctx.lineTo(box.right, y);
      ctx.stroke();
    }
    return;
  }
  traceCeiling(ctx, box, excavation.shape, box.cell * 0.14);
  ctx.strokeStyle = '#33261d';
  ctx.lineWidth = Math.max(2, box.cell * 0.2);
  ctx.stroke();
  traceCeiling(ctx, box, excavation.shape, box.cell * 0.14);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.4, box.cell * 0.13);
  ctx.stroke();
  const count = Math.max(1, Math.floor(excavation.w / 3));
  for (let i = 0; i <= count; i += 1) {
    const fraction = (i + 0.5) / (count + 1);
    const x = box.left + box.width * fraction;
    const roof = roofAt(box, excavation.shape, fraction) + box.cell * 0.15;
    ctx.strokeStyle = '#33261d';
    ctx.lineWidth = Math.max(2, box.cell * 0.19);
    ctx.beginPath();
    ctx.moveTo(x, roof);
    ctx.lineTo(x, box.bottom - box.cell * 0.15);
    ctx.stroke();
    ctx.strokeStyle = highlight;
    ctx.lineWidth = Math.max(1.2, box.cell * 0.11);
    ctx.beginPath();
    ctx.moveTo(x, roof);
    ctx.lineTo(x, box.bottom - box.cell * 0.15);
    ctx.moveTo(x, roof + box.cell * 0.65);
    ctx.lineTo(x - box.cell * 0.42, roof + box.cell * 0.12);
    ctx.moveTo(x, roof + box.cell * 0.65);
    ctx.lineTo(x + box.cell * 0.42, roof + box.cell * 0.12);
    ctx.stroke();
  }
}

function drawSteelArches(ctx, box, excavation) {
  ctx.save();
  traceCeiling(ctx, box, excavation.shape, box.cell * 0.13);
  ctx.strokeStyle = '#252c2e';
  ctx.lineWidth = Math.max(2.2, box.cell * 0.2);
  ctx.stroke();
  traceCeiling(ctx, box, excavation.shape, box.cell * 0.13);
  ctx.strokeStyle = '#899494';
  ctx.lineWidth = Math.max(1.3, box.cell * 0.105);
  ctx.stroke();
  const count = Math.max(1, Math.floor(excavation.w / 3));
  for (let i = 0; i <= count; i += 1) {
    const fraction = (i + 0.5) / (count + 1);
    const x = box.left + box.width * fraction;
    const roof = roofAt(box, excavation.shape, fraction) + box.cell * 0.14;
    ctx.strokeStyle = '#737f80';
    ctx.lineWidth = Math.max(1.2, box.cell * 0.1);
    ctx.beginPath();
    ctx.moveTo(x, roof);
    ctx.lineTo(x, box.bottom - box.cell * 0.16);
    ctx.stroke();
    ctx.fillStyle = '#a2a99f';
    ctx.fillRect(x - box.cell * 0.18, box.bottom - box.cell * 0.22, box.cell * 0.36, box.cell * 0.07);
  }
  ctx.restore();
}

function drawShotcrete(ctx, box, excavation) {
  ctx.save();
  traceRoom(ctx, box, excavation.shape);
  ctx.strokeStyle = '#343a39';
  ctx.lineWidth = Math.max(3, box.cell * 0.25);
  ctx.stroke();
  traceRoom(ctx, box, excavation.shape);
  ctx.strokeStyle = '#85877c';
  ctx.lineWidth = Math.max(1.5, box.cell * 0.14);
  ctx.stroke();
  traceRoom(ctx, box, excavation.shape);
  ctx.strokeStyle = 'rgba(208, 200, 174, 0.34)';
  ctx.lineWidth = Math.max(0.7, box.cell * 0.025);
  ctx.stroke();
  ctx.restore();
}

function drawLining(ctx, box, excavation) {
  if (excavation.shape === 'flat' && excavation.lining && excavation.lining !== 'none') {
    drawArtBoundary(ctx, box, excavation, excavation.lining, 'none');
    return;
  }
  if (excavation.lining === 'timber') drawTimber(ctx, box, excavation);
  else if (excavation.lining === 'steelArch') drawSteelArches(ctx, box, excavation);
  if (excavation.lining === 'shotcrete' || excavation.lining === 'boltsShotcrete') drawShotcrete(ctx, box, excavation);
  if (excavation.lining === 'bolts' || excavation.lining === 'boltsShotcrete') drawBoltRow(ctx, box, excavation);
}

function drawSupports(ctx, box, excavation) {
  for (let i = 0; i < (excavation.supports ?? []).length; i += 1) {
    const support = excavation.supports[i];
    const worldX = typeof support === 'number' ? support : support.x;
    if (!Number.isFinite(worldX)) continue;
    const fraction = (worldX - excavation.x + 0.5) / excavation.w;
    const x = box.left + box.width * fraction;
    const roof = roofAt(box, excavation.shape, fraction) + box.cell * 0.12;
    const floor = box.bottom - box.cell * 0.16;
    drawSupport(ctx, { x, roof, floor, cell: box.cell }, support);
  }
}

function drawLadder(ctx, game, view, excavation, box) {
  if (excavation.kind !== 'shaft' || excavation.state === 'planned' || excavation.state === 'collapsed') return;
  let bottom = box.bottom;
  if (excavation.state === 'digging') {
    let maxY = excavation.y;
    for (const index of excavation.dugCells ?? []) maxY = Math.max(maxY, game.sim.world.coords(index).y + 1);
    bottom = Math.min(box.bottom, view.sy(maxY));
  }
  if (bottom <= box.top) return;
  const x = (box.left + box.right) / 2;
  const half = Math.min(box.width * 0.25, box.cell * 0.25);
  if (excavation.roomType === 'elevator' && excavation.state === 'fitted') return;
  drawArtLadder(ctx, x, box.top, bottom - box.top, box.cell, { metal: excavation.lining === 'steelArch' });
}

// Rock walls, shoring, coatings and ladder rungs do not animate. Rasterize them
// at the actual device scale once, independently of camera translation. Keeping
// them separate preserves furniture/structure ordering and live power indicators.
const STRUCTURE_BYTES = 16 * 1024 * 1024;
const STRUCTURE_ENTRIES = 64;
const structureCache = new Map();
const structureStats = { bytes: 0, hits: 0, builds: 0, evictions: 0 };
export function getRoomStructureCacheStats() {
  return { ...structureStats, entries: structureCache.size, maxBytes: STRUCTURE_BYTES, maxEntries: STRUCTURE_ENTRIES };
}
export function clearRoomStructureCache() {
  for (const entry of structureCache.values()) { entry.canvas.width = 0; entry.canvas.height = 0; }
  structureCache.clear();
  for (const key of Object.keys(structureStats)) structureStats[key] = 0;
}
function bareInterior(excavation) {
  return excavation.state === 'dug' && !(excavation.initial && roomTypeFor(excavation));
}
function paintStructure(ctx, game, view, excavation, box, damp) {
  if (bareInterior(excavation)) drawInterior(ctx, game, view, excavation, box);
  if (damp) {
    ctx.save();
    traceRoom(ctx, box, excavation.shape); ctx.clip();
    drawRoomHumidity(ctx, box, excavation);
    ctx.restore();
  }
  drawShell(ctx, box, excavation);
  drawCoating(ctx, box, excavation);
  drawLining(ctx, box, excavation);
  drawSupports(ctx, box, excavation);
  drawLadder(ctx, game, view, excavation, box);
}
function drawStructure(ctx, game, view, excavation, box) {
  const damp = roomIsDamp(game.sim, excavation);
  const direct = () => paintStructure(ctx, game, view, excavation, box, damp);
  if (!(typeof globalThis.OffscreenCanvas === 'function' || globalThis.document?.createElement)
    || ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over'
    || (ctx.filter && ctx.filter !== 'none') || ctx.shadowBlur || ctx.shadowOffsetX || ctx.shadowOffsetY
    || ctx.getLineDash().length) { direct(); return; }
  const shadow = ctx.shadowColor;
  if (!(shadow === 'transparent' || shadow === '#0000' || shadow === '#00000000' || /^rgba\([^)]*,\s*0(?:\.0*)?\s*\)$/.test(shadow))) { direct(); return; }
  const m = ctx.getTransform(), sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d);
  // A cell of padding retains the bolts driven beyond the rock ceiling.
  const margin = box.cell, width = box.width + margin * 2, height = box.height + margin * 2;
  const pw = Math.ceil(width * sx), ph = Math.ceil(height * sy), bytes = pw * ph * 4;
  if (!Number.isFinite(bytes) || pw <= 0 || ph <= 0 || pw > 4096 || ph > 4096 || bytes > STRUCTURE_BYTES) { direct(); return; }
  let dugBottom = excavation.y;
  if (excavation.state === 'digging' && excavation.kind === 'shaft') {
    for (const index of excavation.dugCells ?? []) dugBottom = Math.max(dugBottom, game.sim.world.coords(index).y + 1);
  }
  const key = JSON.stringify([excavation.id, excavation.x, excavation.y, excavation.w, excavation.h,
    excavation.shape, excavation.state, excavation.kind, excavation.initial, roomTypeFor(excavation),
    excavation.lining, excavation.coating, excavation.supports, roomFloodArt(excavation), damp, dugBottom, box.cell, pw, ph, ctx.lineCap, ctx.lineJoin]);
  let entry = structureCache.get(key);
  if (entry) {
    structureCache.delete(key); structureCache.set(key, entry); structureStats.hits += 1;
  } else {
    let canvas, target;
    try {
      canvas = typeof globalThis.OffscreenCanvas === 'function' ? new OffscreenCanvas(pw, ph) : document.createElement('canvas');
      canvas.width = pw; canvas.height = ph; target = canvas.getContext('2d');
    } catch { /* A disabled offscreen context falls back to the same drawing. */ }
    if (!target) { if (canvas) { canvas.width = 0; canvas.height = 0; } direct(); return; }
    while (structureCache.size && (structureStats.bytes + bytes > STRUCTURE_BYTES || structureCache.size >= STRUCTURE_ENTRIES)) {
      const oldest = structureCache.keys().next().value, previous = structureCache.get(oldest);
      structureCache.delete(oldest); structureStats.bytes -= previous.bytes; structureStats.evictions += 1;
      previous.canvas.width = 0; previous.canvas.height = 0;
    }
    target.scale(pw / width, ph / height);
    target.lineCap = ctx.lineCap; target.lineJoin = ctx.lineJoin;
    const localBox = { left: margin, top: margin, right: margin + box.width, bottom: margin + box.height,
      width: box.width, height: box.height, cell: box.cell };
    const localView = { ...view, sx: x => margin + (x - excavation.x) * box.cell, sy: y => margin + (y - excavation.y) * box.cell };
    paintStructure(target, game, localView, excavation, localBox, damp);
    entry = { canvas, bytes }; structureCache.set(key, entry);
    structureStats.bytes += bytes; structureStats.builds += 1;
  }
  ctx.drawImage(entry.canvas, box.left - margin, box.top - margin, width, height);
}

function drawDoors(ctx, game, view) {
  for (const door of game.sim.doors ?? []) {
    if (game.sim.excavation(door.excavationId)?.state === 'collapsed') continue;
    const x = view.sx(door.x + .5), y = view.sy(door.y + 2);
    if (x + view.cellSize < 0 || x - view.cellSize > view.width || y < 0 || y - view.cellSize * 2.2 > view.height) continue;
    drawArtDoor(ctx, x, y, view.cellSize, { open: door.open, airlock: door.kind === 'airlock' });
  }
}

export function drawRooms(ctx, game, view) {
  ctx.save();
  for (const excavation of game.sim.excavations ?? []) {
    if (excavation.state === 'collapsed') continue;
    const box = boxFor(excavation, view);
    if (!isVisible(box, view, view.cellSize * 2)) continue;
    if (excavation.state === 'planned' || excavation.state === 'digging') drawPlan(ctx, box, excavation, excavation.state === 'digging');
    if (excavation.state === 'digging') drawDugCells(ctx, game, view, excavation, box);
    if ((excavation.state === 'dug' || excavation.state === 'fitted') && !bareInterior(excavation)) drawInterior(ctx, game, view, excavation, box);
    if (excavation.state !== 'planned') {
      drawStructure(ctx, game, view, excavation, box);
    }
  }
  drawDoors(ctx, game, view);
  ctx.restore();
}

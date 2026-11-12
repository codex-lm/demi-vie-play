import { drawColonist as drawArtColonist, samplePose, colonistFeatures, CRANK } from '../../art/colonist.js';
import { bikeLayout, BIKE_GEOMETRY } from '../../art/props-energy.js';
import { ventShaftLayout } from '../../art/props-industrial.js';
import { dormLayout } from '../../art/props-domestic.js';
import { colonistAppearance } from './portraits.js';
import { drawColonistAction } from '../../art/m6/actions.js';
import { colonistM6Action } from './m6-world.js';
import { colonistColdArt, drawColdBreath } from './cold.js';
import { WORK } from '../data/balance.js';
import { gestureGain, ticksPerSecond } from '../data/speeds.js';

// In one tick a person walks at most WALK_CELLS_PER_MINUTE horizontally;
// ladders and elevators only move vertically. A jump of more than two ticks of
// walking is a placement (rescue, return from the surface, a scripted seat),
// not a walk: it is drawn at its new cell instead of sliding across the map
// for the length of a tick.
const MAX_TICK_STEP_X = WORK.WALK_CELLS_PER_MINUTE * 2 + .6;
const MAX_TICK_STEP_Y = Math.max(WORK.WALK_CELLS_PER_MINUTE, WORK.LADDER_CELLS_PER_MINUTE, WORK.ELEVATOR_CELLS_PER_MINUTE) + .6;

const MOVE_EPSILON = 1e-6;

function openLeg(world, column, fromY, toY) {
  const x = Math.round(column), step = toY >= fromY ? 1 : -1;
  for (let y = Math.round(fromY); y !== Math.round(toY) + step; y += step) if (!world.isEmpty(x, y)) return false;
  return true;
}

/** One tick can hold a walk and a climb (reach the ladder, then go up it; or
 * come off it and walk on). The sim only keeps both ends. Returns which leg
 * came first, 'walk' or 'climb', or null when the move is a single straight
 * line. At "Vivre" a tick lasts 0.4 s: a straight diagonal would slide the
 * person through the rock beside the shaft. */
function tickCorner(sim, colonist, prevX, prevY) {
  if (Math.abs(colonist.x - prevX) < MOVE_EPSILON || Math.abs(colonist.y - prevY) < MOVE_EPSILON) return null;
  const world = sim?.world;
  if (typeof world?.isEmpty !== 'function') return null;
  // Walking first means climbing in the arrival column, and the reverse.
  const walkFirst = openLeg(world, colonist.x, prevY, colonist.y);
  const climbFirst = openLeg(world, prevX, prevY, colonist.y);
  if (walkFirst !== climbFirst) return walkFirst ? 'walk' : 'climb';
  if (!walkFirst) return null;
  // Both columns are open (a tall room beside its shaft): the task of the
  // last leg decides. A climber ended on the ladder; a walker left it.
  if (colonist.task === 'climb') return 'walk';
  if (colonist.task === 'walk' || colonist.task === 'carrying') return 'climb';
  return null;
}

/** World position between the previous and the current tick, alpha in [0, 1].
 * A person who moved this tick also reports their gait (moving: 'walk' or
 * 'climb'). With the sim, a walk-and-climb tick follows its corner and names
 * the leg under way (leg, same values); without it the move is a straight line. */
export function interpolatedColonistPosition(colonist, alpha = 0, sim = null) {
  const prevX = Number.isFinite(colonist.prevX) ? colonist.prevX : colonist.x;
  const prevY = Number.isFinite(colonist.prevY) ? colonist.prevY : colonist.y;
  const dx = colonist.x - prevX, dy = colonist.y - prevY;
  if (Math.abs(dx) > MAX_TICK_STEP_X || Math.abs(dy) > MAX_TICK_STEP_Y) return { x: colonist.x, y: colonist.y };
  if (Math.abs(dx) + Math.abs(dy) < MOVE_EPSILON) return { x: colonist.x, y: colonist.y };
  const t = Math.max(0, Math.min(1, Number(alpha) || 0));
  const first = sim ? tickCorner(sim, colonist, prevX, prevY) : null;
  if (!first) return { x: prevX + dx * t, y: prevY + dy * t, moving: Math.abs(dy) > Math.abs(dx) ? 'climb' : 'walk' };
  // Each leg takes the share of the tick its own pace needs.
  const walkTime = Math.abs(dx) / WORK.WALK_CELLS_PER_MINUTE;
  const climbTime = Math.abs(dy) / (Math.abs(dy) > WORK.LADDER_CELLS_PER_MINUTE + .6 ? WORK.ELEVATOR_CELLS_PER_MINUTE : WORK.LADDER_CELLS_PER_MINUTE);
  const walkShare = walkTime / (walkTime + climbTime);
  if (first === 'walk') {
    return t < walkShare ? { x: prevX + dx * (t / walkShare), y: prevY, leg: 'walk', moving: 'walk' }
      : { x: colonist.x, y: prevY + dy * ((t - walkShare) / (1 - walkShare)), leg: 'climb', moving: 'climb' };
  }
  const climbShare = 1 - walkShare;
  return t < climbShare ? { x: prevX, y: prevY + dy * (t / climbShare), leg: 'climb', moving: 'climb' }
    : { x: prevX + dx * ((t - climbShare) / (1 - climbShare)), y: colonist.y, leg: 'walk', moving: 'walk' };
}

// colonist.animation counts ticks of effort; this turns it into pose seconds.
const POSE_RATE = 0.35;
// Limbs never cycle faster than this many pose seconds per real second: about
// five strides, four ladder rungs or three pick swings. A walk at "Vivre" (4 a
// second) is under it and keeps its feet on the ground; a 24-cell ladder
// climbed in one tick, or any move at the faster speeds, would otherwise be a
// blur.
const MAX_LIMB_RATE = 4.8;
const poseClocks = new WeakMap();

/** How drawn gestures follow the ticks at this game speed (see poseTime). */
export function colonistMotion(speed) {
  const rate = ticksPerSecond(speed);
  return { gain: gestureGain(speed), maxStep: rate > 0 ? MAX_LIMB_RATE / rate : Infinity };
}

/** Pose clock of one person at this instant of the current tick.
 * The sim advances colonist.animation once per tick. Drawn as it is, a gesture
 * would hold still for a whole tick (0.4 s at "Vivre") and a pick swing would
 * take ten times longer there than at "Travailler". The renderer therefore
 * keeps its own clock per person: it moves between the last two ticks with
 * alpha, strides follow the distance covered, and gestures made on the spot
 * keep the rhythm of "Travailler" when the game runs slower (motion.gain).
 * Only a caller that passes motion (the frame painter) advances the clock. */
export function poseTime(sim, colonist, alpha = 1, motion = null) {
  const animation = colonist.animation;
  if (!Number.isFinite(animation)) return null;
  const tick = sim?.tick;
  if (!Number.isFinite(tick)) return animation * POSE_RATE;
  let clock = poseClocks.get(colonist);
  // A loaded save, a new scenario or a person edited outside a tick starts
  // over from the plain value.
  if (!clock || tick < clock.tick || animation < clock.animation || (tick === clock.tick && animation !== clock.animation)) {
    if (!motion) return animation * POSE_RATE;
    clock = { tick, animation, from: animation * POSE_RATE, to: animation * POSE_RATE };
    poseClocks.set(colonist, clock);
  } else if (tick > clock.tick) {
    if (!motion) return animation * POSE_RATE;
    const ticks = tick - clock.tick;
    const moved = Math.abs(colonist.x - (colonist.prevX ?? colonist.x)) + Math.abs(colonist.y - (colonist.prevY ?? colonist.y)) > MOVE_EPSILON;
    const raw = (animation - clock.animation) * POSE_RATE;
    const step = Math.min(moved ? raw : raw * (motion.gain ?? 1), (motion.maxStep ?? Infinity) * ticks);
    // Several ticks can run in one frame: alpha only spans the last of them.
    clock.from = clock.to + step * (ticks - 1) / ticks;
    clock.to += step;
    clock.tick = tick;
    clock.animation = animation;
  }
  const t = Math.max(0, Math.min(1, Number(alpha) || 0));
  return clock.from + (clock.to - clock.from) * t;
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx, x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function colonistWorkPose(sim, colonist) {
  if (colonist.suit) return 'suit';
  const task = colonist.task;
  if (task === 'caring') return 'medic';
  if (task !== 'working' && task !== 'repairing' && task !== 'clearing') return task;
  if (task === 'clearing') return 'clear';
  if (task === 'repairing') return 'repair';
  const job = sim?.jobs?.find((candidate) => candidate.id === colonist.jobId);
  // The tick that completes a job keeps working without it (sim/jobs.js,
  // holdWorkPose): draw that job's own gesture, not a pick swing.
  const held = job ? null : colonist.heldWork;
  const excavationId = job?.excavationId ?? held?.excavationId;
  const excavation = sim?.excavation?.(excavationId)
    ?? sim?.excavations?.find((candidate) => candidate.id === excavationId);
  const roomType = excavation?.roomType ?? '';
  const type = job?.type ?? held?.type ?? 'dig';
  if (type === 'dig') return 'dig';
  if (['repair', 'support', 'lining', 'coating', 'fit', 'maintain', 'maintenance'].includes(type)) return 'repair';
  if (type === 'cook' || roomType === 'kitchen' || roomType === 'canteen') return 'cook';
  if (type === 'treat' || type === 'heal' || roomType === 'infirmary') return 'medic';
  if (roomType === 'bikeDynamo') return 'pedal';
  if (['well', 'filterPlant', 'recycler', 'decon', 'pump', 'washroom', 'airFilter', 'scrubber', 'ventShaft',
    'heater', 'heatExchanger', 'geothermal', 'microHydro', 'battery'].includes(roomType)) return 'pump';
  if (['mushroom', 'hydroponics', 'insectFarm', 'ratFarm', 'fishTank', 'algaeTank'].includes(roomType)
    || ['farm', 'cultivate', 'harvest'].includes(type)) return 'farm';
  if (type === 'haul') return 'carry';
  return 'work';
}

export function colonistBodyScale(colonist) {
  const stage = colonist?.lifeStage;
  if (stage === 'baby') return 0.45;
  if (stage === 'child') return 0.58;
  if (stage === 'school') return 0.68;
  if (stage === 'teen') return 0.82;
  if (stage === 'elder') return 0.96;
  const age = Number(colonist?.age);
  if (Number.isFinite(age)) {
    if (age < 5) return 0.45;
    if (age < 12) return 0.62;
    if (age < 16) return 0.82;
    if (age >= 72) return 0.96;
  }
  return 1;
}

function crisisBehavior(colonist) {
  const behavior = colonist.crisis?.behavior ?? colonist.task;
  return ['isolate', 'argue', 'refuseWork', 'surfaceFever'].includes(behavior) ? behavior : null;
}

function drawCrisis(ctx, behavior, size) {
  if (!behavior) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, size * 0.065);
  if (behavior === 'isolate') {
    // One quiet sigh beside the face. The old crossed strokes obscured the
    // head and read as two floating tools over the crouched silhouette.
    ctx.strokeStyle = '#b7b6a4';
    ctx.lineWidth = Math.max(.75, size * .035);
    ctx.beginPath();
    ctx.moveTo(.42 * size, -1.43 * size);
    ctx.bezierCurveTo(.65 * size, -1.48 * size, .48 * size, -1.61 * size, .63 * size, -1.66 * size);
    ctx.stroke();
  } else if (behavior === 'argue') {
    ctx.strokeStyle = '#e0a064';
    line(ctx, -0.24 * size, -1.12 * size, -0.65 * size, -1.38 * size);
    line(ctx, 0.24 * size, -1.12 * size, 0.65 * size, -1.38 * size);
    line(ctx, -0.42 * size, -1.95 * size, -0.22 * size, -1.78 * size);
    line(ctx, -0.22 * size, -1.78 * size, -0.05 * size, -2.02 * size);
    line(ctx, 0.12 * size, -1.82 * size, 0.3 * size, -2.04 * size);
    line(ctx, 0.3 * size, -2.04 * size, 0.48 * size, -1.84 * size);
  } else if (behavior === 'refuseWork') {
    ctx.strokeStyle = '#d27662';
    line(ctx, -0.31 * size, -1.11 * size, 0.28 * size, -0.83 * size);
    line(ctx, 0.31 * size, -1.11 * size, -0.28 * size, -0.83 * size);
    ctx.beginPath();
    ctx.arc(0, -2.02 * size, 0.19 * size, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, -0.14 * size, -2.16 * size, 0.14 * size, -1.88 * size);
  } else {
    ctx.strokeStyle = '#d6ad68';
    line(ctx, 0, -1.8 * size, 0, -2.3 * size);
    line(ctx, 0, -2.3 * size, -0.18 * size, -2.1 * size);
    line(ctx, 0, -2.3 * size, 0.18 * size, -2.1 * size);
    line(ctx, -0.25 * size, -1.12 * size, -0.48 * size, -1.52 * size);
    line(ctx, 0.25 * size, -1.12 * size, 0.48 * size, -1.52 * size);
  }
  ctx.restore();
}


const GAITS = ['walk', 'carry', 'climb'];
const POSES = {
  sleeping: 'sleep', dead: 'sleep', walk: 'walk', climb: 'climb', carrying: 'carry',
  dig: 'dig', clear: 'work', repair: 'work', pump: 'work', farm: 'work', cook: 'work',
  medic: 'work', work: 'work', pedal: 'pedal', crank: 'crank',
  sit: 'sit', eat: 'eat', drink: 'sit', study: 'sit', socialize: 'talk', fall: 'climb',
  isolate: 'idle', argue: 'talk', refuseWork: 'crisis', surfaceFever: 'crisis',
};

export function colonistArtOptions(sim, colonist, time = 0, alpha = 1, motion = null) {
  const appearance = colonistAppearance(sim, colonist);
  // A suit is clothing: it must not erase a ladder climb or force a resting person to walk.
  const workPose = colonistWorkPose(sim, { ...colonist, suit: false });
  const pose = colonist.health <= 0 ? 'sleep' : POSES[workPose] ?? 'idle';
  return {
    ...appearance, pose, suit: Boolean(colonist.suit),
    kind: colonist.kind, domesticated: colonist.domesticated,
    t: poseTime(sim, colonist, alpha, motion) ?? time,
    facing: colonist.direction === -1 ? -1 : 1,
    // No cleanliness system exists yet: only actual dusty tasks, loads or explicit dirt qualify.
    dirty: Boolean(colonist.dirty || ['dig', 'clear'].includes(workPose)
      || ['stone', 'coal', 'clayRes', 'sandRes'].includes(colonist.carrying?.resource ?? colonist.carrying?.key)),
  };
}

function drawActivityAccessory(ctx, colonist, size, time, facing) {
  ctx.save();
  ctx.scale(size * facing, size);
  if (colonist.task === 'drink') {
    ctx.fillStyle = '#a9c5c2';
    ctx.fillRect(.27, -.76, .18, .22);
    ctx.strokeStyle = '#d4e0d4'; ctx.lineWidth = .035;
    ctx.beginPath(); ctx.arc(.46, -.65, .07, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  } else if (colonist.task === 'socialize') {
    circle(ctx, .46, -1.85, .032, '#d8caa6');
    circle(ctx, .57, -1.94, .043, '#d8caa6');
  } else if (colonist.task === 'clearing') {
    const motion = Math.sin(time * 7) * .06;
    ctx.strokeStyle = '#80603c'; ctx.lineWidth = .045;
    line(ctx, .35, -1.12 + motion, .70, -.18 + motion);
    ctx.fillStyle = '#9ba5a2'; ctx.beginPath();
    ctx.moveTo(.59, -.25 + motion); ctx.lineTo(.83, -.17 + motion);
    ctx.lineTo(.75, .02 + motion); ctx.lineTo(.56, -.03 + motion); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// The initial shaft's manual ventilation is a real simulation job, not an electric room.
// Its compact crank shares the operator's hand target; it does not light the shaft.
function drawManualCrank(ctx, x, y, size, time, facing) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size * facing, size);
  const { x: cx, y: cy, radius, speed } = CRANK;
  ctx.lineWidth = .07; ctx.strokeStyle = '#506763';
  line(ctx, cx, -.08, cx, cy); line(ctx, cx - .2, -.08, cx + .2, -.08);
  ctx.strokeStyle = '#ad9368'; ctx.lineWidth = .045;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  const hx = cx + Math.cos(time * speed) * radius;
  const hy = cy + Math.sin(time * speed) * radius;
  line(ctx, cx, cy, hx, hy); circle(ctx, hx, hy, .048, '#ded0a8');
  ctx.restore();
}

function machinePlacement(sim, colonist, options, time) {
  if (!['pedal', 'crank'].includes(options.pose)) return null;
  const job = sim.jobs?.find((candidate) => candidate.id === colonist.jobId);
  const room = sim.excavation?.(job?.excavationId) ?? sim.excavations?.find((candidate) => candidate.id === job?.excavationId);
  if (!room || room.state !== 'fitted') return null;
  const running = !room.disabled && (room.powered !== false || options.pose === 'crank' || options.pose === 'pedal');
  const t = running ? time : 0;
  if (options.pose === 'pedal' && room.roomType === 'bikeDynamo') {
    const bikes = bikeLayout(room.w, room.h);
    const workers = sim.colonists.filter((person) => person.health > 0 && person.task === 'working'
      && sim.jobs?.some((entry) => entry.id === person.jobId && entry.excavationId === room.id));
    const index = workers.findIndex((person) => person.id === colonist.id);
    const bike = bikes[Math.max(0, index) % bikes.length];
    return { x: room.x + bike.x + BIKE_GEOMETRY.crank.x * bike.scale, y: room.y + bike.y, scale: bike.scale, t, facing: 1 };
  }
  if (options.pose === 'crank' && room.roomType === 'ventShaft') {
    const machine = ventShaftLayout(room.w, room.h);
    const ageScale = options.age === 'child' ? .7 : options.age === 'elder' ? .95 : 1;
    const pose = samplePose('crank', t, options.age), width = colonistFeatures(options.seed, options.age).width;
    const x = machine.crank.x - (Math.cos(pose.lean) * width * .36 - Math.sin(pose.lean) * -.39 + pose.hip[0]) * ageScale;
    const y = machine.crank.y - (Math.sin(pose.lean) * width * .48 + Math.cos(pose.lean) * -.39 + pose.hip[1]) * ageScale;
    return { x: room.x + x, y: room.y + y, scale: 1, t, facing: 1,
      handTarget: { x: machine.crank.x + Math.cos(t * 3) * machine.crank.radius + machine.crank.handleOffset - x,
        y: machine.crank.y + Math.sin(t * 3) * machine.crank.radius - y } };
  }
  return null;
}

function sleepingRoom(sim, colonist) {
  const rooms = sim.excavations?.filter((room) => (room.roomType === 'dorm' || room.label === 'shelterDorm')
    && (room.state === 'fitted' || room.initial)) ?? [];
  const inside = (room, x, y) => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
  return rooms.find((room) => room.id === colonist.personal?.excavationId)
    ?? rooms.find((room) => inside(room, colonist.x, colonist.y))
    ?? rooms.find((room) => inside(room, colonist.bedX, colonist.bedY));
}

function sleepingPlacement(sim, colonist, options, bodyScale, artScale) {
  if (colonist.task !== 'sleeping') return null;
  const room = sleepingRoom(sim, colonist);
  if (!room) return null;
  const beds = dormLayout(room.w, room.h, room.beds ?? (room.label === 'shelterDorm' ? 12 : 0)).beds;
  // Keep serialized preferences, resolving collisions between current sleepers deterministically.
  const sleepers = sim.colonists.filter((person) => person.task === 'sleeping' && sleepingRoom(sim, person)?.id === room.id)
    .slice().sort((a, b) => (a.bedIndex ?? a.id) - (b.bedIndex ?? b.id) || a.id - b.id);
  const used = new Set();
  let slot = 0;
  for (const sleeper of sleepers) {
    slot = Math.abs(Math.trunc(sleeper.bedIndex ?? sleeper.id ?? 0)) % beds.length;
    for (let offset = 0; used.has(slot) && offset < beds.length; offset += 1) slot = (slot + 1) % beds.length;
    used.add(slot);
    if (sleeper.id === colonist.id) break;
  }
  const bed = beds[slot];
  options.facing = 1;
  const scale = Math.min(bodyScale, bed.scale);
  return { x: room.x + bed.x, y: room.y + bed.y, bodyScale: scale, cellScale: scale / artScale, artScale, machine: false, options };
}

/** The child is already painted in these arms. A stale/orphaned link hides nobody. */
export function carryingParent(sim, child) {
  if (child.carriedBy == null || !(child.health > 0) || child.dead) return null;
  return sim.colonists.find(parent => parent.id === child.carriedBy && parent.health > 0 && !parent.dead
    && parent.activity?.type === 'carryingChild' && parent.activity.phase === 'active'
    && parent.activity.childId === child.id) ?? null;
}

/** Visual feet in world metres, shared by silhouettes and selection arrows. */
export function colonistVisualPosition(sim, colonist, alpha = 0, time = 0, occupants = null, motion = null) {
  const activity = colonistM6Action(sim, colonist);
  const step = interpolatedColonistPosition(colonist, alpha, sim);
  let { x: worldX, y: worldY } = step;
  const options = colonistArtOptions(sim, colonist, time, alpha, motion);
  const share = Math.max(0, Math.min(1, Number(alpha) || 0));
  // An authored action (carrying a child, climbing out) and a fall keep their own drawing.
  const selfMoving = !activity && colonist.task !== 'fall' && colonist.health > 0;
  // The tick that brings someone to their bed, their seat or their work only
  // keeps the new task. Until that tick is over they are still on the way: at
  // "Vivre" they would otherwise slide for 0.4 s already digging or asleep,
  // or jump onto the bed or the bike before reaching it.
  const onTheWay = selfMoving && Boolean(step.moving) && share < 1 && !GAITS.includes(options.pose);
  // A tick that walks to a ladder and climbs it only keeps the last task:
  // each leg is drawn with its own gait.
  if (onTheWay || (selfMoving && step.leg && GAITS.includes(options.pose))) {
    options.pose = (step.leg ?? step.moving) === 'climb' ? 'climb' : colonist.carrying ? 'carry' : 'walk';
  }
  if (onTheWay) options.onTheWay = true;
  if (!onTheWay && colonist.task === 'sleeping' && Number.isFinite(colonist.bedX) && Number.isFinite(colonist.bedY)) {
    worldX = colonist.bedX; worldY = colonist.bedY;
  } else if (activity?.action !== 'climbingOut' && activity?.action !== 'listeningRock') {
    const key = `${Math.round(colonist.x)}:${Math.round(colonist.y)}`;
    const group = occupants?.get(key) ?? sim.colonists.filter((person) => person.health > 0 && person.task !== 'sleeping' && !carryingParent(sim, person)
      && Math.round(person.x) === Math.round(colonist.x) && Math.round(person.y) === Math.round(colonist.y)).map((person) => person.id);
    const slot = group.indexOf(colonist.id);
    // A sleeper still walking to bed is not counted among the people standing there.
    if (group.length > 1 && (slot >= 0 || !onTheWay)) worldX += (slot - (group.length - 1) / 2) * Math.min(.24, .72 / group.length);
    // Someone on the way to their seat drifts to its small offset as they arrive.
    if (['idle', 'sit', 'socialize', 'drink'].includes(colonist.task)) worldX += Math.sin(colonist.id * 12.9898 + .7) * (group.length > 1 ? .055 : .14) * (onTheWay ? share : 1);
  }
  if (activity) {
    options.action = activity.action;
    if (activity.child) options.child = { ...colonistAppearance(sim, activity.child), lifeStage: activity.child.lifeStage };
    // Social animation is measured in visual seconds. Idle simulation animation
    // advances too slowly to read the strumming at normal game speed.
    if (['music', 'celebrating', 'mourning'].includes(activity.action)) options.t = time + colonist.id * .41;
    if (activity.action === 'listeningRock') {
      const job = sim.jobs?.find(j => j.id === colonist.jobId && j.type === 'dig' && j.status === 'active');
      const target = Number.isInteger(job?.cellIndex) ? sim.world.coords(job.cellIndex) : null;
      if (target) options.facing = Math.sign(target.x - colonist.x) || options.facing;
      // A distant work target is not a wall under the ear. Keep the real feet,
      // use the cupped-ear pose, and leave approach/path changes to simulation.
      options.listeningContact = Boolean(target && Math.abs(target.x - colonist.x) <= 1
        && target.x !== Math.round(colonist.x) && Math.abs(target.y - colonist.y) <= 1);
    }
  }
  if (colonist.task === 'socialize') {
    const partner = sim.colonists.find((other) => other.id === (colonist.id ^ 1)
      && other.health > 0 && other.task === 'socialize' && other.idleActivity?.type === 'socialize'
      && other.idleActivity.phase === 'active' && Math.abs(other.x - colonist.x) <= 1.25
      && Math.abs(other.y - colonist.y) < .5);
    if (partner) options.facing = Math.sign(partner.x - colonist.x) || (colonist.id % 2 ? -1 : 1);
  }
  const cold = colonistColdArt(sim, colonist);
  options.coldIntensity = cold?.intensity ?? 0;
  // A resting person folds into their coat at the dangerous threshold. Work,
  // walking, sleeping, machine and authored activity contacts remain truthful.
  if (cold?.dangerous && !options.action && ['idle', 'sit', 'talk'].includes(options.pose)) options.pose = 'crisis';
  const bodyScale = colonistBodyScale(colonist);
  const artScale = options.age === 'child' ? .7 : options.age === 'elder' ? .95 : 1;
  if (activity?.action === 'climbingOut') {
    const shaft = sim.excavations?.find(room => room.kind === 'shaft' && room.state !== 'planned'
      && room.state !== 'collapsed' && colonist.x >= room.x && colonist.x < room.x + room.w
      && colonist.y >= room.y - 1 && colonist.y < room.y + room.h);
    options.facing = 1;
    // The room owns the fixed ladder. Its geometry is top+.20+n*.34 metres.
    // Feet/hand phase follows interpolated world height, so planted contacts stay put.
    options.worldLadder = { top: shaft?.y ?? Math.floor(worldY), feetY: worldY + 1, bodyScale };
    return { x: (shaft ? shaft.x + shaft.w / 2 : worldX + .5) - .5 * bodyScale, y: worldY + 1,
      bodyScale, cellScale: bodyScale / artScale, artScale, machine: false, options };
  }
  const sleeping = onTheWay ? null : sleepingPlacement(sim, colonist, options, bodyScale, artScale);
  if (sleeping) return sleeping;
  const machine = machinePlacement(sim, colonist, options, time);
  if (machine) Object.assign(options, { t: machine.t, facing: machine.facing, handTarget: machine.handTarget });
  return { x: machine?.x ?? worldX + .5, y: machine?.y ?? worldY + 1,
    bodyScale, cellScale: machine?.scale ?? bodyScale / artScale, artScale, machine: Boolean(machine), options };
}

// Picking consumes the last painted placements: interpolation, bed slots and
// machine anchors cannot diverge from the image the player actually clicked.
const paintedColonists = new WeakMap();

export function colonistVisualBounds(placement) {
  const { options } = placement;
  const scale = placement.cellScale * placement.artScale;
  const facing = options.facing === -1 ? -1 : 1;
  let left, right, top, bottom;
  if (options.action) {
    // The extended poses include a book, a child or an outstretched chalk hand.
    // Keep picking faithful to the same last painted placement.
    [left, right, top, bottom] = options.action === 'climbingOut' ? [-.05, .97, -2.15, .25] : [-.68, 1.02, -2.15, .16];
  } else if (options.pose === 'sleep') {
    [left, right, top, bottom] = [-.96, .91, -.54, .08];
  } else {
    const pose = samplePose(options.pose, options.t, options.age);
    const width = colonistFeatures(options.seed, options.age).width;
    const bodyPoint = (x, y) => [pose.hip[0] + Math.cos(pose.lean) * width * x - Math.sin(pose.lean) * y,
      pose.hip[1] + Math.sin(pose.lean) * width * x + Math.cos(pose.lean) * y];
    const points = [pose.hip, ...pose.feet, ...pose.hands.map(p => bodyPoint(...p)),
      bodyPoint(-.26, -.5), bodyPoint(.26, -.5), bodyPoint(0, -.93)];
    left = Math.min(...points.map(p => p[0])) - .23;
    right = Math.max(...points.map(p => p[0])) + .25;
    top = Math.min(...points.map(p => p[1])) - .29;
    bottom = Math.max(...points.map(p => p[1])) + .08;
  }
  return { left: placement.x + (facing < 0 ? -right : left) * scale,
    right: placement.x + (facing < 0 ? -left : right) * scale,
    top: placement.y + top * scale, bottom: placement.y + bottom * scale };
}

export function hitTestColonist(game, point) {
  const painted = paintedColonists.get(game);
  const entries = painted?.sim === game.sim ? painted.entries : game.sim.colonists.filter(person => !carryingParent(game.sim, person)).map(colonist => ({
    colonist, placement: colonistVisualPosition(game.sim, colonist, 0, game.renderTime ?? 0),
  }));
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const { colonist, placement } = entries[i];
    if ((colonist.health ?? 100) <= 0) continue;
    const bounds = colonistVisualBounds(placement);
    if (point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom) return colonist;
  }
  return null;
}

export function drawColonists(ctx, game, view) {
  const entries = [];
  paintedColonists.set(game, { sim: game.sim, entries });
  const size = view.cellSize;
  const alpha = view.alpha ?? 0;
  const time = game.options?.reduceMotion ? 0 : game.renderTime ?? view.now ?? 0;
  const motion = colonistMotion(game.speed || game.previousSpeed);
  const occupants = new Map();
  for (const colonist of game.sim.colonists) {
    if (colonist.health <= 0 || colonist.task === 'sleeping' || carryingParent(game.sim, colonist)) continue;
    const key = `${Math.round(colonist.x)}:${Math.round(colonist.y)}`;
    if (!occupants.has(key)) occupants.set(key, []);
    occupants.get(key).push(colonist.id);
  }
  for (const colonist of game.sim.colonists) {
    if ((colonist.health <= 0 && colonist.bodyLocation === 'ossuary') || carryingParent(game.sim, colonist)) continue;
    const placement = colonistVisualPosition(game.sim, colonist, alpha, time, occupants, motion);
    if (!game.sim.world.isVisible(Math.round(placement.x - .5), Math.round(placement.y - 1))) continue;
    const { options, bodyScale, artScale, machine } = placement;
    if (game.options?.reduceMotion) options.t = 0;
    const x = view.sx(placement.x), y = view.sy(placement.y);
    if (x < -size * 2 || x > view.width + size * 2 || y < -size * 3 || y > view.height + size * 2) continue;
    entries.push({ colonist, placement });
    const cell = size * placement.cellScale;
    const behavior = crisisBehavior(colonist);
    const selected = game.selection?.type === 'colonist' && game.selection.id === colonist.id;
    if (selected) {
      ctx.save(); ctx.strokeStyle = '#f2cf72'; ctx.lineWidth = Math.max(1, size * .06);
      ctx.beginPath(); ctx.ellipse(x, y, size * .48 * bodyScale, size * .15 * bodyScale, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (options.pose === 'crank' && !machine) drawManualCrank(ctx, x, y, cell * artScale, options.t, options.facing);
    if (options.action) {
      drawColonistAction(ctx, x, y, { ...options, cellPx: cell }, options.action, options.t);
    } else drawArtColonist(ctx, x, y, cell, options);
    ctx.save(); ctx.translate(x, y);
    if (!options.onTheWay) drawActivityAccessory(ctx, colonist, size * bodyScale, options.t, options.facing);
    drawCrisis(ctx, behavior, size * bodyScale);
    ctx.restore();
    if (options.coldIntensity) drawColdBreath(ctx, placement, colonist, { intensity: options.coldIntensity }, view, time);
    if (selected && size >= 10) {
      ctx.save(); ctx.font = `${Math.max(10, size * .55)}px system-ui`; ctx.textAlign = 'center';
      ctx.fillStyle = behavior ? '#e7b083' : '#f1e6cf'; ctx.shadowColor = '#101315'; ctx.shadowBlur = 3;
      ctx.fillText(colonist.name, x, y - size * (1.95 * bodyScale + (behavior ? .35 : 0))); ctx.restore();
    }
  }
}

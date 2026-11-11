import { WATER, WORK, WORLD } from '../data/balance.js';
import { PEOPLE } from '../data/people.js';
import { releaseJob } from './jobs.js';
import { findPath, isWalkable } from './nav.js';
import { surfaceHatch } from './surface.js';

const EPSILON = 1e-6;

function clearCrewActivity(sim, colonist) {
  if (colonist.activity?.type === 'celebrating') delete colonist.celebration;
  delete colonist.activity;
  const child = sim.colonists.find((person) => person.carriedBy === colonist.id);
  if (!child) return;
  delete child.carriedBy;
  child.awaitingCarry = child.health > 0 && !child.dead;
  child.x = colonist.x;
  child.y = colonist.y;
  child.prevX = colonist.x;
  child.prevY = colonist.y;
  child.path = [];
  child.pathIndex = 0;
  child.pathGoal = null;
  child.task = child.health > 0 && !child.dead ? 'idle' : 'dead';
}

function at(colonist, x, y) {
  return Math.abs(colonist.x - x) < EPSILON && Math.abs(colonist.y - y) < EPSILON;
}

function livingColonist(sim, member) {
  const colonist = sim.colonists.find((candidate) => candidate.id === member.colonistId);
  return colonist && colonist.health > 0 && !colonist.dead ? colonist : null;
}

function syncPath(colonist, member) {
  colonist.path = member.path;
  colonist.pathIndex = member.pathIndex;
  colonist.pathGoal = member.pathGoal ?? null;
  colonist.navRevision = member.navRevision ?? -1;
}

function clearPath(colonist, member) {
  member.path = [];
  member.pathIndex = 0;
  member.pathGoal = null;
  syncPath(colonist, member);
}

function movePath(sim, colonist, member) {
  let moved = 0;
  while (member.pathIndex < member.path.length) {
    const next = member.path[member.pathIndex];
    let speed = next.climb
      ? (next.elevator ? WORK.ELEVATOR_CELLS_PER_MINUTE : WORK.LADDER_CELLS_PER_MINUTE)
      : WORK.WALK_CELLS_PER_MINUTE;
    const waterRatio = sim.world.inBounds(next.x, next.y)
      ? sim.world.water[sim.world.index(next.x, next.y)] / WATER.MAX_PER_CELL : 0;
    if (waterRatio >= WATER.WADING_MIN_RATIO) speed *= WATER.WADING_SPEED_FACTOR;
    const remaining = speed - moved;
    if (remaining <= EPSILON) break;
    const dx = next.x - colonist.x;
    const dy = next.y - colonist.y;
    const distance = Math.abs(dx) + Math.abs(dy);
    // Same rule as colonists: a one-row step is done whole, never stopped on
    // the open corner above the ledge.
    if (next.step && distance > remaining && moved > 0) break;
    if (distance <= remaining || distance < EPSILON || next.step) {
      colonist.x = next.x;
      colonist.y = next.y;
      moved += distance;
      member.pathIndex += 1;
    } else {
      colonist.x += Math.sign(dx) * Math.min(Math.abs(dx), remaining);
      const left = remaining - Math.abs(dx);
      if (left > 0) colonist.y += Math.sign(dy) * Math.min(Math.abs(dy), left);
      moved = speed;
    }
    if (dx !== 0) colonist.direction = Math.sign(dx);
    colonist.task = next.climb ? 'climb' : 'walk';
    if (moved >= speed - EPSILON) break;
  }
  member.path ??= [];
  colonist.animation += moved * 2;
  syncPath(colonist, member);
}

function moveToward(colonist, x, y, speed, task) {
  const dx = x - colonist.x;
  const dy = y - colonist.y;
  const distance = Math.abs(dx) + Math.abs(dy);
  const amount = Math.min(distance, speed);
  if (distance <= EPSILON) return true;
  const horizontal = Math.min(Math.abs(dx), amount);
  colonist.x += Math.sign(dx) * horizontal;
  colonist.y += Math.sign(dy) * Math.min(Math.abs(dy), amount - horizontal);
  if (dx !== 0) colonist.direction = Math.sign(dx);
  colonist.task = task;
  colonist.animation += amount * 2;
  return amount >= distance - EPSILON;
}

function hatchApproach(sim, colonist, hatch) {
  for (let y = hatch.y; y < sim.world.height && sim.world.isEmpty(hatch.x, y); y += 1) {
    if (!isWalkable(sim, hatch.x, y)) continue;
    const target = { x: hatch.x, y };
    if (Math.round(colonist.x) === target.x && Math.round(colonist.y) === target.y) return { target, path: [] };
    const path = findPath(sim, colonist, target);
    if (path.length > 0) return { target, path };
  }
  return null;
}

// A colonist can join a surface crew only if it can walk to the hatch now and
// is not cut off from the colony's supplies (stranded on a ledge or in a pit):
// otherwise it would wait for the crew forever, out of reach of food and
// water. Without an open hatch column (a test colony) nothing is checked.
export function canJoinSurfaceCrew(sim, colonist) {
  if (colonist.strandedSince != null) return false;
  const hatch = surfaceHatch(sim);
  if (!sim.world.inBounds(hatch.x, hatch.y) || !sim.world.isEmpty(hatch.x, hatch.y)) return true;
  if (Math.round(colonist.y) < WORLD.SURFACE_Y) return true;
  return hatchApproach(sim, colonist, hatch) !== null;
}

function pathToHatch(sim, colonist, member, hatch) {
  if (at(colonist, hatch.x, hatch.y)) {
    member.climbingHatch = false;
    clearPath(colonist, member);
    return true;
  }
  if (member.climbingHatch) {
    if (!moveToward(colonist, hatch.x, hatch.y, WORK.LADDER_CELLS_PER_MINUTE, 'climb')) return false;
    member.climbingHatch = false;
    clearPath(colonist, member);
    return true;
  }
  if (member.pathGoal?.startsWith('surface-hatch:') !== true || member.navRevision !== sim.world.revision
    || !Array.isArray(member.path) || member.pathIndex >= member.path.length) {
    const approach = hatchApproach(sim, colonist, hatch);
    if (!approach) {
      clearPath(colonist, member);
      colonist.task = 'idle';
      return false;
    }
    member.path = approach.path;
    member.pathIndex = 0;
    member.approachY = approach.target.y;
    member.pathGoal = `surface-hatch:${hatch.x}:${approach.target.y}`;
    member.navRevision = sim.world.revision;
    syncPath(colonist, member);
  }
  movePath(sim, colonist, member);
  if (!at(colonist, hatch.x, member.approachY)) {
    if (member.path.length === 0) moveToward(colonist, hatch.x, member.approachY, WORK.WALK_CELLS_PER_MINUTE, 'walk');
    return false;
  }
  member.climbingHatch = true;
  clearPath(colonist, member);
  return false;
}

function updateOutbound(sim, crew, member, colonist, hatch) {
  if (member.phase === 'toHatch') {
    if (!pathToHatch(sim, colonist, member, hatch)) return;
    member.phase = 'away';
  }
  if (colonist.y >= WORLD.SURFACE_Y) {
    clearPath(colonist, member);
    if (!moveToward(colonist, hatch.x, WORLD.SURFACE_Y - 1, WORK.LADDER_CELLS_PER_MINUTE, 'climb')) return;
  }
  if (!moveToward(colonist, crew.destinationX, WORLD.SURFACE_Y - 1, WORK.WALK_CELLS_PER_MINUTE, 'walk')) return;
  member.phase = 'surface';
  colonist.task = 'working';
  clearPath(colonist, member);
}

function updateReturning(member, colonist, hatch) {
  if (colonist.y >= WORLD.SURFACE_Y) {
    member.phase = 'inside';
    colonist.task = 'idle';
    clearPath(colonist, member);
    return;
  }
  if (!at(colonist, hatch.x, WORLD.SURFACE_Y - 1)) {
    moveToward(colonist, hatch.x, WORLD.SURFACE_Y - 1, WORK.WALK_CELLS_PER_MINUTE, 'walk');
    return;
  }
  if (moveToward(colonist, hatch.x, hatch.y, WORK.LADDER_CELLS_PER_MINUTE, 'climb')) {
    member.phase = 'inside';
    colonist.task = 'idle';
    clearPath(colonist, member);
  }
}

export function createSurfaceCrew(sim, { id, kind, colonistIds, destinationX }) {
  const crew = {
    id,
    kind,
    colonistIds: [...colonistIds],
    destinationX: Math.max(0, Math.min(sim.world.width - 1, Math.round(destinationX))),
    phase: 'toHatch',
    returning: false,
    members: colonistIds.map((colonistId) => ({ colonistId, path: [], pathIndex: 0, phase: 'toHatch' })),
  };
  const ids = new Set(colonistIds);
  for (const colonist of sim.colonists) {
    if (!ids.has(colonist.id)) continue;
    if (colonist.jobId !== null) releaseJob(sim, colonist);
    clearCrewActivity(sim, colonist);
    colonist.surfaceCrewId = id;
    colonist.suit = true;
    colonist.personal = null;
    colonist.idleActivity = null;
    colonist.crisis = { ...(colonist.crisis ?? {}), behavior: null };
    colonist.task = 'walk';
    colonist.path = [];
    colonist.pathIndex = 0;
    colonist.pathGoal = null;
  }
  return crew;
}

export function updateSurfaceCrew(sim, crew) {
  if (!crew || crew.phase === 'inside') return crew?.phase ?? 'inside';
  const hatch = surfaceHatch(sim);
  if (!crew.returning && crew.phase !== 'returning' && crew.members.some((member) => {
    const colonist = livingColonist(sim, member);
    return colonist && (colonist.age ?? PEOPLE.ADULT_AGE) < PEOPLE.MINIMUM_WORK_AGE;
  })) {
    crew.childRecall = true;
    sendSurfaceCrewHome(crew);
    sim.log('warning', 'eventSurfaceChildRecall');
  }
  const living = [];
  for (const member of crew.members) {
    member.path = Array.isArray(member.path) ? member.path : [];
    member.pathIndex = Number.isFinite(member.pathIndex) ? member.pathIndex : 0;
    const colonist = livingColonist(sim, member);
    if (!colonist) {
      const deceased = sim.colonists.find((candidate) => candidate.id === member.colonistId);
      if (deceased) clearCrewActivity(sim, deceased);
      member.phase = 'inside';
      continue;
    }
    const previousY = colonist.y;
    clearCrewActivity(sim, colonist);
    living.push({ member, colonist });
    const outbound = !crew.returning && crew.phase !== 'returning';
    if (!outbound) {
      member.phase = member.phase === 'inside' ? 'inside' : 'returning';
      updateReturning(member, colonist, hatch);
    } else {
      updateOutbound(sim, crew, member, colonist, hatch);
    }
    if (outbound && colonist.task === 'climb' && colonist.y < previousY - EPSILON) {
      colonist.activity = { type: 'climbingOut', phase: 'active' };
    }
  }
  if (living.length === 0) {
    crew.phase = 'lost';
    return crew.phase;
  }
  if (crew.returning || crew.phase === 'returning') {
    if (living.every(({ member }) => member.phase === 'inside')) releaseSurfaceCrew(sim, crew);
    else crew.phase = 'returning';
    return crew.phase;
  }
  crew.phase = living.every(({ member }) => member.phase === 'surface') ? 'surface' : 'toHatch';
  return crew.phase;
}

export function sendSurfaceCrewHome(crew) {
  if (!crew || crew.phase === 'inside') return;
  crew.returning = true;
  crew.phase = 'returning';
  for (const member of crew.members) {
    if (member.phase !== 'inside') member.phase = 'returning';
    member.path = [];
    member.pathIndex = 0;
    member.pathGoal = null;
    member.climbingHatch = false;
  }
}

export function releaseSurfaceCrew(sim, crew) {
  for (const member of crew.members) member.phase = 'inside';
  for (const colonist of sim.colonists) {
    if (colonist.surfaceCrewId !== crew.id) continue;
    clearCrewActivity(sim, colonist);
    colonist.surfaceCrewId = null;
    colonist.suit = false;
    colonist.unauthorizedSurface = false;
    colonist.task = colonist.health > 0 && !colonist.dead ? 'idle' : 'dead';
    colonist.path = [];
    colonist.pathIndex = 0;
    colonist.pathGoal = null;
  }
  crew.phase = 'inside';
}

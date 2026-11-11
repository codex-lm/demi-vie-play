import { NEEDS, WATER } from '../data/balance.js';
import { M6 } from '../data/m6.js';
import { releaseJob } from './jobs.js';
import { insideExcavation } from './networks.js';

export function usableActivityRoom(room, roomType = null) {
  return room && (!roomType || room.roomType === roomType)
    && (room.state === 'fitted' || room.state === 'dug' || room.initial)
    && room.state !== 'collapsed' && !room.disabled
    && (room.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

export function hasCriticalNeed(colonist) {
  return colonist.hunger >= NEEDS.CRITICAL_NEED_THRESHOLD
    || colonist.thirst >= NEEDS.CRITICAL_NEED_THRESHOLD;
}

export function clearActivity(colonist, type = null) {
  if (!colonist.activity || (type && colonist.activity.type !== type)) return;
  if (colonist.activity.type === 'celebrating') delete colonist.celebration;
  delete colonist.activity;
}

export function beginCelebration(sim, colonist, room) {
  if (colonist.jobId !== null) releaseJob(sim, colonist);
  const child = sim.colonists.find((person) => person.carriedBy === colonist.id);
  if (child) {
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
  colonist.personal = null;
  colonist.idleActivity = null;
  colonist.path = [];
  colonist.pathIndex = 0;
  colonist.pathGoal = null;
  colonist.task = 'celebrating';
  colonist.celebration = { roomId: room.id, until: sim.tick + M6.FESTIVAL_TICKS };
  colonist.activity = { type: 'celebrating', phase: 'active' };
}

export function updateCelebration(sim, colonist) {
  if (colonist.activity?.type !== 'celebrating') return false;
  const celebration = colonist.celebration;
  const room = sim.excavation(celebration?.roomId);
  if (!celebration || celebration.until <= sim.tick || hasCriticalNeed(colonist) || colonist.surfaceCrewId
    || !usableActivityRoom(room, 'commons')
    || !insideExcavation(sim, room, colonist.x, colonist.y)) {
    clearActivity(colonist, 'celebrating');
    colonist.task = 'idle';
    colonist.pathGoal = null;
    return false;
  }
  colonist.task = 'celebrating';
  colonist.animation += 0.04;
  colonist.path = [];
  colonist.pathIndex = 0;
  return true;
}

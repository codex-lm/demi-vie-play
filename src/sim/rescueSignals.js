// Pure observations shared by the room panel, sound and wall marks. Nothing
// here starts digging, changes a need, writes a journal entry or advances RNG.
import { CELL } from '../data/balance.js';
import { RESCUE_SIGNALS } from '../data/rescueSignals.js';
import { trappedSurvivors } from './collapseRescue.js';

export function survivorCondition(person) {
  const need = Math.max(person.hunger ?? 0, person.thirst ?? 0);
  if (person.health <= RESCUE_SIGNALS.FAINT_HEALTH || need >= RESCUE_SIGNALS.FAINT_NEED
    || (person.air ?? 100) <= RESCUE_SIGNALS.FAINT_AIR) return 'faint';
  if (person.health <= RESCUE_SIGNALS.WEAK_HEALTH || need >= RESCUE_SIGNALS.WEAK_NEED
    || (person.air ?? 100) <= RESCUE_SIGNALS.WEAK_AIR) return 'weak';
  return 'holding';
}

export function rescueStatus(sim, room) {
  if (room?.state !== 'collapsed') return null;
  const survivors = trappedSurvivors(sim, room);
  if (!survivors.length) return null;
  const conditions = survivors.map(survivorCondition);
  const condition = conditions.includes('faint') ? 'faint' : conditions.includes('weak') ? 'weak' : 'holding';
  const passages = (sim.excavations ?? []).filter(passage => passage.rescueSourceId === room.id
    && passage.state !== 'collapsed');
  const cells = new Set(passages.flatMap(passage => passage.cells ?? []));
  const opened = new Set(passages.flatMap(passage => passage.dugCells ?? []));
  const cleared = [...cells].filter(index => sim.world?.states
    ? sim.world.states[index] === CELL.EMPTY : opened.has(index)).length;
  const pending = (sim.jobs ?? []).some(job => passages.some(passage => passage.id === job.excavationId)
    && job.type === 'dig' && job.status !== 'done' && job.status !== 'cancelled' && job.colonistId != null);
  return {
    count: survivors.length,
    names: survivors.map(person => person.name),
    survivors,
    condition,
    startedTick: room.collapseTick ?? 0,
    passage: { count: passages.length, total: cells.size, cleared,
      state: cells.size > 0 && cleared === cells.size ? 'open' : pending ? 'digging' : 'waiting' },
  };
}

/** One series has exactly one stroke per living person, then a quiet gap.
 * Tick-based rhythm keeps sound, marks and the last-knock journal time aligned.
 * It observes the clock without ever changing the simulation. */
export function rescueKnockFrame(status, tick = 0) {
  if (!status?.count) return null;
  const cadence = RESCUE_SIGNALS.CADENCE[status.condition];
  const duration = (status.count - 1) * cadence.gap + cadence.rest;
  const start = status.startedTick ?? 0;
  const time = Math.max(0, (Number.isFinite(tick) ? tick : start) - start);
  const cycle = Math.floor(time / duration);
  const phase = time - cycle * duration;
  const index = Math.floor((phase + 1e-9) / cadence.gap);
  const age = Math.max(0, phase - index * cadence.gap);
  return {
    key: `${start}:${status.condition}:${status.count}:${cycle}:${index}`,
    cycle, index, duration, tick: start + cycle * duration + Math.min(index, status.count - 1) * cadence.gap,
    active: tick >= start && index < status.count && age < RESCUE_SIGNALS.PULSE_TICKS,
    progress: Math.min(1, age / RESCUE_SIGNALS.PULSE_TICKS),
  };
}

export function lastRescueKnockTick(status, tick, personId = null) {
  const frame = rescueKnockFrame(status, tick);
  if (!frame) return null;
  const start = status.startedTick ?? 0;
  if (tick < start) return null;
  if (personId == null) return frame.tick;
  const index = status.survivors.findIndex(person => person.id === personId);
  if (index < 0) return null;
  const cadence = RESCUE_SIGNALS.CADENCE[status.condition];
  let last = start + frame.cycle * frame.duration + index * cadence.gap;
  if (last > tick) last -= frame.duration;
  return last >= start ? last : null;
}

/** Keep the audible impact and its visible mark on the same wall. */
export function rescueSignalPosition(room) {
  return { x: room.x + 0.35, y: room.y + room.h / 2 };
}

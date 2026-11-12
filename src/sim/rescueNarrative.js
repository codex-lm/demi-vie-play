import { RESCUE_NARRATIVE } from '../data/rescueNarrative.js';
import { lastRescueKnockTick, rescueStatus } from './rescueSignals.js';
import { rescueExitOpen } from './collapseRescue.js';

// Presentation history has its own saved section, excluded from Sim.digest().
// Observing a rescue must not change legacy jobs, routes, needs or RNG streams.
function history(sim) {
  return sim.rescueNarrative ??= { episodes: {}, entries: [], nextId: 0 };
}

function append(sim, code, params, source) {
  const state = history(sim);
  state.entries.push({ id: `rescue:${state.nextId++}`, tick: sim.tick,
    level: ['eventRescueLastKnocks', 'eventRescueNoKnocks'].includes(code) ? 'danger' : 'info', code, params,
    focus: { x: source.x + source.w / 2, y: source.y + source.h / 2 } });
  if (state.entries.length > RESCUE_NARRATIVE.MAX_ENTRIES) state.entries.shift();
}

/** Record the actual worker, only after a rescue cell has really opened. */
export function recordRescueDig(sim, passage, person) {
  if (passage.rescueSourceId == null || !person) return;
  for (const source of sim.excavations) {
    if (source.state !== 'collapsed' || !source.trappedColonistIds?.length) continue;
    for (const id of source.trappedColonistIds) {
      const survivor = sim.colonists.find(item => item.id === id && item.health > 0 && !item.dead);
      if (!survivor || !rescueExitOpen(sim, source, survivor)) continue;
      const episode = history(sim).episodes[source.id] ??= { people: {} };
      episode.openers ??= {};
      // Two miners can open cells in the same tick. Credit the first opening
      // that really made this person's exit possible, not the last digger.
      if (episode.openers[id]?.tick !== sim.tick) {
        episode.openers[id] = { tick: sim.tick, id: person.id, name: person.name };
      }
    }
  }
}

/** Run before and after the unchanged rescue calculation. */
export function observeRescueNarrative(sim) {
  for (const source of sim.excavations) {
    if (source.state !== 'collapsed') continue;
    const ids = source.trappedColonistIds ?? [];
    let episode = sim.rescueNarrative?.episodes[source.id];
    if (!ids.length && !episode) continue;
    episode ??= history(sim).episodes[source.id] = { people: {} };
    for (const id of ids) {
      const person = sim.colonists.find((item) => item.id === id);
      if (!person || person.dead || person.health <= 0 || episode.people[id]) continue;
      episode.people[id] = { name: person.name, startedTick: sim.tick, lastKnockTick: null, ended: false };
    }
    const status = rescueStatus(sim, source);
    for (const [id, record] of Object.entries(episode.people)) {
      if (record.ended) continue;
      const person = sim.colonists.find((item) => item.id === Number(id));
      if (!person) continue;
      if (person.dead || person.health <= 0) {
        append(sim, record.lastKnockTick == null ? 'eventRescueNoKnocks' : 'eventRescueLastKnocks', { name: record.name,
          lastKnockTick: record.lastKnockTick, excavationId: source.id }, source);
        record.ended = true;
      } else if (!ids.includes(person.id) && person.trappedIn !== source.id
        && person.isolatedByCollapse !== source.id) {
        // A second collapse can transfer a survivor to another rubble source.
        // That is not a rescue; the new source records the continuing episode.
        if (person.trappedIn != null || person.isolatedByCollapse != null) {
          record.ended = true;
          continue;
        }
        // Only a worker who opened rock on this tick is credited with the
        // breakthrough. A later manual terrain edit must not steal their name.
        const opener = episode.openers?.[person.id];
        const dig = opener?.tick === sim.tick ? opener : null;
        append(sim, dig ? 'eventRescueFreed' : 'eventRescueFreedUnknown', {
          name: record.name, ...(dig ? { rescuer: dig.name } : {}), excavationId: source.id,
        }, source);
        if (dig && sim.rescueRelationsEnabled && dig.id !== person.id) {
          const rescuer = sim.colonists.find((item) => item.id === dig.id);
          if (rescuer) {
            person.relations ??= {};
            rescuer.relations ??= {};
            person.relations[rescuer.id] = Math.min(100,
              (person.relations[rescuer.id] ?? 0) + RESCUE_NARRATIVE.RELATION_BONUS);
            rescuer.relations[person.id] = Math.min(100,
              (rescuer.relations[person.id] ?? 0) + RESCUE_NARRATIVE.RELATION_BONUS);
          }
        }
        record.ended = true;
      } else {
        const last = lastRescueKnockTick(status, sim.tick, person.id);
        if (last != null && last >= record.startedTick) record.lastKnockTick = Math.max(record.lastKnockTick ?? last, last);
      }
    }
  }
}

export function rescueJournal(sim) {
  return [...(sim.journal ?? []), ...(sim.rescueNarrative?.entries ?? [])]
    .sort((a, b) => a.tick - b.tick || (typeof a.id === 'number' ? -1 : 1)
      - (typeof b.id === 'number' ? -1 : 1));
}

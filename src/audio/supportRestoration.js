import { cachedSupportAdvice } from '../render/supportAdvice.js';
import { spatialGain } from './cues.js';

const usableAt = (room, x) => room.supports?.some(support =>
  (typeof support === 'number' ? support : support.x) === x
  && (typeof support === 'number' || (!support.failed && support.solidity !== 0)));

/** Follow only a displayed recommendation. Reading this observer never evaluates
 * structure and never changes a room, a job or the renderer's advice cache. */
export class SupportRestorationReader {
  constructor(readAdvice = cachedSupportAdvice) {
    this.readAdvice = readAdvice;
    this.sim = null;
    this.lastTick = -Infinity;
    this.pending = new Map();
  }

  reset(sim) {
    this.sim = sim;
    this.lastTick = sim.tick;
    this.pending.clear();
  }

  observe(game) {
    const sim = game.sim;
    if (sim !== this.sim || sim.tick < this.lastTick) this.reset(sim);
    this.lastTick = sim.tick;
    const id = game.tool?.type === 'support' ? game.tool.excavationId
      ?? (game.selection?.type === 'excavation' ? game.selection.id : null)
      : game.selection?.type === 'excavation' ? game.selection.id : null;
    const advice = id == null ? null : this.readAdvice(game, id);
    this.currentId = id;
    this.currentAdvice = advice;
    if (advice?.helps && !this.pending.has(id)) {
      const room = sim.excavation(id);
      if (room && ['dug', 'fitted'].includes(room.state)
          && room.stress?.color !== 'green' && !usableAt(room, advice.x)) {
        this.pending.set(id, { room, x: advice.x, color: room.stress?.color });
      }
    }
  }

  read(game) {
    this.observe(game);
    const sim = game.sim, id = this.currentId, advice = this.currentAdvice;
    if (!this.pending.size) return [];
    const cues = [];
    for (const [roomId, candidate] of this.pending) {
      const room = sim.excavation(roomId);
      if (room !== candidate.room || !['dug', 'fitted'].includes(room.state)) {
        this.pending.delete(roomId);
        continue;
      }
      const installed = usableAt(room, candidate.x), green = room.stress?.color === 'green';
      if (installed || green) {
        if (installed && green && ['yellow', 'red'].includes(candidate.color)) {
          cues.push({ type: 'supportRestored', excavationId: roomId, x: candidate.x,
            tick: sim.tick, ...spatialGain(game.camera, { x: candidate.x, y: room.y + room.h - 1 }) });
        }
        this.pending.delete(roomId);
        continue;
      }
      // A queued support remains observable after the player selects another
      // room. An old, unacted-on recommendation must not survive deselection.
      const queued = sim.jobs?.some(job => job.type === 'support' && job.excavationId === roomId
        && job.x === candidate.x && job.status !== 'done');
      if (!queued && (id !== roomId || advice?.x !== candidate.x || !advice?.helps)) this.pending.delete(roomId);
      else candidate.color = room.stress?.color;
    }
    return cues;
  }
}

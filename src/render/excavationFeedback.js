import { MATERIALS, MATERIAL } from '../data/materials.js';

// Presentation state only: no clock, event marker or material is written back to
// the simulation. A loaded day's retained events are a history, not a new burst.
const states = new WeakMap();
const clamp = n => Math.max(0, Math.min(1, n));
const palette = ['#b8aa8a', '#a68960', '#bd875b', '#d6c08a', '#c4b995', '#625c60', '#c49e78', '#a9adb2', '#aaa18c', '#afb1a5', '#6d7378'];
const burstTypes = new Set(['digCell', 'crack', 'dust', 'danger', 'wallRupture', 'creak', 'souvenirLeft', 'souvenirPassed', 'objectiveDone']);

export function materialColor(material) {
  return palette[typeof material === 'string' ? MATERIALS.find(m => m.key === material)?.id : material] ?? palette[MATERIAL.LIMESTONE];
}

function materialFor(sim, state, event) {
  if (event.material !== undefined || event.materialId !== undefined) return event.materialId ?? event.material;
  const world = sim.world, index = world?.index?.(event.x, event.y);
  if (state.materials?.[index]) return state.materials[index];
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
    const material = world?.material?.(event.x + dx, event.y + dy);
    if (material && material !== MATERIAL.BEDROCK) return material;
  }
  return event.yields?.clayRes ? MATERIAL.CLAY : event.yields?.coal ? MATERIAL.COAL
    : event.yields?.sandRes ? MATERIAL.SAND : MATERIAL.LIMESTONE;
}

function entranceFor(sim, room) {
  // Prefer the actual open contact on the boundary. A shaft above or below is
  // supported too; the wave need not always sweep from the left.
  const world = sim.world, candidates = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    if (world?.isEmpty?.(room.x - 1, y)) candidates.push({ x: room.x, y: y + .5, side: 'left' });
    if (world?.isEmpty?.(room.x + room.w, y)) candidates.push({ x: room.x + room.w, y: y + .5, side: 'right' });
  }
  for (let x = room.x; x < room.x + room.w; x++) {
    if (world?.isEmpty?.(x, room.y - 1)) candidates.push({ x: x + .5, y: room.y, side: 'top' });
    if (world?.isEmpty?.(x, room.y + room.h)) candidates.push({ x: x + .5, y: room.y + room.h, side: 'bottom' });
  }
  return candidates[Math.floor(candidates.length / 2)] ?? { x: room.x, y: room.y + room.h * .65, side: 'left' };
}

function openRoom(state, sim, room, now) {
  if (!room || room.kind !== 'room' || room.state === 'collapsed' || state.opened.has(room.id)) return;
  state.opened.add(room.id);
  state.openings.set(room.id, { start: now, duration: 1.65, entrance: entranceFor(sim, room) });
}

export function excavationFeedback(game, now = game.renderTime ?? 0) {
  const sim = game.sim;
  let state = states.get(sim);
  const events = sim.events ?? [], last = events.at(-1);
  if (!state || sim.tick < state.tick) {
    state = { tick: sim.tick, last, seen: new WeakSet(events), bursts: [], openings: new Map(), opened: new Set(),
      rooms: new Map(), materials: sim.world?.materials?.slice(), revision: sim.world?.revision };
    for (const room of sim.excavations ?? []) {
      state.rooms.set(room.id, room.state);
      if (['dug', 'fitted'].includes(room.state)) state.opened.add(room.id);
    }
    states.set(sim, state);
    return state;
  }
  if (last !== state.last || sim.tick !== state.tick) {
    const fresh = [];
    for (let index = events.length - 1; index >= 0; index--) {
      if (state.seen.has(events[index])) break;
      fresh.push(events[index]);
    }
    for (const event of fresh.reverse()) {
      state.seen.add(event);
      if (event.type === 'roomOpened') {
        openRoom(state, sim, (sim.excavations ?? []).find(r => r.id === (event.excavationId ?? event.roomId)), now);
      } else if (burstTypes.has(event.type)) {
        state.bursts.push({ event, start: now, duration: event.type === 'digCell' ? .75 : event.type === 'dust' ? 2 : 1.2,
          material: materialFor(sim, state, event) });
      }
    }
    // Bounded even when a x30 frame exposes hundreds of cells at once. Prefer
    // the newest physical impacts; room-wide damage still persists by integrity.
    if (state.bursts.length > 96) state.bursts.splice(0, state.bursts.length - 96);
    state.last = last;
    state.tick = sim.tick;
  }
  for (const room of sim.excavations ?? []) {
    const previous = state.rooms.get(room.id);
    if (['planned', 'digging'].includes(previous) && ['dug', 'fitted'].includes(room.state)) openRoom(state, sim, room, now);
    state.rooms.set(room.id, room.state);
  }
  if (state.revision !== sim.world?.revision) {
    state.materials?.set(sim.world.materials);
    state.revision = sim.world.revision;
  }
  state.bursts = state.bursts.filter(burst => now - burst.start < burst.duration);
  for (const [id, opening] of state.openings) if (now - opening.start >= opening.duration) state.openings.delete(id);
  return state;
}

export function roomOpening(game, room, now = game.renderTime ?? 0, feedback = excavationFeedback(game, now)) {
  const opening = feedback.openings.get(room.id);
  if (!opening) return null;
  const progress = clamp((now - opening.start) / opening.duration);
  return { ...opening, progress, extent: 1 - (1 - progress) ** 2 };
}

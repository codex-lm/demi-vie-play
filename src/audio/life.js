// Presentation-only observations. Pure read helpers never advance the RNG
// or change the state this module observes.
import { CAMERA, TIME, WORLD } from '../data/balance.js';
import { clamp } from './cues.js';
import { rescueKnockFrame, rescueSignalPosition, rescueStatus } from '../sim/rescueSignals.js';
import { RESCUE_SIGNALS } from '../data/rescueSignals.js';

export const LIFE_INTERVALS = Object.freeze({
  laughter: 16, meal: 12, cough: 14, footstep: 0.8, ladder: 1.8,
  cart: 6, passage: 2.5, radio: 8,
});
const COMMON_ROOMS = new Set(['commons', 'canteen', 'kitchen']);
const MOVEMENT = new Set(['walk', 'carrying', 'climb']);

/** The two slowest running speeds, independently of their numerical values. */
export function slowLifeSpeed(speed, speeds = TIME.SPEEDS) {
  return [...new Set(speeds.filter(value => value > 0))].sort((a, b) => a - b).slice(0, 2).includes(speed);
}

/** Match the rendered camera and HUD. Sources outside its viewport are silent. */
export function visibleSound(camera, source) {
  if (!camera || !Number.isFinite(source?.x) || !Number.isFinite(source?.y)) return { gain: 0, pan: 0 };
  const width = camera.width ?? 1280, height = camera.height ?? 720;
  const zoom = Math.max(0.01, camera.zoom ?? 1), cell = width / WORLD.WIDTH * zoom;
  const halfWidth = width / cell / 2, halfHeight = height / cell / 2;
  const x = source.x + (source.w ?? 0) / 2, y = source.y + (source.h ?? 0) / 2;
  const dx = x - camera.x, dy = y - camera.y;
  if (dx < -halfWidth || dx >= halfWidth || dy < -halfHeight + (camera.screenHudHeight ?? camera.hudHeight ?? 0) / cell || dy >= halfHeight) return { gain: 0, pan: 0 };
  const distance = Math.hypot(dx / halfWidth, dy / halfHeight);
  const zoomGain = clamp(zoom / (1 + zoom) * (1 + CAMERA.MAX_ZOOM) / CAMERA.MAX_ZOOM);
  return { gain: zoomGain / (1 + distance * distance), pan: clamp(dx / halfWidth, -0.85, 0.85) };
}

/** Four recorded densities, plus a quiet tail as fallout approaches its floor. */
export function geigerDensity(dose) {
  dose = Math.max(0, Number.isFinite(dose) ? dose : 0);
  return {
    level: dose >= 3 ? 4 : dose >= 0.3 ? 3 : dose >= 0.03 ? 2 : dose > 0 ? 1 : 0,
    gain: 0.2 * clamp(dose / 0.06),
  };
}

function inRoom(person, room) {
  return person.x >= room.x && person.x < room.x + room.w && person.y >= room.y && person.y < room.y + room.h;
}

function passageCrossed(before, person, door) {
  if (!before) return false;
  // Hatch: cross the surface plane. Interior doors: cross their vertical plane.
  const horizontal = door.kind === 'hatch';
  const a = horizontal ? before.y : before.x, b = horizontal ? person.y : person.x;
  const plane = horizontal ? door.y : door.x;
  if (a === b || (a - plane) * (b - plane) > 0) return false;
  const fraction = (plane - a) / (b - a);
  if (fraction <= 0 || fraction > 1) return false;
  const other = horizontal ? before.x + (person.x - before.x) * fraction : before.y + (person.y - before.y) * fraction;
  return horizontal ? Math.abs(other - door.x) <= 1 : other >= door.y - 0.25 && other <= door.y + 2;
}

/**
 * A fresh, serializable audio state is returned on every poll. `now` is the
 * AudioContext clock, not simulation time: speed changes cannot create a burst.
 * `loops` contains final pre-manifest gains (do not multiply by a second 0.35).
 */
export function computeLifeAudio(game, previous = null, now = 0, options = {}) {
  const sim = game.sim ?? {}, camera = game.camera;
  if (previous && (sim.tick < previous.tick || now < previous.now)) previous = null;
  const state = {
    tick: sim.tick, now, cooldowns: { ...previous?.cooldowns },
    nextCue: previous?.nextCue ?? -Infinity, people: {}, doors: {}, rescueKnocks: {},
    receiving: Boolean(sim.m5?.radio?.receiving),
  };
  const cues = [], loops = {}, candidates = new Map();
  const people = (sim.colonists ?? []).filter(person => person.health > 0 && !person.dead && person.carriedBy == null);
  for (const person of people) state.people[person.id] = { x: person.x, y: person.y, task: person.task };
  for (const door of sim.doors ?? []) state.doors[door.id] = door.open !== false;
  const hidden = game.m6Shell?.titleVisible || game.renderer?.m6?.cinematic?.active;
  const muted = options.muted || options.volume === 0;
  const running = slowLifeSpeed(game.speed) && !hidden && !muted;
  const advanced = !previous || sim.tick > previous.tick;
  for (const room of sim.excavations ?? []) {
    const status = rescueStatus(sim, room);
    if (!status) continue;
    const stroke = rescueKnockFrame(status, sim.tick);
    state.rescueKnocks[room.id] = stroke.key;
    const source = rescueSignalPosition(room);
    const spatial = visibleSound(camera, source);
    const revealed = !sim.world?.isVisible || sim.world.isVisible(Math.floor(source.x), Math.floor(source.y));
    if (running && revealed && spatial.gain > 0 && stroke.active
      && previous?.rescueKnocks?.[room.id] !== stroke.key) {
      // One short synthetic impact, without the recorded rubble's several
      // bouncing stones. Footsteps cannot drop a stroke from this own rhythm.
      cues.push({ type: 'rescueKnock', family: 'rescue', excavationId: room.id,
        survivorId: status.survivors[stroke.index].id, gain: spatial.gain * RESCUE_SIGNALS.GAIN, pan: spatial.pan });
    }
  }
  const offer = (family, assetId, source, amount) => {
    const spatial = visibleSound(camera, source), gain = spatial.gain * amount;
    if (!(gain > 0) || now < (state.cooldowns[family] ?? -Infinity)) return;
    const prior = candidates.get(family);
    if (!prior || gain > prior.gain) candidates.set(family, { type: 'life', assetId, family, gain, pan: spatial.pan });
  };
  const loop = (assetId, source, amount) => {
    const spatial = visibleSound(camera, source), gain = spatial.gain * amount;
    if (gain > (loops[assetId]?.gain ?? 0)) loops[assetId] = { gain, pan: spatial.pan };
  };

  // Radiation is an observation of the visible surface, including in pause.
  // It does not race with accelerated simulation events like footsteps do.
  if (!hidden && !muted && (options.geiger ?? 0.5) > 0) {
    const density = geigerDensity(sim.radiation?.surfaceDose);
    const hatch = (sim.doors ?? []).find(door => door.kind === 'hatch');
    const surface = { x: clamp(camera?.x ?? WORLD.WIDTH / 2, 0, WORLD.WIDTH - 1), y: WORLD.SURFACE_Y };
    const anchor = hatch && visibleSound(camera, hatch).gain > visibleSound(camera, surface).gain ? hatch : surface;
    if (density.level) loop(`loop.geiger.${density.level}`, anchor, density.gain * clamp(options.geiger ?? 0.5));
  }
  if (!running) return { state, cues, loops };

  const rooms = (sim.excavations ?? []).filter(room => room.state !== 'collapsed' && room.state !== 'planned' && !room.disabled);
  for (const room of rooms) {
    if (!room.powered || room.machineBroken) continue;
    if (room.roomType === 'diesel') loop('loop.machine.generator', room, 0.2);
    if (room.roomType === 'bikeDynamo' && room.powerGenerationKw > 0) loop('loop.machine.bike', room, 0.2);
    if (room.roomType === 'pump') loop('loop.machine.pump', room, 0.2);
  }
  const antenna = (sim.surface?.structures ?? []).find(structure => structure.type === 'antenna' && structure.state === 'built');
  const radioPosition = antenna ? { ...antenna, y: antenna.y ?? WORLD.SURFACE_Y } : null;
  if (state.receiving && radioPosition) {
    loop('loop.radio.static', radioPosition, 0.1);
    if (previous && !previous.receiving) offer('radio', 'sfx.radio.tune', radioPosition, 0.35);
  }
  if (advanced) {
    const jobs = new Map((sim.jobs ?? []).map(job => [job.id, job]));
    for (const person of people) {
      const common = rooms.find(room => COMMON_ROOMS.has(room.roomType) && inRoom(person, room));
      if (common && person.task === 'socialize') offer('laughter', 'sfx.life.laughter', person, 0.4);
      if (common && person.task === 'eat') offer('meal', 'sfx.life.meal', person, 0.35);
      if (person.diseases?.length && person.task !== 'sleeping') offer('cough', 'sfx.life.cough', person, 0.3);
      const before = previous?.people[person.id];
      const moved = before && Math.hypot(person.x - before.x, person.y - before.y) > 0.05;
      if (!moved || !(MOVEMENT.has(person.task) || MOVEMENT.has(before.task))) continue;
      if (person.task === 'climb' || before.task === 'climb') {
        // The simulation calls elevator travel "climb" too. A powered lift
        // must not acquire the ladder's hand-and-rung sounds.
        const elevator = rooms.some(room => room.roomType === 'elevator' && room.powered && !room.powerShed
          && (inRoom(person, room) || inRoom(before, room)));
        if (!elevator) offer('ladder', 'sfx.machine.ladder', person, 0.3);
      } else offer('footstep', 'sfx.life.footstep', person, 0.2);
      // Only debris hauling gets a cart, not every carried meal or child.
      if (person.carrying && jobs.get(person.jobId)?.type === 'haul') offer('cart', 'sfx.dig.cart', person, 0.3);
      for (const door of sim.doors ?? []) {
        if (door.open !== false && passageCrossed(before, person, door)) offer('passage', door.kind === 'hatch' ? 'sfx.surface.hatch' : 'sfx.machine.airlock', door, 0.4);
      }
    }
  }
  for (const door of sim.doors ?? []) {
    if (previous?.doors[door.id] !== undefined && previous.doors[door.id] !== state.doors[door.id]) {
      offer('passage', door.kind === 'hatch' ? 'sfx.surface.hatch' : 'sfx.machine.airlock', door, 0.4);
    }
  }
  if (now >= state.nextCue && candidates.size) {
    // A global ceiling also prevents eight different families starting together.
    // Oldest eligible family first; gain breaks ties without consuming RNG.
    const candidate = [...candidates.values()].sort((a, b) =>
      (state.cooldowns[a.family] ?? -1e12) - (state.cooldowns[b.family] ?? -1e12) || b.gain - a.gain)[0];
    cues.push(candidate);
    state.cooldowns[candidate.family] = now + LIFE_INTERVALS[candidate.family];
    state.nextCue = now + 0.35;
  }
  return { state, cues, loops };
}

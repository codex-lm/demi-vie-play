// Presentation-only audio policy. No simulation state or RNG is consumed.
import { CELL, TIME, WORLD } from '../data/balance.js';
import { MATERIAL, MATERIALS } from '../data/materials.js';

export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
export const SOUND_TYPES = Object.freeze({
  digCell: 'pick', crack: 'crack', creak: 'creak', dust: 'dust', danger: 'creak',
  collapse: 'collapse', cascade: 'collapse', wallRupture: 'crack', methaneExplosion: 'collapse',
  radioMessage: 'radio', expeditionMessage: 'radio', dilemmaOffered: 'dilemma',
  birth: 'birth', death: 'death', fireStart: 'fire', fireSpread: 'fire',
  burial: 'burial', fireExtinguish: 'extinguish', waterSeep: 'drip', waterPocketBreach: 'breach', flood: 'flood',
  roomOpened: 'opened', souvenirLeft: 'memory', souvenirPassed: 'memory', objectiveDone: 'objective',
});
// These warnings are journal-only transitions, not animation events. Keep their
// identity distinct from both generic alerts and the actual collapse impact.
export const JOURNAL_SOUND_TYPES = Object.freeze({
  eventDigNoAccess: 'digBlocked', eventCascadeRisk: 'cascadeWarning', eventRoomUnreachable: 'missingLadder',
  eventSupportFailed: 'supportFailed',
});
const PRIORITY = { collapse: 10, red: 10, cascadeWarning: 9, death: 9, supportFailed: 9, dilemma: 8, yellow: 8, breach: 8, flood: 7, birth: 7, radio: 6, digBlocked: 6, missingLadder: 6, burial: 5, creak: 5, crack: 4, opened: 3, memory: 3, objective: 3, extinguish: 3, fire: 2, season: 2, pick: 1, drip: 0, dust: 0 };

export function spatialGain(camera, event) {
  if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) return { gain: 1, pan: 0 };
  const dx = event.x + (event.w ?? 0) / 2 - (camera?.x ?? WORLD.WIDTH / 2);
  const dy = event.y + (event.h ?? 0) / 2 - (camera?.y ?? WORLD.SURFACE_Y);
  const scale = 32 / Math.max(0.5, camera?.zoom ?? 1);
  const distance = Math.hypot(dx, dy);
  return { gain: 1 / (1 + (distance / scale) ** 2), pan: clamp(dx / scale, -0.85, 0.85) };
}

export function eventMaterial(event, sim, observedMaterials) {
  const explicit = event.material ?? event.materialId;
  if (typeof explicit === 'string') return explicit;
  if (Number.isInteger(explicit)) return MATERIALS[explicit]?.key ?? 'limestone';
  const index = Math.floor(event.y) * sim.world.width + Math.floor(event.x);
  const observed = observedMaterials?.[index];
  if (observed > 0) return MATERIALS[observed]?.key ?? 'limestone';
  if (event.yields?.clayRes) return 'clay';
  if (event.yields?.sandRes) return 'sand';
  if (event.yields?.coal) return 'coal';
  return 'limestone';
}

export function ambientState(game) {
  const sim = game.sim, camera = game.camera;
  const depth = Math.max(0, (camera?.y ?? WORLD.SURFACE_Y) - WORLD.SURFACE_Y);
  const surface = Math.exp(-depth / 22);
  let ventilation = 0, fire = 0, firePan = 0;
  for (const room of sim.excavations ?? []) {
    if (room.ventilationActive || room.scrubberActive || room.airFilterActive) {
      ventilation = Math.max(ventilation, spatialGain(camera, room).gain);
    }
  }
  for (const head of sim.surface?.structures ?? []) {
    if (head.type === 'ventShaft' && head.state === 'built' && head.ventilationActive) {
      ventilation = Math.max(ventilation, spatialGain(camera, { x: head.x, y: head.y ?? WORLD.SURFACE_Y }).gain);
    }
  }
  for (const person of sim.colonists ?? []) {
    if (person.health > 0 && person.task === 'crank') ventilation = Math.max(ventilation, spatialGain(camera, person).gain * 0.65);
  }
  for (const source of sim.m5?.hazards?.fires ?? []) {
    if (source.state !== 'burning' || !(source.intensity > 0)) continue;
    const room = (sim.excavations ?? []).find(r => r.id === source.excavationId);
    const s = spatialGain(camera, Number.isFinite(source.x) ? source : room ?? {});
    const amount = s.gain * clamp(source.intensity);
    if (amount > fire) { fire = amount; firePan = s.pan; }
  }
  const weather = sim.weather?.current ?? 'clear';
  // Weather identifiers are semantic: dustStorm carries dust, never rainfall.
  const rain = weather === 'blackRain' ? 1 : 0;
  const season = sim.m5?.calendar?.season ?? ['spring', 'summer', 'autumn', 'winter'][Math.floor(sim.tick / TIME.TICKS_PER_DAY / 90) % 4];
  return { depth, surface, ventilation, rain, fire, firePan, season };
}

export class CueReader {
  constructor() { this.sim = null; this.seen = new WeakSet(); this.lastTick = -Infinity; this.cooldowns = new Map(); }

  reset(sim) {
    this.sim = sim;
    this.seen = new WeakSet();
    this.lastTick = sim.tick;
    this.materials = sim.world.materials.slice();
    this.materialRevision = sim.world.revision;
    this.cooldowns.clear();
    for (const event of sim.events ?? []) this.seen.add(event);
    this.seenJournal = new WeakSet();
    for (const entry of sim.journal ?? []) this.seenJournal.add(entry);
    this.season = sim.m5?.calendar?.season;
  }

  observeSolids(world) {
    if (world.revision !== undefined && world.revision === this.materialRevision) return;
    for (let index = 0; index < world.materials.length; index++) {
      const material = world.materials[index];
      if (material > 0 && (!world.states || world.states[index] === CELL.SOLID)) this.materials[index] = material;
    }
    this.materialRevision = world.revision;
  }

  observeCollapse(event, sim) {
    // A collapse and its first clearing can coalesce between audio polls at x30.
    // Reconstruct the rubble sample from the event and saved structural result,
    // in event order, even if the current cell has already become air again.
    const room = sim.excavations?.find(r => r.id === event.excavationId);
    const rect = room ?? event, width = sim.world.width, height = this.materials.length / width;
    const mark = (x, y) => { if (x >= 0 && x < width && y >= 0 && y < height) this.materials[y * width + x] = MATERIAL.RUBBLE; };
    if (room?.cells) for (const index of room.cells) this.materials[index] = MATERIAL.RUBBLE;
    else for (let y = rect.y; y < rect.y + (rect.h ?? 0); y++) for (let x = rect.x; x < rect.x + (rect.w ?? 0); x++) mark(x, y);
    const stress = room?.stress;
    const fontisRows = stress ? Math.min(stress.slab, Math.ceil(stress.span / 2)) : 0;
    for (let y = rect.y - 1; y >= rect.y - fontisRows; y--) for (let x = rect.x; x < rect.x + rect.w; x++) mark(x, y);
  }

  read(game, now) {
    const sim = game.sim;
    if (this.sim !== sim || sim.tick < this.lastTick) { this.reset(sim); return []; }
    const groups = new Map();
    // Events survive one game day. Only new identities at/after the last poll are audible.
    for (const event of sim.events ?? []) {
      if (event.tick < this.lastTick || this.seen.has(event)) continue;
      this.seen.add(event);
      // M6 emits burial and its heirloom together. One physical bell per burial.
      if (event.type === 'burial' && (sim.events ?? []).some(other => other.type === 'souvenirLeft' && other.tick === event.tick && other.authorId === event.colonistId)) continue;
      if (event.type === 'collapse' || event.type === 'cascade') this.observeCollapse(event, sim);
      const type = SOUND_TYPES[event.type];
      if (!type) continue;
      const spatial = spatialGain(game.camera, event);
      if (spatial.gain < 0.025) continue;
      const message = type === 'radio' ? sim.m5?.radio?.messages?.find(message => message.id === event.messageId) : undefined;
      const cue = { type, eventType: event.type, ...spatial, message, material: type === 'pick' ? eventMaterial(event, sim, this.materials) : null, count: 1, tick: event.tick };
      const prior = groups.get(type);
      if (!prior) groups.set(type, cue);
      else {
        if (cue.gain > prior.gain || type === 'radio') Object.assign(prior, { gain: cue.gain, pan: cue.pan, material: cue.material, message: cue.message, eventType: cue.eventType });
        prior.count++;
      }
    }
    for (const entry of sim.journal ?? []) {
      if (this.seenJournal.has(entry)) continue;
      this.seenJournal.add(entry);
      const code = entry.code ?? entry.key;
      if (entry.tick < this.lastTick) continue;
      const warning = JOURNAL_SOUND_TYPES[code];
      if (warning) {
        const spatial = spatialGain(game.camera, entry.focus ?? {});
        // Announced danger must still be heard when the player is elsewhere.
        const cue = { type: warning, eventType: code, ...spatial, gain: Math.max(0.35, spatial.gain), count: 1, tick: entry.tick };
        const prior = groups.get(warning);
        if (!prior) groups.set(warning, cue);
        else { prior.count++; if (cue.gain > prior.gain) Object.assign(prior, spatial, { gain: cue.gain }); }
        continue;
      }
      if (!/^alert.*(?:Yellow|Red)$/.test(code ?? '')) continue;
      const type = code.endsWith('Red') ? 'red' : 'yellow';
      groups.set(type, { type, gain: 1, pan: 0, count: 1, tick: entry.tick });
    }
    if (groups.has('red')) groups.delete('yellow');
    const season = sim.m5?.calendar?.season;
    if (this.season && season && season !== this.season) groups.set('season', { type: 'season', gain: 0.6, pan: 0, count: 1, tick: sim.tick });
    this.season = season;
    // Keep the last *solid* sample through excavation; refresh rubble/repairs after
    // consuming this frame's dig events, whose material has already become air.
    this.observeSolids(sim.world);
    this.lastTick = sim.tick;
    const result = [];
    for (const cue of [...groups.values()].sort((a, b) => PRIORITY[b.type] - PRIORITY[a.type])) {
      const interval = cue.type === 'pick' ? (game.speed >= 10 ? 0.45 : 0.19) : cue.type === 'radio' ? 1.1 : 0.55;
      if (now < (this.cooldowns.get(cue.type) ?? -Infinity)) continue;
      this.cooldowns.set(cue.type, now + interval);
      cue.gain *= Math.min(1.2, 1 + Math.log2(cue.count) * 0.035);
      result.push(cue);
      if (result.length === 3) break;
    }
    return result;
  }
}

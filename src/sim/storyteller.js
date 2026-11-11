import { TIME } from '../data/balance.js';
import { WEATHER } from '../data/surface.js';
import { blackRainChance } from './weather.js';
import { aquiferMaterial } from './groundwater.js';
import { STORY_EVENTS, STORYTELLER_RULES, storyEventDefinition } from '../data/events.js';
import { FIRE_TEXT } from '../data/fireText.js';
import { M5, STORYTELLER_MODES } from '../data/m5.js';
import { PEOPLE } from '../data/people.js';
import { ROOM_DEFS } from '../data/rooms.js';
import { STR } from '../data/strings.fr.js';
import { STORYTELLER_TEXT } from '../data/storytellerText.js';
import * as hazards from './hazards.js';
import { hashString, RNG } from './rng.js';
import { contaminateNappe } from './water.js';
import { recordEveningNarrative } from './journalNarrative.js';
import { beginCelebration, usableActivityRoom } from './activities.js';
import { insideExcavation } from './networks.js';
import { isMachineRoom, queueMachineRepair } from './jobs.js';
import { normalizePregnancy } from './lifecycle.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const isAlive = (colonist) => colonist && colonist.health > 0 && !colonist.dead;
const living = (sim) => (sim.colonists ?? []).filter(isAlive).sort((a, b) => a.id - b.id);
const usableRoom = (room) => room && room.state !== 'collapsed' && room.state !== 'planned'
  && room.state !== 'digging' && !room.disabled;

function random(sim) {
  const state = sim.m5.storyteller;
  const rng = new RNG(state.rngState);
  const value = rng.next();
  state.rngState = rng.serialize();
  return value;
}

function randomInt(sim, min, max) {
  return Math.floor(random(sim) * (max - min + 1)) + min;
}

function modeRules(sim) {
  return STORYTELLER_RULES.MODES[sim.m5.storyteller.mode] ?? STORYTELLER_RULES.MODES.chroniqueur;
}

function interpolate(text, params) {
  return text.replace(/\{(\w+)\}/g, (match, key) => params[key] ?? match);
}

function storyText(key, params = {}) {
  return interpolate(STORYTELLER_TEXT[key] ?? key, params);
}

function fireText(part, params) {
  const text = FIRE_TEXT[params.cause]?.[part];
  return text ? interpolate(text, params) : storyText(`story_fire_${part}`, params);
}

export function initializeStoryteller(sim, options = {}) {
  sim.m5 ??= {};
  sim.m5.storyteller ??= {};
  const state = sim.m5.storyteller;
  const requested = options.storyteller ?? state.mode ?? 'chroniqueur';
  state.mode = STORYTELLER_MODES.includes(requested) ? requested : 'chroniqueur';
  state.queue ??= [];
  state.history ??= [];
  state.breakdowns ??= [];
  // Older saves stored a two-day expiry; migrate it to an unpaid repair task.
  state.breakdowns = state.breakdowns.filter((breakdown) => {
    const room = sim.excavation(breakdown.excavationId);
    if (!room || room.state === 'collapsed') return false;
    if (!isMachineRoom(room)) {
      room.disabled = breakdown.wasDisabled ?? false;
      room.machineBroken = false;
      return false;
    }
    breakdown.sinceTick ??= sim.tick;
    breakdown.wasDisabled ??= false;
    delete breakdown.until;
    room.machineBroken = true;
    room.disabled = true;
    queueMachineRepair(sim, room);
    return true;
  });
  state.protectedUntil ??= M5.PROTECTED_TICKS;
  state.nextEventIndex ??= 0;
  state.lastMajorTick ??= null;
  state.rngState ??= hashString(`${sim.seed}:m5:storyteller`);
  if (!Number.isFinite(state.nextEventTick)) {
    state.nextEventTick = sim.tick <= state.protectedUntil
      ? state.protectedUntil : sim.tick + STORYTELLER_RULES.MIN_EVENT_DELAY_TICKS;
  }
}

function availableRooms(sim, machinesOnly = false) {
  return sim.excavations.filter((room) => usableRoom(room)
    && (!machinesOnly || (isMachineRoom(room) && !room.machineBroken)))
    .sort((a, b) => a.id - b.id);
}

function roomName(room) {
  return STR[room.label] ?? STR[room.roomType] ?? room.name ?? `${STR.room} ${room.id}`;
}

function fireCause(room, explicitCause = null) {
  if (Object.hasOwn(FIRE_TEXT, explicitCause)) return explicitCause;
  if (!room) return null;
  if (room.roomType === 'diesel' || room.roomType === 'forge'
    || (ROOM_DEFS[room.roomType]?.heatKw ?? 0) > 0 || (room.machineHeatKw ?? 0) > 0) return 'overheat';
  if (room.roomType === 'kitchen' && room.hasHood !== true && room.hood !== true) return 'kitchenWithoutHood';
  if (room.powered) return 'shortCircuit';
  return null;
}

function fireRooms(sim) {
  return availableRooms(sim).filter((room) => fireCause(room) !== null);
}

function makeFireContext(sim, room, explicitCause = null) {
  const cause = fireCause(room, explicitCause);
  if (!cause) return null;
  return {
    excavationId: room.id,
    name: roomName(room),
    cause,
    causeLabel: FIRE_TEXT[cause].label,
  };
}

function normalizeFireContext(sim, context) {
  if (context.excavationId === undefined) return context;
  const room = roomFromContext(sim, context);
  if (!room) return context;
  const prepared = makeFireContext(sim, room, context.cause);
  return prepared ? { ...context, ...prepared, name: context.name ?? prepared.name } : context;
}

function hasAntenna(sim) {
  return (sim.surface?.structures ?? []).some((structure) => structure.type === 'antenna' && structure.state === 'built');
}

function floodEligible(sim, room) {
  if (!usableRoom(room) || room.coating === 'waterproof'
    || (sim.m5?.hazards?.waterPockets ?? []).some((pocket) => pocket.excavationId === room.id)) return false;
  for (const index of room.dugCells ?? []) {
    const { x, y } = sim.world.coords(index);
    if (!sim.world.isEmpty(x, y)) continue;
    for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (sim.world.inBounds(xx, yy) && sim.world.isSolid(xx, yy)
        && aquiferMaterial(sim.world.material(xx, yy))) return true;
    }
  }
  return false;
}

function birthReady(sim, colonist) {
  const pregnancy = colonist?.pregnancy;
  if (!pregnancy || !isAlive(colonist)) return false;
  const startTick = Number.isFinite(pregnancy.startTick) ? pregnancy.startTick
    : Number.isFinite(pregnancy.dueTick) ? pregnancy.dueTick - PEOPLE.PREGNANCY_DAYS * TIME.TICKS_PER_DAY : sim.tick;
  return sim.tick - startTick >= PEOPLE.PREGNANCY_MIN_DAYS * TIME.TICKS_PER_DAY;
}

function eventAvailable(sim, type) {
  const people = living(sim);
  if (type === 'fire') return fireRooms(sim).length > 0 && typeof hazards.startFire === 'function';
  if (type === 'flood') return availableRooms(sim).some((room) => floodEligible(sim, room));
  if (type === 'raiders') return typeof hazards.startRaiders === 'function';
  if (type === 'breakdown') return availableRooms(sim, true).length > 0;
  if (type === 'birth') return people.some((colonist) => birthReady(sim, colonist));
  if (type === 'oldAge') return people.some((colonist) => colonist.age >= PEOPLE.ELDER_AGE);
  if (type === 'quarrel') return people.length >= 2;
  if (type === 'radio') return hasAntenna(sim);
  if (type === 'claustrophobia') return people.some((colonist) => colonist.traits?.includes('claustrophobic'));
  if (type === 'epidemic') return people.some((colonist) => !(colonist.diseases ?? []).some((disease) => disease.type === 'infection'));
  return true;
}

function prepareContext(sim, type) {
  if (!eventAvailable(sim, type)) return null;
  const people = living(sim);
  if (type === 'fire') {
    const rooms = fireRooms(sim);
    const room = rooms[randomInt(sim, 0, rooms.length - 1)];
    return makeFireContext(sim, room);
  }
  if (type === 'breakdown' || type === 'flood') {
    const rooms = availableRooms(sim, type === 'breakdown')
      .filter((room) => type !== 'flood' || floodEligible(sim, room));
    const room = rooms[randomInt(sim, 0, rooms.length - 1)];
    return { excavationId: room.id, name: roomName(room) };
  }
  if (type === 'birth') {
    const mothers = people.filter((colonist) => birthReady(sim, colonist));
    const mother = mothers[randomInt(sim, 0, mothers.length - 1)];
    return { colonistId: mother.id, name: mother.name };
  }
  if (type === 'oldAge') {
    const elders = people.filter((colonist) => colonist.age >= PEOPLE.ELDER_AGE)
      .sort((a, b) => b.age - a.age || a.id - b.id);
    return { colonistId: elders[0].id, name: elders[0].name };
  }
  if (type === 'quarrel') {
    const firstIndex = randomInt(sim, 0, people.length - 1);
    const secondIndex = (firstIndex + randomInt(sim, 1, people.length - 1)) % people.length;
    return {
      colonistId: people[firstIndex].id, otherColonistId: people[secondIndex].id,
      name: people[firstIndex].name, otherName: people[secondIndex].name,
    };
  }
  if (type === 'claustrophobia') {
    const sensitive = people.filter((colonist) => colonist.traits?.includes('claustrophobic'));
    const colonist = sensitive[randomInt(sim, 0, sensitive.length - 1)];
    return { colonistId: colonist.id, name: colonist.name };
  }
  if (type === 'weather') {
    const chance = blackRainChance(sim.tick);
    return { weather: chance > 0 && random(sim) < chance ? 'blackRain' : 'dustStorm' };
  }
  return {};
}

function colonistFromContext(sim, context) {
  return sim.colonists.find((colonist) => colonist.id === context.colonistId && isAlive(colonist)) ?? null;
}

function roomFromContext(sim, context, machinesOnly = false) {
  const room = sim.excavation(context.excavationId);
  if (machinesOnly) {
    // Switching off after the warning does not repair the announced defect.
    return room && !['collapsed', 'planned', 'digging'].includes(room.state)
      && isMachineRoom(room) && !room.machineBroken ? room : null;
  }
  return usableRoom(room) ? room : null;
}

function triggerFire(sim, context) {
  const room = roomFromContext(sim, context);
  if (!room || typeof hazards.startFire !== 'function') return null;
  const prepared = makeFireContext(sim, room, context.cause);
  if (!prepared) return null;
  const result = hazards.startFire(sim, room.id, prepared.cause);
  if (!result || result?.ok === false) return null;
  return {
    ...prepared,
    name: context.name ?? prepared.name,
    fireId: result.id,
    source: result.source,
    x: room.x,
    y: room.y,
  };
}

function triggerFlood(sim, context) {
  const room = roomFromContext(sim, context);
  if (!floodEligible(sim, room)) return null;
  const pocket = hazards.startWaterPocket(sim, room.id, { source: 'storyteller' });
  if (!pocket) return null;
  return { excavationId: room.id, name: context.name, pocketId: pocket.id, breachTick: pocket.breachTick, x: room.x, y: room.y };
}

function triggerRaiders(sim) {
  if (typeof hazards.startRaiders !== 'function') return null;
  const count = Math.max(STORYTELLER_RULES.RAIDER_MIN_STRENGTH,
    Math.round(STORYTELLER_RULES.RAIDER_BASE_STRENGTH * modeRules(sim).severity));
  const raid = hazards.startRaiders(sim, { count });
  if (!raid) return null;
  return {
    raidId: raid.id, strength: raid.count, count: raid.count,
    breachTick: raid.breachTick, x: raid.spawnX, y: raid.targetY,
  };
}

function triggerEarthquake(sim) {
  const loss = randomInt(sim, STORYTELLER_RULES.EARTHQUAKE_MIN_LOSS, STORYTELLER_RULES.EARTHQUAKE_MAX_LOSS) * modeRules(sim).severity;
  const affected = [];
  const losses = {};
  for (const room of sim.excavations) {
    if (room.state === 'collapsed' || room.state === 'planned' || !Number.isFinite(room.integrity)) continue;
    const roomLoss = loss * (room.stress?.ratio > STORYTELLER_RULES.EARTHQUAKE_STRESS_THRESHOLD ? 2 : 1);
    room.integrity = Math.max(0, room.integrity - roomLoss);
    affected.push(room.id);
    losses[room.id] = roomLoss;
  }
  sim.structureDirty = true;
  return { affected, integrityLoss: loss, losses };
}

function triggerBreakdown(sim, context) {
  const room = roomFromContext(sim, context, true);
  if (!room) return null;
  const breakdown = {
    excavationId: room.id, sinceTick: sim.tick,
    name: context.name ?? roomName(room), wasDisabled: room.disabled ?? false,
  };
  room.machineBroken = true;
  room.disabled = true;
  room.powered = false;
  room.powerGenerationKw = 0;
  room.powerDemandKw = 0;
  sim.m5.storyteller.breakdowns.push(breakdown);
  queueMachineRepair(sim, room);
  return { excavationId: room.id, name: breakdown.name };
}

function triggerEpidemic(sim) {
  const candidates = living(sim).filter((colonist) => !(colonist.diseases ?? []).some((disease) => disease.type === 'infection'));
  if (candidates.length === 0) return null;
  const count = Math.min(modeRules(sim).epidemicCount, candidates.length);
  const start = randomInt(sim, 0, candidates.length - 1);
  const infected = [];
  for (let offset = 0; infected.length < count; offset += 1) {
    const colonist = candidates[(start + offset) % candidates.length];
    colonist.diseases ??= [];
    colonist.diseases.push({ type: 'infection', recovery: 0, source: 'storyteller', sinceTick: sim.tick });
    infected.push(colonist);
  }
  return { colonistIds: infected.map((colonist) => colonist.id), names: infected.map((colonist) => colonist.name).join(', ') };
}

function triggerContamination(sim) {
  sim.radiation ??= {};
  const dose = STORYTELLER_RULES.CONTAMINATION_DOSE * modeRules(sim).severity;
  sim.radiation.waterContamination = (sim.radiation.waterContamination ?? 0) + dose;
  contaminateNappe(sim);
  return { dose };
}

function triggerWeather(sim, context, eventId) {
  if (!sim.weather || sim.weather.activeEvent) return null;
  // A saved forecast cannot revive black rain after the nuclear winter.
  const weather = context.weather === 'dustStorm' ? 'dustStorm'
    : context.weather === 'rain' || blackRainChance(sim.tick) === 0 ? 'rain' : 'blackRain';
  const duration = weather === 'dustStorm' ? STORYTELLER_RULES.DUST_STORM_DURATION_TICKS
    : weather === 'rain' ? WEATHER.RAIN_TICKS : STORYTELLER_RULES.BLACK_RAIN_DURATION_TICKS;
  sim.weather.activeEvent = {
    id: `story-${eventId}`, type: weather, startTick: sim.tick, endTick: sim.tick + duration,
  };
  sim.weather.current = weather;
  if (weather === 'blackRain') contaminateNappe(sim);
  return { weather, weatherLabel: STR[weather] ?? weather, endTick: sim.tick + duration };
}

function triggerBirth(sim, context) {
  const mother = colonistFromContext(sim, context);
  if (!birthReady(sim, mother)) return null;
  normalizePregnancy(sim, mother).dueTick = sim.tick;
  return { colonistId: mother.id, name: mother.name };
}

function triggerOldAge(sim, context) {
  const elder = colonistFromContext(sim, context);
  if (!elder) return null;
  if (!modeRules(sim).oldAgeLethal) {
    elder.morale = clamp(elder.morale + STORYTELLER_RULES.OLD_AGE_COMFORT_MORALE);
    if (Number.isFinite(elder.moraleValue)) elder.moraleValue = elder.morale;
    return { colonistId: elder.id, name: elder.name, spared: true, textKey: 'story_oldAge_spared' };
  }
  elder.lastDamageCauses = [{ code: 'oldAge', tick: sim.tick, source: 'storyteller' }];
  elder.health = 0;
  return { colonistId: elder.id, name: elder.name, spared: false };
}

function triggerQuarrel(sim, context) {
  const first = colonistFromContext(sim, context);
  const second = sim.colonists.find((colonist) => colonist.id === context.otherColonistId && isAlive(colonist));
  if (!first || !second) return null;
  first.relations ??= {};
  second.relations ??= {};
  first.relations[second.id] = clamp((first.relations[second.id] ?? 0) - STORYTELLER_RULES.QUARREL_RELATION_LOSS, -100, 100);
  second.relations[first.id] = clamp((second.relations[first.id] ?? 0) - STORYTELLER_RULES.QUARREL_RELATION_LOSS, -100, 100);
  for (const colonist of [first, second]) {
    colonist.morale = clamp(colonist.morale - STORYTELLER_RULES.QUARREL_MORALE_LOSS);
    if (Number.isFinite(colonist.moraleValue)) colonist.moraleValue = colonist.morale;
  }
  return { colonistIds: [first.id, second.id], name: first.name, otherName: second.name };
}

function triggerRadio(sim) {
  if (!hasAntenna(sim)) return null;
  sim.m5.radio ??= {};
  sim.m5.radio.messages ??= [];
  const message = {
    id: `story-${sim.m5.storyteller.nextEventIndex}`,
    tick: sim.tick,
    source: 'unknown',
    textKey: 'story_radio_message',
    text: storyText('story_radio_message'),
  };
  sim.m5.radio.messages.push(message);
  sim.m5.radio.receiving = true;
  return { messageId: message.id, text: message.text };
}

function triggerClaustrophobia(sim, context) {
  const colonist = colonistFromContext(sim, context);
  if (!colonist) return null;
  colonist.morale = clamp(colonist.morale - STORYTELLER_RULES.CLAUSTROPHOBIA_MORALE_LOSS);
  if (Number.isFinite(colonist.moraleValue)) colonist.moraleValue = colonist.morale;
  colonist.crisis ??= {};
  colonist.crisis.level = 'warning';
  colonist.crisis.warningSince ??= sim.tick;
  return { colonistId: colonist.id, name: colonist.name };
}

function triggerFestival(sim) {
  for (const colonist of living(sim)) {
    colonist.morale = clamp(colonist.morale + STORYTELLER_RULES.FESTIVAL_MORALE_GAIN);
    if (Number.isFinite(colonist.moraleValue)) colonist.moraleValue = colonist.morale;
  }
  const participants = new Set();
  for (const room of sim.excavations) {
    if (!usableActivityRoom(room, 'commons')) continue;
    for (const colonist of living(sim)) {
      if (colonist.surfaceCrewId || participants.has(colonist.id)
        || !insideExcavation(sim, room, colonist.x, colonist.y)) continue;
      participants.add(colonist.id);
      beginCelebration(sim, colonist, room);
    }
  }
  let remaining = STORYTELLER_RULES.FESTIVAL_FOOD_COST;
  for (const stock of sim.stocks ?? []) {
    const taken = Math.min(remaining, stock.resources.food ?? 0);
    stock.resources.food = (stock.resources.food ?? 0) - taken;
    remaining -= taken;
    if (stock.resources.food <= 0) delete stock.resources.food;
    if (remaining <= 0) break;
  }
  return { foodConsumed: STORYTELLER_RULES.FESTIVAL_FOOD_COST - remaining };
}

function pushHistory(sim, entry) {
  const state = sim.m5.storyteller;
  state.history.push(entry);
  if (state.history.length > STORYTELLER_RULES.HISTORY_LIMIT) {
    state.history.splice(0, state.history.length - STORYTELLER_RULES.HISTORY_LIMIT);
  }
}

export function triggerStoryEvent(sim, type, context = {}, scheduledEvent = null) {
  initializeStoryteller(sim);
  const definition = storyEventDefinition(type);
  if (!definition) return { ok: false, error: 'storyEventUnavailable' };
  const event = scheduledEvent ?? {
    id: sim.m5.storyteller.nextEventIndex++,
    type,
    major: definition.major,
    announceTick: sim.tick,
    executeTick: sim.tick,
    warningTicks: 0,
    context,
    manual: true,
  };
  const selected = scheduledEvent || Object.keys(context).length > 0 ? context : prepareContext(sim, type);
  const prepared = type === 'fire' && selected ? normalizeFireContext(sim, selected) : selected;
  if (prepared) {
    event.context = prepared;
    if (type === 'fire') {
      event.cause = prepared.cause;
      event.causeLabel = prepared.causeLabel;
    }
  }
  let details = null;
  if (prepared) {
    if (type === 'fire') details = triggerFire(sim, prepared);
    else if (type === 'flood') details = triggerFlood(sim, prepared);
    else if (type === 'raiders') details = triggerRaiders(sim);
    else if (type === 'earthquake') details = triggerEarthquake(sim);
    else if (type === 'breakdown') details = triggerBreakdown(sim, prepared);
    else if (type === 'epidemic') details = triggerEpidemic(sim);
    else if (type === 'contamination') details = triggerContamination(sim);
    else if (type === 'weather') details = triggerWeather(sim, prepared, event.id);
    else if (type === 'birth') details = triggerBirth(sim, prepared);
    else if (type === 'oldAge') details = triggerOldAge(sim, prepared);
    else if (type === 'quarrel') details = triggerQuarrel(sim, prepared);
    else if (type === 'radio') details = triggerRadio(sim);
    else if (type === 'claustrophobia') details = triggerClaustrophobia(sim, prepared);
    else if (type === 'festival') details = triggerFestival(sim);
  }
  const params = { ...prepared, ...details };
  if (!details) {
    const text = storyText(`story_${type}_unavailable`, params);
    sim.log('info', 'eventStoryUnavailable', { eventType: type, text, summary: text, storyEventId: event.id });
    pushHistory(sim, { ...event, status: 'unavailable', resolvedTick: sim.tick });
    return { ok: false, error: 'storyTargetUnavailable', event };
  }
  const text = type === 'fire' ? fireText('start', params)
    : storyText(details.textKey ?? `story_${type}_start`, params);
  sim.log(type === 'oldAge' && !details.spared ? 'error' : definition.major ? 'warning' : 'info', 'eventStoryStart', {
    eventType: type, storyEventId: event.id, text, summary: text, ...params,
  });
  sim.events.push({ type, tick: sim.tick, storyEventId: event.id, ...params });
  if (type === 'festival') recordEveningNarrative(sim, details);
  if (definition.major) sim.m5.storyteller.lastMajorTick = sim.tick;
  pushHistory(sim, { ...event, status: 'triggered', resolvedTick: sim.tick, details });
  return { ok: true, event, details };
}

function earliestMajorTick(sim, requestedTick) {
  const state = sim.m5.storyteller;
  const cooldown = modeRules(sim).majorCooldownTicks;
  let earliest = Math.max(requestedTick, state.protectedUntil);
  if (state.lastMajorTick !== null) earliest = Math.max(earliest, state.lastMajorTick + cooldown);
  for (const queued of state.queue) {
    if (storyEventDefinition(queued.type)?.major) earliest = Math.max(earliest, queued.executeTick + cooldown);
  }
  return earliest;
}

export function scheduleStoryEvent(sim, type, executeTick = null, context = null) {
  initializeStoryteller(sim);
  const definition = storyEventDefinition(type);
  if (!definition) return { ok: false, error: 'storyEventUnavailable' };
  const selected = context ?? prepareContext(sim, type);
  const prepared = type === 'fire' && selected ? normalizeFireContext(sim, selected) : selected;
  if (!prepared) return { ok: false, error: 'storyTargetUnavailable' };
  const warningTicks = Math.max(
    STORYTELLER_RULES.MIN_WARNING_TICKS,
    Math.round(definition.warningTicks * modeRules(sim).warningFactor),
  );
  let dueTick = Math.max(sim.tick + warningTicks, executeTick ?? 0);
  if (definition.major) dueTick = earliestMajorTick(sim, dueTick);
  const event = {
    id: sim.m5.storyteller.nextEventIndex++,
    type,
    major: definition.major,
    announceTick: sim.tick,
    executeTick: dueTick,
    warningTicks: dueTick - sim.tick,
    context: prepared,
    ...(type === 'fire' ? { cause: prepared.cause, causeLabel: prepared.causeLabel } : {}),
    status: 'announced',
  };
  sim.m5.storyteller.queue.push(event);
  sim.m5.storyteller.queue.sort((a, b) => a.executeTick - b.executeTick || a.id - b.id);
  const warningParams = {
    ...prepared,
    hours: Math.ceil(event.warningTicks / TIME.TICKS_PER_HOUR),
    days: event.warningTicks / TIME.TICKS_PER_DAY,
  };
  const text = type === 'fire' ? fireText('warning', warningParams)
    : storyText(`story_${type}_warning`, warningParams);
  sim.log(definition.major ? 'warning' : 'info', 'eventStoryWarning', {
    eventType: type,
    storyEventId: event.id,
    text,
    summary: text,
    executeTick: dueTick,
    warningTicks: event.warningTicks,
    ...prepared,
  });
  sim.events.push({
    type: 'storyScheduled', storyType: type, tick: sim.tick, storyEventId: event.id,
    executeTick: dueTick, ...prepared,
  });
  return { ok: true, event };
}

function scheduleAutomaticEvent(sim) {
  const state = sim.m5.storyteller;
  const weighted = [];
  for (const definition of STORY_EVENTS) {
    if (!eventAvailable(sim, definition.id)) continue;
    let weight = definition.weight;
    if (definition.major) weight *= modeRules(sim).majorWeight;
    if (definition.id === 'raiders') weight *= modeRules(sim).raiderWeight;
    if (weight > 0) weighted.push({ definition, weight });
  }
  const total = weighted.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = random(sim) * total;
  let selected = weighted.at(-1)?.definition ?? null;
  for (const candidate of weighted) {
    roll -= candidate.weight;
    if (roll <= 0) {
      selected = candidate.definition;
      break;
    }
  }
  if (selected) scheduleStoryEvent(sim, selected.id);
  state.nextEventTick = sim.tick + STORYTELLER_RULES.MIN_EVENT_DELAY_TICKS
    + randomInt(sim, 0, STORYTELLER_RULES.EVENT_DELAY_VARIABILITY_TICKS);
}

export function updateStoryteller(sim) {
  initializeStoryteller(sim);
  const state = sim.m5.storyteller;
  const due = state.queue.filter((event) => event.executeTick <= sim.tick)
    .sort((a, b) => a.executeTick - b.executeTick || a.id - b.id);
  const dueIds = new Set(due.map((event) => event.id));
  state.queue = state.queue.filter((event) => !dueIds.has(event.id));
  for (const event of due) triggerStoryEvent(sim, event.type, event.context, event);
  if (sim.tick >= state.nextEventTick) scheduleAutomaticEvent(sim);
  return state.queue;
}

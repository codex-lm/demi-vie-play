import { HEAT, TIME } from '../data/balance.js';
import { NOTEBOOK, OBJECTIVE_DEFS, objectiveDefinition } from '../data/objectives.js';
import { EXODUS } from '../data/surface.js';
import { addToStock, createStock, reserveStock, resourceTotals } from './resources.js';
import { hasAquiferAccess } from './water.js';

function notebook(sim) {
  return sim.m6.notebook;
}

function roomPosition(room) {
  return room ? { x: room.x, y: room.y } : null;
}

function nonInitialRooms(sim, roomType = null) {
  return sim.excavations.filter((room) => !room.initial && room.state !== 'collapsed'
    && (roomType === null || room.roomType === roomType));
}

function achievement(sim, definition) {
  const condition = definition.condition;
  if (condition.type === 'digRoom') {
    // Même règle que le puits : la salle touche le sable aquifère, par son sol
    // ou ses parois. Il n'est pas nécessaire (ni prudent) d'en faire le plafond.
    return roomPosition(nonInitialRooms(sim).find((room) => room.kind === 'room'
      && (room.state === 'dug' || room.state === 'fitted')
      && ((room.yields?.sandRes ?? 0) > 0 || hasAquiferAccess(sim, room))));
  }
  if (condition.type === 'room') {
    return roomPosition(nonInitialRooms(sim, condition.roomType)
      .find((room) => room.state === 'fitted' && (condition.roomType !== 'dorm' || (room.beds ?? 0) > 0)));
  }
  if (condition.type === 'stock') {
    const population = livingColonists(sim).length;
    if (population === 0) return null;
    const total = resourceTotals(sim)[condition.resource] ?? 0;
    return total >= condition.perPerson * population ? {} : null;
  }
  if (condition.type === 'journal') {
    const entry = sim.journal.find((candidate) => candidate.code === condition.code);
    return entry ? (entry.focus ? { x: entry.focus.x, y: entry.focus.y } : {}) : null;
  }
  if (condition.type === 'expeditionSeeds') {
    const expedition = sim.expeditions?.history?.find((candidate) => candidate.state !== 'lost'
      && (candidate.loot?.seeds ?? 0) > 0);
    return expedition ? { x: sim.surface?.hatch?.x ?? 0, y: sim.surface?.hatch?.y ?? 0 } : null;
  }
  if (condition.type === 'expeditions') {
    return (sim.expeditions?.completed ?? 0) >= condition.minimum
      ? { x: sim.surface?.hatch?.x ?? 0, y: sim.surface?.hatch?.y ?? 0 } : null;
  }
  if (condition.type === 'finds') {
    return (sim.m5?.poi?.finds?.length ?? 0) >= condition.minimum ? {} : null;
  }
  if (condition.type === 'research') {
    const completed = sim.research?.completed ?? [];
    if (condition.nodeId ? !completed.includes(condition.nodeId) : completed.length === 0) return null;
    return roomPosition(sim.excavations.find((room) => room.roomType === 'lab')) ?? {};
  }
  if (condition.type === 'support') {
    return roomPosition(nonInitialRooms(sim).find((room) => room.supports?.length > 0));
  }
  if (condition.type === 'lining') {
    return roomPosition(sim.excavations.find((room) => room.lining && room.lining !== 'none'));
  }
  if (condition.type === 'coating') {
    return roomPosition(sim.excavations.find((room) => room.coating === condition.coating));
  }
  if (condition.type === 'surfaceStructure') {
    const structure = sim.surface?.structures?.find((candidate) => candidate.type === condition.structureType
      && candidate.state === 'built');
    return structure ? { x: structure.x, y: 0 } : null;
  }
  if (condition.type === 'radioContact') {
    return sim.m5?.radio?.neighbors?.some((neighbor) => neighbor.contacted
      || Number.isFinite(neighbor.lastContactTick)) ? {} : null;
  }
  if (condition.type === 'radioMessages') {
    const count = (sim.m5?.radio?.messages ?? []).filter((message) => message.neighborId
      && ['contact', 'news', 'help', 'trade'].includes(message.kind)).length;
    return count >= condition.minimum ? {} : null;
  }
  if (condition.type === 'law') {
    if (condition.lawId) return Object.values(sim.charter?.active ?? {}).includes(condition.lawId) ? {} : null;
    return sim.charter?.history?.length > 0 ? {} : null;
  }
  if (condition.type === 'exodusDepot') {
    const depot = nonInitialRooms(sim, 'exodusDepot').find((room) => room.state === 'fitted');
    if (depot) return roomPosition(depot);
    return sim.exodus?.craft?.status === 'done' || sim.exodus?.result ? {} : null;
  }
  if (condition.type === 'kit') {
    const complete = Object.entries(EXODUS.KIT_REQUIREMENTS)
      .every(([resource, amount]) => (sim.exodus?.kit?.[resource] ?? 0) >= amount);
    if (!complete) return null;
    return roomPosition(nonInitialRooms(sim, 'exodusDepot')[0]) ?? {};
  }
  return null;
}

function livingColonists(sim) {
  return sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead);
}

function grantReward(sim, reward, position) {
  if (reward.type === 'morale') {
    for (const colonist of livingColonists(sim)) {
      const value = Math.max(0, Math.min(100, (colonist.moraleValue ?? colonist.morale ?? 0) + reward.amount));
      colonist.moraleValue = value;
      colonist.morale = value;
    }
    return;
  }
  if (reward.type === 'books') {
    let stock = reserveStock(sim, position.x ?? 0, position.y ?? 0);
    if (!stock) {
      stock = createStock('reserve', position.x ?? 0, position.y ?? 0);
      sim.stocks.push(stock);
    }
    addToStock(stock, 'books', reward.amount);
  }
}

function completeObjective(sim, definition, index, position) {
  const state = notebook(sim);
  if (state.completedIds.includes(definition.id)) return;
  state.completedIds.push(definition.id);
  const reward = { ...definition.reward };
  grantReward(sim, reward, position);
  const event = {
    type: 'objectiveDone',
    tick: sim.tick,
    objectiveId: definition.id,
    index,
    reward,
    ...position,
  };
  sim.events.push(event);
  const focus = Number.isFinite(position.x) && Number.isFinite(position.y)
    ? { x: position.x, y: position.y } : null;
  sim.log('info', 'eventObjectiveDone', {
    objectiveId: definition.id,
    index,
    donePhraseKey: definition.donePhraseKey,
    reward,
  }, focus);
}

function resetSuggestion(state) {
  state.suggestionObjectiveId = null;
  state.lastSuggestionTick = null;
}

function needsObjective(sim, state, id) {
  const definition = objectiveDefinition(id);
  return definition && !state.completedIds.includes(id) && !achievement(sim, definition);
}

function thermalSituation(sim) {
  let cold = false;
  let hot = false;
  for (const room of sim.excavations) {
    if (room.state === 'collapsed') continue;
    const roomHot = Boolean(room.alertLevels?.heat || room.heatAlertLevel)
      || (Number.isFinite(room.temperature) && room.temperature > HEAT.COMFORT_MAX);
    hot ||= roomHot;
    cold ||= !roomHot && (Boolean(room.alertLevels?.cold || room.coldAlertLevel)
      || (Number.isFinite(room.temperature) && room.temperature < HEAT.COMFORT_MIN));
  }
  return { cold, hot };
}

function suggestedObjective(sim, state) {
  for (const id of ['findWater', 'filterWater', 'waterReserve']) {
    if (needsObjective(sim, state, id)) return objectiveDefinition(id);
  }
  for (const id of ['foodReserve', 'growFood', 'insects']) {
    if (needsObjective(sim, state, id)) return objectiveDefinition(id);
  }
  if (needsObjective(sim, state, 'ventilate')) return objectiveDefinition('ventilate');
  const thermal = thermalSituation(sim);
  if (thermal.cold && !thermal.hot && needsObjective(sim, state, 'heatRoom')) {
    return objectiveDefinition('heatRoom');
  }
  return OBJECTIVE_DEFS.find((definition) => !state.completedIds.includes(definition.id)
    && !(thermal.hot && definition.id === 'heatRoom')) ?? null;
}

function updateIdleSuggestion(sim) {
  const state = notebook(sim);
  if (state.suggestionObjectiveId !== null
    || sim.tick - state.lastOrderTick < NOTEBOOK.IDLE_SUGGESTION_TICKS) return;
  const next = suggestedObjective(sim, state);
  if (!next) return;
  state.suggestionObjectiveId = next.id;
  state.lastSuggestionTick = sim.tick;
}

export function initializeObjectives(sim) {
  sim.m6 ??= {};
  sim.m6.notebook ??= {};
  const state = notebook(sim);
  const completed = Array.isArray(state.completedIds) ? state.completedIds : [];
  state.completedIds = [...new Set(completed.filter((id) => objectiveDefinition(id)))];
  state.lastOrderTick = Number.isFinite(state.lastOrderTick) ? state.lastOrderTick : sim.tick;
  state.speed = Number.isFinite(state.speed) ? state.speed : 1;
  state.idleSince = Number.isFinite(state.idleSince) ? state.idleSince : null;
  state.suggestionObjectiveId = objectiveDefinition(state.suggestionObjectiveId)?.id ?? null;
  state.lastSuggestionTick = Number.isFinite(state.lastSuggestionTick) ? state.lastSuggestionTick : null;
  return state;
}

export function updateObjectives(sim) {
  const state = initializeObjectives(sim);
  const index = OBJECTIVE_DEFS.findIndex((definition) => !state.completedIds.includes(definition.id));
  if (index >= 0) {
    const definition = OBJECTIVE_DEFS[index];
    const position = achievement(sim, definition);
    if (position) completeObjective(sim, definition, index, position);
  }
  updateIdleSuggestion(sim);
  return state;
}

export function recordNotebookOrder(sim, order, result) {
  const state = initializeObjectives(sim);
  if (!result?.ok || typeof order?.type !== 'string' || order.preview === true
    || order.type.endsWith('Preview')) return false;
  state.lastOrderTick = sim.tick;
  resetSuggestion(state);
  return true;
}

export function setNotebookSpeed(sim, speed) {
  const state = initializeObjectives(sim);
  if (!TIME.SPEEDS.includes(speed)) return false;
  state.speed = speed;
  return true;
}

export function notebookModel(sim) {
  const state = initializeObjectives(sim);
  const firstIncomplete = OBJECTIVE_DEFS.findIndex((definition) => !state.completedIds.includes(definition.id));
  const cursor = firstIncomplete < 0 ? OBJECTIVE_DEFS.length - 1 : firstIncomplete;
  const start = Math.max(0, Math.min(cursor > 0 ? cursor - 1 : cursor,
    OBJECTIVE_DEFS.length - NOTEBOOK.VISIBLE_OBJECTIVES));
  const entries = OBJECTIVE_DEFS.slice(start, start + NOTEBOOK.VISIBLE_OBJECTIVES).map((definition, offset) => ({
    id: definition.id,
    index: start + offset,
    textKey: definition.textKey,
    hintKey: definition.hintKey,
    donePhraseKey: definition.donePhraseKey,
    reward: { ...definition.reward },
    completed: state.completedIds.includes(definition.id),
  }));
  const suggested = objectiveDefinition(state.suggestionObjectiveId);
  return {
    entries,
    suggestionObjectiveId: suggested?.id ?? null,
    suggestion: suggested ? {
      objectiveId: suggested.id,
      textKey: suggested.hintKey,
    } : null,
    speed: state.speed,
  };
}

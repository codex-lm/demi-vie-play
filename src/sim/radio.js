import { TIME } from '../data/balance.js';
import { RADIO, RADIO_EVENTS, RADIO_NEIGHBORS_FULL as RADIO_NEIGHBORS } from '../data/radio.js';
import { RADIO_TEXT, radioText } from '../data/radioText.js';
import { RNG, hashString } from './rng.js';
import * as dilemmaModule from './dilemmas.js';
import { builtSurfaceStructure } from './surfaceStructures.js';
import { addToStock, createStock, recordReserveShift, spendResources } from './resources.js';
import { surfaceHatch } from './surface.js';
import { sendSurfaceCrewHome } from './surfaceCrew.js';

function neighborRng(sim, definition) {
  return new RNG(hashString(`${sim.seed}:radio:${definition.id}`));
}

function createNeighbors(sim) {
  const silenceRng = new RNG(hashString(`${sim.seed}:radio:silence`));
  const silentIndex = silenceRng.int(0, RADIO.NEIGHBOR_COUNT - 1);
  return RADIO_NEIGHBORS.slice(0, RADIO.NEIGHBOR_COUNT).map((definition, index) => {
    const rng = neighborRng(sim, definition);
    const stocks = Object.fromEntries(Object.entries(definition.stocks)
      .map(([resource, range]) => [resource, rng.int(range[0], range[1])]));
    return {
      id: definition.id,
      kind: definition.kind,
      nameKey: definition.nameKey,
      voiceKey: definition.voiceKey,
      distanceKm: rng.int(RADIO.DISTANCE_MIN_KM, RADIO.DISTANCE_MAX_KM),
      stocks,
      morale: rng.int(definition.morale[0], definition.morale[1]),
      rngState: rng.serialize(),
      contacted: false,
      contactInTicks: index * RADIO.CONTACT_INTERVAL_TICKS,
      ticksToEvent: rng.int(RADIO.EVENT_MIN_DAYS, RADIO.EVENT_MAX_DAYS) * TIME.TICKS_PER_DAY,
      eventIndex: 0,
      eventCount: 0,
      status: 'active',
      alive: true,
      fate: 'surviving',
      silentAfterEvents: index === silentIndex
        ? rng.int(RADIO.SILENCE_AFTER_MIN_EVENTS, RADIO.SILENCE_AFTER_MAX_EVENTS)
        : null,
      lastContactTick: null,
      silenceTick: null,
      helpRequested: false,
    };
  });
}

export function initializeRadio(sim) {
  sim.m5 ??= {};
  sim.m5.radio ??= {};
  const radio = sim.m5.radio;
  if (!Array.isArray(radio.neighbors) || radio.neighbors.length === 0) radio.neighbors = createNeighbors(sim);
  radio.messages ??= [];
  radio.receiving ??= false;
  radio.strength ??= 0;
  radio.trades ??= [];
  radio.helpRequests ??= [];
  radio.rescueRequests ??= [];
  radio.rescues ??= [];
  radio.pendingHelp ??= null;
  radio.nextMessageId ??= 1;
  radio.nextTradeId ??= 1;
  radio.activationTick ??= null;
  radio.totalEvents ??= 0;
}

function storeMessage(sim, details) {
  const radio = sim.m5.radio;
  const params = { ...(details.params ?? {}) };
  const text = radioText(details.textKey, params);
  const message = {
    id: `radio-${radio.nextMessageId++}`,
    tick: sim.tick,
    neighborId: details.neighborId ?? null,
    expeditionId: details.expeditionId ?? null,
    eventId: details.eventId ?? null,
    kind: details.kind,
    textKey: details.textKey,
    params,
    hint: details.hint === true,
  };
  radio.messages.push(message);
  if (radio.messages.length > RADIO.MAX_MESSAGES) radio.messages.splice(0, radio.messages.length - RADIO.MAX_MESSAGES);
  const silent = details.kind === 'silence';
  if (!silent && message.neighborId) {
    const neighbor = radio.neighbors.find((candidate) => candidate.id === message.neighborId);
    if (neighbor) neighbor.lastContactTick = sim.tick;
  }
  sim.log(silent ? 'warning' : 'info', silent ? 'eventRadioSilence' : 'eventRadioMessage', {
    messageId: message.id,
    neighborId: message.neighborId,
    expeditionId: message.expeditionId,
    eventId: message.eventId,
    kind: message.kind,
    textKey: message.textKey,
    text,
  });
  sim.events.push({ type: 'radioMessage', tick: sim.tick, messageId: message.id, neighborId: message.neighborId });
  return message;
}

function definitionFor(neighbor) {
  return RADIO_NEIGHBORS.find((definition) => definition.id === neighbor.id);
}

function restoreNeighborRng(neighbor) {
  return RNG.restore(neighbor.rngState);
}

function scheduleNextEvent(neighbor) {
  const rng = restoreNeighborRng(neighbor);
  neighbor.ticksToEvent = rng.int(RADIO.EVENT_MIN_DAYS, RADIO.EVENT_MAX_DAYS)
    * TIME.TICKS_PER_DAY;
  neighbor.rngState = rng.serialize();
}

function applyDeltas(neighbor, deltas) {
  for (const [resource, delta] of Object.entries(deltas?.stocks ?? {})) {
    neighbor.stocks[resource] = Math.max(RADIO.STOCK_MIN, (neighbor.stocks[resource] ?? 0) + delta);
  }
  neighbor.morale = Math.max(RADIO.MORALE_MIN, Math.min(RADIO.MORALE_MAX, neighbor.morale + (deltas?.morale ?? 0)));
}

function helpDefinition(sim, neighbor, eventId, definition) {
  const help = definition.help;
  const id = `radio-help-${neighbor.id}-${sim.m5.radio.totalEvents}`;
  return {
    id,
    source: 'radio',
    kind: 'radioHelp',
    neighborId: neighbor.id,
    eventId,
    titleKey: help.titleKey,
    textKey: definition.textKey,
    dialogueKey: definition.textKey,
    supplies: { ...help.supplies },
    choices: help.choices.map((choice) => ({
      ...choice,
      cost: choice.id === 'decline' ? {} : { ...help.supplies },
      expedition: choice.id === 'rescue' ? { kind: 'rescue', neighborId: neighbor.id } : null,
      risk: choice.id === 'decline' ? 'deathsAnnounced' : 'surface',
    })),
  };
}

function requestHelp(sim, neighbor, eventId, definition) {
  if (neighbor.helpRequested) return;
  neighbor.helpRequested = true;
  const dilemma = helpDefinition(sim, neighbor, eventId, definition);
  // Legacy saves retain their exact single-slot behavior. With the evening
  // queue, simultaneous calls must retain the older request as well.
  if (!sim.veillee || !sim.m5.radio.pendingHelp) sim.m5.radio.pendingHelp = dilemma;
  sim.m5.radio.helpRequests.push({ id: dilemma.id, neighborId: neighbor.id, tick: sim.tick, status: 'awaitingDilemma', dilemma });
}

function offerPendingHelp(sim) {
  const radio = sim.m5.radio;
  if (!radio.pendingHelp || typeof dilemmaModule.offerDilemma !== 'function') return;
  const dilemma = radio.pendingHelp;
  const result = dilemmaModule.offerDilemma(sim, dilemma, { source: 'radio' });
  if (result === false || result?.ok === false) return;
  radio.pendingHelp = null;
  const request = radio.helpRequests.find((candidate) => candidate.id === dilemma.id);
  if (request) {
    request.status = 'offered';
    request.offeredTick = sim.tick;
  }
  if (sim.veillee) {
    radio.pendingHelp = radio.helpRequests.find(candidate => candidate.status === 'awaitingDilemma')?.dilemma ?? null;
  }
}

function createTrade(sim, neighbor, eventId, definition) {
  const radio = sim.m5.radio;
  const trade = {
    id: `trade-${radio.nextTradeId}`,
    neighborId: neighbor.id,
    eventId,
    state: 'offered',
    createdTick: sim.tick,
    acceptedTick: null,
    pickupTick: null,
    completedTick: null,
    give: { ...definition.trade.give },
    receive: { ...definition.trade.receive },
    morale: definition.trade.morale,
    depositedStockId: null,
  };
  if (!reserveTradeCounterpart(neighbor, trade)) return null;
  radio.nextTradeId += 1;
  radio.trades.push(trade);
  return trade;
}

function releaseTradeCounterpart(neighbor, trade) {
  if (!trade.reservedReceive) return;
  if (neighbor) {
    for (const [resource, amount] of Object.entries(trade.reservedReceive)) {
      neighbor.stocks[resource] = (neighbor.stocks[resource] ?? 0) + amount;
    }
  }
  trade.reservedReceive = null;
}

// The player's goods stay in the surface deposit: nobody will come for them.
function abandonTrade(sim, trade) {
  trade.state = 'abandoned';
  trade.closedTick = sim.tick;
  const neighbor = sim.m5.radio.neighbors.find((candidate) => candidate.id === trade.neighborId);
  releaseTradeCounterpart(neighbor, trade);
  const stock = sim.stocks.find((candidate) => candidate.id === trade.depositedStockId);
  if (stock?.kind === 'radioTrade') stock.kind = 'radioTradeReturned';
  sim.log('warning', 'eventRadioTradeAbandoned', {
    tradeId: trade.id,
    neighborId: trade.neighborId,
    stockId: trade.depositedStockId,
    text: radioText('radioTradeAbandoned'),
  });
}

function silenceNeighbor(sim, neighbor) {
  const definition = definitionFor(neighbor);
  neighbor.status = 'silent';
  neighbor.alive = false;
  neighbor.fate = 'silent';
  neighbor.silenceTick = sim.tick;
  neighbor.ticksToEvent = null;
  for (const trade of sim.m5.radio.trades) {
    if (trade.neighborId !== neighbor.id) continue;
    if (trade.state === 'offered') {
      trade.state = 'withdrawn';
      trade.closedTick = sim.tick;
      releaseTradeCounterpart(neighbor, trade);
    } else if (trade.state === 'deposited') abandonTrade(sim, trade);
  }
  storeMessage(sim, {
    neighborId: neighbor.id,
    eventId: 'silence',
    kind: 'silence',
    textKey: definition.silenceKey,
  });
}

function runNeighborEvent(sim, neighbor) {
  const definition = definitionFor(neighbor);
  if (neighbor.silentAfterEvents !== null && neighbor.eventCount >= neighbor.silentAfterEvents) {
    silenceNeighbor(sim, neighbor);
    return;
  }
  const eventId = definition.events[neighbor.eventIndex % definition.events.length];
  const event = RADIO_EVENTS[eventId];
  neighbor.eventIndex += 1;
  neighbor.eventCount += 1;
  sim.m5.radio.totalEvents += 1;
  applyDeltas(neighbor, event.deltas);
  if (event.trade && !createTrade(sim, neighbor, eventId, event)) {
    scheduleNextEvent(neighbor);
    return;
  }
  storeMessage(sim, {
    neighborId: neighbor.id,
    eventId,
    kind: event.help ? 'help' : event.trade ? 'trade' : 'news',
    textKey: event.textKey,
    hint: event.hint,
    params: { morale: neighbor.morale, stocks: { ...neighbor.stocks } },
  });
  if (event.help) requestHelp(sim, neighbor, eventId, event);
  scheduleNextEvent(neighbor);
}

function updateConnection(sim) {
  const radio = sim.m5.radio;
  const wasReceiving = radio.receiving;
  radio.receiving = builtSurfaceStructure(sim, 'antenna') !== null;
  radio.strength = radio.receiving ? RADIO.SIGNAL_STRENGTH : 0;
  if (radio.receiving === wasReceiving) return;
  if (radio.receiving) {
    radio.activationTick ??= sim.tick;
    sim.log('info', 'eventRadioOnline', { text: radioText('radioOnline') });
  } else {
    sim.log('info', 'eventRadioOffline', { text: radioText('radioOffline') });
  }
}

function reserveTradeCounterpart(neighbor, trade) {
  if (trade.reservedReceive) return true;
  if (!neighbor || !Object.entries(trade.receive)
    .every(([resource, amount]) => (neighbor.stocks[resource] ?? 0) >= amount)) return false;
  for (const [resource, amount] of Object.entries(trade.receive)) {
    neighbor.stocks[resource] = Math.max(RADIO.STOCK_MIN, (neighbor.stocks[resource] ?? 0) - amount);
  }
  trade.reservedReceive = { ...trade.receive };
  return true;
}

function updateTrades(sim) {
  for (const trade of sim.m5.radio.trades) {
    if (trade.state !== 'deposited' || sim.tick < trade.pickupTick) continue;
    const stock = sim.stocks.find((candidate) => candidate.id === trade.depositedStockId);
    if (!stock || !Object.entries(trade.give).every(([resource, amount]) => (stock.resources[resource] ?? 0) >= amount)) continue;
    const neighbor = sim.m5.radio.neighbors.find((candidate) => candidate.id === trade.neighborId);
    if (!neighbor || neighbor.status !== 'active') { abandonTrade(sim, trade); continue; }
    if (!reserveTradeCounterpart(neighbor, trade)) continue;
    for (const [resource, amount] of Object.entries(trade.give)) {
      stock.resources[resource] -= amount;
      if (stock.resources[resource] <= 0) delete stock.resources[resource];
      recordReserveShift(sim, resource, -amount);
    }
    for (const [resource, amount] of Object.entries(trade.receive)) {
      addToStock(stock, resource, amount);
      if (amount > 0) recordReserveShift(sim, resource, amount);
    }
    trade.state = 'completed';
    trade.completedTick = sim.tick;
    if (neighbor) applyDeltas(neighbor, { stocks: trade.give, morale: trade.morale });
    sim.log('info', 'eventRadioTradeCompleted', {
      tradeId: trade.id,
      neighborId: trade.neighborId,
      stockId: stock.id,
      text: radioText('radioTradeCompleted'),
    });
  }
}

export function updateRadio(sim) {
  initializeRadio(sim);
  updateConnection(sim);
  updateTrades(sim);
  if (!sim.m5.radio.receiving) return;
  for (const neighbor of sim.m5.radio.neighbors) {
    if (!neighbor.contacted) {
      neighbor.contactInTicks -= 1;
      if (neighbor.contactInTicks <= 0) {
        const definition = definitionFor(neighbor);
        neighbor.contacted = true;
        neighbor.lastContactTick = sim.tick;
        storeMessage(sim, { neighborId: neighbor.id, eventId: 'contact', kind: 'contact', textKey: definition.contactKey });
      }
    }
    if (neighbor.status !== 'active') continue;
    neighbor.ticksToEvent -= 1;
    if (neighbor.ticksToEvent <= 0) runNeighborEvent(sim, neighbor);
  }
  offerPendingHelp(sim);
}

export function radioTradeAccept(sim, order) {
  initializeRadio(sim);
  updateConnection(sim);
  if (!sim.m5.radio.receiving) return { ok: false, error: 'radioOffline' };
  const trade = sim.m5.radio.trades.find((candidate) => candidate.id === order.tradeId);
  if (!trade || trade.state !== 'offered') return { ok: false, error: 'radioTradeUnavailable' };
  const neighbor = sim.m5.radio.neighbors.find((candidate) => candidate.id === trade.neighborId);
  if (!neighbor || neighbor.status !== 'active') {
    trade.state = 'withdrawn';
    trade.closedTick = sim.tick;
    releaseTradeCounterpart(neighbor, trade);
    return { ok: false, error: 'radioNeighborSilent' };
  }
  if (!reserveTradeCounterpart(neighbor, trade)) return { ok: false, error: 'radioNeighborShort' };
  if (!spendResources(sim, trade.give)) {
    releaseTradeCounterpart(neighbor, trade);
    return { ok: false, error: 'noResources' };
  }
  const hatch = surfaceHatch(sim);
  const stock = createStock(`radio-${trade.id}`, hatch.x, hatch.y);
  stock.kind = 'radioTrade';
  stock.tradeId = trade.id;
  for (const [resource, amount] of Object.entries(trade.give)) addToStock(stock, resource, amount);
  sim.stocks.push(stock);
  trade.state = 'deposited';
  trade.acceptedTick = sim.tick;
  trade.pickupTick = sim.tick + RADIO.TRADE_PICKUP_TICKS;
  trade.depositedStockId = stock.id;
  sim.log('info', 'eventRadioTradeAccepted', {
    tradeId: trade.id,
    neighborId: trade.neighborId,
    stockId: stock.id,
    text: radioText('radioTradeAccepted'),
  });
  return { ok: true, trade, stock };
}

function expeditionIdOf(expedition) {
  return typeof expedition === 'object' && expedition !== null ? expedition.id : expedition;
}

export function recordExpeditionMessage(sim, expedition, textKey, params = {}) {
  initializeRadio(sim);
  if (!builtSurfaceStructure(sim, 'antenna')) return null;
  sim.m5.radio.receiving = true;
  sim.m5.radio.strength = RADIO.SIGNAL_STRENGTH;
  const expeditionId = expeditionIdOf(expedition);
  return storeMessage(sim, { expeditionId, kind: 'expedition', textKey, params });
}

export function recallExpedition(sim, expedition) {
  initializeRadio(sim);
  if (!builtSurfaceStructure(sim, 'antenna')) return { ok: false, error: 'radioOffline' };
  const expeditionId = expeditionIdOf(expedition);
  const active = sim.expeditions?.active?.find((candidate) => candidate.id === expeditionId);
  if (!active || active.state === 'returning' || active.state === 'returned' || active.state === 'lost'
    || active.state === 'encounter') {
    return { ok: false, error: 'expeditionUnavailable' };
  }
  active.recallRequested = true;
  active.siteResolved = true;
  active.state = 'returning';
  active.returnTick = sim.tick;
  sendSurfaceCrewHome(active.crew);
  if (sim.expeditions.pendingEncounter?.expeditionId === active.id) {
    const next = sim.expeditions.active.find((candidate) => candidate.id !== active.id
      && candidate.state === 'encounter' && candidate.encounter?.choiceIndex === null);
    sim.expeditions.pendingEncounter = next?.encounter ?? null;
  }
  recordExpeditionMessage(sim, active, 'radioExpeditionRecall', { site: active.siteId, siteId: active.siteId });
  return { ok: true, expedition: active };
}

export function applyRadioOrder(sim, order) {
  if (order.type === 'radioTradeAccept') return radioTradeAccept(sim, order);
  if (order.type === 'radioExpeditionRecall' || order.type === 'expeditionRecall') return recallExpedition(sim, order.expeditionId);
  return null;
}

function exportedNeighbor(sim, neighbor) {
  const survived = neighbor.contacted && neighbor.alive && neighbor.status === 'active';
  return {
    id: neighbor.id,
    kind: neighbor.kind,
    nameKey: neighbor.nameKey,
    sourceSeed: sim.seed,
    distanceKm: neighbor.distanceKm,
    survived,
    fate: survived ? 'surviving' : neighbor.contacted ? neighbor.fate : 'unknown',
    stocks: { ...neighbor.stocks },
    morale: neighbor.morale,
    eventCount: neighbor.eventCount,
    lastContactTick: neighbor.lastContactTick,
    silenceTick: neighbor.silenceTick,
  };
}

export function exportRadioNeighbors(sim) {
  initializeRadio(sim);
  return sim.m5.radio.neighbors.map((neighbor) => exportedNeighbor(sim, neighbor));
}

export function exportSurvivingNeighbors(sim) {
  return exportRadioNeighbors(sim).filter((neighbor) => neighbor.survived);
}

export { RADIO_TEXT };

import { TIME, WORLD } from '../data/balance.js';
import { PEOPLE } from '../data/people.js';
import { DILEMMA_RULES } from '../data/dilemmas.js';
import { RADIO } from '../data/radio.js';
import { radioText } from '../data/radioText.js';
import { addDose, surfaceDoseRate, suitProtection } from './radiation.js';
import { addToStock, createStock, hasResources, spendResources } from './resources.js';
import { hashString } from './rng.js';
import { surfaceHatch } from './surface.js';
import { canJoinSurfaceCrew, createSurfaceCrew, releaseSurfaceCrew, sendSurfaceCrewHome, updateSurfaceCrew } from './surfaceCrew.js';

function initializeRescues(sim) {
  sim.m5 ??= {};
  sim.m5.radio ??= {};
  const radio = sim.m5.radio;
  radio.rescues ??= [];
  radio.rescueRequests ??= [];
  radio.helpRequests ??= [];
  radio.messages ??= [];
  radio.nextMessageId ??= 1;
  return radio;
}

function livingCrewColonist(sim, colonistId) {
  const colonist = sim.colonists.find((candidate) => candidate.id === colonistId);
  return colonist && colonist.health > 0 && !colonist.dead ? colonist : null;
}

export function selectRescueCrew(sim, preferredIds = null) {
  const preferred = preferredIds === null ? null : new Set(preferredIds);
  return sim.colonists
    .filter((colonist) => colonist.health > 0 && !colonist.dead && !colonist.surfaceCrewId
      && (colonist.age ?? PEOPLE.ADULT_AGE) >= PEOPLE.MINIMUM_WORK_AGE
      && (colonist.bodyLocation ?? 'colony') === 'colony'
      && (colonist.workBlockedUntil ?? 0) <= sim.tick
      && (preferred === null || preferred.has(colonist.id)) && canJoinSurfaceCrew(sim, colonist))
    .sort((a, b) => a.id - b.id)
    .slice(0, RADIO.RESCUE_MAX_CREW);
}

function destinationFor(sim, neighbor) {
  const hatch = surfaceHatch(sim);
  const hash = hashString(`${sim.seed}:radio-rescue:${neighbor.id}`);
  const distance = Math.max(2, Math.round(neighbor.distanceKm * RADIO.RESCUE_CELLS_PER_KM));
  const right = hatch.x + distance <= sim.world.width - 1;
  const left = hatch.x - distance >= 0;
  const direction = right && (!left || hash % 2 === 0) ? 1 : -1;
  return Math.max(0, Math.min(sim.world.width - 1, hatch.x + direction * distance));
}

function rescueMessage(sim, mission, textKey, kind = 'rescue') {
  const radio = initializeRescues(sim);
  const neighbor = radio.neighbors?.find((candidate) => candidate.id === mission.neighborId);
  const params = {
    neighbor: neighbor ? radioText(neighbor.nameKey) : mission.neighborId,
    dose: Math.round((mission.averageDose ?? 0) * 1000) / 1000,
  };
  const message = {
    id: `radio-${radio.nextMessageId++}`,
    tick: sim.tick,
    neighborId: mission.neighborId,
    expeditionId: null,
    eventId: mission.requestId,
    kind,
    textKey,
    params,
    hint: false,
  };
  radio.messages.push(message);
  if (radio.messages.length > RADIO.MAX_MESSAGES) radio.messages.splice(0, radio.messages.length - RADIO.MAX_MESSAGES);
  sim.log(kind === 'rescueLost' ? 'error' : 'info', 'eventRadioMessage', {
    messageId: message.id,
    neighborId: message.neighborId,
    eventId: message.eventId,
    kind,
    textKey,
    text: radioText(textKey, params),
  });
  sim.events.push({ type: 'radioMessage', tick: sim.tick, messageId: message.id, neighborId: message.neighborId });
  return message;
}

export function startRescue(sim, { requestId, neighborId, resources, colonistIds = null }) {
  const radio = initializeRescues(sim);
  const existing = radio.rescues.find((mission) => mission.requestId === requestId);
  if (existing) return { ok: false, error: 'rescueUnavailable', rescue: existing };
  const neighbor = radio.neighbors?.find((candidate) => candidate.id === neighborId);
  if (!neighbor || !neighbor.alive || neighbor.status !== 'active') return { ok: false, error: 'rescueUnavailable' };
  const cargo = Object.fromEntries(Object.entries(resources ?? {}).filter(([, amount]) => amount > 0));
  if (!hasResources(sim, cargo)) return { ok: false, error: 'noResources' };
  const selected = selectRescueCrew(sim, colonistIds);
  if (selected.length < RADIO.RESCUE_MIN_CREW) return { ok: false, error: 'expeditionUnavailable' };
  if (!spendResources(sim, cargo)) return { ok: false, error: 'noResources' };

  const hatch = surfaceHatch(sim);
  const id = `rescue-${requestId}`;
  const stock = createStock(`radio-${id}`, hatch.x, hatch.y);
  stock.kind = 'radioRescue';
  stock.rescueId = id;
  for (const [resource, amount] of Object.entries(cargo)) addToStock(stock, resource, amount);
  sim.stocks.push(stock);
  const crew = createSurfaceCrew(sim, {
    id: `crew-${id}`,
    kind: 'rescue',
    colonistIds: selected.map((colonist) => colonist.id),
    destinationX: destinationFor(sim, neighbor),
  });
  const mission = {
    id,
    requestId,
    neighborId,
    state: 'outbound',
    createdTick: sim.tick,
    departureTick: sim.tick,
    arrivalTick: null,
    returnedTick: null,
    colonistIds: [...crew.colonistIds],
    destinationX: crew.destinationX,
    cargo: { ...cargo },
    cargoStockId: stock.id,
    startDoses: Object.fromEntries(selected.map((colonist) => [colonist.id, colonist.dose ?? 0])),
    averageDose: 0,
    lastUpdateTick: sim.tick,
    crew,
  };
  radio.rescues.push(mission);
  rescueMessage(sim, mission, 'radioRescueDeparture');
  return { ok: true, rescue: mission, stock };
}

function moveCargo(sim, mission) {
  const stock = sim.stocks.find((candidate) => candidate.id === mission.cargoStockId);
  if (!stock) return;
  const carrier = mission.colonistIds.map((id) => livingCrewColonist(sim, id)).find(Boolean);
  if (!carrier) return;
  stock.x = carrier.x;
  stock.y = carrier.y;
}

function exposeCrew(sim, mission) {
  for (const colonistId of mission.colonistIds) {
    const colonist = livingCrewColonist(sim, colonistId);
    if (!colonist || colonist.y >= WORLD.SURFACE_Y) continue;
    const alreadyExposed = (colonist.doseHistory ?? []).some((entry) => entry.tick === sim.tick && entry.source === 'surface');
    if (alreadyExposed) continue;
    const amount = surfaceDoseRate(sim, colonist.x) * (1 - suitProtection(sim, colonist)) / TIME.TICKS_PER_HOUR;
    addDose(sim, colonist, amount, 'surface');
  }
}

function averageDose(sim, mission) {
  if (mission.colonistIds.length === 0) return 0;
  return mission.colonistIds.reduce((total, id) => {
    const colonist = sim.colonists.find((candidate) => candidate.id === id);
    return total + Math.max(0, (colonist?.dose ?? mission.startDoses[id] ?? 0) - (mission.startDoses[id] ?? 0));
  }, 0) / mission.colonistIds.length;
}

function updateRequests(sim, mission, status, resolved) {
  const radio = initializeRescues(sim);
  const request = radio.helpRequests.find((candidate) => candidate.id === mission.requestId);
  if (request) {
    if (status === 'delivered') request.status = 'resolved';
    else if (status !== 'completed') request.status = status;
    request.choiceId = 'rescue';
    if (resolved) request.resolvedTick ??= sim.tick;
  }
  const rescueRequest = radio.rescueRequests.find((candidate) => candidate.id === mission.requestId);
  if (rescueRequest) {
    rescueRequest.status = status;
    rescueRequest.rescueId = mission.id;
    if (resolved) rescueRequest.resolvedTick ??= sim.tick;
  }
}

function deliverRescue(sim, mission) {
  if (mission.arrivalTick !== null) return;
  const radio = initializeRescues(sim);
  const neighbor = radio.neighbors?.find((candidate) => candidate.id === mission.neighborId);
  if (!neighbor || !neighbor.alive || neighbor.status !== 'active') {
    mission.state = 'returning';
    updateRequests(sim, mission, 'unavailable', true);
    sendSurfaceCrewHome(mission.crew);
    rescueMessage(sim, mission, 'radioRescueUnavailable', 'rescueLost');
    return;
  }
  const stock = sim.stocks.find((candidate) => candidate.id === mission.cargoStockId);
  if (!stock || !Object.entries(mission.cargo).every(([resource, amount]) => (stock.resources[resource] ?? 0) >= amount)) {
    mission.state = 'returning';
    updateRequests(sim, mission, 'noResources', true);
    sendSurfaceCrewHome(mission.crew);
    rescueMessage(sim, mission, 'radioRescueUnavailable', 'rescueLost');
    return;
  }
  for (const [resource, amount] of Object.entries(mission.cargo)) {
    stock.resources[resource] -= amount;
    if (stock.resources[resource] <= 0) delete stock.resources[resource];
    neighbor.stocks[resource] = Math.max(0, (neighbor.stocks[resource] ?? 0) + amount);
  }
  const outcome = DILEMMA_RULES.RADIO_HELP_CONSEQUENCES.rescue;
  neighbor.morale = Math.max(0, Math.min(100, neighbor.morale + outcome.morale));
  mission.state = 'returning';
  mission.arrivalTick = sim.tick;
  mission.averageDose = averageDose(sim, mission);
  updateRequests(sim, mission, 'delivered', true);
  sendSurfaceCrewHome(mission.crew);
  rescueMessage(sim, mission, 'radioRescueDelivered');
}

function loseRescue(sim, mission) {
  if (mission.state === 'lost') return;
  mission.state = 'lost';
  mission.averageDose = averageDose(sim, mission);
  releaseSurfaceCrew(sim, mission.crew);
  updateRequests(sim, mission, 'lost', true);
  rescueMessage(sim, mission, 'radioRescueLost', 'rescueLost');
}

export function updateRescues(sim) {
  const radio = initializeRescues(sim);
  for (const mission of radio.rescues) {
    if (mission.state === 'completed' || mission.state === 'lost' || mission.lastUpdateTick === sim.tick) continue;
    mission.lastUpdateTick = sim.tick;
    updateSurfaceCrew(sim, mission.crew);
    if (mission.crew.childRecall && mission.state === 'outbound') {
      mission.state = 'returning';
      updateRequests(sim, mission, 'unavailable', true);
    }
    exposeCrew(sim, mission);
    moveCargo(sim, mission);
    if (mission.crew.phase === 'lost') {
      loseRescue(sim, mission);
      continue;
    }
    if (mission.state === 'outbound' && mission.crew.phase === 'surface') deliverRescue(sim, mission);
    if (mission.state !== 'returning' || mission.crew.phase !== 'inside') continue;
    releaseSurfaceCrew(sim, mission.crew);
    mission.state = 'completed';
    mission.returnedTick = sim.tick;
    mission.averageDose = averageDose(sim, mission);
    updateRequests(sim, mission, 'completed', true);
    rescueMessage(sim, mission, 'radioRescueReturned');
  }
  return radio.rescues;
}

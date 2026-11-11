import { TIME } from '../data/balance.js';
import { DILEMMAS_FULL as DILEMMAS, DILEMMA_RULES, dilemmaDefinition } from '../data/dilemmas.js';
import { DILEMMA_PREVIEW_KEY } from '../data/dilemmaPreviewText.js';
import { FACTION_IDS, FACTION_RULES, lawDefinition } from '../data/laws.js';
import { M5 } from '../data/m5.js';
import { PEOPLE } from '../data/people.js';
import { RADIO_TEXT } from '../data/radioText.js';
import { dilemmaTextKey, STORYTELLER_TEXT } from '../data/storytellerText.js';
import { createInitialColonists } from './colonists.js';
import { createPersonProfile } from './people.js';
import { selectRescueCrew, startRescue } from './rescue.js';
import { addToStock, createStock, hasResources, recordReserveShift, reserveStock, spendableAmount, spendResources } from './resources.js';
import { hashString, RNG } from './rng.js';
import { surfaceHatch } from './surface.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const living = (sim) => (sim.colonists ?? []).filter((colonist) => colonist.health > 0 && !colonist.dead)
  .sort((a, b) => a.id - b.id);

function randomInt(sim, min, max) {
  const state = sim.m5.dilemmas;
  const rng = new RNG(state.rngState);
  const value = rng.int(min, max);
  state.rngState = rng.serialize();
  return value;
}

function scheduleNextDilemma(sim, fromTick = sim.tick) {
  const base = sim.tick <= M5.DILEMMA_MIN_DELAY && fromTick === sim.tick
    ? M5.DILEMMA_MIN_DELAY : fromTick + M5.DILEMMA_MIN_DELAY;
  sim.m5.dilemmas.nextDilemmaTick = base + randomInt(sim, 0, M5.DILEMMA_VARIABILITY);
}

export function initializeDilemmas(sim) {
  sim.m5 ??= {};
  sim.m5.dilemmas ??= {};
  const state = sim.m5.dilemmas;
  state.pending ??= null;
  state.history ??= [];
  state.scheduled ??= [];
  state.nextId ??= 1;
  state.lastDefinitionId ??= null;
  state.rngState ??= hashString(`${sim.seed}:m5:dilemmas`);
  if (!Number.isFinite(state.nextDilemmaTick)) scheduleNextDilemma(sim);
}

function namedTarget(colonist) {
  return colonist ? { colonistId: colonist.id, name: colonist.name } : null;
}

function selectTarget(sim, definition) {
  const people = living(sim);
  if (people.length === 0) return null;
  if (definition.target === 'elder') {
    return namedTarget([...people].filter((colonist) => colonist.age >= PEOPLE.ELDER_AGE)
      .sort((a, b) => b.age - a.age || a.id - b.id)[0]);
  }
  if (definition.target === 'couple') {
    return namedTarget(people.find((colonist) => colonist.coupleId !== null
      && people.some((partner) => partner.id === colonist.coupleId)));
  }
  const skill = { miner: 'dig', technician: 'tech', farmer: 'farm', medic: 'medic' }[definition.target];
  if (skill) return namedTarget([...people].sort((a, b) => (b.skills?.[skill] ?? 0) - (a.skills?.[skill] ?? 0) || a.id - b.id)[0]);
  return namedTarget(people[randomInt(sim, 0, people.length - 1)]);
}

function hasAntenna(sim) {
  return (sim.surface?.structures ?? []).some((structure) => structure.type === 'antenna' && structure.state === 'built');
}

function canAutomaticallyOffer(sim, definition, mode) {
  if (mode === 'veilleur' && !definition.gentle) return false;
  if (definition.target === 'radio' && !hasAntenna(sim)) return false;
  return selectTargetPreview(sim, definition) !== null;
}

function selectTargetPreview(sim, definition) {
  const people = living(sim);
  if (people.length === 0) return null;
  if (definition.target === 'elder') return people.some((colonist) => colonist.age >= PEOPLE.ELDER_AGE) ? true : null;
  if (definition.target === 'couple') {
    return people.some((colonist) => colonist.coupleId !== null
      && people.some((partner) => partner.id === colonist.coupleId)) ? true : null;
  }
  return true;
}

function interpolate(text, params) {
  return text.replace(/\{(\w+)\}/g, (match, key) => params[key] ?? match);
}

function textKeyFor(definition, part, index = null) {
  if (definition.titleKey) {
    if (part === 'title') return definition.titleKey;
    if (part === 'body') return definition.textKey;
    const choice = definition.choices[index];
    if (part === 'choice') return choice.labelKey;
    return choice.consequenceTextKey ?? choice.consequenceKey ?? choice.descriptionKey;
  }
  return dilemmaTextKey(definition.id, part, index);
}

function previewConsequenceKey(definition, choice, index) {
  const explicitKey = choice.consequenceKey ?? choice.consequenceTextKey ?? choice.descriptionKey;
  return explicitKey ?? (definition.titleKey ? textKeyFor(definition, 'choice', index) : DILEMMA_PREVIEW_KEY);
}

function dilemmaText(definition, part, index, target) {
  const key = textKeyFor(definition, part, index);
  return interpolate(STORYTELLER_TEXT[key] ?? RADIO_TEXT[key] ?? key, { name: target?.name ?? '' });
}

function definitionForPending(pending) {
  return dilemmaDefinition(pending.definitionId) ?? pending.definition ?? null;
}

function effectsForChoice(choice) {
  if (choice.effects) return choice.effects;
  return {
    resources: Object.fromEntries(Object.entries(choice.cost ?? {}).map(([resource, amount]) => [resource, -amount])),
  };
}

export function offerDilemma(sim, definition, options = {}) {
  initializeDilemmas(sim);
  const resolved = typeof definition === 'string' ? dilemmaDefinition(definition) : definition;
  if (!resolved || !Array.isArray(resolved.choices) || resolved.choices.length !== 3) {
    return { ok: false, error: 'dilemmaUnavailable' };
  }
  if (sim.m5.dilemmas.pending) return { ok: false, error: 'dilemmaAlreadyPending', dilemma: sim.m5.dilemmas.pending };
  const target = selectTarget(sim, resolved);
  if (!target && ['elder', 'couple'].includes(resolved.target)) return { ok: false, error: 'dilemmaTargetUnavailable' };
  const pending = {
    id: sim.m5.dilemmas.nextId++,
    definitionId: resolved.id,
    definition: dilemmaDefinition(resolved.id) ? undefined : resolved,
    offeredTick: sim.tick,
    source: options.source ?? 'storyteller',
    mode: sim.m5.storyteller?.mode ?? 'chroniqueur',
    target,
    name: target?.name ?? null,
    titleKey: textKeyFor(resolved, 'title'),
    bodyKey: textKeyFor(resolved, 'body'),
    choices: resolved.choices.map((choice, index) => {
      const consequenceKey = previewConsequenceKey(resolved, choice, index);
      return {
        index,
        id: choice.id ?? index,
        textKey: textKeyFor(resolved, 'choice', index),
        consequenceKey,
        consequenceTextKey: consequenceKey,
      };
    }),
  };
  sim.m5.dilemmas.pending = pending;
  sim.m5.dilemmas.lastDefinitionId = resolved.id;
  sim.log('info', 'eventDilemmaOffered', {
    dilemmaId: pending.id,
    definitionId: resolved.id,
    title: dilemmaText(resolved, 'title', null, target),
    summary: dilemmaText(resolved, 'title', null, target),
    body: dilemmaText(resolved, 'body', null, target),
    name: target?.name ?? null,
    colonistId: target?.colonistId ?? null,
  });
  sim.events.push({ type: 'dilemmaOffered', tick: sim.tick, dilemmaId: pending.id, definitionId: resolved.id });
  return { ok: true, dilemma: pending };
}

function copyEffects(effects) {
  return {
    ...effects,
    resources: effects.resources ? { ...effects.resources } : undefined,
    factions: effects.factions ? { ...effects.factions } : undefined,
    surfaceDeposit: effects.surfaceDeposit ? { ...effects.surfaceDeposit } : undefined,
    arrivals: effects.arrivals?.map((arrival) => ({ ...arrival })),
  };
}

function resourceReservation(effects) {
  return Object.fromEntries(Object.entries(effects.resources ?? {})
    .filter(([, delta]) => delta < 0)
    .map(([resource, delta]) => [resource, -delta]));
}

function missingResources(sim, cost) {
  return Object.fromEntries(Object.entries(cost)
    .map(([resource, amount]) => [resource, Math.max(0, amount - spendableAmount(sim, resource))])
    .filter(([, missing]) => missing > 0));
}

export function chooseDilemma(sim, order) {
  initializeDilemmas(sim);
  const pending = sim.m5.dilemmas.pending;
  const definition = pending ? definitionForPending(pending) : null;
  if (!pending || !definition || pending.id !== order.dilemmaId || !Number.isInteger(order.choiceIndex)
    || order.choiceIndex < 0 || order.choiceIndex >= definition.choices.length) {
    return { ok: false, error: 'dilemmaUnavailable' };
  }
  const choice = definition.choices[order.choiceIndex];
  const effects = effectsForChoice(choice);
  const reservedResources = resourceReservation(effects);
  if (!hasResources(sim, reservedResources)) {
    return { ok: false, error: 'noResources', missing: missingResources(sim, reservedResources) };
  }
  const rescueColonistIds = choice.expedition?.kind === 'rescue'
    ? selectRescueCrew(sim).map((colonist) => colonist.id) : null;
  if (rescueColonistIds !== null && rescueColonistIds.length === 0) {
    return { ok: false, error: 'expeditionUnavailable' };
  }
  const delayDays = choice.delayDays ?? DILEMMA_RULES.RADIO_DELAY_DAYS;
  const dueTick = sim.tick + delayDays * TIME.TICKS_PER_DAY;
  pending.choiceIndex = order.choiceIndex;
  pending.chosenTick = sim.tick;
  pending.consequenceTick = dueTick;
  pending.choiceTextKey = textKeyFor(definition, 'choice', order.choiceIndex);
  pending.consequenceTextKey = textKeyFor(definition, 'result', order.choiceIndex);
  pending.reservedResources = { ...reservedResources };
  sim.m5.dilemmas.scheduled.push({
    dilemmaId: pending.id,
    definitionId: definition.id,
    definition: dilemmaDefinition(definition.id) ? undefined : definition,
    choiceIndex: order.choiceIndex,
    choiceId: choice.id ?? order.choiceIndex,
    expedition: choice.expedition ?? null,
    dueTick,
    target: pending.target ? { ...pending.target } : null,
    effects: copyEffects(effects),
    reservedResources: { ...reservedResources },
    rescueColonistIds,
  });
  sim.m5.dilemmas.history.push(pending);
  sim.m5.dilemmas.pending = null;
  const choiceText = dilemmaText(definition, 'choice', order.choiceIndex, pending.target);
  sim.log(effects.killTarget || effects.targetDisease || choice.risk === 'deathsAnnounced' ? 'warning' : 'info', 'eventDilemmaChosen', {
    dilemmaId: pending.id,
    definitionId: definition.id,
    choiceIndex: order.choiceIndex,
    choice: choiceText,
    summary: interpolate(STORYTELLER_TEXT.dilemmaChosenSummary, { choice: choiceText }),
    dueTick,
    name: pending.name,
    colonistId: pending.target?.colonistId ?? null,
  });
  sim.events.push({
    type: 'dilemmaChosen', tick: sim.tick, dilemmaId: pending.id,
    definitionId: definition.id, choiceIndex: order.choiceIndex, dueTick,
  });
  scheduleNextDilemma(sim, sim.tick);
  return { ok: true, dilemma: pending };
}

function adjustResources(sim, deltas, reservedResources) {
  const cost = reservedResources ?? resourceReservation({ resources: deltas });
  if (!spendResources(sim, cost)) return false;
  for (const [resource, amount] of Object.entries(cost ?? {})) recordReserveShift(sim, resource, -amount);
  let outputStock = null;
  for (const [resource, delta] of Object.entries(deltas ?? {})) {
    if (delta <= 0) continue;
    if (!outputStock) {
      outputStock = reserveStock(sim) ?? sim.stocks[0] ?? null;
      if (!outputStock) {
        const hatch = surfaceHatch(sim);
        outputStock = createStock(`dilemma-${sim.tick}-resources`, hatch.x, hatch.y);
        sim.stocks.push(outputStock);
      }
    }
    addToStock(outputStock, resource, delta);
    recordReserveShift(sim, resource, delta);
  }
  return true;
}

function addArrivals(sim, arrivals) {
  const ids = [];
  const hatch = surfaceHatch(sim);
  const room = hatch.excavation;
  for (const arrival of arrivals ?? []) {
    const x = room?.x ?? hatch.x;
    const y = room ? room.y + room.h - 1 : hatch.y + 1;
    const id = Math.max(sim.nextColonistId ?? 0, ...sim.colonists.map((colonist) => colonist.id + 1));
    const template = createInitialColonists({ x, y })[id % 12];
    const person = {
      ...template,
      ...createPersonProfile(sim.seed, id),
      id,
      name: template.name,
      age: arrival.age,
      lifeStage: arrival.age < PEOPLE.ADULT_AGE ? 'child' : 'adult',
      bedIndex: id,
      bedX: x,
      bedY: y,
      restX: x,
      restY: y,
      x,
      y,
      prevX: x,
      prevY: y,
      direction: id % 2 === 0 ? 1 : -1,
      animation: id * 0.7,
      arrivalTick: sim.tick,
    };
    sim.nextColonistId = id + 1;
    sim.colonists.push(person);
    ids.push(id);
  }
  return ids;
}

function depositSurfaceResources(sim, consequence) {
  if (!consequence.effects.surfaceDeposit) return null;
  const hatch = surfaceHatch(sim);
  const stock = createStock(`dilemma-${consequence.dilemmaId}-aid`, hatch.x, hatch.y);
  stock.kind = 'dilemmaAid';
  stock.dilemmaId = consequence.dilemmaId;
  for (const [resource, amount] of Object.entries(consequence.effects.surfaceDeposit)) {
    addToStock(stock, resource, amount);
    if (amount > 0) recordReserveShift(sim, resource, amount);
  }
  sim.stocks.push(stock);
  return stock.id;
}

function applyLaw(sim, lawId, consequence) {
  const definition = lawDefinition(lawId);
  if (!definition) return;
  sim.charter ??= { active: {}, history: [], nextVoteTick: 0 };
  sim.charter.active ??= {};
  sim.charter.history ??= [];
  const replacedLawId = sim.charter.active[definition.group] ?? null;
  sim.charter.active[definition.group] = lawId;
  sim.charter.history.push({
    tick: sim.tick, lawId, replacedLawId, source: 'dilemma', dilemmaId: consequence.dilemmaId,
  });
}

function applyFactions(sim, deltas) {
  for (const factionId of FACTION_IDS) {
    const faction = sim.factions?.[factionId];
    if (!faction || !Number.isFinite(deltas?.[factionId])) continue;
    faction.support = clamp(faction.support + deltas[factionId], FACTION_RULES.MIN_SUPPORT, FACTION_RULES.MAX_SUPPORT);
  }
}

function applyConsequence(sim, consequence, { applyResources = true } = {}) {
  const effects = consequence.effects;
  const target = sim.colonists.find((colonist) => colonist.id === consequence.target?.colonistId && colonist.health > 0 && !colonist.dead);
  const resourcesReleased = applyResources
    ? adjustResources(sim, effects.resources, consequence.reservedResources) : true;
  if (!resourcesReleased) return { resourcesReleased, arrivalIds: [], surfaceStockId: null, workBlockedUntil: null };
  const surfaceStockId = resourcesReleased && applyResources ? depositSurfaceResources(sim, consequence) : null;
  const arrivalIds = resourcesReleased ? addArrivals(sim, effects.arrivals) : [];
  applyFactions(sim, effects.factions);
  if (effects.law) applyLaw(sim, effects.law, consequence);
  for (const colonist of living(sim)) {
    if (!Number.isFinite(effects.morale)) continue;
    colonist.morale = clamp(colonist.morale + effects.morale);
    if (Number.isFinite(colonist.moraleValue)) colonist.moraleValue = colonist.morale;
  }
  if (target && Number.isFinite(effects.targetMorale)) {
    target.morale = clamp(target.morale + effects.targetMorale);
    if (Number.isFinite(target.moraleValue)) target.moraleValue = target.morale;
  }
  if (target && Number.isFinite(effects.targetWorkBlockedDays)) {
    target.workBlockedUntil = Math.max(target.workBlockedUntil ?? 0,
      sim.tick + effects.targetWorkBlockedDays * TIME.TICKS_PER_DAY);
  }
  if (target && Number.isFinite(effects.targetDose)) target.dose = Math.max(0, (target.dose ?? 0) + effects.targetDose);
  if (target && effects.targetDisease) {
    target.diseases ??= [];
    if (!target.diseases.some((disease) => disease.type === effects.targetDisease)) {
      target.diseases.push({
        type: effects.targetDisease, recovery: 0, source: 'dilemma',
        dilemmaId: consequence.dilemmaId, sinceTick: sim.tick,
      });
    }
  }
  if (target && effects.killTarget) {
    target.acceptedDilemmaId = consequence.dilemmaId;
    target.acceptedDilemmaDefinitionId = consequence.definitionId;
    target.lastDamageCauses = [{
      code: 'dilemma', dilemmaId: consequence.dilemmaId,
      definitionId: consequence.definitionId, choiceIndex: consequence.choiceIndex, tick: sim.tick,
    }];
    target.health = 0;
  }
  return { resourcesReleased, arrivalIds, surfaceStockId, workBlockedUntil: target?.workBlockedUntil ?? null };
}

function applyRadioConsequence(sim, definition, choice, { resourcesReleased, rescue }) {
  if (!definition.titleKey || !definition.neighborId || !sim.m5.radio) return;
  const isRescue = choice.expedition?.kind === 'rescue';
  const outcome = DILEMMA_RULES.RADIO_HELP_CONSEQUENCES[choice.id];
  const neighbor = sim.m5.radio.neighbors?.find((candidate) => candidate.id === definition.neighborId);
  if (!isRescue && resourcesReleased && neighbor && outcome) {
    neighbor.morale = clamp(neighbor.morale + outcome.morale);
    for (const [resource, delta] of Object.entries(outcome.stocks)) {
      neighbor.stocks[resource] = Math.max(0, (neighbor.stocks[resource] ?? 0) + delta);
    }
  }
  const request = sim.m5.radio.helpRequests?.find((candidate) => candidate.id === definition.id);
  if (request) {
    request.status = isRescue ? (rescue?.ok ? 'rescueEnRoute' : 'unavailable')
      : resourcesReleased ? 'resolved' : 'noResources';
    request.choiceId = choice.id;
    request.resolvedTick = isRescue && rescue?.ok ? null : sim.tick;
    if (isRescue && !rescue?.ok) request.failureReason = rescue?.error ?? 'rescueUnavailable';
  }
  if (isRescue) {
    sim.m5.radio.rescueRequests ??= [];
    sim.m5.radio.rescueRequests.push({
      id: definition.id,
      neighborId: definition.neighborId,
      tick: sim.tick,
      status: rescue?.ok ? 'outbound' : 'unavailable',
      rescueId: rescue?.rescue?.id ?? null,
      expedition: { ...choice.expedition },
    });
  }
}

function explainConsequence(sim, consequence) {
  const definition = dilemmaDefinition(consequence.definitionId) ?? consequence.definition;
  if (!definition) return;
  const choice = definition.choices[consequence.choiceIndex];
  const isRadioRescue = Boolean(definition.titleKey && choice.expedition?.kind === 'rescue');
  if (!isRadioRescue && !hasResources(sim, consequence.reservedResources ?? {})) {
    const history = sim.m5.dilemmas.history.find((entry) => entry.id === consequence.dilemmaId);
    if (history) {
      history.consequenceFailedTick = sim.tick;
      history.failureReason = 'noResources';
    }
    const title = dilemmaText(definition, 'title', null, consequence.target);
    sim.log('warning', 'eventDilemmaConsequenceFailed', {
      dilemmaId: consequence.dilemmaId, definitionId: consequence.definitionId,
      title, summary: interpolate(STORYTELLER_TEXT.dilemmaConsequenceFailedSummary, { title }),
      colonistId: consequence.target?.colonistId ?? null,
    });
    sim.events.push({ type: 'dilemmaConsequenceFailed', tick: sim.tick, dilemmaId: consequence.dilemmaId, error: 'noResources' });
    return;
  }
  const rescue = isRadioRescue ? startRescue(sim, {
    requestId: definition.id,
    neighborId: definition.neighborId,
    resources: consequence.reservedResources,
    colonistIds: consequence.rescueColonistIds,
  }) : null;
  const applied = applyConsequence(sim, consequence, { applyResources: !isRadioRescue });
  applyRadioConsequence(sim, definition, choice, { ...applied, rescue });
  const history = sim.m5.dilemmas.history.find((entry) => entry.id === consequence.dilemmaId);
  if (history) history.consequenceAppliedTick = sim.tick;
  const text = dilemmaText(definition, 'result', consequence.choiceIndex, consequence.target);
  const title = dilemmaText(definition, 'title', null, consequence.target);
  sim.log(consequence.effects.killTarget || consequence.effects.targetDisease || choice.risk === 'deathsAnnounced' ? 'warning' : 'info', 'eventDilemmaConsequence', {
    dilemmaId: consequence.dilemmaId,
    definitionId: consequence.definitionId,
    choiceIndex: consequence.choiceIndex,
    choiceId: consequence.choiceId,
    title,
    text,
    summary: interpolate(STORYTELLER_TEXT.dilemmaConsequenceSummary, { title, text }),
    name: consequence.target?.name ?? null,
    colonistId: consequence.target?.colonistId ?? null,
    dueTick: consequence.dueTick,
    arrivalIds: applied.arrivalIds,
    surfaceStockId: applied.surfaceStockId,
    workBlockedUntil: applied.workBlockedUntil,
    rescueId: rescue?.rescue?.id ?? null,
    resourceError: !isRadioRescue && !applied.resourcesReleased ? 'noResources' : null,
  });
  sim.events.push({
    type: 'dilemmaConsequence', tick: sim.tick, dilemmaId: consequence.dilemmaId,
    definitionId: consequence.definitionId, choiceIndex: consequence.choiceIndex,
    arrivalIds: [...applied.arrivalIds], surfaceStockId: applied.surfaceStockId,
    workBlockedUntil: applied.workBlockedUntil, rescueId: rescue?.rescue?.id ?? null,
  });
}

export function updateDilemmas(sim) {
  initializeDilemmas(sim);
  const state = sim.m5.dilemmas;
  const due = state.scheduled.filter((consequence) => consequence.dueTick <= sim.tick)
    .sort((a, b) => a.dueTick - b.dueTick || a.dilemmaId - b.dilemmaId);
  const dueIds = new Set(due.map((consequence) => consequence.dilemmaId));
  state.scheduled = state.scheduled.filter((consequence) => !dueIds.has(consequence.dilemmaId));
  for (const consequence of due) explainConsequence(sim, consequence);
  if (state.pending || sim.tick < state.nextDilemmaTick) return state.pending;
  const mode = sim.m5.storyteller?.mode ?? 'chroniqueur';
  let candidates = DILEMMAS.filter((definition) => canAutomaticallyOffer(sim, definition, mode));
  const alternatives = candidates.filter((definition) => definition.id !== state.lastDefinitionId);
  if (alternatives.length > 0) candidates = alternatives;
  if (candidates.length === 0) {
    scheduleNextDilemma(sim, sim.tick);
    return null;
  }
  const definition = candidates[randomInt(sim, 0, candidates.length - 1)];
  const result = offerDilemma(sim, definition);
  if (!result.ok) scheduleNextDilemma(sim, sim.tick);
  return result.dilemma ?? null;
}

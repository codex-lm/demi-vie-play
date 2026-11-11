import { FACTION_IDS, FACTION_RULES, LAW_VOTE_COOLDOWN_TICKS, lawDefinition } from '../data/laws.js';
import { hashString } from './rng.js';

function clampSupport(value) {
  return Math.max(FACTION_RULES.MIN_SUPPORT, Math.min(FACTION_RULES.MAX_SUPPORT, value));
}

function factionForColonist(sim, colonistId) {
  const hash = hashString(`${sim.seed}:faction:${colonistId}`);
  return FACTION_IDS[hash % FACTION_IDS.length];
}

function refreshMembership(sim) {
  const living = [...(sim.colonists ?? [])]
    .filter((colonist) => colonist.health > 0 && (colonist.bodyLocation ?? 'colony') === 'colony')
    .sort((a, b) => a.id - b.id);
  for (const factionId of FACTION_IDS) {
    const faction = sim.factions[factionId];
    faction.members = living
      .filter((colonist) => factionForColonist(sim, colonist.id) === factionId)
      .map((colonist) => colonist.id);
    faction.weight = living.length > 0 ? faction.support * faction.members.length / living.length : 0;
  }
}

function unlockIfDue(sim) {
  if (!sim.factions.unlocked && sim.tick >= FACTION_RULES.UNLOCK_TICK) {
    sim.factions.unlocked = true;
    sim.factions.unlockedTick = sim.tick;
  }
}

function evaluateFactions(sim) {
  if (!sim.factions.unlocked) return;
  let newConflict = false;
  for (const factionId of FACTION_IDS) {
    const faction = sim.factions[factionId];
    const inConflict = faction.support <= FACTION_RULES.CONFLICT_SUPPORT;
    if (inConflict && !faction.conflict) {
      faction.conflict = true;
      faction.conflictSinceTick = sim.tick;
      newConflict = true;
    } else if (!inConflict && faction.conflict) {
      faction.conflict = false;
      faction.conflictSinceTick = null;
    }
  }
  if (newConflict) {
    sim.factions.lastConflictTick = sim.tick;
    sim.log('warning', 'eventFactionConflict', {
      remonteurs: Math.round(sim.factions.remonteurs.support),
      profonds: Math.round(sim.factions.profonds.support),
    });
  }
  for (const factionId of FACTION_IDS) {
    const faction = sim.factions[factionId];
    if (faction.support > FACTION_RULES.STRIKE_SUPPORT
      || sim.tick < faction.strikeUntil || sim.tick < faction.nextStrikeTick) continue;
    faction.strikeStartedTick = sim.tick;
    faction.strikeUntil = sim.tick + FACTION_RULES.STRIKE_DURATION_TICKS;
    faction.nextStrikeTick = faction.strikeUntil + FACTION_RULES.STRIKE_COOLDOWN_TICKS;
    sim.log('warning', 'eventStrike', {
      faction: factionId,
      days: FACTION_RULES.STRIKE_DURATION_DAYS,
      cause: 'factionConflict',
    });
  }
  sim.factions.strikeUntil = Math.max(...FACTION_IDS.map((factionId) => sim.factions[factionId].strikeUntil));
}

export function initializeLaws(sim) {
  sim.charter ??= { active: {}, nextVoteTick: 0, history: [] };
  sim.charter.active ??= {};
  sim.charter.history ??= [];
  sim.charter.nextVoteTick ??= 0;
  sim.factions ??= { unlocked: false };
  sim.factions.unlocked ??= false;
  sim.factions.unlockedTick ??= null;
  sim.factions.strikeUntil ??= 0;
  sim.factions.lastConflictTick ??= null;
  for (const factionId of FACTION_IDS) {
    sim.factions[factionId] ??= {};
    const faction = sim.factions[factionId];
    if (!Number.isFinite(faction.support)) faction.support = FACTION_RULES.INITIAL_SUPPORT;
    faction.support = clampSupport(faction.support);
    faction.members ??= [];
    faction.weight ??= 0;
    faction.conflict ??= false;
    faction.conflictSinceTick ??= null;
    faction.strikeStartedTick ??= null;
    faction.strikeUntil ??= 0;
    faction.nextStrikeTick ??= 0;
    faction.lastLawReaction ??= null;
  }
  refreshMembership(sim);
}

export function signLaw(sim, lawId) {
  initializeLaws(sim);
  unlockIfDue(sim);
  const definition = lawDefinition(lawId);
  if (!definition || sim.tick < sim.charter.nextVoteTick) return { ok: false, error: 'lawUnavailable' };
  const replacedLawId = sim.charter.active[definition.group] ?? null;
  const reactions = {};
  for (const factionId of FACTION_IDS) {
    const faction = sim.factions[factionId];
    const previousSupport = faction.support;
    faction.support = clampSupport(previousSupport + definition.effects[factionId]);
    reactions[factionId] = faction.support - previousSupport;
    faction.lastLawReaction = { tick: sim.tick, lawId, delta: reactions[factionId] };
  }
  sim.charter.active[definition.group] = lawId;
  sim.charter.nextVoteTick = sim.tick + LAW_VOTE_COOLDOWN_TICKS;
  sim.charter.history.push({ tick: sim.tick, lawId, replacedLawId, reactions: { ...reactions } });
  refreshMembership(sim);
  sim.log('info', 'eventLawSigned', { lawId });
  evaluateFactions(sim);
  return { ok: true, law: definition, reactions };
}

export function lawEffect(sim, key, fallback = 0) {
  let value = fallback;
  for (const lawId of Object.values(sim.charter?.active ?? {})) {
    const effect = lawDefinition(lawId)?.effects?.[key];
    if (Number.isFinite(effect)) value = key === 'morale' ? value + effect : effect;
  }
  return value;
}

export function lawMultiplier(sim, key, fallback = 1) {
  let value = fallback;
  for (const lawId of Object.values(sim.charter?.active ?? {})) {
    const effect = lawDefinition(lawId)?.effects?.[key];
    if (Number.isFinite(effect)) value *= effect;
  }
  return value;
}

export function isStriking(sim, colonist) {
  if (!sim.factions?.unlocked || !colonist || colonist.health <= 0
    || (colonist.bodyLocation ?? 'colony') !== 'colony') return false;
  const faction = sim.factions[factionForColonist(sim, colonist.id)];
  return sim.tick < (faction?.strikeUntil ?? 0);
}

export function updateLaws(sim) {
  initializeLaws(sim);
  unlockIfDue(sim);
  evaluateFactions(sim);
  return sim.factions;
}

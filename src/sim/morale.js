import { ALERTS, HEAT, NEEDS, TIME, WATER } from '../data/balance.js';
import { PEOPLE, TRAITS } from '../data/people.js';
import { excavationAt } from './networks.js';
import { getJob, isLifeSupportJob, releaseJob } from './jobs.js';
import { lawEffect } from './laws.js';
import { researchEffect } from './research.js';
import { RNG, hashString } from './rng.js';

const BEHAVIORS = Object.freeze(['isolate', 'argue', 'refuseWork']);
const CARE_ROOMS = new Set(['commons', 'chapel', 'canteen']);
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const NEED_WEIGHT_ENTRIES = Object.entries(PEOPLE.NEED_WEIGHTS);
const NEED_WEIGHT_TOTAL = Object.values(PEOPLE.NEED_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
const causeBuffers = new WeakMap();

function causesFor(colonist) {
  let buffer = causeBuffers.get(colonist);
  if (!buffer) {
    buffer = { active: [], byCode: new Map(), rounded: [] };
    causeBuffers.set(colonist, buffer);
  }
  for (const cause of buffer.active) cause.active = false;
  buffer.active.length = 0;
  return buffer;
}

function usableCareRoom(excavation) {
  return CARE_ROOMS.has(excavation.roomType)
    && (excavation.state === 'fitted' || excavation.state === 'dug' || excavation.initial)
    && excavation.state !== 'collapsed' && !excavation.disabled
    && (excavation.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

function collectiveCare(sim) {
  const rooms = sim.excavations.filter(usableCareRoom);
  return {
    active: lawEffect(sim, 'socialCare', 0) > 0 || rooms.length > 0,
    commons: rooms.some((room) => room.roomType === 'commons'),
    chapel: rooms.some((room) => room.roomType === 'chapel'),
  };
}

function addCause(causes, code, value) {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return;
  let cause = causes.byCode.get(code);
  if (!cause) {
    cause = { code, value: 0, rounded: 0, active: false };
    causes.byCode.set(code, cause);
  }
  if (!cause.active) {
    cause.value = 0;
    cause.active = true;
    causes.active.push(cause);
  }
  // Merge in the same first-occurrence and floating-point addition order as
  // the original post-pass Map, without allocating temporary cause records.
  cause.value += value;
}

function satisfaction(colonist, key) {
  if (key === 'hunger' || key === 'thirst' || key === 'sleep') return 100 - clamp(finite(colonist[key], 0));
  return clamp(finite(colonist[key], 100));
}

function needCauseCode(colonist, key, value, room) {
  if (key === 'sleep') return colonist.sleep <= PEOPLE.NEED_REFERENCE ? 'morale_sleptWell' : 'morale_tired';
  if (value >= 0) return null;
  if (key === 'warmth') return (room?.temperature ?? HEAT.INITIAL_ROOM) > HEAT.COMFORT_MAX ? 'morale_hotRoom' : 'morale_coldRoom';
  return {
    hunger: 'morale_hungry',
    thirst: 'morale_thirsty',
    air: 'morale_badAir',
    light: 'morale_darkRoom',
    social: 'morale_lonely',
    intimacy: 'morale_noPrivacy',
    purpose: 'morale_noPurpose',
  }[key] ?? null;
}

function relationMorale(sim, colonist) {
  let total = 0;
  let weight = 0;
  for (const other of sim.colonists) {
    if (other.id === colonist.id || other.health <= 0) continue;
    const relation = clamp(finite(colonist.relations?.[other.id], 0), -100, 100);
    const relationWeight = colonist.coupleId === other.id ? PEOPLE.PARTNER_RELATION_WEIGHT : 1;
    total += relation * relationWeight;
    weight += relationWeight;
  }
  return weight ? clamp(total / weight / PEOPLE.RELATION_MORALE_SCALE,
    PEOPLE.RELATION_MORALE_MIN, PEOPLE.RELATION_MORALE_MAX) : 0;
}

function eventParents(event) {
  if (Array.isArray(event.parentIds)) return event.parentIds;
  if (Array.isArray(event.parents)) return event.parents;
  return [event.motherId, event.fatherId].filter(Number.isInteger);
}

function eventKind(event) {
  return event.code ?? event.type;
}

function eventDuration(event) {
  return Math.max(1, finite(event.duration, event.until - (event.startTick ?? event.tick ?? 0)));
}

function hasMoralEvent(colonist, event, code) {
  return colonist.moraleEvents.some((existing) => eventKind(existing) === code
    && existing.sourceId === event.colonistId);
}

function processEvents(sim, colonist, care) {
  for (const event of sim.events) {
    if (event.type === 'death' && event.colonistId !== colonist.id
      && !hasMoralEvent(colonist, event, 'mourning')) {
      const relation = clamp(finite(colonist.relations?.[event.colonistId], 0), -100, 100);
      if (relation >= PEOPLE.MOURNING_MIN_RELATION || colonist.coupleId === event.colonistId) {
        const duration = Math.round(PEOPLE.MOURNING_DAYS * TIME.TICKS_PER_DAY
          * (care.chapel ? PEOPLE.CHAPEL_MOURNING_FACTOR : 1));
        colonist.moraleEvents.push({
          code: 'mourning', tick: event.tick, until: event.tick + duration, duration,
          value: PEOPLE.MOURNING_MAX_MORALE * Math.max(PEOPLE.MOURNING_MIN_FACTOR, relation / 100), sourceId: event.colonistId,
        });
      }
    } else if (event.type === 'birth' && !hasMoralEvent(colonist, event, 'birth')) {
      const duration = PEOPLE.BIRTH_MORALE_DAYS * TIME.TICKS_PER_DAY;
      colonist.moraleEvents.push({
        code: 'birth', tick: event.tick, until: event.tick + duration, duration,
        value: eventParents(event).includes(colonist.id) ? PEOPLE.BIRTH_PARENT_MORALE : PEOPLE.BIRTH_MORALE,
        sourceId: event.colonistId,
      });
    }
  }
  colonist.moraleEvents = colonist.moraleEvents.filter((event) => event.until > sim.tick);
}

function eventMorale(sim, colonist, causes) {
  let mourning = 0;
  let birth = 0;
  for (const event of colonist.moraleEvents) {
    const remaining = clamp((event.until - sim.tick) / eventDuration(event), 0, 1);
    const value = finite(event.value, 0) * remaining;
    if (eventKind(event) === 'mourning') mourning += value;
    else if (eventKind(event) === 'birth') birth += value;
  }
  addCause(causes, 'morale_mourning', mourning);
  addCause(causes, 'morale_birth', birth);
  return mourning + birth;
}

function moraleTarget(sim, colonist, care) {
  const causes = causesFor(colonist);
  const room = excavationAt(sim, colonist.x, colonist.y);
  let target = PEOPLE.NEED_REFERENCE;
  for (const [key, weight] of NEED_WEIGHT_ENTRIES) {
    const value = (satisfaction(colonist, key) - PEOPLE.NEED_REFERENCE) * weight / NEED_WEIGHT_TOTAL;
    const code = needCauseCode(colonist, key, value, room);
    if (code) addCause(causes, code, value);
    target += value;
  }
  // La faim au maximum ronge le moral en plus de la santé (lente) : sans ce
  // malus, des semaines de famine passeraient presque inaperçues.
  if (colonist.hunger >= 100) {
    addCause(causes, 'morale_starving', PEOPLE.STARVING_MORALE);
    target += PEOPLE.STARVING_MORALE;
  }

  let traitMorale = 0;
  let crisisThreshold = PEOPLE.CRISIS_THRESHOLD;
  for (const traitId of colonist.traits ?? []) {
    const trait = TRAITS[traitId];
    if (!trait) continue;
    traitMorale += trait.morale ?? 0;
    crisisThreshold += trait.crisisThreshold ?? 0;
    if (traitId === 'claustrophobic' && colonist.light < NEEDS.LOW_NEED_THRESHOLD) {
      addCause(causes, 'morale_darkRoom', trait.darknessMorale);
      target += trait.darknessMorale;
    }
    if (traitId === 'grumpy' && colonist.social < NEEDS.LOW_NEED_THRESHOLD) {
      traitMorale += trait.socialMorale;
    }
    if (traitId === 'believer' && care.chapel) {
      addCause(causes, 'morale_chapel', trait.chapelMorale);
      target += trait.chapelMorale;
    }
  }
  addCause(causes, 'morale_trait', traitMorale);
  target += traitMorale;

  const relations = relationMorale(sim, colonist);
  addCause(causes, 'morale_relationship', relations);
  target += relations;
  const law = lawEffect(sim, 'morale', 0);
  addCause(causes, 'morale_law', law);
  target += law;
  const research = researchEffect(sim, 'morale', 0);
  addCause(causes, 'morale_research', research);
  target += research;

  if (!care.commons) {
    addCause(causes, 'morale_noCommons', PEOPLE.NO_COMMONS_MORALE);
    target += PEOPLE.NO_COMMONS_MORALE;
  }
  if (care.chapel) {
    addCause(causes, 'morale_chapel', PEOPLE.CHAPEL_MORALE);
    target += PEOPLE.CHAPEL_MORALE;
  }
  if (room?.coating === 'whitewash') {
    addCause(causes, 'morale_whitewash', PEOPLE.WHITEWASH_MORALE);
    target += PEOPLE.WHITEWASH_MORALE;
  }
  if (colonist.neglectDays > 0) {
    const neglect = PEOPLE.MAX_NEGLECT_MORALE
      * Math.min(1, colonist.neglectDays / PEOPLE.NEGLECT_DAYS_TO_FULL);
    addCause(causes, 'morale_neglected', neglect);
    target += neglect;
  }
  target += eventMorale(sim, colonist, causes);
  return { target: clamp(target), causes, crisisThreshold };
}

function updateNeglect(sim, colonist, care) {
  const direction = care.active ? -PEOPLE.NEGLECT_RECOVERY_PER_DAY : 1;
  colonist.neglectDays = clamp(
    finite(colonist.neglectDays, 0) + direction / TIME.TICKS_PER_DAY,
    0,
    PEOPLE.NEGLECT_DAYS_TO_FULL,
  );
}

function updateTrend(sim, colonist) {
  const history = colonist.moraleHistory;
  const last = history.at(-1);
  if (!last || sim.tick - last.tick >= PEOPLE.MORALE_HISTORY_INTERVAL_TICKS) {
    history.push({ tick: sim.tick, value: colonist.morale });
  }
  const cutoff = sim.tick - PEOPLE.MORALE_TREND_TICKS;
  while (history.length > 2 && history[1].tick <= cutoff) history.shift();
  const reference = [...history].reverse().find((sample) => sample.tick <= cutoff);
  if (reference && sim.tick > reference.tick) {
    const trend = (colonist.morale - reference.value) * PEOPLE.MORALE_TREND_TICKS / (sim.tick - reference.tick);
    colonist.moraleTrend = trend;
    colonist.moraleTrend24h = trend;
  } else {
    colonist.moraleTrend = 0;
    colonist.moraleTrend24h = 0;
  }
}

function mainCause(causes) {
  // roundedCauses already sorts by value then code, including negative causes.
  return causes[0]?.value < 0 ? causes[0].code : 'morale_crisis';
}

function startCrisisEpisode(sim, colonist) {
  const episode = (colonist.crisis.episode ?? 0) + 1;
  const rng = new RNG(hashString(`${sim.seed}:crisis:${colonist.id}:${episode}`));
  colonist.crisis.episode = episode;
  colonist.crisis.behavior = BEHAVIORS[rng.int(0, BEHAVIORS.length - 1)];
  colonist.crisis.since = sim.tick;
  colonist.crisis.until = sim.tick + rng.int(PEOPLE.CRISIS_MIN_DURATION_TICKS, PEOPLE.CRISIS_MAX_DURATION_TICKS);
  colonist.crisis.nextTick = null;
}

function updateCrisis(sim, colonist, critical, approaching) {
  const crisis = colonist.crisis;
  if (crisis.behavior && sim.tick >= crisis.until) {
    if (colonist.task === crisis.behavior) colonist.task = 'idle';
    crisis.behavior = null;
    crisis.since = null;
    crisis.until = null;
    const rng = new RNG(hashString(`${sim.seed}:crisis-cooldown:${colonist.id}:${crisis.episode}`));
    crisis.nextTick = sim.tick + rng.int(PEOPLE.CRISIS_MIN_COOLDOWN_TICKS, PEOPLE.CRISIS_MAX_COOLDOWN_TICKS);
    crisis.warningSince = sim.tick;
  }
  if (!critical && !approaching) {
    if (crisis.behavior && colonist.task === crisis.behavior) colonist.task = 'idle';
    crisis.behavior = null;
    crisis.since = null;
    crisis.until = null;
    crisis.nextTick = null;
    crisis.warningSince = null;
    return null;
  }
  const warningSince = crisis.warningSince ?? sim.tick;
  const ready = sim.tick - warningSince >= PEOPLE.CRISIS_WARNING_LEAD_TICKS;
  if (critical && !crisis.behavior && ready && (crisis.nextTick === null || sim.tick >= crisis.nextTick)) {
    startCrisisEpisode(sim, colonist);
  }
  if (crisis.behavior === 'refuseWork' && colonist.jobId !== null
    && !isLifeSupportJob(sim, getJob(sim, colonist.jobId))) releaseJob(sim, colonist);
  if (crisis.behavior) {
    colonist.task = crisis.behavior;
    return 'danger';
  }
  return 'warning';
}

function setAlert(sim, colonist, level, cause, behavior = null) {
  const previous = colonist.moraleAlertLevel ?? null;
  colonist.moraleAlertLevel = level;
  colonist.crisis.level = level;
  if (level === 'warning' && previous !== 'warning') colonist.crisis.warningSince = sim.tick;
  if (level === null) colonist.crisis.warningSince = null;
  if (level === previous) return;
  if (level === null) {
    colonist.moraleAlertResolvedTick = sim.tick;
    return;
  }
  const resolvedTick = colonist.moraleAlertResolvedTick ?? -Infinity;
  const journalLevel = colonist.moraleAlertJournalLevel ?? null;
  const rank = { null: 0, warning: 1, danger: 2 };
  const newEpisode = previous === null && sim.tick - resolvedTick >= ALERTS.RESOLVED_REEMIT_TICKS;
  const escalation = rank[level] > rank[previous] && rank[level] > rank[journalLevel];
  const newCrisis = level === 'danger' && behavior
    && colonist.moraleAlertJournalEpisode !== colonist.crisis.episode;
  if (!newEpisode && !escalation && !newCrisis) return;
  if (level === 'warning') sim.log('warning', 'alertMoraleYellow', { name: colonist.name, cause });
  else if (level === 'danger') {
    sim.log('error', 'alertMoraleRed', { name: colonist.name, behavior: behavior ?? 'isolate', cause });
    sim.emergency = true;
    colonist.moraleAlertJournalEpisode = colonist.crisis.episode;
  }
  colonist.moraleAlertJournalLevel = level;
}

function roundedCauses(causes) {
  const { rounded } = causes;
  rounded.length = 0;
  for (const cause of causes.active) {
    cause.rounded = Math.round(cause.value * 10) / 10;
    if (cause.rounded !== 0) rounded.push(cause);
  }
  rounded.sort((a, b) => a.rounded - b.rounded || a.code.localeCompare(b.code));
  // Scratch records never escape: retained UI/simulation snapshots stay intact.
  return rounded.map(({ code, rounded: value }) => ({ code, value }));
}

export function refreshMoraleCauses(sim) {
  const care = collectiveCare(sim);
  for (const colonist of sim.colonists) {
    if (colonist.health <= 0 || colonist.dead) continue;
    colonist.moraleEvents ??= [];
    processEvents(sim, colonist, care);
    const { causes } = moraleTarget(sim, colonist, care);
    colonist.moraleCauses = roundedCauses(causes);
  }
  return sim.colonists;
}

export function updateMorale(sim) {
  sim.alertLevels ??= {};
  const care = collectiveCare(sim);
  let colonyLevel = null;
  for (const colonist of sim.colonists) {
    if (colonist.health <= 0 || colonist.dead) {
      colonist.moraleAlertLevel = null;
      if (colonist.crisis) colonist.crisis.level = null;
      continue;
    }
    colonist.moraleEvents ??= [];
    colonist.moraleHistory ??= [];
    colonist.crisis ??= { level: null, behavior: null, since: null, until: null, nextTick: null, episode: 0 };
    updateNeglect(sim, colonist, care);
    processEvents(sim, colonist, care);
    const { target, causes, crisisThreshold } = moraleTarget(sim, colonist, care);
    const maximumChange = PEOPLE.MORALE_MAX_CHANGE_PER_DAY / TIME.TICKS_PER_DAY;
    const current = clamp(finite(colonist.moraleValue, finite(colonist.morale, PEOPLE.INITIAL_MORALE)));
    colonist.moraleValue = clamp(current + clamp(target - current, -maximumChange, maximumChange));
    colonist.morale = colonist.moraleValue;
    colonist.moraleCauses = roundedCauses(causes);
    updateTrend(sim, colonist);

    const previousAlert = colonist.moraleAlertLevel ?? null;
    const recoveryThreshold = previousAlert === 'danger'
      ? crisisThreshold + PEOPLE.CRISIS_RECOVERY_HYSTERESIS : crisisThreshold;
    const warningThreshold = Math.max(PEOPLE.CRISIS_WARNING_THRESHOLD,
      recoveryThreshold + PEOPLE.CRISIS_WARNING_MARGIN);
    const critical = colonist.morale < recoveryThreshold;
    const declining = target < colonist.morale || colonist.moraleTrend < 0;
    const approachingCrisis = target < crisisThreshold
      || (colonist.moraleTrend < 0 && colonist.morale - crisisThreshold <= -colonist.moraleTrend);
    const approaching = (colonist.morale <= warningThreshold && declining && approachingCrisis)
      || (previousAlert === 'warning' && colonist.morale <= warningThreshold + PEOPLE.CRISIS_RECOVERY_HYSTERESIS);
    const level = updateCrisis(sim, colonist, critical, approaching);
    setAlert(sim, colonist, level, mainCause(colonist.moraleCauses), colonist.crisis.behavior);
    if (level === 'danger') colonyLevel = 'danger';
    else if (level === 'warning' && colonyLevel !== 'danger') colonyLevel = 'warning';
  }
  sim.alertLevels.morale = colonyLevel;
  return sim.colonists;
}

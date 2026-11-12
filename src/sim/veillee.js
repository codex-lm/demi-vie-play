import { STRUCTURE, TIME } from '../data/balance.js';
import { VEILLEE, VEILLEE_INSCRIPTIONS } from '../data/veillee.js';

const dayAt = tick => Math.floor(tick / TIME.TICKS_PER_DAY) + 1;
const eveningAt = day => (day - 1) * TIME.TICKS_PER_DAY + VEILLEE.HOUR * TIME.TICKS_PER_HOUR;

export function veilleeMilestone(day) {
  if (day > 0 && day % VEILLEE.YEAR_DAYS === 0) return 'year';
  return VEILLEE.MILESTONE_KINDS[VEILLEE.MILESTONE_DAYS.indexOf(day)] ?? null;
}

export function isVeilleeDay(day) {
  if (!Number.isInteger(day) || day < 1) return false;
  if (veilleeMilestone(day)) return true;
  if (day <= VEILLEE.FIRST_WEEK) return true;
  if (day <= VEILLEE.WEEKLY_UNTIL) return day % VEILLEE.WEEK_DAYS === 0;
  if (day <= VEILLEE.YEAR_DAYS) return day % VEILLEE.MONTH_DAYS === 0;
  return day % VEILLEE.SEASON_DAYS === 0;
}

/** The next scheduled rendezvous strictly after tick, including empty evenings. */
export function nextVeilleeTick(tick) {
  let day = Math.max(1, dayAt(tick));
  while (!isVeilleeDay(day) || eveningAt(day) <= tick) day += 1;
  return eveningAt(day);
}

/** Forecast the next page from the current agenda, excluding pages already held.
 * New subjects can bring this date forward; red alerts can postpone its opening. */
export function nextVeilleePageTick(sim) {
  const state = sim.veillee;
  if (!state?.enabled || !Number.isFinite(state.nextTick)) return null;
  const tick = state.nextTick;
  let day = dayAt(tick);
  const waiting = state.queue.some(subject => subject.status === 'waiting'
    && (subject.deadlineTick == null || subject.deadlineTick - VEILLEE.DEADLINE_NOTICE_TICKS > tick));
  if (day <= VEILLEE.FIRST_WEEK || veilleeMilestone(day) || waiting) return tick;
  while (!veilleeMilestone(day)) day += 1;
  return eveningAt(day);
}

export function hasVeilleeRedAlert(sim) {
  return Boolean(sim.emergency)
    || Object.values(sim.alerts ?? {}).some(alert => alert?.level === 'danger')
    || Object.values(sim.alertLevels ?? {}).some(level => level === 'danger')
    // Structure emits `emergency` only when it updates; the presentation clock
    // consumes that pulse. The dangerous room itself stays red between updates.
    || (sim.excavations ?? []).some(room => room.state !== 'collapsed'
      && room.integrity < STRUCTURE.DANGER_INTEGRITY)
    || (sim.excavations ?? []).some(room => Object.values(room.alertLevels ?? {}).some(level => level === 'danger'))
    || Object.values(sim.m5?.hazards?.alertLevels ?? {}).some(level => level === 'danger');
}

export function initializeVeillee(sim, options = {}) {
  if (!sim.veillee && options.veillee !== true) return null;
  sim.veillee ??= {
    enabled: true, nextTick: nextVeilleeTick(sim.tick), lastMeetingTick: null,
    session: null, backlog: [], queue: [], topics: [], history: [], marks: [], inscriptions: [],
  };
  return sim.veillee;
}

function definitionDeadline(pending, definition, options = {}) {
  const delays = definition.choices.map(choice => choice.delayDays).filter(Number.isFinite);
  // Do not let presentation postpone the first possible consequence. This is
  // also a deadline for overflow topics when rendezvous become less frequent.
  const firstConsequence = delays.length ? pending.offeredTick + Math.min(...delays) * TIME.TICKS_PER_DAY : Infinity;
  return Math.min(firstConsequence,
    ...[options.deadlineTick, definition.deadlineTick, definition.expiresTick]
      .filter(Number.isFinite));
}

export function veilleeDilemmaUrgency(sim, pending, definition, options = {}) {
  if (options.urgent || definition.urgent || hasVeilleeRedAlert(sim)) return 'danger';
  if (options.source === 'radio' || definition.source === 'radio' || definition.kind === 'radioHelp') return 'radio';
  for (const choice of definition.choices ?? []) {
    const effects = choice.effects ?? {};
    if (Object.values(choice.cost ?? {}).some(amount => amount > 0)
      || Object.values(effects.resources ?? {}).some(amount => amount < 0)) return 'cost';
    if (choice.expedition || choice.risk || effects.killTarget || effects.targetDisease
      || effects.targetDose || effects.arrivals || effects.surfaceDeposit) return 'outcome';
  }
  const target = sim.colonists?.find(person => person.id === pending.target?.colonistId);
  if (target && (target.dead || target.health < VEILLEE.SAFE_TARGET_HEALTH || target.trappedIn != null
    || target.surfaceCrewId != null)) return 'target';
  if (definitionDeadline(pending, definition, options) <= sim.veillee.nextTick) return 'deadline';
  return null;
}

/** Store presentation separately; no RNG, resource reservation or altered draw. */
export function routeVeilleeDilemma(sim, pending, definition, options = {}) {
  if (!sim.veillee) return false;
  const reason = veilleeDilemmaUrgency(sim, pending, definition, options);
  const deadline = definitionDeadline(pending, definition, options);
  sim.veillee.topics.push({ kind: 'dilemma', id: pending.id, definitionId: pending.definitionId,
    offeredTick: pending.offeredTick, route: reason ? 'urgent' : 'evening', reason,
    deadlineTick: Number.isFinite(deadline) ? deadline : null,
    resolvedTick: null, presentedSessionId: null });
  if (reason) return false;
  sim.veillee.queue.push({ kind: 'dilemma', id: pending.id, pending,
    offeredTick: pending.offeredTick, deadlineTick: Number.isFinite(deadline) ? deadline : null,
    status: 'waiting' });
  return true;
}

export function hasQueuedStorytellerDilemma(sim) {
  return sim.veillee?.queue.some(subject => subject.pending?.source === 'storyteller') ?? false;
}

export function veilleeSubjectUrgent(sim, kind, id) {
  if (kind !== 'dilemma') return false;
  return sim.m5?.dilemmas?.pending?.id === id
    || Boolean(sim.veillee?.queue.some(subject => subject.id === id && subject.status === 'urgent'));
}

export function veilleeSubjectVisible(sim, kind, id) {
  if (!sim.veillee) return true;
  return veilleeSubjectUrgent(sim, kind, id)
    || Boolean(sim.veillee.session?.subjects.some(subject => subject.kind === kind && subject.id === id));
}

export function veilleeSubjects(sim) {
  return (sim.veillee?.session?.subjects ?? []).map(ref => sim.veillee.queue.find(subject =>
    subject.id === ref.id && subject.kind === ref.kind)).filter(Boolean);
}

export function queuedVeilleeDilemma(sim, id) {
  return sim.veillee?.queue.find(subject => subject.kind === 'dilemma' && subject.id === id
    && veilleeSubjectVisible(sim, 'dilemma', id)) ?? null;
}

export function veilleeDilemmaOriginTick(sim, pending) {
  const topic = sim.veillee?.topics.find(subject => subject.id === pending.id);
  return topic?.route === 'evening' && (topic.deadlineTick == null || sim.tick < topic.deadlineTick)
    ? pending.offeredTick : sim.tick;
}

export function resolveVeilleeDilemma(sim, pending) {
  if (!sim.veillee) return;
  sim.veillee.queue = sim.veillee.queue.filter(subject => subject.id !== pending.id);
  const topic = sim.veillee.topics.find(subject => subject.id === pending.id);
  if (topic) topic.resolvedTick = sim.tick;
  // Choosing a modal pauses time. Surface the next urgent subject immediately;
  // waiting for another simulation tick would strand it behind that pause.
  promoteUrgent(sim);
}

function voiceSnapshot(sim, day) {
  const people = (sim.colonists ?? []).filter(person => person.health > 0 && !person.dead)
    .sort((a, b) => a.id - b.id);
  const person = people[(day - 1) % people.length];
  if (!person) return null;
  const causes = Array.isArray(person.moraleCauses) ? person.moraleCauses : [];
  const cause = [...causes].sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0))[0];
  return { colonistId: person.id, name: person.name,
    cause: cause ? { code: cause.code ?? cause.key, value: cause.value ?? 0 } : null };
}

function promoteUrgent(sim) {
  const state = sim.veillee;
  for (const subject of state.queue) {
    const person = sim.colonists?.find(candidate => candidate.id === subject.pending.target?.colonistId);
    const endangered = person && (person.dead || person.health < VEILLEE.SAFE_TARGET_HEALTH
      || person.trappedIn != null || person.surfaceCrewId != null);
    if ((subject.deadlineTick != null && sim.tick >= subject.deadlineTick - VEILLEE.DEADLINE_NOTICE_TICKS) || endangered) {
      subject.status = 'urgent';
      for (const session of [state.session, ...state.backlog].filter(Boolean)) {
        session.subjects = session.subjects.filter(ref => ref.id !== subject.id);
      }
      const topic = state.topics.find(candidate => candidate.id === subject.id);
      if (topic && !topic.urgentTick) topic.urgentTick = sim.tick;
    }
  }
  if (sim.m5?.dilemmas?.pending) return;
  const subject = state.queue.find(candidate => candidate.status === 'urgent');
  if (!subject) return;
  sim.m5.dilemmas.pending = subject.pending;
  state.queue = state.queue.filter(candidate => candidate !== subject);
}

export function updateVeillee(sim) {
  const state = sim.veillee;
  if (!state) return null;
  promoteUrgent(sim);
  if (sim.tick < state.nextTick) return state.session;
  const scheduledTick = state.nextTick;
  const day = dayAt(scheduledTick);
  const dawnTick = day * TIME.TICKS_PER_DAY + VEILLEE.NIGHT_END_HOUR * TIME.TICKS_PER_HOUR;
  const red = hasVeilleeRedAlert(sim);
  if (red && sim.tick < dawnTick) return state.session;
  const milestone = veilleeMilestone(day);
  const subjects = state.queue.filter(subject => subject.status === 'waiting')
    .slice(0, VEILLEE.MAX_SUBJECTS);
  state.lastMeetingTick = sim.tick;
  state.nextTick = nextVeilleeTick(Math.max(scheduledTick, sim.tick));
  if (!milestone && subjects.length === 0 && day > VEILLEE.FIRST_WEEK) return state.session;
  const facts = (sim.journal ?? []).filter(entry => entry.tick >= (day - 1) * TIME.TICKS_PER_DAY
    && entry.tick <= sim.tick).map(entry => ({ ...entry, params: { ...entry.params } }));
  const session = { id: day, day, tick: sim.tick, scheduledTick, milestone, autoOpen: true,
    subjects: subjects.map(subject => ({ kind: subject.kind, id: subject.id })), facts,
    population: (sim.colonists ?? []).filter(person => person.health > 0 && !person.dead).length,
    constructedCount: facts.filter(entry => ['eventFitted', 'eventSurfaceBuilt'].includes(entry.code)).length,
    voice: voiceSnapshot(sim, day) };
  for (const subject of subjects) {
    subject.status = 'ready';
    const topic = state.topics.find(candidate => candidate.id === subject.id);
    if (topic) topic.presentedSessionId = day;
  }
  if (state.session) state.backlog.push(session);
  else state.session = session;
  return state.session;
}

export function engraveVeillee(sim, order = {}) {
  const state = sim.veillee;
  const session = state?.session;
  if (!session || veilleeSubjects(sim).length) return { ok: false, error: 'veilleeUnfinished' };
  const choices = VEILLEE_INSCRIPTIONS[session.milestone];
  if (choices && (!Number.isInteger(order.choiceIndex) || !choices[order.choiceIndex])) {
    return { ok: false, error: 'veilleeChooseInscription' };
  }
  if (!state.marks.includes(session.day)) {
    state.marks.push(session.day);
    if (choices) state.inscriptions.push({ day: session.day, key: choices[order.choiceIndex] });
  }
  state.history.push({ id: session.id, day: session.day, tick: session.tick, engravedTick: sim.tick,
    subjects: session.subjects.map(subject => ({ ...subject })), milestone: session.milestone });
  state.session = state.backlog.shift() ?? null;
  return { ok: true, day: session.day };
}

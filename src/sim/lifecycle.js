import { TIME, WATER } from '../data/balance.js';
import { PEOPLE } from '../data/people.js';
import { researchDefinition } from '../data/research.js';
import { NAMES } from '../data/strings.fr.js';
import { lawEffect } from './laws.js';
import { createPersonProfile } from './people.js';
import { hashString } from './rng.js';
import { leaveSouvenir } from './souvenirs.js';
import { recordJournalNarrative } from './journalNarrative.js';
import { insideExcavation } from './networks.js';
import { spreadInfections } from './afflictions.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const isAlive = (colonist) => colonist && !colonist.dead && colonist.health > 0;
const CRISIS_BEHAVIORS = Object.freeze(['isolate', 'argue', 'refuseWork']);

function usableRoom(room) {
  return room && room.state === 'fitted' && !room.disabled
    && (room.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

export function schoolRoomFor(sim, colonist) {
  let best = null;
  let bestDistance = Infinity;
  for (const room of sim.excavations) {
    if (room.roomType !== 'school' || !usableRoom(room)) continue;
    const x = room.x + (room.w - 1) / 2;
    const y = room.y + room.h - 1;
    const distance = Math.abs(x - colonist.x) + Math.abs(y - colonist.y);
    if (distance < bestDistance || (distance === bestDistance && room.id < best.id)) {
      best = room;
      bestDistance = distance;
    }
  }
  return best;
}

export function isEligibleForWork(sim, colonist) {
  if (!isAlive(colonist) || (colonist.workBlockedUntil ?? 0) > sim.tick) return false;
  const age = colonist.age ?? PEOPLE.ADULT_AGE;
  if (age < PEOPLE.MINIMUM_WORK_AGE) return false;
  if (colonist.crisis?.behavior === 'refuseWork' && (colonist.crisis.until ?? 0) > sim.tick) return false;
  const workAge = Math.max(PEOPLE.MINIMUM_WORK_AGE, lawEffect(sim, 'workAge', PEOPLE.ADULT_AGE));
  return age >= workAge;
}

function stageForAge(age) {
  if (age < 1) return 'baby';
  if (age < PEOPLE.SCHOOL_START_AGE) return 'child';
  if (age < PEOPLE.MINIMUM_WORK_AGE) return 'school';
  if (age < PEOPLE.ADULT_AGE) return 'teen';
  if (age >= PEOPLE.ELDER_AGE) return 'elder';
  return 'adult';
}

function updateAge(sim, colonist) {
  const previousStage = colonist.lifeStage;
  const age = Math.max(0, Number.isFinite(colonist.age) ? colonist.age : PEOPLE.ADULT_AGE);
  const factor = age < PEOPLE.ADULT_AGE ? PEOPLE.CHILD_AGE_FACTOR : 1;
  colonist.age = age + factor / (PEOPLE.DAYS_PER_YEAR * TIME.TICKS_PER_DAY);
  colonist.lifeStage = stageForAge(colonist.age);
  if (previousStage !== 'adult' && previousStage !== 'elder' && colonist.age >= PEOPLE.ADULT_AGE
    && (colonist.educationMinutes ?? 0) > 0 && !colonist.graduated) {
    colonist.graduated = true;
    sim.log('info', 'eventSchoolGraduation', { name: colonist.name, id: colonist.id });
    sim.events.push({ type: 'graduation', tick: sim.tick, colonistId: colonist.id });
  }
}

function addMoraleEvent(sim, colonist, type, sourceId, value, until) {
  const event = { type, sourceId, value, startTick: sim.tick, until };
  colonist.moraleEvents ??= [];
  colonist.moraleEvents.push(event);
  colonist.morale = clamp(colonist.morale + value);
  return event;
}

function closeToDeceased(colonist, deceased) {
  return colonist.coupleId === deceased.id || deceased.coupleId === colonist.id
    || (colonist.relations?.[deceased.id] ?? 0) >= PEOPLE.COUPLE_MIN_RELATION
    || (deceased.relations?.[colonist.id] ?? 0) >= PEOPLE.COUPLE_MIN_RELATION
    || colonist.parentIds?.includes(deceased.id) || deceased.parentIds?.includes(colonist.id);
}

function processMourning(sim) {
  for (const deceased of sim.colonists) {
    if (deceased.deathTick == null || deceased.mourningProcessed) continue;
    deceased.mourningProcessed = true;
    deceased.bodyLocation ??= 'colony';
    deceased.ossuaryId ??= null;
    for (const colonist of sim.colonists) {
      if (!isAlive(colonist) || colonist.id === deceased.id || !closeToDeceased(colonist, deceased)) continue;
      addMoraleEvent(sim, colonist, 'mourning', deceased.id, -PEOPLE.CRISIS_THRESHOLD,
        sim.tick + PEOPLE.MOURNING_DAYS * TIME.TICKS_PER_DAY);
      sim.log('info', 'eventMourning', { name: colonist.name, deceasedId: deceased.id });
      sim.events.push({ type: 'mourning', tick: sim.tick, colonistId: colonist.id, deceasedId: deceased.id });
    }
  }
}

export function usableOssuary(sim, deceased) {
  let best = null;
  let bestDistance = Infinity;
  for (const room of sim.excavations) {
    if (room.roomType !== 'ossuary' || !usableRoom(room) || !room.powered || room.powerShed) continue;
    const distance = Math.abs(room.x + (room.w - 1) / 2 - deceased.x)
      + Math.abs(room.y + room.h - 1 - deceased.y);
    if (distance < bestDistance || (distance === bestDistance && room.id < best.id)) {
      best = room;
      bestDistance = distance;
    }
  }
  return best;
}

function bury(sim, deceased, room) {
  deceased.bodyLocation = 'ossuary';
  deceased.ossuaryId = room.id;
  deceased.x = room.x + (room.w - 1) / 2;
  deceased.y = room.y + room.h - 1;
  room.bodyIds ??= [];
  if (!room.bodyIds.includes(deceased.id)) room.bodyIds.push(deceased.id);
  room.bodyIds.sort((a, b) => a - b);
  sim.log('info', 'eventBurial', { name: deceased.name, id: deceased.id, ossuaryId: room.id }, room);
  sim.events.push({ type: 'burial', tick: sim.tick, colonistId: deceased.id, ossuaryId: room.id, x: deceased.x, y: deceased.y });
  leaveSouvenir(sim, deceased, room);
  for (const colonist of sim.colonists) {
    if (!isAlive(colonist) || colonist.id === deceased.id || !closeToDeceased(colonist, deceased)) continue;
    colonist.mourningVisit = { deceasedId: deceased.id, excavationId: room.id };
  }
}

function neglectUnburied(sim, deceased) {
  deceased.bodyLocation = 'unburied';
  for (const colonist of sim.colonists) {
    if (!isAlive(colonist) || colonist.id === deceased.id) continue;
    if (closeToDeceased(colonist, deceased)) {
      const mourning = colonist.moraleEvents?.find((event) => event.type === 'mourning' && event.sourceId === deceased.id);
      if (mourning && !mourning.neglectApplied) {
        colonist.morale = clamp(colonist.morale + PEOPLE.MAX_NEGLECT_MORALE - mourning.value);
        mourning.value = PEOPLE.MAX_NEGLECT_MORALE;
        mourning.until = sim.tick + PEOPLE.MOURNING_DAYS * TIME.TICKS_PER_DAY;
        mourning.neglectApplied = true;
      }
    }
    if (!deceased.infectionSpread && !colonist.diseases.some((disease) => disease.type === 'infection')) {
      colonist.diseases.push({ type: 'infection', recovery: 0, sourceId: deceased.id });
    }
  }
  deceased.infectionSpread = true;
}

function updateBodies(sim) {
  for (const deceased of sim.colonists) {
    if (deceased.deathTick == null || deceased.bodyLocation === 'ossuary') continue;
    if (sim.tick - deceased.deathTick < PEOPLE.BURIAL_DELAY_TICKS) continue;
    const room = usableOssuary(sim, deceased);
    if (room) bury(sim, deceased, room);
    else neglectUnburied(sim, deceased);
  }
}

function updateSocialRelations(sim) {
  if (sim.tick % TIME.TICKS_PER_HOUR !== 0) return;
  for (const colonist of sim.colonists) {
    if (!isAlive(colonist) || colonist.task !== 'socialize') continue;
    const partner = sim.colonists.find((person) => person.id === (colonist.id ^ 1));
    if (!isAlive(partner) || partner.task !== 'socialize') continue;
    colonist.relations ??= {};
    colonist.relations[partner.id] = clamp((colonist.relations[partner.id] ?? 0) + 1, -100, 100);
  }
}

function validateCouples(sim) {
  for (const colonist of sim.colonists) {
    if (colonist.coupleId == null) continue;
    const partner = sim.colonists.find((person) => person.id === colonist.coupleId);
    if (!isAlive(colonist) || !isAlive(partner) || partner.coupleId !== colonist.id) colonist.coupleId = null;
  }
}

function formCouples(sim) {
  for (const colonist of sim.colonists) {
    if (!isAlive(colonist) || colonist.coupleId !== null || colonist.age < PEOPLE.ADULT_AGE
      || colonist.morale <= PEOPLE.COUPLE_MIN_MORALE) continue;
    const candidates = sim.colonists.filter((partner) => isAlive(partner) && partner.id !== colonist.id
      && partner.coupleId === null && partner.age >= PEOPLE.ADULT_AGE && partner.morale > PEOPLE.COUPLE_MIN_MORALE
      && (colonist.relations?.[partner.id] ?? 0) >= PEOPLE.COUPLE_MIN_RELATION
      && (partner.relations?.[colonist.id] ?? 0) >= PEOPLE.COUPLE_MIN_RELATION)
      .sort((a, b) => (colonist.relations[b.id] - colonist.relations[a.id]) || a.id - b.id);
    const partner = candidates[0];
    if (!partner) continue;
    colonist.coupleId = partner.id;
    partner.coupleId = colonist.id;
    sim.log('info', 'eventCouple', { a: colonist.name, b: partner.name });
    sim.events.push({ type: 'couple', tick: sim.tick, colonistIds: [colonist.id, partner.id] });
  }
}

function sharesBed(colonist, partner) {
  return colonist.personal?.type === 'sleep' && colonist.personal.phase === 'sleeping'
    && partner.personal?.type === 'sleep' && partner.personal.phase === 'sleeping'
    && colonist.personal.excavationId === partner.personal.excavationId
    && Math.abs(colonist.x - partner.x) < 1e-6 && Math.abs(colonist.y - partner.y) < 1e-6;
}

function familyCapacity(sim) {
  const commons = sim.excavations.some((room) => room.roomType === 'commons' && usableRoom(room));
  if (!commons) return false;
  const beds = sim.excavations.reduce((total, room) => {
    if (room.roomType !== 'dorm' || room.disabled || (room.floodRatio ?? 0) > WATER.FLOOD_UNUSABLE_RATIO
      || (room.state !== 'fitted' && !room.initial)) return total;
    return total + (room.beds ?? (room.label === 'shelterDorm' ? 12 : 4));
  }, 0);
  return beds > sim.colonists.filter(isAlive).length;
}

function tryPregnancy(sim, mother, father) {
  if (mother.pregnancy
    || (Number.isFinite(mother.lastBirthTick) && sim.tick - mother.lastBirthTick < PEOPLE.POSTPARTUM_DAYS * TIME.TICKS_PER_DAY)
    || !familyCapacity(sim) || !sharesBed(mother, father)
    || mother.morale <= PEOPLE.COUPLE_MIN_MORALE || father.morale <= PEOPLE.COUPLE_MIN_MORALE) return;
  const chance = PEOPLE.PREGNANCY_CHANCE_PER_DAY * lawEffect(sim, 'birthFactor', 1);
  if (chance <= 0 || !sim.rng.chance(chance)) return;
  mother.pregnancy = {
    partnerId: father.id,
    startTick: sim.tick,
    dueTick: sim.tick + PEOPLE.PREGNANCY_DAYS * TIME.TICKS_PER_DAY,
  };
}

function updateCouplesAndPregnancies(sim) {
  if (sim.tick % TIME.TICKS_PER_DAY !== 0) return;
  validateCouples(sim);
  formCouples(sim);
  for (const mother of sim.colonists) {
    if (!isAlive(mother) || mother.sex !== 'female' || mother.age < PEOPLE.ADULT_AGE || mother.coupleId === null) continue;
    const father = sim.colonists.find((person) => person.id === mother.coupleId);
    if (!isAlive(father) || father.sex !== 'male' || father.age < PEOPLE.ADULT_AGE) continue;
    tryPregnancy(sim, mother, father);
  }
}

function newborn(sim, mother, father) {
  const id = sim.nextColonistId++;
  const profile = createPersonProfile(sim.seed, id);
  const given = NAMES.given[id % NAMES.given.length];
  const family = mother.name?.split(' ').at(-1) ?? NAMES.family[id % NAMES.family.length];
  const skills = { dig: 0, build: 0, farm: 0, medic: 0, tech: 0, cook: 0, scout: 0, teach: 0 };
  return {
    ...profile,
    id,
    parentIds: [mother.id, father?.id].filter((parentId) => parentId != null),
    name: `${given} ${family}`,
    birthTick: sim.tick,
    awaitingCarry: true,
    age: 0,
    lifeStage: 'baby',
    educationMinutes: 0,
    graduated: false,
    relations: {},
    skills,
    bedIndex: id,
    bedX: mother.bedX,
    bedY: mother.bedY,
    restX: mother.restX,
    restY: mother.restY,
    x: mother.x,
    y: mother.y,
    prevX: mother.x,
    prevY: mother.y,
    health: 100,
    hunger: 0,
    thirst: 0,
    sleep: 0,
    warmth: 100,
    air: 100,
    light: 100,
    social: 100,
    intimacy: 100,
    purpose: 100,
    morale: 100,
    injuries: [],
    diseases: [],
    dose: 0,
    dead: false,
    task: 'idle',
    jobId: null,
    personal: null,
    needRetryTick: 0,
    carrying: null,
    idleReason: null,
    idleActivity: null,
    path: [],
    pathIndex: 0,
    pathGoal: null,
    navRevision: -1,
    targetX: null,
    targetY: null,
    direction: id % 2 === 0 ? 1 : -1,
    animation: 0,
  };
}

export function normalizePregnancy(sim, colonist) {
  const pregnancy = colonist?.pregnancy;
  if (!pregnancy) return null;
  const duration = PEOPLE.PREGNANCY_DAYS * TIME.TICKS_PER_DAY;
  if (!Number.isFinite(pregnancy.startTick)) {
    pregnancy.startTick = Number.isFinite(pregnancy.dueTick) ? pregnancy.dueTick - duration : sim.tick;
  }
  // Old saves used 24-day pregnancies. Keep valid near-term pregnancies, but
  // extend an impossible short term to the new natural duration.
  if (!Number.isFinite(pregnancy.dueTick)
    || pregnancy.dueTick < pregnancy.startTick + PEOPLE.PREGNANCY_MIN_DAYS * TIME.TICKS_PER_DAY) {
    pregnancy.dueTick = pregnancy.startTick + duration;
  }
  return pregnancy;
}

function updateBirths(sim) {
  for (const mother of [...sim.colonists]) {
    const pregnancy = normalizePregnancy(sim, mother);
    if (!isAlive(mother) || !pregnancy || sim.tick < pregnancy.dueTick) continue;
    const father = sim.colonists.find((person) => person.id === mother.pregnancy.partnerId);
    const child = newborn(sim, mother, father);
    mother.pregnancy = null;
    mother.lastBirthTick = sim.tick;
    sim.colonists.push(child);
    for (const parent of [mother, father]) {
      if (!parent) continue;
      parent.relations ??= {};
      parent.relations[child.id] = 100;
      child.relations[parent.id] = 100;
    }
    const parents = [mother.name, father?.name].filter(Boolean).join(' & ');
    sim.log('info', 'eventBirth', { name: child.name, parents, id: child.id });
    sim.events.push({ type: 'birth', tick: sim.tick, colonistId: child.id, parentIds: child.parentIds, x: child.x, y: child.y });
    recordJournalNarrative(sim, 'birth', String(child.id), { id: child.id, name: child.name, parents });
  }
}

function teachingFactor(sim) {
  let factor = lawEffect(sim, 'teachFactor', 1);
  for (const nodeId of sim.research?.completed ?? []) {
    const effect = researchDefinition(nodeId)?.effects?.teachFactor;
    if (Number.isFinite(effect)) factor *= effect;
  }
  return factor;
}

function teacherFor(sim, room) {
  for (const job of sim.jobs) {
    if (job.type !== 'produce' || job.status !== 'active' || job.excavationId !== room.id) continue;
    const teacher = sim.colonists.find((person) => person.id === job.colonistId);
    if (!isEligibleForWork(sim, teacher) || teacher.task !== 'working'
      || !insideExcavation(sim, room, teacher.x, teacher.y)) continue;
    return teacher;
  }
  return null;
}

function updateStudy(sim) {
  for (const colonist of sim.colonists) {
    if (!isAlive(colonist) || colonist.personal?.type !== 'study' || colonist.personal.phase !== 'studying') continue;
    const room = sim.excavation(colonist.personal.excavationId);
    const teacher = room ? teacherFor(sim, room) : null;
    if (!teacher) {
      colonist.task = 'sit';
      continue;
    }
    colonist.task = 'study';
    colonist.animation += 0.02;
    colonist.educationMinutes = (colonist.educationMinutes ?? 0) + 1;
    const gain = (teacher.skills.teach ?? 0) * teachingFactor(sim) / (PEOPLE.DAYS_PER_YEAR * TIME.TICKS_PER_DAY);
    for (const [skill, value] of Object.entries(colonist.skills)) {
      colonist.skills[skill] = Math.max(value, Math.min(teacher.skills[skill] ?? value, value + gain));
    }
  }
}

function updateElders(sim) {
  if (sim.tick % TIME.TICKS_PER_DAY !== 0) return;
  for (const colonist of sim.colonists) {
    if (!isAlive(colonist) || colonist.age < PEOPLE.ELDER_AGE) continue;
    if (!Number.isFinite(colonist.oldAgeAlertTick)) {
      colonist.oldAgeAlertTick = sim.tick;
      sim.log('warning', 'alertOldAgeYellow', { colonistId: colonist.id, id: colonist.id, name: colonist.name, age: colonist.age });
    }
    if (sim.rng.chance(PEOPLE.ELDER_DEATH_CHANCE_PER_YEAR / PEOPLE.DAYS_PER_YEAR)) {
      sim.log('error', 'alertOldAgeRed', { colonistId: colonist.id, id: colonist.id, name: colonist.name, age: colonist.age });
      colonist.lastDamageCauses = ['oldAge'];
      colonist.health = 0;
    }
  }
}

function crisisCause(colonist) {
  const causes = (colonist.moraleCauses ?? []).filter((cause) => Number.isFinite(cause.value) && cause.value < 0)
    .sort((a, b) => a.value - b.value);
  const key = causes[0]?.code ?? causes[0]?.key ?? causes[0]?.cause;
  if (typeof key === 'string' && key.startsWith('morale_')) return key;
  const needs = [
    ['morale_hungry', 100 - colonist.hunger], ['morale_thirsty', 100 - colonist.thirst],
    ['morale_tired', 100 - colonist.sleep], ['morale_coldRoom', colonist.warmth],
    ['morale_badAir', colonist.air], ['morale_darkRoom', colonist.light],
    ['morale_lonely', colonist.social], ['morale_noPrivacy', colonist.intimacy],
    ['morale_noPurpose', colonist.purpose],
  ];
  needs.sort((a, b) => a[1] - b[1]);
  return needs[0][1] < PEOPLE.CRISIS_WARNING_THRESHOLD ? needs[0][0] : 'morale_neglected';
}

function clearCrisis(colonist) {
  colonist.crisis = { level: null, behavior: null, since: null, until: null };
  if (CRISIS_BEHAVIORS.includes(colonist.task)) colonist.task = 'idle';
  if (CRISIS_BEHAVIORS.includes(colonist.idleActivity?.type)) colonist.idleActivity = null;
}

function updateCrisis(sim, colonist) {
  colonist.crisis ??= { level: null, behavior: null, since: null, until: null };
  const crisis = colonist.crisis;
  if (crisis.level === 'active') {
    if ((crisis.until ?? 0) > sim.tick) return;
    clearCrisis(colonist);
    return;
  }
  if (colonist.morale < PEOPLE.CRISIS_WARNING_THRESHOLD && crisis.level !== 'warning') {
    colonist.crisis = {
      level: 'warning', behavior: null, since: sim.tick, until: null, warningSince: sim.tick,
    };
    sim.log('warning', 'alertMoraleYellow', { name: colonist.name, id: colonist.id, cause: crisisCause(colonist) });
    return;
  }
  if (crisis.level !== 'warning') return;
  if (colonist.morale >= PEOPLE.CRISIS_WARNING_THRESHOLD) {
    clearCrisis(colonist);
    return;
  }
  if (colonist.morale >= PEOPLE.CRISIS_THRESHOLD
    || sim.tick - crisis.warningSince < PEOPLE.CRISIS_WARNING_LEAD_TICKS) return;
  const hash = hashString(`${sim.seed}:crisis:${colonist.id}:${crisis.warningSince}`);
  const behavior = CRISIS_BEHAVIORS[hash % CRISIS_BEHAVIORS.length];
  const duration = PEOPLE.CRISIS_MIN_DURATION_TICKS
    + (hash % (PEOPLE.CRISIS_MAX_DURATION_TICKS - PEOPLE.CRISIS_MIN_DURATION_TICKS + 1));
  colonist.crisis = {
    level: 'active', behavior, since: sim.tick, until: sim.tick + duration,
  };
  const cause = crisisCause(colonist);
  sim.log('error', 'alertMoraleRed', { name: colonist.name, id: colonist.id, behavior, cause });
  sim.events.push({ type: 'crisis', tick: sim.tick, colonistId: colonist.id, behavior, cause });
}

export function updateLifecycle(sim) {
  sim.nextColonistId ??= Math.max(0, ...sim.colonists.map((colonist) => colonist.id + 1));
  for (const colonist of sim.colonists) {
    if (isAlive(colonist)) updateAge(sim, colonist);
    colonist.relations ??= {};
    colonist.diseases ??= [];
  }
  processMourning(sim);
  updateBodies(sim);
  updateSocialRelations(sim);
  updateElders(sim);
  spreadInfections(sim);
  updateCouplesAndPregnancies(sim);
  updateBirths(sim);
  updateStudy(sim);
  for (const colonist of sim.colonists) {
    if (isAlive(colonist) && !Number.isInteger(colonist.crisis?.episode)) updateCrisis(sim, colonist);
  }
  return sim.colonists;
}

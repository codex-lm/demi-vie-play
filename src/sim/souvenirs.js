import { TIME, WATER } from '../data/balance.js';
import { MATERIAL_BY_KEY, materialAt } from '../data/materials.js';
import { PEOPLE } from '../data/people.js';
import {
  SOUVENIR_DEFINITIONS,
  SOUVENIR_RULES,
  SOUVENIR_SKILLS,
  SOUVENIR_TRAITS,
} from '../data/souvenirs.js';
import { isEligibleForWork } from './lifecycle.js';
import { insideExcavation } from './networks.js';
import { evaluateExcavation } from './structure.js';

const clampMorale = (value) => Math.max(0, Math.min(100, value));
const isAlive = (colonist) => colonist && !colonist.dead && colonist.health > 0;

function usableRoom(room) {
  return room && room.state === 'fitted' && !room.disabled
    && (room.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

function roomPosition(room) {
  return {
    x: room?.x != null ? room.x + ((room.w ?? 1) - 1) / 2 : 0,
    y: room?.y != null ? room.y + (room.h ?? 1) - 1 : 0,
  };
}

function eventPosition(colonist, room) {
  if (Number.isFinite(colonist?.x) && Number.isFinite(colonist?.y)) {
    return { x: colonist.x, y: colonist.y };
  }
  return roomPosition(room);
}

export function initializeSouvenirs(sim) {
  sim.m6 ??= {};
  if (!Array.isArray(sim.m6.souvenirs)) sim.m6.souvenirs = [];
  const nextId = Math.max(0, ...sim.m6.souvenirs.map((souvenir) => (souvenir.id ?? -1) + 1));
  sim.m6.nextSouvenirId = Math.max(Number.isInteger(sim.m6.nextSouvenirId) ? sim.m6.nextSouvenirId : 0, nextId);
  sim.m6.souvenirSongEvening ??= { day: null, recipientIds: [] };
  if (!Array.isArray(sim.m6.souvenirSongEvening.recipientIds)) sim.m6.souvenirSongEvening.recipientIds = [];
  return sim.m6.souvenirs;
}

function preferredMaterialFor(deceased) {
  if (MATERIAL_BY_KEY[deceased.preferredMaterial]) return deceased.preferredMaterial;
  for (const history of [deceased.materialCounts, deceased.digMaterials, deceased.materialsDug]) {
    if (!history || typeof history !== 'object' || Array.isArray(history)) continue;
    const entries = Object.entries(history)
      .filter(([material, count]) => MATERIAL_BY_KEY[material] && Number.isFinite(count))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length > 0) return entries[0][0];
  }
  return SOUVENIR_RULES.DEFAULT_MATERIAL;
}

function souvenirTypeFor(deceased) {
  for (const trait of deceased.traits ?? []) {
    if (SOUVENIR_TRAITS[trait]) return SOUVENIR_TRAITS[trait];
  }
  const skills = Object.entries(deceased.skills ?? {})
    .filter(([skill, value]) => SOUVENIR_SKILLS[skill] && Number.isFinite(value))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return skills.length > 0 && skills[0][1] > 0
    ? SOUVENIR_SKILLS[skills[0][0]]
    : SOUVENIR_RULES.DEFAULT_TYPE;
}

export function leaveSouvenir(sim, deceased, ossuary) {
  const souvenirs = initializeSouvenirs(sim);
  if (!deceased || deceased.id == null || !ossuary || ossuary.id == null) return null;
  const existing = souvenirs.find((souvenir) => souvenir.authorId === deceased.id);
  if (existing) return existing;
  const souvenir = {
    id: sim.m6.nextSouvenirId++,
    type: souvenirTypeFor(deceased),
    authorId: deceased.id,
    authorName: deceased.name ?? String(deceased.id),
    holderId: null,
    ossuaryId: ossuary.id,
    leftTick: sim.tick,
    passedTick: null,
    preferredMaterial: preferredMaterialFor(deceased),
    studyColonistId: null,
    studySchoolId: null,
    studyTicks: 0,
  };
  souvenirs.push(souvenir);
  const { x, y } = eventPosition(deceased, ossuary);
  sim.events ??= [];
  sim.events.push({
    type: 'souvenirLeft',
    tick: sim.tick,
    souvenirId: souvenir.id,
    souvenirType: souvenir.type,
    authorId: souvenir.authorId,
    ossuaryId: souvenir.ossuaryId,
    x,
    y,
  });
  return souvenir;
}

function teacherFor(sim, room) {
  for (const job of sim.jobs ?? []) {
    if (job.type !== 'produce' || job.status !== 'active' || job.excavationId !== room.id) continue;
    const teacher = (sim.colonists ?? []).find((person) => person.id === job.colonistId);
    if (!isEligibleForWork(sim, teacher) || teacher.task !== 'working'
      || !insideExcavation(sim, room, teacher.x, teacher.y)) continue;
    return teacher;
  }
  return null;
}

function studyingColonists(sim) {
  const students = [];
  for (const colonist of sim.colonists ?? []) {
    if (!isAlive(colonist) || colonist.task !== 'study'
      || colonist.personal?.type !== 'study' || colonist.personal.phase !== 'studying') continue;
    const room = (sim.excavations ?? []).find((candidate) => candidate.id === colonist.personal.excavationId);
    if (!usableRoom(room) || room.roomType !== 'school'
      || !insideExcavation(sim, room, colonist.x, colonist.y) || !teacherFor(sim, room)) continue;
    const child = (colonist.age ?? PEOPLE.ADULT_AGE) >= PEOPLE.SCHOOL_START_AGE
      && (colonist.age ?? PEOPLE.ADULT_AGE) < PEOPLE.SCHOOL_END_AGE && !isEligibleForWork(sim, colonist);
    if (!child && colonist.apprentice !== true && colonist.apprenticeship !== true) continue;
    students.push({ colonist, room });
  }
  return students;
}

function passSouvenir(sim, souvenir, colonist, school) {
  souvenir.holderId = colonist.id;
  souvenir.passedTick = sim.tick;
  souvenir.studyColonistId = null;
  souvenir.studySchoolId = null;
  souvenir.studyTicks = 0;
  const skill = SOUVENIR_DEFINITIONS[souvenir.type]?.skill;
  if (skill) {
    colonist.skills ??= {};
    colonist.skills[skill] = (colonist.skills[skill] ?? 0) + SOUVENIR_RULES.SKILL_BONUS;
  }
  const { x, y } = eventPosition(colonist, school);
  sim.events ??= [];
  sim.events.push({
    type: 'souvenirPassed',
    tick: sim.tick,
    souvenirId: souvenir.id,
    souvenirType: souvenir.type,
    authorId: souvenir.authorId,
    recipientId: colonist.id,
    schoolId: school.id,
    x,
    y,
  });
}

function updateStudy(sim, students) {
  for (const souvenir of sim.m6.souvenirs) {
    if (souvenir.holderId != null) continue;
    const student = students.find(({ colonist }) => colonist.id === souvenir.studyColonistId)
      ?? students[0]
      ?? null;
    if (!student) {
      souvenir.studyColonistId = null;
      souvenir.studySchoolId = null;
      souvenir.studyTicks = 0;
      continue;
    }
    if (souvenir.studyColonistId !== student.colonist.id || souvenir.studySchoolId !== student.room.id) {
      souvenir.studyColonistId = student.colonist.id;
      souvenir.studySchoolId = student.room.id;
      souvenir.studyTicks = 0;
    }
    souvenir.studyTicks = (souvenir.studyTicks ?? 0) + 1;
    if (souvenir.studyTicks >= SOUVENIR_RULES.STUDY_TICKS) {
      passSouvenir(sim, souvenir, student.colonist, student.room);
    }
  }
}

function usableCommons(room) {
  return room && room.roomType === 'commons'
    && (room.state === 'fitted' || room.state === 'dug' || room.initial)
    && room.state !== 'collapsed' && !room.disabled
    && (room.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO;
}

function availableMusician(sim, colonist, room) {
  return isAlive(colonist) && !colonist.surfaceCrewId && colonist.jobId === null
    && (!colonist.personal || colonist.personal.type === 'rest')
    && ['idle', 'sit', 'socialize'].includes(colonist.task)
    && insideExcavation(sim, room, colonist.x, colonist.y);
}

function updateSongs(sim) {
  for (const colonist of sim.colonists ?? []) {
    if (colonist.activity?.type === 'music') delete colonist.activity;
  }
  const day = Math.floor(sim.tick / TIME.TICKS_PER_DAY);
  const evening = sim.m6.souvenirSongEvening;
  if (evening.day !== day) {
    evening.day = day;
    evening.recipientIds = [];
  }
  const hour = Math.floor(sim.tick / TIME.TICKS_PER_HOUR) % 24;
  if (hour < SOUVENIR_RULES.EVENING_START_HOUR || hour >= SOUVENIR_RULES.EVENING_END_HOUR) return;
  const songHolders = new Set(sim.m6.souvenirs
    .filter((souvenir) => souvenir.type === 'songs' && souvenir.holderId != null)
    .map((souvenir) => souvenir.holderId));
  if (songHolders.size === 0) return;
  for (const room of sim.excavations ?? []) {
    if (!usableCommons(room)) continue;
    const participants = (sim.colonists ?? []).filter((colonist) => isAlive(colonist)
      && insideExcavation(sim, room, colonist.x, colonist.y));
    const musicians = participants.filter((colonist) => songHolders.has(colonist.id)
      && availableMusician(sim, colonist, room));
    if (musicians.length === 0) continue;
    for (const musician of musicians) musician.activity = { type: 'music', phase: 'active' };
    for (const colonist of participants) {
      if (evening.recipientIds.includes(colonist.id)) continue;
      const morale = colonist.morale ?? PEOPLE.INITIAL_MORALE;
      const moraleValue = colonist.moraleValue ?? morale;
      colonist.morale = clampMorale(morale + SOUVENIR_RULES.SONGS_MORALE);
      colonist.moraleValue = clampMorale(moraleValue + SOUVENIR_RULES.SONGS_MORALE);
      evening.recipientIds.push(colonist.id);
    }
  }
  evening.recipientIds.sort((a, b) => a - b);
}

export function updateSouvenirs(sim) {
  initializeSouvenirs(sim);
  updateStudy(sim, studyingColonists(sim));
  updateSongs(sim);
  return sim.m6.souvenirs;
}

export function souvenirsForColonist(sim, colonistId) {
  return initializeSouvenirs(sim).filter((souvenir) => souvenir.holderId === colonistId);
}

function materialKey(value) {
  if (typeof value === 'string') return MATERIAL_BY_KEY[value] ? value : null;
  if (Number.isInteger(value)) return materialAt(value)?.key ?? null;
  if (!value || typeof value !== 'object') return null;
  if (MATERIAL_BY_KEY[value.key]) return value.key;
  for (const candidate of [value.material, value.stress?.material]) {
    const key = materialKey(candidate);
    if (key) return key;
  }
  return null;
}

function excavationMaterial(sim, excavationOrMaterial) {
  const direct = materialKey(excavationOrMaterial);
  if (direct) return direct;
  if (!excavationOrMaterial || typeof excavationOrMaterial !== 'object') return null;
  if (![excavationOrMaterial.x, excavationOrMaterial.y, excavationOrMaterial.w, excavationOrMaterial.h]
    .every(Number.isFinite)) return null;
  return evaluateExcavation(sim, excavationOrMaterial).material;
}

export function minerRiskFactor(sim, excavationOrMaterial) {
  if (sim.m6?.balanceProfile === 'baseline') return 1;
  initializeSouvenirs(sim);
  const material = excavationMaterial(sim, excavationOrMaterial);
  if (!material) return 1;
  const hasJournal = sim.m6.souvenirs.some((souvenir) => souvenir.type === 'minerJournal'
    && souvenir.preferredMaterial === material
    && isAlive((sim.colonists ?? []).find((colonist) => colonist.id === souvenir.holderId)));
  return hasJournal ? SOUVENIR_RULES.MINER_RISK_FACTOR : 1;
}

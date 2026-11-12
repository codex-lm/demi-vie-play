import { LOCKER_HISTORY_LIMIT, LOCKER_MOOD_CODES, LOCKER_OBJECTS, LOCKER_SKILL_LEVELS } from '../data/locker.js';
import { PEOPLE } from '../data/people.js';
import { tr } from '../data/strings.fr.js';
import { hashString } from '../sim/rng.js';
import { openingProfessionKey } from './opening.js';
import { formatNumber } from './tooltips.js';

const moodCodes = new Set(LOCKER_MOOD_CODES);
const signedMoods = new Set(['law', 'trait', 'relationship']);
const personIdCodes = new Set(['eventDeath', 'eventBirth', 'eventBurial', 'eventSchoolGraduation', 'alertMoraleYellow', 'alertMoraleRed']);

// Never use the simulation's random stream, nor write a keepsake into a save.
export function personalObjectFor(sim, colonist) {
  return LOCKER_OBJECTS[hashString(`${sim?.seed ?? 0}:locker:${colonist.id}`) % LOCKER_OBJECTS.length];
}

export function formerTrade(colonist) {
  if (Number.isFinite(colonist.birthTick) && colonist.birthTick >= 0) return tr('lockerBornHere');
  if ((colonist.age ?? PEOPLE.ADULT_AGE) < PEOPLE.ADULT_AGE) return tr('lockerLearning');
  return tr('lockerBefore', { trade: tr(openingProfessionKey(colonist)) });
}

export function lockerSkillModels(colonist) {
  return Object.entries(colonist.skills ?? {}).filter(([, value]) => Number.isFinite(value)).map(([skill, value]) => {
    const level = value >= LOCKER_SKILL_LEVELS.practiced ? 'Practiced'
      : value >= LOCKER_SKILL_LEVELS.familiar ? 'Familiar' : 'Learning';
    return { skill, value, line: tr(`lockerSkill${level}`, { subject: tr(`lockerSkillSubject_${skill}`) }),
      detail: tr('lockerSkillValue', { skill: tr(`${skill}Skill`), value: formatNumber(value) }) };
  });
}

export function lockerMood(cause) {
  const code = String(cause?.code ?? '').replace(/^morale_/, '');
  if (!moodCodes.has(code)) return tr('lockerMoodQuiet');
  const suffix = cause.value < 0 && signedMoods.has(code) ? '_negative' : '';
  return tr(`lockerMood_${code}${suffix}`);
}

// Only explicit person identifiers count. A bare `id` usually names a ROOM.
export function lockerHistoryEntries(sim, colonist) {
  const id = colonist.id;
  return (sim.journal ?? []).filter(entry => {
    const params = entry.params ?? {};
    return [params.colonistId, params.recipientId, params.authorId, params.motherId, params.fatherId, params.deceasedId]
      .some(value => value != null && Number(value) === id)
      || [params.colonistIds, params.parentIds].some(ids => Array.isArray(ids) && ids.some(value => Number(value) === id))
      || ((personIdCodes.has(entry.code) || /^labJournalBirth(?:0[1-9]|1[0-2])$/.test(entry.code))
        && params.id != null && Number(params.id) === id);
  }).slice().sort((a, b) => (b.tick ?? 0) - (a.tick ?? 0) || (b.id ?? 0) - (a.id ?? 0)).slice(0, LOCKER_HISTORY_LIMIT);
}

export function lockerRelationKey(value) {
  return value >= 60 ? 'lockerRelationClose' : value > 0 ? 'lockerRelationFriendly'
    : value <= -60 ? 'lockerRelationHostile' : value < 0 ? 'lockerRelationStrained' : 'lockerRelationNeutral';
}

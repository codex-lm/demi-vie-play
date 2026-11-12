import { TIME, WORLD } from '../data/balance.js';
import { PEOPLE } from '../data/people.js';
import { JOURNAL_TEXT_EXTRA } from '../data/proposals/journal-extra.js';
import { getLanguage, tr } from '../data/strings.fr.js';
import { personalObjectFor } from './lockerModels.js';

const DAMAGE_CAUSE_KEYS = Object.freeze({ air: 'asphyxia', starvation: 'malnutrition' });

/** Backwards reading of the existing age clock; deceased residents stop ageing. */
export function ageAtJournalTick(sim, person, tick) {
  if (!Number.isFinite(person?.age) || !Number.isFinite(tick) || !Number.isFinite(sim?.tick)) return null;
  const end = Number.isFinite(person.deathTick) ? Math.min(sim.tick, person.deathTick) : sim.tick;
  const years = Math.max(0, end - tick) / (PEOPLE.DAYS_PER_YEAR * TIME.TICKS_PER_DAY);
  const adultYears = Math.max(0, person.age - PEOPLE.ADULT_AGE);
  return Math.max(0, person.age >= PEOPLE.ADULT_AGE && years <= adultYears
    ? person.age - years
    : Math.min(person.age, PEOPLE.ADULT_AGE) - (years - adultYears) * PEOPLE.CHILD_AGE_FACTOR);
}

function existedAndWasAdult(sim, person, entry) {
  const tick = entry.tick;
  if (!person || !Number.isFinite(tick) || tick > sim.tick) return false;
  if (Number.isFinite(person.arrivalTick) && person.arrivalTick > tick) return false;
  if (Number.isFinite(person.birthTick) && person.birthTick > tick) return false;
  if (Number.isFinite(person.deathTick)) {
    // Without intra-tick health snapshots, do not assign a gesture on the death tick.
    if (person.deathTick <= tick) return false;
  } else if (person.dead || !(person.health > 0)) return false;
  const age = ageAtJournalTick(sim, person, tick);
  return age !== null && age + 1e-8 >= PEOPLE.ADULT_AGE;
}

function knownAbsent(sim, person, tick) {
  if (tick === sim.tick && (person.surfaceCrewId != null || person.unauthorizedSurface
    || (Number.isFinite(person.y) && person.y < WORLD.SURFACE_Y))) return true;
  // An explicit, retained mission overrules a contradictory old entry.
  for (const expedition of sim.expeditions?.active ?? []) {
    if (expedition.colonistIds?.includes(person.id) && expedition.startTick <= tick
      && (expedition.completedTick == null || expedition.completedTick >= tick)) return true;
  }
  for (const rescue of sim.m5?.radio?.rescues ?? []) {
    if (rescue.colonistIds?.includes(person.id) && rescue.departureTick <= tick
      && (rescue.returnedTick == null || rescue.returnedTick >= tick)) return true;
  }
  return false;
}

/**
 * A meal line stores its actual eater's id, after an underground meal ends.
 * updateColonists bypasses meals for surface crews. This is durable evidence,
 * unlike current health, position, a 48-hour dose history or a guessed name.
 * Other ambient groups have no retained witness: keep those lines anonymous.
 * In particular a birth line's `id` is the baby, and a dig line's is a room.
 */
export function journalNarrativePerson(sim, entry) {
  if (!sim || !Object.hasOwn(JOURNAL_TEXT_EXTRA, entry?.code ?? '')
    || !/^labJournalMeal\d\d$/.test(entry.code)
    || !String(entry.params?.narrativeFact ?? '').startsWith('meal:')
    || !Number.isInteger(entry.params?.colonistId)) return null;
  const person = sim.colonists?.find((candidate) => candidate.id === entry.params.colonistId);
  if (!existedAndWasAdult(sim, person, entry) || knownAbsent(sim, person, entry.tick)) return null;
  return person;
}

export function personalizeJournalNarrative(sim, entry, text) {
  if (typeof text !== 'string') return text;
  const pattern = getLanguage() === 'en' ? /\b[Ss]omeone\b/u : /[Qq]uelqu[’']un/u;
  if (!pattern.test(text)) return text;
  const person = journalNarrativePerson(sim, entry);
  if (!person) return text;
  const firstName = String(person.name ?? '').trim().split(/\s+/u)[0];
  return firstName ? text.replace(pattern, () => firstName) : text;
}

export function namedDeathMessage(sim, entry) {
  if (!sim || entry?.code !== 'eventDeath') return null;
  const id = Number(entry.params?.colonistId ?? entry.params?.id);
  const person = sim.colonists?.find((candidate) => candidate.id === id);
  if (!person?.name) return null;
  // An archived name can belong to a former resident with the same number.
  // Preserve that historical identity instead of borrowing this person's age or keepsake.
  if (entry.params?.name && entry.params.name !== person.name) return null;
  const object = personalObjectFor(sim, person);
  const age = ageAtJournalTick(sim, person, entry.tick);
  const rawCauses = entry.params?.causes?.length ? entry.params.causes
    : person.deathReport?.causes?.length ? person.deathReport.causes : ['unknownCause'];
  const causes = (Array.isArray(rawCauses) ? rawCauses : [rawCauses]).map((cause) => {
    const key = typeof cause === 'string' ? cause : cause?.code ?? 'unknownCause';
    return tr(DAMAGE_CAUSE_KEYS[key] ?? key);
  }).join(', ');
  const key = age === null ? 'inhabitantsDeathUnknownAge'
    : person.sex === 'female' ? 'inhabitantsDeathFemale'
      : person.sex === 'male' ? 'inhabitantsDeathMale' : 'inhabitantsDeathNeutral';
  return tr(key, { name: person.name, age: age === null ? '' : Math.floor(age + 1e-8), object: tr(object.legacyKey), causes });
}

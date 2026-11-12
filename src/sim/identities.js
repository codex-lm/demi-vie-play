import { IDENTITY_NAMES, IDENTITY_RULES, IDENTITY_EXCLUSIONS } from '../data/identities.js';
import { PEOPLE } from '../data/people.js';
import { RNG, hashString } from './rng.js';

const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const excludedNames = new Set(IDENTITY_EXCLUSIONS.map(normalized));
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => normalized(part)[0]).join('');
const givenName = name => normalized(name.trim().split(/\s+/)[0]);
const givenNames = sex => [...IDENTITY_NAMES[sex], ...IDENTITY_NAMES.mixed];

function shuffled(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function chooseName(sex, families, people, rng) {
  const usedGiven = new Set(people.map(person => givenName(person.name)));
  const usedInitials = new Set(people.map(person => initials(person.name)));
  const candidates = [];
  for (const given of givenNames(sex)) {
    if (usedGiven.has(normalized(given))) continue;
    for (const family of families) {
      const name = `${given} ${family}`;
      if (!excludedNames.has(normalized(name)) && !usedInitials.has(initials(name))) candidates.push(name);
    }
  }
  // With twelve founders (and the one outside recruit), the bank always has
  // spare given names and initials. Enumerating candidates avoids retry loops.
  if (!candidates.length) throw new Error('No distinct seeded identity available');
  return rng.pick(candidates);
}

/** Called only when constructing a new opening game, after its people profiles.
 * Names and the starting couple use a separate stream; ages, sexes, skills,
 * traits, portraits and the simulation RNG remain untouched. */
export function initializeSeededIdentities(sim) {
  if (!sim.seededIdentities || !sim.colonists.length) return;
  const rng = new RNG(hashString(`${sim.seed}:initial-identities`));
  const people = sim.colonists;
  const adults = people.filter(person => person.age >= PEOPLE.ADULT_AGE && person.health > 0 && !person.dead);
  const pairs = [];
  for (let first = 0; first < adults.length; first += 1) {
    for (let second = first + 1; second < adults.length; second += 1) {
      if (Math.abs(adults[first].age - adults[second].age) <= IDENTITY_RULES.MAX_COUPLE_AGE_GAP) {
        pairs.push([adults[first], adults[second]]);
      }
    }
  }
  // As in lifecycle.formCouples, a couple need not consist of opposite sexes.
  // The existing pregnancy rules continue to decide whether it can have a baby.
  const couple = pairs.length ? rng.pick(pairs) : [];
  const familyCount = rng.int(IDENTITY_RULES.MIN_FAMILIES, IDENTITY_RULES.MAX_FAMILIES);
  const families = [];
  const familyInitials = new Set();
  for (const family of shuffled(IDENTITY_NAMES.family, rng)) {
    const initial = normalized(family)[0];
    if (familyInitials.has(initial)) continue;
    familyInitials.add(initial);
    families.push(family);
    if (families.length === familyCount) break;
  }
  // Three groups of four or four groups of three. Random people share these
  // surnames; the chosen couple shares one, without adding kinship game rules.
  const members = [...couple, ...shuffled(people.filter(person => !couple.includes(person)), rng)];
  const named = [];
  for (let index = 0; index < members.length; index += 1) {
    const person = members[index];
    const family = families[Math.floor(index * familyCount / members.length)];
    person.name = chooseName(person.sex, [family], named, rng);
    person.coupleId = null;
    named.push(person);
  }
  if (couple.length) {
    const [first, second] = couple;
    first.coupleId = second.id;
    second.coupleId = first.id;
    first.relations[second.id] = Math.max(IDENTITY_RULES.INITIAL_COUPLE_RELATION, first.relations[second.id] ?? 0);
    second.relations[first.id] = Math.max(IDENTITY_RULES.INITIAL_COUPLE_RELATION, second.relations[first.id] ?? 0);
  }
}

/** The DEHORS recruit is named before being added to the colony. */
export function nameSeededRecruit(sim, recruit) {
  if (!sim.seededIdentities) return;
  const rng = new RNG(hashString(`${sim.seed}:outside-identity:${recruit.id}`));
  recruit.name = chooseName(recruit.sex, IDENTITY_NAMES.family, sim.colonists, rng);
}

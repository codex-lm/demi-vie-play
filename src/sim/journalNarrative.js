import { TIME } from '../data/balance.js';
import { JOURNAL_GROUPS_EXTRA } from '../data/proposals/journal-extra.js';
import { hashString } from './rng.js';

const DAY = TIME.TICKS_PER_DAY;
const YEAR = TIME.DAYS_PER_YEAR * DAY;
const SEASON_VARIANTS = Object.freeze({
  spring: Object.freeze(['labJournalSeason01', 'labJournalSeason02', 'labJournalSeason03']),
  summer: Object.freeze(['labJournalSeason04', 'labJournalSeason05', 'labJournalSeason06']),
  autumn: Object.freeze(['labJournalSeason07', 'labJournalSeason08', 'labJournalSeason09']),
  winter: Object.freeze(['labJournalSeason10', 'labJournalSeason11', 'labJournalSeason12']),
});

function dayAt(sim) {
  return Math.floor((Number.isFinite(sim.tick) ? sim.tick : 0) / DAY);
}

function narrativeFacts(sim) {
  sim.m6 ??= {};
  sim.m6.journalNarrative ??= {};
  sim.m6.journalNarrative.facts ??= [];
  return sim.m6.journalNarrative.facts;
}

function candidatesFor(group, options) {
  if (group === 'season') {
    const keys = SEASON_VARIANTS[options.season] ?? [];
    return options.yearEnd ? keys : keys.filter((key) => key !== 'labJournalSeason12');
  }
  const keys = JOURNAL_GROUPS_EXTRA[group] ?? [];
  if (group === 'evening' && !options.hasRadio) return keys.filter((key) => key !== 'labJournalEvening06');
  return keys;
}

export function selectJournalVariant(seed, group, factKey, options = {}) {
  const candidates = candidatesFor(group, options);
  if (candidates.length === 0) return null;
  const start = hashString(`${seed}:m6b:journal:${group}:${factKey}`) % candidates.length;
  return candidates[start];
}

export function recordJournalNarrative(sim, group, factKey, params = {}, options = {}) {
  if (!factKey || typeof sim.log !== 'function' || sim.m6?.balanceProfile === 'baseline') return null;
  const facts = narrativeFacts(sim);
  const uniqueKey = `${group}:${factKey}`;
  if (facts.includes(uniqueKey)) return null;
  const textKey = selectJournalVariant(sim.seed, group, factKey, options);
  if (!textKey) return null;
  const entry = sim.log('info', textKey, { ...params, narrativeFact: uniqueKey }, options.focus ?? null);
  facts.push(uniqueKey);
  return entry;
}

export function recordMealNarrative(sim, colonist, meal = {}) {
  const day = dayAt(sim);
  return recordJournalNarrative(sim, 'meal', String(day), {
    colonistId: colonist.id,
    name: colonist.name,
    resource: meal.resource ?? null,
    amount: meal.amount ?? null,
  });
}

export function recordEveningNarrative(sim, details = {}) {
  const hasRadio = (sim.surface?.structures ?? [])
    .some((structure) => structure.type === 'antenna' && structure.state === 'built');
  return recordJournalNarrative(sim, 'evening', String(dayAt(sim)), {
    foodConsumed: details.foodConsumed ?? 0,
  }, { hasRadio });
}

export function recordSeasonNarrative(sim, previousSeason, season) {
  if (!previousSeason || previousSeason === season) return null;
  const tick = Number.isFinite(sim.tick) ? sim.tick : 0;
  const yearEnd = previousSeason === 'winter' && season === 'spring' && tick > 0 && tick % YEAR === 0;
  const narrativeSeason = yearEnd ? previousSeason : season;
  return recordJournalNarrative(sim, 'season', `${tick}:${previousSeason}:${season}`, {
    previousSeason,
    season,
    yearEnd,
  }, { season: narrativeSeason, yearEnd });
}

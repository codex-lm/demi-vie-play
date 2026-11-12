import {
  buildProvenStoryCandidates,
  collectStoryFacts,
  selectExtraStorySentences,
} from './endStoryExtra.js';
import { LEFT_OUTSIDE_ITEMS } from '../data/leftOutside.js';
import { TIME } from '../data/balance.js';
import { VEILLEE } from '../data/veillee.js';

const COLD_CAUSES = new Set(['cold', 'hypothermia']);

function clone(value, fallback = null) {
  if (value === undefined) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function descriptor(code, tick, params = {}) {
  return { code, params, tick: tick ?? 0 };
}

function lawSentence(sim, laws) {
  const law = laws[0];
  if (!law) return descriptor('m6StoryNoLaws', sim.tick, { count: 0 });
  return descriptor('m6StoryLaw', law.firstTick, {
    lawId: law.lawId,
    days: law.days,
    durationTicks: law.durationTicks,
    crises: law.crises,
    long: law.long,
  });
}

function deathSentence(sim, deaths) {
  const coldDeaths = deaths.filter((death) => death.causes.some((cause) => COLD_CAUSES.has(cause))).length;
  const params = {
    count: deaths.length,
    coldDeaths,
    names: deaths.map((death) => death.name),
    causes: [...new Set(deaths.flatMap((death) => death.causes))],
  };
  const code = deaths.length === 0 ? 'm6StoryNoColdDeaths'
    : coldDeaths === 0 ? 'm6StoryDeathsNoCold' : 'm6StoryDeaths';
  return descriptor(code, deaths.at(-1)?.tick ?? sim.tick, params);
}

function dilemmaSentence(sim, dilemmas) {
  const latest = dilemmas.at(-1);
  if (!latest) return descriptor('m6StoryNoDilemmas', sim.tick, { count: 0 });
  return descriptor('m6StoryDilemmas', latest.chosenTick ?? latest.offeredTick ?? sim.tick, {
    count: dilemmas.length,
    dilemmaId: latest.id ?? null,
    definitionId: latest.definitionId ?? null,
    choiceIndex: latest.choiceIndex ?? null,
    choiceId: latest.choiceId ?? latest.choices?.[latest.choiceIndex]?.id ?? null,
    name: latest.name ?? latest.target?.name ?? null,
  });
}

function neighborSentence(sim, neighbors) {
  const saved = neighbors.filter((neighbor) => neighbor.survived);
  const silent = neighbors.filter((neighbor) => !neighbor.survived
    && (neighbor.fate === 'silent' || neighbor.status === 'silent' || neighbor.alive === false));
  return descriptor('m6StoryNeighbors', sim.tick, {
    saved: saved.length,
    silent: silent.length,
    unknown: neighbors.length - saved.length - silent.length,
    savedIds: saved.map((neighbor) => neighbor.id),
    silentIds: silent.map((neighbor) => neighbor.id),
    savedNameKeys: saved.map((neighbor) => neighbor.nameKey ?? null),
    silentNameKeys: silent.map((neighbor) => neighbor.nameKey ?? null),
  });
}

function souvenirSentence(sim, souvenirs) {
  return descriptor(souvenirs.length > 0 ? 'm6StorySouvenirs' : 'm6StoryNoSouvenirs', sim.tick, {
    count: souvenirs.length,
    types: souvenirs.map((souvenir) => souvenir.type).filter(Boolean),
    authors: souvenirs.map((souvenir) => souvenir.authorName).filter(Boolean),
  });
}

function childSentences(sim, children) {
  if (children.length <= 3) {
    return children.map((child) => descriptor('m6StoryChild', child.birthTick ?? sim.tick, {
      id: child.id,
      name: child.name,
      birthTick: child.birthTick,
    }));
  }
  const individual = children.slice(0, 2).map((child) => descriptor('m6StoryChild', child.birthTick ?? sim.tick, {
    id: child.id,
    name: child.name,
    birthTick: child.birthTick,
  }));
  const grouped = children.slice(2);
  individual.push(descriptor('m6StoryChildren', grouped.at(-1)?.birthTick ?? sim.tick, {
    ids: grouped.map((child) => child.id),
    names: grouped.map((child) => child.name),
    birthTicks: grouped.map((child) => child.birthTick),
  }));
  return individual;
}

function outsideSentences(sim) {
  if (!sim.leftOutside) return [];
  const items = sim.leftOutside.items ?? [];
  const keyFor = (item) => LEFT_OUTSIDE_ITEMS.find((definition) => definition.id === item.id)?.titleKey;
  return [descriptor('eventOutsideStory', sim.tick, {
    recoveredKeys: items.filter((item) => item.status === 'recovered').map(keyFor).filter(Boolean),
    leftKeys: items.filter((item) => item.status !== 'recovered').map(keyFor).filter(Boolean),
  })];
}

export function buildEndStory(sim, entries, projection) {
  const facts = collectStoryFacts(sim, entries);
  const {
    selectedEntries, laws, deaths, children, dilemmas, neighbors, souvenirs,
  } = facts;
  const nativeSentences = [
    ...outsideSentences(sim),
    lawSentence(sim, laws),
    deathSentence(sim, deaths),
    dilemmaSentence(sim, dilemmas),
    neighborSentence(sim, neighbors),
    souvenirSentence(sim, souvenirs),
    ...childSentences(sim, children),
  ];
  const candidates = buildProvenStoryCandidates(sim, selectedEntries, projection, facts);
  const sentences = [
    ...nativeSentences,
    ...selectExtraStorySentences(sim, candidates, nativeSentences),
  ];
  const defeat = candidates.find((candidate) => candidate.code === 'labStoryDefeat');
  if (defeat && !sentences.some((sentence) => sentence.code === defeat.code)) {
    sentences[sentences.length - 1] = descriptor(defeat.code, defeat.tick, defeat.params);
  }
  const inscriptions = sim.veillee?.inscriptions?.map(({ day, key }) => ({ day, key })) ?? [];
  for (const inscription of inscriptions) {
    sentences.push(descriptor('veilleeInscription', (inscription.day - 1) * TIME.TICKS_PER_DAY
      + VEILLEE.HOUR * TIME.TICKS_PER_HOUR, inscription));
  }
  return {
    sentences,
    entries: clone(selectedEntries, []),
    children,
    season: projection?.season ?? projection?.exit?.season ?? projection?.exitSeason
      ?? sim.m5?.calendar?.season ?? null,
    weather: projection?.weather ?? projection?.exit?.weather ?? projection?.exitWeather
      ?? sim.weather?.current ?? (typeof sim.weather === 'string' ? sim.weather : null),
    laws,
    deaths,
    dilemmas,
    neighbors,
    souvenirs,
    ...(sim.veillee ? { inscriptions } : {}),
  };
}

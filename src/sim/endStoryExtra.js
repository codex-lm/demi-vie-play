import { TIME, WORLD } from '../data/balance.js';
import { STORY_CONTEXTS_EXTRA } from '../data/proposals/story-extra.js';
import { radioText } from '../data/radioText.js';
import { hashString } from './rng.js';

const LONG_LAW_DAYS = 30;
const CRISIS_CODES = new Set(['alertMoraleRed', 'eventFactionConflict', 'eventStrike']);
const COLD_CAUSES = new Set(['cold', 'hypothermia']);
const HUNGER_CAUSES = new Set(['hunger', 'starvation']);
const CONTEXT_BY_EVIDENCE = new Map(STORY_CONTEXTS_EXTRA.map((context) => [context.evidence, context]));

function clone(value, fallback = null) {
  if (value === undefined) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function storyEntries(sim) {
  return [...(sim.exodus?.storyArchive ?? []), ...(sim.journal ?? [])]
    .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0) || (a.id ?? 0) - (b.id ?? 0));
}

function buildLaws(sim, history) {
  const charterHistory = sim.charter?.history ?? [];
  const byLaw = new Map();
  for (let index = 0; index < charterHistory.length; index += 1) {
    const signed = charterHistory[index];
    if (!signed?.lawId) continue;
    const replacement = charterHistory.slice(index + 1)
      .find((entry) => entry.replacedLawId === signed.lawId);
    const startTick = signed.tick ?? 0;
    const endTick = Math.max(startTick, replacement?.tick ?? sim.tick ?? startTick);
    const crises = history.filter((entry) => CRISIS_CODES.has(entry.code)
      && (entry.tick ?? 0) >= startTick && (entry.tick ?? 0) < endTick + (replacement ? 0 : 1)).length;
    const current = byLaw.get(signed.lawId) ?? {
      lawId: signed.lawId,
      firstTick: startTick,
      lastTick: startTick,
      durationTicks: 0,
      crises: 0,
    };
    current.lastTick = Math.max(current.lastTick, endTick);
    current.durationTicks += endTick - startTick;
    current.crises += crises;
    byLaw.set(signed.lawId, current);
  }
  return [...byLaw.values()].map((law) => ({
    ...law,
    days: Math.floor(law.durationTicks / TIME.TICKS_PER_DAY),
    long: law.durationTicks >= LONG_LAW_DAYS * TIME.TICKS_PER_DAY,
  })).sort((a, b) => b.durationTicks - a.durationTicks
    || a.firstTick - b.firstTick || a.lawId.localeCompare(b.lawId));
}

function addDeath(deaths, sim, details) {
  const colonistId = details.colonistId ?? details.id ?? null;
  if (colonistId === null) return;
  const colonist = (sim.colonists ?? []).find((person) => person.id === colonistId);
  const previous = deaths.get(colonistId) ?? {};
  const causes = clone(details.causes ?? previous.causes ?? colonist?.lastDamageCauses ?? [], [])
    .map((cause) => cause?.code ?? cause).filter((cause) => typeof cause === 'string');
  deaths.set(colonistId, {
    colonistId,
    name: details.name ?? colonist?.name ?? previous.name ?? String(colonistId),
    tick: details.tick ?? previous.tick ?? colonist?.deathReport?.tick ?? sim.tick ?? 0,
    causes: [...new Set(causes)],
    steps: clone(details.steps ?? previous.steps ?? colonist?.deathReport?.steps ?? [], []),
  });
}

function buildDeaths(sim, history) {
  const deaths = new Map();
  for (const report of sim.m5?.causes?.deaths ?? []) addDeath(deaths, sim, report);
  for (const colonist of sim.colonists ?? []) {
    if (colonist.deathReport) addDeath(deaths, sim, { colonistId: colonist.id, ...colonist.deathReport });
  }
  for (const entry of history) {
    if (entry.code !== 'eventDeath') continue;
    addDeath(deaths, sim, {
      colonistId: entry.params?.colonistId ?? entry.params?.id,
      name: entry.params?.name,
      tick: entry.tick,
      causes: entry.params?.causes,
    });
  }
  for (const colonist of sim.colonists ?? []) {
    if (colonist.dead || colonist.health <= 0) {
      addDeath(deaths, sim, { colonistId: colonist.id, tick: colonist.deathTick });
    }
  }
  return [...deaths.values()].sort((a, b) => a.tick - b.tick || a.colonistId - b.colonistId);
}

function buildChildren(sim, history) {
  const births = new Map();
  const noteBirth = (id, details = {}) => {
    if (id === null || id === undefined) return;
    const colonist = (sim.colonists ?? []).find((person) => person.id === id);
    const previous = births.get(id) ?? {};
    births.set(id, {
      id,
      name: details.name ?? colonist?.name ?? previous.name ?? String(id),
      birthTick: details.birthTick ?? previous.birthTick ?? colonist?.birthTick ?? null,
      parentIds: clone(details.parentIds ?? colonist?.parentIds ?? previous.parentIds ?? [], []),
    });
  };
  for (const entry of history) {
    if (entry.code !== 'eventBirth') continue;
    noteBirth(entry.params?.id ?? entry.params?.colonistId, {
      name: entry.params?.name,
      birthTick: entry.tick,
    });
  }
  for (const event of sim.events ?? []) {
    if (event.type !== 'birth') continue;
    noteBirth(event.colonistId ?? event.id, {
      birthTick: event.tick,
      parentIds: event.parentIds,
    });
  }
  for (const colonist of sim.colonists ?? []) {
    if (Array.isArray(colonist.parentIds) && colonist.parentIds.length > 0) noteBirth(colonist.id);
  }
  return [...births.values()].sort((a, b) => (a.birthTick ?? Number.MAX_SAFE_INTEGER)
    - (b.birthTick ?? Number.MAX_SAFE_INTEGER) || a.id - b.id);
}

function buildNeighbors(sim) {
  return (sim.m5?.radio?.neighbors ?? []).map((source) => {
    const neighbor = clone(source, {});
    neighbor.survived = neighbor.contacted === true && neighbor.alive === true && neighbor.status === 'active';
    return neighbor;
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function collectStoryFacts(sim, entries) {
  const selectedEntries = Array.isArray(entries) ? entries : storyEntries(sim);
  const history = [...storyEntries(sim), ...selectedEntries];
  const unique = new Map(history.map((entry) => [`${entry.tick ?? 0}:${entry.id ?? ''}:${entry.code}`, entry]));
  const completeHistory = [...unique.values()].sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  return {
    selectedEntries,
    completeHistory,
    laws: buildLaws(sim, completeHistory),
    deaths: buildDeaths(sim, completeHistory),
    children: buildChildren(sim, completeHistory),
    dilemmas: clone(sim.m5?.dilemmas?.history ?? [], []),
    neighbors: buildNeighbors(sim),
    souvenirs: clone(sim.m6?.souvenirs ?? [], []),
  };
}

function dugRooms(sim, history) {
  const rooms = new Map();
  for (const room of sim.excavations ?? []) {
    if (room.kind !== 'room' || room.initial || !['dug', 'fitted', 'collapsed'].includes(room.state)
      || (room.dugCells ?? []).length === 0 || room.id == null) continue;
    rooms.set(room.id, {
      id: room.id,
      tick: room.openedTick ?? room.dugTick ?? sim.tick ?? 0,
      roomType: room.roomType ?? 'room',
      room,
    });
  }
  for (const entry of history) {
    if (entry.code !== 'eventDug' || entry.params?.kind !== 'room') continue;
    const id = entry.params?.id ?? entry.params?.excavationId;
    if (id == null) continue;
    const room = (sim.excavations ?? []).find((candidate) => candidate.id === id);
    if (room?.initial) continue;
    const previous = rooms.get(id);
    rooms.set(id, {
      id,
      tick: Math.min(previous?.tick ?? Infinity, entry.tick ?? sim.tick ?? 0),
      roomType: room?.roomType ?? previous?.roomType ?? 'room',
      room: room ?? previous?.room ?? null,
    });
  }
  return [...rooms.values()].sort((a, b) => a.tick - b.tick || a.id - b.id);
}

function collapseRecords(sim, history) {
  const records = new Map();
  const reports = sim.m5?.causes?.collapses ?? [];
  const reportKey = (report) => report.id ?? `collapse-${report.excavationId}-${report.tick ?? 0}`;
  const linkedReport = (room) => reports.find((report) => room.collapseReportId != null && report.id === room.collapseReportId)
    ?? room.collapseReport
    ?? reports.findLast((report) => report.rescueSourceId === room.id
      || report.excavationId === room.id);
  for (const report of reports) {
    if (report.excavationId == null) continue;
    records.set(reportKey(report), { id: report.excavationId, tick: report.tick ?? 0 });
  }
  for (const room of sim.excavations ?? []) {
    if (room.state !== 'collapsed' || room.id == null) continue;
    // The rubble source and the intact fragments refer to the same event.
    // A tunnel may also lose several sections, even within one tick.
    const report = linkedReport(room);
    const key = report ? reportKey(report) : `excavation-${room.id}`;
    records.set(key, { id: report?.excavationId ?? room.id, tick: report?.tick ?? room.collapseTick ?? 0 });
  }
  for (const entry of history) {
    if (!['eventCollapse', 'eventCascade', 'eventTunnelCollapse'].includes(entry.code)) continue;
    const id = entry.params?.id ?? entry.params?.excavationId;
    if (id == null) continue;
    const room = (sim.excavations ?? []).find((candidate) => candidate.id === id);
    const report = reports.find((candidate) => candidate.tick === entry.tick
      && (candidate.excavationId === id || candidate.rescueSourceId === id
        || candidate.id === room?.collapseReportId));
    if (report) continue;
    const key = room?.state === 'collapsed' && !linkedReport(room)
      ? `excavation-${id}` : `journal-${id}-${entry.tick ?? 0}`;
    records.set(key, { id, tick: entry.tick ?? room?.collapseTick ?? 0 });
  }
  return [...records.values()].sort((a, b) => a.tick - b.tick || a.id - b.id);
}

function hasCompleteNegativeHistory(sim, kind) {
  if (!Array.isArray(sim.exodus?.storyArchive) || !Array.isArray(sim.colonists)) return false;
  if (kind === 'births') return true;
  if (kind === 'deaths') return Array.isArray(sim.m5?.causes?.deaths);
  if (kind === 'collapses') return Array.isArray(sim.m5?.causes?.collapses) && Array.isArray(sim.excavations);
  return false;
}

export function buildProvenStoryCandidates(sim, entries, projection, suppliedFacts = null) {
  const facts = suppliedFacts ?? collectStoryFacts(sim, entries);
  const { selectedEntries, completeHistory, laws, deaths, children, neighbors } = facts;
  const candidates = [];
  const add = (evidence, tick, params = {}) => {
    const context = CONTEXT_BY_EVIDENCE.get(evidence);
    if (!context) return;
    candidates.push({
      code: context.textKey,
      tick: Number.isFinite(tick) ? tick : sim.tick ?? 0,
      params,
      evidence,
    });
  };

  const rooms = dugRooms(sim, completeHistory);
  if (rooms.length > 0) add('firstDugRoom', rooms[0].tick, { roomType: rooms[0].roomType });
  if (rooms.length > 1) add('dugRoomCount', rooms.at(-1).tick, { count: rooms.length });
  const occupiedRooms = rooms.filter(({ room }) => room && ['dug', 'fitted'].includes(room.state)
    && !room.disabled && Number.isFinite(room.y));
  const deepest = occupiedRooms.sort((a, b) => b.room.y - a.room.y || a.id - b.id)[0];
  if (deepest) {
    const depth = Math.max(0, deepest.room.y - WORLD.SURFACE_Y);
    if (depth > 0) add('deepestOccupiedRoom', deepest.tick, { depth });
  }
  const supportCount = (sim.excavations ?? []).reduce((total, room) => total + (room.supports ?? [])
    .filter((support) => typeof support === 'number' || (!support.failed && support.solidity !== 0)).length, 0);
  if (supportCount > 0) add('completedSupportCount', sim.tick, { count: supportCount });

  for (const law of laws) {
    if (law.durationTicks <= 0) continue;
    add(`lawDuration:${law.lawId}`, law.lastTick, { days: law.days });
  }

  const exodus = sim.exodus?.result?.type === 'exodus'
    || selectedEntries.some((entry) => entry.code === 'eventExodus');
  if (children.length > 0) add('birthEvent', children[0].birthTick, { name: children[0].name });
  if (exodus) {
    const firstSky = children.find((child) => {
      const person = (sim.colonists ?? []).find((colonist) => colonist.id === child.id);
      return person && !person.dead && person.health > 0;
    });
    if (firstSky) add('livingUndergroundBornAtExodus', sim.tick, { name: firstSky.name });
  }
  if (children.length > 1) add('birthCount', children.at(-1).birthTick, { count: children.length });
  if (children.length === 0 && hasCompleteNegativeHistory(sim, 'births')) add('completeHistoryWithZeroBirths', sim.tick);

  if (deaths.length > 0) {
    const death = deaths[0];
    add('deathReport', death.tick, { name: death.name, causes: [...death.causes] });
    const warned = deaths.map((report) => ({
      report,
      warning: (report.steps ?? []).filter((entry) => entry.level === 'warning' && (entry.tick ?? Infinity) <= report.tick)
        .sort((a, b) => a.tick - b.tick || (a.id ?? 0) - (b.id ?? 0))[0],
    })).find((entry) => entry.warning);
    if (warned) {
      const hours = Math.round((warned.report.tick - warned.warning.tick) / TIME.TICKS_PER_HOUR * 10) / 10;
      add('deathReportWithMatchedWarning', warned.report.tick, { name: warned.report.name, hours });
    }
  }
  if (hasCompleteNegativeHistory(sim, 'deaths')) {
    if (!deaths.some((death) => death.causes.some((cause) => COLD_CAUSES.has(cause)))) {
      add('completeDeathHistoryWithoutHypothermia', sim.tick);
    }
    if (!deaths.some((death) => death.causes.some((cause) => HUNGER_CAUSES.has(cause)))) {
      add('completeDeathHistoryWithoutStarvation', sim.tick);
    }
  }

  const collapses = collapseRecords(sim, completeHistory);
  if (collapses.length > 0) add('collapseCount', collapses.at(-1).tick, { count: collapses.length });
  if (collapses.length === 0 && hasCompleteNegativeHistory(sim, 'collapses')) {
    add('completeCollapseHistoryWithoutCollapse', sim.tick);
  }
  const extinguishedFires = (sim.m5?.hazards?.fires ?? []).filter((fire) => fire.state === 'extinguished');
  if (extinguishedFires.length > 0) {
    add('extinguishedFireCount', Math.max(...extinguishedFires.map((fire) => fire.endedTick ?? sim.tick ?? 0)),
      { count: extinguishedFires.length });
  }
  const crises = completeHistory.filter((entry) => CRISIS_CODES.has(entry.code));
  if (crises.length > 0) add('crisisCount', crises.at(-1).tick, { count: crises.length });

  const expeditionHistory = (sim.expeditions?.history ?? []).filter((record) => record.state !== 'lost')
    .sort((a, b) => (a.completedTick ?? 0) - (b.completedTick ?? 0) || a.id - b.id);
  if (expeditionHistory.length > 0) {
    add('firstExpeditionReturn', expeditionHistory[0].completedTick, { site: expeditionHistory[0].siteId });
  }
  if (expeditionHistory.length > 1) {
    add('completedExpeditionCount', expeditionHistory.at(-1).completedTick, { count: expeditionHistory.length });
  }
  const researchCount = (sim.research?.completed ?? []).length;
  if (researchCount > 0) add('completedResearchCount', sim.tick, { count: researchCount });
  const findCount = (sim.m5?.poi?.finds ?? []).length;
  if (findCount > 0) add('findCount', sim.m5.poi.finds.at(-1).tick ?? sim.tick, { count: findCount });

  const surviving = neighbors.filter((neighbor) => neighbor.survived);
  if (surviving.length > 0) {
    add('survivingRadioNeighborNames', sim.tick, {
      names: surviving.map((neighbor) => radioText(neighbor.nameKey)).join(', '),
    });
  }
  const silent = neighbors.filter((neighbor) => !neighbor.survived
    && (neighbor.fate === 'silent' || neighbor.status === 'silent' || neighbor.alive === false));
  if (silent.length > 0) {
    add('silentRadioNeighborNames', Math.max(...silent.map((neighbor) => neighbor.silenceTick ?? sim.tick ?? 0)), {
      names: silent.map((neighbor) => radioText(neighbor.nameKey)).join(', '),
    });
  }
  const rescues = (sim.m5?.radio?.rescues ?? []).filter((mission) => mission.state === 'completed'
    && mission.arrivalTick != null && mission.returnedTick != null);
  if (rescues.length > 0) add('completedRescueCount', Math.max(...rescues.map((mission) => mission.returnedTick)), { count: rescues.length });
  const trades = (sim.m5?.radio?.trades ?? []).filter((trade) => trade.state === 'completed' && trade.completedTick != null);
  if (trades.length > 0) add('completedRadioTradeCount', Math.max(...trades.map((trade) => trade.completedTick)), { count: trades.length });

  if (exodus && Number.isFinite(projection?.startingLiving)) add('exodusResult', sim.tick, { living: projection.startingLiving });
  if (exodus && Number.isFinite(projection?.healthy) && Number.isFinite(projection?.living)
    && projection?.firstYear && typeof projection.firstYear === 'object') {
    add('firstYearProjection', sim.tick, { healthy: projection.healthy, living: projection.living });
  }
  if (exodus && Number.isFinite(projection?.startingKit?.food) && Number.isFinite(projection?.startingKit?.fuel)) {
    add('departureStartingKit', sim.tick, { food: projection.startingKit.food, fuel: projection.startingKit.fuel });
  }
  if (sim.exodus?.result?.type === 'defeat') add('defeatResult', sim.exodus.result.tick ?? sim.tick);
  return candidates;
}

function nativeConflict(candidate, nativeSentences) {
  const nativeCodes = new Set(nativeSentences.map((sentence) => sentence.code));
  if (candidate.code === 'labStoryNoColdDeath') return true;
  if (['labStoryDeath', 'labStoryWarnedDeath'].includes(candidate.code)) return true;
  if (['labStoryNeighbors', 'labStorySilencedNeighbors'].includes(candidate.code)) return true;
  const hasNativeBirth = [...nativeCodes].some((code) => code === 'm6StoryChild' || code === 'm6StoryChildren');
  if (['labStoryBirth', 'labStoryBirths', 'labStoryFirstSky', 'labStoryNoBirth'].includes(candidate.code)) {
    return hasNativeBirth;
  }
  if (candidate.evidence.startsWith('lawDuration:')) {
    const nativeLaw = nativeSentences.find((sentence) => sentence.code === 'm6StoryLaw');
    return nativeLaw?.params?.lawId === candidate.evidence.slice('lawDuration:'.length);
  }
  return false;
}

function extraGroup(candidate) {
  if (['labStoryFirstRoom', 'labStoryRooms'].includes(candidate.code)) return 'rooms';
  if (['labStoryBirth', 'labStoryBirths', 'labStoryFirstSky', 'labStoryNoBirth'].includes(candidate.code)) return 'births';
  if (['labStoryDeath', 'labStoryWarnedDeath'].includes(candidate.code)) return 'death';
  if (['labStoryExpeditions', 'labStoryFirstExpedition'].includes(candidate.code)) return 'expeditions';
  return candidate.code;
}

export function selectExtraStorySentences(sim, candidates, nativeSentences, limit = 8) {
  const available = candidates.filter((candidate) => !nativeConflict(candidate, nativeSentences))
    .map((candidate, index) => ({
      candidate,
      index,
      rank: hashString(`${sim.seed}:m6b:end-story:${candidate.code}:${candidate.tick}`),
    })).sort((a, b) => Number(b.candidate.code === 'labStoryDefeat') - Number(a.candidate.code === 'labStoryDefeat')
      || a.rank - b.rank || a.index - b.index);
  const selected = [];
  const groups = new Set();
  for (const item of available) {
    if (nativeSentences.length + selected.length >= limit) break;
    const group = extraGroup(item.candidate);
    if (groups.has(group)) continue;
    groups.add(group);
    selected.push({
      code: item.candidate.code,
      tick: item.candidate.tick,
      params: clone(item.candidate.params, {}),
    });
  }
  return selected;
}

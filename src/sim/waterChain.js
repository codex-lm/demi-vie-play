import { AIR, ALERTS, HEAT, NEEDS, TIME, WATER, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { foodInputsPerDay, ROOM_DEFS } from '../data/rooms.js';
import { WEATHER } from '../data/surface.js';
import { lawMultiplier } from './laws.js';
import { consumptionFactor } from './people.js';
import { researchEffect } from './research.js';
import { resourceTotals, roomStock } from './resources.js';
import { shallowWaterContaminated, wellOutlook } from './water.js';
import { aquiferContact, currentWaterTableDepth } from './groundwater.js';
import { excavationCells } from './excavation.js';
import { starvingWorkFactor } from './condition.js';

const WATER_STATION_TYPES = new Set(['well', 'filterPlant', 'recycler', 'decon', 'pump', 'cistern']);

function amount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function workerRatio(sim, excavation, definition) {
  if (!definition.jobs) return 1;
  const colonistIds = new Set();
  let workers = 0;
  let recentlyVacated = 0;
  for (const job of sim.jobs ?? []) {
    if (job.type !== 'produce' || job.excavationId !== excavation.id) continue;
    if (job.status === 'active' && job.colonistId !== null) {
      const colonist = (sim.colonists ?? []).find((person) => person.id === job.colonistId);
      if (colonist && !colonist.dead && (colonist.health ?? 100) > 0) {
        // Un affamé au maximum de la faim ne compte que pour une fraction
        // d'ouvrier (voir starvingWorkFactor).
        if (colonistIds.has(colonist.id)) continue;
        colonistIds.add(colonist.id);
        workers += starvingWorkFactor(colonist);
      }
      continue;
    }
    if (job.status !== 'queued' || job.colonistId !== null
      || !Number.isFinite(job.createdTick) || !Number.isFinite(job.retryTick) || job.retryTick <= job.createdTick) continue;
    const elapsed = sim.tick - Math.min(sim.tick, job.retryTick);
    if (elapsed >= 0 && elapsed < TIME.TICKS_PER_DAY) recentlyVacated += 1 - elapsed / TIME.TICKS_PER_DAY;
  }
  return Math.min(1, (workers + recentlyVacated) / definition.jobs);
}

function stationModel(sim, excavation) {
  const definition = ROOM_DEFS[excavation.roomType];
  let status = 'inactive';
  if (excavation && definition && ['dug', 'fitted'].includes(excavation.state)) {
    status = 'active';
    // Une panne (storyteller) éteint aussi la machine (disabled), mais le joueur
    // ne peut pas la rallumer : une réparation attend un ouvrier.
    if (excavation.machineBroken) status = 'broken';
    else if (excavation.disabled) status = 'disabled';
    else if (amount(excavation.floodRatio) > WATER.FLOOD_UNUSABLE_RATIO) status = 'flooded';
    else if (definition.powerKw > 0 && (!excavation.powered || excavation.powerShed)) status = 'noPower';
    else if (excavation.roomType === 'well' && wellOutlook(sim, excavation).quality === null) status = 'noAquifer';
  }
  const ratio = status === 'active' ? workerRatio(sim, excavation, definition) : 0;
  const stock = status === 'active' ? roomStock(sim, excavation) : null;
  if (status === 'active' && ratio <= 0) status = 'noWorkers';
  else if (status === 'active' && definition.inputResource && amount(stock?.resources?.[definition.inputResource]) <= 0) status = 'noInput';
  else if (status === 'active' && excavation.roomType === 'filterPlant' && amount(stock?.resources?.filters) <= 0) status = 'noFilters';
  const active = status === 'active';
  const yieldFactor = excavation.roomType === 'recycler' ? researchEffect(sim, 'recyclerFactor', 1)
    : excavation.roomType === 'decon' ? researchEffect(sim, 'deconFactor', 1) : 1;
  const capacityPerDay = excavation.roomType === 'pump'
    ? amount(definition.pumpUnitsPerHour) * TIME.TICKS_PER_DAY / TIME.TICKS_PER_HOUR
    : amount(definition.waterPerDay) * yieldFactor;
  const productionPerDay = active ? capacityPerDay * ratio * lawMultiplier(sim, 'workFactor', 1) : 0;
  return {
    id: excavation.id,
    roomType: excavation.roomType,
    active,
    status,
    inputResource: definition.inputResource ?? null,
    outputResource: definition.outputResource ?? null,
    workerRatio: ratio,
    capacityPerDay,
    productionPerDay,
    cleanProductionPerDay: definition.outputResource === 'waterClean' ? productionPerDay : 0,
    filtrationPerDay: excavation.roomType === 'filterPlant' ? productionPerDay : 0,
    storageCapacity: definition.capacity ?? null,
  };
}

// Une station de filtration dans l'un de ces états ne produit plus rien tant
// que le joueur n'agit pas. « Sans eau à traiter sur place » et « Sans filtre
// sur place » ne sont pas dans la liste : ils passent souvent le temps d'une
// livraison, et la tendance mesurée en tient déjà compte.
const FILTRATION_HARD_STOPS = new Set(['inactive', 'disabled', 'broken', 'flooded', 'noPower', 'noWorkers']);

// L'eau propre que boivent les cultures (champignonnière, hydroponie, bassin à
// poissons), au rythme de leurs ouvriers, comme rooms.js la prélève.
function cropWaterPerDay(sim) {
  let perDay = 0;
  for (const excavation of sim.excavations ?? []) {
    const definition = ROOM_DEFS[excavation.roomType];
    if (!definition?.foodPerDay || !(definition.waterPerDay > 0)) continue;
    if (!['dug', 'fitted'].includes(excavation.state) || excavation.disabled) continue;
    if (amount(excavation.floodRatio) > WATER.FLOOD_UNUSABLE_RATIO) continue;
    if (definition.powerKw > 0 && (!excavation.powered || excavation.powerShed)) continue;
    const water = amount(foodInputsPerDay(definition, excavation).waterClean);
    perDay += water * workerRatio(sim, excavation, definition) * lawMultiplier(sim, 'workFactor', 1);
  }
  return perDay;
}

// Ce qu'une heure peut faire varier la réserve d'eau propre sans événement
// ponctuel : au plus une gorgée par habitant (une gorgée remet la soif à zéro,
// la suivante vient des heures plus tard), une récolte par culture et une
// production par station, avec une marge. Au-delà, la variation est une perte
// ou une arrivée ponctuelle qui n'a pas été notée comme telle (réserve enfouie
// par un éboulement, par exemple) : ce n'est pas un rythme.
function hourlyFlowBounds(sim, stations) {
  const workFactor = Math.max(1, lawMultiplier(sim, 'workFactor', 1));
  const drinks = (sim.colonists ?? []).filter((colonist) => (colonist.health ?? 100) > 0 && !colonist.dead)
    .reduce((sum, colonist) => sum + NEEDS.WATER_PER_DRINK * Math.max(1, consumptionFactor(colonist)), 0);
  let crops = 0;
  for (const excavation of sim.excavations ?? []) {
    const definition = ROOM_DEFS[excavation.roomType];
    if (!definition?.foodPerDay || !(definition.waterPerDay > 0) || !['dug', 'fitted'].includes(excavation.state)) continue;
    crops += amount(foodInputsPerDay(definition, excavation).waterClean) * workFactor;
  }
  const production = stations.filter((station) => station.outputResource === 'waterClean')
    .reduce((sum, station) => sum + station.capacityPerDay * workFactor, 0);
  return {
    loss: 1.5 * drinks + 2 * crops / 24 + 1,
    gain: 2 * production / 24 + 1,
  };
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Variation par jour d'une réserve de l'abri (eau propre, filtres) sur les
 * dernières 24 h, lue dans l'historique horaire que tient updateReserves, avec
 * la même fenêtre et la même interpolation. Les arrivées ponctuelles (radio,
 * expéditions, dilemmes) y sont déjà retirées. null tant que l'historique ne
 * couvre pas une journée entière. Lecture seule.
 */
function trailingDayChange(sim, key) {
  return trailingChange(sim.reserveHistory, sim, key, TIME.TICKS_PER_DAY);
}

function trailingChange(history, sim, key, windowTicks) {
  const current = sim.reserves?.[key]?.amount;
  if (!Array.isArray(history) || history.length === 0 || !Number.isFinite(current)) return null;
  const cutoff = amount(sim.tick) - windowTicks;
  let index = 0;
  while (index + 1 < history.length && history[index + 1].tick <= cutoff) index += 1;
  const first = history[index];
  const next = history[index + 1];
  let past = first?.[key];
  let pastTick = first?.tick;
  if (next && first.tick < cutoff && next.tick > cutoff) {
    const ratio = (cutoff - first.tick) / (next.tick - first.tick);
    past = first[key] + (next[key] - first[key]) * ratio;
    pastTick = cutoff;
  }
  const elapsed = amount(sim.tick) - pastTick;
  if (!Number.isFinite(past) || !Number.isFinite(elapsed) || elapsed < windowTicks) return null;
  return (current - past) * TIME.TICKS_PER_DAY / elapsed;
}

// Mémoire de lecture, hors simulation et hors sauvegarde. L'historique horaire
// des réserves ne couvre que 24 h, or toute la colonie boit ensemble sur un rythme
// de deux jours (trois tournées en 48 h) : une fenêtre de 24 h en voit une ou
// deux, et le solde mesuré passe du simple au double d'une heure à l'autre. On
// garde donc les relevés qui sortent de l'historique pour mesurer l'eau propre
// sur 48 h. Une arrivée ponctuelle décale tout l'historique (recordReserveShift) :
// le même décalage, lu sur un relevé commun, est reporté sur les anciens relevés.
// Chaque relevé garde aussi, lus au moment où il apparaît, le compteur de
// production des stations de filtration, l'eau propre en vrac (déblais d'un
// éboulement, pas encore rapportés) et le nombre de filtres à air en marche.
// L'interface peut ranger cette mémoire à côté de la sauvegarde et la rendre au
// chargement (reserveTrendSnapshot, restoreReserveTrend) ; la simulation ne la
// lit jamais.
const RESERVE_MEMORY = new WeakMap();
const WATER_TREND_TICKS = 2 * TIME.TICKS_PER_DAY;
// Trois jours : la sauvegarde automatique n'a lieu qu'une fois par jour de jeu,
// la mémoire rangée par l'interface peut avoir un jour d'avance sur la partie
// rechargée, et il faut encore 48 h derrière.
const MEMORY_KEEP_TICKS = 3 * TIME.TICKS_PER_DAY + 2 * TIME.TICKS_PER_HOUR;

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

// Un filtre à air en marche. Un éboulement laisse airFilterActive levé sur la
// salle effondrée, qu'air.js ne met plus à jour et qui n'use plus de filtres.
function runningAirFilter(excavation) {
  return excavation.roomType === 'airFilter' && excavation.airFilterActive && excavation.state !== 'collapsed';
}

// Ce qu'un relevé note en plus des réserves : la production cumulée des stations
// de filtration (excavation.production.produced), l'eau propre en vrac et les
// filtres à air en marche.
function readingSample(sim) {
  let produced = 0;
  let loose = 0;
  let airFilters = 0;
  for (const excavation of sim.excavations ?? []) {
    if (excavation.roomType === 'filterPlant') produced += amount(excavation.production?.produced);
    if (runningAirFilter(excavation)) airFilters += 1;
    loose += amount(excavation.loose?.waterClean);
  }
  return { produced, loose, airFilters };
}

function rememberedHistory(sim, sample) {
  const history = Array.isArray(sim.reserveHistory) ? sim.reserveHistory : [];
  if (history.length === 0) return [];
  let memory = RESERVE_MEMORY.get(sim) ?? [];
  const known = new Map(memory.map((entry) => [entry.tick, entry]));
  const twin = history.find((entry) => known.has(entry.tick));
  const kept = twin ? known.get(twin.tick) : null;
  // Sans relevé commun (lecture trop espacée) ou si la partie a reculé, on repart
  // de l'historique seul.
  if (!kept || memory[memory.length - 1].tick > history[history.length - 1].tick) {
    memory = [];
    known.clear();
  }
  const shift = kept ? { water: amount(twin.water) - amount(kept.water), filters: amount(twin.filters) - amount(kept.filters) } : null;
  const now = amount(sim.tick);
  const oldest = history[0].tick;
  const floor = now - MEMORY_KEEP_TICKS;
  const older = memory.filter((entry) => entry.tick < oldest && entry.tick >= floor)
    .map((entry) => ({ ...entry, water: entry.water + shift.water, filters: entry.filters + shift.filters }));
  const recent = history.map((entry) => {
    const previous = known.get(entry.tick);
    // Un relevé vu moins d'une heure après son heure reçoit les compteurs du moment.
    const fresh = now - entry.tick < TIME.TICKS_PER_HOUR;
    return {
      tick: entry.tick,
      water: amount(entry.water),
      filters: amount(entry.filters),
      produced: finiteOrNull(previous?.produced) ?? (fresh ? sample.produced : null),
      loose: finiteOrNull(previous?.loose) ?? (fresh ? sample.loose : null),
      airFilters: finiteOrNull(previous?.airFilters) ?? (fresh ? sample.airFilters : null),
    };
  });
  memory = [...older, ...recent];
  RESERVE_MEMORY.set(sim, memory);
  return memory;
}

/**
 * Copie de la mémoire de lecture, pour que l'interface la range à côté de la
 * sauvegarde. null tant qu'elle est vide. Lecture seule.
 */
export function reserveTrendSnapshot(sim) {
  const memory = sim ? RESERVE_MEMORY.get(sim) : null;
  if (!memory?.length) return null;
  return { version: 1, entries: memory.map((entry) => ({ ...entry })) };
}

/**
 * Rend à une partie rechargée la mémoire de lecture rangée par l'interface :
 * sans elle, il faut rejouer 24 h avant de remesurer sur 48 h. La copie n'est
 * reprise que si elle décrit bien cette partie : ses relevés communs avec
 * l'historique sauvegardé ne diffèrent que d'un même décalage (les arrivées
 * ponctuelles notées depuis). Ce qui dépasse la sauvegarde est oublié.
 * Renvoie true si la mémoire est rendue. Ne touche pas à la simulation.
 */
export function restoreReserveTrend(sim, snapshot) {
  const history = Array.isArray(sim?.reserveHistory) ? sim.reserveHistory : [];
  const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : null;
  if (!entries || history.length < 2) return false;
  const last = history[history.length - 1].tick;
  const usable = entries.filter((entry) => Number.isFinite(entry?.tick) && entry.tick <= last
    && Number.isFinite(entry.water) && Number.isFinite(entry.filters)).sort((a, b) => a.tick - b.tick);
  const byTick = new Map(usable.map((entry) => [entry.tick, entry]));
  const pairs = history.filter((entry) => byTick.has(entry.tick)).map((entry) => [entry, byTick.get(entry.tick)]);
  if (pairs.length < Math.min(3, history.length)) return false;
  const offset = {
    water: amount(pairs[0][0].water) - pairs[0][1].water,
    filters: amount(pairs[0][0].filters) - pairs[0][1].filters,
  };
  const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a));
  if (!pairs.every(([saved, kept]) => close(amount(saved.water), kept.water + offset.water)
    && close(amount(saved.filters), kept.filters + offset.filters))) return false;
  const floor = amount(sim.tick) - MEMORY_KEEP_TICKS;
  const current = new Map((RESERVE_MEMORY.get(sim) ?? []).map((entry) => [entry.tick, entry]));
  const oldest = history[0].tick;
  const older = usable.filter((entry) => entry.tick < oldest && entry.tick >= floor).map((entry) => ({
    tick: entry.tick,
    water: entry.water + offset.water,
    filters: entry.filters + offset.filters,
    produced: finiteOrNull(entry.produced),
    loose: finiteOrNull(entry.loose),
    airFilters: finiteOrNull(entry.airFilters),
  }));
  const recent = history.map((entry) => {
    const kept = byTick.get(entry.tick);
    const seen = current.get(entry.tick);
    return {
      tick: entry.tick,
      water: amount(entry.water),
      filters: amount(entry.filters),
      produced: finiteOrNull(kept?.produced) ?? finiteOrNull(seen?.produced),
      loose: finiteOrNull(kept?.loose) ?? finiteOrNull(seen?.loose),
      airFilters: finiteOrNull(kept?.airFilters) ?? finiteOrNull(seen?.airFilters),
    };
  });
  RESERVE_MEMORY.set(sim, [...older, ...recent]);
  return true;
}

// Valeur d'une série de relevés { tick, value } à `tick`, interpolée entre deux
// relevés ; null avant le premier. `end` borne la série.
function valueAt(points, tick, end = points.length - 1) {
  if (end < 0 || tick < points[0].tick) return null;
  for (let index = end; index >= 0; index -= 1) {
    const point = points[index];
    if (point.tick > tick) continue;
    const next = index < end ? points[index + 1] : null;
    if (!next || next.tick === point.tick) return point.value;
    return point.value + (next.value - point.value) * (tick - point.tick) / (next.tick - point.tick);
  }
  return null;
}

// Variation par jour de la série sur `windowTicks` jusqu'au relevé `end`.
function changePerDay(points, end, windowTicks) {
  const past = valueAt(points, points[end].tick - windowTicks, end);
  return past === null ? null : (points[end].value - past) * TIME.TICKS_PER_DAY / windowTicks;
}

// La réserve d'eau propre telle que la tendance la lit : les relevés et le
// moment présent, l'eau en vrac comptée avec la réserve (un éboulement la met en
// vrac, les porteurs la rapportent : ni l'un ni l'autre n'est un rythme), et
// les sauts d'une heure que ni la boisson, ni les cultures, ni les stations ne
// peuvent faire retirés comme des arrivées ponctuelles. L'heure du saut garde
// la variation ordinaire d'une heure (la médiane des heures).
function waterSeries(memory, sim, sample, bounds) {
  const points = memory.map((entry) => ({ tick: entry.tick, water: entry.water, loose: entry.loose }));
  const now = amount(sim.tick);
  const current = sim.reserves?.water?.amount;
  if (Number.isFinite(current) && (points.length === 0 || points[points.length - 1].tick < now)) {
    points.push({ tick: now, water: current, loose: sample.loose });
  }
  // Eau en vrac inconnue (relevé vu tard) : celle du relevé suivant.
  let loose = sample.loose;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(points[index].loose)) loose = points[index].loose;
    else points[index].loose = loose;
  }
  const series = points.map((point) => ({ tick: point.tick, value: point.water + point.loose }));
  const hourly = [];
  for (let index = 1; index < series.length; index += 1) {
    const hours = (series[index].tick - series[index - 1].tick) / TIME.TICKS_PER_HOUR;
    if (hours >= 0.5) hourly.push((series[index].value - series[index - 1].value) / hours);
  }
  const usual = median(hourly);
  let offset = 0;
  for (let index = series.length - 1; index >= 1; index -= 1) {
    const hours = (series[index].tick - series[index - 1].tick) / TIME.TICKS_PER_HOUR;
    const delta = points[index].water + points[index].loose - points[index - 1].water - points[index - 1].loose;
    if (delta < -bounds.loss * Math.max(1, hours) || delta > bounds.gain * Math.max(1, hours)) offset += delta - usual * hours;
    series[index - 1].value += offset;
  }
  return series;
}

// Le solde mesuré de l'eau propre. Sur 48 h quand la mémoire les couvre : un
// cycle entier de boisson. Avec seulement 24 h (deuxième jour de partie, partie
// rechargée sans mémoire), chaque fenêtre de 24 h voit une ou deux tournées : le
// solde provisoire est le milieu entre le plus fort et le plus faible solde sur
// 24 h mesurés depuis, soit une tournée et demie par jour, comme en moyenne,
// au lieu de sauter de l'un à l'autre d'une heure à l'autre.
function waterTrend(series) {
  if (series.length < 2) return null;
  const end = series.length - 1;
  const span = series[end].tick - series[0].tick;
  const spanHours = span / TIME.TICKS_PER_HOUR;
  if (span >= WATER_TREND_TICKS) return { net: changePerDay(series, end, WATER_TREND_TICKS), hours: 48, provisional: false, spanHours };
  if (span < TIME.TICKS_PER_DAY) return null;
  const changes = [];
  for (let index = 0; index <= end; index += 1) {
    if (series[index].tick - series[0].tick < TIME.TICKS_PER_DAY) continue;
    const change = changePerDay(series, index, TIME.TICKS_PER_DAY);
    if (change !== null) changes.push(change);
  }
  if (changes.length === 0) return null;
  return { net: (Math.min(...changes) + Math.max(...changes)) / 2, hours: 24, provisional: true, spanHours };
}

// L'eau propre que la filtration a vraiment produite par jour, lue dans les
// compteurs des stations sur la fenêtre du solde (48 h, ou 24 h pour un solde
// provisoire). null si les compteurs ne couvrent pas toute cette fenêtre (de
// 24 à 48 h après un chargement sans mémoire, le solde est déjà sur 48 h et les
// compteurs n'ont que les heures depuis le chargement), ou si une station a
// disparu.
function measuredFiltration(memory, sim, sample, windowTicks) {
  const points = memory.filter((entry) => Number.isFinite(entry.produced))
    .map((entry) => ({ tick: entry.tick, value: entry.produced }));
  const now = amount(sim.tick);
  if (points.length === 0 || points[points.length - 1].tick < now) points.push({ tick: now, value: sample.produced });
  if (now - points[0].tick < windowTicks) return null;
  const change = changePerDay(points, points.length - 1, windowTicks);
  return change === null || change < 0 ? null : change;
}

// Les tempêtes de poussière que la partie connaît, [début, fin[ : celle en
// cours et celles que le journal a notées (la sauvegarde garde les deux, le
// journal jusqu'à 400 lignes).
function dustStorms(sim) {
  const storms = new Map();
  const add = (start, end) => { if (Number.isFinite(start) && Number.isFinite(end)) storms.set(start, end); };
  for (const entry of sim.journal ?? []) {
    // Début (météo) ou fin (toute tempête, celles du conteur comprises, qui
    // n'écrivent que eventStoryStart au début).
    if ((entry?.code === 'eventWeatherStart' || entry?.code === 'eventWeatherEnd') && entry.params?.weather === 'dustStorm') {
      add(entry.params.startTick, entry.params.endTick);
    }
  }
  const active = sim.weather?.activeEvent;
  if (active?.type === 'dustStorm') add(active.startTick, active.endTick);
  return [...storms];
}

// Les filtres usés par jour par les filtres à air sur les `windowTicks`
// dernières ticks, comme air.js les use : le nombre en marche noté à chaque
// relevé, WEATHER.DUST_FILTER_FACTOR fois plus vite pendant une tempête de
// poussière. Avant le premier relevé noté (partie rechargée sans mémoire), le
// nombre de ce relevé, moins ceux que le journal dit aménagés depuis : la
// sauvegarde n'en dit pas plus. Une tempête ou un filtre à air neuf dans la
// fenêtre ne fait donc ni tomber à zéro ni monter au plafond la filtration lue
// dans l'usure des filtres. Un filtre à air éteint, rallumé, privé de courant
// ou effondré avant le chargement, lui, n'est pas connu : le bilan de l'eau
// borne alors la lecture (waterChainModel ; voir le rapport, limites).
function airFilterWearPerDay(memory, sim, sample, windowTicks) {
  const now = amount(sim.tick);
  const start0 = now - windowTicks;
  const known = memory.filter((entry) => Number.isFinite(entry.airFilters) && entry.tick < now)
    .map((entry) => ({ tick: entry.tick, count: entry.airFilters }));
  known.push({ tick: now, count: sample.airFilters });
  const first = known[0];
  const running = new Set((sim.excavations ?? []).filter(runningAirFilter).map((excavation) => excavation.id));
  const fits = (sim.journal ?? []).filter((entry) => entry?.code === 'eventFitted' && entry.params?.roomType === 'airFilter'
    && running.has(entry.params.id) && entry.tick > start0 && entry.tick < first.tick).map((entry) => entry.tick).sort((a, b) => a - b);
  // Jusqu'à l'aménagement n° i, il manquait celui-là et ceux d'après.
  const counts = [...fits.map((tick, index) => ({ tick, count: Math.max(0, first.count - (fits.length - index)) })), ...known];
  const storms = dustStorms(sim);
  let start = start0;
  let wear = 0;
  for (const { tick, count } of counts) {
    if (tick <= start) continue;
    let stormTicks = 0;
    for (const [from, to] of storms) stormTicks += Math.max(0, Math.min(to, tick) - Math.max(from, start));
    wear += count * (tick - start + (WEATHER.DUST_FILTER_FACTOR - 1) * stormTicks);
    start = tick;
  }
  return wear * AIR.FILTERS_PER_DAY / windowTicks;
}

/**
 * Jours avant la fin de l'eau propre : la réserve varie de `net` par jour tant
 * qu'il reste des filtres, puis perd en plus la production de la filtration
 * quand ils sont épuisés (`filterDays`, null s'ils ne s'épuisent pas). null si
 * aucune rupture n'est prévue.
 */
export function cleanWaterDepletionDays(stock, net, filterDays, filtration) {
  if (!(stock > 0)) return 0;
  if (net < -ALERTS.STOCK_EPSILON && (filterDays === null || stock / -net <= filterDays)) return stock / -net;
  if (filterDays === null) return null;
  const left = stock + net * filterDays;
  const after = net - filtration;
  if (after >= -ALERTS.STOCK_EPSILON) return null;
  return filterDays + Math.max(0, left) / -after;
}

// Pourquoi aucune filtration ne produit : seulement les arrêts qui durent, la
// cause d'abord (sans filtre, l'ouvrier ne vient plus : c'est le filtre qui
// manque). Une station qui attend une livraison d'eau sale ou de filtres alors
// qu'il en reste dans l'abri n'est pas arrêtée.
function filtrationStop(stations, dirtyWater, filters) {
  const plants = stations.filter((station) => station.roomType === 'filterPlant' && station.status !== 'inactive');
  if (plants.length === 0 || plants.some((station) => station.active)) return null;
  const physical = plants.find((station) => ['broken', 'disabled', 'flooded', 'noPower'].includes(station.status));
  if (physical) return physical.status;
  if (filters <= ALERTS.STOCK_EPSILON) return 'noFilters';
  if (dirtyWater <= ALERTS.STOCK_EPSILON) return 'noDirtyWater';
  return plants.some((station) => station.status === 'noWorkers') ? 'noWorkers' : null;
}

export function waterChainModel(sim) {
  const totals = resourceTotals(sim);
  const living = (sim.colonists ?? []).filter((colonist) => (colonist.health ?? 100) > 0 && !colonist.dead).length;
  const drinkingWater = amount(totals.waterClean);
  const drinkingPerDay = (sim.colonists ?? []).filter((colonist) => (colonist.health ?? 100) > 0 && !colonist.dead)
    .reduce((sum, colonist) => sum + consumptionFactor(colonist) * WATER.CLEAN_WATER_PER_DRINK, 0);
  const stations = (sim.excavations ?? [])
    .filter((excavation) => WATER_STATION_TYPES.has(excavation.roomType))
    .map((excavation) => stationModel(sim, excavation));
  const cleanProductionPerDay = stations.reduce((sum, station) => sum + station.cleanProductionPerDay, 0);
  const filtrationPerDay = stations.reduce((sum, station) => sum + station.filtrationPerDay, 0);
  const netBalancePerDay = cleanProductionPerDay - drinkingPerDay;
  const filtersRemaining = amount(totals.filters);
  const filterUnitsPerFilter = WATER.FILTER_UNITS_PER_FILTER * researchEffect(sim, 'filterFactor', 1);
  const wells = (sim.excavations ?? [])
    .filter((excavation) => excavation.roomType === 'well')
    .map((excavation) => ({ id: excavation.id, ...wellOutlook(sim, excavation) }));

  // Ce que le joueur doit lire : la réserve d'eau propre au rythme réel. Boisson,
  // cultures, équipes en surface et production se lisent ensemble dans la
  // variation de la réserve, sur deux jours quand la mémoire de lecture les
  // couvre, sinon provisoirement sur 24 h (waterTrend). La filtration comprise
  // dans ce solde se lit dans les compteurs des stations sur la même fenêtre ;
  // s'ils ne la couvrent pas, dans l'usure des filtres sur cette fenêtre, moins
  // celle des filtres à air (airFilterWearPerDay), bornée par le bilan de l'eau
  // propre. Les jours de filtres
  // suivent l'usure des dernières 24 h, comme l'alerte de filtres. Avant une
  // journée d'historique (début de partie), on retombe sur l'estimation des
  // stations et des besoins.
  const cropsPerDay = cropWaterPerDay(sim);
  const sample = readingSample(sim);
  const remembered = rememberedHistory(sim, sample);
  const trend = waterTrend(waterSeries(remembered, sim, sample, hourlyFlowBounds(sim, stations)));
  const measuredNet = trend?.net ?? null;
  const measuredFilters = trailingDayChange(sim, 'filters');
  const windowFilters = trend?.hours === 48 ? trailingChange(remembered, sim, 'filters', WATER_TREND_TICKS) : measuredFilters;
  const measured = measuredNet !== null && measuredFilters !== null && windowFilters !== null;
  const airFilterUsePerDay = (sim.excavations ?? []).filter(runningAirFilter).length
    * AIR.FILTERS_PER_DAY * amount(sim.weather?.filterMultiplier ?? 1);
  const plants = stations.filter((station) => station.roomType === 'filterPlant');
  const workFactor = lawMultiplier(sim, 'workFactor', 1);
  const filtrationCapacity = plants.filter((station) => station.status !== 'inactive')
    .reduce((sum, station) => sum + station.capacityPerDay * workFactor, 0);
  const otherCleanPerDay = cleanProductionPerDay - filtrationPerDay;
  const stock = measured ? amount(sim.reserves.water.amount) : drinkingWater;
  // Les filtres des réserves et ceux qu'un habitant porte vers la station,
  // comptés comme l'alerte (reserves.js) mais relus à chaque appel.
  const filtersAvailable = filtersRemaining + (sim.colonists ?? []).reduce((sum, colonist) => sum
    + (colonist.health > 0 && colonist.carrying?.resource === 'filters' && Number.isFinite(colonist.carrying.amount) ? colonist.carrying.amount : 0), 0);
  let net;
  let filterUsePerDay;
  let filtrationRealPerDay;
  let filtrationSource = 'model';
  if (measured) {
    filterUsePerDay = Math.max(0, -measuredFilters);
    const windowTicks = trend.hours === 48 ? WATER_TREND_TICKS : TIME.TICKS_PER_DAY;
    const produced = measuredFiltration(remembered, sim, sample, windowTicks);
    filtrationSource = produced === null ? 'filters' : 'production';
    if (produced !== null) filtrationRealPerDay = produced;
    else {
      // L'usure des filtres, moins celle des filtres à air. Un filtre à air
      // éteint, rallumé ou privé de courant avant un chargement sans mémoire
      // n'est pas connu (la sauvegarde ne le dit pas) : cette lecture peut
      // tomber à 0 (« — », aucune fin de l'eau propre) ou monter au plafond de
      // la station. Elle reste donc dans le bilan de l'eau propre sur la même
      // fenêtre : le solde mesuré, plus ce que boivent habitants et cultures,
      // moins les autres sources d'eau propre. Le modèle compte une gorgée par
      // habitant et par jour, les habitants en boivent une et demie : avec lui,
      // un plancher ; avec deux fois lui, un plafond. Tant qu'une station tourne
      // (allumée, avec courant et ouvrier, pas inondée, des filtres dans
      // l'abri), jamais moins d'un dixième de sa capacité.
      const fromFilters = Math.max(0, -windowFilters - airFilterWearPerDay(remembered, sim, sample, windowTicks)) * filterUnitsPerFilter;
      const consumption = drinkingPerDay + cropsPerDay;
      const otherClean = stations.filter((station) => station.roomType !== 'filterPlant' && station.outputResource === 'waterClean'
        && !FILTRATION_HARD_STOPS.has(station.status)).reduce((sum, station) => sum + station.capacityPerDay * workFactor, 0);
      const running = filtersAvailable > ALERTS.STOCK_EPSILON ? plants.filter((station) => !FILTRATION_HARD_STOPS.has(station.status)) : [];
      const low = Math.max(0, measuredNet + consumption - otherClean,
        0.1 * running.reduce((sum, station) => sum + station.capacityPerDay * workFactor, 0));
      const high = Math.max(low, measuredNet + 2 * consumption);
      filtrationRealPerDay = Math.min(filtrationCapacity, Math.min(Math.max(fromFilters, low), high));
    }
    net = measuredNet;
  } else {
    filtrationRealPerDay = filtrationPerDay;
    filterUsePerDay = filtrationPerDay / filterUnitsPerFilter + airFilterUsePerDay;
    net = cleanProductionPerDay - drinkingPerDay - cropsPerDay;
  }
  const cleanProductionRealPerDay = measured ? filtrationRealPerDay + otherCleanPerDay : cleanProductionPerDay;
  let filterDays = filtersAvailable <= ALERTS.STOCK_EPSILON ? 0
    : filterUsePerDay > ALERTS.STOCK_EPSILON ? filtersAvailable / filterUsePerDay : null;
  // Toutes les filtrations à l'arrêt (courant, ouvrier, station arrêtée ou
  // inondée) ou plus aucun filtre : la production comprise dans le solde mesuré
  // est perdue dès maintenant, sans attendre que la fenêtre l'oublie.
  const plantsStopped = plants.length > 0 && plants.every((station) => FILTRATION_HARD_STOPS.has(station.status));
  const filtrationStopTick = plantsStopped && filtrationRealPerDay > 0 ? amount(sim.tick)
    : filterDays === null || filtrationRealPerDay <= 0 ? null
      : Math.ceil(amount(sim.tick) + filterDays * TIME.TICKS_PER_DAY);
  const cutoffDays = plantsStopped ? 0 : filterDays;
  const anyConsumption = drinkingPerDay > 0 || cropsPerDay > 0 || net < 0;
  const cleanReserveDays = anyConsumption
    ? cleanWaterDepletionDays(stock, net, cutoffDays, filtrationRealPerDay) : null;
  return {
    tick: amount(sim.tick),
    drinkingWater,
    drinkingPerDay,
    drinkingReserveDaysGross: drinkingPerDay > 0 ? drinkingWater / drinkingPerDay : null,
    cleanProductionPerDay,
    netBalancePerDay,
    depletionTickFromNetBalance: netBalancePerDay < 0
      ? Math.ceil(amount(sim.tick) + drinkingWater / -netBalancePerDay * TIME.TICKS_PER_DAY) : null,
    pendingWater: {
      dirty: amount(totals.waterDirty),
      radioactive: amount(totals.waterRadioactive),
      grey: amount(totals.waterGrey),
    },
    filtersRemaining,
    filterUnitsPerFilter,
    filtrationPerDay,
    filtrationDaysAtCurrentRate: filtrationPerDay > 0
      ? filtersRemaining * filterUnitsPerFilter / filtrationPerDay : null,
    stations,
    wells,
    // Au rythme réel : mesuré (eau sur 48 h ou 24 h, filtres sur 24 h) quand `measured`, sinon estimé.
    measured,
    measuredHours: !measured ? null : trend.hours,
    // Moins de 48 h de relevés (deuxième jour, partie rechargée sans mémoire) : provisoire.
    provisional: measured && trend.provisional,
    measuredSpanHours: measured ? trend.spanHours : null,
    filtrationSource,
    // Les filtres de l'abri, ceux qu'on porte compris (comme l'alerte de filtres).
    filtersHeld: filtersAvailable,
    cropWaterPerDay: cropsPerDay,
    cleanConsumptionPerDay: measured ? Math.max(0, cleanProductionRealPerDay - net) : drinkingPerDay + cropsPerDay,
    cleanProductionRealPerDay,
    cleanNetPerDay: net,
    filterUsePerDay,
    filterDaysAtRealRate: filterDays,
    filtersEndTick: filterDays === null ? null : Math.ceil(amount(sim.tick) + filterDays * TIME.TICKS_PER_DAY),
    filtrationRealPerDay,
    filtrationStopTick,
    filtrationStop: filtrationStop(stations, amount(totals.waterDirty), filtersAvailable),
    cleanReserveDays,
    cleanDepletionTick: cleanReserveDays === null ? null
      : Math.ceil(amount(sim.tick) + cleanReserveDays * TIME.TICKS_PER_DAY),
  };
}

export function previewTouchesSand(world, order) {
  for (const point of previewExcavationCells(world, order)) {
    for (const [x, y] of [[point.x, point.y], [point.x - 1, point.y], [point.x + 1, point.y],
      [point.x, point.y - 1], [point.x, point.y + 1]]) {
      if (world.inBounds(x, y) && world.material(x, y) === MATERIAL.SAND) return true;
    }
  }
  return false;
}

export function waterPreviewHint(world, order) {
  return previewAquiferContact(world, order).length ? 'm6bAquiferPossible' : null;
}

function previewExcavationCells(world, order) {
  if (!world || !order) return [];
  const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((key) => Math.floor(Number(order[key])));
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return [];
  // Use the same geometry as actual excavation, including any future shape rules.
  return excavationCells({ ...order, x, y, w, h }).filter((point) => world.inBounds(point.x, point.y));
}

function previewAquiferContact(world, order, depth, cells = previewExcavationCells(world, order)) {
  const contacts = [];
  if (!world) return contacts;
  const removed = new Set(cells.map(({ x, y }) => world.index(x, y)));
  const visited = new Set();
  for (const point of cells) {
    for (const [x, y] of [[point.x - 1, point.y], [point.x + 1, point.y],
      [point.x, point.y - 1], [point.x, point.y + 1]]) {
      if (!world.inBounds(x, y)) continue;
      const index = world.index(x, y);
      // Only surviving, orthogonally adjacent rock can feed the future well.
      if (removed.has(index) || visited.has(index)) continue;
      visited.add(index);
      if (aquiferContact(world, x, y, depth)) contacts.push({ x, y, material: world.material(x, y) });
    }
  }
  return contacts;
}

function previewClayProtection(world, cells) {
  const removed = new Set(cells.map(({ x, y }) => world.index(x, y)));
  const columns = new Map();
  // This projection is local to the preview. It never mutates terrain or sim caches.
  return (x, y) => {
    if (!columns.has(x)) {
      let run = 0;
      let shieldBottom = Infinity;
      for (let yy = WORLD.SURFACE_Y; yy < world.height; yy += 1) {
        run = !removed.has(world.index(x, yy)) && world.isSolid(x, yy)
          && world.material(x, yy) === MATERIAL.CLAY ? run + 1 : 0;
        if (run >= WATER.CLAY_SHIELD_METERS) { shieldBottom = yy; break; }
      }
      columns.set(x, shieldBottom);
    }
    return y > columns.get(x);
  };
}

/**
 * Ce que l'aperçu dit d'une nappe touchée : un puits creusé à 22 m au jour 104
 * devenait radioactif six jours plus tard, sans que rien ne l'ait annoncé.
 * Lecture seule : { key, params } ou null.
 */
export function aquiferPreviewHint(sim, order) {
  if (!sim?.world) return null;
  const cells = previewExcavationCells(sim.world, order);
  const contacts = previewAquiferContact(sim.world, order, currentWaterTableDepth(sim), cells);
  const protectedAfterDigging = previewClayProtection(sim.world, cells);
  const params = { depth: WATER.CONTAMINATED_DEPTH };
  if (!contacts.length) return null;
  const exposed = contacts.filter(({ x, y, material }) => material !== MATERIAL.SANDSTONE
    && !protectedAfterDigging(x, y) && y - WORLD.SURFACE_Y < WATER.CONTAMINATED_DEPTH);
  // The projected clay cover was checked above; ignore the cover that digging removes.
  if (exposed.some(({ y }) => shallowWaterContaminated(sim, y))) {
    return { key: 'm6bAquiferRadioactive', params };
  }
  if (exposed.length && sim.tick < HEAT.NUCLEAR_WINTER_DAYS * TIME.TICKS_PER_DAY) {
    const depth = Math.min(...exposed.map(({ y }) => y - WORLD.SURFACE_Y));
    const tick = Math.ceil(depth / WATER.FALLOUT_DESCENT_PER_DAY * TIME.TICKS_PER_DAY);
    if (tick > sim.tick && tick < HEAT.NUCLEAR_WINTER_DAYS * TIME.TICKS_PER_DAY) {
      return { key: 'm6bAquiferSoon', params: { ...params, days: Math.max(1, Math.round((tick - sim.tick) / TIME.TICKS_PER_DAY)) } };
    }
  }
  if (contacts.every(({ material }) => material === MATERIAL.SANDSTONE)) return { key: 'm6bAquiferSandstone', params };
  if (contacts.every(({ y }) => y - WORLD.SURFACE_Y >= WATER.CONTAMINATED_DEPTH)) return { key: 'm6bAquiferDeep', params };
  if (contacts.every(({ x, y, material }) => material === MATERIAL.SANDSTONE || protectedAfterDigging(x, y))) {
    return { key: 'm6bAquiferProtected', params };
  }
  return { key: 'm6bAquiferPossible', params };
}

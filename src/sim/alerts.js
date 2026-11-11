import { AIR, ALERTS, HEAT, NEEDS, TIME, WATER, WORK, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { surfaceTemperature } from './climate.js';
import { activeExcavation, excavationAt, rockTemperatureAt } from './networks.js';
import { coldDamagePerHour, colonistFeltTemperature } from './heat.js';
import { rebuildNav } from './nav.js';
import { headSubmerged } from './immersion.js';
import { airDays } from './reserves.js';
import { roomStock, stockReachable, stocksConnected } from './resources.js';
import { trappedSurvivors } from './collapseRescue.js';
import { consumptionFactor } from './people.js';
import { usableOssuary } from './lifecycle.js';
import { siteFrostOutlook } from './expeditions.js';
import { PEOPLE } from '../data/people.js';
import { tr } from '../data/strings.fr.js';

const ROOM_CATEGORIES = ['air', 'cold', 'heat', 'flood'];
const THERMAL_CATEGORIES = ['cold', 'heat'];
const LEVEL_RANK = { null: 0, warning: 1, danger: 2 };
const TREND_KEYS = {
  temperature: ['temperatureTrendTick', 'temperatureTrendValue', 'temperaturePerDay', 'temperatureInstantPerDay'],
  flood: ['floodTrendTick', 'floodTrendValue', 'floodPerDay', 'floodInstantPerDay'],
};
const ONE_TICK_TREND_WEIGHT = 1 - Math.exp(-1 / ALERTS.TREND_RESPONSE_TICKS);
const ROOM_ALERT_FIELDS = Object.fromEntries(ROOM_CATEGORIES.map((category) => [category, category + 'AlertLevel']));
const ALERT_CODES = Object.fromEntries([...ROOM_CATEGORIES, 'water', 'food', 'fuel', 'filters'].map((category) => {
  const suffix = category[0].toUpperCase() + category.slice(1);
  return [category, { danger: 'alert' + suffix + 'Red', warning: 'alert' + suffix + 'Yellow' }];
}));
const STOCK_INPUTS = [
  ['water', 'thirst', NEEDS.THIRST_PER_DAY],
  ['food', 'hunger', WORK.HUNGER_PER_DAY],
];
const EMPTY_RESERVE = { amount: 0, days: null };
const floodGeometryCache = new WeakMap();

// Geometry is derived only when terrain/shafts change. Water stays dynamic:
// even an almost empty tall shaft can contain a submerged ladder at its foot.
function floodGeometry(sim, excavation) {
  const world = sim.world;
  const nav = rebuildNav(sim);
  let cached = floodGeometryCache.get(excavation);
  if (cached?.world === world && cached.revision === world.revision
    && cached.cells === excavation.dugCells && cached.length === excavation.dugCells.length
    && cached.shafts === nav.shafts) return cached;
  const heads = new Set();
  const feet = [];
  let lowestFoot = -Infinity;
  for (const index of excavation.dugCells) {
    if (!nav.walkable[index] || world.cellExcavation[index] !== excavation.id) continue;
    const y = Math.floor(index / world.width);
    const head = index - WATER.HEAD_CELL_OFFSET * world.width;
    if (y < WATER.HEAD_CELL_OFFSET || world.cellExcavation[head] !== excavation.id) continue;
    lowestFoot = Math.max(lowestFoot, y);
    heads.add(head);
    feet.push(index);
  }
  const headY = lowestFoot - WATER.HEAD_CELL_OFFSET;
  let capacityAtHead = 0;
  for (const index of excavation.dugCells) {
    const y = Math.floor(index / world.width);
    if (y > headY) capacityAtHead += 1;
    else if (y === headY) capacityAtHead += WATER.DROWNING_RATIO;
  }
  cached = { world, revision: world.revision, cells: excavation.dugCells,
    length: excavation.dugCells.length, shafts: nav.shafts, heads: [...heads],
    // At this threshold only the lowest walkable positions have their head
    // submerged. Upper landings in a shaft are not in the forecast's zone.
    forecastFeet: new Set(feet.filter((index) => Math.floor(index / world.width) - WATER.HEAD_CELL_OFFSET >= headY)),
    threshold: heads.size ? capacityAtHead / excavation.dugCells.length : Infinity };
  floodGeometryCache.set(excavation, cached);
  return cached;
}

function activeWaterPocket(sim, excavation) {
  return sim.m5?.hazards?.waterPockets?.find((pocket) => pocket.excavationId === excavation.id
    && (pocket.state === 'seeping' || pocket.state === 'breached')
    && sim.m5.hazards.alertLevels?.[`water:${excavation.id}`] != null) ?? null;
}

function floodRoomAt(sim, colonist) {
  const x = Math.round(colonist.x);
  const y = Math.round(colonist.y);
  return excavationAt(sim, x, y - WATER.HEAD_CELL_OFFSET);
}

// Only current positions and the untravelled part of an assigned route count.
// A job somewhere in a tall shaft does not imply a visit to its flooded foot.
function floodTraffic(sim) {
  const traffic = new Map();
  const useFor = (roomId) => {
    let use = traffic.get(roomId);
    if (!use) traffic.set(roomId, use = { feet: new Set(), immersedHeads: new Set() });
    return use;
  };
  const visit = (point) => {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (sim.world.inBounds(x, y)) {
      const foot = sim.world.index(x, y);
      const footRoomId = sim.world.cellExcavation[foot];
      if (footRoomId >= 0) useFor(footRoomId).feet.add(foot);
    }
    const headY = y - WATER.HEAD_CELL_OFFSET;
    if (!sim.world.inBounds(x, headY)) return;
    const head = sim.world.index(x, headY);
    const roomId = sim.world.cellExcavation[head];
    if (roomId < 0 || sim.world.water[head] < WATER.MAX_PER_CELL * WATER.DROWNING_RATIO) return;
    useFor(roomId).immersedHeads.add(head);
  };
  for (const person of sim.colonists) {
    if (person.health <= 0 || person.dead || person.surfaceCrewId) continue;
    visit(person);
    if (person.trappedIn != null || person.carriedBy != null) continue;
    for (let i = person.pathIndex ?? 0; i < (person.path?.length ?? 0); i += 1) visit(person.path[i]);
  }
  return traffic;
}

// The zone's own flood warning: a room yellow, a detected water pocket, or the
// person's outside exposure. Decision 1: only a warning at least a full day
// old counts as notice — a yellow born minutes before the immersion has left
// nobody any time to react, so the immersion stays sudden. A yellow raised by
// the episode itself is young by construction and never counts either.
function floodZoneWarned(sim, excavation, colonist) {
  if (excavation) {
    if (Number.isFinite(excavation.floodWarningSince)
      && sim.tick - excavation.floodWarningSince >= WATER.WARNING_LEAD_TICKS) return true;
    const pocket = activeWaterPocket(sim, excavation);
    return Boolean(pocket && sim.tick - pocket.startedTick >= WATER.WARNING_LEAD_TICKS);
  }
  return Number.isFinite(colonist.floodExposure?.warningSince)
    && sim.tick - colonist.floodExposure.warningSince >= WATER.WARNING_LEAD_TICKS;
}

// Décision de Demi-Vie : une tête qui passe sous l'eau alors que sa zone n'a pas
// eu de jaune d'inondation depuis au moins un jour est une immersion soudaine.
// L'épisode ne s'ouvre qu'après trois ticks consécutifs sous l'eau (point 3 du
// premier brief : les transitoires de jonction ne sont pas des noyades) : le
// rouge et le retour à x1 partent au troisième tick, sans la confirmation de
// 12 ticks des rouges de pièce. La débattue et la durée totale se comptent
// depuis le PREMIER tick d'immersion. Sortir de l'eau arrête les dégâts mais
// ne referme pas l'épisode : il faut une heure complète au sec, et une nouvelle
// immersion avant ce délai reprend la même chronologie, sans nouvelle grâce ni
// nouveau rouge.
export function updateSuddenImmersion(sim, colonist, submerged) {
  if (colonist.suddenImmersion) {
    if (!submerged) {
      const episode = colonist.suddenImmersion;
      episode.drySince ??= sim.tick;
      if (sim.tick - episode.drySince + 1 < WATER.SUDDEN_IMMERSION_DRY_TICKS) return false;
      delete colonist.suddenImmersion;
      delete colonist.suddenImmersionStreak;
      // A closed episode must not leave behind an exposure that would count
      // as notice for the next immersion: any warning it carried was younger
      // than the required day when it opened.
      delete colonist.floodExposure;
      return false;
    }
    colonist.suddenImmersion.drySince = null;
    sim.emergency = true;
    return sim.tick - colonist.suddenImmersion.since >= WATER.SUDDEN_IMMERSION_GRACE_TICKS;
  }
  if (!submerged) {
    delete colonist.suddenImmersionStreak;
    return false;
  }
  const room = floodRoomAt(sim, colonist);
  // In an announced zone the ordinary flood chronology applies. The count only
  // runs under an unannounced zone, so crossing from one into the other starts
  // a fresh confirmation and a full struggle window after the red.
  if (floodZoneWarned(sim, room, colonist)) {
    delete colonist.suddenImmersionStreak;
    return false;
  }
  const streak = colonist.suddenImmersionStreak ??= sim.tick;
  if (sim.tick - streak + 1 < WATER.SUDDEN_IMMERSION_CONFIRM_TICKS) return false;
  delete colonist.suddenImmersionStreak;
  colonist.suddenImmersion = { since: streak, roomId: room?.id ?? null, drySince: null };
  delete colonist.firstSuddenDamageTick;
  sim.log('danger', 'alertSuddenImmersionRed', {
    id: room?.id ?? null, excavationId: room?.id ?? null, colonistId: colonist.id, name: colonist.name,
  }, colonist);
  sim.emergency = true;
  return sim.tick - streak >= WATER.SUDDEN_IMMERSION_GRACE_TICKS;
}

// Outside excavations the flood warning follows the person. Its chronology is
// unchanged and alone gates timed damage (immersedLevel, redSince): yellow on
// the first tick under water, red from the next one, damage once that red is a
// tick old and the yellow a full day old. What is shown (level) holds like a
// room's flood level: it only clears after a full dry hour. Before, a walk
// through a drowned passage with the head going under every few minutes made
// the person's alert blink red and yellow and sent the game back to x1 at each
// dip. Now the red rises once, with one return to x1, and a return of the head
// under water within the hour is the same episode. A head kept under for the
// sudden immersion's confirmation while that red was already shown is a real
// new drowning and forces x1 again, as a confirmed entry does in a room.
// Only updateAlerts advances this chronology, once per tick, from where people
// stand at the end of the step. The colonist update reads it (floodDamageReady)
// before anybody moves, at the very position the previous alerts already
// counted: advancing it there as well made one tick in a drowned pit count as
// two, and a person stepping through one got a red and a return to x1.
function upgradeOutsideFloodExposure(exposure) {
  if (exposure && exposure.immersedLevel === undefined) {
    // Saves from before the hold: the shown level was the chronology itself.
    exposure.immersedLevel = exposure.level ?? null;
    exposure.immersedSince = exposure.level === 'danger' ? exposure.redSince
      : exposure.level === 'warning' ? exposure.warningSince : null;
    exposure.shownRedSince = exposure.level === 'danger' ? exposure.redSince : null;
  }
  return exposure;
}

function updateOutsideFloodExposure(sim, colonist, immersed) {
  let exposure = upgradeOutsideFloodExposure(colonist.floodExposure);
  // A sudden immersion already raised this person's own red: keep the outside
  // bookkeeping at danger without replaying a second warning sequence.
  if (immersed && colonist.suddenImmersion) {
    if (!exposure) {
      exposure = colonist.floodExposure = {
        warningSince: colonist.suddenImmersion.since, redSince: colonist.suddenImmersion.since,
        level: 'danger', immersedLevel: 'danger', immersedSince: colonist.suddenImmersion.since,
        shownRedSince: colonist.suddenImmersion.since, journalLevel: 'danger',
      };
    } else {
      exposure.drySince = null;
      exposure.immersedSince ??= sim.tick;
      if (exposure.level !== 'danger') exposure.shownRedSince = sim.tick;
      exposure.level = 'danger';
      exposure.immersedLevel = 'danger';
      exposure.redSince ??= colonist.suddenImmersion.since;
      exposure.journalLevel = 'danger';
    }
    soundPersonFloodRed(sim, exposure);
    return;
  }
  if (!immersed) {
    if (exposure) {
      exposure.immersedLevel = null;
      exposure.immersedSince = null;
      exposure.drySince ??= sim.tick;
      // The dead are no longer exposed; nothing is left to warn about them.
      if (sim.tick - exposure.drySince + 1 >= WATER.FLOOD_ALERT_CLEAR_TICKS
        || colonist.health <= 0 || colonist.dead) exposure.level = null;
      if (floodRedGoesQuiet(sim, exposure.alarmTick ?? exposure.shownRedSince, exposure.drySince)) exposure.quiet = true;
      if (sim.tick - exposure.drySince >= WATER.WARNING_LEAD_TICKS) delete colonist.floodExposure;
    }
    return;
  }
  if (!exposure) {
    exposure = colonist.floodExposure = {
      warningSince: sim.tick, redSince: null, level: null, immersedLevel: null, journalLevel: null,
    };
  }
  exposure.drySince = null;
  exposure.immersedSince ??= sim.tick;
  const level = sim.tick === exposure.warningSince ? 'warning' : 'danger';
  if (exposure.immersedLevel !== level) {
    exposure.immersedLevel = level;
    if (level === 'danger') exposure.redSince = sim.tick;
  }
  if (LEVEL_RANK[level] > LEVEL_RANK[exposure.level ?? null]) {
    exposure.level = level;
    if (level === 'danger') exposure.shownRedSince = sim.tick;
    if (LEVEL_RANK[level] > LEVEL_RANK[exposure.journalLevel]) {
      sim.log(level, ALERT_CODES.flood[level], { id: null, excavationId: null, colonistId: colonist.id }, colonist);
      exposure.journalLevel = level;
    }
    if (level === 'danger') soundPersonFloodRed(sim, exposure);
  } else if (level === 'danger' && exposure.shownRedSince < exposure.immersedSince
    && sim.tick - exposure.immersedSince + 1 === WATER.SUDDEN_IMMERSION_CONFIRM_TICKS) {
    soundPersonFloodRed(sim, exposure);
  }
}

function soundPersonFloodRed(sim, exposure) {
  exposure.alarmTick = sim.tick;
  exposure.quiet = false;
  sim.emergency = true;
}

// A flood red that holds through its dry hour is still shown, but it goes
// quiet once it has kept the banner for an hour since its last return to x1
// (time to read why the game slowed down) and nobody has been exposed for a
// confirmation window. A quiet red ranks below the reds of other dangers in
// the HUD banner, so it does not hide a person in danger right now. Like x1,
// it takes the banner back only with a new x1 (a confirmed drowning), not
// with each dip, or the banner would switch between two reds at every dip.
function floodRedGoesQuiet(sim, alarmTick, unexposedSince) {
  return Number.isFinite(unexposedSince) && sim.tick - unexposedSince + 1 >= WATER.FLOOD_RED_CONFIRM_TICKS
    && sim.tick - (alarmTick ?? -Infinity) >= WATER.FLOOD_ALERT_CLEAR_TICKS;
}

export function roomFloodRedHeld(excavation) {
  return excavation?.alertLevels?.flood === 'danger' && excavation.floodRedQuiet === true;
}

export function personFloodRedHeld(colonist) {
  return colonist?.floodExposure?.level === 'danger' && colonist.floodExposure.quiet === true;
}

// Outside excavations the thermal warning follows the person. Short trips back
// inside do not restart the response window; a full safe day ends the episode.
function updateOutsideThermalExposure(sim, colonist, category, exposed, temperature) {
  let exposure = colonist.thermalExposure?.[category];
  if (!exposed) {
    if (exposure) {
      exposure.level = null;
      exposure.safeSince ??= sim.tick;
      if (sim.tick - exposure.safeSince >= HEAT.WARNING_LEAD_TICKS) delete colonist.thermalExposure[category];
    }
    return;
  }
  if (!exposure) {
    colonist.thermalExposure ??= {};
    exposure = colonist.thermalExposure[category] = {
      warningSince: sim.tick, redSince: null, level: null, journalLevel: null,
    };
  }
  exposure.safeSince = null;
  const level = sim.tick === exposure.warningSince ? 'warning' : 'danger';
  // Structural reevaluation (including after load) rebuilds the emergency flag.
  // Persistent danger must restore it even when no new journal entry is needed.
  if (level === 'danger') sim.emergency = true;
  if (exposure.level === level) return;
  exposure.level = level;
  if (level === 'danger') exposure.redSince = sim.tick;
  if (LEVEL_RANK[level] > LEVEL_RANK[exposure.journalLevel]) {
    sim.log(level, ALERT_CODES[category][level], {
      id: colonist.name ?? colonist.id, excavationId: null, colonistId: colonist.id,
      temperature,
    }, colonist);
    exposure.journalLevel = level;
  }
}

// A warned pocket has its own valid yellow/red sequence, including in isolated
// hazard updates which do not run updateAlerts. Outside excavations the same
// response window belongs to the person and survives serialization with them.
export function floodDamageReady(sim, excavation, colonist = null) {
  // At a shaft junction the head may belong to the room above, or to an
  // unowned cave. Use the same exposure owner for warnings and damage.
  if (colonist) excavation = floodRoomAt(sim, colonist);
  // Sudden immersion: the immediate red already warned in this person's chain,
  // so damage follows the short struggle delay instead of the day-long lead.
  if (colonist?.suddenImmersion) {
    return sim.tick - colonist.suddenImmersion.since >= WATER.SUDDEN_IMMERSION_GRACE_TICKS;
  }
  if (!excavation) {
    // Read only: see updateOutsideFloodExposure. The result is the same as
    // when this call advanced the chronology, which only ever turned it red
    // at this tick (redSince === sim.tick, so no damage yet).
    if (!colonist || !headSubmerged(sim, colonist.x, colonist.y)) return false;
    const exposure = upgradeOutsideFloodExposure(colonist.floodExposure);
    return Number.isFinite(exposure?.warningSince)
      && sim.tick - exposure.warningSince >= WATER.WARNING_LEAD_TICKS
      && exposure.immersedLevel === 'danger' && exposure.redSince < sim.tick;
  }
  // A red held through its dry hour still warns, but it is not an exposure:
  // timed damage keeps following the red backed by one, from the tick it rose.
  // Rooms not yet seen by this rule (old saves, fixtures) use the shown red.
  const backedRedSince = excavation.floodBackedRedSince === undefined
    ? (excavation.floodAlertLevel === 'danger' ? excavation.alertChangeTicks?.flood ?? sim.tick : null)
    : excavation.floodBackedRedSince;
  if (Number.isFinite(excavation.floodWarningSince)
    && sim.tick - excavation.floodWarningSince >= WATER.WARNING_LEAD_TICKS
    && Number.isFinite(backedRedSince) && backedRedSince < sim.tick) return true;
  const pocket = activeWaterPocket(sim, excavation);
  return Boolean(pocket && sim.tick - pocket.startedTick >= WATER.WARNING_LEAD_TICKS
    && pocket.redTick < sim.tick && sim.m5.hazards.alertLevels[`water:${excavation.id}`] === 'danger');
}

function forecastLevel(days, danger = false, yellowDays = ALERTS.YELLOW_FORECAST_DAYS) {
  if (danger || (days !== null && days <= ALERTS.RED_FORECAST_DAYS)) return 'danger';
  if (days !== null && days <= yellowDays) return 'warning';
  return null;
}

function updateTrend(sim, excavation, key, value) {
  const [tickKey, valueKey, rateKey, instantKey] = TREND_KEYS[key];
  const elapsed = excavation[tickKey] == null ? 0 : Math.max(0, sim.tick - excavation[tickKey]);
  if (elapsed > 0) {
    const instant = (value - excavation[valueKey]) * TIME.TICKS_PER_DAY / elapsed;
    const weight = elapsed === 1 ? ONE_TICK_TREND_WEIGHT : 1 - Math.exp(-elapsed / ALERTS.TREND_RESPONSE_TICKS);
    const previous = excavation[rateKey] ?? instant;
    excavation[rateKey] = previous + (instant - previous) * weight;
    excavation[instantKey] = instant;
  } else {
    excavation[rateKey] ??= 0;
    excavation[instantKey] ??= 0;
  }
  excavation[tickKey] = sim.tick;
  excavation[valueKey] = value;
}

function setRoomAlert(sim, excavation, category, level, value, detail, immediateDowngrade = false) {
  const previous = excavation.alertLevels[category] ?? null;
  const lastChange = excavation.alertChangeTicks[category] ?? -Infinity;
  if (!immediateDowngrade && LEVEL_RANK[level] < LEVEL_RANK[previous]
    && sim.tick - lastChange < ALERTS.MIN_LEVEL_TICKS) level = previous;
  excavation.alertLevels[category] = level;
  excavation[ROOM_ALERT_FIELDS[category]] = level;
  if (level === previous) return;
  excavation.alertChangeTicks[category] = sim.tick;
  if (level === null) {
    excavation.alertResolvedTicks[category] = sim.tick;
    return;
  }
  const resolvedTick = excavation.alertResolvedTicks[category] ?? -Infinity;
  const journalLevel = excavation.alertJournalLevels[category] ?? null;
  const newEpisode = previous === null && sim.tick - resolvedTick >= ALERTS.RESOLVED_REEMIT_TICKS;
  const escalation = LEVEL_RANK[level] > LEVEL_RANK[previous] && LEVEL_RANK[level] > LEVEL_RANK[journalLevel];
  // Re-entering a flooded route is a fresh emergency even when its existing
  // journal entry is retained instead of repeated.
  if (category === 'flood' && level === 'danger') sim.emergency = true;
  if (!newEpisode && !escalation) return;
  let params;
  if (category === 'air') params = { id: excavation.id, o2: value, co2: detail };
  else if (category === 'flood') params = { id: excavation.id, ratio: value, cause: detail };
  else params = { id: excavation.id, temperature: value };
  sim.log(level, ALERT_CODES[category][level], params, excavation);
  excavation.alertJournalLevels[category] = level;
  if (level === 'danger') sim.emergency = true;
}

// A flood level, once shown, holds until its own clearing condition has lasted
// a full dry hour, like a sudden immersion episode. The red clears only after
// an hour in which nobody had a head under water here, nor a remaining route
// over the drowned floor; until then a return of that exposure is the same
// episode, with no new journal entry and no new forced return to x1. The
// yellow clears after an hour with nothing to announce, and never before the
// minimum every room alert keeps. Without this, people dipping in and out of a
// drowned shaft foot every few minutes made the room blink red and yellow and
// sent the game back to x1 each time, and a dig face filling cell after cell
// made the yellow come and go within minutes.
// Symmetrically, once a yellow has cleared, the same warning episode does not
// bring it back within the next hour: a yellow is never off for less than an
// hour between two of its own. A raw yellow that lasts past that hour is shown
// then; a red is never deferred, and neither is the yellow of a new episode.
function heldFloodLevel(sim, excavation, level, exposed) {
  const previous = excavation.alertLevels.flood ?? null;
  // A room from an older save: its last yellow ended when it resolved.
  const clearSince = excavation.floodClearSince ??= {
    danger: null, warning: previous === null ? excavation.alertResolvedTicks.flood ?? null : null,
  };
  if (exposed || level === 'danger') clearSince.danger = null;
  else clearSince.danger ??= sim.tick;
  if (level !== null) clearSince.warning = null;
  else clearSince.warning ??= sim.tick;
  const resolved = excavation.alertResolvedTicks.flood ?? -Infinity;
  if (previous === null && level === 'warning' && sim.tick - resolved < WATER.FLOOD_ALERT_CLEAR_TICKS
    && Number.isFinite(excavation.floodWarningSince) && excavation.floodWarningSince < resolved) return null;
  if (LEVEL_RANK[level] >= LEVEL_RANK[previous]) return level;
  const cleared = (key) => Number.isFinite(clearSince[key])
    && sim.tick - clearSince[key] + 1 >= WATER.FLOOD_ALERT_CLEAR_TICKS;
  if (previous === 'danger' && !cleared('danger')) return 'danger';
  const lastChange = excavation.alertChangeTicks.flood ?? -Infinity;
  if (level === null && (!cleared('warning') || sim.tick - lastChange < ALERTS.MIN_LEVEL_TICKS)) return 'warning';
  return level;
}

function setThermalRoomAlert(sim, excavation, category, level, temperature) {
  const warningKey = `${category}WarningSince`;
  const previous = excavation.alertLevels[category] ?? null;
  if (level !== null && !Number.isFinite(excavation[warningKey])) {
    const recorded = previous !== null ? sim.journal.findLast((entry) =>
      entry.code === ALERT_CODES[category].warning && entry.params?.id === excavation.id) : null;
    excavation[warningKey] = recorded?.tick ?? sim.tick;
    if (previous === null) level = 'warning';
    else if (!recorded) {
      // A pre-migration red state without a dated yellow cannot prove that
      // there was time to react. Start one visible warning sequence on load.
      excavation.alertLevels[category] = null;
      excavation.alertJournalLevels[category] = null;
      delete excavation.alertChangeTicks[category];
      level = 'warning';
    } else {
      excavation.alertChangeTicks[category] ??= sim.tick;
    }
  }
  setRoomAlert(sim, excavation, category, level, temperature);
  if (excavation[ROOM_ALERT_FIELDS[category]] === null
    && sim.tick - (excavation.alertResolvedTicks[category] ?? sim.tick) >= HEAT.WARNING_LEAD_TICKS) {
    excavation[warningKey] = null;
  }
}

function updateRoomAlerts(sim, excavation, traffic) {
  excavation.alertLevels ??= {};
  excavation.alertChangeTicks ??= {};
  excavation.alertResolvedTicks ??= {};
  excavation.alertJournalLevels ??= {};
  const o2 = excavation.o2 ?? AIR.INITIAL_O2;
  const co2 = excavation.co2 ?? AIR.INITIAL_CO2;
  const days = airDays(excavation);
  const actualAirDanger = o2 < AIR.DANGER_O2 || co2 > AIR.DANGER_CO2;
  const redAirZone = o2 < AIR.ALERT_RED_O2 || co2 > AIR.ALERT_RED_CO2;
  const yellowAirZone = o2 < AIR.ALERT_O2 || co2 > AIR.ALERT_CO2;
  let airLevel = null;
  if (actualAirDanger || (redAirZone && days !== null && days <= ALERTS.RED_FORECAST_DAYS)) airLevel = 'danger';
  else if (yellowAirZone && days !== null && days <= ALERTS.YELLOW_FORECAST_DAYS) airLevel = 'warning';
  const previousAirLevel = excavation.alertLevels?.air ?? null;
  if (((excavation.airCo2PerDay ?? 0) > 0 || (excavation.airO2PerDay ?? 0) < 0)
    && LEVEL_RANK[previousAirLevel] > LEVEL_RANK[airLevel]) airLevel = previousAirLevel;
  if (airLevel !== null && !Number.isFinite(excavation.airWarningSince)) {
    // Old saves may already contain an ongoing warning. Reuse its journal time
    // when available; otherwise grant the same response time as a new episode.
    const recorded = previousAirLevel !== null ? sim.journal.findLast((entry) =>
      entry.code === 'alertAirYellow' && entry.params?.id === excavation.id) : null;
    excavation.airWarningSince = recorded?.tick ?? sim.tick;
    if (previousAirLevel === null) airLevel = 'warning';
    else if (!recorded) sim.log('warning', 'alertAirYellow', { id: excavation.id, o2, co2 }, excavation);
  }
  setRoomAlert(sim, excavation, 'air', airLevel, o2, co2);
  // A brief daytime recovery must not grant a new immunity window every night.
  // End the episode only after a complete day without an air alert.
  if (excavation.airAlertLevel === null
    && sim.tick - (excavation.alertResolvedTicks.air ?? sim.tick) >= AIR.WARNING_LEAD_TICKS) {
    excavation.airWarningSince = null;
  }

  const temperature = Number.isFinite(excavation.temperature) ? excavation.temperature : HEAT.INITIAL_ROOM;
  updateTrend(sim, excavation, 'temperature', temperature);
  const thermalRate = excavation.temperaturePerDay;
  const coldDays = temperature >= HEAT.COMFORT_MIN ? null : (temperature < HEAT.DANGER_MIN ? 0
    : (thermalRate < -ALERTS.STOCK_EPSILON ? Math.max(0, (temperature - HEAT.DANGER_MIN) / -thermalRate) : null));
  // Forecast the hottest use of a dorm before anybody goes to bed. Otherwise
  // putting on blankets could cause damage before the room reaches 38 °C.
  const heatTemperature = temperature + (excavation.roomType === 'dorm' ? HEAT.SLEEP_BLANKET_C : 0);
  const heatDays = heatTemperature <= HEAT.ALERT_HOT ? null : (heatTemperature > HEAT.DANGER_MAX ? 0
    : (thermalRate > ALERTS.STOCK_EPSILON ? Math.max(0, (HEAT.DANGER_MAX - heatTemperature) / thermalRate) : null));
  let coldLevel = null;
  if (temperature < HEAT.DANGER_MIN || (temperature < HEAT.ALERT_COLD && coldDays !== null && coldDays <= ALERTS.RED_FORECAST_DAYS)) coldLevel = 'danger';
  else if (coldDays !== null && coldDays <= ALERTS.YELLOW_FORECAST_DAYS) coldLevel = 'warning';
  let heatLevel = null;
  if (heatTemperature > HEAT.DANGER_MAX || (heatTemperature > HEAT.COMFORT_MAX && heatDays !== null && heatDays <= ALERTS.RED_FORECAST_DAYS)) heatLevel = 'danger';
  else if (heatDays !== null && heatDays <= ALERTS.YELLOW_FORECAST_DAYS) heatLevel = 'warning';
  const previousColdLevel = excavation.alertLevels?.cold ?? null;
  const previousHeatLevel = excavation.alertLevels?.heat ?? null;
  if (thermalRate <= 0 && LEVEL_RANK[previousColdLevel] > LEVEL_RANK[coldLevel]) coldLevel = previousColdLevel;
  if (thermalRate >= 0 && LEVEL_RANK[previousHeatLevel] > LEVEL_RANK[heatLevel]) heatLevel = previousHeatLevel;
  setThermalRoomAlert(sim, excavation, 'cold', coldLevel, temperature);
  setThermalRoomAlert(sim, excavation, 'heat', heatLevel, temperature);

  const ratio = excavation.floodRatio ?? 0;
  const previousRatio = excavation.floodTrendValue ?? ratio;
  updateTrend(sim, excavation, 'flood', ratio);
  // The changing volume at a dig face is not a water-rise trend. Keep the
  // latest sample, but do not carry that artificial rate into a finished shaft.
  if (excavation.state === 'digging') {
    excavation.floodPerDay = 0;
    excavation.floodInstantPerDay = 0;
  }
  const floodRate = excavation.floodPerDay;
  const geometry = floodGeometry(sim, excavation);
  const use = traffic.get(excavation.id);
  const immersedHeads = use?.immersedHeads;
  const headDanger = geometry.heads.some((index) => sim.world.water[index] >= WATER.MAX_PER_CELL * WATER.DROWNING_RATIO)
    || (immersedHeads?.size ?? 0) > 0;
  // Water can occupy a newly opened junction for a single flow cycle. Warn at
  // once, but confirm the same exposed head cell before interrupting the game.
  // Persist these times with the room so save/load does not reset confirmation.
  const legacyConfirmed = !excavation.floodExposedHeadsSince && excavation.floodAlertLevel === 'danger';
  const exposedSince = excavation.floodExposedHeadsSince ??= {};
  for (const index of Object.keys(exposedSince)) {
    if (!immersedHeads?.has(Number(index))) delete exposedSince[index];
  }
  let confirmedImmersion = false;
  for (const index of immersedHeads ?? []) {
    exposedSince[index] ??= legacyConfirmed ? sim.tick - WATER.FLOOD_RED_CONFIRM_TICKS + 1 : sim.tick;
    if (sim.tick - exposedSince[index] + 1 >= WATER.FLOOD_RED_CONFIRM_TICKS) confirmedImmersion = true;
  }
  // A tiny quantity in a long shaft and the changing volume of a dig face
  // cannot support a useful forecast. Actual exposure remains observable.
  const forecastAllowed = excavation.state !== 'digging'
    && ratio >= Math.min(WATER.WADING_MIN_RATIO, geometry.threshold / 2);
  const floodDays = !forecastAllowed ? null : ratio >= geometry.threshold ? 0
    : (floodRate > ALERTS.STOCK_EPSILON ? Math.max(0, (geometry.threshold - ratio) / floodRate) : null);
  const prediction = forecastLevel(floodDays);
  const forecastExposure = prediction === 'danger'
    && [...(use?.feet ?? [])].some((index) => geometry.forecastFeet.has(index));
  const redRelevant = confirmedImmersion || forecastExposure;
  const thawExposure = excavation.thawExposure === true;
  let floodLevel = headDanger ? 'danger' : prediction;
  if (thawExposure && floodLevel === null) floodLevel = 'warning';
  const previousLevel = excavation.alertLevels?.flood ?? null;
  if (ratio >= Math.min(WATER.WADING_MIN_RATIO, geometry.threshold) && ratio >= previousRatio
    && LEVEL_RANK[previousLevel] > LEVEL_RANK[floodLevel]) floodLevel = previousLevel;
  if (floodLevel === 'danger' && !redRelevant) floodLevel = 'warning';
  if (floodLevel !== null && !Number.isFinite(excavation.floodWarningSince)) {
    const recorded = previousLevel !== null ? sim.journal.findLast((entry) =>
      (entry.code === 'alertFloodYellow' || entry.code === 'alertWaterPocketYellow')
      && (entry.params?.excavationId ?? entry.params?.id) === excavation.id) : null;
    const pocket = activeWaterPocket(sim, excavation);
    excavation.floodWarningSince = recorded?.tick ?? pocket?.startedTick ?? sim.tick;
    if (previousLevel === null && !pocket) floodLevel = 'warning';
    else if (!recorded && !pocket) sim.log('warning', 'alertFloodYellow', { id: excavation.id, ratio }, excavation);
  }
  if (floodLevel !== 'danger') excavation.floodBackedRedSince = null;
  else if (excavation.floodBackedRedSince == null) {
    // A save from before this field kept its backed red as the shown level.
    excavation.floodBackedRedSince = excavation.floodBackedRedSince === undefined && previousLevel === 'danger'
      ? excavation.alertChangeTicks.flood ?? sim.tick : sim.tick;
  }
  // Holding a red needs only a real exposure, confirmed or not: a person whose
  // head goes under on arrival does not turn the red they were heading into
  // back to yellow. Raising one still needs the confirmation or the forecast.
  const exposed = redRelevant || (immersedHeads?.size ?? 0) > 0;
  floodLevel = heldFloodLevel(sim, excavation, floodLevel, exposed);
  setRoomAlert(sim, excavation, 'flood', floodLevel, ratio, thawExposure ? 'thaw' : 'waterLevel', true);
  // NOYADE2: a new confirmed entry re-arms the return to x1. Dips and passing
  // routes during a held red stay silent, but a head kept under for the full
  // confirmation is a real drowning. When the red was already shown before
  // the exposure that backs it began, this drowning has had no x1 of its own.
  const wasConfirmed = excavation.floodConfirmedImmersion ?? confirmedImmersion;
  excavation.floodConfirmedImmersion = confirmedImmersion;
  const rearmed = confirmedImmersion && !wasConfirmed && previousLevel === 'danger'
    && (excavation.alertChangeTicks.flood ?? -Infinity) < excavation.floodBackedRedSince;
  if (rearmed) sim.emergency = true;
  // See floodRedGoesQuiet.
  const rose = excavation.floodAlertLevel === 'danger' && previousLevel !== 'danger';
  if (rose || rearmed) excavation.floodRedAlarmTick = sim.tick;
  if (excavation.floodAlertLevel !== 'danger' || rose || rearmed) excavation.floodRedQuiet = false;
  else if (floodRedGoesQuiet(sim, excavation.floodRedAlarmTick ?? excavation.alertChangeTicks.flood,
    excavation.floodClearSince.danger)) excavation.floodRedQuiet = true;
  // A quick pump cycle must not renew the grace period. A full safe day does,
  // counted from the end of the danger itself, not from the end of the hold.
  if (excavation.floodAlertLevel === null
    && sim.tick - (excavation.floodClearSince.warning ?? sim.tick) >= WATER.WARNING_LEAD_TICKS) {
    excavation.floodWarningSince = null;
  }
}

function minimumNeedBuffer(sim, key, ratePerDay) {
  let minimum = null;
  for (const colonist of sim.colonists) {
    if (colonist.health <= 0) continue;
    const days = Math.max(0, 100 - (colonist[key] ?? 0)) / ratePerDay;
    minimum = minimum === null ? days : Math.min(minimum, days);
  }
  return minimum;
}

// `detail` donne les paramètres propres à une alerte ; il n'est appelé qu'au
// moment d'écrire dans le journal.
function setStockAlert(sim, category, level, days, detail = null) {
  const previous = sim.alertLevels[category] ?? null;
  sim.alertLevels[category] = level;
  sim.alerts[category] = { level, excavationIds: [] };
  if (level === previous) return;
  if (level === null) {
    sim.alertResolvedTicks[category] = sim.tick;
    return;
  }
  const resolvedTick = sim.alertResolvedTicks[category] ?? -Infinity;
  const journalLevel = sim.alertJournalLevels[category] ?? null;
  const newEpisode = previous === null && sim.tick - resolvedTick >= ALERTS.RESOLVED_REEMIT_TICKS;
  const escalation = LEVEL_RANK[level] > LEVEL_RANK[previous] && LEVEL_RANK[level] > LEVEL_RANK[journalLevel];
  if (!newEpisode && !escalation) return;
  const stock = sim.stocks.find((candidate) => candidate.id === 'reserve') ?? sim.stocks[0];
  sim.log(level, ALERT_CODES[category][level], { days, ...(detail?.() ?? {}) },
    stock ? { x: stock.x, y: stock.y, w: 1, h: 1 } : null);
  sim.alertJournalLevels[category] = level;
  if (level === 'danger') sim.emergency = true;
}

// Reste-t-il du charbon dans le sous-sol ? Environ un monde sur vingt-cinq n'a
// aucune veine (worldgen : couche de charbon vide), et le charbon creusé ne
// revient pas. Lu seulement quand l'alerte s'écrit dans le journal.
function subsoilHasCoal(sim) {
  const world = sim.world;
  if (!world?.material || !world?.isSolid) return true;
  for (let y = WORLD.SURFACE_Y; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      if (world.material(x, y) === MATERIAL.COAL && world.isSolid(x, y)) return true;
    }
  }
  return false;
}

// Ce que l'alerte de filtres ajoute selon la partie. Sans charbon dans le
// sous-sol, elle le dit : la recette au charbon ne vient plus que d'un dilemme
// ou d'une trouvaille. Le gel de la première année ferme la station de
// traitement (sorties limitées à 8 h, il en faut 9) : l'alerte le dit, avec le
// jour du dégel quand la courbe le connaît (même calcul que l'aperçu
// d'expédition), au lieu d'y envoyer le joueur. Hors gel, elle reste
// conseillée. Ces phrases sont rangées dans `remedy`, vide pour les alertes
// écrites avant cette règle. Lecture seule.
export function filterAlertAdvice(sim) {
  const frost = siteFrostOutlook(sim, 'waterPlant');
  const coal = subsoilHasCoal(sim);
  let advice;
  if (!frost?.siteOutOfReach) advice = tr('filtersPlantOpen');
  else if (frost.thawDay === null) advice = tr('filtersPlantFrozenNoThaw');
  else advice = tr('filtersPlantFrozen', { day: frost.thawDay, days: frost.daysRemaining });
  return {
    remedy: `${coal ? '' : ` ${tr('filtersNoCoal')}`} ${advice}`,
    plantFrozen: Boolean(frost?.siteOutOfReach),
    thawDay: frost?.thawDay ?? null,
    coalInSubsoil: coal,
  };
}

// Les jours de filtres se mesurent sur 24 h et l'usure avance par petits pas
// (1/90 de filtre) : autour de 30 jours, la prévision varie de 3 ou 4 jours
// d'une heure à l'autre et resterait des jours de part et d'autre du seuil.
// Une fois levée, l'alerte jaune ne retombe qu'au-delà de ce multiple du seuil,
// sinon elle se réécrirait dans le journal à chaque passage.
const FILTER_YELLOW_CLEAR_FACTOR = 1.25;

function filterAlertLevel(sim, filterDays, noFilters) {
  const level = forecastLevel(filterDays, noFilters, ALERTS.FILTER_YELLOW_FORECAST_DAYS);
  if (level !== null || !sim.alertLevels?.filters || filterDays === null) return level;
  return filterDays <= ALERTS.FILTER_YELLOW_FORECAST_DAYS * FILTER_YELLOW_CLEAR_FACTOR ? 'warning' : null;
}

function updateStockAlerts(sim) {
  sim.alertResolvedTicks ??= {};
  sim.alertJournalLevels ??= {};
  const alive = sim.colonists.some((colonist) => colonist.health > 0);
  for (const [category, need, rate] of STOCK_INPUTS) {
    const reserve = sim.reserves?.[category] ?? EMPTY_RESERVE;
    const buffer = minimumNeedBuffer(sim, need, rate);
    const empty = (reserve.amount ?? 0) <= ALERTS.STOCK_EPSILON;
    const days = empty || reserve.days !== null ? (reserve.days ?? 0) + (buffer ?? 0) : null;
    const danger = alive && sim.colonists.some((colonist) => colonist.health > 0 && (colonist[need] ?? 0) >= 100);
    setStockAlert(sim, category, alive ? forecastLevel(days, danger, ALERTS.STOCK_YELLOW_FORECAST_DAYS) : null, days);
  }
  // Le générateur s'arrête net quand le carburant manque : air pulsé, filtration
  // et lumière tombent ensemble. Le déficit calculé par power.js tient compte
  // des autres sources et des batteries sur chaque réseau.
  const fuel = sim.reserves?.fuel ?? EMPTY_RESERVE;
  const diesels = sim.excavations.filter((excavation) => excavation.roomType === 'diesel'
    && activeExcavation(excavation) && !excavation.disabled && !excavation.machineBroken
    && (excavation.floodRatio ?? 0) <= WATER.FLOOD_UNUSABLE_RATIO);
  const dieselActive = diesels.length > 0;
  const networkDeficit = (diesel) => {
    const networks = sim.power?.networks;
    if (!Array.isArray(networks) || networks.length === 0) return true;
    const connected = networks.filter((network) => (network.excavationIds ?? []).includes(diesel.id));
    return connected.length === 0 || connected.some((network) => network.deficit);
  };
  const uncovered = diesels.some(networkDeficit);
  const stoppedWithoutFuel = diesels.some((diesel) => {
    if (diesel.powered || !(sim.power?.networks?.length > 0) || !networkDeficit(diesel)) return false;
    const stock = roomStock(sim, diesel) ?? {
      id: `diesel-${diesel.id}`, x: diesel.x + Math.floor(diesel.w / 2), y: diesel.y + diesel.h - 1, resources: {},
    };
    const available = sim.stocks.reduce((total, candidate) => candidate.id === stock.id || stocksConnected(sim, stock, candidate)
      ? total + (candidate.resources.fuel ?? 0) : total, 0);
    return available <= ALERTS.STOCK_EPSILON;
  });
  const noFuel = (fuel.amount ?? 0) <= ALERTS.STOCK_EPSILON;
  const fuelDays = noFuel && dieselActive ? 0 : fuel.days;
  setStockAlert(sim, 'fuel', alive && dieselActive && (!noFuel || uncovered)
    ? forecastLevel(fuelDays, noFuel || stoppedWithoutFuel, ALERTS.STOCK_YELLOW_FORECAST_DAYS) : null, fuelDays);
  // Chaque filtre s'use : les dix du départ tiennent environ deux mois et demi.
  // Sans filtre, la filtration s'arrête et l'eau sale ne devient plus potable,
  // alors que la réserve d'eau sale continue de grossir.
  const filtering = sim.excavations.some((excavation) => excavation.roomType === 'filterPlant'
    && excavation.state === 'fitted' && !excavation.disabled);
  const filters = sim.reserves?.filters ?? EMPTY_RESERVE;
  const noFilters = (filters.amount ?? 0) <= ALERTS.STOCK_EPSILON;
  const filterDays = noFilters ? 0 : filters.days;
  setStockAlert(sim, 'filters', alive && filtering ? filterAlertLevel(sim, filterDays, noFilters) : null,
    filterDays, () => filterAlertAdvice(sim));
}

function setSanitaryAlert(sim, category, code, active, params = {}, focus = null) {
  sim.alerts ??= {};
  sim.alertLevels ??= {};
  sim.alertResolvedTicks ??= {};
  sim.alertJournalLevels ??= {};
  const previous = sim.alertLevels[category] ?? null;
  const level = active ? 'warning' : null;
  sim.alertLevels[category] = level;
  sim.alerts[category] = { level, excavationIds: [] };
  if (level === previous) return;
  if (level === null) {
    sim.alertResolvedTicks[category] = sim.tick;
    sim.alertJournalLevels[category] = null;
    return;
  }
  // Like the stock alerts: a cause back within RESOLVED_REEMIT_TICKS of its
  // clear continues the same episode. The level and the banner come back,
  // without a second journal line or chime.
  const resolvedTick = sim.alertResolvedTicks[category] ?? -Infinity;
  if (sim.tick - resolvedTick < ALERTS.RESOLVED_REEMIT_TICKS) return;
  sim.log('warning', code, params, focus);
  sim.alertJournalLevels[category] = level;
}

// The tick of the last dirty drink is kept with the alert ticks, which the
// save already carries.
const DIRTY_DRINK_TICK = 'dirtyWaterLastDrink';

export function noteDirtyWater(sim, colonist) {
  sim.alertResolvedTicks ??= {};
  sim.alertResolvedTicks[DIRTY_DRINK_TICK] = sim.tick;
  setSanitaryAlert(sim, 'dirtyWater', 'alertDirtyWaterYellow', true, {}, colonist);
}

// Clean water is back when nobody has drunk dirty water for MIN_LEVEL_TICKS,
// every colonist who drinks from the shelter stocks reaches a clean ration,
// and the clean water they reach covers one ration each: a single ration in a
// shared stock is drunk by the first and the next one drinks dirty again.
// A surface crew, a trapped or carried person, or someone cut off from every
// water stock cannot drink there now; their own alerts cover them.
function cleanWaterReturned(sim, living) {
  if (sim.tick - (sim.alertResolvedTicks[DIRTY_DRINK_TICK] ?? -Infinity) < ALERTS.MIN_LEVEL_TICKS) return false;
  const counted = new Set();
  let reachableClean = 0;
  let need = 0;
  for (const colonist of living) {
    if (colonist.surfaceCrewId || colonist.trappedIn != null || colonist.carriedBy != null) continue;
    const portion = NEEDS.WATER_PER_DRINK * consumptionFactor(colonist);
    let reachesWater = false;
    let reachesRation = false;
    for (const stock of sim.stocks) {
      const clean = stock.resources.waterClean ?? 0;
      if (clean <= 0 && (stock.resources.waterDirty ?? 0) <= 0) continue;
      if (!stockReachable(sim, colonist, stock)) continue;
      reachesWater = true;
      if (clean >= portion) reachesRation = true;
      if (clean > 0 && !counted.has(stock.id)) {
        counted.add(stock.id);
        reachableClean += clean;
      }
    }
    if (!reachesWater) continue;
    if (!reachesRation) return false;
    need += portion;
  }
  return reachableClean + 1e-9 >= need;
}

// A body waits BURIAL_DELAY_TICKS for an ossuary before it contaminates the
// colony. Warn during that delay while no usable ossuary would take it. The
// journal keeps the hours left when the warning opened; the banner reads them
// here, so its countdown stays current.
export function bodyPendingWarning(sim) {
  let pending = null;
  for (const colonist of sim.colonists ?? []) {
    if (colonist.deathTick == null || colonist.infectionSpread
      || ['ossuary', 'unburied'].includes(colonist.bodyLocation ?? 'colony') || usableOssuary(sim, colonist)) continue;
    if (!pending || colonist.deathTick < pending.deathTick) pending = colonist;
  }
  if (!pending) return null;
  const hours = Math.max(1, Math.ceil((pending.deathTick + PEOPLE.BURIAL_DELAY_TICKS - sim.tick) / TIME.TICKS_PER_HOUR));
  return { colonist: pending, hours };
}

function updateSanitaryAlerts(sim) {
  const living = sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead);
  const dirtyEpisode = living.length > 0 && sim.alertLevels.dirtyWater === 'warning';
  const cleanReturned = dirtyEpisode && sim.tick % TIME.TICKS_PER_HOUR === 0 && cleanWaterReturned(sim, living);
  setSanitaryAlert(sim, 'dirtyWater', 'alertDirtyWaterYellow', dirtyEpisode && !cleanReturned);

  const infected = living.filter((colonist) => (colonist.diseases ?? []).some((disease) =>
    (typeof disease === 'string' ? disease : disease.type) === 'infection'));
  setSanitaryAlert(sim, 'contagion', 'alertContagionYellow', infected.length >= 2,
    { count: infected.length }, infected[0] ?? null);

  const pending = bodyPendingWarning(sim);
  setSanitaryAlert(sim, 'bodyPending', 'alertBodyPendingYellow', Boolean(pending),
    { hours: pending?.hours ?? 0 }, pending?.colonist ?? null);

  const body = sim.colonists.find((colonist) => colonist.bodyLocation === 'unburied' && colonist.infectionSpread) ?? null;
  setSanitaryAlert(sim, 'unburiedBody', 'alertUnburiedBodyYellow', Boolean(body), {}, body);
}

// The shallow rock and incoming air both follow the nuclear winter. Warn once
// before its seasonal minimum, while there is time to change the shelter.
const LIVED_ROOMS = new Set(['dorm', 'commons', 'canteen', 'school', 'infirmary']);

// Jour du plus froid de l'année à venir. La température de surface ne dépend
// que du jour : on garde le dernier calcul (même jour, même réponse).
let winterCache = { day: NaN, winterDay: NaN };
function coldestSurfaceDay(today) {
  const start = Math.ceil(today);
  if (winterCache.day === start) return winterCache.winterDay;
  let winterDay = null;
  for (let day = start; day <= start + TIME.DAYS_PER_YEAR; day += 1) {
    // The initial nuclear spring may be colder than next winter. The seasonal
    // warning still predicts winter; immediate cold keeps its own room alerts.
    if (day % TIME.DAYS_PER_YEAR < TIME.DAYS_PER_YEAR - TIME.DAYS_PER_SEASON) continue;
    if (winterDay === null || surfaceTemperature(day) < surfaceTemperature(winterDay)) winterDay = day;
  }
  winterCache = { day: start, winterDay };
  return winterDay;
}

function warnColdSettling(sim) {
  if (sim.alertJournalLevels.coldSettling) return;
  let coldest = null;
  for (const room of sim.excavations) {
    if (!LIVED_ROOMS.has(room.roomType) || !(room.state === 'fitted' || room.initial) || !activeExcavation(room)) continue;
    if (!Number.isFinite(room.temperature) || room.temperature >= ALERTS.COLD_SETTLING_C) continue;
    if (!coldest || room.temperature < coldest.temperature) coldest = room;
  }
  if (!coldest) return;
  // Les premières semaines sont fraîches (la partie s'ouvre en plein hiver
  // nucléaire), puis l'été réchauffe l'abri : n'annoncer que l'automne.
  const today = sim.tick / TIME.TICKS_PER_DAY;
  const winterDay = coldestSurfaceDay(today);
  if (winterDay - today > ALERTS.COLD_SETTLING_LEAD_DAYS) return;
  sim.alertJournalLevels.coldSettling = 'warning';
  sim.log('warning', 'eventColdSettling', {
    id: coldest.id,
    excavationId: coldest.id,
    temperature: Math.round(coldest.temperature),
    days: Math.max(1, Math.round(winterDay - today)),
    depth: ALERTS.COLD_SETTLING_DEPTH,
    deep: Math.round(rockTemperatureAt(winterDay, ALERTS.COLD_SETTLING_DEPTH)),
  }, coldest);
}

// The collapsed room remains the rescue's identity even after another excavation
// opens its rubble. Keep the original entry for the banner when the journal rolls.
export function ensureRescueAlert(sim, excavation) {
  const survivors = trappedSurvivors(sim, excavation);
  if (survivors.length === 0) return null;
  excavation.alertLevels ??= {};
  excavation.alertLevels.rescue = 'danger';
  excavation.rescueAlertLevel = 'danger';
  excavation.alertLevel = 'danger';
  sim.alerts ??= {};
  sim.alerts.rescue ??= { level: null, excavationIds: [] };
  sim.alerts.rescue.level = 'danger';
  if (!sim.alerts.rescue.excavationIds.includes(excavation.id)) sim.alerts.rescue.excavationIds.push(excavation.id);
  sim.alertLevels ??= {};
  sim.alertLevels.rescue = 'danger';
  if (!excavation.rescueAlertEntry) {
    excavation.rescueAlertEntry = sim.log('danger', 'alertRescueRed', {
      id: excavation.id, excavationId: excavation.id, count: survivors.length,
      colonistIds: survivors.map((colonist) => colonist.id), cause: 'collapse',
    }, excavation);
  }
  // New people can be found behind the same collapse after another dig. Keep
  // their causal link without emitting a second level transition; never erase
  // people already rescued or dead from the historical record.
  const alertId = excavation.rescueAlertEntry.id;
  const history = [
    ...(sim.journal ?? []), ...(sim.m5?.causes?.alerts ?? []),
    ...(sim.m5?.causes?.collapses ?? []).flatMap((report) => report.steps ?? []),
    ...sim.excavations.flatMap((room) => room.collapseReport?.steps ?? []),
  ].filter((entry) => entry.id === alertId);
  const involved = [...new Set([...history.flatMap((entry) => entry.params.colonistIds ?? []),
    ...survivors.map((colonist) => colonist.id)])].sort((a, b) => a - b);
  for (const entry of history) {
    entry.params = { ...entry.params, count: involved.length, colonistIds: [...involved] };
  }
  // Keep history immutable and detach the live banner from sim.log's entry.
  // Otherwise shared params differ from their independent copies after loading.
  excavation.rescueAlertEntry = { ...excavation.rescueAlertEntry,
    params: { ...excavation.rescueAlertEntry.params, count: survivors.length,
      colonistIds: survivors.map((colonist) => colonist.id) } };
  sim.emergency = true;
  return excavation.rescueAlertEntry;
}

function updateRescueAlerts(sim) {
  const rescue = { level: null, excavationIds: [] };
  for (const excavation of sim.excavations) {
    if (trappedSurvivors(sim, excavation).length > 0) {
      ensureRescueAlert(sim, excavation);
      rescue.level = 'danger';
      rescue.excavationIds.push(excavation.id);
    } else if (excavation.rescueAlertLevel || excavation.alertLevels?.rescue) {
      excavation.rescueAlertLevel = null;
      excavation.alertLevels.rescue = null;
      if (excavation.state === 'collapsed') excavation.alertLevel = null;
    }
  }
  sim.alerts.rescue = rescue;
  sim.alertLevels.rescue = rescue.level;
}

export function updateAlerts(sim) {
  sim.alerts = {};
  sim.alertLevels ??= {};
  const traffic = floodTraffic(sim);
  for (const category of ROOM_CATEGORIES) {
    sim.alerts[category] = { level: null, excavationIds: [] };
  }
  for (const excavation of sim.excavations) {
    if (!activeExcavation(excavation) || excavation.dugCells.length === 0) continue;
    updateRoomAlerts(sim, excavation, traffic);
    let highest = null;
    for (const category of ROOM_CATEGORIES) {
      const level = excavation.alertLevels[category] ?? null;
      if (LEVEL_RANK[level] > LEVEL_RANK[highest]) highest = level;
      if (LEVEL_RANK[level] > LEVEL_RANK[sim.alerts[category].level]) sim.alerts[category].level = level;
      if (level) sim.alerts[category].excavationIds.push(excavation.id);
    }
    excavation.alertLevel = highest;
  }
  for (const colonist of sim.colonists) {
    const outside = !activeExcavation(excavationAt(sim, colonist.x, colonist.y));
    const temperature = colonist.health > 0 && !colonist.dead && outside ? colonistFeltTemperature(sim, colonist) : null;
    for (const category of THERMAL_CATEGORIES) {
      const exposed = temperature !== null && (category === 'cold'
        ? coldDamagePerHour(temperature) > 0 : temperature > HEAT.DANGER_MAX);
      updateOutsideThermalExposure(sim, colonist, category, exposed, temperature);
      const level = colonist.thermalExposure?.[category]?.level;
      if (level) {
        (sim.alerts[category].colonistIds ??= []).push(colonist.id);
        if (LEVEL_RANK[level] > LEVEL_RANK[sim.alerts[category].level]) sim.alerts[category].level = level;
      }
    }
    const immersed = colonist.health > 0 && !colonist.dead && headSubmerged(sim, colonist.x, colonist.y)
      && !floodRoomAt(sim, colonist);
    updateOutsideFloodExposure(sim, colonist, immersed);
    const level = colonist.floodExposure?.level;
    if (level) {
      (sim.alerts.flood.colonistIds ??= []).push(colonist.id);
      if (LEVEL_RANK[level] > LEVEL_RANK[sim.alerts.flood.level]) sim.alerts.flood.level = level;
    }
    // A trapped colonist under a still-yellow room must still raise the global
    // flood level to danger: their own red is the real emergency. Outside
    // excavations the exposure above already carries that aggregation.
    if (colonist.health > 0 && !colonist.dead && colonist.suddenImmersion && !colonist.floodExposure?.level) {
      (sim.alerts.flood.colonistIds ??= []).push(colonist.id);
      if (LEVEL_RANK.danger > LEVEL_RANK[sim.alerts.flood.level]) sim.alerts.flood.level = 'danger';
    }
  }
  updateStockAlerts(sim);
  updateRescueAlerts(sim);
  warnColdSettling(sim);
  updateSanitaryAlerts(sim);
  for (const category of ROOM_CATEGORIES) sim.alertLevels[category] = sim.alerts[category].level;
  return sim.alerts;
}

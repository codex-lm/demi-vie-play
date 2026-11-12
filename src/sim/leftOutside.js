import { TIME } from '../data/balance.js';
import { LEFT_OUTSIDE_ITEMS, LEFT_OUTSIDE_RULES } from '../data/leftOutside.js';
import { RNG, hashString } from './rng.js';
import { baseRadiationRate, surfaceDoseRate, suitProtection } from './radiation.js';
import { surfaceHatch } from './surface.js';
import { spendResources } from './resources.js';

export function outsideItem(sim, id) {
  return sim.leftOutside?.items.find((candidate) => candidate.id === id) ?? null;
}

export function outsideDefinition(sim, id) {
  const definition = LEFT_OUTSIDE_ITEMS.find((candidate) => candidate.id === id);
  if (!definition || !outsideItem(sim, id)) return null;
  const x = Math.max(0, Math.min(sim.world.width - 1, surfaceHatch(sim).x + definition.xOffset));
  return { ...definition, x, encounterChance: 0,
    loot: Object.fromEntries(Object.entries(definition.reward).map(([resource, amount]) => [resource, [amount, amount]])) };
}

export function initializeLeftOutside(sim, options = {}) {
  if (sim.leftOutside || options.leftOutside !== true || options.empty) return;
  const rng = new RNG(hashString(`${sim.seed}:left-outside`));
  const groups = [...new Set(LEFT_OUTSIDE_ITEMS.map((definition) => definition.group))];
  const count = rng.int(LEFT_OUTSIDE_RULES.MIN_ITEMS, LEFT_OUTSIDE_RULES.MAX_ITEMS);
  const selected = [];
  while (selected.length < count) {
    const group = groups.splice(rng.int(0, groups.length - 1), 1)[0];
    selected.push(rng.pick(LEFT_OUTSIDE_ITEMS.filter((definition) => definition.group === group)));
  }
  selected.sort((a, b) => a.deadlineTick - b.deadlineTick || a.id.localeCompare(b.id));
  const withdrawn = {};
  for (const definition of selected) {
    for (const [resource, amount] of Object.entries(definition.deduction)) withdrawn[resource] = (withdrawn[resource] ?? 0) + amount;
  }
  // This is a transfer of the initial supplies, never a second grant on load.
  if (!spendResources(sim, withdrawn)) throw new Error('Initial outside supplies exceed the starting stock');
  sim.leftOutside = { enabled: true, startedTick: sim.tick, nextId: 1, withdrawn,
    items: selected.map((definition) => ({ id: definition.id, status: 'available', deadlineTick: definition.deadlineTick })) };
  for (const item of sim.leftOutside.items) {
    const definition = outsideDefinition(sim, item.id);
    if (!definition.morale) continue;
    const owner = sim.colonists[rng.int(0, sim.colonists.length - 1)];
    item.ownerId = owner.id;
    item.moraleWithheld = Math.min(definition.morale, owner.morale ?? 0, owner.moraleValue ?? owner.morale ?? 0);
    owner.morale -= item.moraleWithheld;
    owner.moraleValue = (owner.moraleValue ?? owner.morale + item.moraleWithheld) - item.moraleWithheld;
  }
}

/** Same instantaneous price as an expedition preview. Tomorrow holds the
 * weather, journey and protection fixed, like the existing Demies comparison. */
export function outsideDosePrices(sim, itemOrId, crewSize = 1) {
  const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.outsideId ?? itemOrId?.id;
  const definition = outsideDefinition(sim, id);
  if (!definition) return null;
  const tick = itemOrId?.previewTick ?? sim.tick;
  const durationHours = itemOrId?.durationHours ?? definition.durationHours * (sim.m5?.calendar?.durationFactor ?? 1);
  const dosePerPerson = surfaceDoseRate({ ...sim, tick }, definition.x) * durationHours * (1 - suitProtection(sim, { suit: true }));
  const delayDays = LEFT_OUTSIDE_RULES.PRICE_DELAY_DAYS;
  const laterDose = dosePerPerson * baseRadiationRate(tick + delayDays * TIME.TICKS_PER_DAY) / baseRadiationRate(tick);
  return { today: { dosePerPerson, teamDose: dosePerPerson * crewSize },
    later: { dosePerPerson: laterDose, teamDose: laterDose * crewSize }, delayDays, durationHours, crewSize, x: definition.x };
}

export function loseOutsideItem(sim, id) {
  const item = outsideItem(sim, id);
  if (!item || item.status === 'lost' || item.status === 'recovered') return false;
  item.status = 'lost';
  item.lostTick = sim.tick;
  sim.log('info', 'eventOutsideLost', { outsideId: item.id });
  return true;
}

export function updateLeftOutside(sim) {
  for (const item of sim.leftOutside?.items ?? []) {
    if (['available', 'outbound'].includes(item.status) && sim.tick >= item.deadlineTick) loseOutsideItem(sim, item.id);
  }
}

export function recoverOutsideItem(sim, expedition) {
  const item = outsideItem(sim, expedition.outsideId);
  if (!item || item.status !== 'secured') return false;
  item.status = 'recovered';
  item.recoveredTick = sim.tick;
  item.averageDose = expedition.averageDose;
  item.colonistIds = [...expedition.colonistIds];
  if (expedition.recruitId !== null) item.recruitId = expedition.recruitId;
  const owner = sim.colonists.find((person) => person.id === item.ownerId && !person.dead && person.health > 0);
  if (owner && item.moraleWithheld) {
    owner.morale = Math.min(100, owner.morale + item.moraleWithheld);
    owner.moraleValue = Math.min(100, owner.moraleValue + item.moraleWithheld);
  }
  sim.log('info', 'eventOutsideRecovered', { outsideId: item.id, dose: expedition.averageDose });
  return true;
}

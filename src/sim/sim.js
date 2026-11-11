import { ALERTS, EXCAVATION, POWER, SAVE_VERSION, TIME } from '../data/balance.js';
import { RNG, fnv1a, normalizeSeed } from './rng.js';
import { World } from './world.js';
import { generateWorld } from './worldgen.js';
import { createInitialColonists, updateColonists } from './colonists.js';
import { updateJobs, queueExcavation, queueLining, queueCoating, queueSupport, queueRepair, queueMachineRepair, cancelJobsFor, digLiningAvailable } from './jobs.js';
import { cancelExcavation, planDoor, planExcavation } from './excavation.js';
import { doorWallRisk, evaluateProspect, updateIntegrity, updateStructure } from './structure.js';
import { queueFitting, updateRooms } from './rooms.js';
import { updatePower } from './power.js';
import { updateWater } from './water.js';
import { updateAir } from './air.js';
import { updateHeat } from './heat.js';
import { updateReserves } from './reserves.js';
import { ensureRescueAlert, updateAlerts } from './alerts.js';
import { cancelRoomRescue, updateRescues } from './collapseRescue.js';
import { initializePeople } from './people.js';
import { refreshMoraleCauses, updateMorale } from './morale.js';
import { updateLifecycle } from './lifecycle.js';
import { initializeLaws, signLaw, updateLaws } from './laws.js';
import { initializeResearch, startResearch, updateResearch } from './research.js';
import { setWorkshopRecipe, updateIndustry } from './industry.js';
import { initializeRadiation, setExodusZone, updateRadiation } from './radiation.js';
import { initializeSurface } from './surface.js';
import { initializeWeather, updateWeather } from './weather.js';
import { initializeExpeditions, launchExpedition, previewExpedition, chooseEncounter, updateExpeditions } from './expeditions.js';
import { previewSurfaceConstruction, startSurfaceConstruction, updateSurfaceStructures } from './surfaceStructures.js';
import { cancelKitCraft, initializeExodus, launchExodus, previewExodus, startKitCraft, updateExodus } from './exodus.js';
import { applyM5, captureJournal, initializeM5, updateM5, updateM5Clock } from './m5.js';
import { initializeM6, recordM6Order, updateM6 } from './m6.js';

export class Sim {
  constructor(seed = 1, options = {}) {
    this.seed = normalizeSeed(seed);
    this.tick = options.empty ? 0 : TIME.START_HOUR * TIME.TICKS_PER_HOUR;
    this.rng = new RNG(this.seed);
    this.nextExcavationId = 0;
    this.excavations = [];
    this.colonists = [];
    this.jobs = [];
    this.nextJobId = 0;
    this.stocks = [];
    this.doors = [];
    this.journal = [];
    this.events = [];
    this.structureDirty = true;
    this.emergency = false;
    this.powerPriorities = [...POWER.PRIORITIES];
    this.power = {
      generatedKw: 0, consumedKw: 0, demandKw: 0, balance: 0,
      storedKwh: 0, capacityKwh: 0, deficit: false, networks: [],
    };
    if (!options.empty) {
      const generated = generateWorld(this.seed);
      this.world = generated.world;
      this.excavations = generated.excavations ?? [];
      this.nextExcavationId = Math.max(0, ...this.excavations.map((e) => e.id + 1));
      this.stocks = generated.stocks ?? [];
      this.doors = generated.doors ?? [];
      this.colonists = createInitialColonists(generated.spawn ?? { x: 0, y: 0 });
      this.log('info', 'eventWelcome');
    } else {
      this.world = new World();
    }
    initializePeople(this);
    initializeLaws(this);
    initializeResearch(this);
    initializeRadiation(this);
    initializeSurface(this);
    initializeWeather(this);
    initializeExpeditions(this);
    initializeExodus(this);
    initializeM5(this, options);
    initializeM6(this, options);
    updateReserves(this);
    updateAlerts(this);
    refreshMoraleCauses(this);
  }

  log(level, code, params = {}, focus = null) {
    const entry = { id: this.journal.length ? this.journal[this.journal.length - 1].id + 1 : 0, tick: this.tick, level, code, params };
    if (focus) entry.focus = { x: focus.x + (focus.w ?? 1) / 2, y: focus.y + (focus.h ?? 1) / 2 };
    this.journal.push(entry);
    if (this.journal.length > ALERTS.JOURNAL_MAX_ENTRIES) this.journal.shift();
    captureJournal(this, entry);
    return entry;
  }

  excavation(id) {
    return this.excavations.find((excavation) => excavation.id === id) ?? null;
  }

  apply(order) {
    if (!order || typeof order.type !== 'string') return { ok: false, error: 'invalidPlacement' };
    const m5Result = applyM5(this, order);
    if (m5Result) {
      recordM6Order(this, order, m5Result);
      return m5Result;
    }
    let result = { ok: false, error: 'invalidPlacement' };
    if (order.type === 'dig') {
      // Soutènement choisi mais impayable ou verrouillé : refuser l'ordre avant
      // de planifier quoi que ce soit, avec la raison, plutôt que creuser nu.
      const liningReady = digLiningAvailable(this, order);
      if (!liningReady.ok) result = liningReady;
      else {
        result = planExcavation(this, order);
        if (result.ok) {
          const queued = queueExcavation(this, result.excavation);
          result.job = queued.ok ? queued.job : null;
        }
      }
    } else if (order.type === 'lining') {
      const excavation = this.excavation(order.excavationId);
      if (excavation) result = queueLining(this, excavation, order.lining) ?? { ok: true };
    } else if (order.type === 'coating') {
      const excavation = this.excavation(order.excavationId);
      if (excavation) result = queueCoating(this, excavation, order.coating) ?? { ok: true };
    } else if (order.type === 'support') {
      const excavation = this.excavation(order.excavationId);
      if (excavation) result = queueSupport(this, excavation, order.x, order.material ?? 'wood') ?? { ok: true };
    } else if (order.type === 'repair') {
      const excavation = this.excavation(order.excavationId);
      if (excavation) result = queueRepair(this, excavation) ?? { ok: true };
    } else if (order.type === 'machineRepair') {
      // Explicit form of the room panel's repair button on a broken machine.
      const excavation = this.excavation(order.excavationId);
      if (excavation) result = queueMachineRepair(this, excavation);
    } else if (order.type === 'fit') {
      result = queueFitting(this, this.excavation(order.excavationId), order.roomType);
    } else if (order.type === 'powerPriority') {
      const excavation = this.excavation(order.excavationId);
      if (excavation && POWER.PRIORITIES.includes(order.priority)) {
        excavation.powerPriority = order.priority;
        result = { ok: true };
      }
    } else if (order.type === 'powerPriorities' && Array.isArray(order.priorities)
      && order.priorities.length === POWER.PRIORITIES.length && POWER.PRIORITIES.every((priority) => order.priorities.includes(priority))) {
      this.powerPriorities = [...order.priorities];
      result = { ok: true };
    } else if (order.type === 'toggleRoom') {
      const excavation = this.excavation(order.excavationId);
      if (excavation?.machineBroken) {
        result = { ok: false, error: 'machineRepairRequired' };
      } else if (excavation) {
        excavation.disabled = !excavation.disabled;
        result = { ok: true };
      }
    } else if (order.type === 'law') {
      result = signLaw(this, order.lawId);
    } else if (order.type === 'research') {
      result = startResearch(this, order.nodeId);
    } else if (order.type === 'recipe') {
      result = setWorkshopRecipe(this, order.excavationId, order.recipeId);
    } else if (order.type === 'workPriority') {
      const colonist = this.colonists.find((person) => person.id === order.colonistId);
      if (colonist && Object.hasOwn(colonist.priorities ?? {}, order.work)
        && Number.isInteger(order.priority) && order.priority >= 0 && order.priority <= 4) {
        colonist.priorities[order.work] = order.priority;
        colonist.automaticPriorities = false;
        result = { ok: true };
      }
    } else if (order.type === 'autoPriorities') {
      const colonist = this.colonists.find((person) => person.id === order.colonistId);
      if (colonist) {
        colonist.automaticPriorities = true;
        for (const work of Object.keys(colonist.priorities ?? {})) colonist.priorities[work] = 3;
        result = { ok: true };
      }
    } else if (order.type === 'surfaceZone') {
      result = setExodusZone(this, order);
    } else if (order.type === 'surfaceBuildPreview') {
      result = previewSurfaceConstruction(this, order);
    } else if (order.type === 'surfaceBuild') {
      result = startSurfaceConstruction(this, order);
    } else if (order.type === 'expeditionPreview') {
      result = previewExpedition(this, order);
    } else if (order.type === 'expeditionLaunch') {
      result = launchExpedition(this, order);
    } else if (order.type === 'encounterChoice') {
      result = chooseEncounter(this, order);
    } else if (order.type === 'kitCraft') {
      result = startKitCraft(this, order);
    } else if (order.type === 'kitCraftCancel') {
      result = cancelKitCraft(this);
    } else if (order.type === 'exodusPreview') {
      result = previewExodus(this);
    } else if (order.type === 'exodusLaunch') {
      result = launchExodus(this, order);
    } else if (order.type === 'door') {
      const excavation = this.excavation(order.excavationId);
      const risk = excavation && Number.isInteger(order.x)
        ? doorWallRisk(this, excavation, order.x, excavation.y + excavation.h - EXCAVATION.DOOR_HEIGHT, EXCAVATION.DOOR_HEIGHT) : null;
      result = risk ? { ok: false, error: 'doorWallTooThin', risk } : planDoor(this, excavation, order.x, order.y);
    } else if (order.type === 'cancel') {
      const excavation = this.excavation(order.excavationId);
      const cancellable = excavation && !excavation.initial && excavation.state !== 'dug' && excavation.state !== 'fitted' && excavation.state !== 'collapsed';
      const cells = cancellable ? [...excavation.cells] : [];
      if (cancellable) cancelJobsFor(this, excavation);
      result = { ok: cancellable ? cancelExcavation(this, excavation) : false };
      // A cancelled rescue passage a cut-off room waits for is not planned
      // again at once (cells: the tunnel as it was before).
      if (result.ok) cancelRoomRescue(this, excavation, cells);
    }
    recordM6Order(this, order, result);
    return result;
  }

  preview(order) {
    return evaluateProspect(this, order);
  }

  step(count = 1) {
    for (let i = 0; i < count; i += 1) {
      if (this.exodus?.result) break;
      if (this.colonists.some((colonist) => !Array.isArray(colonist.traits) || !colonist.priorities
        || !Number.isFinite(colonist.workFactor))) initializePeople(this);
      if (this.recalculateOnLoad) {
        this.structureDirty = true;
        this.recalculateOnLoad = false;
      }
      this.tick += 1;
      if (this.structureDirty || this.tick % TIME.TICKS_PER_DAY === 0) updateStructure(this);
      if (this.tick % TIME.TICKS_PER_HOUR === 0) updateIntegrity(this);
      updateWeather(this);
      updatePower(this);
      updateM5Clock(this);
      updateRooms(this);
      updateWater(this);
      updateAir(this);
      updateHeat(this);
      updateRescues(this);
      updateJobs(this);
      updateResearch(this);
      updateIndustry(this);
      updateRadiation(this);
      updateColonists(this);
      updateExpeditions(this);
      updateM5(this);
      updateSurfaceStructures(this);
      updateLifecycle(this);
      updateMorale(this);
      updateM6(this);
      updateExodus(this);
      updateLaws(this);
      updateReserves(this);
      updateRescues(this);
      updateAlerts(this);
      if (this.structureDirty) updateStructure(this);
      this.events = this.events.filter((event) => this.tick - event.tick < TIME.TICKS_PER_DAY);
    }
    return this;
  }

  serialize() {
    initializePeople(this);
    refreshMoraleCauses(this);
    initializeLaws(this);
    initializeResearch(this);
    initializeM6(this);
    return JSON.stringify({
      saveVersion: SAVE_VERSION,
      seed: this.seed,
      scenario: this.scenario ?? null,
      tick: this.tick,
      rng: this.rng.serialize(),
      world: this.world.serialize(),
      nextExcavationId: this.nextExcavationId,
      excavations: this.excavations,
      colonists: this.colonists,
      jobs: this.jobs,
      nextJobId: this.nextJobId,
      nextColonistId: this.nextColonistId,
      stocks: this.stocks,
      doors: this.doors,
      charter: this.charter,
      research: this.research,
      factions: this.factions,
      journal: this.journal,
      events: this.events,
      structureDirty: this.structureDirty,
      emergency: this.emergency,
      powerPriorities: this.powerPriorities,
      power: this.power,
      reserves: this.reserves,
      reserveHistory: this.reserveHistory,
      alerts: this.alerts ?? null,
      alertLevels: this.alertLevels ?? {},
      alertResolvedTicks: this.alertResolvedTicks ?? {},
      alertJournalLevels: this.alertJournalLevels ?? {},
      radiation: this.radiation ?? null,
      surface: this.surface ?? null,
      weather: this.weather ?? null,
      expeditions: this.expeditions ?? null,
      exodus: this.exodus ?? null,
      m5: this.m5 ?? null,
      m6: this.m6 ?? null,
    });
  }

  digest() {
    return fnv1a(this.serialize());
  }

  static deserialize(serialized) {
    const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    if (data.saveVersion !== SAVE_VERSION) throw new Error(`Unsupported save version: ${data.saveVersion}`);
    const sim = Object.create(Sim.prototype);
    sim.seed = data.seed;
    sim.scenario = data.scenario ?? null;
    sim.tick = data.tick;
    sim.rng = RNG.restore(data.rng);
    sim.world = World.deserialize(data.world);
    sim.nextExcavationId = data.nextExcavationId;
    sim.excavations = data.excavations;
    sim.colonists = data.colonists;
    sim.jobs = data.jobs;
    sim.nextJobId = data.nextJobId;
    sim.nextColonistId = data.nextColonistId;
    sim.stocks = data.stocks;
    sim.doors = data.doors;
    sim.charter = data.charter;
    sim.research = data.research;
    sim.factions = data.factions;
    sim.journal = data.journal;
    sim.events = data.events;
    sim.structureDirty = data.structureDirty;
    sim.recalculateOnLoad = true;
    sim.emergency = data.emergency;
    sim.powerPriorities = data.powerPriorities ?? [...POWER.PRIORITIES];
    sim.power = data.power ?? {
      generatedKw: 0, consumedKw: 0, demandKw: 0, balance: 0,
      storedKwh: 0, capacityKwh: 0, deficit: false, networks: [],
    };
    sim.reserves = data.reserves ?? {
      air: { days: null }, water: { days: null }, food: { days: null }, fuel: { days: null },
    };
    sim.reserveHistory = data.reserveHistory ?? [];
    sim.alerts = data.alerts ?? null;
    sim.alertLevels = data.alertLevels ?? {};
    sim.alertResolvedTicks = data.alertResolvedTicks ?? {};
    sim.alertJournalLevels = data.alertJournalLevels ?? {};
    sim.radiation = data.radiation ?? null;
    sim.surface = data.surface ?? null;
    sim.weather = data.weather ?? null;
    sim.expeditions = data.expeditions ?? null;
    sim.exodus = data.exodus ?? null;
    sim.m5 = data.m5 ?? null;
    sim.m6 = data.m6 ?? null;
    initializePeople(sim);
    initializeLaws(sim);
    initializeResearch(sim);
    initializeRadiation(sim);
    initializeExpeditions(sim);
    initializeSurface(sim);
    initializeWeather(sim);
    initializeExodus(sim);
    initializeM5(sim, { storyteller: sim.m5?.storyteller?.mode });
    initializeM6(sim, { balanceProfile: sim.m6?.balanceProfile });
    refreshMoraleCauses(sim);
    updateRescues(sim);
    for (const excavation of sim.excavations) {
      if (excavation.trappedColonistIds?.length) ensureRescueAlert(sim, excavation);
    }
    if (!data.reserves || !Array.isArray(data.reserveHistory) || data.reserveHistory.length === 0) {
      updateReserves(sim);
      updateAlerts(sim);
    }
    return sim;
  }
}

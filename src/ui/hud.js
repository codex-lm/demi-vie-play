import { ALERTS, CULTIVATION, TIME } from '../data/balance.js';
import { resourceTotals } from '../sim/resources.js';
import { reserveTrendSnapshot, restoreReserveTrend, waterChainModel } from '../sim/waterChain.js';
import { foodSpoilageModel } from '../sim/rooms.js';
import { tr } from '../data/strings.fr.js';
import { BuildMenu } from './buildMenu.js';
import { formatJournalEntry, Journal } from './journal.js';
import { PreviewPanel, SelectionPanel } from './panels.js';
import { formatDoseRate, formatNumber, Tooltip } from './tooltips.js';
import { calendarDate, effectiveRoomType, filterSeverity, formatReserveDays, latestAlertModel, RESERVE_KEYS, reserveDaysLabel, reserveStatusModel, resourceStatusModel, surfaceHudModel, waterSeverity } from './models.js';
import { M4Panels } from './m4Panels.js';
import { M5Panels } from './m5Panels.js';
import { M6Panels } from './m6Panels.js';

const OVERLAYS = ['none', 'constraints', 'temperature', 'air', 'water', 'radiation', 'power', 'deposits'];
const RESOURCE_KEYS = ['food', 'water', 'fuel', 'stone', 'wood', 'metal', 'cement', 'coal'];
const EXTRA_RESOURCE_KEYS = ['clayRes', 'sandRes', 'ironOre', 'copperOre', 'leadOre', 'uraniumOre'];
const COLONIST_SLOTS = 12;
const ACTIVITY_KEYS = Object.freeze({ dig: 'activityDig', haul: 'activityHaul', repair: 'activityRepair', crank: 'activityCrank', rest: 'activityRest', idle: 'activityIdle', dead: 'activityDead' });
// Réserves dont le bouton porte une deuxième ligne (même style que l'eau).
const RESERVE_DETAILS = new Set(['water', 'filters']);

function signedNumber(value) {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${formatNumber(Math.abs(rounded), true)}`;
}

// Heures avant que la mémoire de lecture couvre de nouveau 48 h.
function provisionalHours(water) {
  return Math.max(1, Math.ceil(48 - (water.measuredSpanHours ?? 24)));
}

// Le compteur d'eau du bandeau : jours avant la fin de l'eau propre au rythme
// réel (waterChainModel), le même chiffre dans la bande des ressources, sur le
// bouton Eau et dans le panneau Eau. Au-delà d'un an : « > 1 an ».
export function waterHudModel(water) {
  const days = water.cleanReserveDays;
  const consuming = water.cleanConsumptionPerDay > 0 || water.drinkingPerDay > 0;
  const amount = formatNumber(water.drinkingWater, true);
  const balance = signedNumber(water.cleanNetPerDay);
  const label = reserveDaysLabel(days);
  const title = days === null ? tr('m6bWaterHudHelpNoDepletion', { amount, balance })
    : tr('m6bWaterHudHelp', { amount, balance, days: label });
  return {
    days,
    label,
    severity: waterSeverity(days, consuming, water.drinkingWater),
    detail: tr('m6bWaterHudSummary', { amount, balance }),
    title: water.provisional ? `${title}${tr('m6bWaterHudProvisional', { hours: provisionalHours(water) })}` : title,
  };
}

// Nombre de filtres : un filtre s'use par fractions, on garde une décimale sous
// deux (« 0,4 filtre », pas « 0 filtres » quand il reste deux jours), et le
// singulier sous deux, comme en français.
function filterCount(value) {
  const count = Math.max(0, Number(value) || 0);
  const shown = count < 2 ? formatNumber(Math.floor(count * 10 + 1e-9) / 10) : formatNumber(count, true);
  return { shown, text: tr(count < 2 ? 'm6bFiltersHudSummaryOne' : 'm6bFiltersHudSummary', { count: shown }) };
}

// Les filtres dans le bandeau : leur nombre (ceux qu'on porte compris, comme
// l'alerte) et les jours de filtration au rythme réel (usure mesurée sur 24 h).
export function filtersHudModel(water) {
  const needed = (water.stations ?? []).some((station) => station.roomType === 'filterPlant'
    && !['inactive', 'disabled'].includes(station.status));
  const held = Number.isFinite(water.filtersHeld) ? water.filtersHeld : water.filtersRemaining;
  // Sans station de filtration en marche, un stock vide n'est pas « 0 jour ».
  const days = !needed && !(held > 0) ? null : water.filterDaysAtRealRate;
  const label = reserveDaysLabel(days);
  const count = filterCount(held);
  return {
    days,
    label,
    severity: filterSeverity(days, held, needed),
    detail: count.text,
    title: days === null ? tr('m6bFiltersHudHelpIdle', { count: count.shown })
      : tr('m6bFiltersHudHelp', { count: count.shown, days: label }),
  };
}

// La mémoire de lecture du compteur d'eau (48 h de relevés) est rangée dans le
// navigateur, à côté de la sauvegarde, et rendue quand une partie est chargée :
// sans elle, la mesure sur 48 h ne reviendrait qu'après 24 h de jeu. Commodité
// d'affichage seulement : la sauvegarde et la simulation n'en dépendent pas.
const WATER_TREND_KEY = 'demi-vie.waterTrend';

function defaultTrendStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Stored food spoils every day; say how much so the loss is not invisible.
export function foodSpoilageText(sim) {
  const spoilage = foodSpoilageModel(sim);
  return tr('foodSpoilageHelp', {
    amount: formatNumber(spoilage.perDay),
    percent: formatNumber(CULTIVATION.FOOD_SPOIL_PER_DAY * 100),
    temperature: formatNumber(CULTIVATION.COLD_PANTRY_TEMPERATURE, true),
  });
}

function colonistSlotButtons(count) {
  return Array.from({ length: count }, (_, id) => `<button type="button" data-colonist-id="${id}" data-activity="idle" disabled>${tr('unknown')}</button>`).join('');
}

export function colonistActivity(sim, colonist) {
  if ((colonist.health ?? 100) <= 0) return 'dead';
  // The tick that completes a job keeps working without it (sim/jobs.js,
  // holdWorkPose): it still reads as that job.
  const job = (colonist.jobId === null || colonist.jobId === undefined ? null : sim.jobs.find((item) => item.id === colonist.jobId))
    ?? (colonist.task === 'working' ? colonist.heldWork ?? null : null);
  if (job) {
    if (job.type === 'dig') return 'dig';
    if (job.type === 'haul') return 'haul';
    if (['repair', 'machineRepair', 'support', 'lining', 'coating'].includes(job.type)) return 'repair';
    if (['crank', 'manualVentilation'].includes(job.type)) return 'crank';
  }
  if (['sleep', 'eat'].includes(colonist.personal?.type) || ['sleeping', 'eat'].includes(colonist.task)) return 'rest';
  if (!job && colonist.task === 'working') return 'dig';
  if (!job && colonist.task === 'carrying') return 'haul';
  if (!job && ['repairing', 'supporting'].includes(colonist.task)) return 'repair';
  if (['crank', 'manualVentilation'].includes(colonist.task)) return 'crank';
  return 'idle';
}

function colonistInitials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toLocaleUpperCase('fr-FR');
}

const gameDate = calendarDate;

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.querySelector('#hud');
    this.debugRoot = document.querySelector('#debug-panel');
    this.importInput = document.querySelector('#import-file');
    this.elapsed = 0;
    this.selectionElapsed = 0;
    this.toastTimer = null;
    this.valueNodes = {};
    this.buildHud();
    this.root?.addEventListener('click', (event) => this.onHudClick(event));
    this.buildOverlayControls();
    this.m4Panels = new M4Panels(game, this);
    this.buildMenu = new BuildMenu(game, this);
    this.selectionPanel = new SelectionPanel(game);
    this.previewPanel = new PreviewPanel(game);
    this.journal = new Journal(game);
    this.m5Panels = new M5Panels(this.game, this);
    this.m6Panels = new M6Panels(this.game, this);
    this.tooltip = new Tooltip();
    this.importInput?.addEventListener('change', (event) => this.onImportFile(event));
    this.refresh();
  }

  buildHud() {
    if (!this.root) return;
    this.root.innerHTML = `<div class="brand"><h1>${tr('title')}</h1><span>${tr('subtitle')}</span></div>
      <div class="date-block"><span class="eyebrow">${tr('speed')}</span><strong data-value="date"></strong></div>
      <div class="speed-controls" role="group" aria-label="${tr('speed')}" title="${tr('pauseHint')}">
        <button type="button" data-speed="0" aria-label="${tr('pause')}"><span class="pause-symbol" aria-hidden="true"></span><span class="speed-label">${tr('pause')}</span></button>
        ${[1, 3, 10, 30].map((speed) => `<button type="button" data-speed="${speed}">×${speed}</button>`).join('')}
      </div>
      <div class="resource-strip" aria-label="${tr('resources')}">
        ${RESOURCE_KEYS.map((key) => `<div class="resource-chip" data-resource-chip="${key}"><span>${tr(key)}</span><strong data-resource="${key}">${tr('unknown')}</strong></div>`).join('')}
        <div class="resource-chip optional-power"><span>${tr('power')}</span><strong data-value="power">${tr('unknown')}</strong></div>
      </div>
      <div class="population-block"><span>${tr('population')}</span><strong data-value="population"></strong><small data-value="healthy"></small></div>
      <div class="surface-block" data-value="surface"><span>${tr('surfaceDose')}</span><strong data-value="radiation"></strong><small data-value="radiationForecast"></small></div>
      <div class="hud-stock-stack">
        <div class="resource-extra" aria-label="${tr('resources')}">${EXTRA_RESOURCE_KEYS.map((key) => `<div class="resource-chip" data-resource-chip="${key}"><span>${tr(key)}</span><strong data-resource="${key}">${tr('unknown')}</strong></div>`).join('')}</div>
        <div class="reserve-panel" data-reserve-panel role="group" aria-label="${tr('shelterReserves')}" title="${tr('reserveHelpDetailed', { filterDays: ALERTS.FILTER_YELLOW_FORECAST_DAYS })}"><span class="reserve-title">${tr('shelterReserves')}</span>${RESERVE_KEYS.map((key) => `<button type="button" class="reserve-item" data-reserve="${key}" data-reserve-item="${key}"><span>${tr(key === 'air' ? 'airOverlay' : key)}</span><strong data-reserve-days="${key}">${tr('unknown')}</strong>${RESERVE_DETAILS.has(key) ? `<small class="m6b-water-hud-detail" data-reserve-detail="${key}"></small>` : ''}</button>`).join('')}</div>
        <div class="shelter-alert" data-alert-banner hidden><button type="button" data-alert-entry title="${tr('alertBannerHint')}"></button></div>
      </div>
      <div class="colonist-board" role="group" aria-label="${tr('colonistBoard')}" title="${tr('colonistBoardHelp')}">${colonistSlotButtons(Math.max(COLONIST_SLOTS, this.game.sim.colonists.length))}</div>`;
    for (const element of this.root.querySelectorAll('[data-value]')) this.valueNodes[element.dataset.value] = element;
    for (const element of this.root.querySelectorAll('[data-resource]')) this.valueNodes[element.dataset.resource] = element;
    this.colonistNodes = [...this.root.querySelectorAll('[data-colonist-id]')];
    this.reserveNodes = Object.fromEntries(RESERVE_KEYS.map((key) => [key, {
      button: this.root.querySelector(`[data-reserve="${key}"]`),
      days: this.root.querySelector(`[data-reserve-days="${key}"]`),
      detail: RESERVE_DETAILS.has(key) ? this.root.querySelector(`[data-reserve-detail="${key}"]`) : null,
    }]));
    this.alertBanner = this.root.querySelector('[data-alert-banner]');
  }

  onHudClick(event) {
    const reserveButton = event.target.closest('button[data-reserve]');
    if (reserveButton) {
      this.openReserve(reserveButton.dataset.reserve);
      return;
    }
    const alertButton = event.target.closest('button[data-alert-entry]');
    if (alertButton) {
      const entryId = Number(alertButton.dataset.alertEntry);
      const currentAlert = latestAlertModel(this.game.sim)?.entry;
      const entry = this.game.sim.journal.find((item) => item.id === entryId)
        ?? (currentAlert?.id === entryId ? currentAlert : null);
      if (entry?.focus) this.game.focus(entry.focus.x, entry.focus.y);
      const excavationId = entry?.params?.excavationId ?? entry?.params?.id;
      if (excavationId !== undefined && this.game.sim.excavation(excavationId)) this.game.select({ type: 'excavation', id: excavationId });
      return;
    }
    const button = event.target.closest('button[data-speed]');
    if (button) this.game.setSpeed(Number(button.dataset.speed));
    const colonistButton = event.target.closest('button[data-colonist-id]');
    if (!colonistButton || colonistButton.disabled) return;
    const id = Number(colonistButton.dataset.colonistId);
    if (this.game.sim.colonists.some((colonist) => colonist.id === id)) this.game.select({ type: 'colonist', id });
  }

  hudClearance() {
    return this.hudClearances().full;
  }

  /** Canvas pixels under the HUD. `full` counts every visible element;
   * `permanent` leaves out the shelter alert banner, which comes and goes with
   * the alerts: the camera only makes room for it once it has stayed. */
  hudClearances() {
    if (!this.root?.getBoundingClientRect) return { permanent: 0, full: 0 };
    const canvasTop = this.game.canvas?.getBoundingClientRect?.().top ?? 0;
    let permanent = this.root.getBoundingClientRect().bottom;
    let full = permanent;
    const elements = this.root.querySelectorAll('.resource-extra, .reserve-panel, .colonist-board, .shelter-alert, .m5-hud-controls');
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (element.hidden || rect.width <= 0 || rect.height <= 0) continue;
      full = Math.max(full, rect.bottom);
      const transient = element === this.alertBanner || element.classList?.contains?.('shelter-alert');
      if (!transient) permanent = Math.max(permanent, rect.bottom);
    }
    return { permanent: Math.max(0, permanent - canvasTop), full: Math.max(0, full - canvasTop) };
  }

  buildOverlayControls() {
    if (!this.debugRoot) return;
    const smaller = tr('m6TextScaleDown');
    const bigger = tr('m6TextScaleUp');
    this.debugRoot.innerHTML = `<div class="overlay-controls interface-scale-controls" role="group" aria-label="${tr('m6TextScaleGroup')}">
      <span>${tr('m6TextScaleGroup')} <strong data-interface-scale-value></strong></span>
      <button type="button" data-interface-scale-down aria-label="${smaller}" title="${smaller}">A−</button>
      <button type="button" data-interface-scale-up aria-label="${bigger}" title="${bigger}">A+</button>
    </div><div class="overlay-controls"><button type="button" data-next-overlay title="${tr('nextOverlay')}">${tr('overlays')}</button><select data-overlay aria-label="${tr('overlays')}">${OVERLAYS.map((key) => `<option value="${key}">${tr(key === 'none' ? 'noOverlay' : key === 'air' ? 'airOverlay' : key === 'water' ? 'waterOverlay' : key === 'power' ? 'electricity' : key)}</option>`).join('')}</select></div><pre data-debug hidden></pre>`;
    this.interfaceScaleNodes = {
      value: this.debugRoot.querySelector('[data-interface-scale-value]'),
      down: this.debugRoot.querySelector('[data-interface-scale-down]'),
      up: this.debugRoot.querySelector('[data-interface-scale-up]'),
    };
    this.interfaceScaleNodes.down?.addEventListener('click', () => this.game.m6Shell?.stepTextScale(-1));
    this.interfaceScaleNodes.up?.addEventListener('click', () => this.game.m6Shell?.stepTextScale(1));
    this.debugRoot.querySelector('[data-next-overlay]').addEventListener('click', () => this.cycleOverlay());
    this.debugRoot.querySelector('[data-overlay]').addEventListener('change', (event) => {
      if (this.game.setOverlay) this.game.setOverlay(event.target.value);
      else {
        this.game.overlay = event.target.value;
        this.refresh();
      }
    });
    this.debugText = this.debugRoot.querySelector('[data-debug]');
    this.overlaySelect = this.debugRoot.querySelector('[data-overlay]');
  }

  refreshInterfaceScale(scale, canReduce, canEnlarge) {
    const nodes = this.interfaceScaleNodes;
    if (!nodes) return;
    if (nodes.value) nodes.value.textContent = `${scale} %`;
    if (nodes.down) nodes.down.disabled = !canReduce;
    if (nodes.up) nodes.up.disabled = !canEnlarge;
  }

  refresh() {
    this.refreshDynamic();
    this.buildMenu?.refresh();
    this.selectionPanel?.refresh();
    this.previewPanel?.refresh();
    this.journal?.refresh(true);
    this.refreshOverlay();
  }

  refreshLanguage() {
    this.buildHud();
    this.buildOverlayControls();
    this.buildMenu?.build();
    this.buildMenu?.setTab(this.buildMenu.tab);
    this.m5Panels?.refreshLanguage();
    this.m4Panels?.renderModal();
    this.m6Panels?.refresh(true);
    this.tooltip?.hide();
    this.refresh();
  }

  refreshDynamic() {
    if (!this.game.sim) return;
    const { sim } = this.game;
    const date = gameDate(sim.tick);
    if (this.valueNodes.date) this.valueNodes.date.textContent = tr('date', date);
    for (const button of this.root?.querySelectorAll('[data-speed]') ?? []) {
      const speed = Number(button.dataset.speed);
      const active = speed === this.game.speed;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      if (speed === 0) button.setAttribute('aria-label', tr(this.game.speed === 0 ? 'resume' : 'pause'));
    }
    const totals = resourceTotals(sim);
    const status = resourceStatusModel(sim, totals);
    this.restoreWaterTrend(sim);
    const water = waterChainModel(sim);
    this.storeWaterTrend(sim);
    const reserves = reserveStatusModel(sim, totals, water);
    const waterHud = waterHudModel(water);
    if (this.valueNodes.population) this.valueNodes.population.textContent = `${status.population}`;
    if (this.valueNodes.healthy) this.valueNodes.healthy.textContent = `${status.healthy} ${tr('healthy')}`;
    const amounts = {
      food: reserves.food.days,
      water: reserves.water.days,
      fuel: reserves.fuel.days,
      stone: totals.stone ?? 0,
      wood: totals.wood ?? 0,
      metal: totals.metal ?? 0,
      cement: totals.cement ?? 0,
      coal: totals.coal ?? 0,
    };
    for (const key of EXTRA_RESOURCE_KEYS) amounts[key] = totals[key] ?? 0;
    for (const key of [...RESOURCE_KEYS, ...EXTRA_RESOURCE_KEYS]) {
      const node = this.valueNodes[key];
      if (!node) continue;
      const days = ['food', 'water', 'fuel'].includes(key);
      if (key === 'water') {
        node.textContent = waterHud.label;
        node.parentElement.title = waterHud.title;
        continue;
      }
      node.textContent = days ? formatReserveDays(reserves[key]) : formatNumber(amounts[key], true);
      node.parentElement.title = days
        ? reserves[key].days === null
          ? tr('reserveNoConsumption', { resource: tr(key) })
          : tr('reserveRemaining', { resource: tr(key), days: formatReserveDays(reserves[key]) })
        : `${tr(key)} · ${formatNumber(amounts[key], true)}`;
      if (key === 'food') node.parentElement.title += ` ${foodSpoilageText(sim)}`;
    }
    this.refreshReserves(reserves, water);
    this.refreshAlert();
    const balance = status.power.balance;
    if (this.valueNodes.power) {
      this.valueNodes.power.textContent = Number.isFinite(balance) ? tr('powerValue', { value: `${balance > 0 ? '+' : ''}${formatNumber(balance)}` }) : tr('unknown');
      this.valueNodes.power.parentElement.classList.toggle('red', status.power.deficit || (balance ?? 0) < 0);
      this.valueNodes.power.parentElement.title = tr('powerDetails', {
        generated: formatNumber(status.power.generatedKw), demand: formatNumber(status.power.demandKw),
        stored: formatNumber(status.power.storedKwh), capacity: formatNumber(status.power.capacityKwh),
      });
    }
    const radiation = surfaceHudModel(sim);
    const forecastText = tr('forecast', { value: radiation.forecastDate ? tr('date', radiation.forecastDate) : tr('unknown') });
    if (this.valueNodes.radiation) this.valueNodes.radiation.textContent = Number.isFinite(radiation.dose) ? `${formatDoseRate(radiation.dose)} mSv/h` : tr('unknown');
    if (this.valueNodes.radiationForecast) this.valueNodes.radiationForecast.textContent = forecastText;
    if (this.valueNodes.surface) this.valueNodes.surface.title = forecastText;
    this.refreshColonists();
    this.journal?.refresh();
    this.refreshDebug();
    this.m4Panels?.refresh();
    this.m5Panels?.refresh();
    this.m6Panels?.refresh();
  }

  refreshColonists() {
    const requiredSlots = Math.max(COLONIST_SLOTS, this.game.sim.colonists.length);
    if ((this.colonistNodes?.length ?? 0) !== requiredSlots) {
      const board = this.root?.querySelector('.colonist-board');
      if (board) board.innerHTML = colonistSlotButtons(requiredSlots);
      this.colonistNodes = [...(this.root?.querySelectorAll('[data-colonist-id]') ?? [])];
    }
    for (const button of this.colonistNodes ?? []) {
      const id = Number(button.dataset.colonistId);
      const colonist = this.game.sim.colonists.find((item) => item.id === id);
      button.disabled = !colonist;
      if (!colonist) {
        button.textContent = tr('unknown');
        button.title = tr('colonistUnavailable');
        button.setAttribute('aria-label', tr('colonistUnavailable'));
        button.dataset.activity = 'idle';
        button.classList.remove('selected');
        button.setAttribute('aria-pressed', 'false');
        continue;
      }
      const activity = colonistActivity(this.game.sim, colonist);
      const activityText = tr(ACTIVITY_KEYS[activity]);
      const selected = this.game.selection?.type === 'colonist' && this.game.selection.id === id;
      button.textContent = colonistInitials(colonist.name) || String(id + 1);
      button.dataset.activity = activity;
      button.title = tr('colonistActivity', { name: colonist.name, activity: activityText });
      button.setAttribute('aria-label', tr('colonistSelect', { name: colonist.name, activity: activityText }));
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  refreshDebug() {
    if (!this.debugText) return;
    this.debugText.hidden = !this.game.debug;
    if (!this.game.debug) return;
    const hover = this.game.hover;
    this.debugText.textContent = [
      `${tr('fps')} ${formatNumber(this.game.fps ?? 0, true)} · ${tr('ticks')} ${formatNumber(this.game.speed * TIME.TICKS_PER_SECOND_AT_X1, true)}`,
      `${tr('seed')} ${this.game.sim.seed}`,
      hover ? `${tr('cell')} ${hover.x}, ${hover.y}` : '',
    ].filter(Boolean).join('\n');
  }

  refreshOverlay() {
    if (this.overlaySelect) this.overlaySelect.value = this.game.overlay;
  }

  refreshPreview() {
    this.previewPanel?.refresh();
  }

  changeTool(patch) {
    Object.assign(this.game.tool, patch);
    this.game.input?.refreshPreview?.();
    this.refresh();
  }

  openReserve(key) {
    if (!RESERVE_KEYS.includes(key)) return;
    if (key === 'food') {
      const storage = this.game.sim.excavations.find((excavation) => excavation.state !== 'collapsed'
        && ['pantry', 'storage'].includes(effectiveRoomType(excavation)));
      this.game.select(storage ? { type: 'excavation', id: storage.id } : null);
      if (storage) this.game.focus(storage.x + storage.w / 2, storage.y + storage.h / 2);
      return;
    }
    const overlay = reserveStatusModel(this.game.sim)[key]?.overlay;
    if (!overlay) return;
    if (key === 'water' || key === 'filters') this.m6Panels?.openWater?.();
    if (this.game.setOverlay) this.game.setOverlay(overlay);
    else {
      this.game.overlay = overlay;
      this.refresh();
    }
  }

  // Une partie chargée (nouvel objet sim) reprend la mémoire du compteur d'eau
  // rangée dans le navigateur, si elle décrit bien cette partie.
  restoreWaterTrend(sim) {
    if (this.waterTrendSim === sim) return;
    this.waterTrendSim = sim;
    this.waterTrendStoredTick = null;
    const storage = this.waterTrendStorage === undefined ? defaultTrendStorage() : this.waterTrendStorage;
    if (!storage) return;
    try {
      const saved = storage.getItem(WATER_TREND_KEY);
      if (saved) restoreReserveTrend(sim, JSON.parse(saved));
    } catch {
      // Mémoire illisible : le compteur repart de l'historique de la sauvegarde.
    }
  }

  // Range la mémoire à chaque nouveau relevé horaire.
  storeWaterTrend(sim) {
    const storage = this.waterTrendStorage === undefined ? defaultTrendStorage() : this.waterTrendStorage;
    if (!storage) return;
    const snapshot = reserveTrendSnapshot(sim);
    const last = snapshot?.entries.at(-1)?.tick ?? null;
    if (last === null || last === this.waterTrendStoredTick) return;
    this.waterTrendStoredTick = last;
    try {
      storage.setItem(WATER_TREND_KEY, JSON.stringify(snapshot));
    } catch {
      // Stockage plein ou refusé : rien de plus qu'une mesure provisoire au prochain chargement.
    }
  }

  refreshReserves(reserves, water = null) {
    const selectedId = this.game.selection?.type === 'excavation' ? this.game.selection.id : null;
    const selectedExcavation = (this.game.sim.excavations ?? []).find((excavation) => excavation.id === selectedId);
    const chain = water ?? (this.reserveNodes?.water?.button || this.reserveNodes?.filters?.button
      ? waterChainModel(this.game.sim) : null);
    const detailed = chain ? { water: waterHudModel(chain), filters: filtersHudModel(chain) } : {};
    for (const key of RESERVE_KEYS) {
      const reserve = reserves[key];
      const nodes = this.reserveNodes?.[key];
      if (!nodes?.button || !nodes.days) continue;
      const hud = detailed[key];
      const severity = hud ? hud.severity : reserve.severity;
      nodes.days.textContent = hud ? hud.label : formatReserveDays(reserve.days);
      nodes.button.classList.remove('green', 'yellow', 'red', 'neutral', 'active');
      nodes.button.classList.add(severity);
      // Les filtres ouvrent le calque de l'eau, mais seul le bouton Eau s'allume.
      const selected = key === 'food'
        ? ['pantry', 'storage'].includes(effectiveRoomType(selectedExcavation))
        : key !== 'filters' && reserve.overlay === this.game.overlay;
      nodes.button.classList.toggle('active', Boolean(selected));
      nodes.button.setAttribute('aria-pressed', String(Boolean(selected)));
      if (hud) {
        if (nodes.detail) nodes.detail.textContent = hud.detail;
        nodes.button.title = hud.title;
      } else {
        nodes.button.title = reserve.days === null
          ? tr('reserveNoConsumption', { resource: tr(key === 'air' ? 'airOverlay' : key) })
          : tr('reserveRemaining', { resource: tr(key === 'air' ? 'airOverlay' : key), days: formatReserveDays(reserve) });
        if (key === 'food') nodes.button.title += ` ${foodSpoilageText(this.game.sim)}`;
      }
    }
  }

  refreshAlert() {
    if (!this.alertBanner) return;
    const alert = latestAlertModel(this.game.sim);
    this.alertBanner.hidden = !alert;
    if (!alert) return;
    this.alertBanner.className = `shelter-alert ${alert.entry.level}`;
    const button = this.alertBanner.querySelector('button[data-alert-entry]');
    if (!button) return;
    button.dataset.alertEntry = String(alert.entry.id);
    button.textContent = formatJournalEntry(alert.entry, this.game.sim.excavations);
  }

  cycleOverlay() {
    const current = Math.max(0, OVERLAYS.indexOf(this.game.overlay));
    const overlay = OVERLAYS[(current + 1) % OVERLAYS.length];
    if (this.game.setOverlay) this.game.setOverlay(overlay);
    else {
      this.game.overlay = overlay;
      this.refresh();
    }
  }

  applyOrder(order) {
    const result = order.excavationId === null || order.excavationId === undefined
      ? { ok: false, error: 'noTarget' }
      : this.game.apply(order);
    this.game.audio?.notifyOrderResult?.(result);
    this.toast(result?.ok ? 'orderQueued' : result?.error ?? 'actionFailed');
    return result;
  }

  update(dt) {
    this.elapsed += dt;
    this.selectionElapsed += dt;
    if (this.elapsed >= 0.2) {
      this.elapsed %= 0.2;
      this.refreshDynamic();
    }
    if (this.selectionElapsed >= 0.5) {
      this.selectionElapsed %= 0.5;
      this.selectionPanel?.refresh();
    }
  }

  updateTooltip(cell, clientX, clientY) {
    if (this.game.drag) this.tooltip?.hide();
    else this.tooltip?.showCell(this.game, cell, clientX, clientY);
  }

  hideTooltip() {
    this.tooltip?.hide();
  }

  toast(key) {
    const element = document.querySelector('#toast');
    if (!element) return;
    clearTimeout(this.toastTimer);
    element.textContent = tr(key);
    element.classList.add('visible');
    this.toastTimer = setTimeout(() => element.classList.remove('visible'), 2600);
  }

  exportSave() {
    const blob = new Blob([this.game.sim.serialize()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = tr('saveFile', gameDate(this.game.sim.tick));
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  importSave() {
    if (this.importInput) this.importInput.click();
  }

  async onImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      this.game.importSave(await file.text());
      this.toast('eventLoaded');
    } catch {
      this.toast('importError');
    } finally {
      event.target.value = '';
    }
  }
}

import { tr } from '../data/strings.fr.js';
import { SOUVENIR_DEFINITIONS } from '../data/souvenirs.js';
import { notebookModel } from '../sim/objectives.js';
import { waterChainModel } from '../sim/waterChain.js';
import { calendarDate, excavationDisplayName, RESERVE_HORIZON_DAYS } from './models.js';
import { formatNumber } from './tooltips.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function notebookPanel(model) {
  const entries = model.entries.map((entry) => `<li class="${entry.completed ? 'completed' : ''}" data-objective-id="${escapeHtml(entry.id)}">
    <span class="m6-objective-check" aria-hidden="true">${entry.completed ? '✓' : '○'}</span>
    <div><strong>${escapeHtml(tr(entry.textKey))}</strong>
    <small>${escapeHtml(tr(entry.completed ? entry.donePhraseKey : entry.hintKey))}</small>
    <span class="m6-objective-reward">${escapeHtml(tr(entry.reward.type === 'books' ? 'm6RewardBook' : 'm6RewardMorale', { value: entry.reward.amount }))}</span></div>
  </li>`).join('');
  return `<section id="m6-notebook" class="m6-notebook" aria-label="${escapeHtml(tr('m6Notebook'))}">
    <div class="m6-panel-heading"><div><span class="eyebrow">${escapeHtml(tr('m6NotebookElder'))}</span><h2>${escapeHtml(tr('m6Notebook'))}</h2></div>
    <button type="button" class="icon-button" data-m6-action="toggleNotebook" aria-label="${escapeHtml(tr('m6HideNotebook'))}">×</button></div>
    <p class="m6-elder-voice">${escapeHtml(tr('m6NotebookIntro'))}</p>
    <ol class="m6-objective-list">${entries}</ol>
    ${model.suggestion ? `<p class="m6-notebook-suggestion" data-m6-suggestion="${escapeHtml(model.suggestion.objectiveId)}"><strong>${escapeHtml(tr('m6NotebookIdea'))}</strong> ${escapeHtml(tr(model.suggestion.textKey))}</p>` : ''}
    <button type="button" class="wide" data-m6-action="souvenirs">${escapeHtml(tr('m6Souvenirs'))}</button>
  </section>`;
}

export function souvenirIcon(souvenir) {
  return `<canvas class="souvenir-icon" data-souvenir-type="${escapeHtml(souvenir.type)}" data-souvenir-id="${souvenir.id}" width="64" height="64" role="img" aria-label="${escapeHtml(tr(SOUVENIR_DEFINITIONS[souvenir.type]?.nameKey ?? 'm6Souvenirs'))}"></canvas>`;
}

export function souvenirsPanel(sim) {
  const items = (sim.m6?.souvenirs ?? []).map((souvenir) => {
    const definition = SOUVENIR_DEFINITIONS[souvenir.type];
    const holder = (sim.colonists ?? []).find((colonist) => colonist.id === souvenir.holderId);
    const holderText = holder ? tr('m6SouvenirHolder', { name: holder.name }) : tr('m6SouvenirUnassigned');
    const material = souvenir.type === 'minerJournal' ? ` · ${tr(souvenir.preferredMaterial)}` : '';
    return `<li class="m6-souvenir-card" data-souvenir-id="${souvenir.id}">${souvenirIcon(souvenir)}
      <div><h3>${escapeHtml(tr(definition?.nameKey ?? 'm6Souvenirs'))}</h3>
      <p>${escapeHtml(tr('m6SouvenirAuthor', { name: souvenir.authorName }))}</p>
      <p>${escapeHtml(holderText)}${escapeHtml(material)}</p>
      <p class="m6-souvenir-effect">${escapeHtml(tr(definition?.effectKey ?? 'm6Souvenirs'))}</p></div>
    </li>`;
  }).join('');
  return `<div class="m6-backdrop"><section class="m6-souvenirs-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(tr('m6Souvenirs'))}">
    <div class="m6-panel-heading"><div><span class="eyebrow">${escapeHtml(tr('m6Memory'))}</span><h2>${escapeHtml(tr('m6Souvenirs'))}</h2></div>
    <button type="button" class="icon-button" data-m6-action="closeSouvenirs" aria-label="${escapeHtml(tr('close'))}">×</button></div>
    <p>${escapeHtml(tr('m6SouvenirsHelp'))}</p>
    <ul class="m6-souvenir-list">${items || `<li class="m6-empty">${escapeHtml(tr('m6NoSouvenirs'))}</li>`}</ul>
  </section></div>`;
}

function waterFact(label, value) {
  return `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function waterUnits(value) {
  return tr('m6bUnits', { value: formatNumber(value) });
}

function waterPerDay(value, signed = false) {
  const formatted = signed && value !== 0
    ? `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}` : formatNumber(value);
  return tr('m6bUnitsPerDay', { value: formatted });
}

function waterDays(value, none = 'unknown') {
  // Jours entiers écoulés, comme le compteur du HUD ; au-delà d'un an, comme lui.
  if (value === null || value === undefined) return tr(none);
  if (value > RESERVE_HORIZON_DAYS) return tr('m6bBeyondYear');
  return tr('m6bDays', { value: formatNumber(Math.floor(value), true) });
}

function waterDate(tick, none = 'unknown') {
  return tick === null || tick === undefined ? tr(none) : tr('date', calendarDate(tick));
}

// Pourquoi la filtration ne produit plus rien (station sans courant, sans
// ouvrier, sans eau sale, sans filtre, éteinte, en panne ou inondée).
const FILTRATION_STOP_KEYS = Object.freeze({
  broken: 'm6bFiltrationStop_broken',
  noPower: 'm6bFiltrationStop_noPower',
  noWorkers: 'm6bFiltrationStop_noWorkers',
  noDirtyWater: 'm6bFiltrationStop_noDirtyWater',
  noFilters: 'm6bFiltrationStop_noFilters',
  disabled: 'm6bFiltrationStop_disabled',
  flooded: 'm6bFiltrationStop_flooded',
});

export function waterPanel(model, excavations = []) {
  const pending = model.pendingWater;
  const stations = model.stations.map((station) => {
    const excavation = excavations.find((candidate) => candidate.id === station.id);
    const statusKey = station.status === 'active' ? 'm6bStationActive'
      : station.status === 'broken' ? 'm6bStationBroken'
      : station.status === 'disabled' ? 'm6bStationDisabled'
        : station.status === 'flooded' ? 'm6bStationFlooded'
          : station.status === 'noPower' ? 'm6bStationNoPower'
            : station.status === 'noWorkers' ? 'm6bStationNoWorkers'
              : station.status === 'noInput' ? 'm6bStationNoInput'
                : station.status === 'noFilters' ? 'm6bStationNoFilters'
                  : station.status === 'noAquifer' ? 'm6bStationNoAquifer' : 'm6bStationInactive';
    const capacity = station.storageCapacity !== null
      ? tr('m6bStorageCapacity', { value: formatNumber(station.storageCapacity, true) }) : waterPerDay(station.productionPerDay);
    const output = station.outputResource ? ` · ${tr(station.outputResource)}` : '';
    return `<li data-water-station-id="${station.id}" data-water-station-type="${escapeHtml(station.roomType)}"><div class="m6b-water-station-heading"><strong>${escapeHtml(excavationDisplayName(excavations, excavation ?? station.id))}</strong><span class="badge ${station.active ? 'green' : ''}">${escapeHtml(tr(statusKey))}</span></div><small>${escapeHtml(capacity)}${escapeHtml(output)}</small></li>`;
  }).join('');
  const wells = model.wells.map((well) => {
    const excavation = excavations.find((candidate) => candidate.id === well.id);
    const quality = tr(well.quality ? `waterQuality_${well.quality}` : 'm6bWaterQualityUnknown');
    const contamination = well.quality === 'radioactive' ? tr('m6bWellContaminated')
      : well.contaminationTick !== null ? tr('m6bWellContamination', { date: waterDate(well.contaminationTick) })
        : tr('m6bWellNoContamination');
    const countdown = well.daysUntilContamination === null ? '' : `<small>${escapeHtml(tr('m6bDaysUntilContamination', { value: formatNumber(well.daysUntilContamination) }))}</small>`;
    const depth = well.sandDepth === null ? '' : `<small>${escapeHtml(tr('m6bSandDepth', { value: formatNumber(well.sandDepth) }))}</small>`;
    return `<li data-water-well-id="${well.id}"><div class="m6b-water-well-heading"><strong>${escapeHtml(excavationDisplayName(excavations, excavation ?? well.id))}</strong><span class="badge ${well.quality === 'radioactive' ? 'red' : ''}">${escapeHtml(quality)}</span></div><small>${escapeHtml(contamination)}</small>${countdown}${depth}</li>`;
  }).join('');
  // Même date que le compteur du HUD : fin de l'eau propre au rythme réel, filtration
  // arrêtée quand les filtres seront épuisés. Un modèle ancien (sans ces champs)
  // garde l'ancienne date.
  const realRate = Object.hasOwn(model, 'cleanDepletionTick');
  const depletionTick = realRate ? model.cleanDepletionTick : model.depletionTickFromNetBalance ?? null;
  const beyondYear = realRate && model.cleanReserveDays !== null && model.cleanReserveDays > RESERVE_HORIZON_DAYS;
  const depletion = depletionTick === null ? tr('m6bNoDepletion')
    : beyondYear ? tr('m6bDepletionBeyondYear')
      : tr('m6bDepletion', { date: waterDate(depletionTick) });
  const net = realRate ? model.cleanNetPerDay : model.netBalancePerDay;
  const netLabel = !realRate ? 'm6bNetBalance' : model.measured ? 'm6bNetMeasured' : 'm6bNetEstimated';
  const filterDays = Object.hasOwn(model, 'filterDaysAtRealRate') ? model.filterDaysAtRealRate : model.filtrationDaysAtCurrentRate;
  const filtersEnd = filterDays !== null && filterDays > RESERVE_HORIZON_DAYS ? tr('m6bBeyondYear') : waterDate(model.filtersEndTick, 'm6bNoEnd');
  // Moins de 48 h de relevés : le solde est provisoire, le panneau le dit.
  const provisional = model.provisional
    ? `<p class="m6b-water-depletion" data-water-provisional>${escapeHtml(tr('m6bProvisional', { hours: Math.max(1, Math.ceil(48 - (model.measuredSpanHours ?? 24))) }))}</p>` : '';
  const stopKey = FILTRATION_STOP_KEYS[model.filtrationStop];
  const stop = stopKey
    ? `<p class="m6b-water-depletion" data-filtration-stop="${escapeHtml(model.filtrationStop)}">${escapeHtml(tr(stopKey))}</p>` : '';
  return `<section class="m6b-water-panel" data-water-panel aria-label="${escapeHtml(tr('m6bWaterPanel'))}">
    <div class="m6-panel-heading panel-heading"><div><span class="eyebrow">${escapeHtml(tr('m6bWaterPanelSubtitle'))}</span><h2>${escapeHtml(tr('m6bWaterPanel'))}</h2></div><button type="button" class="icon-button" data-m6-action="closeWater" aria-label="${escapeHtml(tr('close'))}">×</button></div>
    <div class="facts m6b-water-summary">
      ${waterFact(tr('m6bDrinkingWater'), waterUnits(model.drinkingWater))}
      ${waterFact(tr('m6bCleanDays'), waterDays(model.cleanReserveDays, 'm6bNoEnd'))}
      ${waterFact(tr('m6bDrinkingPerDay'), waterPerDay(model.drinkingPerDay))}
      ${waterFact(tr('m6bCropWater'), waterPerDay(model.cropWaterPerDay ?? 0))}
      ${waterFact(tr('m6bCleanProduction'), waterPerDay(model.cleanProductionPerDay))}
      ${waterFact(tr(netLabel, { hours: model.measuredHours ?? 24 }), waterPerDay(Math.round(net ?? 0), true))}
    </div>
    <p class="m6b-water-depletion" data-water-depletion-tick="${depletionTick ?? ''}">${escapeHtml(depletion)}</p>
    ${stop}
    ${provisional}
    <h3>${escapeHtml(tr('m6bPendingWater'))}</h3>
    <div class="facts m6b-water-pending">
      ${waterFact(tr('waterDirty'), waterUnits(pending.dirty))}
      ${waterFact(tr('waterRadioactive'), waterUnits(pending.radioactive))}
      ${waterFact(tr('waterGrey'), waterUnits(pending.grey))}
    </div>
    <div class="facts">
      ${waterFact(tr('m6bFiltersRemaining'), formatNumber(model.filtersRemaining))}
      ${waterFact(tr('m6bFiltrationDays'), waterDays(filterDays, 'm6bNoEnd'))}
      ${waterFact(tr('m6bFiltersEnd'), filtersEnd)}
      ${waterFact(tr('m6bFilterCapacity'), waterUnits(model.filterUnitsPerFilter))}
    </div>
    <h3>${escapeHtml(tr('m6bStations'))}</h3>
    <ul class="m6b-water-stations">${stations || `<li class="m6-empty">${escapeHtml(tr('m6bNoStations'))}</li>`}</ul>
    <h3>${escapeHtml(tr('m6bWells'))}</h3>
    <ul class="m6b-water-wells">${wells || `<li class="m6-empty">${escapeHtml(tr('m6bNoWells'))}</li>`}</ul>
    <p class="muted m6b-water-note">${escapeHtml(tr('m6bReserveNote'))}</p>
  </section>`;
}

export class M6Panels {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.sim = game.sim;
    this.notebookHidden = false;
    this.modal = null;
    this.waterOpen = false;
    this.signature = '';
    // Headless games (tests, tools) have no DOM to draw the notebook into.
    this.root = typeof document !== 'undefined' && typeof document.createElement === 'function' ? document.createElement('div') : null;
    if (!this.root) return;
    this.root.id = 'm6-panels';
    document.querySelector('#game-shell')?.append(this.root);
    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-m6-action]');
      if (button) this.handleAction(button.dataset.m6Action);
    });
  }

  openWater() {
    this.waterOpen = true;
    this.refresh(true);
    return true;
  }

  handleAction(action) {
    if (action === 'toggleNotebook') {
      this.notebookHidden = !this.notebookHidden;
    } else if (action === 'souvenirs') {
      this.modal = 'souvenirs';
    } else if (action === 'closeSouvenirs') {
      this.modal = null;
    } else if (action === 'openWater') {
      this.waterOpen = true;
    } else if (action === 'closeWater') {
      this.waterOpen = false;
    } else {
      return false;
    }
    this.refresh(true);
    return true;
  }

  close() {
    if (!this.modal && !this.waterOpen) return false;
    this.modal = null;
    this.waterOpen = false;
    this.refresh(true);
    return true;
  }

  refresh(force = false) {
    if (this.sim !== this.game.sim) {
      this.sim = this.game.sim;
      this.modal = null;
      this.waterOpen = false;
      this.signature = '';
    }
    if (!this.root) return;
    const hiddenByScreen = Boolean(this.game.m6Shell?.titleVisible || this.sim.exodus?.result);
    this.root.hidden = hiddenByScreen;
    if (hiddenByScreen) return;
    const notebook = notebookModel(this.sim);
    const water = this.waterOpen ? waterChainModel(this.sim) : null;
    const signature = JSON.stringify({ notebook, hidden: this.notebookHidden, modal: this.modal, waterOpen: this.waterOpen, water, souvenirs: this.sim.m6?.souvenirs ?? [] });
    if (!force && signature === this.signature) return;
    this.signature = signature;
    const reopen = `<button type="button" id="m6-notebook-reopen" data-m6-action="toggleNotebook">${tr('m6Notebook')}</button>`;
    this.root.innerHTML = `${this.notebookHidden ? reopen : notebookPanel(notebook)}${this.modal === 'souvenirs' ? souvenirsPanel(this.sim) : ''}${water ? waterPanel(water, this.sim.excavations) : ''}`;
  }
}

import { FITTABLE_ROOMS } from '../data/rooms.js';
import { tr } from '../data/strings.fr.js';
import { fittingModel, formatReserveDays, reserveStatusModel, roomProductionModel } from './models.js';
import { formatNumber } from './tooltips.js';
import { charterPanel, researchPanel } from './socialPanels.js';
import { surfacePanel } from './m4Panels.js';

const LININGS = ['none', 'timber', 'bolts', 'steelArch', 'shotcrete', 'boltsShotcrete'];
const COATINGS = ['none', 'waterproof', 'insulation', 'leadLining', 'whitewash'];
const KINDS = ['room', 'gallery', 'shaft', 'quarry'];
const ROOM_GROUPS = Object.freeze([
  { key: 'living', rooms: ['dorm', 'infirmary', 'commons', 'school', 'chapel', 'archive', 'workshop', 'lab', 'exodusDepot', 'ossuary', 'storage'] },
  { key: 'food', category: 'food' },
  { key: 'water', category: 'water' },
  { key: 'air', category: 'air' },
  { key: 'energy', rooms: ['diesel', 'bikeDynamo', 'microHydro', 'geothermal', 'rtg', 'battery', 'surfaceSolar', 'heater', 'heatExchanger', 'elevator'] },
]);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function options(keys, selected, sim = null) {
  return keys.map((key) => {
    const researchLocked = sim && (key === 'boltsShotcrete' || ['insulation', 'leadLining', 'whitewash'].includes(key))
      && !(sim.research?.completed ?? []).includes(key);
    return `<option value="${key}" ${key === selected ? 'selected' : ''} ${researchLocked ? 'disabled' : ''} title="${escapeHtml(researchLocked ? tr('researchLocked') : tr(key))}">${escapeHtml(tr(key))}</option>`;
  }).join('');
}

function fittingValues(definition) {
  return {
    w: definition.minW,
    h: definition.minH,
    kinds: (definition.kinds ?? ['room']).map((kind) => tr(kind)).join(', '),
  };
}

function roomOptions(selected, sim, excavation) {
  return ROOM_GROUPS.map((group) => {
    const keys = FITTABLE_ROOMS.filter((key) => {
      const definition = roomProductionModel({ roomType: key }).definition;
      return group.rooms ? group.rooms.includes(key) : definition?.category === group.category;
    }).sort((a, b) => tr(a).localeCompare(tr(b), 'fr'));
    const entries = keys.map((key) => {
      const model = fittingModel(sim, excavation, key);
      const disabled = Boolean(excavation && !model.ok);
      const reason = disabled ? tr(model.error, fittingValues(model.definition)) : tr(key);
      return `<option value="${key}" ${key === selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} title="${escapeHtml(reason)}">${escapeHtml(tr(key))}</option>`;
    }).join('');
    const label = `${tr(`categoryIcon_${group.key}`)} ${tr(`category_${group.key}`)}`;
    return `<optgroup label="${escapeHtml(label)}" data-category="${group.key}">${entries}</optgroup>`;
  }).join('');
}

function fittingDetails(sim, excavation, roomType, explicitError = null) {
  const model = fittingModel(sim, excavation, roomType);
  if (!model.definition) return `<p class="fit-status red">${escapeHtml(tr(model.error ?? 'invalidPlacement'))}</p>`;
  const definition = model.definition;
  const requirements = tr('roomMinSize', {
    w: formatNumber(definition.minW, true),
    h: formatNumber(definition.minH, true),
  });
  const cost = Object.entries(definition.cost).map(([key, amount]) => `${escapeHtml(tr(key))} ${formatNumber(amount, true)}`).join(' · ');
  // Avec la largeur réelle de la salle visée : une culture large rend davantage.
  const production = roomProductionModel({ roomType, w: excavation?.w }).entries.slice(0, 2)
    .map((entry) => escapeHtml(tr(entry.code, { ...entry.values, value: formatNumber(entry.values.value) }))).join(' · ');
  const error = explicitError ?? model.error;
  const values = { w: definition.minW, h: definition.minH, kinds: (definition.kinds ?? ['room']).map((kind) => tr(kind)).join(', ') };
  const status = error
    ? `<p class="fit-status red" role="alert">${escapeHtml(tr(error, values))}</p>`
    : `<p class="fit-status green">${escapeHtml(tr('fitReady'))}</p>`;
  const missing = model.missing.length
    ? `<ul class="fit-missing">${model.missing.map((entry) => `<li>${escapeHtml(tr('missingResource', {
      resource: tr(entry.key), required: formatNumber(entry.required, true), available: formatNumber(entry.available, true),
    }))}</li>`).join('')}</ul>` : '';
  return `<dl class="fit-facts"><div><dt>${escapeHtml(tr('minimumSize'))}</dt><dd>${escapeHtml(requirements)}</dd></div><div><dt>${escapeHtml(tr('cost'))}</dt><dd>${cost || escapeHtml(tr('noCost'))}</dd></div>${production ? `<div><dt>${escapeHtml(tr('production'))}</dt><dd>${production}</dd></div>` : ''}</dl>${status}${missing}`;
}

export class BuildMenu {
  constructor(game, ui, root = document.querySelector('#build-menu')) {
    this.game = game;
    this.ui = ui;
    this.root = root;
    this.tab = 'dig';
    this.digSettings = { kind: 'room', shape: 'flat', lining: 'none' };
    this.supportLining = 'timber';
    this.coating = 'waterproof';
    this.propMaterial = 'wood';
    this.roomType = FITTABLE_ROOMS[0] ?? 'dorm';
    this.fitError = null;
    this.build();
    this.root?.addEventListener('click', (event) => this.onClick(event));
    this.root?.addEventListener('change', (event) => this.onChange(event));
    this.refresh();
  }

  build() {
    if (!this.root) return;
    this.root.innerHTML = `<div class="menu-tabs" role="tablist">
      <button type="button" data-tab="dig" class="active" role="tab">${tr('dig')}</button>
      <button type="button" data-tab="fit" role="tab">${tr('fit')}</button>
      <button type="button" data-tab="support" role="tab">${tr('support')}</button>
      <button type="button" data-tab="surface" role="tab">${tr('surfaceTab')}</button>
      <button type="button" data-tab="charter" role="tab">${tr('charter')}</button>
      <button type="button" data-tab="research" role="tab">${tr('research')}</button>
    </div>
    <div class="menu-page" data-page="dig">
      <div class="tool-grid">${KINDS.map((kind) => `<button type="button" data-kind="${kind}" title="${escapeHtml(tr(`${kind}Hint`))}"><span class="tool-mark ${kind}" aria-hidden="true"></span><span>${escapeHtml(tr(kind))}</span></button>`).join('')}</div>
      <p class="tool-hint" data-kind-hint>${tr('roomHint')}</p>
      <label>${tr('shape')}<select data-setting="shape" aria-label="${tr('shape')}">${options(['flat', 'vault', 'round'], 'flat')}</select></label>
      <label>${tr('lining')}<select data-setting="digLining" aria-label="${tr('lining')}">${options(LININGS, 'none')}</select></label>
      <p class="menu-note">${tr('previewHelp')}</p>
    </div>
    <div class="menu-page" data-page="fit" hidden>
      <p class="menu-note fit-intro">${tr('fitHelp')}</p>
      <div class="fit-threats" data-fit-threats></div>
      <label>${tr('roomType')}<select data-setting="roomType" aria-label="${tr('roomType')}">${roomOptions(this.roomType, this.game.sim, null)}</select></label>
      <div class="fit-details" data-fit-details></div>
      <button type="button" class="wide primary" data-action="fit">${tr('fitRoom')}</button>
    </div>
    <div class="menu-page" data-page="support" hidden>
      <label>${tr('lining')}<select data-setting="supportLining">${options(LININGS.filter((key) => key !== 'none'), 'timber')}</select></label>
      <button type="button" class="wide primary" data-action="lining">${tr('reinforce')}</button>
      <label>${tr('coating')}<select data-setting="coating">${options(COATINGS, 'waterproof')}</select></label>
      <button type="button" class="wide" data-action="coating">${tr('applyCoating')}</button>
      <label>${tr('propMaterial')}<select data-setting="propMaterial">${options(['wood', 'metal', 'concrete'], 'wood')}</select></label>
      <button type="button" class="wide" data-action="prop">${tr('prop')}</button>
      <div class="support-actions"><button type="button" data-action="repair">${tr('repair')}</button><button type="button" data-action="door">${tr('door')}</button></div>
      <button type="button" class="wide danger-button" data-action="cancel">${tr('cancelDig')}</button>
      <p class="menu-note">${tr('noTarget')}</p>
    </div>
    <div class="menu-page surface-page" data-page="surface" hidden><div data-surface-panel></div></div>
    <div class="menu-page social-page" data-page="charter" hidden><div data-charter-panel></div></div>
    <div class="menu-page social-page" data-page="research" hidden><div data-research-panel></div></div>
    <div class="persistence"><h2>${tr('persistence')}</h2><div><button type="button" data-action="save">${tr('save')}</button><button type="button" data-action="load">${tr('load')}</button><button type="button" data-action="export-save">${tr('exportSave')}</button><button type="button" data-action="import-save">${tr('importSave')}</button></div></div>
    <button type="button" class="wide select-tool" data-action="select">${tr('selectTool')}</button>`;
  }

  setTab(tab) {
    this.tab = tab;
    this.root?.classList?.toggle('charter-open', tab === 'charter');
    this.root?.classList?.toggle('research-open', tab === 'research');
    this.root?.classList?.toggle('surface-open', tab === 'surface');
    for (const button of this.root?.querySelectorAll('[data-tab]') ?? []) {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const page of this.root?.querySelectorAll('[data-page]') ?? []) page.hidden = page.dataset.page !== tab;
  }

  onClick(event) {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      this.setTab(tab.dataset.tab);
      if (['fit', 'surface', 'charter', 'research'].includes(tab.dataset.tab)) this.game.setTool({ type: 'select' });
      if (tab.dataset.tab === 'surface') {
        if (this.game.setOverlay) this.game.setOverlay('radiation');
        else this.game.overlay = 'radiation';
      }
      this.refresh();
      return;
    }
    const m4Button = event.target.closest('[data-m4-action]');
    if (m4Button && this.ui.m4Panels?.handleAction(m4Button.dataset.m4Action, m4Button)) return;
    const threatButton = event.target.closest('[data-overlay-target]');
    if (threatButton) {
      this.ui.openReserve?.(threatButton.dataset.overlayTarget);
      if (!this.ui.openReserve) {
        if (this.game.setOverlay) this.game.setOverlay(threatButton.dataset.overlayTarget);
        else this.game.overlay = threatButton.dataset.overlayTarget;
      }
      this.refresh();
      return;
    }
    const kindButton = event.target.closest('[data-kind]');
    if (kindButton) {
      this.digSettings.kind = kindButton.dataset.kind;
      this.game.setTool({ type: 'dig', ...this.digSettings });
      this.game.overlay = 'constraints';
      this.refresh();
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'law' || action === 'research') {
      const order = action === 'law'
        ? { type: 'law', lawId: button.dataset.lawId }
        : { type: 'research', nodeId: button.dataset.nodeId };
      const result = this.game.apply(order);
      if (!result?.ok) this.ui.toast(result?.error ?? 'actionFailed');
      this.refresh();
      return;
    }
    const excavationId = this.game.selection?.type === 'excavation' ? this.game.selection.id : null;
    if (action === 'select') this.game.setTool({ type: 'select' });
    else if (action === 'save') this.game.saveLocal();
    else if (action === 'load') this.game.loadLocal();
    else if (action === 'export-save') this.ui.exportSave();
    else if (action === 'import-save') this.ui.importSave();
    else if (action === 'fit') {
      const selectedExcavation = excavationId === null ? null : this.game.sim.excavation(excavationId);
      const result = this.ui.applyOrder({ type: 'fit', excavationId, roomType: this.roomType });
      this.fitError = result?.ok ? null : fittingModel(this.game.sim, selectedExcavation, this.roomType).error ?? result?.error ?? 'actionFailed';
      if (!result?.ok) this.ui.toast(this.fitError);
    } else if (action === 'lining') this.ui.applyOrder({ type: 'lining', excavationId, lining: this.supportLining });
    else if (action === 'coating') this.ui.applyOrder({ type: 'coating', excavationId, coating: this.coating });
    else if (action === 'repair' || action === 'cancel') this.ui.applyOrder({ type: action, excavationId });
    else if (action === 'prop') this.game.setTool({ type: 'support', excavationId, material: this.propMaterial });
    else if (action === 'door') this.game.setTool({ type: 'door', excavationId });
    this.refresh();
  }

  onChange(event) {
    if (this.ui.m4Panels?.handleChange(event.target)) return;
    const setting = event.target.dataset.setting;
    if (!setting) return;
    const value = event.target.value;
    if (setting === 'shape' || setting === 'digLining') {
      if (setting === 'shape') this.digSettings.shape = value;
      else this.digSettings.lining = value;
      if (this.game.tool.type === 'dig') this.ui.changeTool({ [setting === 'shape' ? 'shape' : 'lining']: value });
      else this.game.setTool({ type: 'dig', ...this.digSettings });
      this.game.overlay = 'constraints';
    } else if (setting === 'supportLining') this.supportLining = value;
    else if (setting === 'coating') this.coating = value;
    else if (setting === 'propMaterial') this.propMaterial = value;
    else if (setting === 'roomType') {
      this.roomType = value;
      this.fitError = null;
    }
    this.refresh();
  }

  refresh() {
    if (!this.root) return;
    if (['support', 'door'].includes(this.game.tool.type) && this.tab !== 'support') this.setTab('support');
    for (const button of this.root.querySelectorAll('[data-kind]')) {
      const active = this.game.tool.type === 'dig' && this.game.tool.kind === button.dataset.kind;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    const hint = this.root.querySelector('[data-kind-hint]');
    if (hint) hint.textContent = tr(`${this.game.tool.kind ?? this.digSettings.kind}Hint`);
    if (this.game.tool.type === 'dig') {
      this.digSettings = {
        kind: this.game.tool.kind,
        shape: this.game.tool.shape ?? 'flat',
        lining: this.game.tool.lining ?? 'none',
      };
    }
    const optionSets = {
      digLining: LININGS,
      supportLining: LININGS.filter((key) => key !== 'none'),
      coating: COATINGS,
    };
    for (const [setting, keys] of Object.entries(optionSets)) {
      const control = this.root.querySelector(`[data-setting="${setting}"]`);
      if (control) control.innerHTML = options(keys, control.value, this.game.sim);
    }
    const values = { shape: this.digSettings.shape, digLining: this.digSettings.lining, supportLining: this.supportLining, coating: this.coating, propMaterial: this.propMaterial, roomType: this.roomType };
    for (const [setting, value] of Object.entries(values)) {
      const control = this.root.querySelector(`[data-setting="${setting}"]`);
      if (control && control.value !== value) control.value = value;
    }
    const selectedExcavation = this.game.selection?.type === 'excavation' ? this.game.sim.excavation(this.game.selection.id) : null;
    const roomTypeControl = this.root.querySelector('[data-setting="roomType"]');
    if (roomTypeControl) {
      roomTypeControl.innerHTML = roomOptions(this.roomType, this.game.sim, selectedExcavation);
      roomTypeControl.value = this.roomType;
    }
    const reserves = reserveStatusModel(this.game.sim);
    const threats = this.root.querySelector('[data-fit-threats]');
    if (threats) threats.innerHTML = ['air', 'water'].map((key) => {
      const overlay = key === 'air' ? 'air' : 'water';
      return `<button type="button" class="threat-link ${reserves[key].severity}" data-reserve-link="${key}" data-overlay-target="${overlay}" title="${escapeHtml(tr('threatLayerHint', { overlay: tr(key === 'air' ? 'airOverlay' : 'waterOverlay') }))}">${escapeHtml(tr(key === 'air' ? 'fitThreatAir' : 'fitThreatWater', { days: formatReserveDays(reserves[key]) }))}</button>`;
    }).join('');
    const hasExcavation = Boolean(selectedExcavation && selectedExcavation.state !== 'collapsed');
    for (const action of ['lining', 'coating', 'repair', 'prop', 'door', 'cancel']) {
      const button = this.root.querySelector(`[data-action="${action}"]`);
      if (button) button.disabled = !hasExcavation;
    }
    const fitDetails = this.root.querySelector('[data-fit-details]');
    if (fitDetails) fitDetails.innerHTML = fittingDetails(this.game.sim, selectedExcavation, this.roomType, this.fitError);
    const fitButton = this.root.querySelector('[data-action="fit"]');
    if (fitButton) fitButton.disabled = !fittingModel(this.game.sim, selectedExcavation, this.roomType).ok;
    const surface = this.root.querySelector('[data-surface-panel]');
    if (surface && this.ui.m4Panels) surface.innerHTML = surfacePanel(this.game.sim, this.ui.m4Panels.surfaceState());
    const charter = this.root.querySelector('[data-charter-panel]');
    if (charter) charter.innerHTML = charterPanel(this.game.sim);
    const research = this.root.querySelector('[data-research-panel]');
    if (research) research.innerHTML = researchPanel(this.game.sim);
  }
}

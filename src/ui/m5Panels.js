import { TIME } from '../data/balance.js';
import { DILEMMAS_FULL as DILEMMAS, dilemmaDefinition } from '../data/dilemmas.js';
import { dilemmaPreviewText } from '../data/dilemmaPreviewText.js';
import { ENCOUNTER_CHOICES } from '../data/poi/rules.js';
import { getLanguage, tr } from '../data/strings.fr.js';
import { calendarDate, excavationDisplayName } from './models.js';
import { formatDose, formatNumber } from './tooltips.js';
import { formatJournalEntry, formatRadioMessage } from './journal.js';
import { calendarEventArt, colonistPortraitMarkup, dilemmaArt, iconMarkup, neighborArt, paintM5Illustrations } from '../render/m5Illustrations.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function shell(content, className = '') {
  return `<div class="m4-backdrop m5-backdrop"><section class="m4-dialog ${className}" role="dialog" aria-modal="true">${content}</section></div>`;
}

function closeButton() {
  return `<button type="button" class="icon-button" data-m5-action="close" aria-label="${escapeHtml(tr('close'))}">×</button>`;
}

function date(tick) {
  return tr('date', calendarDate(tick));
}

export function calendarPanel(sim) {
  const calendar = sim.m5.calendar;
  const rows = calendar.forecast.map((day, index) => {
    const events = day.events.map((event) => {
      if (event.type === 'thawWarning') return tr('eventThawWarning', { days: 10, meters: event.riseMeters, duration: event.durationDays });
      if (event.type === 'thaw') return tr('calendarThaw', { meters: event.riseMeters, days: event.durationDays });
      if (event.type === 'thawEnd') return tr('eventThawEnd');
      if (event.type === 'harvest') return tr('calendarHarvest');
      if (event.type === 'blackRain') return tr('calendarBlackRain');
      return tr(event.labelKey ?? `season${event.season?.[0]?.toUpperCase()}${event.season?.slice(1)}`);
    }).join(' · ');
    const water = day.thawActive ? ` · ${formatNumber(day.waterTableDelta)} m` : '';
    const icons = [...new Set(day.events.map(calendarEventArt).filter(Boolean))].map((name) => iconMarkup(name)).join('');
    const label = `${date(day.tick)} · ${tr(day.labelKey)}${water}${events ? ` · ${events}` : ''}`;
    return `<tr class="m5-calendar-day ${events ? 'm5-marked' : ''}" data-calendar-day="${index}"><th scope="row">
      <button type="button" class="m5-day-button" aria-label="${escapeHtml(label)}" aria-describedby="m5-day-detail-${index}">
        <span class="m5-day-number">${calendarDate(day.tick).day}</span>${iconMarkup(day.season)}<span class="m5-day-events">${icons}</span>
      </button></th><td>
      <div class="m5-day-detail" id="m5-day-detail-${index}" role="tooltip"><strong>${escapeHtml(date(day.tick))}</strong><span>${escapeHtml(tr('season'))} : ${escapeHtml(tr(day.labelKey))}${escapeHtml(water)}</span><span>${escapeHtml(tr('events'))}${events ? ` : ${escapeHtml(events)}` : ''}</span></div>
    </td></tr>`;
  }).join('');
  const water = calendar.waterTable;
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr(calendar.labelKey))}</span><h2>${escapeHtml(tr('calendarNext30Days'))}</h2></div>${closeButton()}</div>
    <p class="m5-current">${escapeHtml(tr(calendar.labelKey))} · ${escapeHtml(date(sim.tick))} · ${escapeHtml(tr('waterTableLevel', { value: formatNumber(water.level) }))}</p>
    ${water.nextRiseStartTick ? `<p class="m4-warning">${escapeHtml(tr('calendarThaw', { meters: water.riseMeters, days: water.durationDays }))} · ${escapeHtml(date(water.nextRiseStartTick))}</p>` : ''}
    <table class="m5-calendar" aria-label="${escapeHtml(tr('calendarNext30Days'))}"><thead><tr><th>${escapeHtml(tr('dateShort', { day: 1, hour: 0, minute: 0 }).split('·')[0])}</th><th>${escapeHtml(tr('season'))} · ${escapeHtml(tr('events'))}</th></tr></thead><tbody class="m5-calendar-track">${rows}</tbody></table>`;
}

export function radioPanel(sim) {
  const radio = sim.m5.radio;
  const messages = radio.messages.slice(-8).reverse().map((message) => {
    const expedition = (sim.expeditions?.active ?? []).find((item) => item.id === message.expeditionId);
    const portraits = (expedition?.colonistIds ?? []).filter((id) => sim.colonists.some((person) => person.id === id))
      .map((id) => colonistPortraitMarkup(id, 'm5-radio-portrait')).join('');
    return `<li><time>${escapeHtml(date(message.tick))}</time><span>${portraits}${escapeHtml(formatRadioMessage(message))}</span></li>`;
  }).join('');
  const neighbors = radio.neighbors.map((neighbor) => {
    const art = neighborArt(neighbor);
    const emblemKind = art === 'silent' && neighbor.alive !== false && neighbor.fate !== 'silent'
      && ['lock', 'printshop'].includes(neighbor.kind) ? neighbor.kind : art;
    const emblem = `<canvas class="m5-emblem" data-m5-emblem="${emblemKind}" width="96" height="96" aria-hidden="true"></canvas>`;
    return `<li class="${neighbor.alive ? 'green' : 'yellow'}"><strong>${emblem}${escapeHtml(tr(neighbor.nameKey))}</strong><span>${escapeHtml(tr(neighbor.voiceKey))}</span><small>${escapeHtml(tr(neighbor.fate === 'surviving' ? 'radioFateSurviving' : neighbor.fate === 'silent' ? 'radioFateSilent' : 'radioFateUnknown'))}</small></li>`;
  }).join('');
  const trades = radio.trades.filter((trade) => trade.state === 'offered').map((trade) => `<button type="button" data-m5-action="tradeAccept" data-trade-id="${trade.id}">${escapeHtml(tr('radioTradeAccept', { give: formatResources(trade.give), receive: formatResources(trade.receive) }))}</button>`).join('');
  const expeditions = (sim.expeditions?.active ?? []).filter((expedition) => expedition.state !== 'returning').map((expedition) => `<button type="button" data-m5-action="expeditionRecall" data-expedition-id="${expedition.id}">${escapeHtml(tr('radioExpeditionRecall'))}</button>`).join('');
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr('radioSignal', { value: radio.strength }))}</span><h2>${escapeHtml(tr('radio'))}</h2></div>${closeButton()}</div>
    ${radio.receiving ? '' : `<p class="m4-warning">${escapeHtml(tr('radioOffline'))}</p>`}
    <div class="m5-columns"><section><h3>${escapeHtml(tr('radioNeighbors'))}</h3><ul class="m5-neighbors">${neighbors}</ul>${trades ? `<h3>${escapeHtml(tr('radioTrades'))}</h3><div class="m5-actions">${trades}</div>` : ''}${expeditions ? `<h3>${escapeHtml(tr('activeExpeditions'))}</h3><div class="m5-actions">${expeditions}</div>` : ''}</section>
    <section><h3>${escapeHtml(tr('radioMessages'))}</h3><ol class="m5-messages">${messages || `<li>${escapeHtml(tr('radioNoMessages'))}</li>`}</ol></section></div>`;
}

function formatResources(resources) {
  return Object.entries(resources ?? {}).map(([resource, amount]) => `${formatNumber(amount, true)} ${tr(resource).toLocaleLowerCase(getLanguage())}`).join(' · ');
}

function dilemmaDefinitionFor(pending) {
  return dilemmaDefinition(pending.definitionId) ?? pending.definition ?? DILEMMAS[0];
}

export function dilemmaPanel(pending, sim = null, { embedded = false } = {}) {
  const definition = dilemmaDefinitionFor(pending);
  const target = pending.target ?? {};
  const portrait = !embedded && target.colonistId !== undefined ? `<canvas class="portrait" data-colonist-id="${target.colonistId}" width="72" height="72" aria-hidden="true"></canvas>` : '';
  return `<div class="panel-heading"><div><span class="eyebrow">${embedded ? '' : iconMarkup(sim?.m5?.storyteller?.mode)}${escapeHtml(tr('dilemma'))}</span><h2>${escapeHtml(tr(pending.titleKey, target))}</h2></div>${embedded ? '' : `<canvas class="m5-vignette" data-m5-vignette="${dilemmaArt(pending.definitionId ?? pending.definition?.id)}" width="320" height="180" aria-hidden="true"></canvas>`}</div>
    <div class="m5-dilemma-intro">${portrait}<p>${escapeHtml(tr(pending.bodyKey, target))}</p></div>
    <div class="encounter-choices">${pending.choices.map((choice, index) => {
      const consequence = dilemmaDefinition(pending.definitionId)
        ? dilemmaPreviewText(definition.choices[index], tr, target) : tr(choice.consequenceKey, target);
      return `<button type="button" data-m5-action="dilemmaChoice" data-choice-index="${index}"><span>${escapeHtml(tr('encounterChoice'))} ${index + 1}</span><strong>${escapeHtml(tr(choice.textKey, target))}</strong><small>${escapeHtml(consequence)}</small></button>`;
    }).join('')}</div>`;
}

function poiEncounterPanel(encounter) {
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr('encounterTitle'))}</span><h2>${escapeHtml(tr('poiEncounterDialogue'))}</h2></div></div>
    <div class="encounter-choices">${ENCOUNTER_CHOICES.map((choice, index) => `<button type="button" data-m5-action="poiChoice" data-choice-index="${index}"><span>${escapeHtml(tr('encounterChoice'))} ${index + 1}</span><strong>${escapeHtml(tr(choice.labelKey))}</strong><small>${escapeHtml(tr(choice.descriptionKey))}</small></button>`).join('')}</div>`;
}

export function discoveriesPanel(sim) {
  const poi = sim.m5.poi;
  const items = poi.items.filter((item) => item.discovered).map((item) => {
    const nameKey = `poi${item.type[0].toUpperCase()}${item.type.slice(1)}Name`;
    const name = tr(nameKey);
    const actions = [];
    if (item.annexId) actions.push(`<button type="button" data-m5-action="annexExplore" data-annex-id="${item.annexId}">${escapeHtml(tr('annexExplore'))}</button>`);
    if (item.type === 'animalBurrow' && !item.domesticated) actions.push(`<button type="button" data-m5-action="domesticateAnimals" data-poi-id="${item.id}">${escapeHtml(tr('domesticateAnimals'))}</button>`);
    const annex = poi.annexes.find((candidate) => candidate.id === item.annexId);
    const progress = annex ? `<small>${escapeHtml(tr('annexProgress', { explored: annex.exploredCount, total: annex.cells.length }))}</small>` : '';
    return `<li><strong>${escapeHtml(name)}</strong><small>${escapeHtml(tr(item.discoveryMethod === 'sonar' ? 'poiSensed' : 'poiDiscovered'))}</small>${progress}<span class="m5-actions">${actions.join('')}</span></li>`;
  }).join('');
  const finds = poi.finds.slice(-6).reverse().map((find) => `<li><canvas class="m5-find-art" data-m5-find="${escapeHtml(find.kind)}" width="48" height="48" aria-hidden="true"></canvas><time>${escapeHtml(date(find.tick))}</time><span>${escapeHtml(tr(find.textKey))}</span></li>`).join('');
  const signals = (poi.scans.at(-1)?.signals ?? []).map((signal) => `<li>${escapeHtml(tr(`sonar${signal.kind[0].toUpperCase()}${signal.kind.slice(1)}`))} · ${signal.x}, ${signal.y}</li>`).join('');
  const center = sim.surface?.hatch ?? { x: 48, y: 28 };
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr('discoveries'))}</span><h2>${escapeHtml(tr('discoveriesAndFinds'))}</h2></div>${closeButton()}</div>
    <section><h3>${escapeHtml(tr('sonar'))}</h3><div class="m5-sonar-form"><label>X <input type="number" data-m5-sonar-x value="${center.x}" min="0" max="95"></label><label>Y <input type="number" data-m5-sonar-y value="${center.y}" min="12" max="410"></label><button type="button" data-m5-action="sonarScan">${escapeHtml(tr('sonarScan'))}</button></div><p class="menu-note">${escapeHtml(tr('sonarHelp'))}</p>${signals ? `<h3>${escapeHtml(tr('sonarSignals'))}</h3><ul class="m5-discoveries">${signals}</ul>` : ''}</section>
    <div class="m5-columns"><section><h3>${escapeHtml(tr('poiList'))}</h3><ul class="m5-discoveries">${items || `<li>${escapeHtml(tr('noDiscovery'))}</li>`}</ul></section><section><h3>${escapeHtml(tr('finds'))}</h3><ol class="m5-messages">${finds || `<li>${escapeHtml(tr('noFind'))}</li>`}</ol></section></div>`;
}

function reportTitle(report, sim) {
  const source = sim.excavations.find((room) => report.rescueSourceId != null && room.id === report.rescueSourceId)
    ?? sim.excavations.find((room) => report.id != null && room.collapseReportId === report.id);
  return report.colonistId !== undefined
    ? tr('whyDeath', { name: report.name ?? tr('colonistNumber', { id: report.colonistId + 1 }) })
    : tr('collapseCauseNamedTitle', { name: excavationDisplayName(sim.excavations, source ?? report.originalExcavationId ?? report.excavationId) });
}

export function causeReportsPanel(sim) {
  const reports = [...sim.m5.causes.deaths, ...sim.m5.causes.collapses].sort((a, b) => a.tick - b.tick
    || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const items = reports.map((report) => `<li><time>${escapeHtml(date(report.tick))}</time><button type="button" data-m5-action="causeReport" data-report-id="${escapeHtml(report.id)}">${escapeHtml(reportTitle(report, sim))}</button></li>`).join('');
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr('why'))}</span><h2>${escapeHtml(tr('causeChain'))}</h2></div>${closeButton()}</div>
    <ol class="m5-cause-reports">${items || `<li>${escapeHtml(tr('noCauseReport'))}</li>`}</ol>`;
}

export function causePanel(report, sim, options = {}) {
  const title = reportTitle(report, sim);
  const causes = (report.causes ?? []).map((cause) => tr(cause.code ?? cause)).join(', ');
  const steps = (report.steps ?? []).map((entry) => `<li class="${entry.level}"><time>${escapeHtml(date(entry.tick))}</time><span>${escapeHtml(formatJournalEntry(entry, sim.excavations, { sim }))}</span></li>`).join('');
  const stress = report.stress ? `<dl class="fit-facts"><div><dt>${escapeHtml(tr('stress'))}</dt><dd>${formatNumber(report.stress.ratio)}</dd></div><div><dt>${escapeHtml(tr('span'))}</dt><dd>${formatNumber(report.stress.span)} / ${formatNumber(report.stress.maxSpan)} m</dd></div><div><dt>${escapeHtml(tr('slab'))}</dt><dd>${formatNumber(report.stress.slab)} / ${formatNumber(report.stress.requiredSlab)} m</dd></div></dl>` : '';
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr('why'))}</span><h2>${escapeHtml(title)}</h2></div>${options.embedded ? '' : colonistPortraitMarkup(report.colonistId, 'm5-cause-portrait')}${options.embedded ? '' : closeButton()}</div>
    ${causes ? `<p class="m4-warning">${escapeHtml(causes)}</p>` : ''}${stress}
    ${report.acceptedDilemmaId ? `<p>${escapeHtml(tr('acceptedDilemma', { id: report.acceptedDilemmaId }))}</p>` : ''}
    <h3>${escapeHtml(tr('causeChain'))}</h3><ol class="m5-cause-chain">${steps || `<li>${escapeHtml(tr('noAlertInChain'))}</li>`}</ol>`;
}

export function roomHazardPanel(sim, excavation) {
  const hazards = sim.m5?.hazards ?? { fires: [], gas: {} };
  const fires = hazards.fires.filter((fire) => fire.excavationId === excavation.id && fire.state === 'burning');
  const gas = hazards.gas[excavation.id] ?? { smoke: 0, methane: 0 };
  const fireActions = fires.map((fire) => `<button type="button" class="danger-button" data-m5-action="fireExtinguish" data-fire-id="${fire.id}" data-excavation-id="${excavation.id}">${escapeHtml(tr('fireExtinguish'))}</button>`).join('');
  return `${fires.length || gas.smoke > 0 || gas.methane > 0 ? `<section class="m5-room-hazards"><h3>${escapeHtml(tr('hazards'))}</h3><div class="facts"><div class="fact"><span>${escapeHtml(tr('hazardSmoke'))}</span><strong>${formatNumber(gas.smoke)} %</strong></div><div class="fact"><span>${escapeHtml(tr('hazardMethane'))}</span><strong>${formatNumber(gas.methane)} %</strong></div></div><div class="m5-actions">${fireActions}</div></section>` : ''}`;
}

export class M5Panels {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.sim = game.sim;
    this.modal = null;
    this.modalSignature = null;
    const create = typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? (tag) => document.createElement(tag)
      : () => ({ addEventListener() {}, replaceChildren() {}, querySelector() { return null; }, innerHTML: '' });
    this.root = create('div');
    this.root.id = 'm5-panels';
    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-m5-action]');
      if (button) this.handleAction(button.dataset.m5Action, button);
    });
    if (typeof document !== 'undefined') (document.querySelector('#game-shell') ?? document.body)?.append?.(this.root);
    this.controls = create('div');
    this.controls.className = 'm5-hud-controls';
    this.controls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-m5-action]');
      if (button) this.handleAction(button.dataset.m5Action, button);
    });
    this.buildControls();
  }

  buildControls() {
    this.controls.innerHTML = `<span class="m5-season">${iconMarkup(this.sim.m5.calendar.season, 'data-m5-season-icon')}<span data-m5-season></span></span><button type="button" data-m5-action="calendar">${tr('calendar')}</button><button type="button" data-m5-action="radio">${tr('radio')}</button><button type="button" data-m5-action="discoveries">${tr('discoveries')}</button><button type="button" data-m5-action="causes">${tr('why')}</button>`;
    this.ui.root?.append?.(this.controls);
  }

  refreshLanguage() {
    this.buildControls();
    if (this.modal) this.renderModal();
  }

  open(type, values = {}) {
    if (this.sim.exodus?.result) return false;
    this.modal = { type, ...values };
    this.renderModal();
    if (['dilemma', 'poiEncounter'].includes(type) && this.game.speed !== 0) this.game.setSpeed(0);
    return true;
  }

  close(force = false) {
    if (!this.modal || (!force && ['dilemma', 'poiEncounter'].includes(this.modal.type))) return false;
    this.modal = null;
    this.modalSignature = null;
    this.root.replaceChildren();
    return true;
  }

  informationalSignature() {
    if (!['calendar', 'radio', 'discoveries', 'causes'].includes(this.modal?.type)) return null;
    const data = this.modal.type === 'calendar' ? this.sim.m5.calendar
      : this.modal.type === 'radio' ? { radio: this.sim.m5.radio, expeditions: this.sim.expeditions?.active ?? [] }
        : this.modal.type === 'discoveries' ? this.sim.m5.poi : this.sim.m5.causes;
    return JSON.stringify({
      type: this.modal.type,
      day: Math.floor(this.sim.tick / TIME.TICKS_PER_DAY),
      journal: this.sim.journal.at(-1)?.id ?? -1,
      data,
    });
  }

  captureViewState() {
    const inputs = ['x', 'y'].map((axis) => {
      const selector = `[data-m5-sonar-${axis}]`;
      const element = this.root.querySelector(selector);
      return element ? {
        selector, value: element.value,
        selectionStart: element.selectionStart, selectionEnd: element.selectionEnd,
      } : null;
    }).filter(Boolean);
    const scroll = ['.m4-dialog', '.m5-scroll'].map((selector) => ({
      selector, top: this.root.querySelector(selector)?.scrollTop ?? 0,
    }));
    const documentRef = this.root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    const active = documentRef?.activeElement;
    let focus = null;
    if (active && (this.root.contains?.(active) ?? true)) {
      if (active === this.root.querySelector('[data-m5-sonar-x]')) focus = '[data-m5-sonar-x]';
      else if (active === this.root.querySelector('[data-m5-sonar-y]')) focus = '[data-m5-sonar-y]';
      else if (active.dataset?.m5Action) {
        const keys = ['m5Action', 'choiceIndex', 'tradeId', 'expeditionId', 'annexId', 'poiId', 'reportId', 'fireId', 'excavationId'];
        focus = keys.filter((key) => active.dataset[key] !== undefined).map((key) => {
          const attribute = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
          const value = String(active.dataset[key]).replace(/["\\]/g, '\\$&');
          return `[data-${attribute}="${value}"]`;
        }).join('');
      }
    }
    return { inputs, scroll, focus };
  }

  restoreViewState(state) {
    for (const input of state.inputs) {
      const element = this.root.querySelector(input.selector);
      if (!element) continue;
      element.value = input.value;
      if (Number.isInteger(input.selectionStart) && Number.isInteger(input.selectionEnd)) {
        element.setSelectionRange?.(input.selectionStart, input.selectionEnd);
      }
    }
    if (state.focus) {
      const element = this.root.querySelector(state.focus);
      try { element?.focus?.({ preventScroll: true }); } catch { element?.focus?.(); }
    }
    for (const { selector, top } of state.scroll) {
      const element = this.root.querySelector(selector);
      if (element) element.scrollTop = top;
    }
  }

  renderModal() {
    if (!this.modal) {
      this.modalSignature = null;
      this.root.replaceChildren();
      return;
    }
    const view = this.captureViewState();
    let content = '';
    if (this.modal.type === 'calendar') content = calendarPanel(this.sim);
    else if (this.modal.type === 'radio') content = radioPanel(this.sim);
    else if (this.modal.type === 'discoveries') content = discoveriesPanel(this.sim);
    else if (this.modal.type === 'dilemma') content = dilemmaPanel(this.modal.pending, this.sim);
    else if (this.modal.type === 'poiEncounter') content = poiEncounterPanel(this.modal.encounter);
    else if (this.modal.type === 'causes') content = causeReportsPanel(this.sim);
    else if (this.modal.type === 'cause') content = causePanel(this.modal.report, this.sim);
    this.root.innerHTML = shell(content, `m5-${this.modal.type}`);
    paintM5Illustrations(this.root, this.sim);
    this.modalSignature = this.informationalSignature();
    this.restoreViewState(view);
  }

  refresh() {
    if (this.sim !== this.game.sim) {
      this.sim = this.game.sim;
      this.close(true);
    }
    if (this.sim.exodus?.result) {
      this.close(true);
      return;
    }
    const season = this.controls.querySelector('[data-m5-season]');
    if (season) season.textContent = `${tr(this.sim.m5.calendar.labelKey)} · ${tr('date', calendarDate(this.sim.tick))}`;
    const seasonIcon = this.controls.querySelector('[data-m5-season-icon]');
    if (seasonIcon) seasonIcon.dataset.m5Icon = this.sim.m5.calendar.season;
    paintM5Illustrations(this.controls, this.sim);
    const pending = this.sim.m5.dilemmas.pending;
    if (pending) {
      if (this.modal?.type !== 'dilemma' || this.modal.pending.id !== pending.id) this.open('dilemma', { pending });
      return;
    }
    if (this.modal?.type === 'dilemma') this.close(true);
    const encounter = this.sim.m5.poi.encounter;
    if (encounter) {
      if (this.modal?.type !== 'poiEncounter' || this.modal.encounter.id !== encounter.id) this.open('poiEncounter', { encounter });
      return;
    }
    if (this.modal?.type === 'poiEncounter') this.close(true);
    const signature = this.informationalSignature();
    if (signature !== null && signature !== this.modalSignature) this.renderModal();
  }

  handleAction(action, button) {
    if (action === 'close') {
      this.close();
      return true;
    }
    if (['calendar', 'radio', 'discoveries', 'causes'].includes(action)) {
      this.open(action);
      return true;
    }
    if (action === 'causeReport') {
      const report = [...this.sim.m5.causes.deaths, ...this.sim.m5.causes.collapses]
        .find((candidate) => String(candidate.id) === button.dataset.reportId);
      if (report) this.open('cause', { report });
      return true;
    }
    if (action === 'dilemmaChoice') {
      const result = this.game.apply({ type: 'dilemmaChoice', dilemmaId: this.modal?.pending?.id, choiceIndex: Number(button.dataset.choiceIndex) });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      else this.close(true);
      return true;
    }
    if (action === 'poiChoice') {
      const result = this.game.apply({ type: 'poiEncounterChoice', encounterId: this.modal?.encounter?.id, choiceIndex: Number(button.dataset.choiceIndex) });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      else this.close(true);
      return true;
    }
    if (action === 'tradeAccept') {
      const result = this.game.apply({ type: 'radioTradeAccept', tradeId: button.dataset.tradeId });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      this.renderModal();
      return true;
    }
    if (action === 'expeditionRecall') {
      const expedition = this.game.sim.expeditions?.active?.find(candidate => String(candidate.id) === button.dataset.expeditionId);
      const result = this.game.apply({ type: 'expeditionRecall', expeditionId: expedition?.id ?? Number(button.dataset.expeditionId) });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      this.renderModal();
      return true;
    }
    if (action === 'annexExplore') {
      const result = this.game.apply({ type: 'annexExplore', annexId: button.dataset.annexId });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      this.renderModal();
      return true;
    }
    if (action === 'domesticateAnimals') {
      const result = this.game.apply({ type: 'domesticateAnimals', poiId: button.dataset.poiId });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      this.renderModal();
      return true;
    }
    if (action === 'sonarScan') {
      const x = Number(this.root.querySelector('[data-m5-sonar-x]')?.value);
      const y = Number(this.root.querySelector('[data-m5-sonar-y]')?.value);
      const result = this.game.apply({ type: 'sonarScan', x, y });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      this.renderModal();
      return true;
    }
    if (action === 'fireExtinguish') {
      const result = this.game.apply({ type: 'fireExtinguish', fireId: Number(button.dataset.fireId), excavationId: Number(button.dataset.excavationId) });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      else this.ui.toast('eventFireExtinguished');
      return true;
    }
    return false;
  }
}

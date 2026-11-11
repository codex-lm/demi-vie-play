import { AIR, NEEDS, POWER, TIME, WATER } from '../data/balance.js';
import { evaluateExcavation, suggestSupport } from '../sim/structure.js';
import { aquiferPreviewHint } from '../sim/waterChain.js';
import { roomIsDamp } from '../render/supports.js';
import { digHeldHint, digWaitingAccess } from '../sim/jobs.js';
import { tr } from '../data/strings.fr.js';
import { paintPortrait, portraitMarkup } from '../render/portraits.js';
import { colonistModel, excavationDisplayName, latestAlertModel, radiationDoseModel, roomEnvironmentModel, roomProductionModel } from './models.js';
import { formatJournalEntry } from './journal.js';
import { formatDose, formatNumber, formatTemperature, reasonText } from './tooltips.js';
import { colonistSocialPanel, workshopRecipePanel } from './socialPanels.js';
import { exodusDepotPanel } from './m4Panels.js';
import { causePanel, roomHazardPanel } from './m5Panels.js';
import { SOUVENIR_DEFINITIONS } from '../data/souvenirs.js';
import { souvenirsForColonist } from '../sim/souvenirs.js';

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function meter(label, value, className = '') {
  const amount = clampPercent(value);
  return `<div class="meter-row ${className}"><div><span>${escapeHtml(label)}</span><strong>${formatNumber(amount, true)} %</strong></div><div class="meter"><i style="width:${amount}%"></i></div></div>`;
}

function fact(label, value) {
  return `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function reasonList(stress) {
  const reasons = stress?.reasons ?? [];
  if (reasons.length) return `<ul class="reason-list">${reasons.map((reason) => `<li>${escapeHtml(reasonText(reason))}</li>`).join('')}</ul>`;
  const key = stress?.color === 'red' ? 'previewRed' : stress?.color === 'yellow' ? 'previewYellow' : 'previewStable';
  return `<p class="reason-fallback">${escapeHtml(tr(key))}</p>`;
}

function powerStatus(environment, definition) {
  if (environment.disabled) return 'roomDisabled';
  if (environment.powerShed) return 'powerShed';
  if ((definition?.generationKw ?? definition?.generationPerWorkerKw) !== undefined) return environment.powered ? 'generatorOnline' : 'unpowered';
  if (environment.powered) return 'powered';
  if ((definition?.powerKw ?? 0) > 0) return 'unpowered';
  return 'notConnected';
}

function conditionNames(conditions) {
  return (conditions ?? []).map((condition) => {
    const key = typeof condition === 'string' ? condition : condition?.code ?? condition?.type ?? condition?.key;
    return key ? tr(key) : tr('unknown');
  }).join(', ');
}

export class SelectionPanel {
  constructor(game, root = document.querySelector('#selection-panel')) {
    this.game = game;
    this.root = root;
    this.root?.addEventListener('click', (event) => this.onClick(event));
    this.root?.addEventListener('change', (event) => this.onChange(event));
  }

  onClick(event) {
    const m5Button = event.target.closest('[data-m5-action]');
    if (m5Button && this.game.ui?.m5Panels?.handleAction(m5Button.dataset.m5Action, m5Button)) return;
    const m4Button = event.target.closest('[data-m4-action]');
    if (m4Button && this.game.ui?.m4Panels?.handleAction(m4Button.dataset.m4Action, m4Button)) return;
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const selection = this.game.selection;
    const action = button.dataset.action;
    if (action === 'close') {
      this.game.select(null);
      return;
    }
    if (selection?.type === 'colonist' && (action === 'workPriority' || action === 'autoPriorities')) {
      const colonistId = Number(button.dataset.colonistId ?? selection.id);
      const order = action === 'autoPriorities'
        ? { type: 'autoPriorities', colonistId }
        : {
          type: 'workPriority', colonistId, work: button.dataset.work,
          priority: Number(button.dataset.priority),
        };
      this.game.apply(order);
      return;
    }
    if (!selection || selection.type !== 'excavation') return;
    const excavationId = selection.id;
    if (action === 'door') {
      this.game.setTool({ type: 'door', excavationId });
    } else if (action === 'prop') {
      // Le matériau choisi dans l'onglet Soutenir vaut aussi pour ce bouton.
      this.game.setTool({ type: 'support', excavationId, material: this.game.ui?.buildMenu?.propMaterial ?? 'wood' });
    } else if (action === 'repair' || action === 'cancel' || action === 'toggleRoom') {
      this.game.ui.applyOrder({ type: action, excavationId });
    }
  }

  onChange(event) {
    const setting = event.target.dataset.setting;
    if (!['powerPriority', 'workshopRecipe'].includes(setting)) return;
    if (this.game.selection?.type !== 'excavation') return;
    const excavationId = this.game.selection.id;
    if (setting === 'workshopRecipe') {
      this.game.apply({ type: 'recipe', excavationId, recipeId: event.target.value });
      return;
    }
    this.game.ui.applyOrder({ type: 'powerPriority', excavationId, priority: event.target.value });
  }

  refresh() {
    if (!this.root) return;
    const selection = this.game.selection;
    if (!selection && this.game.sim.scenario && this.game.overlay === 'constraints') {
      this.renderScenario();
      return;
    }
    if (!selection) {
      this.root.innerHTML = `<div class="panel-heading"><h2>${escapeHtml(tr('selection'))}</h2></div><p class="muted">${escapeHtml(tr('noSelection'))}</p><p class="panel-help">${escapeHtml(tr('selectionHelp'))}</p>`;
      return;
    }
    if (selection.type === 'excavation') this.renderExcavation(selection.id);
    else if (selection.type === 'colonist') this.renderColonist(selection.id);
    else this.game.select(null);
  }

  renderScenario() {
    const rooms = this.game.sim.excavations.filter((excavation) => excavation.state !== 'collapsed').map((excavation) => {
      const stress = excavation.stress ?? evaluateExcavation(this.game.sim, excavation);
      const color = ['green', 'yellow', 'red'].includes(stress.color) ? stress.color : 'green';
      const name = excavationDisplayName(this.game.sim.excavations, excavation);
      return `<section class="scenario-room ${color}"><div class="stress-heading ${color}"><strong>${escapeHtml(name)}</strong><span>s = ${formatNumber(stress.ratio)}</span></div>${reasonList(stress)}</section>`;
    }).join('');
    this.root.innerHTML = `<div class="panel-heading"><h2>${escapeHtml(tr('constraints'))}</h2></div>${rooms}`;
  }

  renderExcavation(id) {
    const excavation = this.game.sim.excavation(id);
    if (!excavation) {
      this.game.select(null);
      return;
    }
    const name = excavationDisplayName(this.game.sim.excavations, excavation);
    const heading = `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr(excavation.kind))}</span><h2>${escapeHtml(name)}</h2></div><button type="button" class="icon-button" data-action="close" aria-label="${escapeHtml(tr('closeSelection'))}">×</button></div>`;
    if (excavation.state === 'collapsed') {
      const report = excavation.collapseReport
        ?? this.game.sim.m5?.causes?.collapses?.find((candidate) => candidate.id === excavation.collapseReportId);
      const cause = report ? causePanel(report, this.game.sim, { embedded: true }) : '';
      const craft = this.game.sim.exodus?.craft;
      const cancel = craft?.excavationId === excavation.id ? exodusDepotPanel(this.game.sim, excavation) : '';
      this.root.innerHTML = `${heading}<div class="badges"><span class="badge red">${escapeHtml(tr('collapsed'))}</span></div>${cause}${cancel}`;
      return;
    }
    const stress = excavation.stress ?? evaluateExcavation(this.game.sim, excavation);
    const color = ['green', 'yellow', 'red'].includes(stress?.color) ? stress.color : 'green';
    const statusKey = color === 'red' ? 'danger' : color === 'yellow' ? 'cracking' : 'stable';
    const environment = roomEnvironmentModel(this.game.sim, excavation);
    const roomAlert = latestAlertModel(this.game.sim, excavation.id);
    const production = roomProductionModel(excavation);
    const definition = production.definition;
    const integrity = clampPercent(excavation.integrity);
    const powerKey = powerStatus(environment, definition);
    const actions = `<div class="panel-actions">
      <button type="button" data-action="repair" ${integrity >= 100 && !excavation.machineBroken ? 'disabled' : ''}>${escapeHtml(tr(excavation.machineBroken ? 'machineRepair' : 'repairStone'))}</button>
      <button type="button" data-action="prop">${escapeHtml(tr('prop'))}</button>
      <button type="button" data-action="door">${escapeHtml(tr('door'))}</button>
      ${production.roomType ? `<button type="button" data-action="toggleRoom" ${excavation.machineBroken ? 'disabled' : ''}>${escapeHtml(tr(environment.disabled ? 'roomEnable' : 'roomDisable'))}</button>` : ''}
      ${['planned', 'digging'].includes(excavation.state) ? `<button type="button" class="danger-button" data-action="cancel">${escapeHtml(tr('cancelDig'))}</button>` : ''}
    </div>`;
    const priorityOptions = POWER.PRIORITIES.map((priority) => `<option value="${priority}" ${priority === environment.priority ? 'selected' : ''}>${escapeHtml(tr(`priority_${priority}`))}</option>`).join('');
    const productionRows = production.entries.length
      ? `<ul class="production-list">${production.entries.map((entry) => `<li>${escapeHtml(tr(entry.code, { ...entry.values, value: formatNumber(entry.values.value) }))}</li>`).join('')}</ul>`
      : `<p class="muted">${escapeHtml(tr('noProduction'))}</p>`;
    const productionState = production.status
      ? `<div class="facts">${fact(tr('productionStatus'), tr(`production_${production.status}`))}</div>` : '';
    const temperature = Number.isFinite(environment.temperature)
      ? tr('celsius', { value: formatTemperature(environment.temperature) }) : tr('unknown');
    const airClass = (Number.isFinite(environment.o2) && environment.o2 < AIR.DANGER_O2)
      || (Number.isFinite(environment.co2) && environment.co2 > AIR.DANGER_CO2) ? 'red' : '';
    this.root.innerHTML = `${heading}
      <div class="badges"><span class="badge">${escapeHtml(tr(excavation.state))}</span><span class="badge ${color}">${escapeHtml(tr(statusKey))}</span>${environment.disabled ? `<span class="badge">${escapeHtml(tr(excavation.machineBroken ? 'machineBroken' : 'roomDisabled'))}</span>` : ''}${roomAlert ? `<span class="badge ${roomAlert.severity}">${escapeHtml(formatJournalEntry(roomAlert.entry, this.game.sim.excavations))}</span>` : ''}</div>
      ${digWaitingAccess(this.game.sim, excavation) ? `<p class="panel-help dig-no-access">${escapeHtml(tr('digNoAccessHint'))}</p>` : ''}
      ${digHeldHint(this.game.sim, excavation) ? `<p class="panel-help dig-held">${escapeHtml(tr('digHeldHint'))}</p>` : ''}
      ${supportAdviceLine(this, excavation)}
      ${meter(tr('integrity'), integrity, integrity < 40 ? 'red' : integrity < 70 ? 'yellow' : 'green')}
      <div class="stress-heading ${color}"><span>${escapeHtml(tr('stress'))}</span><strong>${formatNumber(stress?.ratio ?? 0)}</strong></div>
      ${reasonList(stress)}
      <h3>${escapeHtml(tr('environment'))}</h3>
      <div class="facts environment-facts">
        ${fact(tr('temperature'), temperature)}
        ${fact(tr('oxygen'), Number.isFinite(environment.o2) ? tr('percent', { value: formatNumber(environment.o2, true) }) : tr('unknown'))}
        ${fact(tr('carbonDioxide'), Number.isFinite(environment.co2) ? tr('percent', { value: formatNumber(environment.co2, true) }) : tr('unknown'))}
        ${fact(tr('floodRatio'), tr('percent', { value: formatNumber(environment.floodRatio * 100, true) }))}
        ${fact(tr('occupants'), formatNumber(environment.occupants, true))}
      </div>
      ${environment.floodRatio > WATER.FLOOD_UNUSABLE_RATIO ? `<p class="room-warning red">${escapeHtml(tr('roomFlooded'))}</p>` : ''}
      ${airClass ? `<p class="room-warning red">${escapeHtml(tr('airDanger'))}</p>` : ''}
      <h3>${escapeHtml(tr('power'))}</h3>
      <div class="facts">
        ${fact(tr('powerStatus'), tr(powerKey))}
        ${fact(tr('powerConsumption'), tr('kilowatts', { value: formatNumber(excavation.powerDemandKw ?? definition?.powerKw ?? 0) }))}
      </div>
      <label class="priority-label">${escapeHtml(tr('powerPriority'))}<select data-setting="powerPriority" aria-label="${escapeHtml(tr('powerPriority'))}">${priorityOptions}</select></label>
      <h3>${escapeHtml(tr('production'))}</h3>
      ${productionState}${productionRows}${workshopRecipePanel(this.game.sim, excavation)}
      ${production.roomType === 'exodusDepot' ? exodusDepotPanel(this.game.sim, excavation) : ''}
      ${roomHazardPanel(this.game.sim, excavation)}
      <h3>${escapeHtml(tr('structure'))}</h3>
      <div class="facts">
        ${fact(tr('dimensions'), `${formatNumber(excavation.w, true)} × ${formatNumber(excavation.h, true)} m`)}
        ${fact(tr('span'), `${formatNumber(stress?.span)} / ${formatNumber(stress?.maxSpan)} m`)}
        ${fact(tr('slab'), `${formatNumber(stress?.slab)} / ${formatNumber(stress?.requiredSlab)} m`)}
        ${fact(tr('depth'), tr('meters', { value: formatNumber(stress?.depth, true) }))}
        ${fact(tr('material'), tr(stress?.material ?? 'unknown'))}
        ${fact(tr('shape'), tr(excavation.shape))}
        ${fact(tr('lining'), tr(excavation.lining ?? 'none'))}
        ${fact(tr('coating'), tr(excavation.coating ?? 'none'))}
      </div>${actions}`;
  }

  renderColonist(id) {
    const colonist = this.game.sim.colonists.find((item) => item.id === id);
    if (!colonist) {
      this.game.select(null);
      return;
    }
    const model = colonistModel(colonist);
    const skills = Object.entries(colonist.skills ?? {}).map(([key, value]) => fact(tr(`${key}Skill`), formatNumber(value, true))).join('');
    const carrying = colonist.carrying
      ? `<p class="carrying">${escapeHtml(tr('carryingResource', { value: `${tr(colonist.carrying.resource ?? colonist.carrying.key)} · ${formatNumber(colonist.carrying.amount ?? colonist.carrying.quantity ?? 0, true)}` }))}</p>`
      : '';
    const radiation = radiationDoseModel(colonist, this.game.sim.tick);
    const dose = fact(tr('dose'), `${formatDose(radiation.dose)} mSv`);
    const age = Number.isFinite(colonist.age) ? fact(tr('age'), tr('years', { value: formatNumber(colonist.age, true) })) : '';
    const injuries = colonist.injuries?.length ? fact(tr('injuries'), conditionNames(colonist.injuries)) : '';
    const diseases = colonist.diseases?.length ? fact(tr('diseases'), conditionNames(colonist.diseases)) : '';
    const carriedSouvenirs = souvenirsForColonist(this.game.sim, colonist.id).map((souvenir) => {
      const definition = SOUVENIR_DEFINITIONS[souvenir.type];
      return `<div class="m6-carrier-souvenir" data-souvenir-id="${souvenir.id}"><canvas class="souvenir-icon" data-souvenir-type="${escapeHtml(souvenir.type)}" data-souvenir-id="${souvenir.id}" width="40" height="40" aria-hidden="true"></canvas><div><strong>${escapeHtml(tr(definition?.nameKey ?? 'm6Souvenirs'))}</strong><p>${escapeHtml(tr(definition?.effectKey ?? 'm6Souvenirs'))}</p><small>${escapeHtml(tr('m6SouvenirAuthor', { name: souvenir.authorName }))}</small></div></div>`;
    }).join('');
    const souvenirSection = carriedSouvenirs ? `<section class="m6-carrier-souvenirs"><h3>${escapeHtml(tr('m6Souvenirs'))}</h3>${carriedSouvenirs}</section>` : '';
    this.root.innerHTML = `<div class="panel-heading colonist-heading">${portraitMarkup(colonist)}<div><span class="eyebrow">${escapeHtml(tr('population'))}</span><h2>${escapeHtml(colonist.name)}</h2></div><button type="button" class="icon-button" data-action="close" aria-label="${escapeHtml(tr('closeSelection'))}">×</button></div>
      <div class="facts">${fact(tr('task'), tr(colonist.task ?? 'idle'))}${age}${model.idleReason ? fact(tr('inactivityReason'), tr(model.idleReason)) : ''}${dose}${injuries}${diseases}</div>
      <section class="dose-effects ${radiation.status}" data-radiation-effects><h3>${escapeHtml(tr('radiationEffects'))}</h3><span class="badge ${radiation.status === 'healthy' ? 'green' : radiation.status === 'high' ? 'yellow' : 'red'}">${escapeHtml(tr(radiation.labelKey))}</span>${radiation.effectKeys.map((key) => `<p>${escapeHtml(tr(key))}</p>`).join('')}</section>
      <h3>${escapeHtml(tr('health'))}</h3>
      ${meter(tr('health'), model.health, model.health <= NEEDS.LOW_NEED_THRESHOLD ? 'red' : model.health <= 100 - NEEDS.LOW_NEED_THRESHOLD ? 'yellow' : 'green')}
      ${meter(tr('morale'), model.morale, model.morale <= NEEDS.LOW_NEED_THRESHOLD ? 'red' : model.morale <= 100 - NEEDS.LOW_NEED_THRESHOLD ? 'yellow' : 'green')}
      <h3>${escapeHtml(tr('needs'))}</h3>
      ${model.needs.map((need) => meter(tr(need.key === 'air' ? 'airNeed' : need.key), need.value, need.severity)).join('')}
      ${carrying}
      ${skills ? `<h3>${escapeHtml(tr('skills'))}</h3><div class="facts skills">${skills}</div>` : ''}
      ${souvenirSection}
      ${colonistSocialPanel(this.game.sim, colonist)}
      ${colonist.deathReport ? causePanel(colonist.deathReport, this.game.sim, { embedded: true }) : ''}`;
    paintPortrait(this.root, colonist, this.game.sim);
  }
}

// Salle creusée jaune ou rouge : où poser un étai de plus. Mis en cache tant que
// la roche, les étais et la liste des salles ne changent pas.
export function supportAdvice(sim, excavation) {
  const advice = suggestSupport(sim, excavation, { wet: roomIsDamp(sim, excavation) });
  if (!advice) return null;
  if (!advice.helps) return { color: 'red', key: 'roomSupportUseless', params: {} };
  const position = advice.offset === 1 ? '1re' : `${advice.offset}e`;
  const key = advice.replaces ? 'roomSupportReplace'
    : advice.color === 'green' ? 'roomSupportHolds' : advice.color === 'yellow' ? 'roomSupportHelps' : 'roomSupportNotEnough';
  return { color: advice.color, key, params: { position }, x: advice.x, ...(advice.wet ? { wet: true } : {}) };
}

function supportAdviceLine(panel, excavation) {
  const sim = panel.game.sim;
  if (!sim?.world || !Array.isArray(sim.excavations)) return '';
  const key = `${excavation.id}:${Math.floor(sim.tick / TIME.TICKS_PER_HOUR)}:${sim.world.revision}:${excavation.state}:${sim.excavations.length}:${JSON.stringify(excavation.supports ?? [])}:${excavation.stress?.ratio ?? ''}`;
  if (panel.supportAdviceCache?.key !== key) panel.supportAdviceCache = { key, value: supportAdvice(sim, excavation) };
  const advice = panel.supportAdviceCache.value;
  const text = advice ? `${tr(advice.key, advice.params)}${advice.wet ? ` ${tr('roomSupportWet')}` : ''}` : '';
  return advice ? `<p class="panel-help support-advice ${advice.color}" data-support-advice="${advice.color}"${advice.x !== undefined ? ` data-support-x="${advice.x}"` : ''}${advice.wet ? ' data-support-wet' : ''}>${escapeHtml(text)}</p>` : '';
}

// Une salle jaune ou rouge : dire ce qu'un étai au milieu changerait.
export function supportPreviewHint(preview) {
  const support = preview?.withSupport;
  if (!support || preview.ok === false || preview.color === 'green') return null;
  const color = support.color === 'red' ? 'red' : support.color === 'yellow' ? 'yellow' : 'green';
  return { color, key: color === 'green' ? 'previewSupportHolds' : color === 'yellow' ? 'previewSupportCracks' : 'previewSupportFails' };
}

export function previewModel(preview, drag) {
  const color = preview.ok === false || preview.color === 'red' ? 'red' : preview.color === 'yellow' ? 'yellow' : 'green';
  if (preview.ok === false) {
    return { color, summary: tr(preview.error ?? 'invalidPlacement'), dimensions: '', reasons: [] };
  }
  return {
    color,
    summary: tr(color === 'red' ? 'previewRed' : color === 'yellow' ? 'previewYellow' : 'previewStable'),
    dimensions: drag ? `${formatNumber(drag.w, true)} × ${formatNumber(drag.h, true)} m` : '',
    reasons: (preview.reasons ?? []).map((reason) => reasonText(reason)),
  };
}

export class PreviewPanel {
  constructor(game, root = document.querySelector('#preview-panel')) {
    this.game = game;
    this.root = root;
  }

  refresh() {
    if (!this.root) return;
    const preview = this.game.currentPreview;
    const tool = this.game.tool;
    this.root.className = '';
    if (!preview) {
      const helpKey = tool?.type === 'dig' ? 'previewHelp' : tool?.type === 'door' ? 'doorHelp' : tool?.type === 'support' ? 'supportHelp' : null;
      this.root.hidden = !helpKey;
      this.root.textContent = helpKey ? tr(helpKey) : '';
      return;
    }
    const model = previewModel(preview, this.game.drag);
    this.root.hidden = false;
    this.root.classList.add('visible', model.color);
    const dimensions = model.dimensions ? `<span class="preview-size">${escapeHtml(model.dimensions)}</span>` : '';
    const reasons = model.reasons.length
      ? `<ul>${model.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`
      : '';
    const geologist = preview.geologist;
    const geology = geologist ? `<p class="m6-geologist" data-geologist-id="${geologist.id}">${escapeHtml(tr(geologist.expert ? 'm6GeologistExact' : 'm6GeologistRange', {
      name: geologist.name,
      skill: formatNumber(geologist.skill, true),
      estimate: geologist.estimate,
      min: geologist.min,
      max: geologist.max,
    }))}</p>` : '';
    const waterHint = aquiferPreviewHint(this.game.sim, preview.order ?? this.game.drag);
    const aquifer = waterHint ? `<p class="m6b-aquifer-hint" data-aquifer-hint="${waterHint.key}">${escapeHtml(tr(waterHint.key, waterHint.params))}</p>` : '';
    const support = supportPreviewHint(preview);
    const supportLine = support ? `<p class="preview-support ${support.color}" data-preview-support="${support.color}">${escapeHtml(tr(support.key))}</p>` : '';
    const neighbours = (preview.neighborRisk ?? []).map((risk) => `<p class="preview-support ${risk.color}" data-preview-neighbor="${risk.id}">`
      + `${escapeHtml(tr('previewNeighborRisk', { name: excavationDisplayName(this.game.sim.excavations, risk.id), ratio: formatNumber(risk.ratio) }))}</p>`).join('');
    this.root.innerHTML = `<div class="preview-summary"><strong>${escapeHtml(model.summary)}</strong>${dimensions}</div>${supportLine}${geology}${aquifer}${neighbours}${reasons}`;
  }
}

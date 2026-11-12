import { WORLD } from '../data/balance.js';
import {
  EXODUS, EXPEDITION, RADIATION, SURFACE_SITES, SURFACE_SLOTS, SURFACE_STRUCTURES,
} from '../data/surface.js';
import { getLanguage, STR, tr } from '../data/strings.fr.js';
import { RADIO_NEIGHBORS_FULL } from '../data/radio.js';
import { dilemmaTextKey } from '../data/storytellerText.js';
import { createColonyExport } from '../sim/exodus.js';
import { formatJournalEntry } from './journal.js';
import {
  calendarDate, exodusKitModel, expeditionLootModel, surfaceHudModel,
} from './models.js';
import { formatDose, formatDoseRate, formatNumber, formatTemperature } from './tooltips.js';
import { endStoryKind } from './m6cStory.js';
import { veilleeInscriptionLines } from './veillee.js';
import { crewSkyHoursMarkup, expeditionPricesMarkup, skyDoseText } from './skyHours.js';
import { departureLines } from './demies.js';
import { LEFT_OUTSIDE_RULES } from '../data/leftOutside.js';
import { outsideDefinition, outsideItem } from '../sim/leftOutside.js';
import { outsideCrewSkyMarkup, outsideName, outsidePriceMarkup, outsideRemainingText } from './leftOutside.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const SCORE_LABELS = Object.freeze({
  healthy: 'scoreHealthy', otherLiving: 'scoreOtherLiving', skills: 'scoreSkills', kit: 'scoreKit',
  souvenirs: 'm6ScoreSouvenirs',
});

function translated(code) {
  const key = String(code ?? '');
  return Object.hasOwn(STR, key) ? tr(key) : key;
}

function costList(cost = {}) {
  return Object.entries(cost).map(([resource, amount]) => `<li><span>${escapeHtml(tr(resource))}</span><strong>${formatNumber(amount, true)}</strong></li>`).join('');
}

function lootList(loot = {}, language = getLanguage()) {
  return expeditionLootModel(loot).map((entry) => {
    const range = entry.min === entry.max ? formatNumber(entry.min, true, language)
      : `${formatNumber(entry.min, true, language)}–${formatNumber(entry.max, true, language)}`;
    return `<li><span>${escapeHtml(tr(entry.resource, {}, language))}</span><strong>${range}</strong></li>`;
  }).join('');
}

function kitList(kit = {}, requirements = null) {
  return Object.entries(kit).map(([resource, amount]) => {
    const required = requirements?.[resource]?.required;
    const value = required === undefined ? formatNumber(amount, true)
      : `${formatNumber(amount, true)} / ${formatNumber(required, true)}`;
    return `<li class="${required !== undefined && amount < required ? 'yellow' : 'green'}"><span>${escapeHtml(tr(resource))}</span><strong>${value}</strong></li>`;
  }).join('');
}

function dialogShell(content, className = '') {
  return `<div class="m4-backdrop"><section class="m4-dialog ${className}" role="dialog" aria-modal="true">${content}</section></div>`;
}

export function surfaceConstructionPreviewPanel(preview) {
  if (!preview) return '';
  return `<div class="m4-preview" data-surface-build-preview>
    <h4>${escapeHtml(tr('surfaceBuildPreviewTitle'))}</h4>
    <dl class="m4-facts"><div><dt>${escapeHtml(tr('cost'))}</dt><dd><ul class="m4-costs">${costList(preview.cost)}</ul></dd></div>
    <div><dt>${escapeHtml(tr('expeditionDuration', { value: formatNumber(preview.workHours, true) }))}</dt><dd>${escapeHtml(tr('doseWorkerPreview', { value: formatDose(preview.dosePerWorker) }))}</dd></div></dl>
    <p class="m4-warning">${escapeHtml(tr('surfaceDoseConfirmationRequired'))}</p>
    <button type="button" class="wide primary" data-m4-action="surfaceBuild">${escapeHtml(tr('buildConfirmDose'))}</button>
  </div>`;
}

function expeditionFrostMessage(preview, language, sim) {
  const frost = preview.frost;
  if (!frost) return '';
  const values = {
    hours: formatNumber(frost.maxDurationHours, true, language),
    day: frost.thawDay,
    days: frost.daysRemaining,
    site: preview.outsideId && sim ? outsideName(sim, preview.outsideId, language) : tr(`site_${preview.siteId}`, {}, language),
  };
  const hasThaw = Number.isFinite(frost.thawTick);
  const limitKey = hasThaw ? 'expeditionFrostLimit' : 'expeditionFrostLimitNoThaw';
  let message = tr(limitKey, values, language);
  if (frost.siteOutOfReach) {
    const siteKey = preview.siteId === 'waterPlant'
      ? `expeditionFrostSiteOutOfReach${hasThaw ? '' : 'NoThaw'}_waterPlant`
      : `expeditionFrostSiteOutOfReach${hasThaw ? '' : 'NoThaw'}`;
    message += ` ${tr(siteKey, values, language)}`;
  }
  return message;
}

export function expeditionPreviewPanel(preview, colonists = [], language = getLanguage(), sim = null) {
  if (!preview) return '';
  const t = (key, values) => tr(key, values, language);
  const nameFor = (id) => colonists.find((colonist) => colonist.id === id)?.name
    ?? t('colonistNumber', { id: id + 1 });
  const crew = preview.colonistIds.map(nameFor).join(', ');
  const needsRisk = (preview.needsRisk ?? []).map((risk) => `<li data-colonist-id="${escapeHtml(risk.id)}" data-need="${escapeHtml(risk.need)}">${escapeHtml(t(`expeditionNeedRisk_${risk.need}`, { name: nameFor(risk.id) }))}</li>`).join('');
  const frostMessage = expeditionFrostMessage(preview, language, sim);
  const outOfReach = preview.frost?.siteOutOfReach === true;
  const isOutside = Boolean(preview.outsideId);
  const outside = preview.outsideId && sim ? outsideDefinition(sim, preview.outsideId) : null;
  const loot = lootList(preview.loot, language);
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(t('expeditionPreview'))}</span><h2>${escapeHtml(outside ? t(outside.titleKey) : t(`site_${preview.siteId}`))}</h2></div>
    <button type="button" class="icon-button" data-m4-action="closeModal" aria-label="${escapeHtml(t('close'))}">×</button></div>
    <p class="muted">${escapeHtml(isOutside ? t('outsideCrew', { max: LEFT_OUTSIDE_RULES.MAX_CREW }) : t('expeditionCrew'))} · ${escapeHtml(crew)}</p>
    ${isOutside ? `<p class="menu-note">${escapeHtml(t('outsideChoose'))}</p>` : ''}
    <div class="m4-projection">
      <strong>${escapeHtml(t('expeditionDose', { value: skyDoseText(preview.dosePerPerson, language) }))}</strong>
      <span>${escapeHtml(t('expeditionDuration', { value: formatNumber(isOutside ? Math.round(preview.durationHours * 10) / 10 : preview.durationHours, !isOutside, language) }))}</span>
    </div>
    ${outside ? outsidePriceMarkup(sim, preview.outsideId, language, preview) : expeditionPricesMarkup(sim ?? { tick: preview.previewTick }, preview, language)}
    ${outside ? `<p class="menu-note">${escapeHtml(t('outsidePriceContext'))}</p><p class="outside-reward">${escapeHtml(t(outside.rewardKey))}</p>` : ''}
    ${frostMessage ? `<p class="m4-warning m6f-expedition-frost" data-expedition-frost data-site-out-of-reach="${outOfReach}">${escapeHtml(frostMessage)}</p>` : ''}
    ${!isOutside || loot ? `<h3>${escapeHtml(t('expeditionLoot'))}</h3><ul class="m4-costs loot-list">${loot}</ul>` : ''}
    ${!isOutside ? `<p class="menu-note">${escapeHtml(t('expeditionCarryCapacity', {
      value: formatNumber(preview.carryCapacity ?? EXPEDITION.CARRY_UNITS_PER_PERSON * (preview.colonistIds?.length ?? 1), true, language),
      count: formatNumber(preview.colonistIds?.length ?? 1, true, language),
    }))}</p>` : ''}
    <h3>${escapeHtml(t('expeditionRisks'))}</h3><ul class="m4-risks">${(preview.risks ?? []).map((risk) => `<li>${escapeHtml(t(`risk_${risk}`))}</li>`).join('')}</ul>
    ${needsRisk ? `<ul class="m4-risks m6e-expedition-needs">${needsRisk}</ul>` : ''}
    <p class="m4-warning">${escapeHtml(t('encounterRisk', { value: formatNumber((preview.encounterChance ?? 0) * 100, true, language) }))}</p>
    <div class="m4-dialog-actions"><button type="button" data-m4-action="closeModal">${escapeHtml(t('cancelExpedition'))}</button>
    <button type="button" class="primary" data-m4-action="expeditionLaunch" ${outOfReach ? `disabled title="${escapeHtml(frostMessage)}"` : ''}>${escapeHtml(t('expeditionLaunch'))}</button></div>`;
}

export function pendingEncounterModel(sim) {
  const pending = sim.expeditions?.pendingEncounter;
  const active = (sim.expeditions?.active ?? []).find((expedition) => expedition.encounter
    && (expedition.state === 'encounter' || expedition.state === 'pendingEncounter' || expedition.encounter.choiceIndex === null
      || expedition.encounter.choiceIndex === undefined));
  if (!pending && !active) return null;
  const pendingObject = pending && typeof pending === 'object' ? pending : {};
  const expeditionId = pendingObject.expeditionId ?? active?.id ?? (typeof pending === 'number' ? pending : null);
  const expedition = (sim.expeditions?.active ?? []).find((candidate) => candidate.id === expeditionId) ?? active;
  const encounter = pendingObject.encounter ?? expedition?.encounter
    ?? (pendingObject.choices || pendingObject.options || pendingObject.type ? pendingObject : null);
  if (!encounter || expeditionId === null) return null;
  return { encounter, expeditionId };
}

export function encounterPanel(encounter, expeditionId) {
  const supplied = encounter.choices ?? encounter.options ?? [];
  const choices = Array.from({ length: 3 }, (_, index) => supplied[index] ?? `encounterChoice_${index}`);
  const text = encounter.text ?? encounter.description ?? encounter.message ?? encounter.dialogueKey ?? encounter.title ?? 'encounterDefault';
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr('expedition'))}</span><h2>${escapeHtml(tr('encounterTitle'))}</h2></div></div>
    <p class="encounter-text">${escapeHtml(translated(text))}</p>
    <div class="encounter-choices">${choices.map((choice, index) => {
      const label = typeof choice === 'object' ? choice.label ?? choice.labelKey ?? choice.text ?? choice.code ?? `encounterChoice_${index}` : choice;
      const detail = typeof choice === 'object' ? choice.description ?? choice.descriptionKey ?? choice.effect ?? '' : '';
      return `<button type="button" data-m4-action="encounterChoice" data-expedition-id="${escapeHtml(expeditionId)}" data-choice-index="${index}">
        <span>${escapeHtml(tr('encounterChoice'))} ${index + 1}</span><strong>${escapeHtml(translated(label))}</strong>${detail ? `<small>${escapeHtml(translated(detail))}</small>` : ''}</button>`;
    }).join('')}</div>`;
}

export function surfacePanel(sim, state = {}) {
  const hud = surfaceHudModel(sim);
  const structureType = state.structureType ?? 'antenna';
  const structureX = Number(state.structureX ?? SURFACE_SLOTS[0]);
  const definition = SURFACE_STRUCTURES[structureType];
  const sites = (sim.surface?.sites ?? []).filter((site) => site.revealed);
  const siteId = sites.some((site) => site.id === state.siteId) ? state.siteId : sites[0]?.id;
  const outside = state.outsideId ? outsideDefinition(sim, state.outsideId) : null;
  const outsideState = outside ? outsideItem(sim, state.outsideId) : null;
  const outsideAvailable = outsideState?.status === 'available' && sim.tick < outsideState.deadlineTick;
  const outsideChoices = (sim.leftOutside?.items ?? []).filter((item) => item.status === 'available' && sim.tick < item.deadlineTick);
  const maxCrew = outside ? LEFT_OUTSIDE_RULES.MAX_CREW : EXPEDITION.MAX_CREW;
  const crewIds = state.crewIds instanceof Set ? state.crewIds : new Set(state.crewIds ?? []);
  const buildPreview = state.buildPreview?.structureType === structureType && state.buildPreview?.x === structureX
    ? state.buildPreview : null;
  const departure = departureLines(sim);
  const active = sim.expeditions?.active ?? [];
  return `<div class="surface-panel">
    <section class="m4-section"><h3>${escapeHtml(tr('surfaceZone'))}</h3>
      <div class="m4-current"><span>${escapeHtml(tr('surfaceDose'))}</span><strong>${formatDoseRate(hud.dose)} mSv/h</strong><small>${escapeHtml(departure.habitable)}</small>${departure.departure ? `<small>${escapeHtml(departure.departure)}</small>` : ''}</div>
      <p class="menu-note">${escapeHtml(departure.context)} ${escapeHtml(tr('demiesMilestoneContext'))}</p>
      <div class="m4-form-grid"><label>${escapeHtml(tr('surfaceZone'))}<input type="number" min="0" max="${(sim.world?.width ?? WORLD.WIDTH) - 1}" step="1" value="${hud.selectedX}" data-m4-setting="zone"></label>
      <label>${escapeHtml(tr('exodusThreshold'))}<input type="number" min="0.0001" step="0.001" value="${hud.threshold}" data-m4-setting="threshold"></label></div>
      <p class="menu-note">${escapeHtml(tr('surfaceZoneHelp', { x: hud.selectedX }))}</p>
      <button type="button" class="wide" data-m4-action="radiationOverlay">${escapeHtml(tr('radiationMap'))}</button>
    </section>
    <section class="m4-section"><h3>${escapeHtml(tr('surfaceBuild'))}</h3>
      <label>${escapeHtml(tr('surfaceStructure'))}<select data-m4-setting="structureType">${Object.keys(SURFACE_STRUCTURES).map((type) => `<option value="${type}" ${type === structureType ? 'selected' : ''}>${escapeHtml(tr(type))}</option>`).join('')}</select></label>
      <label>${escapeHtml(tr('surfaceSlot'))}<select data-m4-setting="structureX">${SURFACE_SLOTS.map((x) => `<option value="${x}" ${x === structureX ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <ul class="m4-costs">${costList(definition.cost)}</ul>
      <p class="menu-note">${escapeHtml(tr('surfaceWorkHours', { value: formatNumber(definition.workHours, true), count: formatNumber(definition.crew, true) }))}</p>
      <button type="button" class="wide primary" data-m4-action="surfaceBuildPreview">${escapeHtml(tr('surfaceBuildPreviewAction'))}</button>
      ${surfaceConstructionPreviewPanel(buildPreview)}
    </section>
    <section class="m4-section"><h3>${escapeHtml(tr('expeditions'))}</h3>
      <p class="m4-weather">${escapeHtml(tr('weather'))} · <strong>${escapeHtml(tr(hud.weather))}</strong></p>
      <label>${escapeHtml(tr('expeditionSite'))}<select data-m4-setting="expeditionSite" ${sites.length || outsideChoices.length ? '' : 'disabled'}>
      ${outsideChoices.length || outside ? `<optgroup label="${escapeHtml(tr('outsideTitle'))}">${(outside && !outsideChoices.some(item => item.id === state.outsideId) ? [...outsideChoices, outsideState] : outsideChoices).filter(Boolean).map((item) => `<option value="outside:${escapeHtml(item.id)}" ${item.id === state.outsideId ? 'selected' : ''} ${item.status !== 'available' ? 'disabled' : ''}>${escapeHtml(outsideName(sim, item.id))}</option>`).join('')}</optgroup>` : ''}
      ${sim.leftOutside ? `<optgroup label="${escapeHtml(tr('outsideOrdinarySites'))}">` : ''}${sites.map((site) => `<option value="${site.id}" ${!outside && site.id === siteId ? 'selected' : ''}>${escapeHtml(tr(`site_${site.id}`))}</option>`).join('')}${sim.leftOutside ? '</optgroup>' : ''}</select></label>
      ${outside ? `<div class="outside-selected" data-outside-selected="${escapeHtml(state.outsideId)}"><strong>${escapeHtml(tr(outside.titleKey))}</strong><p>${escapeHtml(tr(outside.rewardKey))}</p><p>${escapeHtml(outsideAvailable ? outsideRemainingText(sim, outsideState) : tr(`outsideStatus_${outsideState.status}`))}</p><p>${escapeHtml(tr('outsideChoose'))}</p><button type="button" data-m4-action="outsideNotebook">${escapeHtml(tr('outsideBackNotebook'))}</button></div>` : ''}
      <fieldset class="crew-picker"><legend>${escapeHtml(outside ? tr('outsideCrew', { max: maxCrew }) : tr('expeditionCrew'))}</legend>${(sim.colonists ?? []).filter((colonist) => colonist.health > 0 && !colonist.dead).map((colonist) => `<label class="crew-choice ${colonist.surfaceCrewId ? 'disabled' : ''}"><input type="checkbox" data-m4-crew="${colonist.id}" ${crewIds.has(colonist.id) ? 'checked' : ''} ${colonist.surfaceCrewId ? 'disabled' : ''}><span>${escapeHtml(colonist.name)}</span><small>${escapeHtml(tr('scoutSkill'))} ${formatNumber(colonist.skills?.scout ?? 0, true)} · ${formatDose(colonist.dose ?? 0)} mSv · ${outside ? outsideCrewSkyMarkup(sim, colonist, state.outsideId) : crewSkyHoursMarkup(sim, colonist, siteId)}</small></label>`).join('')}</fieldset>
      <p class="menu-note">${escapeHtml(tr('demiesCrewSkyContext'))}</p>
      <p class="menu-note">${escapeHtml(tr('crewCount', { count: crewIds.size, max: maxCrew }))}</p>
      ${outside ? outsidePriceMarkup(sim, state.outsideId) : expeditionPricesMarkup(sim, { siteId, colonistIds: [...crewIds] })}
      ${outside ? `<p class="menu-note">${escapeHtml(tr('outsidePriceContext'))}</p>` : ''}
      <button type="button" class="wide primary" data-m4-action="expeditionPreview" ${(!outside && !siteId) || (outside && !outsideAvailable) || crewIds.size < EXPEDITION.MIN_CREW || crewIds.size > maxCrew || sim.weather?.expeditionsBlocked ? 'disabled' : ''}>${escapeHtml(tr('expeditionPreview'))}</button>
      ${active.length ? `<h4>${escapeHtml(tr('activeExpeditions'))}</h4><ul class="active-expeditions">${active.map((expedition) => `<li><span>${escapeHtml(expedition.outsideId ? outsideName(sim, expedition.outsideId) : tr(`site_${expedition.siteId}`))}</span><strong>${escapeHtml(tr(expedition.state))}</strong></li>`).join('')}</ul>` : ''}
    </section>
    <section class="m4-section exodus-section"><h3>${escapeHtml(tr('exodus'))}</h3>
      <p>${escapeHtml(tr('kitValue', { value: formatNumber(sim.exodus ? exodusKitModel(sim).scoreValue : 0, true) }))}</p>
      <p class="menu-note">${escapeHtml(tr('exodusHelp'))}</p>
      <button type="button" class="wide primary" data-m4-action="exodusPreview">${escapeHtml(tr('exodusPreview'))}</button>
    </section>
  </div>`;
}

export function exodusDepotPanel(sim, excavation) {
  const model = exodusKitModel(sim, excavation);
  return `<section class="exodus-depot" data-exodus-depot><h3>${escapeHtml(tr('kit'))}</h3>
    <p>${escapeHtml(tr('kitValue', { value: formatNumber(model.scoreValue, true) }))}</p>
    <h4>${escapeHtml(tr('kitContents'))}</h4><ul class="m4-costs kit-contents">${kitList(sim.exodus?.kit ?? {}, model.contents)}</ul>
    ${model.craft ? `<p class="m4-current">${escapeHtml(tr('kitProgress', { value: formatNumber(model.progress * 100, true) }))}</p>` : ''}
    ${model.missing.length && !model.complete ? `<p class="menu-note">${escapeHtml(tr('kitMissingResources'))}</p><ul class="fit-missing">${model.missing.map((entry) => `<li>${escapeHtml(tr('missingResource', { resource: tr(entry.resource), required: formatNumber(entry.required, true), available: formatNumber(entry.available, true) }))}</li>`).join('')}</ul>` : ''}
    <div class="m6e-kit-actions"><button type="button" class="wide primary" data-m4-action="kitCraft" data-excavation-id="${excavation.id}" ${model.canCraft ? '' : 'disabled'}>${escapeHtml(tr(model.complete ? 'kitComplete' : model.craft ? 'kitCraftActive' : 'kitCraft'))}</button>
    ${model.craft ? `<button type="button" class="wide" data-m4-action="kitCraftCancel" data-excavation-id="${escapeHtml(model.craft.excavationId ?? excavation.id)}">${escapeHtml(tr('kitCraftCancel'))}</button>` : ''}</div>
  </section>`;
}

function scoreBreakdown(score) {
  return (score?.lines ?? []).map((line) => `<div class="score-line"><span>${escapeHtml(tr(SCORE_LABELS[line.code] ?? line.code, { count: formatNumber(line.count, true), unit: formatNumber(line.unitValue, true) }))}</span><strong>${formatNumber(line.value, true)}</strong></div>`).join('');
}

function projectedKitTable(preview) {
  const startingKit = preview.startingKit ?? preview.kit ?? {};
  const remainingKit = preview.kit ?? {};
  const resources = [...new Set([...Object.keys(startingKit), ...Object.keys(remainingKit)])];
  return `<table class="m4-kit-projection"><thead><tr><th>${escapeHtml(tr('kitComponent'))}</th><th>${escapeHtml(tr('startingKit'))}</th><th>${escapeHtml(tr('remainingKit'))}</th></tr></thead>
    <tbody>${resources.map((resource) => `<tr><th>${escapeHtml(tr(resource))}</th><td>${formatNumber(startingKit[resource] ?? 0, true)}</td><td>${formatNumber(remainingKit[resource] ?? 0, true)}</td></tr>`).join('')}</tbody></table>`;
}

function firstYearTable(preview) {
  const months = preview.firstYear?.months ?? [];
  if (!months.length) return '';
  const value = (entry, ...keys) => {
    for (const key of keys) if (entry[key] !== undefined && entry[key] !== null) return entry[key];
    return null;
  };
  const cell = (number, integer = false) => number === null ? escapeHtml(tr('unknown')) : formatNumber(number, integer);
  const temperatureCell = (number) => number === null ? escapeHtml(tr('unknown')) : formatTemperature(number);
  return `<h3>${escapeHtml(tr('firstYearMonths'))}</h3><table class="m4-year-projection"><thead><tr><th>${escapeHtml(tr('month'))}</th><th>${escapeHtml(tr('temperature'))}</th><th>${escapeHtml(tr('harvest'))}</th><th>${escapeHtml(tr('living'))}</th><th>${escapeHtml(tr('starvation'))}</th><th>${escapeHtml(tr('cold'))}</th></tr></thead>
    <tbody>${months.map((entry, index) => {
      const month = value(entry, 'month') ?? index + 1;
      const harvest = value(entry, 'harvest', 'harvestAvailable')
        ?? (preview.firstHarvestMonth !== null && preview.firstHarvestMonth !== undefined && month >= preview.firstHarvestMonth);
      return `<tr><th>${escapeHtml(tr('monthNumber', { month }))}</th><td>${temperatureCell(value(entry, 'temperature', 'averageTemperature'))} °C</td><td>${escapeHtml(tr(harvest ? 'harvestPossible' : 'noHarvestThisMonth'))}</td><td>${cell(value(entry, 'living', 'survivors'), true)}</td><td>${cell(value(entry, 'starvationDeaths'), true)}</td><td>${cell(value(entry, 'coldDeaths'), true)}</td></tr>`;
    }).join('')}</tbody></table>`;
}

export function exodusConfirmationPanel(preview, sim) {
  if (!preview) return '';
  const kitComplete = preview.kitStatus?.complete === true;
  const startingLiving = preview.startingLiving ?? preview.living ?? 0;
  const months = preview.firstYear?.months ?? [];
  const firstMonthTemperature = preview.firstMonthTemperature ?? months[0]?.temperature ?? months[0]?.averageTemperature;
  const harvest = preview.firstHarvestMonth === null || preview.firstHarvestMonth === undefined
    ? tr('noFirstHarvest') : tr('firstHarvest', { month: preview.firstHarvestMonth });
  // The harvest rule and the month seeds would ripen are public, even while
  // the kit holds no seed yet: the kit can be sized before it is packed.
  const seedHarvest = preview.seedHarvestMonth === null || preview.seedHarvestMonth === undefined
    ? tr('noSeedHarvest', { perSeed: formatNumber(EXODUS.HARVEST_FOOD_PER_SEED, true) })
    : tr('seedHarvest', { month: preview.seedHarvestMonth, day: preview.seedHarvestDay,
      perSeed: formatNumber(EXODUS.HARVEST_FOOD_PER_SEED, true) });
  const harvestRule = tr('harvestRule', { days: EXODUS.GROWING_SEASON_DAYS,
    temperature: formatNumber(EXODUS.HARVEST_MIN_TEMPERATURE, true) });
  return `<div class="panel-heading"><div><span class="eyebrow">${escapeHtml(tr('exodusPreview'))}</span><h2>${escapeHtml(tr('exodus'))}</h2></div>
    <button type="button" class="icon-button" data-m4-action="closeModal" aria-label="${escapeHtml(tr('close'))}">×</button></div>
    <p class="muted">${escapeHtml(tr('exodusConfirmationHelp', { x: sim.radiation.selectedX, threshold: formatNumber(sim.radiation.safeThreshold) }))}</p>
    <div class="m4-projection exodus-projection"><strong>${escapeHtml(tr('startingLiving', { count: formatNumber(startingLiving, true) }))}</strong>
      <strong>${escapeHtml(tr('healthyProjected', { startingLiving: formatNumber(startingLiving, true), living: formatNumber(preview.living, true), healthy: formatNumber(preview.healthy, true) }))}</strong>
      <span>${escapeHtml(tr('firstMonthTemperature', { value: formatTemperature(firstMonthTemperature) }))}</span>
      <span>${escapeHtml(tr('coldestMonth', { month: preview.coldestMonth ?? tr('unknown'), temperature: formatTemperature(preview.coldestTemperature) }))}</span>
      <span>${escapeHtml(harvest)}</span>
      <span data-exodus-seed-harvest>${escapeHtml(seedHarvest)}</span>
      <span data-exodus-harvest-rule>${escapeHtml(harvestRule)}</span>
      <span>${escapeHtml(tr('kitFoodDays', { value: formatNumber(preview.foodDays) }))}</span>
      <span>${escapeHtml(tr('kitFuelDays', { value: formatNumber(preview.fuelDays) }))}</span>
      <span>${escapeHtml(tr('starvationDeaths', { count: formatNumber(preview.starvationDeaths, true) }))}</span>
      <span>${escapeHtml(tr('coldDeaths', { count: formatNumber(preview.coldDeaths, true) }))}</span>
      <span>${escapeHtml(tr('firstYearDose', { value: formatDose(preview.averageFirstYearDose) }))}</span>
      <span>${escapeHtml(tr('projectedTotalDose', { value: formatDose(preview.averageProjectedDose) }))}</span></div>
    ${preview.starvationDeaths > 0 ? `<p class="m4-warning" data-exodus-starvation-warning>${escapeHtml(tr('exodusStarvationWarning', { count: formatNumber(preview.starvationDeaths, true) }))}</p>` : ''}
    ${firstYearTable(preview)}
    <h3>${escapeHtml(tr('kitContents'))}</h3>${projectedKitTable(preview)}
    <p>${escapeHtml(tr('projectedKitValue', { value: formatNumber(preview.kitScoreValue, true) }))}</p>
    <h3>${escapeHtml(tr('scoreProjection'))}</h3><div class="score-lines">${scoreBreakdown(preview.score)}</div>
    <p class="heritage-total">${escapeHtml(tr('heritageTotal', { value: formatNumber(preview.score?.total ?? 0, true) }))}</p>
    ${kitComplete ? '' : `<p class="menu-note" data-exodus-launch-blocker>${escapeHtml(tr('kitIncomplete'))}</p>`}
    <div class="m4-dialog-actions"><button type="button" data-m4-action="closeModal">${escapeHtml(tr('cancel'))}</button>
      <button type="button" class="primary" data-m4-action="exodusLaunch" ${kitComplete ? '' : `disabled title="${escapeHtml(tr('kitIncomplete'))}"`}>${escapeHtml(tr('exodusLaunch'))}</button></div>`;
}

export function colonyDownloadModel(sim) {
  const exported = sim.exodus?.result?.export ?? createColonyExport(sim);
  return { filename: RADIATION.EXPORT_FILE, json: JSON.stringify(exported), exported };
}

function localizedNeighborList(value) {
  if (typeof value !== 'string') return value;
  if (value === 'aucun') return tr('none');
  return value.split(', ').map((name) => {
    const neighbor = RADIO_NEIGHBORS_FULL.find(({ nameKey }) => tr(nameKey, {}, 'fr') === name);
    return neighbor ? tr(neighbor.nameKey) : name;
  }).join(', ');
}

function endStoryText(entry, sim) {
  if (getLanguage() === 'en' && entry.code === 'storyRadioNeighbors') {
    const { surviving, silent } = entry.params ?? {};
    return tr(entry.code, { surviving: localizedNeighborList(surviving), silent: localizedNeighborList(silent) });
  }
  if (getLanguage() === 'en' && ['labStoryNeighbors', 'labStorySilencedNeighbors'].includes(entry.code)) {
    return tr(entry.code, { names: localizedNeighborList(entry.params?.names) });
  }
  if (!entry.code.startsWith('m6Story')) return formatJournalEntry(entry, sim.excavations, { story: true, sim });
  const params = { ...(entry.params ?? {}) };
  if (params.lawId) params.lawId = tr(`law_${params.lawId}`);
  for (const key of ['names', 'authors']) {
    if (Array.isArray(params[key])) params[key] = params[key].join(', ');
  }
  if (Array.isArray(params.causes)) params.causes = params.causes.map((cause) => translated(cause)).join(', ');
  for (const key of ['savedNameKeys', 'silentNameKeys']) {
    if (Array.isArray(params[key])) params[key] = params[key].filter(Boolean).map((nameKey) => tr(nameKey)).join(', ') || tr('none');
  }
  if (entry.code === 'm6StoryNeighbors') {
    const savedKey = params.saved === 0 ? 'm6StoryNoNeighborsSaved' : 'm6StoryNeighborsSaved';
    const silentKey = params.silent === 0 ? 'm6StoryNoNeighborsSilent' : 'm6StoryNeighborsSilent';
    return `${tr(savedKey, params)} ${tr(silentKey, params)}`;
  }
  if (entry.code === 'm6StoryDilemmas' && params.name == null) {
    const titleKey = dilemmaTextKey(params.definitionId, 'title');
    params.name = Object.hasOwn(STR, titleKey) ? tr(titleKey) : translated(params.definitionId ?? 'unknown');
  }
  const textKey = entry.code === 'm6StoryDilemmas' && params.count === 1 ? 'm6StoryDilemma' : entry.code;
  return tr(textKey, params);
}

export function endGamePanel(sim) {
  const result = sim.exodus?.result;
  if (!result) return '';
  const victory = result.type === 'exodus';
  const score = result.score ?? result.export?.score;
  const storyData = Array.isArray(result.story) ? { sentences: result.story, children: [] } : (result.story ?? {});
  const projection = result.export?.projection ?? storyData.projection ?? null;
  const formattedStory = (storyData.sentences ?? []).map((entry, index) => ({
    entry,
    index,
    kind: endStoryKind(entry, projection),
    text: endStoryText(entry, sim),
  })).filter((entry) => entry.text && entry.entry.code !== 'veilleeInscription');
  const story = Array.isArray(result.story)
    ? (formattedStory.length > 15 ? [...formattedStory.slice(0, 14), formattedStory.at(-1)] : formattedStory)
    : formattedStory.slice(0, 8);
  const children = storyData.children ?? [];
  const inscriptions = veilleeInscriptionLines(sim);
  const firstSky = victory ? `<canvas class="first-sky" data-children="${escapeHtml(children.map((child) => child.id).join(','))}" data-season="${escapeHtml(storyData.season ?? '')}" data-weather="${escapeHtml(storyData.weather ?? '')}" width="720" height="260" aria-label="${escapeHtml(tr('m6FirstSky'))}"></canvas>` : '';
  return `<div class="end-heading"><span class="eyebrow">${escapeHtml(tr(victory ? 'exodus' : 'eventDefeat', { reason: tr(result.reason), score: formatNumber(score?.total ?? 0, true) }))}</span>
    <h2>${escapeHtml(tr(victory ? 'victoryTitle' : 'defeatTitle'))}</h2><p>${escapeHtml(tr(result.reason))}</p></div>
    ${firstSky}
    <div class="end-columns"><section><h3>${escapeHtml(tr('heritage'))}</h3><div class="score-lines">${scoreBreakdown(score)}</div>
    <p class="heritage-total">${escapeHtml(tr('heritageTotal', { value: formatNumber(score?.total ?? 0, true) }))}</p>
    <button type="button" class="wide primary" data-m4-action="exportColony">${escapeHtml(tr('exportColony'))}</button></section>
    <section><h3>${escapeHtml(tr('colonyStory'))}</h3><ol class="colony-story m6-end-story">${story.map(({ entry, index, kind, text }) => `<li data-story-code="${escapeHtml(entry.code)}" data-story-index="${index}"${kind ? ` data-story-kind="${kind}"` : ''}><time>${escapeHtml(tr('date', calendarDate(entry.tick)))}</time><span>${escapeHtml(text)}</span></li>`).join('') || `<li>${escapeHtml(tr('emptyStory'))}</li>`}</ol>${inscriptions.length ? `<h3>${escapeHtml(tr('veilleeStoryTitle'))}</h3><ol class="veillee-inscriptions">${inscriptions.map(({ day, key, text }) => `<li data-veillee-inscription="${escapeHtml(key)}" data-veillee-day="${day}">${escapeHtml(text)}</li>`).join('')}</ol>` : ''}</section></div>`;
}

export class M4Panels {
  constructor(game, ui, root = document.querySelector('#m4-panels')) {
    this.game = game;
    this.sim = game.sim;
    this.ui = ui;
    this.root = root;
    this.structureType = 'antenna';
    this.structureX = SURFACE_SLOTS[0];
    this.siteId = (game.sim.surface?.sites ?? []).find((site) => site.revealed)?.id ?? SURFACE_SITES[0].id;
    this.outsideId = null;
    this.crewIds = new Set(game.sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.surfaceCrewId).slice(0, 1).map((colonist) => colonist.id));
    this.buildPreview = null;
    this.modal = null;
    this.endResult = null;
    this.encounterKey = null;
    this.root?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-m4-action]');
      if (button) this.handleAction(button.dataset.m4Action, button);
    });
  }

  surfaceState() {
    return {
      structureType: this.structureType, structureX: this.structureX, siteId: this.siteId, outsideId: this.outsideId,
      crewIds: this.crewIds, buildPreview: this.buildPreview,
    };
  }

  pruneCrew() {
    const available = new Set(this.game.sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.dead && !colonist.surfaceCrewId)
      .map((colonist) => colonist.id));
    this.crewIds = new Set([...this.crewIds].filter((id) => available.has(id)));
  }

  refresh() {
    this.pruneCrew();
    if (this.sim !== this.game.sim) {
      this.sim = this.game.sim;
      this.modal = null;
      this.endResult = null;
      this.encounterKey = null;
      this.buildPreview = null;
      this.siteId = (this.sim.surface?.sites ?? []).find((site) => site.revealed)?.id ?? SURFACE_SITES[0].id;
      this.outsideId = null;
      this.crewIds = new Set(this.sim.colonists.filter((colonist) => colonist.health > 0 && !colonist.surfaceCrewId).slice(0, 1).map((colonist) => colonist.id));
      this.renderModal();
    }
    if (this.outsideId && outsideItem(this.game.sim, this.outsideId)?.status !== 'available') {
      this.outsideId = null;
      this.refreshMenu();
    }
    const result = this.game.sim.exodus?.result;
    if (result) {
      if (this.endResult !== result) {
        this.endResult = result;
        this.modal = { type: 'end' };
        this.renderModal();
        if (this.game.speed !== 0) this.game.setSpeed(0);
      }
      return;
    }
    this.endResult = null;
    const pending = pendingEncounterModel(this.game.sim);
    if (pending) {
      const key = `${pending.expeditionId}:${this.game.sim.tick}`;
      if (this.encounterKey !== key || this.modal?.type !== 'encounter') {
        this.encounterKey = key;
        this.modal = { type: 'encounter', ...pending };
        this.renderModal();
        if (this.game.speed !== 0) this.game.setSpeed(0);
      }
    } else {
      this.encounterKey = null;
      if (this.modal?.type === 'encounter') this.closeModal(true);
    }
  }

  renderModal() {
    if (!this.root) return;
    if (!this.modal) {
      this.root.replaceChildren();
      return;
    }
    let content = '';
    let className = '';
    if (this.modal.type === 'expedition') content = expeditionPreviewPanel(this.modal.preview, this.game.sim.colonists, getLanguage(), this.game.sim);
    else if (this.modal.type === 'exodus') {
      content = exodusConfirmationPanel(this.modal.preview, this.game.sim);
      className = 'exodus-dialog';
    } else if (this.modal.type === 'encounter') content = encounterPanel(this.modal.encounter, this.modal.expeditionId);
    else if (this.modal.type === 'end') {
      content = endGamePanel(this.game.sim);
      className = 'end-dialog';
    }
    this.root.innerHTML = dialogShell(content, className);
  }

  openModal(type, values = {}) {
    this.modal = { type, ...values };
    this.renderModal();
    if (this.game.speed !== 0) this.game.setSpeed(0);
  }

  closeModal(force = false) {
    if (!this.modal || (!force && ['end', 'encounter'].includes(this.modal.type))) return false;
    this.modal = null;
    this.renderModal();
    return true;
  }

  pause() {
    if (this.game.speed !== 0) this.game.setSpeed(0);
  }

  refreshMenu() {
    this.ui.buildMenu?.refresh();
    this.ui.selectionPanel?.refresh();
  }

  selectOutside(id) {
    const item = outsideItem(this.game.sim, id);
    if (!item || item.status !== 'available' || this.game.sim.tick >= item.deadlineTick) {
      this.ui.toast('expeditionUnavailable');
      return true;
    }
    this.outsideId = id;
    this.pruneCrew();
    this.crewIds = new Set([...this.crewIds].slice(0, LEFT_OUTSIDE_RULES.MAX_CREW));
    this.game.setTool?.({ type: 'select' });
    if (this.ui.m6Panels) {
      this.ui.m6Panels.notebookHidden = true;
      this.ui.m6Panels.refresh(true);
    }
    this.ui.buildMenu?.setTab?.('surface');
    this.refreshMenu();
    const target = this.ui.buildMenu?.root?.querySelector?.('[data-outside-selected]');
    target?.scrollIntoView?.({ block: 'nearest' });
    this.ui.buildMenu?.root?.querySelector?.('[data-m4-crew]')?.focus?.();
    return true;
  }

  handleChange(target) {
    const setting = target.dataset.m4Setting;
    if (target.dataset.m4Crew !== undefined) {
      const id = Number(target.dataset.m4Crew);
      const maxCrew = this.outsideId ? LEFT_OUTSIDE_RULES.MAX_CREW : EXPEDITION.MAX_CREW;
      if (target.checked && this.crewIds.size >= maxCrew && !this.crewIds.has(id)) {
        target.checked = false;
        this.ui.toast(this.outsideId ? 'outsideCrewLimit' : 'expeditionCrewLimit');
      } else if (target.checked) this.crewIds.add(id);
      else this.crewIds.delete(id);
      this.refreshMenu();
      return true;
    }
    if (!setting) return false;
    if (setting === 'structureType') this.structureType = target.value;
    else if (setting === 'structureX') this.structureX = Number(target.value);
    else if (setting === 'expeditionSite') {
      if (target.value.startsWith('outside:')) return this.selectOutside(target.value.slice('outside:'.length));
      this.siteId = target.value;
      this.outsideId = null;
    }
    else if (setting === 'zone' || setting === 'threshold') {
      const x = setting === 'zone' ? Number(target.value) : this.game.sim.radiation.selectedX;
      const threshold = setting === 'threshold' ? Number(target.value) : this.game.sim.radiation.safeThreshold;
      if (!Number.isFinite(x) || !Number.isFinite(threshold) || threshold <= 0) {
        this.ui.toast('invalidThreshold');
        this.refreshMenu();
        return true;
      }
      const result = this.game.apply({ type: 'surfaceZone', x, threshold });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
    }
    this.buildPreview = null;
    this.refreshMenu();
    return true;
  }

  handleAction(action, button) {
    this.pruneCrew();
    if (action === 'closeModal') {
      this.closeModal();
      return true;
    }
    if (action === 'outsideNotebook') {
      this.ui.m6Panels?.handleAction('outsidePage');
      return true;
    }
    if (action === 'radiationOverlay') {
      if (this.game.setOverlay) this.game.setOverlay('radiation');
      else this.game.overlay = 'radiation';
      return true;
    }
    if (action === 'surfaceBuildPreview') {
      const result = this.game.apply({ type: 'surfaceBuildPreview', structureType: this.structureType, x: this.structureX });
      this.buildPreview = result.ok ? result.preview : null;
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      this.refreshMenu();
      return true;
    }
    if (action === 'surfaceBuild') {
      const preview = this.buildPreview;
      if (!preview || preview.structureType !== this.structureType || preview.x !== this.structureX) {
        this.ui.toast('surfaceDoseConfirmationRequired');
        return true;
      }
      const result = this.game.apply({ type: 'surfaceBuild', structureType: preview.structureType, x: preview.x, previewTick: preview.previewTick, confirmedDose: true });
      this.ui.toast(result.ok ? 'orderQueued' : result.error ?? 'actionFailed');
      if (result.ok) this.buildPreview = null;
      this.refreshMenu();
      return true;
    }
    if (action === 'expeditionPreview') {
      const colonistIds = [...this.crewIds].sort((a, b) => a - b);
      const maxCrew = this.outsideId ? LEFT_OUTSIDE_RULES.MAX_CREW : EXPEDITION.MAX_CREW;
      if (colonistIds.length < EXPEDITION.MIN_CREW || colonistIds.length > maxCrew) {
        this.ui.toast('expeditionUnavailable');
        return true;
      }
      const destination = this.outsideId ? { outsideId: this.outsideId } : { siteId: this.siteId };
      const result = this.game.apply({ type: 'expeditionPreview', ...destination, colonistIds });
      if (result.preview) this.openModal('expedition', { preview: result.preview });
      else if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      return true;
    }
    if (action === 'expeditionLaunch') {
      if (this.modal?.type !== 'expedition' || !this.modal.preview) {
        this.ui.toast('expeditionPreviewRequired');
        return true;
      }
      const result = this.game.apply({ type: 'expeditionLaunch', previewId: this.modal.preview.id });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      else {
        if (this.outsideId && outsideItem(this.game.sim, this.outsideId)?.status !== 'available') this.outsideId = null;
        this.pruneCrew();
        this.closeModal(true);
      }
      this.refreshMenu();
      return true;
    }
    if (action === 'encounterChoice') {
      const expeditionId = Number(button.dataset.expeditionId);
      const choiceIndex = Number(button.dataset.choiceIndex);
      if (this.modal?.type !== 'encounter' || this.modal.expeditionId !== expeditionId || ![0, 1, 2].includes(choiceIndex)) {
        this.ui.toast('encounterUnavailable');
        return true;
      }
      const result = this.game.apply({ type: 'encounterChoice', expeditionId, choiceIndex });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      else this.closeModal(true);
      return true;
    }
    if (action === 'kitCraft' || action === 'kitCraftCancel') {
      const result = this.game.apply({ type: action, excavationId: Number(button.dataset.excavationId) });
      this.ui.toast(result.ok ? 'orderQueued' : result.error ?? 'actionFailed');
      this.refreshMenu();
      return true;
    }
    if (action === 'exodusPreview') {
      const result = this.game.apply({ type: 'exodusPreview' });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      else this.openModal('exodus', { preview: result.preview });
      return true;
    }
    if (action === 'exodusLaunch') {
      if (this.modal?.type !== 'exodus' || !this.game.sim.exodus.preview) {
        this.ui.toast('exodusPreviewRequired');
        return true;
      }
      const result = this.game.apply({ type: 'exodusLaunch', confirmed: true });
      if (!result.ok) this.ui.toast(result.error ?? 'actionFailed');
      this.pause();
      return true;
    }
    if (action === 'exportColony') {
      this.downloadColony();
      return true;
    }
    return false;
  }

  downloadColony() {
    const download = colonyDownloadModel(this.game.sim);
    const blob = new Blob([download.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = download.filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

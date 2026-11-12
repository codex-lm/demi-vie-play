import { TIME } from '../data/balance.js';
import { getLanguage, tr } from '../data/strings.fr.js';
import { outsideDefinition, outsideDosePrices } from '../sim/leftOutside.js';
import { skyHours } from '../sim/demies.js';
import { skyDoseText } from './skyHours.js';
import { formatNumber } from './tooltips.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function outsideName(sim, id, language = getLanguage()) {
  const definition = outsideDefinition(sim, id);
  return definition ? tr(definition.titleKey, {}, language) : '';
}

export function outsidePriceMarkup(sim, id, language = getLanguage(), preview = null) {
  const prices = outsideDosePrices(preview ? { ...sim, tick: preview.previewTick } : sim, id);
  if (!prices) return '';
  const t = (key, values) => tr(key, values, language);
  // A prepared preview keeps its own departure estimate until confirmed.
  const today = preview?.dosePerPerson ?? prices.today.dosePerPerson;
  const tomorrow = prices.today.dosePerPerson > 0 ? today * prices.later.dosePerPerson / prices.today.dosePerPerson : 0;
  return `<div class="outside-prices" data-outside-prices="${escapeHtml(id)}">
    <strong data-outside-dose-today="${today}">${escapeHtml(t('outsideToday', { dose: skyDoseText(today, language) }))}</strong>
    <span data-outside-dose-tomorrow="${tomorrow}">${escapeHtml(t('outsideTomorrow', { dose: skyDoseText(tomorrow, language) }))}</span>
  </div>`;
}

export function outsideRemainingText(sim, item, language = getLanguage()) {
  const remaining = Math.max(0, item.deadlineTick - sim.tick);
  const hours = Math.floor(remaining / TIME.TICKS_PER_HOUR);
  if (remaining > 0 && hours === 0) return tr('outsideLessHour', {}, language);
  const hoursPerDay = TIME.TICKS_PER_DAY / TIME.TICKS_PER_HOUR;
  return tr('outsideRemaining', { days: Math.floor(hours / hoursPerDay), hours: hours % hoursPerDay }, language);
}

function outsideTiming(sim, item) {
  const prices = outsideDosePrices(sim, item.id);
  const durationTicks = Math.round((prices?.durationHours ?? 0) * TIME.TICKS_PER_HOUR);
  const available = item.status === 'available' && sim.tick < item.deadlineTick;
  return {
    prices, available,
    fetchable: available && sim.tick + durationTicks < item.deadlineTick,
    tomorrowLost: sim.tick + TIME.TICKS_PER_DAY + durationTicks >= item.deadlineTick,
  };
}

// Only structural changes replace the page. Minute-by-minute prices and time
// remaining are updated on the existing nodes, keeping buttons and drawings.
export function outsideNotebookSignature(sim, language = getLanguage()) {
  if (!sim.leftOutside) return '';
  return JSON.stringify({ language, items: sim.leftOutside.items.map((item) => {
    const { prices, available, fetchable, tomorrowLost } = outsideTiming(sim, item);
    return [item.id, item.status, item.deadlineTick, prices?.durationHours, available, fetchable, tomorrowLost];
  }) });
}

export function refreshOutsideNotebook(root, sim, language = getLanguage()) {
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };
  for (const item of sim.leftOutside?.items ?? []) {
    const row = root?.querySelector?.(`[data-outside-item="${item.id}"]`);
    if (!row) continue;
    const prices = outsideDosePrices(sim, item.id);
    if (!prices) continue;
    const today = row.querySelector('[data-outside-dose-today]');
    const tomorrow = row.querySelector('[data-outside-dose-tomorrow]');
    if (today) {
      today.dataset.outsideDoseToday = String(prices.today.dosePerPerson);
      setText(today, tr('outsideToday', { dose: skyDoseText(prices.today.dosePerPerson, language) }, language));
    }
    if (tomorrow) {
      tomorrow.dataset.outsideDoseTomorrow = String(prices.later.dosePerPerson);
      setText(tomorrow, tr('outsideTomorrow', { dose: skyDoseText(prices.later.dosePerPerson, language) }, language));
    }
    setText(row.querySelector('.outside-remaining'), outsideRemainingText(sim, item, language));
  }
}

export function outsideCrewSkyMarkup(sim, colonist, id, language = getLanguage()) {
  const definition = outsideDefinition(sim, id);
  if (!definition) return '';
  const model = skyHours(sim, colonist, { x: definition.x, suit: true });
  const hours = formatNumber(Math.floor(model.hours * 10) / 10, false, language);
  const detail = tr((colonist.dose ?? 0) > model.healthyThreshold ? 'demiesSkySpent' : 'demiesSkyHours', {
    dose: skyDoseText(model.hourlyDose, language), hours,
  }, language);
  return `<span class="demies-crew-sky" data-crew-sky-hours="${model.hours}" title="${escapeHtml(detail)}">${escapeHtml(tr('demiesCrewSky', { hours }, language))}</span>`;
}

export function outsideNotebookPanel(sim, language = getLanguage()) {
  if (!sim.leftOutside) return '';
  const t = (key, values) => tr(key, values, language);
  const items = sim.leftOutside.items.map((item) => {
    const definition = outsideDefinition(sim, item.id);
    if (!definition) return '';
    const { prices, available, fetchable, tomorrowLost } = outsideTiming(sim, item);
    const deadlineDay = Math.floor(item.deadlineTick / TIME.TICKS_PER_DAY) + 1;
    const deadlineHour = Math.floor(item.deadlineTick % TIME.TICKS_PER_DAY / TIME.TICKS_PER_HOUR);
    return `<li class="outside-item" data-outside-item="${escapeHtml(item.id)}" data-outside-status="${escapeHtml(item.status)}">
      <h3>${escapeHtml(t(definition.titleKey))}</h3>
      <p>${escapeHtml(t(definition.storyKey))}</p>
      <p class="outside-reward">${escapeHtml(t(definition.rewardKey))}</p>
      <p>${escapeHtml(t('outsideDuration', { hours: formatNumber(prices?.durationHours ?? definition.durationHours, false, language) }))}</p>
      ${available ? outsidePriceMarkup(sim, item.id, language) : ''}
      <p class="outside-deadline">${escapeHtml(t(definition.deadlineKey))} <span>${escapeHtml(t('outsideDeadline', { day: deadlineDay, hour: String(deadlineHour).padStart(2, '0') }))}</span></p>
      <strong class="outside-status">${escapeHtml(t(`outsideStatus_${item.status}`))}</strong>
      ${available ? `<p class="outside-remaining">${escapeHtml(outsideRemainingText(sim, item, language))}</p>
      ${tomorrowLost ? `<p class="menu-note">${escapeHtml(t('outsideTomorrowLost'))}</p>` : ''}
      ${fetchable ? `<button type="button" class="wide" data-m6-action="outsideFetch" data-outside-id="${escapeHtml(item.id)}">${escapeHtml(t('outsideFetch'))}</button>` : `<p class="menu-note">${escapeHtml(t('outsideTooLate'))}</p>`}` : ''}
    </li>`;
  }).join('');
  return `<section id="m6-notebook" class="m6-notebook outside-notebook" aria-label="${escapeHtml(t('outsideTitle'))}">
    <div class="m6-panel-heading"><div><span class="eyebrow">${escapeHtml(t('m6NotebookElder'))}</span><h2>${escapeHtml(t('outsideTitle'))}</h2></div>
    <button type="button" class="icon-button" data-m6-action="toggleNotebook" aria-label="${escapeHtml(t('m6HideNotebook'))}">×</button></div>
    <p class="m6-elder-voice">${escapeHtml(t('outsideIntro'))}</p>
    <p>${escapeHtml(t('outsideRenounce'))}</p>
    <p class="menu-note">${escapeHtml(t('outsidePriceContext'))}</p>
    <button type="button" class="wide" data-m6-action="outsideObjectives">${escapeHtml(t('outsideObjectives'))}</button>
    <ol class="outside-list">${items}</ol>
  </section>`;
}

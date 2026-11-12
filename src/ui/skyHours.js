import { DEMIES } from '../data/demies.js';
import { SURFACE_SITES } from '../data/surface.js';
import { getLanguage, tr } from '../data/strings.fr.js';
import { expeditionDosePrices, skyHours } from '../sim/demies.js';
import { formatNumber } from './tooltips.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

// Preserve the small prices of a late expedition instead of rounding them to zero.
export function skyDoseText(value, language = getLanguage()) {
  if (value > 0 && value < DEMIES.DOSE_DISPLAY_MIN) {
    return tr('demiesDoseBelow', { value: formatNumber(DEMIES.DOSE_DISPLAY_MIN, false, language) }, language);
  }
  return formatNumber(value, false, language);
}

function hoursText(value, language) {
  return formatNumber(Number.isFinite(value) ? Math.floor(value * 10) / 10 : value, false, language);
}

function exposureText(model, colonist, language) {
  const values = { dose: skyDoseText(model.hourlyDose, language), hours: hoursText(model.hours, language) };
  return tr((colonist.dose ?? 0) > model.healthyThreshold ? 'demiesSkySpent' : 'demiesSkyHours', values, language);
}

export function colonistSkyHoursPanel(sim, colonist, language = getLanguage()) {
  if (!Number.isFinite(sim.tick)) return '';
  const model = skyHours(sim, colonist);
  return `<p class="demies-sky-hours" data-sky-hours="${model.hours}">${escapeHtml(exposureText(model, colonist, language))}<small>${escapeHtml(tr('demiesSkyContext', {}, language))}</small></p>`;
}

export function crewSkyHoursMarkup(sim, colonist, siteId, language = getLanguage()) {
  const site = SURFACE_SITES.find((candidate) => candidate.id === siteId);
  if (!site || !Number.isFinite(sim.tick)) return '';
  const model = skyHours(sim, colonist, { x: site.x, suit: true });
  const detail = `${exposureText(model, colonist, language)} ${tr('demiesCrewSkyContext', {}, language)}`;
  return `<span class="demies-crew-sky" data-crew-sky-hours="${model.hours}" title="${escapeHtml(detail)}">${escapeHtml(tr('demiesCrewSky', { hours: hoursText(model.hours, language) }, language))}</span>`;
}

export function expeditionPricesMarkup(sim, preview, language = getLanguage()) {
  if (!preview?.colonistIds?.length || !Number.isFinite(sim?.tick)) return '';
  const prices = expeditionDosePrices(sim, preview);
  if (!prices) return '';
  const frost = preview.frost ?? (sim.m5?.calendar?.longExpeditionsBlocked
    ? { maxDurationHours: sim.m5.calendar.maxExpeditionHours } : null);
  const limitedByFrost = frost && Number.isFinite(frost.maxDurationHours);
  const constraint = prices.negligible ? tr(limitedByFrost ? 'demiesLowTripFrost' : 'demiesLowTripTravel', {
    hours: formatNumber(limitedByFrost ? frost.maxDurationHours : prices.durationHours, false, language),
  }, language) : '';
  return `<div class="demies-trip-prices" data-expedition-prices>
    <strong data-dose-today="${prices.today.teamDose}">${escapeHtml(tr('demiesTeamToday', { dose: skyDoseText(prices.today.teamDose, language) }, language))}</strong>
    <strong data-dose-later="${prices.later.teamDose}">${escapeHtml(tr('demiesTeamLater', { dose: skyDoseText(prices.later.teamDose, language), days: prices.delayDays }, language))}</strong>
    <small>${escapeHtml(tr('demiesPriceContext', {}, language))}</small>
    ${constraint ? `<p class="menu-note" data-expedition-dose-limit>${escapeHtml(constraint)}</p>` : ''}
  </div>`;
}

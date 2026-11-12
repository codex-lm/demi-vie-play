import { TIME } from '../data/balance.js';
import { POI_TEXT } from '../data/poiText.js';
import { RADIO_TEXT } from '../data/radioText.js';
import { WEATHER } from '../data/surface.js';
import { LEFT_OUTSIDE_ITEMS } from '../data/leftOutside.js';
import { getLanguage, STR, tr } from '../data/strings.fr.js';
import { calendarDate, excavationDisplayName } from './models.js';
import { formatDose, formatNumber } from './tooltips.js';
import { localizeStoryJournalParams } from './storyLocalization.js';
import { visibleJournalEntries } from './demies.js';
import { namedDeathMessage, personalizeJournalNarrative } from './journalPeople.js';
import { rescueJournal } from '../sim/rescueNarrative.js';

function entryTime(tick) {
  const day = Math.floor(tick / TIME.TICKS_PER_DAY) + 1;
  const minuteOfDay = tick % TIME.TICKS_PER_DAY;
  const hour = Math.floor(minuteOfDay / TIME.TICKS_PER_HOUR).toString().padStart(2, '0');
  const minute = Math.floor(minuteOfDay % TIME.TICKS_PER_HOUR).toString().padStart(2, '0');
  return tr('dateShort', { day, hour, minute });
}

function resourceSummary(yields) {
  return Object.entries(yields ?? {})
    .filter(([, amount]) => {
      const value = Array.isArray(amount) ? amount[0] : amount;
      return Number.isFinite(Number(value)) && Number(value) > 0;
    })
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([resource, amount]) => {
      const range = Array.isArray(amount) ? amount : [amount, amount];
      const value = Number(range[0]) === Number(range[1] ?? range[0])
        ? formatNumber(range[0], true) : `${formatNumber(range[0], true)}–${formatNumber(range[1], true)}`;
      return `${value} ${tr(resource).toLocaleLowerCase(getLanguage())}`;
    })
    .join(tr('resourceListSeparator'));
}

const DAMAGE_CAUSE_KEYS = Object.freeze({ air: 'asphyxia', starvation: 'malnutrition' });
const WEATHER_NAMES = Object.freeze({ rain: 'Rain', blackRain: 'BlackRain', dustStorm: 'DustStorm', clearing: 'Clearing', clear: 'Clearing' });
const JOURNAL_DEFAULTS = Object.freeze({
  lawId: 'sharedMeals', nodeId: 'whitewash', name: '—', parents: '—', a: '—', b: '—',
  rescuer: '—', lastKnockTick: null,
  behavior: 'refuseWork', cause: 'morale_neglected', remonteurs: '—', profonds: '—', faction: 'remonteurs',
  days: 1, amount: 1, resource: 'filters', effects: '', remedy: '', level: 0,
  dose: 0, site: 'supermarket', summary: '—', hours: 12, type: 'antenna', value: 0,
  reason: 'departure', score: 0, count: 1, weather: 'clear', loot: {},
  signals: 0, radius: 40, energy: 8, meters: 3, duration: 20,
  defense: 0, attack: 0, stolen: 0, injuries: 0, otherName: '—',
  material: 'timber',
  outsideId: '',
  choice: '—', text: '—', title: '—', source: 'storyteller', from: 0, donePhraseKey: 'm6ObjectiveDigRoomDone',
});

// Saves retain French labels and completed messages for a deterministic replay.
// Their underlying keys, or the original templates for older entries, let the UI
// show the same events in English without modifying the saved state.
const POI_LABEL_KEYS = new Map(Object.entries(POI_TEXT).map(([key, value]) => [value, key]));
const RADIO_LABEL_KEYS = new Map(Object.entries(RADIO_TEXT).map(([key, value]) => [value, key]));
const SITE_LABEL_KEYS = new Map(Object.entries(STR)
  .filter(([key]) => key.startsWith('site_')).map(([key, value]) => [value, key]));
const RESOURCE_LABEL_KEYS = new Map(Object.entries(STR).map(([key, value]) => [value, key]));

function localizeSavedLabel(value, keys) {
  const key = keys.get(value);
  return key ? tr(key) : value;
}

function radioLoot(text) {
  return String(text).split(STR.resourceListSeparator).map((part) => {
    const amountAndLabel = part.match(/^(\d+) (.+)$/);
    if (!amountAndLabel) return localizeSavedLabel(part, RESOURCE_LABEL_KEYS);
    return `${formatNumber(amountAndLabel[1], true)} ${localizeSavedLabel(amountAndLabel[2], RESOURCE_LABEL_KEYS)}`;
  }).join(tr('resourceListSeparator'));
}

export function formatRadioMessage(message) {
  const params = { ...(message.params ?? {}) };
  if (params.dose !== undefined) params.dose = formatDose(params.dose);
  if (getLanguage() === 'en') {
    if (params.siteId) params.site = tr(`site_${params.siteId}`);
    else if (params.site) params.site = localizeSavedLabel(params.site, SITE_LABEL_KEYS);
    if (params.neighbor) params.neighbor = localizeSavedLabel(params.neighbor, RADIO_LABEL_KEYS);
    if (params.loot) params.loot = radioLoot(params.loot);
  }
  const outside = LEFT_OUTSIDE_ITEMS.find((item) => item.id === params.siteId || item.id === params.site);
  if (outside) params.site = tr(outside.titleKey);
  return tr(message.textKey, params);
}

function localizeSavedRadioText(text, textKey) {
  const key = textKey ?? RADIO_LABEL_KEYS.get(text);
  const template = RADIO_TEXT[key];
  if (!template) return text;
  const placeholders = [...template.matchAll(/\{(\w+)\}/g)];
  if (!placeholders.length) return tr(key);
  if (typeof text !== 'string') return text;
  const pattern = template.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)');
  const match = text.match(new RegExp(`^${pattern}$`));
  if (!match) return text;
  const params = Object.fromEntries(placeholders.map((placeholder, index) => [placeholder[1], match[index + 1]]));
  return formatRadioMessage({ textKey: key, params });
}

function localizeSavedJournalParams(entry, params) {
  if (getLanguage() !== 'en') return;
  if (entry.code.startsWith('eventRadio')) params.text = localizeSavedRadioText(params.text, params.textKey);
  if (entry.code === 'eventFind') params.text = localizeSavedLabel(params.text, POI_LABEL_KEYS);
  if (entry.code === 'eventPoiEncounter') params.summary = localizeSavedLabel(params.summary, POI_LABEL_KEYS);
  if (entry.code === 'eventEncounter' && typeof params.outcome === 'string') {
    const outcome = `encounterOutcome${params.outcome[0]?.toUpperCase() ?? ''}${params.outcome.slice(1)}`;
    if (Object.hasOwn(STR, outcome)) params.summary = tr(outcome);
  }
  if (params.poi) params.poi = localizeSavedLabel(params.poi, POI_LABEL_KEYS);
  if (entry.code.startsWith('alertFilters') && typeof params.plantFrozen === 'boolean') {
    const elapsedDays = Math.floor((entry.tick ?? 0) / TIME.TICKS_PER_DAY);
    const plant = !params.plantFrozen ? tr('filtersPlantOpen') : params.thawDay == null
      ? tr('filtersPlantFrozenNoThaw') : tr('filtersPlantFrozen', { day: params.thawDay, days: Math.max(0, params.thawDay - elapsedDays) });
    params.remedy = `${params.coalInSubsoil === false ? ` ${tr('filtersNoCoal')}` : ''} ${plant}`;
  }
}

function journalParameter(code, key, value, excavations) {
  if (key === 'outsideId') return tr(LEFT_OUTSIDE_ITEMS.find((item) => item.id === value)?.titleKey ?? 'outsideTitle');
  if (key === 'lastKnockTick') return Number.isFinite(value) && value >= 0 ? entryTime(value) : tr('unknown');
  if (key === 'material') return tr(String(value));
  if (key === 'roomType') return tr(String(value)).toLocaleLowerCase(getLanguage());
  if (key === 'lawId') return tr(`law_${value}`);
  if (key === 'nodeId') return tr(`research_${value}`);
  if (key === 'behavior' || key === 'faction') return tr(String(value));
  if (key === 'cause') return tr(String(value));
  if (key === 'resource') return tr(String(value)).toLocaleLowerCase(getLanguage());
  if (key === 'site' || key === 'siteId') return tr(LEFT_OUTSIDE_ITEMS.find((item) => item.id === value)?.titleKey ?? `site_${value}`);
  if (key === 'weather' || key === 'type') return tr(String(value));
  if (key === 'loot' || key === 'yields') return resourceSummary(value);
  if (key === 'summary' && value && typeof value === 'object') return resourceSummary(value.loot ?? value);
  if (key === 'dose' || key === 'averageDose') return formatDose(value);
  if (key === 'score') return formatNumber(value, true);
  if (key === 'surfaceFactor' || key === 'filterFactor') return formatNumber(value);
  if (key === 'endTick' || key === 'startTick') return tr('date', calendarDate(value));
  if (key === 'consequence' || key === 'donePhraseKey') return Object.hasOwn(STR, String(value)) ? tr(String(value)) : String(value);
  if (key === 'reason') return tr(String(value));
  if (key === 'ratio') return formatNumber(Number(value) * 100, true);
  if (key === 'causes') return (Array.isArray(value) ? value : [value]).filter(Boolean)
    .map((cause) => tr(DAMAGE_CAUSE_KEYS[cause] ?? cause)).join(', ');
  if (key === 'id' || key === 'excavationId' || key === 'otherId') {
    if (value === null && (code.startsWith('alertFlood') || code === 'alertSuddenImmersionRed')) return tr('floodNaturalCavity');
    const id = Number(value);
    if (!Number.isInteger(id)) return value;
    // The planning entry only stores an ID. Once undone, its kind is unknown.
    if (code === 'eventPlanned' && !excavations.some((excavation) => excavation.id === id)) return `#${id + 1}`;
    return code === 'eventDeath' ? String(id + 1) : excavationDisplayName(excavations, id);
  }
  return value;
}

function defaultWeatherHours(type) {
  if (type === 'blackRain') return WEATHER.BLACK_RAIN_TICKS / TIME.TICKS_PER_HOUR;
  if (type === 'rain') return WEATHER.RAIN_TICKS / TIME.TICKS_PER_HOUR;
  if (type === 'dustStorm') return WEATHER.DUST_STORM_TICKS / TIME.TICKS_PER_HOUR;
  return WEATHER.CLEARING_TICKS / TIME.TICKS_PER_HOUR;
}

function prepareWeather(entry, params, story) {
  const name = WEATHER_NAMES[params.weather];
  if (!name) return;
  const suppliedHours = Number(entry.params?.durationHours);
  const startTick = Number(entry.params?.startTick ?? entry.tick ?? 0);
  const endTick = Number(entry.params?.endTick);
  const durationHours = Number.isFinite(suppliedHours) ? suppliedHours
    : Number.isFinite(endTick) ? (endTick - startTick) / TIME.TICKS_PER_HOUR : defaultWeatherHours(params.weather);
  params.endTick = Number.isFinite(endTick) ? endTick : startTick + durationHours * TIME.TICKS_PER_HOUR;
  params.duration = durationHours % 24 === 0
    ? tr('durationDays', { value: formatNumber(durationHours / 24, true) })
    : tr('durationHours', { value: formatNumber(durationHours, true) });
  const values = {
    surfaceFactor: formatNumber(params.surfaceFactor ?? WEATHER.BLACK_RAIN_SURFACE_FACTOR),
    filterFactor: formatNumber(params.filterFactor ?? WEATHER.DUST_FILTER_FACTOR, true),
  };
  params.effect = tr(`weather${name}Effect`, values);
  params.endEffect = tr(`weather${name}End`, values);
  if (story && entry.params?.consequence) {
    params.effect = journalParameter(entry.code, 'consequence', entry.params.consequence, []);
    params.endEffect = params.effect;
  }
}

export function formatJournalEntry(entry, excavations = [], options = {}) {
  if (entry.code === 'veilleeInscription') {
    return tr('veilleeInscription', { day: entry.params?.day, words: tr(entry.params?.key) });
  }
  if (entry.code === 'eventOutsideStory') {
    const recovered = (entry.params?.recoveredKeys ?? []).map((key) => tr(key));
    const left = (entry.params?.leftKeys ?? []).map((key) => tr(key));
    return tr(entry.code, {
      recovered: recovered.length ? tr('outsideStoryRecovered', { items: recovered.join(', ') }) : tr('outsideNothingRecovered'),
      left: left.length ? tr('outsideStoryLeft', { items: left.join(', ') }) : tr('outsideNothingLeft'),
    });
  }
  if (entry.code === 'eventResource') return null;
  const namedDeath = namedDeathMessage(options.sim, entry);
  if (namedDeath !== null) return namedDeath;
  const story = Boolean(options.story);
  if (story && entry.code.startsWith('eventWeather')
    && !entry.params?.consequence && !entry.params?.consequences && !entry.params?.deaths) return null;
  if (story && entry.code === 'eventWelcome') return tr('eventWelcomeStory');
  if (entry.code !== 'eventDug') {
    const params = { ...JOURNAL_DEFAULTS, poi: tr('journalUnknownPlace'), weatherLabel: tr('journalOvercast'), ...(entry.params ?? {}) };
    if (entry.code.startsWith('eventWeather')) prepareWeather(entry, params, story);
    if (story && entry.code === 'eventDeath') {
      params.name = entry.params?.name ?? tr('colonistNumber', { id: Number(entry.params?.id ?? 0) + 1 });
      if (!Array.isArray(params.causes) || params.causes.length === 0) params.causes = ['unknownCause'];
    }
    if (entry.code === 'eventExpeditionReturn' && (!entry.params?.summary || (getLanguage() === 'en' && entry.params?.loot))) {
      params.summary = tr('eventExpeditionReturnSummary', {
        loot: resourceSummary(params.loot) || tr('none'),
        dose: formatDose(entry.params?.dose ?? params.averageDose ?? params.dose),
      });
    }
    if (entry.code === 'eventLawSigned') params.effects = tr(`law_${params.lawId}_effect`);
    if (entry.code === 'alertMoraleYellow' && entry.params?.cause === 'morale_neglected') {
      params.remedy = ` ${tr('collectiveCareRemedy')}`;
    }
    localizeSavedJournalParams(entry, params);
    localizeStoryJournalParams(entry, params, excavations);
    const formatted = Object.fromEntries(Object.entries(params)
      .map(([key, value]) => [key, journalParameter(entry.code, key, value, excavations)]));
    const code = story && Object.hasOwn(STR, `${entry.code}Story`) ? `${entry.code}Story` : entry.code;
    return personalizeJournalNarrative(options.sim, entry, tr(code, formatted));
  }
  const params = entry.params ?? {};
  const excavation = excavations.find((item) => item.id === (params.excavationId ?? params.id));
  const kind = params.kind ?? excavation?.kind;
  const volume = Number.isFinite(Number(params.volume)) ? Number(params.volume)
    : excavation ? excavation.w * excavation.h : null;
  if (!kind || volume === null) return tr('eventDugLegacy');
  const resources = resourceSummary(params.yields);
  return tr('eventDug', {
    label: tr(`${kind}Complete`),
    volume: formatNumber(volume, true),
    yields: resources ? tr('eventDugYields', { resources }) : '',
  });
}

export class Journal {
  constructor(game, root = document.querySelector('#journal')) {
    this.game = game;
    this.root = root;
    this.lastEntryId = -1;
    this.root?.addEventListener('click', (event) => this.onClick(event));
  }

  onClick(event) {
    const button = event.target.closest('button[data-entry-id]');
    if (!button) return;
    const entry = rescueJournal(this.game.sim).find((item) => String(item.id) === button.dataset.entryId);
    if (!entry) return;
    if (entry.focus) this.game.focus(entry.focus.x, entry.focus.y);
    if (entry.code === 'eventDeath') {
      const colonistId = Number(entry.params?.colonistId ?? entry.params?.id);
      if (this.game.sim.colonists.some((colonist) => colonist.id === colonistId)) {
        this.game.select({ type: 'colonist', id: colonistId });
        return;
      }
    }
    const excavationId = entry.params?.excavationId ?? entry.params?.id;
    if (excavationId !== undefined && this.game.sim.excavation(excavationId)) {
      this.game.select({ type: 'excavation', id: excavationId });
    }
  }

  refresh(force = false) {
    if (!this.root) return;
    // Les Demies et le récit des secours vivent hors du journal sauvegardé : on les réunit à l'affichage.
    const entries = [...visibleJournalEntries(this.game.sim), ...(this.game.sim.rescueNarrative?.entries ?? [])]
      .sort((a, b) => a.tick - b.tick || (typeof a.id === 'number' ? -1 : 1) - (typeof b.id === 'number' ? -1 : 1));
    const newest = entries.at(-1)?.id ?? -1;
    if (!force && newest === this.lastEntryId) return;
    this.lastEntryId = newest;
    this.root.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = tr('journal');
    this.root.append(title);
    const list = document.createElement('div');
    list.className = 'journal-list';
    for (const entry of entries.slice(-7).reverse()) {
      const button = document.createElement(entry.level === 'demie' ? 'div' : 'button');
      if (entry.level !== 'demie') button.type = 'button';
      button.className = `journal-entry ${entry.level}`;
      button.dataset.entryId = String(entry.id);
      if (entry.level !== 'demie') button.title = tr('journalFocus');
      const time = document.createElement('time');
      time.textContent = entryTime(entry.tick);
      const message = document.createElement('span');
      message.textContent = formatJournalEntry(entry, this.game.sim.excavations, { sim: this.game.sim });
      button.append(time, message);
      list.append(button);
    }
    this.root.append(list);
  }
}

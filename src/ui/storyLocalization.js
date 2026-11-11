import { FIRE_TEXT_EN } from '../data/fireText.en.js';
import { RADIO_EVENTS, RADIO_NEIGHBORS_FULL } from '../data/radio.js';
import { dilemmaTextKey } from '../data/storytellerText.js';
import { getLanguage, STR, tr } from '../data/strings.fr.js';
import { excavationDisplayName } from './models.js';

const storyParts = {
  eventStoryWarning: 'warning',
  eventStoryStart: 'start',
  eventStoryUnavailable: 'unavailable',
};

function storySummary(params, part, excavations) {
  const { eventType, cause, excavationId, weather } = params;
  if (!eventType) return params.summary;
  const values = { ...params };
  if (excavationId != null && ['fire', 'flood', 'breakdown'].includes(eventType)) {
    values.name = excavationDisplayName(excavations, excavationId);
  }
  if (weather) values.weatherLabel = tr(weather);
  const fireText = eventType === 'fire' ? FIRE_TEXT_EN[cause]?.[part] : null;
  if (fireText) return fireText.replaceAll('{name}', () => values.name);
  const key = part === 'start' && params.textKey ? params.textKey : `story_${eventType}_${part}`;
  return Object.hasOwn(STR, key) ? tr(key, values) : params.summary;
}

function dilemmaKeys({ definitionId, choiceIndex }) {
  const radioNeighborId = /^radio-help-(.+)-\d+$/.exec(definitionId)?.[1];
  const radioNeighbor = RADIO_NEIGHBORS_FULL.find(({ id }) => id === radioNeighborId);
  const help = radioNeighbor?.events.map((id) => RADIO_EVENTS[id]).find((event) => event?.help)?.help;
  if (help) {
    const choice = help.choices[choiceIndex];
    return {
      title: help.titleKey,
      choice: choice?.labelKey,
      result: choice?.consequenceTextKey ?? choice?.consequenceKey ?? choice?.descriptionKey,
    };
  }
  return {
    title: dilemmaTextKey(definitionId, 'title'),
    choice: dilemmaTextKey(definitionId, 'choice', choiceIndex),
    result: dilemmaTextKey(definitionId, 'result', choiceIndex),
  };
}

function dilemmaSummary(code, params) {
  const keys = dilemmaKeys(params);
  const values = { name: params.name ?? '' };
  if (code === 'eventDilemmaChosen') {
    if (!Object.hasOwn(STR, keys.choice)) return params.summary;
    return tr('dilemmaChosenSummary', { choice: tr(keys.choice, values) });
  }
  if (!Object.hasOwn(STR, keys.title)) return params.summary;
  const title = tr(keys.title, values);
  if (code === 'eventDilemmaOffered') return title;
  if (code === 'eventDilemmaConsequenceFailed') return tr('dilemmaConsequenceFailedSummary', { title });
  if (!Object.hasOwn(STR, keys.result)) return params.summary;
  return tr('dilemmaConsequenceSummary', { title, text: tr(keys.result, values) });
}

export function localizeStoryJournalParams(entry, params, excavations) {
  if (getLanguage() !== 'en') return;
  const part = storyParts[entry.code];
  if (part) params.summary = storySummary(params, part, excavations);
  if (entry.code.startsWith('eventDilemma') && params.definitionId) params.summary = dilemmaSummary(entry.code, params);
}

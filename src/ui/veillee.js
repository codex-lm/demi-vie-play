import { TIME } from '../data/balance.js';
import { VEILLEE, VEILLEE_INSCRIPTIONS } from '../data/veillee.js';
import { M5 } from '../data/m5.js';
import { LEFT_OUTSIDE_ITEMS } from '../data/leftOutside.js';
import { tr } from '../data/strings.fr.js';
import { demieDates } from '../sim/demies.js';
import { nextVeilleePageTick, veilleeSubjects } from '../sim/veillee.js';
import { lockerMood } from './lockerModels.js';
import { dilemmaPanel } from './m5Panels.js';
import { formatJournalEntry } from './journal.js';
import { calendarDate } from './models.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const noteworthy = /^(?:alert|event(?:Death|Birth|Burial|Collapse|Cascade|Flood|Fire|Excavat|Dig|Dug|Room|Fit|Build|Surface|Expedition|Outside|Research)|labJournal(?:Birth|Death)|demiesJournal)/;

/** Snapshot facts stay on the date of the gathering, even if time keeps going. */
export function veilleeDayLines(sim, session = sim.veillee?.session) {
  if (!session) return [];
  const start = (session.day - 1) * TIME.TICKS_PER_DAY;
  const demies = demieDates(sim).filter(({ tick }) => tick >= start && tick <= session.tick)
    .map(({ tick, number }) => ({ tick, code: `demiesJournal${number}`, params: {}, level: 'demie' }));
  const entries = [...(session.facts ?? []), ...demies]
    .filter(entry => noteworthy.test(entry.code))
    .sort((a, b) => (b.tick ?? 0) - (a.tick ?? 0));
  const lines = [];
  for (const entry of entries) {
    const text = formatJournalEntry(entry, sim.excavations ?? [], { sim });
    if (text && !lines.includes(text)) lines.push(text);
    if (lines.length === 3) return lines;
  }
  if (lines.length === 0 && session.day <= VEILLEE.FIRST_WEEK) lines.push(tr('veilleeQuietDay'));
  if (lines.length < 3) lines.push(tr('veilleePopulation', { count: session.population ?? 0 }));
  if (lines.length < 3) lines.push(tr('veilleeConstruction', { count: session.constructedCount ?? 0 }));
  if (lines.length < 3) lines.push(tr('veilleeNoFact'));
  return lines;
}

export function veilleeInscriptionLines(sim, inscriptions = sim.exodus?.result?.story?.inscriptions ?? sim.veillee?.inscriptions ?? []) {
  return inscriptions.map(({ day, key }) => ({ day, key,
    text: tr('veilleeInscription', { day, words: tr(key) }) }));
}

export function veilleeWallMarkup(marks = []) {
  const days = [...new Set(marks)].sort((a, b) => a - b);
  const groups = [];
  for (let i = 0; i < days.length; i += VEILLEE.WEEK_DAYS) {
    groups.push(`<span class="veillee-mark-group" aria-hidden="true">${days.slice(i, i + VEILLEE.WEEK_DAYS)
      .map(day => `<i class="veillee-mark" data-veillee-mark="${day}"></i>`).join('')}</span>`);
  }
  const caption = escapeHtml(tr(days.length === 1 ? 'veilleeWallCountOne' : 'veilleeWallCount', { count: days.length }));
  return `<div class="veillee-wall" role="img" aria-label="${caption}">${groups.join('')}</div><small>${caption}</small>`;
}

function nextGatheringText(sim) {
  const tick = nextVeilleePageTick(sim);
  return Number.isFinite(tick) ? tr('veilleeNext', { date: tr('date', calendarDate(tick)) }) : '';
}

export function veilleeButtonHelp(sim) {
  if (!sim.veillee) return '';
  const session = sim.veillee.session;
  const text = session
    ? `${tr('veilleeReminder')} ${tr('veilleeDay', { day: session.day })}`
    : `${tr('veilleeUntilHelp')} ${nextGatheringText(sim)}`;
  const outsideAvailable = sim.tick < M5.PROTECTED_TICKS && (sim.leftOutside?.items ?? []).some(item => {
    const definition = LEFT_OUTSIDE_ITEMS.find(candidate => candidate.id === item.id);
    const duration = Math.round((definition?.durationHours ?? Infinity)
      * (sim.m5?.calendar?.durationFactor ?? 1) * TIME.TICKS_PER_HOUR);
    return item.status === 'available' && sim.tick + duration < item.deadlineTick;
  });
  return outsideAvailable ? `${text} ${tr('veilleeOutsideReminder')}` : text;
}

export function veilleeReminderMarkup(sim) {
  if (!sim.veillee) return '';
  return `<button type="button" class="wide veillee-reminder" data-m6-action="veilleePage">${escapeHtml(tr(sim.veillee.session ? 'veilleeReminder' : 'veilleeTitle'))}</button>`;
}

export function veilleeNotebookPanel(sim) {
  const state = sim.veillee;
  if (!state) return '';
  const session = state.session;
  const subjects = veilleeSubjects(sim);
  const agenda = subjects.map(subject => `<article class="veillee-subject" data-veillee-subject="${subject.id}">${dilemmaPanel(subject.pending, sim, { embedded: true })
    .replaceAll('data-m5-action="dilemmaChoice"', `data-m6-action="veilleeChoice" data-dilemma-id="${subject.id}"`)}</article>`).join('');
  const voice = session?.voice;
  const lines = veilleeDayLines(sim, session);
  const waiting = (state.queue ?? []).filter(subject => subject.status === 'waiting').length;
  const inscriptions = veilleeInscriptionLines(sim);
  const phrases = VEILLEE_INSCRIPTIONS[session?.milestone];
  const carve = !session ? '' : subjects.length ? `<p class="muted">${escapeHtml(tr('veilleeAnswerFirst'))}</p>`
    : phrases ? `<h3>${escapeHtml(tr('veilleeChooseWords'))}</h3><div class="veillee-phrases">${phrases.map((key, choice) => `<button type="button" data-m6-action="veilleeEngrave" data-choice-index="${choice}"><strong>${escapeHtml(tr(key))}</strong><span>${escapeHtml(tr('veilleeEngrave'))}</span></button>`).join('')}</div>`
      : `<button type="button" class="wide primary" data-m6-action="veilleeEngrave">${escapeHtml(tr('veilleeEngrave'))}</button>`;
  return `<section id="m6-notebook" class="m6-notebook veillee-notebook" aria-label="${escapeHtml(tr('veilleeTitle'))}">
    <div class="m6-panel-heading"><div><span class="eyebrow">${escapeHtml(tr('m6NotebookElder'))}</span><h2 tabindex="-1" data-veillee-heading>${escapeHtml(tr('veilleeTitle'))}</h2></div><button type="button" class="icon-button" data-m6-action="toggleNotebook" aria-label="${escapeHtml(tr('m6HideNotebook'))}">×</button></div>
    <p class="m6-elder-voice">${escapeHtml(tr('veilleeIntro'))}</p>
    ${session ? `<p class="veillee-date">${escapeHtml(tr('veilleeDay', { day: session.day }))}</p><h3>${escapeHtml(tr('veilleeToday'))}</h3><ol class="veillee-day-lines">${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ol>
      <h3>${escapeHtml(tr('veilleeVoice'))}</h3>${voice ? `<blockquote class="veillee-voice"><p>${escapeHtml(lockerMood(voice.cause))}</p><cite>${escapeHtml(voice.name)}</cite></blockquote>` : `<p class="muted">${escapeHtml(tr('veilleeNoVoice'))}</p>`}
      <h3>${escapeHtml(tr('veilleeAgenda'))}</h3>${agenda || `<p class="muted">${escapeHtml(tr('veilleeNoSubject'))}</p>`}` : `<p class="muted">${escapeHtml(tr('veilleeWaiting'))}</p>`}
    ${waiting ? `<p class="muted">${escapeHtml(tr('veilleeQueued', { count: waiting }))}</p>` : ''}
    <h3>${escapeHtml(tr('veilleeWall'))}</h3>${veilleeWallMarkup(state.marks)}${carve}
    ${inscriptions.length ? `<ol class="veillee-inscriptions">${inscriptions.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join('')}</ol>` : ''}
    ${nextGatheringText(sim) ? `<p class="muted">${escapeHtml(nextGatheringText(sim))}</p>` : ''}
    <button type="button" class="wide" data-m6-action="outsideObjectives">${escapeHtml(tr('veilleeBack'))}</button>
  </section>`;
}

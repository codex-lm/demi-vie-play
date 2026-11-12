// Presentation only: nothing here is saved in, or written to, the simulation.
import { TIME } from '../data/balance.js';
import { DEMIES } from '../data/demies.js';
import { ALERT_SPEED } from '../data/speeds.js';
import { getLanguage, tr } from '../data/strings.fr.js';
import { demieDates, demieProgress, firstDeathlessDeparture } from '../sim/demies.js';
import { calendarDate } from './models.js';
import { formatNumber } from './tooltips.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const departures = new WeakMap();

/** The costly projection is read at most once per day, per game object. */
export function departureOutlook(sim) {
  const day = Math.floor(sim.tick / TIME.TICKS_PER_DAY);
  let cached = departures.get(sim);
  if (!cached || cached.day !== day) {
    cached = { day, x: sim.radiation?.selectedX, value: firstDeathlessDeparture(sim) };
    departures.set(sim, cached);
  }
  return { ...cached.value, x: cached.x };
}

export function departureLines(sim, language = getLanguage()) {
  const dates = demieDates(sim);
  const outlook = departureOutlook(sim);
  const t = (key, values = {}) => tr(key, values, language);
  const habitable = t('demiesOutsideDate', { date: t('date', calendarDate(dates.at(-1).tick)) });
  const earlier = outlook.tick !== null && outlook.tick < dates.at(-1).tick;
  const departure = earlier ? t('demiesDepartureDate', { date: t('date', calendarDate(outlook.tick)) }) : '';
  return { habitable, departure, context: t('demiesDepartureContext', { x: outlook.x }), outlook };
}

export function demieCountdown(progress, language = getLanguage()) {
  if (!progress.next) return tr('demiesComplete', {}, language);
  const hours = Math.ceil(progress.remainingTicks / TIME.TICKS_PER_HOUR);
  const days = Math.ceil(progress.remainingTicks / TIME.TICKS_PER_DAY);
  const withinDay = progress.remainingTicks < TIME.TICKS_PER_DAY;
  return tr(withinDay ? 'demiesNextHours' : 'demiesNextDays', {
    number: progress.next.number, count: withinDay ? hours : days,
  }, language);
}

export function demiesHudView(sim, language = getLanguage()) {
  const progress = demieProgress(sim);
  const lines = departureLines(sim, language);
  const t = (key, values = {}) => tr(key, values, language);
  const explanation = t('demiesDivided', { factor: formatNumber(progress.divisionFactor, true, language) });
  const dates = progress.dates.filter((date) => date.number > progress.count)
    .map((date) => t('demiesDate', { number: date.number, date: t('date', calendarDate(date.tick)) }));
  const details = [explanation, ...dates, lines.habitable, lines.departure, lines.context, t('demiesMilestoneContext')].filter(Boolean);
  const dose = sim.radiation?.surfaceDose;
  const rate = Number.isFinite(dose) ? `${formatNumber(dose >= 1 ? Math.round(dose * 10) / 10 : dose, false, language)} mSv/h` : t('unknown');
  return { progress, rate, title: t('demiesTitle'), countdown: demieCountdown(progress, language),
    label: [demieCountdown(progress, language), rate, ...details].join('. '), help: details.join('\n'),
    detailsHtml: details.map((text) => `<p>${escapeHtml(text)}</p>`).join('') };
}

export function demiesHudHtml(sim, activeNumbers = [], language = getLanguage()) {
  const view = demiesHudView(sim, language);
  const { progress } = view;
  return `<button type="button" class="demies-summary" data-demies-toggle aria-expanded="false" aria-controls="demies-details" aria-label="${escapeHtml(view.label)}" title="${escapeHtml(view.help)}">
    <span class="demies-heading"><b>${escapeHtml(view.title)}</b><strong>${escapeHtml(view.rate)}</strong></span>
    <span class="demies-notches" aria-hidden="true">${progress.dates.map((date) => `<i data-demie="${date.number}" class="demie-notch${date.number <= progress.count ? ' passed' : ''}${activeNumbers.includes(date.number) ? ' celebrating' : ''}"></i>`).join('')}</span>
    <span class="demies-countdown">${escapeHtml(view.countdown)}</span>
  </button><div class="demies-details" id="demies-details" hidden>${view.detailsHtml}</div>`;
}

/** Rebuilt from the game clock, including after import. Never sim.log(). */
export function demiesJournalEntries(sim) {
  return demieDates(sim).filter((date) => date.tick <= sim.tick).map((date) => ({
    id: `demie-${date.number}`, tick: date.tick, code: `demiesJournal${date.number}`, level: 'demie', params: {},
  }));
}

export function visibleJournalEntries(sim) {
  return [...sim.journal, ...demiesJournalEntries(sim)].filter((entry) => entry.code !== 'eventResource')
    .sort((a, b) => a.tick - b.tick);
}

function dangerStamp(sim) {
  return (sim.journal ?? []).findLast((entry) => ['danger', 'error'].includes(entry.level))?.id ?? null;
}

/** A transient clock gesture. setSpeed would write the saved tutorial notebook;
 * the gesture changes only Game.speed, leaving the requested speed untouched.
 * Every explicit speed choice cancels restoration, even choosing the same speed.
 */
export class DemiesMoment {
  constructor(game) {
    this.game = game;
    this.reset(game.sim);
    if (game.setSpeed) {
      const setSpeed = game.setSpeed;
      game.setSpeed = (...args) => {
        this.cancel();
        return setSpeed.apply(game, args);
      };
    }
    // These existing operations copy the running speed into the saved tutorial
    // notebook. Remove our temporary pace BEFORE they touch the new game.
    for (const method of ['loadLocal', 'importSave', 'startNewGame']) {
      if (typeof game[method] !== 'function') continue;
      const original = game[method];
      game[method] = (...args) => {
        this.restore();
        const previousSim = game.sim;
        try { return original.apply(game, args); }
        finally { if (game.sim !== previousSim) this.reset(game.sim); }
      };
    }
  }

  reset(sim) {
    this.sim = sim;
    this.tick = sim.tick;
    this.lastCount = demieProgress(sim).count;
    this.activeNumbers = [];
    this.remaining = 0;
    this.restoreSpeed = null;
  }

  cancel() {
    this.restoreSpeed = null;
  }

  restore() {
    if (this.restoreSpeed !== null && this.game.speed === this.temporarySpeed) this.game.speed = this.restoreSpeed;
    this.cancel();
  }

  update(dt = 0) {
    const game = this.game;
    if (this.sim !== game.sim || game.sim.tick < this.tick) {
      // Loading a different game must not inherit a temporary clock slowdown.
      if (this.restoreSpeed !== null && game.speed === this.temporarySpeed) game.speed = this.restoreSpeed;
      this.reset(game.sim);
      return;
    }
    if (this.restoreSpeed !== null && (game.speed !== this.temporarySpeed
      || dangerStamp(game.sim) !== this.danger || game.sim.exodus?.result)) this.cancel();
    this.remaining = Math.max(0, this.remaining - Math.max(0, dt));
    if (this.remaining === 0 && this.activeNumbers.length) {
      if (this.restoreSpeed !== null) game.speed = this.restoreSpeed;
      this.cancel();
      this.activeNumbers = [];
    }
    const count = demieProgress(game.sim).count;
    if (count > this.lastCount) {
      const crossed = Array.from({ length: count - this.lastCount }, (_, i) => this.lastCount + i + 1);
      for (const number of crossed) game.audio?.playDemie?.(number);
      this.activeNumbers = [...new Set([...this.activeNumbers, ...crossed])];
      this.remaining = DEMIES.MOMENT_SECONDS;
      // The closest slow running pace (the same boundary as red alerts), read
      // from the real speed table. Pause and slower paces keep their cadence.
      const slow = TIME.SPEEDS.filter((speed) => speed > 0 && speed <= ALERT_SPEED).at(-1);
      if (game.speed > slow && !game.sim.exodus?.result) {
        this.restoreSpeed ??= game.speed;
        this.temporarySpeed = slow;
        this.danger = dangerStamp(game.sim);
        game.speed = slow;
      }
    }
    this.lastCount = count;
    this.tick = game.sim.tick;
  }
}

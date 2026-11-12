import { OPENING, OPENING_MODES, OPENING_PROFESSIONS } from '../data/opening.js';
import { tr } from '../data/strings.fr.js';
import { createInitialColonists } from '../sim/colonists.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const suffix = mode => mode[0].toUpperCase() + mode.slice(1);

// The twelve keep the trade they had at roll call even as they learn new skills.
// This constructor is pure and does not touch a game's random streams.
const originalCast = createInitialColonists({ x: 0, y: 0 });
export function openingProfessionKey(person) {
  const skills = originalCast.find(candidate => candidate.id === person.id)?.skills ?? person.skills;
  const skill = Object.keys(OPENING_PROFESSIONS).reduce((best, key) =>
    (skills?.[key] ?? 0) > (skills?.[best] ?? 0) ? key : best, 'dig');
  return OPENING_PROFESSIONS[skill];
}

// These short former trades are a presentation of existing skills, not new stats.
export function openingCast(people) {
  return people.map(person => ({ id: person.id, name: person.name, professionKey: openingProfessionKey(person) }));
}

export function openingMarkup(model) {
  const { stage, people, mode, reduceMotion } = model;
  const portrait = `<canvas class="opening-elder" data-art="drawElderPortrait" width="96" height="96" role="img" aria-label="${escapeHtml(tr('openingElder'))}"></canvas>`;
  let body;
  if (stage === 'hatch') {
    body = `<h2 id="opening-heading">${escapeHtml(tr('openingHatchTitle'))}</h2>
      <p>${escapeHtml(tr('openingHatchBody'))}</p>
      <button type="button" class="opening-hatch primary" data-opening-hold aria-describedby="opening-hint">
        <span class="opening-wheel" aria-hidden="true"><i></i><i></i><i></i></span>
        <strong>${escapeHtml(tr('openingSeal'))}</strong>
      </button>
      <progress data-opening-progress max="1" value="0" aria-label="${escapeHtml(tr('openingProgress'))}"></progress>
      <p id="opening-hint" class="opening-hint">${escapeHtml(tr(reduceMotion ? 'openingClick' : 'openingHold'))}</p>`;
  } else if (stage === 'rollcall') {
    body = `${portrait}<h2 id="opening-heading">${escapeHtml(tr('openingRollTitle'))}</h2>
      <p>${escapeHtml(tr('openingRollBody'))}</p>
      <ol class="opening-people">${people.map((person, index) => `<li data-opening-person="${index}"${index >= model.revealed ? ' hidden' : ''}>
        <strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(tr(person.professionKey))}</span></li>`).join('')}</ol>
      <p class="opening-count" data-opening-count aria-live="off">${escapeHtml(tr('openingCount', { count: model.revealed, total: people.length }))}</p>`;
  } else if (stage === 'question') {
    body = `${portrait}<h2 id="opening-heading">${escapeHtml(tr('openingQuestion'))}</h2>
      <div class="opening-answers">${OPENING_MODES.map(id => `<button type="button" class="opening-answer${id === mode ? ' primary' : ''}" data-opening-choice="${id}">
        <strong>${escapeHtml(tr(`openingAnswer${suffix(id)}`))}</strong>
        <span>${escapeHtml(tr(`openingEffect${suffix(id)}`))}</span>
        ${id === 'chroniqueur' ? `<small>${escapeHtml(tr('openingDefault'))}</small>` : ''}</button>`).join('')}</div>`;
  } else {
    body = `<h2 id="opening-heading">${escapeHtml(tr('openingPurposeTitle'))}</h2>
      <div class="opening-purpose"><p>${escapeHtml(tr('openingPurposeRock'))}</p>
      <p>${escapeHtml(tr('openingPurposeSky'))}</p><p>${escapeHtml(tr('openingPurposePeople'))}</p></div>
      <button type="button" class="primary" data-opening-next>${escapeHtml(tr('openingBegin'))}</button>`;
  }
  return `<section class="opening-dialog" role="dialog" aria-modal="true" aria-labelledby="opening-heading" data-opening-stage="${stage}" data-reduce-motion="${reduceMotion}">
    ${body}<button type="button" class="opening-skip" data-opening-next>${escapeHtml(tr('openingSkip'))}</button></section>`;
}

export class OpeningSequence {
  constructor({ root = null, people = [], reduceMotion = false, onFinish = () => {}, onSound = () => {}, environment = globalThis } = {}) {
    Object.assign(this, { root, people: openingCast(people), reduceMotion, onFinish, onSound, environment });
    this.stage = 'hatch';
    this.mode = 'chroniqueur';
    this.progress = 0;
    this.elapsed = 0;
    this.revealed = reduceMotion ? people.length : Math.min(1, people.length);
    this.holding = false;
    this.heldKey = null;
    this.listeners = [];
    this.lastSoundAt = -Infinity;
    this.clock = 0;
    this.bind(root, 'click', event => this.onClick(event));
    this.bind(root, 'pointerdown', event => this.onPointerDown(event));
    this.bind(root, 'pointerup', event => this.onPointerUp(event));
    this.bind(root, 'pointercancel', () => this.releaseHold());
    this.bind(root, 'lostpointercapture', () => this.releaseHold());
    this.bind(root, 'keydown', event => this.onKeyDown(event));
    this.bind(root, 'keyup', event => this.onKeyUp(event));
    this.bind(root, 'focusout', () => this.releaseHold());
    this.bind(root, 'contextmenu', event => { if (event.target.closest?.('[data-opening-hold]')) event.preventDefault(); });
    this.bind(environment, 'blur', () => { this.heldKey = null; this.releaseHold(); });
    this.bind(environment.document, 'visibilitychange', () => {
      if (environment.document.hidden) { this.heldKey = null; this.releaseHold(); }
      this.lastFrame = undefined;
    });
    this.render();
    const frame = time => {
      if (this.disposed) return;
      if (!environment.document?.hidden) this.update(this.lastFrame === undefined ? 0 : Math.max(0, time - this.lastFrame));
      this.lastFrame = time;
      if (!this.disposed) this.frame = environment.requestAnimationFrame(frame);
    };
    if (root && environment.requestAnimationFrame) this.frame = environment.requestAnimationFrame(frame);
  }

  bind(target, type, handler) {
    target?.addEventListener?.(type, handler);
    this.listeners.push(() => target?.removeEventListener?.(type, handler));
  }

  render() {
    if (!this.root || this.disposed) return;
    this.root.innerHTML = openingMarkup(this);
    this.root.scrollTop = 0;
    const preferred = this.stage === 'question' ? '[data-opening-choice="chroniqueur"]' : 'button';
    this.root.querySelector(preferred)?.focus({ preventScroll: true });
  }

  startHold(source = 'keyboard') {
    if (this.stage !== 'hatch' || this.disposed || this.holding) return false;
    if (this.reduceMotion) { this.skip(); return true; }
    this.holding = source;
    if (this.clock - this.lastSoundAt >= OPENING.HOLD_MS) {
      this.onSound('sfx.machine.airlock');
      this.lastSoundAt = this.clock;
    }
    return true;
  }

  releaseHold() {
    this.holding = false;
    this.progress = 0;
    this.paintProgress();
  }

  paintProgress() {
    const progress = this.root?.querySelector('[data-opening-progress]');
    if (progress) progress.value = this.progress;
    this.root?.querySelector('.opening-wheel')?.style.setProperty('--opening-turn', `${this.progress * 360}deg`);
  }

  update(deltaMs) {
    if (this.disposed || !Number.isFinite(deltaMs) || deltaMs < 0) return;
    this.clock += deltaMs;
    if (this.stage === 'hatch' && this.holding) {
      this.progress = Math.min(1, this.progress + deltaMs / OPENING.HOLD_MS);
      this.paintProgress();
      if (this.progress >= 1) this.skip();
    } else if (this.stage === 'rollcall') {
      this.elapsed += deltaMs;
      const count = this.reduceMotion ? this.people.length : Math.min(this.people.length, 1 + Math.floor(this.elapsed / OPENING.ROLL_CALL_MS * this.people.length));
      if (count !== this.revealed) {
        this.revealed = count;
        for (const row of this.root?.querySelectorAll('[data-opening-person]') ?? []) row.hidden = Number(row.dataset.openingPerson) >= count;
        this.root?.querySelector(`[data-opening-person="${count - 1}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
        const counter = this.root?.querySelector('[data-opening-count]');
        if (counter) counter.textContent = tr('openingCount', { count, total: this.people.length });
      }
      if (this.elapsed >= OPENING.ROLL_CALL_MS) this.skip();
    }
  }

  skip() {
    if (this.disposed) return false;
    if (this.stage === 'hatch') {
      this.onSound('sfx.surface.hatch');
      this.releaseHold();
      this.stage = 'rollcall';
      this.elapsed = 0;
    } else if (this.stage === 'rollcall') this.stage = 'question';
    else if (this.stage === 'question') this.stage = 'purpose';
    else if (this.stage === 'purpose') {
      this.stage = 'done';
      this.dispose();
      this.onFinish(this.mode);
      return true;
    } else return false;
    this.render();
    return true;
  }

  choose(mode) {
    if (this.stage !== 'question' || !OPENING_MODES.includes(mode) || this.disposed) return false;
    this.mode = mode;
    return this.skip();
  }

  onClick(event) {
    const target = event.target;
    const choice = target.closest?.('[data-opening-choice]');
    if (choice) this.choose(choice.dataset.openingChoice);
    else if (target.closest?.('[data-opening-next]')) this.skip();
    else if (this.reduceMotion && target.closest?.('[data-opening-hold]') && this.stage === 'hatch') this.skip();
  }

  onPointerDown(event) {
    const button = event.target.closest?.('[data-opening-hold]');
    if (!button || (event.button !== undefined && event.button !== 0) || event.isPrimary === false || this.reduceMotion) return;
    event.preventDefault();
    button.focus();
    button.setPointerCapture?.(event.pointerId);
    this.pointerId = event.pointerId;
    this.startHold('pointer');
  }

  onPointerUp(event) {
    if (event.pointerId === this.pointerId) this.releaseHold();
  }

  onKeyDown(event) {
    event.stopPropagation();
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!event.repeat) this.skip();
    } else if (event.code === 'Tab') {
      this.releaseHold();
      const buttons = [...(this.root?.querySelectorAll('button') ?? [])];
      if (!buttons.length) return;
      const first = buttons[0], last = buttons.at(-1);
      const active = this.environment.document?.activeElement;
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    } else if (['Space', 'Enter'].includes(event.code)) {
      if (event.repeat) { event.preventDefault(); return; }
      // Keep a held key from clicking the next screen when focus changes at 2 s.
      if (this.heldKey || event.target.closest?.('[data-opening-hold]')) {
        event.preventDefault();
        if (!event.repeat && !this.heldKey) {
          this.heldKey = event.code;
          this.startHold('keyboard');
        }
      }
    }
  }

  onKeyUp(event) {
    event.stopPropagation();
    if (event.code === this.heldKey) {
      event.preventDefault();
      this.heldKey = null;
      this.releaseHold();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.holding = false;
    for (const remove of this.listeners) remove();
    this.environment.cancelAnimationFrame?.(this.frame);
  }
}

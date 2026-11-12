import { PEOPLE, WORK_TYPES } from '../data/people.js';
import { TOKEN_PRIORITIES, TOKEN_STATES, TOKEN_SYSTEM_ROWS } from '../data/tokenBoard.js';
import { tr } from '../data/strings.fr.js';
import { canWork } from '../sim/jobs.js';
import { isEligibleForWork } from '../sim/lifecycle.js';
import { isStriking, lawEffect } from '../sim/laws.js';
import { pendingEncounterModel } from './m4Panels.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const SYMBOLS = Object.freeze({ post: '①', help: '②', never: '×' });
const SYSTEM_REASONS = Object.freeze({ outside: 'tokenBoardOutside', care: 'tokenBoardCare', trapped: 'tokenBoardTrapped', ossuary: 'tokenBoardDead' });
// The production row contains both ordinary and essential stations. Ask the
// real eligibility functions about both, so adolescents are not promised work
// at a workshop merely because they can keep a well or kitchen running.
const WORK_JOBS = Object.freeze({
  dig: [{ type: 'dig' }], haul: [{ type: 'haul' }], build: [{ type: 'fit' }],
  produce: [{ type: 'produce', roomType: 'workshop' }, { type: 'produce', roomType: 'well' }],
  crank: [{ type: 'crank' }], medic: [{ type: 'produce', roomType: 'infirmary' }],
  teach: [{ type: 'produce', roomType: 'school' }],
});

export function tokenInitials(person) {
  return String(person?.name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => [...part][0]).join('').toLocaleUpperCase();
}

/** The single, reversible encoding of a simple token into existing settings. */
export function tokenToPriorities({ row, state = 'post' }) {
  if (row !== 'relief' && (!WORK_TYPES.includes(row) || !TOKEN_STATES.includes(state))) return null;
  return {
    automaticPriorities: row === 'relief',
    priorities: Object.fromEntries(WORK_TYPES.map(work => [work,
      row === work ? TOKEN_PRIORITIES[state] : TOKEN_PRIORITIES.other])),
  };
}

/** Unrecognised or mixed saved settings remain visibly fine settings. */
export function prioritiesToToken(person) {
  const priorities = person?.priorities ?? {};
  if (Object.keys(priorities).length !== WORK_TYPES.length
    || WORK_TYPES.some(work => !Number.isInteger(priorities[work]))) return { row: 'fine', state: null };
  const changed = WORK_TYPES.filter(work => priorities[work] !== TOKEN_PRIORITIES.other);
  if (person.automaticPriorities) return { row: changed.length ? 'fine' : 'relief', state: null };
  if (changed.length !== 1) return { row: 'fine', state: null };
  const state = TOKEN_STATES.find(candidate => TOKEN_PRIORITIES[candidate] === priorities[changed[0]]);
  return state ? { row: changed[0], state } : { row: 'fine', state: null };
}

export function tokenSystemRow(person) {
  if (person?.dead || person?.health <= 0) return 'ossuary';
  if (person?.trappedIn != null) return 'trapped';
  if (person?.surfaceCrewId) return 'outside';
  if (person?.personal?.type === 'care') return 'care';
  return null;
}

export function tokenBoardState(sim, person) {
  const system = tokenSystemRow(person);
  const { row, state } = system ? { row: system, state: null } : prioritiesToToken(person);
  const labelKey = `tokenRow_${row}`;
  return { row, state, labelKey, readOnly: Boolean(system),
    label: `${tr(labelKey)}${state ? ` · ${tr(`tokenState_${state}`)}` : ''}`,
    reason: system ? tr(SYSTEM_REASONS[system]) : row === 'fine' ? tr('tokenBoardFineHint')
      : (person?.age ?? PEOPLE.ADULT_AGE) < PEOPLE.MINIMUM_WORK_AGE
        ? tr('tokenBoardTooYoung', { age: PEOPLE.MINIMUM_WORK_AGE }) : '',
  };
}

/** Read-only eligibility: ignore the old priority while testing a new post. */
export function tokenWorkAvailability(sim, person, work) {
  if (!person) return { allowed: false, reason: tr('tokenBoardNoSelection') };
  const system = tokenSystemRow(person);
  if (system) return { allowed: false, reason: tr(SYSTEM_REASONS[system]) };
  if (work === 'relief') return { allowed: true, reason: tr('tokenBoardReliefHint') };
  if (!WORK_TYPES.includes(work)) return { allowed: false, reason: '' };
  if ((person.age ?? PEOPLE.ADULT_AGE) < PEOPLE.MINIMUM_WORK_AGE) {
    return { allowed: false, reason: tr('tokenBoardTooYoung', { age: PEOPLE.MINIMUM_WORK_AGE }) };
  }
  if (person.carriedBy != null) return { allowed: false, reason: tr('tokenBoardCarried') };
  if (isStriking(sim, person)) return { allowed: false, reason: tr('tokenBoardStrike') };
  const candidate = { ...person, priorities: tokenToPriorities({ row: 'relief' }).priorities };
  const results = WORK_JOBS[work].map(job => canWork(sim, candidate, job));
  if (results.some(Boolean)) {
    const limited = results.some(result => !result);
    return { allowed: true, limited, reason: limited ? tr('tokenBoardVitalOnly') : '' };
  }
  const workAge = Math.max(PEOPLE.MINIMUM_WORK_AGE, lawEffect(sim, 'workAge', PEOPLE.ADULT_AGE));
  const reason = (person.age ?? PEOPLE.ADULT_AGE) < workAge
    ? tr('tokenBoardWorkAge', { age: workAge })
    : !isEligibleForWork(sim, person) ? tr('tokenBoardBlocked') : tr('actionFailed');
  return { allowed: false, reason };
}

export function tokenPlacementOrders(person, placement) {
  const settings = tokenToPriorities(placement);
  if (!settings || !person || WORK_TYPES.some(work => !Object.hasOwn(person.priorities ?? {}, work))) return [];
  if (settings.automaticPriorities) return [{ type: 'autoPriorities', colonistId: person.id }];
  return WORK_TYPES.map(work => ({ type: 'workPriority', colonistId: person.id, work, priority: settings.priorities[work] }));
}

export function finePrioritiesMarkup(person, { disabled = false } = {}) {
  const priorities = WORK_TYPES.map(work => `<div class="work-priority-row"><span>${escapeHtml(tr(`tokenRow_${work}`))}</span><div class="priority-values" role="group" aria-label="${escapeHtml(tr(`tokenRow_${work}`))}">${[0, 1, 2, 3, 4].map(priority => {
    const active = person.priorities?.[work] === priority;
    const label = `${tr(`tokenRow_${work}`)} · ${tr('priorityValue', { value: priority })}`;
    return `<button type="button" data-action="workPriority" data-colonist-id="${person.id}" data-work="${work}" data-priority="${priority}" data-board-focus="fine-${work}-${priority}" class="${active ? 'active' : ''}" aria-pressed="${active}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${disabled ? ' disabled' : ''}>${priority}</button>`;
  }).join('')}</div></div>`).join('');
  return `<div class="work-priorities">${priorities}</div><button type="button" class="wide ${person.automaticPriorities ? 'active' : ''}" data-action="autoPriorities" data-colonist-id="${person.id}" data-board-focus="fine-auto" aria-pressed="${Boolean(person.automaticPriorities)}"${disabled ? ' disabled' : ''}>${escapeHtml(tr('automatic'))}</button>`;
}

function tokenMarkup(person, model, selected) {
  return `<button type="button" class="board-token${selected ? ' picked' : ''}${model.state === 'never' ? ' reversed' : ''}" data-board-action="pick" data-colonist-id="${person.id}" data-board-focus="person-${person.id}" aria-pressed="${selected}" aria-label="${escapeHtml(tr('tokenBoardPick', { name: person.name, row: model.label }))}" title="${escapeHtml(`${person.name} · ${model.label}${model.reason ? ` · ${model.reason}` : ''}`)}"><span class="board-token-face" aria-hidden="true">${escapeHtml(tokenInitials(person))}</span><span class="board-token-name">${escapeHtml(person.name)}</span>${model.state ? `<small class="board-token-state">${SYMBOLS[model.state]} ${escapeHtml(tr(`tokenState_${model.state}`))}</small>` : ''}</button>`;
}

export function tokenBoardMarkup(sim, { selectedId = null, fineOpen = false, message = '' } = {}) {
  const people = [...(sim.colonists ?? [])].sort((a, b) => a.id - b.id);
  const person = people.find(candidate => candidate.id === selectedId);
  const models = people.map(candidate => ({ person: candidate, model: tokenBoardState(sim, candidate) }));
  const rows = ['relief', ...WORK_TYPES, 'fine', ...TOKEN_SYSTEM_ROWS].map(row => {
    const system = TOKEN_SYSTEM_ROWS.includes(row);
    const placement = row === 'relief' || WORK_TYPES.includes(row);
    const availability = placement ? tokenWorkAvailability(sim, person, row) : null;
    const members = models.filter(entry => entry.model.row === row);
    const rowLabel = tr(`tokenRow_${row}`);
    const description = system ? tr(SYSTEM_REASONS[row]) : row === 'fine' ? tr('tokenBoardFineHint')
      : person && availability.reason ? availability.reason : row === 'relief' ? tr('tokenBoardReliefHint') : '';
    const hooks = WORK_TYPES.includes(row) ? `<div class="board-hooks">${TOKEN_STATES.map(state => `<button type="button" data-board-action="place" data-row="${row}" data-state="${state}" data-board-focus="hook-${row}-${state}" aria-disabled="${!availability.allowed}" aria-label="${escapeHtml(tr('tokenBoardAttach', { row: rowLabel, state: tr(`tokenState_${state}`) }))}" title="${escapeHtml(availability.reason || tr(`tokenState_${state}`))}"><span aria-hidden="true">${SYMBOLS[state]}</span><small>${escapeHtml(tr(`tokenState_${state}`))}</small></button>`).join('')}</div>` : '';
    return `<section class="board-row${system ? ' system-row' : ''}" data-board-row="${row}" aria-label="${escapeHtml(rowLabel)}"><div class="board-row-heading">${placement
      ? `<button type="button" class="board-row-name" data-board-action="place" data-row="${row}" data-state="post" data-board-focus="row-${row}" aria-disabled="${!availability.allowed}">${escapeHtml(rowLabel)}</button>`
      : `<h3>${escapeHtml(rowLabel)}</h3>`}${system ? `<small class="board-system-label">${escapeHtml(tr('tokenBoardSystem'))}</small>` : ''}${hooks}</div><div class="board-row-tokens">${members.length ? members.map(entry => tokenMarkup(entry.person, entry.model, entry.person.id === selectedId)).join('') : `<span class="board-empty">${escapeHtml(tr('tokenBoardEmpty'))}</span>`}</div>${description ? `<p class="board-row-note">${escapeHtml(description)}</p>` : ''}</section>`;
  }).join('');
  const current = person && tokenBoardState(sim, person);
  return `<section class="token-board" role="dialog" aria-modal="true" aria-labelledby="token-board-title" aria-describedby="token-board-help" data-ui-panel="token-board"><header class="token-board-header"><h2 id="token-board-title">${escapeHtml(tr('tokenBoardTitle'))}</h2><button type="button" data-board-action="close" data-board-focus="close">${escapeHtml(tr('tokenBoardClose'))}</button></header><p id="token-board-help" class="menu-note">${escapeHtml(tr('tokenBoardHelp'))}</p><p class="board-legend">${escapeHtml(tr('tokenBoardLegend'))}</p><div class="board-status" role="status" aria-live="polite">${escapeHtml(message || (person ? tr('tokenBoardPicked', { name: person.name }) : tr('tokenBoardIdle')))}</div><div class="board-selection-actions">${person ? `<strong>${escapeHtml(person.name)}</strong><button type="button" data-board-action="locker" data-board-focus="locker">${escapeHtml(tr('tokenBoardLocker'))}</button><button type="button" data-board-action="fine" data-board-focus="fine" aria-expanded="${fineOpen}">${escapeHtml(tr('tokenBoardFine'))}</button>` : ''}</div>${person && current.readOnly ? `<p class="board-selection-note">${escapeHtml(current.reason)}</p>` : ''}${person && fineOpen ? `<section class="board-fine"><h3>${escapeHtml(tr('tokenBoardFinePerson', { name: person.name }))}</h3><p class="menu-note">${escapeHtml(tr('tokenBoardMapping'))}</p>${finePrioritiesMarkup(person, { disabled: current.readOnly })}</section>` : ''}<div class="board-rows">${rows}</div></section>`;
}

/** All input changes are existing orders. Selection and focus stay in the UI. */
export class TokenBoard {
  constructor(game, root = null) {
    this.game = game;
    this.document = root?.ownerDocument ?? globalThis.document;
    this.root = root ?? this.document.createElement('div');
    this.root.className = 'token-board-backdrop';
    this.root.hidden = true;
    this.opened = false;
    this.selectedId = null;
    this.fineOpen = false;
    this.message = '';
    this.lastMarkup = '';
    this.root.addEventListener('click', event => this.onClick(event));
    this.root.addEventListener('keydown', event => this.onKeyDown(event));
    // Key-up must still reach the game's controller to release any held pan key.
    if (!root) this.document.body.append(this.root);
  }

  open(colonistId = null) {
    this.sim = this.game.sim;
    this.previousFocus = this.document?.activeElement;
    this.game.input?.keys?.clear();
    this.selectedId = colonistId;
    this.fineOpen = false;
    this.message = '';
    this.opened = true;
    this.root.hidden = false;
    this.refresh(true);
    this.focus(colonistId == null ? 'close' : `person-${colonistId}`);
    return this;
  }

  close() {
    if (!this.opened) return false;
    this.opened = false;
    this.selectedId = null;
    this.root.hidden = true;
    if (this.previousFocus?.isConnected !== false) this.previousFocus?.focus?.({ preventScroll: true });
    return true;
  }

  focus(key) {
    const candidate = this.root.querySelector?.(`[data-board-focus="${key}"]`);
    const fallback = this.root.querySelector?.(`[data-board-focus="person-${this.selectedId}"]`)
      ?? this.root.querySelector?.('[data-board-focus="close"]');
    (candidate && !candidate.disabled ? candidate : fallback)?.focus?.({ preventScroll: true });
  }

  refresh(force = false) {
    if (!this.opened || this.applying) return;
    const sim = this.game.sim;
    // The simulation keeps running behind the board. Its decisions and ending
    // must remain reachable; a loaded game must not inherit a picked token.
    if (sim !== this.sim || sim.exodus?.result || sim.m5?.dilemmas?.pending
      || sim.m5?.poi?.encounter || pendingEncounterModel(sim)) {
      this.close();
      return;
    }
    const markup = tokenBoardMarkup(this.game.sim, this);
    if (!force && markup === this.lastMarkup) return;
    const active = this.document?.activeElement;
    const focusKey = this.root.contains?.(active) ? active?.dataset?.boardFocus : null;
    const scroll = this.root.querySelector?.('.token-board')?.scrollTop ?? 0;
    this.root.innerHTML = markup;
    this.lastMarkup = markup;
    const panel = this.root.querySelector?.('.token-board');
    if (panel) panel.scrollTop = scroll;
    if (focusKey) this.focus(focusKey);
  }

  applyOrders(orders) {
    this.applying = true;
    let ok = orders.length > 0;
    try {
      for (const order of orders) {
        if (!this.game.apply(order)?.ok) { ok = false; break; }
      }
    } finally { this.applying = false; }
    return ok;
  }

  onClick(event) {
    if (!this.opened) return;
    const button = event.target.closest?.('button[data-board-action], button[data-action]');
    if (!button || button.disabled) return;
    event.stopPropagation?.();
    const action = button.dataset.boardAction ?? button.dataset.action;
    const person = this.game.sim.colonists.find(candidate => candidate.id === this.selectedId);
    if (action === 'close') { this.close(); return; }
    if (action === 'pick') {
      this.selectedId = Number(button.dataset.colonistId);
      this.message = '';
      this.fineOpen = false;
    } else if (action === 'fine') {
      this.fineOpen = !this.fineOpen;
    } else if (action === 'locker' && person) {
      this.close();
      this.game.select?.({ type: 'colonist', id: person.id });
      return;
    } else if (action === 'place') {
      const availability = tokenWorkAvailability(this.game.sim, person, button.dataset.row);
      if (!availability.allowed) this.message = availability.reason;
      else {
        const placement = { row: button.dataset.row, state: button.dataset.state ?? 'post' };
        if (this.applyOrders(tokenPlacementOrders(person, placement))) {
          this.message = tr('tokenBoardPlaced', { name: person.name, row: tokenBoardState(this.game.sim, person).label });
          this.selectedId = null;
          this.fineOpen = false;
        } else this.message = tr('actionFailed');
      }
    } else if (person && !tokenSystemRow(person) && ['workPriority', 'autoPriorities'].includes(action)) {
      const order = action === 'autoPriorities' ? { type: action, colonistId: person.id }
        : { type: action, colonistId: person.id, work: button.dataset.work, priority: Number(button.dataset.priority) };
      this.message = this.applyOrders([order]) ? '' : tr('actionFailed');
    }
    this.refresh();
  }

  onKeyDown(event) {
    if (!this.opened) return;
    event.stopPropagation?.();
    const key = event.key ?? event.code;
    if (key === 'Escape') {
      event.preventDefault?.();
      if (this.selectedId != null) {
        const selected = this.selectedId;
        this.selectedId = null;
        this.fineOpen = false;
        this.message = tr('tokenBoardCancelled');
        this.refresh();
        this.focus(`person-${selected}`);
      } else this.close();
      return;
    }
    const buttons = [...this.root.querySelectorAll('button:not(:disabled)')];
    const active = this.document?.activeElement ?? event.target;
    const index = buttons.indexOf(active);
    if (key === 'Tab') {
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index === buttons.length - 1 || index < 0))) {
        event.preventDefault?.();
        buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
      }
    } else if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].includes(key)) {
      event.preventDefault?.();
      const next = key === 'Home' ? 0 : key === 'End' ? buttons.length - 1
        : (Math.max(0, index) + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (key === 'Enter' || key === ' ' || key === 'Space') {
      event.preventDefault?.();
      this.onClick({ target: event.target, stopPropagation() {} });
    }
  }
}

export function openTokenBoard(game, colonistId = null) {
  const board = game.ui?.tokenBoard ?? new TokenBoard(game);
  if (game.ui) game.ui.tokenBoard = board;
  return board.open(colonistId);
}

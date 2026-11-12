import { TIME } from '../data/balance.js';
import { LAWS } from '../data/laws.js';
import { WORKSHOP_RECIPES } from '../data/recipes.js';
import { RESEARCH_NODES } from '../data/research.js';
import { tr } from '../data/strings.fr.js';
import { formatNumber } from './tooltips.js';
import { finePrioritiesMarkup, tokenBoardState, tokenInitials } from './tokenBoard.js';
import { lockerHistoryEntries, lockerMood, lockerRelationKey, lockerSkillModels, personalObjectFor } from './lockerModels.js';
import { formatJournalEntry } from './journal.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function causeEntries(colonist) {
  const causes = colonist?.moraleCauses;
  if (Array.isArray(causes)) return causes;
  if (causes && typeof causes === 'object') {
    return Object.entries(causes).map(([key, value]) => typeof value === 'object' ? { key, ...value } : { key, value });
  }
  return [];
}

export function moraleCauseModels(colonist) {
  return causeEntries(colonist).map((cause) => {
    if (typeof cause === 'string') {
      const code = cause.startsWith('morale_') ? cause : `morale_${cause}`;
      return { code, line: tr(code), value: 0 };
    }
    const rawKey = cause.key ?? cause.cause ?? cause.code ?? cause.id ?? cause.type ?? cause.label ?? '';
    const code = String(rawKey).startsWith('morale_') ? String(rawKey) : `morale_${rawKey}`;
    const value = Number(cause.value ?? cause.amount ?? cause.delta ?? cause.morale ?? 0);
    return {
      code,
      value,
      line: tr('moraleCauseLine', {
        sign: value < 0 ? tr('negativeSign') : tr('positiveSign'),
        value: formatNumber(Math.abs(value), true),
        label: tr(code),
      }),
    };
  }).filter((cause) => cause.line);
}

export function moraleCauseLines(colonist) {
  return moraleCauseModels(colonist).map((cause) => cause.line);
}

export function colonistTokenPanel(sim, colonist) {
  const state = tokenBoardState(sim, colonist);
  return `<section class="locker-token" data-locker-section="token"><button type="button" class="locker-token-button" data-action="tokenBoard" data-colonist-id="${colonist.id}" aria-label="${escapeHtml(tr('tokenBoardTitle'))}"><span class="locker-token-round" aria-hidden="true">${escapeHtml(tokenInitials(colonist))}</span><span><strong>${escapeHtml(tr('lockerToken'))}</strong><small>${escapeHtml(state.label)}</small><span>${escapeHtml(tr('tokenBoardTitle'))} →</span></span></button></section>`;
}

function detailMarkup(id, line, detail, className = '') {
  return `<details class="locker-detail ${className}" data-locker-detail="${id}"><summary title="${escapeHtml(detail)}" data-locker-focus="${id}">${escapeHtml(line)}</summary><small>${escapeHtml(detail)}</small></details>`;
}

export function colonistSocialPanel(sim, colonist, { needsMarkup = '', souvenirMarkup = '' } = {}) {
  const traits = (colonist.traits ?? []).slice(0, 2).map(trait => `<li class="locker-habit" title="${escapeHtml(tr(`trait_${trait}`))}">${escapeHtml(tr(`lockerHabit_${trait}`))}</li>`).join('');
  const causes = moraleCauseModels(colonist).slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const primary = causes[0];
  const moraleCauses = causes.length
    ? `<div class="locker-mood-primary">${detailMarkup(`mood-${primary.code}`, lockerMood(primary), primary.line)}</div>
       <div class="locker-mood-others">${causes.slice(1).map(cause => detailMarkup(`mood-${cause.code}`, lockerMood(cause), cause.line)).join('')}</div>
       ${causes.some(cause => cause.code === 'morale_neglected') ? `<p class="locker-care-help" title="${escapeHtml(tr('collectiveCareRemedy'))}">${escapeHtml(tr('collectiveCareRemedy'))}</p>` : ''}`
    : `<p class="locker-mood-primary">${escapeHtml(tr('lockerMoodQuiet'))}</p>`;
  const partner = sim.colonists?.find((person) => person.id === colonist.coupleId && person.health > 0);
  const relations = Object.entries(colonist.relations ?? {})
    .map(([id, value]) => ({ person: sim.colonists?.find((candidate) => candidate.id === Number(id)), value: Number(value) }))
    .filter((entry) => entry.person && entry.person.health > 0 && Number.isFinite(entry.value))
    .sort((a, b) => (b.person.id === colonist.coupleId) - (a.person.id === colonist.coupleId)
      || Math.abs(b.value) - Math.abs(a.value) || a.person.id - b.person.id)
    .slice(0, 6);
  const relationList = relations.length
    ? `<ul class="locker-relations">${relations.map(({ person, value }) => `<li>${detailMarkup(`relation-${person.id}`, `${person.id === colonist.coupleId ? `${tr('relationPartner')} · ` : ''}${tr(lockerRelationKey(value), { name: person.name })}`, tr('lockerRelationValue', { name: person.name, value: formatNumber(value, true) }))}</li>`).join('')}</ul>`
    : `<p class="muted">${escapeHtml(tr('relation_none'))}</p>`;
  const object = personalObjectFor(sim, colonist);
  const skills = lockerSkillModels(colonist).map(skill => detailMarkup(`skill-${skill.skill}`, skill.line, skill.detail, 'locker-skill')).join('');
  const history = lockerHistoryEntries(sim, colonist).map(entry => ({ entry, text: formatJournalEntry(entry, sim.excavations ?? [], { sim }) })).filter(({ text }) => text);
  const historyMarkup = history.length ? `<ol class="locker-history">${history.map(({ entry, text }) => `<li data-locker-entry="${entry.id}"><time>${escapeHtml(tr('lockerHistoryDate', { day: Math.floor(entry.tick / TIME.TICKS_PER_DAY) + 1 }))}</time><span>${escapeHtml(text)}</span></li>`).join('')}</ol><small>${escapeHtml(tr('lockerHistoryLimit'))}</small>` : `<p class="muted">${escapeHtml(tr('lockerHistoryEmpty'))}</p>`;
  const behavior = colonist.crisis?.behavior;
  return `<section class="colonist-social locker-social" data-colonist-social="${colonist.id}">
    <section data-locker-section="object" class="locker-object"><h3>${escapeHtml(tr(Number.isFinite(colonist.birthTick) && colonist.birthTick >= 0 ? 'lockerObjectBornHere' : 'lockerObject'))}</h3><strong>${escapeHtml(tr(object.nameKey))}</strong><p>${escapeHtml(tr(object.textKey))}</p><small>${escapeHtml(tr('lockerObjectContext'))}</small></section>
    <section data-locker-section="skills"><h3>${escapeHtml(tr('lockerSkills'))}</h3><small class="locker-hint">${escapeHtml(tr('lockerDetailsHint'))}</small>${skills}</section>
    <section data-locker-section="mood"><h3>${escapeHtml(tr('lockerMood'))}</h3>${behavior ? `<p class="crisis-badge red">${escapeHtml(tr('crisis'))} · ${escapeHtml(tr(behavior))}</p>` : ''}${moraleCauses}</section>
    <section data-locker-section="habits"><h3>${escapeHtml(tr('lockerHabits'))}</h3><ul class="locker-habits">${traits}</ul></section>
    ${needsMarkup}
    <section data-locker-section="history"><h3>${escapeHtml(tr('lockerHistory'))}</h3>${historyMarkup}</section>
    <section data-locker-section="relations"><h3>${escapeHtml(tr('lockerRelations'))}</h3><p class="couple-name">${escapeHtml(tr('couple'))} · ${escapeHtml(partner?.name ?? tr('noCouple'))}</p>${relationList}</section>
    ${souvenirMarkup}
    <details class="locker-fine" data-locker-detail="fine"><summary data-locker-focus="fine">${escapeHtml(tr('lockerFine'))}</summary>${finePrioritiesMarkup(colonist)}</details>
  </section>`;
}

export function charterPanel(sim) {
  const charter = sim.charter ?? { active: {}, nextVoteTick: 0 };
  const cooldown = Math.max(0, (charter.nextVoteTick ?? 0) - (sim.tick ?? 0));
  const activeLaws = new Set(Object.values(charter.active ?? {}));
  const neglectedCount = (sim.colonists ?? []).filter((colonist) => colonist.health > 0
    && (colonist.moraleCauses ?? []).some((cause) => (cause.code ?? cause.key ?? cause.cause) === 'morale_neglected'
      && Number(cause.value ?? cause.amount ?? -1) < 0)).length;
  const showCareRemedies = neglectedCount >= 3;
  const nextVote = cooldown > 0
    ? `<p class="vote-cooldown">${escapeHtml(tr('nextVote', { day: Math.floor(charter.nextVoteTick / TIME.TICKS_PER_DAY) + 1 }))}</p>`
    : '';
  const laws = LAWS.map((law) => {
    const active = activeLaws.has(law.id);
    const disabled = cooldown > 0 || active;
    const careRemedy = showCareRemedies && (law.effects.socialCare ?? 0) > 0;
    return `<article class="law-card ${active ? 'voted' : ''} ${careRemedy ? 'care-remedy' : ''}" data-law-card="${law.id}">
      <div class="law-heading"><strong>${escapeHtml(tr(`law_${law.id}`))}</strong>${active ? `<span class="badge green">${escapeHtml(tr('lawVoted'))}</span>` : ''}${careRemedy ? `<span class="badge yellow">${escapeHtml(tr('collectiveCareBadge'))}</span>` : ''}</div>
      <p class="law-effect">${escapeHtml(tr(`law_${law.id}_effect`))}</p>
      <button type="button" class="wide" data-action="law" data-law-id="${law.id}" ${disabled ? 'disabled' : ''}>${escapeHtml(tr('signLaw'))}</button>
    </article>`;
  }).join('');
  const factions = ['remonteurs', 'profonds'].map((id) => {
    const support = Number(sim.factions?.[id]?.support ?? 50);
    return `<div class="faction-support"><span>${escapeHtml(tr('factionSupport', { name: tr(id), value: formatNumber(support, true) }))}</span></div>`;
  }).join('');
  const conflict = (sim.factions?.strikeUntil ?? 0) > (sim.tick ?? 0)
    ? `<div class="badges"><span class="badge red">${escapeHtml(tr('factionConflict'))} · ${escapeHtml(tr('strike'))}</span></div>` : '';
  return `<p class="menu-note">${escapeHtml(tr('charterHelp'))}</p>${nextVote}<section class="faction-panel"><h3>${escapeHtml(tr('factions'))}</h3>${factions}${conflict}</section><div class="law-list">${laws}</div>`;
}

function researchProgress(research, node) {
  if (research.current?.nodeId !== node.id) return null;
  if (Number.isFinite(research.current.ratio)) return Math.max(0, Math.min(100, research.current.ratio * 100));
  const progress = Number(research.current.progress ?? research.current.points ?? 0);
  return Math.max(0, Math.min(100, progress / node.points * 100));
}

export function researchPanel(sim) {
  const research = sim.research ?? { completed: [], current: null };
  const completed = new Set(research.completed ?? []);
  const cards = RESEARCH_NODES.map((node) => {
    const done = completed.has(node.id);
    const unlocked = node.prerequisites.every((id) => completed.has(id));
    const progress = researchProgress(research, node);
    const anotherActive = research.current && research.current.nodeId !== node.id;
    const disabled = done || !unlocked || progress !== null || Boolean(anotherActive);
    const status = done
      ? `<span class="badge green">${escapeHtml(tr('researchCompleted'))}</span>`
      : progress !== null
        ? `<span class="badge yellow">${escapeHtml(tr('researchInProgress', { value: formatNumber(progress, true) }))}</span>`
        : !unlocked ? `<span class="badge">${escapeHtml(tr('researchLocked'))}</span>` : '';
    const prerequisites = node.prerequisites.length
      ? `<p class="research-prerequisites">${escapeHtml(tr('researchPrerequisites', { value: node.prerequisites.map((id) => tr(`research_${id}`)).join(' · ') }))}</p>`
      : `<p class="research-prerequisites">${escapeHtml(tr('noPrerequisite'))}</p>`;
    return `<article class="research-node ${done ? 'completed' : unlocked ? 'unlocked' : 'locked'}" data-research-card="${node.id}" style="--research-column:${node.column + 1};--research-row:${node.row + 1}">
      <div class="research-heading"><strong>${escapeHtml(tr(`research_${node.id}`))}</strong>${status}</div>
      <p class="research-cost">${escapeHtml(tr('researchCost', { points: formatNumber(node.points, true), books: formatNumber(node.books, true) }))}</p>
      ${prerequisites}<p class="research-effect">${escapeHtml(tr(`research_${node.id}_effect`))}</p>
      <button type="button" data-action="research" data-node-id="${node.id}" ${disabled ? 'disabled' : ''}>${escapeHtml(tr('startResearch'))}</button>
    </article>`;
  }).join('');
  return `<p class="menu-note">${escapeHtml(tr('researchHelp'))}</p><div class="research-tree">${cards}</div>`;
}

export function workshopRecipePanel(sim, excavation) {
  if (excavation?.roomType !== 'workshop') return '';
  const completed = new Set(sim.research?.completed ?? []);
  const choices = Object.entries(WORKSHOP_RECIPES).map(([id, recipe]) => {
    const locked = recipe.research && !completed.has(recipe.research);
    const title = locked ? tr('researchPrerequisite') : tr(`${id}Recipe`);
    return `<option value="${id}" ${id === (excavation.recipeId ?? 'filters') ? 'selected' : ''} ${locked ? 'disabled' : ''} title="${escapeHtml(title)}">${escapeHtml(tr(`${id}Recipe`))}</option>`;
  }).join('');
  const selected = WORKSHOP_RECIPES[excavation.recipeId] ?? WORKSHOP_RECIPES.filters;
  const inputs = Object.entries(selected.inputs).map(([resource, amount]) => `${escapeHtml(tr(resource))} ${formatNumber(amount, true)}`).join(' · ');
  return `<section class="workshop-recipe"><h3>${escapeHtml(tr('workshopRecipe'))}</h3>
    <p class="menu-note">${escapeHtml(tr('workshopHelp'))}</p>
    <label class="priority-label">${escapeHtml(tr('workshopRecipe'))}<select data-setting="workshopRecipe" aria-label="${escapeHtml(tr('workshopRecipe'))}">${choices}</select></label>
    <dl class="fit-facts"><div><dt>${escapeHtml(tr('cost'))}</dt><dd>${inputs}</dd></div><div><dt>${escapeHtml(tr('production'))}</dt><dd>${escapeHtml(tr(selected.output))} ${formatNumber(selected.amount, true)}</dd></div></dl>
  </section>`;
}

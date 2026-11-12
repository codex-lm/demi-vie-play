import { tr } from '../data/strings.fr.js';
import { evacuationStatus, roomRedDanger } from '../sim/evacuation.js';
import { rescueStatus } from '../sim/rescueSignals.js';
import { excavationDisplayName, latestAlertModel } from './models.js';
import { formatJournalEntry } from './journal.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

/** Live information belongs to the panel/banner, never to the historical log. */
export function rescueText(sim, room) {
  const status = rescueStatus(sim, room);
  if (!status) return '';
  const passage = status.passage;
  return tr('rescueLiveSummary', {
    count: status.count, names: status.names.join(', '),
    condition: tr(`rescueCondition_${status.condition}`),
    passage: tr(`rescuePassage_${passage.count ? passage.state : 'unplanned'}`, { cleared: passage.cleared, total: passage.total }),
  });
}

export function rescuePanel(sim, room) {
  const text = rescueText(sim, room);
  return text ? `<section class="rescue-status" data-rescue-status><h3>${escapeHtml(tr('rescueTitle'))}</h3><p>${escapeHtml(text)}</p></section>` : '';
}

export function evacuationPanel(sim, room) {
  if (room.state === 'collapsed' || room.kind !== 'room') return '';
  // Small UI fixtures may lack a world. The live game always has one.
  const status = sim.world && sim.excavations ? evacuationStatus(sim, room)
    : { active: false, automatic: false, red: false, immobileNames: [], essential: [] };
  const action = status.active ? 'cancelEvacuation' : 'evacuate';
  const label = status.active ? 'evacuationReturn' : 'evacuationButton';
  const explanation = status.active ? status.automatic ? 'evacuationAutomatic' : 'evacuationPrecaution'
    : 'evacuationHelp';
  const warnings = [];
  if (status.immobileNames.length) warnings.push(tr('evacuationImmobile', { names: status.immobileNames.join(', ') }));
  for (const essential of status.essential) warnings.push(tr(`evacuationOnly_${essential}`));
  if (!status.active && status.error) warnings.push(tr(status.error));
  return `<section class="evacuation-status${status.active ? ' active' : ''}" data-evacuation-status>
    <div class="panel-actions"><button type="button" class="${status.active ? '' : 'danger-button'}" data-action="${action}">${escapeHtml(tr(label))}</button></div>
    <p class="panel-help">${escapeHtml(tr(explanation))}</p>
    ${warnings.map((warning) => `<p class="evacuation-warning">${escapeHtml(warning)}</p>`).join('')}
  </section>`;
}

/** The existing banner omitted structure/fire events, which are room dangers too. */
export function rescueAlertModel(sim) {
  const localDanger = (entry, room) => {
    if (!room || room.state === 'collapsed') return false;
    if (entry.code === 'eventDanger') return (room.structuralAlertLevel ?? room.alertLevel ?? 0) >= 3;
    const category = { alertSmokeRed: 'smoke', alertMethaneRed: 'methane', alertWaterPocketRed: 'water' }[entry.code];
    return category && sim.m5?.hazards?.alertLevels?.[`${category}:${room.id}`] === 'danger';
  };
  const localCodes = new Set(['eventDanger', 'alertSmokeRed', 'alertMethaneRed', 'alertWaterPocketRed']);
  const journal = (sim.journal ?? []).filter((entry) => !localCodes.has(entry.code)
    || localDanger(entry, (sim.excavations ?? []).find(room => room.id === (entry.params?.excavationId ?? entry.params?.id))));
  let alert = latestAlertModel({ ...sim, journal });
  for (const room of sim.excavations ?? []) {
    if (room.kind !== 'room' || room.state === 'collapsed' || !roomRedDanger(sim, room)) continue;
    const candidate = [...journal].reverse().find((entry) =>
      (entry.params?.excavationId ?? entry.params?.id) === room.id
      && localCodes.has(entry.code))
      ?? { id: -room.id - 1, tick: 0, level: 'danger', code: 'evacuationRoomDanger',
        params: { excavationId: room.id }, focus: { x: room.x + room.w / 2, y: room.y + room.h / 2 } };
    if (alert?.severity === 'red' && ((alert.entry.tick ?? 0) > (candidate.tick ?? 0)
      || ((alert.entry.tick ?? 0) === (candidate.tick ?? 0) && (alert.entry.id ?? 0) >= (candidate.id ?? 0)))) continue;
    alert = { entry: candidate, severity: 'red' };
  }
  if (alert?.severity !== 'red') {
    const room = (sim.excavations ?? []).find(candidate => candidate.kind === 'room'
      && candidate.state !== 'collapsed' && candidate.evacuation);
    if (room) return {
      entry: { id: -room.id - 1, tick: room.evacuation.startedTick ?? 0, level: 'warning',
        code: 'evacuationReminder', params: { excavationId: room.id },
        focus: { x: room.x + room.w / 2, y: room.y + room.h / 2 } },
      severity: 'yellow', evacuation: { excavationId: room.id, active: true },
      text: tr('evacuationReminder', { excavationId: excavationDisplayName(sim.excavations, room) }),
    };
  }
  if (!alert) return null;
  const id = alert.entry.params?.excavationId ?? alert.entry.params?.id;
  const room = (sim.excavations ?? []).find((candidate) => candidate.id === id);
  const rescue = room && rescueText(sim, room);
  const evacuation = room?.kind === 'room' && room.state !== 'collapsed' && alert.severity === 'red'
    && roomRedDanger(sim, room) ? { excavationId: room.id, active: Boolean(room.evacuation) } : null;
  return {
    ...alert, evacuation,
    text: rescue ? `${excavationDisplayName(sim.excavations, room)} — ${rescue}`
      : formatJournalEntry(alert.entry, sim.excavations, { sim }),
  };
}

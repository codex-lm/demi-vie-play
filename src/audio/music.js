// Pure presentation policy. Its memory belongs to the audio bank, never the save.
import { TIME, WORK } from '../data/balance.js';
import { lawDefinition } from '../data/laws.js';

export const DANGER_HOLD_SECONDS = 20;
export const DANGER_FADE_SECONDS = 3.5;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const urgent = (category, value) => {
  const level = value?.level ?? value;
  return level === 'danger' || level === 'red'
    || ((level === 'warning' || level === 'yellow') && ['air', 'flood', 'structure'].includes(category));
};

/** Active levels only: old red journal entries must never keep danger music on. */
export function musicDanger(sim = {}) {
  if (Object.entries(sim.alerts ?? {}).some(([key, value]) => urgent(key, value))
    || Object.entries(sim.alertLevels ?? {}).some(([key, value]) => urgent(key, value))) return true;
  const hazards = sim.m5?.hazards;
  if (hazards?.level === 'danger' || Object.entries(hazards?.alertLevels ?? {}).some(([key, value]) =>
    urgent(key.startsWith('water:') ? 'flood' : key.split(':')[0], value))) return true;
  return (sim.excavations ?? []).some(room => room.state !== 'collapsed' && (
    (room.structuralAlertLevel ?? 0) > 0
    || (room.structureSegments ?? []).some(segment => (segment.structuralAlertLevel ?? 0) > 0)
    || Object.entries(room.alertLevels ?? {}).some(([key, value]) => urgent(key, value))));
}

/** The two slowest positive entries, not fixed x1/x3 values. */
export function slowAudioSpeed(speed, speeds = TIME.SPEEDS) {
  return [...new Set(speeds.filter(value => value > 0))].sort((a, b) => a - b).slice(0, 2).includes(speed);
}

export function nightMusic(sim = {}, speed, speeds = TIME.SPEEDS) {
  const hour = ((sim.tick ?? 0) % TIME.TICKS_PER_DAY) / TIME.TICKS_PER_HOUR;
  let workHours = WORK.DEFAULT_WORK_HOURS;
  for (const id of Object.values(sim.charter?.active ?? {})) {
    const hours = lawDefinition(id)?.effects?.workHours;
    if (Number.isFinite(hours)) workHours = hours;
  }
  const sleepingHours = hour < WORK.WORK_START_HOUR || hour >= WORK.WORK_START_HOUR + workHours;
  return sleepingHours && slowAudioSpeed(speed, speeds)
    ? { nightGain: 0.7, lowpass: 1600 } : { nightGain: 1, lowpass: 20000 };
}

function playable(entries, id) {
  return entries.find(entry => entry.id === id && !entry.demonstrationOnly && !entry.editorialDraft
    && entry.variants?.length > 0 && entry.variants.some(variant => variant.files?.ogg || variant.files?.mp3));
}

export function resolveMusicRole(role, season, entries = [], previousId = null) {
  if (playable(entries, role)) return role;
  if (role === 'music.danger' && playable(entries, previousId)) return previousId;
  if (role === 'music.work' || role === 'music.evening' || role === 'music.danger') {
    const seasonal = `music.${SEASONS.includes(season) ? season : 'spring'}`;
    return playable(entries, seasonal) ? seasonal : null;
  }
  return null;
}

/**
 * input: {sim, season, speed, title, film, now, loopEnded}. All time is audio
 * seconds supplied by the caller. Feed result.state into the next call; serial
 * changes only when another source should start. A completed Exode never loops.
 */
export function chooseMusic(input, previous = {}, entries = []) {
  const sim = input.sim ?? {}, now = Number.isFinite(input.now) ? input.now : 0;
  const season = SEASONS.includes(input.season) ? input.season : (sim.m5?.calendar?.season ?? 'spring');
  const paused = input.speed === 0;
  const state = { ...previous, counts: { ...previous.counts }, cycle: previous.cycle ?? 0 };
  const film = Boolean(input.film?.active);
  const title = Boolean(input.title);
  const activeDanger = !film && !title && musicDanger(sim);
  if (film || title) {
    state.dangerSince = null; state.resumeRole = null; state.resumeId = null;
  } else if (activeDanger && state.dangerSince == null) {
    state.dangerSince = now;
    state.resumeRole = previous.mode === 'calm' ? previous.role : null;
    state.resumeId = previous.mode === 'calm' ? previous.id : null;
  }
  const danger = !film && !title && (activeDanger
    || (state.dangerSince != null && now - state.dangerSince < DANGER_HOLD_SECONDS));
  if (!danger && !film && !title) state.dangerSince = null;
  if (input.loopEnded && previous.mode === 'calm' && !previous.paused && !danger) {
    state.cycle = (state.cycle + 1) % 3;
    state.resumeRole = null; state.resumeId = null;
  }
  const seasonalRole = season === 'summer' || season === 'autumn' ? 'music.work' : `music.${season}`;
  const calmRole = paused || state.cycle === 2 ? 'music.evening' : seasonalRole;
  const mode = film ? 'film' : title ? 'title' : danger ? 'danger' : 'calm';
  const role = film ? 'music.firstSky' : title ? 'music.title' : danger ? 'music.danger'
    : paused ? 'music.evening' : (state.resumeRole ?? calmRole);
  const fallbackId = state.resumeId ?? (['calm', 'danger'].includes(previous.mode) ? previous.id : null);
  let id = resolveMusicRole(role, season, entries, fallbackId);
  // An alert can straddle a season boundary: return to the actual interrupted
  // recording until its next loop, including a legacy summer/autumn fallback.
  if (mode === 'calm' && !paused && state.resumeId && playable(entries, state.resumeId)) id = state.resumeId;
  const replay = film && previous.mode === 'film'
    && Number.isFinite(previous.filmTime) && (input.film.time ?? 0) + 0.2 < previous.filmTime;
  const restart = id !== previous.id || replay || (Boolean(input.loopEnded) && !film && Boolean(id));
  let variant = previous.variant ?? 0;
  if (restart && id) {
    const count = state.counts[id] ?? 0;
    variant = count % playable(entries, id).variants.length;
    state.counts[id] = count + 1;
  }
  const serial = (previous.serial ?? 0) + (restart ? 1 : 0);
  const fade = mode === 'danger' || previous.mode === 'danger' ? DANGER_FADE_SECONDS : 0.8;
  const night = film || title ? { nightGain: 1, lowpass: 20000 } : nightMusic(sim, input.speed);
  Object.assign(state, { mode, role, id, variant, serial, paused, filmTime: input.film?.time });
  return { id, variant, role, serial, loop: !film, fade, ...night, state };
}

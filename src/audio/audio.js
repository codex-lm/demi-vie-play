import { CueReader, ambientState, clamp } from './cues.js';
import { ProceduralSynth } from './synth.js';
import { AudioBank } from './bank.js';
import { SupportRestorationReader } from './supportRestoration.js';
import { tr } from '../data/strings.fr.js';
import { panelSnapshot, panelTransition } from './panels.js';

const OPENING_SOUNDS = new Set(['sfx.surface.hatch', 'sfx.machine.airlock']);
const DEMIE_BELL_GAP = 0.18;

/** Lazy, optional audio: the game works unchanged when Web Audio is unavailable. */
export function createAudio(game, environment = globalThis) {
  const reader = new CueReader();
  reader.reset(game.sim);
  const supportReader = new SupportRestorationReader();
  supportReader.reset(game.sim);
  let context = null, synth = null, bank = null, muted = false, disposed = false, nextPoll = 0, lastClick = -Infinity, lastRefusal = -Infinity, observedSim = game.sim;
  let panelState = null;
  let nextDemie = 0;
  const demieVoices = new Set();
  const document = environment.document;
  const editable = target => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
  function cancelDemies() {
    for (const voice of demieVoices) {
      try { voice.source.stop(context.currentTime); } catch {}
      voice.end = context.currentTime;
    }
    demieVoices.clear();
    nextDemie = 0;
  }
  function start() {
    if (disposed) return;
    const AudioContext = environment.AudioContext ?? environment.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!context) {
        context = new AudioContext({ latencyHint: 'interactive' });
        synth = new ProceduralSynth(context, { seed: game.sim.seed });
        bank = new AudioBank(context, synth, environment);
        panelState = { panels: panelSnapshot(game), next: 0 };
        for (const id of ['sfx.ui.panel.open', 'sfx.ui.panel.close', ...OPENING_SOUNDS]) void bank.request(id);
        reader.reset(game.sim); supportReader.reset(game.sim); nextPoll = 0;
      }
      if (context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});
    } catch { /* Disabled audio hardware must never interrupt a frame or input. */ }
  }
  function gesture(event) {
    if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.altKey || event.metaKey)) return;
    start();
    const muteKey = event.key ? event.key.toLowerCase() === 'm' : event.code === 'KeyM';
    if (event.type === 'keydown' && muteKey && !editable(event.target)) {
      muted = !muted;
      if (muted) cancelDemies();
      // M only changes the master bus. Reopening the synthetic music bus here
      // would briefly layer it over a bank track until the next audio poll.
      if (synth) synth.level(synth.master.gain, muted ? 0 : clamp(game.options?.volume ?? 0.7), context.currentTime, 0.04);
    }
    const isClick = event.type === 'pointerdown' && event.button === 0 && event.target?.closest?.('button, [role="button"], input[type="range"], select');
    const isKey = event.type === 'keydown' && ['Enter', 'Space'].includes(event.code) && event.target?.closest?.('button, [role="button"]');
    if ((isClick || isKey) && synth && context.currentTime - lastClick >= 0.055) {
      bank.play({ type: 'click' }); lastClick = context.currentTime;
    }
  }
  document?.addEventListener?.('pointerdown', gesture, { passive: true });
  document?.addEventListener?.('keydown', gesture);
  function playOrderRefusal() {
    if (disposed || !synth || context.state !== 'running' || muted || game.options?.volume === 0) return;
    if (context.currentTime - lastRefusal < 0.55) return;
    // Orders can arrive between audio polls, including just after volume changes.
    synth.level(synth.master.gain, clamp(game.options?.volume ?? 0.7), context.currentTime, 0.04);
    bank.play({ type: 'doorRefused', gain: 0.8, pan: 0 });
    lastRefusal = context.currentTime;
  }
  // Older UI versions expose refused orders only through the toast. The first
  // explicit result takes over permanently, even if audio is locked or muted.
  // Also guard the callback: a mutation may already be queued when we disconnect.
  let orderResultsConnected = false;
  const toast = document?.querySelector?.('#toast');
  const observer = toast && typeof environment.MutationObserver === 'function' ? new environment.MutationObserver(() => {
    if (orderResultsConnected) return;
    if (!toast.classList?.contains('visible') || toast.textContent !== tr('doorWallTooThin')) return;
    playOrderRefusal();
  }) : null;
  observer?.observe(toast, { childList: true, characterData: true, subtree: true });
  return {
    get context() { return context; },
    get muted() { return muted; },
    get stats() { return synth ? { ...synth.stats, bank: { ...bank.stats, musicId: bank.musicId },
      levels: { master: synth.master.gain.value, music: bank.music.gain.value, proceduralMusic: synth.music.gain.value },
      state: context.state, muted } : { state: 'locked', muted }; },
    onLanguageChange() { bank?.cancelVoice(); },
    // Demies belong to the interface clock, never to simulation events. The
    // caller consumes crossings even while silent: no bell waits for unlock.
    playDemie() {
      if (disposed || !synth || context.state !== 'running' || muted || game.options?.volume === 0) {
        cancelDemies();
        return false;
      }
      synth.level(synth.master.gain, clamp(game.options?.volume ?? 0.7), context.currentTime, 0.04);
      const time = Math.max(context.currentTime, nextDemie);
      nextDemie = time + DEMIE_BELL_GAP;
      const existing = new Set(synth.voices);
      synth.play({ type: 'demie', gain: 0.8, pan: 0 }, time);
      for (const voice of demieVoices) if (voice.end <= context.currentTime) demieVoices.delete(voice);
      for (const voice of synth.voices) if (!existing.has(voice)) demieVoices.add(voice);
      return true;
    },
    // The opening is presentation only: use the existing master bus without
    // adding a simulation event or replaying a sound after a slow download.
    playOpeningSound(assetId) {
      if (disposed || !OPENING_SOUNDS.has(assetId)) return false;
      start();
      if (!bank || !synth || context.state !== 'running' || muted || game.options?.volume === 0) return false;
      synth.level(synth.master.gain, clamp(game.options?.volume ?? 0.7), context.currentTime, 0.04);
      bank.play({ type: 'opening', assetId, gain: 0.8, pan: 0 });
      return true;
    },
    notifyOrderResult(result) {
      if (!orderResultsConnected) { orderResultsConnected = true; observer?.disconnect(); }
      if (result?.ok === false && result.error === 'doorWallTooThin') playOrderRefusal();
    },
    observeSupportAdvice(currentGame = game) {
      // Capture a newly drawn advice before the next 100 ms audio poll. A fast
      // x30 placement can otherwise finish between two polls. No query is run.
      if (synth && !disposed && context.state === 'running') supportReader.observe(currentGame);
    },
    update(currentGame = game) {
      game = currentGame;
      if (!synth || disposed) return;
      const now = context.currentTime;
      if (observedSim !== game.sim || game.sim.tick < reader.lastTick) {
        cancelDemies();
        observedSim = game.sim; bank.reset(); reader.reset(game.sim); supportReader.reset(game.sim); nextPoll = 0;
        panelState = { panels: panelSnapshot(game), next: now };
      }
      // A suspended AudioContext freezes its clock. Forget pending journal and
      // restoration observations so resuming cannot announce events completed while
      // it was silent, even when the normal 100 ms poll has not elapsed.
      if (context.state !== 'running') {
        cancelDemies();
        reader.reset(game.sim); supportReader.reset(game.sim);
        panelState = { panels: panelSnapshot(game), next: now };
        bank.lifeState = null;
        return;
      }
      if (muted || game.options?.volume === 0) cancelDemies();
      if (now < nextPoll) return;
      nextPoll = now + 0.1;
      const cues = reader.read(game, now);
      const panel = panelTransition(panelSnapshot(game), panelState, now);
      panelState = panel.state;
      if (panel.cue) cues.push(panel.cue);
      if (context.state === 'running') cues.push(...supportReader.read(game));
      const options = { ...game.options, muted };
      const state = bank.update(ambientState(game), options, game);
      synth.update(state.ambient, { ...options, music: state.musicReady ? 0 : options.music,
        nightGain: state.nightGain, lowpass: state.lowpass, duck: state.duck }, now);
      if (context.state !== 'running') return;
      // Muting also consumes events, so unmuting does not replay a backlog of voices.
      if (!muted && options.volume !== 0) for (const cue of cues) bank.play(cue);
    },
    dispose() {
      disposed = true;
      document?.removeEventListener?.('pointerdown', gesture);
      document?.removeEventListener?.('keydown', gesture);
      observer?.disconnect();
      bank?.dispose(); synth?.dispose();
      if (context && context.state !== 'closed') Promise.resolve(context.close()).catch(() => {});
    },
  };
}

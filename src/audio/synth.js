// Native Web Audio synthesis shared by live playback and the offline QA recording.
import { clamp } from './cues.js';

export const MAX_VOICES = 20;
const FLOOR = 0.00001;
const ROOTS = { spring: 146.832, summer: 164.814, autumn: 130.813, winter: 110 };
const MINOR = [0, 3, 7, 10, 12, 15, 19];
const hz = (root, semitones) => root * 2 ** (semitones / 12);
function randomStream(seed) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}

export class ProceduralSynth {
  constructor(context, { seed = 7, start = context.currentTime } = {}) {
    this.context = context;
    this.random = randomStream(seed ^ 0x4d564945);
    this.voices = [];
    this.stats = { triggered: {}, dropped: 0, peakVoices: 0 };
    this.nextMusic = start + 0.4;
    this.nextNote = start + 4.8;
    this.nextFire = start;
    this.phase = 0;
    this.master = context.createGain(); this.master.gain.value = 0;
    this.music = context.createGain(); this.music.gain.value = 0.5;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -18; this.compressor.knee.value = 16;
    this.compressor.ratio.value = 3; this.compressor.attack.value = 0.008; this.compressor.release.value = 0.28;
    this.music.connect(this.master); this.master.connect(this.compressor); this.compressor.connect(context.destination);
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 3.1), context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = this.random() * 2 - 1;
    this.loops = {
      rumble: this.loop('lowpass', 72, start), ventilation: this.loop('bandpass', 530, start),
      wind: this.loop('lowpass', 680, start), rain: this.loop('highpass', 2200, start),
    };
    this.stats.peakVoices = 4;
  }

  loop(type, frequency, start) {
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    source.buffer = this.noise; source.loop = true;
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.65; gain.gain.value = 0;
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(start, this.random() * 2);
    return { source, filter, gain };
  }

  level(param, value, time, smooth = 0.16) { param.setTargetAtTime(value, time, smooth); }
  reserve(time, duration) {
    // Scheduling an arpeggio in the future must not discard voices still alive
    // now. OfflineAudioContext remains at time zero during all scheduling.
    this.voices = this.voices.filter(v => v.end > this.context.currentTime);
    const end = time + duration + 0.01, boundaries = [];
    let active = 4;
    for (const voice of this.voices) {
      if (voice.end <= time || voice.start >= end) continue;
      if (voice.start <= time) active++;
      else boundaries.push([voice.start, 1]);
      if (voice.end < end) boundaries.push([voice.end, -1]);
    }
    let peak = active;
    // End before start at the same instant: scheduled intervals are half-open.
    boundaries.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, delta] of boundaries) { active += delta; peak = Math.max(peak, active); }
    if (peak + 1 > MAX_VOICES) { this.stats.dropped++; return false; }
    this.stats.peakVoices = Math.max(this.stats.peakVoices, peak + 1);
    return true;
  }

  voice({ time, duration = 0.2, frequency = 200, endFrequency, gain = 0.1, pan = 0, noise = false, filter = 'lowpass', cutoff = 1500, wave = 'sine', attack = 0.004, bus = this.master }) {
    time = Math.max(time, this.context.currentTime);
    if (!(gain > 0) || !this.reserve(time, duration)) return;
    const c = this.context, source = noise ? c.createBufferSource() : c.createOscillator();
    const envelope = c.createGain(), tone = c.createBiquadFilter(), stereo = c.createStereoPanner();
    if (noise) { source.buffer = this.noise; source.loop = true; }
    else { source.type = wave; source.frequency.setValueAtTime(frequency, time); if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, time + duration); }
    tone.type = filter; tone.frequency.value = cutoff; tone.Q.value = 0.65; stereo.pan.value = clamp(pan, -1, 1);
    envelope.gain.setValueAtTime(FLOOR, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(FLOOR, gain), time + Math.min(attack, duration * 0.4));
    envelope.gain.exponentialRampToValueAtTime(FLOOR, time + duration);
    source.connect(tone); tone.connect(envelope); envelope.connect(stereo); stereo.connect(bus);
    const voice = { source, start: time, end: time + duration + 0.01 };
    this.voices.push(voice);
    source.onended = () => { source.disconnect(); tone.disconnect(); envelope.disconnect(); stereo.disconnect(); };
    if (noise) source.start(time, this.random() * 2); else source.start(time);
    source.stop(time + duration + 0.01);
  }

  chord(time, notes, { root = 146.832, gain = 0.035, duration = 1.4, attack = 0.035, bus = this.master } = {}) {
    notes.forEach((n, i) => this.voice({ time: time + i * 0.035, duration, frequency: hz(root, n), gain, attack, cutoff: 1500, pan: (i - 1) * 0.22, bus }));
  }

  play(cue, time = this.context.currentTime) {
    const gain = clamp(cue.gain ?? 1, 0, 1.2), pan = cue.pan ?? 0;
    const voice = options => this.voice({ time, pan, ...options, gain: options.gain * gain });
    this.stats.triggered[cue.type] = (this.stats.triggered[cue.type] ?? 0) + 1;
    if (cue.type === 'pick') {
      const soft = ['topsoil', 'clay', 'sand', 'rubble'].includes(cue.material);
      const hard = ['granite', 'concrete'].includes(cue.material);
      const pitch = (soft ? 130 : hard ? 890 : cue.material === 'coal' ? 310 : 590) * (0.9 + this.random() * 0.2);
      voice({ duration: soft ? 0.115 : 0.22, frequency: pitch, endFrequency: pitch * 0.6, gain: soft ? 0.085 : 0.09, wave: 'triangle' });
      voice({ duration: 0.09 + this.random() * 0.045, noise: true, cutoff: soft ? 580 : 2700, gain: soft ? 0.18 : 0.14 });
    } else if (cue.type === 'collapse') {
      voice({ duration: 1.8, noise: true, cutoff: 210, gain: 0.48, attack: 0.018 });
      voice({ duration: 1.3, frequency: 72, endFrequency: 28, gain: 0.18 });
      voice({ duration: 0.75, noise: true, filter: 'bandpass', cutoff: 1200, gain: 0.13 });
    } else if (['crack', 'creak', 'dust'].includes(cue.type)) {
      const creak = cue.type === 'creak';
      voice({ duration: creak ? 0.65 : 0.21, noise: true, filter: 'bandpass', cutoff: creak ? 330 : cue.type === 'dust' ? 1600 : 820, gain: creak ? 0.2 : 0.14, attack: creak ? 0.07 : 0.003 });
      if (cue.type !== 'dust') voice({ duration: creak ? 0.5 : 0.12, frequency: 140, endFrequency: 76, gain: 0.065, wave: 'triangle' });
    } else if (cue.type === 'supportFailed') {
      // A dry fibre snap and a muted wooden body: a small object giving way,
      // distinct from the long rock crack/collapse and from spoken warnings.
      voice({ duration: 0.085, noise: true, filter: 'bandpass', cutoff: 1550, gain: 0.095, attack: 0.001 });
      voice({ duration: 0.105, frequency: 190, endFrequency: 85, gain: 0.038, wave: 'triangle', cutoff: 780, attack: 0.002 });
    } else if (cue.type === 'digBlocked') {
      // Two dry tool taps: an interrupted digging rhythm, no alarm siren.
      for (const offset of [0, 0.13]) voice({ time: time + offset, duration: 0.075, frequency: 280, endFrequency: 150, gain: 0.055, wave: 'triangle', cutoff: 750 });
    } else if (cue.type === 'missingLadder') {
      // Three light ascending rungs, abruptly cut before reaching the next step.
      [310, 390, 490].forEach((frequency, i) => voice({ time: time + i * 0.095, duration: 0.085, frequency, gain: 0.04, wave: 'sine', cutoff: 1000 }));
    } else if (cue.type === 'cascadeWarning') {
      // Descending wooden knocks suggest the floors that would fall together.
      [240, 170, 110].forEach((frequency, i) => voice({ time: time + i * 0.16, duration: 0.19, frequency, endFrequency: frequency * 0.8, gain: 0.055, wave: 'triangle', cutoff: 680 }));
    } else if (cue.type === 'doorRefused') {
      // One muted latch and a short descending tone: distinct from a UI click.
      voice({ duration: 0.045, noise: true, filter: 'bandpass', cutoff: 850, gain: 0.055 });
      voice({ time: time + 0.04, duration: 0.18, frequency: 200, endFrequency: 115, gain: 0.05, wave: 'triangle', cutoff: 600 });
    } else if (cue.type === 'supportRestored') {
      // A quiet wooden seating tap, then two warm rising notes. The room has
      // actually returned to green: this is neither a warning nor a new voice.
      voice({ duration: 0.07, frequency: 180, endFrequency: 110, gain: 0.035, wave: 'triangle', cutoff: 600 });
      [330, 440].forEach((frequency, i) => voice({ time: time + 0.08 + i * 0.1,
        duration: 0.28, frequency, gain: 0.024, attack: 0.015, cutoff: 1100 }));
    } else if (cue.type === 'radio') {
      voice({ duration: 0.62, noise: true, filter: 'bandpass', cutoff: 1900, gain: 0.14, attack: 0.025 });
      voice({ duration: 0.12, frequency: 930, gain: 0.024 });
    } else if (cue.type === 'dilemma') this.chord(time, [0, 3, 10], { gain: 0.04 * gain, duration: 1.6 });
    else if (cue.type === 'birth') this.chord(time, [12, 15, 19], { root: 130.813, gain: 0.028 * gain, duration: 1.8 });
    else if (cue.type === 'death' || cue.type === 'burial') this.chord(time, [-12, -5], { root: 110, gain: 0.035 * gain, duration: 2.2, attack: 0.12 });
    else if (['opened', 'memory', 'objective'].includes(cue.type)) this.chord(time, cue.type === 'memory' ? [0, 7] : [0, 7, 12], { gain: 0.022 * gain, duration: 1.8, attack: 0.11 });
    else if (cue.type === 'fire') voice({ duration: 0.07 + this.random() * 0.07, noise: true, filter: 'highpass', cutoff: 800, gain: 0.055 });
    else if (cue.type === 'click') voice({ duration: 0.04, frequency: 530 + this.random() * 80, endFrequency: 300, gain: 0.055, wave: 'triangle' });
    else if (['drip', 'flood', 'breach', 'extinguish'].includes(cue.type)) voice({ duration: cue.type === 'drip' ? 0.15 : 0.9, noise: true, filter: 'bandpass', cutoff: 1200, gain: cue.type === 'breach' ? 0.3 : 0.12 });
    else if (['yellow', 'red', 'season'].includes(cue.type)) this.chord(time, cue.type === 'red' ? [0, 1, 7] : [0, 7, 12], { gain: 0.03 * gain, duration: 1.4 });
  }

  update(ambient, options = {}, time = this.context.currentTime) {
    this.level(this.master.gain, options.muted ? 0 : clamp(options.volume ?? 0.7), time, 0.04);
    this.level(this.music.gain, clamp(options.music ?? 0.5), time, 0.3);
    const deep = clamp(ambient.depth / 220);
    this.level(this.loops.rumble.gain.gain, 0.07 + deep * 0.15, time);
    this.level(this.loops.rumble.filter.frequency, 88 - deep * 45 + Math.sin(time * 0.17) * 4, time);
    this.level(this.loops.ventilation.gain.gain, ambient.ventilation * 0.065, time);
    this.level(this.loops.wind.gain.gain, ambient.bankWind ? 0 : ambient.surface * (0.055 + Math.sin(time * 0.23) * 0.01), time);
    this.level(this.loops.rain.gain.gain, ambient.bankRain ? 0 : ambient.surface * ambient.rain * 0.025, time);
    if (ambient.fire > 0.01 && time >= this.nextFire) {
      this.play({ type: 'fire', gain: ambient.fire, pan: ambient.firePan }, time);
      this.nextFire = time + 0.18 + this.random() * 0.45;
    }
    const root = ROOTS[ambient.season] ?? ROOTS.spring;
    if (time >= this.nextMusic) {
      const offset = [0, -7, -5, 0][this.phase++ % 4];
      this.chord(time, [offset - 12, offset + 3, offset + 7], { root, gain: 0.014, duration: 11.5, attack: 3.8, bus: this.music });
      this.nextMusic = time + 12 + this.random() * 4;
    }
    if (time >= this.nextNote) {
      this.voice({ time, duration: 3.7, frequency: hz(root, MINOR[Math.floor(this.random() * MINOR.length)]), gain: 0.018, attack: 0.06, pan: this.random() * 1.2 - 0.6, bus: this.music });
      this.nextNote = time + 4.4 + this.random() * 4.7;
    }
  }

  dispose() {
    for (const loop of Object.values(this.loops)) { try { loop.source.stop(); } catch {} loop.source.disconnect(); loop.filter.disconnect(); loop.gain.disconnect(); }
    for (const voice of this.voices) { try { voice.source.stop(); } catch {} }
    this.music.disconnect(); this.master.disconnect(); this.compressor.disconnect();
  }
}

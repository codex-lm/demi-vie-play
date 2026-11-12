// Local ElevenLabs bank. Fetch/decode is never awaited by the game loop.
import { clamp } from './cues.js';
import { radioText } from '../data/radioText.js';
import { getLanguage } from '../data/strings.fr.js';
import { chooseMusic } from './music.js';
import { computeLifeAudio } from './life.js';

// A full 600-second Suno finale is ~220 MiB decoded at 48 kHz stereo.
// LRU eviction still applies; the on-disk bank has a separate tools budget.
export const BANK_CACHE_BYTES = 256 * 1024 * 1024;
export const BANK_CONCURRENCY = 2;
export const BANK_MUSIC_LEVEL = 0.35;
const MAX_SOURCES = 16;
const normalizeSpeech = text => String(text ?? '').trim().replace(/^«\s*|\s*»$/g, '').replace(/\s+/g, ' ');
const assetUrl = path => {
  if (!/^assets\/audio\/[a-zA-Z0-9_./-]+\.(?:ogg|mp3)$/.test(path) || path.includes('..')) throw Error('Non-local audio path');
  return new URL(`../../${path}`, import.meta.url).href;
};

export function cueAsset(cue) {
  if (cue.assetId) return cue.assetId;
  if (cue.type === 'pick') {
    const material = { topsoil: 'shovel', concrete: 'granite', coal: 'limestone' }[cue.material] ?? cue.material;
    return `sfx.dig.${['clay', 'sand', 'sandstone', 'limestone', 'granite', 'shovel', 'rubble'].includes(material) ? material : 'limestone'}`;
  }
  if (cue.type === 'radio') return cue.message?.kind === 'silence' ? 'sfx.radio.cutoff' : 'sfx.radio.receive';
  if (cue.eventType === 'methaneExplosion') return 'sfx.fire.methane';
  if (cue.eventType === 'souvenirLeft') return 'sfx.life.burial';
  return {
    creak: 'sfx.structure.timber', crack: 'sfx.structure.crack', dust: 'sfx.structure.dust',
    collapse: 'sfx.structure.collapse', fire: 'sfx.fire.start', extinguish: 'sfx.fire.extinguish',
    drip: 'sfx.water.drip', flood: 'sfx.water.rising', breach: 'sfx.water.breach',
    birth: 'sfx.life.baby', burial: 'sfx.life.burial', dilemma: 'sfx.ui.dilemma',
    opened: 'sfx.ui.objective', memory: 'sfx.ui.objective', objective: 'sfx.ui.objective',
    click: 'sfx.ui.click', season: 'sfx.ui.season', yellow: 'sfx.ui.alert.yellow', red: 'sfx.ui.alert.red',
  }[cue.type] ?? null;
}

/** Exact text matching prevents outdated/demonstration voice files narrating new rules. */
export function radioVoiceEntry(entries, message) {
  if (!message?.textKey || message.kind === 'silence') return null;
  const expected = normalizeSpeech(radioText(message.textKey, message.params));
  return entries.find(entry => entry.kind === 'voice' && entry.id.startsWith('voice.radio.')
    && entry.textKey === message.textKey && !entry.demonstrationOnly && !entry.editorialDraft
    && normalizeSpeech(entry.text) === expected) ?? null;
}

export class AudioBank {
  constructor(context, synth, environment = globalThis) {
    this.context = context; this.synth = synth; this.environment = environment;
    this.entries = null; this.manifestPromise = null; this.requests = new Map(); this.cache = new Map();
    this.failed = new Set(); this.queue = []; this.inflight = 0; this.bytes = 0; this.serial = 0;
    this.sources = new Set(); this.loops = new Map(); this.variants = new Map(); this.epoch = 0;
    this.musicSource = null; this.musicId = null; this.musicFinished = null; this.musicRequest = null; this.musicSerial = 0;
    this.voice = null; this.voiceSerial = 0; this.disposed = false;
    this.musicPolicy = {}; this.lifeState = null; this.accent = null;
    this.stats = { requested: 0, loaded: 0, failed: 0, fallback: 0, played: {}, active: 0, bytes: 0, radioFiltered: 0 };
    this.music = context.createGain(); this.music.gain.value = 0; this.music.connect(synth.master);
    this.background = context.createGain(); this.background.gain.value = 1;
    this.musicFilter = context.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000;
    this.background.connect(this.musicFilter); this.musicFilter.connect(this.music);
  }

  async fetch(url, json = false) {
    if (typeof this.environment.fetch !== 'function') throw Error('Fetch unavailable');
    const controller = typeof this.environment.AbortController === 'function' ? new this.environment.AbortController() : null;
    const timer = controller && this.environment.setTimeout?.(() => controller.abort(), 8000);
    try {
      const response = await this.environment.fetch(url, { signal: controller?.signal, credentials: 'same-origin' });
      if (!response.ok) throw Error(`Audio HTTP ${response.status}`);
      return json ? await response.json() : await response.arrayBuffer();
    } finally { if (timer !== undefined && timer !== null) this.environment.clearTimeout?.(timer); }
  }

  manifest() {
    if (!this.manifestPromise) this.manifestPromise = this.fetch(new URL('../../assets/audio/manifest.json', import.meta.url).href, true)
      .then(data => { this.entries = Array.isArray(data.entries) ? data.entries : []; return this.entries; })
      .catch(() => { this.entries = []; this.stats.failed++; return []; });
    return this.manifestPromise;
  }

  request(id, variant = 0) {
    const key = `${id}:${variant}`;
    const cached = this.cache.get(key);
    if (cached) { cached.used = ++this.serial; return Promise.resolve(cached); }
    if (this.failed.has(key) || this.disposed) return Promise.resolve(null);
    if (this.requests.has(key)) return this.requests.get(key);
    if (this.queue.length >= 32) return Promise.resolve(null);
    const promise = new Promise(resolve => { this.queue.push({ id, variant, key, resolve }); });
    this.requests.set(key, promise); this.stats.requested++; this.pump();
    return promise;
  }

  pump() {
    while (!this.disposed && this.inflight < BANK_CONCURRENCY && this.queue.length) {
      const task = this.queue.shift(); this.inflight++;
      this.load(task).then(task.resolve).finally(() => { this.inflight--; this.requests.delete(task.key); this.pump(); });
    }
  }

  async load({ id, variant, key }) {
    try {
      const entries = await this.manifest(), entry = entries.find(entry => entry.id === id);
      const selected = entry?.variants?.[variant % entry.variants.length];
      if (!selected || entry.demonstrationOnly || entry.editorialDraft) throw Error('Unavailable bank entry');
      let buffer;
      // Decode, rather than HTMLMediaElement, also works with the static server's octet-stream MIME.
      for (const format of ['ogg', 'mp3']) {
        if (!selected.files?.[format]) continue;
        try { buffer = await this.context.decodeAudioData(await this.fetch(assetUrl(selected.files[format]))); break; } catch { /* Try the alternate local codec. */ }
      }
      if (!buffer || this.disposed) throw Error('Audio decode failed');
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      if (!(bytes > 0) || bytes > BANK_CACHE_BYTES) throw Error('Audio exceeds cache budget');
      const sample = { key, entry, buffer, bytes, used: ++this.serial };
      this.cache.set(key, sample); this.bytes += bytes; this.stats.loaded++; this.trim();
      return sample;
    } catch { this.failed.add(key); this.stats.failed++; return null; }
  }

  trim() {
    const pinned = new Set([...this.sources].map(source => source.sample.key));
    for (const [key, sample] of [...this.cache].sort((a, b) => a[1].used - b[1].used)) {
      if (this.bytes <= BANK_CACHE_BYTES) break;
      if (!pinned.has(key)) { this.bytes -= sample.bytes; this.cache.delete(key); }
    }
    this.stats.bytes = this.bytes;
  }

  source(sample, { gain = 1, pan = 0, loop = false, music = false, accent = false, radio = false, offset = 0 } = {}) {
    if (this.disposed || this.sources.size >= MAX_SOURCES) return null;
    const c = this.context, source = c.createBufferSource(), level = c.createGain(), stereo = c.createStereoPanner();
    const nodes = [source, level, stereo];
    source.buffer = sample.buffer; source.loop = loop;
    level.gain.value = clamp(gain, 0, 1.2) * (music ? BANK_MUSIC_LEVEL : clamp(sample.entry.volume ?? 0.3));
    stereo.pan.value = clamp(pan, -1, 1);
    let tail = source;
    if (radio) {
      const band = c.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1550; band.Q.value = 0.68;
      const shaper = c.createWaveShaper(); shaper.oversample = '2x';
      shaper.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh((i / 1023 * 2 - 1) * 1.35) / Math.tanh(1.35));
      source.connect(band); band.connect(shaper); tail = shaper; nodes.push(band, shaper);
      // Independent quiet static, gated to the same utterance. The recorded voice remains dry.
      const hiss = c.createBufferSource(), hissBand = c.createBiquadFilter(), hissGain = c.createGain();
      hiss.buffer = this.synth.noise; hiss.loop = true; hissBand.type = 'bandpass'; hissBand.frequency.value = 1900; hissBand.Q.value = 0.7;
      hissGain.gain.value = 0.009 * gain; hiss.connect(hissBand); hissBand.connect(hissGain); hissGain.connect(stereo);
      hiss.start(); hiss.stop(c.currentTime + sample.buffer.duration - offset);
      nodes.push(hiss, hissBand, hissGain); this.stats.radioFiltered++;
    }
    tail.connect(level); level.connect(stereo); stereo.connect(music ? accent ? this.music : this.background : this.synth.master);
    const voice = { source, level, nodes, sample, music, end: loop ? Infinity : c.currentTime + sample.buffer.duration - offset };
    this.sources.add(voice); this.stats.active = this.sources.size;
    this.stats.played[sample.entry.id] = (this.stats.played[sample.entry.id] ?? 0) + 1;
    source.onended = () => {
      for (const node of nodes) { try { if (node !== source && typeof node.stop === 'function') node.stop(); node.disconnect(); } catch {} }
      this.sources.delete(voice); this.stats.active = this.sources.size;
      if (this.voice === voice) this.voice = null;
      if (this.musicSource === voice) { this.musicSource = null; this.musicFinished = this.musicId; }
      if (this.accent === voice) this.accent = null;
      this.trim();
    };
    source.start(c.currentTime, Math.max(0, Math.min(offset, Math.max(0, sample.buffer.duration - 0.01))));
    return voice;
  }

  stop(voice, fade = 0.12) {
    if (!voice) return;
    const now = this.context.currentTime;
    voice.level.gain.setTargetAtTime(0, now, Math.max(0.005, fade / 4));
    try { voice.source.stop(now + fade); } catch {}
  }

  play(cue) {
    if ((cue.type === 'birth' || cue.type === 'objective') && this.playAccent(cue)) return;
    const id = cueAsset(cue);
    let played = false;
    if (id) {
      const count = this.variants.get(id) ?? 0;
      const entry = this.entries?.find(entry => entry.id === id);
      const variant = count % (entry?.variants?.length || 1), key = `${id}:${variant}`;
      const sample = this.cache.get(key) ?? this.cache.get(`${id}:0`);
      if (sample) { played = Boolean(this.source(sample, cue)); this.variants.set(id, count + 1); }
      // The current event gets an immediate synthetic cue. Never replay an impact after a slow fetch.
      void this.request(id, variant);
    }
    if (!played && !cue.assetId) { this.stats.fallback++; this.synth.play(cue); }
    if (cue.type === 'radio') this.speak(cue.message);
  }

  playAccent(cue) {
    const id = 'music.birth', entry = this.entries?.find(item => item.id === id);
    if (!entry?.variants?.length || entry.demonstrationOnly || entry.editorialDraft) return false;
    if (this.accent && this.context.currentTime < this.accent.end) return true;
    const count = this.variants.get(id) ?? 0, variant = count % entry.variants.length;
    const sample = this.cache.get(`${id}:${variant}`);
    void this.request(id, variant);
    if (!sample) return false; // Never replay a late celebration after its event.
    const voice = this.source(sample, { music: true, accent: true });
    if (!voice) return false;
    this.accent = voice; this.variants.set(id, count + 1);
    if (cue.type === 'objective' && sample.buffer.duration > 6) {
      voice.end = this.context.currentTime + 6;
      voice.level.gain.setTargetAtTime(0, voice.end - 0.5, 0.12);
      voice.source.stop(voice.end);
    }
    this.background.gain.setTargetAtTime((this.nightGain ?? 1) * 0.5, this.context.currentTime, 0.12);
    void this.request(id, (variant + 1) % entry.variants.length);
    return true;
  }

  async speak(message) {
    if (message?.kind === 'silence') this.cancelVoice();
    if (!message || message.kind === 'silence' || getLanguage() !== 'fr') return;
    const serial = ++this.voiceSerial, epoch = this.epoch, started = this.context.currentTime;
    const entries = await this.manifest(), entry = radioVoiceEntry(entries, message);
    if (!entry) return;
    const sample = await this.request(entry.id);
    if (!sample || serial !== this.voiceSerial || epoch !== this.epoch || this.disposed || this.muted || getLanguage() !== 'fr' || this.context.currentTime - started > 8) return;
    this.stop(this.voice); this.voice = this.source(sample, { gain: 0.8, radio: true });
  }

  cancelVoice() {
    this.voiceSerial++;
    this.stop(this.voice);
  }

  updateMusic(input, options) {
    const now = this.context.currentTime;
    this.music.gain.setTargetAtTime(clamp(options.music ?? 0.5), now, 0.2);
    if (!this.entries) {
      this.pendingMusic = { input, options };
      if (!this.waitingManifest) {
        this.waitingManifest = true;
        const epoch = this.epoch;
        void this.manifest().then(() => {
          this.waitingManifest = false;
          if (this.disposed || epoch !== this.epoch || !this.pendingMusic) return;
          this.updateMusic(this.pendingMusic.input, this.pendingMusic.options);
        });
      }
      return false;
    }
    if (!this.warmed) {
      this.warmed = true;
      const ids = ['music.birth', 'sfx.life.laughter', 'sfx.life.meal', 'sfx.life.cough', 'sfx.life.footstep',
        'sfx.surface.hatch', 'sfx.machine.airlock', 'sfx.machine.ladder', 'sfx.dig.cart', 'sfx.radio.tune'];
      for (const id of ids) if (this.entries.some(entry => entry.id === id)) void this.request(id);
    }
    // Native looping keeps a present track alive during a slow next-take decode.
    // Each natural boundary is consumed once by the pure musical policy.
    const loopEnded = Boolean(this.musicSource?.source.loop && now >= this.musicSource.cycleEnd);
    if (loopEnded) this.musicSource.cycleEnd = Infinity;
    const replay = input.film?.active && this.lastFilmTime !== undefined && input.film.time + 0.2 < this.lastFilmTime;
    this.lastFilmTime = input.film?.time;
    if (replay) this.musicPolicy = {};
    const choice = chooseMusic({ ...input, now, loopEnded }, this.musicPolicy, this.entries);
    this.musicPolicy = choice.state;
    this.nightGain = choice.nightGain;
    this.background.gain.setTargetAtTime(choice.nightGain * (this.accent && now < this.accent.end ? 0.5 : 1), now, 0.3);
    this.musicFilter.frequency.setTargetAtTime(choice.lowpass, now, 0.5);
    const key = `${choice.id}:${choice.variant}:${choice.serial}`;
    if (key !== this.musicKey || replay) {
      this.musicKey = key; this.musicSerial++; this.musicRequest = null; this.musicFinished = null;
      this.musicId = choice.id; this.musicChoice = choice;
    }
    if (choice.id && this.activeMusicKey !== key && this.musicFinished !== choice.id && this.musicRequest !== key
      && !options.muted && (options.music ?? 0.5) > 0 && (options.volume ?? 0.7) > 0) {
      this.musicRequest = key;
      const epoch = this.epoch, serial = this.musicSerial, fade = this.musicChoice.fade;
      void this.request(choice.id, choice.variant).then(sample => {
        if (this.disposed || epoch !== this.epoch || serial !== this.musicSerial) return;
        if (!sample) return;
        const next = this.source(sample, { music: true, loop: choice.loop, offset: choice.id === 'music.firstSky' ? this.lastFilmTime ?? 0 : 0 });
        if (!next) { this.musicRequest = null; return; }
        const old = this.musicSource;
        if (old) {
          next.level.gain.setValueAtTime(0, this.context.currentTime);
          next.level.gain.setTargetAtTime(BANK_MUSIC_LEVEL, this.context.currentTime, fade / 4);
          this.stop(old, fade);
        }
        this.musicSource = next; this.activeMusicKey = key;
        if (choice.role === 'music.danger' && old?.sample.entry.id !== 'music.danger') this.musicPolicy.dangerSince = this.context.currentTime;
        next.cycleEnd = this.context.currentTime + sample.buffer.duration;
        // Preload only the next take, keeping the bounded cache useful for SFX.
        if (choice.loop && sample.entry.variants.length > 1) void this.request(choice.id, (choice.variant + 1) % sample.entry.variants.length);
      });
    }
    // The finale may end in silence. It must not be followed by the fallback drone.
    return Boolean(this.musicSource || (choice.id === 'music.firstSky' && this.musicFinished === choice.id));
  }

  update(ambient, options = {}, game) {
    this.muted = Boolean(options.muted || options.volume === 0);
    const film = game.renderer?.m6?.cinematic;
    const title = game.m6Shell?.titleVisible;
    const musicReady = this.updateMusic({ sim: game.sim, speed: game.speed, season: ambient.season, title, film }, options);
    const life = computeLifeAudio(game, this.lifeState, this.context.currentTime, options);
    this.lifeState = life.state;
    const desired = title || film?.active ? {} : {
      'loop.machine.fan': ambient.ventilation, 'loop.surface.wind': ambient.surface,
      'loop.surface.rain': ambient.surface * ambient.rain, 'loop.fire': ambient.fire,
    };
    if (!title && !film?.active) Object.assign(desired, life.loops);
    if (!this.muted) for (const cue of life.cues) this.play(cue);
    const ready = {};
    for (const [id, value] of Object.entries(desired)) {
      const amount = typeof value === 'number' ? value * 0.35 : value.gain;
      const pan = typeof value === 'number' ? 0 : value.pan;
      if (!(amount > 0.0001) || this.muted) continue;
      let loop = this.loops.get(id);
      if (!loop) {
        const sample = this.cache.get(`${id}:0`);
        if (sample) { loop = this.source(sample, { gain: amount, pan, loop: true }); if (loop) this.loops.set(id, loop); }
        else void this.request(id);
      }
      if (loop) {
        loop.level.gain.setTargetAtTime(amount * loop.sample.entry.volume, this.context.currentTime, 0.3);
        loop.nodes[2].pan.setTargetAtTime(pan ?? 0, this.context.currentTime, 0.3); ready[id] = true;
      }
    }
    for (const [id, loop] of this.loops) if (!ready[id] || this.muted) { this.stop(loop, 0.4); this.loops.delete(id); }
    return {
      musicReady, nightGain: this.nightGain ?? 1, lowpass: this.musicPolicy ? this.musicFilter.frequency.value : 20000,
      duck: this.accent && this.context.currentTime < this.accent.end ? 0.5 : 1,
      ambient: { ...ambient, ventilation: ready['loop.machine.fan'] ? 0 : ambient.ventilation,
        // Rain uses its own surface weight in synthesis, so preserve it independently.
        bankRain: ready['loop.surface.rain'], bankWind: ready['loop.surface.wind'],
        fire: ready['loop.fire'] ? 0 : ambient.fire },
    };
  }

  reset() {
    this.epoch++; this.voiceSerial++; this.musicSerial++;
    for (const source of this.sources) this.stop(source, 0.05);
    this.loops.clear(); this.voice = null; this.musicSource = null; this.musicId = null; this.musicFinished = null; this.musicRequest = null;
    this.lastFilmTime = undefined;
    this.musicPolicy = {}; this.musicKey = null; this.activeMusicKey = null; this.musicChoice = null;
    this.lifeState = null; this.accent = null; this.pendingMusic = null; this.waitingManifest = false;
  }

  dispose() {
    this.disposed = true; this.reset();
    for (const task of this.queue.splice(0)) task.resolve(null);
    this.cache.clear(); this.bytes = 0; this.background.disconnect(); this.musicFilter.disconnect(); this.music.disconnect();
  }
}

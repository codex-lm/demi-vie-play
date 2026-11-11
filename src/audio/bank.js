// Local ElevenLabs bank. Fetch/decode is never awaited by the game loop.
import { clamp } from './cues.js';
import { radioText } from '../data/radioText.js';
import { getLanguage } from '../data/strings.fr.js';

export const BANK_CACHE_BYTES = 64 * 1024 * 1024;
export const BANK_CONCURRENCY = 2;
const MAX_SOURCES = 16;
const normalizeSpeech = text => String(text ?? '').trim().replace(/^«\s*|\s*»$/g, '').replace(/\s+/g, ' ');
const assetUrl = path => {
  if (!/^assets\/audio\/[a-zA-Z0-9_./-]+\.(?:ogg|mp3)$/.test(path) || path.includes('..')) throw Error('Non-local audio path');
  return new URL(`../../${path}`, import.meta.url).href;
};

export function cueAsset(cue) {
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
    this.stats = { requested: 0, loaded: 0, failed: 0, fallback: 0, played: {}, active: 0, bytes: 0, radioFiltered: 0 };
    this.music = context.createGain(); this.music.gain.value = 0; this.music.connect(synth.master);
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

  source(sample, { gain = 1, pan = 0, loop = false, music = false, radio = false, offset = 0 } = {}) {
    if (this.disposed || this.sources.size >= MAX_SOURCES) return null;
    const c = this.context, source = c.createBufferSource(), level = c.createGain(), stereo = c.createStereoPanner();
    const nodes = [source, level, stereo];
    source.buffer = sample.buffer; source.loop = loop;
    level.gain.value = clamp(gain, 0, 1.2) * clamp(sample.entry.volume ?? 0.3);
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
    tail.connect(level); level.connect(stereo); stereo.connect(music ? this.music : this.synth.master);
    const voice = { source, level, nodes, sample, music, end: loop ? Infinity : c.currentTime + sample.buffer.duration - offset };
    this.sources.add(voice); this.stats.active = this.sources.size;
    this.stats.played[sample.entry.id] = (this.stats.played[sample.entry.id] ?? 0) + 1;
    source.onended = () => {
      for (const node of nodes) { try { if (node !== source && typeof node.stop === 'function') node.stop(); node.disconnect(); } catch {} }
      this.sources.delete(voice); this.stats.active = this.sources.size;
      if (this.voice === voice) this.voice = null;
      if (this.musicSource === voice) { this.musicSource = null; this.musicFinished = this.musicId; }
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
    if (!played) { this.stats.fallback++; this.synth.play(cue); }
    if (cue.type === 'radio') this.speak(cue.message);
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

  updateMusic(id, options, film) {
    const replay = id === 'music.firstSky' && this.lastFilmTime !== undefined && film.time + 0.2 < this.lastFilmTime;
    this.lastFilmTime = film?.time;
    if (id !== this.musicId || replay) {
      this.musicSerial++;
      this.stop(this.musicSource, 0.8); this.musicSource = null;
      this.musicId = id; this.musicFinished = null; this.musicRequest = null;
    }
    this.music.gain.setTargetAtTime(clamp(options.music ?? 0.5), this.context.currentTime, 0.2);
    if (!this.musicSource && this.musicFinished !== id && this.musicRequest !== id && !options.muted && (options.music ?? 0.5) > 0 && (options.volume ?? 0.7) > 0) {
      this.musicRequest = id;
      const epoch = this.epoch, serial = this.musicSerial;
      void this.request(id).then(sample => {
        if (!sample || this.disposed || this.musicId !== id || epoch !== this.epoch || serial !== this.musicSerial) return;
        this.musicSource = this.source(sample, { music: true, loop: sample.entry.loop, offset: id === 'music.firstSky' ? this.lastFilmTime ?? 0 : 0 });
      });
    }
    return Boolean(this.musicSource);
  }

  update(ambient, options = {}, game) {
    this.muted = Boolean(options.muted || options.volume === 0);
    const film = game.renderer?.m6?.cinematic;
    const title = game.m6Shell?.titleVisible;
    const musicId = film?.active ? 'music.firstSky' : title ? 'music.title' : `music.${ambient.season}`;
    const musicReady = this.updateMusic(musicId, options, film);
    const desired = title || film?.active ? {} : {
      'loop.machine.fan': ambient.ventilation, 'loop.surface.wind': ambient.surface,
      'loop.surface.rain': ambient.surface * ambient.rain, 'loop.fire': ambient.fire,
    };
    const ready = {};
    for (const [id, amount] of Object.entries(desired)) {
      if (amount <= 0.02 || this.muted) continue;
      let loop = this.loops.get(id);
      if (!loop) {
        const sample = this.cache.get(`${id}:0`);
        if (sample) { loop = this.source(sample, { gain: amount * 0.35, loop: true }); if (loop) this.loops.set(id, loop); }
        else void this.request(id);
      }
      if (loop) {
        loop.level.gain.setTargetAtTime(amount * 0.35 * loop.sample.entry.volume, this.context.currentTime, 0.3); ready[id] = true;
      }
    }
    for (const [id, loop] of this.loops) if (!(desired[id] > 0.02) || this.muted) { this.stop(loop, 0.4); this.loops.delete(id); }
    return {
      musicReady,
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
  }

  dispose() {
    this.disposed = true; this.reset();
    for (const task of this.queue.splice(0)) task.resolve(null);
    this.cache.clear(); this.bytes = 0; this.music.disconnect();
  }
}

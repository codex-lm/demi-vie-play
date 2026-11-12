import { TIME } from './data/balance.js';
import { createScenario } from './data/scenarios.js';
import { Sim } from './sim/sim.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { UI } from './ui/hud.js';
import { InputController } from './ui/input.js';
import { updateStructure } from './sim/structure.js';
import { setM6Speed } from './sim/m6.js';
import { M6 } from './data/m6.js';
import { DEFAULT_SPEED, daySeconds, isSpeed, speedAfterAlert, ticksPerSecond } from './data/speeds.js';
import { createAudio } from './audio/audio.js';
import { VeilleeClock } from './ui/veilleeClock.js';

/** Real seconds a running game goes at most without an autosave. A game day
 * lasted this long at the former x1; at "Vivre" it lasts ten minutes. */
export const AUTOSAVE_SECONDS = 60;

/** Share of the current tick to draw while the game is paused. A game paused
 * in the middle of a tick holds everyone where they were drawn: at "Vivre" a
 * tick lasts 0.4 s, and jumping to its end made every walker hop up to 2.4
 * cells forward at each pause. A save, a scenario or a sim stepped while
 * paused has no tick under way: it shows the tick itself (1). */
export function pausedAlpha(game) {
  const hold = game.pauseHold;
  return hold && hold.sim === game.sim && hold.tick === game.sim.tick ? hold.alpha : 1;
}

export class Game {
  constructor({ canvas, seed = 1, speed = DEFAULT_SPEED, storyteller = 'chroniqueur', scenario = null, reveal = false, debug = false }) {
    this.canvas = canvas;
    this.sim = scenario ? createScenario(scenario) : new Sim(seed, { storyteller });
    if (reveal) this.sim.world.revealAll();
    updateStructure(this.sim);
    this.debug = debug;
    this.speed = isSpeed(speed) ? speed : DEFAULT_SPEED;
    this.previousSpeed = this.speed || DEFAULT_SPEED;
    setM6Speed(this.sim, this.speed);
    this.accumulator = 0;
    this.lastTime = null;
    this.renderTime = 0;
    this.camera = new Camera();
    this.renderer = new Renderer(canvas);
    this.syncViewport();
    if (scenario && this.sim.excavations.length > 0) {
      const left = Math.min(...this.sim.excavations.map((excavation) => excavation.x));
      const right = Math.max(...this.sim.excavations.map((excavation) => excavation.x + excavation.w));
      const top = Math.min(...this.sim.excavations.map((excavation) => excavation.y));
      const bottom = Math.max(...this.sim.excavations.map((excavation) => excavation.y + excavation.h));
      this.camera.focus((left + right) / 2, (top + bottom) / 2, true);
    }
    this.tool = { type: 'select' };
    this.hover = null;
    this.currentPreview = null;
    this.selection = null;
    this.overlay = 'none';
    this.lastSavedDay = Math.floor(this.sim.tick / TIME.TICKS_PER_DAY);
    this.lastSaveTime = null;
    this.ui = new UI(this);
    this.input = new InputController(this, canvas);
    this.audio = createAudio(this);
    this.veilleeClock = new VeilleeClock(this);
    this.syncViewport();
    this.frameCount = 0;
    this.fps = 0;
    this.fpsTime = 0;
    this.ticksThisFrame = 0;
    this.boundFrame = (time) => this.frame(time);
  }

  start() {
    requestAnimationFrame(this.boundFrame);
  }

  syncViewport() {
    this.renderer.resize();
    // The camera anchors the world under the permanent HUD; the alert banner
    // (full - permanent) is only honoured once it has stayed (see Camera).
    const hud = this.ui?.hudClearances?.() ?? { permanent: this.ui?.hudClearance?.() ?? 0 };
    this.camera.resize(this.renderer.width, this.renderer.height, hud.permanent, hud.full ?? hud.permanent);
  }

  frame(time) {
    if (this.lastTime === null) this.lastTime = time;
    const dt = Math.min(0.1, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.renderTime = time / 1000;
    this.accumulator += dt * ticksPerSecond(this.speed);
    const count = Math.min(TIME.MAX_TICKS_PER_FRAME, Math.floor(this.accumulator));
    this.accumulator -= count;
    if (this.sim.veillee) this.veilleeClock ??= new VeilleeClock(this);
    const eveningStopped = this.sim.veillee && this.veilleeClock.check();
    if (eveningStopped) this.accumulator = 0;
    if (count > 0 && !eveningStopped) {
      if (this.sim.veillee) {
        const stepped = this.veilleeClock.step(count);
        if (stepped < count || this.speed === 0) this.accumulator = 0;
      } else this.sim.step(count);
      // The tick whose progress the accumulator now measures (see pausedAlpha).
      this.steppedSim = this.sim;
      this.steppedTick = this.sim.tick;
    }
    if (this.sim.exodus?.result && this.speed !== 0) this.setSpeed(0);
    if (this.sim.emergency) {
      // A red alert brings a faster game down to "Travailler" (the former x1).
      // A player already slower, at "Vivre", stays there.
      const calmer = speedAfterAlert(this.speed);
      if (calmer !== this.speed) this.setSpeed(calmer);
      this.sim.emergency = false;
    }
    // Autosave at each new game day and, at a speed whose day lasts longer
    // than a real minute ("Vivre": ten minutes), once per real minute too: a
    // closed tab never loses more than it lost at the former x1.
    const day = Math.floor(this.sim.tick / TIME.TICKS_PER_DAY);
    this.lastSaveTime ??= this.renderTime;
    const overdue = this.speed > 0 && daySeconds(this.speed) > AUTOSAVE_SECONDS
      && this.renderTime - this.lastSaveTime >= AUTOSAVE_SECONDS;
    if (day !== this.lastSavedDay || overdue) {
      this.lastSavedDay = day;
      this.lastSaveTime = this.renderTime;
      this.saveLocal(false);
    }
    this.syncViewport();
    this.camera.update(dt);
    this.input.update?.(dt);
    // Draw people between the last two ticks at the share of the next tick
    // already elapsed, on every frame. At "Travailler" on a 60 Hz display most
    // frames run no tick, and at "Vivre" one tick spans some 25 frames; drawing
    // those at alpha 0 pulled every walker back to prevX (up to 2.4 cells) and
    // made it judder forward and back.
    this.renderer.render(this, this.speed === 0 ? pausedAlpha(this) : Math.max(0, Math.min(1, this.accumulator)), this.renderTime);
    this.audio.update(this, this.renderTime);
    this.ui.update(dt);
    this.frameCount += 1;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTime);
      this.frameCount = 0;
      this.fpsTime = 0;
    }
    requestAnimationFrame(this.boundFrame);
  }

  apply(order) {
    const result = this.sim.apply(order);
    this.currentPreview = null;
    if (this.sim.exodus?.result) this.speed = 0;
    this.ui.refresh?.();
    return result;
  }

  step(count = 1) {
    this.sim.step(count);
    if (this.sim.exodus?.result) this.speed = 0;
    this.ui.refresh?.();
    return this.sim.digest();
  }

  digest() {
    return this.sim.digest();
  }

  setSpeed(speed) {
    if (!isSpeed(speed)) return;
    this.veilleeClock?.cancel();
    if (this.speed > 0 && speed === 0) {
      // Pausing in mid-tick keeps the image: remember how far the tick was.
      const underWay = this.steppedSim === this.sim && this.steppedTick === this.sim.tick;
      this.pauseHold = underWay ? { sim: this.sim, tick: this.sim.tick, alpha: Math.max(0, Math.min(1, this.accumulator)) } : null;
    }
    if (this.speed === 0 && speed > 0) {
      // A pause held in mid-tick resumes from the same share of that tick.
      // Any other paused frame shows the current tick (alpha 1): the next tick
      // then starts at once, so people continue from that image instead of
      // jumping back to a stale fraction of the previous tick.
      if (pausedAlpha(this) >= 1) this.accumulator = Math.max(this.accumulator, 1);
      this.pauseHold = null;
    }
    if (speed > 0) this.previousSpeed = speed;
    this.speed = speed;
    setM6Speed(this.sim, speed);
    this.ui?.refresh?.();
    this.m6Shell?.refresh?.();
  }

  untilVeillee() {
    this.veilleeClock ??= new VeilleeClock(this);
    return this.veilleeClock.until();
  }

  startNewGame({ seed = 1, storyteller = 'chroniqueur', leftOutside = false, seededIdentities = false, veillee = false } = {}) {
    this.sim = new Sim(seed, { storyteller, leftOutside, seededIdentities, veillee });
    updateStructure(this.sim);
    this.accumulator = 0;
    this.lastTime = null;
    this.selection = null;
    this.currentPreview = null;
    this.drag = null;
    this.tool = { type: 'select' };
    this.overlay = 'none';
    this.camera = new Camera();
    this.lastSavedDay = Math.floor(this.sim.tick / TIME.TICKS_PER_DAY);
    // The colony saved before keeps its save for the first real minute.
    this.lastSaveTime = this.renderTime;
    // A new colony opens at "Vivre": slow enough to watch people live.
    this.previousSpeed = DEFAULT_SPEED;
    this.setSpeed(DEFAULT_SPEED);
    this.syncViewport();
    this.input?.cancel?.();
    this.ui?.refresh?.();
    return this.sim;
  }

  pausedAlpha() {
    return pausedAlpha(this);
  }

  togglePause() {
    this.setSpeed(this.speed === 0 ? this.previousSpeed : 0);
  }

  setTool(tool) {
    this.tool = { ...tool };
    this.currentPreview = null;
    this.input.cancel?.();
    this.ui.refresh?.();
  }

  setOverlay(overlay) {
    this.overlay = overlay;
    this.ui.refresh?.();
  }

  focus(x, y) {
    this.camera.focus(x, y);
  }

  select(selection) {
    this.selection = selection;
    this.ui.refresh?.();
  }

  saveLocal(notify = true) {
    try {
      localStorage.setItem(M6.SAVE_KEY, this.sim.serialize());
      this.lastSaveTime = this.renderTime;
      if (notify) this.sim.log('info', 'eventSaved');
      return true;
    } catch {
      this.ui.toast?.('saveError');
      return false;
    }
  }

  loadLocal() {
    try {
      const serialized = localStorage.getItem(M6.SAVE_KEY);
      if (!serialized) throw new Error('missing');
      this.sim = Sim.deserialize(serialized);
      setM6Speed(this.sim, this.speed);
      this.lastSavedDay = Math.floor(this.sim.tick / TIME.TICKS_PER_DAY);
      this.lastSaveTime = this.renderTime;
      this.selection = null;
      this.currentPreview = null;
      this.sim.log('info', 'eventLoaded');
      this.ui.refresh?.();
      return true;
    } catch {
      this.ui.toast?.('loadError');
      return false;
    }
  }

  importSave(serialized) {
    const loaded = Sim.deserialize(serialized);
    this.sim = loaded;
    setM6Speed(this.sim, this.speed);
    this.lastSavedDay = Math.floor(this.sim.tick / TIME.TICKS_PER_DAY);
    this.lastSaveTime = this.renderTime;
    this.selection = null;
    this.currentPreview = null;
    this.ui.refresh?.();
  }

  screenshot() {
    return this.canvas.toDataURL('image/png');
  }
}

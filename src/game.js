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
import { createAudio } from './audio/audio.js';

export class Game {
  constructor({ canvas, seed = 1, speed = 1, storyteller = 'chroniqueur', scenario = null, reveal = false, debug = false }) {
    this.canvas = canvas;
    this.sim = scenario ? createScenario(scenario) : new Sim(seed, { storyteller });
    if (reveal) this.sim.world.revealAll();
    updateStructure(this.sim);
    this.debug = debug;
    this.speed = TIME.SPEEDS.includes(speed) ? speed : 1;
    this.previousSpeed = this.speed || 1;
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
    this.ui = new UI(this);
    this.input = new InputController(this, canvas);
    this.audio = createAudio(this);
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
    this.accumulator += dt * TIME.TICKS_PER_SECOND_AT_X1 * this.speed;
    const count = Math.min(TIME.MAX_TICKS_PER_FRAME, Math.floor(this.accumulator));
    this.accumulator -= count;
    if (count > 0) this.sim.step(count);
    if (this.sim.exodus?.result && this.speed !== 0) this.setSpeed(0);
    if (this.sim.emergency) {
      if (this.speed > 1) this.setSpeed(1);
      this.sim.emergency = false;
    }
    const day = Math.floor(this.sim.tick / TIME.TICKS_PER_DAY);
    if (day !== this.lastSavedDay) {
      this.lastSavedDay = day;
      this.saveLocal(false);
    }
    this.syncViewport();
    this.camera.update(dt);
    this.input.update?.(dt);
    // Draw people between the last two ticks at the share of the next tick
    // already elapsed, on every frame. At x1 on a 60 Hz display most frames
    // run no tick; drawing those at alpha 0 pulled every walker back to prevX
    // (up to 2.4 cells) and made it judder forward and back.
    this.renderer.render(this, Math.max(0, Math.min(1, this.accumulator)), this.renderTime);
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
    if (!TIME.SPEEDS.includes(speed)) return;
    // A paused frame shows the current tick (alpha 1). On resume the next tick
    // starts at once, so people continue from that image instead of jumping
    // back to a stale fraction of the previous tick.
    if (this.speed === 0 && speed > 0) this.accumulator = Math.max(this.accumulator, 1);
    if (speed > 0) this.previousSpeed = speed;
    this.speed = speed;
    setM6Speed(this.sim, speed);
    this.ui?.refresh?.();
    this.m6Shell?.refresh?.();
  }

  startNewGame({ seed = 1, storyteller = 'chroniqueur' } = {}) {
    this.sim = new Sim(seed, { storyteller });
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
    this.previousSpeed = 1;
    this.setSpeed(1);
    this.syncViewport();
    this.input?.cancel?.();
    this.ui?.refresh?.();
    return this.sim;
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
    this.selection = null;
    this.currentPreview = null;
    this.ui.refresh?.();
  }

  screenshot() {
    return this.canvas.toDataURL('image/png');
  }
}

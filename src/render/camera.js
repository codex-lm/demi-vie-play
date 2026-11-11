import { CAMERA, WORLD } from '../data/balance.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The shelter alert banner comes and goes with the alerts (sometimes twice a
// game day, every few tenths of a second at x30) and floats over the sky. The
// top anchor only makes room for it once it has stayed this long, then eases
// there: a banner that toggles back within the delay never moves the world,
// and a banner that stays never hides the top of the world for good.
export const HUD_SETTLE_SECONDS = 1.5;
const HUD_EPSILON = 0.5;

export class Camera {
  constructor(width = 1280, height = 720, hudHeight = 0) {
    this.width = width;
    this.height = height;
    // hudHeight is the clearance the world honours (permanent HUD plus a
    // settled transient banner). screenHudHeight is the HUD as drawn right
    // now, for canvas legends that must stay clear of the banner itself.
    this.baseHudHeight = Math.max(0, hudHeight);
    this.transientHud = 0;
    this.pendingHud = null;
    this.hudHeight = this.baseHudHeight;
    this.screenHudHeight = this.baseHudHeight;
    this.x = WORLD.WIDTH / 2;
    this.y = WORLD.SURFACE_Y + 20;
    this.targetX = this.x;
    this.targetY = this.y;
    this.zoom = 1;
    this.targetZoom = 1;
    this.initialized = false;
  }

  /** hudHeight: permanent HUD clearance. screenHudHeight: the HUD including
   * transient elements (the alert banner); defaults to the permanent one. */
  resize(width, height, hudHeight = this.baseHudHeight, screenHudHeight = hudHeight) {
    const base = clamp(Number(hudHeight) || 0, 0, height);
    const screen = clamp(Math.max(base, Number(screenHudHeight) || 0), 0, height);
    const requested = screen - base;
    const layoutChanged = width !== this.width || height !== this.height || base !== this.baseHudHeight;
    // A new window size or permanent HUD re-lays everything out at once, the
    // banner included. Otherwise the banner waits for update() to settle it.
    if (!this.initialized || layoutChanged) {
      this.transientHud = requested;
      this.pendingHud = null;
    } else if (Math.abs(requested - this.transientHud) < HUD_EPSILON) this.pendingHud = null;
    else if (!this.pendingHud || Math.abs(this.pendingHud.height - requested) >= HUD_EPSILON) {
      this.pendingHud = { height: requested, elapsed: 0 };
    }
    const nextHudHeight = clamp(base + this.transientHud, 0, height);
    const wasAtTop = this.initialized && this.targetY <= this.minimumTargetY() + 1e-7;
    const changed = layoutChanged || nextHudHeight !== this.hudHeight;
    this.width = width;
    this.height = height;
    this.baseHudHeight = base;
    this.screenHudHeight = screen;
    this.hudHeight = nextHudHeight;
    if (!this.initialized) this.focusSurface(true);
    else {
      if (wasAtTop) this.targetY = this.minimumTargetY();
      this.constrainTargets();
      if (changed) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.zoom = this.targetZoom;
      }
    }
    return changed;
  }

  /** Highest camera centre: the top of the world sits just under the HUD. */
  minimumTargetY(zoom = this.targetZoom) {
    return this.visibleHeight(zoom) / 2 - this.hudHeight / this.cellSize(zoom);
  }

  /** Adopt a transient HUD height that outlasted HUD_SETTLE_SECONDS. No snap:
   * update() eases the camera to the new anchor like any other pan. */
  settleHud(transientHeight) {
    const wasAtTop = this.targetY <= this.minimumTargetY() + 1e-7;
    this.transientHud = transientHeight;
    this.pendingHud = null;
    this.hudHeight = clamp(this.baseHudHeight + transientHeight, 0, this.height);
    if (wasAtTop) this.targetY = this.minimumTargetY();
    this.constrainTargets();
  }

  baseCellSize() {
    return this.width / WORLD.WIDTH;
  }

  cellSize(zoom = this.zoom) {
    return this.baseCellSize() * zoom;
  }

  visibleWidth(zoom = this.zoom) {
    return this.width / this.cellSize(zoom);
  }

  visibleHeight(zoom = this.zoom) {
    return this.height / this.cellSize(zoom);
  }

  focusSurface(immediate = false) {
    const visibleHeight = this.visibleHeight(this.targetZoom);
    const cell = this.cellSize(this.targetZoom);
    const availableHeight = Math.max(1, this.height - this.hudHeight);
    const desiredSurfaceY = this.hudHeight + availableHeight * CAMERA.SURFACE_SCREEN_RATIO;
    const shelterBottomY = 24 * cell + 24;
    const surfaceY = Math.max(this.hudHeight + WORLD.SURFACE_Y * cell, Math.min(desiredSurfaceY, this.height - shelterBottomY));
    this.targetX = WORLD.WIDTH / 2;
    this.targetY = WORLD.SURFACE_Y + visibleHeight / 2 - surfaceY / cell;
    this.initialized = true;
    this.constrainTargets();
    if (immediate) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.zoom = this.targetZoom;
    }
  }

  focus(x, y, immediate = false) {
    this.targetX = x;
    this.targetY = y;
    this.constrainTargets();
    if (immediate) {
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }

  pan(dx, dy) {
    this.targetX += dx / this.cellSize(this.targetZoom);
    this.targetY += dy / this.cellSize(this.targetZoom);
    this.constrainTargets();
  }

  zoomAt(factor, screenX = this.width / 2, screenY = this.height / 2) {
    const keepSurface = this.targetY <= this.minimumTargetY() + 1e-7;
    const before = this.screenToWorld(screenX, screenY, true);
    this.targetZoom = clamp(this.targetZoom * factor, CAMERA.MIN_ZOOM, CAMERA.MAX_ZOOM);
    const cell = this.cellSize(this.targetZoom);
    const left = screenX / cell;
    const top = screenY / cell;
    this.targetX = before.x + this.visibleWidth(this.targetZoom) / 2 - left;
    this.targetY = before.y + this.visibleHeight(this.targetZoom) / 2 - top;
    if (keepSurface) this.targetY = this.visibleHeight(this.targetZoom) / 2 - this.hudHeight / cell;
    this.constrainTargets();
  }

  constrainTargets() {
    const halfW = this.visibleWidth(this.targetZoom) / 2;
    const halfH = this.visibleHeight(this.targetZoom) / 2;
    const topMargin = this.hudHeight / this.cellSize(this.targetZoom);
    this.targetX = this.visibleWidth(this.targetZoom) >= WORLD.WIDTH ? WORLD.WIDTH / 2 : clamp(this.targetX, halfW, WORLD.WIDTH - halfW);
    this.targetY = clamp(this.targetY, halfH - topMargin, WORLD.HEIGHT - halfH);
  }

  update(dt) {
    if (this.pendingHud) {
      this.pendingHud.elapsed += Math.max(0, Number(dt) || 0);
      if (this.pendingHud.elapsed >= HUD_SETTLE_SECONDS) this.settleHud(this.pendingHud.height);
    }
    const amount = 1 - Math.exp(-CAMERA.SMOOTHING * dt);
    this.zoom += (this.targetZoom - this.zoom) * amount;
    this.x += (this.targetX - this.x) * amount;
    this.y += (this.targetY - this.y) * amount;
  }

  screenToWorld(screenX, screenY, target = false) {
    const zoom = target ? this.targetZoom : this.zoom;
    const x = target ? this.targetX : this.x;
    const y = target ? this.targetY : this.y;
    const cell = this.cellSize(zoom);
    return {
      x: x - this.visibleWidth(zoom) / 2 + screenX / cell,
      y: y - this.visibleHeight(zoom) / 2 + screenY / cell,
    };
  }

  view(now = 0) {
    const cellSize = this.cellSize();
    const left = this.x - this.visibleWidth() / 2;
    const top = this.y - this.visibleHeight() / 2;
    return {
      left, top, cellSize, width: this.width, height: this.height, now,
      sx: (x) => (x - left) * cellSize,
      sy: (y) => (y - top) * cellSize,
    };
  }
}

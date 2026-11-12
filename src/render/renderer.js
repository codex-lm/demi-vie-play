import { TIME, WORLD } from '../data/balance.js';
import { surfaceTemperature } from '../sim/climate.js';
import { drawSurface, drawSurfaceStructure } from './surface.js';
import { drawTerrain } from './terrain.js';
import { drawRubble } from './rubble.js';
import { drawWater } from './water.js';
import { drawRooms } from './rooms.js';
import { drawColonists } from './colonists.js';
import { drawEffects, drawExcavationHighlights, collapseShake } from './effects.js';
import { drawLighting } from './lighting.js';
import { drawOverlays } from './overlays.js';
import { drawM5World } from './m5.js';
import { colorblindEnabled } from './overlayPalette.js';
import { updateM6Art } from './m6-ui.js';
import { drawHazards } from './hazards.js';
import { drawDangerPreview } from './dangerPreview.js';
import { drawSupportAdvice } from './supportAdvice.js';
import { drawShaftSky } from './shaftSky.js';
import { drawColdRooms } from './cold.js';
import { drawFalloutTerrain, drawWellContamination, drawAquiferPreview } from './fallout.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 0;
    this.height = 0;
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
    if (width === this.width && height === this.height && ratio === this.ratio) return false;
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    return true;
  }

  render(game, alpha = 0, now = 0) {
    this.resize();
    updateM6Art(game, now);
    // Opaque title/cinema already covers the world. Do not render a second
    // complete scene behind it; simulation clocks remain owned by Game.
    if (game.m6Shell?.titleVisible || this.m6?.cinematic?.active) return;
    const ctx = this.ctx;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#101315';
    ctx.fillRect(0, 0, this.width, this.height);
    const view = game.camera.view(now);
    // Keep static illustrations at the destination resolution throughout a
    // wheel gesture. Their on-screen size still follows the smoothed camera.
    view.rasterCell = game.camera.cellSize?.(game.camera.targetZoom) ?? view.cellSize;
    // A paused scenario/save displays current positions, not a stale previous
    // tick (notably the M6 teacher explicitly placed in the school). A game
    // paused in mid-tick keeps the share of the tick it was showing.
    view.alpha = game.speed === 0 ? (game.pausedAlpha?.() ?? 1) : alpha;
    const motionTime = game.options?.reduceMotion ? 0 : now;
    view.now = motionTime;
    const shake = collapseShake(game, now);
    ctx.save();
    ctx.translate(shake.x, shake.y);
    const horizon = view.sy(WORLD.SURFACE_Y);
    const rect = {
      x: 0, y: 0, width: this.width, height: this.height, horizon, left: view.left, rasterCell: view.rasterCell,
      showHotspots: game.overlay === 'radiation', selectedX: game.sim.radiation?.selectedX,
      colorblind: colorblindEnabled(game),
    };
    const day = game.sim.tick / TIME.TICKS_PER_DAY;
    const years = day / 360;
    const season = game.sim.m5?.calendar?.season ?? ['spring', 'summer', 'autumn', 'winter'][Math.floor((day % 360) / 90)];
    const hotspots = game.sim.radiation?.hotspots ?? [];
    const weather = game.sim.weather?.current ?? 'clear';
    drawSurface(ctx, rect, view.cellSize, { seed: game.sim.seed, years, season, weather, t: motionTime, hotspots, surfaceTemperature: surfaceTemperature(day) });
    for (const structure of game.sim.surface?.structures ?? []) {
      drawSurfaceStructure(ctx, structure.type, view.sx(structure.x), horizon, view.cellSize, {
        state: structure.state, active: structure.state === 'built', years, season, weather, t: motionTime,
        receiving: Boolean(game.sim.m5?.radio?.receiving ?? structure.receiving ?? game.sim.radio?.receiving),
        strength: game.sim.m5?.radio?.strength ?? 1,
      });
    }
    if (game.sim.surface?.hatch) {
      drawSurfaceStructure(ctx, 'airlock', view.sx(game.sim.surface.hatch.x), horizon, view.cellSize, { active: true, t: motionTime });
    }
    drawTerrain(ctx, game, view);
    drawFalloutTerrain(ctx, game, view);
    drawRubble(ctx, game, view);
    drawRooms(ctx, game, view);
    drawColdRooms(ctx, game, view);
    drawWater(ctx, game, view);
    drawColonists(ctx, game, view);
    drawEffects(ctx, game, view);
    drawM5World(ctx, game, view);
    drawLighting(ctx, game, view);
    drawWellContamination(ctx, game, view);
    drawExcavationHighlights(ctx, game, view);
    ctx.restore();
    drawOverlays(ctx, game, view);
    drawHazards(ctx, game, view);
    drawDangerPreview(ctx, game, view);
    drawAquiferPreview(ctx, game, view);
    drawSupportAdvice(ctx, game, view);
    drawShaftSky(ctx, game, view);
  }
}

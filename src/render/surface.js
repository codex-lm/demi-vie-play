import { WORLD } from '../data/balance.js';
import { drawSurface as drawArtSurface, drawSurfaceStructure as drawArtStructure, drawRadioWaves } from '../../art/surface.js';
import { drawRoomProps } from '../../art/props.js';
import { CIVIDIS } from './overlayPalette.js';
import { TIME } from '../data/balance.js';
import { DEMIES } from '../data/demies.js';
import { demieCount } from '../sim/demies.js';

const mix = (a, b, amount) => a.map((value, index) => Math.round(value + (b[index] - value) * amount));

/** Keep SPEC 13's annual hues, with a small permanent lift at every Demie. */
export function surfaceSkyColors(years = 0) {
  const top = years < 1 ? mix([83, 75, 64], [103, 108, 108], Math.max(0, years))
    : years < 3 ? [103, 108, 108] : [137, 169, 184];
  const bottom = years < 1 ? [132, 124, 103] : years < 3 ? [145, 149, 149] : [180, 207, 220];
  const tick = Math.round(Math.max(0, years) * TIME.DAYS_PER_YEAR * TIME.TICKS_PER_DAY);
  const lift = .12 * demieCount(tick) / DEMIES.COUNT;
  // Neutral light preserves the brown / gray / pale-blue progression. This is
  // a static tint, so reduced motion needs no animation or special timer.
  return { top: mix(top, [245, 245, 245], lift), bottom: mix(bottom, [245, 245, 245], lift) };
}

export function drawSurface(ctx, rect, cellPx, opts) {
  opts ??= {};
  const width = rect.width ?? rect.w, height = rect.height ?? rect.h;
  const horizon = rect.horizon ?? height * .35;
  const skyColors = surfaceSkyColors(opts.years);
  if (typeof ctx.save !== 'function' || typeof ctx.ellipse !== 'function') {
    // A small raster consumer can still sample the exact game sky without
    // implementing the complete Canvas API used by detailed illustration.
    const sky = ctx.createLinearGradient(0, rect.y ?? 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, `rgb(${skyColors.top.join(',')})`);
    sky.addColorStop(1, `rgb(${skyColors.bottom.join(',')})`);
    ctx.fillStyle = sky; ctx.fillRect(rect.x ?? 0, rect.y ?? 0, width, height);
    return;
  }
  if (horizon + cellPx * 2 < 0) return;
  ctx.save();
  ctx.fillStyle = `rgb(${skyColors.top.join(',')})`;
  ctx.fillRect(rect.x ?? 0, rect.y ?? 0, width, Math.max(0, Math.min(height, horizon)));
  ctx.restore();
  // Render a fixed landscape in world coordinates. Moving the camera must move
  // ruins with the ground, and never clamp the horizon into an underground view.
  const margin = 24, stageX = (rect.x ?? 0) - ((rect.left ?? 0) + margin) * cellPx;
  const stageY = (rect.y ?? 0) + horizon - WORLD.SKY_HEIGHT * cellPx;
  const stage = {
    x: stageX, y: stageY, w: (WORLD.WIDTH + margin * 2) * cellPx,
    h: (WORLD.SKY_HEIGHT + 2) * cellPx, horizon: WORLD.SKY_HEIGHT * cellPx,
    left: -margin, showHotspots: rect.showHotspots, selectedX: rect.selectedX,
    hotspotColors: rect.colorblind ? CIVIDIS : null,
  };
  const rasterCell = rect.rasterCell ?? cellPx;
  const landscape = { width: (WORLD.WIDTH + margin * 2) * rasterCell, height: (WORLD.SKY_HEIGHT + 2) * rasterCell,
    horizon: WORLD.SKY_HEIGHT * rasterCell, cell: rasterCell };
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x ?? 0, rect.y ?? 0, width, height); ctx.clip();
  drawArtSurface(ctx, stage, cellPx, { ...opts, skyColors, landscape });
  ctx.restore();
}

export function drawSurfaceStructure(ctx, type, x, y, cellPx, opts) {
  // The built antenna includes its small cutaway radio hut. It is an image of
  // the existing structure, not another room or a simulated remote settlement.
  if (type === 'antenna' && opts?.state === 'built') {
    const room = { x: x + cellPx * 1.4, y: y - cellPx * 2.65, w: cellPx * 4.15, h: cellPx * 2.65 };
    drawRoomProps(ctx, 'radio', room, cellPx, { ...opts, powered: opts.active !== false, light: true });
    ctx.save(); ctx.strokeStyle = '#887c64'; ctx.lineWidth = Math.max(1.2, cellPx * .10);
    ctx.strokeRect(room.x, room.y, room.w, room.h);
    ctx.beginPath(); ctx.moveTo(x, y - cellPx * 2.5); ctx.lineTo(room.x + room.w * .75, room.y);
    ctx.strokeStyle = '#4b5550'; ctx.lineWidth = Math.max(.8, cellPx * .035); ctx.stroke(); ctx.restore();
  }
  drawArtStructure(ctx, type, x, y, cellPx, opts ?? {});
  if (type === 'antenna' && opts?.receiving === true && opts.active !== false && opts.powered !== false) {
    drawRadioWaves(ctx, x, y - cellPx * 3.70, cellPx, { t: opts.t ?? 0, strength: opts.strength ?? 1 });
  }
}

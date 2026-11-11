import { AIR, HEAT, STRUCTURE, WATER, WORLD } from '../data/balance.js';
import { tr } from '../data/strings.fr.js';
import { roomDefinition } from '../data/rooms.js';
import { WATER_QUALITY } from '../sim/water.js';
import { colonistVisualPosition } from './colonists.js';
import { drawM6Geologist } from './m6-world.js';
import { colorblindEnabled, accessiblePalette, CIVIDIS, drawThresholdPattern } from './overlayPalette.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const COLORS = Object.freeze({
  green: { stroke: '#72cf8b', fill: 'rgba(66, 174, 104, 0.16)', dark: 'rgba(19, 48, 31, 0.9)' },
  yellow: { stroke: '#e7bd58', fill: 'rgba(213, 162, 49, 0.18)', dark: 'rgba(55, 43, 18, 0.92)' },
  red: { stroke: '#ed7458', fill: 'rgba(205, 72, 49, 0.22)', dark: 'rgba(61, 24, 20, 0.93)' },
});

function stressColor(stress) {
  if (stress?.color && COLORS[stress.color]) return stress.color;
  if (stress?.ok === false || stress?.ratio > STRUCTURE.FAILURE_RATIO) return 'red';
  if (stress?.ratio > STRUCTURE.STABLE_RATIO) return 'yellow';
  return 'green';
}

function traceShape(ctx, left, top, width, height, shape) {
  const right = left + width;
  const bottom = top + height;
  const centerX = left + width / 2;
  ctx.beginPath();
  if (shape === 'round') {
    ctx.ellipse(centerX, top + height / 2, width / 2, height / 2, 0, 0, TAU);
    return;
  }
  if (shape === 'vault') {
    const shoulder = top + height * 0.3;
    ctx.moveTo(left, bottom);
    ctx.lineTo(left, shoulder);
    ctx.bezierCurveTo(left + width * 0.16, top + height * 0.025, left + width * 0.34, top, centerX, top);
    ctx.bezierCurveTo(right - width * 0.34, top, right - width * 0.16, top + height * 0.025, right, shoulder);
    ctx.lineTo(right, bottom);
    ctx.closePath();
    return;
  }
  ctx.rect(left, top, width, height);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '∞';
  return Number(value).toFixed(digits).replace('.', ',');
}

function drawBadge(ctx, x, y, lines, palette, cell, centered = true) {
  const fontSize = clamp(cell * 0.5, 10, 15);
  const lineHeight = fontSize * 1.28;
  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + fontSize * 1.1;
  const height = lines.length * lineHeight + fontSize * 0.65;
  const left = centered ? x - width / 2 : x;
  roundedRect(ctx, left, y, width, height, Math.min(5, fontSize * 0.35));
  ctx.fillStyle = palette.dark;
  ctx.fill();
  ctx.strokeStyle = palette.stroke;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f4ead7';
  for (let i = 0; i < lines.length; i += 1) ctx.fillText(lines[i], left + width / 2, y + fontSize * 0.33 + lineHeight * (i + 0.5));
  ctx.restore();
}

function ratioLines(stress, detailed) {
  if (!stress || !Number.isFinite(stress.ratio) && stress?.ratio !== Infinity) return [];
  const lines = [`s = ${formatNumber(stress.ratio)}`];
  if (detailed && Number.isFinite(stress.span) && Number.isFinite(stress.maxSpan)) {
    lines.push(`${formatNumber(stress.span, 1)} / ${formatNumber(stress.maxSpan, 1)} m`);
  }
  return lines;
}

function drawStress(ctx, game, view, excavation) {
  const stress = excavation.stress;
  const lines = ratioLines(stress, view.cellSize >= 12 && excavation.h >= 3);
  if (lines.length === 0 || excavation.state === 'collapsed') return;
  const left = view.sx(excavation.x);
  const top = view.sy(excavation.y);
  const width = excavation.w * view.cellSize;
  const height = excavation.h * view.cellSize;
  if (left + width < 0 || left > view.width || top + height < 0 || top > view.height) return;
  const level = { green: 0, yellow: 2, red: 3 }[stressColor(stress)];
  const accessible = colorblindEnabled(game);
  const palette = accessible ? accessiblePalette(level) : COLORS[stressColor(stress)];
  ctx.save();
  traceShape(ctx, left, top, width, height, excavation.shape);
  ctx.fillStyle = palette.fill;
  if (accessible) ctx.globalAlpha = .25;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1.2, view.cellSize * 0.055);
  if (excavation.state === 'planned' || excavation.state === 'digging') ctx.setLineDash([5, 4]);
  ctx.stroke();
  if (accessible) { ctx.clip(); drawThresholdPattern(ctx, left, top, width, height, level); }
  ctx.restore();
  const badgeY = top + Math.max(2, view.cellSize * 0.18);
  if (width >= 32 && height >= 18) drawBadge(ctx, left + width / 2, badgeY, lines, palette, view.cellSize);
}

function normalizedDrag(drag) {
  let { x, y, w, h } = drag;
  if (w < 0) {
    x += w;
    w = Math.abs(w);
  }
  if (h < 0) {
    y += h;
    h = Math.abs(h);
  }
  return { x, y, w, h };
}

function ratioColor(ratio) {
  if (ratio > STRUCTURE.FAILURE_RATIO) return 'red';
  if (ratio > STRUCTURE.STABLE_RATIO) return 'yellow';
  return 'green';
}

function arrowHead(ctx, x, y, angle, size) {
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle - 0.45) * size, y + Math.sin(angle - 0.45) * size);
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle + 0.45) * size, y + Math.sin(angle + 0.45) * size);
}

function doubleArrow(ctx, x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 6;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  arrowHead(ctx, x1, y1, angle, size);
  arrowHead(ctx, x2, y2, angle + Math.PI, size);
  ctx.stroke();
  ctx.restore();
}

function drawGhostDimensions(ctx, view, stress, left, top, width, height, accessible = false) {
  const palettes = accessible ? { green: accessiblePalette(0), yellow: accessiblePalette(2), red: accessiblePalette(3) } : COLORS;
  const right = left + width;
  const bottom = top + height;
  const horizontalY = bottom + Math.max(18, view.cellSize * 0.65);
  const spanColor = ratioColor(stress.spanRatio);
  ctx.save();
  ctx.strokeStyle = palettes[spanColor].stroke;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, bottom + 3);
  ctx.lineTo(left, horizontalY + 4);
  ctx.moveTo(right, bottom + 3);
  ctx.lineTo(right, horizontalY + 4);
  ctx.stroke();
  ctx.restore();
  doubleArrow(ctx, left, horizontalY, right, horizontalY, palettes[spanColor].stroke);
  drawBadge(ctx, left + width / 2, horizontalY + 5, [tr('spanDimension', { value: formatNumber(stress.span, 1) })], palettes[spanColor], 11);

  const offset = Math.max(28, view.cellSize * 0.8);
  const onRight = right + offset + 60 < view.width;
  const verticalX = onRight ? right + offset : left - offset;
  const edgeX = onRight ? right : left;
  const slabTop = top - stress.slab * view.cellSize;
  const slabColor = stress.slab >= stress.requiredSlab ? 'green' : 'red';
  ctx.save();
  ctx.strokeStyle = palettes[slabColor].stroke;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(edgeX, top);
  ctx.lineTo(verticalX, top);
  ctx.moveTo(edgeX, slabTop);
  ctx.lineTo(verticalX, slabTop);
  ctx.stroke();
  ctx.restore();
  doubleArrow(ctx, verticalX, top, verticalX, slabTop, palettes[slabColor].stroke);
  drawBadge(ctx, verticalX, (top + slabTop) / 2 - 12, [tr('slabDimension', {
    value: formatNumber(stress.slab, 1),
    required: formatNumber(stress.requiredSlab, 1),
  })], palettes[slabColor], 11);
}

function drawGhost(ctx, game, view) {
  if (!game.drag || game.tool?.type !== 'dig') return;
  const drag = normalizedDrag(game.drag);
  if (![drag.x, drag.y, drag.w, drag.h].every(Number.isFinite) || drag.w <= 0 || drag.h <= 0) return;
  const left = view.sx(drag.x);
  const top = view.sy(drag.y);
  const width = drag.w * view.cellSize;
  const height = drag.h * view.cellSize;
  const stress = game.currentPreview?.stress ?? game.currentPreview?.evaluation ?? game.currentPreview;
  const accessible = colorblindEnabled(game);
  const level = { green: 0, yellow: 2, red: 3 }[stressColor(stress)];
  const palette = accessible ? { ...accessiblePalette(level), fill: CIVIDIS[level] + '29' } : COLORS[stressColor(stress)];
  const shape = game.tool.shape ?? 'flat';
  ctx.save();
  traceShape(ctx, left, top, width, height, shape);
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = palette.stroke;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  const spacing = Math.max(8, view.cellSize * 0.65);
  for (let x = left - height; x < left + width + height; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, top + height);
    ctx.lineTo(x + height, top);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  traceShape(ctx, left, top, width, height, shape);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1.5, view.cellSize * 0.075);
  ctx.setLineDash([Math.max(5, view.cellSize * 0.4), Math.max(3, view.cellSize * 0.25)]);
  ctx.lineDashOffset = -view.now * 10;
  ctx.stroke();
  ctx.restore();

  const invalid = stress?.ok === false;
  const valid = stress?.ok === true;
  const lines = invalid ? [tr(stress.error ?? 'invalidPlacement')]
    : valid ? [`${formatNumber(drag.w, 0)} × ${formatNumber(drag.h, 0)} m`, ...ratioLines(stress, true)] : [];
  if (lines.length) {
    const badgeCell = Math.max(11, view.cellSize);
    const fontSize = clamp(badgeCell * .5, 10, 15);
    const badgeHeight = fontSize * (lines.length * 1.28 + .65);
    // Leave the actual ceiling row visible beneath the numerical prospect.
    const roofTop = valid && game.tool.kind !== 'shaft' ? top - view.cellSize : top;
    const badgeY = roofTop - badgeHeight - 7 >= 0 ? roofTop - badgeHeight - 7 : top + 5;
    drawBadge(ctx, left + width / 2, badgeY, lines, palette, badgeCell);
  }
  if (accessible) {
    ctx.save(); traceShape(ctx, left, top, width, height, shape); ctx.clip();
    drawThresholdPattern(ctx, left, top, width, height, level); ctx.restore();
  }
  if (valid) drawGhostDimensions(ctx, view, stress, left, top, width, height, accessible);
}

function drawExcavationSelection(ctx, view, excavation, now) {
  const left = view.sx(excavation.x) - 3;
  const top = view.sy(excavation.y) - 3;
  const width = excavation.w * view.cellSize + 6;
  const height = excavation.h * view.cellSize + 6;
  ctx.save();
  traceShape(ctx, left, top, width, height, excavation.shape);
  ctx.strokeStyle = '#f3e3b2';
  ctx.lineWidth = Math.max(1.2, view.cellSize * 0.055);
  ctx.setLineDash([Math.max(5, view.cellSize * 0.4), Math.max(3, view.cellSize * 0.2)]);
  ctx.lineDashOffset = -now * 12;
  ctx.stroke();
  ctx.restore();
}

function drawColonistSelection(ctx, game, view, id) {
  const colonist = game.sim.colonists.find((person) => person.id === id);
  if (!colonist) return;
  const placement = colonistVisualPosition(game.sim, colonist, view.alpha ?? 0, game.renderTime ?? view.now);
  const x = view.sx(placement.x);
  const height = placement.options.pose === 'sleep' ? .65 : 1.95;
  const headY = placement.y - height * placement.cellScale * placement.artScale;
  ctx.save();
  ctx.strokeStyle = '#f5df9e';
  ctx.lineWidth = Math.max(1.2, view.cellSize * 0.05);
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(x, view.sy(headY - .25));
  ctx.lineTo(x - view.cellSize * 0.13, view.sy(headY));
  ctx.lineTo(x + view.cellSize * 0.13, view.sy(headY));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHover(ctx, game, view) {
  const hover = game.hover;
  if (!hover || !Number.isFinite(hover.x) || !Number.isFinite(hover.y)) return;
  const left = view.sx(Math.floor(hover.x));
  const top = view.sy(Math.floor(hover.y));
  const size = view.cellSize;
  if (left + size < 0 || left > view.width || top + size < 0 || top > view.height) return;
  const corner = clamp(size * 0.25, 2, 8);
  ctx.save();
  ctx.strokeStyle = 'rgba(239, 231, 207, 0.85)';
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(left, top + corner);
  ctx.lineTo(left, top);
  ctx.lineTo(left + corner, top);
  ctx.moveTo(left + size - corner, top);
  ctx.lineTo(left + size, top);
  ctx.lineTo(left + size, top + corner);
  ctx.moveTo(left + size, top + size - corner);
  ctx.lineTo(left + size, top + size);
  ctx.lineTo(left + size - corner, top + size);
  ctx.moveTo(left + corner, top + size);
  ctx.lineTo(left, top + size);
  ctx.lineTo(left, top + size - corner);
  ctx.stroke();
  ctx.restore();
}

const ENVIRONMENT_COLORS = Object.freeze({
  cold: '#69a9d1', comfortable: '#72cf8b', warm: '#e7bd58', hot: '#ed7458',
  air: '#72b9c7', water: '#4c9fc0', powered: '#83c795', unpowered: '#e7bd58',
  shed: '#ed7458', disabled: '#7b8582', generation: '#d9a75e',
});

function environmentPalette(color) {
  return { stroke: color, fill: color, dark: 'rgba(10, 20, 24, 0.94)' };
}

function roomFloodRatio(sim, excavation) {
  if (Number.isFinite(excavation.floodRatio)) return excavation.floodRatio;
  let amount = 0;
  for (const index of excavation.dugCells ?? []) amount += sim.world?.water?.[index] ?? 0;
  return amount / Math.max(1, (excavation.dugCells?.length ?? 0) * WATER.MAX_PER_CELL);
}

export function environmentalRoomModel(kind, sim, excavation) {
  const definition = roomDefinition(excavation.roomType);
  if (kind === 'temperature') {
    const value = excavation.temperature;
    const color = !Number.isFinite(value) ? ENVIRONMENT_COLORS.disabled
      : value < HEAT.DANGER_MIN ? ENVIRONMENT_COLORS.cold
        : value > HEAT.DANGER_MAX ? ENVIRONMENT_COLORS.hot
          : value < HEAT.COMFORT_MIN || value > HEAT.COMFORT_MAX ? ENVIRONMENT_COLORS.warm : ENVIRONMENT_COLORS.comfortable;
    const level = !Number.isFinite(value) ? 1 : value < HEAT.DANGER_MIN || value > HEAT.DANGER_MAX ? 3
      : value < HEAT.COMFORT_MIN || value > HEAT.COMFORT_MAX ? 2 : 0;
    return { color, level, lines: [tr('roomTemperature', { value: Number.isFinite(value) ? formatNumber(value, 1) : tr('unknown') })] };
  }
  if (kind === 'air') {
    const dangerous = excavation.o2 < AIR.DANGER_O2 || excavation.co2 > AIR.DANGER_CO2;
    return {
      color: dangerous ? ENVIRONMENT_COLORS.hot : ENVIRONMENT_COLORS.air,
      level: dangerous ? 3 : 0,
      lines: [
        tr('roomOxygen', { value: Number.isFinite(excavation.o2) ? formatNumber(excavation.o2, 0) : tr('unknown') }),
        tr('roomCo2', { value: Number.isFinite(excavation.co2) ? formatNumber(excavation.co2, 0) : tr('unknown') }),
      ],
    };
  }
  if (kind === 'water') {
    const ratio = roomFloodRatio(sim, excavation);
    return {
      color: ratio > WATER.FLOOD_UNUSABLE_RATIO ? ENVIRONMENT_COLORS.hot : ENVIRONMENT_COLORS.water,
      level: ratio > WATER.FLOOD_UNUSABLE_RATIO ? 3 : ratio > 0 ? 1 : 0,
      lines: [tr('roomFlood', { value: formatNumber(ratio * 100, 0) })],
    };
  }
  const generates = (definition?.generationKw ?? definition?.generationPerWorkerKw) !== undefined;
  const color = excavation.disabled ? ENVIRONMENT_COLORS.disabled
    : excavation.powerShed ? ENVIRONMENT_COLORS.shed
      : generates ? excavation.powered ? ENVIRONMENT_COLORS.generation : ENVIRONMENT_COLORS.unpowered
        : excavation.powered ? ENVIRONMENT_COLORS.powered
          : (definition?.powerKw ?? 0) > 0 ? ENVIRONMENT_COLORS.unpowered : ENVIRONMENT_COLORS.disabled;
  const kilowatts = generates
    ? excavation.powerGenerationKw ?? definition?.generationKw ?? definition?.generationPerWorkerKw
    : excavation.powerDemandKw ?? definition?.powerKw;
  const lines = [];
  if (Number.isFinite(kilowatts)) lines.push(tr('roomPowerKw', { value: formatNumber(kilowatts, 1) }));
  if ((definition?.powerKw ?? 0) > 0) {
    const priority = excavation.powerPriority ?? definition.category ?? 'other';
    lines.push(tr('roomPowerPriority', { value: tr(`priority_${priority}`) }));
  }
  return { color, lines };
}

function drawEnvironmentalRoom(ctx, game, view, excavation) {
  if (excavation.state === 'collapsed' || excavation.state === 'planned') return;
  const model = environmentalRoomModel(game.overlay, game.sim, excavation);
  const accessible = colorblindEnabled(game) && game.overlay !== 'power';
  if (accessible) model.color = accessiblePalette(model.level).stroke;
  const left = view.sx(excavation.x);
  const top = view.sy(excavation.y);
  const width = excavation.w * view.cellSize;
  const height = excavation.h * view.cellSize;
  if (left + width < 0 || left > view.width || top + height < 0 || top > view.height) return;
  ctx.save();
  traceShape(ctx, left, top, width, height, excavation.shape);
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = model.color;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = model.color;
  ctx.lineWidth = Math.max(1.2, view.cellSize * 0.06);
  ctx.stroke();
  if (accessible) { ctx.clip(); drawThresholdPattern(ctx, left, top, width, height, model.level); }
  ctx.restore();
  if (model.lines.length && width >= 38 && height >= 24) {
    drawBadge(ctx, left + width / 2, top + Math.max(2, view.cellSize * 0.16), model.lines, environmentPalette(model.color), view.cellSize);
  }
}

const WATER_COLORS = Object.freeze({
  [WATER_QUALITY.clean]: '#55b5d1',
  [WATER_QUALITY.dirty]: '#b99a5d',
  [WATER_QUALITY.radioactive]: '#a5c762',
  [WATER_QUALITY.grey]: '#8d8fa3',
});

function drawWaterCells(ctx, game, view) {
  const world = game.sim.world;
  if (!world?.water) return;
  const accessible = colorblindEnabled(game);
  const minY = Math.max(WORLD.SURFACE_Y, Math.floor(view.top ?? 0) - 1);
  const maxY = Math.min(world.height - 1, Math.ceil((view.top ?? 0) + view.height / view.cellSize) + 1);
  const minX = Math.max(0, Math.floor(view.left ?? 0) - 1);
  const maxX = Math.min(world.width - 1, Math.ceil((view.left ?? 0) + view.width / view.cellSize) + 1);
  ctx.save();
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = world.index(x, y);
      const amount = world.water[index];
      if (!amount || !world.isEmpty(x, y) || !world.isVisible(x, y)) continue;
      ctx.globalAlpha = 0.25 + 0.55 * clamp(amount / WATER.MAX_PER_CELL, 0, 1);
      const level = waterQualityLevel(world.waterQuality[index]);
      ctx.fillStyle = accessible ? CIVIDIS[level] : WATER_COLORS[world.waterQuality[index]] ?? WATER_COLORS[WATER_QUALITY.dirty];
      const size = view.cellSize + 0.6;
      ctx.fillRect(view.sx(x) - 0.3, view.sy(y) - 0.3, size, size);
      if (accessible && level) {
        ctx.save(); ctx.beginPath(); ctx.rect(view.sx(x), view.sy(y), view.cellSize, view.cellSize); ctx.clip();
        drawThresholdPattern(ctx, view.sx(x), view.sy(y), view.cellSize, view.cellSize, level); ctx.restore();
      }
    }
  }
  ctx.restore();
}

function waterQualityLevel(quality) {
  return quality === WATER_QUALITY.clean ? 0 : quality === WATER_QUALITY.grey ? 1 : quality === WATER_QUALITY.radioactive ? 3 : 2;
}

function drawLegend(ctx, view, title, rows) {
  const width = Math.min(360, Math.max(290, view.width - 520));
  const lineHeight = 20;
  const height = 32 + rows.length * lineHeight;
  const x = Math.max(246, (view.width - width) / 2);
  const y = Math.max(102, (view.hudHeight ?? 0) + 8);
  ctx.save();
  roundedRect(ctx, x, y, width, height, 6);
  ctx.fillStyle = 'rgba(10, 18, 22, 0.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(190, 166, 117, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillStyle = '#f0cf91';
  ctx.fillText(title, x + 12, y + 16);
  ctx.font = '11px system-ui, sans-serif';
  rows.forEach((row, index) => {
    const rowY = y + 32 + index * lineHeight + lineHeight / 2;
    if (row.color) {
      ctx.fillStyle = row.color;
      ctx.fillRect(x + 12, rowY - 5, 10, 10);
      if (row.pattern) {
        ctx.save(); ctx.beginPath(); ctx.rect(x + 12, rowY - 5, 10, 10); ctx.clip();
        drawThresholdPattern(ctx, x + 12, rowY - 5, 10, 10, row.pattern); ctx.restore();
      }
    }
    ctx.fillStyle = '#e5e3da';
    ctx.fillText(row.text, x + 30, rowY);
  });
  ctx.restore();
}

function drawEnvironmentLegend(ctx, game, view) {
  view = { ...view, hudHeight: game.camera?.screenHudHeight ?? game.camera?.hudHeight ?? 0 };
  const accessible = colorblindEnabled(game);
  const swatch = (color, level, text) => ({ color: accessible ? CIVIDIS[level] : color, pattern: accessible ? level : 0, text });
  if (game.overlay === 'temperature') {
    drawLegend(ctx, view, tr('temperatureLegend'), [
      swatch(ENVIRONMENT_COLORS.comfortable, 0, tr('comfortRange')),
      swatch(ENVIRONMENT_COLORS.hot, 3, tr('temperatureDanger')),
    ]);
  } else if (game.overlay === 'air') {
    drawLegend(ctx, view, tr('airLegend'), [
      swatch(ENVIRONMENT_COLORS.air, 3, tr('oxygenDanger')),
      swatch(ENVIRONMENT_COLORS.hot, 3, tr('co2Danger')),
    ]);
  } else if (game.overlay === 'water') {
    drawLegend(ctx, view, tr('waterLegend'), [
      swatch(ENVIRONMENT_COLORS.water, 0, tr('waterLevel')),
      ...Object.entries(WATER_QUALITY).map(([key]) => swatch(WATER_COLORS[WATER_QUALITY[key]], waterQualityLevel(WATER_QUALITY[key]), tr(`waterQuality_${key}`))),
    ]);
  } else if (game.overlay === 'power') {
    const balance = game.sim.power?.balance;
    drawLegend(ctx, view, tr('electricityLegend'), [
      { color: ENVIRONMENT_COLORS.powered, text: tr('powered') },
      { color: ENVIRONMENT_COLORS.shed, text: tr('powerShed') },
      { color: ENVIRONMENT_COLORS.unpowered, text: tr('unpowered') },
      { color: ENVIRONMENT_COLORS.generation, text: tr('powerBalanceLegend', { value: `${balance > 0 ? '+' : ''}${Number.isFinite(balance) ? formatNumber(balance, 1) : tr('unknown')}` }) },
    ]);
  }
}

function drawEnvironmentOverlay(ctx, game, view) {
  if (!['temperature', 'air', 'water', 'power'].includes(game.overlay)) return;
  if (game.overlay === 'water') drawWaterCells(ctx, game, view);
  for (const excavation of game.sim.excavations ?? []) drawEnvironmentalRoom(ctx, game, view, excavation);
  drawEnvironmentLegend(ctx, game, view);
}

function drawRadiationOverlay(ctx, game, view) {
  if (game.overlay !== 'radiation') return;
  const radiation = game.sim.radiation;
  if (!radiation) return;
  const horizon = view.sy(WORLD.SURFACE_Y);
  const selectedX = radiation.selectedX ?? game.sim.surface?.hatch?.x ?? WORLD.WIDTH / 2;
  const x = view.sx(selectedX + 0.5);
  const cell = view.cellSize;
  const accessible = colorblindEnabled(game);
  const selectedColor = accessible ? CIVIDIS[2] : '#f2d486';
  ctx.save();
  ctx.strokeStyle = selectedColor;
  ctx.fillStyle = accessible ? 'rgba(196, 186, 116, 0.18)' : 'rgba(242, 212, 134, 0.12)';
  ctx.lineWidth = Math.max(1.2, cell * 0.055);
  ctx.setLineDash([Math.max(4, cell * 0.35), Math.max(3, cell * 0.2)]);
  ctx.fillRect(x - cell * 0.5, Math.max(0, horizon - cell * 5), cell, cell * 6);
  ctx.beginPath();
  ctx.moveTo(x, Math.max(0, horizon - cell * 5));
  ctx.lineTo(x, horizon + cell);
  ctx.stroke();
  ctx.restore();
  const dose = Number.isFinite(radiation.surfaceDose) ? `${formatNumber(radiation.surfaceDose)} mSv/h` : tr('unknown');
  drawLegend(ctx, { ...view, hudHeight: game.camera?.screenHudHeight ?? game.camera?.hudHeight ?? 0 }, tr('radiationLegend'), [
    { color: accessible ? CIVIDIS[0] : '#83b894', text: tr('radiationHotspotLow') },
    { color: accessible ? CIVIDIS[3] : '#ed7458', pattern: accessible ? 3 : 0, text: tr('radiationHotspotHigh') },
    { color: selectedColor, text: tr('radiationSelectedZone', { x: selectedX, value: dose }) },
    { text: tr('radiationThresholdLegend', { value: formatNumber(radiation.safeThreshold) }) },
  ]);
}

export function drawOverlays(ctx, game, view) {
  if (game.options?.reduceMotion) view = { ...view, now: 0 };
  drawEnvironmentOverlay(ctx, game, view);
  drawRadiationOverlay(ctx, game, view);
  if (game.overlay === 'constraints' || game.debug) {
    for (const excavation of game.sim.excavations ?? []) drawStress(ctx, game, view, excavation);
  }
  drawGhost(ctx, game, view);
  drawM6Geologist(ctx, game, view);
  if (game.selection?.type === 'excavation') {
    const excavation = game.sim.excavation(game.selection.id);
    if (excavation) drawExcavationSelection(ctx, view, excavation, view.now);
  } else if (game.selection?.type === 'colonist') {
    drawColonistSelection(ctx, game, view, game.selection.id);
  }
  drawHover(ctx, game, view);
}

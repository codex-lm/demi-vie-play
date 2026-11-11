// Display-only cividis ramp: ordered luminance, plus patterns for severity.
export const CIVIDIS = Object.freeze(['#31497c', '#77857d', '#c4ba74', '#fee838']);
let lastSearch, queryEnabled = false;

export function colorblindEnabled(game) {
  const search = globalThis.location?.search ?? '';
  if (search !== lastSearch) {
    queryEnabled = new URLSearchParams(search).get('colorblind') === '1';
    lastSearch = search;
  }
  return game?.options?.colorblind === true || queryEnabled;
}

export function accessiblePalette(level = 0) {
  const index = Math.max(0, Math.min(3, level));
  return { stroke: CIVIDIS[index], fill: CIVIDIS[index], dark: '#111b28' };
}

/** Clip to the caller's shape before using this. 0=plain, 1=dots,
 * 2=diagonal, 3=crosshatch. Patterns use screen pixels at every zoom. */
export function drawThresholdPattern(ctx, x, y, width, height, level) {
  if (!level || width <= 0 || height <= 0) return;
  ctx.save();
  ctx.globalAlpha = .56;
  ctx.strokeStyle = '#fff8ce';
  ctx.fillStyle = '#fff8ce';
  ctx.lineWidth = 1;
  const spacing = level >= 3 ? 11 : 15;
  if (level === 1) {
    for (let py = y + 5; py < y + height; py += 12) {
      for (let px = x + 5; px < x + width; px += 12) ctx.fillRect(px, py, 1.6, 1.6);
    }
  } else {
    ctx.beginPath();
    for (let px = x - height; px < x + width; px += spacing) {
      ctx.moveTo(px, y + height); ctx.lineTo(px + height, y);
      if (level >= 3) { ctx.moveTo(px, y); ctx.lineTo(px + height, y + height); }
    }
    ctx.stroke();
  }
  ctx.restore();
}

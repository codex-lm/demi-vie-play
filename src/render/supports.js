import { STRUCTURE, TIME } from '../data/balance.js';
import { woodRotsIn } from '../sim/structure.js';

// Only renderer-owned data lives here. In particular, never attach a cache to
// an excavation: it belongs to the deterministic save/digest contract.
const dampSamples = new WeakMap();

export function roomIsDamp(sim, excavation) {
  if (!sim || !excavation || (!sim.world && !excavation.humid && !excavation.flooded)) return false;
  const hour = Math.floor((sim.tick ?? 0) / TIME.TICKS_PER_HOUR);
  let cache = dampSamples.get(sim);
  if (!cache || cache.hour !== hour) {
    cache = { hour, rooms: new Map(), samples: cache?.samples ?? 0 };
    dampSamples.set(sim, cache);
  }
  if (!cache.rooms.has(excavation)) {
    cache.rooms.set(excavation, woodRotsIn(sim, excavation));
    cache.samples += 1;
  }
  return cache.rooms.get(excavation);
}

export function getRoomDampCacheStats(sim) {
  const cache = dampSamples.get(sim);
  return { hour: cache?.hour ?? null, rooms: cache?.rooms.size ?? 0, samples: cache?.samples ?? 0 };
}

/** Visual categories only; the actual replacement threshold comes from data. */
export function supportVisualState(support) {
  const material = typeof support === 'object' ? support.material ?? support.kind ?? support.type ?? 'wood' : 'wood';
  if (material !== 'wood') return material === 'cement' ? 'concrete' : material;
  if (support?.failed) return 'failed';
  const solidity = support?.solidity ?? 100;
  return solidity <= STRUCTURE.SUPPORT_ROT_WARNING ? 'critical' : solidity <= 50 ? 'rotten' : solidity <= 75 ? 'aged' : 'new';
}

function path(ctx, points, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    if (i) ctx.lineTo(...points[i]); else ctx.moveTo(...points[i]);
  }
  ctx.stroke();
}

function mushroom(ctx, x, y, cell, left = false) {
  const direction = left ? -1 : 1;
  ctx.fillStyle = '#c2b38a';
  ctx.fillRect(x + direction * cell * .13 - cell * .035, y, Math.max(.8, cell * .07), cell * .14);
  ctx.fillStyle = '#b7b18a';
  ctx.beginPath();
  ctx.ellipse(x + direction * cell * .13, y, cell * .17, cell * .075, direction * -.18, Math.PI, Math.PI * 2);
  ctx.fill();
  path(ctx, [[x, y + cell * .025], [x + direction * cell * .28, y + cell * .025]], '#ddd1a5', Math.max(.7, cell * .025));
}

/** Pixel-space geometry, shared by real supports and translucent advice. */
export function drawSupport(ctx, { x, roof, floor, cell }, support = {}) {
  if (![x, roof, floor, cell].every(Number.isFinite) || floor <= roof || cell <= 0) return;
  const state = supportVisualState(support), height = floor - roof;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  if (state === 'metal') {
    // An I-section, a bolted splice and square bearing plates distinguish steel
    // from timber even without colour and at the normal 20 px/m zoom.
    ctx.fillStyle = '#263237';
    ctx.fillRect(x - cell * .17, roof, cell * .34, height);
    ctx.fillStyle = '#7e9296';
    ctx.fillRect(x - cell * .12, roof, cell * .24, height);
    ctx.fillStyle = '#455a62';
    ctx.fillRect(x - cell * .04, roof, cell * .09, height);
    ctx.fillStyle = '#c3cfca';
    ctx.fillRect(x - cell * .13, roof, Math.max(.7, cell * .045), height);
    for (const y of [roof + cell * .11, floor - cell * .1]) {
      ctx.fillStyle = '#61777d'; ctx.fillRect(x - cell * .36, y - cell * .06, cell * .72, cell * .12);
      ctx.fillStyle = '#ced4c8';
      for (const side of [-1, 1]) ctx.fillRect(x + side * cell * .24 - cell * .025, y - cell * .025, cell * .05, cell * .05);
    }
    const join = roof + height * .56;
    ctx.fillStyle = '#536970'; ctx.fillRect(x - cell * .18, join - cell * .2, cell * .36, cell * .4);
    ctx.fillStyle = '#d0d7cd';
    for (const dy of [-.12, .12]) for (const dx of [-.09, .09]) {
      ctx.beginPath(); ctx.arc(x + cell * dx, join + cell * dy, Math.max(.65, cell * .032), 0, Math.PI * 2); ctx.fill();
    }
  } else if (state === 'concrete') {
    ctx.fillStyle = '#494e4a'; ctx.fillRect(x - cell * .23, roof, cell * .46, height);
    ctx.fillStyle = '#bebca9'; ctx.fillRect(x - cell * .19, roof, cell * .38, height);
    ctx.fillStyle = '#e0dac3'; ctx.fillRect(x - cell * .19, roof, cell * .075, height);
    ctx.fillStyle = '#8d958c'; ctx.fillRect(x + cell * .11, roof, cell * .08, height);
    ctx.fillStyle = '#d3cdb5';
    ctx.fillRect(x - cell * .33, roof, cell * .66, cell * .15);
    ctx.fillRect(x - cell * .35, floor - cell * .12, cell * .7, cell * .16);
    ctx.fillStyle = '#8a8e80';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(x + ((i * 7 % 5) - 2) * cell * .045, roof + height * (.17 + i * .13), Math.max(.7, cell * .035), Math.max(.7, cell * .04));
    }
  } else {
    const colors = {
      new: ['#ba8a50', '#e1bc80', '#68472c'],
      aged: ['#89734d', '#b29a65', '#414135'],
      rotten: ['#5e6046', '#8d8860', '#303b32'],
      critical: ['#743e37', '#a66b50', '#291f1d'],
      failed: ['#63352f', '#98604a', '#291d1b'],
    };
    const [body, edge, dark] = colors[state] ?? colors.new;
    const half = cell * .13, breakY = roof + height * .54;
    if (state === 'failed') {
      // Two non-touching jagged ends. The upper half has slipped sideways,
      // while the lower half leans from its surviving foot. No full-height
      // line remains that could imply the failed prop still bears the roof.
      const leanX = x + cell * .55;
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x - half, floor); ctx.lineTo(x + half, floor);
      ctx.lineTo(leanX + half, breakY + cell * .22);
      ctx.lineTo(leanX + cell * .02, breakY + cell * .34);
      ctx.lineTo(leanX - half, breakY + cell * .15); ctx.closePath(); ctx.fill();
      path(ctx, [[x, floor], [leanX, breakY + cell * .33]], body, cell * .18);
      path(ctx, [[x - half * .45, floor], [leanX - half * .45, breakY + cell * .35]], edge, Math.max(.7, cell * .035));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x - half, roof + cell * .17); ctx.lineTo(x + half, roof + cell * .17);
      ctx.lineTo(x - cell * .22 + half, breakY - cell * .26);
      ctx.lineTo(x - cell * .22, breakY - cell * .38);
      ctx.lineTo(x - cell * .22 - half, breakY - cell * .16); ctx.closePath(); ctx.fill();
      path(ctx, [[x - half * .6, roof + cell * .2], [x - cell * .22 - half * .6, breakY - cell * .4]], edge, Math.max(.7, cell * .035));
      path(ctx, [[x + cell * .31, floor - cell * .025], [x + cell * .52, floor - cell * .13]], edge, Math.max(1, cell * .05));
    } else {
      ctx.fillStyle = dark; ctx.fillRect(x - half - cell * .045, roof, half * 2 + cell * .09, height);
      ctx.fillStyle = body; ctx.fillRect(x - half, roof, half * 2, height);
      ctx.fillStyle = edge; ctx.fillRect(x - half, roof, Math.max(.8, cell * .045), height);
      path(ctx, [[x + half * .3, roof + cell * .22], [x - half * .1, roof + height * .42], [x + half * .3, floor - cell * .12]], dark, Math.max(.55, cell * .025));
    }
    // Broad wooden caps and diagonal shoulders remain recognisable behind the
    // smaller metal advice silhouette drawn over an unsafe support.
    ctx.fillStyle = body;
    ctx.fillRect(x - cell * .42, roof, cell * .84, cell * .16);
    ctx.fillRect(x - cell * .34, floor - cell * .08, cell * .68, cell * .13);
    ctx.fillStyle = edge; ctx.fillRect(x - cell * .42, roof, cell * .84, Math.max(.65, cell * .035));
    if (state !== 'failed') {
      for (const side of [-1, 1]) path(ctx, [[x, roof + cell * .65], [x + side * cell * .36, roof + cell * .15]], body, Math.max(1.1, cell * .1));
    }
    if (state === 'aged' || state === 'rotten' || state === 'critical') {
      ctx.fillStyle = state === 'critical' ? '#402727' : '#354438';
      for (const [offset, yy] of [[-.09, .24], [.035, .47], [-.07, .73]]) {
        ctx.fillRect(x + cell * offset, roof + height * yy, cell * .11, cell * .3);
      }
    }
    if (state === 'rotten' || state === 'critical') {
      mushroom(ctx, x - half * .65, roof + height * .69, cell, true);
      mushroom(ctx, x + half * .6, roof + height * .82, cell);
    }
    if (state === 'critical') {
      path(ctx, [[x + half * .35, roof + height * .15], [x - half * .4, roof + height * .31], [x + half * .35, roof + height * .42], [x - half * .4, roof + height * .58]], '#e1a07c', Math.max(.8, cell * .035));
      path(ctx, [[x + half * .7, roof + height * .33], [x - half * .1, roof + height * .45], [x + half * .55, roof + height * .61]], '#231d19', Math.max(1, cell * .055));
    }
  }
  ctx.restore();
}

/** Sparse wet marks only, clipped by the caller to the actual room silhouette. */
export function drawRoomHumidity(ctx, box, excavation) {
  const { left, right, top, bottom, width, height, cell } = box;
  const roof = fraction => excavation.shape === 'round'
    ? (top + bottom) / 2 - height / 2 * Math.sqrt(Math.max(0, 1 - (fraction * 2 - 1) ** 2))
    : excavation.shape === 'vault' ? top + height * .3 * (fraction * 2 - 1) ** 2 : top;
  ctx.save();
  // Marks stay on the edges, leaving room furniture, people and status lamps
  // readable. Their restrained cold colour differs from structural cracks.
  for (const side of [0, 1]) {
    const x = side ? right - cell * .16 : left + cell * .16;
    const y = roof(side ? .98 : .02) + cell * .22;
    const length = Math.min(height * .48, cell * 1.05);
    path(ctx, [[x, y], [x + (side ? -.06 : .06) * cell, y + length * .65], [x, y + length]], 'rgba(32, 68, 57, .74)', cell * .25);
    path(ctx, [[x, y + cell * .1], [x, y + length * .9]], 'rgba(121, 157, 129, .58)', Math.max(.75, cell * .045));
  }
  for (const [fraction, length] of [[.21, .43], [.7, .28]]) {
    const x = left + width * fraction, y = roof(fraction) + cell * .16;
    path(ctx, [[x, y], [x - cell * .04, y + cell * length]], 'rgba(57, 94, 75, .78)', cell * .14);
    path(ctx, [[x - cell * .01, y], [x - cell * .05, y + cell * length]], 'rgba(142, 170, 143, .56)', Math.max(.6, cell * .028));
    const cy = y + cell * (length + .12);
    ctx.fillStyle = '#739d9a';
    ctx.beginPath(); ctx.moveTo(x, cy - cell * .14);
    ctx.bezierCurveTo(x - cell * .14, cy + cell * .045, x - cell * .08, cy + cell * .1, x, cy + cell * .1);
    ctx.bezierCurveTo(x + cell * .1, cy + cell * .1, x + cell * .09, cy + cell * .04, x, cy - cell * .14); ctx.fill();
    path(ctx, [[x - cell * .025, cy - cell * .015], [x - cell * .025, cy + cell * .04]], '#c4d1b9', Math.max(.6, cell * .025));
  }
  ctx.restore();
}

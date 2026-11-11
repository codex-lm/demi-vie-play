import { HEAT, STRUCTURE, TIME, WORK } from '../data/balance.js';
import { waterLevelAt } from './water.js';
import { RADIATION } from '../data/surface.js';
import { drawEffect } from '../../art/effects.js';
import { excavationFeedback, materialColor } from './excavationFeedback.js';
import { drawGameSouvenir, OBJECTIVE_ART } from './m6-symbols.js';
import { drawObjectiveIcon, drawInkCheck } from '../../art/m6/notebook.js';
import { colorblindEnabled, CIVIDIS } from './overlayPalette.js';
import { interpolatedColonistPosition } from './colonists.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fraction = (value) => value - Math.floor(value);
const collapseTimelines = new WeakMap();

function noise(...values) {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= Math.floor(value * 1009) | 0;
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return (hash >>> 0) / 0xffffffff;
}

function roofAt(excavation, view, t) {
  const top = view.sy(excavation.y);
  const height = excavation.h * view.cellSize;
  if (excavation.shape === 'round') {
    return top + height / 2 - height / 2 * Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2));
  }
  if (excavation.shape === 'vault') return top + height * 0.3 * (t * 2 - 1) ** 2;
  return top;
}

function excavationVisible(excavation, view) {
  return view.sx(excavation.x + excavation.w) >= 0 && view.sx(excavation.x) <= view.width
    && view.sy(excavation.y + excavation.h) >= 0 && view.sy(excavation.y) <= view.height;
}

function regionFor(excavation, view) {
  return { x: view.sx(excavation.x), y: view.sy(excavation.y), w: excavation.w * view.cellSize, h: excavation.h * view.cellSize };
}

function drawWallCracks(ctx, excavation, view, damage) {
  if (damage <= 0) return;
  const cell = view.cellSize;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const region = regionFor(excavation, view);
  ctx.beginPath(); ctx.rect(region.x, region.y, region.w, region.h); ctx.clip();
  for (let i = 0; i < 5; i++) {
    const extent = clamp((damage - i * .065) / (1 - i * .065), 0, 1);
    if (!extent) continue;
    const fractionX = .12 + noise(excavation.id, i, 291) * .76;
    const x = view.sx(excavation.x + excavation.w * fractionX);
    const y = roofAt(excavation, view, fractionX);
    const length = excavation.h * cell * (.2 + extent * .65);
    const points = [[x, y]];
    for (let step = 1; step <= 6; step++) points.push([
      x + (noise(excavation.id, i, step, 292) - .5) * cell * .5,
      y + length * step / 6,
    ]);
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    if (extent > .15) {
      const branch = points[3]; ctx.moveTo(...branch);
      ctx.lineTo(branch[0] - cell * .17, branch[1] + cell * .17);
      ctx.lineTo(branch[0] - cell * .38, branch[1] + cell * .25);
    }
    // Pale freshly broken edges around a dark core remain readable after the
    // underground darkness pass, instead of disappearing into the wall grain.
    ctx.globalAlpha = .9; ctx.strokeStyle = '#dfc9a1'; ctx.lineWidth = Math.max(1.8, cell * .065); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#11191b'; ctx.lineWidth = Math.max(.8, cell * .026); ctx.stroke();
  }
  ctx.restore();
}

function drawFallingDust(ctx, excavation, view, feedback, reduceMotion = false) {
  if (excavation.state === 'collapsed' || excavation.state === 'planned' || !excavationVisible(excavation, view)) return;
  const region = regionFor(excavation, view);
  const freshCrack = feedback.bursts.findLast(b => b.event.type === 'crack' && b.event.excavationId === excavation.id);
  const growth = freshCrack && !reduceMotion ? clamp((view.now - freshCrack.start) / .5, 0, 1) : 1;
  if (excavation.integrity < STRUCTURE.CRACK_INTEGRITY) drawWallCracks(ctx, excavation, view,
    Math.max(.23, 1 - excavation.integrity / STRUCTURE.CRACK_INTEGRITY) * growth);
  if (excavation.integrity >= STRUCTURE.DUST_INTEGRITY) return;
  drawEffect(ctx, 'fallingDust', region, view.cellSize, {
    t: view.now, seed: excavation.id, intensity: clamp(1 - excavation.integrity / STRUCTURE.DUST_INTEGRITY, 0.35, 1),
  });
}

function drawRockfalls(ctx, excavation, view) {
  if (excavation.integrity >= STRUCTURE.DANGER_INTEGRITY || excavation.state === 'collapsed') return;
  if (!excavationVisible(excavation, view)) return;
  const count = Math.min(7, Math.max(2, Math.ceil(excavation.w / 3)));
  for (let i = 0; i < count; i += 1) {
    const t = 0.08 + noise(excavation.id, i, 11) * 0.84;
    const life = fraction(view.now * (0.35 + noise(excavation.id, i, 12) * 0.35) + noise(excavation.id, i, 13));
    const fall = life * life;
    const x = view.sx(excavation.x + excavation.w * t) + Math.sin(life * 8 + i) * view.cellSize * 0.08;
    const start = roofAt(excavation, view, t) + view.cellSize * 0.15;
    const bottom = view.sy(excavation.y + excavation.h) - view.cellSize * 0.2;
    const y = start + (bottom - start) * fall;
    const size = Math.max(1, view.cellSize * (0.055 + noise(excavation.id, i, 14) * 0.075));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(life * 5 + noise(excavation.id, i, 15) * TAU);
    ctx.globalAlpha = clamp((1 - life) * 2.5, 0, 0.9);
    ctx.fillStyle = '#80745e';
    ctx.strokeStyle = '#332f29';
    ctx.lineWidth = Math.max(0.6, view.cellSize * 0.018);
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.4);
    ctx.lineTo(-size * 0.45, -size * 0.8);
    ctx.lineTo(size * 0.7, -size * 0.45);
    ctx.lineTo(size, size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawHotSteam(ctx, excavation, view) {
  if (!Number.isFinite(excavation.temperature) || excavation.temperature <= HEAT.COMFORT_MAX
    || ['collapsed', 'planned', 'digging'].includes(excavation.state) || !excavationVisible(excavation, view)) return;
  const intensity = clamp((excavation.temperature - HEAT.COMFORT_MAX) / (HEAT.DANGER_MAX - HEAT.COMFORT_MAX), 0.12, 1);
  drawEffect(ctx, 'steam', regionFor(excavation, view), view.cellSize, { t: view.now, seed: excavation.id, intensity });
  // A thin warm-water curl retains a readable heat cue at the widest zoom.
  ctx.strokeStyle = '#d7ddce'; ctx.globalAlpha = intensity * 0.25;
  ctx.lineWidth = Math.max(0.6, view.cellSize * 0.025);
  const x = view.sx(excavation.x + excavation.w * 0.5), y = view.sy(excavation.y + excavation.h * 0.65);
  ctx.beginPath();ctx.moveTo(x, y);ctx.bezierCurveTo(x + view.cellSize * 0.2, y - view.cellSize * 0.2, x - view.cellSize * 0.2, y - view.cellSize * 0.4, x, y - view.cellSize * 0.6);ctx.stroke();
  ctx.globalAlpha = 1;
}

function eventRegion(game, event) {
  const excavationId = event.excavationId ?? event.excavation?.id;
  const excavation = excavationId === undefined ? null : game.sim.excavation(excavationId);
  const w = event.w ?? excavation?.w ?? 5;
  const h = event.h ?? excavation?.h ?? 4;
  return {
    x: event.x ?? excavation?.x ?? 0,
    y: event.y ?? excavation?.y ?? 0,
    w,
    h,
    id: excavationId ?? event.id ?? 0,
  };
}

function collapseTimeline(game, now) {
  const sim = game.sim, events = sim.events ?? [], last = events.at(-1);
  let state = collapseTimelines.get(sim);
  if (!state || sim.tick < state.tick) {
    // Even an event at the exact save tick belongs to the loaded history.
    state = { tick: sim.tick, last, seen: new WeakSet(events), clocks: new WeakMap() };
    collapseTimelines.set(sim, state);
    return state;
  }
  if (state.last !== last || state.tick !== sim.tick) {
    const speed = Math.max(1, game.speed || game.previousSpeed || 1);
    const durationTicks = TIME.TICKS_PER_SECOND_AT_X1 * speed * 2.2;
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (state.seen.has(event)) break;
      state.seen.add(event);
      if (event.type !== 'collapse' && event.type !== 'cascade') continue;
      const elapsedTicks = sim.tick - event.tick;
      if (elapsedTicks < 0 || elapsedTicks >= durationTicks) continue;
      state.clocks.set(event, { start: now, initial: clamp(elapsedTicks / durationTicks, 0, 1) });
    }
    state.last = last; state.tick = sim.tick;
  }
  return state;
}

function collapseProgress(game, event, now = game.renderTime ?? 0) {
  const clock = collapseTimeline(game, now).clocks.get(event);
  if (!clock) return 1;
  // Purely visual time continues after defeat or pause, without advancing a
  // single simulation tick. Both the camera shake and the cloud share it.
  return clamp(clock.initial + Math.max(0, now - clock.start) / 2.2, 0, 1);
}

export function collapseShake(game, now = 0) {
  collapseTimeline(game, now);
  if (game.options?.reduceMotion) return { x: 0, y: 0 };
  const event = (game.sim.events ?? []).findLast((item) => item.type === 'collapse' || item.type === 'cascade');
  if (!event) return { x: 0, y: 0 };
  const progress = collapseProgress(game, event, now);
  if (progress >= 1) return { x: 0, y: 0 };
  // The cloud continues for 2.2s, but the impact settles in under a second.
  const amplitude = Math.max(0, 1 - progress * 2.75) ** 2 * 5;
  return { x: Math.sin(now * 71 + event.tick) * amplitude, y: Math.cos(now * 83 + event.tick) * amplitude * 0.65 };
}

function drawCollapse(ctx, game, view, event) {
  const elapsed = collapseProgress(game, event, game.renderTime ?? view.now);
  if (elapsed >= 1) return;
  const reduced = game.options?.reduceMotion;
  const progress = reduced ? .55 : elapsed;
  const region = eventRegion(game, event);
  if (!excavationVisible(region, view)) return;
  drawEffect(ctx, 'collapse', regionFor(region, view), view.cellSize, { t: reduced ? 0 : view.now, seed: region.id + event.tick, progress });
  if (!reduced && progress < 0.45) {
    ctx.save();ctx.globalAlpha = (1 - progress / 0.45) * 0.25;ctx.strokeStyle = '#b55e43';
    ctx.lineWidth = Math.max(3, Math.min(view.width, view.height) * 0.018);ctx.strokeRect(0, 0, view.width, view.height);ctx.restore();
  }
}

// These fields are read only. M4 has methane/radon and dust breaches; later
// simulation fire/smoke fields can activate the same art without fake events.
function drawHazards(ctx, game, excavation, view) {
  if (['collapsed', 'planned'].includes(excavation.state) || !excavationVisible(excavation, view)) return;
  const region = regionFor(excavation, view);
  const opts = { t: view.now, seed: excavation.id };
  // M5 owns gas and fire concentrations. Legacy fields remain a fallback for
  // older saves only; drawing both would double the same hazard.
  if (!game.sim.m5?.hazards) {
    if (excavation.methane > 0) drawEffect(ctx, 'gas', region, view.cellSize, { ...opts, intensity: clamp(excavation.methane / 100, 0, 1) });
    if (Number(excavation.fire) > 0) drawEffect(ctx, 'flames', region, view.cellSize, { ...opts, intensity: clamp(excavation.fire, 0, 1) });
    if (Number(excavation.smoke) > 0) drawEffect(ctx, 'smoke', region, view.cellSize, { ...opts, intensity: clamp(excavation.smoke, 0, 1) });
  }
  const breachTick = game.sim.radiation?.lastDustBreachTick;
  if (Number.isFinite(breachTick) && game.sim.tick >= breachTick && game.sim.tick - breachTick < RADIATION.DUST_CLOUD_TICKS) {
    drawEffect(ctx, 'radioactiveDust', region, view.cellSize, { ...opts, intensity: 1 - (game.sim.tick - breachTick) / RADIATION.DUST_CLOUD_TICKS });
  }
  const metalwork = excavation.roomType === 'workshop' && excavation.powered && !excavation.disabled
    && (game.sim.jobs ?? []).some((job) => job.excavationId === excavation.id && job.type === 'produce' && job.status === 'active'
      && (game.sim.colonists ?? []).some((person) => person.id === job.colonistId && person.jobId === job.id && person.task === 'working'));
  if (metalwork) drawEffect(ctx, 'sparks', { x: region.x + region.w * 0.3, y: region.y + region.h * 0.25, w: Math.min(region.w * 0.4, view.cellSize * 2), h: region.h * 0.7 }, view.cellSize, { ...opts, intensity: 0.55 });
}

function activeDigFronts(game) {
  const fronts = [];
  for (const job of game.sim.jobs ?? []) {
    if (job.type !== 'dig' || job.status !== 'active' || !Number.isInteger(job.cellIndex)) continue;
    const colonist = game.sim.colonists.find((person) => person.id === job.colonistId);
    if (!colonist || colonist.health <= 0 || colonist.jobId !== job.id || colonist.task !== 'working') continue;
    const excavation = game.sim.excavation(job.excavationId);
    if (!excavation || excavation.state === 'collapsed') continue;
    const worked = Number(excavation.work?.[job.cellIndex] ?? 0);
    if (!Number.isFinite(worked) || worked <= 0) continue;
    const baseRequired = Number(job.requiredWork ?? excavation.workRequired?.[job.cellIndex]);
    const skill = 1 + ((colonist.skills?.dig ?? WORK.BASE_DIG_SKILL) - WORK.BASE_DIG_SKILL) * WORK.DIG_SKILL_BONUS;
    const required = baseRequired / skill;
    const progress = Number.isFinite(required) && required > 0 ? clamp(worked / required, 0, 1) : 0;
    const { x, y } = game.sim.world.coords(job.cellIndex);
    fronts.push({ excavation, index: job.cellIndex, colonist, x, y, progress,
      material: game.sim.world.materials?.[job.cellIndex] });
  }
  return fronts;
}

function digFace(front, view) {
  const cell = view.cellSize;
  const left = view.sx(front.x);
  const top = view.sy(front.y);
  const dx = front.colonist.x - front.x;
  const dy = front.colonist.y - front.y;
  let outwardX = 0;
  let outwardY = 0;
  if (Math.abs(dx) >= Math.abs(dy)) outwardX = dx > 0 ? 1 : -1;
  else outwardY = dy > 0 ? 1 : -1;
  return {
    left,
    top,
    cell,
    outwardX,
    outwardY,
    inwardX: -outwardX,
    inwardY: -outwardY,
    tangentX: -outwardY,
    tangentY: outwardX,
    impactX: left + cell * (outwardX < 0 ? 0.09 : outwardX > 0 ? 0.91 : 0.5),
    impactY: top + cell * (outwardY < 0 ? 0.09 : outwardY > 0 ? 0.91 : 0.5),
  };
}

function drawDigCracks(ctx, front, face) {
  const { excavation, index, progress } = front;
  const { left, top, cell, inwardX, inwardY, tangentX, tangentY, impactX, impactY } = face;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, cell, cell);
  ctx.clip();
  const count = 2 + Math.floor(progress * 5);
  for (let i = 0; i < count; i += 1) {
    const spread = (noise(excavation.id, index, i, 51) - 0.5) * cell * 0.48;
    let x = impactX + tangentX * spread;
    let y = impactY + tangentY * spread;
    const points = [{ x, y }];
    const segments = 3 + Math.floor(progress * 3);
    const step = cell * (0.1 + progress * 0.045);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < segments; j += 1) {
      const forward = step * (0.75 + noise(excavation.id, index, i, j, 52) * 0.5);
      const side = (noise(excavation.id, index, i, j, 53) - 0.5) * cell * (0.14 + progress * 0.08);
      x += inwardX * forward + tangentX * side;
      y += inwardY * forward + tangentY * side;
      ctx.lineTo(x, y);
      points.push({ x, y });
    }
    ctx.globalAlpha = 0.28 + progress * 0.58;
    ctx.strokeStyle = '#17140f';
    ctx.lineWidth = Math.max(0.5, cell * (0.014 + progress * 0.014));
    ctx.stroke();
    ctx.globalAlpha = 0.1 + progress * 0.24;
    ctx.strokeStyle = '#d0b384';
    ctx.lineWidth = Math.max(0.35, cell * 0.007);
    ctx.stroke();

    if (progress > 0.25 && i % 2 === 0) {
      const branch = points[Math.floor(points.length * 0.55)];
      const direction = noise(excavation.id, index, i, 54) > 0.5 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(branch.x, branch.y);
      ctx.lineTo(
        branch.x + inwardX * cell * 0.12 + tangentX * direction * cell * (0.1 + progress * 0.08),
        branch.y + inwardY * cell * 0.12 + tangentY * direction * cell * (0.1 + progress * 0.08),
      );
      ctx.globalAlpha = 0.2 + progress * 0.45;
      ctx.strokeStyle = '#211b13';
      ctx.lineWidth = Math.max(0.45, cell * 0.012);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDigParticles(ctx, front, face, now) {
  const { excavation, index } = front;
  const { cell, outwardX, outwardY, tangentX, tangentY, impactX, impactY } = face;
  ctx.save();
  for (let i = 0; i < 4; i += 1) {
    const life = fraction(now * (2.8 + noise(excavation.id, index, i, 61) * 3.4) + noise(excavation.id, index, i, 62));
    const spread = (noise(excavation.id, index, i, 63) - 0.5) * cell * life * 0.5;
    const travel = cell * (0.04 + life * (0.18 + noise(excavation.id, index, i, 64) * 0.28));
    const x = impactX + outwardX * travel + tangentX * spread;
    const y = impactY + outwardY * travel + tangentY * spread
      - cell * life * (0.16 + noise(excavation.id, index, i, 65) * 0.3) + cell * life * life * 0.36;
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.85;
    ctx.strokeStyle = i % 3 === 0 ? '#fff0c9' : materialColor(front.material);
    ctx.lineWidth = Math.max(0.55, cell * 0.018);
    ctx.beginPath();
    ctx.moveTo(x - outwardX * cell * 0.045, y - outwardY * cell * 0.045 + cell * 0.025);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i += 1) {
    const life = fraction(now * (0.65 + noise(excavation.id, index, i, 71) * 0.8) + noise(excavation.id, index, i, 72));
    const spread = (noise(excavation.id, index, i, 73) - 0.5) * cell * life * 0.4;
    const travel = cell * life * (0.12 + noise(excavation.id, index, i, 74) * 0.2);
    const x = impactX + outwardX * travel + tangentX * spread;
    const y = impactY + outwardY * travel + tangentY * spread - cell * life * 0.08 + cell * life * life * 0.24;
    const radius = Math.max(0.6, cell * (0.018 + life * 0.055));
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.2;
    ctx.fillStyle = materialColor(front.material);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawImpactBurst(ctx, game, view, burst) {
  const event = burst.event;
  const room = (game.sim.excavations ?? []).find(r => r.id === event.excavationId);
  const worldX = event.x ?? (room ? room.x + room.w / 2 : null);
  const worldY = event.y ?? (room ? room.y + room.h / 2 : null);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
  if (game.sim.world?.isVisible && !game.sim.world.isVisible(Math.floor(worldX), Math.floor(worldY))) return;
  const cell = view.cellSize, x = view.sx(worldX + .5), y = view.sy(worldY + .5);
  if (x < -cell * 2 || x > view.width + cell * 2 || y < -cell * 2 || y > view.height + cell * 2) return;
  const reduced = game.options?.reduceMotion;
  const progress = reduced ? .45 : clamp(((game.renderTime ?? view.now) - burst.start) / burst.duration, 0, 1);
  const seed = event.tick + worldX * 13 + worldY * 31;
  const dig = event.type === 'digCell', rupture = event.type === 'wallRupture';
  ctx.save();
  if (dig || rupture) {
    // Angular chips retain the colour of the removed material; a white core
    // flashes once instead of continuous decorative sparks in an idle room.
    ctx.fillStyle = materialColor(burst.material);
    for (let i = 0; i < (rupture ? 18 : 8); i++) {
      const angle = noise(seed, i, 401) * TAU;
      const travel = cell * progress * (.25 + noise(seed, i, 402) * .9);
      const px = x + Math.cos(angle) * travel;
      const py = y + Math.sin(angle) * travel - cell * progress * .35 + cell * progress ** 2 * 1.8;
      const size = cell * (.025 + noise(seed, i, 403) * .045) * (1 - progress * .35);
      ctx.globalAlpha = (1 - progress) * .95;
      ctx.beginPath(); ctx.moveTo(px - size, py); ctx.lineTo(px, py - size * .7);
      ctx.lineTo(px + size, py + size * .6); ctx.closePath(); ctx.fill();
    }
    if (progress < .22) {
      ctx.globalAlpha = (1 - progress / .22) * .85;
      ctx.strokeStyle = '#fff0c9'; ctx.lineWidth = Math.max(1, cell * .035);
      ctx.beginPath(); ctx.moveTo(x - cell * .16, y); ctx.lineTo(x + cell * .16, y);
      ctx.moveTo(x, y - cell * .16); ctx.lineTo(x, y + cell * .16); ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const px = x + (noise(seed, i, 410) - .5) * cell * progress * 1.8;
      const py = y + cell * progress * (.3 + noise(seed, i, 411) * .5);
      const r = Math.max(.4, cell * (.05 + progress * .13));
      ctx.globalAlpha = Math.sin(Math.PI * progress) * .19;
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
  } else if (['dust', 'danger', 'creak'].includes(event.type) && room) {
    const intensity = event.type === 'creak' ? .25 : event.type === 'danger' ? .8 : .6;
    // An onset pulse complements persistent dust while integrity stays low.
    drawEffect(ctx, 'fallingDust', regionFor(room, view), cell, {
      t: progress * 2.5, seed, intensity: intensity * (1 - progress),
    });
  } else if (['souvenirLeft', 'souvenirPassed', 'objectiveDone'].includes(event.type)) {
    const size = Math.max(22, Math.min(44, cell * 1.4));
    const iconY = y - cell * 1.4 - (reduced ? 0 : progress * cell * .6);
    ctx.globalAlpha = reduced ? .95 : Math.min(1, progress * 8, (1 - progress) * 5);
    ctx.strokeStyle = colorblindEnabled(game) ? CIVIDIS[2] : '#e8d7a4';
    ctx.lineWidth = Math.max(.8, cell * .03);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, iconY + size / 2); ctx.stroke();
    ctx.translate(x - size / 2, iconY - size / 2);
    if (event.type === 'objectiveDone') {
      drawObjectiveIcon(ctx, OBJECTIVE_ART[event.objectiveId] ?? 'heritage', 0, 0, size);
      drawInkCheck(ctx, size * .65, size * .58, size * .48, reduced ? .6 : progress);
    } else {
      drawGameSouvenir(ctx, event.souvenirType, size);
      // An outward arrow means transmission; a base means an object laid down.
      ctx.beginPath();
      if (event.type === 'souvenirPassed') {
        ctx.moveTo(size * .7, size); ctx.lineTo(size * 1.15, size);
        ctx.moveTo(size * .98, size * .84); ctx.lineTo(size * 1.15, size); ctx.lineTo(size * .98, size * 1.16);
      } else {
        ctx.moveTo(size * .12, size * .94); ctx.lineTo(size * .12, size * 1.07);
        ctx.lineTo(size * .88, size * 1.07); ctx.lineTo(size * .88, size * .94);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDigging(ctx, game, view) {
  for (const front of activeDigFronts(game)) {
    if (!game.sim.world.isVisible(front.x, front.y)) continue;
    const face = digFace(front, view);
    if (face.left + face.cell < 0 || face.left > view.width || face.top + face.cell < 0 || face.top > view.height) continue;
    drawDigCracks(ctx, front, face);
    if (game.speed !== 0 && !game.options?.reduceMotion) drawDigParticles(ctx, front, face, view.now);
  }
}

const WADING_MIN_LEVEL = 0.18;

export function drawWading(ctx, game, view) {
  if (game.options?.reduceMotion) return;
  const world = game.sim.world;
  const alpha = view.alpha ?? 0;
  const now = view.now ?? game.renderTime ?? 0;
  const cell = view.cellSize;
  for (const colonist of game.sim.colonists ?? []) {
    if (colonist.health <= 0 || !['walk', 'carrying', 'wading'].includes(colonist.task)) continue;
    const prevX = colonist.prevX ?? colonist.x;
    const prevY = colonist.prevY ?? colonist.y;
    if (Math.abs(colonist.x - prevX) + Math.abs(colonist.y - prevY) < 1e-5) continue;
    // Same interpolation as the silhouette, so the ripples stay at its feet.
    const { x: worldX, y: worldY } = interpolatedColonistPosition(colonist, alpha);
    const level = waterLevelAt(world, worldX, worldY);
    if (level < WADING_MIN_LEVEL || !world.isVisible(Math.round(worldX), Math.round(worldY))) continue;
    const x = view.sx(worldX + 0.5);
    const y = view.sy(worldY + 1 - level);
    if (x < -cell || x > view.width + cell || y < -cell || y > view.height + cell) continue;

    ctx.save();
    ctx.strokeStyle = '#b5e1d9';
    ctx.fillStyle = '#b5e1d9';
    ctx.lineWidth = Math.max(0.65, cell * 0.035);
    const rippleLife = fraction(now * 2.7 + noise(colonist.id, 101));
    ctx.globalAlpha = (1 - rippleLife) * 0.58;
    ctx.beginPath();
    ctx.ellipse(x, y, cell * (0.1 + rippleLife * 0.3), cell * (0.025 + rippleLife * 0.055), 0, 0, TAU);
    ctx.stroke();
    for (let drop = 0; drop < 4; drop += 1) {
      const life = fraction(now * (2.4 + noise(colonist.id, drop, 102)) + noise(colonist.id, drop, 103));
      const direction = drop % 2 ? 1 : -1;
      const spread = direction * cell * life * (0.12 + noise(colonist.id, drop, 104) * 0.18);
      const rise = Math.sin(life * Math.PI) * cell * (0.1 + noise(colonist.id, drop, 105) * 0.15);
      const radius = Math.max(0.55, cell * (0.018 + noise(colonist.id, drop, 106) * 0.018));
      ctx.globalAlpha = Math.sin(life * Math.PI) * 0.78;
      ctx.beginPath();
      ctx.arc(x + spread, y - rise + life * cell * 0.035, radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawEffects(ctx, game, view) {
  const now = game.renderTime ?? view.now;
  collapseTimeline(game, now);
  const feedback = excavationFeedback(game, now);
  if (game.options?.reduceMotion) view = { ...view, now: 0 };
  ctx.save();
  for (const excavation of game.sim.excavations ?? []) {
    drawHazards(ctx, game, excavation, view);
    drawHotSteam(ctx, excavation, view);
    drawFallingDust(ctx, excavation, view, feedback, game.options?.reduceMotion);
    drawRockfalls(ctx, excavation, view);
  }
  drawDigging(ctx, game, view);
  drawWading(ctx, game, view);
  for (const burst of feedback.bursts) {
    if (['dust', 'danger', 'creak'].includes(burst.event.type)) drawImpactBurst(ctx, game, view, burst);
  }
  ctx.restore();
  for (const event of game.sim.events ?? []) {
    if (event.type === 'collapse' || event.type === 'cascade') drawCollapse(ctx, game, view, event);
  }
}

// Fresh broken edges catch the miner's lamp. Keep only these small highlights
// above the darkness mask; smoke, hazards, and the inhabitants remain shaded.
export function drawExcavationHighlights(ctx, game, view) {
  for (const burst of excavationFeedback(game, game.renderTime ?? view.now).bursts) {
    if (burst.event.type === 'creak') {
      const room = game.sim.excavation(burst.event.excavationId);
      if (room && excavationVisible(room, view)) {
        const cell = view.cellSize, x = view.sx(room.x + room.w / 2), y = roofAt(room, view, .5) + cell * .16;
        const age = clamp(((game.renderTime ?? view.now) - burst.start) / burst.duration, 0, 1);
        ctx.save(); ctx.globalAlpha = game.options?.reduceMotion ? .85 : Math.min(1, age * 8, (1 - age) * 4);
        ctx.strokeStyle = colorblindEnabled(game) ? CIVIDIS[2] : '#e3c38b';
        ctx.lineWidth = Math.max(1, cell * .04); ctx.lineCap = 'round';
        // A creak precedes a crack: listening marks, never invented fractures.
        for (const side of [-1, 1]) for (const offset of [.18, .37]) {
          ctx.beginPath(); ctx.moveTo(x + side * cell * offset, y + cell * .12);
          ctx.quadraticCurveTo(x + side * cell * (offset + .09), y + cell * .26, x + side * cell * offset, y + cell * .4);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    if (!['dust', 'danger', 'creak', 'crack'].includes(burst.event.type)) drawImpactBurst(ctx, game, view, burst);
  }
}

import { WATER, WORLD } from '../data/balance.js';
import { MATERIAL } from '../data/materials.js';
import { ticksPerSecond } from '../data/speeds.js';
import { drawWaterBody, drawWaterTable, drawDrip, drawSeep } from '../../art/water.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function fractionalWaterLevel(amount, cellCount = 1) {
  return clamp(amount / (Math.max(1, cellCount) * WATER.MAX_PER_CELL), 0, 1);
}

export function waterLevelAt(world, x, y) {
  const cellX = Math.round(x);
  const cellY = Math.round(y);
  if (!world?.water || !world.inBounds(cellX, cellY) || !world.isEmpty(cellX, cellY)) return 0;
  return fractionalWaterLevel(world.water[world.index(cellX, cellY)]);
}

// The simulation moves water once every WATER.UPDATE_INTERVAL ticks, by up to
// half a cell at a time. At "Vivre" that is one jump every four real seconds.
// Pools are therefore drawn from amounts that follow the simulation on real
// time: a fraction of a second at "Vivre", next to nothing at the faster
// speeds, where the jumps come as fast as they did at the former x1.
const SHOWN_EASE_SECONDS = 0.3; // longest time constant of the easing
const SHOWN_EASE_SHARE = 0.07; // ... and its share of the real time between two water updates
const SHOWN_SNAP = 1; // water units (1 % of a cell) from which the amount is the simulation's
const SHOWN_MAX_GAP_SECONDS = 0.5; // a longer gap between two frames is not motion
const shownWater = new WeakMap();

/** Water amounts to draw for the pools: `world.water`, eased on real time.
 * The first frame of a world, a clock that does not advance (reduced motion,
 * a still image) and a long gap all give the simulation's amounts as they are. */
export function shownWaterAmounts(world, now, speed) {
  const target = world.water;
  let state = shownWater.get(world);
  if (!state || state.amounts.length !== target.length) {
    state = { amounts: Float32Array.from(target), now };
    shownWater.set(world, state);
    return state.amounts;
  }
  const shown = state.amounts;
  const elapsed = now - state.now;
  state.now = now;
  const rate = ticksPerSecond(speed);
  const period = rate > 0 ? WATER.UPDATE_INTERVAL / rate : Infinity;
  const ease = Math.min(SHOWN_EASE_SECONDS, period * SHOWN_EASE_SHARE);
  // No easing shorter than a frame: from "Veiller" up, the simulation's water.
  if (!(elapsed > 0) || elapsed > SHOWN_MAX_GAP_SECONDS || ease <= elapsed) {
    shown.set(target);
    return shown;
  }
  const gain = 1 - Math.exp(-elapsed / ease);
  const width = world.width;
  const full = WATER.MAX_PER_CELL;
  for (let index = 0; index < target.length; index += 1) {
    const goal = target[index];
    const current = shown[index];
    if (current === goal) continue;
    const x = index % width;
    const y = (index - x) / width;
    // Groundwater held in rock is not a pool: it is drawn as the simulation has it.
    if (!world.isEmpty(x, y)) {
      shown[index] = goal;
      continue;
    }
    if (goal > current) {
      // A cell starts to fill once the full cell under it is shown full, so
      // that no slab of water ever hangs over a surface still rising.
      const below = index + width;
      if (below < target.length && target[below] >= full && shown[below] < full && world.isEmpty(x, y + 1)) continue;
    } else if (current >= full) {
      // And a full cell starts to empty once the dry cell over it is shown dry.
      const above = index - width;
      if (above >= 0 && target[above] <= 0 && shown[above] > 0 && world.isEmpty(x, y - 1)) continue;
    }
    const next = current + (goal - current) * gain;
    shown[index] = Math.abs(goal - next) < SHOWN_SNAP ? goal : next;
  }
  return shown;
}

function surfaceY(row, level, x, now) {
  const wave = Math.sin(x * 1.55 + row * 0.31 + now * 1.9) * 0.014
    + Math.sin(x * 3.7 - now * 1.15) * 0.006;
  return row + 1 - level + wave * clamp(level / 0.04, 0, 1);
}

function cellSurfaceY(cell, x, now) {
  const offset = clamp(x - cell.x, 0, 1);
  const t = offset < .5 ? offset * 2 : (offset - .5) * 2;
  const ease = t * t * (3 - 2 * t);
  const level = offset < .5 ? (cell.leftLevel ?? cell.level) * (1 - ease) + cell.level * ease
    : cell.level * (1 - ease) + (cell.rightLevel ?? cell.level) * ease;
  return surfaceY(cell.y, level, x, now);
}

function traceSurface(ctx, view, cell, now) {
  const steps = 6;
  ctx.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const x = cell.x + step / steps;
    const px = view.sx(x);
    const py = view.sy(cellSurfaceY(cell, x, now));
    if (step === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

function collectBodies(world, water, minX, maxX, minY, maxY, flowingTargets) {
  const bodies = [];
  const visited = new Set();
  const wet = (x, y) => {
    if (x < minX || x > maxX || y < minY || y > maxY || !world.isEmpty(x, y) || !world.isVisible(x, y)) return false;
    const amount = water[world.index(x, y)];
    if (amount <= 0) return false;
    // Sparse water falling through an unfilled cell is a wall film / droplet,
    // not a full metre of pool. Its inlet is painted by drawEntrances below.
    if (!flowingTargets.has(world.index(x, y)) || amount >= WATER.MAX_PER_CELL || !world.isEmpty(x, y + 1)) return true;
    // A lone thin wall film above a full pool is still an inflow, not a raised
    // stair at its edge. A shallow row spread horizontally remains a pool.
    const horizontal = [x - 1, x + 1].some(xx => world.isEmpty(xx, y) && water[world.index(xx, y)] > 0);
    return water[world.index(x, y + 1)] >= WATER.MAX_PER_CELL && (amount > WATER.MAX_PER_CELL * .25 || horizontal);
  };
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const first = world.index(x, y);
      if (visited.has(first) || !wet(x, y)) continue;
      const cells = [];
      const indices = new Set();
      const queue = [{ x, y }];
      visited.add(first);
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const cell = queue[cursor];
        const index = world.index(cell.x, cell.y);
        cells.push({ ...cell, index, amount: water[index] });
        indices.add(index);
        for (const [xx, yy] of [[cell.x - 1, cell.y], [cell.x + 1, cell.y], [cell.x, cell.y - 1], [cell.x, cell.y + 1]]) {
          if (xx < minX || xx > maxX || yy < minY || yy > maxY) continue;
          const next = world.index(xx, yy);
          if (!visited.has(next) && wet(xx, yy)) {
            visited.add(next);
            queue.push({ x: xx, y: yy });
          }
        }
      }
      bodies.push({ cells, indices });
    }
  }
  return bodies;
}

function cellAt(cells, world, x, y) {
  if (x < 0 || x >= world.width || y < 0 || y >= world.height) return null;
  return cells.get(world.index(x, y)) ?? null;
}

function prepareCells(body, world) {
  const cells = new Map(body.cells.map((cell) => [cell.index, cell]));
  for (const cell of body.cells) {
    const exposed = cell.amount < WATER.MAX_PER_CELL || !cellAt(cells, world, cell.x, cell.y - 1);
    cells.set(cell.index, {
      ...cell,
      exposed,
      level: exposed ? Math.max(0.015, fractionalWaterLevel(cell.amount)) : 0,
    });
  }
  // Half-cell interpolation removes rectangular steps at adjacent free surfaces.
  // Each shared average adds exactly what it removes on the other side, so it
  // preserves the integrated level of the row instead of inventing more water.
  for (const cell of cells.values()) if (cell.exposed) {
    const left = cellAt(cells, world, cell.x - 1, cell.y);
    const right = cellAt(cells, world, cell.x + 1, cell.y);
    cell.leftLevel = left?.exposed ? (cell.level + left.level) / 2 : cell.level;
    cell.rightLevel = right?.exposed ? (cell.level + right.level) / 2 : cell.level;
  }
  return cells;
}

function topAt(cell, x, now) {
  return cell.exposed ? cellSurfaceY(cell, x, now) : cell.y;
}

function unionEdges(cells, world, now) {
  const edges = [];
  const add = (from, to, surface = null) => {
    if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) > 1e-7) edges.push({ from, to, surface });
  };
  for (const cell of cells.values()) {
    const left = cell.x;
    const right = cell.x + 1;
    const bottom = cell.y + 1;
    const topLeft = topAt(cell, left, now);
    const topRight = topAt(cell, right, now);
    if (cell.exposed) add({ x: left, y: topLeft }, { x: right, y: topRight }, cell);

    const rightNeighbor = cellAt(cells, world, right, cell.y);
    if (!rightNeighbor) {
      add({ x: right, y: topRight }, { x: right, y: bottom });
    } else {
      const neighborTop = topAt(rightNeighbor, right, now);
      if (topRight < neighborTop) add({ x: right, y: topRight }, { x: right, y: neighborTop });
    }

    const below = cellAt(cells, world, left, bottom);
    if (!below || below.amount < WATER.MAX_PER_CELL) {
      add({ x: right, y: bottom }, { x: left, y: bottom });
    }

    const leftNeighbor = cellAt(cells, world, left - 1, cell.y);
    if (!leftNeighbor) {
      add({ x: left, y: bottom }, { x: left, y: topLeft });
    } else {
      const neighborTop = topAt(leftNeighbor, left, now);
      if (topLeft < neighborTop) add({ x: left, y: neighborTop }, { x: left, y: topLeft });
    }
  }
  return edges;
}

function waterPalette(body, world) {
  let quality = 0;
  for (const cell of body.cells) quality = Math.max(quality, world.waterQuality?.[cell.index] ?? 0);
  if (quality === 2) return ['rgba(118,149,94,.38)', 'rgba(43,83,61,.70)', 'rgba(43,83,61,.70)', '#c3d6a5'];
  if (quality === 1 || quality === 3) return ['rgba(139,127,85,.48)', 'rgba(69,58,39,.77)', 'rgba(69,58,39,.77)', '#e1cba0'];
  return ['rgba(103,172,171,.38)', 'rgba(29,79,91,.68)', 'rgba(29,79,91,.68)', '#c4e2d5'];
}

function pointKey(point) {
  return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
}

function edgeLength(edge) {
  return Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y);
}

function pointOnEdge(edge, distance, now) {
  const ratio = distance / edgeLength(edge);
  const x = edge.from.x + (edge.to.x - edge.from.x) * ratio;
  if (edge.surface) return { x, y: cellSurfaceY(edge.surface, x, now) };
  const phase = edge.from.x * 1.71 + edge.from.y * 2.37 + edge.to.x * 0.57 + edge.to.y * 0.91;
  const bulge = (Math.sin(Math.PI * ratio) * 0.17 + Math.sin(ratio * Math.PI * 2 + phase) * Math.sin(Math.PI * ratio) * 0.09);
  const length = edgeLength(edge);
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  return {
    x: x + dy / length * bulge,
    y: edge.from.y + (edge.to.y - edge.from.y) * ratio - dx / length * bulge,
  };
}

function turnScore(incoming, outgoing) {
  const ax = incoming.to.x - incoming.from.x;
  const ay = incoming.to.y - incoming.from.y;
  const bx = outgoing.to.x - outgoing.from.x;
  const by = outgoing.to.y - outgoing.from.y;
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
}

function traceRoundedLoop(ctx, view, loop, now) {
  const vertices = loop.map((edge) => edge.from);
  const entries = [];
  const exits = [];
  for (let index = 0; index < loop.length; index += 1) {
    const incoming = loop[(index + loop.length - 1) % loop.length];
    const outgoing = loop[index];
    const radius = Math.min(0.34, edgeLength(incoming) * 0.36, edgeLength(outgoing) * 0.36);
    entries[index] = pointOnEdge(incoming, edgeLength(incoming) - radius, now);
    exits[index] = pointOnEdge(outgoing, radius, now);
  }
  ctx.moveTo(view.sx(exits[0].x), view.sy(exits[0].y));
  for (let index = 0; index < loop.length; index += 1) {
    const next = (index + 1) % loop.length;
    const edge = loop[index];
    const start = exits[index];
    const end = entries[next];
    if (edge.surface) {
      const steps = Math.max(1, Math.ceil(Math.abs(end.x - start.x) * 6));
      for (let step = 1; step <= steps; step += 1) {
        const x = start.x + (end.x - start.x) * step / steps;
        ctx.lineTo(view.sx(x), view.sy(cellSurfaceY(edge.surface, x, now)));
      }
    } else {
      const steps = Math.max(1, Math.ceil(edgeLength(edge) * 6));
      for (let step = 1; step <= steps; step += 1) {
        const point = pointOnEdge(edge, edgeLength(edge) * step / steps, now);
        ctx.lineTo(view.sx(point.x), view.sy(point.y));
      }
    }
    ctx.quadraticCurveTo(
      view.sx(vertices[next].x), view.sy(vertices[next].y),
      view.sx(exits[next].x), view.sy(exits[next].y),
    );
  }
  ctx.closePath();
}

function traceBody(ctx, view, cells, world) {
  const edges = unionEdges(cells, world, view.now);
  const outgoing = new Map();
  const remaining = new Set(edges);
  for (const edge of edges) {
    const key = pointKey(edge.from);
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(edge);
  }
  ctx.beginPath();
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const loop = [first];
    let incoming = first;
    while (pointKey(incoming.to) !== pointKey(first.from)) {
      const candidates = (outgoing.get(pointKey(incoming.to)) ?? []).filter((edge) => remaining.has(edge));
      if (!candidates.length) break;
      candidates.sort((a, b) => turnScore(incoming, b) - turnScore(incoming, a));
      incoming = candidates[0];
      remaining.delete(incoming);
      loop.push(incoming);
    }
    traceRoundedLoop(ctx, view, loop, view.now);
  }
}

function drawReflections(ctx, view, body, cells, palette) {
  for (const cell of cells.values()) {
    if (!cell.exposed) continue;
    traceSurface(ctx, view, cell, view.now);
    // A broad meniscus and a narrow highlight make the free surface legible
    // even in an unlit cave. No cell borders are drawn under the water.
    ctx.strokeStyle = `${palette[3]}38`;
    ctx.lineWidth = Math.max(3, view.cellSize * 0.19);
    ctx.stroke();
    ctx.strokeStyle = `${palette[3]}ee`;
    ctx.lineWidth = Math.max(1.1, view.cellSize * 0.055);
    ctx.stroke();
    const shimmer = ((cell.x * 0.618 + cell.y * 0.37 + view.now * 0.06) % 1 + 1) % 1;
    const x = cell.x + shimmer;
    const y = view.sy(cellSurfaceY(cell, x, view.now)) + Math.max(1, view.cellSize * 0.06);
    ctx.strokeStyle = `${palette[3]}66`;
    ctx.lineWidth = Math.max(0.5, view.cellSize * 0.02);
    ctx.beginPath();
    ctx.moveTo(view.sx(x) - view.cellSize * 0.13, y);
    ctx.lineTo(view.sx(x) + view.cellSize * 0.19, y);
    ctx.stroke();
  }
}

function clipInterior(ctx, view, room) {
  const x = view.sx(room.x), y = view.sy(room.y), w = room.w * view.cellSize, h = room.h * view.cellSize;
  ctx.beginPath();
  if (room.shape === 'round') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (room.shape === 'vault') {
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * .3);
    ctx.bezierCurveTo(x + w * .16, y + h * .025, x + w * .34, y, x + w / 2, y);
    ctx.bezierCurveTo(x + w * .66, y, x + w * .84, y + h * .025, x + w, y + h * .3);
    ctx.lineTo(x + w, y + h); ctx.closePath();
  } else ctx.rect(x, y, w, h);
  ctx.clip();
}

function drawBody(ctx, view, world, body, rooms) {
  const cells = prepareCells(body, world);
  const palette = waterPalette(body, world);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let dirty = false, contaminated = false;
  for (const cell of body.cells) {
    minX = Math.min(minX, cell.x); minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x + 1); maxY = Math.max(maxY, cell.y + 1);
    const quality = world.waterQuality?.[cell.index] ?? 0;
    dirty ||= quality === 1 || quality === 3;
    contaminated ||= quality === 2;
  }
  const room = rooms.find(r => r.state !== 'collapsed' && minX >= r.x && maxX <= r.x + r.w && minY >= r.y && maxY <= r.y + r.h);
  ctx.save();
  if (room) clipInterior(ctx, view, room);
  drawWaterBody(ctx, { x: view.sx(minX), y: view.sy(minY), w: (maxX - minX) * view.cellSize, h: (maxY - minY) * view.cellSize }, view.cellSize, {
    t: view.now, dirty, contaminated, bodyTint: true, contour: () => traceBody(ctx, view, cells, world),
  });
  drawReflections(ctx, view, body, cells, palette);
  ctx.restore();
}

// The simulation records the actual target/source pairs. A flooded room alone
// is not a reason to invent rain across its ceiling or through waterproofing.
export function waterEntrances(world, room) {
  if (room.coating === 'waterproof' || ['collapsed', 'planned'].includes(room.state)) return [];
  const result = [];
  for (const key of Object.keys(room.waterInfiltration ?? {})) {
    const [target, source] = key.split(':').map(Number);
    if (!Number.isInteger(target) || !Number.isInteger(source) || !world.coords) continue;
    const p = world.coords(target), s = world.coords(source);
    if (!world.isEmpty(p.x, p.y) || !world.isVisible(p.x, p.y)
      || !world.isSolid?.(s.x, s.y) || ![MATERIAL.SAND, MATERIAL.LIMESTONE].includes(world.materials[source])) continue;
    // Seepage from below is shown as a wet foot of wall, never falling upwards.
    result.push({ target, source, x: p.x + .5, y: p.y + .5, dx: s.x - p.x, dy: s.y - p.y });
  }
  return result;
}

function drawEntrances(ctx, game, view, water) {
  const world = game.sim.world, cell = view.cellSize;
  for (const room of game.sim.excavations ?? []) {
    if (view.sx(room.x + room.w) < 0 || view.sx(room.x) > view.width
      || view.sy(room.y + room.h) < 0 || view.sy(room.y) > view.height) continue;
    const entrances = waterEntrances(world, room);
    if (!entrances.length) continue;
    ctx.save(); clipInterior(ctx, view, room);
    // Keep droplets sparse enough to read separate entries at the wide zoom.
    const stride = Math.max(1, Math.ceil(entrances.length / 10));
    for (let i = 0; i < entrances.length; i += stride) {
      const source = entrances[i];
      const t = clamp((source.x - room.x) / room.w, 0, 1);
      const roof = room.shape === 'vault' ? room.y + room.h * .3 * (t * 2 - 1) ** 2
        : room.shape === 'round' ? room.y + room.h / 2 * (1 - Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2))) : room.y;
      const x = source.x + source.dx * .42;
      const y = Math.max(roof + .07, source.y + source.dy * .44);
      let end = room.y + room.h - .1;
      for (let yy = Math.floor(y); yy < room.y + room.h; yy++) {
        const index = world.index(Math.floor(x), yy);
        if (water[index] > 0) { end = Math.max(y + .08, yy + 1 - fractionalWaterLevel(water[index])); break; }
      }
      const region = { x: view.sx(x - .13), y: view.sy(y), w: cell * .26, h: Math.max(cell * .1, (end - y) * cell) };
      drawSeep(ctx, { ...region, h: Math.min(cell * 1.2, region.h) }, cell, { t: view.now, seed: source.source });
      if (source.dy < 1 && end > y + .15) drawDrip(ctx, region, cell, { t: view.now, seed: source.source });
      ctx.beginPath(); ctx.moveTo(view.sx(x - .1), view.sy(y)); ctx.lineTo(view.sx(x + .12), view.sy(y + .025));
      ctx.strokeStyle = '#b9ded1'; ctx.lineWidth = Math.max(.8, cell * .035); ctx.stroke();
    }
    ctx.restore();
  }
}

// Only saturated rock actually present in the grid gets an aquifer wash. A
// season or material name alone never invents an underground water level.
function drawAquifers(ctx, world, view, minX, maxX, minY, maxY) {
  if (!world.materials) return;
  for (let y = minY; y <= maxY; y += 1) {
    let x = minX;
    while (x <= maxX) {
      const wetRock = (xx) => {
        const index = world.index(xx, y);
        return world.isVisible(xx, y) && !world.isEmpty(xx, y) && world.water[index] > 0
          && [MATERIAL.SAND, MATERIAL.SANDSTONE].includes(world.materials[index]);
      };
      if (!wetRock(x)) { x += 1; continue; }
      const start = x;
      const level = fractionalWaterLevel(world.water[world.index(x, y)]);
      while (x + 1 <= maxX && wetRock(x + 1) && fractionalWaterLevel(world.water[world.index(x + 1, y)]) === level) x += 1;
      drawWaterTable(ctx, { x: view.sx(start), y: view.sy(y), w: (x - start + 1) * view.cellSize, h: view.cellSize }, view.cellSize, { level, t: view.now });
      x += 1;
    }
  }
}

export function drawWater(ctx, game, view) {
  const world = game.sim?.world;
  if (!world?.water) return;
  const waterView = { ...view, now: game.options?.reduceMotion ? 0 : game.renderTime ?? view.now ?? 0 };
  const minY = Math.max(WORLD.SURFACE_Y, Math.floor(view.top) - 1);
  const maxY = Math.min(world.height - 1, Math.ceil(view.top + view.height / view.cellSize) + 1);
  const minX = Math.max(0, Math.floor(view.left) - 1);
  const maxX = Math.min(world.width - 1, Math.ceil(view.left + view.width / view.cellSize) + 1);
  ctx.save();
  drawAquifers(ctx, world, waterView, minX, maxX, minY, maxY);
  const flowingTargets = new Set((game.sim.excavations ?? []).flatMap(room => waterEntrances(world, room).map(entry => entry.target)));
  // Pools follow the simulation on real time (see shownWaterAmounts).
  const water = shownWaterAmounts(world, waterView.now, game.speed);
  for (const body of collectBodies(world, water, minX, maxX, minY, maxY, flowingTargets)) drawBody(ctx, waterView, world, body, game.sim.excavations ?? []);
  drawEntrances(ctx, game, waterView, water);
  ctx.restore();
}

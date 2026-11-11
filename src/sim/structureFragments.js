import { CELL, STRUCTURE } from '../data/balance.js';

function bounds(world, cells) {
  let x = Infinity; let y = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const index of cells) {
    const point = world.coords(index);
    x = Math.min(x, point.x); y = Math.min(y, point.y);
    right = Math.max(right, point.x); bottom = Math.max(bottom, point.y);
  }
  return { x, y, w: right - x + 1, h: bottom - y + 1 };
}

function components(world, cells) {
  const pending = new Set(cells);
  const result = [];
  while (pending.size > 0) {
    const start = pending.values().next().value;
    const queue = [start];
    pending.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const { x, y } = world.coords(queue[head]);
      for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (!world.inBounds(xx, yy)) continue;
        const next = world.index(xx, yy);
        if (!pending.delete(next)) continue;
        queue.push(next);
      }
    }
    result.push(queue.sort((a, b) => a - b));
  }
  return result;
}

function remapSegments(original, fragment) {
  const vertical = original.kind === 'shaft';
  const oldStart = vertical ? original.y : original.x;
  const start = vertical ? fragment.y : fragment.x;
  const end = start + (vertical ? fragment.h : fragment.w);
  const origin = original.segmentOrigin ?? oldStart;
  const segments = [];
  for (let position = start; position < end;) {
    const partitionEnd = origin + (Math.floor((position - origin) / STRUCTURE.TUNNEL_SEGMENT_LENGTH) + 1)
      * STRUCTURE.TUNNEL_SEGMENT_LENGTH;
    const until = Math.min(end, partitionEnd);
    const saved = original.structureSegments?.find((segment) => oldStart + segment.offset <= position
      && oldStart + segment.offset + segment.length > position);
    segments.push({
      ...structuredClone(saved ?? {}), offset: position - start, length: until - position,
      integrity: saved?.integrity ?? original.integrity ?? STRUCTURE.INITIAL_INTEGRITY,
    });
    position = until;
  }
  return segments;
}

function within(fragment, x, y) {
  return x >= fragment.x && x < fragment.x + fragment.w && y >= fragment.y && y < fragment.y + fragment.h;
}

// Called only after a local collapse. A single excavation id in two disconnected
// networks would otherwise mix air and provide power across the rubble.
export function splitTunnelFragments(sim, excavation) {
  if (!['gallery', 'shaft'].includes(excavation.kind) || excavation.state === 'collapsed') return [excavation];
  // Snapshot before mutating the first fragment. Every fragment owns its nested
  // histories and state, exactly as it will after a JSON save/reload.
  const original = structuredClone(excavation);
  const dug = new Set(original.dugCells ?? []);
  const collapsed = new Set(original.collapsedCells ?? []);
  // Another excavation's fontis may have filled a previously open cell without
  // adding it to this tunnel's collapsedCells. Such rubble is never a bridge.
  const retained = [...new Set([...(original.cells ?? []), ...dug])]
    .filter((index) => !collapsed.has(index) && (!dug.has(index) || sim.world.states[index] === CELL.EMPTY))
    .sort((a, b) => a - b);
  if (retained.length === 0) {
    excavation.cells = [];
    excavation.dugCells = [];
    excavation.structureSegments = [];
    excavation.integrity = 0;
    excavation.structureIntegrity = 0;
    excavation.state = 'collapsed';
    excavation.stress = null;
    sim.structureDirty = true;
    return [];
  }
  const groups = components(sim.world, retained);
  groups.sort((a, b) => {
    const aa = bounds(sim.world, a); const bb = bounds(sim.world, b);
    return original.kind === 'shaft' ? aa.y - bb.y || aa.x - bb.x : aa.x - bb.x || aa.y - bb.y;
  });
  const family = original.fragmentOf ?? original.id;
  const fragments = groups.map((cells, position) => {
    const fragment = position === 0 ? Object.assign(excavation, structuredClone(original))
      : { ...structuredClone(original), id: sim.nextExcavationId++ };
    Object.assign(fragment, bounds(sim.world, cells));
    fragment.fragmentOf = family;
    fragment.segmentOrigin = original.segmentOrigin ?? (original.kind === 'shaft' ? original.y : original.x);
    fragment.cells = cells;
    fragment.dugCells = cells.filter((index) => dug.has(index) && sim.world.states[index] === CELL.EMPTY);
    const owned = new Set(cells);
    fragment.work = structuredClone(Object.fromEntries(Object.entries(original.work ?? {}).filter(([index]) => owned.has(Number(index)))));
    fragment.workRequired = structuredClone(Object.fromEntries(Object.entries(original.workRequired ?? {}).filter(([index]) => owned.has(Number(index)))));
    for (const field of ['waterInfiltration', 'thawInfiltration']) {
      if (original[field]) fragment[field] = Object.fromEntries(Object.entries(original[field])
        .filter(([key]) => owned.has(Number(key.split(':')[0]))).map(([key, value]) => [key, structuredClone(value)]));
    }
    fragment.supports = (original.supports ?? []).filter((support) => {
      const x = typeof support === 'number' ? support : support.x;
      const y = typeof support === 'number' || support.y == null ? original.y + original.h - 1 : support.y;
      return within(fragment, x, y);
    }).map((support) => structuredClone(support));
    fragment.doors = (original.doors ?? []).filter((id) => {
      const door = sim.doors?.find((candidate) => candidate.id === id);
      return door && door.x >= fragment.x - 1 && door.x <= fragment.x + fragment.w
        && door.y >= fragment.y - 1 && door.y <= fragment.y + fragment.h;
    });
    fragment.structureSegments = remapSegments(original, fragment);
    fragment.integrity = Math.min(...fragment.structureSegments.map((segment) => segment.integrity));
    fragment.structureIntegrity = fragment.integrity;
    fragment.stress = null;
    if (position !== 0) {
      // Historical quantities and orders remain attached once, to the original.
      fragment.loose = {};
      fragment.yields = {};
      fragment.production = {};
      fragment.collapsedCells = [];
      fragment.collapseReport = null;
      delete fragment.collapseReportId;
      delete fragment.collapseTick;
      fragment.roomType = null;
      fragment.stockId = null;
      fragment.manualVentilation = false;
      fragment.manualVentilationWorkerId = null;
      fragment.engineeredShelterShaft = Boolean(original.engineeredShelterShaft
        || (original.initial && original.label === 'accessShaft'));
      fragment.initial = false;
      fragment.label = null;
      fragment.storedKwh = 0;
      fragment.openFontis = false;
      if (fragment.state === 'fitted') fragment.state = 'dug';
      sim.excavations.push(fragment);
    }
    for (const index of fragment.dugCells) {
      const { x, y } = sim.world.coords(index);
      sim.world.setCell(x, y, sim.world.materials[index], sim.world.states[index], fragment.id);
    }
    return fragment;
  });
  for (const stock of sim.stocks ?? []) {
    if (stock.excavationId !== original.id && stock.id !== original.stockId) continue;
    const owner = fragments.find((fragment) => within(fragment, stock.x, stock.y));
    if (!owner) { stock.excavationId = null; continue; }
    stock.excavationId = owner.id;
    owner.stockId = stock.id;
    if (owner !== excavation && excavation.stockId === stock.id) excavation.stockId = null;
  }
  for (const job of sim.jobs ?? []) {
    if (job.excavationId !== original.id || !Number.isFinite(job.x)) continue;
    const y = job.y ?? (job.type === 'support' ? original.y + original.h - 1 : null);
    if (!Number.isFinite(y)) continue;
    const owner = fragments.find((fragment) => within(fragment, job.x, y));
    if (owner) job.excavationId = owner.id;
  }
  for (const entries of Object.values(sim.m5?.hazards ?? {})) {
    if (!Array.isArray(entries)) continue;
    for (const hazard of entries) {
      if (hazard.excavationId !== original.id || !Number.isFinite(hazard.x) || !Number.isFinite(hazard.y)) continue;
      const owner = fragments.find((fragment) => within(fragment, hazard.x, hazard.y));
      if (owner) hazard.excavationId = owner.id;
    }
  }
  // Bounds change even for a single surviving end. Force derived membership and
  // navigation caches to rebuild when no ownership change called world.touch.
  if (groups.length === 1) sim.world.touch(excavation.x, excavation.y);
  sim.structureDirty = true;
  return fragments;
}

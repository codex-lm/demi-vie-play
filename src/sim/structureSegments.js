import { CELL, STRUCTURE } from '../data/balance.js';

export function isTunnel(excavation) {
  return excavation.kind === 'shaft' || excavation.kind === 'gallery';
}

export function engineeredShaft(excavation) {
  return excavation.kind === 'shaft' && (excavation.engineeredShelterShaft
    || (excavation.initial && excavation.label === 'accessShaft'));
}

function contains(world, region, index) {
  const { x, y } = world.coords(index);
  return x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h;
}

// Fixed partitions keep their identity after partial collapse and across saves.
// Evaluation uses copies; a preview never initializes or mutates saved sections.
export function tunnelSegments(sim, excavation) {
  const vertical = excavation.kind === 'shaft';
  const length = vertical ? excavation.h : excavation.w;
  const base = vertical ? excavation.y : excavation.x;
  const origin = excavation.segmentOrigin ?? base;
  const result = [];
  const first = origin + Math.floor((base - origin) / STRUCTURE.TUNNEL_SEGMENT_LENGTH) * STRUCTURE.TUNNEL_SEGMENT_LENGTH;
  for (let cursor = first; cursor < base + length; cursor += STRUCTURE.TUNNEL_SEGMENT_LENGTH) {
    const offset = Math.max(base, cursor) - base;
    const size = Math.min(base + length, cursor + STRUCTURE.TUNNEL_SEGMENT_LENGTH) - base - offset;
    const region = {
      ...excavation,
      x: excavation.x + (vertical ? 0 : offset),
      y: excavation.y + (vertical ? offset : 0),
      w: vertical ? excavation.w : size,
      h: vertical ? size : excavation.h,
      offset, length: size,
    };
    region.cells = (excavation.cells ?? []).filter((index) => contains(sim.world, region, index));
    region.dugCells = (excavation.dugCells ?? []).filter((index) => contains(sim.world, region, index)
      && sim.world.states[index] === CELL.EMPTY);
    if (excavation.collapsedCells?.length && region.cells.length === 0 && region.dugCells.length === 0) continue;
    const saved = excavation.structureSegments?.find((segment) => segment.offset === offset);
    region.integrity = saved?.integrity ?? excavation.integrity ?? STRUCTURE.INITIAL_INTEGRITY;
    result.push(region);
  }
  return result;
}

export function syncSegmentIntegrity(excavation) {
  if (!isTunnel(excavation) || !excavation.stress?.segments) return;
  const previous = excavation.structureSegments ?? [];
  const published = excavation.structureIntegrity;
  const delta = Number.isFinite(published) ? (excavation.integrity ?? published) - published : 0;
  excavation.structureSegments = excavation.stress.segments.map(({ offset, length }) => {
    const saved = previous.find((segment) => segment.offset === offset);
    const segment = saved ?? { offset, length, integrity: excavation.integrity ?? STRUCTURE.INITIAL_INTEGRITY };
    // Existing repair and event systems publish a scalar change. Apply it once
    // to surviving sections, retaining their independently accumulated damage.
    segment.integrity = Math.max(0, Math.min(STRUCTURE.INITIAL_INTEGRITY, segment.integrity + (saved ? delta : 0)));
    return segment;
  });
  publishSegmentIntegrity(excavation);
}

export function publishSegmentIntegrity(excavation) {
  if (!excavation.structureSegments?.length) return;
  excavation.integrity = Math.min(...excavation.structureSegments.map((segment) => segment.integrity));
  excavation.structureIntegrity = excavation.integrity;
}

export function segmentRegion(sim, excavation, segment, margin = 0) {
  const vertical = excavation.kind === 'shaft';
  const start = Math.max(0, segment.offset - margin);
  const end = Math.min(vertical ? excavation.h : excavation.w, segment.offset + segment.length + margin);
  const region = {
    ...excavation,
    x: excavation.x + (vertical ? 0 : start),
    y: excavation.y + (vertical ? start : 0),
    w: vertical ? excavation.w : end - start,
    h: vertical ? end - start : excavation.h,
    offset: segment.offset, length: segment.length,
  };
  region.cells = (excavation.dugCells ?? []).filter((index) => contains(sim.world, region, index)
    && sim.world.states[index] === CELL.EMPTY);
  region.dugCells = region.cells;
  return region;
}

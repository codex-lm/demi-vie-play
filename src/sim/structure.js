import { CELL, EXCAVATION, SHAPES, STRUCTURE, TIME, WORLD } from '../data/balance.js';
import { COATINGS, LININGS } from '../data/linings.js';
import { MATERIAL, materialAt } from '../data/materials.js';
import { absorbableRescueTunnels, claimVoid, createExcavation, validateExcavation } from './excavation.js';
import { recordCollapse } from './causes.js';
import { updateRescues, trappedSurvivors } from './collapseRescue.js';
import { ensureRescueAlert } from './alerts.js';
import { POI_CONTENT_RULES } from '../data/poi/rules.js';
import { M6 } from '../data/m6.js';
import { minerRiskFactor } from './souvenirs.js';
import { analyzeWall, breakable, bridgeFaces, upperWallRegions, ceilingRows, clearedRubble, cutRock, forgetShapes, wallMetrics, engineeredShelterWall, hallGeometry, tunnelGeometry } from './structureGeometry.js';
import { splitTunnelFragments } from './structureFragments.js';
import { releaseJob } from './jobs.js';
import { structuralRevision, cachedStructureEvaluation } from './structureCache.js';
import { engineeredShaft, isTunnel, tunnelSegments, syncSegmentIntegrity, publishSegmentIntegrity, segmentRegion } from './structureSegments.js';

function isHall(excavation) {
  return excavation.kind === 'room' || excavation.kind === 'quarry';
}

function isActive(excavation) {
  return excavation.state !== 'collapsed';
}

function depthOf(excavation) {
  return Math.max(0, excavation.y - WORLD.SURFACE_Y);
}

function roofColumns(sim, excavation) {
  const columns = new Map();
  for (const index of excavation.dugCells ?? []) {
    const { x, y } = sim.world.coords(index);
    columns.set(x, Math.min(columns.get(x) ?? Infinity, y));
  }
  if (columns.size === 0) {
    for (let x = excavation.x; x < excavation.x + excavation.w; x += 1) columns.set(x, excavation.y);
  }
  return columns;
}

function isSupportingGround(world, x, y) {
  if (!world.inBounds(x, y)) return false;
  const index = world.index(x, y);
  return world.states[index] === CELL.SOLID && world.materials[index] !== MATERIAL.AIR;
}

function isIntactRock(world, x, y) {
  return isSupportingGround(world, x, y) && world.materials[world.index(x, y)] !== MATERIAL.RUBBLE;
}

// The rock read around a roof or a shaft: the ground standing there, or the
// rock an excavation cut there (removing it never makes a roof or a shaft
// read stronger, see cutRock).
function rockAround(sim, x, y) {
  if (!sim.world.inBounds(x, y)) return null;
  const index = sim.world.index(x, y);
  if (isSupportingGround(sim.world, x, y)) return materialAt(sim.world.materials[index]);
  const cut = cutRock(sim, index);
  if (cut != null) return materialAt(cut);
  return clearedRubble(sim, index) ? materialAt(MATERIAL.RUBBLE) : null;
}

function roofMaterial(sim, excavation) {
  let weakest = null;
  for (const [x, roofY] of roofColumns(sim, excavation)) {
    for (let y = roofY - 1; y >= roofY - 2; y -= 1) {
      const material = rockAround(sim, x, y);
      if (material && (!weakest || material.span < weakest.span)) weakest = material;
    }
  }
  return weakest ?? materialAt(MATERIAL.AIR);
}

function shaftMaterial(sim, excavation) {
  let weakest = null;
  for (let y = excavation.y; y < excavation.y + excavation.h; y += 1) {
    for (const x of [excavation.x - 1, excavation.x + excavation.w]) {
      const material = rockAround(sim, x, y);
      if (material && (!weakest || material.span < weakest.span)) weakest = material;
    }
  }
  return weakest ?? materialAt(MATERIAL.CONCRETE);
}

// The gallery or the shaft that holds this open cell, or null. A natural
// void a tunnel took stays that void (see claimVoid): the roof under it is
// still under a void.
function tunnelOpening(sim, x, y) {
  if (!sim.world.inBounds(x, y) || !sim.world.isEmpty(x, y)) return null;
  const index = sim.world.index(x, y);
  const id = sim.world.cellExcavation[index];
  const owner = sim.excavations?.find((excavation) => excavation.id === id && isActive(excavation));
  return owner && isTunnel(owner) && !owner.claimedVoid?.includes(index) ? owner : null;
}

// The slab of a roof at roofY, at (x, y): the ground standing there, or the
// rock cut there when the gallery or the shaft holding the cell opens into
// that roof (a junction keeps the slab as it was, so piercing a plug never
// makes a room stronger). Anything else open ends the slab: a room, a
// quarry, a natural void, or a cavity standing above the roof that cut the
// cell (it thins the slab, as it thins a wall). The rock read is the one the
// holder cut, if it did, else every live excavation that cut it (the record
// follows the cell), rubble weighing as rubble. An excavation opens into the
// roof when it is drawn down to it: a gallery or a shaft to the row just
// above it, a room or a quarry over the roof's own row (that roof column
// lies inside it: a shaft dug through the room took the cell, see
// finishIfDug). A room or a quarry drawn right on top of the roof stands
// above it. UNRECORDED: no record at all (an old save).
const UNRECORDED = -1;
function slabRock(sim, x, y, roofY) {
  if (!sim.world.inBounds(x, y)) return null;
  const index = sim.world.index(x, y);
  if (isSupportingGround(sim.world, x, y)) return sim.world.materials[index];
  const owner = tunnelOpening(sim, x, y);
  if (!owner) return null;
  const opens = (other) => other.y + other.h - 1 >= (isTunnel(other) ? roofY - 1 : roofY);
  const own = owner.cutRock?.[index];
  if (own != null) return opens(owner) ? own : null;
  let material = UNRECORDED;
  for (const other of sim.excavations) {
    const cut = other.cutRock?.[index];
    if (cut == null || !isActive(other)) continue;
    if (!opens(other)) return null;
    if (material === UNRECORDED || cut === MATERIAL.RUBBLE) material = cut;
  }
  return material;
}

function slabThickness(sim, excavation) {
  let minimum = Infinity;
  for (const [x, roofY] of roofColumns(sim, excavation)) {
    let thickness = 0;
    let junction = false;
    for (let y = roofY - 1; y >= 0; y -= 1) {
      const material = slabRock(sim, x, y, roofY);
      if (material == null || material === UNRECORDED) {
        // A tunnel without a record of its cut rock (an old save) still
        // joins the roof: that column is an opening, not a missing slab.
        junction = thickness === 0 && material === UNRECORDED;
        break;
      }
      thickness += material === MATERIAL.RUBBLE ? STRUCTURE.RUBBLE_SLAB_WEIGHT : 1;
    }
    if (!junction) minimum = Math.min(minimum, thickness);
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function supportX(support) {
  return typeof support === 'number' ? support : support?.x;
}

function usableSupport(support) {
  return typeof support === 'number' || (!support?.failed && support?.solidity !== 0);
}

function supportPositions(excavations) {
  const positions = new Set();
  for (const excavation of excavations) {
    for (const support of excavation.supports ?? []) {
      if (!usableSupport(support)) continue;
      const x = supportX(support);
      if (Number.isInteger(x)) positions.add(x);
    }
  }
  return [...positions].sort((a, b) => a - b);
}

function tunnelSpan(excavation) {
  if ((excavation.state === 'planned' || excavation.state === 'digging') && (excavation.dugCells ?? []).length === 0) return 0;
  return excavation.kind === 'gallery' ? EXCAVATION.GALLERY_SECTION : excavation.w;
}

function colorForRatio(ratio) {
  if (ratio > STRUCTURE.FAILURE_RATIO) return 'red';
  if (ratio > STRUCTURE.STABLE_RATIO) return 'yellow';
  return 'green';
}

function displayNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : value;
}

function emptyStress() {
  return {
    ratio: 0,
    span: 0,
    maxSpan: 0,
    slab: 0,
    requiredSlab: STRUCTURE.SLAB_MIN,
    depth: 0,
    material: 'air',
    liningFactor: 1,
    shapeFactor: 1,
    depthFactor: 1,
    slabFactor: 1,
    spanRatio: 0,
    wallRatio: 0,
    walls: [],
    reasons: [],
    color: 'green',
  };
}

function evaluateRegion(sim, excavation, tunnel = excavation) {
  if (!excavation) return emptyStress();

  const depth = depthOf(excavation);
  const isShaft = excavation.kind === 'shaft';
  const material = isShaft ? shaftMaterial(sim, excavation) : roofMaterial(sim, excavation);
  const slab = slabThickness(sim, excavation);
  const shapeFactor = SHAPES[excavation.shape]?.factor ?? SHAPES.flat.factor;
  const liningFactor = LININGS[excavation.lining]?.factor ?? LININGS.none.factor;
  const depthFactor = 1 / (1 + depth / STRUCTURE.DEPTH_SCALE);

  let span;
  let walls = [];
  if (isHall(excavation)) {
    ({ span, walls } = hallGeometry(sim, excavation));
  } else {
    // Rule 1: a gallery or a shaft keeps its own roof, section by section.
    // Rule 2: a section that removed the wall between two halls is part of
    // their merged ceiling, and carries that wall as they do (see
    // tunnelGeometry); it never reads less than its own roof.
    const merged = tunnelGeometry(sim, tunnel, excavation);
    span = Math.max(tunnelSpan(excavation), merged.span);
    walls = merged.walls;
  }

  const requiredSlab = Math.max(STRUCTURE.SLAB_MIN, Math.ceil(STRUCTURE.SLAB_FACTOR * span));
  const slabFactor = isShaft ? 1 : Math.min(1, slab / requiredSlab) ** STRUCTURE.SLAB_EXPONENT;
  const maxSpan = material.span * shapeFactor * liningFactor * depthFactor * slabFactor;
  const spanRatio = engineeredShaft(excavation) ? 0 : maxSpan > 0 ? span / maxSpan : (span > 0 ? Infinity : 0);
  const wallRatio = walls.reduce((maximum, wall) => Math.max(maximum, wall.ratio), 0);
  const ratio = Math.max(spanRatio, wallRatio);

  const reasons = [];
  if (!isShaft && slab < requiredSlab) reasons.push({ code: 'reasonSlab', values: { slab, required: requiredSlab } });
  if (spanRatio > STRUCTURE.STABLE_RATIO) reasons.push({ code: 'reasonSpan', values: { span: displayNumber(span), max: displayNumber(maxSpan) } });
  for (const wall of walls) {
    if (wall.ratio <= STRUCTURE.STABLE_RATIO) continue;
    // A bridged wall is gone (rule 2): the merged ceiling is read instead.
    // It keeps only the reading it had, and is named only where that reads
    // more than the merged ceiling (a door wall, a weak rock).
    if (wall.bridged && wall.ratio <= spanRatio) continue;
    reasons.push({ code: 'reasonWall', values: { width: wall.width, required: wall.required, otherId: wall.otherId } });
    // Why the wall carries more: the part of its height digs cut, and the
    // part a natural void leaves open. A wall with no rock standing at all
    // is said so, never "the rock that remains".
    if (wall.bridged) {
      reasons.push({ code: 'reasonWallBridged', values: { otherId: wall.otherId } });
    } else if (wall.standing === false) {
      reasons.push({ code: 'reasonWallCutThrough', values: { otherId: wall.otherId } });
    } else if (wall.cut > 0) {
      reasons.push({ code: 'reasonWallOpened', values: { share: Math.round(100 * wall.cut / wall.height), otherId: wall.otherId } });
    }
    if (wall.voids > 0) {
      reasons.push({ code: 'reasonWallVoid', values: { share: Math.round(100 * wall.voids / wall.height), otherId: wall.otherId } });
    }
  }
  if (depth > 0) reasons.push({ code: 'reasonDepth', values: { depth, factor: displayNumber(depthFactor) } });
  if (liningFactor !== 1) reasons.push({ code: 'reasonSupport', values: { factor: liningFactor } });
  if (shapeFactor !== 1) reasons.push({ code: 'reasonShape', values: { factor: shapeFactor } });
  reasons.push({ code: 'reasonWeak', values: { material: material.key } });

  return {
    ratio,
    span,
    maxSpan,
    slab,
    requiredSlab,
    depth,
    material: material.key,
    liningFactor,
    shapeFactor,
    depthFactor,
    slabFactor,
    spanRatio,
    wallRatio,
    walls,
    reasons,
    color: colorForRatio(ratio),
  };
}

// Tunnels expose their worst section to existing previews and panels.
export function evaluateExcavation(sim, excavation) {
  if (!excavation || !isTunnel(excavation)) return evaluateRegion(sim, excavation);
  const sections = tunnelSegments(sim, excavation).map((region) => ({
    ...evaluateRegion(sim, region, excavation),
    offset: region.offset, length: region.length,
    x: region.x, y: region.y, w: region.w, h: region.h,
  }));
  if (sections.length === 0) return { ...emptyStress(), segments: [] };
  const worst = sections.reduce((a, b) => b.ratio > a.ratio ? b : a);
  const reasons = [{ code: 'reasonTunnelSegment', values: { start: worst.offset + 1, end: worst.offset + worst.length } }, ...worst.reasons];
  if (engineeredShaft(excavation)) reasons.push({ code: 'reasonEngineeredShaft', values: {} });
  return { ...worst, reasons, segments: sections };
}

export function estimateGeologistRisk(sim, ratio, material) {
  const geologist = (sim.colonists ?? [])
    .filter((colonist) => colonist.health > 0 && !colonist.dead && Number.isFinite(colonist.skills?.dig))
    .sort((a, b) => b.skills.dig - a.skills.dig || a.id - b.id)[0] ?? null;
  if (!geologist || geologist.skills.dig < M6.GEOLOGIST_MIN_SKILL || !Number.isFinite(ratio)) return null;
  const skill = geologist.skills.dig;
  const estimate = Math.round(ratio * minerRiskFactor(sim, material) * 100);
  const expert = skill >= M6.GEOLOGIST_EXPERT_SKILL;
  const uncertainty = expert ? 0 : Math.max(4, 28 - Math.floor(skill) * 3);
  return {
    id: geologist.id,
    name: geologist.name,
    skill,
    estimate,
    min: Math.max(0, estimate - uncertainty),
    max: Math.min(200, estimate + uncertainty),
    expert,
    material,
  };
}

// Which existing excavations a future dig can change. The structure reads
// another excavation in four ways only, and each gives an exact test:
// - a ceiling run along a row goes through open cells: every tunnel with an
//   open cell connected to the dig along one of its rows, and every hall
//   whose ceiling is read on that row (or with a cell inside the dig);
// - a wall joins two halls that share rows, at any distance: a planned hall
//   is a new wall for every hall sharing its rows, and a dig inside an
//   existing wall (between the two halls, on their shared rows) changes it;
//   so does removing the upper wall that separates a taller hall's roof;
// - a slab is the solid rock above a roof column: a dig in that column,
//   reached by that rock, thinner than the slab the roof needs;
// - the rock read around a roof or a shaft (two cells away at most).
// Anything else evaluates exactly as before, so it is left out.
function prospectReach(sim, prospect, neighbours, before) {
  // before(position): the cached evaluation of neighbours[position].
  const touched = new Set();
  const left = prospect.x;
  const right = prospect.x + prospect.w;
  const top = prospect.y;
  const bottom = prospect.y + prospect.h;
  const byId = new Map(neighbours.map((other) => [other.id, other]));
  const upperWalls = upperWallRegions(sim);
  const runReaches = (id, y) => {
    const other = byId.get(id);
    return Boolean(other) && (!isHall(other) || ceilingRows(sim, other).has(y));
  };
  // An open cell is read with its owner, and with every excavation that
  // lists it among its dug cells while another one holds it (finishIfDug
  // gives a tunnel drawn through a room the room's cells: the room still
  // reads them).
  const listed = new Map();
  for (const other of neighbours) {
    for (const index of other.dugCells ?? []) {
      if (sim.world.cellExcavation[index] === other.id) continue;
      if (!listed.has(index)) listed.set(index, []);
      listed.get(index).push(other.id);
    }
  }
  const holders = (x, y) => {
    const index = sim.world.index(x, y);
    return [sim.world.cellExcavation[index], ...(listed.get(index) ?? [])];
  };
  // The halls whose open cells an order with rock to dig takes over
  // (finishIfDug gives it every cell of its rectangle: a shaft through a
  // quarry). They no longer stand on those cells in the wall between two
  // other halls (see analyzeWall): a hall that faces one of them is read
  // again (below).
  const takenFrom = new Set();
  let hasWork = false;
  for (let y = top; y < bottom; y += 1) {
    if (!sim.world.inBounds(left, y)) continue;
    for (let x = left; x < right; x += 1) {
      if (!sim.world.inBounds(x, y)) continue;
      if (!sim.world.isEmpty(x, y)) {
        hasWork ||= sim.world.states[sim.world.index(x, y)] === CELL.SOLID;
        continue;
      }
      for (const id of holders(x, y)) if (id !== -1) touched.add(id);
      const owner = byId.get(sim.world.cellExcavation[sim.world.index(x, y)]);
      if (owner && isHall(owner)) takenFrom.add(owner.id);
    }
    // A run that crosses the open cells of a hall whose ceiling is not this
    // row (a taller hall drawn over it) and reaches a cavity beyond: that
    // hall may stand between two cavities the order links on this row (rule
    // 2, see cavityLinks), and read their merged ceiling as one more roof
    // row. It is reached with them.
    for (const direction of [-1, 1]) {
      let x = direction < 0 ? left - 1 : right;
      const crossed = new Set();
      while (x >= 0 && x < sim.world.width && sim.world.inBounds(x, y)) {
        if (!sim.world.isEmpty(x, y)) break;
        for (const id of holders(x, y)) {
          if (runReaches(id, y)) {
            touched.add(id);
            for (const hall of crossed) touched.add(hall);
          } else if (id !== -1) crossed.add(id);
        }
        x += direction;
      }
    }
  }
  if (!hasWork) takenFrom.clear();
  const sharesRows = (other) => other.y < bottom && other.y + other.h > top;
  const halls = neighbours.filter((other) => isHall(other) && sharesRows(other));
  const doors = sim.doors ?? [];
  neighbours.forEach((other, position) => {
    if (touched.has(other.id)) return;
    // Rock read around the roof, a shaft's sides and a junction just above.
    let x0 = other.x;
    let x1 = other.x + other.w;
    let y0 = other.y;
    let y1 = other.y + other.h;
    for (const index of other.dugCells ?? []) {
      const { x, y } = sim.world.coords(index);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
    if (x0 - 2 < right && x1 + 2 > left && y0 - 2 < bottom && y1 + 2 > top) {
      touched.add(other.id);
      return;
    }
    if (isHall(other) && (upperWalls.get(other.id) ?? []).some((wall) => wall.x < right
      && wall.x + wall.w > left && wall.y < bottom && wall.y + wall.h > top)) {
      touched.add(other.id);
      return;
    }
    // A thinner slab above one of its roof columns.
    const roof = roofColumns(sim, other);
    let stress = null;
    const required = () => {
      stress ??= before(position);
      return Math.max(STRUCTURE.SLAB_MIN, stress.requiredSlab ?? 0,
        ...(stress.segments ?? []).map((segment) => segment.requiredSlab ?? 0));
    };
    for (const [x, roofY] of roof) {
      if (x < left || x >= right || bottom > roofY) continue;
      let thickness = 0;
      let reached = true;
      for (let y = roofY - 1; y >= bottom; y -= 1) {
        const material = slabRock(sim, x, y, roofY);
        if (material == null || material === UNRECORDED) {
          reached = false;
          break;
        }
        thickness += material === MATERIAL.RUBBLE ? STRUCTURE.RUBBLE_SLAB_WEIGHT : 1;
      }
      if (reached && thickness < required()) {
        touched.add(other.id);
        return;
      }
    }
    // A tunnel that removed a wall between two halls reads what they read
    // (see tunnelGeometry): it is reached with them, after this pass.
    if (!isHall(other)) return;
    // The dig stands inside one of its walls (between the two halls, on the
    // rows they share with the dig). A wall this hall carries as a bridge
    // stands between two other halls (acrossId, see hallGeometry), maybe on
    // rows below this hall.
    const between = (face, hall) => {
      const rowsFrom = Math.max(top, face.y, hall.y);
      const rowsTo = Math.min(bottom, face.y + face.h, hall.y + hall.h);
      const gapFrom = Math.max(left, face.x < hall.x ? face.x + face.w : hall.x + hall.w);
      const gapTo = Math.min(right, face.x < hall.x ? hall.x : face.x);
      return rowsFrom < rowsTo && gapFrom < gapTo;
    };
    const inside = (hall) => between(other, hall);
    stress ??= before(position);
    for (const { otherId, acrossId } of stress.walls ?? []) {
      const hall = byId.get(otherId);
      const across = acrossId == null ? null : byId.get(acrossId);
      if (!hall || (acrossId == null ? inside(hall) : !across || between(hall, across))) {
        touched.add(other.id);
        return;
      }
    }
    // A hall that faces one the order takes cells from (a wall between them,
    // or no rock at all: a step, a void) may see past it once those cells
    // are the order's.
    for (const id of takenFrom) {
      if (id !== other.id && analyzeWall(sim, other, byId.get(id))) {
        touched.add(other.id);
        return;
      }
    }
    if (!sharesRows(other)) return;
    // A fused or missing relation stays so: a dig only removes rock or, for a
    // hall, blocks rows. Blocking every open row of a fused wall can only leave
    // rows that hold a door, so only a door makes it a wall again.
    if (isHall(prospect) && doors.length > 0 && halls.some((hall) => hall !== other && inside(hall)
      && doors.some((door) => door.x >= Math.min(other.x + other.w, hall.x + hall.w)
        && door.x < Math.max(other.x, hall.x) && door.y < Math.min(other.y + other.h, hall.y + hall.h)
        && door.y + EXCAVATION.DOOR_HEIGHT > Math.max(other.y, hall.y)))) {
      touched.add(other.id);
      return;
    }
    // A planned hall is a new wall for this hall. Nothing else of this hall
    // changes here, so its ratio moves only if that wall is the new maximum.
    if (!isHall(prospect)) return;
    const wall = analyzeWall(sim, other, prospect);
    if (wall && !wall.fused && !engineeredShelterWall(wall) && !(wallMetrics(sim, wall).ratio <= stress.ratio)) {
      touched.add(other.id);
    }
  });
  for (const other of neighbours) {
    if (touched.has(other.id) || isHall(other)) continue;
    const faces = bridgeFaces(sim, other);
    if (faces && [...faces].some((id) => touched.has(id))) touched.add(other.id);
  }
  return touched;
}

// The cells an order writes once it is dug, as planExcavation, digCell and
// finishIfDug do: an order that digs takes every cell of its rectangle when
// it is finished; an order with no rock to dig is dug as soon as it is
// planned, and takes only the natural voids of its rectangle and the open
// cells of the tunnels it takes over (`taken`).
function prospectCells(sim, prospect, taken) {
  const written = [];
  for (let y = prospect.y; y < prospect.y + prospect.h; y += 1) {
    for (let x = prospect.x; x < prospect.x + prospect.w; x += 1) {
      if (sim.world.inBounds(x, y)) written.push(sim.world.index(x, y));
    }
  }
  if (written.some((index) => sim.world.states[index] === CELL.SOLID)) return written;
  return written.filter((index) => sim.world.cellExcavation[index] === -1 || taken.includes(index));
}

// The excavations whose shape the order changes: rubble back in their dug
// cells is not their shape; dug out, it is again, as after the real dig. An
// unowned open cell they list (rubble a raider tunnel reopened in a rescue
// tunnel) reads as a void until the order holds it: read in place too.
function reshapedBy(sim, prospect, written) {
  const opened = new Set(written.filter((index) => sim.world.states[index] !== CELL.EMPTY
    || sim.world.cellExcavation[index] === -1));
  if (opened.size === 0) return [];
  return (sim.excavations ?? []).filter((other) => isActive(other) && other.id !== prospect.id
    && other.dugCells?.some((index) => opened.has(index)));
}

// read() with the order dug in place: its cells opened and its own, the
// tunnels it takes over gone (see planExcavation), then every written world
// cell and the list of excavations restored exactly. The world revision
// does not change here, so the reshaped shapes are read again from the cells
// (see forgetShapes), before and after.
function withProspectDug(sim, prospect, { written, reshaped, absorbed }, read) {
  const excavations = sim.excavations;
  const saved = written.map((index) => [sim.world.states[index], sim.world.materials[index], sim.world.cellExcavation[index]]);
  for (const index of written) {
    sim.world.states[index] = CELL.EMPTY;
    sim.world.materials[index] = MATERIAL.AIR;
    sim.world.cellExcavation[index] = prospect.id;
  }
  sim.excavations = [...excavations.filter((other) => !absorbed.includes(other)), prospect];
  forgetShapes(sim, reshaped);
  try {
    return read();
  } finally {
    sim.excavations = excavations;
    written.forEach((index, position) => {
      const [state, material, owner] = saved[position];
      sim.world.states[index] = state;
      sim.world.materials[index] = material;
      sim.world.cellExcavation[index] = owner;
    });
    forgetShapes(sim, reshaped);
  }
}

// What each existing room would become if this order were dug, without
// mutating anything: the reached neighbours (see prospectReach; all of them
// with `every`) are read again with the order dug in place. A tunnel the
// order takes over is gone: it is no neighbour. The prospect's id is a
// fresh one: -1 would collide with the "unowned cell" marker and make every
// natural void look like the future excavation.
function neighborProspectRisk(sim, prospect, dig, every) {
  const neighbours = (sim.excavations ?? []).filter((other) => isActive(other) && other.id !== prospect.id
    && !dig.absorbed.includes(other));
  if (neighbours.length === 0) return [];
  const revision = structuralRevision(sim);
  const cached = (position) => cachedStructureEvaluation(sim, neighbours[position], revision, evaluateExcavation);
  const touched = every ? null : prospectReach(sim, prospect, neighbours, cached);
  const affected = every ? neighbours : neighbours.filter((other) => touched.has(other.id));
  if (affected.length === 0) return [];
  const before = affected.map((other) => cachedStructureEvaluation(sim, other, revision, evaluateExcavation).ratio);
  const after = withProspectDug(sim, prospect, dig, () => affected.map((other) => evaluateExcavation(sim, other).ratio));
  const risks = [];
  affected.forEach((other, position) => {
    if (after[position] === before[position] || Math.abs(after[position] - before[position]) <= 1e-9) return;
    risks.push({ id: other.id, ratio: displayNumber(after[position]), color: colorForRatio(after[position]) });
  });
  return risks;
}

export function evaluateProspect(sim, order, options = {}) {
  const valid = validateExcavation(sim, order);
  if (!valid.ok) return { ...emptyStress(), ok: false, error: valid.error, color: 'red' };

  const existing = order.excavationId == null ? null : sim.excavation(order.excavationId);
  // A new order previews under a fresh id: -1 is the "unowned cell" marker,
  // and a prospect carrying it would be credited with every natural void.
  const prospectId = order.excavationId ?? Math.max(sim.nextExcavationId,
    ...(sim.excavations ?? []).map((other) => other.id + 1), 0);
  // A tunnel running into a room is trimmed to the rock it really opens.
  const prospect = createExcavation(prospectId, valid.trimmed ? { ...order, ...valid.trimmed } : order);
  prospect.lining = order.lining ?? existing?.lining ?? 'none';
  prospect.coating = order.coating ?? existing?.coating ?? 'none';
  prospect.supports = order.supports ?? existing?.supports ?? [];
  prospect.state = 'dug';
  // A new room or quarry drawn over a dug rescue tunnel takes it over, as
  // planExcavation does: the tunnel is gone, its open cells are the order's
  // (`taken`), with the natural voids it had taken.
  const absorbed = existing ? [] : absorbableRescueTunnels(sim, prospect);
  const taken = [];
  const voids = new Set(existing?.claimedVoid ?? []);
  for (const tunnel of absorbed) {
    for (const index of tunnel.dugCells ?? []) {
      if (sim.world.states[index] !== CELL.EMPTY) continue;
      taken.push(index);
      if (tunnel.claimedVoid?.includes(index)) voids.add(index);
    }
  }
  const written = prospectCells(sim, prospect, taken);
  const hasWork = written.some((index) => sim.world.states[index] === CELL.SOLID);
  // What the dig will record, as digCell and finishIfDug do: the rock it
  // cuts, and the natural voids it takes. digCell records the rock from an
  // excavation's first cell on only: an order that starts with taken cells
  // records none (as an old save). An order with rock to dig takes a
  // tunnel's open cells as they are (planExcavation): an unowned one among
  // them is not claimed, finishIfDug skips it.
  if (taken.length === 0) prospect.cutRock = { ...(existing?.cutRock ?? {}) };
  for (let y = prospect.y; y < prospect.y + prospect.h; y += 1) {
    for (let x = prospect.x; x < prospect.x + prospect.w; x += 1) {
      if (!sim.world.inBounds(x, y)) continue;
      const index = sim.world.index(x, y);
      const material = sim.world.materials[index];
      if (sim.world.states[index] === CELL.EMPTY && sim.world.cellExcavation[index] === -1) {
        if (!(hasWork && taken.includes(index))) voids.add(index);
      } else if (prospect.cutRock && sim.world.states[index] === CELL.SOLID && material !== MATERIAL.AIR) prospect.cutRock[index] = material;
    }
  }
  prospect.claimedVoid = [...voids].sort((a, b) => a - b);
  const dig = { written, reshaped: reshapedBy(sim, prospect, written), absorbed };
  // Its own reading goes through the shapes of the cavities around it: an
  // order that reshapes one, or takes a tunnel over, is read with it dug in
  // place. It also changes what is read through those shapes (walls, merges,
  // the cavities joined to them), which prospectReach does not follow: every
  // neighbour is read again then.
  const inPlace = dig.reshaped.length > 0 || absorbed.length > 0;
  const stress = inPlace ? withProspectDug(sim, prospect, dig, () => evaluateExcavation(sim, prospect))
    : evaluateExcavation(sim, prospect);
  // neighbors: false skips the neighbours, 'all' re-evaluates every one of
  // them instead of the exact reach (the reference for tests).
  const neighborRisk = options.neighbors === false ? []
    : neighborProspectRisk(sim, prospect, dig, options.neighbors === 'all' || inPlace);
  return {
    ...stress,
    geologist: estimateGeologistRisk(sim, stress.ratio, stress.material),
    ...(neighborRisk.length > 0 ? { neighborRisk } : {}),
    ok: true,
  };
}

// Pour une salle creusée jaune ou rouge : où un étai en bois de plus ferait le
// plus de bien. Calculé sur la salle réelle (cavités ouvertes comprises), sur
// une copie : rien n'est modifié.
export function suggestSupport(sim, excavation, options = {}) {
  if (!excavation || (!isHall(excavation) && excavation.kind !== 'gallery') || !['digging', 'dug', 'fitted'].includes(excavation.state)) return null;
  const current = excavation.stress ?? evaluateExcavation(sim, excavation);
  if (!current || current.color === 'green' || !Number.isFinite(current.ratio)) return null;
  const taken = new Set(supportPositions([excavation]));
  let best = null;
  for (let x = excavation.x; x < excavation.x + excavation.w; x += 1) {
    if (taken.has(x)) continue;
    const trial = { ...excavation, supports: [...(excavation.supports ?? []), { x, y: excavation.y + excavation.h - 1, material: 'wood' }] };
    const stress = evaluateExcavation(sim, trial);
    const center = Math.abs(x - (excavation.x + (excavation.w - 1) / 2));
    const better = !best || stress.ratio < best.ratio - 1e-9 || (Math.abs(stress.ratio - best.ratio) <= 1e-9 && center < best.center);
    if (Number.isFinite(stress.ratio) && better) best = { x, offset: x - excavation.x + 1, ratio: stress.ratio, color: stress.color, center };
  }
  if (!best || best.ratio >= current.ratio - 1e-9) return { color: 'red', ratio: current.ratio, helps: false };
  const { center, ...advice } = best;
  const replaces = (excavation.supports ?? []).some((support) => supportX(support) === best.x && supportReplaceable(support));
  const wet = typeof options.wet === 'boolean' ? options.wet : woodRotsIn(sim, excavation);
  return { ...advice, helps: true, ...(replaces ? { replaces: true } : {}), ...(wet ? { wet: true } : {}) };
}

// Ce que donnerait un seul étai en bois posé au milieu, pour l'aperçu de creusage.
// Lecture seule : rien n'est créé dans la simulation.
export function supportedProspect(sim, order) {
  if (!order || order.kind === 'shaft' || !Number.isInteger(order.w) || order.w < 3) return null;
  const support = { x: order.x + Math.floor(order.w / 2), y: order.y + order.h - 1, material: 'wood' };
  const result = evaluateProspect(sim, { ...order, supports: [...(order.supports ?? []), support] }, { neighbors: false });
  return result.ok ? { color: result.color, ratio: result.ratio, x: support.x } : null;
}

function hasWaterNearby(sim, excavation) {
  if (excavation.humid || excavation.flooded) return true;
  const water = sim.world.water;
  if (!water) return false;
  for (let y = excavation.y - 1; y <= excavation.y + excavation.h; y += 1) {
    for (let x = excavation.x - 1; x <= excavation.x + excavation.w; x += 1) {
      const boundary = y === excavation.y - 1 || y === excavation.y + excavation.h || x === excavation.x - 1 || x === excavation.x + excavation.w;
      if (boundary && sim.world.inBounds(x, y) && water[sim.world.index(x, y)] > 0) return true;
    }
  }
  return false;
}

function vibrating(excavation) {
  return ['roomType', 'facility', 'installation', 'label'].some((field) => {
    const value = String(excavation[field] ?? '').toLowerCase();
    return value.includes('generator') || value.includes('forge') || value.includes('drill');
  });
}

function hasVibration(sim, excavation) {
  if (vibrating(excavation)) return true;
  return (sim.excavations ?? []).some((other) => {
    if (other === excavation || !isActive(other) || !vibrating(other)) return false;
    return other.x <= excavation.x + excavation.w + 1 && other.x + other.w >= excavation.x - 1
      && other.y <= excavation.y + excavation.h + 1 && other.y + other.h >= excavation.y - 1;
  });
}

function dailyLoss(sim, excavation, stress) {
  let loss = 0;
  if (stress.ratio > STRUCTURE.FAILURE_RATIO) loss = STRUCTURE.RED_BASE_LOSS + (stress.ratio - 1) * STRUCTURE.RED_STRESS_LOSS;
  else if (stress.ratio > STRUCTURE.STABLE_RATIO) loss = (stress.ratio - STRUCTURE.STABLE_RATIO) * STRUCTURE.YELLOW_LOSS;
  if (loss === 0) return 0;

  const wet = hasWaterNearby(sim, excavation);
  if (wet && !COATINGS[excavation.coating]?.waterproof) loss *= STRUCTURE.HUMIDITY_MULTIPLIER;
  if (hasVibration(sim, excavation)) loss *= STRUCTURE.VIBRATION_MULTIPLIER;
  if (excavation.fragile) loss *= POI_CONTENT_RULES.FRAGILE_LOSS_FACTOR;
  if (stress.material === 'clay') loss *= STRUCTURE.CLAY_MULTIPLIER;
  loss *= minerRiskFactor(sim, stress.material);
  return Math.min(STRUCTURE.INTEGRITY_MAX_LOSS_PER_DAY, loss);
}

// Le bois pourrit sans bruit dans une salle humide (un puits touche le sable
// aquifère) : environ 100 jours. Prévenir avant qu'il cède, puis quand il cède.
function rotWoodenSupports(sim, excavation, wet) {
  if (!wet || COATINGS[excavation.coating]?.waterproof) return;
  for (const support of excavation.supports ?? []) {
    if (typeof support === 'number' || (support.material !== 'wood' && support.type !== 'wood') || support.failed) continue;
    const before = support.solidity ?? 100;
    support.solidity = Math.max(0, before - STRUCTURE.SUPPORT_ROT_PER_DAY);
    if (before > STRUCTURE.SUPPORT_ROT_WARNING && support.solidity <= STRUCTURE.SUPPORT_ROT_WARNING && support.solidity > 0) {
      sim.log('warning', 'eventSupportRotting', {
        id: excavation.id, excavationId: excavation.id, x: support.x,
        days: Math.ceil(support.solidity / STRUCTURE.SUPPORT_ROT_PER_DAY),
      }, excavation);
    }
    if (support.solidity === 0) {
      support.failed = true;
      sim.log('warning', 'eventSupportFailed', { id: excavation.id, excavationId: excavation.id, x: support.x }, excavation);
      excavation.stress = evaluateExcavation(sim, excavation);
    }
  }
}

// Une salle humide sans cuvelage étanche fait pourrir le bois (environ 100 jours).
export function woodRotsIn(sim, excavation) {
  return Boolean(excavation) && !COATINGS[excavation.coating]?.waterproof && hasWaterNearby(sim, excavation);
}

// Un étai pourri (signalé) ou cassé peut être remplacé à la même place.
export function supportReplaceable(support) {
  return typeof support !== 'number' && (support?.failed || (support?.solidity ?? 100) <= STRUCTURE.SUPPORT_ROT_WARNING);
}

function occupants(sim, excavation) {
  return (sim.colonists ?? []).filter((colonist) => {
    return colonist.health > 0 && colonist.x >= excavation.x && colonist.x < excavation.x + excavation.w
      && colonist.y >= excavation.y && colonist.y < excavation.y + excavation.h;
  });
}

function rockfallInjuries(sim, excavation) {
  for (const colonist of occupants(sim, excavation)) {
    if (!sim.rng.chance(STRUCTURE.ROCKFALL_INJURY_CHANCE_PER_HOUR)) continue;
    colonist.health = Math.max(1, colonist.health - 25);
    colonist.injured = true;
    colonist.lastDamageCauses = ['rockfall'];
    sim.events.push({
      type: 'injury', tick: sim.tick, x: colonist.x, y: colonist.y, colonistId: colonist.id,
      excavationId: excavation.id, injury: 'rockfall',
    });
  }
}

function addStructuralEvent(sim, excavation, type, level, code, values = {}) {
  sim.events.push({ type, tick: sim.tick, x: excavation.x, y: excavation.y, w: excavation.w, h: excavation.h, excavationId: excavation.id });
  sim.log(level, code, { id: excavation.id, excavationId: excavation.id, ...values }, excavation);
}

function updateAlerts(sim, excavation, parent = excavation, offset = null) {
  if (excavation.integrity >= M6.CREAK_INTEGRITY + 5) excavation.creakEmitted = false;
  if (excavation.integrity < M6.CREAK_INTEGRITY && !excavation.creakEmitted) {
    excavation.creakEmitted = true;
    sim.events.push({
      type: 'creak', tick: sim.tick, x: excavation.x, y: excavation.y,
      w: excavation.w, h: excavation.h, excavationId: excavation.id, integrity: excavation.integrity,
    });
    sim.log('warning', 'eventCreak', { id: excavation.id, excavationId: excavation.id }, excavation);
  }
  const level = excavation.integrity < STRUCTURE.DANGER_INTEGRITY ? 3
    : excavation.integrity < STRUCTURE.DUST_INTEGRITY ? 2
      : excavation.integrity < STRUCTURE.CRACK_INTEGRITY ? 1 : 0;
  const previous = excavation.structuralAlertLevel
    ?? (Number.isInteger(excavation.alertLevel) ? excavation.alertLevel : 0);
  if (level >= 1 && previous < 1) addStructuralEvent(sim, excavation, 'crack', 'warning', 'eventCrack');
  if (level >= 2 && previous < 2) addStructuralEvent(sim, excavation, 'dust', 'warning', 'eventDust');
  if (level >= 3 && previous < 3) {
    excavation.structuralDangerTick = sim.tick;
    addStructuralEvent(sim, excavation, 'danger', 'error', 'eventDanger');
    for (const other of cascadeRisk(sim, parent, offset)) {
      sim.log('error', 'eventCascadeRisk', { id: other.id, excavationId: other.id, otherId: excavation.id }, other);
    }
  }
  excavation.structuralAlertLevel = level;
}

// The rock of the wall falls: every solid cell between the faces, on the
// rows the wall was read on (never a row another hall stands on), becomes a
// natural void. An open cell there keeps its excavation (a gallery, a quarry
// or a room dug in the wall) but becomes a void for everyone else, and loses
// the rock its excavation had cut: the wall is gone, not hidden in a record.
function removeWall(sim, wall) {
  const excavations = sim.excavations ?? [];
  for (const y of wall.counted) {
    for (let x = wall.left.x + wall.left.w; x < wall.right.x; x += 1) {
      const index = sim.world.index(x, y);
      const owner = sim.world.states[index] === CELL.EMPTY && sim.world.cellExcavation[index] !== -1
        ? excavations.find((other) => other.id === sim.world.cellExcavation[index] && isActive(other)) : null;
      for (const other of excavations) if (other.cutRock?.[index] != null) delete other.cutRock[index];
      if (owner) {
        claimVoid(owner, index);
        sim.world.touch(x, y);
      } else sim.world.setCell(x, y, MATERIAL.AIR, CELL.EMPTY, -1);
      sim.world.reveal(x, y);
    }
  }
  sim.structureDirty = true;
  sim.events.push({
    type: 'wallRupture',
    tick: sim.tick,
    x: (wall.left.x + wall.left.w + wall.right.x) / 2,
    y: (wall.top + wall.bottom) / 2,
    excavationIds: [wall.left.id, wall.right.id],
  });
  sim.log('warning', 'eventCrack', {
    id: wall.left.id, excavationId: wall.left.id, otherId: wall.right.id, wall: true,
  }, wall.left);
}

// Une porte percée dans le mur entre deux salles l'affaiblit (×1,25). Si le mur
// est déjà à sa largeur minimale, il cèderait : on le dit avant de percer.
export function doorWallRisk(sim, excavation, x, doorY, doorHeight) {
  if (!excavation || !isHall(excavation)) return null;
  for (const other of sim.excavations ?? []) {
    if (other === excavation || other.id === excavation.id || !isActive(other) || !isHall(other)) continue;
    // Door placement must predict the completed neighbour, even before digging.
    const completed = (room) => ['planned', 'digging'].includes(room.state)
      ? { ...room, state: 'dug', cells: [], dugCells: [] } : room;
    const wall = analyzeWall(sim, completed(excavation), completed(other));
    if (!wall || wall.fused || engineeredShelterWall(wall)) continue;
    if (x < wall.left.x + wall.left.w || x >= wall.right.x) continue;
    if (doorY >= wall.bottom || doorY + doorHeight <= wall.top) continue;
    const metrics = wallMetrics(sim, { ...wall, door: true });
    if (metrics.ratio > STRUCTURE.FAILURE_RATIO) {
      return { otherId: other.id, width: wall.width, required: metrics.required, ratio: metrics.ratio };
    }
  }
  return null;
}

export function ruptureWallBetween(sim, a, b) {
  if (!a || !b || !isHall(a) || !isHall(b) || !isActive(a) || !isActive(b)) return false;
  const wall = analyzeWall(sim, a, b);
  if (!breakable(wall)) return false;
  removeWall(sim, wall);
  reevaluateAll(sim);
  sim.structureDirty = false;
  return true;
}

function collapseCasualties(sim, excavation) {
  for (const colonist of occupants(sim, excavation)) {
    if (sim.rng.chance(STRUCTURE.COLLAPSE_DEATH_CHANCE)) {
      colonist.health = 0;
      colonist.alive = false;
      colonist.task = 'dead';
      colonist.jobId = null;
      colonist.collapseId = excavation.id;
      colonist.lastDamageCauses = ['collapse'];
    } else {
      colonist.health = Math.min(colonist.health, 25);
      colonist.injured = true;
      sim.events.push({ type: 'injury', tick: sim.tick, x: colonist.x, y: colonist.y, colonistId: colonist.id, excavationId: excavation.id, severe: true });
    }
  }
}

function recoverStock(sim, excavation, affected) {
  const buried = (sim.stocks ?? []).filter((stock) => affected.has(sim.world.index(stock.x, stock.y)));
  const ids = new Set(buried.map((stock) => stock.id));
  // A cleared passage is not a rebuilt store. Remove buried stores from the
  // active logistics registry, retaining only the recoverable debris.
  sim.stocks = (sim.stocks ?? []).filter((stock) => !ids.has(stock.id));
  for (const stock of buried) {
    for (const [resource, amount] of Object.entries(stock.resources ?? {})) {
      const recovered = Math.floor(amount * STRUCTURE.COLLAPSE_RECOVERABLE);
      if (recovered > 0) excavation.loose[resource] = (excavation.loose[resource] ?? 0) + recovered;
    }
    stock.resources = {};
    stock.excavationId = excavation.id;
    for (const room of sim.excavations ?? []) if (room.stockId === stock.id) room.stockId = null;
  }
  for (const job of sim.jobs ?? []) {
    if (job.status === 'done' || ![job.stockId, job.sourceStockId, job.destinationStockId].some((id) => ids.has(id))) continue;
    const worker = (sim.colonists ?? []).find((person) => person.jobId === job.id);
    if (worker?.carrying && affected.has(sim.world.index(Math.round(worker.x), Math.round(worker.y)))) {
      const { resource, amount } = worker.carrying;
      excavation.loose[resource] = (excavation.loose[resource] ?? 0) + amount;
      worker.carrying = null;
    }
    if (worker) releaseJob(sim, worker);
    job.status = 'done';
    job.colonistId = null;
  }
}

// Le fontis remonte au plus de la moitié de la portée, sans dépasser la dalle,
// et s'arrête net sur une rangée de béton ou de socle : le plancher de l'abri tient.
const FONTIS_STOPPERS = new Set([MATERIAL.CONCRETE, MATERIAL.BEDROCK]);

function fontisExtent(sim, excavation, stress) {
  const maxRows = Math.min(Math.floor(stress.slab), Math.ceil(stress.span / 2));
  let rows = 0;
  for (let y = excavation.y - 1; rows < maxRows; y -= 1) {
    let stopped = false;
    for (let x = excavation.x; x < excavation.x + excavation.w && !stopped; x += 1) {
      if (!sim.world.inBounds(x, y)) continue;
      const index = sim.world.index(x, y);
      stopped = sim.world.states[index] === CELL.SOLID && FONTIS_STOPPERS.has(sim.world.materials[index]);
    }
    if (stopped) break;
    rows += 1;
  }
  return rows;
}

function fontisVictims(sim, excavation, fontisRows, visited) {
  if (fontisRows <= 0) return [];
  const fontisTop = excavation.y - fontisRows;
  return (sim.excavations ?? []).filter((other) => {
    if (other === excavation || !isActive(other) || visited.has(other.id)) return false;
    const regions = isTunnel(other) ? tunnelSegments(sim, other) : [other];
    return regions.some((region) => {
      const horizontal = region.x < excavation.x + excavation.w && region.x + region.w > excavation.x;
      const bottom = region.y + region.h - 1;
      return horizontal && region.y < excavation.y && bottom >= fontisTop - 1
        && (isTunnel(other) || bottom < excavation.y);
    });
  });
}


function weakestSegment(excavation, stress, offset) {
  if (!isTunnel(excavation)) return null;
  if (offset != null) return stress.segments?.find((segment) => segment.offset === offset) ?? null;
  const failed = excavation.structureSegments?.find((segment) => segment.integrity <= 0);
  return stress.segments?.find((segment) => segment.offset === (failed?.offset ?? stress.offset)) ?? null;
}

function collapseFootprint(sim, excavation, stress, offset) {
  const section = weakestSegment(excavation, stress, offset);
  return section ? segmentRegion(sim, excavation, section, STRUCTURE.TUNNEL_COLLAPSE_MARGIN) : excavation;
}

// Read-only forecast uses exactly the same local footprint as the collapse.
export function cascadeRisk(sim, excavation, offset = null) {
  if (!excavation || !isActive(excavation)) return [];
  const visited = new Set([excavation.id]);
  const victims = [];
  const queue = [{ excavation, offset }];
  while (queue.length > 0) {
    const { excavation: current, offset } = queue.shift();
    const stress = evaluateExcavation(sim, current);
    const section = weakestSegment(current, stress, offset);
    const footprint = collapseFootprint(sim, current, stress, offset);
    for (const other of fontisVictims(sim, footprint, fontisExtent(sim, footprint, section ?? stress), visited)) {
      visited.add(other.id);
      victims.push(other);
      if (isTunnel(other)) {
        for (const part of tunnelSegments(sim, other)) {
          if (part.x < footprint.x + footprint.w && part.x + part.w > footprint.x
            && part.y < footprint.y && part.y + part.h >= footprint.y - fontisExtent(sim, footprint, section ?? stress) - 1) {
            queue.push({ excavation: other, offset: part.offset });
          }
        }
      } else queue.push({ excavation: other });
    }
  }
  return victims;
}

export function collapseExcavation(sim, excavation, visited = new Set(), offset = null) {
  if (!excavation || !isActive(excavation)) return false;
  const stress = evaluateExcavation(sim, excavation);
  excavation.stress = stress;
  syncSegmentIntegrity(excavation);
  const section = weakestSegment(excavation, stress, offset);
  if (offset != null && isTunnel(excavation) && !section) return false;
  const key = section ? excavation.id + ':' + section.offset : excavation.id;
  if (visited.has(key)) return false;
  const root = visited.size === 0;
  const cascading = !root;
  visited.add(key);
  const footprint = collapseFootprint(sim, excavation, stress, section?.offset);
  const casualtyArea = section ? segmentRegion(sim, excavation, section) : excavation;
  const localStress = section ?? stress;
  const fontisRows = fontisExtent(sim, footprint, localStress);
  const fontisTop = footprint.y - fontisRows;
  const above = fontisVictims(sim, footprint, fontisRows, new Set([excavation.id]));
  const affected = new Set(footprint.cells);
  const buriedOpenCells = new Set(footprint.cells);
  for (let y = fontisTop; y < footprint.y + footprint.h; y += 1) {
    for (let x = footprint.x; x < footprint.x + footprint.w; x += 1) {
      if (sim.world.inBounds(x, y) && sim.world.isEmpty(x, y)) buriedOpenCells.add(sim.world.index(x, y));
    }
  }
  if (section) {
    // Abandon unfinished cells in the failed slice as well: a planned strip
    // must not connect the surviving networks or be dug through the rubble.
    for (const index of excavation.cells) {
      const { x, y } = sim.world.coords(index);
      if (x >= footprint.x && x < footprint.x + footprint.w && y >= footprint.y && y < footprint.y + footprint.h) affected.add(index);
    }
  }
  for (const index of buriedOpenCells) {
    affected.add(index);
    const { x, y } = sim.world.coords(index);
    sim.world.setCell(x, y, MATERIAL.RUBBLE, CELL.SOLID, -1);
    sim.world.reveal(x, y);
  }
  for (let y = footprint.y - 1; y >= fontisTop; y -= 1) {
    for (let x = footprint.x; x < footprint.x + footprint.w; x += 1) {
      if (!sim.world.inBounds(x, y)) continue;
      affected.add(sim.world.index(x, y));
      sim.world.setCell(x, y, MATERIAL.RUBBLE, CELL.SOLID, -1);
      sim.world.reveal(x, y);
    }
  }

  // A surviving tunnel changes bounds when split. Keep the buried slice as its
  // own collapsed excavation so rescue, stock recovery and alert focus retain
  // the actual rubble geometry, independently of the intact networks.
  const hasRemainder = section && [...excavation.cells, ...excavation.dugCells]
    .some((index) => !affected.has(index));
  const rescueSource = hasRemainder
    ? createExcavation(sim.nextExcavationId++, {
      kind: excavation.kind, x: footprint.x, y: footprint.y, w: footprint.w, h: footprint.h,
    }) : excavation;
  if (hasRemainder) {
    rescueSource.state = 'collapsed';
    rescueSource.integrity = 0;
    rescueSource.cells = [...buriedOpenCells];
    rescueSource.dugCells = [...buriedOpenCells];
    rescueSource.collapseSourceId = excavation.id;
    rescueSource.stress = localStress;
    rescueSource.lining = excavation.lining;
    rescueSource.coating = excavation.coating;
    rescueSource.supports = structuredClone((excavation.supports ?? []).filter((support) => {
      const x = typeof support === 'number' ? support : support.x;
      const y = typeof support === 'number' || support.y == null ? excavation.y + excavation.h - 1 : support.y;
      return x >= footprint.x && x < footprint.x + footprint.w && y >= fontisTop && y < footprint.y + footprint.h;
    }));
  }
  rescueSource.collapseTick = sim.tick;
  rescueSource.originalExcavationId = excavation.originalExcavationId ?? excavation.fragmentOf ?? excavation.id;
  excavation.openFontis = fontisRows > 0 && fontisTop <= WORLD.SURFACE_Y;
  excavation.loose ??= {};
  const reportArea = { ...footprint, stress: localStress, loose: rescueSource.loose, collapseReport: null };
  recoverStock(sim, rescueSource, affected);
  collapseCasualties(sim, casualtyArea);
  addStructuralEvent(sim, { ...reportArea, id: rescueSource.id }, cascading ? 'cascade' : 'collapse', 'error',
    section ? 'eventTunnelCollapse' : cascading ? 'eventCascade' : 'eventCollapse',
    section ? { start: section.offset + 1, end: section.offset + section.length } : {});
  excavation.collapseReport = recordCollapse(sim, section ? reportArea : excavation);
  const report = excavation.collapseReport;
  report.rescueSourceId = rescueSource.id;
  report.originalExcavationId = rescueSource.originalExcavationId;
  if (report.originalExcavationId !== report.excavationId) {
    const entries = sim.m5.causes.alerts.filter((entry) => entry.tick <= sim.tick
      && ['eventCrack', 'eventDust', 'eventDanger'].includes(entry.code)
      && entry.params?.excavationId === report.originalExcavationId);
    report.steps = [...new Map([...entries, ...report.steps].map((entry) => [entry.id, entry])).values()]
      .sort((a, b) => a.tick - b.tick || a.id - b.id);
  }
  rescueSource.collapseReportId = report.id;
  if (excavation.openFontis) sim.events.push({ type: 'openFontis', tick: sim.tick, x: footprint.x + footprint.w / 2, y: WORLD.SURFACE_Y, excavationId: excavation.id });

  if (section) {
    excavation.collapsedCells = [...new Set([...(excavation.collapsedCells ?? []), ...affected])].sort((a, b) => a - b);
    excavation.cells = excavation.cells.filter((index) => !affected.has(index));
    excavation.dugCells = excavation.dugCells.filter((index) => !affected.has(index));
    excavation.structureSegments = (excavation.structureSegments ?? []).filter((part) => part.offset !== section.offset);
    if (excavation.dugCells.length > 0 || excavation.cells.length > 0) {
      publishSegmentIntegrity(excavation);
      splitTunnelFragments(sim, excavation);
    } else {
      excavation.state = 'collapsed';
      excavation.integrity = 0;
      // The final slice has no intact cells left, but its buried cells are still
      // needed to locate survivors and recover supplies during clearance.
      excavation.cells = [...buriedOpenCells];
      excavation.dugCells = [...buriedOpenCells];
    }
  } else {
    excavation.state = 'collapsed';
    excavation.integrity = 0;
    excavation.stress = stress;
    excavation.cells = [...buriedOpenCells];
    excavation.dugCells = [...buriedOpenCells];
  }
  if (hasRemainder) sim.excavations.push(rescueSource);
  // Casualties and fragmentation are resolved before trapping the survivors.
  updateRescues(sim);
  ensureRescueAlert(sim, rescueSource);

  for (const other of above) {
    other.collapseCauseId = excavation.id;
    if (isTunnel(other)) {
      const targets = tunnelSegments(sim, other).filter((part) => part.x < footprint.x + footprint.w
        && part.x + part.w > footprint.x && part.y < footprint.y && part.y + part.h >= fontisTop - 1);
      // Reverse order preserves the coordinates of earlier sections if a later
      // section splits an excavation into independent surviving fragments.
      for (const part of targets.reverse()) collapseExcavation(sim, other, visited, part.offset);
    } else collapseExcavation(sim, other, visited);
  }
  sim.structureDirty = true;
  if (root) {
    reevaluateAll(sim);
    // Newly created rescue tunnels need the same persistent alert fields as a
    // normal structure pass, before clearing dirty or saving during clearance.
    resolveStructuralAlerts(sim);
    sim.structureDirty = false;
    sim.emergency = (sim.excavations ?? []).some((other) => (isActive(other) && other.integrity < STRUCTURE.DANGER_INTEGRITY)
      || trappedSurvivors(sim, other).length > 0);
  }
  return true;
}

function resolveStructuralAlerts(sim) {
  for (const excavation of sim.excavations ?? []) {
    if (!isActive(excavation)) continue;
    syncSegmentIntegrity(excavation);
    if (isTunnel(excavation)) {
      // The player sees one rescue passage and one worsening alert, even when the last
      // short partition follows its neighbour across a threshold an hour later.
      const weakest = (excavation.structureSegments ?? []).reduce((best, part) => !best || part.integrity < best.integrity ? part : best, null);
      if (excavation.rescueSourceId != null) updateAlerts(sim, excavation, excavation, weakest?.offset ?? null);
      for (const saved of excavation.structureSegments ?? []) {
        const region = { ...segmentRegion(sim, excavation, saved), ...saved, id: excavation.id };
        if (excavation.rescueSourceId == null) {
          updateAlerts(sim, region, excavation, saved.offset);
          for (const field of ['creakEmitted', 'structuralAlertLevel', 'structuralDangerTick']) if (region[field] !== undefined) saved[field] = region[field];
        } else {
          saved.creakEmitted = region.integrity < M6.CREAK_INTEGRITY;
          saved.structuralAlertLevel = region.integrity < STRUCTURE.DANGER_INTEGRITY ? 3
            : region.integrity < STRUCTURE.DUST_INTEGRITY ? 2 : region.integrity < STRUCTURE.CRACK_INTEGRITY ? 1 : 0;
          if (saved.structuralAlertLevel === 3 && saved.structuralDangerTick == null) saved.structuralDangerTick = sim.tick;
        }
      }
      excavation.structuralAlertLevel = Math.max(0, ...(excavation.structureSegments ?? []).map((part) => part.structuralAlertLevel ?? 0));
    } else updateAlerts(sim, excavation);
  }

}

function resolveStructure(sim) {
  resolveStructuralAlerts(sim);
  const walls = [];
  const seen = new Set();
  const active = (sim.excavations ?? []).filter((excavation) => isActive(excavation));
  for (let i = 0; i < active.length; i += 1) {
    if (!isHall(active[i])) continue;
    for (let j = i + 1; j < active.length; j += 1) {
      if (!isHall(active[j])) continue;
      const wall = analyzeWall(sim, active[i], active[j]);
      if (!breakable(wall) || engineeredShelterWall(wall)) continue;
      const key = [wall.left.id, wall.right.id].sort((a, b) => a - b).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      const metrics = wallMetrics(sim, wall);
      // A removed wall (rule 2) breaks only while its old reading is what its
      // faces carry (more than their merged ceiling): as the wall it was.
      if (wall.bridged && !wall.standing && metrics.ratio <= evaluateExcavation(sim, wall.left).spanRatio) continue;
      if (metrics.ratio > STRUCTURE.FAILURE_RATIO && (wall.left.integrity <= STRUCTURE.DUST_INTEGRITY || wall.right.integrity <= STRUCTURE.DUST_INTEGRITY)) walls.push(wall);
    }
  }
  if (walls.length > 0) {
    for (const wall of walls) removeWall(sim, wall);
    reevaluateAll(sim);
    sim.structureDirty = false;
  }

  let collapsed = false;
  for (const excavation of sim.excavations ?? []) {
    if (isActive(excavation) && excavation.integrity <= 0) collapsed = collapseExcavation(sim, excavation) || collapsed;
  }
  if (collapsed) {
    reevaluateAll(sim);
    sim.structureDirty = false;
  }
  sim.emergency = sim.excavations.some((excavation) => (isActive(excavation) && excavation.integrity < STRUCTURE.DANGER_INTEGRITY)
    || trappedSurvivors(sim, excavation).length > 0);
}

export function updateStructure(sim) {
  reevaluateAll(sim);
  sim.structureDirty = false;

  const daily = sim.tick > 0 && sim.tick % TIME.TICKS_PER_DAY === 0;
  const day = Math.floor(sim.tick / TIME.TICKS_PER_DAY);
  if (daily) {
    for (const excavation of sim.excavations ?? []) {
      if (!isActive(excavation) || excavation.lastStructureDay === day) continue;
      excavation.lastStructureDay = day;
      rotWoodenSupports(sim, excavation, hasWaterNearby(sim, excavation));
    }
  }
  resolveStructure(sim);
}

export function updateIntegrity(sim) {
  const active = (sim.excavations ?? []).filter((excavation) => isActive(excavation));
  if (sim.structureDirty || active.some((excavation) => !excavation.stress)) {
    reevaluateAll(sim);
    sim.structureDirty = false;
  }

  const hoursPerDay = TIME.TICKS_PER_DAY / TIME.TICKS_PER_HOUR;
  const rockfallCandidates = [];
  for (const excavation of active) {
    if (excavation.lastIntegrityTick === sim.tick) continue;
    excavation.lastIntegrityTick = sim.tick;
    syncSegmentIntegrity(excavation);
    if (isTunnel(excavation)) {
      for (const saved of excavation.structureSegments ?? []) {
        const stress = excavation.stress.segments.find((part) => part.offset === saved.offset);
        const region = segmentRegion(sim, excavation, saved);
        saved.integrity = Math.max(0, saved.integrity - dailyLoss(sim, region, stress) / hoursPerDay);
      }
      publishSegmentIntegrity(excavation);
    } else {
      const loss = dailyLoss(sim, excavation, excavation.stress) / hoursPerDay;
      excavation.integrity = Math.max(0, Math.min(100, (excavation.integrity ?? 100) - loss));
    }
    rockfallCandidates.push(excavation);
  }
  resolveStructure(sim);
  for (const excavation of rockfallCandidates) {
    if (!isActive(excavation) || excavation.integrity >= STRUCTURE.DANGER_INTEGRITY
      || excavation.structuralDangerTick === sim.tick) continue;
    if (isTunnel(excavation)) {
      for (const saved of excavation.structureSegments ?? []) {
        if (saved.integrity < STRUCTURE.DANGER_INTEGRITY && saved.structuralDangerTick !== sim.tick) {
          rockfallInjuries(sim, segmentRegion(sim, excavation, saved));
        }
      }
    } else rockfallInjuries(sim, excavation);
  }
}

export function reevaluateAll(sim) {
  const revision = structuralRevision(sim);
  for (const excavation of sim.excavations ?? []) {
    if (isActive(excavation)) {
      syncSegmentIntegrity(excavation);
      excavation.stress = cachedStructureEvaluation(sim, excavation, revision, evaluateExcavation);
      syncSegmentIntegrity(excavation);
    }
  }
}

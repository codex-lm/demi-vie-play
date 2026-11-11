import { CELL, EXCAVATION, STRUCTURE, WORLD } from '../data/balance.js';
import { MATERIAL, materialAt } from '../data/materials.js';

// Fifth gallery pass: one rule the player can predict.
//
// 1. A gallery, a shaft or a quarry never lengthens the ceiling of a room. It
//    is pierced through the wall; the top of the wall stays a lintel that
//    carries the ceiling. It can only thin the wall it crosses (see
//    OPENING_LOAD), and it keeps its own roof (tunnel sections, the quarry's
//    own cells).
// 2. Two cavities merge their ceilings only when the wall between them has
//    gone over the whole height they share and they have the same ceiling
//    row. Between two halls (rooms or quarries, finished, drawn with the same
//    top row, whatever their heights): they touch, or no rock at all is left
//    between them from that ceiling row down to the floor of the shorter one
//    (a broken wall), with rock above the gap. Between a hall and a natural
//    void (a cave): the hall's side opens on the void over its whole height,
//    with the void's roof at its ceiling row. A row of rock still standing in
//    that height is a wall. A quarry dug flush against a room, from the same
//    ceiling row, leaves no lintel: it is a cavity of the room, not a hole in
//    a wall (five quarries side by side are one cavity, and so are a room
//    and a quarry cut against it, or a room cancelled into a quarry). Any
//    excavation (room, quarry, gallery or shaft) cut through the whole gap
//    between two halls over their ceiling row leaves no top of the wall: the
//    wall is removed, they are one cavity on the rows the halls share, and
//    the wall only keeps the reading it had, where that reads more than the
//    merged ceiling (see bridgeOf). Dug before the newer hall (an access
//    shaft, then a room on each side), it leaves no wall at all once no rock
//    stands in the gap: none ever stood between them (until then, it reads
//    as the junction dug last). Rubble back in the gap is no wall on its
//    own. A gallery lower than that row keeps the top of the wall: rule 1.
//    A taller hall crossed by this lower cavity keeps its own ceiling while
//    intact rock still stands above that row in a gap to either face. The
//    lower cavity stays joined; only the taller hall's extra roof is omitted.
//    Directly touching both faces leaves no such wall (a raised quarry still
//    reads the merged span). Removing the last upper rock can only add a roof.
// 3. A room drawn in a natural void holds the cells of its rectangle; for the
//    others those cells stay the void they were (see claimVoid), except for a
//    run that has joined that room: there they are the room.

const cellCache = new WeakMap();

// A wall crossed by openings over a share of its height carries more: its
// load grows by half of that share (a 2 m gallery through a 4 m wall weighs
// like a door, x1.25; an opening over the whole height, x1.5).
export const OPENING_LOAD = 0.5;

function isHall(excavation) {
  return excavation.kind === 'room' || excavation.kind === 'quarry';
}

function active(excavation) {
  return excavation.state !== 'collapsed';
}

// A room still being dug has no ceiling of its own yet: it merges with
// nothing until it is finished, so it never flashes red on half a merge.
function finished(excavation) {
  return excavation.state !== 'planned' && excavation.state !== 'digging';
}

// Only called during structural evaluation. Retain the real shape, including
// adopted cave cells outside the original drawing and holes left by a collapse.
// The ceiling is per column: the highest dug cell of the hall in each column.
function geometry(sim, excavation) {
  const cached = cellCache.get(excavation);
  const key = [sim.world.revision, excavation.state, excavation.x, excavation.y,
    excavation.w, excavation.h, excavation.dugCells?.length ?? 0];
  if (cached && cached.world === sim.world && cached.dug === excavation.dugCells
    && cached.key.every((value, index) => value === key[index])) return cached;
  const cells = new Set();
  const rows = new Map();
  const tops = new Map();
  const add = (index) => {
    cells.add(index);
    const { x, y } = sim.world.coords(index);
    if (!rows.has(y)) rows.set(y, new Set());
    rows.get(y).add(x);
    if (y < (tops.get(x) ?? Infinity)) tops.set(x, y);
  };
  if (excavation.dugCells?.length) {
    for (const index of excavation.dugCells) {
      if (sim.world.states[index] === CELL.EMPTY) add(index);
    }
  } else if (excavation.state !== 'planned' && excavation.state !== 'digging') {
    // A prospect is a dug rectangle without cells; a real fully blocked tunnel
    // still has its cells array and must not become a phantom opening.
    if (!(excavation.cells?.length)) {
      for (let y = excavation.y; y < excavation.y + excavation.h; y += 1) {
        for (let x = excavation.x; x < excavation.x + excavation.w; x += 1) {
          if (sim.world.inBounds(x, y)) add(sim.world.index(x, y));
        }
      }
    }
  }
  const result = { key, world: sim.world, dug: excavation.dugCells, cells, rows, tops };
  cellCache.set(excavation, result);
  return result;
}

// Read these shapes again from the cells, and the links across removed
// walls read from them (see cavityLinks): an aperçu opened cells they list
// without a world revision (rubble back in them, see withProspectDug in
// structure.js). A link that can read an upper wall also depends on cells
// outside those shapes, even if that wall is temporarily empty in a preview.
// Flat cavities have no such dependency and keep their cached links.
export function forgetShapes(sim, excavations) {
  if (excavations.length === 0 && !linkCache.get(sim)?.some(({ value }) => value.readsUpperWalls)) return;
  for (const excavation of excavations) cellCache.delete(excavation);
  linkCache.delete(sim);
}

function intact(sim, x, y) {
  if (!sim.world.inBounds(x, y)) return false;
  const index = sim.world.index(x, y);
  return sim.world.states[index] === CELL.SOLID
    && sim.world.materials[index] !== MATERIAL.RUBBLE && sim.world.materials[index] !== MATERIAL.AIR;
}

function doorAt(sim, x, y) {
  return (sim.doors ?? []).some((door) => door.x === x
    && y >= door.y && y < door.y + EXCAVATION.DOOR_HEIGHT);
}

function supportX(support) {
  return typeof support === 'number' ? support : support?.x;
}

// Drawn over this row (a ceiling row of two halls, see bridgeOf).
function overRow(excavation, row) {
  return excavation.y <= row && row < excavation.y + excavation.h;
}

// The excavation drawn over `row` at column x: the oldest, so that a later
// drawing over it never takes its place in a wall.
function memberAt(list, x, row) {
  let found = null;
  for (const other of list) {
    if (other.x <= x && x < other.x + other.w && overRow(other, row) && (!found || other.id < found.id)) found = other;
  }
  return found;
}

// Rule 2 across a wall: the wall between two halls with the same ceiling
// row is removed when excavations drawn over that row (rooms, quarries,
// galleries or shafts, finished or not) fill its gap from one face to the
// other: no top of the wall is left to carry the ceiling. Returns them in
// order, or null. A gallery drawn lower keeps the top of the wall (rule 1).
function bridgeOf(left, right, list) {
  const row = left.y;
  const start = left.x + left.w;
  if (right.y !== row || start >= right.x) return null;
  const members = [];
  for (let x = start; x < right.x;) {
    const next = memberAt(list, x, row);
    if (!next) return null;
    members.push(next);
    x = next.x + next.w;
  }
  return members;
}

// The cavities a ceiling run joins across removed walls (rule 2): a run
// leaves a finished hall along a row that is its ceiling at its edge, through
// excavations drawn over that row and open along it (finished halls; a
// gallery or a shaft as soon as its cells there are dug; rubble back in the
// gap is rock again: the cavities stay apart until it is cleared), and
// reaches a finished hall whose ceiling is that same row where it enters it.
// Each step of that chain is linked on the rows the two halls share. The
// excavations of the chain are part of that cavity: a gallery or a shaft
// there reads the merged ceiling at the halls' ceiling row, and so does a
// hall drawn higher than them, besides its own higher roof (`roofs`, with
// their halls in `faces`), unless an upper wall still carries its own roof
// (see upperWallRegions). A cell a hall took outside its rectangle (a cave
// pocket) is that hall, wherever it was drawn, and one of the two halls at
// least has that row as its drawn ceiling row: a cave in steps reads the
// same whichever step was drawn, and two pockets under the rock left at the
// top of the wall (a lintel) stay apart. Entering a hall above its ceiling
// (a step) is not a link: rule 2 needs the same ceiling row. Kept while the
// drawn rectangles, the states and the world do not change.
const linkCache = new WeakMap();
function cavityLinks(sim, list) {
  const sorted = [...list].sort((a, b) => a.id - b.id);
  const key = `${sim.world.revision}|` + sorted.map((other) => `${other.id},${other.kind},${finished(other) ? 1 : 0},${other.x},${other.y},${other.w},${other.h}`).join(';');
  const cached = linkCache.get(sim) ?? [];
  const hit = cached.find((entry) => entry.key === key);
  if (hit) return hit.value;
  const links = new Map();
  const roofs = new Map();
  const faces = new Map();
  const upperWalls = new Map();
  let readsUpperWalls = false;
  const byId = new Map(sorted.map((other) => [other.id, other]));
  const link = (a, b, rows) => {
    for (const [from, to] of [[a, b], [b, a]]) {
      const name = `${from.id}:${to.id}`;
      if (!links.has(name)) links.set(name, []);
      links.get(name).push(rows);
    }
  };
  const has = (excavation, x, y) => sim.world.inBounds(x, y) && geometry(sim, excavation).cells.has(sim.world.index(x, y));
  // The hall's ceiling is this row at column x.
  const ceilingAt = (hall, x, row) => has(hall, x, row) && !has(hall, x, row - 1);
  const bottom = (hall) => Math.max(hall.y + hall.h, ...[...geometry(sim, hall).rows.keys()].map((y) => y + 1));
  // What the run meets at column x: the excavation drawn over the row there,
  // or the hall that took that cell outside its rectangle.
  const at = (x, row) => {
    const drawn = memberAt(sorted, x, row);
    if (drawn) return drawn;
    if (!sim.world.inBounds(x, row)) return null;
    const owner = byId.get(sim.world.cellExcavation[sim.world.index(x, row)]);
    return owner && isHall(owner) && has(owner, x, row) ? owner : null;
  };
  // Physical rock, not cutRock: the trace still loads ordinary walls, but
  // cannot carry a high ceiling once this upper wall has really gone. The
  // drawn rectangles keep the same test throughout a dig and an ownership
  // change. For a fixed pair, digging can only remove this protection.
  const upperWall = (hall, face, row) => {
    if (!isHall(hall) || hall.y >= row) return null;
    const x0 = hall.x < face.x ? hall.x + hall.w : face.x + face.w;
    const x1 = hall.x < face.x ? face.x : hall.x;
    if (x0 >= x1) return null;
    // Mark the dependency even when no rock remains: restoring the terrain
    // after an in-place prospect must invalidate this reading too.
    readsUpperWalls = true;
    for (let y = hall.y; y < row; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (intact(sim, x, y)) return { x: x0, y: hall.y, w: x1 - x0, h: row - hall.y };
      }
    }
    return null;
  };
  for (const left of sorted) {
    if (!isHall(left) || !finished(left)) continue;
    for (const [row, columns] of geometry(sim, left).rows) {
      const edge = Math.max(...columns);
      if (!ceilingAt(left, edge, row)) continue;
      const chain = [];
      for (let x = edge + 1; ;) {
        const next = at(x, row);
        if (!next || next === left || (isHall(next) && !finished(next))) break;
        const entered = next !== chain[chain.length - 1]?.member;
        const face = entered && isHall(next) && ceilingAt(next, x, row);
        const drawn = next.x <= x && x < next.x + next.w;
        if (!face && !has(next, x, row)) break;
        if (face && chain.length > 0 && (row === left.y || row === next.y)) {
          const rows = [row, Math.min(bottom(left), bottom(next))];
          let previous = left;
          for (const { member, wall } of chain) {
            link(previous, member, rows);
            previous = member;
            if (wall) {
              const upper = [upperWall(member, left, row), upperWall(member, next, row)].filter(Boolean);
              if (upper.length > 0) {
                if (!upperWalls.has(member.id)) upperWalls.set(member.id, []);
                upperWalls.get(member.id).push(...upper);
              } else {
                if (!roofs.has(member.id)) roofs.set(member.id, new Set());
                roofs.get(member.id).add(row);
              }
              if (!faces.has(member.id)) faces.set(member.id, new Set());
              faces.get(member.id).add(left.id).add(next.id);
            }
          }
          link(previous, next, rows);
        }
        // A member that is not a face stands where the wall was: a tunnel,
        // or a hall entered above its ceiling (drawn higher).
        if (entered) chain.push({ member: next, wall: !face });
        // A drawn member is crossed whole, open along the row; a cell taken
        // outside a rectangle, one column at a time.
        if (!face && drawn) {
          let column = x + 1;
          while (column < next.x + next.w && has(next, column, row)) column += 1;
          if (column < next.x + next.w) break;
          x = column;
        } else x += 1;
      }
    }
  }
  const value = { links, roofs, faces, upperWalls, readsUpperWalls };
  linkCache.set(sim, [{ key, value }, ...cached].slice(0, 4));
  return value;
}

function usableSupport(support) {
  return typeof support === 'number' || (!support?.failed && support?.solidity !== 0);
}

// Cells an excavation took while they were already a natural void: see
// claimVoid in excavation.js.
const voidSets = new WeakMap();
function claimedVoids(excavation) {
  const list = excavation.claimedVoid;
  if (!list?.length) return null;
  const cached = voidSets.get(excavation);
  if (cached?.list === list && cached.length === list.length) return cached.set;
  const set = new Set(list);
  voidSets.set(excavation, { list, length: list.length, set });
  return set;
}

// Who holds each open cell, from the shapes of the live excavations (a hall
// before a tunnel when both list a cell, a shaft drawn through a room), then
// from the grid. Rebuilt only when one of the shapes changes.
const ownerIndexes = new WeakMap();
function ownerIndex(sim, records) {
  const cached = ownerIndexes.get(sim);
  if (cached && cached.world === sim.world && cached.records.length === records.length
    && cached.records.every((entry, position) => entry.other === records[position].other
      && entry.shape === records[position].shape)) return cached.owners;
  const owners = new Map();
  for (const entry of records) {
    for (const index of entry.shape.cells) {
      const current = owners.get(index);
      if (!current || (isHall(entry.other) && !isHall(current.other))) owners.set(index, entry);
    }
  }
  ownerIndexes.set(sim, { world: sim.world, records: records.map(({ other, shape }) => ({ other, shape })), owners });
  return owners;
}

function context(sim, excavation) {
  const live = (sim.excavations ?? []).filter((other) => active(other));
  const records = [excavation, ...live.filter((other) => other.id !== excavation.id)]
    .map((other) => ({ other, shape: geometry(sim, other),
      supports: [...new Set((other.supports ?? []).filter(usableSupport).map(supportX))] }));
  const byId = new Map(records.map((entry) => [entry.other.id, entry]));
  // The index is shared by every evaluation of the same state: it is built
  // from the live excavations in their own order.
  const owners = ownerIndex(sim, live.map((other) => (other.id === excavation.id
    ? records[0] : byId.get(other.id))));
  // The excavation that holds an open cell (an entry), or null.
  const ownerAt = (index) => {
    const entry = owners.get(index);
    if (entry) return entry;
    const id = sim.world.cellExcavation[index];
    // Cell owner -1 means unowned rock or void, never a preview excavation.
    return id === -1 ? null : byId.get(id) ?? null;
  };
  // A natural void as `viewer` sees it: an open cell that is not a door and
  // that no excavation holds, or that its holder took while it was a void.
  const voidFor = (viewer, x, y) => {
    if (!sim.world.inBounds(x, y) || !sim.world.isEmpty(x, y) || doorAt(sim, x, y)) return false;
    const index = sim.world.index(x, y);
    const entry = ownerAt(index);
    if (!entry) return true;
    return entry.other.id !== viewer?.id && Boolean(claimedVoids(entry.other)?.has(index));
  };
  // Rule 2, hall and natural void: the side of a finished room (or quarry)
  // opens on a void over every row of it, and the void's roof there is its
  // ceiling row (the cell above is not a void).
  const sides = new Map();
  const sideOpen = (room, direction) => {
    const key = `${room.id}:${direction}`;
    if (sides.has(key)) return sides.get(key);
    const column = direction > 0 ? room.x + room.w : room.x - 1;
    let open = isHall(room) && finished(room) && !voidFor(room, column, room.y - 1);
    for (let y = room.y; open && y < room.y + room.h; y += 1) open = voidFor(room, column, y);
    sides.set(key, open);
    return open;
  };
  // Rule 2, two halls across a gap (a broken wall): both finished, the same
  // ceiling row, and no rock at all in the gap from that row down to the
  // floor of the shorter one, with rock above the gap on both sides (its
  // roof is their ceiling row).
  const joins = new Map();
  const gapJoin = (a, b) => {
    if (!isHall(a) || !isHall(b) || !finished(a) || !finished(b) || a.y !== b.y) return false;
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    const start = left.x + left.w;
    if (start >= right.x) return false;
    const key = `${left.id}:${right.id}`;
    if (joins.has(key)) return joins.get(key);
    const bottom = Math.min(left.y + left.h, right.y + right.h);
    let open = !voidFor(null, start, a.y - 1) && !voidFor(null, right.x - 1, a.y - 1);
    for (let y = a.y; open && y < bottom; y += 1) {
      for (let x = start; open && x < right.x; x += 1) open = voidFor(null, x, y);
    }
    joins.set(key, open);
    return open;
  };
  // The hall a gap of void leads to from this side of `room`, along its
  // ceiling row, when the two join across it (gapJoin); otherwise null.
  const partners = new Map();
  const partner = (room, direction) => {
    const key = `${room.id}:${direction}`;
    if (partners.has(key)) return partners.get(key);
    let found = null;
    for (let x = direction > 0 ? room.x + room.w : room.x - 1; ; x += direction) {
      if (!sim.world.inBounds(x, room.y) || !sim.world.isEmpty(x, room.y) || doorAt(sim, x, room.y)) break;
      const entry = ownerAt(sim.world.index(x, room.y));
      if (entry && isHall(entry.other) && entry.other.id !== room.id) {
        const other = entry.other;
        if (x === (direction > 0 ? other.x : other.x + other.w - 1) && gapJoin(room, other)) found = other;
        break;
      }
      if (!voidFor(null, x, room.y)) break;
    }
    partners.set(key, found);
    return found;
  };
  // Rule 2 across a removed wall (see cavityLinks): `a` and `b` are one
  // cavity on row y.
  const bridges = cavityLinks(sim, records.map((entry) => entry.other));
  const linked = (a, b, y) => Boolean(bridges.links.get(`${a.id}:${b.id}`)?.some(([top, bottom]) => top <= y && y < bottom));
  return { records, byId, ownerAt, voidFor, sideOpen, gapJoin, partner, linked, roofs: bridges.roofs };
}

// Rule 2, two halls that touch (no rock left between them at all): both
// finished and drawn with the same top row (whatever their heights: the wall
// has gone over the whole height they share). A room and a quarry cut
// against it count: no lintel is left between them.
function hallsMerge(a, b) {
  return isHall(a) && isHall(b) && finished(a) && finished(b)
    && a.y === b.y && (b.x === a.x + a.w || a.x === b.x + b.w);
}

// A hall's roofs: the top of each column of its cells (a pocket it took
// above its roof, or a cave step, is a roof of its own), and the top row of
// its drawn rectangle. A pocket taken above that row never hides the ceiling
// the hall was drawn with: the span is read at each of these rows, and at
// the ceiling row of two halls whose wall it removes from higher up (`extra`,
// see cavityLinks).
function roofTest(sim, hall, shape, extra = null) {
  return (x, y) => {
    if (!shape.cells.has(sim.world.index(x, y))) return false;
    return y === hall.y || y === 0 || !shape.cells.has(sim.world.index(x, y - 1)) || Boolean(extra?.has(y));
  };
}

// The ceiling of a hall rests on its walls. Its span is read on every row
// where it has a roof (see roofTest; a taller column is a hole in the roof,
// never a support, and a run counts only if it carries one of these roofs).
// Along such a
// row the run goes through the hall's own cells and through the cavities
// merged with it (rule 2, including the excavations that removed a wall
// between two halls); anything else stops it: rock, a door, a prop, a
// gallery or a shaft pierced in a wall (rule 1), a hall or a void that does
// not merge. A gallery or a shaft (`region`: one of its sections) reads only
// the merged ceiling of the cavity it is part of, at the halls' ceiling row
// (see cavityLinks); its own roof is its tunnel section.
function rowSpans(sim, hall, region = null) {
  const target = geometry(sim, hall);
  const ctx = context(sim, hall);
  // Entering `cavity` (a hall) at x, from outside, moving in `direction`.
  const atEdge = (cavity, x, y, direction) => x === (direction > 0 ? cavity.x : cavity.x + cavity.w - 1)
    && y >= cavity.y && y < cavity.y + cavity.h;
  // Leaving `cavity` (a hall) at x, moving in `direction`.
  const leaving = (cavity, x, y, direction) => x === (direction > 0 ? cavity.x + cavity.w : cavity.x - 1)
    && y >= cavity.y && y < cavity.y + cavity.h;
  // Rule 2: from `inside` (a hall, or the void entered from the hall `from`)
  // into the hall `cavity`.
  const joins = (inside, from, cavity, direction) => (inside === 'void'
    ? ctx.sideOpen(cavity, -direction) || Boolean(from && ctx.gapJoin(from, cavity))
    : hallsMerge(inside, cavity));
  // Walk away from the start until the run meets something that stops it.
  // A cell a hall took while it was a natural void is that void, or that
  // hall when the run can join it: both readings are followed, and the run
  // reaches as far as the farther one (it never stops shorter than either).
  const expand = (start, direction, y) => {
    let best = start;
    const stack = [[start, hall, null]];
    const branched = new Set();
    while (stack.length > 0) {
      let [boundary, inside, from] = stack.pop();
      for (;;) {
        const x = boundary + direction;
        if (x < 0 || x >= sim.world.width || doorAt(sim, x, y)) break;
        const index = sim.world.index(x, y);
        if (target.cells.has(index)) {
          inside = hall;
          from = null;
          boundary = x;
          continue;
        }
        if (!sim.world.isEmpty(x, y)) break;
        const entry = ctx.ownerAt(index);
        const claimed = Boolean(entry && claimedVoids(entry.other)?.has(index));
        if (entry && !claimed) {
          const cavity = entry.other;
          if (cavity !== inside) {
            const across = inside !== 'void' && ctx.linked(inside, cavity, y);
            if (!across && (!isHall(cavity) || !atEdge(cavity, x, y, direction) || !joins(inside, from, cavity, direction))) break;
            inside = cavity;
            from = null;
          }
          boundary = x;
          continue;
        }
        // A natural void, or a cell an excavation took while it was one.
        const owner = claimed && isHall(entry.other) ? entry.other : null;
        if (owner && owner === inside) {
          boundary = x;
          continue;
        }
        const intoOwner = Boolean(owner) && atEdge(owner, x, y, direction) && joins(inside, from, owner, direction);
        const intoVoid = inside === 'void' || (leaving(inside, x, y, direction)
          && (ctx.sideOpen(inside, direction) || ctx.partner(inside, direction) !== null));
        if (intoOwner && intoVoid) {
          const key = `${x}:${owner.id}`;
          if (!branched.has(key)) {
            branched.add(key);
            stack.push([x, owner, null]);
          }
        }
        if (intoVoid) {
          if (inside !== 'void') from = inside;
          inside = 'void';
        } else if (intoOwner) {
          inside = owner;
          from = null;
        } else break;
        boundary = x;
      }
      if (direction > 0 ? boundary > best : boundary < best) best = boundary;
    }
    return best;
  };
  const extra = ctx.roofs.get(hall.id);
  const isRoof = isHall(hall) ? roofTest(sim, hall, target, extra)
    : (x, y) => Boolean(extra?.has(y)) && target.cells.has(sim.world.index(x, y))
      && x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h;
  let maximum = 0;
  for (const [y, rowColumns] of target.rows) {
    const startColumns = [...rowColumns].filter((x) => isRoof(x, y)).sort((a, b) => a - b);
    if (startColumns.length === 0) continue;
    const supports = new Set();
    for (const entry of ctx.records) {
      const columns = entry.shape.rows.get(y);
      if (!columns) continue;
      for (const x of entry.supports) if (columns.has(x)) supports.add(x);
    }
    let visitedUntil = -1;
    for (const x of startColumns) {
      if (x < visitedUntil) continue;
      const from = expand(x, -1, y);
      const to = expand(x, 1, y);
      visitedUntil = to + 1;
      // A prop carries the roof: a distant unsupported bay beyond it must
      // not load this hall as though the prop did not exist.
      let run = 0;
      let carriesTarget = false;
      for (let xx = from; xx <= to; xx += 1) {
        if (supports.has(xx)) {
          if (carriesTarget) maximum = Math.max(maximum, run);
          run = 0;
          carriesTarget = false;
        } else {
          run += 1;
          carriesTarget ||= rowColumns.has(xx) && isRoof(xx, y);
        }
      }
      if (carriesTarget) maximum = Math.max(maximum, run);
    }
  }
  return maximum;
}

// The rock an excavation cut where this cell is now open (or the rubble of
// its collapse, read as that rock: see analyzeWall). The record
// follows the cell, not its current owner: a gallery that heightens, extends
// or crosses another one takes over cells it never cut, and they still hold
// what the first one cut. Between the faces of a wall, the rock a gallery or
// a shaft cut always stays that wall's rock (rule 1), and so does the rock a
// hall dug later than both faces cut there (see analyzeWall, which reads the
// halls standing in a wall). A save without that record reads a tunnel's
// cell as open.
export function cutRock(sim, index, wall = null) {
  const excavations = sim.excavations ?? [];
  let owner = null;
  if (sim.world.states[index] === CELL.EMPTY) {
    const ownerId = sim.world.cellExcavation[index];
    if (ownerId === -1) return null;
    owner = excavations.find((other) => other.id === ownerId);
    if (!owner || !active(owner)) return null;
    if (wall && (owner.id === wall.left.id || owner.id === wall.right.id)) return null;
  } else if (sim.world.materials[index] !== MATERIAL.RUBBLE) return null;
  return traceAt(excavations, index, owner, keepRock);
}

// The first record of this cell that `keep` accepts: its owner's first, then
// any excavation's (the record follows the cell).
function traceAt(excavations, index, owner, keep) {
  const own = owner?.cutRock?.[index];
  if (own != null && keep(own)) return own;
  for (const other of excavations) {
    const material = other.cutRock?.[index];
    if (material != null && keep(material)) return material;
  }
  return null;
}

// Rubble a dig cleared at this open cell (read around a roof or a shaft, as
// the rubble was before: clearing it never makes them read stronger).
export function clearedRubble(sim, index) {
  if (sim.world.states[index] !== CELL.EMPTY || sim.world.cellExcavation[index] === -1) return false;
  return traceAt(sim.excavations ?? [], index, null, (material) => material === MATERIAL.RUBBLE) != null;
}

const keepRock = (material) => material !== MATERIAL.RUBBLE && material !== MATERIAL.AIR;

// Rubble in a wall, or an open cell a dig cleared of rubble there (its
// holder recorded rubble; for a holder with no record of its own, any
// record): the rock cut there before the collapse.
function rubbleAt(sim, index, holder) {
  if (sim.world.states[index] !== CELL.EMPTY) return true;
  const own = holder?.cutRock?.[index];
  return own != null ? own === MATERIAL.RUBBLE : clearedRubble(sim, index);
}

// The wall between two halls is read on the rows both faces share. Another
// hall standing between them on a row takes that row out of this wall (only
// immediate neighbours load a wall): a hall dug before one of the faces, or
// a later one with no record of the rock it cut there (an old save, a
// scenario). Rule 1: a dig never makes a wall disappear. The rock a gallery,
// a shaft, or a hall dug later than both faces cut there stays the wall's
// rock (see cutRock), and the wall carries more by the share of its height
// that digs opened (OPENING_LOAD, see openedShare). Only rock that was never
// there (a natural void, a broken wall) makes a row thinner. A wall with no
// rock left at all, standing or cut, is gone; the ceilings then merge only
// by rule 2 (see rowSpans). The weakest material includes the cut rock.
//
// Rule 2 across a wall: a wall is bridged when excavations drawn over the
// faces' common ceiling row fill its gap from one face to the other (see
// bridgeOf: a quarry, a room, a gallery or a shaft cut through the whole wall
// at its top, or a room cancelled into a quarry there). They are not holes
// pierced in the wall (rule 1): finished, they merge the two ceilings through
// them (rowSpans), and the wall is gone. The rock cut by the newest of them,
// the one that completes the removal, keeps the wall as it was, with no
// opening load: while it is dug, nothing changes (no red flash on half a
// removal), and once the ceilings merge, the wall only keeps the reading it
// had before (see hallGeometry and evaluateRegion: it counts only where it
// reads more than the merged ceiling, a door wall, a weak rock, or a wall
// already opened; it breaks as that wall would have, see breakable). The
// rock the older ones cut was already an opening of this wall, and stays
// one: a removal never lowers a reading. A bridge drawn before the newest
// face is the wall as it was while rock stands in the gap, and no wall at
// all once none does (see `early`).
//
// Also returned: `counted`, the rows read (a rupture clears only those);
// `through`, how many of them a later hall crosses (when it crosses all of
// them, the wall's rock is the walls of that hall, see breakable); `cut` and
// `voids`, the parts of `opened` cut by digs and left open by a natural void;
// `standing`, whether any rock still stands in it; `bridged`, whether
// finished excavations fill its gap over the faces' ceiling row (see
// bridgeOf), and `bridge`, the ids of those excavations. `extra`: an
// excavation read as standing where it is drawn, even when it is not in the
// list yet (a prospect).
export function analyzeWall(sim, a, b, extra = null) {
  let left = a;
  let right = b;
  if (left.x > right.x) [left, right] = [right, left];
  const top = Math.max(left.y, right.y);
  const bottom = Math.min(left.y + left.h, right.y + right.h);
  const start = left.x + left.w;
  if (bottom <= top || start > right.x) return null;
  const leftCells = geometry(sim, left).cells;
  const rightCells = geometry(sim, right).cells;
  const newest = Math.max(left.id, right.id);
  const excavations = sim.excavations ?? [];
  const halls = new Map();
  const live = new Map();
  const others = [];
  for (const other of excavations) {
    if (active(other)) live.set(other.id, other);
    if (other.id === left.id || other.id === right.id || !active(other)) continue;
    if (extra?.id === other.id) continue;
    others.push(other);
    if (isHall(other)) halls.set(other.id, other);
  }
  if (extra && extra.id !== left.id && extra.id !== right.id) {
    others.push(extra);
    if (isHall(extra)) halls.set(extra.id, extra);
  }
  // Read only when needed: most walls between distant halls are blocked
  // before any cut cell is met.
  let members;
  let completing = null;
  const bridgeMembers = () => {
    if (members === undefined) {
      members = bridgeOf(left, right, others);
      completing = members?.reduce((last, member) => (member.id > last.id ? member : last)) ?? null;
    }
    return members;
  };
  // A bridge drawn before the newest face (`early`): whether its rock was cut
  // before that face or after it is not known, so all of it is the wall as it
  // was (and its halls are not neighbours standing in the wall), until no rock
  // stands at all (see below).
  const early = () => Boolean(bridgeMembers()) && completing.id < newest;
  const keeps = (member, index) => {
    const own = member.cutRock?.[index];
    return own != null && keepRock(own);
  };
  const bridgeCut = (index) => Boolean(bridgeMembers())
    && (early() ? members.some((member) => keeps(member, index)) : keeps(completing, index));
  // An early bridge that has cut every rock between the faces, its halls
  // finished (an access shaft, a corridor the room was dug against): no wall
  // is left, its excavations are the faces' neighbours, as an older hall is,
  // and rule 2 merges them. While rock stands there (a foot under a gallery
  // at the ceiling, a junction still being dug), the wall is read with the
  // bridge's rock as the wall as it was: the same reading as the junction
  // dug last.
  const shared = (y) => leftCells.has(sim.world.index(start - 1, y)) && rightCells.has(sim.world.index(right.x, y));
  const rockStands = () => {
    for (let y = top; y < bottom; y += 1) {
      for (let x = start; x < right.x && shared(y); x += 1) if (intact(sim, x, y)) return true;
    }
    return false;
  };
  if (early() && members.every((member) => !isHall(member) || finished(member)) && !rockStands()) return null;
  const faces = { left, right };
  let width = Infinity;
  let rock = false;
  let standing = false;
  let weakest = null;
  let rows = 0;
  let opened = 0;
  let cut = 0;
  let voids = 0;
  let through = 0;
  let door = false;
  const counted = [];
  const hallAt = (index) => (sim.world.states[index] === CELL.EMPTY ? halls.get(sim.world.cellExcavation[index]) : null);
  for (let y = top; y < bottom; y += 1) {
    if (!shared(y)) continue;
    // A hall in the wall older than a face is a neighbour of its own, except
    // in an early bridge (read by the rock it cut, as a tunnel is). Looked
    // for first: most rows between distant halls stop here.
    let blocked = false;
    for (let x = start; x < right.x && !blocked; x += 1) {
      const other = hallAt(sim.world.index(x, y));
      blocked = Boolean(other) && other.id < newest && !(early() && members.includes(other));
    }
    if (blocked) continue;
    let crossed = false;
    let rowRock = 0;
    let rowCut = 0;
    let rowKept = 0;
    let rowLive = false;
    let rowDoor = false;
    let rowWeakest = null;
    for (let x = start; x < right.x && !blocked; x += 1) {
      rowDoor ||= doorAt(sim, x, y);
      const index = sim.world.index(x, y);
      let materialId = null;
      if (intact(sim, x, y)) {
        materialId = sim.world.materials[index];
        rowRock += 1;
      } else {
        const other = hallAt(index);
        if (other) {
          // Any other hall in the wall is a hole in it only where its rock
          // is recorded (or where it took a natural void, which stays one).
          crossed = true;
          materialId = traceAt(excavations, index, other, keepRock);
          if (materialId == null && !claimedVoids(other)?.has(index)) blocked = true;
        } else materialId = cutRock(sim, index, faces);
        // The rock cut by the excavation that completes the removal keeps
        // the wall as it was (the record follows the cell, whoever holds it
        // now). Rubble, or a cell a dig cleared of rubble, is the rock cut
        // there before the collapse, as it was (a collapse never opens a
        // wall more), but it never holds a wall up on its own.
        if (materialId != null) {
          const rubble = rubbleAt(sim, index, other ?? live.get(sim.world.cellExcavation[index]));
          if (rubble || bridgeCut(index)) rowKept += 1;
          else rowCut += 1;
          rowLive ||= !rubble;
        }
      }
      if (materialId == null) continue;
      const material = materialAt(materialId);
      if (!rowWeakest || material.span < rowWeakest.span) rowWeakest = material;
    }
    if (blocked) continue;
    rows += 1;
    counted.push(y);
    if (crossed) through += 1;
    if (rowWeakest && (!weakest || rowWeakest.span < weakest.span)) weakest = rowWeakest;
    // The row is as wide as the rock it had: standing, or cut by a dig
    // (only a natural void makes it thinner). The cut part of the row is
    // the share of it that is opened (not the part cut by the excavation
    // that completes a removal: that is the wall as it was); a row with no
    // rock at all is open.
    const rowWidth = rowRock + rowCut + rowKept;
    door ||= rowDoor;
    standing ||= rowRock > 0;
    rock ||= rowRock > 0 || rowLive;
    if (rowWidth > 0) width = Math.min(width, rowWidth);
    if (!rowDoor) {
      opened += rowWidth > 0 ? rowCut / rowWidth : 1;
      if (rowWidth > 0) cut += rowCut / rowWidth;
      else voids += 1;
    }
  }
  if (!rows) return null;
  // No rock left (rubble alone is not a wall: the cavities stay apart until
  // it is cleared, see cavityLinks, and no wall loads them).
  const fused = !rock;
  if (fused || !Number.isFinite(width)) width = 0;
  const bridge = bridgeMembers() ? new Set(members.map((member) => member.id)) : null;
  const bridged = Boolean(members) && members.every(finished);
  return { left, right, top, bottom, width, fused, opened, rows, height: bottom - top,
    material: (weakest ?? materialAt(MATERIAL.AIR)).key, door, counted, through, cut, voids, standing, bridged, bridge };
}

// A wall can break only where its two faces are real neighbours: when a
// later hall crosses every row of it, its rock is the walls of that hall,
// which break on their own; this wall only keeps loading its faces (rule 1).
// A bridged wall (rule 2) that keeps its old reading breaks as the wall it
// was would have, even through a quarry that fills its gap: then it is gone
// (its rock becomes the void a broken wall leaves), and the faces read the
// merged ceiling. Removing a wall never makes its faces hold less long than
// the wall left standing.
export function breakable(wall) {
  return Boolean(wall) && !wall.fused && (wall.bridged || wall.through < wall.rows);
}

// The share of the wall's height opened by digs, row by row (a gallery that
// crosses 2 rows of a 4 m wall opens half of it; a niche that goes half way
// into those 2 rows, a quarter).
export function openedShare(wall) {
  const height = wall.height ?? (wall.bottom - wall.top);
  return height > 0 ? Math.min(wall.opened ?? 0, height) / height : 0;
}

export function wallMetrics(sim, wall) {
  const overlap = wall.bottom - wall.top;
  const depth = Math.max(0, wall.left.y - WORLD.SURFACE_Y, wall.right.y - WORLD.SURFACE_Y);
  const strength = materialAt(MATERIAL[wall.material.toUpperCase()])?.span ?? 0;
  const bearingSpan = (room, side) => {
    let span = room.w;
    for (const support of room.supports ?? []) {
      const x = supportX(support);
      if (!usableSupport(support) || !Number.isInteger(x) || x < room.x || x >= room.x + room.w) continue;
      span = Math.min(span, side === 'right' ? room.x + room.w - x - 1 : x - room.x);
    }
    return span;
  };
  // A valid prop carries the ceiling beyond it. Each wall face carries half
  // the remaining bay; without props this is exactly half the room width.
  const tributarySpan = (bearingSpan(wall.left, 'right') + bearingSpan(wall.right, 'left')) / 2;
  const opening = 1 + OPENING_LOAD * openedShare(wall);
  const demand = wall.fused ? 0 : STRUCTURE.WALL_LOAD_FACTOR * tributarySpan
    * (1 + depth / STRUCTURE.DEPTH_SCALE) * STRUCTURE.WALL_MATERIAL_FACTOR / strength
    * (wall.door ? STRUCTURE.DOOR_WALL_MULTIPLIER : 1) * opening;
  const ratio = wall.fused ? 0 : demand / wall.width;
  // The displayed requirement is buildable and actually green; rounding never
  // participates in stress, so one metre of strong rock can have ample margin.
  const required = Math.ceil(demand / STRUCTURE.STABLE_RATIO);
  return { overlap, depth, required, ratio, opening };
}

export function engineeredShelterWall(relation) {
  return Boolean(relation.left.initial && relation.right.initial
    && String(relation.left.label).startsWith('shelter') && String(relation.right.label).startsWith('shelter'));
}

const round = (value) => Math.round(value * 1000) / 1000;

function wallEntry(sim, wall, ids) {
  const metrics = wallMetrics(sim, wall);
  return { ...ids, width: wall.width, overlap: metrics.overlap,
    depth: metrics.depth, material: wall.material, required: metrics.required,
    ratio: metrics.ratio, door: wall.door, fused: false,
    ...(wall.bridged ? { bridged: true } : {}),
    ...(metrics.opening > 1 ? { opened: round(wall.opened), height: wall.height, cut: round(wall.cut),
      voids: wall.voids, ...(wall.standing ? {} : { standing: false }) } : {}) };
}

export function hallGeometry(sim, excavation) {
  const walls = [];
  const others = (sim.excavations ?? []).filter((other) => other.id !== excavation.id && active(other) && isHall(other));
  for (const other of others) {
    const wall = analyzeWall(sim, excavation, other);
    if (!wall || wall.fused || engineeredShelterWall(wall)) continue;
    walls.push(wallEntry(sim, wall, { otherId: other.id }));
  }
  if (finished(excavation)) walls.push(...carriedWalls(sim, excavation, others));
  return { span: rowSpans(sim, excavation), walls };
}

// A wall this excavation removes (rule 2) belongs to the merged cavity: it
// carries it as the two faces do (`acrossId`: the far face), so the whole
// cavity reads it where it still reads more than the merged ceiling. The
// faces have the ceiling row the excavation is drawn over (its top row, or a
// lower one when it is drawn higher than them; for a section of a tunnel,
// only a row of that section). Only when every hall between the two faces
// is newer than both: an older one stands between them on its rows (see
// analyzeWall), so what is left of that wall is a foot under it, read by its
// two faces only.
function carriedWalls(sim, excavation, halls, region = excavation) {
  const walls = [];
  const live = (sim.excavations ?? []).filter((other) => other.id !== excavation.id && active(other));
  const rows = new Set(halls.filter((other) => overRow(region, other.y)).map((other) => other.y));
  for (const row of rows) {
    const chain = (direction) => {
      const found = [];
      for (let x = direction < 0 ? excavation.x - 1 : excavation.x + excavation.w; ;) {
        const next = memberAt(live, x, row);
        if (!next) return found;
        found.push(next);
        x = direction < 0 ? next.x - 1 : next.x + next.w;
      }
    };
    const face = (other) => isHall(other) && other.y === row;
    const rights = chain(1);
    // The oldest hall between the left face and the right one, this one
    // included (a tunnel is never a neighbour standing in a wall).
    let leftBetween = isHall(excavation) ? excavation.id : Infinity;
    for (const left of chain(-1)) {
      let between = leftBetween;
      for (const right of face(left) ? rights : []) {
        if (between < left.id) break;
        if (face(right) && between > right.id) {
          const wall = analyzeWall(sim, left, right, excavation);
          if (wall?.bridged && wall.bridge.has(excavation.id) && !wall.fused && !engineeredShelterWall(wall)) {
            walls.push(wallEntry(sim, wall, { otherId: left.id, acrossId: right.id }));
          }
        }
        if (isHall(right)) between = Math.min(between, right.id);
      }
      if (isHall(left)) leftBetween = Math.min(leftBetween, left.id);
    }
  }
  return walls;
}

// The halls whose merged ceiling an excavation drawn over their ceiling row
// is part of (rule 2, see cavityLinks), or null.
export function bridgeFaces(sim, excavation) {
  const live = (sim.excavations ?? []).filter((other) => active(other));
  const list = live.some((other) => other.id === excavation.id) ? live : [...live, excavation];
  return cavityLinks(sim, list).faces.get(excavation.id) ?? null;
}

// Upper wall rectangles that keep a taller hall's own roof separate from
// a lower merged ceiling. An order in any of them must re-evaluate the hall,
// even far from its edge and above the ordinary wall's shared face rows.
export function upperWallRegions(sim) {
  const live = (sim.excavations ?? []).filter((other) => active(other));
  return cavityLinks(sim, live).upperWalls;
}

// A section of a gallery or a shaft that removed a wall between two halls
// (rule 2): the merged ceiling it is part of, and the wall it carries. A
// tunnel pierced in a wall, or anywhere else, reads nothing here: it keeps
// its own roof (rule 1, see tunnelSpan in structure.js).
export function tunnelGeometry(sim, tunnel, region = tunnel) {
  const live = (sim.excavations ?? []).filter((other) => active(other));
  const list = live.some((other) => other.id === tunnel.id)
    ? live.map((other) => (other.id === tunnel.id ? tunnel : other)) : [...live, tunnel];
  const rows = cavityLinks(sim, list).roofs.get(tunnel.id);
  if (!rows || !finished(tunnel) || ![...rows].some((row) => overRow(region, row))) return { span: 0, walls: [] };
  const halls = live.filter((other) => other.id !== tunnel.id && isHall(other));
  return { span: rowSpans(sim, tunnel, region), walls: carriedWalls(sim, tunnel, halls, region) };
}

// The rows on which a hall's span is read (see rowSpans).
export function ceilingRows(sim, hall) {
  const shape = geometry(sim, hall);
  if (!shape.ceilingRows) {
    const isRoof = roofTest(sim, hall, shape);
    shape.ceilingRows = new Set([...shape.rows].filter(([y, columns]) => [...columns].some((x) => isRoof(x, y)))
      .map(([y]) => y));
  }
  const live = (sim.excavations ?? []).filter((other) => active(other));
  const extra = cavityLinks(sim, live.some((other) => other.id === hall.id) ? live : [...live, hall]).roofs.get(hall.id);
  const more = [...(extra ?? [])].filter((y) => shape.rows.has(y) && !shape.ceilingRows.has(y));
  return more.length > 0 ? new Set([...shape.ceilingRows, ...more]) : shape.ceilingRows;
}

import { AIR, CELL, EXCAVATION, HEAT, STRUCTURE, WORLD } from '../data/balance.js';
import { DEPOSIT_RESOURCES, DEPOSITS, MATERIAL, materialAt } from '../data/materials.js';
import { SHAPES } from '../data/balance.js';
import { excavationReachable } from './nav.js';
import { recordDigCell } from './poi.js';
import { recordJournalNarrative } from './journalNarrative.js';

export function excavationCells(excavation) {
  const cells = [];
  const center = excavation.x + (excavation.w - 1) / 2;
  for (let y = excavation.y; y < excavation.y + excavation.h; y += 1) {
    const row = [];
    for (let x = excavation.x; x < excavation.x + excavation.w; x += 1) row.push({ x, y });
    row.sort((a, b) => Math.abs(a.x - center) - Math.abs(b.x - center) || a.x - b.x);
    cells.push(...row);
  }
  return cells;
}

export function createExcavation(id, order) {
  return {
    id,
    kind: order.kind,
    x: order.x | 0,
    y: order.y | 0,
    w: order.w | 0,
    h: order.h | 0,
    shape: order.shape ?? 'flat',
    lining: order.lining && order.lining !== 'none' ? 'none' : (order.lining ?? 'none'),
    targetLining: order.lining ?? 'none',
    coating: 'none',
    state: 'planned',
    cells: [],
    dugCells: [],
    work: {},
    workRequired: {},
    supports: [],
    doors: [],
    integrity: STRUCTURE.INITIAL_INTEGRITY,
    stress: null,
    loose: {},
    yields: {},
    label: order.label ?? null,
    initial: Boolean(order.initial),
    roomType: order.roomType ?? null,
    temperature: order.temperature ?? HEAT.INITIAL_ROOM,
    o2: order.o2 ?? AIR.INITIAL_O2,
    co2: order.co2 ?? AIR.INITIAL_CO2,
    methane: 0,
    radon: 0,
    powered: false,
    powerShed: false,
    powerPriority: null,
    floodRatio: 0,
    disabled: false,
    production: {},
    heatExchangerTargetId: null,
  };
}

// Une galerie automatique deja degagee peut etre integree a la reconstruction.
// Un chantier partiel ou un secours encore necessaire conserve sa reservation.
export function absorbableRescueTunnels(sim, order) {
  if (!['room', 'quarry'].includes(order.kind)) return [];
  return sim.excavations.filter((gallery) => {
    if (!['gallery', 'shaft'].includes(gallery.kind) || gallery.state !== 'dug' || gallery.rescueSourceId == null) return false;
    // Removing a rescue shaft also removes its ladder: wait for its users to leave.
    if (gallery.kind === 'shaft' && sim.colonists.some((person) => {
      const x = Math.round(person.x);
      const y = Math.round(person.y);
      return person.health > 0 && !person.dead && x >= gallery.x && x < gallery.x + gallery.w
        && y >= gallery.y - 1 && y < gallery.y + gallery.h - 1;
    })) return false;
    const source = sim.excavation(gallery.rescueSourceId);
    if (!source || (gallery.kind === 'shaft' && source.kind === 'shaft') || (source.trappedColonistIds ?? []).some((id) => sim.colonists.some((person) =>
      person.id === id && person.health > 0 && person.alive !== false))) return false;
    return (gallery.cells ?? []).length > 0 && gallery.cells.every((index) => {
      const { x, y } = sim.world.coords(index);
      return x >= order.x && x < order.x + order.w && y >= order.y && y < order.y + order.h;
    });
  });
}


// A cell an excavation took while it was already a natural void (unowned and
// empty, such as a cave or a broken wall its drawing covers). For the
// structure it stays that void for every other excavation (see rowSpans). A
// cave found by digging (a point of interest) was rock until then: it becomes
// the excavation's own cells.
export function claimVoid(excavation, index) {
  const list = excavation.claimedVoid ?? [];
  if (list.includes(index)) return;
  list.push(index);
  list.sort((a, b) => a - b);
  excavation.claimedVoid = list;
}

function naturalVoid(sim, index) {
  return sim.world.states[index] === CELL.EMPTY && sim.world.cellExcavation[index] === -1;
}

export function validateExcavation(sim, order) {
  const { kind, x, y, w, h, shape = 'flat' } = order;
  if (!['room', 'gallery', 'shaft', 'quarry'].includes(kind)) return { ok: false, error: 'invalidPlacement' };
  if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1 || w > EXCAVATION.MAX_DIMENSION || h > EXCAVATION.MAX_DIMENSION) return { ok: false, error: 'invalidSize' };
  if (kind === 'room' && h < EXCAVATION.ROOM_MIN_H) return { ok: false, error: 'roomTooShort' };
  if (kind === 'room' && (w < EXCAVATION.ROOM_MIN_W || w > EXCAVATION.ROOM_MAX_W || h > EXCAVATION.ROOM_MAX_H)) return { ok: false, error: 'invalidSize' };
  if (kind === 'gallery' && (h < EXCAVATION.GALLERY_MIN_H || h > EXCAVATION.GALLERY_MAX_H)) return { ok: false, error: 'invalidSize' };
  if (kind === 'shaft' && (w < EXCAVATION.SHAFT_MIN_W || w > EXCAVATION.SHAFT_MAX_W)) return { ok: false, error: 'invalidSize' };
  if (!SHAPES[shape]) return { ok: false, error: 'invalidPlacement' };
  if (shape === 'round' && h < SHAPES.round.minHeightRatio * w) return { ok: false, error: 'roundTooFlat' };
  const absorbedIds = new Set(absorbableRescueTunnels(sim, order).map((gallery) => gallery.id));
  const reservedOwners = new Map();
  for (const excavation of sim.excavations) {
    if (excavation.id === order.excavationId || excavation.state === 'collapsed' || absorbedIds.has(excavation.id)) continue;
    for (const index of excavation.cells ?? []) reservedOwners.set(index, excavation);
  }
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (!sim.world.inBounds(xx, yy) || yy < WORLD.SURFACE_Y || yy + 1 >= WORLD.HEIGHT) return { ok: false, error: 'invalidPlacement' };
      if (!sim.world.isDiggable(xx, yy)) return { ok: false, error: 'bedrockBlocked' };
      const index = sim.world.index(xx, yy);
      const owner = sim.world.cellExcavation[index];
      const reserved = reservedOwners.get(index);
      const ownerKind = reserved?.kind ?? sim.excavation(owner)?.kind;
      const tunnelJunction = (kind === 'gallery' || kind === 'shaft')
        && (sim.world.isEmpty(xx, yy) || ownerKind === 'gallery' || ownerKind === 'shaft');
      const differentOwner = (owner >= 0 && owner !== order.excavationId && !absorbedIds.has(owner))
        || (reserved && reserved.id !== order.excavationId);
      if (differentOwner && !tunnelJunction) return { ok: false, error: 'overlap' };
    }
  }
  if (kind === 'gallery' && !order.rescue) {
    const trimmed = trimHallJunction(sim, order, absorbedIds);
    if (trimmed && !trimmed.ok) return trimmed;
    if (trimmed) return { ok: true, trimmed: trimmed.rect };
  }
  return { ok: true };
}

// Open cells of a live room or quarry, and the openings of its doors.
function hallOpening(sim, index, order, absorbedIds) {
  if (sim.world.states[index] !== CELL.EMPTY) return false;
  const owner = sim.world.cellExcavation[index];
  if (owner >= 0) {
    if (owner === order.excavationId || absorbedIds.has(owner)) return false;
    const room = sim.excavation(owner);
    return Boolean(room && room.state !== 'collapsed' && (room.kind === 'room' || room.kind === 'quarry'));
  }
  const { x, y } = sim.world.coords(index);
  return (sim.doors ?? []).some((door) => door.kind !== 'hatch' && door.x === x
    && y >= door.y && y < door.y + EXCAVATION.DOOR_HEIGHT);
}

// A gallery may run into a room: that is a junction (SPEC: free passage, no
// span fusion). It must not take the room's open cells over: the room would
// lose its floor cells and its heat rectangle, the shaft ladder hanging into
// it, and the gallery would claim a roof that is only the room's air (it then
// collapses at once). The order is trimmed by whole columns: a column holding
// any open cell of a room (or a door opening) at either end of the order is
// dropped with the rock above or below it, so a gallery drawn up to a room or
// to its door stops at the wall or door column, whatever its height. Only a
// gallery running through a room (such a column between kept columns) or
// lying entirely inside one is refused, with its own reason. A shaft keeps the
// historical junction: a vent shaft is dug from the surface straight through
// the shelter, and its own ladder serves the rooms it crosses.
function trimHallJunction(sim, order, absorbedIds) {
  const { x, y, w, h } = order;
  const hallColumn = (xx) => {
    for (let yy = y; yy < y + h; yy += 1) {
      if (hallOpening(sim, sim.world.index(xx, yy), order, absorbedIds)) return true;
    }
    return false;
  };
  const columns = Array.from({ length: w }, (_, offset) => hallColumn(x + offset));
  if (!columns.some(Boolean)) return null;
  let left = 0;
  while (left < w && columns[left]) left += 1;
  let right = w - 1;
  while (right >= left && columns[right]) right -= 1;
  if (left > right || columns.slice(left, right + 1).some(Boolean)) return { ok: false, error: 'overlapRoom' };
  return { ok: true, rect: { x: x + left, y, w: right - left + 1, h } };
}

export function planExcavation(sim, order) {
  const valid = validateExcavation(sim, order);
  if (!valid.ok) return valid;
  if (valid.trimmed) order = { ...order, ...valid.trimmed };
  const absorbed = absorbableRescueTunnels(sim, order);
  const excavation = createExcavation(sim.nextExcavationId++, order);
  excavation.cells = excavationCells(excavation).map(({ x, y }) => sim.world.index(x, y));
  const hasWork = excavation.cells.some((index) => sim.world.states[index] === CELL.SOLID);
  excavation.state = hasWork ? 'planned' : 'dug';
  if (!hasWork) {
    excavation.dugCells = [...excavation.cells];
    // A drawing laid over a natural void owns the cells of its rectangle,
    // as a dug one does (they stay that void for everyone else).
    for (const index of excavation.cells) {
      if (!naturalVoid(sim, index)) continue;
      claimVoid(excavation, index);
      const { x, y } = sim.world.coords(index);
      sim.world.setCell(x, y, sim.world.materials[index], CELL.EMPTY, excavation.id);
    }
  }
  for (const gallery of absorbed) {
    for (const field of ['loose', 'yields']) {
      for (const [resource, amount] of Object.entries(gallery[field] ?? {})) {
        excavation[field][resource] = (excavation[field][resource] ?? 0) + amount;
      }
    }
    for (const index of gallery.dugCells ?? []) {
      const { x, y } = sim.world.coords(index);
      if (!sim.world.isEmpty(x, y)) continue;
      if (!excavation.dugCells.includes(index)) excavation.dugCells.push(index);
      if (gallery.claimedVoid?.includes(index)) claimVoid(excavation, index);
      sim.world.setCell(x, y, sim.world.materials[index], CELL.EMPTY, excavation.id);
    }
    for (const job of sim.jobs ?? []) {
      if (job.excavationId === gallery.id) job.excavationId = excavation.id;
    }
    sim.excavations.splice(sim.excavations.indexOf(gallery), 1);
  }
  excavation.dugCells.sort((a, b) => a - b);
  if (hasWork && excavation.dugCells.length > 0) excavation.state = 'digging';
  sim.excavations.push(excavation);
  sim.structureDirty = true;
  sim.log('info', 'eventPlanned', { id: excavation.id }, excavation);
  return { ok: true, excavation };
}

// Les stocks ensevelis deviennent des charges transportables au premier vrai
// deblaiement dans les cellules de la salle, jamais au simple trace du chantier.
function recoverBuriedStock(sim, excavation, index) {
  for (const collapsed of sim.excavations) {
    if (collapsed === excavation || collapsed.state !== 'collapsed' || !collapsed.cells?.includes(index)) continue;
    for (const [resource, amount] of Object.entries(collapsed.loose ?? {})) {
      if (amount > 0) excavation.loose[resource] = (excavation.loose[resource] ?? 0) + amount;
    }
    collapsed.loose = {};
  }
}

export function digCell(sim, excavation, x, y) {
  const index = sim.world.index(x, y);
  if (excavation.dugCells.includes(index)) return null;
  const materialId = sim.world.materials[index];
  const depositId = sim.world.deposits[index];
  const wasSolid = sim.world.states[index] === CELL.SOLID;
  const wasVoid = naturalVoid(sim, index);
  const firstCell = excavation.dugCells.length === 0;
  const yielded = {};
  if (wasSolid) {
    const resource = materialAt(materialId).resource;
    if (resource) yielded[resource] = (yielded[resource] ?? 0) + 1;
    const deposit = DEPOSITS[depositId];
    const depositResource = DEPOSIT_RESOURCES[deposit];
    if (depositResource) yielded[depositResource] = (yielded[depositResource] ?? 0) + 1;
  }
  sim.world.setCell(x, y, MATERIAL.AIR, CELL.EMPTY, excavation.id);
  sim.world.deposits[index] = 0;
  sim.world.reveal(x, y);
  excavation.dugCells.push(index);
  excavation.dugCells.sort((a, b) => a - b);
  // An excavation remembers the rock it cut: a wall a gallery pierces, or a
  // room still being dug, keeps that rock for the structure (see cutRock in
  // structureGeometry.js). It keeps that record from its first cell on; an
  // excavation already partly dug without it (an old save) stays without it,
  // all of a piece.
  if (excavation.cutRock || firstCell) {
    excavation.cutRock ??= {};
    // Rubble is recorded too: it still reads as rubble around a roof or a
    // shaft (never as wall rock, see cutRock).
    if (wasSolid && materialId !== MATERIAL.AIR) excavation.cutRock[index] = materialId;
  }
  if (wasVoid) claimVoid(excavation, index);
  excavation.loose ??= {};
  excavation.yields ??= {};
  if (wasSolid && materialId === MATERIAL.RUBBLE) recoverBuriedStock(sim, excavation, index);
  for (const [resource, amount] of Object.entries(yielded)) {
    excavation.loose[resource] = (excavation.loose[resource] ?? 0) + amount;
    excavation.yields[resource] = (excavation.yields[resource] ?? 0) + amount;
  }
  sim.structureDirty = true;
  sim.events.push({ type: 'digCell', tick: sim.tick, excavationId: excavation.id, x, y, materialId, yields: { ...yielded } });
  recordDigCell(sim, excavation, x, y, wasSolid);
  return yielded;
}

export function remainingCells(sim, excavation) {
  return excavation.cells.filter((index) => !excavation.dugCells.includes(index) && sim.world.states[index] === CELL.SOLID);
}

export function finishIfDug(sim, excavation) {
  if (excavation.state === 'collapsed' || excavation.state === 'dug' || excavation.state === 'fitted') return false;
  if (remainingCells(sim, excavation).length > 0) return false;
  for (const index of excavation.cells) {
    if (!excavation.dugCells.includes(index)) {
      excavation.dugCells.push(index);
      if (naturalVoid(sim, index)) claimVoid(excavation, index);
      const { x, y } = sim.world.coords(index);
      sim.world.setCell(x, y, MATERIAL.AIR, CELL.EMPTY, excavation.id);
      sim.world.reveal(x, y);
    }
  }
  excavation.dugCells.sort((a, b) => a - b);
  excavation.state = 'dug';
  sim.structureDirty = true;
  if (excavation.kind === 'room' && !excavationReachable(sim, excavation)) {
    sim.log('warning', 'eventRoomUnreachable', { id: excavation.id, excavationId: excavation.id }, excavation);
  }
  if (excavation.kind === 'room') sim.events.push({
    type: 'roomOpened',
    tick: sim.tick,
    excavationId: excavation.id,
    kind: excavation.kind,
    roomType: excavation.roomType ?? null,
    x: excavation.x,
    y: excavation.y,
    w: excavation.w,
    h: excavation.h,
    volume: excavation.dugCells.length,
  });
  sim.log('info', 'eventDug', {
    id: excavation.id,
    kind: excavation.kind,
    volume: excavation.dugCells.length,
    yields: { ...(excavation.yields ?? {}) },
  }, excavation);
  recordJournalNarrative(sim, 'dig', String(excavation.id), {
    id: excavation.id,
    kind: excavation.kind,
  }, { focus: excavation });
  return true;
}

export function planDoor(sim, excavation, x, y) {
  if (!excavation || excavation.state === 'collapsed') return { ok: false, error: 'invalidPlacement' };
  const doorY = excavation.y + excavation.h - EXCAVATION.DOOR_HEIGHT;
  const withinVertical = y >= doorY && y < excavation.y + excavation.h;
  const onSide = x === excavation.x - 1 || x === excavation.x + excavation.w;
  if (!withinVertical || !onSide) return { ok: false, error: 'invalidPlacement' };
  for (let yy = doorY; yy < doorY + EXCAVATION.DOOR_HEIGHT; yy += 1) {
    if (!sim.world.isDiggable(x, yy) || !sim.world.isSolid(x, yy)) return { ok: false, error: 'invalidPlacement' };
  }
  for (let yy = doorY; yy < doorY + EXCAVATION.DOOR_HEIGHT; yy += 1) {
    sim.world.setCell(x, yy, MATERIAL.AIR, CELL.EMPTY, -1);
    sim.world.reveal(x, yy);
  }
  const door = { id: sim.doors.length, x, y: doorY, excavationId: excavation.id };
  sim.doors.push(door);
  excavation.doors.push(door.id);
  sim.structureDirty = true;
  sim.log('info', 'eventDoor', { id: excavation.id }, excavation);
  return { ok: true, door };
}

export function cancelExcavation(sim, excavation) {
  if (!excavation || excavation.initial || excavation.state === 'dug' || excavation.state === 'fitted' || excavation.state === 'collapsed') return false;
  const position = sim.excavations.indexOf(excavation);
  if (position < 0) return false;

  if (excavation.state === 'planned' || excavation.dugCells.length === 0) {
    sim.excavations.splice(position, 1);
  } else {
    const dugCells = [...new Set(excavation.dugCells)].sort((a, b) => a - b);
    const coordinates = dugCells.map((index) => sim.world.coords(index));
    excavation.kind = 'quarry';
    excavation.x = Math.min(...coordinates.map(({ x }) => x));
    excavation.y = Math.min(...coordinates.map(({ y }) => y));
    excavation.w = Math.max(...coordinates.map(({ x }) => x)) - excavation.x + 1;
    excavation.h = Math.max(...coordinates.map(({ y }) => y)) - excavation.y + 1;
    excavation.cells = dugCells;
    excavation.dugCells = [...dugCells];
    excavation.state = 'dug';
    excavation.targetLining = 'none';
    excavation.work = {};
    excavation.workRequired = {};
    excavation.stress = null;
  }

  sim.structureDirty = true;
  sim.log('info', 'eventCancel', { id: excavation.id }, excavation);
  return true;
}

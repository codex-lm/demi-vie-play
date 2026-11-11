// Derived stresses are not saved. Geometry and supports change much less often
// than the hourly integrity pass, so keep section evaluations on their parent.
const revisions = new WeakMap();
const evaluations = new WeakMap();

function signature(excavation) {
  return [excavation.id, excavation.kind, excavation.state, excavation.x, excavation.y,
    excavation.w, excavation.h, excavation.shape, excavation.lining,
    excavation.segmentOrigin, excavation.engineeredShelterShaft, excavation.initial,
    excavation.label, excavation.cells, excavation.cells?.length,
    excavation.dugCells, excavation.dugCells?.length,
    excavation.collapsedCells, excavation.collapsedCells?.length,
    ...(excavation.supports ?? []).flatMap((support) => typeof support === 'number'
      ? [support] : [support?.x, support?.failed, support?.solidity])];
}

function equal(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function structuralRevision(sim) {
  const previous = revisions.get(sim);
  const rooms = (sim.excavations ?? []).map((excavation) => ({ excavation, values: signature(excavation) }));
  const doors = (sim.doors ?? []).flatMap((door) => [door.x, door.y]);
  if (previous?.world === sim.world && previous.worldRevision === sim.world.revision
    && previous.rooms.length === rooms.length && equal(previous.doors, doors)
    && rooms.every((room, index) => room.excavation === previous.rooms[index].excavation
      && equal(room.values, previous.rooms[index].values))) return previous;
  // Other rooms participate in merged spans and wall loads. A changed neighbour
  // must invalidate the whole structural context, even without a world edit.
  const revision = { world: sim.world, worldRevision: sim.world.revision, rooms, doors };
  revisions.set(sim, revision);
  return revision;
}

export function cachedStructureEvaluation(sim, excavation, revision, evaluate) {
  const cached = evaluations.get(excavation);
  if (cached?.revision === revision) return cached.stress;
  const stress = evaluate(sim, excavation);
  evaluations.set(excavation, { revision, stress });
  return stress;
}

import { World } from '../sim/world.js';
import { buildChunk } from './terrain.js';

// The structured clone contains only the five read-only terrain layers.
// Use the grid's normal coordinate rules without copying the simulation.
self.onmessage = ({ data: { world, x, y, seed, resolution, chunkSize } }) => {
  Object.setPrototypeOf(world, World.prototype);
  const steps = buildChunk(world, x, y, seed, resolution, chunkSize);
  let step;
  do { step = steps.next(); } while (!step.done);
  const bitmap = step.value.transferToImageBitmap();
  self.postMessage(bitmap, [bitmap]);
};

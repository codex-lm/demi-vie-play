import { drawPortrait as drawArtPortrait } from '../../art/portrait.js';
const SKIN_TONES = ['#f0c7a5', '#dca77f', '#bd835f', '#925d42', '#663f31'];
const HAIR_COLORS = ['#2c2525', '#594033', '#8a6746', '#b8a58a', '#6d7070', '#3d2c26'];
const EYE_COLORS = ['#40342c', '#536453', '#527184', '#765d3f'];
const CLOTHES = ['#637d78', '#8a684b', '#6d778b', '#7f625e', '#697852'];

function numericIndex(value, length, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.abs(Math.trunc(number)) % length : fallback % length;
}

export function portraitFeatures(colonist) {
  const portrait = colonist?.portrait ?? {};
  const id = Math.abs(Number(colonist?.id) || 0);
  return {
    skin: numericIndex(portrait.skin, SKIN_TONES.length, id),
    hair: numericIndex(portrait.hair, HAIR_COLORS.length, id * 3 + 1),
    eyes: numericIndex(portrait.eyes, EYE_COLORS.length, id + 2),
    style: numericIndex(portrait.style, 5, id * 7),
    clothes: numericIndex(portrait.clothes, CLOTHES.length, id * 5 + 2),
  };
}


const JOBS = { dig: 'digger', clear: 'digger', haul: 'hauler', stockHaul: 'hauler', farm: 'farmer', cultivate: 'farmer', harvest: 'farmer', cook: 'cook', treat: 'medic', heal: 'medic', care: 'medic', crank: 'tech', repair: 'tech', support: 'tech', lining: 'tech', coating: 'tech', fit: 'tech', maintain: 'tech', research: 'tech' };
const ROOM_JOBS = { kitchen: 'cook', canteen: 'cook', infirmary: 'medic', mushroom: 'farmer', hydroponics: 'farmer', insectFarm: 'farmer', ratFarm: 'farmer', fishTank: 'farmer', algaeTank: 'farmer' };
const SKILL_JOBS = { dig: 'digger', build: 'tech', farm: 'farmer', medic: 'medic', tech: 'tech', cook: 'cook' };

export function colonistArtAge(colonist) {
  if (['baby', 'child', 'school'].includes(colonist?.lifeStage) || Number(colonist?.age) < 12) return 'child';
  if (colonist?.lifeStage === 'elder' || Number(colonist?.age) >= 65) return 'elder';
  return 'adult';
}

// The identity belongs to the saved person, never to their animation or current room.
export function colonistArtSeed(colonist) {
  const portrait = colonist?.portrait ?? {};
  const identity = [colonist?.id ?? 0, portrait.skin, portrait.hair, portrait.eyes, portrait.style].join(':');
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i += 1) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  return hash | 0;
}

export function colonistArtJob(sim, colonist) {
  // The tick that completes a job keeps working without it (sim/jobs.js,
  // holdWorkPose): dress that job's worker, not a digger.
  const job = sim?.jobs?.find((candidate) => candidate.id === colonist?.jobId)
    ?? (colonist?.task === 'working' ? colonist?.heldWork : null);
  const room = sim?.excavation?.(job?.excavationId) ?? sim?.excavations?.find((candidate) => candidate.id === job?.excavationId);
  if (job) return JOBS[job.type] ?? ROOM_JOBS[room?.roomType ?? job.roomType] ?? 'tech';
  if (colonist?.task === 'caring') return 'medic';
  if (colonist?.carrying) return 'hauler';
  if (['working', 'clearing'].includes(colonist?.task)) return 'digger';
  if (['crank', 'repairing'].includes(colonist?.task)) return 'tech';
  // Children have no work uniform. An idle adult keeps the trade they know best.
  if (colonistArtAge(colonist) === 'child') return 'none';
  let trade = 'none';
  let best = 0;
  for (const [skill, outfit] of Object.entries(SKILL_JOBS)) {
    if ((colonist?.skills?.[skill] ?? 0) > best) { best = colonist.skills[skill]; trade = outfit; }
  }
  return trade;
}

export function colonistAppearance(sim, colonist) {
  const features = portraitFeatures(colonist);
  return {
    seed: colonistArtSeed(colonist), age: colonistArtAge(colonist), job: colonistArtJob(sim, colonist),
    sex: colonist?.sex,
    // Saved skin pigments are retained in both renderers; geometry comes from the art seed.
    skin: SKIN_TONES[features.skin],
    mood: colonist?.moraleValue ?? colonist?.morale ?? 60,
    injured: Boolean(colonist?.injured || colonist?.injuries?.length), dose: colonist?.dose ?? 0,
  };
}

export function drawPortrait(ctx, colonist, width = 96, height = 108, sim = null) {
  if (!ctx || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  // Preserve the existing panel dimensions without stretching the square portrait.
  ctx.fillStyle = '#1e2d31';
  ctx.fillRect(0, 0, width, height);
  const size = Math.min(width, height);
  drawArtPortrait(ctx, (width - size) / 2, (height - size) / 2, size, colonistAppearance(sim, colonist));
  ctx.restore();
}

export function portraitMarkup(colonist) {
  return `<canvas class="portrait procedural-portrait" width="96" height="108" data-portrait="${Number(colonist?.id) || 0}" aria-hidden="true"></canvas>`;
}

export function paintPortrait(root, colonist, sim = null) {
  const canvas = root?.querySelector?.('[data-portrait]');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  drawPortrait(ctx, colonist, canvas.width, canvas.height, sim);
}

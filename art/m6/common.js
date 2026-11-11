// Shared illustration contract. Seconds and pixels only; no simulation writes.
import { P, hash, clamp } from '../palette.js';
export { P, hash, clamp };
export const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export function seedOf(value = 1) {
  if (Number.isFinite(value)) return value | 0;
  let n = 2166136261;
  for (const ch of String(value)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n | 0;
}
/** Accept art appearance, {appearance, firstName}, or a saved colonist.
 * Saved-person mapping mirrors src/render/portraits.js at the pack base commit.
 * Pass appearance: colonistAppearance(sim, person) to preserve the active job too. */
export function identityOf(person = {}) {
  const p = person && typeof person === 'object' ? person : {};
  const a = p.appearance ?? p.identity ?? p;
  const saved = a.seed == null && (a.id != null || a.portrait != null);
  let seed = seedOf(a.seed ?? 1), skin = a.skin;
  if (saved) {
    const v = a.portrait ?? {};
    seed = seedOf([a.id ?? 0, v.skin, v.hair, v.eyes, v.style].join(':'));
    const tones = ['#f0c7a5', '#dca77f', '#bd835f', '#925d42', '#663f31'];
    const index = Number(v.skin ?? Math.abs(Number(a.id) || 0));
    skin = tones[Number.isFinite(index) ? Math.abs(Math.trunc(index)) % tones.length : 0];
  }
  const rawAge = a.age ?? p.age;
  const age = ['child','adult','elder'].includes(rawAge) ? rawAge :
    ['baby','child','school'].includes(a.lifeStage) || Number(rawAge) < 12 ? 'child' :
    a.lifeStage === 'elder' || Number(rawAge) >= 65 ? 'elder' : 'adult';
  let job = a.job ?? 'none';
  if (saved && age !== 'child') {
    let best = 0;
    for (const [skill, outfit] of Object.entries({dig:'digger',build:'tech',farm:'farmer',medic:'medic',tech:'tech',cook:'cook'})) {
      if ((a.skills?.[skill] ?? 0) > best) { best = a.skills[skill]; job = outfit; }
    }
  }
  return { ...a, seed, age, job, skin, mood: finite(a.mood ?? a.moraleValue ?? a.morale, 60),
    injured: Boolean(a.injured || a.injuries?.length), dose: finite(a.dose),
    firstName: p.firstName != null || a.firstName != null ? String(p.firstName ?? a.firstName).trim() : String(p.name ?? a.name ?? '').trim().split(/\s+/u)[0],
    name: String(p.name ?? a.name ?? p.firstName ?? a.firstName ?? ''),
    cellPx: Math.max(1, finite(a.cellPx, 48)) };
}
export function frame(ctx, x, y, w, h, draw) {
  if (!ctx || ![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0) return;
  ctx.save(); ctx.setLineDash([]); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  ctx.translate(x,y); draw(ctx,w,h); ctx.restore();
}

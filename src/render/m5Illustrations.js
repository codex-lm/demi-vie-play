import { drawDilemmaVignette, DILEMMA_IDS } from '../../art/dilemma-vignettes.js';
import { drawShelterEmblem } from '../../art/shelter-emblems.js';
import { drawFind } from '../../art/finds.js';
import { drawIcon, ICON_NAMES } from '../../art/icons.js';
import { drawPortrait, colonistAppearance } from './portraits.js';

// Editorial associations only: the choices, consequences and French copy stay in data.
export const DILEMMA_ART = Object.freeze({
  strangerAtHatch: 'strangerAtHatch',
  stolenRations: 'rationTheft',
  elderLastSky: 'elderSky',
  childQuota: 'childQuota',
  gasPocket: 'gasPocket',
  generatorShift: 'generatorShift',
  waterRation: 'rationTheft',
  schoolCall: 'radioPlea',
  seedStock: 'seedStock',
  eveningCurfew: 'eveningCurfew',
  quarantineMedic: 'sickness',
  refugeesRadio: 'radioPlea',
  ...Object.fromEntries(DILEMMA_IDS.filter(id => id.startsWith('lab')).map(id => [id, id])),
});

export function dilemmaArt(id) {
  return Object.hasOwn(DILEMMA_ART, id) ? DILEMMA_ART[id] : 'generic';
}

export function neighborArt(neighbor) {
  if (neighbor.fate === 'silent' || neighbor.alive === false) return 'silent';
  // The underground community uses the existing crossed-tools shield.
  return ({ farm: 'farm', bunker: 'military', school: 'school', hospital: 'hospital', metro: 'mine', lock: 'lock', printshop: 'printshop' })[neighbor.kind] ?? 'silent';
}

export function calendarEventArt(event) {
  const type = event.type ?? event.kind;
  if (type === 'seasonChange') return ICON_NAMES.includes(event.season) ? event.season : null;
  return ({ thawWarning: 'thaw', thaw: 'thaw', thawEnd: 'thaw', harvest: 'autumn',
    blackRain: 'blackRain', dustStorm: 'storm', storm: 'storm', raiders: 'raiders',
    raid: 'raiders', dilemma: 'dilemma', radio: 'radio', radioMessage: 'radio' })[type] ?? null;
}

export function iconMarkup(name, extra = '') {
  if (!ICON_NAMES.includes(name)) return '';
  return `<canvas class="m5-art-icon" data-m5-icon="${name}" ${extra} width="48" height="48" aria-hidden="true"></canvas>`;
}

export function colonistPortraitMarkup(id, className = '') {
  if (!Number.isInteger(Number(id)) || id === null || id === undefined) return '';
  return `<canvas class="portrait${className ? ` ${className}` : ''}" data-colonist-id="${Number(id)}" width="72" height="72" aria-hidden="true"></canvas>`;
}

// A canvas is painted once per image identity, not once per frame or simulation tick.
const painted = new WeakMap();
export function paintM5Illustrations(root, sim) {
  let count = 0;
  for (const canvas of root?.querySelectorAll?.('canvas[data-colonist-id], canvas[data-m5-icon], canvas[data-m5-emblem], canvas[data-m5-vignette], canvas[data-m5-find]') ?? []) {
    const data = canvas.dataset;
    const colonist = data.colonistId !== undefined
      ? sim?.colonists?.find((person) => person.id === Number(data.colonistId)) : null;
    if (data.colonistId !== undefined && !colonist) continue;
    const identity = `${canvas.width}:${canvas.height}:` + (colonist
      ? JSON.stringify(colonistAppearance(sim, colonist))
      : `${data.m5Icon ?? ''}:${data.m5Emblem ?? ''}:${data.m5Vignette ?? ''}:${data.m5Find ?? ''}`);
    if (painted.get(canvas) === identity) continue;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) continue;
    if (colonist) drawPortrait(ctx, colonist, canvas.width, canvas.height, sim);
    else {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const size = Math.min(canvas.width, canvas.height);
      if (data.m5Icon) drawIcon(ctx, data.m5Icon, 0, 0, size);
      else if (data.m5Emblem) drawShelterEmblem(ctx, data.m5Emblem, 0, 0, size);
      else if (data.m5Find) drawFind(ctx, data.m5Find, canvas.width / 2, canvas.height * .88, size * .78, { t: 0, reduceMotion: true });
      else drawDilemmaVignette(ctx, data.m5Vignette, 0, 0, canvas.width, canvas.height, { t: 0 });
      ctx.restore();
    }
    painted.set(canvas, identity);
    count += 1;
  }
  return count;
}

// Called only with the visible panel's cached canvases. A small illustration
// needs twelve frames per second; reduced motion gets one stable repaint.
const animated = new WeakMap();
export function animateM5Vignettes(canvases, now = 0, reduceMotion = false) {
  let count = 0;
  const frame = reduceMotion ? 'still' : Math.floor(now * 12);
  for (const canvas of canvases ?? []) {
    if (!canvas.isConnected || canvas.closest?.('[hidden]')) continue;
    const identity = `${canvas.dataset.m5Vignette}:${canvas.width}:${canvas.height}:${frame}`;
    if (animated.get(canvas) === identity) continue;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) continue;
    ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawDilemmaVignette(ctx, canvas.dataset.m5Vignette, 0, 0, canvas.width, canvas.height,
      { t: reduceMotion ? 0 : frame / 12, reduceMotion });
    ctx.restore(); animated.set(canvas, identity); count++;
  }
  return count;
}

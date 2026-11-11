import { createTitleAnimation } from '../../art/m6/title.js';
import { drawLogo } from '../../art/title-scene.js';
import { drawStorytellerPortrait } from '../../art/storytellers.js';
import { OBJECTIVE_ART, drawGameSouvenir } from './m6-symbols.js';
export { OBJECTIVE_ART, SOUVENIR_ART, drawGameSouvenir } from './m6-symbols.js';
import { drawElderPortrait, drawObjectiveIcon, drawInkCheck } from '../../art/m6/notebook.js';
import { drawStoryVignette, STORY_KINDS } from '../../art/m6/story.js';
import { createExodusCinematic } from '../../art/m6/exodus.js';
import { integ5Text } from '../../art/m6/integ5-strings.fr.js';
import { colonistAppearance } from './portraits.js';
import { TIME } from '../data/balance.js';
import { surfaceTemperature } from '../sim/climate.js';
import { getLanguage, tr } from '../data/strings.fr.js';
import { animateM5Vignettes } from './m5Illustrations.js';

const states = new WeakMap();
const SELECTOR = 'canvas[data-art],canvas.souvenir-icon,canvas.first-sky,canvas[data-story-kind]';

// These are presentation decisions from recorded facts, never new colony rules.
export function elderExpression(sim) {
  const recent = (sim.events ?? []).filter(e => sim.tick - e.tick <= TIME.TICKS_PER_DAY);
  if (recent.some(e => ['death', 'colonistDied'].includes(e.type))) return 'sad';
  if ((sim.colonists ?? []).some(p => p.dead && sim.tick - (p.deathTick ?? -Infinity) <= TIME.TICKS_PER_DAY)) return 'sad';
  if (Object.values(sim.alerts ?? {}).some(a => a.level === 'red' || a.level === 'danger') || sim.emergency || sim.m5?.hazards?.level === 'danger'
    || (sim.colonists ?? []).some(p => !p.dead && p.health > 0 && p.health < 45)) return 'worried';
  if (recent.some(e => e.type === 'objectiveDone' || e.type === 'souvenirPassed')) return 'proud';
  const people = (sim.colonists ?? []).filter(p => !p.dead && p.health > 0);
  if (people.length && people.reduce((sum,p) => sum + (p.moraleValue ?? p.morale ?? 50), 0) / people.length >= 75) return 'amused';
  return 'neutral';
}

export function exodusCast(sim) {
  const story = sim.exodus?.result?.story ?? {};
  const living = (sim.colonists ?? []).filter(p => !p.dead && p.health > 0);
  const byId = new Map((sim.colonists ?? []).map(p => [String(p.id), p]));
  const identity = p => ({ ...p, appearance: colonistAppearance(sim, p) });
  return {
    seed: sim.seed, season: story.season ?? sim.m5?.calendar?.season,
    weather: story.weather ?? sim.weather?.current,
    surfaceTemperature: Number.isFinite(sim.tick) ? surfaceTemperature(sim.tick / TIME.TICKS_PER_DAY) : undefined,
    colonists: living.map(identity),
    // Names and membership come from the serialized ending, not current selection.
    children: (story.children ?? []).map(child => identity({ ...byId.get(String(child.id)), ...child, firstName: child.name })),
  };
}

function canvasIn(parent, className, art, width, height) {
  const canvas = parent.ownerDocument.createElement('canvas');
  canvas.className = className; canvas.dataset.art = art; canvas.width = width; canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

function fit(canvas, force = false) {
  const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(canvas.clientWidth || canvas.width));
  const height = Math.max(1, Math.round(canvas.clientHeight || canvas.height));
  const changed = canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio);
  if (changed) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  const ctx = canvas.getContext('2d');
  if (ctx) { ctx.setTransform(ratio, 0, 0, ratio, 0, 0); if (force || changed) ctx.clearRect(0, 0, width, height); }
  return { ctx, width, height };
}

function visible(canvas) { return canvas.isConnected && !canvas.closest('[hidden]'); }

function paintStatic(canvas, game, state) {
  if (!visible(canvas)) return;
  const {ctx,width,height} = fit(canvas, true); if (!ctx) return;
  const art = canvas.dataset.art, size = Math.min(width, height);
  if (art === 'drawLogo') {
    const letter = Math.min(height * .78, width / 5.8);
    drawLogo(ctx, (width - letter * 5.72) / 2, (height - letter) / 2, letter);
  } else if (art === 'drawStorytellerPortrait') {
    drawStorytellerPortrait(ctx, canvas.dataset.storyteller, (width-size)/2, (height-size)/2, size);
  } else if (canvas.matches('.souvenir-icon') || art === 'drawSouvenir') {
    ctx.save(); ctx.translate((width-size)/2, (height-size)/2); drawGameSouvenir(ctx, canvas.dataset.souvenirType, size); ctx.restore();
  } else if (art === 'drawElderPortrait') {
    const text = integ5Text(state.language);
    drawElderPortrait(ctx, 0, 0, size, state.expression, {seed: 617});
    canvas.dataset.expression = state.expression;
    canvas.setAttribute('aria-label', `${text.elder}, ${text.expressions[state.expression]}`);
  } else if (art === 'drawObjectiveIcon') {
    drawObjectiveIcon(ctx, OBJECTIVE_ART[canvas.dataset.objectiveId] ?? 'heritage', 0, 0, size);
  } else if (STORY_KINDS.includes(canvas.dataset.storyKind)) {
    drawStoryVignette(ctx, canvas.dataset.storyKind, 0, 0, width, height, game.sim.seed);
  }
  canvas.dataset.painted = 'true';
}

function decorate(state, game) {
  const document = state.document;
  for (const row of document.querySelectorAll('[data-objective-id]')) {
    if (row.tagName === 'CANVAS' || row.querySelector('canvas[data-art="drawObjectiveIcon"]')) continue;
    const canvas = canvasIn(row, 'm6-objective-art', 'drawObjectiveIcon', 36, 36);
    canvas.dataset.objectiveId = row.dataset.objectiveId; row.prepend(canvas);
  }
  const heading = document.querySelector('#m6-notebook .m6-panel-heading');
  if (heading && !heading.querySelector('.m6-elder-art')) {
    const canvas = canvasIn(heading, 'm6-elder-art', 'drawElderPortrait', 72, 72);
    canvas.removeAttribute('aria-hidden'); canvas.setAttribute('role', 'img'); heading.prepend(canvas);
  }
  // Exact kinds are an explicit interface contract. Never guess from translated
  // sentences or positional ordering. Keep code/index as source provenance.
  for (const row of document.querySelectorAll('.colony-story li, .colony-story [data-story-kind]')) {
    if (row.tagName === 'CANVAS') continue;
    let canvas = row.querySelector('canvas[data-story-kind]');
    if (!STORY_KINDS.includes(row.dataset.storyKind)) { canvas?.remove(); continue; }
    if (!canvas) { canvas = canvasIn(row, 'm6-story-art', 'drawStoryVignette', 320, 180); row.prepend(canvas); }
    for (const key of ['storyKind', 'storyCode', 'storyIndex']) {
      if (row.dataset[key] === undefined) delete canvas.dataset[key];
      else if (canvas.dataset[key] !== row.dataset[key]) canvas.dataset[key] = row.dataset[key];
    }
  }
  state.canvases = [...document.querySelectorAll(SELECTOR)];
  state.vignettes = [...document.querySelectorAll('canvas[data-m5-vignette]')];
  state.titleCanvas = state.canvases.find(c => c.classList.contains('title-scene'));
  state.skyCanvas = state.canvases.find(c => c.classList.contains('first-sky'));
  for (const canvas of state.canvases) {
    if (canvas !== state.titleCanvas && canvas !== state.skyCanvas) paintStatic(canvas, game, state);
  }
  if (state.skyCanvas) {
    const label = integ5Text(state.language).replay;
    let replay = state.skyCanvas.parentElement.querySelector('[data-m6-film="replay"]');
    if (!replay) {
      replay = document.createElement('button'); replay.type = 'button'; replay.className = 'm6-film-replay';
      replay.dataset.m6Film = 'replay';
      replay.addEventListener('click', () => startFilm(state, game)); state.skyCanvas.after(replay);
    }
    if (replay.textContent !== label) replay.textContent = label;
  }
  state.resize = true;
}

function closeFilm(state, skipped = false) {
  if (!state.film) return;
  if (skipped) state.film.skip();
  Object.assign(state.cinematic, {active: false, time: state.film.time, sequence: state.film.sequence, skipped});
  state.overlay?.remove(); state.overlay = null; state.filmCanvas = null;
  if (state.main) state.main.inert = state.previousInert;
  state.document.removeEventListener('keydown', state.filmKeys, true);
  const replay = state.skyCanvas?.parentElement?.querySelector('[data-m6-film="replay"]');
  replay?.focus({preventScroll:true}); state.resize = true;
}

function startFilm(state, game) {
  if (!state.skyCanvas || !state.result || state.result.type !== 'exodus') return;
  if (state.cinematic.active) closeFilm(state, true);
  const text = integ5Text(state.language);
  state.film = createExodusCinematic(state.cast);
  Object.assign(state.cinematic, {active: true, time: 0, sequence: 0, skipped: false});
  const document = state.document, overlay = document.createElement('section');
  overlay.className = 'm6-cinema-layer'; overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', text.film);
  const canvas = canvasIn(overlay, 'm6-cinema-canvas', 'exodusCinematic', 1280, 720);
  const button = document.createElement('button'); button.type = 'button'; button.className = 'm6-cinema-skip';
  button.dataset.m6Film = 'skip'; button.textContent = text.skip;
  button.addEventListener('click', () => closeFilm(state, true));
  overlay.append(canvas, button); document.body.append(overlay);
  state.overlay = overlay; state.filmCanvas = canvas;
  state.main = document.querySelector('#game-shell'); state.previousInert = state.main?.inert ?? false;
  if (state.main) state.main.inert = true;
  state.filmKeys = event => {
    if (event.key.toLowerCase() === 'm') return;
    if (event.key === 'Escape' || event.key === ' ') { event.preventDefault(); event.stopImmediatePropagation(); closeFilm(state, true); }
    else if (event.key === 'Tab') { event.preventDefault(); event.stopImmediatePropagation(); button.focus(); }
    else { event.stopImmediatePropagation(); if (event.key !== 'Enter') event.preventDefault(); }
  };
  document.addEventListener('keydown', state.filmKeys, true); button.focus({preventScroll:true}); state.resize = true;
}

function createState(game, document) {
  const state = {document, language: getLanguage(), dirty: true, resize: true, canvases: [], last: null, title: null, titleTime: -1,
    sim:game.sim, lastObjective:(game.sim.events ?? []).findLast(e=>e.type==='objectiveDone'), objectivePulse:null,
    expression: elderExpression(game.sim), result: null, film: null, cinematic: {active:false,time:0,duration:40,sequence:0,skipped:false}};
  const Observer = globalThis.MutationObserver;
  if (Observer) {
    state.observer = new Observer(() => { state.dirty = true; });
    // Exclude the changing HUD, journal and game canvas from the observer.
    for (const root of document.querySelectorAll('.m6-shell,#m6-panels,#selection-panel,#m4-panels,#m5-panels')) {
      state.observer.observe(root, {subtree:true, childList:true, attributes:true,
        attributeFilter:['hidden','data-art','data-story-kind','data-story-code','data-story-index','data-souvenir-type','data-objective-id','data-m5-vignette']});
    }
  }
  globalThis.addEventListener?.('resize', () => {state.dirty = true; state.resize = true;});
  states.set(game, state); game.renderer.m6 = state;
  return state;
}

function updateObjectivePulse(state, game, now, reduce) {
  const event = (game.sim.events ?? []).findLast(e => e.type === 'objectiveDone');
  if (state.sim !== game.sim) {
    state.sim = game.sim; state.lastObjective = event; state.objectivePulse?.canvas?.remove(); state.objectivePulse = null;
  }
  if (event && event !== state.lastObjective) {
    state.lastObjective = event;
    state.objectivePulse?.canvas?.remove();
    state.objectivePulse = {event, start:now, canvas:null};
  }
  const pulse = state.objectivePulse;
  if (!pulse) return;
  if (now - pulse.start > 3) { pulse.canvas?.remove(); state.objectivePulse = null; return; }
  if (!pulse.canvas?.isConnected) {
    const host = state.document.querySelector('#m6-notebook .m6-panel-heading') ?? state.document.querySelector('#m6-notebook-reopen');
    if (!host || host.closest('[hidden]')) return;
    const canvas = canvasIn(host,'m6-objective-complete','objectiveDone',64,40);
    canvas.removeAttribute('aria-hidden'); canvas.setAttribute('role','img');
    const id = pulse.event.objectiveId ?? '';
    canvas.setAttribute('aria-label', tr(`m6Objective${id[0]?.toUpperCase() ?? ''}${id.slice(1)}Done`));
    host.append(canvas); pulse.canvas = canvas;
  }
  const {ctx,width,height} = fit(pulse.canvas,true);
  if (!ctx) return;
  ctx.fillStyle='#273a3c'; ctx.fillRect(0,0,height,height);
  drawObjectiveIcon(ctx,OBJECTIVE_ART[pulse.event.objectiveId] ?? 'heritage',3,3,height-6);
  drawInkCheck(ctx,width-28,height/2-13,26,reduce ? 1 : now-pulse.start);
}

/** Called by Renderer after the world. DOM discovery is mutation-driven; static
 * portraits/icons repaint only on insertion, resize or expression transition. */
export function updateM6Art(game, now = 0) {
  const document = globalThis.document;
  if (!document?.querySelectorAll || !document.createElement || !game.renderer) return;
  const state = states.get(game) ?? createState(game, document);
  const language = getLanguage();
  if (state.language !== language) {
    state.language = language;
    state.dirty = true;
    if (state.overlay) {
      const text = integ5Text(language);
      state.overlay.setAttribute('aria-label', text.film);
      state.overlay.querySelector('[data-m6-film="skip"]').textContent = text.skip;
    }
  }
  const dt = state.last === null ? 0 : Math.max(0, now - state.last); state.last = now;
  const expression = elderExpression(game.sim);
  if (state.expression !== expression) {
    state.expression = expression;
    for (const canvas of state.canvases) if (canvas.dataset.art === 'drawElderPortrait') paintStatic(canvas, game, state);
  }
  if (state.dirty) { state.dirty = false; decorate(state, game); }
  const result = game.sim.exodus?.result ?? null;
  if (result !== state.result) {
    if (state.cinematic.active) closeFilm(state, true);
    state.result = result; state.film = null; state.cast = null;
    if (result?.type === 'exodus') { state.cast = exodusCast(game.sim); if (state.skyCanvas) startFilm(state, game); }
  } else if (result?.type === 'exodus' && state.skyCanvas && !state.film) startFilm(state, game);
  const reduce = Boolean(game.options?.reduceMotion);
  animateM5Vignettes(state.vignettes, now, reduce);
  updateObjectivePulse(state,game,now,reduce);
  if (state.titleCanvas && visible(state.titleCanvas)) {
    state.title ??= createTitleAnimation({seed:game.sim.seed,branding:false,language});
    if (!reduce) state.title.update(dt);
    if (!reduce || state.resize || state.titleTime < 0) {
      const {ctx,width,height} = fit(state.titleCanvas); if (ctx) state.title.draw(ctx,width,height);
      state.titleCanvas.dataset.painted = 'true'; state.titleTime = state.title.time;
    }
  } else { state.title = null; state.titleTime = -1; }
  if (state.film && state.skyCanvas) {
    if (state.cinematic.active && !document.hidden) state.film.update(Math.min(.25,dt));
    Object.assign(state.cinematic, {time:state.film.time,sequence:state.film.sequence});
    if (state.filmCanvas) {
      const {ctx,width,height} = fit(state.filmCanvas); if (ctx) state.film.draw(ctx,width,height,{reduceMotion:reduce,language});
    }
    if (state.resize || state.cinematic.active) {
      const {ctx,width,height} = fit(state.skyCanvas); if (ctx) state.film.draw(ctx,width,height,{reduceMotion:reduce,language});
      state.skyCanvas.dataset.painted = 'true';
    }
    if (state.cinematic.active && state.film.done) closeFilm(state);
  }
  state.resize = false;
}

import { DEFAULT_M6_OPTIONS, M6 } from '../data/m6.js';
import { tr } from '../data/strings.fr.js';

export const DEFAULT_OPTIONS = DEFAULT_M6_OPTIONS;

const STORYTELLERS = Object.freeze(['veilleur', 'chroniqueur', 'implacable']);
// 0 = automatique : la taille suit l'écran (portable, 2K, 4K).
const TEXT_SCALES = Object.freeze([0, 75, 85, 100, 115, 130, 150, 175, 200, 225, 250]);
const MANUAL_TEXT_SCALES = TEXT_SCALES.filter((scale) => scale > 0);
const AUTO_REFERENCE = Object.freeze({ width: 1600, height: 900, min: 85, max: 200 });

// Taille automatique : l'interface garde à peu près la même place qu'en 1600 × 900.
export function autoTextScale(width = globalThis.innerWidth, height = globalThis.innerHeight) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return 100;
  const raw = 100 * Math.min(w / AUTO_REFERENCE.width, h / AUTO_REFERENCE.height);
  return Math.max(AUTO_REFERENCE.min, Math.min(AUTO_REFERENCE.max, Math.round(raw / 5) * 5));
}

export function effectiveTextScale(options, width, height) {
  const scale = Number(options?.textScale);
  return scale > 0 ? Math.min(scale, maxManualTextScale(width, height)) : autoTextScale(width, height);
}

// Plus grande taille que l'écran peut tenir : l'interface garde au moins 1280 × 720 de place.
export function maxTextScale(width = globalThis.innerWidth, height = globalThis.innerHeight) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return MANUAL_TEXT_SCALES.at(-1);
  return Math.max(MANUAL_TEXT_SCALES[0], 100 * Math.min(w / 1280, h / 720));
}

function maxManualTextScale(width, height) {
  const cap = maxTextScale(width, height);
  return MANUAL_TEXT_SCALES.findLast((scale) => scale <= cap);
}

// Pas suivant ou précédent, à partir de la taille réellement affichée.
export function stepTextScale(options, direction, width = globalThis.innerWidth, height = globalThis.innerHeight) {
  const current = effectiveTextScale(options, width, height);
  if (direction > 0) {
    const cap = maxTextScale(width, height);
    return MANUAL_TEXT_SCALES.find((scale) => scale > current && scale <= cap) ?? current;
  }
  return [...MANUAL_TEXT_SCALES].reverse().find((scale) => scale < current) ?? MANUAL_TEXT_SCALES[0];
}
let memoryOptions = { ...DEFAULT_OPTIONS };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeOptions(options = {}) {
  const source = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const number = (value) => typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  const textScale = number(source.textScale);
  const volume = number(source.volume);
  const music = number(source.music);
  return {
    textScale: TEXT_SCALES.includes(textScale) ? textScale : DEFAULT_OPTIONS.textScale,
    colorblind: typeof source.colorblind === 'boolean' ? source.colorblind : DEFAULT_OPTIONS.colorblind,
    volume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : DEFAULT_OPTIONS.volume,
    music: Number.isFinite(music) && music >= 0 && music <= 1 ? music : DEFAULT_OPTIONS.music,
    reduceMotion: typeof source.reduceMotion === 'boolean' ? source.reduceMotion : DEFAULT_OPTIONS.reduceMotion,
  };
}

export function loadM6Options(storage) {
  const target = storage === undefined ? defaultStorage() : storage;
  try {
    const serialized = target?.getItem(M6.OPTIONS_KEY);
    if (serialized === null || serialized === undefined) {
      memoryOptions = target ? { ...DEFAULT_OPTIONS } : normalizeOptions(memoryOptions);
      return { ...memoryOptions };
    }
    memoryOptions = normalizeOptions(JSON.parse(serialized));
  } catch {
    memoryOptions = normalizeOptions(memoryOptions);
  }
  return { ...memoryOptions };
}

export function saveM6Options(options, storage) {
  const normalized = normalizeOptions(options);
  memoryOptions = { ...normalized };
  const target = storage === undefined ? defaultStorage() : storage;
  try {
    target?.setItem(M6.OPTIONS_KEY, JSON.stringify(normalized));
  } catch {
    return { ...memoryOptions };
  }
  return { ...normalized };
}

function storytellerNameKey(id) {
  return `m6Storyteller${id[0].toUpperCase()}${id.slice(1)}`;
}

export function titleMarkup(model = {}) {
  const seed = model.seed ?? 1;
  const selected = STORYTELLERS.includes(model.storyteller) ? model.storyteller : 'chroniqueur';
  const hasSave = Boolean(model.hasSave ?? model.canContinue);
  const credits = Boolean(model.credits);
  const choices = STORYTELLERS.map((id) => {
    const nameKey = storytellerNameKey(id);
    return `<button type="button" class="m6-storyteller-choice ${id === selected ? 'selected' : ''}" data-storyteller-choice="${id}" aria-pressed="${id === selected}">
      <canvas class="storyteller-portrait" data-storyteller="${id}" data-art="drawStorytellerPortrait" role="img" aria-label="${escapeHtml(tr(nameKey))}"></canvas>
      <strong>${escapeHtml(tr(nameKey))}</strong><span>${escapeHtml(tr(`${nameKey}Description`))}</span>
    </button>`;
  }).join('');
  return `<div class="m6-title-layout" data-m6-title-main ${credits ? 'hidden' : ''}>
    <canvas class="title-scene" data-art="drawTitleScene" aria-hidden="true"></canvas>
    <div class="m6-title-content">
      <canvas class="title-logo" data-art="drawLogo" role="img" aria-label="${escapeHtml(tr('m6TitleLogo'))}"></canvas>
      <h1>${escapeHtml(tr('m6Title'))}</h1><p>${escapeHtml(tr('m6Subtitle'))}</p>
      <fieldset class="m6-storytellers"><legend>${escapeHtml(tr('m6StorytellerLabel'))}</legend>${choices}</fieldset>
      <label class="m6-seed-label">${escapeHtml(tr('m6SeedLabel'))}<input type="text" inputmode="numeric" data-m6-seed value="${escapeHtml(seed)}" aria-label="${escapeHtml(tr('m6SeedLabel'))}"></label>
      <button type="button" data-m6-action="randomSeed">${escapeHtml(tr('m6RandomSeed'))}</button>
      <div class="m6-title-actions">
        <button type="button" class="primary" data-m6-action="newGame">${escapeHtml(tr('m6NewGame'))}</button>
        ${hasSave ? `<button type="button" data-m6-action="continue">${escapeHtml(tr('m6Continue'))}</button>` : ''}
        <button type="button" data-m6-action="options">${escapeHtml(tr('m6Options'))}</button>
        <button type="button" data-m6-action="credits">${escapeHtml(tr('m6Credits'))}</button>
      </div>
    </div>
  </div>
  <section class="m6-credits" data-m6-credits ${credits ? '' : 'hidden'} aria-label="${escapeHtml(tr('m6CreditsTitle'))}">
    <h2>${escapeHtml(tr('m6CreditsTitle'))}</h2><p>${escapeHtml(tr('m6CreditsBody'))}</p>
    <button type="button" data-m6-action="back">${escapeHtml(tr('m6Back'))}</button>
  </section>`;
}

export function optionsMarkup(options = DEFAULT_OPTIONS, width, height) {
  const values = normalizeOptions(options);
  const auto = autoTextScale(width, height);
  const max = maxManualTextScale(width, height);
  const scales = TEXT_SCALES.map((scale) => {
    const selected = scale === values.textScale;
    const label = scale === 0 ? tr('m6TextScaleAuto', { value: auto })
      : selected && scale > max ? tr('m6TextScaleLimited', { value: scale, actual: max }) : `${scale} %`;
    return `<option value="${scale}"${selected ? ' selected' : ''}${scale > max ? ' disabled' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
  return `<section class="m6-options-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(tr('m6OptionsTitle'))}">
    <h2>${escapeHtml(tr('m6OptionsTitle'))}</h2>
    <label>${escapeHtml(tr('m6TextScale'))}<select data-m6-option="textScale">${scales}</select></label>
    <label class="m6-check"><input type="checkbox" data-m6-option="colorblind" ${values.colorblind ? 'checked' : ''}><span>${escapeHtml(tr('m6Colorblind'))}</span></label>
    <label>${escapeHtml(tr('m6Volume'))}<input type="range" min="0" max="1" step="0.05" value="${values.volume}" data-m6-option="volume"></label>
    <label>${escapeHtml(tr('m6Music'))}<input type="range" min="0" max="1" step="0.05" value="${values.music}" data-m6-option="music"></label>
    <label class="m6-check"><input type="checkbox" data-m6-option="reduceMotion" ${values.reduceMotion ? 'checked' : ''}><span>${escapeHtml(tr('m6ReduceMotion'))}</span></label>
    <button type="button" data-m6-action="closeOptions">${escapeHtml(tr('m6Back'))}</button>
  </section>`;
}

function pauseMarkup() {
  return `<section class="m6-pause-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(tr('m6PauseTitle'))}">
    <h2>${escapeHtml(tr('m6PauseTitle'))}</h2>
    <button type="button" class="primary" data-m6-action="resume">${escapeHtml(tr('m6Resume'))}</button>
    <button type="button" data-m6-action="save">${escapeHtml(tr('m6Save'))}</button>
    <button type="button" data-m6-action="options">${escapeHtml(tr('m6Options'))}</button>
    <button type="button" data-m6-action="quit">${escapeHtml(tr('m6Quit'))}</button>
  </section>`;
}

function seedValue(value) {
  const text = String(value ?? '').trim();
  if (/^\d{1,10}$/.test(text)) {
    const number = Number(text);
    if (Number.isSafeInteger(number) && number <= 0xffffffff) return number;
  }
  return text || 1;
}

function randomSeed() {
  try {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return values[0];
    }
  } catch {
    return Math.floor(Math.random() * 0x100000000);
  }
  return Math.floor(Math.random() * 0x100000000);
}

export class M6Shell {
  constructor(game, { showTitle = false, storage } = {}) {
    this.game = game;
    this.storage = storage;
    this.seed = 1;
    this.storyteller = 'chroniqueur';
    this.titleVisible = Boolean(showTitle);
    this.pauseVisible = false;
    this.optionsVisible = false;
    this.creditsOpen = false;
    this.optionsReturnTo = showTitle ? 'title' : 'pause';
    this.previousSpeed = game.speed > 0 ? game.speed : game.previousSpeed || 1;
    this.game.options = loadM6Options(storage);
    this.root = null;
    this.titleRoot = null;
    this.pauseRoot = null;
    this.optionsRoot = null;
    this.titleSignature = '';
    this.optionsSignature = '';
    this.createRoots();
    this.applyOptions();
    if (this.titleVisible) this.setSpeed(0);
    this.refresh();
  }

  createRoots() {
    const document = globalThis.document;
    if (!document?.createElement) return;
    this.root = document.createElement('div');
    this.root.className = 'm6-shell';
    this.root.dataset.m6Shell = '';
    this.titleRoot = document.createElement('div');
    this.titleRoot.className = 'm6-title-screen';
    this.titleRoot.dataset.m6Screen = 'title';
    this.pauseRoot = document.createElement('div');
    this.pauseRoot.className = 'm6-pause-screen';
    this.pauseRoot.dataset.m6Screen = 'pause';
    this.optionsRoot = document.createElement('div');
    this.optionsRoot.className = 'm6-options-screen';
    this.optionsRoot.dataset.m6Screen = 'options';
    this.root.append(this.titleRoot, this.pauseRoot, this.optionsRoot);
    (document.body ?? document.documentElement)?.append(this.root);
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('input', (event) => this.onInput(event));
    this.root.addEventListener('change', (event) => this.onInput(event));
  }

  applyOptions() {
    this.game.options = normalizeOptions(this.game.options);
    const document = globalThis.document;
    this.textScale = effectiveTextScale(this.game.options);
    document?.documentElement?.style?.setProperty('--m6-text-scale', String(this.textScale / 100));
    this.game.ui?.refreshInterfaceScale?.(this.textScale,
      stepTextScale(this.game.options, -1) < this.textScale, stepTextScale(this.game.options, 1) > this.textScale);
    if (!this.resizeListener && typeof globalThis.addEventListener === 'function') {
      this.resizeListener = () => {
        this.optionsSignature = '';
        this.applyOptions();
        if (this.optionsVisible) this.refresh();
      };
      globalThis.addEventListener('resize', this.resizeListener);
    }
  }

  // Touches + et − : agrandir ou réduire toute l'interface, sans toucher au zoom du navigateur.
  stepTextScale(direction) {
    const textScale = stepTextScale(this.game.options, direction);
    if (textScale === this.textScale) return textScale;
    this.game.options = saveM6Options({ ...this.game.options, textScale }, this.storage);
    this.applyOptions();
    this.optionsSignature = '';
    this.refresh();
    const toast = globalThis.document?.querySelector?.('#toast');
    if (toast) {
      clearTimeout(this.scaleToastTimer);
      toast.textContent = tr('m6TextScaleToast', { value: textScale });
      toast.classList.add('visible');
      this.scaleToastTimer = setTimeout(() => toast.classList.remove('visible'), 1600);
    }
    return textScale;
  }

  hasSave() {
    const target = this.storage === undefined ? defaultStorage() : this.storage;
    try {
      const saved = target?.getItem(M6.SAVE_KEY);
      return saved !== null && saved !== undefined;
    } catch {
      return false;
    }
  }

  setSpeed(speed) {
    if (this.game.setSpeed) this.game.setSpeed(speed);
    else this.game.speed = speed;
  }

  showTitle() {
    if (!this.titleVisible && this.game.speed > 0) this.previousSpeed = this.game.speed;
    this.titleVisible = true;
    this.pauseVisible = false;
    this.optionsVisible = false;
    this.creditsOpen = false;
    this.optionsReturnTo = 'title';
    this.setSpeed(0);
    this.refresh();
  }

  hideTitle() {
    this.titleVisible = false;
    this.creditsOpen = false;
    if (this.optionsReturnTo === 'title') this.optionsVisible = false;
    this.refresh();
  }

  openPause() {
    if (this.titleVisible || this.game.sim?.exodus?.result) return false;
    this.previousSpeed = this.game.speed > 0 ? this.game.speed : this.game.previousSpeed || this.previousSpeed || 1;
    this.setSpeed(0);
    this.pauseVisible = true;
    this.optionsVisible = false;
    this.creditsOpen = false;
    this.optionsReturnTo = 'pause';
    this.refresh();
    return true;
  }

  resume() {
    if (this.titleVisible || this.game.sim?.exodus?.result) return false;
    this.pauseVisible = false;
    this.optionsVisible = false;
    this.setSpeed(this.previousSpeed || this.game.previousSpeed || 1);
    this.refresh();
    return true;
  }

  handleEscape() {
    if (this.optionsVisible) {
      this.closeOptions();
      return true;
    }
    if (this.creditsOpen) {
      this.creditsOpen = false;
      this.refresh();
      return true;
    }
    if (this.pauseVisible) return this.resume();
    if (this.titleVisible || this.game.sim?.exodus?.result) return false;
    return this.openPause();
  }

  openOptions(returnTo) {
    const destination = returnTo ?? (this.titleVisible ? 'title' : 'pause');
    this.optionsReturnTo = destination === 'title' ? 'title' : 'pause';
    if (this.optionsReturnTo === 'title') {
      this.titleVisible = true;
      this.pauseVisible = false;
    } else {
      if (this.titleVisible || this.game.sim?.exodus?.result) return false;
      if (this.game.speed > 0) this.previousSpeed = this.game.speed;
      this.titleVisible = false;
      this.pauseVisible = true;
      this.setSpeed(0);
    }
    this.creditsOpen = false;
    this.optionsVisible = true;
    this.refresh();
    return true;
  }

  closeOptions() {
    if (!this.optionsVisible) return false;
    this.optionsVisible = false;
    if (this.optionsReturnTo === 'title') {
      this.titleVisible = true;
      this.pauseVisible = false;
    } else {
      this.titleVisible = false;
      this.pauseVisible = !this.game.sim?.exodus?.result;
    }
    this.refresh();
    return true;
  }

  refresh() {
    if (this.titleVisible) this.pauseVisible = false;
    if (this.game.sim?.exodus?.result) {
      this.pauseVisible = false;
      this.optionsVisible = false;
      this.creditsOpen = false;
    }
    if (this.titleRoot) {
      const signature = JSON.stringify([this.seed, this.storyteller, this.hasSave(), this.creditsOpen]);
      if (signature !== this.titleSignature) {
        this.titleRoot.innerHTML = titleMarkup({
          seed: this.seed, storyteller: this.storyteller, hasSave: this.hasSave(), credits: this.creditsOpen,
        });
        this.titleSignature = signature;
      }
    }
    if (this.pauseRoot && !this.pauseRoot.innerHTML) this.pauseRoot.innerHTML = pauseMarkup();
    if (this.optionsRoot) {
      const signature = JSON.stringify(this.game.options);
      if (signature !== this.optionsSignature) {
        this.optionsRoot.innerHTML = optionsMarkup(this.game.options);
        this.optionsSignature = signature;
      }
    }
    if (this.titleRoot) this.titleRoot.hidden = !this.titleVisible || this.optionsVisible;
    if (this.pauseRoot) this.pauseRoot.hidden = !this.pauseVisible || this.optionsVisible;
    if (this.optionsRoot) this.optionsRoot.hidden = !this.optionsVisible;
    if (this.root) this.root.hidden = !this.titleVisible && !this.pauseVisible && !this.optionsVisible;
  }

  readSeed() {
    const input = this.titleRoot?.querySelector('[data-m6-seed]');
    if (input) this.seed = input.value;
    return seedValue(this.seed);
  }

  handleOption(target) {
    const key = target?.dataset?.m6Option;
    if (!Object.hasOwn(DEFAULT_OPTIONS, key)) return false;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    this.game.options = saveM6Options({ ...this.game.options, [key]: value }, this.storage);
    this.applyOptions();
    this.refresh();
    return true;
  }

  handleAction(action) {
    if (action === 'newGame') {
      const seed = this.readSeed();
      this.game.startNewGame({ seed, storyteller: this.storyteller });
      this.hideTitle();
      return true;
    }
    if (action === 'randomSeed') {
      this.seed = randomSeed();
      this.refresh();
      return true;
    }
    if (action === 'continue') {
      const loaded = this.game.loadLocal();
      if (loaded !== false) {
        this.hideTitle();
        this.setSpeed(this.previousSpeed || 1);
      }
      return loaded !== false;
    }
    if (action === 'options') return this.openOptions(this.titleVisible ? 'title' : 'pause');
    if (action === 'credits') {
      this.titleVisible = true;
      this.pauseVisible = false;
      this.optionsVisible = false;
      this.creditsOpen = true;
      this.refresh();
      return true;
    }
    if (action === 'resume') return this.resume();
    if (action === 'save') {
      this.game.saveLocal();
      return true;
    }
    if (action === 'quit') {
      this.showTitle();
      return true;
    }
    if (action === 'closeOptions') return this.closeOptions();
    if (action === 'back') {
      if (this.optionsVisible) return this.closeOptions();
      if (this.creditsOpen) {
        this.creditsOpen = false;
        this.refresh();
        return true;
      }
    }
    return false;
  }

  onClick(event) {
    const choice = event.target.closest?.('[data-storyteller-choice]');
    if (choice && this.root?.contains(choice)) {
      const id = choice.dataset.storytellerChoice;
      if (STORYTELLERS.includes(id)) {
        this.storyteller = id;
        this.refresh();
      }
      return;
    }
    const button = event.target.closest?.('[data-m6-action]');
    if (button && this.root?.contains(button)) this.handleAction(button.dataset.m6Action, button);
  }

  onInput(event) {
    const target = event.target;
    if (target?.dataset?.m6Seed !== undefined) {
      this.seed = target.value;
      return;
    }
    if (target?.dataset?.m6Option) this.handleOption(target);
  }
}

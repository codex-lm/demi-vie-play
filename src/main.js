import { Game } from './game.js';
import { applyGameLanguage, applyTheme, loadLanguage, loadM6Options, M6Shell } from './ui/m6Shell.js';
import { DEFAULT_SPEED, speedFromRequest } from './data/speeds.js';

applyGameLanguage(loadLanguage());
applyTheme(loadM6Options().theme);
const params = new URLSearchParams(location.search);
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const speed = speedFromRequest(Number.parseInt(params.get('speed') ?? String(DEFAULT_SPEED), 10));
const game = new Game({
  canvas: document.querySelector('#game-canvas'),
  seed,
  speed,
  storyteller: params.get('storyteller') ?? params.get('conteur') ?? 'chroniqueur',
  scenario: params.get('scenario'),
  reveal: params.get('reveal') === '1',
  debug: params.get('debug') === '1',
});
game.m6Shell = new M6Shell(game, { showTitle: params.size === 0 });

window.__demi = {
  game,
  get sim() { return game.sim; },
  apply: (order) => game.apply(order),
  step: (n) => game.step(n),
  digest: () => game.digest(),
  screenshot: () => game.screenshot(),
};

game.start();

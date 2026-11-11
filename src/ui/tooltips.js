import { WORLD } from '../data/balance.js';
import { DEPOSITS, materialAt } from '../data/materials.js';
import { tr } from '../data/strings.fr.js';

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const decimalFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function formatNumber(value, integer = false) {
  const number = Number(value);
  if (number === Infinity) return '∞';
  if (number === -Infinity) return '−∞';
  if (!Number.isFinite(number)) return tr('unknown');
  return (integer ? integerFormatter : numberFormatter).format(number);
}

export function formatTemperature(value) {
  const number = Number(value);
  return Number.isFinite(number) ? decimalFormatter.format(number) : tr('unknown');
}

export function formatDose(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return tr('unknown');
  return (Math.abs(number) >= 100 ? integerFormatter : decimalFormatter).format(number);
}

export function formatDoseRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return tr('unknown');
  return (Math.abs(number) >= 1 ? decimalFormatter : numberFormatter).format(number);
}

function translatedValue(key, value) {
  if (value === undefined || value === null) return tr('unknown');
  if (key === 'material') return tr(String(value));
  if (['span', 'max', 'slab', 'required', 'width', 'depth'].includes(key)) return formatNumber(value);
  if (key === 'factor') return formatNumber(value, false);
  return String(value);
}

export function reasonText(reason) {
  if (!reason) return '';
  if (typeof reason === 'string') return tr(reason);
  const values = { ...(reason.values ?? {}) };
  const aliases = {
    max: values.max ?? values.maxSpan,
    required: values.required ?? values.requiredSlab ?? values.requiredWall,
    width: values.width ?? values.wall ?? values.wallWidth,
    material: values.material ?? values.materialKey,
  };
  for (const [key, value] of Object.entries(aliases)) {
    if (value !== undefined) values[key] = value;
  }
  const translated = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, translatedValue(key, value)]));
  return tr(reason.code, translated);
}

export class Tooltip {
  constructor(root = document.querySelector('#tooltip')) {
    this.root = root;
    this.hide();
  }

  hide() {
    if (this.root) this.root.hidden = true;
  }

  showCell(game, cell, clientX, clientY) {
    if (!this.root || !cell || !game.sim.world.inBounds(cell.x, cell.y)) {
      this.hide();
      return;
    }
    const { world } = game.sim;
    const index = world.index(cell.x, cell.y);
    const material = materialAt(world.materials[index]);
    const rows = [
      tr(material.key),
      tr('cellPosition', { x: cell.x, y: cell.y }),
    ];
    if (cell.y >= WORLD.SURFACE_Y) rows.push(tr('depthValue', { value: cell.y - WORLD.SURFACE_Y }));
    const deposit = DEPOSITS[world.deposits[index]];
    if (deposit && deposit !== 'none' && world.visibility[index]) rows.push(tr('deposit', { value: tr(deposit) }));
    this.root.replaceChildren();
    for (const [rowIndex, text] of rows.entries()) {
      const row = document.createElement(rowIndex === 0 ? 'strong' : 'span');
      row.textContent = text;
      this.root.append(row);
    }
    this.root.hidden = false;
    const shell = document.querySelector('#game-shell');
    const bounds = shell?.getBoundingClientRect();
    const left = clientX - (bounds?.left ?? 0) + 16;
    const top = clientY - (bounds?.top ?? 0) + 18;
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--m6-text-scale')) || 1;
    this.root.style.left = `${Math.min(left, (bounds?.width ?? innerWidth) - 220 * scale)}px`;
    this.root.style.top = `${Math.min(top, (bounds?.height ?? innerHeight) - 100 * scale)}px`;
  }
}

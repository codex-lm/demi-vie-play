import { CAMERA } from '../data/balance.js';
import { hitTestColonist } from '../render/colonists.js';
import { supportedProspect } from '../sim/structure.js';

const PAN_KEYS = new Set(['KeyZ', 'KeyW', 'KeyQ', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const SPEEDS = [0, 1, 3, 10, 30];

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest('button, select, input, textarea, [contenteditable="true"]'));
}

export class InputController {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.keys = new Set();
    this.drawing = false;
    this.panning = false;
    this.pointerId = null;
    this.startCell = null;
    this.lastCell = null;
    this.previousOverlay = null;
    this.startClient = null;
    this.lastClient = null;
    this.panMoved = false;
    this.canvas.tabIndex = 0;
    this.canvas.dataset.tool = game.tool.type;
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', () => this.cancel());
    this.canvas.addEventListener('pointerleave', () => this.game.ui.hideTooltip?.());
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    window.addEventListener('blur', () => this.cancel());
  }

  pointerPosition(event) {
    const bounds = this.canvas.getBoundingClientRect();
    const screenX = (event.clientX - bounds.left) * this.canvas.clientWidth / bounds.width;
    const screenY = (event.clientY - bounds.top) * this.canvas.clientHeight / bounds.height;
    const world = this.game.camera.screenToWorld(screenX, screenY);
    return {
      screenX,
      screenY,
      world,
      cell: { x: Math.floor(world.x), y: Math.floor(world.y) },
    };
  }

  onPointerDown(event) {
    const position = this.pointerPosition(event);
    this.game.hover = position.cell;
    this.canvas.focus({ preventScroll: true });
    if (event.button === 2 || event.button === 1) {
      event.preventDefault();
      this.panning = true;
      this.pointerId = event.pointerId;
      this.startClient = { x: event.clientX, y: event.clientY };
      this.lastClient = { ...this.startClient };
      this.panMoved = false;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('panning');
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    const tool = this.game.tool;
    if (tool.type === 'dig') {
      this.drawing = true;
      this.pointerId = event.pointerId;
      this.startCell = position.cell;
      this.lastCell = null;
      this.previousOverlay = this.game.overlay;
      this.game.overlay = 'constraints';
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('drawing');
      this.updateDrag(position.cell);
    } else if (tool.type === 'support') {
      this.applyTargetedOrder(tool, position.cell);
    } else if (tool.type === 'door') {
      this.applyTargetedOrder(tool, position.cell);
    } else {
      this.selectAt(position.world);
    }
  }

  onPointerMove(event) {
    const position = this.pointerPosition(event);
    this.game.hover = position.cell;
    if (this.panning && event.pointerId === this.pointerId) {
      const totalDistance = Math.hypot(event.clientX - this.startClient.x, event.clientY - this.startClient.y);
      if (totalDistance > 4) this.panMoved = true;
      if (this.panMoved) {
        this.game.camera.pan(this.lastClient.x - event.clientX, this.lastClient.y - event.clientY);
        this.game.ui.hideTooltip?.();
      }
      this.lastClient = { x: event.clientX, y: event.clientY };
      return;
    }
    if (this.drawing && event.pointerId === this.pointerId) {
      this.updateDrag(position.cell);
      this.game.ui.hideTooltip?.();
      return;
    }
    this.game.ui.updateTooltip?.(position.cell, event.clientX, event.clientY);
  }

  onPointerUp(event) {
    if (this.drawing && event.pointerId === this.pointerId) {
      this.updateDrag(this.pointerPosition(event).cell);
      const order = { ...this.game.tool, type: 'dig', ...this.game.drag };
      const result = this.game.apply(order);
      if (!result?.ok) this.game.ui.toast(result?.error ?? 'actionFailed');
      this.endDrawing(true);
    }
    if (this.panning && event.pointerId === this.pointerId) {
      const wasRightClick = event.button === 2;
      const shouldCancel = wasRightClick && !this.panMoved;
      this.endPanning();
      if (shouldCancel) this.game.setTool({ type: 'select' });
    }
  }

  applyTargetedOrder(tool, cell) {
    const excavationId = tool.excavationId ?? (this.game.selection?.type === 'excavation' ? this.game.selection.id : null);
    const excavation = this.game.sim.excavation(excavationId);
    if (!excavation || excavation.state === 'collapsed') {
      this.game.ui.toast('noTarget');
      return;
    }
    if (tool.type === 'support') {
      if (cell.x < excavation.x || cell.x >= excavation.x + excavation.w || cell.y < excavation.y || cell.y >= excavation.y + excavation.h) {
        this.game.ui.toast('invalidPlacement');
        return;
      }
      this.game.ui.applyOrder({ type: 'support', excavationId, x: cell.x, material: tool.material ?? 'wood' });
    } else if (tool.type === 'door') {
      this.game.ui.applyOrder({ type: 'door', excavationId, x: cell.x, y: cell.y });
    }
  }

  selectAt(point) {
    const colonist = hitTestColonist(this.game, point);
    if (colonist) {
      this.game.select({ type: 'colonist', id: colonist.id });
      return;
    }
    const excavations = [...this.game.sim.excavations].reverse();
    const excavation = excavations.find((item) => point.x >= item.x && point.x < item.x + item.w
      && point.y >= item.y && point.y < item.y + item.h);
    this.game.select(excavation ? { type: 'excavation', id: excavation.id } : null);
  }

  updateDrag(cell) {
    if (!this.drawing || (this.lastCell && cell.x === this.lastCell.x && cell.y === this.lastCell.y)) return;
    this.lastCell = cell;
    this.game.drag = {
      x: Math.min(this.startCell.x, cell.x),
      y: Math.min(this.startCell.y, cell.y),
      w: Math.abs(cell.x - this.startCell.x) + 1,
      h: Math.abs(cell.y - this.startCell.y) + 1,
    };
    this.refreshPreview();
  }

  refreshPreview() {
    if (!this.drawing || !this.game.drag) return;
    const order = { ...this.game.tool, type: 'dig', ...this.game.drag };
    const preview = this.game.sim.preview(order);
    const withSupport = preview.ok !== false && preview.color !== 'green' ? supportedProspect(this.game.sim, order) : null;
    this.game.currentPreview = { ...preview, order, withSupport };
    this.game.overlay = 'constraints';
    this.game.ui.refreshPreview?.();
  }

  endDrawing(restoreOverlay) {
    if (this.pointerId !== null && this.canvas.hasPointerCapture(this.pointerId)) this.canvas.releasePointerCapture(this.pointerId);
    this.drawing = false;
    this.pointerId = null;
    this.startCell = null;
    this.lastCell = null;
    this.game.drag = null;
    this.game.currentPreview = null;
    this.canvas.classList.remove('drawing');
    const overlay = restoreOverlay ? this.previousOverlay : null;
    this.previousOverlay = null;
    if (overlay !== null) {
      if (this.game.setOverlay) this.game.setOverlay(overlay);
      else {
        this.game.overlay = overlay;
        this.game.ui.refresh?.();
      }
    }
    this.game.ui.refreshPreview?.();
    this.game.ui.refreshOverlay?.();
    if (overlay !== null) this.game.ui.selectionPanel?.refresh?.();
  }

  endPanning() {
    if (this.pointerId !== null && this.canvas.hasPointerCapture(this.pointerId)) this.canvas.releasePointerCapture(this.pointerId);
    this.panning = false;
    this.pointerId = null;
    this.startClient = null;
    this.lastClient = null;
    this.canvas.classList.remove('panning');
  }

  onWheel(event) {
    event.preventDefault();
    const position = this.pointerPosition(event);
    this.game.camera.zoomAt(Math.exp(-event.deltaY * 0.001), position.screenX, position.screenY);
  }

  onKeyDown(event) {
    if (PAN_KEYS.has(event.code) && !isInteractiveTarget(event.target)) {
      event.preventDefault();
      this.keys.add(event.code);
      return;
    }
    if (event.repeat) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (this.game.ui.m4Panels?.closeModal()) return;
      if (this.game.ui.m5Panels?.close?.()) return;
      if (this.game.ui.m6Panels?.close?.()) return;
      if (this.game.m6Shell?.handleEscape()) return;
      if (this.game.m6Shell?.titleVisible) return;
      this.cancel();
      this.game.setTool({ type: 'select' });
      return;
    }
    if (this.game.m6Shell?.titleVisible || this.game.m6Shell?.pauseVisible || this.game.m6Shell?.optionsVisible) return;
    if (isInteractiveTarget(event.target)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.game.togglePause();
    } else if (/^(Digit|Numpad)[1-5]$/.test(event.code)) {
      event.preventDefault();
      this.game.setSpeed(SPEEDS[Number(event.code.at(-1)) - 1]);
    } else if (event.code === 'KeyO') {
      event.preventDefault();
      this.game.ui.cycleOverlay();
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && ['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      this.game.m6Shell?.stepTextScale?.(event.key === '+' || event.key === '=' ? 1 : -1);
    }
  }

  onKeyUp(event) {
    this.keys.delete(event.code);
  }

  update(dt) {
    if (this.canvas.dataset.tool !== this.game.tool.type) this.canvas.dataset.tool = this.game.tool.type;
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('KeyQ') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('KeyZ') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (!x && !y) return;
    const length = Math.hypot(x, y);
    const distance = CAMERA.PAN_SPEED * this.game.camera.cellSize(this.game.camera.targetZoom) * dt / length;
    this.game.camera.pan(x * distance, y * distance);
  }

  cancel() {
    this.keys.clear();
    if (this.drawing) this.endDrawing(true);
    if (this.panning) this.endPanning();
    this.pointerId = null;
    this.startCell = null;
    this.lastCell = null;
    this.startClient = null;
    this.lastClient = null;
    this.panMoved = false;
    this.game.drag = null;
    this.game.currentPreview = null;
    this.canvas.classList.remove('drawing', 'panning');
    this.game.ui.hideTooltip?.();
    this.game.ui.refreshPreview?.();
  }
}

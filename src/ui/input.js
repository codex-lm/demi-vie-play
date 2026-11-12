import { CAMERA } from '../data/balance.js';
import { speedForDigit } from '../data/speeds.js';
import { hitTestColonist } from '../render/colonists.js';
import { supportedProspect } from '../sim/structure.js';

const PAN_KEYS = new Set(['KeyZ', 'KeyW', 'KeyQ', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
// A finger wobbles more than a mouse: below this many pixels a touch is a tap.
const TOUCH_TAP_SLOP = 8;

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
    this.touches = new Map();
    this.touchMode = null;
    this.touchTap = null;
    this.pinch = null;
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
    // A finger lifted over a panel must still end its touch here.
    for (const type of ['pointerup', 'pointercancel']) {
      window.addEventListener(type, (event) => { if (event.pointerType === 'touch') this.onTouchUp(event); });
    }
    const page = globalThis.document;
    // Safari's own pinch gesture would zoom the whole page, interface included.
    // It reports a trackpad pinch as gesture events, never as a ctrl+wheel.
    this.gestureScale = 1;
    page?.addEventListener?.('gesturestart', (event) => { event.preventDefault(); this.gestureScale = 1; });
    page?.addEventListener?.('gesturechange', (event) => this.onGestureChange(event));
    // A trackpad pinch over a panel or a menu would zoom the whole page too.
    page?.addEventListener?.('wheel', (event) => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
  }

  onGestureChange(event) {
    event.preventDefault();
    // A touchscreen pinch already zooms through the pointer events.
    if (this.touches.size > 0 || event.target !== this.canvas || !(event.scale > 0)) return;
    const point = Number.isFinite(event.clientX) ? this.screenPoint(event.clientX, event.clientY)
      : { x: this.canvas.clientWidth / 2, y: this.canvas.clientHeight / 2 };
    this.game.camera.zoomAt(event.scale / this.gestureScale, point.x, point.y);
    this.gestureScale = event.scale;
  }

  screenPoint(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - bounds.left) * this.canvas.clientWidth / bounds.width,
      y: (clientY - bounds.top) * this.canvas.clientHeight / bounds.height,
    };
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

  startPanning(event) {
    this.panning = true;
    this.pointerId = event.pointerId;
    this.startClient = { x: event.clientX, y: event.clientY };
    this.lastClient = { ...this.startClient };
    this.panMoved = false;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('panning');
  }

  startDrawing(event, cell) {
    this.drawing = true;
    this.pointerId = event.pointerId;
    this.startCell = cell;
    this.lastCell = null;
    this.previousOverlay = this.game.overlay;
    this.game.overlay = 'constraints';
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('drawing');
    this.updateDrag(cell);
  }

  // A click, or a finger tap: place with the support and door tools, select otherwise.
  actAt(position) {
    const tool = this.game.tool;
    if (tool.type === 'support' || tool.type === 'door') this.applyTargetedOrder(tool, position.cell);
    else this.selectAt(position.world);
  }

  finishDrawing(event) {
    this.updateDrag(this.pointerPosition(event).cell);
    const order = { ...this.game.tool, type: 'dig', ...this.game.drag };
    const result = this.game.apply(order);
    if (!result?.ok) this.game.ui.toast(result?.error ?? 'actionFailed');
    this.endDrawing(true);
  }

  onPointerDown(event) {
    if (event.pointerType === 'touch') {
      this.onTouchDown(event);
      return;
    }
    // One gesture at a time: a press is ignored while a finger, or another pointer, is at work.
    if (this.touches.size > 0 || ((this.drawing || this.panning) && event.pointerId !== this.pointerId)) return;
    const position = this.pointerPosition(event);
    this.game.hover = position.cell;
    this.canvas.focus({ preventScroll: true });
    if (event.button === 2 || event.button === 1) {
      event.preventDefault();
      this.startPanning(event);
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    if (this.game.tool.type === 'dig') this.startDrawing(event, position.cell);
    else this.actAt(position);
  }

  // Touch. One finger draws with the dig tool; with any other tool it drags
  // the map, and a tap selects or places. Two fingers pan and zoom the map.
  // The page itself never zooms (touch-action in ui.css), so the map stays
  // sharp and the interface stays on the edges of the screen.
  onTouchDown(event) {
    event.preventDefault();
    // The mouse is drawing or dragging: the finger waits.
    if ((this.drawing || this.panning) && this.touchMode === null) return;
    // A first finger means no other is down: anything still tracked is stale.
    if (event.isPrimary && this.touches.size > 0) this.cancel();
    this.canvas.focus({ preventScroll: true });
    this.game.ui.hideTooltip?.();
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touches.size >= 2) {
      if (this.drawing) this.endDrawing(true);
      if (this.panning) this.endPanning();
      this.touchTap = null;
      this.touchMode = 'pinch';
      // Ending the drawing or the drag released the first finger: hold every
      // finger again, so one lifted over a panel still ends here.
      for (const id of this.touches.keys()) {
        try { this.canvas.setPointerCapture(id); } catch { /* that finger is already gone */ }
      }
      this.pinch = this.pinchState();
      return;
    }
    const position = this.pointerPosition(event);
    this.game.hover = position.cell;
    if (this.game.tool.type === 'dig') {
      this.touchMode = 'draw';
      this.startDrawing(event, position.cell);
    } else {
      this.touchMode = 'drag';
      this.touchTap = position;
      this.startPanning(event);
    }
  }

  // Midpoint (canvas pixels) and spread of the first two fingers.
  pinchState() {
    const [first, second] = [...this.touches.values()];
    const middle = this.screenPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
    return { ...middle, distance: Math.hypot(first.x - second.x, first.y - second.y) };
  }

  onTouchMove(event) {
    if (!this.touches.has(event.pointerId)) return;
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touchMode === 'pinch') {
      if (this.touches.size < 2) return;
      const next = this.pinchState();
      const camera = this.game.camera;
      camera.pan(this.pinch.x - next.x, this.pinch.y - next.y);
      if (this.pinch.distance > 0 && next.distance > 0) camera.zoomAt(next.distance / this.pinch.distance, next.x, next.y, false);
      this.pinch = next;
      return;
    }
    if (event.pointerId !== this.pointerId) return;
    if (this.touchMode === 'draw' && this.drawing) {
      const position = this.pointerPosition(event);
      this.game.hover = position.cell;
      this.updateDrag(position.cell);
    } else if (this.touchMode === 'drag' && this.panning) {
      const totalDistance = Math.hypot(event.clientX - this.startClient.x, event.clientY - this.startClient.y);
      if (totalDistance > TOUCH_TAP_SLOP) this.panMoved = true;
      if (this.panMoved) this.game.camera.pan(this.lastClient.x - event.clientX, this.lastClient.y - event.clientY);
      this.lastClient = { x: event.clientX, y: event.clientY };
    }
  }

  onTouchUp(event) {
    if (!this.touches.delete(event.pointerId)) return;
    if (this.touchMode === 'pinch') {
      // A finger left after a pinch does nothing until it is lifted too.
      if (this.touches.size >= 2) this.pinch = this.pinchState();
      else if (this.touches.size === 0) this.endTouch();
      return;
    }
    if (event.pointerId === this.pointerId) {
      if (this.touchMode === 'draw' && this.drawing) this.finishDrawing(event);
      else if (this.touchMode === 'drag' && this.panning) {
        const tap = this.panMoved ? null : this.touchTap;
        this.endPanning();
        if (tap) this.actAt(tap);
      }
    }
    if (this.touches.size === 0) this.endTouch();
  }

  endTouch() {
    this.touches.clear();
    this.touchMode = null;
    this.touchTap = null;
    this.pinch = null;
  }

  onPointerMove(event) {
    if (event.pointerType === 'touch') {
      this.onTouchMove(event);
      return;
    }
    if (this.touches.size > 0) return;
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
    if (event.pointerType === 'touch') {
      this.onTouchUp(event);
      return;
    }
    if (this.touches.size > 0) return;
    if (this.drawing && event.pointerId === this.pointerId) this.finishDrawing(event);
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
    // A trackpad pinch arrives as a wheel with ctrlKey and small steps.
    // Ctrl with a real mouse wheel sends big steps: capped to one ordinary notch.
    const step = event.ctrlKey ? Math.max(-0.1, Math.min(0.1, event.deltaY * 0.01)) : event.deltaY * 0.001;
    this.game.camera.zoomAt(Math.exp(-step), position.screenX, position.screenY);
  }

  onKeyDown(event) {
    if (this.game.m6Shell?.opening) {
      this.game.m6Shell.opening.onKeyDown(event);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 'z') {
      const shell = this.game.m6Shell;
      const ui = this.game.ui;
      if (event.defaultPrevented || event.shiftKey || event.altKey
        || event.target?.isContentEditable || event.target?.closest?.('input, textarea, select')
        || shell?.titleVisible || shell?.pauseVisible || shell?.optionsVisible
        || ui.m4Panels?.modal || ui.m5Panels?.modal || ui.m6Panels?.modal || ui.tokenBoard?.opened) return;
      event.preventDefault();
      if (!event.repeat) {
        if (this.drawing) this.cancel();
        else ui.buildMenu?.undoLastDig();
      }
      return;
    }
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
      this.game.setSpeed(speedForDigit(event.code.at(-1)));
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
    if (this.game.m6Shell?.opening) this.game.m6Shell.opening.onKeyUp(event);
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
    this.endTouch();
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

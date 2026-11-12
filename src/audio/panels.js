// Observe presentation transitions; never attach sounds to a simulation order.
export function panelSnapshot(game) {
  return [
    game.selection ? `selection:${game.selection.type}:${game.selection.id}` : '',
    game.ui?.buildMenu?.tab ? `tab:${game.ui.buildMenu.tab}` : '',
    game.m6Shell?.optionsVisible ? 'options' : '',
    game.m6Shell?.pauseVisible ? 'pause' : '',
    game.ui?.m4Panels?.modal ? `m4:${game.ui.m4Panels.modal.type}` : '',
    game.ui?.m5Panels?.modal ? `m5:${game.ui.m5Panels.modal.type}` : '',
    game.ui?.m6Panels?.modal ? `m6:${game.ui.m6Panels.modal}` : '',
    game.ui?.m6Panels?.waterOpen ? 'water' : '',
  ].filter(Boolean);
}

export function panelTransition(current, previous, now) {
  const changed = previous && current.join('|') !== previous.panels.join('|');
  const allowed = changed && now >= previous.next;
  const opening = allowed && current.some(key => !previous.panels.includes(key));
  return {
    state: { panels: current, next: allowed ? now + 0.25 : previous?.next ?? 0 },
    cue: allowed ? { type: 'panel', assetId: `sfx.ui.panel.${opening ? 'open' : 'close'}`, gain: 0.65 } : null,
  };
}

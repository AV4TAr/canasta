import * as G from '../engine/game.js';
import { render } from './render.js';

// Estado UI (no parte del estado del juego)
const ui = {
  hotSeat: true,         // ambas manos visibles según turno (modo local)
  viewerIdx: 0,          // se usa cuando haya P2P
  selection: new Set(),  // ids de cartas seleccionadas
  selectedMeldId: null,
};

let state = G.newGame({ targetScore: 5000 });

function flash(msg) {
  state.message = msg;
  render(state, ui);
}

function clearSelection() {
  ui.selection = new Set();
  ui.selectedMeldId = null;
}

function currentPlayer() { return state.turn; }

function selectedIds() { return Array.from(ui.selection); }

function rerender() { render(state, ui); }

// ─────────── botones ───────────
document.getElementById('btn-new-round').addEventListener('click', () => {
  if (state.phase !== 'gameStart' && state.phase !== 'roundEnd' && state.phase !== 'gameEnd') {
    if (!confirm('¿Reiniciar la mano actual?')) return;
  }
  state = G.newRound(state);
  clearSelection();
  rerender();
});

document.getElementById('btn-new-game').addEventListener('click', () => {
  if (!confirm('¿Empezar un nuevo partido (resetear puntaje)?')) return;
  state = G.newGame({ targetScore: 5000 });
  clearSelection();
  rerender();
});

document.getElementById('btn-draw-stock').addEventListener('click', () => {
  const r = G.drawStock(state, currentPlayer());
  if (r.error) return flash(r.error);
  clearSelection();
  rerender();
});

document.getElementById('btn-take-discard').addEventListener('click', () => {
  const r = G.takeDiscard(state, currentPlayer());
  if (r.error) return flash(r.error);
  clearSelection();
  rerender();
});

document.getElementById('btn-meld').addEventListener('click', () => {
  const ids = selectedIds();
  if (ids.length === 0) return flash('Seleccioná cartas de tu mano para bajar.');
  const r = G.meldNew(state, currentPlayer(), ids);
  if (r.error) return flash(r.error);
  clearSelection();
  rerender();
});

document.getElementById('btn-add-meld').addEventListener('click', () => {
  if (!ui.selectedMeldId) return flash('Tocá primero un juego para agregar.');
  const ids = selectedIds();
  if (ids.length === 0) return flash('Seleccioná cartas para agregar.');
  const r = G.meldAdd(state, currentPlayer(), ui.selectedMeldId, ids);
  if (r.error) return flash(r.error);
  clearSelection();
  rerender();
});

document.getElementById('btn-discard').addEventListener('click', () => {
  const ids = selectedIds();
  if (ids.length !== 1) return flash('Seleccioná exactamente 1 carta para descartar.');
  const r = G.discard(state, currentPlayer(), ids[0]);
  if (r.error) return flash(r.error);
  clearSelection();
  rerender();
});

document.getElementById('btn-go-out').addEventListener('click', () => {
  const ids = selectedIds();
  const last = ids.length === 1 ? ids[0] : null;
  const r = G.goOut(state, currentPlayer(), last);
  if (r.error) return flash(r.error);
  clearSelection();
  rerender();
});

rerender();

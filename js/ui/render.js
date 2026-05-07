import {
  RED_SUITS, SUIT_GLYPH, isWild, isJoker, isRedThree, cardLabel, sortHand,
} from '../engine/cards.js';
import {
  isDiscardFrozen, minInitialMeld, canastaKind,
} from '../engine/rules.js';

// Handlers que la UI principal registra para acciones del juego.
let _handlers = {};
export function setHandlers(h) { _handlers = h; }

// Estado de doble-tap (módulo) — sobrevive a re-renders.
let _lastTap = { id: null, t: 0 };
const DOUBLE_TAP_MS = 350;

export function cardEl(card, { tiny = false, hidden = false, selectable = true } = {}) {
  const isHidden = hidden || card.hidden === true;
  const el = document.createElement('div');
  el.className = 'card' + (tiny ? ' tiny' : '') +
    (isHidden ? ' back' : '') +
    (isJoker(card) ? ' joker' : '') +
    (RED_SUITS.has(card.suit) ? ' red' : '') +
    (card.justTaken ? ' just-taken' : '');
  el.dataset.cardId = card.id;
  if (isHidden) return el;
  const tl = document.createElement('div');
  tl.className = 'corner';
  tl.textContent = `${cardLabel(card)}${SUIT_GLYPH[card.suit] || ''}`;
  el.appendChild(tl);
  const pip = document.createElement('div');
  pip.className = 'pip';
  pip.textContent = isJoker(card) ? '★' : SUIT_GLYPH[card.suit];
  el.appendChild(pip);
  const br = document.createElement('div');
  br.className = 'corner br';
  br.textContent = `${cardLabel(card)}${SUIT_GLYPH[card.suit] || ''}`;
  el.appendChild(br);
  if (!selectable) el.style.cursor = 'default';
  return el;
}

export function render(state, ui) {
  // Layout flip: el jugador activo (hot-seat) o el viewer (P2P) queda abajo.
  const viewer = ui.hotSeat ? state.turn : ui.viewerIdx;
  document.body.classList.toggle('flip-players', viewer === 1);

  // Botón "Cancelar toma" visible solo si aplica
  const cancelBtn = document.getElementById('btn-cancel-take');
  if (cancelBtn) {
    const me = ui.hotSeat ? state.turn : ui.viewerIdx;
    const canCancel = state.phase === 'play'
      && state.turn === me
      && !!state.pendingTopId
      && (state.players[me].todayMelds || []).length === 0;
    cancelBtn.hidden = !canCancel;
  }

  // Scores
  document.getElementById('score-p1').textContent = state.players[0].score;
  document.getElementById('score-p2').textContent = state.players[1].score;

  // Turno + fase
  const turnLabel = document.getElementById('turn-label');
  turnLabel.textContent =
    state.phase === 'gameStart' ? 'Pulsá "Nueva mano"' :
    state.phase === 'gameEnd' ? `¡Gana J${state.winner + 1}!` :
    state.phase === 'roundEnd' ? 'Mano terminada' :
    `Turno J${state.turn + 1}`;
  document.getElementById('phase-label').textContent =
    state.phase === 'draw' ? 'Debe robar' :
    state.phase === 'play' ? 'Bajá / agregá / descartá' : '';
  document.getElementById('message').textContent = state.message || '';

  // Stock + Discard
  document.getElementById('stock-count').textContent = state.stock.length;
  const discardTop = document.getElementById('discard-top');
  discardTop.innerHTML = '';
  const top = state.discard[state.discard.length - 1];
  if (top) discardTop.appendChild(cardEl(top));
  document.getElementById('discard-count').textContent = state.discard.length;
  document.getElementById('discard-frozen').hidden = !isDiscardFrozen(state.discard);

  // Render manos y melds
  for (let p = 0; p < 2; p++) {
    renderPlayer(state, ui, p);
  }
  bindActions(state, ui);
}

function renderPlayer(state, ui, p) {
  const handDiv = document.getElementById(`hand-p${p + 1}`);
  const meldsDiv = document.getElementById(`melds-p${p + 1}`);
  const meta = document.getElementById(`meta-p${p + 1}`);
  handDiv.innerHTML = '';
  meldsDiv.innerHTML = '';

  const player = state.players[p];
  const hand = state.hands[p];
  const isViewer = ui.viewerIdx === p;
  const meHeader = ui.hotSeat ? '' : (isViewer ? ' (vos)' : ' (rival)');
  document.querySelector(`#player-${p+1} .player-head h2`).textContent =
    `Jugador ${p+1}${meHeader}`;

  // Meta info
  const min = minInitialMeld(player.score);
  const reds = player.redThrees.length;
  meta.innerHTML = `
    <span class="muted">${hand.length} cartas · ${player.melds.length} juegos · 3♥/♦: ${reds}</span>
    ${player.hasMelded ? '' : `<span class="muted"> · falta bajar ${min}pt</span>`}
  `;

  // Render mano (visible solo si es el jugador del turno o si viewerIdx coincide)
  // En hot-seat, durante un "pass" todas las manos quedan ocultas hasta el tap.
  const showHand = (ui.hotSeat ? state.turn === p : isViewer) && !ui.pendingPass;
  const ordered = showHand ? sortHand(hand) : hand;
  for (const c of ordered) {
    const el = cardEl(c, { hidden: !showHand });
    if (showHand) {
      if (ui.selection.has(c.id)) el.classList.add('selected');
      el.addEventListener('click', () => {
        const now = Date.now();
        // Doble-tap sobre la misma carta → descartar
        if (_lastTap.id === c.id && now - _lastTap.t < DOUBLE_TAP_MS) {
          _lastTap = { id: null, t: 0 };
          _handlers.onCardDoubleTap?.(c.id);
          return;
        }
        _lastTap = { id: c.id, t: now };
        if (ui.selection.has(c.id)) ui.selection.delete(c.id);
        else ui.selection.add(c.id);
        render(state, ui);
      });
    }
    handDiv.appendChild(el);
  }

  // Render melds
  for (const m of player.melds) {
    const md = document.createElement('div');
    md.className = 'meld' + (m.cards.length >= 7 ? ' canasta' : '');
    if (ui.selectedMeldId === m.id) md.classList.add('selected');
    const lbl = document.createElement('span');
    lbl.className = 'meld-label';
    const kind = canastaKind(m);
    lbl.textContent = `${m.rank}${kind ? ' ' + kind : ''} (${m.cards.length})`;
    md.appendChild(lbl);
    for (const c of m.cards) md.appendChild(cardEl(c, { tiny: true, selectable: false }));
    md.addEventListener('click', () => {
      ui.selectedMeldId = ui.selectedMeldId === m.id ? null : m.id;
      render(state, ui);
    });
    meldsDiv.appendChild(md);
  }
}

function bindActions(state, ui) {
  const meIdx = ui.hotSeat ? state.turn : ui.viewerIdx;
  const myTurn = state.turn === meIdx && !ui.pendingPass;
  const inDraw = state.phase === 'draw';
  const inPlay = state.phase === 'play';
  document.getElementById('btn-draw-stock').disabled = !(myTurn && inDraw);
  document.getElementById('btn-take-discard').disabled = !(myTurn && inDraw);
  document.getElementById('btn-meld').disabled = !(myTurn && inPlay);
  document.getElementById('btn-add-meld').disabled = !(myTurn && inPlay && ui.selectedMeldId);
  document.getElementById('btn-discard').disabled = !(myTurn && inPlay);
  document.getElementById('btn-go-out').disabled = !(myTurn && inPlay);
}

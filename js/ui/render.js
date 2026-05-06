import {
  RED_SUITS, SUIT_GLYPH, isWild, isJoker, isRedThree, cardLabel,
} from '../engine/cards.js';
import {
  isDiscardFrozen, minInitialMeld, canastaKind,
} from '../engine/rules.js';

export function cardEl(card, { tiny = false, hidden = false, selectable = true } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (tiny ? ' tiny' : '') +
    (hidden ? ' back' : '') +
    (isJoker(card) ? ' joker' : '') +
    (RED_SUITS.has(card.suit) ? ' red' : '');
  el.dataset.cardId = card.id;
  if (hidden) return el;
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

  // Meta info
  const min = minInitialMeld(player.score);
  const reds = player.redThrees.length;
  meta.innerHTML = `
    <span class="muted">${hand.length} cartas · ${player.melds.length} juegos · 3♥/♦: ${reds}</span>
    ${player.hasMelded ? '' : `<span class="muted"> · falta bajar ${min}pt</span>`}
  `;

  // Render mano (visible solo si es el jugador del turno o si viewerIdx coincide)
  const showHand = ui.hotSeat ? state.turn === p : isViewer;
  for (const c of hand) {
    const el = cardEl(c, { hidden: !showHand });
    if (showHand) {
      if (ui.selection.has(c.id)) el.classList.add('selected');
      el.addEventListener('click', () => {
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
  const myTurn = state.turn === (ui.hotSeat ? state.turn : ui.viewerIdx);
  const inDraw = state.phase === 'draw';
  const inPlay = state.phase === 'play';
  document.getElementById('btn-draw-stock').disabled = !(myTurn && inDraw);
  document.getElementById('btn-take-discard').disabled = !(myTurn && inDraw);
  document.getElementById('btn-meld').disabled = !(myTurn && inPlay);
  document.getElementById('btn-add-meld').disabled = !(myTurn && inPlay && ui.selectedMeldId);
  document.getElementById('btn-discard').disabled = !(myTurn && inPlay);
  document.getElementById('btn-go-out').disabled = !(myTurn && inPlay);
}

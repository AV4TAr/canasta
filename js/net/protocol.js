// Protocolo entre host y client.
// Mensajes del HOST -> CLIENT:
//   { type: 'STATE', state }            // estado sanitizado para el cliente
//   { type: 'ERROR', message }          // error en el último intent del cliente
//   { type: 'HELLO', viewerIdx }        // asignación de jugador (siempre 1)
// Mensajes del CLIENT -> HOST:
//   { type: 'INTENT', action, payload }
//   action ∈ 'newRound'|'drawStock'|'takeDiscard'|'meldNew'|'meldAdd'|'discard'|'goOut'

// Sanitiza el estado para mandar al cliente:
// - oculta cartas del oponente y del mazo (pero mantiene la cantidad)
// - mantiene melds, descarte, scores, fase, turno, log, etc.
export function sanitizeForClient(state, viewerIdx) {
  const opp = 1 - viewerIdx;
  const hideHand = state.hands[opp].map((_, i) => makeHidden(`opp-h-${i}`));
  const hideStock = state.stock.map((_, i) => makeHidden(`stock-${i}`));
  const hands = viewerIdx === 0
    ? [state.hands[0], hideHand]
    : [hideHand, state.hands[1]];
  return { ...state, hands, stock: hideStock };
}

function makeHidden(id) {
  return { id, suit: 'back', rank: 'BACK', hidden: true };
}

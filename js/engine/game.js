import { buildDeck, shuffle, makeRng } from './deck.js';
import {
  isWild, isJoker, isRedThree, isBlackThree, isNatural,
  cardPoints, cardLabel,
} from './cards.js';
import {
  validateNewMeld, validateAddToMeld,
  canTakeDiscard, isDiscardFrozen,
  meldPoints, minInitialMeld, isCanasta, canastaKind,
} from './rules.js';
import { scoreRound } from './scoring.js';

const HAND_SIZE = 11;
const TARGET_SCORE_DEFAULT = 5000;

let meldIdSeq = 1;
const newMeldId = () => `m${meldIdSeq++}`;

function findCard(arr, id) { return arr.find(c => c.id === id); }
function removeCard(arr, id) {
  const i = arr.findIndex(c => c.id === id);
  if (i < 0) return null;
  return arr.splice(i, 1)[0];
}
function takeCards(arr, ids) {
  const taken = [];
  for (const id of ids) {
    const c = removeCard(arr, id);
    if (!c) return { error: `Carta ${id} no encontrada.` };
    taken.push(c);
  }
  return { taken };
}

export function newGame({ seed = Date.now() | 0, targetScore = TARGET_SCORE_DEFAULT } = {}) {
  return {
    seed, targetScore,
    players: [
      { score: 0, melds: [], redThrees: [], hasMelded: false },
      { score: 0, melds: [], redThrees: [], hasMelded: false },
    ],
    turn: 0,
    phase: 'gameStart',
    hands: [[], []],
    stock: [],
    discard: [],
    message: 'Iniciá una nueva mano.',
    log: [],
    roundEnd: null,
    roundIndex: 0,
    dealer: 1, // el otro reparte la próxima
    winner: null,
  };
}

export function newRound(state) {
  const dealer = (state.dealer + 1) % 2;
  const starter = (dealer + 1) % 2;
  const seed = (state.seed + state.roundIndex * 9973) | 0;
  const rng = makeRng(seed);
  const deck = shuffle(buildDeck(), rng);

  const players = state.players.map(p => ({
    ...p, melds: [], redThrees: [], hasMelded: false,
  }));
  const hands = [[], []];

  // Repartir 11 a cada uno
  for (let i = 0; i < HAND_SIZE; i++) {
    hands[0].push(deck.pop());
    hands[1].push(deck.pop());
  }

  // Voltear la primera del pozo. Si es 3 rojo o comodín, simplemente queda;
  // si es 3 negro, también queda (bloqueará pozo).
  const discard = [deck.pop()];

  // Procesar 3 rojos repartidos: pasar a redThrees y robar reposición.
  for (let p = 0; p < 2; p++) {
    let i = 0;
    while (i < hands[p].length) {
      if (isRedThree(hands[p][i])) {
        players[p].redThrees.push(hands[p].splice(i, 1)[0]);
        if (deck.length > 0) hands[p].push(deck.pop());
      } else i++;
    }
  }

  return {
    ...state,
    stock: deck,
    discard,
    hands,
    players,
    turn: starter,
    dealer,
    phase: 'draw',
    message: `Mano ${state.roundIndex + 1}. Empieza Jugador ${starter + 1}.`,
    log: [...state.log, `--- Mano ${state.roundIndex + 1} ---`],
    roundEnd: null,
    roundIndex: state.roundIndex + 1,
  };
}

// ─────────────────── helpers comunes ───────────────────
function checkTurn(state, playerIdx, expectedPhase) {
  if (state.phase !== expectedPhase)
    return `No es la fase correcta (esperaba ${expectedPhase}, está ${state.phase}).`;
  if (state.turn !== playerIdx)
    return `No es tu turno.`;
  return null;
}

function autoDrawRedThrees(state, playerIdx) {
  const hand = state.hands[playerIdx];
  let i = 0;
  while (i < hand.length) {
    if (isRedThree(hand[i])) {
      state.players[playerIdx].redThrees.push(hand.splice(i, 1)[0]);
      if (state.stock.length > 0) hand.push(state.stock.pop());
    } else i++;
  }
}

// ─────────────────── acciones ───────────────────

export function drawStock(state, playerIdx) {
  const e = checkTurn(state, playerIdx, 'draw');
  if (e) return { error: e };
  if (state.stock.length === 0) return { error: 'Mazo vacío.' };

  const c = state.stock.pop();
  state.hands[playerIdx].push(c);
  autoDrawRedThrees(state, playerIdx);
  state.phase = 'play';
  state.message = `J${playerIdx + 1} robó del mazo.`;
  state.log.push(`J${playerIdx + 1} roba mazo`);
  return { ok: true };
}

// Robar pozo: validar, mover TODO el pozo a la mano, marcar requirePostMeld
// (el jugador debe inmediatamente bajar un meld que incluya el tope + 2 naturales).
// Para simplificar: tomamos el pozo entero, dejamos al usuario bajar el meld
// como acción separada. Marcamos pendingDiscardSnapshot para poder revertir si
// el usuario cancela / no logra bajar (lo dejaremos para una iteración futura).
// Por ahora confiamos en que el UI exige el meld antes de descartar.
export function takeDiscard(state, playerIdx) {
  const e = checkTurn(state, playerIdx, 'draw');
  if (e) return { error: e };
  const v = canTakeDiscard(state, playerIdx);
  if (!v.ok) return { error: v.error };

  // Snapshot para poder cancelar la toma (siempre que el jugador no haya bajado todavía).
  state._undoTake = {
    playerIdx,
    hand: state.hands[playerIdx].map(c => ({ ...c })),
    discard: state.discard.map(c => ({ ...c })),
    redThrees: state.players[playerIdx].redThrees.map(c => ({ ...c })),
    stockLen: state.stock.length,
    message: state.message,
    logLen: state.log.length,
    pendingTopId: state.pendingTopId,
    phase: state.phase,
  };

  const top = state.discard[state.discard.length - 1];
  const taken = state.discard.splice(0, state.discard.length);
  // Marcar las cartas recién tomadas para que el UI las pueda destacar.
  for (const c of taken) c.justTaken = true;
  state.hands[playerIdx].push(...taken);
  state.pendingTopId = top.id; // el meld que baje a continuación debe incluir esta carta
  autoDrawRedThrees(state, playerIdx);
  state.phase = 'play';
  state.message = `J${playerIdx + 1} tomó el pozo (${taken.length}). Debe bajar un juego con el tope.`;
  state.log.push(`J${playerIdx + 1} toma pozo (${taken.length})`);
  return { ok: true };
}

// Cancelar la toma del pozo (solo si no se bajó nada en este turno todavía).
export function cancelTakeDiscard(state, playerIdx) {
  if (state.turn !== playerIdx) return { error: 'No es tu turno.' };
  if (state.phase !== 'play') return { error: 'No podés cancelar ahora.' };
  if (!state._undoTake || state._undoTake.playerIdx !== playerIdx)
    return { error: 'No hay toma del pozo para cancelar.' };
  const player = state.players[playerIdx];
  if ((player.todayMelds || []).length > 0)
    return { error: 'Ya bajaste cartas, la toma no se puede cancelar.' };

  const u = state._undoTake;
  // Devolver las cartas robadas como reposición de 3 rojos al mazo.
  // Para reconstruir exacto: restauramos hand/discard/redThrees y revertimos
  // el stock a su largo anterior tomando del fondo. Las cartas que se hayan
  // robado para reponer 3 rojos vuelven al mazo (al fondo) preservando orden.
  const stolenForRedThrees = u.stockLen - state.stock.length;
  // Las cartas tomadas del stock se agregaron al final de la mano del jugador.
  // Las quitamos de la mano y las devolvemos al mazo, en orden inverso al
  // que salieron (LIFO ⇒ pop del stock).
  const hand = state.hands[playerIdx];
  if (stolenForRedThrees > 0) {
    const tail = hand.splice(hand.length - stolenForRedThrees, stolenForRedThrees);
    // tail está en el orden en que se pusheó (último push = última pop del stock).
    // Para restaurar el stock original (donde el último push fue lo último popeado),
    // re-pusheamos en orden inverso.
    while (tail.length) state.stock.push(tail.pop());
  }
  state.hands[playerIdx] = u.hand;
  state.discard = u.discard;
  state.players[playerIdx].redThrees = u.redThrees;
  state.message = 'Toma del pozo cancelada.';
  state.log.length = u.logLen;
  state.log.push(`J${playerIdx + 1} cancela la toma del pozo`);
  state.pendingTopId = u.pendingTopId;
  state.phase = u.phase;
  state._undoTake = null;
  return { ok: true };
}

// Bajar nuevo meld
export function meldNew(state, playerIdx, cardIds, { isGoingOut = false } = {}) {
  const e = checkTurn(state, playerIdx, 'play');
  if (e) return { error: e };

  const hand = state.hands[playerIdx];
  // Validar que las cartas estén en la mano
  const cards = cardIds.map(id => findCard(hand, id)).filter(Boolean);
  if (cards.length !== cardIds.length)
    return { error: 'Alguna carta no está en tu mano.' };

  const player = state.players[playerIdx];
  // Si todo el meld es de 3 negros, solo se permite si el jugador ya tiene
  // canasta (típicamente el último movimiento antes de cortar).
  const allBlacks = cards.every(isBlackThree);
  const canMeldBlacks = allBlacks && player.melds.some(m => m.cards.length >= 7);

  const v = validateNewMeld(cards, { isGoingOut: isGoingOut || canMeldBlacks });
  if (!v.ok) return { error: v.error };

  // Si tomó el pozo, el primer meld debe incluir el tope
  if (state.pendingTopId && !cardIds.includes(state.pendingTopId))
    return { error: 'El primer juego al tomar el pozo debe incluir la carta del tope.' };

  // Primera bajada: chequear mínimo escalonado
  if (!player.hasMelded) {
    const min = minInitialMeld(player.score);
    // El mínimo debe alcanzarse SUMANDO todos los melds que baje en este turno.
    // Para simplificar, exigimos que este meld solo sumado a melds bajados HOY alcance min.
    const todayMelds = (player.todayMelds || []);
    const todayPts = todayMelds.reduce((s, m) => s + meldPoints(m.cards), 0);
    const newPts = meldPoints(cards);
    if (todayPts + newPts < min)
      return { error: `Bajada inicial necesita ${min} puntos (vas con ${todayPts + newPts}).` };
  }

  // Construir meld
  const naturals = cards.filter(isNatural);
  const rank = cards.every(isBlackThree) ? '3B' : naturals[0].rank;
  const meld = { id: newMeldId(), rank, cards };
  player.melds.push(meld);

  // Sacar de la mano
  for (const c of cards) removeCard(hand, c.id);

  // Track de melds del turno (para mínimo inicial acumulado)
  player.todayMelds = (player.todayMelds || []).concat([meld]);
  if (state.pendingTopId && cardIds.includes(state.pendingTopId)) {
    state.pendingTopId = null;
    // Toma del pozo confirmada por el meld con el tope: no se puede cancelar.
    state._undoTake = null;
  }

  state.message = `J${playerIdx + 1} bajó ${cards.length} de ${rank}.`;
  state.log.push(`J${playerIdx + 1} baja ${cards.map(cardLabel).join(',')}`);
  return { ok: true, meldId: meld.id };
}

export function meldAdd(state, playerIdx, meldId, cardIds) {
  const e = checkTurn(state, playerIdx, 'play');
  if (e) return { error: e };

  const player = state.players[playerIdx];
  const meld = player.melds.find(m => m.id === meldId);
  if (!meld) return { error: 'Juego no encontrado.' };

  const hand = state.hands[playerIdx];
  const cards = cardIds.map(id => findCard(hand, id)).filter(Boolean);
  if (cards.length !== cardIds.length)
    return { error: 'Alguna carta no está en tu mano.' };

  const v = validateAddToMeld(meld, cards);
  if (!v.ok) return { error: v.error };

  // Si tenés un pendingTopId, no podés agregar antes de bajar el meld inicial con el tope
  if (state.pendingTopId)
    return { error: 'Primero bajá un juego que incluya el tope del pozo.' };

  meld.cards.push(...cards);
  for (const c of cards) removeCard(hand, c.id);
  state.message = `J${playerIdx + 1} agregó ${cards.length} a ${meld.rank}.`;
  state.log.push(`J${playerIdx + 1} agrega ${cards.map(cardLabel).join(',')} a ${meld.rank}`);
  return { ok: true };
}

export function discard(state, playerIdx, cardId) {
  const e = checkTurn(state, playerIdx, 'play');
  if (e) return { error: e };
  if (state.pendingTopId)
    return { error: 'Primero bajá el juego con el tope del pozo.' };

  const hand = state.hands[playerIdx];
  const c = findCard(hand, cardId);
  if (!c) return { error: 'Carta no está en tu mano.' };
  if (isRedThree(c)) return { error: 'No podés descartar un 3 rojo.' };

  removeCard(hand, cardId);
  state.discard.push(c);

  // Marcar primera bajada efectiva
  const player = state.players[playerIdx];
  if ((player.todayMelds || []).length > 0 && !player.hasMelded) {
    player.hasMelded = true;
  }
  player.todayMelds = [];
  // Limpiar marcadores de turno
  state._undoTake = null;
  for (const h of state.hands[playerIdx]) delete h.justTaken;

  state.log.push(`J${playerIdx + 1} descarta ${cardLabel(c)}`);

  // Fin de turno
  if (state.stock.length === 0) {
    // Termina la mano si el mazo se vació y el siguiente no puede robar
    finishRound(state, null);
    return { ok: true };
  }
  state.turn = (state.turn + 1) % 2;
  state.phase = 'draw';
  state.message = `Turno de J${state.turn + 1}.`;
  return { ok: true };
}

export function goOut(state, playerIdx, lastDiscardCardId) {
  const e = checkTurn(state, playerIdx, 'play');
  if (e) return { error: e };
  const player = state.players[playerIdx];
  const hasCanasta = player.melds.some(isCanasta);
  if (!hasCanasta) return { error: 'Necesitás cerrar una canasta para cortar.' };

  if (lastDiscardCardId) {
    const hand = state.hands[playerIdx];
    const c = findCard(hand, lastDiscardCardId);
    if (!c) return { error: 'Carta a descartar no está en tu mano.' };
    if (hand.length !== 1)
      return { error: 'Para cortar tenés que poder vaciar la mano (descartar la última).' };
    removeCard(hand, lastDiscardCardId);
    state.discard.push(c);
  } else {
    if (state.hands[playerIdx].length !== 0)
      return { error: 'Te quedan cartas en mano. Bajá / agregá / descartá.' };
  }

  state.log.push(`J${playerIdx + 1} CORTA`);
  finishRound(state, playerIdx);
  return { ok: true };
}

function finishRound(state, cutterIdx) {
  const breakdown = scoreRound(state, cutterIdx);
  for (let i = 0; i < 2; i++) state.players[i].score += breakdown[i].total;
  state.roundEnd = { cutterIdx, breakdown };
  state.phase = 'roundEnd';
  state.message = cutterIdx === null
    ? 'Mazo agotado. Mano terminada.'
    : `J${cutterIdx + 1} cortó.`;
  state.log.push(`-- fin de mano: ${breakdown.map((b,i)=>`J${i+1} ${b.total}`).join(' / ')}`);

  if (state.players.some(p => p.score >= state.targetScore)) {
    state.phase = 'gameEnd';
    state.winner = state.players[0].score >= state.players[1].score ? 0 : 1;
    state.message = `¡Gana J${state.winner + 1}!`;
  }
}

// Reset de melds del turno al cambiar de turno (defensivo)
export function clearTurnTracking(state, playerIdx) {
  state.players[playerIdx].todayMelds = [];
}

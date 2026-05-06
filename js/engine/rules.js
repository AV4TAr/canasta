import {
  isWild, isJoker, isTwo, isRedThree, isBlackThree, isNatural, cardPoints
} from './cards.js';

// Mínimo escalonado de la primera bajada (initial meld) según puntaje acumulado.
export function minInitialMeld(accumulatedScore) {
  if (accumulatedScore < 0) return 15;       // saldo negativo
  if (accumulatedScore < 1500) return 50;
  if (accumulatedScore < 3000) return 90;
  return 120;
}

// Valor en puntos de un meld (suma de cartas).
export function meldPoints(cards) {
  return cards.reduce((s, c) => s + cardPoints(c), 0);
}

// Cuenta cartas naturales (no comodines, no 3 rojos).
export function countNaturals(cards) {
  return cards.filter(isNatural).length;
}
export function countWilds(cards) {
  return cards.filter(isWild).length;
}

// Validaciones genéricas. Devuelven { ok:true } o { ok:false, error:string }.
const ok = { ok: true };
const err = msg => ({ ok: false, error: msg });

// Un meld nuevo es válido si:
//  - tiene al menos 3 cartas
//  - sin 3 rojos
//  - 3 negros: solo se permiten al cortar (regla aparte: ver canMeldBlackThrees)
//  - todas las cartas naturales son del mismo rank
//  - máximo 3 comodines
//  - al menos 2 cartas naturales
export function validateNewMeld(cards, { isGoingOut = false } = {}) {
  if (!cards || cards.length < 3) return err('Un juego necesita 3 cartas mínimo.');
  if (cards.some(isRedThree)) return err('Los 3 rojos no se bajan, son bonus.');

  const blacks = cards.filter(isBlackThree);
  if (blacks.length > 0) {
    if (!isGoingOut) return err('Los 3 negros solo se bajan al cortar.');
    if (blacks.length !== cards.length)
      return err('Un juego de 3 negros no puede mezclarse con otros rangos.');
    if (cards.some(isWild)) return err('Los 3 negros no aceptan comodines.');
    if (cards.length < 3) return err('Necesitás al menos 3 negros.');
    return ok;
  }

  const naturals = cards.filter(isNatural);
  const wilds = cards.filter(isWild);
  if (wilds.length > 3) return err('Máximo 3 comodines por juego.');
  if (naturals.length < 2) return err('Necesitás al menos 2 cartas naturales.');
  const ranks = new Set(naturals.map(c => c.rank));
  if (ranks.size !== 1) return err('Las cartas naturales deben ser del mismo rango.');
  return ok;
}

// Validar agregar cartas a un meld existente.
export function validateAddToMeld(meld, addCards) {
  if (!meld || !meld.cards.length) return err('Juego inválido.');
  if (!addCards || !addCards.length) return err('Sin cartas para agregar.');
  if (addCards.some(isRedThree)) return err('Los 3 rojos no se bajan.');

  const meldRank = meld.rank; // null si es 3-negros
  if (meldRank === '3B') {
    if (!addCards.every(isBlackThree)) return err('Solo 3 negros a este juego.');
    return ok;
  }

  // Combinar y revalidar
  const combined = meld.cards.concat(addCards);
  // Permitimos que ya sea canasta y siga creciendo
  // Reglas: naturales mismo rank, máx 3 comodines, mín 2 naturales
  const naturals = combined.filter(isNatural);
  const wilds = combined.filter(isWild);
  if (wilds.length > 3) return err('Máximo 3 comodines por juego.');
  if (naturals.length < 2) return err('Naturales insuficientes.');
  if (!naturals.every(c => c.rank === meldRank))
    return err(`Las naturales deben ser ${meldRank}.`);
  // Comodines: ok cualquier wild
  // Si las cartas a agregar tienen naturales de otro rank, error
  for (const c of addCards) {
    if (isNatural(c) && c.rank !== meldRank)
      return err(`No coincide el rango (${meldRank}).`);
  }
  return ok;
}

// Robo del pozo (regla del usuario: SIEMPRE par natural en mano + tope).
//   - tope debe ser natural (no comodín, no 3 rojo, no 3 negro)
//   - jugador debe tener ≥2 cartas naturales en mano del mismo rank que el tope
//   - los 3 negros sobre el tope bloquean (aunque ya filtramos por "no negro")
export function canTakeDiscard(state, playerIdx) {
  const top = state.discard[state.discard.length - 1];
  if (!top) return err('Pozo vacío.');
  if (isWild(top)) return err('No podés tomar un comodín del pozo.');
  if (isBlackThree(top)) return err('Un 3 negro bloquea el pozo.');
  if (isRedThree(top)) return err('No corresponde tomar un 3 rojo.');
  const hand = state.hands[playerIdx];
  const sameRankNaturals = hand.filter(c => isNatural(c) && c.rank === top.rank).length;
  if (sameRankNaturals < 2)
    return err(`Necesitás un par natural de ${top.rank} en mano para tomar el pozo.`);
  return ok;
}

// El pozo está "congelado" si contiene cualquier comodín o 3 rojo.
// Con la regla "siempre par natural" el congelamiento no cambia el robo,
// pero lo marcamos para mostrar al usuario.
export function isDiscardFrozen(discard) {
  return discard.some(c => isWild(c) || isRedThree(c));
}

// Para cortar (irse): jugador necesita al menos UNA canasta (limpia o sucia)
// y debe descartar la última carta (si le queda alguna después de bajar).
// También debe poder vaciar la mano.
export function canGoOut(state, playerIdx, intendedDiscardId) {
  const player = state.players[playerIdx];
  const hasCanasta = player.melds.some(m => m.cards.length >= 7);
  if (!hasCanasta) return err('Necesitás cerrar al menos una canasta para cortar.');
  // El motor verifica el resto al ejecutar la acción
  return ok;
}

export function isCanasta(meld) {
  return meld.cards.length >= 7 && meld.rank !== '3B';
}
export function canastaKind(meld) {
  if (!isCanasta(meld)) return null;
  return meld.cards.some(isWild) ? 'sucia' : 'limpia';
}

import { cardPoints, isRedThree, isWild } from './cards.js';
import { isCanasta, canastaKind } from './rules.js';

// Puntaje de una mano, por jugador.
// + bonus por canastas (limpia 500, sucia 300)
// + bonus por 3 rojos (100 c/u, 800 si los 4)
// + bonus por cortar (100)
// + suma de puntos de cartas en juegos bajados
// - suma de puntos de cartas que quedan en la mano
export function scoreRound(state, cutterIdx) {
  const result = [];
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    let bonus = 0;
    let meldPts = 0;
    let cleanCnt = 0, dirtyCnt = 0;

    for (const m of p.melds) {
      meldPts += m.cards.reduce((s, c) => s + cardPoints(c), 0);
      const kind = canastaKind(m);
      if (kind === 'limpia') { bonus += 500; cleanCnt++; }
      else if (kind === 'sucia') { bonus += 300; dirtyCnt++; }
    }

    const reds = p.redThrees.length;
    bonus += reds * 100;
    if (reds === 4) bonus += 400; // total 800

    if (i === cutterIdx) bonus += 100;

    const handPenalty = state.hands[i].reduce((s, c) => s + cardPoints(c), 0);

    const total = bonus + meldPts - handPenalty;
    result.push({
      bonus, meldPts, handPenalty, total,
      cleanCanastas: cleanCnt, dirtyCanastas: dirtyCnt, redThrees: reds,
    });
  }
  return result;
}

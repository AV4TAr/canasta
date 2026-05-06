import { SUITS, RANKS } from './cards.js';

// PRNG determinista (mulberry32) — el host comparte la seed para que la red
// reproduzca el mismo reparto sin enviar el mazo entero.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cardIdSeq = 1;
const nextId = () => `c${cardIdSeq++}`;

export function buildDeck() {
  cardIdSeq = 1;
  const cards = [];
  // 2 mazos de 52
  for (let d = 0; d < 2; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: nextId(), suit, rank });
      }
    }
  }
  // 4 jokers
  for (let j = 0; j < 4; j++) {
    cards.push({ id: nextId(), suit: 'joker', rank: 'JOKER' });
  }
  return cards;
}

export function shuffle(cards, rng) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

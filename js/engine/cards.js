// Definiciones de cartas y valores (Canasta clásica)

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠', joker: '★' };
export const RED_SUITS = new Set(['hearts', 'diamonds']);

// Valor en puntos de cada carta
export function cardPoints(card) {
  if (card.rank === 'JOKER') return 50;
  if (card.rank === '2') return 20;
  if (card.rank === 'A') return 20;
  if (card.rank === '3') return RED_SUITS.has(card.suit) ? 100 : 5; // 3 rojo bonus, negro 5
  if (['4','5','6','7'].includes(card.rank)) return 5;
  return 10; // 8,9,10,J,Q,K
}

export const isJoker = c => c.rank === 'JOKER';
export const isTwo = c => c.rank === '2';
export const isWild = c => isJoker(c) || isTwo(c);
export const isRedThree = c => c.rank === '3' && RED_SUITS.has(c.suit);
export const isBlackThree = c => c.rank === '3' && !RED_SUITS.has(c.suit);
export const isNatural = c => !isWild(c) && !isRedThree(c);

export function cardLabel(card) {
  if (isJoker(card)) return 'JK';
  return card.rank;
}

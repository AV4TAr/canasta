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

// Orden visual de la mano: comodines primero (Joker, 2), luego A→3 descendente.
// Dentro del mismo rank: ♥ ♦ ♣ ♠ para que pares del mismo color queden juntos.
const RANK_ORDER = { JOKER:0, '2':1, A:2, K:3, Q:4, J:5, '10':6,
  '9':7, '8':8, '7':9, '6':10, '5':11, '4':12, '3':13 };
const SUIT_ORDER = { hearts:0, diamonds:1, clubs:2, spades:3, joker:4 };
export function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const r = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
    if (r !== 0) return r;
    return (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
  });
}

/** Jackpot deck creation, fair shuffling, validated dealing, and pass-token setup. */

export const SUITS = ["circle", "triangle", "cross", "square", "star", "diamond", "heart", "moon"] as const;
export type Suit = (typeof SUITS)[number];
export const TEAMS = ["Alpha", "Bravo", "Charlie", "Delta"] as const;
export type Team = (typeof TEAMS)[number];

export const DECK_SIZE = 32;
export const CARDS_PER_SUIT = 4;
export const PLAYER_COUNT = 8;
export const CARDS_PER_PLAYER = 4;
const SUPPORTED_TABLE_SIZES = [4, 6, 8] as const;

export type JackpotCard = {
  id: string;
  suit: Suit;
  number?: number;
  /** The starter token circulates, but is not part of the shape deck. */
  isPlaceholder?: boolean;
};

export type PlayerSlot = {
  id: string;
  name: string;
  seatIndex: number;
  team: Team;
  hand: JackpotCard[];
  isStarter: boolean;
};

export type DealResult = {
  players: PlayerSlot[];
  cardsPerPlayer: number;
  drawPile: JackpotCard[];
  starterPlayerId: string;
};

export const DEFAULT_PLAYER_NAMES = ["You", "Tobi", "Kemi", "Sola", "Chidi", "Amaka", "Bayo", "Ngozi"] as const;

/** Create a balanced deck for a supported table size (four seats retained for existing rooms). */
export function createDeck(numPlayers = PLAYER_COUNT): JackpotCard[] {
  assertTableSize(numPlayers);
  const suits = shuffleValues([...SUITS]).slice(0, numPlayers);
  return suits.flatMap((suit) =>
    Array.from({ length: CARDS_PER_SUIT }, (_, index) => ({
      id: `${suit}-${index + 1}`,
      suit,
      number: index + 1,
    })),
  );
}

/** In-place Fisher–Yates on a copy, using unbiased cryptographic integers where available. */
export function shuffleDeck(deck: JackpotCard[]): JackpotCard[] {
  return shuffleValues(deck);
}

/** Validate the exact deck size and four-copy balance before any deal. */
export function verifyDeckIntegrity(deck: JackpotCard[], expectedPlayers?: number): true {
  const numPlayers = expectedPlayers ?? deck.length / CARDS_PER_SUIT;
  assertTableSize(numPlayers);
  const expectedCount = numPlayers * CARDS_PER_SUIT;
  if (!Number.isInteger(numPlayers) || deck.length !== expectedCount) {
    throw new Error(`Deck integrity failed: expected ${expectedCount} cards, got ${deck.length}.`);
  }

  const counts = new Map<Suit, number>();
  for (const card of deck) {
    if (!SUITS.includes(card.suit) || card.isPlaceholder) {
      throw new Error("Deck integrity failed: unknown suit or placeholder in the shape deck.");
    }
    counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  }
  if (counts.size !== numPlayers || [...counts.values()].some((count) => count !== CARDS_PER_SUIT)) {
    throw new Error(`Deck integrity failed: expected ${numPlayers} unique shapes with ${CARDS_PER_SUIT} copies each.`);
  }
  return true;
}

/** Preserve the app's four-team seating convention at each supported room size. */
export function createPlayerSlots(names: readonly string[] = DEFAULT_PLAYER_NAMES): PlayerSlot[] {
  assertTableSize(names.length);
  return names.map((name, seatIndex) => ({
    id: `player-${seatIndex}`,
    name,
    seatIndex,
    team: (seatIndex % 2 === 0 ? "Alpha" : "Bravo") as Team,
    hand: [],
    isStarter: false,
  }));
}

/**
 * Deal the whole deck and reject any shuffle that gives one player an instant
 * four-of-a-kind. Each accepted deal is uniformly shuffled subject to that rule.
 */
export function dealForPlayerSlots(deck: JackpotCard[], playerSlots: PlayerSlot[]): DealResult {
  const numPlayers = playerSlots.length;
  assertTableSize(numPlayers);
  verifyDeckIntegrity(deck, numPlayers);
  if (new Set(playerSlots.map((player) => player.id)).size !== numPlayers) {
    throw new Error("Deal failed: every player must have a unique id.");
  }

  let dealtPlayers: PlayerSlot[];
  for (;;) {
    const shuffled = shuffleDeck(deck);
    const candidate = playerSlots.map((slot) => ({ ...slot, hand: [] as JackpotCard[], isStarter: false }));
    // Round-robin gives exactly four cards to each seat and consumes the deck.
    shuffled.forEach((card, index) => candidate[index % numPlayers].hand.push(card));
    const hasInstantJackpot = candidate.some((player) =>
      player.hand.length === CARDS_PER_SUIT && new Set(player.hand.map((card) => card.suit)).size === 1,
    );
    if (!hasInstantJackpot) {
      dealtPlayers = candidate;
      break;
    }
  }

  const drawPile: JackpotCard[] = [];
  if (drawPile.length !== 0 || dealtPlayers.some((player) => player.hand.length !== CARDS_PER_PLAYER)) {
    throw new Error("Deal failed: expected an empty draw pile and exactly four cards per player.");
  }

  // Seat 0 starts the clockwise pass chain with an extra real card from an unselected suit.
  const starter = dealtPlayers[0];
  starter.isStarter = true;
  const usedSuits = Array.from(new Set(deck.map((c) => c.suit)));
  const extraSuit = SUITS.find((s) => !usedSuits.includes(s)) ?? "star";
  starter.hand.push({
    id: `extra-${extraSuit}-1`,
    suit: extraSuit,
    number: 1,
  });
  return { players: dealtPlayers, cardsPerPlayer: CARDS_PER_PLAYER, drawPile, starterPlayerId: starter.id };
}

/** Setup requested for 6 or 8 players: exactly one shape per player, four copies each. */
export function setupGame(numPlayers: 6 | 8): DealResult {
  if (numPlayers !== 6 && numPlayers !== 8) {
    throw new Error("setupGame supports exactly 6 or 8 players.");
  }
  const players: PlayerSlot[] = Array.from({ length: numPlayers }, (_, seatIndex) => ({
    id: `player-${seatIndex}`,
    name: `Player ${seatIndex + 1}`,
    seatIndex,
    team: (seatIndex % 2 === 0 ? "Alpha" : "Bravo") as Team,
    hand: [],
    isStarter: false,
  }));
  return dealForPlayerSlots(createDeck(numPlayers), players);
}

/** Legacy eight-seat entry point used by the original local prototype. */
export function dealInitialHands(deck: JackpotCard[], slots: PlayerSlot[] = createPlayerSlots()): DealResult {
  return dealForPlayerSlots(deck, slots);
}

export function setupJackpotRound(names: readonly string[] = DEFAULT_PLAYER_NAMES): DealResult {
  const slots = createPlayerSlots(names);
  return dealForPlayerSlots(createDeck(slots.length), slots);
}

function assertTableSize(numPlayers: number): asserts numPlayers is 4 | 6 | 8 {
  if (!SUPPORTED_TABLE_SIZES.includes(numPlayers as 4 | 6 | 8)) {
    throw new Error("Jackpot tables need 4, 6, or 8 players.");
  }
}

function shuffleValues<T>(values: readonly T[]): T[] {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function randomInt(max: number): number {
  if (max <= 0) return 0;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const range = 0x1_0000_0000;
    const limit = range - (range % max);
    const buffer = new Uint32Array(1);
    let value: number;
    do {
      crypto.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return value % max;
  }
  return Math.floor(Math.random() * max);
}

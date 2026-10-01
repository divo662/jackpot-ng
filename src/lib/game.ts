/**
 * Jackpot play loop helpers — pass chain, four-of-a-kind checks, call resolution.
 * Pure functions; UI owns React state and timing.
 */

import {
  type DealResult,
  type JackpotCard,
  type PlayerSlot,
  type Suit,
  type Team,
  CARDS_PER_SUIT,
  CARDS_PER_PLAYER,
  SUITS,
  dealForPlayerSlots,
  createDeck,
  setupJackpotRound,
} from "@/lib/deck";

export type ScoreBoard = Record<Team, number>;

export type CallKind = "jackpot" | "suspect";

export type RoundResult = {
  kind: CallKind;
  valid: boolean;
  callingTeam: Team;
  callingPlayerId: string;
  /** Team that scored (may differ on a successful SUSPECT). */
  scoringTeam: Team | null;
  /** Suit that formed the four-of-a-kind, when applicable. */
  suit: Suit | null;
  title: string;
  detail: string;
};

export type PassEvent = { id: string; fromPlayerId: string; fromName: string; toPlayerId: string; toName: string; createdAt: number };
export type PublicSignalEvent = { id: string; playerId: string; playerName: string; signalId: string; createdAt: number; expiresAt: number };
export type PublicGameNotice = { id: string; kind: "success" | "warning"; title: string; message: string; createdAt: number; relatedSignalId?: string };

export type GameSnapshot = DealResult & {
  /** Seat whose hand currently has one extra pass card and must pass. */
  activePlayerId: string;
  passCount: number;
  log: string[];
  /** Public actions are recorded only when a player actually flashes one. */
  publicSignals?: PublicSignalEvent[];
  /** Broadcast only after a high impact action resolves, such as a SUSPECT call. */
  publicNotices?: PublicGameNotice[];
  publicReactions?: Array<{ id: string; playerId: string; playerName: string; reactionId: string; createdAt: number }>;
  lastPassEvent?: PassEvent;
  passEvents?: PassEvent[];
};

/** Configurable table rule: each team has three SUSPECT calls per round. */
export const SUSPECT_ATTEMPTS_PER_TEAM = 3;
/** Time players get to judge a flashed signal before the table tension fades. */
export const SIGNAL_DECISION_WINDOW_MS = 60_000;

export function emptyScores(): ScoreBoard {
  return { Alpha: 0, Bravo: 0, Charlie: 0, Delta: 0 };
}

export function createMatch(names: readonly string[]): GameSnapshot {
  const deal = setupJackpotRound(names);
  const starter = deal.players.find((player) => player.id === deal.starterPlayerId);

  return {
    ...deal,
    activePlayerId: deal.starterPlayerId,
    passCount: 0,
    log: [
      `Dealt ${deal.cardsPerPlayer} cards each from the ${deal.players.length * deal.cardsPerPlayer}-card deck. ${starter?.name ?? "Starter"} holds the extra pass card.`,
    ],
  };
}

/** Build a server-dealable match from the authoritative room roster. */
export function createRoomMatch(roster: Array<{ id: string; name: string; team: Team }>): GameSnapshot {
  if (![4, 6, 8].includes(roster.length)) throw new Error("Jackpot tables need 4, 6, or 8 players.");
  const slots: PlayerSlot[] = roster.map((player, seatIndex) => ({
    ...player,
    seatIndex,
    hand: [],
    isStarter: false,
  }));
  const deck = createDeck(roster.length);
  const deal = dealForPlayerSlots(deck, slots);
  const starter = deal.players.find((player) => player.id === deal.starterPlayerId);
  return {
    ...deal,
    activePlayerId: deal.starterPlayerId,
    passCount: 0,
    log: [`Dealt ${deal.cardsPerPlayer} cards to each of ${roster.length} players. ${starter?.name ?? "Starter"} has the extra pass card and passes first.`],
  };
}

/** Real (non-placeholder) cards only. */
export function realCards(hand: JackpotCard[]): JackpotCard[] {
  return hand.filter((card) => !card.isPlaceholder);
}

/** Count of each suit in a hand (ignores placeholder). */
export function suitCounts(hand: JackpotCard[]): Record<Suit, number> {
  const counts = Object.fromEntries(SUITS.map((suit) => [suit, 0])) as Record<Suit, number>;
  for (const card of realCards(hand)) {
    counts[card.suit] += 1;
  }
  return counts;
}

/**
 * Four-of-a-kind: any suit appears CARDS_PER_SUIT times in the hand.
 * Works at every table size; the placeholder never contributes to a set.
 */
export function findFourOfAKind(hand: JackpotCard[]): Suit | null {
  const counts = suitCounts(hand);
  for (const suit of SUITS) {
    if (counts[suit] >= CARDS_PER_SUIT) return suit;
  }
  return null;
}

export function teamHasFourOfAKind(
  players: PlayerSlot[],
  team: Team,
): { player: PlayerSlot; suit: Suit } | null {
  for (const player of players) {
    if (player.team !== team) continue;
    const suit = findFourOfAKind(player.hand);
    if (suit) return { player, suit };
  }
  return null;
}

/** Any four-of-a-kind anywhere on the table. */
export function findAnyFourOfAKind(
  players: PlayerSlot[],
): { player: PlayerSlot; suit: Suit } | null {
  for (const player of players) {
    const suit = findFourOfAKind(player.hand);
    if (suit) return { player, suit };
  }
  return null;
}

export function getPartner(players: PlayerSlot[], playerId: string): PlayerSlot | null {
  const player = players.find((entry) => entry.id === playerId);
  if (!player) return null;
  return (
    players.find(
      (entry) => entry.team === player.team && entry.id !== player.id,
    ) ?? null
  );
}

export function nextSeatPlayer(players: PlayerSlot[], playerId: string): PlayerSlot {
  const index = players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error(`Unknown player ${playerId}`);
  return players[(index + 1) % players.length];
}

/**
 * Pass one card clockwise from the seat that currently holds five cards.
 * The spare token may be passed (preferred by AI) — it never counts as a shape.
 */
export function passCard(
  state: GameSnapshot,
  fromPlayerId: string,
  cardId: string,
): GameSnapshot {
  if (state.activePlayerId !== fromPlayerId) {
    throw new Error("It is not this player's turn to pass.");
  }

  const players = state.players.map((player) => ({
    ...player,
    hand: [...player.hand],
  }));

  const from = players.find((player) => player.id === fromPlayerId);
  if (!from) throw new Error("Passer not found.");

  // Old saved snapshots predate table-size-specific hand sizes; infer their
  // base size so active older rooms can still pass without a full redeal.
  const baseHandSize = state.cardsPerPlayer ?? CARDS_PER_PLAYER;
  if (from.hand.length !== baseHandSize + 1) {
    throw new Error(`Only the player with ${baseHandSize + 1} cards can pass.`);
  }

  const cardIndex = from.hand.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) throw new Error("Card not in hand.");

  const selected = from.hand[cardIndex];
  from.hand.splice(cardIndex, 1);

  const to = nextSeatPlayer(players, fromPlayerId);
  to.hand.push(selected);

  const fromHandSize: number = from.hand.length;
  const toHandSize: number = to.hand.length;
  if (fromHandSize !== baseHandSize || toHandSize !== baseHandSize + 1) {
    throw new Error("Pass failed: only the active extra card may move to the next player.");
  }

  const activePlayers = players.filter((player) => player.hand.length === baseHandSize + 1);
  if (activePlayers.length !== 1 || activePlayers[0].id !== to.id) {
    throw new Error("Pass failed: exactly one player must hold the passing card.");
  }

  const logLine = `${from.name} passed a card → ${to.name}`;
  const passEvent = {
    id: `pass-${crypto.randomUUID()}`,
    fromPlayerId: from.id,
    fromName: from.name,
    toPlayerId: to.id,
    toName: to.name,
    createdAt: Date.now(),
  };

  return {
    ...state,
    players,
    activePlayerId: to.id,
    passCount: state.passCount + 1,
    log: [logLine, ...state.log].slice(0, 40),
    lastPassEvent: passEvent,
    passEvents: [...(state.passEvents ?? []), passEvent].slice(-20),
  };
}

/**
 * Index-based adapter for the foundational game loop.
 * The UI uses stable player/card IDs; simulations and server handlers can use
 * clockwise player indexes and a hand-card index directly.
 */
export function passCardByIndex(
  state: GameSnapshot,
  fromPlayerIndex: number,
  cardIndex: number,
): GameSnapshot {
  const from = state.players[fromPlayerIndex];
  if (!from) throw new Error("Pass failed: player index is out of range.");
  const toPlayerIndex = (fromPlayerIndex + 1) % state.players.length;
  if (!state.players[toPlayerIndex]) throw new Error("Pass failed: next player is out of range.");
  if (cardIndex < 0 || cardIndex >= from.hand.length) {
    throw new Error("Pass failed: card index is out of range.");
  }

  return passCard(state, from.id, from.hand[cardIndex].id);
}

/**
 * AI pass choice: dump the spare token if held; otherwise dump the weakest suit
 * while protecting a nest of 3+.
 */
export function chooseAiPassCard(hand: JackpotCard[]): JackpotCard {
  const spare = hand.find((card) => card.isPlaceholder);
  if (spare) return spare;

  const playable = realCards(hand);
  if (playable.length === 0) {
    throw new Error("AI has no cards to pass.");
  }

  const counts = suitCounts(hand);
  const bestSuit = SUITS.reduce((best, suit) =>
    counts[suit] > counts[best] ? suit : best,
  );

  const ranked = [...playable].sort((a, b) => {
    const score = (card: JackpotCard) => {
      if (card.suit === bestSuit && counts[bestSuit] >= 3) return 100;
      return counts[card.suit];
    };
    return score(a) - score(b);
  });

  return ranked[0];
}

export function resolveJackpot(
  state: GameSnapshot,
  callingPlayerId: string,
): RoundResult {
  const caller = state.players.find((player) => player.id === callingPlayerId);
  if (!caller) throw new Error("Caller not found.");

  const hit = teamHasFourOfAKind(state.players, caller.team);

  if (hit) {
    return {
      kind: "jackpot",
      valid: true,
      callingTeam: caller.team,
      callingPlayerId,
      scoringTeam: caller.team,
      suit: hit.suit,
      title: "JACKPOT!",
      detail: `${caller.name} called it — ${hit.player.name} holds four ${hit.suit}s. +1 ${caller.team}.`,
    };
  }

  return {
    kind: "jackpot",
    valid: false,
    callingTeam: caller.team,
    callingPlayerId,
    scoringTeam: null,
    suit: null,
    title: "False JACKPOT",
    detail: `${caller.name} called JACKPOT, but Team ${caller.team} has no four-of-a-kind. No point.`,
  };
}

/**
 * SUSPECT: you believe someone is sitting on a four-of-a-kind.
 * Valid if any opposing team currently has four-of-a-kind → you score.
 * If only your own team has it, suspect fails (you exposed your side).
 * If nobody has it, suspect fails.
 */
export function resolveSuspect(
  state: GameSnapshot,
  callingPlayerId: string,
): RoundResult {
  const caller = state.players.find((player) => player.id === callingPlayerId);
  if (!caller) throw new Error("Caller not found.");

  const hit = state.players.find((player) => player.team !== caller.team && findFourOfAKind(player.hand));
  const opposingSuit = hit ? findFourOfAKind(hit.hand) : null;

  if (hit && opposingSuit) {
    return {
      kind: "suspect",
      valid: true,
      callingTeam: caller.team,
      callingPlayerId,
      scoringTeam: caller.team,
      suit: opposingSuit,
      title: "SUSPECT lands",
      detail: `${caller.name} caught ${hit.name} (${hit.team}) with four ${opposingSuit}s. +1 ${caller.team}.`,
    };
  }

  const ownHit = state.players.find((player) => player.team === caller.team && findFourOfAKind(player.hand));
  const ownSuit = ownHit ? findFourOfAKind(ownHit.hand) : null;
  if (ownHit && ownSuit) {
    return {
      kind: "suspect",
      valid: false,
      callingTeam: caller.team,
      callingPlayerId,
      scoringTeam: null,
      suit: ownSuit,
      title: "Bad SUSPECT",
      detail: `${caller.name} suspected, but no opposing player has four-of-a-kind. No point.`,
    };
  }

  return {
    kind: "suspect",
    valid: false,
    callingTeam: caller.team,
    callingPlayerId,
    scoringTeam: null,
    suit: null,
    title: "Empty SUSPECT",
    detail: `${caller.name} called SUSPECT, but nobody has four-of-a-kind. No point.`,
  };
}

export function applyRoundScore(scores: ScoreBoard, result: RoundResult): ScoreBoard {
  if (!result.scoringTeam) return { ...scores };
  return {
    ...scores,
    [result.scoringTeam]: scores[result.scoringTeam] + 1,
  };
}

/** Rotate so viewer sits at visual bottom (index 0). */
export function rotatePlayersForViewer(
  players: PlayerSlot[],
  viewerId: string,
): PlayerSlot[] {
  const viewerIndex = players.findIndex((player) => player.id === viewerId);
  if (viewerIndex <= 0) return players;
  return [...players.slice(viewerIndex), ...players.slice(0, viewerIndex)];
}

/**
 * Authoritative Jackpot round engine.
 *
 * Every actor — a human clicking a button or a bot making a decision — submits
 * a `GameAction`. The engine is the ONLY thing that validates and resolves it.
 * Bots never mutate state directly, so a buggy bot can at worst make an illegal
 * request (rejected) or a bad legal call (penalised), exactly like a human.
 *
 * The engine knows everything. Players only ever see a filtered observation
 * (see `observePlayer`), which is what keeps bots from accidentally cheating.
 */

import { type JackpotCard, type Suit, type Team, CARDS_PER_SUIT, SUITS } from "@/lib/deck";
import {
  type GameSnapshot,
  type RoundResult,
  SIGNAL_DECISION_WINDOW_MS,
  SUSPECT_ATTEMPTS_PER_TEAM,
  findFourOfAKind,
  getPartner,
  passCard,
  resolveSuspect,
} from "@/lib/game";
import { ALL_SIGNAL_IDS } from "@/lib/signals";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type GameAction =
  | { type: "pass"; playerId: string; cardId: string }
  /** Flash this team's agreed secret signal. */
  | { type: "signal"; playerId: string }
  /** Flash a decoy gesture. It must not be the team's real signal. */
  | { type: "fake-signal"; playerId: string; signalId: string }
  | { type: "jackpot"; playerId: string }
  | { type: "suspect"; playerId: string; targetPlayerId?: string; selectedCardIds?: [string, string] }
  | { type: "reaction"; playerId: string; reactionId: string };

/**
 * Everything that happens at the table that every seat can see.
 * Note what is deliberately NOT here: which card was passed, and whether a
 * flashed gesture was a team's real signal or a decoy.
 */
export type PublicEvent =
  | { seq: number; at: number; type: "pass"; playerId: string; toPlayerId: string }
  | { seq: number; at: number; type: "signal"; playerId: string; signalId: string }
  | { seq: number; at: number; type: "reaction"; playerId: string; reactionId: string }
  | { seq: number; at: number; type: "jackpot"; playerId: string; valid: boolean }
  | { seq: number; at: number; type: "suspect"; playerId: string; targetPlayerId?: string; valid: boolean };

/** Private knowledge a single seat accumulates (only that seat may observe it). */
export type PrivateCardEvent = { seq: number; direction: "sent" | "received"; suit: Suit; cardId: string };

export type RoundRules = {
  suspectsPerTeam: number;
  /**
   * Classic rule: the player holding four signals, and their PARTNER calls.
   * When false, a player cannot score by calling JACKPOT on their own hand —
   * otherwise nobody would ever need to signal.
   */
  selfJackpotAllowed: boolean;
};

export const DEFAULT_ROUND_RULES: RoundRules = {
  suspectsPerTeam: SUSPECT_ATTEMPTS_PER_TEAM,
  selfJackpotAllowed: false,
};

export type RoundState = {
  game: GameSnapshot;
  rules: RoundRules;
  /** PRIVATE: each team's agreed secret signal. Never exposed to other teams. */
  teamSignals: Partial<Record<Team, string>>;
  /** Public deck composition: suits with a full set of four in play. */
  suitsInPlay: Suit[];
  suspectsRemaining: Partial<Record<Team, number>>;
  events: PublicEvent[];
  /** PRIVATE per-seat card history (what I sent / received). */
  privateLog: Record<string, PrivateCardEvent[]>;
  seq: number;
  status: "playing" | "over";
  result: RoundResult | null;
};

export type ActionOutcome =
  | { ok: true; state: RoundState; event: PublicEvent; result: RoundResult | null }
  | { ok: false; state: RoundState; error: string };

/* -------------------------------------------------------------------------- */
/* Round lifecycle                                                             */
/* -------------------------------------------------------------------------- */

export function createRoundState(
  game: GameSnapshot,
  teamSignals: Partial<Record<Team, string>>,
  rules: Partial<RoundRules> = {},
): RoundState {
  const merged = { ...DEFAULT_ROUND_RULES, ...rules };
  const teams = Array.from(new Set(game.players.map((player) => player.team)));
  const suitTotals = new Map<Suit, number>();
  for (const player of game.players) {
    for (const card of player.hand) suitTotals.set(card.suit, (suitTotals.get(card.suit) ?? 0) + 1);
  }
  return {
    game,
    rules: merged,
    teamSignals: { ...teamSignals },
    suitsInPlay: SUITS.filter((suit) => (suitTotals.get(suit) ?? 0) >= CARDS_PER_SUIT),
    suspectsRemaining: Object.fromEntries(teams.map((team) => [team, merged.suspectsPerTeam])),
    events: [],
    privateLog: Object.fromEntries(game.players.map((player) => [player.id, []])),
    seq: 0,
    status: "playing",
    result: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The single validation + resolution entry point                              */
/* -------------------------------------------------------------------------- */

export function applyAction(state: RoundState, action: GameAction, now: number): ActionOutcome {
  const reject = (error: string): ActionOutcome => ({ ok: false, state, error });

  if (state.status !== "playing") return reject("The round is already over.");
  const actor = state.game.players.find((player) => player.id === action.playerId);
  if (!actor) return reject("That player is not seated at this table.");

  const seq = state.seq + 1;

  switch (action.type) {
    case "pass": {
      const card = actor.hand.find((entry) => entry.id === action.cardId);
      let game: GameSnapshot;
      try {
        game = passCard(state.game, actor.id, action.cardId);
      } catch (error) {
        return reject(error instanceof Error ? error.message : "Illegal pass.");
      }
      const toPlayerId = game.activePlayerId;
      const event: PublicEvent = { seq, at: now, type: "pass", playerId: actor.id, toPlayerId };
      const privateLog = { ...state.privateLog };
      if (card) {
        privateLog[actor.id] = [...(privateLog[actor.id] ?? []), { seq, direction: "sent", suit: card.suit, cardId: card.id }];
        privateLog[toPlayerId] = [...(privateLog[toPlayerId] ?? []), { seq, direction: "received", suit: card.suit, cardId: card.id }];
      }
      return accept({ ...state, game, privateLog }, event, null);
    }

    case "signal":
    case "fake-signal": {
      if (actor.hand.length > 4) {
        return reject("Cannot signal while holding a 5th card — pass your extra card first!");
      }
      const teamSignal = state.teamSignals[actor.team];
      let signalId: string;
      if (action.type === "signal") {
        if (!teamSignal) return reject("Your team has not agreed on a signal.");
        signalId = teamSignal;
      } else {
        if (!ALL_SIGNAL_IDS.includes(action.signalId)) return reject("Unknown gesture.");
        if (action.signalId === teamSignal) return reject("A decoy cannot use your team's real signal.");
        signalId = action.signalId;
      }
      const event: PublicEvent = { seq, at: now, type: "signal", playerId: actor.id, signalId };
      const legacy = {
        id: `signal-${seq}-${now}`,
        playerId: actor.id,
        playerName: actor.name,
        signalId,
        createdAt: now,
        expiresAt: now + SIGNAL_DECISION_WINDOW_MS,
      };
      const game: GameSnapshot = {
        ...state.game,
        publicSignals: [...(state.game.publicSignals ?? []), legacy].slice(-20),
        log: [`${actor.name} flashed a ${signalId} gesture.`, ...state.game.log].slice(0, 40),
      };
      return accept({ ...state, game }, event, null);
    }

    case "jackpot": {
      const result = resolveTeamJackpot(state, actor.id);
      const event: PublicEvent = { seq, at: now, type: "jackpot", playerId: actor.id, valid: result.valid };
      // Any JACKPOT call ends the round: valid scores, false hands the point away.
      return accept({ ...state, status: "over", result }, event, result);
    }

    case "suspect": {
      const remaining = state.suspectsRemaining[actor.team] ?? 0;
      if (remaining <= 0) return reject("Your team has no SUSPECT calls left this round.");
      const result = resolveSuspect(state.game, actor.id, action.targetPlayerId, action.selectedCardIds);
      const event: PublicEvent = {
        seq,
        at: now,
        type: "suspect",
        playerId: actor.id,
        targetPlayerId: action.targetPlayerId,
        valid: result.valid,
      };
      const next: RoundState = {
        ...state,
        suspectsRemaining: { ...state.suspectsRemaining, [actor.team]: remaining - 1 },
      };
      // A correct SUSPECT ends the round; a false alarm only burns an attempt.
      return result.valid
        ? accept({ ...next, status: "over", result }, event, result)
        : accept(next, event, result);
    }

    case "reaction": {
      const event: PublicEvent = { seq, at: now, type: "reaction", playerId: actor.id, reactionId: action.reactionId };
      return accept(state, event, null);
    }
  }
}

function accept(state: RoundState, event: PublicEvent, result: RoundResult | null): ActionOutcome {
  return { ok: true, state: { ...state, seq: event.seq, events: [...state.events, event] }, event, result };
}

/**
 * JACKPOT resolution honouring the partner rule. A call is valid when a
 * teammate (or, if allowed by the rules, the caller) holds four of a kind.
 */
export function resolveTeamJackpot(state: RoundState, callerId: string): RoundResult {
  const players = state.game.players;
  const caller = players.find((player) => player.id === callerId);
  if (!caller) throw new Error("Caller not found.");

  const holder = players.find(
    (player) =>
      player.team === caller.team &&
      (state.rules.selfJackpotAllowed || player.id !== caller.id) &&
      player.hand.length === 4 &&
      findFourOfAKind(player.hand),
  );
  const suit = holder ? findFourOfAKind(holder.hand) : null;

  if (holder && suit) {
    return {
      kind: "jackpot",
      valid: true,
      callingTeam: caller.team,
      callingPlayerId: caller.id,
      scoringTeam: caller.team,
      suit,
      title: "JACKPOT!",
      detail: `${caller.name} called it — ${holder.name} holds four ${suit}s. +1 ${caller.team}.`,
    };
  }

  const holderWithFive = players.find(
    (player) =>
      player.team === caller.team &&
      player.hand.length > 4 &&
      findFourOfAKind(player.hand),
  );
  const opponent = players.find((player) => player.team !== caller.team)?.team ?? null;
  if (holderWithFive) {
    return {
      kind: "jackpot",
      valid: false,
      callingTeam: caller.team,
      callingPlayerId: caller.id,
      scoringTeam: opponent,
      suit: null,
      title: "Premature JACKPOT!",
      detail: `${caller.name} called JACKPOT while ${holderWithFive.name} was still holding a 5th card — must pass the extra card first!${opponent ? ` +1 Team ${opponent}.` : ""}`,
    };
  }

  const ownFour = caller.hand.length === 4 && findFourOfAKind(caller.hand);
  return {
    kind: "jackpot",
    valid: false,
    callingTeam: caller.team,
    callingPlayerId: caller.id,
    scoringTeam: opponent,
    suit: null,
    title: "False JACKPOT!",
    detail: ownFour
      ? `${caller.name} called JACKPOT on their own hand — your partner has to make the call.${opponent ? ` +1 Team ${opponent}.` : ""}`
      : `${caller.name} called JACKPOT, but no teammate has four of a kind.${opponent ? ` +1 Team ${opponent}.` : ""}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Information filter                                                          */
/* -------------------------------------------------------------------------- */

export type SeatView = { id: string; name: string; team: Team; seatIndex: number; handCount: number };

/**
 * What one seat is legitimately allowed to know. This is the ONLY input a bot
 * receives. It contains no other player's cards and no other team's signal.
 */
export type PlayerObservation = {
  now: number;
  status: RoundState["status"];
  me: SeatView;
  hand: JackpotCard[];
  seats: SeatView[];
  partnerId: string | null;
  /** The seat that receives my passes (always an opponent at alternating tables). */
  leftId: string;
  /** The seat that passes to me. */
  rightId: string;
  activePlayerId: string;
  isMyTurn: boolean;
  suitsInPlay: Suit[];
  /** My own team's agreed signal, if any. */
  teamSignalId: string | null;
  mySuspectsRemaining: number;
  passCount: number;
  events: PublicEvent[];
  myCardHistory: PrivateCardEvent[];
};

export function observePlayer(state: RoundState, playerId: string, now: number): PlayerObservation {
  const players = state.game.players;
  const index = players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error(`Unknown player ${playerId}`);
  const me = players[index];
  const view = (player: (typeof players)[number]): SeatView => ({
    id: player.id,
    name: player.name,
    team: player.team,
    seatIndex: player.seatIndex,
    handCount: player.hand.length,
  });

  return {
    now,
    status: state.status,
    me: view(me),
    hand: me.hand.map((card) => ({ ...card })),
    seats: players.map(view),
    partnerId: getPartner(players, playerId)?.id ?? null,
    leftId: players[(index + 1) % players.length].id,
    rightId: players[(index - 1 + players.length) % players.length].id,
    activePlayerId: state.game.activePlayerId,
    isMyTurn: state.game.activePlayerId === playerId,
    suitsInPlay: [...state.suitsInPlay],
    teamSignalId: state.teamSignals[me.team] ?? null,
    mySuspectsRemaining: state.suspectsRemaining[me.team] ?? 0,
    passCount: state.game.passCount,
    events: state.events,
    myCardHistory: state.privateLog[playerId] ?? [],
  };
}

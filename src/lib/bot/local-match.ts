/**
 * Local Match Coordinator.
 *
 * Runs a deterministic 4-player match locally in-browser or on server:
 * - Seat 0 (South): Human Player (Team Alpha)
 * - Seat 1 (East):  AI Opponent 1 (Team Bravo)
 * - Seat 2 (North): AI Partner   (Team Alpha)
 * - Seat 3 (West):  AI Opponent 2 (Team Bravo)
 *
 * All decisions from both human and bots flow through the authoritative engine (`applyAction`).
 * Bots receive strictly filtered observations (`observePlayer`).
 *
 * Archetype personalities:
 * - Human player chooses AI Partner (e.g. Strategist, Trickster, Hawk, Gambler, Loyalist, Chaos).
 * - Opponents are selected automatically.
 */

import { setupJackpotRound, type Team } from "../deck";
import {
  applyAction,
  createRoundState,
  observePlayer,
  type GameAction,
  type RoundRules,
  type RoundState,
} from "@/lib/engine";
import { type RoundResult, chooseSuspectDefenseCards } from "@/lib/game";
import { ALL_SIGNAL_IDS } from "@/lib/signals";
import { createRng } from "@/lib/rng";
import { BotAgent } from "./agent";
import { createBotProfile, type BotDifficulty } from "./profiles";
import {
  type BotArchetypeId,
  getArchetype,
  selectOpponents,
} from "./archetypes";

export type LocalMatchBotSetup = {
  partnerArchetype: BotArchetypeId;
  opponentArchetypes: [BotArchetypeId, BotArchetypeId];
};

import { createTutorialDeal } from "@/lib/tutorial";

export type LocalMatchConfig = {
  humanPlayerName: string;
  humanPlayerId?: string;
  humanTeamSignal: string;
  opponentsSignal?: string;
  difficulty?: BotDifficulty;
  partnerArchetype?: BotArchetypeId;
  opponentArchetypes?: [BotArchetypeId, BotArchetypeId];
  previousOpponents?: [BotArchetypeId, BotArchetypeId];
  seed?: number;
  rules?: Partial<RoundRules>;
  tutorialRound?: 1 | 2;
};

export class LocalMatch {
  readonly humanId: string;
  readonly partnerId: string;
  readonly opponent1Id: string;
  readonly opponent2Id: string;
  readonly difficulty: BotDifficulty;

  readonly partnerArchetype: BotArchetypeId;
  readonly opponent1Archetype: BotArchetypeId;
  readonly opponent2Archetype: BotArchetypeId;

  state: RoundState;
  bots: Map<string, BotAgent>;
  now: number;
  public onSuspectIntent?: (action: { type: "suspect"; playerId: string; targetPlayerId?: string }) => void;

  constructor(config: LocalMatchConfig, startTime?: number) {
    this.humanId = config.humanPlayerId ?? "player-you";
    this.difficulty = config.difficulty ?? "normal";
    this.now = startTime ?? (config.seed != null ? 0 : Date.now());

    const rng = createRng(config.seed ?? Math.floor(Math.random() * 0xffffffff));

    // Partner archetype selected by player (defaults to Strategist)
    this.partnerArchetype = config.partnerArchetype ?? "strategist";

    // Opponents selected automatically (player CANNOT choose opponents)
    const opponents =
      config.opponentArchetypes ??
      selectOpponents(this.partnerArchetype, config.previousOpponents, () => rng.range(0, 1));
    this.opponent1Archetype = opponents[0];
    this.opponent2Archetype = opponents[1];

    const partnerMeta = getArchetype(this.partnerArchetype);
    const opp1Meta = getArchetype(this.opponent1Archetype);
    const opp2Meta = getArchetype(this.opponent2Archetype);

    // Seated names
    // Seat 0: Human, Seat 1: Opponent 1, Seat 2: Partner, Seat 3: Opponent 2
    const names = [
      config.humanPlayerName,
      opp1Meta.name,
      partnerMeta.name,
      opp2Meta.name,
    ];

    // Create 4-player deal with seeded RNG or tutorial script
    const deal = config.tutorialRound
      ? createTutorialDeal(config.tutorialRound, this.humanId, partnerMeta.name, opp1Meta.name, opp2Meta.name)
      : setupJackpotRound(names, (max) => rng.int(max));

    // Standardize IDs so human is seat 0
    deal.players[0].id = this.humanId;
    deal.players[1].id = "player-east";
    deal.players[2].id = "player-north";
    deal.players[3].id = "player-west";

    this.opponent1Id = deal.players[1].id;
    this.partnerId = deal.players[2].id;
    this.opponent2Id = deal.players[3].id;

    if (deal.starterPlayerId === "player-0") {
      deal.starterPlayerId = this.humanId;
    }

    // Choose opponents' secret signal (different from human team's signal)
    const availableOpponentSignals = ALL_SIGNAL_IDS.filter(
      (id) => id !== config.humanTeamSignal
    );
    const opponentSignal =
      config.opponentsSignal ?? rng.pick(availableOpponentSignals);

    const teamSignals: Partial<Record<Team, string>> = {
      Alpha: config.humanTeamSignal,
      Bravo: opponentSignal,
    };

    this.state = createRoundState(
      {
        ...deal,
        activePlayerId: deal.starterPlayerId,
        passCount: 0,
        log: [`Round started. 4 players seated. Alternating teams Alpha vs Bravo.`],
      },
      teamSignals,
      config.rules
    );

    // Build distinct profiles for each bot based on difficulty + individual archetype
    const opp1Profile = createBotProfile(this.difficulty, this.opponent1Archetype);
    const partnerProfile = createBotProfile(this.difficulty, this.partnerArchetype);
    const opp2Profile = createBotProfile(this.difficulty, this.opponent2Archetype);

    if (config.tutorialRound === 1) {
      opp1Profile.suspectCurve = [];
      opp2Profile.suspectCurve = [];
    } else if (config.tutorialRound === 2) {
      partnerProfile.suspectCurve = [];
    }

    this.bots = new Map();
    this.bots.set(
      this.opponent1Id,
      new BotAgent(this.opponent1Id, opp1Profile, rng.int(0xffffffff))
    );
    this.bots.set(
      this.partnerId,
      new BotAgent(this.partnerId, partnerProfile, rng.int(0xffffffff))
    );
    this.bots.set(
      this.opponent2Id,
      new BotAgent(this.opponent2Id, opp2Profile, rng.int(0xffffffff))
    );
  }

  /**
   * Advance simulation time to `targetTime` in discrete steps.
   * Runs bot thinking ticks and executes scheduled actions via `applyAction`.
   */
  stepTo(targetTime: number, stepMs = 100): Array<{ action: GameAction; outcome: RoundResult | null }> {
    const executed: Array<{ action: GameAction; outcome: RoundResult | null }> = [];
    if (this.state.status !== "playing") return executed;

    while (this.now < targetTime && this.state.status === "playing") {
      this.now = Math.min(this.now + stepMs, targetTime);

      for (const [botId, bot] of this.bots) {
        if (this.state.status !== "playing") break;

        const obs = observePlayer(this.state, botId, this.now);
        const decision = bot.think(obs);

        if (decision.action) {
          if (decision.action.type === "suspect") {
            if (this.onSuspectIntent) {
              this.onSuspectIntent(decision.action);
              executed.push({ action: decision.action, outcome: null });
              break;
            } else {
              // Headless / fallback auto-resolve:
              const targetId = decision.action.targetPlayerId;
              const target = targetId ? this.state.game.players.find((p) => p.id === targetId) : undefined;
              const selected = target && target.hand.length >= 2
                ? (chooseSuspectDefenseCards(target.hand).map((c) => c.id) as [string, string])
                : undefined;
              const actionWithCards: GameAction = { ...decision.action, selectedCardIds: selected };
              const outcome = applyAction(this.state, actionWithCards, this.now);
              if (outcome.ok) {
                this.state = outcome.state;
                executed.push({ action: decision.action, outcome: outcome.result });
              }
            }
          } else {
            const outcome = applyAction(this.state, decision.action, this.now);
            if (outcome.ok) {
              this.state = outcome.state;
              executed.push({ action: decision.action, outcome: outcome.result });
            }
          }
        }
      }
    }

    return executed;
  }

  /**
   * Resolve an intercepted suspect action (e.g. after dramatic reveal sequence).
   */
  resolveSuspectAction(action: {
    type: "suspect";
    playerId: string;
    targetPlayerId?: string;
    selectedCardIds?: [string, string];
  }): { ok: boolean; error?: string; result: RoundResult | null } {
    const outcome = applyAction(this.state, action, this.now);
    if (!outcome.ok) {
      return { ok: false, error: outcome.error, result: null };
    }
    this.state = outcome.state;
    return { ok: true, result: outcome.result };
  }

  /**
   * Human player submits an action (e.g. pass, signal, jackpot, suspect).
   * Validated and resolved through the authoritative engine.
   */
  submitHumanAction(action: GameAction): { ok: boolean; error?: string; result: RoundResult | null } {
    if (action.playerId !== this.humanId) {
      return { ok: false, error: "Action is not from the human player.", result: null };
    }

    const outcome = applyAction(this.state, action, this.now);
    if (!outcome.ok) {
      return { ok: false, error: outcome.error, result: null };
    }

    this.state = outcome.state;
    return { ok: true, result: outcome.result };
  }

  /**
   * Get what the human player is legitimately allowed to observe.
   */
  getHumanObservation() {
    return observePlayer(this.state, this.humanId, this.now);
  }

  /**
   * Get public details of bot roster for post-match reveal
   */
  getMatchRoster(): {
    partner: ReturnType<typeof getArchetype>;
    opponents: [ReturnType<typeof getArchetype>, ReturnType<typeof getArchetype>];
  } {
    return {
      partner: getArchetype(this.partnerArchetype),
      opponents: [
        getArchetype(this.opponent1Archetype),
        getArchetype(this.opponent2Archetype),
      ],
    };
  }
}

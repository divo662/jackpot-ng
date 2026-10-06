/**
 * Bot Player Agent.
 *
 * Implements the 4 core AI behaviours:
 * 1. AI Teammate:
 *    - Watches for partner's real agreed signal.
 *    - Calls JACKPOT with realistic human reaction delay.
 *    - Rejects decoy signals unless confused by mistake profile.
 * 2. AI Signalling:
 *    - When holding four-of-a-kind, decides when and how to signal.
 *    - Uses delay, optional decoy gesture before the real signal, and re-signalling.
 *    - Emits occasional ambient decoys to keep opponents guessing.
 * 3. AI Opponent / Suspicion:
 *    - Observes public gestures from opponents over time.
 *    - Computes suspicion score per opponent using time decay, gesture novelty, and card counting.
 *    - Triggers SUSPECT based on graded probability curve and cooldown.
 * 4. AI Passing:
 *    - Evaluates hand and passes cards toward building 4-of-a-kind using choosePassCard.
 *
 * CRITICAL RULE: The bot NEVER accesses private state of other players.
 * It operates strictly on PlayerObservation.
 */

import { ALL_SIGNAL_IDS } from "@/lib/signals";
import { type GameAction, type PlayerObservation, type PublicEvent } from "@/lib/engine";
import { findFourOfAKind } from "@/lib/game";
import { createRng, type Rng } from "@/lib/rng";
import { createBotProfile, BOT_PROFILES, type BotDifficulty, type BotProfile } from "./profiles";
import { type BotArchetypeId } from "./archetypes";
import {
  choosePassCard,
  estimateOpponentFour,
  suspectProbability,
  type GestureStat,
  type ObservedGesture,
  type SuspicionEstimate,
} from "./strategy";

export type BotMemory = {
  lastSuspectAt: number;
  lastPassScheduledFor: number | null;
  lastSignalAt: number;
  signalCount: number;
  nextAmbientDecoyAt: number;
  observedGestures: ObservedGesture[];
  /** Historical gesture stats: team -> signalId -> { flashes, hits } */
  gestureStats: Record<string, Record<string, GestureStat>>;
  plannedAction: { action: GameAction; executeAt: number } | null;
};

export function createBotMemory(rng: Rng, profile: BotProfile): BotMemory {
  return {
    lastSuspectAt: 0,
    lastPassScheduledFor: null,
    lastSignalAt: 0,
    signalCount: 0,
    nextAmbientDecoyAt: Number.POSITIVE_INFINITY,
    observedGestures: [],
    gestureStats: {},
    plannedAction: null,
  };
}

export type BotDecision = {
  action: GameAction | null;
  executeAt: number | null;
  debugReason?: string;
  suspicion?: SuspicionEstimate;
};

export class BotAgent {
  readonly playerId: string;
  readonly profile: BotProfile;
  readonly rng: Rng;
  memory: BotMemory;
  private lastProcessedSeq = 0;

  constructor(
    playerId: string,
    difficultyOrProfile: BotDifficulty | BotProfile = "normal",
    seed?: number,
    archetypeId?: BotArchetypeId
  ) {
    this.playerId = playerId;
    if (typeof difficultyOrProfile === "object") {
      this.profile = difficultyOrProfile;
    } else {
      this.profile = createBotProfile(difficultyOrProfile, archetypeId ?? "strategist");
    }
    this.rng = createRng(seed ?? Math.floor(Math.random() * 0xffffffff));
    this.memory = createBotMemory(this.rng, this.profile);
  }

  /**
   * Updates internal memory with newly observed public events since last tick.
   */
  updateMemory(obs: PlayerObservation): void {
    const newEvents = obs.events.filter((e) => e.seq > this.lastProcessedSeq);
    for (const event of newEvents) {
      this.lastProcessedSeq = Math.max(this.lastProcessedSeq, event.seq);

      if (event.type === "signal") {
        const seat = obs.seats.find((s) => s.id === event.playerId);
        const team = seat?.team ?? "Bravo";
        const teamGestures = this.memory.observedGestures.filter(
          (g) => g.team === team && g.signalId === event.signalId
        );
        const flashIndex = teamGestures.length + 1;

        const gesture: ObservedGesture = {
          seq: event.seq,
          at: event.at,
          playerId: event.playerId,
          team,
          signalId: event.signalId,
          flashIndex,
        };
        this.memory.observedGestures.push(gesture);

        // Keep last 30 gestures
        if (this.memory.observedGestures.length > 30) {
          this.memory.observedGestures.shift();
        }

        // Track stats for cross-round learning
        if (!this.memory.gestureStats[team]) {
          this.memory.gestureStats[team] = {};
        }
        if (!this.memory.gestureStats[team][event.signalId]) {
          this.memory.gestureStats[team][event.signalId] = { flashes: 0, hits: 0 };
        }
        this.memory.gestureStats[team][event.signalId].flashes += 1;
      } else if (event.type === "jackpot" && event.valid) {
        // Record which gestures preceded this winning jackpot
        const caller = obs.seats.find((s) => s.id === event.playerId);
        if (caller) {
          const recent = this.memory.observedGestures.filter(
            (g) => g.team === caller.team && event.at - g.at < 15000
          );
          for (const g of recent) {
            const stat = this.memory.gestureStats[g.team]?.[g.signalId];
            if (stat) stat.hits += 1;
          }
        }
      }
    }
  }

  /**
   * Main decision tick: evaluates observation and plans or executes actions.
   * Returns an action if ready to execute right now (`executeAt <= obs.now`).
   */
  think(obs: PlayerObservation): BotDecision {
    if (obs.status !== "playing") {
      this.memory.plannedAction = null;
      return { action: null, executeAt: null };
    }

    this.updateMemory(obs);
    const now = obs.now;

    // 1. If we already have a pending action whose scheduled time has arrived, fire it!
    if (this.memory.plannedAction) {
      if (now >= this.memory.plannedAction.executeAt) {
        const action = this.memory.plannedAction.action;
        this.memory.plannedAction = null;

        // Verify action is still legal given current observation
        if (action.type === "pass" && !obs.isMyTurn) {
          // Pass is no longer our turn
        } else {
          return { action, executeAt: now, debugReason: "executed planned action" };
        }
      } else {
        // Still waiting for planned action time to arrive
        return {
          action: null,
          executeAt: this.memory.plannedAction.executeAt,
          debugReason: "waiting on planned action delay",
        };
      }
    }

    // 2. BEHAVIOUR 1: AI TEAMMATE — Watch for partner's signal and call JACKPOT
    const partnerJackpotDecision = this.checkPartnerSignal(obs, now);
    if (partnerJackpotDecision) {
      return partnerJackpotDecision;
    }

    // 3. BEHAVIOUR 3: AI OPPONENT — Suspicion and catching opposing 4-of-a-kind
    const suspectDecision = this.checkOpponentSuspicion(obs, now);
    if (suspectDecision) {
      return suspectDecision;
    }

    // 4. BEHAVIOUR 2: AI SIGNALLING — Flash signal if holding four-of-a-kind
    const four = findFourOfAKind(obs.hand);
    if (four) {
      const signalDecision = this.planSignalling(obs, now);
      if (signalDecision) {
        return signalDecision;
      }
    } else {
      // Ambient decoy when not holding four
      const ambientDecoy = this.checkAmbientDecoy(obs, now);
      if (ambientDecoy) {
        return ambientDecoy;
      }
    }

    // 5. BEHAVIOUR 4: AI PASSING — Pass card if it's our turn
    if (obs.isMyTurn) {
      const passDecision = this.planPass(obs, now);
      if (passDecision) {
        return passDecision;
      }
    }

    return { action: null, executeAt: null, debugReason: "idle" };
  }

  /* ------------------------------------------------------------------------ */
  /* Behaviour Implementations                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Partner monitoring: detects when partner flashes the agreed signal.
   */
  private checkPartnerSignal(obs: PlayerObservation, now: number): BotDecision | null {
    if (!obs.partnerId || !obs.teamSignalId) return null;

    // Look for recent partner signals
    const recentPartnerSignals = obs.events.filter(
      (e): e is PublicEvent & { type: "signal" } =>
        e.type === "signal" &&
        e.playerId === obs.partnerId &&
        now - e.at < 12000
    );

    if (recentPartnerSignals.length === 0) return null;

    const latest = recentPartnerSignals[recentPartnerSignals.length - 1];
    // Teammates MUST strictly verify that the partner flashed the agreed team signal
    if (latest.signalId !== obs.teamSignalId) {
      return null;
    }

    // Chance to miss the signal
    if (this.rng.chance(this.profile.missPartnerSignal)) {
      return null;
    }

    // Schedule JACKPOT call with human-like reaction time
    const delay = this.rng.range(
      this.profile.jackpotReactionMs[0],
      this.profile.jackpotReactionMs[1]
    );
    const executeAt = now + delay;
    this.memory.plannedAction = {
      action: { type: "jackpot", playerId: this.playerId },
      executeAt,
    };

    return {
      action: null,
      executeAt,
      debugReason: `partner signal detected (${latest.signalId}), calling JACKPOT in ${Math.round(delay)}ms`,
    };
  }

  /**
   * Suspicion detection: computes suspicion and decides whether to SUSPECT.
   */
  private checkOpponentSuspicion(obs: PlayerObservation, now: number): BotDecision | null {
    if (obs.mySuspectsRemaining <= 0) return null;

    // Grace period at start of round before this bot evaluates opponent suspicion
    if (this.memory.lastSuspectAt === 0) {
      this.memory.lastSuspectAt = now + this.rng.range(3000, 7000);
      return null;
    }
    if (now < this.memory.lastSuspectAt) {
      return null;
    }

    // Check cooldown
    if (now - this.memory.lastSuspectAt < this.profile.suspectCooldownMs) {
      return null;
    }

    // Bots cannot suspect until cards have started circulating OR an opponent has visibly signaled
    const hasOpponentSignaled = this.memory.observedGestures.some((g) => g.team !== obs.me.team);
    if (obs.passCount < 4 && !hasOpponentSignaled) {
      return null;
    }

    const estimate = estimateOpponentFour(
      obs,
      this.memory.observedGestures,
      this.memory.gestureStats,
      this.profile,
      now
    );

    if (estimate.impossible) return null;

    // Add perception noise to probability
    const noisyEstimate = Math.min(
      1,
      Math.max(
        0,
        estimate.probability +
          this.rng.range(-this.profile.perceptionNoise, this.profile.perceptionNoise)
      )
    );

    const chanceToSuspect = suspectProbability(noisyEstimate, this.profile);

    if (chanceToSuspect > 0 && this.rng.chance(chanceToSuspect)) {
      // Find the specific opponent with the highest individual suspicion who has passed their 5th card
      const opponentEntries = Object.entries(estimate.perPlayer);
      let targetPlayerId: string | undefined = undefined;
      let maxSuspicion = -1;
      for (const [pId, score] of opponentEntries) {
        const seat = obs.seats.find((s) => s.id === pId);
        if (seat && seat.handCount === 4 && score > maxSuspicion) {
          maxSuspicion = score;
          targetPlayerId = pId;
        }
      }

      // If nobody has an active gesture, pick an opponent who has passed their 5th card
      if (!targetPlayerId) {
        const opponents = obs.seats.filter((seat) => seat.team !== obs.me.team && seat.handCount === 4);
        targetPlayerId = opponents.length > 0 ? this.rng.pick(opponents).id : undefined;
      }

      if (!targetPlayerId) return null;

      const delay = this.rng.range(
        this.profile.suspectReactionMs[0],
        this.profile.suspectReactionMs[1]
      );
      const executeAt = now + delay;
      this.memory.lastSuspectAt = executeAt;
      this.memory.plannedAction = {
        action: { type: "suspect", playerId: this.playerId, targetPlayerId },
        executeAt,
      };

      return {
        action: null,
        executeAt,
        debugReason: `suspicion triggered (${(noisyEstimate * 100).toFixed(0)}%) against ${targetPlayerId}, calling SUSPECT in ${Math.round(delay)}ms`,
        suspicion: estimate,
      };
    }

    return null;
  }

  /**
   * Signalling strategy when holding four-of-a-kind.
   */
  private planSignalling(obs: PlayerObservation, now: number): BotDecision | null {
    if (!obs.teamSignalId) return null;
    // Cannot signal while holding a 5th card — must pass first
    if (obs.hand.length !== 4) return null;

    if (this.memory.signalCount >= this.profile.maxSignals) return null;

    // Check if re-signal time has arrived
    const timeSinceLastSignal = now - this.memory.lastSignalAt;
    const shouldSignal =
      this.memory.signalCount === 0 || timeSinceLastSignal >= this.profile.resignalAfterMs;

    if (!shouldSignal) return null;

    // Decide whether to flash a decoy first to misdirect opponents
    const useDecoyFirst =
      this.memory.signalCount === 0 && this.rng.chance(this.profile.decoyBeforeSignal);

    const delay = this.rng.range(
      this.profile.signalDelayMs[0],
      this.profile.signalDelayMs[1]
    );
    const executeAt = now + delay;
    this.memory.lastSignalAt = executeAt;
    this.memory.signalCount += 1;

    if (useDecoyFirst) {
      const decoys = ALL_SIGNAL_IDS.filter((id) => id !== obs.teamSignalId);
      const decoyId = this.rng.pick(decoys);
      this.memory.plannedAction = {
        action: { type: "fake-signal", playerId: this.playerId, signalId: decoyId },
        executeAt,
      };
      return {
        action: null,
        executeAt,
        debugReason: `bluff decoy before real signal scheduled in ${Math.round(delay)}ms`,
      };
    }

    this.memory.plannedAction = {
      action: { type: "signal", playerId: this.playerId },
      executeAt,
    };

    return {
      action: null,
      executeAt,
      debugReason: `real signal scheduled in ${Math.round(delay)}ms`,
    };
  }

  private checkAmbientDecoy(obs: PlayerObservation, now: number): BotDecision | null {
    if (this.profile.ambientDecoysPerMinute <= 0 || !obs.teamSignalId) return null;
    // Ambient decoys should only start once the round is actively underway
    if (obs.passCount < 8) return null;

    if (!Number.isFinite(this.memory.nextAmbientDecoyAt)) {
      const interval = (60000 / this.profile.ambientDecoysPerMinute) * this.rng.range(0.8, 1.5);
      this.memory.nextAmbientDecoyAt = now + interval;
      return null;
    }

    if (now >= this.memory.nextAmbientDecoyAt) {
      const interval = (60000 / this.profile.ambientDecoysPerMinute) * this.rng.range(0.7, 1.4);
      this.memory.nextAmbientDecoyAt = now + interval;

      const decoys = ALL_SIGNAL_IDS.filter((id) => id !== obs.teamSignalId);
      const decoyId = this.rng.pick(decoys);
      this.memory.plannedAction = {
        action: { type: "fake-signal", playerId: this.playerId, signalId: decoyId },
        executeAt: now + 400,
      };

      return {
        action: null,
        executeAt: now + 400,
        debugReason: `ambient decoy (${decoyId}) scheduled`,
      };
    }

    return null;
  }

  /**
   * Card passing logic.
   */
  private planPass(obs: PlayerObservation, now: number): BotDecision | null {
    const pass = choosePassCard(obs, this.profile, this.rng);
    const delay = this.rng.range(this.profile.passThinkMs[0], this.profile.passThinkMs[1]);
    const executeAt = now + delay;

    this.memory.plannedAction = {
      action: { type: "pass", playerId: this.playerId, cardId: pass.card.id },
      executeAt,
    };

    return {
      action: null,
      executeAt,
      debugReason: `pass card ${pass.card.id} (${pass.reason}) in ${Math.round(delay)}ms`,
    };
  }

  /**
   * Resets round-specific memory while optionally keeping cross-round gesture stats.
   */
  resetRound(): void {
    const retainedStats: Record<string, Record<string, GestureStat>> = {};
    if (this.profile.learnAcrossRounds && this.profile.memoryRetention > 0) {
      for (const [team, signals] of Object.entries(this.memory.gestureStats)) {
        retainedStats[team] = {};
        for (const [sig, stat] of Object.entries(signals)) {
          retainedStats[team][sig] = {
            flashes: Math.round(stat.flashes * this.profile.memoryRetention),
            hits: Math.round(stat.hits * this.profile.memoryRetention),
          };
        }
      }
    }
    this.memory = createBotMemory(this.rng, this.profile);
    this.memory.gestureStats = retainedStats;
    this.lastProcessedSeq = 0;
  }
}

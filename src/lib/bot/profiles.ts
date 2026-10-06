/**
 * Bot difficulty & personality profiles.
 *
 * Combines difficulty tiers (easy / normal / hard) with archetypes
 * (Strategist, Trickster, Hawk, Gambler, Loyalist, Chaos Agent) to derive
 * concrete behavior knobs.
 *
 * High Signal Sense -> Better pattern recognition, longer evidence retention, less perception noise
 * High Deception    -> More ambient decoys, higher decoyBeforeSignal chance
 * High Aggression   -> Lower suspect threshold curve, shorter suspect cooldown
 * High Teamwork     -> Minimal partner miss chance, quicker jackpot reaction time
 * High Risk         -> Lower suspicion needed to suspect, more willingness to make bold calls
 * High Patience     -> Longer deliberation before hasty decisions, higher pass accuracy
 */

import { type BotArchetype, type BotArchetypeId, getArchetype } from "./archetypes";

export type BotDifficulty = "easy" | "normal" | "hard";

type MsRange = readonly [min: number, max: number];

export type BotProfile = {
  difficulty: BotDifficulty;
  archetypeId: BotArchetypeId;
  archetype: BotArchetype;

  /* Card play */
  passThinkMs: MsRange;
  /** Probability of choosing the best pass rather than a plausible-but-weaker one. */
  passAccuracy: number;
  /** Track which suits were fed to the left opponent and avoid feeding them more. */
  avoidFeedingOpponent: boolean;

  /* Partner behaviour */
  /** Delay between seeing the partner's real signal and calling JACKPOT. */
  jackpotReactionMs: MsRange;
  /** Chance of not noticing a partner's real signal (they may re-signal). */
  missPartnerSignal: number;
  /** Chance of mistaking a decoy gesture for the partner's signal. */
  confuseDecoyForSignal: number;

  /* Signalling with four of a kind */
  signalDelayMs: MsRange;
  /** Chance of flashing a decoy gesture just before the real signal. */
  decoyBeforeSignal: number;
  /** Re-signal if the partner hasn't called after this long. */
  resignalAfterMs: number;
  maxSignals: number;
  /** Ambient decoys per minute while NOT holding four (muddies opponent reads). */
  ambientDecoysPerMinute: number;

  /* Opponent modelling */
  suspectReactionMs: MsRange;
  /** Seconds for a gesture's evidential weight to halve. */
  evidenceHalfLifeMs: number;
  /** Learn which gestures preceded opponents' jackpots in earlier rounds. */
  learnAcrossRounds: boolean;
  /** Fraction of learned statistics kept between rounds (teams may change signals). */
  memoryRetention: number;
  /** Use own hand to rule out impossible opponent fours (legitimate card counting). */
  cardCounting: boolean;
  /** Random perception error added to each suspicion estimate (± this amount). */
  perceptionNoise: number;
  /** Graded thresholds: above `at`, suspect with probability `p`. Checked high→low. */
  suspectCurve: ReadonlyArray<{ at: number; p: number }>;
  /** Minimum gap between two SUSPECT calls from this bot. */
  suspectCooldownMs: number;
};

type DifficultyBase = Omit<BotProfile, "archetypeId" | "archetype">;

const DIFFICULTY_BASES: Record<BotDifficulty, DifficultyBase> = {
  easy: {
    difficulty: "easy",
    passThinkMs: [1200, 2600],
    passAccuracy: 0.55,
    avoidFeedingOpponent: false,
    jackpotReactionMs: [2600, 5000],
    missPartnerSignal: 0.28,
    confuseDecoyForSignal: 0.04,
    signalDelayMs: [1400, 3500],
    decoyBeforeSignal: 0.05,
    resignalAfterMs: 9000,
    maxSignals: 3,
    ambientDecoysPerMinute: 0.6,
    suspectReactionMs: [2600, 5000],
    evidenceHalfLifeMs: 5000,
    learnAcrossRounds: false,
    memoryRetention: 0,
    cardCounting: false,
    perceptionNoise: 0.22,
    suspectCurve: [
      { at: 0.9, p: 0.35 },
      { at: 0.75, p: 0.15 },
      { at: 0.55, p: 0.03 },
    ],
    suspectCooldownMs: 9000,
  },
  normal: {
    difficulty: "normal",
    passThinkMs: [800, 1900],
    passAccuracy: 0.8,
    avoidFeedingOpponent: false,
    jackpotReactionMs: [1800, 3600],
    missPartnerSignal: 0.12,
    confuseDecoyForSignal: 0.01,
    signalDelayMs: [1200, 3200],
    decoyBeforeSignal: 0.2,
    resignalAfterMs: 8000,
    maxSignals: 3,
    ambientDecoysPerMinute: 1.2,
    suspectReactionMs: [3000, 5200],
    evidenceHalfLifeMs: 8000,
    learnAcrossRounds: true,
    memoryRetention: 0.6,
    cardCounting: true,
    perceptionNoise: 0.12,
    suspectCurve: [
      { at: 0.82, p: 0.65 },
      { at: 0.65, p: 0.25 },
      { at: 0.45, p: 0.05 },
    ],
    suspectCooldownMs: 6000,
  },
  hard: {
    difficulty: "hard",
    passThinkMs: [500, 1300],
    passAccuracy: 0.95,
    avoidFeedingOpponent: true,
    jackpotReactionMs: [1000, 2200],
    missPartnerSignal: 0.04,
    confuseDecoyForSignal: 0,
    signalDelayMs: [1000, 2500],
    decoyBeforeSignal: 0.35,
    resignalAfterMs: 7000,
    maxSignals: 3,
    ambientDecoysPerMinute: 2.0,
    // Slow enough that a partner can answer a signal first; keeps Hard tough but not rigged-feeling.
    suspectReactionMs: [2800, 4800],
    evidenceHalfLifeMs: 10000,
    learnAcrossRounds: true,
    memoryRetention: 0.85,
    cardCounting: true,
    perceptionNoise: 0.05,
    suspectCurve: [
      { at: 0.8, p: 0.7 },
      { at: 0.6, p: 0.3 },
      { at: 0.4, p: 0.04 },
    ],
    suspectCooldownMs: 7000,
  },
};

/**
 * Creates a concrete BotProfile blending the base difficulty settings with the bot's
 * personality attributes. Each attribute materially shifts gameplay metrics.
 */
export function createBotProfile(
  difficulty: BotDifficulty = "normal",
  archetypeId: BotArchetypeId = "strategist"
): BotProfile {
  const base = DIFFICULTY_BASES[difficulty];
  const archetype = getArchetype(archetypeId);
  const { signalSense, deception, aggression, teamwork, risk, patience } = archetype.attributes;

  // Signal Sense (1-100): affects evidence half life and perception noise
  // Higher signal sense = longer memory retention, lower perception noise
  const signalSenseFactor = signalSense / 50; // 0.2 to 2.0
  const adjustedEvidenceHalfLifeMs = Math.round(base.evidenceHalfLifeMs * (0.6 + signalSenseFactor * 0.4));
  const adjustedPerceptionNoise = Math.max(0.02, base.perceptionNoise * (1.6 - (signalSense / 100) * 0.9));

  // Deception (1-100): affects ambient decoy frequency and decoy-before-signal chance
  const deceptionFactor = deception / 50;
  const adjustedDecoysPerMinute = Math.max(0.1, Number((base.ambientDecoysPerMinute * (0.4 + deceptionFactor * 0.8)).toFixed(2)));
  const adjustedDecoyBeforeSignal = Math.min(0.7, Math.max(0.02, base.decoyBeforeSignal * (0.3 + deceptionFactor * 0.9)));

  // Teamwork (1-100): affects partner signal responsiveness and miss rate
  // High teamwork = faster jackpot reaction, lower miss chance
  const teamworkFactor = teamwork / 50;
  const adjustedMissPartnerSignal = Math.max(0.01, base.missPartnerSignal * (1.7 - (teamwork / 100) * 1.1));
  const minJpReaction = Math.max(500, Math.round(base.jackpotReactionMs[0] * (1.4 - (teamwork / 100) * 0.6)));
  const maxJpReaction = Math.max(minJpReaction + 400, Math.round(base.jackpotReactionMs[1] * (1.4 - (teamwork / 100) * 0.6)));

  // Aggression & Risk (1-100): affects suspect willingness and cooldown
  const aggroFactor = aggression / 50;
  const riskFactor = risk / 50;
  const adjustedSuspectCooldownMs = Math.max(2500, Math.round(base.suspectCooldownMs * (1.6 - aggroFactor * 0.5)));

  // Modify suspect curve based on Aggression & Risk:
  // High aggression & risk lowers the threshold required to call suspect
  const thresholdShift = ((aggression - 50) * 0.002) + ((risk - 50) * 0.002); // -0.2 to +0.2
  const probMultiplier = (0.5 + aggroFactor * 0.4 + riskFactor * 0.3); // higher probability of calling

  const adjustedSuspectCurve = base.suspectCurve.map((step) => ({
    at: Math.max(0.2, Math.min(0.95, Number((step.at - thresholdShift).toFixed(2)))),
    p: Math.min(0.95, Math.max(0.02, Number((step.p * probMultiplier).toFixed(2)))),
  }));

  // Patience & Risk: affects pass thinking speed and pass accuracy
  const patienceFactor = patience / 50;
  const adjustedPassAccuracy = Math.min(0.98, Math.max(0.4, base.passAccuracy * (0.8 + (patience / 100) * 0.3 - (risk / 100) * 0.1)));

  return {
    ...base,
    difficulty,
    archetypeId,
    archetype,
    evidenceHalfLifeMs: adjustedEvidenceHalfLifeMs,
    perceptionNoise: adjustedPerceptionNoise,
    ambientDecoysPerMinute: adjustedDecoysPerMinute,
    decoyBeforeSignal: adjustedDecoyBeforeSignal,
    missPartnerSignal: adjustedMissPartnerSignal,
    jackpotReactionMs: [minJpReaction, maxJpReaction],
    suspectCooldownMs: adjustedSuspectCooldownMs,
    suspectCurve: adjustedSuspectCurve,
    passAccuracy: adjustedPassAccuracy,
  };
}

/** Fallback for existing legacy imports */
export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: createBotProfile("easy", "strategist"),
  normal: createBotProfile("normal", "strategist"),
  hard: createBotProfile("hard", "strategist"),
};

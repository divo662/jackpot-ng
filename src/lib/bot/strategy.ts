/**
 * Pure strategy functions. Each takes ONLY what a seat may legitimately know
 * (a PlayerObservation plus the bot's own memory) and returns a judgement.
 *
 * Influenced by bot archetype attributes:
 * - The Strategist / High Patience: mathematical prioritization, precise evaluation.
 * - The Trickster / High Deception: unexpected discards when building.
 * - The Hawk / High Signal Sense: keen gesture correlation, sharp suspicion decay tracking.
 * - The Gambler / High Risk: opportunistic card holding, highly aggressive suspicion.
 * - The Loyalist / High Teamwork: careful hand preservation.
 * - The Chaos Agent: playful sub-optimal card passes.
 */

import { type JackpotCard, type Suit, type Team } from "@/lib/deck";
import { type PlayerObservation } from "@/lib/engine";
import { findFourOfAKind, suitCounts } from "@/lib/game";
import { type Rng } from "@/lib/rng";
import { type BotProfile } from "./profiles";

/* -------------------------------------------------------------------------- */
/* Card passing                                                                */
/* -------------------------------------------------------------------------- */

export type PassDecision = { card: JackpotCard; reason: string };

/**
 * Choose which card to pass on.
 *  1. Never break a completed four.
 *  2. Dump dead cards (a suit with no full set in play can never score).
 *  3. Build toward the strongest suit; dump the weakest.
 *  4. Hard bots & observant bots avoid repeatedly feeding the same suit to the opponent on their left.
 *  5. Chaos & risk attributes introduce controlled variations.
 */
export function choosePassCard(obs: PlayerObservation, profile: BotProfile, rng: Rng): PassDecision {
  const hand = obs.hand;
  if (hand.length === 0) throw new Error("Bot has no cards to pass.");

  const four = findFourOfAKind(hand);
  if (four) {
    const spare = hand.find((card) => card.suit !== four);
    if (spare) return { card: spare, reason: `protecting four ${four}s` };
  }

  const inPlay = new Set(obs.suitsInPlay);
  const dead = hand.find((card) => !inPlay.has(card.suit));
  if (dead) return { card: dead, reason: "dead card (no full set in play)" };

  const counts = suitCounts(hand);
  const fedLeft = countHistory(obs, "sent");
  const received = countHistory(obs, "received");

  // Chaos Agent: small chance of wild playful pass
  if (profile.archetypeId === "chaos" && rng.chance(0.2)) {
    const nonFours = hand.filter((c) => counts[c.suit] < 4);
    if (nonFours.length > 0) {
      const wildCard = rng.pick(nonFours);
      return { card: wildCard, reason: "chaos agent wildcard pass" };
    }
  }

  // Target: most-held suit. Ties -> the suit that keeps arriving from the right
  // (that player is clearly not collecting it) and that we haven't fed away.
  const targetScore = (suit: Suit) => counts[suit] * 100 + (received[suit] ?? 0) * 3 - (fedLeft[suit] ?? 0) * 2;
  const heldSuits = Array.from(new Set(hand.map((card) => card.suit)));
  const target = heldSuits.reduce((best, suit) => (targetScore(suit) > targetScore(best) ? suit : best));

  const keepScore = (card: JackpotCard) => {
    let score = counts[card.suit] * 10;
    if (card.suit === target) score += 1000;
    // Keeping a suit we've already been feeding left denies the opponent a set.
    if (profile.avoidFeedingOpponent) score += (fedLeft[card.suit] ?? 0) * 4;
    return score;
  };

  const ranked = [...hand].sort((a, b) => keepScore(a) - keepScore(b) || a.id.localeCompare(b.id));
  const best = ranked[0];

  if (rng.chance(profile.passAccuracy)) {
    return { card: best, reason: `building ${target}s, dumping ${best.suit}` };
  }

  // A human-like slip: any non-target card, but never cannibalise a 3-card build.
  const protectTarget = counts[target] >= 3;
  const plausible = hand.filter((card) => card.suit !== target || !protectTarget);
  const nonTarget = plausible.filter((card) => card.suit !== target);
  const pool = nonTarget.length > 0 ? nonTarget : plausible;
  return { card: rng.pick(pool), reason: "imperfect pass" };
}

function countHistory(obs: PlayerObservation, direction: "sent" | "received"): Partial<Record<Suit, number>> {
  const totals: Partial<Record<Suit, number>> = {};
  for (const entry of obs.myCardHistory) {
    if (entry.direction === direction) totals[entry.suit] = (totals[entry.suit] ?? 0) + 1;
  }
  return totals;
}

/* -------------------------------------------------------------------------- */
/* Suspicion model                                                             */
/* -------------------------------------------------------------------------- */

export type GestureStat = { flashes: number; hits: number };

export type ObservedGesture = {
  seq: number;
  at: number;
  playerId: string;
  team: Team;
  signalId: string;
  /** How many times this team had flashed this gesture this match, including this one. */
  flashIndex: number;
};

/**
 * Probability that a given opponent gesture is their team's real signal.
 *
 * Signal Sense attribute sharpens recognition:
 * - High signal sense bots discount over-repeated habits as decoys faster
 * - Cross-round hit correlations carry more weight
 */
export function gestureRealProbability(
  gesture: Pick<ObservedGesture, "team" | "signalId" | "flashIndex">,
  stats: Record<string, Record<string, GestureStat>>,
  profile: BotProfile,
): number {
  const signalSenseFactor = profile.archetype.attributes.signalSense / 50; // 0.2 to 2.0
  const decayExponent = 0.8 * Math.min(1.4, 0.6 + signalSenseFactor * 0.4);
  const novelty = 0.55 / Math.pow(Math.max(1, gesture.flashIndex), decayExponent);

  if (!profile.learnAcrossRounds) return novelty;
  const stat = stats[gesture.team]?.[gesture.signalId];
  if (!stat || stat.flashes <= 0) return novelty;
  const learned = (stat.hits + 0.3) / (stat.flashes + 1.2);
  const weight = Math.min(0.9, (stat.flashes / (stat.flashes + 2)) * (0.8 + signalSenseFactor * 0.2));
  return clamp01(weight * learned + (1 - weight) * novelty);
}

export type SuspicionEstimate = {
  /** Probability that some opponent currently holds four of a kind. */
  probability: number;
  perPlayer: Record<string, number>;
  /** True when our own hand proves no opponent can hold four. */
  impossible: boolean;
};

export function estimateOpponentFour(
  obs: PlayerObservation,
  gestures: ObservedGesture[],
  stats: Record<string, Record<string, GestureStat>>,
  profile: BotProfile,
  now: number,
): SuspicionEstimate {
  const myCounts = suitCounts(obs.hand);
  // Legitimate card counting: an opponent can only complete a suit I hold none of.
  const possibleSuits = profile.cardCounting
    ? obs.suitsInPlay.filter((suit) => myCounts[suit] === 0)
    : obs.suitsInPlay;

  const opponents = obs.seats.filter((seat) => seat.team !== obs.me.team);
  const perPlayer: Record<string, number> = Object.fromEntries(opponents.map((seat) => [seat.id, 0]));
  if (possibleSuits.length === 0) return { probability: 0, perPlayer, impossible: true };

  // Background chance grows slowly as cards circulate.
  const possibleShare = possibleSuits.length / Math.max(1, obs.suitsInPlay.length);
  const prior = Math.min(0.2, obs.passCount * 0.008) * possibleShare;

  let notFour = 1 - prior;
  for (const gesture of gestures) {
    if (gesture.team === obs.me.team) continue;
    const age = Math.max(0, now - gesture.at);
    const decay = Math.pow(0.5, age / profile.evidenceHalfLifeMs);
    const weight = gestureRealProbability(gesture, stats, profile) * decay;
    perPlayer[gesture.playerId] = 1 - (1 - (perPlayer[gesture.playerId] ?? 0)) * (1 - weight);
    notFour *= 1 - weight;
  }
  return { probability: clamp01(1 - notFour), perPlayer, impossible: false };
}

/** Walk the graded suspicion curve. Returns the probability of acting now. */
export function suspectProbability(estimate: number, profile: BotProfile): number {
  for (const step of profile.suspectCurve) {
    if (estimate >= step.at) return step.p;
  }
  return 0;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

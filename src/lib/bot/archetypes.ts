/**
 * Bot Personality & Archetype Definitions for Jackpot.
 *
 * Implements the 6 core AI archetypes:
 * 1. THE STRATEGIST - Calm, analytical, calculated plays
 * 2. THE TRICKSTER  - Deceptive, fake signals, timing variations
 * 3. THE HAWK       - Observant, tracks patterns, catches opponents
 * 4. THE GAMBLER    - High risk, aggressive calls, exciting
 * 5. THE LOYALIST   - Teamwork 98, reliable partner, plays for the team
 * 6. THE CHAOS AGENT- Unpredictable, playful, surprising moves
 *
 * All attributes are on a 1-100 scale and materially affect decision-making.
 */

export type BotAttributeKey = "signalSense" | "deception" | "aggression" | "teamwork" | "risk" | "patience";

export type BotAttributes = {
  signalSense: number; // 1-100: Pattern detection and opponent gesture interpretation
  deception: number;   // 1-100: Fake signals, timing variation, misdirection
  aggression: number;  // 1-100: Suspect willingness and call trigger frequency
  teamwork: number;    // 1-100: Prioritizing partner, reliable signaling, quick jackpot response
  risk: number;        // 1-100: Tolerance for uncertain evidence vs waiting for certainty
  patience: number;    // 1-100: Waiting for high probability moves vs acting impulsively
};

export type BotArchetypeId =
  | "strategist"
  | "trickster"
  | "hawk"
  | "gambler"
  | "loyalist"
  | "chaos";

export type BotArchetype = {
  id: BotArchetypeId;
  name: string;
  tagline: string;
  avatar: string; // Emoji / visual glyph identifier
  avatarBg: string; // Theme color
  attributes: BotAttributes;
  playerDescription: string;
  bestFor: string;
  postMatchQuote: {
    partnerSuccess: string;
    partnerLoss: string;
    opponentCaught: string;
  };
};

export const BOT_ARCHETYPES: Record<BotArchetypeId, BotArchetype> = {
  strategist: {
    id: "strategist",
    name: "The Strategist",
    tagline: "Calm, calculated and highly coordinated.",
    avatar: "♟️",
    avatarBg: "from-blue-600 to-indigo-800",
    attributes: {
      signalSense: 90,
      deception: 55,
      aggression: 45,
      teamwork: 90,
      risk: 35,
      patience: 88,
    },
    playerDescription: "Reads the table before making a move. Best for patient players who like calculated plays.",
    bestFor: "Patient / strategic players",
    postMatchQuote: {
      partnerSuccess: "Every card counted. Perfectly executed.",
      partnerLoss: "The probabilities were sound, but variance got us.",
      opponentCaught: "Your pattern was mathematically transparent.",
    },
  },
  trickster: {
    id: "trickster",
    name: "The Trickster",
    tagline: "Unpredictable, deceptive and difficult to read.",
    avatar: "🎭",
    avatarBg: "from-purple-600 to-fuchsia-800",
    attributes: {
      signalSense: 65,
      deception: 95,
      aggression: 60,
      teamwork: 70,
      risk: 80,
      patience: 40,
    },
    playerDescription: "Confuses opponents with fake signals and unpredictable plays.",
    bestFor: "Mind-game players / bluffers",
    postMatchQuote: {
      partnerSuccess: "They never knew which signal was the real one!",
      partnerLoss: "Too much smoke, not enough fire that time.",
      opponentCaught: "Did you really think that fake signal would work on me?",
    },
  },
  hawk: {
    id: "hawk",
    name: "The Hawk",
    tagline: "Always watching. Relentless pattern tracker.",
    avatar: "🦅",
    avatarBg: "from-amber-600 to-orange-800",
    attributes: {
      signalSense: 98,
      deception: 35,
      aggression: 75,
      teamwork: 65,
      risk: 55,
      patience: 75,
    },
    playerDescription: "Always watching. Built for players who love catching opponents.",
    bestFor: "Opponent hunters / sharp observers",
    postMatchQuote: {
      partnerSuccess: "Caught them slipping at every turn.",
      partnerLoss: "I saw their signs, but our timing was off.",
      opponentCaught: "I clocked that twitch three passes ago.",
    },
  },
  gambler: {
    id: "gambler",
    name: "The Gambler",
    tagline: "Bold, aggressive and willing to take big chances.",
    avatar: "🎲",
    avatarBg: "from-rose-600 to-red-800",
    attributes: {
      signalSense: 55,
      deception: 65,
      aggression: 95,
      teamwork: 60,
      risk: 95,
      patience: 25,
    },
    playerDescription: "Lives on instinct. High risk, high reward.",
    bestFor: "Aggressive, high-tempo players",
    postMatchQuote: {
      partnerSuccess: "Fortune favors the bold! What a call!",
      partnerLoss: "You miss 100% of the shots you don't take.",
      opponentCaught: "Instinct over evidence. And I was right!",
    },
  },
  loyalist: {
    id: "loyalist",
    name: "The Loyalist",
    tagline: "Your safest partner. Plays strictly for the team.",
    avatar: "🛡️",
    avatarBg: "from-emerald-600 to-teal-800",
    attributes: {
      signalSense: 65,
      deception: 50,
      aggression: 35,
      teamwork: 98,
      risk: 30,
      patience: 85,
    },
    playerDescription: "Your safest partner. Plays for the team, not the spotlight.",
    bestFor: "Cooperative, reliable team players",
    postMatchQuote: {
      partnerSuccess: "We held the line and communicated cleanly.",
      partnerLoss: "I've got your back no matter what.",
      opponentCaught: "Protected our team from an obvious set.",
    },
  },
  chaos: {
    id: "chaos",
    name: "The Chaos Agent",
    tagline: "Wild, playful and impossible to predict.",
    avatar: "🌀",
    avatarBg: "from-pink-600 to-violet-800",
    attributes: {
      signalSense: 60,
      deception: 85,
      aggression: 80,
      teamwork: 55,
      risk: 90,
      patience: 20,
    },
    playerDescription: "Impossible to predict. Sometimes brilliant. Sometimes completely chaotic.",
    bestFor: "Wildcards looking for memorable matches",
    postMatchQuote: {
      partnerSuccess: "Pure madness, and it actually worked!",
      partnerLoss: "At least it wasn't boring!",
      opponentCaught: "Surprise! You weren't expecting that, were you?",
    },
  },
};

export const ALL_ARCHETYPE_IDS: BotArchetypeId[] = [
  "strategist",
  "trickster",
  "hawk",
  "gambler",
  "loyalist",
  "chaos",
];

export function getArchetype(id: BotArchetypeId | string): BotArchetype {
  return BOT_ARCHETYPES[id as BotArchetypeId] ?? BOT_ARCHETYPES.strategist;
}

/**
 * Select two distinct opponents automatically from the roster excluding the partner.
 * Employs a variety safeguard to avoid immediately repeating the exact same pair.
 */
export function selectOpponents(
  partnerId: BotArchetypeId,
  previousOpponentPair?: [BotArchetypeId, BotArchetypeId],
  randomFn: () => number = Math.random
): [BotArchetypeId, BotArchetypeId] {
  const eligible = ALL_ARCHETYPE_IDS.filter((id) => id !== partnerId);

  // Filter out the exact previous pair if possible to guarantee fresh matchups
  const pairs: Array<[BotArchetypeId, BotArchetypeId]> = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      pairs.push([eligible[i], eligible[j]]);
    }
  }

  const prevKey = previousOpponentPair ? [...previousOpponentPair].sort().join(":") : "";
  const filtered = pairs.filter((p) => [...p].sort().join(":") !== prevKey);
  const candidates = filtered.length > 0 ? filtered : pairs;

  const chosen = candidates[Math.floor(randomFn() * candidates.length)];
  return chosen;
}

export type SignalCategory = "Gesture" | "Facial" | "Subtle";

export type GameSignal = {
  id: string;
  label: string;
  symbol: string;
  category: SignalCategory;
  description: string;
  stealthLevel: "Subtle" | "Moderate" | "Expressive";
  actionText: string;
};

/**
 * Curated catalog of 10 classic physical Kemps/Jackpot signals.
 * Every signal is a recognizable physical gesture with its own emoji and speech bubble.
 */
export const GAME_SIGNALS: GameSignal[] = [
  {
    id: "tap-table",
    label: "Tap Table",
    symbol: "🖐️",
    category: "Gesture",
    description: "Subtly tap two fingers on the wooden table surface.",
    stealthLevel: "Subtle",
    actionText: "tapped the table twice",
  },
  {
    id: "nod",
    label: "Nod Head",
    symbol: "↕️",
    category: "Facial",
    description: "A firm double nod across the table to your partner.",
    stealthLevel: "Moderate",
    actionText: "gave a firm nod",
  },
  {
    id: "scratch-head",
    label: "Scratch Head",
    symbol: "🤔",
    category: "Gesture",
    description: "Casual head scratch as if pondering your next pass.",
    stealthLevel: "Subtle",
    actionText: "scratched their head thoughtfully",
  },
  {
    id: "wink",
    label: "Wink",
    symbol: "😉",
    category: "Facial",
    description: "A swift, playful wink toward your teammate.",
    stealthLevel: "Moderate",
    actionText: "winked across the table",
  },
  {
    id: "scratch-nose",
    label: "Scratch Nose",
    symbol: "👃",
    category: "Gesture",
    description: "Subtly brush or scratch your nose with one finger.",
    stealthLevel: "Subtle",
    actionText: "brushed their nose casually",
  },
  {
    id: "adjust-glasses",
    label: "Adjust Glasses",
    symbol: "👓",
    category: "Subtle",
    description: "Gently push up the bridge of your glasses with one finger.",
    stealthLevel: "Subtle",
    actionText: "adjusted their glasses",
  },
  {
    id: "smile",
    label: "Smirk / Smile",
    symbol: "😊",
    category: "Facial",
    description: "A broad, confident smile when receiving a good card.",
    stealthLevel: "Expressive",
    actionText: "smiled broadly at the table",
  },
  {
    id: "yawn",
    label: "Yawn",
    symbol: "🥱",
    category: "Facial",
    description: "An exaggerated casual yawn as if tired of passing cards.",
    stealthLevel: "Expressive",
    actionText: "let out a casual yawn",
  },
  {
    id: "rub-hands",
    label: "Rub Hands",
    symbol: "🤲",
    category: "Gesture",
    description: "Briskly rub both hands together in anticipation.",
    stealthLevel: "Moderate",
    actionText: "rubbed their hands together",
  },
  {
    id: "thumbs-up",
    label: "Thumbs Up",
    symbol: "👍",
    category: "Gesture",
    description: "Quick sneaky thumbs up gesture right above your cards.",
    stealthLevel: "Moderate",
    actionText: "flashed a quick thumbs up",
  },
];

export const ALL_SIGNAL_IDS = GAME_SIGNALS.map((s) => s.id);

export function getSignalMeta(id: string): GameSignal {
  return GAME_SIGNALS.find((s) => s.id === id) ?? GAME_SIGNALS[0];
}

export function isValidSignalId(id: string): boolean {
  return GAME_SIGNALS.some((s) => s.id === id);
}

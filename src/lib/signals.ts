export type SignalCategory = "Gesture" | "Facial" | "Subtle" | "Audio";

export type GameSignal = {
  id: string;
  label: string;
  symbol: string;
  category: SignalCategory;
  description: string;
  stealthLevel: "Subtle" | "Moderate" | "Expressive";
  actionText: string;
};

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
    id: "scratch-head",
    label: "Scratch Head",
    symbol: "🤔",
    category: "Gesture",
    description: "Casual head scratch as if pondering your next card pass.",
    stealthLevel: "Subtle",
    actionText: "scratched their head thoughtfully",
  },
  {
    id: "look-left",
    label: "Look Left",
    symbol: "👀",
    category: "Facial",
    description: "A quick, sharp sideways glance toward the left side.",
    stealthLevel: "Subtle",
    actionText: "glanced sharply to the left",
  },
  {
    id: "look-right",
    label: "Look Right",
    symbol: "👁️",
    category: "Facial",
    description: "A deliberate glance to the right corner of the table.",
    stealthLevel: "Subtle",
    actionText: "glanced quickly to the right",
  },
  {
    id: "smile",
    label: "Smile",
    symbol: "😊",
    category: "Facial",
    description: "A broad, confident smile when receiving a good card.",
    stealthLevel: "Expressive",
    actionText: "smiled broadly at the table",
  },
  {
    id: "thumbs-up",
    label: "Thumbs Up",
    symbol: "👍",
    category: "Gesture",
    description: "Quick thumbs up gesture right above your hand of cards.",
    stealthLevel: "Moderate",
    actionText: "flashed a thumbs up",
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
    id: "nod",
    label: "Nod",
    symbol: "↕️",
    category: "Facial",
    description: "A crisp, noticeable double nod across the table.",
    stealthLevel: "Moderate",
    actionText: "gave a firm nod",
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
    id: "cough",
    label: "Cough",
    symbol: "🗣️",
    category: "Audio",
    description: "A polite, quiet throat clearing to draw partner attention.",
    stealthLevel: "Subtle",
    actionText: "cleared their throat quietly",
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
    id: "rub-chin",
    label: "Rub Chin",
    symbol: "🧔",
    category: "Subtle",
    description: "Slowly stroke your chin with thumb and forefinger.",
    stealthLevel: "Subtle",
    actionText: "rubbed their chin thoughtfully",
  },
  {
    id: "double-tap",
    label: "Double Tap Card",
    symbol: "🃏",
    category: "Gesture",
    description: "Tap the corner of your card twice against the table felt.",
    stealthLevel: "Subtle",
    actionText: "double tapped their card",
  },
  {
    id: "whistle",
    label: "Whistle / Hum",
    symbol: "🎵",
    category: "Audio",
    description: "A subtle, cheerful two-note hum or quiet whistle.",
    stealthLevel: "Moderate",
    actionText: "hummed a quiet tune",
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
    id: "wave",
    label: "Wave",
    symbol: "👋",
    category: "Gesture",
    description: "A small, cheeky wave with your fingers.",
    stealthLevel: "Expressive",
    actionText: "waved fingers casually",
  },
  {
    id: "clap",
    label: "Clap",
    symbol: "👏",
    category: "Audio",
    description: "A sudden single clap to break the table silence.",
    stealthLevel: "Expressive",
    actionText: "clapped their hands once",
  },
  {
    id: "salute",
    label: "Salute",
    symbol: "🫡",
    category: "Gesture",
    description: "A crisp military-style salute to your partner.",
    stealthLevel: "Expressive",
    actionText: "saluted their teammate",
  },
  // Legacy compatibility IDs
  {
    id: "jump",
    label: "Bounce",
    symbol: "↟",
    category: "Gesture",
    description: "A quick seated bounce in your chair.",
    stealthLevel: "Expressive",
    actionText: "bounced in their seat",
  },
  {
    id: "crouch",
    label: "Lean In",
    symbol: "⌁",
    category: "Subtle",
    description: "Lean forward closer to the center of the table.",
    stealthLevel: "Subtle",
    actionText: "leaned into the table",
  },
  {
    id: "spin",
    label: "Spin Card",
    symbol: "⟳",
    category: "Gesture",
    description: "Spin one card 180 degrees before holding it.",
    stealthLevel: "Subtle",
    actionText: "spun a card on the table",
  },
  {
    id: "point",
    label: "Point",
    symbol: "👉",
    category: "Gesture",
    description: "Subtly point a finger toward the discard deck.",
    stealthLevel: "Moderate",
    actionText: "pointed a finger",
  },
  {
    id: "flash",
    label: "Eye Flash",
    symbol: "✦",
    category: "Facial",
    description: "Widen eyes wide open for a split second.",
    stealthLevel: "Subtle",
    actionText: "flashed wide eyes",
  },
  {
    id: "dance",
    label: "Shoulder Shimmy",
    symbol: "💃",
    category: "Expressive" as SignalCategory,
    description: "A joyful shoulder shimmy dance move.",
    stealthLevel: "Expressive",
    actionText: "did a quick shoulder shimmy",
  },
];

export const ALL_SIGNAL_IDS = GAME_SIGNALS.map((s) => s.id);

export function getSignalMeta(id: string): GameSignal {
  return GAME_SIGNALS.find((s) => s.id === id) ?? GAME_SIGNALS[0];
}

export function isValidSignalId(id: string): boolean {
  return GAME_SIGNALS.some((s) => s.id === id);
}

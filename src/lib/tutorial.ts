import type { DealResult, PlayerSlot } from "@/lib/deck";

export type TutorialStep =
  | "strategy_room_intro"
  | "strategy_signal_intro"
  | "table_cards_intro"
  | "table_pick_card"
  | "table_pass_first_card"
  | "table_partner_signal_detected"
  | "round2_observe_intro"
  | "round2_suspicious_gesture"
  | "tutorial_complete";

export interface TutorialCoachmark {
  step: TutorialStep;
  title: string;
  badge: string;
  description: string;
  actionText: string;
  targetHighlight?: "hand" | "pick_card" | "pass_button" | "signal_card" | "jackpot_button" | "suspect_button" | "strategy_box" | "partner_seat" | "opponent_seat";
}

export const TUTORIAL_COACHMARKS: Record<TutorialStep, TutorialCoachmark> = {
  strategy_room_intro: {
    step: "strategy_room_intro",
    badge: "STRATEGY ROOM",
    title: "🤝 Your Private Team Room",
    description: "Welcome! Only you and your AI partner are here. The opposing team is locked out and cannot hear or see your plans.",
    actionText: "Next: Choose Signal ➔",
    targetHighlight: "strategy_box",
  },
  strategy_signal_intro: {
    step: "strategy_signal_intro",
    badge: "SECRET SIGNAL",
    title: "🤫 Your Secret Signal",
    description: "This is your team's cue (👍 Thumbs Up). When you or your partner get 4 matching cards, drop this cue so the other can call JACKPOT!",
    actionText: "Enter the Table ➔",
    targetHighlight: "signal_card",
  },
  table_cards_intro: {
    step: "table_cards_intro",
    badge: "STEP 1 OF 4",
    title: "🃏 Welcome to the Table!",
    description: "Your team wins when either of you collects 4 cards of the same shape (e.g. 4 Triangles). You have 5 cards to start.",
    actionText: "Next: Pick a Card ➔",
    targetHighlight: "hand",
  },
  table_pick_card: {
    step: "table_pick_card",
    badge: "STEP 2 OF 4",
    title: "👆 Pick This Card!",
    description: "Touch the glowing Triangle card in your hand to select it. Passing this will give your partner 4-of-a-kind!",
    actionText: "Next: Touch PASS ➔",
    targetHighlight: "pick_card",
  },
  table_pass_first_card: {
    step: "table_pass_first_card",
    badge: "STEP 3 OF 4",
    title: "👉 Touch the PASS Button!",
    description: "Touch the green PASS CARD button below to slide your selected card clockwise to your partner!",
    actionText: "Next: Pass Card ➔",
    targetHighlight: "pass_button",
  },
  table_partner_signal_detected: {
    step: "table_partner_signal_detected",
    badge: "STEP 4 OF 4",
    title: "🔥 Partner is Signaling! Touch JACKPOT!",
    description: "Look at your partner at the top: they just raised the secret signal (👍 Thumbs Up)! Touch the golden JACKPOT button to win!",
    actionText: "Touch CALL JACKPOT! ➔",
    targetHighlight: "jackpot_button",
  },
  round2_observe_intro: {
    step: "round2_observe_intro",
    badge: "ROUND 2: DEFENSE",
    title: "👁️ Round 2: Defense & Catching",
    description: "Now let's learn how to catch opponents before they win! Watch Opponent 1 on the right...",
    actionText: "Watch Opponent ➔",
    targetHighlight: "opponent_seat",
  },
  round2_suspicious_gesture: {
    step: "round2_suspicious_gesture",
    badge: "ROUND 2: INTERCEPT",
    title: "🚨 Opponent Signal Spotted! Touch SUSPECT!",
    description: "Opponent 1 just flashed a gesture! They are trying to signal. Touch the SUSPECT button now to catch them red-handed!",
    actionText: "Touch SUSPECT! ➔",
    targetHighlight: "suspect_button",
  },
  tutorial_complete: {
    step: "tutorial_complete",
    badge: "TRAINING COMPLETE",
    title: "🎉 You've Got It!",
    description: "You now know both sides of Jackpot: coordinating with your partner and intercepting opponents. You are ready to play!",
    actionText: "Start Playing! ➔",
  },
};

/**
 * Creates controlled, scripted tutorial rounds:
 * - Round 1: Partner completes 4 Triangles on pass 1, signals, user calls JACKPOT.
 * - Round 2: Opponent 1 completes 4 Circles on pass 1, gestures, user calls SUSPECT.
 */
export function createTutorialDeal(
  round: 1 | 2,
  humanId: string,
  partnerName: string,
  opp1Name: string,
  opp2Name: string,
): DealResult {
  if (round === 1) {
    const players: PlayerSlot[] = [
      {
        id: humanId,
        name: "You",
        seatIndex: 0,
        team: "Alpha",
        isStarter: true,
        hand: [
          { id: "tut1-h-star-1", suit: "star", number: 1 },
          { id: "tut1-h-circle-1", suit: "circle", number: 1 },
          { id: "tut1-h-cross-1", suit: "cross", number: 1 },
          { id: "tut1-h-square-1", suit: "square", number: 1 },
          { id: "tut1-h-triangle-4", suit: "triangle", number: 4 }, // Extra card to pass
        ],
      },
      {
        id: "player-east",
        name: opp1Name,
        seatIndex: 1,
        team: "Bravo",
        isStarter: false,
        hand: [
          { id: "tut1-o1-star-2", suit: "star", number: 2 },
          { id: "tut1-o1-circle-2", suit: "circle", number: 2 },
          { id: "tut1-o1-cross-2", suit: "cross", number: 2 },
          { id: "tut1-o1-square-2", suit: "square", number: 2 },
        ],
      },
      {
        id: "player-north",
        name: partnerName,
        seatIndex: 2,
        team: "Alpha",
        isStarter: false,
        hand: [
          { id: "tut1-p-triangle-1", suit: "triangle", number: 1 },
          { id: "tut1-p-triangle-2", suit: "triangle", number: 2 },
          { id: "tut1-p-triangle-3", suit: "triangle", number: 3 },
          { id: "tut1-p-square-3", suit: "square", number: 3 },
        ],
      },
      {
        id: "player-west",
        name: opp2Name,
        seatIndex: 3,
        team: "Bravo",
        isStarter: false,
        hand: [
          { id: "tut1-o2-star-3", suit: "star", number: 3 },
          { id: "tut1-o2-circle-3", suit: "circle", number: 3 },
          { id: "tut1-o2-cross-3", suit: "cross", number: 3 },
          { id: "tut1-o2-square-4", suit: "square", number: 4 },
        ],
      },
    ];
    return {
      players,
      cardsPerPlayer: 4,
      drawPile: [],
      starterPlayerId: humanId,
    };
  } else {
    const players: PlayerSlot[] = [
      {
        id: humanId,
        name: "You",
        seatIndex: 0,
        team: "Alpha",
        isStarter: true,
        hand: [
          { id: "tut2-h-triangle-1", suit: "triangle", number: 1 },
          { id: "tut2-h-triangle-2", suit: "triangle", number: 2 },
          { id: "tut2-h-star-1", suit: "star", number: 1 },
          { id: "tut2-h-cross-1", suit: "cross", number: 1 },
          { id: "tut2-h-circle-4", suit: "circle", number: 4 }, // Passes Circle 4 to Opponent 1
        ],
      },
      {
        id: "player-east",
        name: opp1Name,
        seatIndex: 1,
        team: "Bravo",
        isStarter: false,
        hand: [
          { id: "tut2-o1-circle-1", suit: "circle", number: 1 },
          { id: "tut2-o1-circle-2", suit: "circle", number: 2 },
          { id: "tut2-o1-circle-3", suit: "circle", number: 3 },
          { id: "tut2-o1-square-1", suit: "square", number: 1 },
        ],
      },
      {
        id: "player-north",
        name: partnerName,
        seatIndex: 2,
        team: "Alpha",
        isStarter: false,
        hand: [
          { id: "tut2-p-star-2", suit: "star", number: 2 },
          { id: "tut2-p-star-3", suit: "star", number: 3 },
          { id: "tut2-p-cross-2", suit: "cross", number: 2 },
          { id: "tut2-p-cross-3", suit: "cross", number: 3 },
        ],
      },
      {
        id: "player-west",
        name: opp2Name,
        seatIndex: 3,
        team: "Bravo",
        isStarter: false,
        hand: [
          { id: "tut2-o2-square-2", suit: "square", number: 2 },
          { id: "tut2-o2-square-3", suit: "square", number: 3 },
          { id: "tut2-o2-square-4", suit: "square", number: 4 },
          { id: "tut2-o2-triangle-3", suit: "triangle", number: 3 },
        ],
      },
    ];
    return {
      players,
      cardsPerPlayer: 4,
      drawPile: [],
      starterPlayerId: humanId,
    };
  }
}

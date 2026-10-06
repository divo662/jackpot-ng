/**
 * Comprehensive Test Suite for Authoritative Engine & Deterministic Bot Agents.
 * Run with: node --experimental-strip-types tests/engine-and-bot.test.ts
 */

import assert from "node:assert/strict";
import {
  applyAction,
  createRoundState,
  observePlayer,
  type GameAction,
  type RoundState,
} from "../src/lib/engine";
import { setupJackpotRound, type PlayerSlot } from "../src/lib/deck";
import { chooseSuspectProofCards, findFourOfAKind } from "../src/lib/game";
import { createRng } from "../src/lib/rng";
import { BOT_PROFILES } from "../src/lib/bot/profiles";
import { choosePassCard, estimateOpponentFour, suspectProbability } from "../src/lib/bot/strategy";
import { BotAgent } from "../src/lib/bot/agent";
import { LocalMatch } from "../src/lib/bot/local-match";

console.log("Starting Engine & Bot Test Suite...\n");

// TEST 1: Alternating 4-player Deal & Round State Creation
{
  console.log("Test 1: 4-Player Alternating Deal & Round State");
  const deal = setupJackpotRound(["Divine", "Fatima", "Michael", "Chidi"]);
  assert.equal(deal.players.length, 4);
  assert.equal(deal.players[0].name, "Divine");
  assert.equal(deal.players[0].team, "Alpha");
  assert.equal(deal.players[1].team, "Bravo");
  assert.equal(deal.players[2].team, "Alpha"); // Partner
  assert.equal(deal.players[3].team, "Bravo"); // Opponent

  // Starter holds 5 cards, others hold 4 cards
  const starter = deal.players.find((p: PlayerSlot) => p.id === deal.starterPlayerId)!;
  assert.equal(starter.hand.length, 5);
  for (const p of deal.players) {
    if (p.id !== starter.id) {
      assert.equal(p.hand.length, 4);
    }
  }

  const round = createRoundState(
    { ...deal, activePlayerId: deal.starterPlayerId, passCount: 0, log: [] },
    { Alpha: "thumbs-up", Bravo: "nod" }
  );

  assert.equal(round.status, "playing");
  assert.equal(round.suspectsRemaining.Alpha, 3);
  assert.equal(round.suspectsRemaining.Bravo, 3);
  console.log("  ✓ 4-player deal created with alternating seating & 3 suspects each");
}

// TEST 2: Information Filter (Isolation of Hidden Cards & Secret Signals)
{
  console.log("Test 2: Information Isolation in PlayerObservation");
  const deal = setupJackpotRound(["Divine", "Fatima", "Michael", "Chidi"]);
  const round = createRoundState(
    { ...deal, activePlayerId: deal.starterPlayerId, passCount: 0, log: [] },
    { Alpha: "thumbs-up", Bravo: "wink" }
  );

  const obs = observePlayer(round, deal.players[0].id, 1000);
  assert.equal(obs.me.name, "Divine");
  assert.equal(obs.teamSignalId, "thumbs-up");
  assert.equal(obs.partnerId, deal.players[2].id);

  // Hidden information check:
  // 1. obs.hand only contains my cards
  assert.equal(obs.hand.length, deal.players[0].hand.length);
  // 2. obs.seats only contains public counts, no opponent hands
  for (const seat of obs.seats) {
    assert.equal("hand" in seat, false, "Seat view must not leak cards!");
  }
  // 3. Opponent team's secret signal must not be anywhere in obs
  const obsJson = JSON.stringify(obs);
  assert.equal(obsJson.includes("wink"), false, "Observation leaked opponent secret signal!");
  console.log("  ✓ Information filter strictly hides other hands and opponent secret signals");
}

// TEST 3: Authoritative Pass Progression & Rejection of Illegal Passes
{
  console.log("Test 3: Authoritative Card Passing & Rules Validation");
  const deal = setupJackpotRound(["Divine", "Fatima", "Michael", "Chidi"]);
  let state = createRoundState(
    { ...deal, activePlayerId: deal.starterPlayerId, passCount: 0, log: [] },
    { Alpha: "thumbs-up", Bravo: "nod" }
  );

  const activeId = state.game.activePlayerId;
  const activeSeat = state.game.players.find((p) => p.id === activeId)!;
  const inactiveSeat = state.game.players.find((p) => p.id !== activeId)!;

  // Illegal: non-active player trying to pass
  const illegalPass = applyAction(
    state,
    { type: "pass", playerId: inactiveSeat.id, cardId: inactiveSeat.hand[0].id },
    1000
  );
  assert.equal(illegalPass.ok, false, "Engine must reject pass from non-active seat");

  // Legal pass: active seat passes 1 of their 5 cards
  const cardToPass = activeSeat.hand[0];
  const legalPass = applyAction(
    state,
    { type: "pass", playerId: activeId, cardId: cardToPass.id },
    1000
  );
  assert.equal(legalPass.ok, true);
  state = legalPass.state;

  // Verify next player received card
  const nextSeatIndex = (activeSeat.seatIndex + 1) % 4;
  const nextPlayer = state.game.players[nextSeatIndex];
  assert.equal(state.game.activePlayerId, nextPlayer.id);
  assert.equal(nextPlayer.hand.length, 5);
  assert.equal(state.game.players.find((p) => p.id === activeId)!.hand.length, 4);

  // Verify private logs recorded send and receive
  assert.equal(state.privateLog[activeId].length, 1);
  assert.equal(state.privateLog[activeId][0].direction, "sent");
  assert.equal(state.privateLog[nextPlayer.id][0].direction, "received");
  console.log("  ✓ Authoritative engine advances pass clockwise and updates private logs");
}

// TEST 4: JACKPOT & Partner Rule Resolution
{
  console.log("Test 4: JACKPOT Resolution (Teammate vs Self vs False)");
  const deal = setupJackpotRound(["Divine", "Fatima", "Michael", "Chidi"]);
  const p0 = deal.players[0]; // Divine (Alpha)
  const p1 = deal.players[1]; // Fatima (Bravo)
  const p2 = deal.players[2]; // Michael (Alpha - Partner)

  // Rig p2 (partner) to hold 4 circles
  p2.hand = [
    { id: "c1", suit: "circle" },
    { id: "c2", suit: "circle" },
    { id: "c3", suit: "circle" },
    { id: "c4", suit: "circle" },
  ];
  p0.hand = [
    { id: "s1", suit: "star" },
    { id: "s2", suit: "cross" },
    { id: "s3", suit: "diamond" },
    { id: "s4", suit: "triangle" },
  ];

  let state = createRoundState(
    { ...deal, activePlayerId: p0.id, passCount: 0, log: [] },
    { Alpha: "thumbs-up", Bravo: "nod" }
  );

  // Case A: Partner p0 calls JACKPOT when teammate p2 holds four
  const outcomeA = applyAction(state, { type: "jackpot", playerId: p0.id }, 2000);
  assert.equal(outcomeA.ok, true);
  assert.equal(outcomeA.result?.valid, true);
  assert.equal(outcomeA.result?.scoringTeam, "Alpha");
  assert.equal(outcomeA.state.status, "over");

  // Case B: Self-call without partner rule (when selfJackpotAllowed is false)
  // p2 calls jackpot on own hand -> invalid!
  const outcomeB = applyAction(state, { type: "jackpot", playerId: p2.id }, 2000);
  assert.equal(outcomeB.ok, true);
  assert.equal(outcomeB.result?.valid, false);
  assert.equal(outcomeB.result?.scoringTeam, "Bravo"); // Penalty point to opposing team!
  console.log("  ✓ Valid partner Jackpot scores +1; self-call triggers penalty point to opponents");
}

// TEST 5: SUSPECT Resolution (Caught vs False Alarm)
{
  console.log("Test 5: SUSPECT Resolution");
  const deal = setupJackpotRound(["Divine", "Fatima", "Michael", "Chidi"]);
  const p0 = deal.players[0]; // Alpha
  const p1 = deal.players[1]; // Bravo

  // Opponent p1 has 4 triangles
  p1.hand = [
    { id: "t1", suit: "triangle" },
    { id: "t2", suit: "triangle" },
    { id: "t3", suit: "triangle" },
    { id: "t4", suit: "triangle" },
  ];

  let state = createRoundState(
    { ...deal, activePlayerId: p0.id, passCount: 0, log: [] },
    { Alpha: "thumbs-up", Bravo: "nod" }
  );

  // p0 suspects correctly
  const caught = applyAction(state, { type: "suspect", playerId: p0.id }, 3000);
  assert.equal(caught.ok, true);
  assert.equal(caught.result?.valid, true);
  assert.equal(caught.result?.scoringTeam, "Alpha");
  assert.equal(caught.state.status, "over");

  // Reset without 4-of-a-kind
  p1.hand[0] = { id: "m1", suit: "moon" };
  let falseState = createRoundState(
    { ...deal, activePlayerId: p0.id, passCount: 0, log: [] },
    { Alpha: "thumbs-up", Bravo: "nod" }
  );
  const falseAlarm = applyAction(falseState, { type: "suspect", playerId: p0.id }, 3000);
  assert.equal(falseAlarm.ok, true);
  assert.equal(falseAlarm.result?.valid, false);
  assert.equal(falseAlarm.state.status, "playing", "False suspect must keep round playing!");
  assert.equal(falseAlarm.state.suspectsRemaining.Alpha, 2, "False suspect burns 1 attempt");
  console.log("  ✓ Correct suspect catches opponent and scores; false alarm burns 1 of 3 attempts");
}

// TEST 6: Bot Decision Making & Strategy
{
  console.log("Test 6: Bot Passing Strategy (Protects four, dumps dead)");
  const rng = createRng(42);
  const profile = BOT_PROFILES.normal;

  const deal = setupJackpotRound(["Divine", "Bot1", "Bot2", "Bot3"]);
  const state = createRoundState(
    { ...deal, activePlayerId: deal.players[1].id, passCount: 5, log: [] },
    { Alpha: "thumbs-up", Bravo: "nod" }
  );

  // Give Bot1 4 circles + 1 extra star
  deal.players[1].hand = [
    { id: "c1", suit: "circle" },
    { id: "c2", suit: "circle" },
    { id: "c3", suit: "circle" },
    { id: "c4", suit: "circle" },
    { id: "extra", suit: "star" },
  ];

  const obs = observePlayer(state, deal.players[1].id, 1000);
  const pass = choosePassCard(obs, profile, rng);
  assert.equal(pass.card.suit, "star", "Bot holding four must pass the extra card, never break the four!");
  console.log("  ✓ Bot correctly protected 4-of-a-kind and dumped the extra card");
}

// TEST 7: Bot Agent Teammate Reaction to Partner Signal
{
  console.log("Test 7: Bot Teammate Calls Jackpot on Partner Signal");
  const match = new LocalMatch({
    humanPlayerName: "Divine",
    humanTeamSignal: "thumbs-up",
    opponentsSignal: "wink",
    difficulty: "hard",
    seed: 12345,
  });

  // If human holds 5 cards (starter), pass extra card first so hand is 4 cards
  const human = match.state.game.players.find((p) => p.id === match.humanId)!;
  if (human.hand.length === 5) {
    match.submitHumanAction({ type: "pass", playerId: match.humanId, cardId: human.hand[0].id });
  }

  // Human player holds 4 cards and flashes agreed signal
  const signalRes = match.submitHumanAction({ type: "signal", playerId: match.humanId });
  assert.equal(signalRes.ok, true);

  // Advance simulation by 2 seconds
  const executed = match.stepTo(match.now + 2500, 100);

  // Partner bot should have reacted to human's signal by scheduling and calling JACKPOT
  const jackpotAction = executed.find((e) => e.action.type === "jackpot");
  assert.ok(jackpotAction, "AI Partner must call JACKPOT after human partner flashes agreed signal!");
  assert.equal(jackpotAction.action.playerId, match.partnerId);
  console.log("  ✓ AI Partner observed partner's signal and called JACKPOT within reaction window");
}

// TEST 8: Seeded Determinism
{
  console.log("Test 8: Determinism Across Identical Seeds");
  const matchA = new LocalMatch({
    humanPlayerName: "Divine",
    humanTeamSignal: "thumbs-up",
    difficulty: "normal",
    seed: 99999,
  });
  const matchB = new LocalMatch({
    humanPlayerName: "Divine",
    humanTeamSignal: "thumbs-up",
    difficulty: "normal",
    seed: 99999,
  });

  const actionsA = matchA.stepTo(matchA.now + 4000, 100);
  const actionsB = matchB.stepTo(matchB.now + 4000, 100);

  assert.equal(actionsA.length, actionsB.length);
  for (let i = 0; i < actionsA.length; i++) {
    assert.equal(actionsA[i].action.type, actionsB[i].action.type);
    assert.equal(actionsA[i].action.playerId, actionsB[i].action.playerId);
  }
  console.log("  ✓ Two identical seeds produced exact identical action sequences");
}

// TEST 9: Suspect Two-Card Proof Selection
{
  console.log("Test 9: SUSPECT Proof Card Selection");
  const refuteHand = [
    { id: "r1", suit: "circle" as const },
    { id: "r2", suit: "triangle" as const },
    { id: "r3", suit: "circle" as const },
    { id: "r4", suit: "circle" as const },
  ];
  const proof = chooseSuspectProofCards(refuteHand);
  assert.equal(proof.length, 2);
  assert.notEqual(proof[0].suit, proof[1].suit, "Defender should show two different suits when possible");

  const caughtHand = [
    { id: "c1", suit: "star" as const },
    { id: "c2", suit: "star" as const },
    { id: "c3", suit: "star" as const },
    { id: "c4", suit: "star" as const },
  ];
  const caughtProof = chooseSuspectProofCards(caughtHand);
  assert.equal(caughtProof.length, 2);
  assert.equal(caughtProof[0].suit, caughtProof[1].suit, "When hand is complete set, proof cards must match");
  console.log("  ✓ Defender reveals two different suits when possible, matching suits when caught");
}

console.log("\n==========================================");
console.log("ALL 9 ENGINE & BOT TESTS PASSED CLEANLY!");
console.log("==========================================");

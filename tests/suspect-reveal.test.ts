import assert from "node:assert/strict";
import { setupJackpotRound, type JackpotCard } from "../src/lib/deck";
import {
  chooseSuspectDefenseCards,
  resolveSuspect,
} from "../src/lib/game";
import {
  createRoundState,
  applyAction,
} from "../src/lib/engine";
import { LocalMatch } from "../src/lib/bot/local-match";

console.log("Starting Jackpot Suspect Reveal Test Suite...\n");

// TEST 1: chooseSuspectDefenseCards defends against suspect when hand is not 4-of-a-kind
{
  console.log("Test 1: chooseSuspectDefenseCards Selection Strategy");

  // Case A: 4-of-a-kind (Jackpot) -> All cards are the same suit, so any chosen pair matches
  const fourOfAKindHand: JackpotCard[] = [
    { id: "h1", suit: "heart" },
    { id: "h2", suit: "heart" },
    { id: "h3", suit: "heart" },
    { id: "h4", suit: "heart" },
  ];
  const pairA = chooseSuspectDefenseCards(fourOfAKindHand);
  assert.equal(pairA.length, 2);
  assert.equal(pairA[0].suit, pairA[1].suit, "4-of-a-kind hand must yield matching cards");
  assert.equal(pairA[0].suit, "heart");

  // Case B: 3 of one suit, 1 singleton -> Bot picks two DIFFERENT cards to defeat suspect
  const threeOneHand: JackpotCard[] = [
    { id: "h1", suit: "heart" },
    { id: "h2", suit: "heart" },
    { id: "h3", suit: "heart" },
    { id: "c1", suit: "circle" },
  ];
  const pairB = chooseSuspectDefenseCards(threeOneHand);
  assert.equal(pairB.length, 2);
  assert.notEqual(pairB[0].suit, pairB[1].suit, "Bot must choose different suits to defend against suspect");

  // Case C: 2 of one suit, 2 of another -> Bot picks two DIFFERENT cards
  const twoTwoHand: JackpotCard[] = [
    { id: "s1", suit: "star" },
    { id: "s2", suit: "star" },
    { id: "t1", suit: "triangle" },
    { id: "t2", suit: "triangle" },
  ];
  const pairC = chooseSuspectDefenseCards(twoTwoHand);
  assert.notEqual(pairC[0].suit, pairC[1].suit, "Bot must choose different suits when holding 2-and-2");

  // Case D: All 4 different suits -> Bot picks two DIFFERENT cards
  const rainbowHand: JackpotCard[] = [
    { id: "r1", suit: "star" },
    { id: "r2", suit: "moon" },
    { id: "r3", suit: "diamond" },
    { id: "r4", suit: "cross" },
  ];
  const pairD = chooseSuspectDefenseCards(rainbowHand);
  assert.notEqual(pairD[0].suit, pairD[1].suit, "Bot must choose different suits from rainbow hand");

  console.log("  ✓ chooseSuspectDefenseCards correctly exposes matching pair only when holding four-of-a-kind");
}

// TEST 2: resolveSuspect with selectedCardIds (Suspect Reveal mechanic)
{
  console.log("Test 2: resolveSuspect with Revealed Cards");
  const deal = setupJackpotRound(["Divine", "Fatima", "Michael", "Chidi"]);
  const p0 = deal.players[0]; // Caller (Alpha)
  const p1 = deal.players[1]; // Target (Bravo)

  p1.hand = [
    { id: "card-c1", suit: "circle" },
    { id: "card-c2", suit: "circle" },
    { id: "card-c3", suit: "circle" },
    { id: "card-t1", suit: "triangle" },
  ];

  const state = { ...deal, activePlayerId: p0.id, passCount: 5, log: [] };

  // Case A: Suspected player reveals TWO CARDS THAT MATCH -> CAUGHT!
  const caughtOutcome = resolveSuspect(state, p0.id, p1.id, ["card-c1", "card-c2"]);
  assert.equal(caughtOutcome.valid, true, "Matching revealed cards must result in valid suspect");
  assert.equal(caughtOutcome.title, "CAUGHT!");
  assert.equal(caughtOutcome.scoringTeam, "Alpha");

  // Case B: Suspected player reveals TWO CARDS THAT DIFFER -> SUSPECT FAILED ("Wrong read.")
  const failedOutcome = resolveSuspect(state, p0.id, p1.id, ["card-c1", "card-t1"]);
  assert.equal(failedOutcome.valid, false, "Different revealed cards must result in suspect failed");
  assert.equal(failedOutcome.title, "SUSPECT FAILED");
  assert.equal(failedOutcome.scoringTeam, null);

  // Case C: Friendly fire check -> You cannot suspect your teammate
  const friendlyFire = resolveSuspect(state, p0.id, deal.players[2].id, ["card-c1", "card-c2"]);
  assert.equal(friendlyFire.valid, false);
  assert.equal(friendlyFire.title, "Friendly Fire!");

  // Case D: Backward compatibility when selectedCardIds is omitted
  const legacyOutcome = resolveSuspect(state, p0.id, p1.id);
  assert.equal(legacyOutcome.valid, false, "Without 4-of-a-kind, fallback legacy check fails");

  console.log("  ✓ resolveSuspect evaluates 2 selected cards (same = CAUGHT!, different = SUSPECT FAILED)");
}

// TEST 3: Authoritative engine applyAction with suspect and selectedCardIds
{
  console.log("Test 3: Engine applyAction with Suspect Reveal");
  const deal = setupJackpotRound(["Divine", "Fatima", "Michael", "Chidi"]);
  const p0 = deal.players[0]; // Alpha
  const p1 = deal.players[1]; // Bravo

  p1.hand = [
    { id: "c1", suit: "cross" },
    { id: "c2", suit: "cross" },
    { id: "c3", suit: "cross" },
    { id: "s1", suit: "square" },
  ];

  let state = createRoundState(
    { ...deal, activePlayerId: p0.id, passCount: 6, log: [] },
    { Alpha: "thumbs-up", Bravo: "nod" }
  );

  // False suspect: player revealed different cards
  const failAction = applyAction(
    state,
    { type: "suspect", playerId: p0.id, targetPlayerId: p1.id, selectedCardIds: ["c1", "s1"] },
    1000
  );
  assert.equal(failAction.ok, true);
  assert.equal(failAction.result?.valid, false);
  assert.equal(failAction.state.status, "playing", "Failed suspect must keep round playing");
  assert.equal(failAction.state.suspectsRemaining.Alpha, 2, "Failed suspect decrements team calls");

  state = failAction.state;

  // Successful suspect: player revealed matching cards
  const caughtAction = applyAction(
    state,
    { type: "suspect", playerId: p0.id, targetPlayerId: p1.id, selectedCardIds: ["c1", "c2"] },
    2000
  );
  assert.equal(caughtAction.ok, true);
  assert.equal(caughtAction.result?.valid, true);
  assert.equal(caughtAction.state.status, "over", "Successful suspect ends round");
  assert.equal(caughtAction.result?.scoringTeam, "Alpha");

  console.log("  ✓ Authoritative engine applies suspect action with selected cards cleanly");
}

// TEST 4: LocalMatch interceptor and resolveSuspectAction
{
  console.log("Test 4: LocalMatch Suspect Interceptor & Resolution");
  const match = new LocalMatch(
    {
      humanPlayerName: "You",
      humanPlayerId: "player-you",
      humanTeamSignal: "thumbs-up",
      difficulty: "normal",
      partnerArchetype: "strategist",
      seed: 12345,
    },
    0
  );

  let suspectIntentReceived = false;
  match.onSuspectIntent = (action) => {
    suspectIntentReceived = true;
    assert.equal(action.type, "suspect");
  };

  // Human calls suspect on opponent 1
  const opp1 = match.state.game.players.find((p) => p.id === match.opponent1Id)!;
  opp1.hand = [
    { id: "d1", suit: "diamond" },
    { id: "d2", suit: "diamond" },
    { id: "d3", suit: "diamond" },
    { id: "d4", suit: "diamond" },
  ];

  const defensePair = chooseSuspectDefenseCards(opp1.hand);
  const resolveResult = match.resolveSuspectAction({
    type: "suspect",
    playerId: match.humanId,
    targetPlayerId: opp1.id,
    selectedCardIds: [defensePair[0].id, defensePair[1].id],
  });

  assert.equal(resolveResult.ok, true);
  assert.equal(resolveResult.result?.valid, true, "Opponent holding 4 diamonds is caught!");
  assert.equal(match.state.status, "over");

  console.log("  ✓ LocalMatch correctly processes resolveSuspectAction with card selection");
}

console.log("\n==========================================");
console.log("ALL SUSPECT REVEAL TESTS PASSED CLEANLY!");
console.log("==========================================\n");

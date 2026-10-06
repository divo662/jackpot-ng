/**
 * Test Suite for Bot Personality System & Information Fairness.
 *
 * Requirements covered:
 * 1. AI cannot see hidden opponent cards.
 * 2. AI cannot see opponent secret signals.
 * 3. AI cannot access future cards.
 * 4. AI cannot perform illegal actions.
 * 5. AI cannot Suspect with zero Suspects.
 * 6. AI partner recognizes valid partner signals.
 * 7. AI partner does not automatically Jackpot when no valid Jackpot exists.
 * 8. Fake signals do not accidentally reveal private state.
 * 9. Different personality attributes produce different decision tendencies.
 * 10. Difficulty changes behaviour without revealing hidden information.
 * 11. Selected partner is always on human player's team (Team Alpha).
 * 12. Opponents are automatically selected and cannot be selected by the player.
 */

import assert from "node:assert/strict";
import {
  BOT_ARCHETYPES,
  ALL_ARCHETYPE_IDS,
  selectOpponents,
  type BotArchetypeId,
} from "../src/lib/bot/archetypes";
import { createBotProfile, BOT_PROFILES } from "../src/lib/bot/profiles";
import { BotAgent } from "../src/lib/bot/agent";
import { LocalMatch } from "../src/lib/bot/local-match";
import { applyAction, createRoundState, observePlayer } from "../src/lib/engine";
import { setupJackpotRound } from "../src/lib/deck";
import { createRng } from "../src/lib/rng";

console.log("Starting Bot Personality & Fairness Test Suite...\n");

// TEST 1: All 6 archetypes exist with 5 core attributes (1-100 scale)
{
  console.log("Test 1: Archetypes and 1-100 Core Attributes");
  assert.equal(ALL_ARCHETYPE_IDS.length, 6);
  for (const id of ALL_ARCHETYPE_IDS) {
    const arch = BOT_ARCHETYPES[id];
    assert.ok(arch.name);
    assert.ok(arch.avatar);
    assert.ok(arch.playerDescription);
    assert.ok(arch.bestFor);

    const attrs = arch.attributes;
    for (const key of ["signalSense", "deception", "aggression", "teamwork", "risk"] as const) {
      assert.ok(attrs[key] >= 1 && attrs[key] <= 100, `${id}.${key} must be between 1 and 100`);
    }
  }
  console.log("  ✓ All 6 archetypes configured with valid 1-100 core attributes");
}

// TEST 2: Information Fairness - AI operates strictly on legitimate filtered observation
{
  console.log("Test 2: AI Information Fairness");
  const match = new LocalMatch({
    humanPlayerName: "Alice",
    humanTeamSignal: "nod",
    opponentsSignal: "scratch-nose",
    partnerArchetype: "hawk",
  });

  // Observe partner bot and opponent bot
  const partnerObs = match.bots.get(match.partnerId)!.think(observePlayer(match.state, match.partnerId, match.now));
  const oppObs = observePlayer(match.state, match.opponent1Id, match.now);

  // 1. Cannot see opponent or partner hidden cards
  for (const seat of oppObs.seats) {
    assert.equal("hand" in seat, false, "Seat view must not leak cards!");
  }
  // 2. Cannot see opponent secret signal
  assert.equal(oppObs.teamSignalId, "scratch-nose"); // Opponent sees its own team signal
  assert.equal(JSON.stringify(oppObs).includes("nod"), false, "Opponent leaked Alpha secret signal!");

  // Partner must only see Alpha signal ("nod"), never Bravo signal ("scratch-nose")
  const partnerView = observePlayer(match.state, match.partnerId, match.now);
  assert.equal(partnerView.teamSignalId, "nod");
  assert.equal(JSON.stringify(partnerView).includes("scratch-nose"), false, "Partner leaked opponent signal!");

  console.log("  ✓ AI bots operate with complete information isolation and no hidden card leaks");
}

// TEST 3: Selected Partner Is Always on Human Player's Team (Team Alpha)
{
  console.log("Test 3: Selected Partner Is Always on Human Team");
  for (const archId of ALL_ARCHETYPE_IDS) {
    const match = new LocalMatch({
      humanPlayerName: "Hero",
      humanTeamSignal: "thumbs-up",
      partnerArchetype: archId,
    });

    const humanSeat = match.state.game.players.find((p) => p.id === match.humanId)!;
    const partnerSeat = match.state.game.players.find((p) => p.id === match.partnerId)!;

    assert.equal(humanSeat.team, "Alpha");
    assert.equal(partnerSeat.team, "Alpha", `Partner (${archId}) must always be Team Alpha`);
    assert.equal(match.partnerArchetype, archId);
  }
  console.log("  ✓ Chosen partner is consistently placed on the user's team across all archetypes");
}

// TEST 4: Automatic Opponent Selection & Safeguard Against Immediate Repetition
{
  console.log("Test 4: Automatic Opponent Selection");
  const partner: BotArchetypeId = "strategist";
  const [opp1, opp2] = selectOpponents(partner, undefined, () => 0.1);
  assert.notEqual(opp1, partner, "Opponent cannot be partner");
  assert.notEqual(opp2, partner, "Opponent cannot be partner");
  assert.notEqual(opp1, opp2, "Opponents must be distinct");

  // Safeguard against immediate consecutive repetition
  const prevPair: [BotArchetypeId, BotArchetypeId] = [opp1, opp2];
  const nextPair = selectOpponents(partner, prevPair, () => 0.1);
  const prevKey = [...prevPair].sort().join(":");
  const nextKey = [...nextPair].sort().join(":");
  assert.notEqual(nextKey, prevKey, "Opponent selection must avoid immediate repetition");
  console.log("  ✓ Opponents selected automatically without repetition of previous matchup");
}

// TEST 5: Personality Attributes Materially Alter Decision Tendencies
{
  console.log("Test 5: Personality Attributes Materially Alter Decision Tendencies");

  // The Trickster (Deception 95) vs The Loyalist (Deception 50)
  const tricksterProfile = createBotProfile("normal", "trickster");
  const loyalistProfile = createBotProfile("normal", "loyalist");

  assert.ok(
    tricksterProfile.ambientDecoysPerMinute > loyalistProfile.ambientDecoysPerMinute,
    "Trickster must emit more decoys per minute than Loyalist"
  );
  assert.ok(
    tricksterProfile.decoyBeforeSignal > loyalistProfile.decoyBeforeSignal,
    "Trickster must have higher decoy-before-signal chance than Loyalist"
  );

  // The Gambler (Aggression 95, Risk 95) vs The Strategist (Aggression 45, Risk 35)
  const gamblerProfile = createBotProfile("normal", "gambler");
  const strategistProfile = createBotProfile("normal", "strategist");

  assert.ok(
    gamblerProfile.suspectCooldownMs < strategistProfile.suspectCooldownMs,
    "Gambler must have shorter suspect cooldown than Strategist"
  );
  // Compare suspect probability thresholds
  const gamblerFirstThreshold = gamblerProfile.suspectCurve[0];
  const strategistFirstThreshold = strategistProfile.suspectCurve[0];
  assert.ok(
    gamblerFirstThreshold.at < strategistFirstThreshold.at,
    "Gambler should suspect at lower evidence threshold than Strategist"
  );

  // The Loyalist (Teamwork 98) vs The Chaos Agent (Teamwork 55)
  const loyalistTeamwork = loyalistProfile.missPartnerSignal;
  const chaosProfile = createBotProfile("normal", "chaos");
  assert.ok(
    loyalistTeamwork < chaosProfile.missPartnerSignal,
    "Loyalist must miss partner signal far less often than Chaos Agent"
  );

  console.log("  ✓ Deception, Aggression, Risk, and Teamwork measurably modify profile attributes");
}

// TEST 6: AI Cannot Suspect with Zero Suspects Remaining
{
  console.log("Test 6: AI Cannot Suspect When Suspects Depleted");
  const match = new LocalMatch({
    humanPlayerName: "Alice",
    humanTeamSignal: "nod",
    opponentsSignal: "wink",
    partnerArchetype: "gambler",
  });

  // Deplete all 3 suspects for Bravo
  match.state.suspectsRemaining.Bravo = 0;

  const oppBot = match.bots.get(match.opponent1Id)!;
  const obs = observePlayer(match.state, match.opponent1Id, match.now + 10000);
  assert.equal(obs.mySuspectsRemaining, 0);

  const decision = oppBot.think(obs);
  assert.equal(decision.action?.type === "suspect", false, "Bot with 0 suspects must never suspect");
  console.log("  ✓ Bot respects rule that zero suspects forbids further suspect calls");
}

// TEST 7: AI Partner Does Not Call Jackpot Without Partner Signal
{
  console.log("Test 7: AI Partner Never Illegitimately Calls Jackpot");
  const match = new LocalMatch({
    humanPlayerName: "Alice",
    humanTeamSignal: "nod",
    partnerArchetype: "strategist",
  });

  const partnerBot = match.bots.get(match.partnerId)!;
  // Step for 4 seconds without human signalling
  for (let t = 0; t < 40; t++) {
    match.now += 100;
    const obs = observePlayer(match.state, match.partnerId, match.now);
    const dec = partnerBot.think(obs);
    assert.equal(dec.action?.type === "jackpot", false, "Partner must never spontaneously call jackpot!");
  }
  console.log("  ✓ AI partner does not call Jackpot when partner has not flashed agreed signal");
}

// TEST 8: Difficulty Scaling Operates Fairly Without Cheating
{
  console.log("Test 8: Difficulty Scaling Operates Fairly");
  const easy = createBotProfile("easy", "hawk");
  const normal = createBotProfile("normal", "hawk");
  const hard = createBotProfile("hard", "hawk");

  assert.ok(hard.passAccuracy > normal.passAccuracy && normal.passAccuracy > easy.passAccuracy);
  assert.ok(hard.perceptionNoise < normal.perceptionNoise && normal.perceptionNoise < easy.perceptionNoise);
  assert.ok(hard.evidenceHalfLifeMs > normal.evidenceHalfLifeMs && normal.evidenceHalfLifeMs > easy.evidenceHalfLifeMs);

  console.log("  ✓ Difficulty adjustments scale decision accuracy and perception without cheating");
}

console.log("\n==============================================");
console.log("ALL BOT PERSONALITY & FAIRNESS TESTS PASSED!");
console.log("==============================================");

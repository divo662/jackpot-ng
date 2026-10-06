import assert from "node:assert/strict";
import { createPracticeRoom } from "../src/lib/session";
import { LocalMatch } from "../src/lib/bot/local-match";

console.log("Starting Practice Flow & Round Termination Test Suite...\n");

// Test 1: Practice Room Generation
{
  console.log("Test 1: createPracticeRoom generates valid 4-player lobby");
  const room = createPracticeRoom("Divine", "player-divine");
  assert.equal(room.code, "PRACTICE");
  assert.equal(room.status, "lobby");
  assert.equal(room.players.length, 4);
  assert.equal(room.players[0].nickname, "Divine");
  assert.equal(room.players[0].isAdmin, true);
  assert.equal(room.players[1].nickname, "Fatima (Bot)");
  assert.equal(room.players[2].nickname, "Michael (Bot)");
  assert.equal(room.players[3].nickname, "Chidi (Bot)");
  assert.equal(room.teams?.["player-divine"], "Alpha");
  assert.equal(room.teams?.["player-north"], "Alpha");
  assert.equal(room.teams?.["player-east"], "Bravo");
  assert.equal(room.teams?.["player-west"], "Bravo");
  console.log("  ✓ Practice room initialized with host + 3 bots and balanced teams");
}

// Test 2: False Suspect Does Not Prematurely End LocalMatch
{
  console.log("Test 2: False suspect call does not set match status to 'over'");
  const match = new LocalMatch({
    humanPlayerName: "Divine",
    humanTeamSignal: "thumbs-up",
    difficulty: "normal",
    seed: 42,
  });

  assert.equal(match.state.status, "playing");

  // Submit false suspect from human player on tick 1 (nobody has 4-of-a-kind yet)
  const res = match.submitHumanAction({ type: "suspect", playerId: match.humanId });
  assert.equal(res.ok, true);
  assert.equal(res.result?.kind, "suspect");
  assert.equal(res.result?.valid, false);

  // Match MUST remain playing, NOT over!
  assert.equal(match.state.status, "playing", "Match must stay playing after a false suspect!");
  assert.equal(match.state.suspectsRemaining.Alpha, 2, "Caller team must have burned exactly 1 attempt");
  console.log("  ✓ False suspect correctly kept match status as 'playing' and burned 1 attempt");
}

// Test 3: Simulation stepTo handles tick advances without early termination
{
  console.log("Test 3: Bots advance passes normally without false early round termination");
  const match = new LocalMatch({
    humanPlayerName: "Divine",
    humanTeamSignal: "thumbs-up",
    difficulty: "normal",
    seed: 777,
  });

  // Advance simulation through 3 seconds of card passes
  const executed = match.stepTo(match.now + 3000, 100);
  assert.equal(match.state.status, "playing", "Match should still be actively playing after 3s of passing");
  console.log("  ✓ Match stayed active through 3 seconds of bot decision loops");
}

console.log("\n==========================================");
console.log("ALL PRACTICE FLOW TESTS PASSED CLEANLY!");
console.log("==========================================");

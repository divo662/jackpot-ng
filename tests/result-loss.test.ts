import assert from "node:assert/strict";
import { type RoundResult, resolveJackpot } from "../src/lib/game";
import { setupJackpotRound } from "../src/lib/deck";

console.log("Starting Result Page Loss Flow Test Suite...\n");

// Helper mimicking isRoundLoss logic from JackpotApp.tsx
function computeIsRoundLoss(
  result: RoundResult | null,
  viewerTeam: "Alpha" | "Bravo",
  matchWonTeam: "Alpha" | "Bravo" | null,
  scores: Record<"Alpha" | "Bravo", number>,
  winningScore = 7
): boolean {
  if (matchWonTeam && matchWonTeam !== viewerTeam) return true;
  if ((scores.Alpha >= winningScore || scores.Bravo >= winningScore) && (scores[viewerTeam] ?? 0) < winningScore) {
    return true;
  }
  if (!result) return false;
  if (result.scoringTeam) {
    return result.scoringTeam !== viewerTeam;
  }
  if (result.callingTeam === viewerTeam && !result.valid) {
    return true;
  }
  return false;
}

// Test 1: Opponent valid Jackpot results in loss for viewer team
{
  console.log("Test 1: Opponent Team Bravo scores valid JACKPOT -> Team Alpha is loss");
  const result: RoundResult = {
    kind: "jackpot",
    valid: true,
    callingTeam: "Bravo",
    callingPlayerId: "bot-bravo-1",
    scoringTeam: "Bravo",
    suit: "star",
    title: "JACKPOT!",
    detail: "Bot called it — Teammate holds four stars. +1 Team Bravo.",
  };

  const alphaLoss = computeIsRoundLoss(result, "Alpha", null, { Alpha: 1, Bravo: 2 });
  const bravoLoss = computeIsRoundLoss(result, "Bravo", null, { Alpha: 1, Bravo: 2 });

  assert.equal(alphaLoss, true, "Alpha viewer must experience loss");
  assert.equal(bravoLoss, false, "Bravo viewer must experience win");
  console.log("  ✓ Correct: Losing team sees loss, scoring team sees win");
}

// Test 2: False Jackpot by viewer's team awards penalty point to opponent -> viewer loss
{
  console.log("Test 2: Team Alpha calls False Jackpot -> penalty point to Team Bravo -> Alpha is loss");
  const deal = setupJackpotRound(["Alpha1", "Bravo1", "Alpha2", "Bravo2"]);
  const outcome = resolveJackpot(
    { ...deal, activePlayerId: deal.players[0].id, passCount: 0, log: [] },
    deal.players[0].id
  );

  assert.equal(outcome.valid, false);
  assert.equal(outcome.scoringTeam, "Bravo");

  const alphaLoss = computeIsRoundLoss(outcome, "Alpha", null, { Alpha: 0, Bravo: 1 });
  const bravoLoss = computeIsRoundLoss(outcome, "Bravo", null, { Alpha: 0, Bravo: 1 });

  assert.equal(alphaLoss, true, "Alpha team must be flagged as loss due to false jackpot penalty");
  assert.equal(bravoLoss, false, "Bravo team got the penalty point, so Bravo is not a loss");
  console.log("  ✓ Correct: False call penalty correctly assigns loss to caller team");
}

// Test 3: Viewer team valid Jackpot -> win for viewer, loss for opponent
{
  console.log("Test 3: Team Alpha scores valid JACKPOT -> Alpha wins, Bravo loses");
  const result: RoundResult = {
    kind: "jackpot",
    valid: true,
    callingTeam: "Alpha",
    callingPlayerId: "player-1",
    scoringTeam: "Alpha",
    suit: "circle",
    title: "JACKPOT!",
    detail: "Divine called it — Partner holds four circles. +1 Team Alpha.",
  };

  const alphaLoss = computeIsRoundLoss(result, "Alpha", null, { Alpha: 4, Bravo: 2 });
  const bravoLoss = computeIsRoundLoss(result, "Bravo", null, { Alpha: 4, Bravo: 2 });

  assert.equal(alphaLoss, false, "Alpha viewer won the round");
  assert.equal(bravoLoss, true, "Bravo viewer lost the round");
  console.log("  ✓ Correct: Winner experiences win; opponents experience loss");
}

// Test 4: Match Over victory vs defeat
{
  console.log("Test 4: Match Over condition flags losing team");
  const result: RoundResult = {
    kind: "jackpot",
    valid: true,
    callingTeam: "Bravo",
    callingPlayerId: "bot-bravo-1",
    scoringTeam: "Bravo",
    suit: "diamond",
    title: "JACKPOT!",
    detail: "Bravo completes J-A-C-K-P-O-T! +1 Team Bravo.",
  };

  const alphaLoss = computeIsRoundLoss(result, "Alpha", "Bravo", { Alpha: 5, Bravo: 7 });
  const bravoLoss = computeIsRoundLoss(result, "Bravo", "Bravo", { Alpha: 5, Bravo: 7 });

  assert.equal(alphaLoss, true, "Alpha lost match");
  assert.equal(bravoLoss, false, "Bravo won match");
  console.log("  ✓ Correct: Final match victory flags losing team");
}

console.log("\n==========================================");
console.log("ALL RESULT PAGE LOSS TESTS PASSED CLEANLY!");
console.log("==========================================");

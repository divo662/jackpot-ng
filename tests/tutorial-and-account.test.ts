import {
  readAccount,
  saveAccount,
  readGuestStats,
  recordGuestStat,
  migrateGuestToAccount,
  isTutorialCompleted,
  setTutorialCompleted,
  resetTutorial,
  isFirstVisit,
  setFirstVisitCompleted,
} from "../src/lib/account";
import { createTutorialDeal, TUTORIAL_COACHMARKS } from "../src/lib/tutorial";
import { findFourOfAKind } from "../src/lib/game";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// In-memory mock storage for Node environment tests
const storageMock: Record<string, string> = {};
global.window = {
  localStorage: {
    getItem: (key: string) => storageMock[key] ?? null,
    setItem: (key: string, val: string) => {
      storageMock[key] = val;
    },
    removeItem: (key: string) => {
      delete storageMock[key];
    },
    clear: () => {
      for (const k in storageMock) delete storageMock[k];
    },
  },
} as any;

console.log("Starting Tutorial & Account System Test Suite...\n");

// Test 1: First Visit Tracking
console.log("Test 1: First Visit Tracking");
assert(isFirstVisit() === true, "Fresh visitor should be recognized as first visit");
setFirstVisitCompleted();
assert(isFirstVisit() === false, "First visit flag should be set to completed");
console.log("  ✓ First visit tracking works as expected\n");

// Test 2: Guest Stats Recording & Account Migration
console.log("Test 2: Guest Stats & Migration to Verified Account");
recordGuestStat("roundsPlayed", 3);
recordGuestStat("jackpotsCalled", 2);
recordGuestStat("suspectsCaught", 1);
recordGuestStat("wins", 2);

const guestStats = readGuestStats();
assert(guestStats.roundsPlayed === 3, "Guest rounds played should be 3");
assert(guestStats.jackpotsCalled === 2, "Guest jackpots should be 2");
assert(guestStats.suspectsCaught === 1, "Guest suspects caught should be 1");
assert(guestStats.wins === 2, "Guest wins should be 2");

const account = migrateGuestToAccount("SuperPlayer", "player@test.com", "👑", "Signal Detective", "strategist");
assert(account.username === "SuperPlayer", "Account username set");
assert(account.stats.roundsPlayed === 3, "Account migrated guest rounds played");
assert(account.stats.jackpotsCalled === 2, "Account migrated guest jackpots");
assert(account.stats.suspectsCaught === 1, "Account migrated guest suspects");
assert(account.stats.wins === 2, "Account migrated guest wins");
assert(account.preferredPartnerId === "strategist", "Preferred partner set");

const loaded = readAccount();
assert(loaded?.username === "SuperPlayer", "Account read back correctly from persistence");
console.log("  ✓ Guest stats successfully recorded and migrated to user account\n");

// Test 3: Tutorial Completion Flag
console.log("Test 3: Tutorial Completion Flags");
resetTutorial();
assert(isTutorialCompleted() === false, "Tutorial should not be marked complete initially");
setTutorialCompleted(true);
assert(isTutorialCompleted() === true, "Tutorial should now be marked complete");
console.log("  ✓ Tutorial completion state correctly preserved\n");

// Test 4: Deterministic Tutorial Deals (Round 1 & 2)
console.log("Test 4: Tutorial Deals Verification");
const deal1 = createTutorialDeal(1, "human", "Partner", "Opp1", "Opp2");
assert(deal1.players.length === 4, "Deal 1 must have 4 seated players");
assert(deal1.players[0].hand.length === 5, "Human starts with 5 cards to make first pass");
const partnerTriangles = deal1.players[2].hand.filter((c) => c.suit === "triangle").length;
assert(partnerTriangles === 3, "Partner starts with 3 Triangles in Round 1");

const deal2 = createTutorialDeal(2, "human", "Partner", "Opp1", "Opp2");
assert(deal2.players.length === 4, "Deal 2 must have 4 seated players");
// In Round 2, Opponent 1 starts with 3 Circles ready to complete 4 and signal
const oppCircles = deal2.players[1].hand.filter((c) => c.suit === "circle").length;
assert(oppCircles === 3, "Opponent 1 starts with 3 Circles in Round 2");

// Check coachmarks coverage
assert(!!TUTORIAL_COACHMARKS.strategy_room_intro, "Coachmark exists for strategy room");
assert(!!TUTORIAL_COACHMARKS.table_partner_signal_detected, "Coachmark exists for partner signal");
assert(!!TUTORIAL_COACHMARKS.round2_suspicious_gesture, "Coachmark exists for suspect catch");
console.log("  ✓ Tutorial deals & coachmarks configured cleanly\n");

console.log("==========================================");
console.log("ALL TUTORIAL & ACCOUNT TESTS PASSED!");
console.log("==========================================");

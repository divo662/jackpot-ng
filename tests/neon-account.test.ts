import { neon } from "@neondatabase/serverless";
import fs from "fs";
import { ensureAccountTable, upsertDbAccount, getDbAccountByUsername } from "../src/lib/server-account";
import type { UserAccount } from "../src/lib/account";

// Ensure DATABASE_URL is set in process.env from .env file
if (!process.env.DATABASE_URL) {
  try {
    const envContent = fs.readFileSync(".env", "utf8");
    const match = envContent.match(/DATABASE_URL="?([^"\r\n]+)"?/);
    if (match) process.env.DATABASE_URL = match[1];
  } catch {}
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function run() {
  console.log("Starting Neon Database Account Integration Test...\n");

  if (!process.env.DATABASE_URL) {
    console.warn("Skipping Neon DB live test: No DATABASE_URL found.");
    return;
  }

  // Test 1: Ensure Table creation
  console.log("Test 1: Schema migration on Neon Postgres");
  await ensureAccountTable();
  console.log("  ✓ Table jackpot_accounts confirmed/created in Neon DB");

  // Test 2: Upsert Account into Neon DB
  console.log("Test 2: Upserting Account into Neon DB");
  const testAccount: UserAccount = {
    id: `test-acc-${Date.now()}`,
    username: "NeonPlayer99",
    email: "neonplayer@example.com",
    avatar: "👑",
    title: "Table Legend",
    preferredPartnerId: "strategist",
    stats: {
      gamesPlayed: 5,
      roundsPlayed: 10,
      wins: 7,
      jackpotsCalled: 4,
      suspectsCaught: 3,
      falseCalls: 0,
    },
    createdAt: Date.now(),
    isGuest: false,
  };

  const saved = await upsertDbAccount(testAccount, "test-pin-1234");
  assert(saved.username === testAccount.username, "Username matched");
  assert(saved.stats.wins === 7, "Wins correctly stored in Neon");
  assert(saved.stats.jackpotsCalled === 4, "Jackpots correctly stored in Neon");
  console.log(`  ✓ Successfully upserted account for '${saved.username}' into Neon DB`);

  // Test 3: Read back from Neon DB
  console.log("Test 3: Reading Account back from Neon DB");
  const fetched = await getDbAccountByUsername(testAccount.username);
  assert(fetched !== null, "Account must be found in Neon");
  assert(fetched?.username === testAccount.username, "Fetched username matches");
  assert(fetched?.title === "Table Legend", "Fetched title matches");
  assert(fetched?.stats.jackpotsCalled === 4, "Fetched stats match");
  console.log(`  ✓ Successfully read back '${fetched?.username}' with title '${fetched?.title}' and ${fetched?.stats.wins} wins from Neon DB`);

  console.log("\n==========================================");
  console.log("NEON DATABASE ACCOUNT INTEGRATION VERIFIED!");
  console.log("==========================================");
}

run().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});

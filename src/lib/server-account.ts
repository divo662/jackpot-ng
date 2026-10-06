import { neon } from "@neondatabase/serverless";
import type { UserAccount, PlayerStats } from "./account";
import { normalizePlayerName } from "./session";

import fs from "fs";

function getSql() {
  if (!process.env.DATABASE_URL) {
    try {
      if (fs.existsSync(".env")) {
        const envContent = fs.readFileSync(".env", "utf8");
        const match = envContent.match(/DATABASE_URL="?([^"\r\n]+)"?/);
        if (match) process.env.DATABASE_URL = match[1];
      }
    } catch {}
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Please configure your Neon PostgreSQL connection string in .env");
  }
  return neon(process.env.DATABASE_URL);
}

let accountSchemaReady: Promise<void> | null = null;

export async function ensureAccountTable(): Promise<void> {
  const sql = getSql();
  if (!accountSchemaReady) {
    accountSchemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS jackpot_accounts (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT,
        avatar TEXT NOT NULL DEFAULT '👑',
        title TEXT NOT NULL DEFAULT 'Rookie Partner',
        preferred_partner_id TEXT NOT NULL DEFAULT 'strategist',
        games_played INT NOT NULL DEFAULT 0,
        rounds_played INT NOT NULL DEFAULT 0,
        wins INT NOT NULL DEFAULT 0,
        jackpots_called INT NOT NULL DEFAULT 0,
        suspects_caught INT NOT NULL DEFAULT 0,
        false_calls INT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`;
    })();
  }
  try {
    await accountSchemaReady;
  } catch (error) {
    accountSchemaReady = null;
    throw error;
  }
}

export async function upsertDbAccount(
  account: UserAccount,
  password?: string
): Promise<UserAccount> {
  await ensureAccountTable();
  const sql = getSql();

  const cleanUser = normalizePlayerName(account.username);
  const now = Date.now();

  const rows = await sql`
    INSERT INTO jackpot_accounts (
      id,
      username,
      email,
      password_hash,
      avatar,
      title,
      preferred_partner_id,
      games_played,
      rounds_played,
      wins,
      jackpots_called,
      suspects_caught,
      false_calls,
      created_at,
      updated_at
    )
    VALUES (
      ${account.id},
      ${cleanUser},
      ${account.email ?? null},
      ${password ?? null},
      ${account.avatar},
      ${account.title},
      ${account.preferredPartnerId},
      ${account.stats.gamesPlayed || 0},
      ${account.stats.roundsPlayed || 0},
      ${account.stats.wins || 0},
      ${account.stats.jackpotsCalled || 0},
      ${account.stats.suspectsCaught || 0},
      ${account.stats.falseCalls || 0},
      ${account.createdAt || now},
      ${now}
    )
    ON CONFLICT (username) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, jackpot_accounts.email),
        avatar = EXCLUDED.avatar,
        title = EXCLUDED.title,
        preferred_partner_id = EXCLUDED.preferred_partner_id,
        games_played = GREATEST(jackpot_accounts.games_played, EXCLUDED.games_played),
        rounds_played = GREATEST(jackpot_accounts.rounds_played, EXCLUDED.rounds_played),
        wins = GREATEST(jackpot_accounts.wins, EXCLUDED.wins),
        jackpots_called = GREATEST(jackpot_accounts.jackpots_called, EXCLUDED.jackpots_called),
        suspects_caught = GREATEST(jackpot_accounts.suspects_caught, EXCLUDED.suspects_caught),
        false_calls = GREATEST(jackpot_accounts.false_calls, EXCLUDED.false_calls),
        updated_at = ${now}
    RETURNING *
  `;

  const r = rows[0];
  return {
    id: r.id,
    username: r.username,
    email: r.email ?? undefined,
    avatar: r.avatar,
    title: r.title,
    preferredPartnerId: r.preferred_partner_id as any,
    isGuest: false,
    stats: {
      gamesPlayed: Number(r.games_played ?? 0),
      roundsPlayed: Number(r.rounds_played ?? 0),
      wins: Number(r.wins ?? 0),
      jackpotsCalled: Number(r.jackpots_called ?? 0),
      suspectsCaught: Number(r.suspects_caught ?? 0),
      falseCalls: Number(r.false_calls ?? 0),
    },
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export async function getDbAccountByUsername(username: string): Promise<UserAccount | null> {
  await ensureAccountTable();
  const sql = getSql();
  const cleanUser = normalizePlayerName(username);
  const rows = await sql`
    SELECT * FROM jackpot_accounts
    WHERE LOWER(username) = LOWER(${cleanUser})
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    username: r.username,
    email: r.email ?? undefined,
    avatar: r.avatar,
    title: r.title,
    preferredPartnerId: r.preferred_partner_id as any,
    isGuest: false,
    stats: {
      gamesPlayed: Number(r.games_played ?? 0),
      roundsPlayed: Number(r.rounds_played ?? 0),
      wins: Number(r.wins ?? 0),
      jackpotsCalled: Number(r.jackpots_called ?? 0),
      suspectsCaught: Number(r.suspects_caught ?? 0),
      falseCalls: Number(r.false_calls ?? 0),
    },
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

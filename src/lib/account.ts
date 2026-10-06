import { type BotArchetypeId } from "@/lib/bot/archetypes";

export const ACCOUNT_STORAGE_KEY = "jackpot:account:v1";
export const GUEST_STATS_STORAGE_KEY = "jackpot:guest_stats:v1";
export const TUTORIAL_COMPLETED_KEY = "jackpot:tutorial_completed:v1";
export const FIRST_VISIT_KEY = "jackpot:first_visit_completed:v1";

export type PlayerStats = {
  gamesPlayed: number;
  roundsPlayed: number;
  wins: number;
  jackpotsCalled: number;
  suspectsCaught: number;
  falseCalls: number;
};

export type UserAccount = {
  id: string;
  username: string;
  email?: string;
  avatar: string;
  title: string;
  preferredPartnerId: BotArchetypeId;
  stats: PlayerStats;
  createdAt: number;
  updatedAt?: number;
  isGuest: false;
};

export const DEFAULT_GUEST_STATS: PlayerStats = {
  gamesPlayed: 0,
  roundsPlayed: 0,
  wins: 0,
  jackpotsCalled: 0,
  suspectsCaught: 0,
  falseCalls: 0,
};

export const AVAILABLE_AVATARS = [
  { id: "crown", emoji: "👑", label: "Royalty" },
  { id: "joker", emoji: "🃏", label: "Wildcard" },
  { id: "hawk", emoji: "🦅", label: "The Hawk" },
  { id: "lightning", emoji: "⚡", label: "Reflex" },
  { id: "dice", emoji: "🎲", label: "Gambler" },
  { id: "target", emoji: "🎯", label: "Precision" },
  { id: "diamond", emoji: "💎", label: "Veteran" },
  { id: "trophy", emoji: "🏆", label: "Champion" },
] as const;

export const AVAILABLE_TITLES = [
  "Rookie Partner",
  "Card Shark",
  "Silent Partner",
  "Eagle Eye",
  "The Tactician",
  "Bluff Master",
  "Table Legend",
] as const;

export function readAccount(): UserAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserAccount) : null;
  } catch {
    return null;
  }
}

export async function syncAccountToDb(account: UserAccount, password?: string): Promise<UserAccount | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.account ?? null;
  } catch {
    return null;
  }
}

export async function fetchAccountFromDb(username: string): Promise<UserAccount | null> {
  if (typeof window === "undefined" || !username) return null;
  try {
    const res = await fetch(`/api/account?username=${encodeURIComponent(username)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.account ?? null;
  } catch {
    return null;
  }
}

export function saveAccount(account: UserAccount): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
    window.dispatchEvent(new CustomEvent("jackpot:account-change", { detail: account }));
    void syncAccountToDb(account);
  } catch {}
}

export function readGuestStats(): PlayerStats {
  if (typeof window === "undefined") return { ...DEFAULT_GUEST_STATS };
  try {
    const raw = window.localStorage.getItem(GUEST_STATS_STORAGE_KEY);
    return raw ? { ...DEFAULT_GUEST_STATS, ...JSON.parse(raw) } : { ...DEFAULT_GUEST_STATS };
  } catch {
    return { ...DEFAULT_GUEST_STATS };
  }
}

export function recordGuestStat(key: keyof PlayerStats, delta = 1): PlayerStats {
  const current = readGuestStats();
  const updated: PlayerStats = {
    ...current,
    [key]: (current[key] ?? 0) + delta,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(GUEST_STATS_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }
  return updated;
}

export function isTutorialCompleted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(TUTORIAL_COMPLETED_KEY) === "true";
}

export function setTutorialCompleted(completed = true): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TUTORIAL_COMPLETED_KEY, completed ? "true" : "false");
}

export function resetTutorial(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TUTORIAL_COMPLETED_KEY);
}

export function isFirstVisit(): boolean {
  if (typeof window === "undefined") return false;
  // If user already has an account, they are not on first visit
  if (readAccount()) return false;
  // Check if first visit flag is set or username was already saved
  const flagged = window.localStorage.getItem(FIRST_VISIT_KEY);
  const hasGuestName = Boolean(window.localStorage.getItem("jackpot:guest-name:v1"));
  return !flagged && !hasGuestName;
}

export function setFirstVisitCompleted(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FIRST_VISIT_KEY, "true");
}

export function migrateGuestToAccount(
  username: string,
  email?: string,
  avatar = "👑",
  title = "Rookie Partner",
  preferredPartnerId: BotArchetypeId = "strategist",
  password?: string
): UserAccount {
  const guestStats = readGuestStats();
  const account: UserAccount = {
    id: `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    username: username.trim() || "Player",
    email: email?.trim() || undefined,
    avatar,
    title,
    preferredPartnerId,
    stats: { ...guestStats },
    createdAt: Date.now(),
    isGuest: false,
  };
  saveAccount(account);
  void syncAccountToDb(account, password);
  // Clear guest stats storage once migrated
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(GUEST_STATS_STORAGE_KEY);
    } catch {}
  }
  return account;
}

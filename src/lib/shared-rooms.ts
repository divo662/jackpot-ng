import { normalizePlayerName, type LocalChatMessage, type LocalPlayer, type LocalRoomStatus } from "@/lib/session";
import { ALL_SIGNAL_IDS } from "@/lib/signals";
import { applyRoundScore, createRoomMatch, emptyScores, passCard, resolveJackpot, resolveSuspect, SIGNAL_DECISION_WINDOW_MS, SUSPECT_ATTEMPTS_PER_TEAM, type GameSnapshot, type RoundResult, type ScoreBoard } from "@/lib/game";
import type { JackpotCard, Suit } from "@/lib/deck";
import { neon } from "@neondatabase/serverless";

/** Room state stored durably in Neon and shared by all API function instances. */
export type SharedRoom = {
  id: string;
  code: string;
  isPrivate: boolean;
  maxPlayers: 4 | 6 | 8;
  status: LocalRoomStatus;
  hostPlayerId: string;
  players: LocalPlayer[];
  chat: LocalChatMessage[];
  teams?: Record<string, "Alpha" | "Bravo">;
  teamAcceptances?: Record<string, boolean>;
  teamNotice?: string;
  teamPhase?: "lobby" | "assignment" | "confirmation" | "strategy" | "game" | "result";
  confirmationEndsAt?: number;
  strategyEndsAt?: number;
  teamSignals?: Partial<Record<"Alpha" | "Bravo", string>>;
  /** Server-only authenticity for the most recent signal, revealed after SUSPECT. */
  pendingSignalTruth?: { signalId: string; playerId: string; playerName: string; isFake: boolean; createdAt: number };
  teamSignalBy?: Partial<Record<"Alpha" | "Bravo", string>>;
  teamSignalAgreements?: Partial<Record<"Alpha" | "Bravo", Record<string, boolean>>>;
  teamSignalLocked?: Partial<Record<"Alpha" | "Bravo", boolean>>;
  teamChats?: Partial<Record<"Alpha" | "Bravo", LocalChatMessage[]>>;
  gameSnapshot?: GameSnapshot | null;
  dealVersion?: number;
  scores?: ScoreBoard;
  suspectAttemptsRemaining?: Partial<Record<"Alpha" | "Bravo", number>>;
  round?: number;
  result?: RoundResult | null;
  gameAuthoritative?: boolean;
  matchInterruption?: {
    type: "deliberate_exit" | "disconnected" | "aborted";
    playerId: string;
    playerName: string;
    message: string;
    deadline?: number;
    createdAt: number;
  } | null;
  playerTokens?: Record<string, string>;
  tokenClaims?: Record<string, boolean>;
  playerReactionAt?: Record<string, number>;
  updatedAt: number;
};

export function normalizeRoomCode(code: string): string {
  const clean = code.trim().toUpperCase();
  if (clean.startsWith("JKP") && !clean.includes("-") && clean.length > 3) {
    return `JKP-${clean.slice(3)}`;
  }
  return clean;
}

const HOT_ROOM_CACHE = new Map<string, { room: SharedRoom; cachedAt: number }>();
type RoomListener = (room: SharedRoom) => void;
const ROOM_LISTENERS = new Map<string, Set<RoomListener>>();

export function subscribeToRoom(code: string, listener: RoomListener): () => void {
  const clean = normalizeRoomCode(code);
  let set = ROOM_LISTENERS.get(clean);
  if (!set) {
    set = new Set();
    ROOM_LISTENERS.set(clean, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      ROOM_LISTENERS.delete(clean);
    }
  };
}

export function broadcastRoomUpdate(room: SharedRoom): void {
  const clean = normalizeRoomCode(room.code);
  const set = ROOM_LISTENERS.get(clean);
  if (set) {
    for (const listener of set) {
      try {
        listener(room);
      } catch {
        // connection closed
      }
    }
  }
}

export type PlayerProfile = {
  playerId: string;
  nickname: string;
  lastRoomCode?: string | null;
  createdAt: number;
  updatedAt: number;
};

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let schemaReady: Promise<void> | null = null;
let playerSchemaReady: Promise<void> | null = null;

export async function ensurePlayerTable(): Promise<void> {
  if (!sql) throw new Error("DATABASE_URL is missing. Add your Neon connection string to .env.local and Vercel environment variables.");
  if (!playerSchemaReady) {
    playerSchemaReady = (async () => {
      await sql!`CREATE TABLE IF NOT EXISTS jackpot_players (
        player_id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        last_room_code TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`;
    })();
  }
  try {
    await playerSchemaReady;
  } catch (error) {
    playerSchemaReady = null;
    throw error;
  }
}

export async function savePlayerProfile(
  playerId: string,
  nickname: string,
  lastRoomCode?: string | null
): Promise<PlayerProfile> {
  await ensurePlayerTable();
  const cleanName = normalizePlayerName(nickname);
  const now = Date.now();
  const rows = await sql!`
    INSERT INTO jackpot_players (player_id, nickname, last_room_code, created_at, updated_at)
    VALUES (${playerId}, ${cleanName}, ${lastRoomCode ?? null}, ${now}, ${now})
    ON CONFLICT (player_id) DO UPDATE
    SET nickname = ${cleanName},
        last_room_code = COALESCE(${lastRoomCode ?? null}, jackpot_players.last_room_code),
        updated_at = ${now}
    RETURNING player_id, nickname, last_room_code, created_at, updated_at
  `;
  const r = rows[0];
  return {
    playerId: r.player_id,
    nickname: r.nickname,
    lastRoomCode: r.last_room_code,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  if (!playerId) return null;
  await ensurePlayerTable();
  const rows = await sql!`
    SELECT player_id, nickname, last_room_code, created_at, updated_at
    FROM jackpot_players
    WHERE player_id = ${playerId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    playerId: r.player_id,
    nickname: r.nickname,
    lastRoomCode: r.last_room_code,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

async function ensureRoomTable(): Promise<void> {
  if (!sql) throw new Error("DATABASE_URL is missing. Add your Neon connection string to .env.local and Vercel environment variables.");
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql!`CREATE TABLE IF NOT EXISTS jackpot_rooms (
      code TEXT PRIMARY KEY,
      room_state JSONB NOT NULL,
      updated_at BIGINT NOT NULL
      )`;
    })();
  }
  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

async function readRoom(code: string, forceFresh = false): Promise<SharedRoom | null> {
  const clean = normalizeRoomCode(code);
  if (!forceFresh) {
    const cached = HOT_ROOM_CACHE.get(clean);
    if (cached && Date.now() - cached.cachedAt < 200) {
      return cached.room;
    }
  }
  await ensureRoomTable();
  const withHyphen = clean.startsWith("JKP") && !clean.includes("-") ? `JKP-${clean.slice(3)}` : clean;
  const withoutHyphen = clean.replace(/-/g, "");
  const rows = await sql!`SELECT room_state FROM jackpot_rooms WHERE code = ${clean} OR code = ${withHyphen} OR code = ${withoutHyphen} LIMIT 1`;
  const room = (rows[0]?.room_state as SharedRoom | undefined) ?? null;
  if (room) {
    HOT_ROOM_CACHE.set(clean, { room, cachedAt: Date.now() });
    HOT_ROOM_CACHE.set(normalizeRoomCode(room.code), { room, cachedAt: Date.now() });
  }
  return room;
}

/** Insert a new room or compare-and-swap an existing version to prevent lost updates. */
async function saveRoom(room: SharedRoom, expectedUpdatedAt?: number): Promise<boolean> {
  await ensureRoomTable();
  const clean = normalizeRoomCode(room.code);
  let saved = false;
  if (expectedUpdatedAt === undefined) {
    const rows = await sql!`INSERT INTO jackpot_rooms (code, room_state, updated_at)
      VALUES (${room.code}, ${JSON.stringify(room)}::jsonb, ${room.updatedAt})
      ON CONFLICT (code) DO NOTHING RETURNING code`;
    saved = rows.length === 1;
  } else {
    const rows = await sql!`UPDATE jackpot_rooms
      SET room_state = ${JSON.stringify(room)}::jsonb, updated_at = ${room.updatedAt}
      WHERE code = ${room.code} AND updated_at = ${expectedUpdatedAt}
      RETURNING code`;
    saved = rows.length === 1;
  }
  if (saved) {
    HOT_ROOM_CACHE.set(clean, { room, cachedAt: Date.now() });
    broadcastRoomUpdate(room);
  }
  return saved;
}

export async function getSharedRoom(code: string, forceFresh = false): Promise<SharedRoom | null> {
  let room = await readRoom(code.trim().toUpperCase(), forceFresh);
  if (room && !room.playerTokens) {
    const previous = room;
    room = {
      ...room,
      playerTokens: Object.fromEntries(room.players.map((player) => [player.id, createPlayerToken()])),
      tokenClaims: Object.fromEntries(room.players.map((player) => [player.id, false])),
      updatedAt: nextUpdatedAt(room),
    };
    if (!await saveRoom(room, previous.updatedAt)) room = await readRoom(previous.code, true);
  }
  // Replace rounds dealt by the previous setup with 100% real cards.
  if (room?.status === "table" && room.gameAuthoritative && room.gameSnapshot && room.dealVersion !== 7) {
    const previous = room;
    room = {
      ...room,
      gameSnapshot: createRoomMatch(room.players.map((player) => ({
        id: player.id,
        name: player.nickname,
        team: room!.teams?.[player.id] ?? "Alpha",
      }))),
      scores: room.scores ?? emptyScores(),
      result: null,
      dealVersion: 7,
      pendingSignalTruth: undefined,
      updatedAt: nextUpdatedAt(room),
    };
    if (!await saveRoom(room, previous.updatedAt)) room = await readRoom(previous.code, true);
  }
  if (room?.teamPhase === "confirmation" && room.confirmationEndsAt && Date.now() >= room.confirmationEndsAt) {
    const expired: SharedRoom = { ...room, teams: undefined, teamAcceptances: undefined, teamPhase: "assignment", teamNotice: "The 20-second team confirmation expired. The host can assign teams again.", confirmationEndsAt: undefined, updatedAt: nextUpdatedAt(room) };
    return await saveRoom(expired, room.updatedAt) ? expired : await readRoom(room.code, true);
  }
  if (room && room.teamPhase === "strategy") {
    const currentRoom = room;
    const timeExpired = Boolean(currentRoom.strategyEndsAt && Date.now() >= currentRoom.strategyEndsAt);
    const alphaPlayers = currentRoom.players.filter((p) => currentRoom.teams?.[p.id] === "Alpha");
    const bravoPlayers = currentRoom.players.filter((p) => currentRoom.teams?.[p.id] === "Bravo");
    const alphaLocked = alphaPlayers.length === 0 || Boolean(currentRoom.teamSignalLocked?.Alpha);
    const bravoLocked = bravoPlayers.length === 0 || Boolean(currentRoom.teamSignalLocked?.Bravo);
    if (timeExpired || (alphaLocked && bravoLocked)) {
      return await finishStrategy(currentRoom);
    }
  }

  // Active match player disconnect & 60-second grace period handling
  if (room && (room.status === "table" || room.teamPhase === "game" || room.teamPhase === "strategy")) {
    const now = Date.now();
    const currentRoom = room;
    const DISCONNECT_THRESHOLD_MS = 15_000;
    const disconnectedPlayer = currentRoom.players.find((p) => {
      const lastActive = p.lastSeen ?? p.joinedAt;
      return now - lastActive > DISCONNECT_THRESHOLD_MS;
    });

    if (disconnectedPlayer) {
      if (!currentRoom.matchInterruption) {
        const updated: SharedRoom = {
          ...currentRoom,
          matchInterruption: {
            type: "disconnected",
            playerId: disconnectedPlayer.id,
            playerName: disconnectedPlayer.nickname,
            message: `${disconnectedPlayer.nickname} lost connection. Match paused for 60 seconds to allow them to reconnect.`,
            deadline: now + 60_000,
            createdAt: now,
          },
          updatedAt: nextUpdatedAt(currentRoom),
        };
        if (await saveRoom(updated, currentRoom.updatedAt)) room = updated;
      } else if (currentRoom.matchInterruption.type === "disconnected" && currentRoom.matchInterruption.deadline && now >= currentRoom.matchInterruption.deadline) {
        const updated: SharedRoom = {
          ...currentRoom,
          matchInterruption: {
            type: "aborted",
            playerId: disconnectedPlayer.id,
            playerName: disconnectedPlayer.nickname,
            message: `${disconnectedPlayer.nickname} failed to reconnect within 60 seconds. A 4-player match cannot continue with a missing player.`,
            createdAt: now,
          },
          updatedAt: nextUpdatedAt(currentRoom),
        };
        if (await saveRoom(updated, currentRoom.updatedAt)) room = updated;
      }
    } else if (currentRoom.matchInterruption?.type === "disconnected") {
      const updated: SharedRoom = {
        ...currentRoom,
        matchInterruption: null,
        updatedAt: nextUpdatedAt(currentRoom),
      };
      if (await saveRoom(updated, currentRoom.updatedAt)) room = updated;
    }
  }
  if (room?.status === "lobby") {
    const now = Date.now();
    // Only clean up a room if it has been completely abandoned for over 2 hours
    const ROOM_ABANDON_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
    if (now - (room.updatedAt ?? room.players[0]?.joinedAt ?? 0) > ROOM_ABANDON_TIMEOUT_MS) {
      await deleteSharedRoom(room.code);
      return null;
    }

    // Guest disconnect pruning: only remove non-host guests after 5 minutes of no heartbeat.
    // The host is always kept and the room is NEVER deleted during the lobby waiting phase!
    const GUEST_DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const currentHostId = room.hostPlayerId;
    const activePlayers = room.players.filter((player) => {
      if (player.id === currentHostId) return true; // Host seat is always preserved
      const lastActive = player.lastSeen ?? player.joinedAt;
      return now - lastActive < GUEST_DISCONNECT_TIMEOUT_MS;
    });

    if (activePlayers.length < room.players.length) {
      const removed = room.players.filter((p) => !activePlayers.some((a) => a.id === p.id));
      const previous = room;
      room = {
        ...room,
        players: activePlayers,
        chat: [
          ...room.chat,
          ...removed.map((p) => ({
            id: `message-${crypto.randomUUID()}`,
            playerId: p.id,
            nickname: p.nickname,
            text: `${p.nickname} left the room.`,
            createdAt: now,
            system: true,
          })),
        ].slice(-100),
        updatedAt: nextUpdatedAt(room),
      };
      if (!await saveRoom(room, previous.updatedAt)) room = await readRoom(previous.code, true);
    }
  }
  return room;
}

/** Public room view with per-player card privacy enforced before serialization. */
export async function getSharedRoomView(code: string, playerId: string, token: string): Promise<SharedRoom | null> {
  const room = await getSharedRoom(code);
  if (!room) return null;
  const publicRoom = { ...room };
  delete publicRoom.teamSignals;
  delete publicRoom.pendingSignalTruth;
  delete publicRoom.teamChats;
  delete publicRoom.teamSignalBy;
  delete publicRoom.teamSignalAgreements;
  delete publicRoom.teamSignalLocked;
  delete publicRoom.playerTokens;
  delete publicRoom.tokenClaims;
  delete publicRoom.playerReactionAt;
  if (!room.gameSnapshot) return publicRoom;
  const authenticated = await isSharedPlayerAuthenticated(room.code, playerId, token);
  return {
    ...publicRoom,
    gameSnapshot: {
      ...room.gameSnapshot,
      players: room.gameSnapshot.players.map((player) => ({
        ...player,
        hand: authenticated && player.id === playerId
          ? player.hand
          : player.hand.map((_, index) => hiddenCard(player.id, index)),
      })),
      drawPile: room.gameSnapshot.drawPile.map((_, index) => hiddenCard("draw", index)),
    },
  };
}

export async function beginTeamAssignment(code: string, requesterId: string): Promise<TeamActionResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await getSharedRoom(code, true);
    if (!room) return { error: "This room is no longer available." };
    if (room.hostPlayerId !== requesterId) return { error: "Only the room host can assign teams." };
    if (room.status !== "lobby") return { error: "Team assignment is no longer available." };
    if (room.players.length < 4 || room.players.length % 2 !== 0) {
      return { error: "Join with an even number of at least four players to assign teams." };
    }
    const next = { ...room, teamPhase: "assignment" as const, updatedAt: nextUpdatedAt(room) };
    if (await saveRoom(next, room.updatedAt)) {
      return { room: next };
    }
    await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
  }
  return { error: "Room is busy updating. Please try again." };
}

export async function createSharedRoom(room: SharedRoom): Promise<boolean> {
  const code = room.code.trim().toUpperCase();
  const hostId = room.hostPlayerId;
  return saveRoom({
    ...room,
    code,
    gameAuthoritative: true,
    playerTokens: { [hostId]: createPlayerToken() },
    tokenClaims: { [hostId]: true },
    updatedAt: Date.now(),
  });
}

export async function isSharedPlayerAuthenticated(code: string, playerId: string, token: string): Promise<boolean> {
  const room = await getSharedRoom(code);
  return Boolean(room && playerId && token && room.playerTokens?.[playerId] === token);
}

export async function claimLegacyHostToken(code: string, hostId: string): Promise<string | null> {
  const room = await getSharedRoom(code);
  if (!room || room.hostPlayerId !== hostId || room.tokenClaims?.[hostId]) return null;
  const token = room.playerTokens?.[hostId];
  if (!token) return null;
  const updated = { ...room, tokenClaims: { ...room.tokenClaims, [hostId]: true }, updatedAt: nextUpdatedAt(room) };
  if (!await saveRoom(updated, room.updatedAt)) return null;
  return token;
}

export async function getSharedPlayerToken(code: string, playerId: string): Promise<string | null> {
  return (await getSharedRoom(code))?.playerTokens?.[playerId] ?? null;
}

export async function addSharedPlayer(
  code: string,
  player: LocalPlayer,
  token = "",
): Promise<{ room?: SharedRoom; token?: string; error?: string }> {
  player = { ...player, nickname: normalizePlayerName(player.nickname) };
  void savePlayerProfile(player.id, player.nickname, code).catch(() => {});

  for (let attempt = 0; attempt < 3; attempt++) {
    let room = await getSharedRoom(code, true);
    if (!room) return { error: "Room not found. Check the link or room code." };

    const existing = room.players.find((entry) => entry.id === player.id);
    if (existing) {
      let playerToken = room.playerTokens?.[player.id];
      if (!await isSharedPlayerAuthenticated(code, player.id, token)) {
        if (room.tokenClaims?.[player.id]) return { error: "This player seat is already signed in on another session." };
        playerToken = playerToken ?? createPlayerToken();
        const updated = { ...room, playerTokens: { ...room.playerTokens, [player.id]: playerToken }, tokenClaims: { ...room.tokenClaims, [player.id]: true }, updatedAt: nextUpdatedAt(room) };
        if (!await saveRoom(updated, room.updatedAt)) {
          await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
          continue;
        }
        room = updated;
      }
      if (existing.nickname === player.nickname) return { room: await getSharedRoom(code, true) ?? room, token: playerToken };
      const renamed = {
        ...room,
        players: room.players.map((entry) => entry.id === player.id ? { ...entry, nickname: player.nickname, lastSeen: Date.now() } : entry),
        updatedAt: nextUpdatedAt(room),
      };
      if (!await saveRoom(renamed, room.updatedAt)) {
        await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
        continue;
      }
      return { room: renamed, token: playerToken };
    }
    if (room.status !== "lobby" || (room.teamPhase && room.teamPhase !== "lobby")) return { error: "Team selection has started, so this room is closed to new players." };
    if (room.players.length >= room.maxPlayers) return { error: "This room is already full." };

    const playerToken = createPlayerToken();
    const next: SharedRoom = {
      ...room,
      players: [...room.players, { ...player, isAdmin: false, lastSeen: Date.now() }],
      playerTokens: { ...room.playerTokens, [player.id]: playerToken },
      tokenClaims: { ...room.tokenClaims, [player.id]: true },
      chat: [...room.chat, {
        id: `message-${crypto.randomUUID()}`,
        playerId: player.id,
        nickname: player.nickname,
        text: `${player.nickname} joined the room.`,
        createdAt: Date.now(),
        system: true,
      }].slice(-100),
      updatedAt: nextUpdatedAt(room),
    };
    if (await saveRoom(next, room.updatedAt)) {
      return { room: next, token: playerToken };
    }
    await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
  }
  return { error: "Room was updating simultaneously. Please tap join again." };
}

export async function deleteSharedRoom(code: string): Promise<boolean> {
  const clean = normalizeRoomCode(code);
  HOT_ROOM_CACHE.delete(clean);
  await ensureRoomTable();
  const withHyphen = clean.startsWith("JKP") && !clean.includes("-") ? `JKP-${clean.slice(3)}` : clean;
  const withoutHyphen = clean.replace(/-/g, "");
  await sql!`DELETE FROM jackpot_rooms WHERE code = ${clean} OR code = ${withHyphen} OR code = ${withoutHyphen}`;
  return true;
}

export async function touchSharedPlayerPresence(code: string, playerId: string): Promise<void> {
  if (!code || !playerId) return;
  const clean = normalizeRoomCode(code);
  const cached = HOT_ROOM_CACHE.get(clean);
  const room = cached?.room ?? (await readRoom(clean));
  if (!room) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;
  const now = Date.now();
  if (player.lastSeen && now - player.lastSeen < 10000) return;
  const updated: SharedRoom = {
    ...room,
    players: room.players.map((p) => p.id === playerId ? { ...p, lastSeen: now } : p),
    updatedAt: room.status === "table" ? room.updatedAt : nextUpdatedAt(room),
  };
  HOT_ROOM_CACHE.set(clean, { room: updated, cachedAt: now });
  void saveRoom(updated, room.updatedAt).catch(() => {});
}

export async function removeSharedPlayer(code: string, playerId: string, isDeliberate = true): Promise<{ success: boolean; error?: string }> {
  const cleanCode = code.trim().toUpperCase();
  const room = await getSharedRoom(cleanCode);
  if (!room) return { success: false, error: "Room not found." };
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { success: true };

  const remaining = room.players.filter((p) => p.id !== playerId);
  if (remaining.length === 0) {
    await deleteSharedRoom(cleanCode);
    return { success: true };
  }

  const nextHost = room.hostPlayerId === playerId
    ? [...remaining].sort((a, b) => a.joinedAt - b.joinedAt)[0].id
    : remaining.some((p) => p.id === room.hostPlayerId) ? room.hostPlayerId : remaining[0].id;

  const now = Date.now();
  const nextTeams = room.teams ? { ...room.teams } : undefined;
  if (nextTeams) delete nextTeams[playerId];

  const nextAcceptances = room.teamAcceptances ? { ...room.teamAcceptances } : undefined;
  if (nextAcceptances) delete nextAcceptances[playerId];

  const isMatchActive = room.status === "table" || room.teamPhase === "game" || room.teamPhase === "strategy";
  const incompletePlayers = remaining.length < 4;

  let matchInterruption = room.matchInterruption;
  if (isMatchActive && incompletePlayers) {
    matchInterruption = {
      type: isDeliberate ? "deliberate_exit" : "disconnected",
      playerId: player.id,
      playerName: player.nickname,
      message: isDeliberate
        ? `${player.nickname} ended their session and left the match. Jackpot requires 4 active players (2 vs 2) and cannot continue with a missing player.`
        : `${player.nickname} lost connection. Match paused for 60 seconds to allow them to reconnect.`,
      deadline: isDeliberate ? undefined : now + 60_000,
      createdAt: now,
    };
  }

  const updated: SharedRoom = {
    ...room,
    hostPlayerId: nextHost,
    players: remaining.map((p) => ({ ...p, isAdmin: p.id === nextHost })),
    teams: nextTeams,
    teamAcceptances: nextAcceptances,
    teamPhase: (room.teamPhase === "assignment" || room.teamPhase === "confirmation") && remaining.length < 4
      ? "lobby"
      : room.teamPhase,
    matchInterruption,
    chat: [
      ...room.chat,
      {
        id: `message-${crypto.randomUUID()}`,
        playerId,
        nickname: player.nickname,
        text: `${player.nickname} left the room.`,
        createdAt: now,
        system: true,
      },
    ].slice(-100),
    updatedAt: nextUpdatedAt(room),
  };

  const saved = await saveRoom(updated, room.updatedAt);
  return { success: saved };
}

export async function returnSharedRoomToLobby(code: string, requesterId: string): Promise<{ room?: SharedRoom; error?: string }> {
  const cleanCode = code.trim().toUpperCase();
  const room = await getSharedRoom(cleanCode);
  if (!room) return { error: "Room not found." };
  const player = room.players.find((p) => p.id === requesterId);
  if (!player) return { error: "Your player seat is not in this room." };
  const now = Date.now();
  const updated: SharedRoom = {
    ...room,
    status: "lobby",
    teamPhase: "lobby",
    gameSnapshot: null,
    teams: undefined,
    teamAcceptances: undefined,
    teamNotice: undefined,
    teamSignals: undefined,
    teamSignalLocked: undefined,
    teamSignalAgreements: undefined,
    teamSignalBy: undefined,
    confirmationEndsAt: undefined,
    strategyEndsAt: undefined,
    matchInterruption: null,
    chat: [
      ...room.chat,
      {
        id: `message-${crypto.randomUUID()}`,
        playerId: requesterId,
        nickname: player.nickname,
        text: `Match ended. Returned to lobby.`,
        createdAt: now,
        system: true,
      },
    ].slice(-100),
    updatedAt: nextUpdatedAt(room),
  };
  const saved = await saveRoom(updated, room.updatedAt);
  if (!saved) return { error: "Could not update room state." };
  return { room: updated };
}

/** Update the guest's display name in the current shared room. */
export async function renameSharedPlayer(code: string, playerId: string, nickname: string): Promise<{ room?: SharedRoom; error?: string }> {
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  const cleanName = normalizePlayerName(nickname);
  if (!room.players.some((player) => player.id === playerId)) return { error: "Your player seat is not in this room." };
  const next: SharedRoom = {
    ...room,
    players: room.players.map((player) => player.id === playerId ? { ...player, nickname: cleanName } : player),
    gameSnapshot: room.gameSnapshot ? {
      ...room.gameSnapshot,
      players: room.gameSnapshot.players.map((player) => player.id === playerId ? { ...player, name: cleanName } : player),
    } : room.gameSnapshot,
    updatedAt: nextUpdatedAt(room),
  };
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next };
}

export async function addSharedMessage(
  code: string,
  playerId: string,
  text: string,
): Promise<{ room?: SharedRoom; error?: string }> {
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  const sender = room.players.find((player) => player.id === playerId);
  if (!sender) return { error: "Join this room before sending a message." };

  const message: LocalChatMessage = {
    id: `message-${crypto.randomUUID()}`,
    playerId,
    nickname: sender.nickname,
    text: text.trim().slice(0, 280),
    createdAt: Date.now(),
  };
  if (!message.text) return { error: "Write a message first." };

  const next = { ...room, chat: [...room.chat, message].slice(-100), updatedAt: nextUpdatedAt(room) };
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next };
}

export type TeamActionResult = { room?: SharedRoom; error?: string };

/** Only the host can publish a complete, balanced assignment. */
export async function assignSharedTeams(
  code: string,
  requesterId: string,
  assignments: Record<string, "Alpha" | "Bravo">,
  shuffle = false,
): Promise<TeamActionResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await getSharedRoom(code, true);
    if (!room) return { error: "This room is no longer available." };
    if (room.hostPlayerId !== requesterId) return { error: "Only the room host can assign teams." };
    if (room.teamPhase !== "assignment") return { error: "Open team assignment before submitting teams." };
    if (room.status !== "lobby" || room.players.length < 4 || room.players.length % 2 !== 0) {
      return { error: "Teams need an even number of at least four players." };
    }

    const playerIds = room.players.map((player) => player.id);
    let teams = assignments;
    if (shuffle) {
      const shuffled = [...playerIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      teams = Object.fromEntries(shuffled.map((id, index) => [id, index < shuffled.length / 2 ? "Alpha" : "Bravo"]));
    }
    const balanced = playerIds.length / 2;
    if (playerIds.some((id) => teams[id] !== "Alpha" && teams[id] !== "Bravo") ||
        Object.keys(teams).length !== playerIds.length ||
        playerIds.filter((id) => teams[id] === "Alpha").length !== balanced) {
      return { error: "Place every player into balanced teams before continuing." };
    }

    const now = nextUpdatedAt(room);
    const next: SharedRoom = {
      ...room,
      teams: { ...teams },
      teamAcceptances: Object.fromEntries(playerIds.map((id) => [id, false])),
      teamPhase: "confirmation",
      teamNotice: undefined,
      confirmationEndsAt: now + 20_000,
      updatedAt: now,
    };
    if (await saveRoom(next, room.updatedAt)) {
      return { room: next };
    }
    await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
  }
  return { error: "Room changed just now. Please try again." };
}

export async function respondToTeamAssignment(code: string, playerId: string, accept: boolean): Promise<TeamActionResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await getSharedRoom(code, true);
    if (!room) return { error: "This room is no longer available." };
    if (room.teamPhase !== "confirmation" || !room.teams?.[playerId]) return { error: "Team confirmation is no longer active." };
    if (room.confirmationEndsAt && Date.now() >= room.confirmationEndsAt) return { error: "The team confirmation has expired." };
    if (!accept) {
      const next: SharedRoom = { ...room, teams: undefined, teamAcceptances: undefined, teamPhase: "assignment", teamNotice: "A player rejected the team assignment. Adjust the teams and confirm again.", confirmationEndsAt: undefined, updatedAt: nextUpdatedAt(room) };
      if (await saveRoom(next, room.updatedAt)) {
        return { room: next };
      }
      await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
      continue;
    }
    if (room.teamAcceptances?.[playerId]) return { room };
    const acceptances = { ...room.teamAcceptances, [playerId]: true };
    const allAccepted = room.players.every((player) => acceptances[player.id]);
    const now = nextUpdatedAt(room);
    const next: SharedRoom = {
      ...room,
      teamAcceptances: acceptances,
      teamPhase: allAccepted ? "strategy" : "confirmation",
      status: allAccepted ? "strategy" : room.status,
      strategyEndsAt: allAccepted ? now + 60_000 : room.strategyEndsAt,
      teamChats: allAccepted ? { Alpha: [], Bravo: [] } : room.teamChats,
      teamSignalBy: allAccepted ? {} : room.teamSignalBy,
      teamSignalAgreements: allAccepted ? {} : room.teamSignalAgreements,
      teamSignalLocked: allAccepted ? {} : room.teamSignalLocked,
      confirmationEndsAt: allAccepted ? undefined : room.confirmationEndsAt,
      updatedAt: now,
    };
    if (await saveRoom(next, room.updatedAt)) {
      return { room: next };
    }
    await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
  }
  return { error: "Room changed just now. Please try again." };
}

export async function getPrivateTeamRoom(code: string, playerId: string): Promise<{
  team?: "Alpha" | "Bravo";
  signal?: string;
  selectedBy?: string;
  agreements?: Record<string, boolean>;
  locked?: boolean;
  otherTeamLocked?: boolean;
  allTeamsLocked?: boolean;
  teammates?: Array<Pick<LocalPlayer, "id" | "nickname">>;
  chat?: LocalChatMessage[];
  endsAt?: number;
  phase?: SharedRoom["teamPhase"];
  status?: SharedRoom["status"];
  error?: string;
}> {
  let room = await getSharedRoom(code, true);
  if (!room) return { error: "This room is no longer available." };
  if (room.status === "strategy" && room.strategyEndsAt && Date.now() >= room.strategyEndsAt) {
    room = await finishStrategy(room);
  }
  const team = room.teams?.[playerId];
  if (!team) return { error: "Your seat is not part of this team room." };
  const otherTeam: "Alpha" | "Bravo" = team === "Alpha" ? "Bravo" : "Alpha";
  const locked = Boolean(room.teamSignalLocked?.[team]);
  const otherPlayers = room.players.filter((player) => room.teams?.[player.id] === otherTeam);
  const otherTeamLocked = otherPlayers.length === 0 || Boolean(room.teamSignalLocked?.[otherTeam]);
  const allTeamsLocked = locked && otherTeamLocked;
  return {
    team,
    signal: room.teamSignals?.[team],
    selectedBy: room.teamSignalBy?.[team],
    agreements: room.teamSignalAgreements?.[team] ?? {},
    locked,
    otherTeamLocked,
    allTeamsLocked,
    teammates: room.players.filter((player) => room.teams?.[player.id] === team).map(({ id, nickname }) => ({ id, nickname })),
    chat: room.teamChats?.[team] ?? [],
    endsAt: room.strategyEndsAt,
    phase: room.teamPhase,
    status: room.status,
  };
}

export async function updatePrivateTeamRoom(code: string, playerId: string, input: { signal?: unknown; agree?: unknown; text?: unknown }): Promise<{ error?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await getSharedRoom(code, true);
    if (!room) return { error: "This room is no longer available." };
    if (room.status !== "strategy" || (room.strategyEndsAt && Date.now() >= room.strategyEndsAt)) {
      if (room.status === "strategy") {
        await finishStrategy(room);
      }
      return { error: "Team strategy has ended." };
    }
    const team = room.teams?.[playerId];
    const sender = room.players.find((player) => player.id === playerId);
    if (!team || !sender) return { error: "Join this room before sending team updates." };
    const next: SharedRoom = { ...room, teamSignals: { ...room.teamSignals }, teamChats: { ...room.teamChats }, updatedAt: nextUpdatedAt(room) };
    if (input.signal !== undefined) {
      const allowed = ALL_SIGNAL_IDS;
      if (typeof input.signal !== "string" || !allowed.includes(input.signal)) return { error: "Choose a signal from the signal library." };
      if (room.teamSignalLocked?.[team]) return { error: "Your team has already agreed and locked its signal." };
      if (room.teamSignals?.[team] !== input.signal) {
        const teammates = room.players.filter((player) => room.teams?.[player.id] === team);
        next.teamSignalAgreements = { ...room.teamSignalAgreements, [team]: Object.fromEntries(teammates.map((player) => [player.id, false])) };
        next.teamSignalBy = { ...room.teamSignalBy, [team]: playerId };
      }
      next.teamSignals![team] = input.signal;
    }
    if (input.agree === true) {
      if (!room.teamSignals?.[team]) return { error: "Choose a shared signal before agreeing." };
      if (room.teamSignalLocked?.[team]) return {};
      const agreements = { ...(room.teamSignalAgreements?.[team] ?? {}), [playerId]: true };
      next.teamSignalAgreements = { ...room.teamSignalAgreements, [team]: agreements };
      const teammates = room.players.filter((player) => room.teams?.[player.id] === team);
      if (teammates.every((player) => agreements[player.id])) {
        next.teamSignalLocked = { ...room.teamSignalLocked, [team]: true };
        const otherTeam: "Alpha" | "Bravo" = team === "Alpha" ? "Bravo" : "Alpha";
        const otherPlayers = room.players.filter((player) => room.teams?.[player.id] === otherTeam);
        const otherTeamIsReady = otherPlayers.length === 0 || Boolean(next.teamSignalLocked?.[otherTeam]);
        if (otherTeamIsReady) {
          await finishStrategy(next);
          return {};
        }
      }
    }
    if (input.text !== undefined) {
      if (typeof input.text !== "string" || !input.text.trim()) return { error: "Write a team message first." };
      const chat = next.teamChats![team] ?? [];
      next.teamChats![team] = [...chat, { id: `message-${crypto.randomUUID()}`, playerId, nickname: sender.nickname, text: input.text.trim().slice(0, 280), createdAt: Date.now() }].slice(-100);
    }
    if (await saveRoom(next, room.updatedAt)) {
      return {};
    }
    await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
  }
  return { error: "Room changed just now. Please try again." };
}

async function finishStrategy(room: SharedRoom): Promise<SharedRoom> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = attempt === 0 ? room : (await getSharedRoom(room.code, true) ?? room);
    if (current.status === "table" && current.gameSnapshot) return current;
    const signals = { ...current.teamSignals };
    for (const team of ["Alpha", "Bravo"] as const) signals[team] ??= "wave";
    const next: SharedRoom = {
      ...current,
      teamSignals: signals,
      teamSignalLocked: { ...current.teamSignalLocked, Alpha: true, Bravo: true },
      teamPhase: "game",
      status: "table",
      gameSnapshot: createRoomMatch(current.players.map((player) => ({
        id: player.id,
        name: player.nickname,
        team: current.teams?.[player.id] ?? "Alpha",
      }))),
      dealVersion: 7,
      scores: current.scores ?? emptyScores(),
      suspectAttemptsRemaining: { Alpha: SUSPECT_ATTEMPTS_PER_TEAM, Bravo: SUSPECT_ATTEMPTS_PER_TEAM },
      round: current.round ?? 1,
      result: null,
      gameAuthoritative: true,
      updatedAt: nextUpdatedAt(current),
    };
    if (await saveRoom(next, current.updatedAt)) {
      return next;
    }
    await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
  }
  return (await readRoom(room.code, true)) ?? room;
}

export type SharedGameAction = { type: "pass"; playerId: string; cardId: string } | { type: "reaction"; playerId: string; reactionId: string } | { type: "jackpot" | "suspect" | "signal" | "fake-signal"; playerId: string };

export async function performSharedGameAction(code: string, action: SharedGameAction): Promise<{ room?: SharedRoom; error?: string; notice?: string; suspectAttemptsRemaining?: SharedRoom["suspectAttemptsRemaining"] }> {
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const room = await getSharedRoom(code);
    if (!room || room.status !== "table" || !room.gameSnapshot) return { error: "The game table is not active." };
    if (!room.players.some((player) => player.id === action.playerId)) return { error: "Your player session is not in this room." };
    let game = room.gameSnapshot;
    let scores = room.scores ?? emptyScores();
    let result = room.result ?? null;
    const suspectAttemptsRemaining: Record<"Alpha" | "Bravo", number> = {
      Alpha: room.suspectAttemptsRemaining?.Alpha ?? SUSPECT_ATTEMPTS_PER_TEAM,
      Bravo: room.suspectAttemptsRemaining?.Bravo ?? SUSPECT_ATTEMPTS_PER_TEAM,
    };
    let notice = "";

    try {
      if (action.type === "pass") {
        game = passCard(game, action.playerId, action.cardId);
      } else if (action.type === "jackpot") {
        result = resolveJackpot(game, action.playerId);
        scores = applyRoundScore(scores, result);
      } else if (action.type === "suspect") {
        const caller = game.players.find((player) => player.id === action.playerId);
        if (!caller) return { error: "Your player session is not in this game." };
        if (caller.team !== "Alpha" && caller.team !== "Bravo") return { error: "SUSPECT is not configured for this team." };
        if ((suspectAttemptsRemaining[caller.team] ?? 0) <= 0) return { error: "Your team has used all three SUSPECT calls this round." };
        result = resolveSuspect(game, action.playerId);
        suspectAttemptsRemaining[caller.team] = (suspectAttemptsRemaining[caller.team] ?? 0) - 1;
        const signalTruth = room.pendingSignalTruth;
        const authenticity = signalTruth ? (signalTruth.isFake ? "The flashed signal was fake." : "The flashed signal was genuine.") : "";
        const outcomeMessage = result.valid
          ? `${caller.name} called SUSPECT correctly: an opposing player had four of a kind.`
          : `${caller.name} called SUSPECT, but it was a false alarm: no opposing player had four of a kind.`;
        const publicNotice = {
          id: `notice-${crypto.randomUUID()}`,
          kind: result.valid ? "success" as const : "warning" as const,
          title: result.valid ? "SUSPECT CORRECT" : "FALSE SUSPECT — FALSE ALARM",
          message: [outcomeMessage, authenticity, `${suspectAttemptsRemaining[caller.team]} team calls remain.`].filter(Boolean).join(" "),
          createdAt: Date.now(),
          ...(signalTruth ? { relatedSignalId: game.publicSignals?.at(-1)?.id } : {}),
        };
        game = {
          ...game,
          publicNotices: [...(game.publicNotices ?? []), publicNotice].slice(-20),
          log: [publicNotice.message, ...game.log].slice(0, 40),
        };
        room.pendingSignalTruth = undefined;
        if (result.valid) scores = applyRoundScore(scores, result);
        else {
          notice = `FALSE SUSPECT — ${suspectAttemptsRemaining[caller.team]} team calls remain.`;
          game = { ...game, log: [`${result.detail} ${suspectAttemptsRemaining[caller.team]} SUSPECT calls remain.`, ...game.log].slice(0, 40) };
        }
      } else if (action.type === "reaction") {
        const actor = game.players.find((player) => player.id === action.playerId);
        const reactionIds = ["laugh", "cry", "eyes", "fire", "shock", "clap", "wow", "saw-that"];
        if (!actor) return { error: "Your player session is not in this game." };
        if (!reactionIds.includes(action.reactionId)) return { error: "Choose a reaction from the reaction bar." };
        const lastReactionAt = room.playerReactionAt?.[actor.id] ?? 0;
        if (Date.now() - lastReactionAt < 700) return { error: "Give your last reaction a moment before sending another." };
        const event = { id: `reaction-${crypto.randomUUID()}`, playerId: actor.id, playerName: actor.name, reactionId: action.reactionId, createdAt: Date.now() };
        game = { ...game, publicReactions: [...(game.publicReactions ?? []), event].slice(-20) };
        notice = `${actor.name} reacted.`;
        room.playerReactionAt = { ...room.playerReactionAt, [actor.id]: event.createdAt };
      } else {
        const actor = game.players.find((player) => player.id === action.playerId);
        if (!actor) return { error: "Your player session is not in this game." };
        if (actor.team !== "Alpha" && actor.team !== "Bravo") return { error: "Signals are not configured for this team." };
        const teamSignal = room.teamSignals?.[actor.team] ?? "tap-table";
        const signalIds = ALL_SIGNAL_IDS;
        const decoys = signalIds.filter((signal) => signal !== teamSignal);
        const signalId = action.type === "fake-signal" ? decoys[randomInt(decoys.length)] : teamSignal;
        const createdAt = Date.now();
        const isFake = action.type === "fake-signal";
        const event = { id: `signal-${crypto.randomUUID()}`, playerId: actor.id, playerName: actor.name, signalId, createdAt, expiresAt: createdAt + SIGNAL_DECISION_WINDOW_MS };
        room.pendingSignalTruth = { signalId, playerId: actor.id, playerName: actor.name, isFake, createdAt };
        game = {
          ...game,
          publicSignals: [...(game.publicSignals ?? []), event].slice(-20),
          log: [`${actor.name} flashed a ${signalId} signal.`, ...game.log].slice(0, 40),
        };
        notice = action.type === "fake-signal"
          ? `Fake ${signalId} signal flashed.`
          : `Your ${signalId} team signal was flashed.`;
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "That game action is no longer available." };
    }

    const resolved = action.type === "jackpot" || (action.type === "suspect" && Boolean(result?.valid));
    const next: SharedRoom = {
      ...room,
      gameSnapshot: game,
      scores,
      suspectAttemptsRemaining,
      result: resolved ? result : null,
      status: resolved ? "result" : "table",
      teamPhase: resolved ? "result" : "game",
      updatedAt: nextUpdatedAt(room),
    };
    const saved = await saveRoom(next, room.updatedAt);
    if (saved) {
      return {
        room: next,
        notice: notice || (result ? `${result.title}: ${result.detail}` : ""),
        suspectAttemptsRemaining,
      };
    }
    // Concurrency conflict occurred (e.g. heartbeat or concurrent poll).
    // Wait briefly with random jitter and re-apply on the latest room state.
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 35));
    }
  }
  return { error: "Room changed just now; please try again." };
}

export async function startNextSharedRound(code: string, requesterId: string): Promise<{ room?: SharedRoom; error?: string }> {
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  if (room.hostPlayerId !== requesterId) return { error: "Only the room host can start the next round." };
  const now = nextUpdatedAt(room);
  const nextRoundNumber = (room.round ?? 1) + 1;
  const next: SharedRoom = {
    ...room,
    status: "strategy",
    teamPhase: "strategy",
    strategyEndsAt: now + 60_000,
    teamSignals: {},
    teamSignalBy: {},
    teamSignalAgreements: {},
    teamSignalLocked: {},
    teamChats: { Alpha: [], Bravo: [] },
    gameSnapshot: null,
    scores: room.scores ?? emptyScores(),
    suspectAttemptsRemaining: { Alpha: SUSPECT_ATTEMPTS_PER_TEAM, Bravo: SUSPECT_ATTEMPTS_PER_TEAM },
    round: nextRoundNumber,
    result: null,
    pendingSignalTruth: undefined,
    matchInterruption: null,
    chat: [
      ...room.chat,
      {
        id: `message-${crypto.randomUUID()}`,
        playerId: requesterId,
        nickname: "System",
        text: `Round ${nextRoundNumber} initiated! Teams have 60 seconds in their private room to choose or change secret signals.`,
        createdAt: now,
        system: true,
      },
    ].slice(-100),
    updatedAt: now,
  };
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next };
}

export async function rematchSharedMatch(code: string, requesterId: string): Promise<{ room?: SharedRoom; error?: string }> {
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  if (room.hostPlayerId !== requesterId) return { error: "Only the room host can start a rematch." };
  const now = nextUpdatedAt(room);
  const next: SharedRoom = {
    ...room,
    status: "strategy",
    teamPhase: "strategy",
    strategyEndsAt: now + 60_000,
    teamSignals: {},
    teamSignalBy: {},
    teamSignalAgreements: {},
    teamSignalLocked: {},
    teamChats: { Alpha: [], Bravo: [] },
    gameSnapshot: null,
    dealVersion: (room.dealVersion ?? 5) + 1,
    scores: emptyScores(),
    suspectAttemptsRemaining: { Alpha: SUSPECT_ATTEMPTS_PER_TEAM, Bravo: SUSPECT_ATTEMPTS_PER_TEAM },
    round: 1,
    result: null,
    pendingSignalTruth: undefined,
    matchInterruption: null,
    chat: [
      ...room.chat,
      {
        id: `message-${crypto.randomUUID()}`,
        playerId: requesterId,
        nickname: "System",
        text: `New match started! Teams have 60 seconds in their private room to choose secret signals for Round 1.`,
        createdAt: now,
        system: true,
      },
    ].slice(-100),
    updatedAt: now,
  };
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next };
}

export async function restartSharedMatch(code: string, requesterId: string): Promise<{ room?: SharedRoom; error?: string }> {
  return startNextSharedRound(code, requesterId);
}

function hiddenCard(ownerId: string, index: number): JackpotCard {
  return { id: `hidden-${ownerId}-${index}`, suit: "circle" as Suit, isPlaceholder: true };
}

function createPlayerToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
}

function randomInt(max: number): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}

/** A monotonic room revision prevents fast successive actions being dropped by clients. */
function nextUpdatedAt(room: SharedRoom): number {
  return Math.max(Date.now(), room.updatedAt + 1);
}

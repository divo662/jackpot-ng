import type { GameSnapshot, RoundResult, ScoreBoard } from "@/lib/game";

export const SESSION_STORAGE_KEY = "jackpot:session:v1";
export const ROOMS_STORAGE_KEY = "jackpot:rooms:v1";
export const MAX_PLAYER_NAME_LENGTH = 18;

export function normalizePlayerName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, MAX_PLAYER_NAME_LENGTH) || "Player";
}

export type LocalRoomStatus = "lobby" | "strategy" | "table" | "result" | "ended";

export type LocalPlayer = {
  id: string;
  nickname: string;
  isAdmin: boolean;
  isReady: boolean;
  joinedAt: number;
  lastSeen?: number;
};

export type LocalChatMessage = {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  createdAt: number;
  system?: boolean;
};

export type LocalRoom = {
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
  game: GameSnapshot | null;
  gameAuthoritative?: boolean;
  scores: ScoreBoard;
  round: number;
  result: RoundResult | null;
  suspectAttemptsRemaining?: Partial<Record<"Alpha" | "Bravo", number>>;
  matchInterruption?: {
    type: "deliberate_exit" | "disconnected" | "aborted";
    playerId: string;
    playerName: string;
    message: string;
    deadline?: number;
    createdAt: number;
  } | null;
  updatedAt: number;
};

export type LocalSession = {
  playerId: string;
  nickname: string;
  roomCode: string | null;
  updatedAt: number;
};

function makeId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "").slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${random}`;
}

export function createPlayerId(): string {
  return makeId("player");
}

export function createRoomCode(existingCodes: string[] = []): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  do {
    const part = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    code = `JKP-${part}`;
  } while (existingCodes.includes(code));
  return code;
}

export function readSession(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalSession) : null;
  } catch {
    return null;
  }
}

export function writeSession(session: LocalSession): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function readRooms(): LocalRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ROOMS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalRoom[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((room): room is LocalRoom => Boolean(room && typeof room === "object" && typeof room.code === "string" && typeof room.id === "string"));
  } catch {
    return [];
  }
}

export function writeRooms(rooms: LocalRoom[]): void {
  window.localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(rooms));
}

export function saveRoom(room: LocalRoom): LocalRoom {
  const rooms = readRooms().filter((entry) => entry && entry.id !== room.id);
  const next = { ...room, updatedAt: Date.now() };
  writeRooms([...rooms, next]);
  return next;
}

export function findRoom(code?: string | null): LocalRoom | null {
  if (!code || typeof code !== "string") return null;
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean) return null;
  return readRooms().find((room) => typeof room?.code === "string" && room.code.replace(/[^A-Z0-9]/g, "") === clean) ?? null;
}

export function createRoomSession(
  nickname: string,
  isPrivate: boolean = true,
  maxPlayers: 4 | 6 | 8 = 4,
): { session: LocalSession; room: LocalRoom } {
  const playerId = createPlayerId();
  const existingCodes = readRooms().map((room) => room?.code).filter((c): c is string => typeof c === "string");
  const code = createRoomCode(existingCodes);
  const now = Date.now();
  const player: LocalPlayer = {
    id: playerId,
    nickname: normalizePlayerName(nickname),
    isAdmin: true,
    isReady: true,
    joinedAt: now,
  };
  const room: LocalRoom = {
    id: makeId("room"),
    code,
    isPrivate,
    maxPlayers,
    status: "lobby",
    hostPlayerId: playerId,
    players: [player],
    chat: [{
      id: makeId("message"),
      playerId,
      nickname: player.nickname,
      text: `${player.nickname} created the room.`,
      createdAt: now,
      system: true,
    }],
    game: null,
    scores: { Alpha: 0, Bravo: 0, Charlie: 0, Delta: 0 },
    round: 1,
    result: null,
    updatedAt: now,
  };
  saveRoom(room);
  const session = { playerId, nickname: player.nickname, roomCode: code, updatedAt: now };
  writeSession(session);
  return { session, room };
}

export function joinRoomSession(
  code: string,
  nickname: string,
): { session: LocalSession; room: LocalRoom } | { error: string } {
  const room = findRoom(code);
  if (!room) return { error: "Room not found. Check the code and try again." };

  const cleanNickname = normalizePlayerName(nickname);
  const savedSession = readSession();
  const existingPlayer = savedSession
    ? room.players.find((player) => player.id === savedSession.playerId)
    : undefined;

  // Reusing a room link from this browser reconnects the existing seat.
  if (existingPlayer && savedSession) {
    const nextRoom = existingPlayer.nickname === cleanNickname
      ? room
      : updateRoomForPlayer(room, existingPlayer.id, cleanNickname);
    const session = { ...savedSession, nickname: cleanNickname, roomCode: room.code, updatedAt: Date.now() };
    writeSession(session);
    return { session, room: nextRoom };
  }

  if (room.status !== "lobby") return { error: "This game has already started." };
  if (room.players.length >= room.maxPlayers) return { error: "This room is already full." };

  const playerId = createPlayerId();
  const now = Date.now();
  const player: LocalPlayer = {
    id: playerId,
    nickname: cleanNickname,
    isAdmin: false,
    isReady: true,
    joinedAt: now,
  };
  const nextRoom = saveRoom({
    ...room,
    players: [...room.players, player],
    chat: [...room.chat, {
      id: makeId("message"),
      playerId,
      nickname: cleanNickname,
      text: `${cleanNickname} joined the room.`,
      createdAt: now,
      system: true,
    }],
  });
  const session = { playerId, nickname: cleanNickname, roomCode: nextRoom.code, updatedAt: now };
  writeSession(session);
  return { session, room: nextRoom };
}
export function updateRoomForPlayer(room: LocalRoom, playerId: string, nickname: string): LocalRoom {
  const cleanNickname = normalizePlayerName(nickname);
  return saveRoom({
    ...room,
    players: room.players.map((player) => player.id === playerId ? { ...player, nickname: cleanNickname } : player),
  });
}

/** Remove this browser player from a saved room and hand host control to the
 * earliest remaining member. A room is deleted when its final member leaves. */
export function leaveRoomSession(code: string, playerId: string): LocalSession | null {
  const room = findRoom(code);
  let nextSession = readSession();

  if (room) {
    const remaining = room.players.filter((player) => player.id !== playerId);
    if (remaining.length === 0) {
      writeRooms(readRooms().filter((entry) => entry.id !== room.id));
    } else {
      const nextHost = room.hostPlayerId === playerId
        ? [...remaining].sort((a, b) => a.joinedAt - b.joinedAt)[0]
        : remaining.find((player) => player.id === room.hostPlayerId) ?? remaining[0];
      const now = Date.now();
      saveRoom({
        ...room,
        hostPlayerId: nextHost.id,
        players: remaining.map((player) => ({ ...player, isAdmin: player.id === nextHost.id })),
        chat: [...room.chat, {
          id: makeId("message"),
          playerId,
          nickname: room.players.find((player) => player.id === playerId)?.nickname ?? "A player",
          text: room.hostPlayerId === playerId
            ? `${nextHost.nickname} is now the room host.`
            : "A player left the room.",
          createdAt: now,
          system: true,
        }],
      });
    }
  }

  if (nextSession?.playerId === playerId) {
    nextSession = { ...nextSession, roomCode: null, updatedAt: Date.now() };
    writeSession(nextSession);
  }

  return nextSession;
}

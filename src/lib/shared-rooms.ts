import { normalizePlayerName, type LocalChatMessage, type LocalPlayer, type LocalRoomStatus } from "@/lib/session";
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
  playerTokens?: Record<string, string>;
  tokenClaims?: Record<string, boolean>;
  playerReactionAt?: Record<string, number>;
  updatedAt: number;
};

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let schemaReady: Promise<void> | null = null;

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

async function readRoom(code: string): Promise<SharedRoom | null> {
  await ensureRoomTable();
  const rows = await sql!`SELECT room_state FROM jackpot_rooms WHERE code = ${code}`;
  return (rows[0]?.room_state as SharedRoom | undefined) ?? null;
}

/** Insert a new room or compare-and-swap an existing version to prevent lost updates. */
async function saveRoom(room: SharedRoom, expectedUpdatedAt?: number): Promise<boolean> {
  await ensureRoomTable();
  if (expectedUpdatedAt === undefined) {
    const rows = await sql!`INSERT INTO jackpot_rooms (code, room_state, updated_at)
      VALUES (${room.code}, ${JSON.stringify(room)}::jsonb, ${room.updatedAt})
      ON CONFLICT (code) DO NOTHING RETURNING code`;
    return rows.length === 1;
  }
  const rows = await sql!`UPDATE jackpot_rooms
    SET room_state = ${JSON.stringify(room)}::jsonb, updated_at = ${room.updatedAt}
    WHERE code = ${room.code} AND updated_at = ${expectedUpdatedAt}
    RETURNING code`;
  return rows.length === 1;
}

export async function getSharedRoom(code: string): Promise<SharedRoom | null> {
  let room = await readRoom(code.trim().toUpperCase());
  if (room && !room.playerTokens) {
    const previous = room;
    room = {
      ...room,
      playerTokens: Object.fromEntries(room.players.map((player) => [player.id, createPlayerToken()])),
      tokenClaims: Object.fromEntries(room.players.map((player) => [player.id, false])),
      updatedAt: nextUpdatedAt(room),
    };
    if (!await saveRoom(room, previous.updatedAt)) room = await readRoom(previous.code);
  }
  // Replace rounds dealt by the previous biased setup with a fair randomized deal.
  if (room?.status === "table" && room.gameAuthoritative && room.gameSnapshot && room.dealVersion !== 5) {
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
      dealVersion: 5,
      pendingSignalTruth: undefined,
      updatedAt: nextUpdatedAt(room),
    };
    if (!await saveRoom(room, previous.updatedAt)) room = await readRoom(previous.code);
  }
  if (room?.teamPhase === "confirmation" && room.confirmationEndsAt && Date.now() >= room.confirmationEndsAt) {
    const expired: SharedRoom = { ...room, teams: undefined, teamAcceptances: undefined, teamPhase: "assignment", teamNotice: "The 20-second team confirmation expired. The host can assign teams again.", confirmationEndsAt: undefined, updatedAt: nextUpdatedAt(room) };
    return await saveRoom(expired, room.updatedAt) ? expired : await readRoom(room.code);
  }
  if (room?.teamPhase === "strategy" && room.strategyEndsAt && Date.now() >= room.strategyEndsAt) {
    return await finishStrategy(room);
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
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  if (room.hostPlayerId !== requesterId) return { error: "Only the room host can assign teams." };
  if (room.status !== "lobby") return { error: "Team assignment is no longer available." };
  if (room.players.length < 4 || room.players.length % 2 !== 0) return { error: "Join with an even number of at least four players to assign teams." };
  const next = { ...room, teamPhase: "assignment" as const, updatedAt: nextUpdatedAt(room) };
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next };
}

export async function createSharedRoom(room: SharedRoom): Promise<boolean> {
  const code = room.code.trim().toUpperCase();
  const hostId = room.hostPlayerId;
  return saveRoom({
    ...room,
    code,
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
  let room = await getSharedRoom(code);
  if (!room) return { error: "Room not found. Check the link or room code." };

  const existing = room.players.find((entry) => entry.id === player.id);
  if (existing) {
    let playerToken = room.playerTokens?.[player.id];
    if (!await isSharedPlayerAuthenticated(code, player.id, token)) {
      if (room.tokenClaims?.[player.id]) return { error: "This player seat is already signed in on another session." };
      playerToken = playerToken ?? createPlayerToken();
      const updated = { ...room, playerTokens: { ...room.playerTokens, [player.id]: playerToken }, tokenClaims: { ...room.tokenClaims, [player.id]: true }, updatedAt: nextUpdatedAt(room) };
      if (!await saveRoom(updated, room.updatedAt)) return { error: "Room changed just now. Please try again." };
      room = updated;
    }
    if (existing.nickname === player.nickname) return { room: await getSharedRoom(code) ?? room, token: playerToken };
    const renamed = {
      ...room,
      players: room.players.map((entry) => entry.id === player.id ? { ...entry, nickname: player.nickname } : entry),
      updatedAt: nextUpdatedAt(room),
    };
    if (!await saveRoom(renamed, room.updatedAt)) return { error: "Room changed just now. Please try again." };
    return { room: renamed, token: playerToken };
  }
  if (room.status !== "lobby" || (room.teamPhase && room.teamPhase !== "lobby")) return { error: "Team selection has started, so this room is closed to new players." };
  if (room.players.length >= room.maxPlayers) return { error: "This room is already full." };

  const next: SharedRoom = {
    ...room,
    players: [...room.players, { ...player, isAdmin: false }],
    playerTokens: { ...room.playerTokens, [player.id]: createPlayerToken() },
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
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next, token: next.playerTokens?.[player.id] };
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
  const room = await getSharedRoom(code);
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
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next };
}

export async function respondToTeamAssignment(code: string, playerId: string, accept: boolean): Promise<TeamActionResult> {
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  if (room.teamPhase !== "confirmation" || !room.teams?.[playerId]) return { error: "Team confirmation is no longer active." };
  if (room.confirmationEndsAt && Date.now() >= room.confirmationEndsAt) return { error: "The team confirmation has expired." };
  if (!accept) {
    const next: SharedRoom = { ...room, teams: undefined, teamAcceptances: undefined, teamPhase: "assignment", teamNotice: "A player rejected the team assignment. Adjust the teams and confirm again.", confirmationEndsAt: undefined, updatedAt: nextUpdatedAt(room) };
    if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
    return { room: next };
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
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next };
}

export async function getPrivateTeamRoom(code: string, playerId: string): Promise<{ team?: "Alpha" | "Bravo"; signal?: string; selectedBy?: string; agreements?: Record<string, boolean>; locked?: boolean; teammates?: Array<Pick<LocalPlayer, "id" | "nickname">>; chat?: LocalChatMessage[]; endsAt?: number; error?: string }> {
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  const team = room.teams?.[playerId];
  if (!team) return { error: "Your seat is not part of this team room." };
  return {
    team,
    signal: room.teamSignals?.[team],
    selectedBy: room.teamSignalBy?.[team],
    agreements: room.teamSignalAgreements?.[team] ?? {},
    locked: room.teamSignalLocked?.[team] ?? false,
    teammates: room.players.filter((player) => room.teams?.[player.id] === team).map(({ id, nickname }) => ({ id, nickname })),
    chat: room.teamChats?.[team] ?? [],
    endsAt: room.strategyEndsAt,
  };
}

export async function updatePrivateTeamRoom(code: string, playerId: string, input: { signal?: unknown; agree?: unknown; text?: unknown }): Promise<{ error?: string }> {
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  if (room.status !== "strategy" || (room.strategyEndsAt && Date.now() >= room.strategyEndsAt)) return { error: "Team strategy has ended." };
  const team = room.teams?.[playerId];
  const sender = room.players.find((player) => player.id === playerId);
  if (!team || !sender) return { error: "Join this room before sending team updates." };
  const next: SharedRoom = { ...room, teamSignals: { ...room.teamSignals }, teamChats: { ...room.teamChats }, updatedAt: nextUpdatedAt(room) };
  if (input.signal !== undefined) {
    const allowed = ["wave", "clap", "jump", "crouch", "spin", "point", "salute", "nod", "flash", "dance"];
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
    if (teammates.every((player) => agreements[player.id])) next.teamSignalLocked = { ...room.teamSignalLocked, [team]: true };
  }
  if (input.text !== undefined) {
    if (typeof input.text !== "string" || !input.text.trim()) return { error: "Write a team message first." };
    const chat = next.teamChats![team] ?? [];
    next.teamChats![team] = [...chat, { id: `message-${crypto.randomUUID()}`, playerId, nickname: sender.nickname, text: input.text.trim().slice(0, 280), createdAt: Date.now() }].slice(-100);
  }
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return {};
}

async function finishStrategy(room: SharedRoom): Promise<SharedRoom> {
  const signals = { ...room.teamSignals };
  for (const team of ["Alpha", "Bravo"] as const) signals[team] ??= "wave";
  const next: SharedRoom = {
    ...room,
    teamSignals: signals,
    teamSignalLocked: { ...room.teamSignalLocked, Alpha: true, Bravo: true },
    teamPhase: "game",
    status: "table",
    gameSnapshot: createRoomMatch(room.players.map((player) => ({
      id: player.id,
      name: player.nickname,
      team: room.teams?.[player.id] ?? "Alpha",
    }))),
    dealVersion: 5,
    scores: room.scores ?? emptyScores(),
    suspectAttemptsRemaining: { Alpha: SUSPECT_ATTEMPTS_PER_TEAM, Bravo: SUSPECT_ATTEMPTS_PER_TEAM },
    round: room.round ?? 1,
    result: null,
    gameAuthoritative: true,
    updatedAt: nextUpdatedAt(room),
  };
  return await saveRoom(next, room.updatedAt) ? next : (await readRoom(room.code) ?? next);
}

export type SharedGameAction = { type: "pass"; playerId: string; cardId: string } | { type: "reaction"; playerId: string; reactionId: string } | { type: "jackpot" | "suspect" | "signal" | "fake-signal"; playerId: string };

export async function performSharedGameAction(code: string, action: SharedGameAction): Promise<{ room?: SharedRoom; error?: string; notice?: string; suspectAttemptsRemaining?: SharedRoom["suspectAttemptsRemaining"] }> {
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
      const reactionIds = ["laugh", "wow", "clap", "fire"];
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
      const teamSignal = room.teamSignals?.[actor.team] ?? "wave";
      const signalIds = ["wave", "clap", "jump", "crouch", "spin", "point", "salute", "nod", "flash", "dance"];
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
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now; reload the room and try again." };
  return {
    room: next,
    notice: notice || (result ? `${result.title}: ${result.detail}` : ""),
    suspectAttemptsRemaining,
  };
}

export async function restartSharedMatch(code: string, requesterId: string): Promise<{ room?: SharedRoom; error?: string }> {
  const room = await getSharedRoom(code);
  if (!room) return { error: "This room is no longer available." };
  if (room.hostPlayerId !== requesterId) return { error: "Only the room host can restart the match." };
  if (room.status !== "result") return { error: "Restart is available after a round result." };
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
    scores: emptyScores(),
    suspectAttemptsRemaining: { Alpha: SUSPECT_ATTEMPTS_PER_TEAM, Bravo: SUSPECT_ATTEMPTS_PER_TEAM },
    round: (room.round ?? 1) + 1,
    result: null,
    updatedAt: now,
  };
  if (!await saveRoom(next, room.updatedAt)) return { error: "Room changed just now. Please try again." };
  return { room: next };
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

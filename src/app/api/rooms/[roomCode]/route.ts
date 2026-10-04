import {
  addSharedPlayer,
  assignSharedTeams,
  beginTeamAssignment,
  getSharedRoomView,
  isSharedPlayerAuthenticated,
  removeSharedPlayer,
  renameSharedPlayer,
  respondToTeamAssignment,
  returnSharedRoomToLobby,
  touchSharedPlayerPresence,
} from "@/lib/shared-rooms";
import { normalizePlayerName, type LocalPlayer } from "@/lib/session";
import { readRoomSessionToken, withRoomSessionCookie } from "@/lib/room-auth";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ roomCode: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  const playerId = new URL(request.url).searchParams.get("playerId") ?? "";
  const token = readRoomSessionToken(request, roomCode);
  if (playerId) {
    await touchSharedPlayerPresence(roomCode, playerId);
  }
  const room = await getSharedRoomView(roomCode, playerId, token);
  if (!room) return Response.json({ error: "Room not found. Check the link or room code." }, { status: 404 });
  return Response.json({ room }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  let body: { playerId?: unknown; nickname?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Your join details were not valid." }, { status: 400 });
  }

  if (body.action === "leave" && typeof body.playerId === "string") {
    await removeSharedPlayer(roomCode, body.playerId, true);
    return Response.json({ ok: true });
  }

  if (typeof body.playerId !== "string" || typeof body.nickname !== "string") {
    return Response.json({ error: "Enter a name to join this room." }, { status: 400 });
  }
  if (!body.nickname.trim()) return Response.json({ error: "Enter a name to join this room." }, { status: 400 });
  const nickname = normalizePlayerName(body.nickname);

  const player: LocalPlayer = {
    id: body.playerId.slice(0, 80),
    nickname,
    isAdmin: false,
    isReady: true,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  };
  const token = readRoomSessionToken(request, roomCode);
  const result = await addSharedPlayer(roomCode, player, token);
  if (!result.room) return Response.json({ error: result.error }, { status: 404 });
  const response = Response.json({ room: await getSharedRoomView(roomCode, player.id, result.token ?? token) });
  return result.token ? withRoomSessionCookie(response, roomCode, result.token) : response;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  let body: { action?: unknown; playerId?: unknown; nickname?: unknown; assignments?: unknown; accept?: unknown; shuffle?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "That room action was not valid." }, { status: 400 }); }
  if (typeof body.playerId !== "string") return Response.json({ error: "Your player session is missing." }, { status: 400 });
  if (body.action === "leave") {
    await removeSharedPlayer(roomCode, body.playerId, true);
    return Response.json({ ok: true });
  }
  if (body.action === "return-to-lobby") {
    const result = await returnSharedRoomToLobby(roomCode, body.playerId);
    if (!result.room) return Response.json({ error: result.error }, { status: 403 });
    return Response.json({ room: await getSharedRoomView(roomCode, body.playerId, readRoomSessionToken(request, roomCode)) });
  }
  if (!await isSharedPlayerAuthenticated(roomCode, body.playerId, readRoomSessionToken(request, roomCode))) return Response.json({ error: "Reconnect to this room before changing teams." }, { status: 401 });
  if (body.action === "rename" && typeof body.nickname === "string") {
    const renamed = await renameSharedPlayer(roomCode, body.playerId, body.nickname);
    if (!renamed.room) return Response.json({ error: renamed.error }, { status: 409 });
    return Response.json({ room: await getSharedRoomView(roomCode, body.playerId, readRoomSessionToken(request, roomCode)) });
  }
  let result;
  if (body.action === "begin-assignment") result = await beginTeamAssignment(roomCode, body.playerId);
  else if (body.action === "assign-teams" && (body.shuffle === true || (body.assignments && typeof body.assignments === "object"))) {
    result = await assignSharedTeams(roomCode, body.playerId, (body.assignments ?? {}) as Record<string, "Alpha" | "Bravo">, body.shuffle === true);
  } else if (body.action === "respond" && typeof body.accept === "boolean") {
    result = await respondToTeamAssignment(roomCode, body.playerId, body.accept);
  } else return Response.json({ error: "That room action is not available." }, { status: 400 });
  if (!result.room) return Response.json({ error: result.error }, { status: 403 });
  return Response.json({ room: await getSharedRoomView(roomCode, body.playerId, readRoomSessionToken(request, roomCode)) });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  const url = new URL(request.url);
  let playerId = url.searchParams.get("playerId") ?? "";
  const deliberate = url.searchParams.get("deliberate") !== "false";
  if (!playerId) {
    try {
      const body = await request.json() as { playerId?: string };
      if (body.playerId) playerId = body.playerId;
    } catch {
      // url param fallback
    }
  }
  if (!playerId) return Response.json({ error: "Your player session is missing." }, { status: 400 });
  await removeSharedPlayer(roomCode, playerId, deliberate);
  return Response.json({ ok: true });
}

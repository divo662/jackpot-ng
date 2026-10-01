import { getPrivateTeamRoom, isSharedPlayerAuthenticated, updatePrivateTeamRoom } from "@/lib/shared-rooms";
import { readRoomSessionToken } from "@/lib/room-auth";

type RouteContext = { params: Promise<{ roomCode: string }> };
export const runtime = "nodejs";

export async function GET(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  const playerId = new URL(request.url).searchParams.get("playerId") ?? "";
  if (!await isSharedPlayerAuthenticated(roomCode, playerId, readRoomSessionToken(request, roomCode))) return Response.json({ error: "Reconnect to your room before opening team strategy." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const data = await getPrivateTeamRoom(roomCode, playerId);
  if (data.error) return Response.json({ error: data.error }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return Response.json({ privateRoom: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  let body: { playerId?: unknown; signal?: unknown; agree?: unknown; text?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "That team update was not valid." }, { status: 400 }); }
  if (typeof body.playerId !== "string") return Response.json({ error: "Your player session is missing." }, { status: 400 });
  if (!await isSharedPlayerAuthenticated(roomCode, body.playerId, readRoomSessionToken(request, roomCode))) return Response.json({ error: "Reconnect to your room before sending a team update." }, { status: 401 });
  const result = await updatePrivateTeamRoom(roomCode, body.playerId, { signal: body.signal, agree: body.agree, text: body.text });
  if (result.error) return Response.json({ error: result.error }, { status: 403 });
  return Response.json({ ok: true });
}

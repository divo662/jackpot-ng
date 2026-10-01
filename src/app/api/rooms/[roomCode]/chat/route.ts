import { addSharedMessage, getSharedRoomView, isSharedPlayerAuthenticated } from "@/lib/shared-rooms";
import { readRoomSessionToken } from "@/lib/room-auth";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ roomCode: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  let body: { playerId?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Message was not valid." }, { status: 400 });
  }
  if (typeof body.playerId !== "string" || typeof body.text !== "string") {
    return Response.json({ error: "Message was not valid." }, { status: 400 });
  }
  if (!await isSharedPlayerAuthenticated(roomCode, body.playerId, readRoomSessionToken(request, roomCode))) return Response.json({ error: "Reconnect to the room before chatting." }, { status: 401 });

  const result = await addSharedMessage(roomCode, body.playerId, body.text);
  if (!result.room) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ room: await getSharedRoomView(roomCode, body.playerId, readRoomSessionToken(request, roomCode)) });
}

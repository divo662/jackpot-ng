import { claimLegacyHostToken, createSharedRoom, getSharedPlayerToken, getSharedRoomView, type SharedRoom } from "@/lib/shared-rooms";
import { withRoomSessionCookie } from "@/lib/room-auth";
import { normalizePlayerName } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { room?: Partial<SharedRoom> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Room details were not valid." }, { status: 400 });
  }

  const room = body.room;
  const host = room?.players?.[0];
  if (
    !room ||
    typeof room.id !== "string" ||
    typeof room.code !== "string" ||
    !/^[A-Z0-9]{5}$/.test(room.code) ||
    !host ||
    host.id !== room.hostPlayerId ||
    ![4, 6, 8].includes(room.maxPlayers ?? 0)
  ) {
    return Response.json({ error: "Room details were incomplete." }, { status: 400 });
  }

  const shared: SharedRoom = {
    id: room.id,
    code: room.code,
    isPrivate: Boolean(room.isPrivate),
    maxPlayers: room.maxPlayers as SharedRoom["maxPlayers"],
    status: "lobby",
    hostPlayerId: host.id,
    players: [{
      id: host.id,
      nickname: normalizePlayerName(String(host.nickname)),
      isAdmin: true,
      isReady: true,
      joinedAt: Date.now(),
    }],
    chat: Array.isArray(room.chat) ? room.chat.slice(-100) as SharedRoom["chat"] : [],
    updatedAt: Date.now(),
  };

  if (!await createSharedRoom(shared)) {
    const token = await claimLegacyHostToken(shared.code, host.id);
    if (!token) return Response.json({ error: "That room code is already in use. Create another room." }, { status: 409 });
    return withRoomSessionCookie(Response.json({ room: await getSharedRoomView(shared.code, host.id, token) }), shared.code, token);
  }

  const token = await getSharedPlayerToken(shared.code, host.id);
  if (!token) return Response.json({ error: "The host seat could not be secured." }, { status: 500 });
  return withRoomSessionCookie(Response.json({ room: await getSharedRoomView(shared.code, host.id, token) }, { status: 201 }), shared.code, token);
}

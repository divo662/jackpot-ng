import { getSharedRoomView, isSharedPlayerAuthenticated, performSharedGameAction, restartSharedMatch, startNextSharedRound, rematchSharedMatch, pauseSharedMatch, resumeSharedMatch, type SharedGameAction } from "@/lib/shared-rooms";
import { readRoomSessionToken } from "@/lib/room-auth";

type RouteContext = { params: Promise<{ roomCode: string }> };
export const runtime = "nodejs";

export async function POST(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  let body: { playerId?: unknown; type?: unknown; cardId?: unknown; reactionId?: unknown; targetPlayerId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "That game action was not valid." }, { status: 400 }); }
  if (typeof body.playerId !== "string" || !["pass", "jackpot", "suspect", "signal", "fake-signal", "reaction", "restart", "next-round", "rematch", "pause", "resume"].includes(String(body.type))) {
    return Response.json({ error: "That game action is not available." }, { status: 400 });
  }
  const token = readRoomSessionToken(request, roomCode);
  if (!await isSharedPlayerAuthenticated(roomCode, body.playerId, token)) return Response.json({ error: "Reconnect to the room before playing." }, { status: 401 });
  if (body.type === "restart") {
    const restarted = await restartSharedMatch(roomCode, body.playerId);
    if (!restarted.room) return Response.json({ error: restarted.error }, { status: 403 });
    return Response.json({ ok: true, room: await getSharedRoomView(roomCode, body.playerId, token) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.type === "next-round") {
    const nextRound = await startNextSharedRound(roomCode, body.playerId);
    if (!nextRound.room) return Response.json({ error: nextRound.error }, { status: 403 });
    return Response.json({ ok: true, room: await getSharedRoomView(roomCode, body.playerId, token) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.type === "rematch") {
    const rematched = await rematchSharedMatch(roomCode, body.playerId);
    if (!rematched.room) return Response.json({ error: rematched.error }, { status: 403 });
    return Response.json({ ok: true, room: await getSharedRoomView(roomCode, body.playerId, token) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.type === "pause") {
    const paused = await pauseSharedMatch(roomCode, body.playerId);
    if (!paused.room) return Response.json({ error: paused.error }, { status: 403 });
    return Response.json({ ok: true, room: await getSharedRoomView(roomCode, body.playerId, token) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.type === "resume") {
    const resumed = await resumeSharedMatch(roomCode, body.playerId);
    if (!resumed.room) return Response.json({ error: resumed.error }, { status: 403 });
    return Response.json({ ok: true, room: await getSharedRoomView(roomCode, body.playerId, token) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.type === "pass" && typeof body.cardId !== "string") return Response.json({ error: "Choose a card in your hand." }, { status: 400 });
  if (body.type === "reaction" && typeof body.reactionId !== "string") return Response.json({ error: "Choose a reaction." }, { status: 400 });
  const action = body.type === "pass"
    ? { type: "pass" as const, playerId: body.playerId, cardId: body.cardId as string }
    : body.type === "reaction"
      ? { type: "reaction" as const, playerId: body.playerId, reactionId: body.reactionId as string }
      : body.type === "suspect"
        ? { type: "suspect" as const, playerId: body.playerId, targetPlayerId: typeof body.targetPlayerId === "string" ? body.targetPlayerId : undefined }
        : { type: body.type as "jackpot" | "signal" | "fake-signal", playerId: body.playerId };
  const result = await performSharedGameAction(roomCode, action as SharedGameAction);
  if (!result.room) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({
    ok: true,
    room: await getSharedRoomView(roomCode, body.playerId, token),
    notice: result.notice,
    suspectAttemptsRemaining: result.suspectAttemptsRemaining
  }, { headers: { "Cache-Control": "no-store" } });
}

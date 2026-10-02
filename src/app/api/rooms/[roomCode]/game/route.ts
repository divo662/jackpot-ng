import { isSharedPlayerAuthenticated, performSharedGameAction, restartSharedMatch, startNextSharedRound, rematchSharedMatch, type SharedGameAction } from "@/lib/shared-rooms";
import { readRoomSessionToken } from "@/lib/room-auth";

type RouteContext = { params: Promise<{ roomCode: string }> };
export const runtime = "nodejs";

export async function POST(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  let body: { playerId?: unknown; type?: unknown; cardId?: unknown; reactionId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "That game action was not valid." }, { status: 400 }); }
  if (typeof body.playerId !== "string" || !["pass", "jackpot", "suspect", "signal", "fake-signal", "reaction", "restart", "next-round", "rematch"].includes(String(body.type))) {
    return Response.json({ error: "That game action is not available." }, { status: 400 });
  }
  if (!await isSharedPlayerAuthenticated(roomCode, body.playerId, readRoomSessionToken(request, roomCode))) return Response.json({ error: "Reconnect to the room before playing." }, { status: 401 });
  if (body.type === "restart") {
    const restarted = await restartSharedMatch(roomCode, body.playerId);
    if (!restarted.room) return Response.json({ error: restarted.error }, { status: 403 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.type === "next-round") {
    const nextRound = await startNextSharedRound(roomCode, body.playerId);
    if (!nextRound.room) return Response.json({ error: nextRound.error }, { status: 403 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.type === "rematch") {
    const rematched = await rematchSharedMatch(roomCode, body.playerId);
    if (!rematched.room) return Response.json({ error: rematched.error }, { status: 403 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.type === "pass" && typeof body.cardId !== "string") return Response.json({ error: "Choose a card in your hand." }, { status: 400 });
  if (body.type === "reaction" && typeof body.reactionId !== "string") return Response.json({ error: "Choose a reaction." }, { status: 400 });
  const action = body.type === "pass"
    ? { type: "pass" as const, playerId: body.playerId, cardId: body.cardId as string }
    : body.type === "reaction"
      ? { type: "reaction" as const, playerId: body.playerId, reactionId: body.reactionId as string }
      : { type: body.type as "jackpot" | "suspect" | "signal" | "fake-signal", playerId: body.playerId };
  const result = await performSharedGameAction(roomCode, action as SharedGameAction);
  if (!result.room) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true, notice: result.notice, suspectAttemptsRemaining: result.suspectAttemptsRemaining }, { headers: { "Cache-Control": "no-store" } });
}

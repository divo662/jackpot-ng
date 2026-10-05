import { getPlayerProfile, savePlayerProfile } from "@/lib/shared-rooms";
import { normalizePlayerName } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId") ?? "";
  if (!playerId) {
    return Response.json({ error: "playerId is required" }, { status: 400 });
  }

  try {
    const profile = await getPlayerProfile(playerId);
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    return Response.json({ error: (err as Error)?.message || "Failed to fetch profile" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { playerId?: unknown; nickname?: unknown; roomCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid profile data" }, { status: 400 });
  }

  if (typeof body.playerId !== "string" || typeof body.nickname !== "string") {
    return Response.json({ error: "playerId and nickname are required" }, { status: 400 });
  }

  const cleanName = normalizePlayerName(body.nickname);
  if (!cleanName) {
    return Response.json({ error: "Please enter a valid nickname" }, { status: 400 });
  }

  const roomCode = typeof body.roomCode === "string" ? body.roomCode : undefined;

  try {
    const profile = await savePlayerProfile(body.playerId, cleanName, roomCode);
    const response = Response.json({ ok: true, profile });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.append(
      "Set-Cookie",
      `jackpot_player_id=${encodeURIComponent(body.playerId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    );
    return response;
  } catch (err: unknown) {
    return Response.json({ error: (err as Error)?.message || "Failed to save profile" }, { status: 500 });
  }
}

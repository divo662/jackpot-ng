export function readRoomSessionToken(request: Request, roomCode: string): string {
  const cookieName = `jackpot_${roomCode.toUpperCase()}`;
  const cookies = request.headers.get("cookie") ?? "";
  const entry = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  if (!entry) return "";
  try { return decodeURIComponent(entry.slice(cookieName.length + 1)); } catch { return ""; }
}

export function withRoomSessionCookie(response: Response, roomCode: string, token: string): Response {
  const cookieName = `jackpot_${roomCode.toUpperCase()}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
  return response;
}

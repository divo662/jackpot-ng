import { getDbAccountByUsername, upsertDbAccount } from "@/lib/server-account";
import { normalizePlayerName } from "@/lib/session";
import type { UserAccount } from "@/lib/account";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username") ?? "";
  if (!username) {
    return Response.json({ error: "username parameter is required" }, { status: 400 });
  }

  try {
    const account = await getDbAccountByUsername(username);
    if (!account) {
      return Response.json({ account: null }, { status: 200 });
    }
    return Response.json({ account }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    return Response.json({ error: (err as Error)?.message || "Failed to fetch account" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { account?: UserAccount; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.account || typeof body.account.username !== "string") {
    return Response.json({ error: "account payload with username is required" }, { status: 400 });
  }

  const cleanName = normalizePlayerName(body.account.username);
  if (!cleanName) {
    return Response.json({ error: "Valid username is required" }, { status: 400 });
  }

  try {
    const saved = await upsertDbAccount(body.account, body.password);
    return Response.json({ ok: true, account: saved });
  } catch (err: unknown) {
    return Response.json({ error: (err as Error)?.message || "Failed to save account to database" }, { status: 500 });
  }
}

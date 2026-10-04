import { getSharedRoomView, isSharedPlayerAuthenticated, subscribeToRoom } from "@/lib/shared-rooms";
import { readRoomSessionToken } from "@/lib/room-auth";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ roomCode: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { roomCode } = await params;
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId") ?? "";
  const token = readRoomSessionToken(request, roomCode);

  if (!await isSharedPlayerAuthenticated(roomCode, playerId, token)) {
    return new Response(JSON.stringify({ error: "Unauthorized session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial room snapshot immediately
        const initialRoom = await getSharedRoomView(roomCode, playerId, token);
        if (initialRoom) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ room: initialRoom })}\n\n`));
        }

        // Subscribe to real-time updates broadcast by room actions
        unsubscribe = subscribeToRoom(roomCode, async () => {
          try {
            const updated = await getSharedRoomView(roomCode, playerId, token);
            if (updated) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ room: updated })}\n\n`));
            }
          } catch {
            // Stream might be closed by client
          }
        });

        // Keep-alive heartbeat every 15 seconds to prevent proxy / NAT timeouts
        heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            // Stream closed
          }
        }, 15000);
      } catch (err) {
        try {
          controller.error(err);
        } catch {
          // Ignore
        }
      }
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

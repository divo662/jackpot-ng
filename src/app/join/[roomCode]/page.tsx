import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

type Props = {
  params: Promise<{ roomCode: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params;
  const roomCode = resolved?.roomCode ? resolved.roomCode.toUpperCase() : "Match";

  return {
    title: `Join Room ${roomCode}`,
    description: `You've been invited to join Jackpot Room ${roomCode}. Pick your nickname and join the table now!`,
    openGraph: {
      title: `You're Invited to Play Jackpot (Room: ${roomCode})`,
      description: `Join room ${roomCode} to play the fast-paced multiplayer card bluffing game.`,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function JoinRoomWithCodeRoute() {
  return <JackpotApp />;
}

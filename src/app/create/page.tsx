import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

export const metadata: Metadata = {
  title: "Host a Room | Create Multiplayer Table",
  description:
    "Host a new Jackpot card game room. Invite your friends with a 6-character room code, customize match settings, select secret team signals, and play online.",
  alternates: {
    canonical: "/create",
  },
  openGraph: {
    title: "Host a Room | Create Multiplayer Table | Jackpot",
    description:
      "Host a new Jackpot room, invite your friends with a room code, and play online.",
    url: "/create",
  },
};

export default function CreateRoomRoute() {
  return <JackpotApp />;
}

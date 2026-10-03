import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

export const metadata: Metadata = {
  title: "Join Match | Enter Room Code",
  description:
    "Join an active Jackpot card game table. Enter the 6-character room code from your host and join the multiplayer action with your friends.",
  alternates: {
    canonical: "/join",
  },
  openGraph: {
    title: "Join Match | Enter Room Code | Jackpot",
    description:
      "Enter your room code to join an active Jackpot card game table.",
    url: "/join",
  },
};

export default function JoinRoomRoute() {
  return <JackpotApp />;
}

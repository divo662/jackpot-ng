import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

export const metadata: Metadata = {
  title: "Game Lobby",
  robots: { index: false, follow: false },
};

export default function LobbyRoute() {
  return <JackpotApp />;
}
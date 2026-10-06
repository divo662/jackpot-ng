import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

export const metadata: Metadata = {
  title: "Settings & AI Partner | Jackpot",
  description:
    "Customize audio settings, choose your AI partner character, change your offline team name, and configure your Jackpot table preferences.",
  alternates: {
    canonical: "/settings",
  },
  openGraph: {
    title: "Settings & AI Partner | Jackpot",
    description:
      "Customize audio, pick your AI partner archetype, and configure your offline match preferences.",
    url: "/settings",
  },
};

export default function SettingsRoute() {
  return <JackpotApp />;
}

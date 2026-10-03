import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

export const metadata: Metadata = {
  title: "How to Play & Rules Guide",
  description:
    "Master the rules of Jackpot: learn team strategy, secret hand signals, card passing flow, calling suspect on opponents, and shouting JACKPOT to win.",
  alternates: {
    canonical: "/how-to",
  },
  openGraph: {
    title: "How to Play Jackpot | Rules & Strategy Guide",
    description:
      "Master the rules of Jackpot: secret signals, card passing mechanics, calling suspect, and winning rounds.",
    url: "/how-to",
  },
};

export default function HowToRoute() {
  return <JackpotApp />;
}
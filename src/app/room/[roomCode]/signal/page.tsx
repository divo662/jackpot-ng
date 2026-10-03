import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

export const metadata: Metadata = {
  title: "Private Strategy Room",
  robots: { index: false, follow: false },
};

export default function SignalRoute() {
  return <JackpotApp />;
}
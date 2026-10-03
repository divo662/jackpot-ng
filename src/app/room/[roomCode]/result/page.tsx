import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

export const metadata: Metadata = {
  title: "Match Results",
  robots: { index: false, follow: false },
};

export default function ResultRoute() {
  return <JackpotApp />;
}
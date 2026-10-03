import type { Metadata } from "next";
import { JackpotApp } from "@/components/JackpotApp";

export const metadata: Metadata = {
  title: "Game Table",
  robots: { index: false, follow: false },
};

export default function TableRoute() {
  return <JackpotApp />;
}
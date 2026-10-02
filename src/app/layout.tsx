import type { Metadata } from "next";
import { Geist, Lilita_One } from "next/font/google";
import { MusicProvider } from "@/components/MusicProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const lilitaOne = Lilita_One({
  weight: "400",
  variable: "--font-game",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jackpot | Social Whot game",
  description: "Create a room, team up, read the signal, and call JACKPOT.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${lilitaOne.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <MusicProvider>{children}</MusicProvider>
      </body>
    </html>
  );
}


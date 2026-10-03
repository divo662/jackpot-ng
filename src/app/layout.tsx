import type { Metadata, Viewport } from "next";
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

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://jackpot-ng.vercel.app");

export const viewport: Viewport = {
  themeColor: "#120904",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Jackpot | Social Card Bluffing & Secret Signal Party Game",
    template: "%s | Jackpot",
  },
  description:
    "Play Jackpot online with friends! The fast-paced multiplayer card bluffing game. Team up with a partner, swap cards, transmit secret signals across the table, suspect rivals, and shout JACKPOT!",
  keywords: [
    "Jackpot",
    "Jackpot card game",
    "multiplayer card game",
    "secret signal game",
    "social deduction game",
    "party games online",
    "card passing game",
    "whot game online",
    "bluffing game",
    "browser games multiplayer",
    "play with friends",
  ],
  authors: [{ name: "Jackpot Studio", url: baseUrl }],
  creator: "Jackpot Studio",
  publisher: "Jackpot Studio",
  applicationName: "Jackpot",
  category: "Game",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Jackpot | Social Card Bluffing & Secret Signal Party Game",
    description:
      "Play Jackpot online with friends! Team up, swap cards, transmit secret signals across the table, suspect rivals, and shout JACKPOT!",
    url: "/",
    siteName: "Jackpot",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jackpot | Social Card Bluffing & Secret Signal Party Game",
    description:
      "Play Jackpot online with friends! Team up, swap cards, transmit secret signals across the table, suspect rivals, and shout JACKPOT!",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Jackpot",
  url: baseUrl,
  description:
    "Fast-paced multiplayer card passing and social deduction party game. Transmit secret signals across the table, suspect rivals, and race to spell JACKPOT.",
  applicationCategory: "GameApplication",
  genre: ["Card Game", "Party Game", "Social Deduction"],
  operatingSystem: "All",
  browserRequirements: "Requires JavaScript. Requires HTML5.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${lilitaOne.variable} h-full antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#120904] text-white">
        <MusicProvider>{children}</MusicProvider>
      </body>
    </html>
  );
}

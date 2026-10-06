import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Lilita_One } from "next/font/google";
import { MusicProvider } from "@/components/MusicProvider";
import { CookieConsent } from "@/components/CookieConsent";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const fontSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
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
    url: baseUrl,
    siteName: "Jackpot",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${baseUrl}/og-image.png`,
        secureUrl: `${baseUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Jackpot - The Multiplayer Secret Signal & Card Bluffing Party Game",
        type: "image/png",
      },
      {
        url: `${baseUrl}/og-image-square.png`,
        secureUrl: `${baseUrl}/og-image-square.png`,
        width: 600,
        height: 600,
        alt: "Jackpot Card Game",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jackpot | Social Card Bluffing & Secret Signal Party Game",
    description:
      "Play Jackpot online with friends! Team up, swap cards, transmit secret signals across the table, suspect rivals, and shout JACKPOT!",
    images: [`${baseUrl}/twitter-image.png`],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "apple-touch-icon-precomposed",
        url: "/apple-touch-icon-precomposed.png",
      },
    ],
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
  image: `${baseUrl}/og-image.png`,
  screenshot: `${baseUrl}/og-image.png`,
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
    <html lang="en" className={`${fontSans.variable} ${lilitaOne.variable} h-full antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#120904] text-white">
        <ServiceWorkerRegistration />
        <MusicProvider>{children}</MusicProvider>
        <CookieConsent />
        <InstallPrompt />
      </body>
    </html>
  );
}

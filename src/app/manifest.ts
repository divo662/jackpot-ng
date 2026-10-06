import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jackpot - Social Card Bluffing Game",
    short_name: "Jackpot",
    description: "The fast-paced multiplayer card bluffing and secret signal party game. Play online or offline with AI partners.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "window-controls-overlay", "browser"],
    background_color: "#120904",
    theme_color: "#120904",
    orientation: "portrait",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Play Offline vs AI",
        short_name: "Offline Play",
        description: "Jump straight into an offline match with AI partners",
        url: "/?mode=practice",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "AI Partner & Settings",
        short_name: "Settings",
        description: "Configure audio and choose your AI partner archetype",
        url: "/settings",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}

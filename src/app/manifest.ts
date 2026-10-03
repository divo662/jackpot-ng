import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jackpot - Social Card Bluffing Game",
    short_name: "Jackpot",
    description: "The fast-paced multiplayer card bluffing and secret signal party game.",
    start_url: "/",
    display: "standalone",
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
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

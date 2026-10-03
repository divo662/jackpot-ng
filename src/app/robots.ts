import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://jackpot-ng.vercel.app");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/how-to", "/create", "/join"],
        disallow: ["/api/", "/room/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

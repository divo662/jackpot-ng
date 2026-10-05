import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export const alt = "Jackpot - The Social Card Bluffing Party Game";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  const imagePath = path.join(process.cwd(), "public", "twitter-image.png");
  const fileBuffer = fs.readFileSync(imagePath);
  return new Response(fileBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

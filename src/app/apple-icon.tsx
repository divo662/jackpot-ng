import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  const imagePath = path.join(process.cwd(), "public", "apple-touch-icon.png");
  const fileBuffer = fs.readFileSync(imagePath);
  return new Response(fileBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

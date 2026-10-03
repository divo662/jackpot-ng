import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt = "Jackpot - The Social Card Bluffing Party Game";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "54px 60px",
          background: "radial-gradient(circle at 50% 25%, #2d1407 0%, #170a04 55%, #0d0502 100%)",
          border: "12px solid #b45309",
          color: "#ffffff",
          fontFamily: "sans-serif",
          boxSizing: "border-box",
        }}
      >
        {/* Top bar with crown and status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "rgba(245, 158, 11, 0.15)",
              border: "2px solid rgba(245, 158, 11, 0.4)",
              borderRadius: "9999px",
              padding: "10px 24px",
              color: "#fde68a",
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            <span>👑</span>
            <span>MULTIPLAYER CARD GAME</span>
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              fontSize: "26px",
            }}
          >
            <span>♠</span>
            <span style={{ color: "#ef4444" }}>♥</span>
            <span style={{ color: "#ef4444" }}>♦</span>
            <span>♣</span>
          </div>
        </div>

        {/* Center Hero */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Main Title */}
          <div
            style={{
              fontSize: "104px",
              fontWeight: 900,
              letterSpacing: "4px",
              color: "#fbbf24",
              textShadow: "0 8px 30px rgba(0,0,0,0.9)",
              lineHeight: 1,
              marginBottom: "18px",
            }}
          >
            JACKPOT
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: "32px",
              fontWeight: 600,
              color: "#fef3c7",
              maxWidth: "880px",
              lineHeight: 1.35,
              textShadow: "0 4px 14px rgba(0,0,0,0.8)",
            }}
          >
            The fast-paced card bluffing game. Swap cards, flash secret signals, suspect your rivals, and shout JACKPOT!
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "24px",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "#241006",
              border: "1.5px solid #d97706",
              borderRadius: "14px",
              padding: "14px 28px",
              fontSize: "20px",
              fontWeight: 700,
              color: "#fbbf24",
            }}
          >
            <span>🤫</span>
            <span>Secret Signals</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "#241006",
              border: "1.5px solid #d97706",
              borderRadius: "14px",
              padding: "14px 28px",
              fontSize: "20px",
              fontWeight: 700,
              color: "#fbbf24",
            }}
          >
            <span>👀</span>
            <span>Suspect & Catch</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "#241006",
              border: "1.5px solid #d97706",
              borderRadius: "14px",
              padding: "14px 28px",
              fontSize: "20px",
              fontWeight: 700,
              color: "#fbbf24",
            }}
          >
            <span>⚡</span>
            <span>Real-time Multiplayer</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

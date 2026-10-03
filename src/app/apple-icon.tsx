import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #3b1a0a 0%, #1a0c05 60%, #0d0502 100%)",
          border: "8px solid #f59e0b",
          borderRadius: "42px",
          position: "relative",
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)",
        }}
      >
        {/* Crown crown top accent */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "-8px",
          }}
        >
          <div style={{ width: "12px", height: "12px", borderRadius: "6px", background: "#fef08a" }} />
          <div style={{ width: "16px", height: "16px", borderRadius: "8px", background: "#fbbf24", marginTop: "-6px" }} />
          <div style={{ width: "12px", height: "12px", borderRadius: "6px", background: "#fef08a" }} />
        </div>

        {/* Letter J */}
        <div
          style={{
            fontSize: "105px",
            fontWeight: 900,
            color: "#fef08a",
            lineHeight: 1,
            letterSpacing: "-2px",
            textShadow: "0 6px 16px rgba(0,0,0,0.9)",
          }}
        >
          J
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#180c05",
          border: "2px solid #f59e0b",
          borderRadius: "8px",
          color: "#fef08a",
          fontSize: "20px",
          fontWeight: 900,
          fontFamily: "sans-serif",
          lineHeight: 1,
        }}
      >
        J
      </div>
    ),
    {
      ...size,
    }
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

export const OWNER_X_URL = "https://x.com/divo_dev";
export const LEGAL_UPDATED = "October 6, 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0d14",
        color: "rgba(255,255,255,0.86)",
        padding: "32px 18px 64px",
      }}
    >
      <article style={{ maxWidth: 760, margin: "0 auto", lineHeight: 1.65, fontSize: 15 }}>
        <Link href="/settings" style={{ color: "#fbbf24", fontSize: 14, textDecoration: "none" }}>
          ← Back to Settings
        </Link>
        <h1 style={{ fontSize: 30, margin: "16px 0 4px", color: "#fff" }}>{title}</h1>
        <p style={{ opacity: 0.6, marginTop: 0, fontSize: 13 }}>Last updated: {LEGAL_UPDATED}</p>
        {children}
        <h2 style={{ fontSize: 20, marginTop: 32, color: "#fff" }}>Contact</h2>
        <p>
          Questions? DM the owner on X:{" "}
          <a href={OWNER_X_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#fbbf24" }}>
            @divo_dev
          </a>
          .
        </p>
        <p style={{ fontSize: 13, opacity: 0.7 }}>
          <Link href="/privacy" style={{ color: "#fbbf24" }}>Privacy Policy</Link>
          {" · "}
          <Link href="/terms" style={{ color: "#fbbf24" }}>Terms of Service</Link>
        </p>
      </article>
    </main>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 20, marginTop: 28, marginBottom: 6, color: "#fff" }}>{children}</h2>;
}

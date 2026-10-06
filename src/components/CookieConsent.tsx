"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const COOKIE_CONSENT_KEY = "jackpot:cookie-consent:v1";

/**
 * First-launch notice about cookies / local storage.
 * Jackpot only uses essential browser storage (settings, guest progress, session),
 * so the choice is recorded but does not enable any tracking.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_CONSENT_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const choose = (choice: "all" | "essential") => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, choice);
    } catch {}
    setVisible(false);
  };

  const btn = {
    font: "inherit",
    fontWeight: 700,
    borderRadius: 999,
    padding: "8px 16px",
    cursor: "pointer",
  } as const;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "max(12px, env(safe-area-inset-bottom))",
        zIndex: 9999,
        maxWidth: 520,
        margin: "0 auto",
        padding: "14px 16px",
        background: "rgba(18,9,4,0.96)",
        border: "1px solid rgba(251,191,36,0.4)",
        borderRadius: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        color: "rgba(255,255,255,0.88)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: "0 0 10px" }}>
        🍪 Jackpot uses cookies and local storage to save your settings, profile and game progress. See our{" "}
        <Link href="/privacy" style={{ color: "#fbbf24" }}>Privacy Policy</Link> and{" "}
        <Link href="/terms" style={{ color: "#fbbf24" }}>Terms</Link>.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => choose("essential")}
          style={{ ...btn, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.35)" }}
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => choose("all")}
          style={{ ...btn, background: "#fbbf24", color: "#1a0f05", border: "none" }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}

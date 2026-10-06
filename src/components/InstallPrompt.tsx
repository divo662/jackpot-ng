"use client";

import { useEffect, useState } from "react";
import { COOKIE_CONSENT_KEY } from "@/components/CookieConsent";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "other";

const DISMISS_KEY = "jackpot_install_prompt_dismissed";

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fbbf24"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ verticalAlign: "-3px", margin: "0 2px" }}
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/**
 * "Add to Home Screen" card, styled like the cookie notice.
 * - iPhone/iPad (Safari): manual Share → Add to Home Screen steps.
 * - Android (Chrome): native install button, with menu-based fallback steps.
 * - Hidden when already installed or dismissed, and shown only after the cookie notice is answered.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [eligible, setEligible] = useState(false);
  const [consentDone, setConsentDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const isIpadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const detected: Platform = /iphone|ipad|ipod/i.test(ua) || isIpadOs ? "ios" : /android/i.test(ua) ? "android" : "other";
    setPlatform(detected);
    if (detected !== "other") setEligible(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setEligible(true);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Wait until the cookie notice has been answered so the two cards never overlap.
  useEffect(() => {
    const check = () => {
      try {
        if (localStorage.getItem(COOKIE_CONSENT_KEY)) return true;
      } catch {
        return true;
      }
      return false;
    };
    if (check()) {
      setConsentDone(true);
      return;
    }
    const id = window.setInterval(() => {
      if (check()) {
        setConsentDone(true);
        window.clearInterval(id);
      }
    }, 800);
    return () => window.clearInterval(id);
  }, []);

  if (hidden || !eligible || !consentDone) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setHidden(true);
  };

  const btn = {
    font: "inherit",
    fontWeight: 700,
    borderRadius: 999,
    padding: "8px 16px",
    cursor: "pointer",
  } as const;

  const accent = { color: "#fbbf24", fontWeight: 700 } as const;

  let body: React.ReactNode;
  if (deferred) {
    body = <>Install Jackpot on your {platform === "android" ? "Android phone" : "device"} to play full-screen, like an app.</>;
  } else if (platform === "ios") {
    body = (
      <>
        Install Jackpot on your iPhone: tap <ShareIcon />
        <span style={accent}>Share</span> in Safari, then choose <span style={accent}>Add to Home Screen</span>.
      </>
    );
  } else {
    body = (
      <>
        Install Jackpot on your Android phone: tap <span style={accent}>⋮ Menu</span> in Chrome, then{" "}
        <span style={accent}>Install app</span> or <span style={accent}>Add to Home screen</span>.
      </>
    );
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Install app"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "max(12px, env(safe-area-inset-bottom))",
        zIndex: 9998,
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
        {platform === "ios" ? "🍎" : "📲"} {body}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={dismiss}
          style={{ ...btn, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.35)" }}
        >
          {deferred ? "Not now" : "Got it"}
        </button>
        {deferred && (
          <button type="button" onClick={install} style={{ ...btn, background: "#fbbf24", color: "#1a0f05", border: "none" }}>
            Install
          </button>
        )}
      </div>
    </div>
  );
}

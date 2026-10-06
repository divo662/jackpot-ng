"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "jackpot_install_prompt_dismissed";

/**
 * Small, unobtrusive "Add to Home Screen" hint.
 * - Android/Chrome: uses the native install prompt.
 * - iOS Safari: shows manual Share → Add to Home Screen instructions.
 * - Hidden when already installed or dismissed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIos(ios);
    if (ios) setHidden(false);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

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

  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexWrap: "wrap",
        margin: "10px auto 0",
        padding: "6px 12px",
        maxWidth: 420,
        fontSize: 12,
        lineHeight: 1.3,
        color: "rgba(255,255,255,0.8)",
        background: "rgba(0,0,0,0.35)",
        borderRadius: 999,
        textAlign: "center",
      }}
    >
      <span>
        📲{" "}
        {isIos && !deferred
          ? "Add Jackpot to your Home Screen: tap Share, then “Add to Home Screen”."
          : "Add Jackpot to your Home Screen to play like an app."}
      </span>
      {deferred && (
        <button
          type="button"
          onClick={install}
          style={{
            font: "inherit",
            fontWeight: 700,
            color: "#fbbf24",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          font: "inherit",
          color: "rgba(255,255,255,0.6)",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}

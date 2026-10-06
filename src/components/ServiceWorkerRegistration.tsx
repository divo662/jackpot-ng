"use client";

import { useEffect, useState } from "react";

export function ServiceWorkerRegistration() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            // Check for updates
            reg.addEventListener("updatefound", () => {
              const installingWorker = reg.installing;
              if (installingWorker) {
                installingWorker.addEventListener("statechange", () => {
                  if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                    // New content is available
                  }
                });
              }
            });
          })
          .catch((error) => {
            console.warn("[SW] Registration error:", error);
          });
      });
    }

    // 2. Network connectivity listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "8px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "rgba(22, 11, 5, 0.94)",
        border: "1px solid rgba(245, 158, 11, 0.5)",
        color: "#fbbf24",
        fontSize: "0.78rem",
        fontWeight: "800",
        padding: "6px 14px",
        borderRadius: "999px",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        pointerEvents: "none",
        letterSpacing: "0.04em",
      }}
    >
      <span style={{ fontSize: "0.9rem" }}>⚡</span>
      <span>OFFLINE MODE ACTIVE — AI MATCHES FULLY PLAYABLE WITHOUT DATA</span>
    </div>
  );
}

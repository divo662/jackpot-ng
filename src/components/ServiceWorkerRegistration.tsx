"use client";

import { useEffect, useRef, useState } from "react";

type ConnectivityStatus = "offline" | "online";

interface ToastState {
  status: ConnectivityStatus;
  id: number;
  isLeaving: boolean;
}

export function ServiceWorkerRegistration() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOfflineRef = useRef<boolean>(false);

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

    const showToast = (status: ConnectivityStatus) => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);

      const id = Date.now();
      setToast({ status, id, isLeaving: false });

      // Offline toast visible for 4.5s; Online toast visible for 3.5s
      const duration = status === "offline" ? 4500 : 3500;

      dismissTimerRef.current = setTimeout(() => {
        setToast((current) => (current && current.id === id ? { ...current, isLeaving: true } : current));
        removeTimerRef.current = setTimeout(() => {
          setToast((current) => (current && current.id === id ? null : current));
        }, 320);
      }, duration);
    };

    // 2. Network connectivity listeners
    const handleOnline = () => {
      // Only show "Back online" if we were actually offline previously
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        showToast("online");
      }
    };

    const handleOffline = () => {
      wasOfflineRef.current = true;
      showToast("offline");
    };

    if (typeof window !== "undefined") {
      // Check initial connectivity status
      if (!navigator.onLine) {
        wasOfflineRef.current = true;
        showToast("offline");
      } else {
        wasOfflineRef.current = false;
      }

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  const handleDismiss = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);

    setToast((current) => (current ? { ...current, isLeaving: true } : null));
    removeTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 320);
  };

  if (!toast) return null;

  const isOnline = toast.status === "online";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`connectivity-toast-container ${isOnline ? "connectivity-toast-online" : "connectivity-toast-offline"} ${
        toast.isLeaving ? "is-leaving" : ""
      }`}
    >
      <div className="connectivity-toast-icon-badge" aria-hidden="true">
        {isOnline ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        )}
      </div>

      <div className="connectivity-toast-body">
        <span className="connectivity-toast-title">
          {isOnline ? "Back Online" : "You're Offline"}
        </span>
        <span className="connectivity-toast-desc">
          {isOnline ? "Internet connection restored" : "AI matches playable without connection"}
        </span>
      </div>

      <button
        type="button"
        className="connectivity-toast-close"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

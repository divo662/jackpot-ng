"use client";

import React, { useState } from "react";
import { MiniMusicPlayer } from "@/components/MiniMusicPlayer";
import { MAX_PLAYER_NAME_LENGTH } from "@/lib/session";
import type { UserAccount } from "@/lib/account";

export interface JackpotNavBarProps {
  nickname: string;
  profileDraft: string;
  setProfileDraft: (name: string) => void;
  saveProfileName: () => Promise<void> | void;
  settingsStatus?: string | null;
  account?: UserAccount | null;
  onOpenAuth?: () => void;
  onOpenProfileSetup?: () => void;
  onNavigateHome?: () => void;
  onNavigateSettings?: () => void;
  showBack?: boolean;
  onBack?: () => void;
}

export function JackpotNavBar({
  nickname,
  profileDraft,
  setProfileDraft,
  saveProfileName,
  settingsStatus,
  account,
  onOpenAuth,
  onOpenProfileSetup,
  onNavigateHome,
  showBack,
  onBack,
}: JackpotNavBarProps) {
  const initial = account?.avatar || (nickname.trim()[0] || "👑").toUpperCase();
  const [copiedShare, setCopiedShare] = useState(false);

  const handleShareProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    const wins = account?.stats.wins ?? 0;
    const jackpots = account?.stats.jackpotsCalled ?? 0;
    const suspects = account?.stats.suspectsCaught ?? 0;
    const name = account?.username || nickname || "Player";
    const title = account?.title || "Table Legend";
    const shareText = `👑 Jackpot VIP Player: ${name} (${title})\n🏆 ${wins} Wins · ♛ ${jackpots} Jackpots · 🎯 ${suspects} Suspect Catches\nPlay Jackpot: ${typeof window !== "undefined" ? window.location.origin : ""}`;

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2200);
    }
  };

  return (
    <header className="jackpot-nav">
      <div className="jackpot-nav-left">
        {showBack && onBack ? (
          <button
            type="button"
            className="game-ghost-btn jackpot-back-btn"
            onClick={onBack}
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="back-btn-label">Back</span>
          </button>
        ) : null}

        <div
          className="jackpot-wordmark"
          onClick={onNavigateHome}
          role={onNavigateHome ? "button" : undefined}
          tabIndex={onNavigateHome ? 0 : undefined}
          onKeyDown={(e) => {
            if (onNavigateHome && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onNavigateHome();
            }
          }}
          style={onNavigateHome ? { cursor: "pointer" } : undefined}
        >
          <span className="wordmark-crown" aria-hidden="true">♛</span>
          <strong>JACKPOT</strong>
          <small>PLAY · PASS · WIN</small>
        </div>
      </div>

      <div className="jackpot-nav-tools">
        <MiniMusicPlayer />
       
        <details className="profile-menu">
          <summary aria-label={`Open player profile for ${nickname || "Player"}`}>
            <span className="profile-avatar">{initial}</span>
            <span className="profile-name">{nickname || "Player"}</span>
            <svg className="profile-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="profile-popover">
            {account ? (
              <div className="vip-player-card">
                <div className="vip-card-header">
                  <span className="vip-member-tag">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                    </svg>
                    VIP MEMBER
                  </span>
                  <span className="vip-rank-pill">NEON SYNCED ✓</span>
                </div>

                <div className="vip-player-profile-row">
                  <div className="vip-avatar-badge">{account.avatar || "👑"}</div>
                  <div className="vip-identity-text">
                    <strong className="vip-username">{account.username}</strong>
                    <span className="vip-title-tag">{account.title || "Table Legend"}</span>
                  </div>
                </div>

                <div className="vip-stats-matrix">
                  <div className="vip-stat-tile">
                    <span className="vip-stat-icon">🏆</span>
                    <strong className="vip-stat-val">{account.stats.wins}</strong>
                    <span className="vip-stat-lbl">WINS</span>
                  </div>
                  <div className="vip-stat-tile">
                    <span className="vip-stat-icon">♛</span>
                    <strong className="vip-stat-val">{account.stats.jackpotsCalled}</strong>
                    <span className="vip-stat-lbl">JACKPOTS</span>
                  </div>
                  <div className="vip-stat-tile">
                    <span className="vip-stat-icon">🎯</span>
                    <strong className="vip-stat-val">{account.stats.suspectsCaught}</strong>
                    <span className="vip-stat-lbl">SUSPECTS</span>
                  </div>
                </div>

                <div className="vip-card-actions">
                  <button
                    type="button"
                    className={`vip-share-card-btn ${copiedShare ? "copied" : ""}`}
                    onClick={handleShareProfile}
                  >
                    {copiedShare ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Share Player Card</span>
                      </>
                    )}
                  </button>

                  {onOpenProfileSetup && (
                    <button
                      type="button"
                      className="vip-edit-profile-btn"
                      onClick={onOpenProfileSetup}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      <span>Edit Profile &amp; AI Partner</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="guest-player-card">
                <span className="mini-tag">GUEST PROFILE</span>
                <label htmlFor="nav-player-name">Display name</label>
                <input
                  id="nav-player-name"
                  value={profileDraft}
                  maxLength={MAX_PLAYER_NAME_LENGTH}
                  onChange={(event) => setProfileDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveProfileName();
                  }}
                />
                <small>{profileDraft.length}/{MAX_PLAYER_NAME_LENGTH} characters</small>
                <p>Your guest name is saved on this browser.</p>
                <button
                  type="button"
                  className="profile-save-button"
                  onClick={() => void saveProfileName()}
                  disabled={!profileDraft.trim()}
                >
                  Save name
                </button>
                {onOpenAuth && (
                  <button
                    type="button"
                    className="guest-prompt-btn"
                    onClick={onOpenAuth}
                    style={{ width: "100%", marginTop: "10px", padding: "9px 12px" }}
                  >
                    ✦ Create Free Account to Save
                  </button>
                )}
                {settingsStatus ? <small role="status">{settingsStatus}</small> : null}
              </div>
            )}
          </div>
        </details>
      </div>
    </header>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useMusic } from "@/components/MusicProvider";
import { isSfxMuted, setSfxMuted } from "@/lib/preferences";
import { unlockAndPlayTestSound, unlockAudioContext } from "@/lib/sound";

export function MiniMusicPlayer() {
  const {
    soundOn,
    toggleSound,
    nextTrack,
    prevTrack,
    isPlaying,
    trackMeta,
  } = useMusic();

  const activePlaying = soundOn && isPlaying;
  const [showTooltip, setShowTooltip] = useState(false);
  const [sfxMuted, setSfxMutedState] = useState(false);

  useEffect(() => {
    setSfxMutedState(isSfxMuted());
    const handleSfxChange = (e: Event) => {
      const custom = e as CustomEvent<{ muted: boolean }>;
      setSfxMutedState(custom.detail?.muted ?? isSfxMuted());
    };
    window.addEventListener("jackpot:sfx-change", handleSfxChange);
    return () => window.removeEventListener("jackpot:sfx-change", handleSfxChange);
  }, []);

  const handleToggleSfx = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !sfxMuted;
    setSfxMutedState(nextMuted);
    setSfxMuted(nextMuted);
    if (!nextMuted) {
      // Immediately unlock Web Audio and play test chime to confirm activation
      unlockAndPlayTestSound();
    } else {
      unlockAudioContext();
    }
  };

  return (
    <div
      className="theme-music-player"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Mini spinning vinyl / track disc */}
      <button
        type="button"
        className={`theme-player-disc ${activePlaying ? "spinning" : ""}`}
        onClick={toggleSound}
        title={activePlaying ? "Pause background music" : "Play background music"}
        aria-label={activePlaying ? "Pause background music" : "Play background music"}
      >
        <span className="disc-ring ring-outer" />
        <span className="disc-ring ring-inner" />
        <span className="disc-center-dot" />
      </button>

      {/* Track Name */}
      <div className="theme-player-info" onClick={nextTrack} title="Click to skip to next track">
        <span className="theme-player-label">MUSIC</span>
        <span className="theme-player-title">{trackMeta.title}</span>
      </div>

      {/* Control Buttons */}
      <div className="theme-player-controls">
        {/* Prev Track */}
        <button
          type="button"
          className="theme-player-btn prev-btn"
          onClick={prevTrack}
          title="Previous track"
          aria-label="Previous track"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>

        {/* Play / Pause Toggle */}
        <button
          type="button"
          className={`theme-player-btn play-btn ${activePlaying ? "playing" : ""}`}
          onClick={toggleSound}
          title={activePlaying ? "Pause music" : "Play music"}
          aria-label={activePlaying ? "Pause music" : "Play music"}
        >
          {activePlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Next Track */}
        <button
          type="button"
          className="theme-player-btn next-btn"
          onClick={nextTrack}
          title="Next track"
          aria-label="Next track"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
        </button>

        {/* SFX Toggle Button */}
        <button
          type="button"
          className={`theme-player-btn sfx-btn ${sfxMuted ? "sfx-muted" : "sfx-active"}`}
          onClick={handleToggleSfx}
          title={sfxMuted ? "Table Sound Effects: MUTED (Click to activate & test)" : "Table Sound Effects: ON (Click to mute / test)"}
          aria-label={sfxMuted ? "Activate sound effects" : "Mute sound effects"}
        >
          <span style={{ fontSize: "11px", display: "inline-flex" }}>{sfxMuted ? "🔇" : "🔊"}</span>
        </button>
      </div>

      {/* Floating Track Tooltip on hover */}
      {showTooltip && (
        <div className="theme-player-tooltip" role="tooltip">
          <span>{trackMeta.artist} — {trackMeta.title} · SFX: {sfxMuted ? "Off" : "On"}</span>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useMusic } from "@/components/MusicProvider";
import {
  isSfxMuted,
  setSfxMuted,
  type GamePreferences,
  writePreferences,
} from "@/lib/preferences";
import { unlockAndPlayTestSound } from "@/lib/sound";
import {
  type BotArchetypeId,
  BOT_ARCHETYPES,
  ALL_ARCHETYPE_IDS,
} from "@/lib/bot/archetypes";
import { type BotDifficulty } from "@/lib/bot/profiles";

interface SettingsPageContentProps {
  // Audio settings
  preferences: GamePreferences;
  setPreferences: React.Dispatch<React.SetStateAction<GamePreferences>>;
  // AI Partner settings
  selectedPartnerId: BotArchetypeId;
  onSelectPartner: (id: BotArchetypeId) => void;
  botDifficulty: BotDifficulty;
  onChangeDifficulty: (diff: BotDifficulty) => void;
  // Offline Team Name setting
  offlineTeamName: string;
  setOfflineTeamName: (name: string) => void;
  // Account / Guest status
  isGuest?: boolean;
  onPromptAccount?: () => void;
  // Navigation / Action
  onStartOfflinePlay: () => void;
  onBack: () => void;
}

export function SettingsPageContent({
  preferences,
  setPreferences,
  selectedPartnerId,
  onSelectPartner,
  botDifficulty,
  onChangeDifficulty,
  offlineTeamName,
  setOfflineTeamName,
  isGuest,
  onPromptAccount,
  onStartOfflinePlay,
  onBack,
}: SettingsPageContentProps) {
  const { soundOn, toggleSound, volume, setVolume, trackMeta, nextTrack, prevTrack, isPlaying } = useMusic();
  const [sfxMutedState, setSfxMutedState] = useState(() => isSfxMuted());
  const [teamNameDraft, setTeamNameDraft] = useState(offlineTeamName);
  const [saveToast, setSaveToast] = useState("");

  const selectedBot = BOT_ARCHETYPES[selectedPartnerId] ?? BOT_ARCHETYPES.strategist;

  const handleToggleSfx = () => {
    const nextMuted = !sfxMutedState;
    setSfxMutedState(nextMuted);
    setSfxMuted(nextMuted);
    if (!nextMuted) {
      unlockAndPlayTestSound();
    }
  };

  const handleSaveTeamName = () => {
    const clean = teamNameDraft.trim().slice(0, 18) || "Alpha";
    setOfflineTeamName(clean);
    setTeamNameDraft(clean);
    try {
      localStorage.setItem("jackpot_offline_team_name", clean);
    } catch {}
    setSaveToast("Team name saved!");
    setTimeout(() => setSaveToast(""), 2200);
  };

  const handleToggleAnimations = () => {
    const nextAnim = !preferences.animationsEnabled;
    const nextPrefs = { ...preferences, animationsEnabled: nextAnim };
    setPreferences(nextPrefs);
    writePreferences(nextPrefs);
  };

  return (
    <div className="settings-page-container">
      {/* Page Header */}
      <div className="settings-header-banner">
        <div className="settings-header-title-group">
          <span className="settings-pill-badge">PREFERENCES &amp; ROSTER</span>
          <h1 className="settings-headline">Settings &amp; AI Partner</h1>
          <p className="settings-subtitle">
            Configure your audio, customize your offline team name, and select your AI partner archetype.
          </p>
        </div>
        <div className="settings-header-quick-actions">
          <button type="button" className="game-primary-btn play-offline-direct-btn" onClick={onStartOfflinePlay}>
            <span>PLAY OFFLINE MATCH →</span>
          </button>
        </div>
      </div>

      <div className="settings-sections-stack">
        {/* SECTION 1: AUDIO & TABLE SETTINGS */}
        <section className="settings-section-card audio-section">
          <div className="settings-section-header">
            <div className="section-title-wrap">
              <span className="section-icon">🔊</span>
              <div>
                <h2 className="section-title">Audio &amp; Immersion Settings</h2>
                <p className="section-desc">Manage background music, sound effects volume, and visual effects.</p>
              </div>
            </div>
          </div>

          <div className="settings-controls-grid">
            {/* Music Master Toggle */}
            <div className="setting-control-item">
              <div className="setting-info">
                <strong>Background Music</strong>
                <small>{soundOn ? `Playing: ${trackMeta.title}` : "Muted"}</small>
              </div>
              <div className="setting-actions">
                <button
                  type="button"
                  className={`toggle-switch-btn ${soundOn ? "active" : ""}`}
                  onClick={toggleSound}
                  aria-pressed={soundOn}
                >
                  <span className="toggle-switch-handle" />
                </button>
              </div>
            </div>

            {/* Music Volume Slider */}
            <div className="setting-control-item">
              <div className="setting-info">
                <strong>Music Volume</strong>
                <small>{Math.round(volume * 100)}%</small>
              </div>
              <div className="setting-actions slider-action">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="volume-slider-range"
                  aria-label="Music volume slider"
                />
              </div>
            </div>

            {/* SFX Toggle */}
            <div className="setting-control-item">
              <div className="setting-info">
                <strong>Table Sound Effects (SFX)</strong>
                <small>{sfxMutedState ? "Card sounds & gestures muted" : "Card flips, gestures & suspect chimes on"}</small>
              </div>
              <div className="setting-actions">
                <button
                  type="button"
                  className={`toggle-switch-btn ${!sfxMutedState ? "active" : ""}`}
                  onClick={handleToggleSfx}
                  aria-pressed={!sfxMutedState}
                >
                  <span className="toggle-switch-handle" />
                </button>
              </div>
            </div>

            {/* Visual Animations */}
            <div className="setting-control-item">
              <div className="setting-info">
                <strong>Card Flight &amp; Table Animations</strong>
                <small>{preferences.animationsEnabled ? "Smooth 3D table arcs enabled" : "Reduced motion mode"}</small>
              </div>
              <div className="setting-actions">
                <button
                  type="button"
                  className={`toggle-switch-btn ${preferences.animationsEnabled ? "active" : ""}`}
                  onClick={handleToggleAnimations}
                  aria-pressed={preferences.animationsEnabled}
                >
                  <span className="toggle-switch-handle" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: OFFLINE PLAY & TEAM NAME */}
        <section className="settings-section-card team-section">
          <div className="settings-section-header">
            <div className="section-title-wrap">
              <span className="section-icon">🛡️</span>
              <div>
                <h2 className="section-title">Offline Team Name &amp; Table Difficulty</h2>
                <p className="section-desc">Customize your team branding and set the AI difficulty level for local play.</p>
              </div>
            </div>
          </div>

          <div className="team-config-row">
            <div className="team-name-input-group">
              <label htmlFor="offline-team-name-input" className="team-input-label">
                YOUR TEAM NAME (OFFLINE PLAY)
              </label>
              <div className="team-input-with-button">
                <input
                  id="offline-team-name-input"
                  type="text"
                  maxLength={18}
                  value={teamNameDraft}
                  onChange={(e) => setTeamNameDraft(e.target.value)}
                  placeholder="e.g. Royal Flush, Alpha, Fire"
                  className="team-name-input"
                />
                <button
                  type="button"
                  className="game-primary-btn save-team-btn"
                  onClick={handleSaveTeamName}
                >
                  Save Team
                </button>
              </div>
              <div className="team-input-hint">
                <span>Current team name: <strong>{offlineTeamName}</strong></span>
                {saveToast && <span className="save-toast-tag">✓ {saveToast}</span>}
              </div>
            </div>

            {/* Table Difficulty */}
            <div className="table-difficulty-group">
              <span className="diff-title-label">TABLE DIFFICULTY</span>
              <div className="diff-pills-row" role="radiogroup" aria-label="Table Difficulty">
                {(["easy", "normal", "hard"] as const).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    className={`diff-pill-btn ${botDifficulty === diff ? `active ${diff}` : ""}`}
                    onClick={() => onChangeDifficulty(diff)}
                  >
                    <span className={`diff-dot ${diff}`} />
                    <span className="capitalize">{diff}</span>
                  </button>
                ))}
              </div>
              <small className="diff-desc-note">
                {botDifficulty === "easy" && "Easy: AI makes occasional slips and slower calls. Great for relaxed play."}
                {botDifficulty === "normal" && "Normal: Balanced AI with realistic human perception and sharp reflexes."}
                {botDifficulty === "hard" && "Hard: Sharp pattern recognition and defensive card passing. Never cheats."}
              </small>
            </div>
          </div>
        </section>

        {/* SECTION 3: AI PARTNER ROSTER SELECTION */}
        <section className="settings-section-card partner-roster-section">
          <div className="settings-section-header">
            <div className="section-title-wrap">
              <span className="section-icon">🤖</span>
              <div>
                <h2 className="section-title">AI Partner Archetypes</h2>
                <p className="section-desc">
                  Select your permanent offline partner. Each bot possesses unique gameplay attributes that dictate how they signal, suspect, and coordinate.
                </p>
              </div>
            </div>
            <div className="current-partner-pill">
              <span>Active Partner:</span>
              <strong>{selectedBot.name} {selectedBot.avatar}</strong>
            </div>
          </div>

          {isGuest && (
            <div className="guest-locked-partner-banner">
              <span className="guest-lock-desc">
                🔒 Guest Mode: The Strategist is your default partner. Create a free account to unlock all 6 AI personalities!
              </span>
              {onPromptAccount && (
                <button type="button" className="guest-unlock-cta" onClick={onPromptAccount}>
                  Unlock Free
                </button>
              )}
            </div>
          )}

          {/* 6 Archetype Cards Grid */}
          <div className="settings-partner-grid">
            {ALL_ARCHETYPE_IDS.map((id) => {
              const bot = BOT_ARCHETYPES[id];
              const isSelected = selectedPartnerId === id;
              const isLocked = Boolean(isGuest && id !== "strategist");
              return (
                <div
                  key={id}
                  className={`partner-character-card ${isSelected ? "selected" : ""} ${isLocked ? "guest-locked" : ""}`}
                  onClick={() => {
                    if (isLocked) {
                      onPromptAccount?.();
                    } else {
                      onSelectPartner(id);
                    }
                  }}
                >
                  {/* Card Header */}
                  <div className="partner-card-header">
                    <div className={`partner-avatar-disc ${bot.avatarBg}`}>
                      <span className="partner-avatar-emoji">{bot.avatar}</span>
                    </div>
                    <div className="partner-meta">
                      <h3 className="partner-name">{bot.name}</h3>
                      <p className="partner-tagline">“{bot.tagline}”</p>
                    </div>
                    {isSelected && <span className="partner-checked-badge">✓ Active Partner</span>}
                  </div>

                  {/* 5 Core Attributes */}
                  <div className="partner-attributes-list">
                    <AttributeRow label="Signal Sense" value={bot.attributes.signalSense} />
                    <AttributeRow label="Deception" value={bot.attributes.deception} />
                    <AttributeRow label="Aggression" value={bot.attributes.aggression} />
                    <AttributeRow label="Teamwork" value={bot.attributes.teamwork} />
                    <AttributeRow label="Risk" value={bot.attributes.risk} />
                  </div>

                  {/* Strategy Description */}
                  <div className="partner-strategy-box">
                    <p className="partner-description-text">{bot.playerDescription}</p>
                    <div className="partner-best-for">
                      <span className="best-for-label">Best for:</span>
                      <strong className="best-for-val">{bot.bestFor}</strong>
                    </div>
                  </div>

                  {/* Selection Button */}
                  <button
                    type="button"
                    className={`partner-select-action-btn ${isSelected ? "active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPartner(id);
                    }}
                  >
                    {isSelected ? "PARTNER ACTIVE ✓" : "CHOOSE THIS PARTNER"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Dock / Navigation */}
        <div className="settings-footer-dock">
          <button type="button" className="game-ghost-btn" onClick={onBack}>
            ← Return to Menu
          </button>
          <button type="button" className="game-primary-btn start-match-btn" onClick={onStartOfflinePlay}>
            Start Offline Match with {selectedBot.name} →
          </button>
        </div>
      </div>
    </div>
  );
}

function AttributeRow({ label, value }: { label: string; value: number }) {
  const filledCount = Math.round(value / 10);
  const blocks = Array.from({ length: 10 }, (_, i) => i < filledCount);

  return (
    <div className="attribute-row">
      <div className="attribute-info">
        <span className="attribute-label">{label}</span>
        <span className="attribute-num">{value}</span>
      </div>
      <div className="attribute-meter-blocks" aria-label={`${label}: ${value}/100`}>
        {blocks.map((filled, idx) => (
          <span
            key={idx}
            className={`attribute-block ${filled ? "filled" : "empty"}`}
          />
        ))}
      </div>
    </div>
  );
}

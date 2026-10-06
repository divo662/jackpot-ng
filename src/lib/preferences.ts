export const PREFERENCES_KEY = "jackpot:preferences:v1";
export const SFX_MUTED_KEY = "jackpot:sfx:muted:v1";

export type GamePreferences = {
  soundEnabled: boolean;
  soundEffects: boolean;
  soundVolume: number;
  animationsEnabled: boolean;
};

export const DEFAULT_PREFERENCES: GamePreferences = {
  soundEnabled: true,
  soundEffects: true,
  soundVolume: 0.65,
  animationsEnabled: true,
};

export function isSfxMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SFX_MUTED_KEY) === "true";
}

export function setSfxMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SFX_MUTED_KEY, muted ? "true" : "false");
  window.dispatchEvent(new CustomEvent("jackpot:sfx-change", { detail: { muted } }));
}

export function readPreferences(): GamePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    const muted = isSfxMuted();
    if (!raw) {
      return { ...DEFAULT_PREFERENCES, soundEffects: !muted };
    }
    const value = JSON.parse(raw) as Partial<GamePreferences>;
    return {
      soundEnabled: typeof value.soundEnabled === "boolean" ? value.soundEnabled : DEFAULT_PREFERENCES.soundEnabled,
      // SFX is always active unless explicitly muted via the SFX toggle button
      soundEffects: !muted,
      soundVolume: typeof value.soundVolume === "number" && value.soundVolume >= 0 && value.soundVolume <= 1 ? value.soundVolume : DEFAULT_PREFERENCES.soundVolume,
      animationsEnabled: typeof value.animationsEnabled === "boolean" ? value.animationsEnabled : DEFAULT_PREFERENCES.animationsEnabled,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(preferences: GamePreferences): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  }
}

export const PREFERENCES_KEY = "jackpot:preferences:v1";

export type GamePreferences = {
  soundEnabled: boolean;
  soundEffects: boolean;
  soundVolume: number;
  animationsEnabled: boolean;
};

export const DEFAULT_PREFERENCES: GamePreferences = {
  soundEnabled: true,
  soundEffects: true,
  soundVolume: 0.55,
  animationsEnabled: true,
};

export function readPreferences(): GamePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const value = JSON.parse(raw) as Partial<GamePreferences>;
    return {
      soundEnabled: typeof value.soundEnabled === "boolean" ? value.soundEnabled : DEFAULT_PREFERENCES.soundEnabled,
      soundEffects: typeof value.soundEffects === "boolean" ? value.soundEffects : DEFAULT_PREFERENCES.soundEffects,
      soundVolume: typeof value.soundVolume === "number" ? Math.min(1, Math.max(0, value.soundVolume)) : DEFAULT_PREFERENCES.soundVolume,
      animationsEnabled: typeof value.animationsEnabled === "boolean" ? value.animationsEnabled : DEFAULT_PREFERENCES.animationsEnabled,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(preferences: GamePreferences): void {
  if (typeof window !== "undefined") window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

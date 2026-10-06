"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { readPreferences, writePreferences } from "@/lib/preferences";

export const GAME_MUSIC_TRACKS = [
  "/audio/track2.mp3", // 1.8 MB (lightest track for fast first load)
  "/audio/track9.mp3", // 2.0 MB
  "/audio/track11.mp3", // 3.6 MB
  "/audio/track8.mp3", // 4.0 MB
  "/audio/track7.mp3", // 4.0 MB
  "/audio/track12.mp3", // 5.4 MB
  "/audio/track4.mp3", // 5.5 MB
  "/audio/track3.mp3", // 5.5 MB
  "/audio/track1.mp3", // 5.6 MB
  "/audio/track6.mp3", // 6.0 MB
  "/audio/track5.mp3", // 7.3 MB
  "/audio/track10.mp3", // 14.9 MB
];

export const GAME_TRACK_METADATA = [
  { title: "Afro Beats", artist: "Naija Vibe" },
  { title: "Lagos Nights", artist: "Table Chill" },
  { title: "Amapiano Rush", artist: "Groove Pulse" },
  { title: "Palmwine Highlife", artist: "Sweet Jam" },
  { title: "Jackpot Anthem", artist: "Winner Vibe" },
  { title: "Whot Rhythm", artist: "Card Magic" },
  { title: "Calm Breeze", artist: "Smooth Deck" },
  { title: "Midnight Lounge", artist: "Secret Signal" },
  { title: "Afro Fusion", artist: "Party Beat" },
  { title: "High Roller", artist: "Victory Dance" },
  { title: "Sunset Session", artist: "Table Talk" },
  { title: "Golden Hour", artist: "Jackpot Flow" },
];

type MusicContextValue = {
  soundOn: boolean;
  toggleSound: () => void;
  volume: number;
  setVolume: (vol: number) => void;
  trackIndex: number;
  setTrackIndex: (idx: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  seek: (seconds: number) => void;
  trackMeta: { title: string; artist: string };
};

const MusicContext = createContext<MusicContextValue>({
  soundOn: true,
  toggleSound: () => {},
  volume: 0.55,
  setVolume: () => {},
  trackIndex: 0,
  setTrackIndex: () => {},
  nextTrack: () => {},
  prevTrack: () => {},
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  seek: () => {},
  trackMeta: GAME_TRACK_METADATA[0],
});

export function useMusic() {
  return useContext(MusicContext);
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlocked = useRef(false);
  // Web Audio gain node: HTMLMediaElement.volume is ignored on iOS/iPadOS, so route through a GainNode.
  const gainRef = useRef<GainNode | null>(null);
  const volumeRef = useRef(0);
  const [soundOn, setSoundOn] = useState(() => {
    const prefs = readPreferences();
    return prefs.soundEnabled;
  });
  const [volume, setVolumeState] = useState(() => readPreferences().soundVolume);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Sync volume to audio element (and gain node once Web Audio is set up)
  useEffect(() => {
    volumeRef.current = volume;
    const level = Math.min(1, Math.max(0, volume * 0.7));
    if (gainRef.current) gainRef.current.gain.value = level;
    const audio = audioRef.current;
    if (audio) audio.volume = gainRef.current ? 1 : level;
  }, [volume]);

  const ensureGain = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || gainRef.current) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, volumeRef.current * 0.7));
      source.connect(gain).connect(ctx.destination);
      audio.volume = 1;
      gainRef.current = gain;
      void ctx.resume().catch(() => {});
    } catch {
      /* fall back to element.volume */
    }
  }, []);

  // Handle play/pause state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!soundOn) {
      audio.pause();
      return;
    }
    if (unlocked.current) {
      void audio.play().catch(() => {});
    }
  }, [soundOn, trackIndex]);

  // Unlock audio on first user gesture (satisfies browser autoplay policies)
  useEffect(() => {
    const unlockAudio = () => {
      unlocked.current = true;
      ensureGain();
      const audio = audioRef.current;
      if (audio && soundOn) {
        void audio.play().catch(() => {});
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio, { passive: true });
    window.addEventListener("touchstart", unlockAudio, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, [soundOn, ensureGain]);

  // Pre-buffer the upcoming track in the playlist for gapless transitions
  useEffect(() => {
    const nextIdx = (trackIndex + 1) % GAME_MUSIC_TRACKS.length;
    const nextSrc = GAME_MUSIC_TRACKS[nextIdx];
    const preloader = new Audio();
    preloader.preload = "auto";
    preloader.src = nextSrc;
    return () => {
      preloader.src = "";
    };
  }, [trackIndex]);

  const toggleSound = useCallback(() => {
    setSoundOn((current) => {
      const next = !current;
      const prefs = readPreferences();
      writePreferences({ ...prefs, soundEnabled: next });
      const audio = audioRef.current;
      if (audio) {
        if (next) {
          unlocked.current = true;
          ensureGain();
          void audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      }
      return next;
    });
  }, [ensureGain]);

  const setVolume = useCallback((newVol: number) => {
    const clamped = Math.min(1, Math.max(0, newVol));
    setVolumeState(clamped);
    const prefs = readPreferences();
    writePreferences({ ...prefs, soundVolume: clamped });
  }, []);

  const nextTrack = useCallback(() => {
    setTrackIndex((current) => (current + 1) % GAME_MUSIC_TRACKS.length);
  }, []);

  const prevTrack = useCallback(() => {
    setTrackIndex((current) => (current - 1 + GAME_MUSIC_TRACKS.length) % GAME_MUSIC_TRACKS.length);
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio && isFinite(seconds)) {
      audio.currentTime = seconds;
      setCurrentTime(seconds);
    }
  }, []);

  const handleEnded = () => {
    nextTrack();
  };

  const handlePlaying = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio && audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }
  };

  const trackMeta = GAME_TRACK_METADATA[trackIndex] || {
    title: `Track ${trackIndex + 1}`,
    artist: "Jackpot OST",
  };

  return (
    <MusicContext.Provider
      value={{
        soundOn,
        toggleSound,
        volume,
        setVolume,
        trackIndex,
        setTrackIndex,
        nextTrack,
        prevTrack,
        isPlaying,
        currentTime,
        duration,
        seek,
        trackMeta,
      }}
    >
      {/* Persistent Audio element survives all route changes */}
      <audio
        ref={audioRef}
        src={GAME_MUSIC_TRACKS[trackIndex]}
        preload="auto"
        onEnded={handleEnded}
        onPlaying={handlePlaying}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />
      {children}
    </MusicContext.Provider>
  );
}

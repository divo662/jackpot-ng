export type GameSound =
  | "pass"
  | "card_click"
  | "signal"
  | "reaction"
  | "success"
  | "alert"
  | "jackpot"
  | "caught"
  | "false_call"
  | "suspense"
  | "countdown";

let audioContext: AudioContext | null = null;

/** Ensure the AudioContext is resumed and unlocked upon user gesture. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!audioContext) {
    audioContext = new AudioCtx();
  }

  return audioContext;
}

/** Explicitly resume context and play a tiny silent buffer to unlock iOS Safari hardware output */
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Ignore buffer creation exceptions in background tabs
  }
}

// Global user interaction listener to unlock Web Audio on mobile/desktop browsers
if (typeof window !== "undefined") {
  const unlock = () => {
    unlockAudioContext();
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("click", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

/**
 * Plays a quick test chime and unlocks audio context. Useful for SFX toggle test.
 */
export function unlockAndPlayTestSound(): void {
  unlockAudioContext();
  playGameSound("signal", 0.7);
}

/**
 * Rich procedural sound synthesizer for card games.
 * Generates tactile card swishes, snaps, bells, chimes, and fanfare
 * directly using the Web Audio API without requiring external MP3 assets.
 */
export function playGameSound(sound: GameSound, volume = 0.65): void {
  if (typeof window === "undefined" || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const playNow = () => {
    try {
      renderProceduralSound(ctx, sound, volume);
    } catch (err) {
      console.warn("Sound render error:", err);
    }
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(playNow).catch(() => {});
  } else {
    playNow();
  }
}

function renderProceduralSound(ctx: AudioContext, sound: GameSound, volume: number): void {
  const masterVol = Math.min(1, Math.max(0.2, volume));
  const now = ctx.currentTime;

  switch (sound) {
    case "pass": {
      // Realistic card sliding whoosh across felt: bandpass noise + subtle body tone
      const bufferSize = Math.floor(ctx.sampleRate * 0.18);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(650, now + 0.16);
      filter.Q.setValueAtTime(1.6, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(masterVol * 0.85, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.18);

      // Low card friction body tone
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.14);
      oscGain.gain.setValueAtTime(masterVol * 0.35, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
      break;
    }

    case "card_click": {
      // Tactile card tap / pick sound (crisp snap)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.05);

      gain.gain.setValueAtTime(masterVol * 0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
      break;
    }

    case "signal": {
      // Gentle, bright social signal chime (Dual bell tone)
      const freqs = [659.25, 880]; // E5, A5
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.001, now + idx * 0.07);
        gain.gain.linearRampToValueAtTime(masterVol * 0.7, now + idx * 0.07 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.32);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.34);
      });
      break;
    }

    case "reaction": {
      // Cheerful bubbly pop (ascending pitch glide)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);

      gain.gain.setValueAtTime(masterVol * 0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }

    case "jackpot": {
      // Royal celebration fanfare: C5 - E5 - G5 - C6 triumphant arpeggio
      const notes = [
        { f: 523.25, t: 0, d: 0.2 },
        { f: 659.25, t: 0.1, d: 0.2 },
        { f: 783.99, t: 0.2, d: 0.25 },
        { f: 1046.5, t: 0.32, d: 0.7 },
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(note.f, now + note.t);

        gain.gain.setValueAtTime(0.001, now + note.t);
        gain.gain.linearRampToValueAtTime(masterVol * 0.75, now + note.t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.t);
        osc.stop(now + note.t + note.d + 0.05);
      });
      break;
    }

    case "caught": {
      // Dramatic brassy suspect intercept sting
      const notes = [
        { f: 880, t: 0, d: 0.12 },
        { f: 587.33, t: 0.1, d: 0.3 },
      ];
      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(note.f, now + note.t);

        gain.gain.setValueAtTime(masterVol * 0.55, now + note.t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.t);
        osc.stop(now + note.t + note.d + 0.05);
      });
      break;
    }

    case "false_call": {
      // Low dual error buzzer
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sawtooth";
      osc2.type = "sawtooth";
      osc1.frequency.setValueAtTime(175, now);
      osc2.frequency.setValueAtTime(140, now);

      gain.gain.setValueAtTime(masterVol * 0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
      break;
    }

    case "success": {
      // Affirmation chime
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + i * 0.07);
        gain.gain.setValueAtTime(masterVol * 0.5, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.26);
      });
      break;
    }

    case "alert": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(330, now + 0.08);
      gain.gain.setValueAtTime(masterVol * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.21);
      break;
    }

    case "suspense": {
      // Low tension heartbeat thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.16);
      gain.gain.setValueAtTime(masterVol * 0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
      break;
    }

    case "countdown": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(masterVol * 0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
      break;
    }
  }
}

export type GameSound = "pass" | "signal" | "reaction" | "success" | "alert" | "jackpot" | "caught" | "false_call" | "suspense" | "countdown";

let audioContext: AudioContext | null = null;

/** Small synthesized cues keep the game audible without loading external audio files. */
export function playGameSound(sound: GameSound, volume: number): void {
  if (typeof window === "undefined" || volume <= 0) return;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;
  audioContext ??= new AudioContextConstructor();
  const context = audioContext;
  if (context.state === "suspended") void context.resume().catch(() => undefined);

  const patterns: Record<GameSound, Array<{ frequency: number; duration: number; delay: number; waveform: OscillatorType }>> = {
    pass: [{ frequency: 480, duration: 0.09, delay: 0, waveform: "triangle" }, { frequency: 640, duration: 0.12, delay: 0.075, waveform: "triangle" }],
    signal: [{ frequency: 660, duration: 0.11, delay: 0, waveform: "sine" }, { frequency: 880, duration: 0.16, delay: 0.09, waveform: "sine" }],
    reaction: [{ frequency: 540, duration: 0.09, delay: 0, waveform: "sine" }],
    success: [{ frequency: 523, duration: 0.14, delay: 0, waveform: "triangle" }, { frequency: 659, duration: 0.14, delay: 0.12, waveform: "triangle" }, { frequency: 784, duration: 0.24, delay: 0.24, waveform: "triangle" }],
    alert: [{ frequency: 440, duration: 0.13, delay: 0, waveform: "sawtooth" }, { frequency: 330, duration: 0.18, delay: 0.15, waveform: "triangle" }],
    jackpot: [
      { frequency: 523.25, duration: 0.15, delay: 0, waveform: "triangle" },
      { frequency: 659.25, duration: 0.15, delay: 0.12, waveform: "triangle" },
      { frequency: 783.99, duration: 0.2, delay: 0.24, waveform: "triangle" },
      { frequency: 1046.5, duration: 0.45, delay: 0.4, waveform: "triangle" },
    ],
    caught: [
      { frequency: 587.33, duration: 0.14, delay: 0, waveform: "sine" },
      { frequency: 880, duration: 0.28, delay: 0.12, waveform: "sine" },
    ],
    false_call: [
      { frequency: 220, duration: 0.2, delay: 0, waveform: "sawtooth" },
      { frequency: 185, duration: 0.3, delay: 0.18, waveform: "sawtooth" },
    ],
    suspense: [
      { frequency: 330, duration: 0.18, delay: 0, waveform: "sine" },
      { frequency: 370, duration: 0.18, delay: 0.16, waveform: "sine" },
      { frequency: 415, duration: 0.22, delay: 0.32, waveform: "sine" },
    ],
    countdown: [
      { frequency: 800, duration: 0.08, delay: 0, waveform: "sine" },
    ],
  };

  const now = context.currentTime;
  for (const note of patterns[sound]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + note.delay;
    oscillator.type = note.waveform;
    oscillator.frequency.setValueAtTime(note.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.12), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.02);
  }
}

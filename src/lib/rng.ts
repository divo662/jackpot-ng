/**
 * Seedable, serializable PRNG (mulberry32).
 * Bots use this instead of Math.random so every game can be replayed exactly
 * from its seed — essential for reproducing bot bugs and balancing difficulty.
 */

export type Rng = {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, max). */
  int(max: number): number;
  /** Float in [min, max]. */
  range(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  pick<T>(values: readonly T[]): T;
  /** Current internal state, so memory can be persisted and resumed. */
  readonly state: number;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => (max <= 0 ? 0 : Math.floor(next() * max)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (values) => {
      if (values.length === 0) throw new Error("Cannot pick from an empty list.");
      return values[Math.floor(next() * values.length)];
    },
    get state() {
      return state;
    },
  };
}

/** Stable 32-bit hash for deriving per-bot seeds from strings (FNV-1a). */
export function hashSeed(...parts: Array<string | number>): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

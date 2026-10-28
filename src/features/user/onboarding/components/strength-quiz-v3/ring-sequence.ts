/**
 * Explainer 8 (owner 28.10, Y8): the rings light up one after another, the last one fills to 100%,
 * turns into the next level and fires confetti. Pure (tested); ExplainRing plays it.
 */

/** Illustration values from the board (not user data). */
export const RING_TARGETS = [5, 60] as const;

/** 0 = nothing lit; 1..2 = ring N lit and filled; 3 = the last ring fills; 4 = level up (confetti). */
export type RingStage = 0 | 1 | 2 | 3 | 4;
export const FINAL_RING_STAGE: RingStage = 4;

/** When each stage starts, ms after the screen opens (index = stage - 1). */
export const RING_STAGE_AT_MS = [500, 1500, 2600, 3500] as const;

export interface RingFrame {
  /** Fill of the two progress rings, 0 while not lit. */
  percents: [number, number];
  lit: [boolean, boolean, boolean];
  /** The last ring's own fill on its way to 100. */
  lastPercent: number;
  levelUp: boolean;
}

export function ringFrame(stage: RingStage): RingFrame {
  return {
    percents: [stage >= 1 ? RING_TARGETS[0] : 0, stage >= 2 ? RING_TARGETS[1] : 0],
    lit: [stage >= 1, stage >= 2, stage >= 3],
    lastPercent: stage >= 3 ? 100 : 0,
    levelUp: stage >= 4,
  };
}

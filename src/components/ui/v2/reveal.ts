/** Timing of RevealOnScroll (boards jr/J2-11): 220ms per block, 80ms between blocks. */
export const REVEAL_DURATION_MS = 220;
export const REVEAL_STAGGER_MS = 80;
/** Cap so a long list never waits seconds for its last block. */
export const REVEAL_MAX_DELAY_MS = 400;

export function revealDelayMs(index: number): number {
  return Math.min(Math.max(0, index) * REVEAL_STAGGER_MS, REVEAL_MAX_DELAY_MS);
}

export function revealStyle(o: { shown: boolean; index: number; reduce: boolean }): {
  opacity: number;
  transform?: string;
  transition?: string;
} {
  if (o.reduce) return { opacity: 1 };
  return {
    opacity: o.shown ? 1 : 0,
    transform: o.shown ? 'translateY(0)' : 'translateY(14px)',
    transition: `opacity ${REVEAL_DURATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) ${revealDelayMs(o.index)}ms, transform ${REVEAL_DURATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) ${revealDelayMs(o.index)}ms`,
  };
}

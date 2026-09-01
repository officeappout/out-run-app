/**
 * Smart default weekday picks for a given running frequency. Extracted out
 * of `RunningScheduleStep.tsx` (01.09.2026, David's review of the min-
 * frequency-2 fix) so it's unit-testable — that component is a full 'use
 * client' React tree with no jsdom in this repo's vitest, so a pure helper
 * has to live outside it to get test coverage at all.
 *
 * The real rule this function must satisfy for every input, legal or not:
 * `getSmartDefaultDays(f).length === f`. The original version violated this
 * for its own `default:` branch (`freq=1` and anything else unexpected fell
 * back to a hardcoded single-day array, `[0]`, silently wrong for any freq
 * other than 1) — that mismatch is exactly the class of bug the min-
 * frequency-2 fix exists to close elsewhere; this file closes it here too.
 * 2, 3, 4 (the legal `RunningFrequency` range, `running-frequency-bounds.ts`)
 * keep their hand-picked "good spacing" choices (a product decision, not
 * derivable from a formula) — the fallback below is a generic even-spread
 * formula, used only for a frequency outside that range (should be
 * unreachable given every live caller clamps first, but a caller that
 * doesn't must still get an array whose length matches what it asked for,
 * not a silently-wrong one).
 */
export const getSmartDefaultDays = (freq: number): number[] => {
  switch (freq) {
    case 2: return [1, 4];       // Mon, Thu
    case 3: return [0, 2, 4];    // Sun, Tue, Thu
    case 4: return [1, 2, 4, 5]; // Mon, Tue, Thu, Fri
    default: {
      if (freq <= 0) return [];
      // Evenly spread across the 7-day week -- not a hand-tuned "smart"
      // choice like the cases above, just a length-correct fallback.
      return Array.from({ length: freq }, (_, i) => Math.floor((i * 7) / freq) % 7);
    }
  }
};

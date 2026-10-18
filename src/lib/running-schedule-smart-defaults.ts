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

/**
 * Strength-aware default run days (owner, 18.10.2026): the silent signup
 * default used to be getSmartDefaultDays(freq) unconditionally, so a user
 * who already trains strength on e.g. Sun/Tue/Thu got runs on exactly the
 * same three days. This picks `freq` run days (0=Sun..6=Sat) that:
 *
 *   1. overlap the given strength days as little as possible (zero whenever
 *      freq + strength days fit in the week; minimal overlap otherwise),
 *   2. among those, are spread as evenly as possible across the week
 *      (smallest sum of squared circular gaps, so Sat->Sun counts as
 *      consecutive),
 *   3. tie-break: keep as many of getSmartDefaultDays(freq)'s days as
 *      possible, then lowest indices — deterministic.
 *
 * With no strength days it returns getSmartDefaultDays(freq) unchanged, so
 * a pure-runner signup gets exactly today's default.
 */
export function pickRunDaysAvoidingStrength(freq: number, strengthDayIndices: number[]): number[] {
  const n = Math.max(0, Math.min(7, Math.round(freq)));
  const blocked = new Set(strengthDayIndices.filter((i) => Number.isInteger(i) && i >= 0 && i <= 6));
  if (blocked.size === 0) return getSmartDefaultDays(n);
  if (n === 0) return [];
  if (n === 7) return [0, 1, 2, 3, 4, 5, 6];

  const preferred = new Set(getSmartDefaultDays(n));
  let best: number[] = [];
  let bestKey: number[] | null = null;

  for (let mask = 0; mask < 1 << 7; mask++) {
    const days: number[] = [];
    for (let d = 0; d < 7; d++) if (mask & (1 << d)) days.push(d);
    if (days.length !== n) continue;

    const overlap = days.filter((d) => blocked.has(d)).length;
    let spread = 0;
    for (let i = 0; i < n; i++) {
      const gap = i === n - 1 ? days[0] + 7 - days[i] : days[i + 1] - days[i];
      spread += gap * gap;
    }
    const keptDefault = days.filter((d) => preferred.has(d)).length;
    // Lower is better on every component; masks iterate low->high so the
    // first found wins exact ties — combined with the sort key below that's
    // the lexicographically smallest day list.
    const key = [overlap, spread, -keptDefault, ...days];
    if (!bestKey || lexLess(key, bestKey)) {
      bestKey = key;
      best = days;
    }
  }
  return best;
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return a.length < b.length;
}

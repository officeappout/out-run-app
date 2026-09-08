import { hasStrengthTrack, hasRunningTrack } from './track-ownership';

export interface TabLocks {
  strength: boolean;
  running: boolean;
  mixed: boolean;
}

type TabLocksProfile =
  | {
      progression?: {
        domains?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
        tracks?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
      };
      running?: { isUnlocked?: unknown };
    }
  | null
  | undefined;

/**
 * Pure decision behind ScheduleBuilderDrawer's tab-lock UI — extracted out
 * of the component so it's unit-testable. ScheduleBuilderDrawer.tsx has no
 * jsdom coverage in this repo's vitest, and the lock feature shipped
 * (07.09.2026, aaca82e5) with zero tests of its own — the two tests that
 * commit added were for a different piece of the same commit (the coach
 * note's symmetric branch, in computeWeaveResultSafely.ts), not this. That
 * gap is what this file closes.
 *
 * A tab locks when the user doesn't own that track at all — same
 * ownership predicates the engine itself gates on (weaverInput.ts), not a
 * "the engine produced nothing this week" signal. "משולב" needs both; a
 * single missing track locks it same as its own tab.
 */
export function resolveTabLocks(profile: TabLocksProfile): TabLocks {
  const ownsStrength = hasStrengthTrack(profile);
  const ownsRunning = hasRunningTrack(profile);
  return {
    strength: !ownsStrength,
    running: !ownsRunning,
    mixed: !ownsStrength || !ownsRunning,
  };
}

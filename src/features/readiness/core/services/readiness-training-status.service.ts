/**
 * Training-derived "meets threshold" status (06.10.2026) — extracted
 * verbatim from readiness-trends.service.ts, where these two functions
 * (plus the test-id/level constants they depend on) used to live as
 * module-private helpers. Behavior is UNCHANGED from the trends
 * screen's own original implementation — this file only relocates them
 * so a second, new consumer (dashboard/unit-detail "training" strips)
 * can import the real thing instead of re-deriving the same logic a
 * second time. Pure, Firestore-free, no React, no UI — same reasoning
 * computeDemonstratedStrengthLevels/RunLevels already follow.
 *
 * If a future caller needs this and finds itself writing a SECOND
 * version of runMeetsStatus/strengthMeetsStatus instead of importing
 * from here, that is a bug, not a shortcut — see this session's own
 * explicit instruction on why (one source of truth for "what counts as
 * meeting threshold from training evidence," same discipline as every
 * other readiness module in this codebase).
 */
import type { BaseProgramSlug } from './readiness-strength-level.service';
import type { ReadinessSoldier, ReadinessThresholdsConfig, ReadinessCurrentStatus } from './readiness-write.service';

export const RUN_TEST_ID = 'run_3000m';
export const PULL_TEST_ID = 'pullups';
export const PUSH_TEST_ID = 'dips';

/**
 * The canonical minimum demonstrated level that qualifies as "meeting
 * the bar" for each base program — see readiness-trends.service.ts's
 * own original comment (now on strengthMeetsStatus below) for why this
 * is checked before the rep-count comparison, not instead of it.
 */
export const MIN_QUALIFYING_LEVEL: Record<BaseProgramSlug, number> = { pull: 11, push: 10 };

/**
 * One soldier's "meets threshold" status for the run component, as a
 * ReadinessCurrentStatus so it can be folded into reduceOverallStatus
 * alongside official-test statuses — 'not_yet_tested' doubles as "not
 * determinable" here (app-derived data has no 'not_performed' concept
 * of its own).
 */
export function runMeetsStatus(normalizedTimeSeconds: number | null, config: ReadinessThresholdsConfig, gender: ReadinessSoldier['gender']): ReadinessCurrentStatus {
  if (normalizedTimeSeconds === null) return 'not_yet_tested';
  const test = config.tests.find((t) => t.id === RUN_TEST_ID);
  if (!test) return 'not_yet_tested';
  const threshold = test.threshold[gender];
  const pass = test.lowerIsBetter ? normalizedTimeSeconds <= threshold : normalizedTimeSeconds >= threshold;
  return pass ? 'pass' : 'fail';
}

export function strengthMeetsStatus(
  slug: BaseProgramSlug,
  level: number | null,
  reps: number | null,
  config: ReadinessThresholdsConfig,
  gender: ReadinessSoldier['gender'],
): ReadinessCurrentStatus {
  if (level === null) return 'not_yet_tested'; // no training evidence — "didn't train" is not "doesn't meet"
  if (level < MIN_QUALIFYING_LEVEL[slug]) return 'fail'; // a real, confirmed level below the bar — a determined fail
  if (reps === null) return 'not_yet_tested'; // the one place this screen could lie — level qualifies but no rep count exists
  const testId = slug === 'pull' ? PULL_TEST_ID : PUSH_TEST_ID;
  const test = config.tests.find((t) => t.id === testId);
  if (!test) return 'not_yet_tested';
  const threshold = test.threshold[gender];
  const pass = test.lowerIsBetter ? reps <= threshold : reps >= threshold;
  return pass ? 'pass' : 'fail';
}

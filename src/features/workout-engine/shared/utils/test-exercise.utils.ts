/**
 * test-exercise.utils.ts — the ONE place that decides whether a catalog doc is a
 * test / placeholder item that must never reach a user's workout.
 *
 * Why it exists (05-BENCHMARK.md §6.4 #1, H5 = 5.5% pass): the live catalog's ONLY
 * `exerciseRole: 'cooldown'` doc is "מתיחות פלג גוף עליון לבדיקה" and its only
 * `'warmup'` doc is "חימום פלג גוף עליון לבדיקה" — so cooldown.service shipped a test
 * item at the end of ~95% of workouts (and 10× as a MAIN exercise). The warm-up had a
 * one-off id blocklist; nothing else did.
 *
 * Rule (no catalog field marks drafts today, so it is name + explicit ids):
 *   - the DISPLAY name (Hebrew, else English when Hebrew is empty) contains
 *     "לבדיקה" / "בדיקה" / "טסט" / "test" (word) / "Copy of" / "העתק", or
 *   - the id is in KNOWN_TEST_EXERCISE_IDS.
 *
 * The English name is deliberately NOT checked when a Hebrew name exists: ~150 real,
 * published exercises still carry a stale "Copy of Copy of …" English name from being
 * duplicated in the admin (e.g. "שכיבות סמיכה ברכיים" = "Copy of … חתירות ב-75°").
 *
 * Applied at every generator entry: the home/builder/AI pipeline's catalog read
 * (home-workout.service), warm-up and cool-down (defensively, they also receive raw
 * pools), Smart Swap (exercise-replacement.service) and hybrid route stops
 * (start-hybrid-session). Admin screens are untouched — they must still see these docs.
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Explicit blocklist for test docs whose name may get "fixed" before their content is.
 * ETMVVSpt0lIpeF3mkEn6 — "מתיחות פלג גוף עליון לבדיקה" (the only cooldown-role doc).
 * k10Af7WEV0qDqx8PY7xQ — "חימום פלג גוף עליון לבדיקה" (the only warmup-role doc;
 *   draft description/goal copy — see warmup.service's former KNOWN_PLACEHOLDER_EXERCISE_IDS).
 * Remove an id only once its doc has real copy AND a non-test name.
 */
export const KNOWN_TEST_EXERCISE_IDS: ReadonlySet<string> = new Set([
  'ETMVVSpt0lIpeF3mkEn6',
  'k10Af7WEV0qDqx8PY7xQ',
]);

const TEST_NAME_RE = /לבדיקה|בדיקה|טסט|\btest\b|copy of|העתק/i;

function displayName(name: unknown): string {
  if (name == null) return '';
  if (typeof name === 'string') return name;
  const n = name as { he?: string; en?: string };
  const he = (n.he ?? '').trim();
  return he || (n.en ?? '').trim();
}

/** True for a name that marks a test / copy / placeholder doc. */
export function isTestOrPlaceholderName(name: unknown): boolean {
  const s = displayName(name);
  return s.length > 0 && TEST_NAME_RE.test(s);
}

/** True when this catalog doc must never be shown in a generated workout. */
export function isTestOrPlaceholderExercise(ex: Pick<Exercise, 'id' | 'name'> | null | undefined): boolean {
  if (!ex) return false;
  if (KNOWN_TEST_EXERCISE_IDS.has(ex.id)) return true;
  return isTestOrPlaceholderName(ex.name);
}

/** Convenience: drop test / placeholder docs from a catalog read. */
export function withoutTestExercises<T extends Pick<Exercise, 'id' | 'name'>>(pool: readonly T[]): T[] {
  return pool.filter(ex => !isTestOrPlaceholderExercise(ex));
}

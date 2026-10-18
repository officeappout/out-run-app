/**
 * Post-workout survey cadence (soft-adaptation Phase 0, POST_WORKOUT_SURVEY_V1).
 *
 * Shown on the user's first 3 strength summaries, then on about every 4th
 * (7, 11, 15, …). The count is a per-user, per-device localStorage counter of
 * strength summaries reached — cheap, offline-safe, and good enough for a
 * cadence (a reinstall just asks a few more times). The answer is stored on
 * the workout doc and changes NOTHING about level or progress.
 */

export const SURVEY_FIRST_SESSIONS = 3;
export const SURVEY_EVERY_NTH = 4;

/** 1-based strength-session number → should the survey be prompted? */
export function shouldPromptPostWorkoutSurvey(sessionNumber: number): boolean {
  if (!Number.isFinite(sessionNumber) || sessionNumber < 1) return false;
  if (sessionNumber <= SURVEY_FIRST_SESSIONS) return true;
  return (sessionNumber - SURVEY_FIRST_SESSIONS) % SURVEY_EVERY_NTH === 0;
}

const COUNT_KEY_PREFIX = 'outrun_strength_summary_count_';

/**
 * Increment and return this user's strength-summary counter (1-based).
 * Returns null when storage is unavailable (private mode etc.) — the caller
 * then simply doesn't prompt.
 */
export function bumpStrengthSummaryCount(uid: string | null | undefined): number | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const key = `${COUNT_KEY_PREFIX}${uid}`;
    const prev = Number(window.localStorage.getItem(key) ?? '0');
    const next = (Number.isFinite(prev) && prev > 0 ? Math.floor(prev) : 0) + 1;
    window.localStorage.setItem(key, String(next));
    return next;
  } catch {
    return null;
  }
}

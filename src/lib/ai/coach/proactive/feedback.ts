/**
 * Kelly phase 3 — "איך היה?" answers (קל / בדיוק / קשה). Pure.
 *
 * STORAGE: workout_feedback/{workoutId} (server-only rules), written by
 * POST /api/ai-coach/proactive/feedback after it checks the message is this user's
 * post-workout question and the workout is theirs:
 *   { uid, workoutId, rating: 'easy' | 'right' | 'hard', messageId, source: 'kelly_proactive', createdAt }
 * The question message gets proactive.feedback = rating and loses its chips (answered once).
 *
 * GENERATOR SIGNAL — DEFERRED (not wired in this change, on purpose): the workout generator
 * is client-side and its difficulty rules live in .cursoragents/Workout_Engine_Truth.md, so a
 * change there needs its own review. The contract for when it is built, behind its own flag
 * (suggested name generator_feedback_signal, default off):
 *   - read the user's last 3 workout_feedback docs (newest first) through a server route
 *     (the collection is not client-readable);
 *   - softBias = 'easier' when 2 of the last 3 are 'hard', 'harder' when 3 of 3 are 'easy',
 *     else none; at most ONE step of the existing difficulty (1-3), never past the level
 *     ceiling, never for a rehab or a returning (calm return) session;
 *   - the bias decays: ratings older than 21 days are ignored.
 * feedbackBias() below is that pure rule, ready for the generator to call.
 */
import type { WorkoutRating } from '../action-chips';

export const WORKOUT_FEEDBACK = 'workout_feedback';
export const FEEDBACK_SIGNAL_MAX_AGE_MS = 21 * 86_400_000;

export function isWorkoutRating(v: unknown): v is WorkoutRating {
  return v === 'easy' || v === 'right' || v === 'hard';
}

export const RATING_LABEL_HE: Record<WorkoutRating, string> = { easy: 'קל', right: 'בדיוק', hard: 'קשה' };

/** Why an answer is refused, or null when the message can take it. */
export function feedbackRefusal(msg: Record<string, unknown> | undefined): 'not_found' | 'not_a_question' | 'already_answered' | null {
  if (!msg) return 'not_found';
  const p = msg.proactive as Record<string, unknown> | undefined;
  if (!p || p.trigger !== 'post_workout' || typeof p.workoutId !== 'string' || !p.workoutId) return 'not_a_question';
  if (isWorkoutRating(p.feedback)) return 'already_answered';
  return null;
}

export interface FeedbackRow {
  rating: WorkoutRating;
  createdAtMs: number;
}

/** The deferred generator rule (see the header). Newest first; pure. */
export function feedbackBias(rows: readonly FeedbackRow[], nowMs: number): 'easier' | 'harder' | null {
  const recent = rows.filter((r) => nowMs - r.createdAtMs <= FEEDBACK_SIGNAL_MAX_AGE_MS).slice(0, 3);
  if (recent.filter((r) => r.rating === 'hard').length >= 2) return 'easier';
  if (recent.length === 3 && recent.every((r) => r.rating === 'easy')) return 'harder';
  return null;
}

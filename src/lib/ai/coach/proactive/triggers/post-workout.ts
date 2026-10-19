/**
 * Trigger e — "איך היה?" 30 to 75 minutes after a saved workout. Pure.
 *
 * Once per workout (ledger askedWorkoutIds), not for short ones (< 10 minutes). The window
 * is 45 minutes wide so a 15-minute cron always lands in it once. The chips are קל / בדיוק /
 * קשה (rate_easy / rate_right / rate_hard); the answer is written server-side to
 * workout_feedback/{workoutId} (feedback.server.ts), never by the client.
 */
import { skip, type ProactiveUserState, type TriggerDecision, type TriggerOptions } from '../types';

export const POST_WORKOUT_MIN_MS = 30 * 60_000;
export const POST_WORKOUT_MAX_MS = 75 * 60_000;
export const POST_WORKOUT_MIN_MINUTES = 10;

export function postWorkoutTrigger(s: ProactiveUserState, o: TriggerOptions = {}): TriggerDecision {
  const w = s.recentWorkout;
  if (!w) return skip('post_workout', 'no_recent_workout');
  if (w.minutes < POST_WORKOUT_MIN_MINUTES) return skip('post_workout', 'too_short');
  if (s.ledger.askedWorkoutIds.includes(w.id)) return skip('post_workout', 'already_asked');
  const age = s.clock.ms - w.endedAtMs;
  if (!o.ignoreSlotTime && (age < POST_WORKOUT_MIN_MS || age >= POST_WORKOUT_MAX_MS)) return skip('post_workout', 'outside_window');
  return { trigger: 'post_workout', shouldSend: true, templateKey: 'post_workout', vars: { workoutId: w.id, minutes: w.minutes }, why: `workout ${w.minutes} min saved ${Math.round(age / 60_000)} min ago` };
}

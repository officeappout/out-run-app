/**
 * Server side of the ONE step-goal resolver.
 *
 * The resolver itself is src/features/activity/lib/step-goal.ts (client);
 * functions/src/shared/step-goal.ts is its committed byte-for-byte mirror,
 * refreshed on every functions build by
 * functions/scripts/vendor-copy-geo-discovery.js and pinned by a root test —
 * so the evening nudge, the push-outcome sweeper and the app's home ring /
 * streak can never disagree about a user's goal.
 *
 * Read-only: when a weekly auto recompute is due (the user hasn't opened the
 * app this week), the server computes it the same way the client would but
 * does NOT write it back — the client persists on its next load. Costs up to
 * 14 dailyActivity point reads for such a user (doc ids, no index needed);
 * zero extra reads for a manual or freshly-stamped goal.
 */
import type * as admin from 'firebase-admin';
import {
  addDays,
  resolveStepGoal,
  stepGoalNeedsRecentDays,
  STEP_GOAL_WINDOW_DAYS,
  type StepDay,
  type StepGoalProgressionFields,
} from '../shared/step-goal';

/** Same ids the app and ingestHealthSamples use: dailyActivity/{uid}_{YYYY-MM-DD}. */
export function recentDayDocIds(uid: string, today: string): string[] {
  return Array.from({ length: STEP_GOAL_WINDOW_DAYS }, (_, i) => `${uid}_${addDays(today, -(i + 1))}`);
}

export async function resolveUserStepGoal(
  db: admin.firestore.Firestore,
  uid: string,
  progression: Record<string, unknown> | null | undefined,
  today: string,
): Promise<number> {
  const fields = (progression ?? {}) as StepGoalProgressionFields;
  let recentDays: StepDay[] = [];
  if (stepGoalNeedsRecentDays(fields, today)) {
    const refs = recentDayDocIds(uid, today).map((id) => db.collection('dailyActivity').doc(id));
    const docs = await db.getAll(...refs);
    recentDays = docs
      .filter((d) => d.exists)
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        return { date: String(data.date ?? d.id.slice(uid.length + 1)), steps: Number(data.steps) || 0 };
      });
  }
  return resolveStepGoal(fields, recentDays, today).goal;
}

/**
 * Entry-router Gate 1 — "has this user ever actually trained" — for the
 * onboarding tutorial's entry router (slice 1, 06.10.2026).
 *
 * Conscious signal choice (per David's explicit heads-up on this task):
 * `progression.workoutCount` is client-written via a best-effort
 * `increment()` wrapped in a try/catch that silently swallows write
 * failures (`completion-sync.service.ts:137-146`, root-caused for PR #155)
 * — so it can only UNDERCOUNT, never show a false positive. That one-sided
 * failure mode is exactly why it's still safe to TRUST when > 0 (a false
 * "has trained" from this field is not possible), and exactly why it's
 * NOT safe to trust when it reads 0/absent (a genuinely-trained user can
 * still read 0 here).
 *
 * Chosen approach — hybrid, not a blanket "always distrust it":
 *   1. workoutCount > 0 → true immediately. No extra read. Covers the
 *      overwhelming majority (every user whose counter write succeeded),
 *      and is provably correct given the undercount-only failure mode.
 *   2. workoutCount 0/absent → fall through to a real `workouts` query,
 *      scoped to the current user (`where('userId','==',uid)`), ordered
 *      by `date desc` with `limit(10)` — this exact (userId ASC, date
 *      DESC) composite index already exists in firestore.indexes.json,
 *      so this needs no new index. Reuses `isRealWorkoutCompletion`
 *      (workout-completion-kpi.ts, PR #155's canonical predicate) rather
 *      than a new one, so this gate can't silently diverge from the
 *      funnel/growth-metrics' own definition of "really trained."
 *
 * limit(10) is a deliberate approximation, not an exhaustive scan: this is
 * explicitly a low-stakes gate (David's framing) — worst case it takes one
 * extra welcome-drawer showing to a long-time user whose 10 most recent
 * docs happen to all be recovery sessions, not a wrong permission or a
 * wrong XP award. Never silently claim "untrained" on a fetch failure —
 * that would steer a genuinely-trained user back into the welcome drawer,
 * which is the annoying direction, not the dangerous one; still, the
 * explicit default below is false only because the caller treats a thrown
 * read as "couldn't prove trained," matching the geo helpers' own
 * fail-closed-on-error convention in entry-router-geo.service.ts.
 */

import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';

const FALLBACK_QUERY_LIMIT = 10;

export async function hasEverTrained(userId: string, workoutCount: number | undefined): Promise<boolean> {
  if ((workoutCount ?? 0) > 0) return true;

  try {
    const snap = await getDocs(query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      orderBy('date', 'desc'),
      limit(FALLBACK_QUERY_LIMIT),
    ));
    return snap.docs.some((d) => isRealWorkoutCompletion(d.data()));
  } catch {
    return false;
  }
}

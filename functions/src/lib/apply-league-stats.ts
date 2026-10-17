/**
 * applyWorkoutToLeagueStats — add one finished workout to the league scope
 * aggregates. Shared by the onWorkoutCreateLeagueStats trigger and the
 * backfill script (scripts/_backfill-league-scope-stats.ts), so both count a
 * workout exactly the same way — and exactly once (the processed marker is
 * written in the same transaction).
 */
import type { firestore } from 'firebase-admin';
import {
  activityOf,
  creditOf,
  minutesOf,
  periodKeysFor,
  scopeTargetsFor,
  statsDocId,
  type LeagueActivity,
  type LeagueWindow,
} from './league-scope-stats';

const WINDOWS: LeagueWindow[] = ['weekly', 'monthly'];
type Bucket = { credit: number; members: number };

export type ApplyResult = 'applied' | 'already' | 'no-credit' | 'no-scope' | 'no-user';

export async function applyWorkoutToLeagueStats(
  db: firestore.Firestore,
  serverTimestamp: () => firestore.FieldValue,
  workoutId: string,
  data: firestore.DocumentData,
): Promise<ApplyResult> {
  const uid: string = data.userId ?? data.uid ?? '';
  if (!uid) return 'no-user';
  const activity: LeagueActivity = activityOf(data.category, data.workoutType ?? data.activityType);
  const credit = creditOf(minutesOf(data.duration), activity);
  if (credit <= 0) return 'no-credit';

  const u = (await db.collection('users').doc(uid).get()).data() ?? {};
  const core = (u.core ?? {}) as Record<string, unknown>;
  const targets = scopeTargetsFor(core, (u.social as { groupIds?: unknown } | undefined)?.groupIds ?? []);
  if (!targets.length) return 'no-scope';
  const gender = core.gender === 'male' || core.gender === 'female' ? core.gender : null;

  const when = data.date && typeof data.date.toDate === 'function' ? data.date.toDate() : new Date();
  const keys = periodKeysFor(when);
  const marker = db.collection('league_scope_stats_processed').doc(workoutId);

  return db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return 'already' as const;
    const refs = WINDOWS.flatMap((w) =>
      targets.map((t) => {
        const ref = db.collection('league_scope_stats').doc(statsDocId(w, keys[w], t));
        return { w, t, ref, member: ref.collection('members').doc(uid) };
      }),
    );
    // All reads before any write (Firestore transaction rule).
    const reads = await Promise.all(refs.map(async (r) => ({ ...r, stat: await tx.get(r.ref), mem: await tx.get(r.member) })));
    for (const { w, t, ref, member, stat, mem } of reads) {
      const s = stat.data() ?? {};
      const m = mem.data() ?? {};
      const newMember = !mem.exists;
      const activities: string[] = Array.isArray(m.activities) ? m.activities : [];
      const newInActivity = !activities.includes(activity);
      const byActivity = { ...(s.byActivity ?? {}) } as Record<string, Bucket>;
      const a = byActivity[activity] ?? { credit: 0, members: 0 };
      byActivity[activity] = { credit: a.credit + credit, members: a.members + (newInActivity ? 1 : 0) };
      const byGender = { ...(s.byGender ?? {}) } as Record<string, Bucket>;
      if (gender) {
        const g = byGender[gender] ?? { credit: 0, members: 0 };
        byGender[gender] = { credit: g.credit + credit, members: g.members + (newMember ? 1 : 0) };
      }
      tx.set(ref, {
        window: w,
        periodKey: keys[w],
        granularity: t.granularity,
        scopeId: t.scopeId,
        parentId: t.parentId,
        totalCredit: (typeof s.totalCredit === 'number' ? s.totalCredit : 0) + credit,
        activeMemberCount: (typeof s.activeMemberCount === 'number' ? s.activeMemberCount : 0) + (newMember ? 1 : 0),
        byActivity,
        byGender,
        updatedAt: serverTimestamp(),
      });
      tx.set(member, {
        credit: (typeof m.credit === 'number' ? m.credit : 0) + credit,
        activities: newInActivity ? [...activities, activity] : activities,
        gender,
        updatedAt: serverTimestamp(),
      });
    }
    tx.set(marker, { uid, credit, at: serverTimestamp() });
    return 'applied' as const;
  });
}

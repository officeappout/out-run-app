/**
 * applyWorkoutToLeagueStats — add one finished workout to the league scope
 * aggregates. Shared by the onWorkoutCreateLeagueStats trigger and the
 * backfill script (scripts/_backfill-league-scope-stats.ts), so both count a
 * workout exactly the same way — and exactly once (the processed marker is
 * written in the same transaction).
 */
import type { firestore } from 'firebase-admin';
import {
  distanceMetersOfDay,
  isCountedMember,
  periodKeysFor,
  scopeTargetsFor,
  statsDocId,
  stepsCreditOf,
  stepsDayDelta,
  workoutCreditParts,
  type LeagueWindow,
} from './league-scope-stats';
import { demoSafeScopeTargets } from './demo';

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
  // One part per workout; a combined workout counts per part (run/walk →
  // cardio, stations → strength — workoutCreditParts).
  const parts = workoutCreditParts(data);
  const credit = parts.reduce((sum, p) => sum + p.credit, 0);
  if (credit <= 0) return 'no-credit';

  const u = (await db.collection('users').doc(uid).get()).data() ?? {};
  const core = (u.core ?? {}) as Record<string, unknown>;
  // Demo world guard: a demo user counts toward demo scopes only.
  const targets = demoSafeScopeTargets(uid, core, scopeTargetsFor(core, (u.social as { groupIds?: unknown } | undefined)?.groupIds ?? []));
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
      // Not yet counted (no doc, or a km-only doc from leagueStepsRollup).
      const newMember = !isCountedMember(m);
      const activities: string[] = Array.isArray(m.activities) ? [...m.activities] : [];
      const byActivity = { ...(s.byActivity ?? {}) } as Record<string, Bucket>;
      for (const { activity, credit: partCredit } of parts) {
        const newInActivity = !activities.includes(activity);
        const a = byActivity[activity] ?? { credit: 0, members: 0 };
        byActivity[activity] = { credit: a.credit + partCredit, members: a.members + (newInActivity ? 1 : 0) };
        if (newInActivity) activities.push(activity);
      }
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
        // Invite bonuses (apply-referral-bonus.ts) live inside totalCredit;
        // keep their separate tally across this full-doc write.
        ...(typeof s.bonusCredit === 'number' ? { bonusCredit: s.bonusCredit } : {}),
        // The km (leagueStepsRollup) — kept across this full-doc write too.
        ...(typeof s.distanceMeters === 'number' ? { distanceMeters: s.distanceMeters } : {}),
        updatedAt: serverTimestamp(),
      });
      tx.set(member, {
        credit: (typeof m.credit === 'number' ? m.credit : 0) + credit,
        activities,
        gender,
        ...(typeof m.distanceMeters === 'number' ? { distanceMeters: m.distanceMeters } : {}),
        // The member's steps points (leagueStepsRollup) — kept as well.
        ...(typeof m.stepsCredit === 'number' ? { stepsCredit: m.stepsCredit } : {}),
        updatedAt: serverTimestamp(),
      });
    }
    tx.set(marker, { uid, credit, at: serverTimestamp() });
    return 'applied' as const;
  });
}

export type StepsApplyResult = 'applied' | 'no-change' | 'no-scope' | 'no-user';

/**
 * applyStepsToLeagueStats — a day's steps into the league aggregates, as the
 * 'steps' bucket (stepsCreditOf: 3 points per 1,000), plus the day's
 * distance as a separate km tally (distanceMetersOfDay — shown next to the
 * points, never part of them). Steps grow during the day, so this is
 * idempotent by DELTA: league_steps_applied/{uid}_{date} remembers the credit
 * AND the meters already added for that day, and each run adds only the
 * differences (never subtracts). A day with step points counts its walker as
 * an active member, like a workout does; distance alone (under 1,000 steps)
 * adds km but never points, members or activities. Each member row also
 * keeps stepsCredit — the part of its credit that came from steps (shown on
 * the group boards, never extra points).
 */
export async function applyStepsToLeagueStats(
  db: firestore.Firestore,
  serverTimestamp: () => firestore.FieldValue,
  uid: string,
  date: string,
  steps: unknown,
  distanceMeters?: unknown,
): Promise<StepsApplyResult> {
  if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'no-user';
  const credit = stepsCreditOf(steps);
  const meters = distanceMetersOfDay(steps, distanceMeters);
  if (credit <= 0 && meters <= 0) return 'no-change';

  const u = (await db.collection('users').doc(uid).get()).data();
  if (!u) return 'no-user';
  const core = (u.core ?? {}) as Record<string, unknown>;
  // Demo world guard: a demo user counts toward demo scopes only.
  const targets = demoSafeScopeTargets(uid, core, scopeTargetsFor(core, (u.social as { groupIds?: unknown } | undefined)?.groupIds ?? []));
  if (!targets.length) return 'no-scope';
  const gender = core.gender === 'male' || core.gender === 'female' ? core.gender : null;
  // Midday in Israel on that date → the right week / month keys.
  const keys = periodKeysFor(new Date(`${date}T09:00:00Z`));
  const appliedRef = db.collection('league_steps_applied').doc(`${uid}_${date}`);
  const activity = 'steps';

  return db.runTransaction(async (tx) => {
    const applied = (await tx.get(appliedRef)).data();
    const d = stepsDayDelta(applied, credit, meters);
    if (d.credit <= 0 && d.distanceMeters <= 0) return 'no-change' as const;
    const delta = d.credit;
    const refs = WINDOWS.flatMap((w) =>
      targets.map((t) => {
        const ref = db.collection('league_scope_stats').doc(statsDocId(w, keys[w], t));
        return { w, t, ref, member: ref.collection('members').doc(uid) };
      }),
    );
    const reads = await Promise.all(refs.map(async (r) => ({ ...r, stat: await tx.get(r.ref), mem: await tx.get(r.member) })));
    for (const { w, t, ref, member, stat, mem } of reads) {
      const s = stat.data() ?? {};
      const m = mem.data() ?? {};
      const docMeters = (typeof s.distanceMeters === 'number' ? s.distanceMeters : 0) + d.distanceMeters;
      const memberMeters = (typeof m.distanceMeters === 'number' ? m.distanceMeters : 0) + d.distanceMeters;
      if (delta <= 0) {
        // Km only — points, members, activities and gender buckets untouched.
        tx.set(
          ref,
          { window: w, periodKey: keys[w], granularity: t.granularity, scopeId: t.scopeId, parentId: t.parentId, distanceMeters: docMeters, updatedAt: serverTimestamp() },
          { merge: true },
        );
        tx.set(
          member,
          mem.exists
            ? { distanceMeters: memberMeters, updatedAt: serverTimestamp() }
            : { credit: 0, activities: [], gender, distanceMeters: memberMeters, updatedAt: serverTimestamp() },
          { merge: true },
        );
        continue;
      }
      const newMember = !isCountedMember(m);
      const activities: string[] = Array.isArray(m.activities) ? m.activities : [];
      const newInActivity = !activities.includes(activity);
      const byActivity = { ...(s.byActivity ?? {}) } as Record<string, Bucket>;
      const a = byActivity[activity] ?? { credit: 0, members: 0 };
      byActivity[activity] = { credit: a.credit + delta, members: a.members + (newInActivity ? 1 : 0) };
      const byGender = { ...(s.byGender ?? {}) } as Record<string, Bucket>;
      if (gender) {
        const g = byGender[gender] ?? { credit: 0, members: 0 };
        byGender[gender] = { credit: g.credit + delta, members: g.members + (newMember ? 1 : 0) };
      }
      tx.set(ref, {
        window: w,
        periodKey: keys[w],
        granularity: t.granularity,
        scopeId: t.scopeId,
        parentId: t.parentId,
        totalCredit: (typeof s.totalCredit === 'number' ? s.totalCredit : 0) + delta,
        activeMemberCount: (typeof s.activeMemberCount === 'number' ? s.activeMemberCount : 0) + (newMember ? 1 : 0),
        byActivity,
        byGender,
        ...(typeof s.bonusCredit === 'number' ? { bonusCredit: s.bonusCredit } : {}),
        ...(docMeters > 0 ? { distanceMeters: docMeters } : {}),
        updatedAt: serverTimestamp(),
      });
      tx.set(member, {
        credit: (typeof m.credit === 'number' ? m.credit : 0) + delta,
        activities: newInActivity ? [...activities, activity] : activities,
        gender,
        ...(memberMeters > 0 ? { distanceMeters: memberMeters } : {}),
        // This member's share of `credit` that came from steps — lets a
        // group board show "X points from steps" per member. Same delta, so
        // it never runs ahead of the points (older docs start counting now).
        stepsCredit: (typeof m.stepsCredit === 'number' ? m.stepsCredit : 0) + delta,
        updatedAt: serverTimestamp(),
      });
    }
    // Remember the max applied so far for each (deltas never go negative).
    tx.set(appliedRef, {
      uid,
      date,
      credit: Math.max(credit, typeof applied?.credit === 'number' ? applied.credit : 0),
      distanceMeters: Math.max(meters, typeof applied?.distanceMeters === 'number' ? applied.distanceMeters : 0),
      steps: typeof steps === 'number' ? steps : null,
      updatedAt: serverTimestamp(),
    });
    return 'applied' as const;
  });
}

/**
 * GET /api/admin/journey-retention-drivers — Journey "מה גורם להישאר".
 *
 * Cohort (fixed, not filter-driven): real users who signed up between
 * COHORT_DAYS + RETAIN_TO days ago and RETAIN_TO days ago — so every one of
 * them has had the full retention window. Platform scope only.
 *
 * Reads (Admin SDK, single-field queries only): all users (filtered in
 * memory), the cohort's workouts / analytics_events / planned_sessions (by
 * userId, chunks of 30), and all referrals.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';
import {
  aggregateRetentionDrivers,
  RETAIN_TO,
  type DriverUser,
} from '@/features/admin/services/journey-retention-drivers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'נתוני השימור משקפים את כל הפלטפורמה — זמין לצוות OUT בלבד.';
const COHORT_DAYS = 120;
const DAY = 24 * 60 * 60 * 1000;

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date })?.toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export async function computeRetentionDrivers(db: FirebaseFirestore.Firestore, scope: AdminAnalyticsScope, now = new Date()) {
  if (scope.kind === 'denied') return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  if (scope.kind !== 'platform') return { status: 403 as const, body: { error: NOT_APPLICABLE_MESSAGE } };

  const cohortTo = new Date(now.getTime() - RETAIN_TO * DAY);
  const cohortFrom = new Date(cohortTo.getTime() - COHORT_DAYS * DAY);

  const usersSnap = await db.collection('users').get();
  const cohortDocs = usersSnap.docs.filter((d) => {
    const data = d.data();
    if (isTestOrMockUser(data?.core as Record<string, unknown> | undefined)) return false;
    const created = toDateSafe(data?.createdAt);
    return !!created && created >= cohortFrom && created <= cohortTo;
  });

  const byUid = new Map<string, DriverUser>();
  for (const d of cohortDocs) {
    const data = d.data();
    const social = (data.social ?? {}) as Record<string, unknown>;
    const settings = (data.settings ?? {}) as Record<string, unknown>;
    const core = (data.core ?? {}) as Record<string, unknown>;
    const progression = (data.progression ?? {}) as Record<string, unknown>;
    const running = (data.running ?? {}) as Record<string, unknown>;
    byUid.set(d.id, {
      uid: d.id,
      createdAt: toDateSafe(data.createdAt)!,
      workouts: [],
      reminderSetAt: [],
      plannedSessionAt: [],
      inGroup: Array.isArray(social.groupIds) && social.groupIds.length > 0,
      pushEnabled: settings.pushEnabled !== false && Array.isArray(data.fcmTokens) && data.fcmTokens.length > 0,
      invited: (num(core.referralCount) ?? 0) > 0,
      hasProgram: Array.isArray(progression.activePrograms) && progression.activePrograms.length > 0,
      runningUnlocked: running.isUnlocked === true,
    });
  }

  // invites — inviter (referralCount above) or invitee
  try {
    const refs = await db.collection('referrals').get();
    refs.docs.forEach((r) => {
      const invitee = str(r.data()?.inviteeUid);
      const u = invitee ? byUid.get(invitee) : undefined;
      if (u) u.invited = true;
    });
  } catch (err) {
    console.error('[/api/admin/journey-retention-drivers] referrals read failed:', err);
  }

  await Promise.all(
    chunk(Array.from(byUid.keys()), 30).map(async (batch) => {
      const [workouts, events, planned] = await Promise.all([
        db.collection('workouts').where('userId', 'in', batch).get(),
        db.collection('analytics_events').where('userId', 'in', batch).get(),
        db.collection('planned_sessions').where('userId', 'in', batch).get(),
      ]);
      workouts.docs.forEach((w) => {
        const data = w.data();
        const u = byUid.get(data.userId);
        const at = toDateSafe(data.date);
        if (!u || !at || !isRealWorkoutCompletion(data)) return;
        u.workouts.push({ at, parkId: str(data.parkId), groupId: str(data.groupId), setsCompleted: num(data.setsCompleted), setsPlanned: num(data.setsPlanned) });
      });
      events.docs.forEach((e) => {
        const data = e.data();
        if (data.eventName !== 'reminder_set') return;
        const u = byUid.get(data.userId);
        const at = toDateSafe(data.timestamp);
        if (u && at) u.reminderSetAt.push(at);
      });
      planned.docs.forEach((p) => {
        const data = p.data();
        const u = byUid.get(data.userId);
        const at = toDateSafe(data.createdAt);
        if (u && at) u.plannedSessionAt.push(at);
      });
    }),
  );

  return { status: 200 as const, body: aggregateRetentionDrivers(Array.from(byUid.values()), { from: cohortFrom, to: cohortTo }) };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(idToken, true)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const scope = await resolveAdminAnalyticsScope(uid);
    const result = await computeRetentionDrivers(getAdminDb(), scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[/api/admin/journey-retention-drivers] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

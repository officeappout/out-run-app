/**
 * GET /api/admin/journey-activation?from=ISO&to=ISO — Journey "הצטרפות
 * והפעלה" additions: where onboarding stalls, the first-week road to the
 * first workout, location-permission answers, and who to nudge.
 * Platform scope only. Same range rules as /api/admin/journey-sources.
 *
 * Reads (Admin SDK): all users (filtered in memory — createdAt isn't stored
 * uniformly), the signups' workouts and their analytics_events (by userId,
 * chunks of 30 — single-field queries, no composite index needed).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';
import { parseRange } from '@/features/admin/services/journey-sources';
import {
  aggregateJourneyActivation,
  FIRST_WORKOUT_STEPS,
  type ActivationEvent,
  type ActivationUser,
} from '@/features/admin/services/journey-activation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'נתוני ההצטרפות משקפים את כל הפלטפורמה — זמין לצוות OUT בלבד.';

const EVENT_NAMES = new Set([...FIRST_WORKOUT_STEPS.map((s) => s.event), 'permission_location_status']);

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

export async function computeJourneyActivation(
  db: FirebaseFirestore.Firestore,
  scope: AdminAnalyticsScope,
  range: { from: Date; to: Date },
) {
  if (scope.kind === 'denied') return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  if (scope.kind !== 'platform') return { status: 403 as const, body: { error: NOT_APPLICABLE_MESSAGE } };

  const usersSnap = await db.collection('users').get();
  const docs = usersSnap.docs.filter((d) => {
    const data = d.data();
    if (isTestOrMockUser(data?.core as Record<string, unknown> | undefined)) return false;
    const created = toDateSafe(data?.createdAt);
    return !!created && created >= range.from && created <= range.to;
  });
  const uids = docs.map((d) => d.id);

  const trained = new Set<string>();
  const events: ActivationEvent[] = [];
  await Promise.all(
    chunk(uids, 30).map(async (batch) => {
      const [workouts, evts] = await Promise.all([
        db.collection('workouts').where('userId', 'in', batch).get(),
        db.collection('analytics_events').where('userId', 'in', batch).get(),
      ]);
      workouts.docs.forEach((w) => {
        const data = w.data();
        if (isRealWorkoutCompletion(data) && typeof data.userId === 'string') trained.add(data.userId);
      });
      evts.docs.forEach((e) => {
        const data = e.data();
        const at = toDateSafe(data.timestamp);
        if (!at || typeof data.userId !== 'string' || !EVENT_NAMES.has(data.eventName)) return;
        events.push({ userId: data.userId, eventName: data.eventName, at, status: typeof data.status === 'string' ? data.status : null });
      });
    }),
  );

  const users: ActivationUser[] = docs.map((d) => {
    const data = d.data();
    const core = (data.core ?? {}) as Record<string, unknown>;
    return {
      uid: d.id,
      name: (typeof core.name === 'string' && core.name) || 'ללא שם',
      createdAt: toDateSafe(data.createdAt)!,
      onboardingStatus: typeof data.onboardingStatus === 'string' ? data.onboardingStatus : null,
      onboardingStep: typeof data.onboardingStep === 'string' ? data.onboardingStep : null,
      onboardingCompletedAt: toDateSafe(data.onboardingCompletedAt),
      hasRealWorkout: trained.has(d.id),
    };
  });

  return { status: 200 as const, body: aggregateJourneyActivation(users, events) };
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
    const sp = request.nextUrl.searchParams;
    const result = await computeJourneyActivation(getAdminDb(), scope, parseRange(sp.get('from'), sp.get('to')));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[/api/admin/journey-activation] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

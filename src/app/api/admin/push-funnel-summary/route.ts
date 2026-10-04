/**
 * GET /api/admin/push-funnel-summary
 *
 * Analytics v2 — Phase 1 (04.10.2026). Platform-only (push sends aren't
 * authority-scoped in the data model — `push_events` docs carry `uid`,
 * never `authorityId` — so there is no meaningful vertical/authority
 * variant, same reasoning `statistics-summary/route.ts` already applies
 * to its own platform-only fields). Uses the same role→scope resolver as
 * every other admin analytics route (`resolveAdminAnalyticsScope`).
 *
 * Computes the first 4 stages of the push→action funnel — sent →
 * delivered → opened → started a workout — straight from `push_events`
 * (schema: `functions/src/services/push-events.service.ts`). The 5th
 * stage from the brief (retained-7d) is explicitly deferred — see the
 * 04.10.2026 audit doc — it needs a new derived join against `workouts`
 * that doesn't exist yet, out of scope for this phase.
 *
 * Scope caveat, inherent to the data, not a bug here: only the senders
 * that call `sendPush()` with `measurement` write to `push_events` at
 * all (3 of 12 as of 04.10.2026 — stepGoalNudgeScheduler,
 * onPlannedActivityCreated, trainingReminderScheduler). This funnel can
 * only ever reflect those senders until more are measured.
 *
 * `startedWorkout` matches `post_push_outcome` docs where
 * `outcomeType === 'workout_started' && goalCompleted === true` back to
 * their sibling `push_sent` doc by `pushId` — `goalCompleted` is the
 * stored field name (kept for continuity with docs written before the
 * outcome-type generalization; see push-events.service.ts's own comment).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'נתוני פוש הם תמיד כלל-פלטפורמיים — לא רלוונטי לתפקיד שלך.';

export interface PushFunnelStageCounts {
  sent: number;
  delivered: number;
  opened: number;
  startedWorkout: number;
}

export interface PushFunnelCategoryBreakdown extends PushFunnelStageCounts {
  category: string;
}

export async function computePushFunnelSummary(db: FirebaseFirestore.Firestore, scope: AdminAnalyticsScope) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  }
  if (scope.kind !== 'platform') {
    return { status: 403 as const, body: { error: NOT_APPLICABLE_MESSAGE } };
  }

  let sentDocs: FirebaseFirestore.DocumentData[] = [];
  let startedWorkoutPushIds = new Set<string>();

  try {
    const sentSnap = await db.collection('push_events').where('eventType', '==', 'push_sent').get();
    sentDocs = sentSnap.docs.map((d) => d.data());
  } catch (err) {
    console.error('[/api/admin/push-funnel-summary] push_sent query failed:', err);
    sentDocs = [];
  }

  try {
    const outcomeSnap = await db
      .collection('push_events')
      .where('eventType', '==', 'post_push_outcome')
      .where('outcomeType', '==', 'workout_started')
      .get();
    startedWorkoutPushIds = new Set(
      outcomeSnap.docs
        .filter((d) => d.data()?.goalCompleted === true)
        .map((d) => d.data()?.pushId)
        .filter((id): id is string => typeof id === 'string'),
    );
  } catch (err) {
    console.error('[/api/admin/push-funnel-summary] post_push_outcome query failed:', err);
    startedWorkoutPushIds = new Set();
  }

  const overall: PushFunnelStageCounts = { sent: 0, delivered: 0, opened: 0, startedWorkout: 0 };
  const byCategoryMap = new Map<string, PushFunnelStageCounts>();

  sentDocs.forEach((data) => {
    const category = typeof data?.category === 'string' && data.category ? data.category : 'ללא קטגוריה';
    const entry = byCategoryMap.get(category) ?? { sent: 0, delivered: 0, opened: 0, startedWorkout: 0 };

    entry.sent++;
    overall.sent++;
    if (data?.delivered === true) { entry.delivered++; overall.delivered++; }
    if (data?.openedAt != null) { entry.opened++; overall.opened++; }
    if (typeof data?.pushId === 'string' && startedWorkoutPushIds.has(data.pushId)) {
      entry.startedWorkout++;
      overall.startedWorkout++;
    }

    byCategoryMap.set(category, entry);
  });

  const byCategory: PushFunnelCategoryBreakdown[] = Array.from(byCategoryMap.entries())
    .map(([category, counts]) => ({ category, ...counts }))
    .sort((a, b) => b.sent - a.sent);

  return {
    status: 200 as const,
    body: {
      overall,
      byCategory,
      measuredSenderCount: byCategory.length,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const scope = await resolveAdminAnalyticsScope(uid);
    const db = getAdminDb();
    const result = await computePushFunnelSummary(db, scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/push-funnel-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/admin/commitment-surfaces-summary
 *
 * Surfaces the "scheduling/commitment" surfaces mapped in
 * scheduling-capability-audit.md — the uniformly-missing, uniformly-cheap
 * admin-panel visibility that audit flagged. Platform-only, same reasoning
 * push-funnel-summary/route.ts already applies (these surfaces aren't
 * authority-scoped in the data model).
 *
 * Deliberately a cheap first cut, not a full funnel: each count is its own
 * try/catch (mirrors push-funnel-summary's per-query defensiveness) so a
 * missing index or transient failure degrades that one card to null
 * instead of failing the whole route. Windows are short (7-30 days) to
 * keep these full-collection-style reads bounded.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'נתוני המחויבות הם תמיד כלל-פלטפוריים — לא רלוונטי לתפקיד שלך.';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CommitmentSurfacesSummary {
  remindersSetOrUpdated30d: number | null;
  scheduleEntriesWithTime7d: number | null;
  plannedSessionsCreated7d: number | null;
  groupCheckIns7d: number | null;
}

export async function computeCommitmentSurfacesSummary(
  db: FirebaseFirestore.Firestore,
  scope: AdminAnalyticsScope,
): Promise<{ status: 200 | 403; body: CommitmentSurfacesSummary | { error: string } }> {
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: NO_ACCESS_MESSAGE } };
  }
  if (scope.kind !== 'platform') {
    return { status: 403, body: { error: NOT_APPLICABLE_MESSAGE } };
  }

  const now = new Date();

  // 1. reminder_set / reminder_updated events, last 30 days.
  let remindersSetOrUpdated30d: number | null = null;
  try {
    const cutoff = new Date(now.getTime() - 30 * DAY_MS);
    const snap = await db
      .collection('analytics_events')
      .where('eventName', 'in', ['reminder_set', 'reminder_updated'])
      .where('timestamp', '>=', cutoff)
      .get();
    remindersSetOrUpdated30d = snap.size;
  } catch (err) {
    console.error('[/api/admin/commitment-surfaces-summary] reminder events query failed:', err);
  }

  // 2. userSchedule entries with a startTime set, last 7 days (date-string doc ids, so a
  // string range on the known 'YYYY-MM-DD_...' prefix isn't practical — scan by date field).
  let scheduleEntriesWithTime7d: number | null = null;
  try {
    const cutoffIso = new Date(now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
    const snap = await db.collection('userSchedule').where('date', '>=', cutoffIso).get();
    let count = 0;
    snap.docs.forEach((d) => {
      const entries = d.data()?.entries;
      if (Array.isArray(entries)) {
        count += entries.filter((e: { startTime?: string }) => !!e?.startTime).length;
      }
    });
    scheduleEntriesWithTime7d = count;
  } catch (err) {
    console.error('[/api/admin/commitment-surfaces-summary] userSchedule query failed:', err);
  }

  // 3. planned_sessions created, last 7 days (map "+" button / park & route "going out" compose).
  let plannedSessionsCreated7d: number | null = null;
  try {
    const cutoff = new Date(now.getTime() - 7 * DAY_MS);
    const snap = await db.collection('planned_sessions').where('createdAt', '>=', cutoff).get();
    plannedSessionsCreated7d = snap.size;
  } catch (err) {
    console.error('[/api/admin/commitment-surfaces-summary] planned_sessions query failed:', err);
  }

  // 4. Group-session "אני כאן!" check-ins, last 7 days. collectionGroup — may need a composite
  // index on (status, updatedAt) that doesn't exist yet; degrades to null, not a route failure.
  let groupCheckIns7d: number | null = null;
  try {
    const cutoff = new Date(now.getTime() - 7 * DAY_MS);
    const snap = await db
      .collectionGroup('member_statuses')
      .where('status', '==', 'here')
      .where('updatedAt', '>=', cutoff)
      .get();
    groupCheckIns7d = snap.size;
  } catch (err) {
    console.error('[/api/admin/commitment-surfaces-summary] member_statuses query failed (likely missing index):', err);
  }

  return {
    status: 200,
    body: {
      remindersSetOrUpdated30d,
      scheduleEntriesWithTime7d,
      plannedSessionsCreated7d,
      groupCheckIns7d,
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
    const result = await computeCommitmentSurfacesSummary(db, scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/commitment-surfaces-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

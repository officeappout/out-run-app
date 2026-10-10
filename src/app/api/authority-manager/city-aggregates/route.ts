/**
 * GET /api/authority-manager/city-aggregates
 *
 * Server-side fallback for getPopularParks/getActivityTrend/getCityStepsTotals
 * (src/features/admin/services/analytics.service.ts) — three of the ~9
 * AnalyticsDashboard.tsx metrics that, like the 4 already covered by
 * dashboard-summary/route.ts, read gated collections (`sessions`, `workouts`,
 * `dailyActivity`) directly from the browser and are denied by firestore.rules
 * for a real authority manager (only isRootAdmin()/isAdmin() are recognized —
 * managerIds-based access was never wired into any of these collections'
 * rules). Grouped into one route (not three) because all three share the
 * same authority+children scope resolution and are always requested together
 * inside AnalyticsDashboard.loadAll()'s single Promise.all — one round trip
 * instead of three.
 *
 * Hard requirements (identical to dashboard-summary/city-summary):
 *   - Real Firebase ID token required. No token → 401.
 *   - authorityId is resolved SERVER-SIDE from managerIds (via the shared
 *     resolveAuthorityManagerScope helper). Never trusts a client-supplied
 *     authorityId — there isn't even a place to send one.
 *   - uid not present in any authority's managerIds → 403.
 *   - Response is aggregate numbers only — no resident name, email, uid, or
 *     any other per-person field ever leaves this route.
 *
 * Deliberately DOES roll up child neighborhoods (unlike dashboard-summary's
 * documented no-rollup scope) — all three client-side functions
 * (getAuthorityWithChildrenIds) already do, and skipping it here would make
 * "popular parks in Sderot" effectively "popular parks among city-level-only
 * users," which is a materially different (and much smaller) number for any
 * authority organized by neighborhood. This is a deliberate, named deviation
 * from the other two routes' scope convention, not an inconsistency.
 *
 * Deliberately does NOT exclude mock/test accounts for the parks or
 * dailyActivity aggregates — replicates the CLIENT behavior exactly:
 * getPopularParks reads `sessions` (no core.isMockData/isTestData field
 * exists on that collection) and getCityStepsTotals reads `dailyActivity`
 * (same — no such field there either) with zero filtering today. Only the
 * activity-trend resident-uid resolution (which does read `users`) excludes
 * them, matching getUserIdsForAuthority's existing behavior.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Admin-SDK port of authority.service.ts's getChildrenByParent — same __SCHEMA_INIT__ filter. */
async function getChildAuthorityIds(db: Firestore, authorityId: string): Promise<string[]> {
  const snap = await db.collection('authorities').where('parentAuthorityId', '==', authorityId).get();
  const childIds = snap.docs
    .filter((d) => !d.id.includes('__SCHEMA_INIT__') && d.data()?.name !== '__SCHEMA_INIT__')
    .map((d) => d.id);
  return [authorityId, ...childIds];
}

async function computePopularParks(db: Firestore, authorityIds: string[], limit: number) {
  const parkCounts = new Map<string, number>();
  await Promise.all(chunk(authorityIds, 30).map(async (batch) => {
    const snap = await db.collection('sessions').where('authorityId', 'in', batch).get();
    snap.docs.forEach((d) => {
      const parkId = d.data()?.parkId;
      if (parkId) parkCounts.set(parkId, (parkCounts.get(parkId) ?? 0) + 1);
    });
  }));

  const topEntries = Array.from(parkCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const resolvedNames = await Promise.all(
    topEntries.map(async ([parkId]) => {
      try {
        const snap = await db.collection('parks').doc(parkId).get();
        return snap.exists ? ((snap.data()?.name as string) || parkId) : parkId;
      } catch {
        return parkId;
      }
    })
  );

  return topEntries.map(([parkId, count], i) => ({
    parkId,
    parkName: resolvedNames[i],
    completedSessionCount: count,
  }));
}

async function resolveResidentUids(db: Firestore, authorityIds: string[]): Promise<string[]> {
  const uids: string[] = [];
  await Promise.all(chunk(authorityIds, 30).map(async (batch) => {
    const snap = await db.collection('users').where('core.authorityId', 'in', batch).get();
    snap.docs.forEach((d) => {
      if (!isTestOrMockUser(d.data()?.core)) uids.push(d.id);
    });
  }));
  return uids;
}

async function computeActivityTrend(db: Firestore, residentUids: string[], days: number) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);

  const dateMap = new Map<string, Set<string>>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateMap.set(d.toISOString().split('T')[0], new Set());
  }

  if (residentUids.length === 0) {
    return Array.from(dateMap.entries()).map(([date]) => ({ date, dau: 0 }));
  }

  const startTs = Timestamp.fromDate(startDate);
  const endTs = Timestamp.fromDate(endDate);

  await Promise.all(chunk(residentUids, 30).map(async (batch) => {
    const snap = await db
      .collection('workouts')
      .where('userId', 'in', batch)
      .where('date', '>=', startTs)
      .where('date', '<=', endTs)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      const userId = data?.userId;
      const rawDate = data?.date;
      if (!userId || !rawDate) return;
      const dateKey = (rawDate as Timestamp).toDate().toISOString().split('T')[0];
      dateMap.get(dateKey)?.add(userId);
    });
  }));

  return Array.from(dateMap.entries()).map(([date, users]) => ({ date, dau: users.size }));
}

async function computeCityStepsTotals(db: Firestore, authorityIds: string[], days: number) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (days - 1));
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = today.toISOString().split('T')[0];

  let totalSteps = 0;
  let totalDistanceMeters = 0;
  const activeUserIds = new Set<string>();

  await Promise.all(chunk(authorityIds, 30).map(async (batch) => {
    const snap = await db
      .collection('dailyActivity')
      .where('authorityId', 'in', batch)
      .where('date', '>=', startDateStr)
      .where('date', '<=', endDateStr)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      const steps: number = data?.steps ?? 0;
      if (steps > 0) {
        totalSteps += steps;
        if (data?.userId) activeUserIds.add(data.userId);
      }
      totalDistanceMeters += data?.distanceMeters ?? 0;
    });
  }));

  return {
    totalSteps,
    activeUserCount: activeUserIds.size,
    averagePerActiveUser: activeUserIds.size > 0 ? Math.round(totalSteps / activeUserIds.size) : 0,
    days,
    totalDistanceMeters,
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

    const db = getAdminDb();
    const scope = await resolveAuthorityManagerScope(db, uid);
    if (!scope) {
      return NextResponse.json({ error: 'Not an authority manager' }, { status: 403 });
    }
    const { authorityId } = scope;

    const url = new URL(request.url);
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 30));
    const parksLimit = Math.max(1, Math.min(50, Number(url.searchParams.get('parksLimit')) || 5));

    const authorityIds = await getChildAuthorityIds(db, authorityId);
    const residentUids = await resolveResidentUids(db, authorityIds);

    const [popularParks, activityTrend, cityStepsTotals] = await Promise.all([
      computePopularParks(db, authorityIds, parksLimit),
      computeActivityTrend(db, residentUids, days),
      computeCityStepsTotals(db, authorityIds, days),
    ]);

    return NextResponse.json({ authorityId, popularParks, activityTrend, cityStepsTotals });
  } catch (err: any) {
    console.error('[/api/authority-manager/city-aggregates] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

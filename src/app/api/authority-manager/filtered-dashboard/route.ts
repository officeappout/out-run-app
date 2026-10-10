/**
 * GET /api/authority-manager/filtered-dashboard
 *
 * Server-side fallback for getActivityByHour + getRunningStats
 * (src/features/admin/services/analytics.service.ts). Same family as
 * dashboard-summary/city-aggregates/neighborhood-breakdown — see those
 * files' headers for the general shape of the problem this closes.
 *
 * Why this one is NOT a straightforward port of the other three: on the
 * client, both getActivityByHour and getRunningStats take a pre-resolved
 * `userIds: string[]` — computed by a SEPARATE function, getFilteredUserIds,
 * which itself does the gated `users` read and has (had) zero error
 * handling of its own. For a real authority manager, getFilteredUserIds
 * fails FIRST and silently collapses to `[]` one layer upstream
 * (AnalyticsDashboard.tsx's own `.catch(() => [])` around that call) —
 * so by the time getActivityByHour/getRunningStats would run, there is no
 * permission-denied error left for a fallback inside THOSE functions to
 * ever catch; they just see an empty userIds array and return an
 * all-zero/default result with no exception at all.
 *
 * The fix: getActivityByHour/getRunningStats no longer accept a
 * caller-resolved userIds array. They take `authorityId` + the same filter
 * fields getFilteredUserIds used to need (gender/persona/neighborhoodId)
 * and resolve the uid scope THEMSELVES, wrapped in their own try/catch —
 * so the permission-denied now surfaces where a fallback can actually see
 * it. This route is that fallback: it resolves the filtered uid scope,
 * computes both aggregates from it, and returns ONLY the aggregates —
 * never a uid array (see the "no uid ever leaves this route family" rule
 * below; dashboard-summary/route.ts states the same rule verbatim).
 *
 * Hard requirements:
 *   - Real Firebase ID token required. No token → 401.
 *   - authorityId resolved SERVER-SIDE from managerIds. Never trusts a
 *     client-supplied authorityId.
 *   - uid not present in any authority's managerIds → 403.
 *   - Response is aggregate numbers only (hourly buckets, running totals) —
 *     no resident name, email, uid, or any other per-person field, and no
 *     uid array, ever leaves this route.
 *   - Demo/mock (core.isMockData) and test/dev (core.isTestData) residents
 *     excluded from the resolved scope.
 *
 * Deliberately DOES roll up child neighborhoods when resolving the base
 * resident pool — a deliberate, named deviation from dashboard-summary's/
 * city-summary's "no rollup" convention (see adminAnalyticsScope.ts's own
 * documented statement of that convention). Required here specifically
 * because the neighborhoodId filter this route implements is otherwise
 * meaningless for a manager: without rollup, the base pool would only ever
 * contain users whose core.authorityId equals the city id itself, none of
 * which can equal a child neighborhood id — so a neighborhood filter would
 * deterministically zero out for every manager, a silent-not-really-zero
 * failure shape, not a scope choice.
 *
 * Deliberately fetches the resident pool's user docs ONCE and reuses them
 * for both the filter-predicate (uid resolution) AND the running-stats
 * target-distance tally — the client's own two-function split does two
 * separate user fetches for the same authority; no reason to replicate
 * that inefficiency server-side.
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

const DIST_LABELS: Record<string, string> = { '3k': '3K', '5k': '5K', '10k': '10K', '2k': '2K', maintenance: 'מינטננס' };

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

    const db: Firestore = getAdminDb();
    const scope = await resolveAuthorityManagerScope(db, uid);
    if (!scope) {
      return NextResponse.json({ error: 'Not an authority manager' }, { status: 403 });
    }
    const { authorityId } = scope;

    const url = new URL(request.url);
    const gender = url.searchParams.get('gender') ?? 'all';
    const persona = url.searchParams.get('persona') ?? 'all';
    const neighborhoodId = url.searchParams.get('neighborhoodId') ?? 'all';
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    const start = startParam ? new Date(startParam) : new Date(new Date().setDate(1));
    const end = endParam ? new Date(endParam) : new Date();

    const emptyBuckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h, label: `${String(h).padStart(2, '0')}:00`, total: 0, strength: 0, running: 0, walking: 0,
    }));

    // Resolve authority + children (rollup — see header comment for why).
    const childrenSnap = await db.collection('authorities').where('parentAuthorityId', '==', authorityId).get();
    const authorityIds = [
      authorityId,
      ...childrenSnap.docs
        .filter((d) => !d.id.includes('__SCHEMA_INIT__') && d.data()?.name !== '__SCHEMA_INIT__')
        .map((d) => d.id),
    ];

    // One fetch of every real resident doc in the rolled-up pool — reused
    // for BOTH the filter predicate and the target-distance tally below.
    const residentDocs: { id: string; data: Record<string, unknown> }[] = [];
    await Promise.all(chunk(authorityIds, 30).map(async (batch) => {
      const snap = await db.collection('users').where('core.authorityId', 'in', batch).get();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!isTestOrMockUser(data?.core)) residentDocs.push({ id: d.id, data });
      });
    }));

    // Same filter predicate as getFilteredUserIds (gender / neighborhoodId / persona).
    const userIds = residentDocs
      .filter(({ data }) => {
        const core = data.core as Record<string, unknown> | undefined;
        if (!core) return false;
        if (gender !== 'all' && core.gender !== gender) return false;
        if (neighborhoodId !== 'all' && core.authorityId !== neighborhoodId) return false;
        if (persona !== 'all') {
          const personaEntries = (data.personas ?? []) as Array<{ id?: string }>;
          if (!personaEntries.some((p) => p?.id === persona)) return false;
        }
        return true;
      })
      .map((d) => d.id);

    if (userIds.length === 0) {
      return NextResponse.json({
        hourlyBuckets: emptyBuckets,
        runningStats: { totalCityKm: 0, targetDistribution: [] },
      });
    }

    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);

    // ONE workouts read, shared by both aggregates below — the client's own
    // getActivityByHour/getRunningStats each read `workouts` independently
    // for the identical scope+range; no reason to repeat that server-side.
    const bucketMap = new Map<number, { hour: number; label: string; total: number; strength: number; running: number; walking: number }>();
    for (let h = 0; h < 24; h++) {
      bucketMap.set(h, { hour: h, label: `${String(h).padStart(2, '0')}:00`, total: 0, strength: 0, running: 0, walking: 0 });
    }
    let totalCityKm = 0;

    await Promise.all(chunk(userIds, 30).map(async (batch) => {
      const snap = await db
        .collection('workouts')
        .where('userId', 'in', batch)
        .where('date', '>=', startTs)
        .where('date', '<=', endTs)
        .get();
      snap.docs.forEach((d) => {
        const raw = d.data();
        const ts = raw?.date as Timestamp | undefined;
        const type = (raw?.activityType ?? raw?.workoutType ?? '') as string;

        if (ts) {
          const hour = ts.toDate().getHours();
          const bucket = bucketMap.get(hour)!;
          bucket.total++;
          if (type === 'running') bucket.running++;
          else if (type === 'walking') bucket.walking++;
          else bucket.strength++;
        }

        if (type === 'running' || type === 'walking') {
          totalCityKm += (raw?.distance as number) ?? 0;
        }
      });
    }));

    // Target distance tally — reuses residentDocs already fetched above,
    // filtered to the resolved userIds, exactly as getRunningStats does.
    const uidSet = new Set(userIds);
    const targetTally = new Map<string, number>();
    residentDocs.filter((d) => uidSet.has(d.id)).forEach(({ data }) => {
      const running = data.running as Record<string, unknown> | undefined;
      const onboarding = running?.onboardingData as Record<string, unknown> | undefined;
      const td = onboarding?.targetDistance as string | undefined;
      if (td) targetTally.set(td, (targetTally.get(td) ?? 0) + 1);
    });
    const targetDistribution = Array.from(targetTally.entries())
      .map(([key, count]) => ({ label: DIST_LABELS[key] ?? key, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      hourlyBuckets: Array.from(bucketMap.values()),
      runningStats: {
        totalCityKm: Math.round(totalCityKm * 10) / 10,
        targetDistribution,
      },
    });
  } catch (err: any) {
    console.error('[/api/authority-manager/filtered-dashboard] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

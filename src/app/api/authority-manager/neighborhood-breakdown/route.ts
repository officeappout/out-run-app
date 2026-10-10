/**
 * GET /api/authority-manager/neighborhood-breakdown
 *
 * Server-side fallback for getNeighborhoodBreakdown
 * (src/features/admin/services/analytics.service.ts) — reads `users` (one
 * equality query) and `workouts` (two batched queries) directly from the
 * browser, both denied by firestore.rules for a real authority manager.
 * Same family/reasoning as dashboard-summary/route.ts and
 * city-aggregates/route.ts — see those files' headers.
 *
 * Separate route, not folded into dashboard-summary or city-aggregates,
 * because this metric takes its own varying params (ageMin/ageMax) that the
 * other two don't — AnalyticsDashboard.tsx calls it once in loadAll() with
 * the authority's saved KPI age-range, and again from a live age-range
 * slider (handleAgeRangeChange) with whatever the admin is currently
 * dragging. Bundling it with a fixed-shape route would make the dedup
 * cache's key wrong for the second call (see the wiring side,
 * analytics.service.ts's fetchNeighborhoodBreakdownFallback — keyed by
 * authorityId+ageMin+ageMax, not authorityId alone).
 *
 * Hard requirements (identical to the other two routes in this family):
 *   - Real Firebase ID token required. No token → 401.
 *   - authorityId resolved SERVER-SIDE from managerIds. Never trusts a
 *     client-supplied authorityId.
 *   - uid not present in any authority's managerIds → 403.
 *   - Response is per-neighborhood aggregate numbers only — no resident
 *     name, email, uid, or any other per-person field ever leaves this
 *     route.
 *   - Demo/mock (core.isMockData) and test/dev (core.isTestData) residents
 *     excluded from every count.
 *
 * Deliberately mirrors the client's OWN scope choice for the `users` read:
 * `core.authorityId == authorityId` (the city itself), a single equality,
 * NOT rolled up to children — a user's core.authorityId is always
 * city-level by convention (core.neighborhoodId is the separate sub-field
 * this function groups by). This is NOT the same "no rollup" limitation
 * dashboard-summary/city-summary have — it's the correct, only-possible
 * shape for this specific query, which the children list (fetched
 * separately, for the neighborhood rows themselves) was never meant to
 * expand.
 *
 * Deliberately does NOT expose `unassignedCount` (residents with no
 * neighborhoodId) on any row — computed and logged server-side for
 * visibility, same as the client version, but never returned. See
 * analytics.service.ts's own comment on why (would be a large, confusing
 * number until the forward-only neighborhoodId-on-pick fix has had time to
 * accumulate real data).
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
    const { authorityId: cityId } = scope;

    const url = new URL(request.url);
    const ageMinRaw = Number(url.searchParams.get('ageMin'));
    const ageMaxRaw = Number(url.searchParams.get('ageMax'));
    const ageMin = Number.isFinite(ageMinRaw) && ageMinRaw > 0 ? ageMinRaw : 35;
    const ageMax = Number.isFinite(ageMaxRaw) && ageMaxRaw > 0 ? ageMaxRaw : 55;

    // 1. Children, for the output rows themselves (and their display names).
    const childrenSnap = await db.collection('authorities').where('parentAuthorityId', '==', cityId).get();
    const children = childrenSnap.docs
      .filter((d) => !d.id.includes('__SCHEMA_INIT__') && d.data()?.name !== '__SCHEMA_INIT__')
      .map((d) => ({ id: d.id, name: (d.data()?.name as string) ?? d.id }));

    if (children.length === 0) {
      return NextResponse.json([]);
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const startTs = Timestamp.fromDate(startOfMonth);
    const endTs = Timestamp.fromDate(now);

    // 2. ALL users of the city itself (core.authorityId is always city-level
    // — single equality, no 'in' chunking needed).
    const citySnap = await db.collection('users').where('core.authorityId', '==', cityId).get();
    const allUserDocs: { id: string; neighborhoodId: string | null; birthYear: number | null }[] = [];
    citySnap.docs.forEach((d) => {
      const data = d.data();
      const core = data?.core as Record<string, unknown> | undefined;
      if (isTestOrMockUser(core)) return;
      const birthDate = core?.birthDate;
      let birthYear: number | null = null;
      if (birthDate) {
        if (birthDate instanceof Date) birthYear = birthDate.getFullYear();
        else if (typeof birthDate === 'string') {
          const parsed = new Date(birthDate);
          if (!isNaN(parsed.getTime())) birthYear = parsed.getFullYear();
        } else if (typeof (birthDate as Timestamp)?.toDate === 'function') {
          birthYear = (birthDate as Timestamp).toDate().getFullYear();
        }
      }
      allUserDocs.push({
        id: d.id,
        neighborhoodId: (core?.neighborhoodId as string) ?? null,
        birthYear,
      });
    });

    const unassignedCount = allUserDocs.filter((u) => !u.neighborhoodId).length;
    console.log(
      `[neighborhood-breakdown] ${children.length} neighborhoods | ${allUserDocs.length} total city users | ` +
      `${unassignedCount} unassigned (no neighborhoodId)`,
    );

    const usersByNeighborhood = new Map<string, typeof allUserDocs>();
    children.forEach((c) => usersByNeighborhood.set(c.id, []));
    allUserDocs.forEach((u) => {
      if (u.neighborhoodId) usersByNeighborhood.get(u.neighborhoodId)?.push(u);
    });

    const allUserIds = allUserDocs.map((d) => d.id);
    if (allUserIds.length === 0) {
      return NextResponse.json(children.map((c) => ({
        neighborhoodId: c.id,
        neighborhoodName: c.name,
        totalUsers: 0, activeUsers: 0, workouts: 0,
        totalActiveMinutes: 0, targetAudienceCount: 0, targetAudiencePercent: 0,
      })));
    }

    // 3. Monthly + all-time workouts, fully parallel batched queries.
    const monthlyActiveByUser = new Map<string, boolean>();
    const totalWorkoutsByUser = new Map<string, number>();
    const totalMinutesByUser = new Map<string, number>();

    await Promise.all([
      Promise.all(chunk(allUserIds, 30).map(async (batch) => {
        const snap = await db
          .collection('workouts')
          .where('userId', 'in', batch)
          .where('date', '>=', startTs)
          .where('date', '<=', endTs)
          .get();
        snap.docs.forEach((d) => {
          const raw = d.data();
          const userId = raw?.userId as string | undefined;
          if (userId) {
            monthlyActiveByUser.set(userId, true);
            const dur = (raw?.duration as number) ?? 0;
            totalMinutesByUser.set(userId, (totalMinutesByUser.get(userId) ?? 0) + dur / 60);
          }
        });
      })),
      Promise.all(chunk(allUserIds, 30).map(async (batch) => {
        const snap = await db.collection('workouts').where('userId', 'in', batch).get();
        snap.docs.forEach((d) => {
          const userId = d.data()?.userId as string | undefined;
          if (userId) totalWorkoutsByUser.set(userId, (totalWorkoutsByUser.get(userId) ?? 0) + 1);
        });
      })),
    ]);

    // 4. Aggregate per neighborhood.
    const rows = children
      .map((child) => {
        const users = usersByNeighborhood.get(child.id) ?? [];
        const userIds = users.map((u) => u.id);
        const totalUsers = userIds.length;
        const activeUsers = userIds.filter((uid2) => monthlyActiveByUser.get(uid2) === true).length;
        const workouts = userIds.reduce((sum, uid2) => sum + (totalWorkoutsByUser.get(uid2) ?? 0), 0);
        const totalActiveMinutes = Math.round(
          userIds.reduce((sum, uid2) => sum + (totalMinutesByUser.get(uid2) ?? 0), 0)
        );

        const targetAudienceCount = users.filter((u) => {
          if (u.birthYear == null) return false;
          const age = currentYear - u.birthYear;
          return age >= ageMin && age <= ageMax;
        }).length;

        const targetAudiencePercent = totalUsers > 0
          ? Math.round((targetAudienceCount / totalUsers) * 1000) / 10
          : 0;

        return {
          neighborhoodId: child.id,
          neighborhoodName: child.name,
          totalUsers,
          activeUsers,
          workouts,
          totalActiveMinutes,
          targetAudienceCount,
          targetAudiencePercent,
        };
      })
      .sort((a, b) => b.activeUsers - a.activeUsers);

    return NextResponse.json(rows);
  } catch (err: any) {
    console.error('[/api/authority-manager/neighborhood-breakdown] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

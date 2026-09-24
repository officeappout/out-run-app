/**
 * GET /api/admin/insights-summary
 *
 * Server-scoped replacement for strategic-insights.service.ts's
 * getHealthWakeUpMetric/getEquipmentGapAnalysis/getSleepyNeighborhoods —
 * see src/lib/adminAnalyticsScope.ts for the full rationale and the
 * role→scope decisions this route enforces (00-MASTER-PLAN.md §13.11 P1).
 *
 * Hard requirements:
 *   - Real Firebase ID token required (Authorization: Bearer <token>). No
 *     token → 401.
 *   - Scope (platform / vertical / this-authority-only / denied) is
 *     resolved SERVER-SIDE from the token's uid via resolveAdminAnalyticsScope.
 *     The client never supplies an authorityId — there isn't even a place
 *     to send one. For 'authority' scope specifically, this route ALSO
 *     resolves the manager's direct child authorities server-side (see
 *     computeInsightsSummary) — this route's equipmentGaps/
 *     sleepyNeighborhoods sections group by neighborhood-level authority
 *     docs, which are children of a manager's city-level authority id, so
 *     without the rollup those sections would always be empty for a
 *     single-city manager.
 *   - denied scope → 403 with a clear message, never a zero-filled body.
 *   - Response is aggregates/numbers only — no resident name, email, or
 *     uid. Test/mock accounts (core.isMockData/core.isTestData) are
 *     excluded from every count via src/lib/testAccountFilter.ts, the
 *     same shared predicate used everywhere else since 00-MASTER-PLAN.md
 *     §13.13.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchScopedUsers(
  db: FirebaseFirestore.Firestore,
  authorityIds: string[] | null,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (authorityIds === null) {
    const snap = await db.collection('users').get();
    return snap.docs;
  }
  if (authorityIds.length === 0) return [];
  const batches = await Promise.all(
    chunk(authorityIds, 30).map((batch) =>
      db.collection('users').where('core.authorityId', 'in', batch).get(),
    ),
  );
  return batches.flatMap((s) => s.docs);
}

/**
 * Core computation, factored out of the HTTP handler so its one hard
 * security property — the result depends ONLY on `scope` (itself resolved
 * server-side from the verified token's uid), never on anything the
 * client's request could carry — is directly unit-testable: call this
 * with two different fake NextRequests (one plain, one with an injected
 * `?authorityId=<other-city>` the route never reads) and the SAME scope,
 * and the output must be byte-identical. See __tests__/route.test.ts.
 */
export async function computeInsightsSummary(db: FirebaseFirestore.Firestore, scope: AdminAnalyticsScope) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  }

  // Unlike city-summary/dashboard-summary (deliberately NOT rolling up
  // children — they only need a flat city-wide count), this route's whole
  // point is neighborhood-level grouping (equipmentGaps/sleepyNeighborhoods),
  // which is meaningless without it: a resident's core.authorityId is
  // typically their CITY id, but the neighborhood-level authority docs this
  // route groups by are children of that city — so an authority-scoped
  // manager needs their own id PLUS every direct child to see anything at
  // all in those two sections. Mirrors the client-side getAuthorityWithChildrenIds
  // pattern (analytics.service.ts / health-economics.service.ts) that fed
  // the pre-existing versions of these 3 metrics, just resolved server-side.
  let authorityIds: string[] | null;
  if (scope.kind === 'platform') {
    authorityIds = null;
  } else if (scope.kind === 'vertical') {
    authorityIds = scope.authorityIds;
  } else {
    const childrenSnap = await db.collection('authorities').where('parentAuthorityId', '==', scope.authorityId).get();
    authorityIds = [scope.authorityId, ...childrenSnap.docs.map((d) => d.id)];
  }

  {
    const userDocs = await fetchScopedUsers(db, authorityIds);
    const realUserDocs = userDocs.filter((d) => !isTestOrMockUser(d.data()?.core as Record<string, unknown> | undefined));

    // ── Health Wake-Up Metric ────────────────────────────────────────────
    const inactiveUserIds: string[] = [];
    realUserDocs.forEach((doc) => {
      const data = doc.data();
      const historyFreq = data?.historyFrequency ?? data?.lifestyle?.historyFrequency ?? data?.onboardingData?.historyFrequency;
      if (typeof historyFreq === 'string' && ['none', 'NONE', 'low', 'LOW'].includes(historyFreq)) {
        inactiveUserIds.push(doc.id);
      }
    });

    const workoutsByUser = new Map<string, number>();
    const realUserIdSet = new Set(realUserDocs.map((d) => d.id));
    if (realUserIdSet.size > 0) {
      const workoutBatches = await Promise.all(
        chunk(Array.from(realUserIdSet), 30).map((batch) =>
          db.collection('workouts').where('userId', 'in', batch).get(),
        ),
      );
      workoutBatches.flat().forEach((snap) => {
        snap.docs.forEach((doc) => {
          const userId = doc.data()?.userId;
          if (typeof userId === 'string') workoutsByUser.set(userId, (workoutsByUser.get(userId) ?? 0) + 1);
        });
      });
    }

    const nowActiveUsers = inactiveUserIds.filter((id) => (workoutsByUser.get(id) ?? 0) > 1).length;
    const totalInactiveUsers = inactiveUserIds.length;
    const healthWakeUp = {
      totalInactiveUsers,
      nowActiveUsers,
      successRate: totalInactiveUsers > 0 ? Math.round((nowActiveUsers / totalInactiveUsers) * 1000) / 10 : 0,
    };

    // ── Authorities lookup (neighborhoods/settlements only, for equipment
    // gaps + sleepy neighborhoods — both operate at that granularity) ─────
    const authoritiesSnap =
      authorityIds === null
        ? await db.collection('authorities').get()
        : authorityIds.length === 0
          ? { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }
          : { docs: (await Promise.all(chunk(authorityIds, 30).map((b) => db.collection('authorities').where('__name__', 'in', b).get()))).flatMap((s) => s.docs) };

    const authorityMap = new Map<string, { name: string; type: string; parentId?: string; userCount?: number }>();
    authoritiesSnap.docs.forEach((d) => {
      const data = d.data();
      const rawName = data?.name;
      const name = typeof rawName === 'string' ? rawName : (rawName?.he || rawName?.en || '');
      authorityMap.set(d.id, { name, type: data?.type, parentId: data?.parentAuthorityId, userCount: data?.userCount });
    });

    // ── Equipment Gap Analysis ────────────────────────────────────────────
    const gearSnap = await db.collection('gear_definitions').get();
    const gearMap = new Map<string, string>();
    gearSnap.docs.forEach((d) => {
      const name = d.data()?.name;
      gearMap.set(d.id, (typeof name === 'object' ? (name?.he || name?.en) : name) || d.id);
    });

    const parksSnap = await db.collection('parks').get();
    const parksByAuthority = new Map<string, string[]>();
    parksSnap.docs.forEach((d) => {
      const data = d.data();
      const authorityId = data?.authorityId;
      if (!authorityId) return;
      if (authorityIds !== null && !authorityIds.includes(authorityId)) return;
      if (!parksByAuthority.has(authorityId)) parksByAuthority.set(authorityId, []);
      parksByAuthority.get(authorityId)!.push(...(data?.facilities ?? []));
    });

    const usersByAuthority = new Map<string, { equipment: string[] }[]>();
    realUserDocs.forEach((doc) => {
      const data = doc.data();
      const authorityId = data?.core?.authorityId;
      if (!authorityId) return;
      const equipment = data?.equipment ?? {};
      const equipmentIds: string[] = [
        ...(Array.isArray(equipment.home) ? equipment.home : []),
        ...(Array.isArray(equipment.office) ? equipment.office : []),
        ...(Array.isArray(equipment.outdoor) ? equipment.outdoor : []),
      ];
      if (!usersByAuthority.has(authorityId)) usersByAuthority.set(authorityId, []);
      usersByAuthority.get(authorityId)!.push({ equipment: equipmentIds });
    });

    const equipmentGaps: Array<{
      neighborhoodId: string;
      neighborhoodName: string;
      cityName: string;
      equipmentDemand: { equipmentId: string; equipmentName: string; userCount: number }[];
      availableFacilities: string[];
    }> = [];
    usersByAuthority.forEach((users, authorityId) => {
      const authority = authorityMap.get(authorityId);
      if (!authority || (authority.type !== 'neighborhood' && authority.type !== 'settlement')) return;

      const equipmentCounts = new Map<string, number>();
      users.forEach((u) => u.equipment.forEach((id) => equipmentCounts.set(id, (equipmentCounts.get(id) ?? 0) + 1)));
      const equipmentDemand = Array.from(equipmentCounts.entries())
        .map(([equipmentId, userCount]) => ({ equipmentId, equipmentName: gearMap.get(equipmentId) ?? equipmentId, userCount }))
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 10);

      const parentAuth = authority.parentId ? authorityMap.get(authority.parentId) : null;
      equipmentGaps.push({
        neighborhoodId: authorityId,
        neighborhoodName: authority.name,
        cityName: parentAuth?.name ?? 'לא זוהה',
        equipmentDemand,
        availableFacilities: Array.from(new Set(parksByAuthority.get(authorityId) ?? [])),
      });
    });
    equipmentGaps.sort((a, b) => b.equipmentDemand.length - a.equipmentDemand.length);

    // ── Sleepy Neighborhoods ──────────────────────────────────────────────
    const usersCountByAuthority = new Map<string, number>();
    realUserDocs.forEach((doc) => {
      const authorityId = doc.data()?.core?.authorityId;
      if (authorityId) usersCountByAuthority.set(authorityId, (usersCountByAuthority.get(authorityId) ?? 0) + 1);
    });
    // parksByAuthority (built above) stores flattened facility NAMES, not
    // park counts — a separate pass over the same already-fetched snapshot.
    const parksCountByAuthority = new Map<string, number>();
    parksSnap.docs.forEach((d) => {
      const authorityId = d.data()?.authorityId;
      if (!authorityId) return;
      if (authorityIds !== null && !authorityIds.includes(authorityId)) return;
      parksCountByAuthority.set(authorityId, (parksCountByAuthority.get(authorityId) ?? 0) + 1);
    });

    const sleepyNeighborhoods: Array<{
      neighborhoodId: string; neighborhoodName: string; cityName: string;
      userCount: number; populationEstimate?: number; penetrationRate: number; parksCount: number;
    }> = [];
    authorityMap.forEach((authority, authorityId) => {
      if (authority.type !== 'neighborhood' && authority.type !== 'settlement') return;
      const userCount = usersCountByAuthority.get(authorityId) ?? 0;
      const parksCount = parksCountByAuthority.get(authorityId) ?? 0;
      const parentAuth = authority.parentId ? authorityMap.get(authority.parentId) : null;
      const populationEstimate = authority.userCount || undefined;
      const penetrationRate = populationEstimate && populationEstimate > 0
        ? Math.round((userCount / populationEstimate) * 10000) / 100
        : 0;
      sleepyNeighborhoods.push({
        neighborhoodId: authorityId,
        neighborhoodName: authority.name,
        cityName: parentAuth?.name ?? 'לא זוהה',
        userCount, populationEstimate, penetrationRate, parksCount,
      });
    });
    sleepyNeighborhoods.sort((a, b) => {
      if (a.populationEstimate && b.populationEstimate) return a.penetrationRate - b.penetrationRate;
      return a.userCount - b.userCount;
    });

    return {
      status: 200 as const,
      body: {
        scope: scope.kind,
        healthWakeUp,
        equipmentGaps,
        sleepyNeighborhoods: sleepyNeighborhoods.slice(0, 10),
      },
    };
  }
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
    const result = await computeInsightsSummary(db, scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/insights-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

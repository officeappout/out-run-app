/**
 * GET /api/admin/statistics-summary
 *
 * Server-scoped replacement for cpo-analytics.service.ts's
 * getExecutiveSummary/getAuthorityPerformance/getPremiumMetrics — see
 * src/lib/adminAnalyticsScope.ts for the shared scope resolver and its
 * documented role→scope rationale (00-MASTER-PLAN.md §13.11 P1).
 *
 * Design decision specific to THIS route (documented per David's request):
 * every metric here is inherently cross-authority — executiveSummary's
 * activeAuthorities/activeClients/totalPlatformAdmins compare authorities
 * against each other or count platform-wide admins; authorityPerformance
 * IS a cross-authority comparison table by definition; premiumMetrics is a
 * platform-wide placeholder. None of these has a meaningful single-city
 * variant, and city-scoped equivalents of the parts that DO make sense per
 * city (totalUsers, growth, completion rate) already exist on
 * /api/authority-manager/city-summary and dashboard-summary. So:
 *   - 'platform' scope: full response, computed over ALL authorities.
 *   - 'vertical' scope: authorityPerformance filtered to that vertical
 *     (a real, meaningful comparison — "how do MY vertical's authorities
 *     compare"). executiveSummary's totalUsers/weeklyGrowthPercent/
 *     overallCompletionRate are likewise computed over just that
 *     vertical's users; activeAuthorities/activeClients/
 *     totalPlatformAdmins/premiumMetrics stay platform-wide-only concepts
 *     — returned null, listed in notApplicable, with a message instead of
 *     zero (00-MASTER-PLAN.md §13.13 P2's "blocked screen shows a message,
 *     not 0" policy — first real application of it, per David's request).
 *   - 'authority' scope (a single-city manager): this WHOLE route is not
 *     applicable — every field here is either a cross-authority comparison
 *     or a platform-wide number, and the city-scoped numbers that DO make
 *     sense for them already exist on city-summary/dashboard-summary. 403
 *     with a clear message, not a zero-filled body.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'הנתונים כאן משווים בין רשויות או משקפים את כל הפלטפורמה — לא רלוונטי לתפקיד שלך. לנתוני העיר שלך, ראה את לוח הבקרה שלך.';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Core computation, factored out of the HTTP handler so its one hard
 * security property — the result depends ONLY on `scope` (itself resolved
 * server-side from the verified token's uid), never on anything the
 * client's request could carry — is directly unit-testable. See
 * insights-summary/route.ts's sibling comment and __tests__/route.test.ts.
 */
export async function computeStatisticsSummary(db: FirebaseFirestore.Firestore, scope: AdminAnalyticsScope) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  }
  if (scope.kind === 'authority') {
    return { status: 403 as const, body: { error: NOT_APPLICABLE_MESSAGE } };
  }

  {
    const authorityIds: string[] | null = scope.kind === 'platform' ? null : scope.authorityIds;

    // ── Users (scoped when vertical, real accounts only) ──────────────────
    const userDocs =
      authorityIds === null
        ? (await db.collection('users').get()).docs
        : authorityIds.length === 0
          ? []
          : (await Promise.all(chunk(authorityIds, 30).map((b) => db.collection('users').where('core.authorityId', 'in', b).get()))).flatMap((s) => s.docs);
    const realUserDocs = userDocs.filter((d) => !isTestOrMockUser(d.data()?.core as Record<string, unknown> | undefined));

    const totalUsers = realUserDocs.length;
    const completedOnboarding = realUserDocs.filter((d) => d.data()?.onboardingStatus === 'COMPLETED').length;
    const overallCompletionRate = totalUsers > 0 ? Math.round((completedOnboarding / totalUsers) * 1000) / 10 : 0;

    const now = new Date();
    const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 7);
    const lastWeekStart = new Date(now); lastWeekStart.setDate(now.getDate() - 14);
    const toDate = (v: unknown): Date | null => {
      if (!v) return null;
      if (v instanceof Date) return v;
      if (typeof (v as any)?.toDate === 'function') return (v as any).toDate();
      return null;
    };
    let thisWeekUsers = 0;
    let lastWeekUsers = 0;
    realUserDocs.forEach((d) => {
      const joinDate = toDate(d.data()?.createdAt);
      if (!joinDate) return;
      if (joinDate >= thisWeekStart) thisWeekUsers++;
      else if (joinDate >= lastWeekStart) lastWeekUsers++;
    });
    const totalSample = thisWeekUsers + lastWeekUsers;
    const weeklyGrowthPercent = totalSample === 0
      ? 0
      : lastWeekUsers === 0
        ? (thisWeekUsers > 0 ? 100 : 0)
        : totalSample < 3
          ? 0
          : ((thisWeekUsers - lastWeekUsers) / lastWeekUsers) * 100;

    const notApplicable: string[] = [];
    let activeAuthorities: number | null = null;
    let activeClients: number | null = null;
    let totalPlatformAdmins: number | null = null;
    let premiumMetrics: { conversionRate: number; totalUsers: number; premiumUsers: number } | null = null;

    if (scope.kind === 'platform') {
      const authoritiesSnap = await db.collection('authorities').get();
      activeAuthorities = authoritiesSnap.docs.filter((d) => (d.data()?.userCount ?? 0) > 0).length;
      activeClients = authoritiesSnap.docs.filter((d) => d.data()?.isActiveClient === true).length;
      totalPlatformAdmins = realUserDocs.filter((d) => d.data()?.core?.isSuperAdmin === true).length;
      premiumMetrics = { conversionRate: 0, totalUsers, premiumUsers: 0 }; // placeholder, matches pre-existing cpo-analytics.service.ts behavior
    } else {
      notApplicable.push('activeAuthorities', 'activeClients', 'totalPlatformAdmins', 'premiumMetrics');
    }

    // ── Authority performance table (all authorities for platform scope,
    // filtered to the vertical otherwise) ─────────────────────────────────
    const perfAuthoritiesSnap =
      authorityIds === null
        ? await db.collection('authorities').get()
        : authorityIds.length === 0
          ? { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }
          : { docs: (await Promise.all(chunk(authorityIds, 30).map((b) => db.collection('authorities').where('__name__', 'in', b).get()))).flatMap((s) => s.docs) };

    const usersByAuthority = new Map<string, string[]>();
    realUserDocs.forEach((d) => {
      const aid = d.data()?.core?.authorityId;
      if (!aid) return;
      if (!usersByAuthority.has(aid)) usersByAuthority.set(aid, []);
      usersByAuthority.get(aid)!.push(d.id);
    });

    const relevantUserIds = Array.from(usersByAuthority.values()).flat();
    const workoutsByUser = new Map<string, number>();
    if (relevantUserIds.length > 0) {
      const workoutBatches = await Promise.all(
        chunk(relevantUserIds, 30).map((b) => db.collection('workouts').where('userId', 'in', b).get()),
      );
      workoutBatches.flat().forEach((snap) => {
        snap.docs.forEach((doc) => {
          const userId = doc.data()?.userId;
          if (typeof userId === 'string') workoutsByUser.set(userId, (workoutsByUser.get(userId) ?? 0) + 1);
        });
      });
    }

    const parksSnap = await db.collection('parks').get();
    const parksByAuthority = new Map<string, number>();
    parksSnap.docs.forEach((d) => {
      const aid = d.data()?.authorityId;
      if (!aid) return;
      if (authorityIds !== null && !authorityIds.includes(aid)) return;
      parksByAuthority.set(aid, (parksByAuthority.get(aid) ?? 0) + 1);
    });

    const authorityPerformance = perfAuthoritiesSnap.docs
      .map((d) => {
        const data = d.data();
        const rawName = data?.name;
        const authorityName = typeof rawName === 'string' ? rawName : (rawName?.he || rawName?.en || '');
        const userIds = usersByAuthority.get(d.id) ?? [];
        const userCount = userIds.length;
        const totalWorkouts = userIds.reduce((sum, uid) => sum + (workoutsByUser.get(uid) ?? 0), 0);
        return {
          authorityId: d.id,
          authorityName,
          userCount,
          activeParks: parksByAuthority.get(d.id) ?? 0,
          engagementScore: userCount > 0 ? Math.round((totalWorkouts / userCount) * 10) / 10 : 0,
        };
      })
      .sort((a, b) => b.userCount - a.userCount);

    return {
      status: 200 as const,
      body: {
        scope: scope.kind,
        vertical: scope.kind === 'vertical' ? scope.vertical : undefined,
        executiveSummary: {
          totalUsers,
          weeklyGrowthPercent: Math.round(weeklyGrowthPercent * 10) / 10,
          overallCompletionRate,
          activeAuthorities,
          activeClients,
          totalPlatformAdmins,
        },
        authorityPerformance,
        premiumMetrics,
        notApplicable,
        notApplicableMessage: notApplicable.length > 0 ? NOT_APPLICABLE_MESSAGE : undefined,
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
    const result = await computeStatisticsSummary(db, scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/statistics-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/admin/growth-metrics
 *
 * Analytics v2 — Phase 1 (04.10.2026). Server-scoped, same role→scope
 * resolver as /api/admin/statistics-summary (`resolveAdminAnalyticsScope`,
 * see src/lib/adminAnalyticsScope.ts) — never a client-supplied
 * authorityId. Computes:
 *
 *   - northStar: weeklyActiveExercisers (distinct users with ≥1 workout in
 *     the last 7 days) + workoutsPerActiveUser (workouts in that same
 *     7-day window ÷ weeklyActiveExercisers). Deliberately NOT derived
 *     from `progression.currentStreak` — that field has a confirmed ~47%
 *     accuracy bug (`.claude/knowledge/streak-system-and-behavioral-
 *     analytics-map.md`) and no metric here may depend on it. Every
 *     activity signal below comes from real `workouts` docs.
 *   - northStar also carries dailyActiveUsers/monthlyActiveUsers/
 *     stickinessPct (journey-hub Phase 0, growth-analytics-plan.md §3).
 *     monthlyActiveUsers is a true 30-day DISTINCT-user union, not a sum
 *     of activeUsersTrend's per-day counts — summing those would
 *     double-count any user active on more than one day. It's computed
 *     from the SAME `relevantWorkoutDocs` the trend loop already walks
 *     (one extra Set, zero extra reads). stickinessPct = dailyActiveUsers
 *     ÷ monthlyActiveUsers × 100, matching the industry DAU/MAU
 *     definition the plan doc's benchmark band (20-30% solid, >50% =
 *     daily-habit) is stated against.
 *   - activeUsersTrend: distinct active users per day, last 30 days —
 *     the Hero chart's line.
 *   - pushCampaignMarkers: one marker per push category, dated at that
 *     category's first `push_sent` within the 30-day window. Shaped as
 *     `{ date, label, type }` with `type` always 'push_campaign' today —
 *     deliberately a discriminated union of ONE member so a future
 *     'municipality_launch' / 'feature_release' marker (explicitly
 *     deferred, see the 04.10.2026 audit doc) plugs into the SAME field
 *     without a shape change, not a parallel mechanism.
 *   - economyByAuthority: coins balance (progression.coins, summed, no
 *     extra read — already loaded with the user docs) + coins earned in
 *     the last 7 days (from the same workouts window), per authority.
 *
 * Read-cost design: ONE `users` collection read + ONE `workouts` range
 * query (`date >= 30 days ago`, no `userId` filter) serve every metric
 * above — platform scope reads workouts exactly once regardless of user
 * count (the audit's explicit recommendation: a bare date-range query over
 * `workouts` needs no composite index, unlike the `userId in [...]`
 * batching pattern `analytics.service.ts` uses for its per-authority
 * DAU/trend functions). Vertical scope reuses the SAME single query,
 * filtered in memory against that vertical's real user-id set — cheaper
 * than batching per vertical too.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'הנתונים כאן משקפים את כל הפלטפורמה — לא רלוונטי לתפקיד שלך. לנתוני העיר שלך, ראה את לוח הבקרה שלך.';

const TREND_WINDOW_DAYS = 30;
const ACTIVE_WINDOW_DAYS = 7;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date })?.toDate === 'function') return (v as { toDate: () => Date }).toDate();
  return null;
}

export interface PushCampaignMarker {
  date: string;
  label: string;
  type: 'push_campaign';
}

/**
 * Core computation, factored out of the HTTP handler so it's directly
 * unit-testable against a fake Firestore — same shape as
 * statistics-summary/route.ts's computeStatisticsSummary.
 */
export async function computeGrowthMetrics(db: FirebaseFirestore.Firestore, scope: AdminAnalyticsScope) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  }
  if (scope.kind === 'authority') {
    return { status: 403 as const, body: { error: NOT_APPLICABLE_MESSAGE } };
  }

  const authorityIds: string[] | null = scope.kind === 'platform' ? null : scope.authorityIds;

  // ── Users (scoped when vertical, real accounts only) ────────────────────
  const userDocs =
    authorityIds === null
      ? (await db.collection('users').get()).docs
      : authorityIds.length === 0
        ? []
        : (await Promise.all(chunk(authorityIds, 30).map((b) => db.collection('users').where('core.authorityId', 'in', b).get()))).flatMap((s) => s.docs);
  const realUserDocs = userDocs.filter((d) => !isTestOrMockUser(d.data()?.core as Record<string, unknown> | undefined));
  const realUserIds = new Set(realUserDocs.map((d) => d.id));
  const userIdToAuthorityId = new Map<string, string>();
  realUserDocs.forEach((d) => {
    const aid = d.data()?.core?.authorityId;
    if (typeof aid === 'string' && aid) userIdToAuthorityId.set(d.id, aid);
  });

  // ── One workouts range query, last 30 days, no userId filter ────────────
  const now = new Date();
  const trendStart = new Date(now);
  trendStart.setDate(trendStart.getDate() - (TREND_WINDOW_DAYS - 1));
  trendStart.setHours(0, 0, 0, 0);
  const activeWindowStart = new Date(now);
  activeWindowStart.setDate(activeWindowStart.getDate() - ACTIVE_WINDOW_DAYS);

  let relevantWorkoutDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  try {
    const workoutsSnap = await db
      .collection('workouts')
      .where('date', '>=', trendStart)
      .get();
    relevantWorkoutDocs = workoutsSnap.docs.filter((d) => {
      const uid = d.data()?.userId;
      if (typeof uid !== 'string' || !realUserIds.has(uid)) return false;
      if (authorityIds !== null) {
        const aid = userIdToAuthorityId.get(uid);
        if (!aid || !authorityIds.includes(aid)) return false;
      }
      return true;
    });
  } catch (err) {
    console.error('[/api/admin/growth-metrics] workouts range query failed:', err);
    relevantWorkoutDocs = [];
  }

  // ── Daily active-users trend (Hero chart) + the 30-day distinct union
  //    (monthlyActiveUsers) in the same pass — the union is NOT derivable
  //    from the per-day counts below after the fact (see module header).
  const dateMap = new Map<string, Set<string>>();
  for (let i = TREND_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dateMap.set(d.toISOString().split('T')[0], new Set());
  }
  const monthlyActiveSet = new Set<string>();
  relevantWorkoutDocs.forEach((d) => {
    const data = d.data();
    const date = toDateSafe(data?.date);
    const uid = data?.userId;
    if (!date || typeof uid !== 'string') return;
    const key = date.toISOString().split('T')[0];
    dateMap.get(key)?.add(uid);
    monthlyActiveSet.add(uid);
  });
  const activeUsersTrend = Array.from(dateMap.entries()).map(([date, users]) => ({ date, activeUsers: users.size }));
  const dailyActiveUsers = activeUsersTrend[activeUsersTrend.length - 1]?.activeUsers ?? 0;
  const monthlyActiveUsers = monthlyActiveSet.size;
  const stickinessPct = monthlyActiveUsers > 0
    ? Math.round((dailyActiveUsers / monthlyActiveUsers) * 1000) / 10
    : 0;

  // ── North-Star: weekly active exercisers + workouts/active-user ─────────
  const weeklyActiveSet = new Set<string>();
  let workoutsInWindow = 0;
  const coinsEarned7dByAuthority = new Map<string, number>();
  relevantWorkoutDocs.forEach((d) => {
    const data = d.data();
    const date = toDateSafe(data?.date);
    const uid = data?.userId;
    if (!date || typeof uid !== 'string' || date < activeWindowStart) return;
    weeklyActiveSet.add(uid);
    workoutsInWindow++;
    const aid = userIdToAuthorityId.get(uid);
    if (aid) {
      const coins = typeof data?.earnedCoins === 'number' ? data.earnedCoins : 0;
      coinsEarned7dByAuthority.set(aid, (coinsEarned7dByAuthority.get(aid) ?? 0) + coins);
    }
  });
  const weeklyActiveExercisers = weeklyActiveSet.size;
  const workoutsPerActiveUser = weeklyActiveExercisers > 0
    ? Math.round((workoutsInWindow / weeklyActiveExercisers) * 10) / 10
    : 0;

  // ── Economy: coins balance per authority (already-loaded user docs, no
  //    extra read) + coins earned in the last 7 days (from the same
  //    workouts window above) ───────────────────────────────────────────
  const coinsBalanceByAuthority = new Map<string, number>();
  realUserDocs.forEach((d) => {
    const data = d.data();
    const aid = data?.core?.authorityId;
    if (typeof aid !== 'string' || !aid) return;
    if (authorityIds !== null && !authorityIds.includes(aid)) return;
    const coins = typeof data?.progression?.coins === 'number' ? data.progression.coins : 0;
    coinsBalanceByAuthority.set(aid, (coinsBalanceByAuthority.get(aid) ?? 0) + coins);
  });

  const authorityIdsToResolve = new Set(Array.from(coinsBalanceByAuthority.keys()).concat(Array.from(coinsEarned7dByAuthority.keys())));
  let economyByAuthority: { authorityId: string; authorityName: string; coinsBalance: number; coinsEarned7d: number }[] = [];
  if (authorityIdsToResolve.size > 0) {
    const authorityDocs = (
      await Promise.all(chunk(Array.from(authorityIdsToResolve), 30).map((b) => db.collection('authorities').where('__name__', 'in', b).get()))
    ).flatMap((s) => s.docs);
    economyByAuthority = authorityDocs
      .map((d) => {
        const data = d.data();
        const rawName = data?.name;
        const authorityName = typeof rawName === 'string' ? rawName : (rawName?.he || rawName?.en || d.id);
        return {
          authorityId: d.id,
          authorityName,
          coinsBalance: coinsBalanceByAuthority.get(d.id) ?? 0,
          coinsEarned7d: coinsEarned7dByAuthority.get(d.id) ?? 0,
        };
      })
      .sort((a, b) => b.coinsBalance - a.coinsBalance);
  }

  // ── Push-campaign markers (platform-wide context, shown regardless of
  //    scope — campaign category + date is non-sensitive business
  //    metadata, not a per-vertical metric; see module header) ────────────
  let pushCampaignMarkers: PushCampaignMarker[] = [];
  try {
    const pushSentSnap = await db.collection('push_events').where('eventType', '==', 'push_sent').get();
    const firstSeenByCategory = new Map<string, Date>();
    pushSentSnap.docs.forEach((d) => {
      const data = d.data();
      const sentAt = toDateSafe(data?.sentAt);
      if (!sentAt || sentAt < trendStart) return;
      const category = typeof data?.category === 'string' && data.category ? data.category : 'ללא קטגוריה';
      const existing = firstSeenByCategory.get(category);
      if (!existing || sentAt < existing) firstSeenByCategory.set(category, sentAt);
    });
    pushCampaignMarkers = Array.from(firstSeenByCategory.entries())
      .map(([label, date]) => ({ date: date.toISOString().split('T')[0], label, type: 'push_campaign' as const }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error('[/api/admin/growth-metrics] push_events query failed:', err);
    pushCampaignMarkers = [];
  }

  return {
    status: 200 as const,
    body: {
      scope: scope.kind,
      vertical: scope.kind === 'vertical' ? scope.vertical : undefined,
      northStar: {
        weeklyActiveExercisers,
        workoutsPerActiveUser,
        dailyActiveUsers,
        monthlyActiveUsers,
        stickinessPct,
      },
      activeUsersTrend,
      pushCampaignMarkers,
      economyByAuthority,
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
    const result = await computeGrowthMetrics(db, scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/growth-metrics] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

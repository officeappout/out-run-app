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
 *
 * Journey Hub Wave 2 (05.10.2026, approved wave plan) additions —
 * same read-cost discipline, each either zero new reads or one bounded
 * new batch:
 *   - Segmentation filters (program/level/sex/age) + date/campaign/
 *     source/city, applied as an IN-MEMORY predicate on `realUserDocs`
 *     BEFORE every computation above runs — zero new reads, every
 *     existing computation just operates on a narrowed set. `program`
 *     reuses `hasStrengthTrack`/`hasRunningTrack` (track-ownership.ts,
 *     not re-derived here); `level` reuses `getLevelTier` (split-
 *     decision.types.ts). See `applyUserFilters` below.
 *   - activationBySource / activation.{avg,median}DaysToFirstWorkout:
 *     both driven by ONE unscoped `workouts` collection read, filtered
 *     through `isRealWorkoutCompletion` (workout-completion-kpi.ts —
 *     the locked KPI definition, shared with funnel-analytics.
 *     service.ts's client-side fix). Bug-fix round, 06.10.2026 (BUG 1):
 *     originally keyed on `progression.workoutCount >= 1`, a client-
 *     written best-effort counter (completion-sync.service.ts:
 *     137-146) that silently under-counts on any write failure. Fixed
 *     by adopting the SAME real-completion source already proven in
 *     `users.service.ts:162-167` / `admin/users/all/page.tsx:211-217`
 *     — one unscoped `workouts` read, not a second denormalized
 *     counter. Deliberately not scoped to the 30-day trend window
 *     above (a user's first-ever real workout can predate it).
 *   - newUsersTrend: day-bucketed signup counts from `realUserDocs`'
 *     own `createdAt` — same dateMap template as activeUsersTrend
 *     above, fed from a different field, zero new reads.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { hasStrengthTrack, hasRunningTrack } from '@/lib/track-ownership';
import { getLevelTier } from '@/features/workout-engine/services/split-decision/split-decision.types';
import { getAgeInYears } from '@/lib/age-buckets';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';

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

/** True when `program` is a real strength-program slug, not one of the 2 broad buckets or null. Same trivial helper as funnel-analytics.service.ts's — not shared across a client/server boundary for one line. */
function isSpecificProgramSlug(program: string | null): program is string {
  return !!program && program !== 'running' && program !== 'map_only';
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
 * Segmentation + cross-cutting filters — Journey Hub Wave 2. Every field
 * is optional/null = "no constraint," matching `FunnelFilters`' existing
 * convention (funnel-analytics.service.ts) so the Journey hub's shared
 * filter row can drive both this route and the client-side funnel with
 * the same mental model, even though the two sources apply filters very
 * differently (this route: in-memory predicate over already-fetched
 * docs; the funnel: native Firestore `where()` constraints).
 */
export interface GrowthMetricsFilters {
  dateFrom: Date | null;
  dateTo: Date | null;
  campaign: string | null;
  source: string | null;
  medium: string | null;
  /** `authorities/{id}` doc id — narrows to one city within the caller's scope. */
  cityAuthorityId: string | null;
  sex: 'male' | 'female' | 'other' | null;
  /**
   * 'beginner'/'intermediate'/'advanced' (global-level tier) when
   * `program` is null/'running'/'map_only'. A plain `number` (next
   * panel wave, 06.10.2026) ONLY when `program` is a specific
   * strength-program slug: "minimum level within THAT program" —
   * see `userMatchesFilters`'s own comment.
   */
  level: 'beginner' | 'intermediate' | 'advanced' | number | null;
  /**
   * 'map_only' = neither strength nor running track. Any OTHER non-
   * null value (next panel wave, 06.10.2026) is a real strength-
   * program slug (e.g. 'front_lever') — the actual named programs,
   * replacing the old generic 'strength' bucket.
   */
  program: string | null;
  /** Admin-defined range, in years — no fixed buckets. See `age-buckets.ts`. */
  ageFrom: number | null;
  ageTo: number | null;
}

export const DEFAULT_GROWTH_METRICS_FILTERS: GrowthMetricsFilters = {
  dateFrom: null,
  dateTo: null,
  campaign: null,
  source: null,
  medium: null,
  cityAuthorityId: null,
  sex: null,
  level: null,
  program: null,
  ageFrom: null,
  ageTo: null,
};

/**
 * The one chokepoint every segmentation/cross-cutting filter passes
 * through — applied to `realUserDocs` BEFORE any downstream computation,
 * so every metric this route returns is automatically scoped without
 * touching the computation code itself. Returns true = keep the doc.
 */
function userMatchesFilters(
  data: FirebaseFirestore.DocumentData,
  filters: GrowthMetricsFilters,
  now: Date,
): boolean {
  if (filters.cityAuthorityId && data?.core?.authorityId !== filters.cityAuthorityId) return false;
  if (filters.campaign && data?.marketingAttribution?.campaign !== filters.campaign) return false;
  if (filters.source && data?.marketingAttribution?.source !== filters.source) return false;
  if (filters.medium && data?.marketingAttribution?.medium !== filters.medium) return false;
  if (filters.sex && data?.core?.gender !== filters.sex) return false;

  if (filters.dateFrom || filters.dateTo) {
    const createdAt = toDateSafe(data?.createdAt);
    if (!createdAt) return false;
    if (filters.dateFrom && createdAt < filters.dateFrom) return false;
    if (filters.dateTo && createdAt > filters.dateTo) return false;
  }

  const specificProgramSlug = isSpecificProgramSlug(filters.program) ? filters.program : null;

  // Shared helper for the specific-program case below: the best
  // (highest) currentLevel found for `slug` across BOTH `progression.
  // domains` and `.tracks` — checking both fields is a free in-memory
  // win this server route can take that the funnel's native query
  // (funnel-analytics.service.ts, one field path only) can't. Does
  // NOT also check the Firestore-doc-ID hash key some legacy docs use
  // instead of the slug ([[healingpass-dualkey-domains]] — separately-
  // tracked tech debt, a dedicated writer-normalize + backfill task,
  // not resolved here either) — importing that resolver would pull a
  // client-Firestore-SDK file into this Admin SDK route.
  const bestProgramLevel = (slug: string): number => {
    const levels = [
      data?.progression?.domains?.[slug]?.currentLevel,
      data?.progression?.tracks?.[slug]?.currentLevel,
    ].filter((l): l is number => typeof l === 'number');
    return levels.length > 0 ? Math.max(...levels) : 0;
  };

  if (typeof filters.level === 'number') {
    // Next panel wave, 06.10.2026: a specific program is selected, so
    // "level" means "minimum level WITHIN that program," not the
    // global tier. No-op (keeps the doc) if no specific program is
    // selected — matches the UI, which only shows a numeric level
    // once a program is chosen.
    if (specificProgramSlug && bestProgramLevel(specificProgramSlug) < filters.level) return false;
  } else if (filters.level) {
    const globalLevel = typeof data?.progression?.globalLevel === 'number' ? data.progression.globalLevel : 0;
    if (getLevelTier(globalLevel) !== filters.level) return false;
  }

  if (filters.program === 'running') {
    if (!hasRunningTrack(data)) return false;
  } else if (filters.program === 'map_only') {
    if (hasStrengthTrack(data) || hasRunningTrack(data)) return false;
  } else if (specificProgramSlug) {
    // Real named strength program (e.g. 'front_lever'), not the old
    // generic 'strength' bucket — "assessed at all" (level > 0).
    if (bestProgramLevel(specificProgramSlug) <= 0) return false;
  }

  if (filters.ageFrom != null || filters.ageTo != null) {
    const birthDate = toDateSafe(data?.core?.birthDate);
    if (!birthDate) return false;
    const age = getAgeInYears(birthDate, now);
    if (filters.ageFrom != null && age < filters.ageFrom) return false;
    if (filters.ageTo != null && age > filters.ageTo) return false;
  }

  return true;
}

/**
 * Core computation, factored out of the HTTP handler so it's directly
 * unit-testable against a fake Firestore — same shape as
 * statistics-summary/route.ts's computeStatisticsSummary.
 */
export async function computeGrowthMetrics(
  db: FirebaseFirestore.Firestore,
  scope: AdminAnalyticsScope,
  filters: GrowthMetricsFilters = DEFAULT_GROWTH_METRICS_FILTERS,
) {
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
  const now = new Date();
  const realUserDocs = userDocs
    .filter((d) => !isTestOrMockUser(d.data()?.core as Record<string, unknown> | undefined))
    .filter((d) => userMatchesFilters(d.data(), filters, now));
  const realUserIds = new Set(realUserDocs.map((d) => d.id));
  const userIdToAuthorityId = new Map<string, string>();
  realUserDocs.forEach((d) => {
    const aid = d.data()?.core?.authorityId;
    if (typeof aid === 'string' && aid) userIdToAuthorityId.set(d.id, aid);
  });

  // ── One workouts range query, last 30 days, no userId filter ────────────
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

  // ── New-users-over-time (Acquisition tab, Wave 2) — same dateMap
  //    template as activeUsersTrend above, fed from realUserDocs'
  //    createdAt instead of workout dates. Zero new reads — realUserDocs
  //    is already in memory. ───────────────────────────────────────────
  const newUsersDateMap = new Map<string, number>();
  for (let i = TREND_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    newUsersDateMap.set(d.toISOString().split('T')[0], 0);
  }
  realUserDocs.forEach((d) => {
    const createdAt = toDateSafe(d.data()?.createdAt);
    if (!createdAt || createdAt < trendStart) return;
    const key = createdAt.toISOString().split('T')[0];
    if (newUsersDateMap.has(key)) newUsersDateMap.set(key, (newUsersDateMap.get(key) ?? 0) + 1);
  });
  const newUsersTrend = Array.from(newUsersDateMap.entries()).map(([date, newUsers]) => ({ date, newUsers }));

  // ── Real completion data (bug-fix round, 06.10.2026, BUG 1) — ONE
  //    unscoped `workouts` read, feeding BOTH activationBySource and
  //    time-to-first-workout below. Previously each used
  //    `progression.workoutCount >= 1` — a client-written best-effort
  //    counter (completion-sync.service.ts:137-146) that silently
  //    under-counts on any write failure. Fixed by adopting the SAME
  //    real-completion source already proven in `users.service.ts:
  //    162-167` / `admin/users/all/page.tsx:211-217` (one unscoped
  //    `workouts` read, not a second denormalized counter), filtered
  //    through the locked KPI predicate (`isRealWorkoutCompletion`,
  //    workout-completion-kpi.ts — shared verbatim with funnel-
  //    analytics.service.ts's client-side fix so the same tab can't
  //    show two different "activated" answers). This read is
  //    deliberately NOT scoped to the 30-day trend window above — a
  //    user's first-ever real workout, or their total qualifying count,
  //    can predate that window. ─────────────────────────────────────────
  const qualifyingCountByUid = new Map<string, number>();
  const firstQualifyingDateByUid = new Map<string, Date>();
  try {
    const allWorkoutsSnap = await db.collection('workouts').get();
    allWorkoutsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const uid = data?.userId;
      if (typeof uid !== 'string' || !realUserIds.has(uid)) return;
      if (!isRealWorkoutCompletion(data)) return;
      qualifyingCountByUid.set(uid, (qualifyingCountByUid.get(uid) ?? 0) + 1);
      const date = toDateSafe(data?.date);
      if (date) {
        const existing = firstQualifyingDateByUid.get(uid);
        if (!existing || date < existing) firstQualifyingDateByUid.set(uid, date);
      }
    });
  } catch (err) {
    console.error('[/api/admin/growth-metrics] workouts full-collection read failed:', err);
  }

  // ── Activation by source (Activation tab, Wave 2) — grouped from the
  //    SAME realUserDocs already in memory. `source` defaults to
  //    'organic' per account-metrics.service.ts's documented convention
  //    (buildAttributionPayload never leaves it null). ────────────────
  const bySource = new Map<string, { totalUsers: number; activatedUsers: number }>();
  realUserDocs.forEach((d) => {
    const data = d.data();
    const source = typeof data?.marketingAttribution?.source === 'string' && data.marketingAttribution.source
      ? data.marketingAttribution.source
      : 'organic';
    const entry = bySource.get(source) ?? { totalUsers: 0, activatedUsers: 0 };
    entry.totalUsers++;
    if ((qualifyingCountByUid.get(d.id) ?? 0) >= 1) entry.activatedUsers++;
    bySource.set(source, entry);
  });
  const activationBySource = Array.from(bySource.entries())
    .map(([source, { totalUsers, activatedUsers }]) => ({
      source,
      totalUsers,
      activatedUsers,
      activationRate: totalUsers > 0 ? Math.round((activatedUsers / totalUsers) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.totalUsers - a.totalUsers);

  // ── Time-to-first-workout (Activation tab, Wave 2) — scoped to really-
  //    activated users only, using the SAME qualifying-workout data read
  //    above (no second read needed any more). ───────────────────────
  const activatedUserDocs = realUserDocs.filter((d) => (qualifyingCountByUid.get(d.id) ?? 0) >= 1);
  const daysToFirstWorkout: number[] = [];
  activatedUserDocs.forEach((d) => {
    const createdAt = toDateSafe(d.data()?.createdAt);
    const firstWorkoutAt = firstQualifyingDateByUid.get(d.id);
    if (!createdAt || !firstWorkoutAt) return;
    const days = (firstWorkoutAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 0) daysToFirstWorkout.push(days);
  });
  daysToFirstWorkout.sort((a, b) => a - b);
  const avgDaysToFirstWorkout = daysToFirstWorkout.length > 0
    ? Math.round((daysToFirstWorkout.reduce((sum, d) => sum + d, 0) / daysToFirstWorkout.length) * 10) / 10
    : null;
  const medianDaysToFirstWorkout = daysToFirstWorkout.length > 0
    ? Math.round(daysToFirstWorkout[Math.floor(daysToFirstWorkout.length / 2)] * 10) / 10
    : null;
  const activation = {
    avgDaysToFirstWorkout,
    medianDaysToFirstWorkout,
    sampleSize: daysToFirstWorkout.length,
  };

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
      newUsersTrend,
      activationBySource,
      activation,
    },
  };
}

/**
 * Query-string -> GrowthMetricsFilters. Unknown/malformed values fall
 * back to "no constraint" (null) rather than throwing — a bad filter
 * value should degrade to "unfiltered," never 500 the whole dashboard.
 */
function parseGrowthMetricsFilters(request: NextRequest): GrowthMetricsFilters {
  const params = request.nextUrl.searchParams;
  const str = (key: string): string | null => {
    const v = params.get(key);
    return v && v.length > 0 ? v : null;
  };
  const date = (key: string): Date | null => {
    const v = str(key);
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const sexRaw = str('sex');
  const sex = sexRaw === 'male' || sexRaw === 'female' || sexRaw === 'other' ? sexRaw : null;
  // Next panel wave, 06.10.2026: `level` is either a global tier
  // string OR a plain number (minimum level within a specific
  // program — only meaningful paired with a non-null `program` below,
  // same contract as GrowthMetricsFilters.level's own doc comment).
  const levelRaw = str('level');
  const levelNum = levelRaw != null ? Number(levelRaw) : NaN;
  const level: GrowthMetricsFilters['level'] =
    levelRaw === 'beginner' || levelRaw === 'intermediate' || levelRaw === 'advanced'
      ? levelRaw
      : Number.isFinite(levelNum) ? levelNum : null;
  // `program` is now any non-empty string — 'running'/'map_only', or a
  // real strength-program slug (e.g. 'front_lever'). No closed list to
  // validate against here; an unrecognized slug just matches nothing
  // downstream, same as any other filter value that happens to be stale.
  const program = str('program');
  const ageNum = (key: string): number | null => {
    const v = str(key);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    dateFrom: date('dateFrom'),
    dateTo: date('dateTo'),
    campaign: str('campaign'),
    source: str('source'),
    medium: str('medium'),
    cityAuthorityId: str('city'),
    sex,
    level,
    program,
    ageFrom: ageNum('ageFrom'),
    ageTo: ageNum('ageTo'),
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
    const filters = parseGrowthMetricsFilters(request);
    const result = await computeGrowthMetrics(db, scope, filters);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/growth-metrics] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

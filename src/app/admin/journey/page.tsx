'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

/**
 * /admin/journey — the unified Analytics v2 hub (growth-analytics-
 * plan.md). Phase 0: 3 lifecycle tabs (Acquisition → Activation →
 * Retention) hosting PR #123's already-shipped panels, repositioned here
 * rather than rebuilt — see each import below for which existing
 * component/route it reuses.
 *
 * Tabs IA cleanup (05.10.2026, post-launch feedback — real small-N data
 * surfaced that Activation and Retention/Engagement were mixed
 * together): DAU/WAU/MAU+stickiness, the North-Star row, the
 * active-users trend chart, and the push→action funnel are ENGAGEMENT
 * signals by definition, not activation ones — moved from the
 * Activation tab to Retention, which is explicitly named "שימור
 * ומעורבות" (Retention & Engagement) to match. The Activation tab is
 * now an honest placeholder — true activation metrics (first-workout
 * rate, onboarding completion, time-to-first-workout) aren't wired into
 * this hub yet; see the placeholder copy below for what's real vs. not
 * built. The economy-by-authority table was removed from Retention
 * entirely (not moved anywhere) — not a real retention lever yet; the
 * underlying `economyByAuthority` field in growth-metrics' response is
 * untouched, so this is a pure UI removal, re-addable later without any
 * data-layer change.
 *
 * Journey Hub Wave 1 (05.10.2026, gap-map + wave plan approved this
 * session): Acquisition and Activation are no longer placeholders.
 * Acquisition now renders funnel stages 1-3, an organic/attributed
 * split, and the authority/city breakdown. Activation now renders the
 * first-workout-rate stage card and the onboarding-completion-rate
 * stat. Every number reuses an existing computation — see the Wave 1
 * import block below for exact sources; nothing here is a new metric.
 * Deeper source/campaign segmentation, a real new-users-over-time
 * trend, time-to-first-workout, and activation-by-source are Wave 2 —
 * each tab's own copy says so explicitly rather than looking finished.
 *
 * Journey Hub Wave 2 (05.10.2026, same approved wave plan):
 * - A single `JourneyFilterBar` now sits above the tabs — date/campaign/
 *   source/city + the 4 segmentation dimensions (program/level/sex/
 *   age), applying to every tab, not a per-tab copy. See `filters`
 *   state below; drives both `getFunnelCounts` (native Firestore
 *   constraints) and `/api/admin/growth-metrics` (query params, an
 *   in-memory predicate server-side — see that route's own comment for
 *   why the two apply filters differently).
 * - Activation: time-to-first-workout + activation-by-source are now
 *   real (growth-metrics' new `activation`/`activationBySource`
 *   fields). Acquisition: new-users-over-time is now a real trend
 *   (`newUsersTrend`), not the old before/after ratio.
 * - Retention: the stickiness card is now an actual visual meter
 *   against the documented target bands, not a text label.
 *
 * Journey Hub Wave 3 (05.10.2026, same approved wave plan) — the 3
 * "defer-until-scale" Retention elements, via a new dedicated route
 * (`/api/admin/retention-depth` — see its own header for why a new
 * route rather than a 3rd concern crammed into growth-metrics):
 * - Cohort retention curve (`CohortRetentionChart`) — real weekly
 *   signup cohorts, day 0/1/3/7/14/30, gated per-cohort behind a
 *   minimum sample size with an explicit empty state, not a fake
 *   stubbed curve.
 * - D7 retention + resurrected/reactivated users — same real-query-
 *   behind-a-threshold discipline, plain stat cards.
 * Deliberately NOT filtered by the Wave 2 segmentation row — these are
 * new structures, not existing graphs (see the route's own comment).
 *
 * Not done yet (by design, see the approved wave plan):
 * - /admin/statistics and /admin/analytics are NOT retired or redirected
 *   — both stay live until this hub covers what they show today.
 * - The full funnel (stages 5-6, the marketing-link/medium picker)
 *   stays on /admin/analytics; only stages 1-4 are relocated here.
 * - "Core users" (if distinct from MAU) has no agreed definition yet —
 *   deliberately not guessed at; deferred until David defines it.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { adminAuthedFetch } from '@/lib/adminAuthedFetch';
import { Compass, AlertCircle } from 'lucide-react';

// Reused as-is from PR #123 — same components /admin/statistics already
// mounts, just repositioned into this hub's tabs.
import NorthStarRow, { type NorthStarData } from '@/features/admin/components/cpo-dashboard/NorthStarRow';
import ActiveUsersHeroChart, {
  type ActiveUsersTrendPoint,
  type TimelineMarker,
} from '@/features/admin/components/cpo-dashboard/ActiveUsersHeroChart';
// EconomyByAuthorityTable itself is deliberately NOT imported here anymore
// (Item 2, tabs IA cleanup) — removed from the UI, not deleted; the type
// import stays so GrowthMetricsResponse keeps accurately describing the
// route's real response shape even though this page doesn't render that
// field right now.
import type { EconomyByAuthorityRow } from '@/features/admin/components/cpo-dashboard/EconomyByAuthorityTable';

// New this PR — DAU/WAU/MAU + stickiness, a pure display of fields
// growth-metrics' existing response now also carries (one extra division
// server-side, zero new reads, zero new route).
import StickinessRow, { type StickinessData } from '@/features/admin/components/cpo-dashboard/StickinessRow';

// Extracted this PR from /admin/analytics' inline JSX into a shared
// component, so that page and this hub both mount it instead of a
// second copy.
import PushFunnelSection, {
  type PushFunnelSummaryResponse,
} from '@/features/admin/components/cpo-dashboard/PushFunnelSection';

// New this PR — surfaces the scheduling/commitment surfaces mapped in
// scheduling-capability-audit.md (reminders, schedule-entry times, map "+"
// planned sessions, group check-ins). Same reuse-don't-rebuild rule as
// PushFunnelSection above: one new route + one new component, not a
// second analytics page.
import CommitmentSurfacesSection, {
  type CommitmentSurfacesSummary,
} from '@/features/admin/components/cpo-dashboard/CommitmentSurfacesSection';

// Journey Hub Wave 1 (05.10.2026) — gap-map + wave plan approved this
// session. Every import below reuses an EXISTING computation; nothing
// here is a new metric:
//   - getFunnelCounts/DEFAULT_FUNNEL_FILTERS: the same client-side
//     6-stage funnel service /admin/analytics already calls. Stages
//     1-3 (registered/midpoint/completed) → Acquisition tab; stage 4
//     (activation) → Activation tab.
//   - FunnelStagesSection/FunnelStageCard: extracted this Wave from
//     /admin/analytics' inline JSX (see that file's own history) so
//     this page can render a stage SUBSET without duplicating it.
//   - AuthorityPerformanceTable: the same city/authority breakdown
//     /admin/statistics already renders, via the same
//     /api/admin/statistics-summary route (also the source of
//     overallCompletionRate for the Activation tab).
//   - getAttributedCount: Wave 2 addition to funnel-analytics.service.ts
//     itself (reuses buildBaseConstraints/countStage, not a parallel
//     query) — the filter-aware counterpart of account-metrics.
//     service.ts's getMarketingAttributedCount, needed once the filter
//     row can scope Stage 1's registered count the organic/attributed
//     split is derived from. See that function's own doc comment.
import {
  getFunnelCounts,
  getAttributedCount,
  DEFAULT_FUNNEL_FILTERS,
  type FunnelFilters,
  type FunnelStage,
} from '@/features/admin/services/funnel-analytics.service';
import FunnelStagesSection, {
  FunnelStageCard,
} from '@/features/admin/components/cpo-dashboard/FunnelStagesSection';
import AuthorityPerformanceTable from '@/features/admin/components/cpo-dashboard/AuthorityPerformanceTable';
import type { AuthorityPerformance } from '@/features/admin/services/cpo-analytics.service';

// Journey Hub Wave 2 — the shared filter row + its 4 segmentation
// dimensions, mounted once above the tabs.
import JourneyFilterBar, {
  DEFAULT_JOURNEY_FILTERS,
  type JourneyFilters,
} from '@/features/admin/components/cpo-dashboard/JourneyFilterBar';
import NewUsersTrendChart from '@/features/admin/components/cpo-dashboard/NewUsersTrendChart';

// Journey Hub Wave 3 — the 3 defer-until-scale Retention elements, via
// a new dedicated route (see that route's own header comment).
import CohortRetentionChart, {
  type CohortRetentionEntry,
} from '@/features/admin/components/cpo-dashboard/CohortRetentionChart';

interface GrowthMetricsResponse {
  scope: 'platform' | 'vertical';
  vertical?: string;
  northStar: NorthStarData & Omit<StickinessData, 'weeklyActiveExercisers'>;
  activeUsersTrend: ActiveUsersTrendPoint[];
  pushCampaignMarkers: TimelineMarker[];
  economyByAuthority: EconomyByAuthorityRow[];
  // Wave 2 additions — see growth-metrics/route.ts's own header comment.
  newUsersTrend: { date: string; newUsers: number }[];
  activationBySource: { source: string; totalUsers: number; activatedUsers: number; activationRate: number | null }[];
  activation: { avgDaysToFirstWorkout: number | null; medianDaysToFirstWorkout: number | null; sampleSize: number };
}

// Wave 3 — /api/admin/retention-depth's full response shape (see that
// route's own header comment for the computation + threshold logic).
interface RetentionDepthResponse {
  minSampleSize: number;
  cohortRetention: {
    cohorts: CohortRetentionEntry[];
    dayOffsets: readonly number[];
  };
  d7Retention: { pct: number | null; sampleSize: number; thresholdMet: boolean };
  resurrectedUsers: { count: number; eligiblePopulation: number; thresholdMet: boolean };
}

// Wave 1 — only the two fields this hub actually renders from
// /api/admin/statistics-summary (overallCompletionRate for Activation,
// authorityPerformance for Acquisition's city breakdown). The route's
// real response carries more (activeAuthorities/activeClients/
// premiumMetrics/notApplicable) — see /admin/statistics' own
// StatisticsSummaryResponse for the full shape; not duplicated here
// since this hub doesn't use the rest.
interface StatisticsSummaryResponse {
  executiveSummary: { overallCompletionRate: number };
  authorityPerformance: AuthorityPerformance[];
}

type JourneyTab = 'acquisition' | 'activation' | 'retention';

const TABS: { id: JourneyTab; label: string }[] = [
  { id: 'acquisition', label: 'רכישה' },
  { id: 'activation', label: 'הפעלה' },
  { id: 'retention', label: 'שימור ומעורבות' },
];

export default function JourneyHubPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<JourneyTab>('activation');

  const [growthMetrics, setGrowthMetrics] = useState<GrowthMetricsResponse | null>(null);
  const [growthMetricsDenied, setGrowthMetricsDenied] = useState<string | null>(null);

  const [pushFunnel, setPushFunnel] = useState<PushFunnelSummaryResponse | null>(null);
  const [pushFunnelDenied, setPushFunnelDenied] = useState<string | null>(null);

  const [commitmentSurfaces, setCommitmentSurfaces] = useState<CommitmentSurfacesSummary | null>(null);
  const [commitmentSurfacesDenied, setCommitmentSurfacesDenied] = useState<string | null>(null);

  // Wave 3 — cohort retention curve + D7 + resurrected users. Fetched
  // once on mount alongside the other static data below (this route
  // isn't filtered by the Wave 2 segmentation row either — see its own
  // header comment).
  const [retentionDepth, setRetentionDepth] = useState<RetentionDepthResponse | null>(null);
  const [retentionDepthDenied, setRetentionDepthDenied] = useState<string | null>(null);

  // Wave 1 — funnel stages 1-4 (client-side, same call /admin/analytics
  // makes), the statistics-summary route (completion rate + city
  // breakdown), and the organic/attributed split derived from Stage 1.
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(true);

  const [statisticsSummary, setStatisticsSummary] = useState<StatisticsSummaryResponse | null>(null);
  const [statisticsDenied, setStatisticsDenied] = useState<string | null>(null);

  const [attributedCount, setAttributedCount] = useState<number | null>(null);

  // Wave 2 — the shared filter row's state. Drives getFunnelCounts and
  // /api/admin/growth-metrics (see the two conversion helpers below).
  // push-funnel-summary, commitment-surfaces-summary, and
  // statistics-summary deliberately stay UNFILTERED by this row — none
  // of the three routes behind them accepts these params (only
  // growth-metrics and funnel-analytics do, per the approved wave plan),
  // and extending them is not in this wave's scope.
  const [filters, setFilters] = useState<JourneyFilters>(DEFAULT_JOURNEY_FILTERS);
  const updateFilters = useCallback((patch: Partial<JourneyFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const funnelFilters = useMemo<FunnelFilters>(() => ({
    ...DEFAULT_FUNNEL_FILTERS,
    campaign: filters.campaign,
    source: filters.source,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    gender: filters.sex,
    cityAuthorityId: filters.cityAuthorityId,
    level: filters.level,
    program: filters.program,
    age: filters.age,
  }), [filters]);

  const growthMetricsQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString());
    if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString());
    if (filters.campaign) params.set('campaign', filters.campaign);
    if (filters.source) params.set('source', filters.source);
    if (filters.cityAuthorityId) params.set('city', filters.cityAuthorityId);
    if (filters.sex) params.set('sex', filters.sex);
    if (filters.level != null) params.set('level', String(filters.level));
    if (filters.program) params.set('program', filters.program);
    if (filters.age) params.set('age', filters.age);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [filters]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => setAuthLoading(false));
    return () => unsubscribe();
  }, []);

  // Static data (push-funnel-summary, commitment-surfaces-summary,
  // statistics-summary, retention-depth) — none of these 4 routes
  // accepts the Wave 2 filter params, so they fetch once on mount, same
  // as before Wave 2, not re-fetched on every filter tweak.
  const [staticLoading, setStaticLoading] = useState(true);
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function loadStaticData() {
      setStaticLoading(true);
      const [pushResult, commitmentResult, statisticsResult, retentionDepthResult] = await Promise.all([
        adminAuthedFetch<PushFunnelSummaryResponse>('/api/admin/push-funnel-summary'),
        adminAuthedFetch<CommitmentSurfacesSummary>('/api/admin/commitment-surfaces-summary'),
        adminAuthedFetch<StatisticsSummaryResponse>('/api/admin/statistics-summary'),
        adminAuthedFetch<RetentionDepthResponse>('/api/admin/retention-depth'),
      ]);
      if (cancelled) return;

      if (pushResult.ok) { setPushFunnel(pushResult.data); setPushFunnelDenied(null); }
      else { setPushFunnel(null); setPushFunnelDenied(pushResult.message); }

      if (commitmentResult.ok) { setCommitmentSurfaces(commitmentResult.data); setCommitmentSurfacesDenied(null); }
      else { setCommitmentSurfaces(null); setCommitmentSurfacesDenied(commitmentResult.message); }

      if (statisticsResult.ok) { setStatisticsSummary(statisticsResult.data); setStatisticsDenied(null); }
      else { setStatisticsSummary(null); setStatisticsDenied(statisticsResult.message); }

      if (retentionDepthResult.ok) { setRetentionDepth(retentionDepthResult.data); setRetentionDepthDenied(null); }
      else { setRetentionDepth(null); setRetentionDepthDenied(retentionDepthResult.message); }

      setStaticLoading(false);
    }

    loadStaticData();
    return () => { cancelled = true; };
  }, [authLoading]);

  // Filter-dependent data (growth-metrics + the client-side funnel calls)
  // — debounced 300ms on `filters` (same pattern /admin/analytics
  // already uses) so rapid filter changes don't pile up redundant
  // fetches.
  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      loadFilteredData();
    }, 300);

    async function loadFilteredData() {
      setDataLoading(true);

      // growth-metrics is PR #123's existing route; getFunnelCounts/
      // getAttributedCount are direct client-SDK service calls (same
      // pattern /admin/analytics already uses for the funnel — not
      // every data source here is a server route, and that's an
      // existing, working split, not something new).
      const [growthResult, funnelResult, attributedResult] = await Promise.all([
        adminAuthedFetch<GrowthMetricsResponse>(`/api/admin/growth-metrics${growthMetricsQuery}`),
        getFunnelCounts(funnelFilters),
        getAttributedCount(funnelFilters),
      ]);

      if (cancelled) return;

      if (growthResult.ok) { setGrowthMetrics(growthResult.data); setGrowthMetricsDenied(null); }
      else { setGrowthMetrics(null); setGrowthMetricsDenied(growthResult.message); }

      setFunnelStages(funnelResult);
      setFunnelLoading(false);
      setAttributedCount(attributedResult);

      setDataLoading(false);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authLoading, funnelFilters, growthMetricsQuery]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  // ── Wave 1 derived values ────────────────────────────────────────────
  const acquisitionStages = funnelStages.filter((s) => ['registered', 'midpoint', 'completed'].includes(s.id));
  const activationStage = funnelStages.find((s) => s.id === 'activation') ?? null;
  const registeredCount = funnelStages.find((s) => s.id === 'registered')?.count ?? null;
  const organicCount = registeredCount != null && attributedCount != null ? Math.max(0, registeredCount - attributedCount) : null;
  const attributedPct = registeredCount != null && registeredCount > 0 && attributedCount != null
    ? Math.round((attributedCount / registeredCount) * 1000) / 10
    : null;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-md shrink-0">
          <Compass size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-gray-900">מסע משתמש</h1>
          <p className="text-gray-500 mt-1">רכישה ← הפעלה ← שימור, במקום אחד</p>
        </div>
      </div>

      {growthMetricsDenied && !dataLoading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{growthMetricsDenied}</p>
        </div>
      )}

      {/* Wave 2 — one filter row, applies to every tab below. See the
          Wave 2 import block above for which data it actually scopes
          (growth-metrics + the client-side funnel calls; push-funnel-
          summary / commitment-surfaces-summary / statistics-summary
          stay unfiltered — none of those 3 routes accepts these params
          yet, and that's out of this wave's approved scope). */}
      <JourneyFilterBar filters={filters} onChange={updateFilters} />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-bold transition-colors relative ${
              activeTab === tab.id ? 'text-cyan-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-cyan-600" />
            )}
          </button>
        ))}
      </div>

      {/* Acquisition — Wave 1 relocated the funnel/organic-split/city
          breakdown; Wave 2 added the real new-users-over-time trend
          (`NewUsersTrendChart`) and made the whole tab respond to the
          shared filter row above (source/campaign/city/segmentation). */}
      {activeTab === 'acquisition' && (
        <div className="space-y-6">
          <FunnelStagesSection
            stages={acquisitionStages}
            loading={funnelLoading}
            title="משפך הרשמה ואונבורדינג"
            subtitle="נרשמו במערכת ← אמצע אונבורדינג ← סיימו אונבורדינג"
          />

          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <p className="text-xs md:text-sm text-gray-500 mb-1">רכישה לפי מקור</p>
            {funnelLoading ? (
              <div className="h-8 bg-gray-200 rounded w-32 animate-pulse" />
            ) : (
              <div className="flex flex-wrap items-baseline gap-4">
                <div>
                  <span className="text-2xl md:text-3xl font-black text-gray-900">
                    {organicCount != null ? organicCount.toLocaleString('he-IL') : '—'}
                  </span>
                  <span className="text-xs text-gray-500 mr-1.5">אורגני</span>
                </div>
                <div>
                  <span className="text-2xl md:text-3xl font-black text-gray-900">
                    {attributedCount != null ? attributedCount.toLocaleString('he-IL') : '—'}
                  </span>
                  <span className="text-xs text-gray-500 mr-1.5">
                    משיווק (קמפיין / קישור / QR){attributedPct != null && ` — ${attributedPct}%`}
                  </span>
                </div>
              </div>
            )}
            <p className="text-gray-400 text-xs mt-2">
              פילוח מדויק לפי קמפיין/מקור ספציפי — באמצעות שורת הסינון שמעל הטאבים. "אורגני מול משיווק" כאן הוא תמיד תקציר דו-ערכי.
            </p>
          </div>

          <NewUsersTrendChart data={growthMetrics?.newUsersTrend ?? []} loading={dataLoading} />

          <AuthorityPerformanceTable data={statisticsSummary?.authorityPerformance ?? []} loading={staticLoading} />
          {statisticsDenied && !staticLoading && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{statisticsDenied}</p>
            </div>
          )}

          <p className="text-gray-400 text-xs">
            install/visit (לפני הרשמה) אינו נמדד באף מקום היום — פער-תוכן אמיתי, לא רק לא-מחובר, ונשאר כך גם אחרי Wave 2.
          </p>
        </div>
      )}

      {/* Activation — Wave 1 relocated first-workout-rate + onboarding-
          completion-rate. Wave 2 adds the two genuinely-new metrics
          (time-to-first-workout, activation-by-source) via
          growth-metrics' new `activation`/`activationBySource` fields —
          both respond to the shared filter row above. */}
      {activeTab === 'activation' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
            {activationStage ? (
              <FunnelStageCard stage={activationStage} loading={funnelLoading} />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
              <p className="text-xs md:text-sm text-gray-500 mb-1">שיעור השלמת אונבורדינג</p>
              {staticLoading ? (
                <div className="h-8 bg-gray-200 rounded w-16 animate-pulse" />
              ) : (
                <p className="text-2xl md:text-3xl font-black text-gray-900">
                  {statisticsSummary ? `${statisticsSummary.executiveSummary.overallCompletionRate}%` : '—'}
                </p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
              <p className="text-xs md:text-sm text-gray-500 mb-1">זמן עד אימון ראשון (חציון)</p>
              {dataLoading ? (
                <div className="h-8 bg-gray-200 rounded w-16 animate-pulse" />
              ) : (
                <>
                  <p className="text-2xl md:text-3xl font-black text-gray-900">
                    {growthMetrics?.activation.medianDaysToFirstWorkout != null
                      ? `${growthMetrics.activation.medianDaysToFirstWorkout} ימים`
                      : '—'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    ממוצע: {growthMetrics?.activation.avgDaysToFirstWorkout ?? '—'} · מדגם: {growthMetrics?.activation.sampleSize ?? 0}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <p className="text-sm font-bold text-gray-900 mb-3">הפעלה לפי מקור</p>
            {dataLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : !growthMetrics || growthMetrics.activationBySource.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">אין נתונים להצגה</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 px-3 text-xs font-bold text-gray-600">מקור</th>
                      <th className="py-2 px-3 text-xs font-bold text-gray-600">נרשמו</th>
                      <th className="py-2 px-3 text-xs font-bold text-gray-600">הופעלו</th>
                      <th className="py-2 px-3 text-xs font-bold text-gray-600">שיעור הפעלה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {growthMetrics.activationBySource.map((row) => (
                      <tr key={row.source}>
                        <td className="py-2 px-3 text-sm font-bold text-gray-900">{row.source}</td>
                        <td className="py-2 px-3 text-sm text-gray-700">{row.totalUsers.toLocaleString('he-IL')}</td>
                        <td className="py-2 px-3 text-sm text-gray-700">{row.activatedUsers.toLocaleString('he-IL')}</td>
                        <td className="py-2 px-3 text-sm font-bold text-cyan-600">{row.activationRate != null ? `${row.activationRate}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Retention & Engagement — North-Star, stickiness, the trend
          chart, and the push funnel all moved here from Activation
          (tabs IA cleanup, 05.10.2026) — these are engagement signals by
          definition, matching the tab's own name. Economy-by-authority
          was removed entirely (Item 2), not moved — see the file header.
          Wave 3 added the cohort curve + D7 + resurrected-users block
          below — each gated behind its own real sample-size threshold,
          see retention-depth/route.ts. */}
      {activeTab === 'retention' && (
        <div className="space-y-6">
          <StickinessRow data={growthMetrics?.northStar ?? null} loading={dataLoading} />
          <NorthStarRow data={growthMetrics?.northStar ?? null} loading={dataLoading} />
          <ActiveUsersHeroChart
            data={growthMetrics?.activeUsersTrend ?? []}
            markers={growthMetrics?.pushCampaignMarkers ?? []}
            loading={dataLoading}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
              <p className="text-xs md:text-sm text-gray-500 mb-1">שימור D7</p>
              {staticLoading ? (
                <div className="h-8 bg-gray-200 rounded w-16 animate-pulse" />
              ) : !retentionDepth?.d7Retention.thresholdMet ? (
                <>
                  <p className="text-lg font-black text-gray-400">אין מספיק נתונים עדיין</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    מדגם נוכחי: {retentionDepth?.d7Retention.sampleSize ?? 0} (דרושים {retentionDepth?.minSampleSize ?? '—'}+) · ממלא את עצמו אוטומטית
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl md:text-3xl font-black text-gray-900">{retentionDepth.d7Retention.pct}%</p>
                  <p className="text-[11px] text-gray-400 mt-1">מדגם: {retentionDepth.d7Retention.sampleSize}</p>
                </>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
              <p className="text-xs md:text-sm text-gray-500 mb-1">משתמשים מוחזרים (30 יום)</p>
              {staticLoading ? (
                <div className="h-8 bg-gray-200 rounded w-16 animate-pulse" />
              ) : !retentionDepth?.resurrectedUsers.thresholdMet ? (
                <>
                  <p className="text-lg font-black text-gray-400">אין מספיק נתונים עדיין</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    אוכלוסייה רלוונטית: {retentionDepth?.resurrectedUsers.eligiblePopulation ?? 0} (דרושים {retentionDepth?.minSampleSize ?? '—'}+) · ממלא את עצמו אוטומטית
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl md:text-3xl font-black text-gray-900">{retentionDepth.resurrectedUsers.count.toLocaleString('he-IL')}</p>
                  <p className="text-[11px] text-gray-400 mt-1">מתוך {retentionDepth.resurrectedUsers.eligiblePopulation} רלוונטיים</p>
                </>
              )}
            </div>
          </div>

          <CohortRetentionChart
            cohorts={retentionDepth?.cohortRetention.cohorts ?? []}
            dayOffsets={retentionDepth?.cohortRetention.dayOffsets ?? []}
            minSampleSize={retentionDepth?.minSampleSize ?? 50}
            loading={staticLoading}
          />
          {retentionDepthDenied && !staticLoading && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{retentionDepthDenied}</p>
            </div>
          )}

          <PushFunnelSection data={pushFunnel} loading={staticLoading} denied={pushFunnelDenied} />
          <CommitmentSurfacesSection data={commitmentSurfaces} loading={staticLoading} denied={commitmentSurfacesDenied} />
        </div>
      )}
    </div>
  );
}

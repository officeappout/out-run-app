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
 * Not done yet (by design, see the approved wave plan):
 * - /admin/statistics and /admin/analytics are NOT retired or redirected
 *   — both stay live until this hub covers what they show today.
 * - The full funnel (stages 4-6, filters, marketing-link picker) stays
 *   on /admin/analytics; only stages 1-4 are relocated here so far.
 */

import { useState, useEffect } from 'react';
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
//   - getMarketingAttributedCount: an existing account-metrics.service
//     function (built for the Marketing Hub's single KPI card),
//     reused here against Stage 1's registered count to derive an
//     organic/attributed split — one subtraction, zero new reads.
import {
  getFunnelCounts,
  DEFAULT_FUNNEL_FILTERS,
  type FunnelStage,
} from '@/features/admin/services/funnel-analytics.service';
import FunnelStagesSection, {
  FunnelStageCard,
} from '@/features/admin/components/cpo-dashboard/FunnelStagesSection';
import AuthorityPerformanceTable from '@/features/admin/components/cpo-dashboard/AuthorityPerformanceTable';
import type { AuthorityPerformance } from '@/features/admin/services/cpo-analytics.service';
import { getMarketingAttributedCount } from '@/features/admin/services/account-metrics.service';

interface GrowthMetricsResponse {
  scope: 'platform' | 'vertical';
  vertical?: string;
  northStar: NorthStarData & Omit<StickinessData, 'weeklyActiveExercisers'>;
  activeUsersTrend: ActiveUsersTrendPoint[];
  pushCampaignMarkers: TimelineMarker[];
  economyByAuthority: EconomyByAuthorityRow[];
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

  // Wave 1 — funnel stages 1-4 (client-side, same call /admin/analytics
  // makes), the statistics-summary route (completion rate + city
  // breakdown), and the organic/attributed split derived from Stage 1.
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(true);

  const [statisticsSummary, setStatisticsSummary] = useState<StatisticsSummaryResponse | null>(null);
  const [statisticsDenied, setStatisticsDenied] = useState<string | null>(null);

  const [attributedCount, setAttributedCount] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => setAuthLoading(false));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading) return;

    async function loadData() {
      setDataLoading(true);

      // growth-metrics + push-funnel-summary are PR #123's existing routes;
      // commitment-surfaces-summary landed via a parallel session
      // (b59f246a); statistics-summary is the same route /admin/statistics
      // calls. getFunnelCounts/getMarketingAttributedCount are direct
      // client-SDK service calls (same pattern /admin/analytics already
      // uses for the funnel — not every data source here is a server
      // route, and that's an existing, working split, not something new).
      const [growthResult, pushResult, commitmentResult, statisticsResult, funnelResult, attributedResult] = await Promise.all([
        adminAuthedFetch<GrowthMetricsResponse>('/api/admin/growth-metrics'),
        adminAuthedFetch<PushFunnelSummaryResponse>('/api/admin/push-funnel-summary'),
        adminAuthedFetch<CommitmentSurfacesSummary>('/api/admin/commitment-surfaces-summary'),
        adminAuthedFetch<StatisticsSummaryResponse>('/api/admin/statistics-summary'),
        getFunnelCounts(DEFAULT_FUNNEL_FILTERS),
        getMarketingAttributedCount(),
      ]);

      if (growthResult.ok) { setGrowthMetrics(growthResult.data); setGrowthMetricsDenied(null); }
      else { setGrowthMetrics(null); setGrowthMetricsDenied(growthResult.message); }

      if (pushResult.ok) { setPushFunnel(pushResult.data); setPushFunnelDenied(null); }
      else { setPushFunnel(null); setPushFunnelDenied(pushResult.message); }

      if (commitmentResult.ok) { setCommitmentSurfaces(commitmentResult.data); setCommitmentSurfacesDenied(null); }
      else { setCommitmentSurfaces(null); setCommitmentSurfacesDenied(commitmentResult.message); }

      if (statisticsResult.ok) { setStatisticsSummary(statisticsResult.data); setStatisticsDenied(null); }
      else { setStatisticsSummary(null); setStatisticsDenied(statisticsResult.message); }

      setFunnelStages(funnelResult);
      setFunnelLoading(false);
      setAttributedCount(attributedResult);

      setDataLoading(false);
    }

    loadData();
  }, [authLoading]);

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

      {/* Acquisition — Wave 1 (05.10.2026, gap-map + wave plan approved).
          Funnel stages 1-3 + the organic/attributed split + the
          authority/city breakdown are all RELOCATED/WIRED here, not
          rebuilt — see the Wave 1 import block above for sources.
          Deeper source/campaign SEGMENTATION filters and a real
          new-users-over-time trend are Wave 2, not here yet. */}
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
              פילוח לפי קמפיין/מקור/מדיה ספציפי (לא רק אורגני-מול-משיווק) הוא Wave 2 — שורת הסינון המשותפת לכל הטאבים.
            </p>
          </div>

          <AuthorityPerformanceTable data={statisticsSummary?.authorityPerformance ?? []} loading={dataLoading} />
          {statisticsDenied && !dataLoading && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{statisticsDenied}</p>
            </div>
          )}

          <p className="text-gray-400 text-xs">
            install/visit (לפני הרשמה) אינו נמדד באף מקום היום — פער-תוכן אמיתי, לא רק לא-מחובר. "משתמשים חדשים לאורך זמן" (טרנד אמיתי, לא יחס לפני/אחרי בודד) הוא Wave 2.
          </p>
        </div>
      )}

      {/* Activation — Wave 1 (05.10.2026). First-workout rate (funnel
          stage 4) + onboarding-completion rate are RELOCATED/WIRED here
          — both were already computed elsewhere, see the Wave 1 import
          block above. Time-to-first-workout and activation-by-source are
          genuinely not computed anywhere yet (confirmed, not just
          unwired) — Wave 2 builds the former; the latter is a breakout
          of this same stage-4 query, also Wave 2. */}
      {activeTab === 'activation' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
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
              {dataLoading ? (
                <div className="h-8 bg-gray-200 rounded w-16 animate-pulse" />
              ) : (
                <p className="text-2xl md:text-3xl font-black text-gray-900">
                  {statisticsSummary ? `${statisticsSummary.executiveSummary.overallCompletionRate}%` : '—'}
                </p>
              )}
            </div>
          </div>

          <p className="text-gray-400 text-xs">
            זמן עד אימון ראשון אינו מחושב באף מקום היום — פער-תוכן אמיתי, לא רק לא-מחובר. פילוח הפעלה לפי מקור/קוהורט הוא Wave 2.
          </p>
        </div>
      )}

      {/* Retention & Engagement — North-Star, stickiness, the trend
          chart, and the push funnel all moved here from Activation
          (tabs IA cleanup, 05.10.2026) — these are engagement signals by
          definition, matching the tab's own name. Economy-by-authority
          was removed entirely (Item 2), not moved — see the file header. */}
      {activeTab === 'retention' && (
        <div className="space-y-6">
          <StickinessRow data={growthMetrics?.northStar ?? null} loading={dataLoading} />
          <NorthStarRow data={growthMetrics?.northStar ?? null} loading={dataLoading} />
          <ActiveUsersHeroChart
            data={growthMetrics?.activeUsersTrend ?? []}
            markers={growthMetrics?.pushCampaignMarkers ?? []}
            loading={dataLoading}
          />
          <PushFunnelSection data={pushFunnel} loading={dataLoading} denied={pushFunnelDenied} />
          <CommitmentSurfacesSection data={commitmentSurfaces} loading={dataLoading} denied={commitmentSurfacesDenied} />
        </div>
      )}
    </div>
  );
}

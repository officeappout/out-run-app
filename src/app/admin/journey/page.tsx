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
 * Not done in this PR (intentionally, see the plan's Phase 0 scope):
 * - Acquisition tab stays a placeholder; the funnel at /admin/analytics
 *   is NOT migrated yet — that refactor (embeddable component +
 *   adminAnalyticsScope migration) is its own follow-up PR, per the
 *   plan's still-open §5 item 2.
 * - /admin/statistics and /admin/analytics are NOT retired or redirected
 *   — both stay live until this hub covers what they show today.
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { adminAuthedFetch } from '@/lib/adminAuthedFetch';
import { Compass, AlertCircle, ExternalLink } from 'lucide-react';

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

interface GrowthMetricsResponse {
  scope: 'platform' | 'vertical';
  vertical?: string;
  northStar: NorthStarData & Omit<StickinessData, 'weeklyActiveExercisers'>;
  activeUsersTrend: ActiveUsersTrendPoint[];
  pushCampaignMarkers: TimelineMarker[];
  economyByAuthority: EconomyByAuthorityRow[];
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => setAuthLoading(false));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading) return;

    async function loadData() {
      setDataLoading(true);

      // growth-metrics + push-funnel-summary are PR #123's existing routes;
      // commitment-surfaces-summary is new this PR.
      const [growthResult, pushResult, commitmentResult] = await Promise.all([
        adminAuthedFetch<GrowthMetricsResponse>('/api/admin/growth-metrics'),
        adminAuthedFetch<PushFunnelSummaryResponse>('/api/admin/push-funnel-summary'),
        adminAuthedFetch<CommitmentSurfacesSummary>('/api/admin/commitment-surfaces-summary'),
      ]);

      if (growthResult.ok) { setGrowthMetrics(growthResult.data); setGrowthMetricsDenied(null); }
      else { setGrowthMetrics(null); setGrowthMetricsDenied(growthResult.message); }

      if (pushResult.ok) { setPushFunnel(pushResult.data); setPushFunnelDenied(null); }
      else { setPushFunnel(null); setPushFunnelDenied(pushResult.message); }

      if (commitmentResult.ok) { setCommitmentSurfaces(commitmentResult.data); setCommitmentSurfacesDenied(null); }
      else { setCommitmentSurfaces(null); setCommitmentSurfacesDenied(commitmentResult.message); }

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

      {/* Acquisition — placeholder only, funnel refactor is a follow-up PR */}
      {activeTab === 'acquisition' && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <p className="text-gray-500 text-sm">
            משפך הרכישה (הרשמה ← אונבורדינג) נמצא כרגע ב
            <a
              href="/admin/analytics"
              className="text-cyan-600 font-bold hover:underline inline-flex items-center gap-1 mx-1"
            >
              משפך המרות ואנליטיקס
              <ExternalLink size={12} />
            </a>
            — יעבור לכאן בעדכון הבא.
          </p>
        </div>
      )}

      {/* Activation — placeholder (tabs IA cleanup, 05.10.2026). The
          engagement panels that used to render here moved to Retention
          below; true activation metrics (first-workout rate, onboarding
          completion, time-to-first-workout) aren't wired into this hub
          yet — not fabricated here. */}
      {activeTab === 'activation' && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <p className="text-gray-500 text-sm">
            מדדי הפעלה אמיתיים (שיעור אימון ראשון, שיעור השלמת אונבורדינג, זמן עד אימון ראשון) עדיין לא מחוברים ללוח הזה.
          </p>
          <p className="text-gray-400 text-xs mt-2">
            שיעור אימון ראשון קיים כחלק ממשפך ההמרות (שלב 4) ב
            <a
              href="/admin/analytics"
              className="text-cyan-600 font-bold hover:underline inline-flex items-center gap-1 mx-1"
            >
              משפך המרות ואנליטיקס
              <ExternalLink size={12} />
            </a>
            — יעבור לכאן יחד עם שאר המשפך. שיעור השלמת אונבורדינג כבר מחושב (executiveSummary.overallCompletionRate) אך לא מוצג כאן. זמן עד אימון ראשון אינו מחושב באף מקום היום.
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

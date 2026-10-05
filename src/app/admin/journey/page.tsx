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
import EconomyByAuthorityTable, {
  type EconomyByAuthorityRow,
} from '@/features/admin/components/cpo-dashboard/EconomyByAuthorityTable';

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
  { id: 'retention', label: 'שימור' },
];

export default function JourneyHubPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<JourneyTab>('activation');

  const [growthMetrics, setGrowthMetrics] = useState<GrowthMetricsResponse | null>(null);
  const [growthMetricsDenied, setGrowthMetricsDenied] = useState<string | null>(null);

  const [pushFunnel, setPushFunnel] = useState<PushFunnelSummaryResponse | null>(null);
  const [pushFunnelDenied, setPushFunnelDenied] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => setAuthLoading(false));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading) return;

    async function loadData() {
      setDataLoading(true);

      // Same two routes PR #123 already shipped — no new endpoints.
      const [growthResult, pushResult] = await Promise.all([
        adminAuthedFetch<GrowthMetricsResponse>('/api/admin/growth-metrics'),
        adminAuthedFetch<PushFunnelSummaryResponse>('/api/admin/push-funnel-summary'),
      ]);

      if (growthResult.ok) { setGrowthMetrics(growthResult.data); setGrowthMetricsDenied(null); }
      else { setGrowthMetrics(null); setGrowthMetricsDenied(growthResult.message); }

      if (pushResult.ok) { setPushFunnel(pushResult.data); setPushFunnelDenied(null); }
      else { setPushFunnel(null); setPushFunnelDenied(pushResult.message); }

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

      {/* Activation */}
      {activeTab === 'activation' && (
        <div className="space-y-6">
          <NorthStarRow data={growthMetrics?.northStar ?? null} loading={dataLoading} />
          {/* growthMetrics.northStar already structurally satisfies
              StickinessData (NorthStarData ∩ the 3 fields added to the
              route this PR) — same object, no reshaping needed. */}
          <StickinessRow data={growthMetrics?.northStar ?? null} loading={dataLoading} />
          <ActiveUsersHeroChart
            data={growthMetrics?.activeUsersTrend ?? []}
            markers={growthMetrics?.pushCampaignMarkers ?? []}
            loading={dataLoading}
          />
          <PushFunnelSection data={pushFunnel} loading={dataLoading} denied={pushFunnelDenied} />
        </div>
      )}

      {/* Retention */}
      {activeTab === 'retention' && (
        <div className="space-y-6">
          <EconomyByAuthorityTable data={growthMetrics?.economyByAuthority ?? []} loading={dataLoading} />
        </div>
      )}
    </div>
  );
}

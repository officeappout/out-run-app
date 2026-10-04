'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { adminAuthedFetch } from '@/lib/adminAuthedFetch';
import {
  getTopBaseMovements,
  getLocationDistribution,
  getGlobalMaintenanceReports,
  type AuthorityPerformance,
} from '@/features/admin/services/cpo-analytics.service';
import ExecutiveSummary, { type ExecutiveSummaryData } from '@/features/admin/components/cpo-dashboard/ExecutiveSummary';
import AuthorityPerformanceTable from '@/features/admin/components/cpo-dashboard/AuthorityPerformanceTable';
import ProductInsights from '@/features/admin/components/cpo-dashboard/ProductInsights';
import MaintenanceOverview from '@/features/admin/components/cpo-dashboard/MaintenanceOverview';
import PremiumConversion, { type PremiumMetricsData } from '@/features/admin/components/cpo-dashboard/PremiumConversion';
import NorthStarRow, { type NorthStarData } from '@/features/admin/components/cpo-dashboard/NorthStarRow';
import ActiveUsersHeroChart, { type ActiveUsersTrendPoint, type TimelineMarker } from '@/features/admin/components/cpo-dashboard/ActiveUsersHeroChart';
import EconomyByAuthorityTable, { type EconomyByAuthorityRow } from '@/features/admin/components/cpo-dashboard/EconomyByAuthorityTable';
import HealthWakeUpChart from '@/features/admin/components/strategic-insights/HealthWakeUpChart';
import EquipmentGapAnalysis from '@/features/admin/components/strategic-insights/EquipmentGapAnalysis';
import SleepyNeighborhoodsList from '@/features/admin/components/strategic-insights/SleepyNeighborhoodsList';
import { AlertCircle } from 'lucide-react';

/**
 * 00-MASTER-PLAN.md §13.11 P1 — this page used to call cpo-analytics.
 * service.ts's getExecutiveSummary()/getAuthorityPerformance() (always
 * platform-wide, no authorityId parameter existed at all) and strategic-
 * insights.service.ts's 3 functions with a CLIENT-resolved authorityIds
 * array — both patterns read `users` directly from the browser with the
 * only real gate being firestore.rules. Replaced with two server routes
 * (/api/admin/statistics-summary, /api/admin/insights-summary) that
 * resolve role/scope from the verified ID token server-side — see
 * src/lib/adminAnalyticsScope.ts for the full role→scope table.
 */

interface StatisticsSummaryResponse {
  scope: 'platform' | 'vertical';
  vertical?: string;
  executiveSummary: ExecutiveSummaryData;
  authorityPerformance: AuthorityPerformance[];
  premiumMetrics: PremiumMetricsData | null;
  notApplicable: string[];
  notApplicableMessage?: string;
}

interface InsightsSummaryResponse {
  scope: 'platform' | 'vertical' | 'authority';
  healthWakeUp: { totalInactiveUsers: number; nowActiveUsers: number; successRate: number };
  equipmentGaps: any[];
  sleepyNeighborhoods: any[];
}

interface GrowthMetricsResponse {
  scope: 'platform' | 'vertical';
  vertical?: string;
  northStar: NorthStarData;
  activeUsersTrend: ActiveUsersTrendPoint[];
  pushCampaignMarkers: TimelineMarker[];
  economyByAuthority: EconomyByAuthorityRow[];
}

export default function StatisticsPage() {
    const [authLoading, setAuthLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(true);

    const [statisticsSummary, setStatisticsSummary] = useState<StatisticsSummaryResponse | null>(null);
    const [statisticsDenied, setStatisticsDenied] = useState<string | null>(null);
    const [insightsSummary, setInsightsSummary] = useState<InsightsSummaryResponse | null>(null);
    const [insightsDenied, setInsightsDenied] = useState<string | null>(null);

    const [growthMetrics, setGrowthMetrics] = useState<GrowthMetricsResponse | null>(null);
    const [growthMetricsDenied, setGrowthMetricsDenied] = useState<string | null>(null);

    const [topMovements, setTopMovements] = useState<any[]>([]);
    const [locationDistribution, setLocationDistribution] = useState<any[]>([]);
    const [maintenanceReports, setMaintenanceReports] = useState<any[]>([]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, () => setAuthLoading(false));
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (authLoading) return;

        async function loadData() {
            setDataLoading(true);

            const [statsResult, insightsResult, growthResult, movements, locations, maintenance] = await Promise.all([
                adminAuthedFetch<StatisticsSummaryResponse>('/api/admin/statistics-summary'),
                adminAuthedFetch<InsightsSummaryResponse>('/api/admin/insights-summary'),
                adminAuthedFetch<GrowthMetricsResponse>('/api/admin/growth-metrics'),
                getTopBaseMovements(5),
                getLocationDistribution(),
                getGlobalMaintenanceReports(),
            ]);

            if (statsResult.ok) { setStatisticsSummary(statsResult.data); setStatisticsDenied(null); }
            else { setStatisticsSummary(null); setStatisticsDenied(statsResult.message); }

            if (insightsResult.ok) { setInsightsSummary(insightsResult.data); setInsightsDenied(null); }
            else { setInsightsSummary(null); setInsightsDenied(insightsResult.message); }

            if (growthResult.ok) { setGrowthMetrics(growthResult.data); setGrowthMetricsDenied(null); }
            else { setGrowthMetrics(null); setGrowthMetricsDenied(growthResult.message); }

            setTopMovements(movements);
            setLocationDistribution(locations);
            setMaintenanceReports(maintenance);
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
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900">סטטיסטיקה</h1>
                <p className="text-gray-500 mt-2">נתונים וגרפים גולמיים - ציוד, רמות פעילות התחלתיות, התפלגויות</p>
            </div>

            {statisticsDenied && !dataLoading && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">{statisticsDenied}</p>
                </div>
            )}

            {statisticsSummary && (
                <>
                    <ExecutiveSummary data={statisticsSummary.executiveSummary} loading={dataLoading} notApplicable={statisticsSummary.notApplicable} />
                    <AuthorityPerformanceTable data={statisticsSummary.authorityPerformance} loading={dataLoading} />
                </>
            )}

            {/* Analytics v2 — Phase 1 (04.10.2026). North-Star + Hero trend,
                same server-route/scope pattern as statisticsSummary above —
                see /api/admin/growth-metrics. */}
            {growthMetricsDenied && !dataLoading && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">{growthMetricsDenied}</p>
                </div>
            )}
            {(growthMetrics || dataLoading) && (
                <>
                    <NorthStarRow data={growthMetrics?.northStar ?? null} loading={dataLoading} />
                    <ActiveUsersHeroChart
                        data={growthMetrics?.activeUsersTrend ?? []}
                        markers={growthMetrics?.pushCampaignMarkers ?? []}
                        loading={dataLoading}
                    />
                </>
            )}

            {/* Product Insights — unrelated to the users-collection scoping fix; unchanged */}
            <ProductInsights
                topMovements={topMovements}
                locationDistribution={locationDistribution}
                loading={dataLoading}
            />

            {insightsDenied && !dataLoading && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">{insightsDenied}</p>
                </div>
            )}

            {insightsSummary && (
                <>
                    <HealthWakeUpChart data={insightsSummary.healthWakeUp} loading={dataLoading} />
                    <EquipmentGapAnalysis data={insightsSummary.equipmentGaps} loading={dataLoading} topCities={3} />
                    <SleepyNeighborhoodsList data={insightsSummary.sleepyNeighborhoods} loading={dataLoading} limit={5} />
                </>
            )}

            {growthMetrics && (
                <EconomyByAuthorityTable data={growthMetrics.economyByAuthority} loading={dataLoading} />
            )}

            {/* Maintenance Overview & Premium Conversion */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MaintenanceOverview reports={maintenanceReports} loading={dataLoading} />
                <PremiumConversion data={statisticsSummary?.premiumMetrics ?? null} loading={dataLoading} />
            </div>
        </div>
    );
}

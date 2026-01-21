'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import {
  getExecutiveSummary,
  getAuthorityPerformance,
  getTopBaseMovements,
  getLocationDistribution,
  getPremiumMetrics,
  getGlobalMaintenanceReports,
} from '@/features/admin/services/cpo-analytics.service';
import {
  getHealthWakeUpMetric,
  getEquipmentGapAnalysis,
  getSleepyNeighborhoods,
} from '@/features/admin/services/strategic-insights.service';
import ExecutiveSummary from '@/features/admin/components/cpo-dashboard/ExecutiveSummary';
import AuthorityPerformanceTable from '@/features/admin/components/cpo-dashboard/AuthorityPerformanceTable';
import ProductInsights from '@/features/admin/components/cpo-dashboard/ProductInsights';
import MaintenanceOverview from '@/features/admin/components/cpo-dashboard/MaintenanceOverview';
import PremiumConversion from '@/features/admin/components/cpo-dashboard/PremiumConversion';
import HealthWakeUpChart from '@/features/admin/components/strategic-insights/HealthWakeUpChart';
import EquipmentGapAnalysis from '@/features/admin/components/strategic-insights/EquipmentGapAnalysis';
import SleepyNeighborhoodsList from '@/features/admin/components/strategic-insights/SleepyNeighborhoodsList';

export default function StatisticsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [authLoading, setAuthLoading] = useState(true);
    
    // Statistics Data
    const [executiveSummary, setExecutiveSummary] = useState<any>(null);
    const [authorityPerformance, setAuthorityPerformance] = useState<any[]>([]);
    const [topMovements, setTopMovements] = useState<any[]>([]);
    const [locationDistribution, setLocationDistribution] = useState<any[]>([]);
    const [premiumMetrics, setPremiumMetrics] = useState<any>(null);
    const [maintenanceReports, setMaintenanceReports] = useState<any[]>([]);
    const [healthWakeUp, setHealthWakeUp] = useState<any>(null);
    const [equipmentGaps, setEquipmentGaps] = useState<any[]>([]);
    const [sleepyNeighborhoods, setSleepyNeighborhoods] = useState<any[]>([]);
    const [dataLoading, setDataLoading] = useState(true);

    const [userAuthorityIds, setUserAuthorityIds] = useState<string[]>([]);
    const [isAuthorityManagerOnly, setIsAuthorityManagerOnly] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const roleInfo = await checkUserRole(user.uid);
                    const isOnly = await isOnlyAuthorityManager(user.uid);
                    setIsAuthorityManagerOnly(isOnly);
                    setUserAuthorityIds(roleInfo.authorityIds || []);
                } catch (error) {
                    console.error('Error checking user role:', error);
                }
            }
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Load Statistics Data
    useEffect(() => {
        if (authLoading) return;

        async function loadData() {
            try {
                setDataLoading(true);
                const [
                    summary,
                    performance,
                    movements,
                    locations,
                    premium,
                    maintenance,
                    healthWakeUpData,
                    equipmentGapsData,
                    sleepyNeighborhoodsData,
                ] = await Promise.all([
                    getExecutiveSummary(),
                    getAuthorityPerformance(),
                    getTopBaseMovements(5),
                    getLocationDistribution(),
                    getPremiumMetrics(),
                    getGlobalMaintenanceReports(),
                    getHealthWakeUpMetric(isAuthorityManagerOnly ? userAuthorityIds : undefined),
                    getEquipmentGapAnalysis(isAuthorityManagerOnly ? userAuthorityIds : undefined),
                    getSleepyNeighborhoods(isAuthorityManagerOnly ? userAuthorityIds : undefined),
                ]);

                setExecutiveSummary(summary);
                setAuthorityPerformance(performance);
                setTopMovements(movements);
                setLocationDistribution(locations);
                setPremiumMetrics(premium);
                setMaintenanceReports(maintenance);
                setHealthWakeUp(healthWakeUpData);
                setEquipmentGaps(equipmentGapsData);
                setSleepyNeighborhoods(sleepyNeighborhoodsData);
            } catch (error) {
                console.error('Error loading statistics data:', error);
            } finally {
                setDataLoading(false);
                setLoading(false);
            }
        }

        loadData();
    }, [authLoading, isAuthorityManagerOnly, userAuthorityIds]);

    if (loading || authLoading) {
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

            {/* Executive Summary */}
            <ExecutiveSummary data={executiveSummary || {
                totalUsers: 0,
                activeAuthorities: 0,
                weeklyGrowthPercent: 0,
                overallCompletionRate: 0,
                totalPlatformAdmins: 0,
            }} loading={dataLoading} />

            {/* Authority Performance Table */}
            <AuthorityPerformanceTable data={authorityPerformance} loading={dataLoading} />

            {/* Product Insights */}
            <ProductInsights 
                topMovements={topMovements} 
                locationDistribution={locationDistribution}
                loading={dataLoading}
            />

            {/* Health Wake-Up Metric */}
            <HealthWakeUpChart 
                data={healthWakeUp || {
                    totalInactiveUsers: 0,
                    nowActiveUsers: 0,
                    successRate: 0,
                }} 
                loading={dataLoading} 
            />

            {/* Equipment Gap Analysis */}
            <EquipmentGapAnalysis data={equipmentGaps} loading={dataLoading} topCities={3} />

            {/* Sleepy Neighborhoods */}
            <SleepyNeighborhoodsList data={sleepyNeighborhoods} loading={dataLoading} limit={5} />

            {/* Maintenance Overview & Premium Conversion */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MaintenanceOverview reports={maintenanceReports} loading={dataLoading} />
                <PremiumConversion data={premiumMetrics || {
                    conversionRate: 0,
                    totalUsers: 0,
                    premiumUsers: 0,
                }} loading={dataLoading} />
            </div>
        </div>
    );
}

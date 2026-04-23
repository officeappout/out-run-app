'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { NeighborhoodBreakdownRow } from '@/features/admin/services/analytics.service';
import type { KpiSettings } from '@/types/admin-types';
import { DEFAULT_KPI_SETTINGS } from '@/types/admin-types';
import { Users, TrendingUp, TrendingDown, Building2, ArrowLeft } from 'lucide-react';

interface NeighborhoodBreakdownProps {
  data: NeighborhoodBreakdownRow[];
  loading?: boolean;
  kpiSettings?: KpiSettings;
}

function computePerformanceScore(
  row: NeighborhoodBreakdownRow,
  maxWorkoutsPerUser: number,
  maxMinutesPerUser: number,
  weights: KpiSettings
): number {
  const totalWeight = weights.weightWorkoutVolume + weights.weightAppPenetration + weights.weightActiveMinutes;
  if (totalWeight === 0 || row.totalUsers === 0) return 0;

  const penetrationRatio = row.totalUsers > 0 ? row.activeUsers / row.totalUsers : 0;
  const workoutsPerUser = row.activeUsers > 0 ? row.workouts / row.activeUsers : 0;
  const minutesPerUser = row.activeUsers > 0 ? row.totalActiveMinutes / row.activeUsers : 0;

  const normPenetration = Math.min(penetrationRatio / 0.5, 1);
  const normWorkouts = maxWorkoutsPerUser > 0 ? Math.min(workoutsPerUser / maxWorkoutsPerUser, 1) : 0;
  const normMinutes = maxMinutesPerUser > 0 ? Math.min(minutesPerUser / maxMinutesPerUser, 1) : 0;

  const score = (
    normWorkouts * (weights.weightWorkoutVolume / totalWeight) +
    normPenetration * (weights.weightAppPenetration / totalWeight) +
    normMinutes * (weights.weightActiveMinutes / totalWeight)
  ) * 100;

  return Math.round(score * 10) / 10;
}

function getScoreColor(score: number) {
  if (score >= 70) return { text: 'text-green-700', bg: 'bg-green-100', ring: 'ring-green-300' };
  if (score >= 40) return { text: 'text-cyan-700',  bg: 'bg-cyan-100',  ring: 'ring-cyan-300'  };
  if (score >= 20) return { text: 'text-amber-700', bg: 'bg-amber-100', ring: 'ring-amber-300' };
  return              { text: 'text-slate-600', bg: 'bg-slate-100', ring: 'ring-slate-300' };
}

function getGrowthIndicator(activeUsers: number, totalUsers: number) {
  if (totalUsers === 0) return { pct: 0, positive: true };
  const pct = Math.round((activeUsers / totalUsers) * 100);
  return { pct, positive: pct >= 25 };
}

export default function NeighborhoodBreakdown({ data, loading, kpiSettings }: NeighborhoodBreakdownProps) {
  const settings = kpiSettings ?? DEFAULT_KPI_SETTINGS;

  const enrichedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const maxWorkoutsPerUser = Math.max(
      ...data.map(r => r.activeUsers > 0 ? r.workouts / r.activeUsers : 0),
      1
    );
    const maxMinutesPerUser = Math.max(
      ...data.map(r => r.activeUsers > 0 ? r.totalActiveMinutes / r.activeUsers : 0),
      1
    );

    return data
      .map(row => ({
        ...row,
        performanceScore: computePerformanceScore(row, maxWorkoutsPerUser, maxMinutesPerUser, settings),
      }))
      .sort((a, b) => b.performanceScore - a.performanceScore);
  }, [data, settings]);

  if (loading) {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-cyan-50 rounded-lg">
            <Building2 size={20} className="text-cyan-600" />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-900">שכונות — מבט על</h3>
            <p className="text-sm text-gray-500 mt-0.5">לחצו על כרטיס לצלילה עמוקה</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-24 mb-4" />
              <div className="h-12 bg-gray-100 rounded-xl mb-3" />
              <div className="h-4 bg-gray-100 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-cyan-50 rounded-lg">
            <Building2 size={20} className="text-cyan-600" />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-900">שכונות — מבט על</h3>
            <p className="text-sm text-gray-500 mt-0.5">השכונות הפעילות ביותר</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Building2 size={40} className="mb-3 text-gray-200" />
          <p className="font-semibold text-sm">לא נמצאו שכונות עבור רשות זו</p>
          <p className="text-xs mt-1">הרשת תמולא לאחר שמשתמשים יירשמו משכונות ספציפיות</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-cyan-50 rounded-lg">
          <Building2 size={20} className="text-cyan-600" />
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-900">שכונות — מבט על</h3>
          <p className="text-sm text-gray-500 mt-0.5">לחצו על כרטיס לצלילה עמוקה בנתוני השכונה</p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {enrichedData.map((row, idx) => {
          const scoreColor = getScoreColor(row.performanceScore);
          const growth = getGrowthIndicator(row.activeUsers, row.totalUsers);

          return (
            <Link
              key={row.neighborhoodId}
              href={`/admin/authority/neighborhoods/${row.neighborhoodId}`}
              className="group bg-white rounded-2xl border border-gray-200 hover:border-cyan-300 hover:shadow-lg p-5 transition-all relative overflow-hidden"
            >
              {/* Rank badge */}
              {idx < 3 && (
                <div className={`absolute top-3 left-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ${
                  idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-400' : 'bg-amber-600'
                }`}>
                  {idx + 1}
                </div>
              )}

              {/* Name */}
              <h4 className="text-base font-black text-slate-900 mb-4 group-hover:text-cyan-700 transition-colors">
                {row.neighborhoodName}
              </h4>

              {/* Score Badge */}
              <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl ring-1 ${scoreColor.bg} ${scoreColor.ring} mb-4`}>
                <span className={`text-2xl font-black ${scoreColor.text}`}>
                  {row.performanceScore}
                </span>
                <span className={`text-[10px] font-bold ${scoreColor.text} opacity-70`}>ציון ביצועים</span>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Users size={14} className="text-slate-400" />
                  <span className="text-sm font-bold text-slate-700">{row.activeUsers}</span>
                  <span className="text-[10px] text-slate-400">פעילים</span>
                </div>

                <div className="flex items-center gap-1">
                  {growth.positive ? (
                    <TrendingUp size={14} className="text-green-500" />
                  ) : (
                    <TrendingDown size={14} className="text-red-400" />
                  )}
                  <span className={`text-sm font-black ${growth.positive ? 'text-green-600' : 'text-red-500'}`}>
                    {growth.pct}%
                  </span>
                  <span className="text-[10px] text-slate-400">חדירה</span>
                </div>
              </div>

              {/* Arrow hint */}
              <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowLeft size={16} className="text-cyan-400" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 px-2">
        <p className="text-xs text-gray-400">
          פעילים = ביצעו אימון לפחות אחד החודש · חדירה = אחוז המשתמשים הפעילים מתוך סך תושבי השכונה · ציון = שקלול נפח אימונים ({settings.weightWorkoutVolume}%), חדירת אפליקציה ({settings.weightAppPenetration}%), דקות פעילות ({settings.weightActiveMinutes}%)
        </p>
      </div>
    </div>
  );
}

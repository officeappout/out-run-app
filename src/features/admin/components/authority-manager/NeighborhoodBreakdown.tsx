'use client';

import { useState } from 'react';
import { NeighborhoodBreakdownRow } from '@/features/admin/services/analytics.service';
import { ChevronUp, ChevronDown, Users, Activity, Dumbbell, Building2 } from 'lucide-react';

type SortKey = 'neighborhoodName' | 'totalUsers' | 'activeUsers' | 'workouts';
type SortDir = 'asc' | 'desc';

interface NeighborhoodBreakdownProps {
  data: NeighborhoodBreakdownRow[];
  loading?: boolean;
}

export default function NeighborhoodBreakdown({ data, loading }: NeighborhoodBreakdownProps) {
  const [sortKey, setSortKey] = useState<SortKey>('activeUsers');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-xl" />
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
            <h3 className="text-lg font-black text-gray-900">ביצועים לפי שכונה</h3>
            <p className="text-sm text-gray-500 mt-0.5">השכונות הפעילות ביותר החודש</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Building2 size={40} className="mb-3 text-gray-200" />
          <p className="font-semibold text-sm">לא נמצאו שכונות עבור רשות זו</p>
          <p className="text-xs mt-1">הטבלה תמולא לאחר שמשתמשים יירשמו משכונות ספציפיות</p>
        </div>
      </div>
    );
  }

  const maxActive = Math.max(...data.map(r => r.activeUsers), 1);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv, 'he') : bv.localeCompare(av, 'he');
    }
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronDown size={14} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="text-cyan-500" />
      : <ChevronDown size={14} className="text-cyan-500" />;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-50 rounded-lg">
            <Building2 size={20} className="text-cyan-600" />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-900">ביצועים לפי שכונה</h3>
            <p className="text-sm text-gray-500 mt-0.5">השכונות הפעילות ביותר החודש</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-right font-bold text-gray-500 px-6 py-3 w-8">#</th>
              <SortHeader col="neighborhoodName" label="שכונה" onClick={toggleSort}>
                <SortIcon col="neighborhoodName" />
              </SortHeader>
              <SortHeader col="totalUsers" label="סה״כ תושבים" onClick={toggleSort}>
                <SortIcon col="totalUsers" />
              </SortHeader>
              <SortHeader col="activeUsers" label="פעילים החודש" onClick={toggleSort}>
                <SortIcon col="activeUsers" />
              </SortHeader>
              <SortHeader col="workouts" label="סה״כ אימונים" onClick={toggleSort}>
                <SortIcon col="workouts" />
              </SortHeader>
              <th className="text-right font-bold text-gray-500 px-6 py-3">
                <span className="flex items-center gap-1 justify-end">
                  <Activity size={14} />
                  מדד פעילות
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const activePct = row.totalUsers > 0
                ? Math.round((row.activeUsers / row.totalUsers) * 100)
                : 0;
              const barWidth = maxActive > 0 ? (row.activeUsers / maxActive) * 100 : 0;
              const isTop = idx === 0;

              return (
                <tr
                  key={row.neighborhoodId}
                  className={`border-b border-gray-50 transition-colors hover:bg-cyan-50/30 ${
                    isTop ? 'bg-cyan-50/20' : ''
                  }`}
                >
                  {/* Rank */}
                  <td className="px-6 py-4">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                      idx === 0 ? 'bg-yellow-400 text-white' :
                      idx === 1 ? 'bg-gray-300 text-white' :
                      idx === 2 ? 'bg-amber-600 text-white' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {idx + 1}
                    </span>
                  </td>

                  {/* Name */}
                  <td className="px-6 py-4">
                    <span className={`font-bold ${isTop ? 'text-cyan-700' : 'text-gray-900'}`}>
                      {row.neighborhoodName}
                    </span>
                  </td>

                  {/* Total Users */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Users size={13} className="text-gray-400" />
                      <span className="font-semibold text-gray-700">{row.totalUsers}</span>
                    </div>
                  </td>

                  {/* Active Users */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className={`font-black text-base ${
                        activePct >= 50 ? 'text-green-600' :
                        activePct >= 25 ? 'text-cyan-600' :
                        'text-gray-600'
                      }`}>
                        {row.activeUsers}
                      </span>
                      <span className="text-xs text-gray-400">({activePct}%)</span>
                    </div>
                  </td>

                  {/* Workouts */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Dumbbell size={13} className="text-gray-400" />
                      <span className="font-semibold text-gray-700">{row.workouts.toLocaleString()}</span>
                    </div>
                  </td>

                  {/* Activity bar */}
                  <td className="px-6 py-4 min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop
                              ? 'bg-gradient-to-r from-cyan-400 to-teal-400'
                              : 'bg-gradient-to-r from-cyan-200 to-cyan-400'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-500 w-8 text-right">
                        {Math.round(barWidth)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40">
        <p className="text-xs text-gray-400">
          פעילים = ביצעו אימון לפחות אחד החודש הנוכחי · הנתונים מצטברים ואנונימיים
        </p>
      </div>
    </div>
  );
}

// Local sub-component for sortable header cell
function SortHeader({
  col, label, onClick, children,
}: {
  col: SortKey;
  label: string;
  onClick: (col: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <th className="px-6 py-3">
      <button
        onClick={() => onClick(col)}
        className="flex items-center gap-1 justify-end w-full font-bold text-gray-500 hover:text-cyan-600 transition-colors"
      >
        {label}
        {children}
      </button>
    </th>
  );
}

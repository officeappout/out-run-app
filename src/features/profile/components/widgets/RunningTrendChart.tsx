'use client';

import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { MapPin } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getRunTrend } from '@/features/workout-engine/core/services/storage.service';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

interface ChartDatum {
  label: string;
  distance: number;
}

export default function RunningTrendChart() {
  const [data, setData] = useState<ChartDatum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    let cancelled = false;

    const fetchWithRetry = async (attempt = 0): Promise<void> => {
      try {
        const sessions = await getRunTrend(uid, 'running', 8);
        if (cancelled) return;
        setData(
          sessions.map((s, i) => ({
            label: `#${i + 1}`,
            distance: Math.round(s.distance * 100) / 100,
          })),
        );
      } catch (err: any) {
        const isPermission = err?.code === 'permission-denied' || err?.message?.includes('permissions');
        if (isPermission && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          if (!cancelled) return fetchWithRetry(attempt + 1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWithRetry();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-pulse" dir="rtl">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
        <div className="h-48 bg-gray-50 rounded-xl" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100" dir="rtl">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-[#10B981]" />
          <h3 className="text-sm font-black text-gray-900">ריצות אחרונות</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MapPin className="w-10 h-10 text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">אין עדיין נתוני ריצה</p>
          <p className="text-xs text-gray-300 mt-0.5">צא לריצה חופשית כדי לראות מגמות</p>
        </div>
      </div>
    );
  }

  const maxDist = Math.max(...data.map(d => d.distance));
  const latestDist = data[data.length - 1]?.distance ?? 0;
  const totalDist = data.reduce((sum, d) => sum + d.distance, 0);
  const isSinglePoint = data.length === 1;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100" dir="rtl">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#10B981]" />
          <h3 className="text-sm font-black text-gray-900">ריצות אחרונות</h3>
        </div>
        <span className="text-[10px] font-bold text-gray-400">
          {data.length} ריצות
        </span>
      </div>

      {/* Latest value hero */}
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-2xl font-black text-gray-900 tabular-nums">{latestDist}</span>
        <span className="text-xs font-bold text-gray-400">ק"מ</span>
        <span className="text-[10px] font-bold text-gray-300 ms-auto">
          סה"כ {totalDist.toFixed(1)} ק"מ
        </span>
      </div>

      {/* Single-point hint */}
      {isSinglePoint && (
        <p className="text-[11px] text-gray-400 text-center mb-2">
          נתון ראשון נרשם. הקו יופיע לאחר הריצה הבאה.
        </p>
      )}

      {/* min-width:0 forces the flex/grid child to shrink properly so
          ResponsiveContainer can measure a positive width (avoids -1 warnings) */}
      <div style={{ width: '100%', minWidth: 0, height: 200 }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="runGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              width={32}
              domain={[0, Math.ceil(maxDist * 1.25) || 1]}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              contentStyle={{
                background: '#1E293B',
                border: 'none',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                padding: '6px 10px',
              }}
              formatter={(value: number) => [`${value} ק"מ`, '']}
              labelFormatter={() => ''}
              cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="distance"
              stroke="#10B981"
              strokeWidth={2.5}
              fill="url(#runGrad)"
              dot={{ r: 4, fill: '#fff', stroke: '#10B981', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={!isSinglePoint}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
          <span className="text-[10px] font-bold text-gray-500">מרחק (ק"מ)</span>
        </div>
      </div>
    </div>
  );
}

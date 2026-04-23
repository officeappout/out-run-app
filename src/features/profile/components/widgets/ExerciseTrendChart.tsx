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
  ReferenceLine,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getExerciseTrend } from '@/features/workout-engine/services/exercise-history.service';
import type { ExerciseSessionEntry } from '@/features/workout-engine/services/exercise-history.service';

interface ChartDatum {
  session: string;
  maxReps: number;
  totalVolume: number;
}

interface Props {
  exerciseId?: string;
  exerciseName?: string;
  targetReps?: number;
}

export default function ExerciseTrendChart({
  exerciseId = 'pullup',
  exerciseName,
  targetReps,
}: Props) {
  const [data, setData] = useState<ChartDatum[]>([]);
  const [displayName, setDisplayName] = useState(exerciseName ?? '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    let cancelled = false;

    const fetchWithRetry = async (attempt = 0): Promise<void> => {
      try {
        const sessions = await getExerciseTrend(uid, exerciseId, 8);
        if (cancelled) return;
        if (sessions.length > 0 && !exerciseName) {
          setDisplayName(sessions[0].exerciseName || exerciseId);
        }
        setData(
          sessions.map((s, i) => ({
            session: `#${i + 1}`,
            maxReps: s.maxReps,
            totalVolume: s.totalVolume,
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
  }, [exerciseId, exerciseName]);

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
          <TrendingUp className="w-4 h-4 text-[#00ADEF]" />
          <h3 className="text-sm font-black text-gray-900">מגמות ביצוע</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <TrendingUp className="w-10 h-10 text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">אין עדיין נתונים</p>
          <p className="text-xs text-gray-300 mt-0.5">סיים אימון כוח כדי לראות מגמות</p>
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => d.maxReps));
  const latestVal = data[data.length - 1]?.maxReps ?? 0;
  const isSinglePoint = data.length === 1;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100" dir="rtl">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#00ADEF]" />
          <h3 className="text-sm font-black text-gray-900">
            {displayName || 'מגמות ביצוע'}
          </h3>
        </div>
        <span className="text-[10px] font-bold text-gray-400">
          {data.length} אימונים אחרונים
        </span>
      </div>

      {/* Latest value hero */}
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-2xl font-black text-gray-900 tabular-nums">{latestVal}</span>
        <span className="text-xs font-bold text-gray-400">חזרות</span>
        {targetReps != null && (
          <span className="text-[10px] font-bold text-[#00ADEF] ms-auto">יעד: {targetReps}</span>
        )}
      </div>

      {/* Single-point hint */}
      {isSinglePoint && (
        <p className="text-[11px] text-gray-400 text-center mb-2">
          נתון ראשון נרשם. הקו יופיע לאחר האימון הבא.
        </p>
      )}

      {/* min-width:0 forces the flex/grid child to shrink properly so
          ResponsiveContainer can measure a positive width (avoids -1 warnings) */}
      <div style={{ width: '100%', minWidth: 0, height: 200 }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id={`exerciseGrad_${exerciseId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ADEF" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#00ADEF" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="session"
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              width={32}
              domain={[0, Math.ceil(maxVal * 1.25)]}
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
              formatter={(value: number) => [`${value} חזרות`, '']}
              labelFormatter={() => ''}
              cursor={{ stroke: '#00ADEF', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            {targetReps != null && (
              <ReferenceLine
                y={targetReps}
                stroke="#00ADEF"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                strokeOpacity={0.5}
              />
            )}
            <Area
              type="monotone"
              dataKey="maxReps"
              stroke="#00ADEF"
              strokeWidth={2.5}
              fill={`url(#exerciseGrad_${exerciseId})`}
              dot={{ r: 4, fill: '#fff', stroke: '#00ADEF', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#00ADEF', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={!isSinglePoint}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between mt-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00ADEF]" />
          <span className="text-[10px] font-bold text-gray-500">שיא חזרות</span>
        </div>
        {targetReps != null && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 border-t border-dashed border-[#00ADEF]" />
            <span className="text-[10px] font-bold text-gray-400">קו יעד</span>
          </div>
        )}
      </div>
    </div>
  );
}

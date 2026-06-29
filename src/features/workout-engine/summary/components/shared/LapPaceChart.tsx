'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import type { Lap } from '@/features/workout-engine/core/types/session.types';
import MeasuredChartBox from './MeasuredChartBox';

export default function LapPaceChart({ laps }: { laps: Lap[] }) {
  const data = laps
    .filter((l) => Number.isFinite(l.splitPace))
    .map((l) => ({ lap: l.lapNumber, pace: l.splitPace }));
  const hasData = data.some((d) => d.pace > 0);

  // Stable per-mount gradient id — avoids collision when multiple charts mount.
  const gradId = useMemo(
    () => `lap_pace_${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  return (
    <div
      className="bg-gray-50 rounded-xl shadow-sm p-4"
      dir="rtl"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold text-gray-900">קצב לפי הקפה</h3>
        <span className="text-[11px] font-semibold text-gray-500">דק׳/ק״מ · נמוך = מהיר</span>
      </div>

      {!hasData ? (
        <div className="h-[150px] flex items-center justify-center">
          <p className="text-xs text-gray-400">אין נתוני קצב להצגה</p>
        </div>
      ) : (
        <MeasuredChartBox className="w-full aspect-[2/1] min-h-[150px]">
          {({ width, height }) => (
            <AreaChart
              width={width}
              height={height}
              data={data}
              margin={{ top: 4, right: 8, left: -4, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="#00ADEF" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#00ADEF" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="lap"
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                reversed
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => formatPace(v)}
              />
              <Tooltip
                contentStyle={{
                  background: '#1E293B', border: 'none', borderRadius: 10,
                  fontSize: 11, fontWeight: 700, color: '#fff', padding: '6px 10px',
                }}
                formatter={((value: number) => [formatPace(value), 'קצב']) as never}
                labelFormatter={(lap) => `הקפה ${lap}`}
                cursor={{ stroke: '#00ADEF', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="pace"
                stroke="#00ADEF"
                strokeWidth={2.5}
                fill={`url(#${gradId})`}
                dot={{ r: 4, fill: '#fff', stroke: '#00ADEF', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#00ADEF', stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={data.length > 1}
              />
            </AreaChart>
          )}
        </MeasuredChartBox>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { DailyTrendPoint } from './shared.utils';

interface DailyTrendChartProps {
  title: string;
  icon?: React.ReactNode;
  data: DailyTrendPoint[];
  color: string;
  valueLabel: string;
  emptyMessage?: string;
}

/**
 * One daily-bucketed bar chart — single series by design (dataviz skill:
 * never dual-axis; a second measure gets its own chart, not a second
 * y-scale). Reused for both the retention (workouts/day) and economy
 * (coins/day) trend charts so the two can't visually drift apart.
 */
export function DailyTrendChart({
  title,
  icon,
  data,
  color,
  valueLabel,
  emptyMessage = 'אין נתונים בתקופה זו',
}: DailyTrendChartProps) {
  const hasData = data.some((d) => d.value > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4" dir="rtl">
      <h4 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h4>
      {!hasData ? (
        <div className="text-center py-8 text-gray-400 text-xs font-simpler">
          {emptyMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
            <Tooltip
              contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 12 }}
              formatter={(value) => [value, valueLabel]}
              labelFormatter={(label) => label}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]}>
              {/* Direct value labels — this fill is below the 3:1 contrast
                  floor against a white surface (dataviz skill palette
                  validator), which obligates a visible label rather than
                  color-only reading. */}
              <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: '#6B7280' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

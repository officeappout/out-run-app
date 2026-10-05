'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import type { ComponentAveragePoint } from '@/features/readiness/core/services/readiness-trends.service';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Test-only (no app/blue line here at all) — the average of whoever
 * was tested on EACH specific date, stated explicitly below the chart,
 * never implied. A single test date renders as one point with no line
 * (recharts simply has nothing to connect it to).
 */
interface ComponentAverageChartProps {
  title: string;
  points: ComponentAveragePoint[];
  thresholdMale: number;
  thresholdFemale: number;
  color: string;
}

export default function ComponentAverageChart({ title, points, thresholdMale, thresholdFemale, color }: ComponentAverageChartProps) {
  const data = points.map((p) => ({ dateLabel: formatDate(p.date), average: p.average, testedCount: p.testedCount }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <h4 className="text-sm font-black text-gray-900 mb-2">{title}</h4>
      {data.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-10">אין עדיין בוחן למרכיב זה</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} width={28} />
              <Tooltip contentStyle={{ direction: 'rtl', fontSize: 11, borderRadius: 12 }} />
              <ReferenceLine y={thresholdMale} stroke="#9CA3AF" strokeDasharray="4 2" label={{ value: 'סף · ז', fontSize: 9, position: 'insideTopRight' }} />
              <ReferenceLine y={thresholdFemale} stroke="#D1D5DB" strokeDasharray="4 2" label={{ value: 'סף · נ', fontSize: 9, position: 'insideBottomRight' }} />
              <Line type="linear" dataKey="average" stroke={color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-400 mt-1">ממוצע מחושב רק ממי שנבדק באותו תאריך</p>
        </>
      )}
    </div>
  );
}

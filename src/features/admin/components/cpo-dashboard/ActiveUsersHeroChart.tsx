'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

export interface ActiveUsersTrendPoint {
  date: string;
  activeUsers: number;
}

export interface TimelineMarker {
  date: string;
  label: string;
  /**
   * Discriminated union of ONE member today. municipality_launch and
   * feature_release markers are explicitly deferred (04.10.2026 audit) —
   * this field exists so they plug into the SAME prop later rather than
   * requiring a second marker mechanism.
   */
  type: 'push_campaign';
}

interface ActiveUsersHeroChartProps {
  data: ActiveUsersTrendPoint[];
  markers?: TimelineMarker[];
  loading?: boolean;
}

const MARKER_COLOR = '#F59E0B'; // amber-500 — matches the funnel's existing "activation" stage color, kept consistent across the two pages

export default function ActiveUsersHeroChart({ data, markers = [], loading }: ActiveUsersHeroChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="h-6 bg-gray-200 rounded w-56 mb-4 animate-pulse"></div>
        <div className="h-[280px] bg-gray-100 rounded animate-pulse"></div>
      </div>
    );
  }

  const hasData = data.some((d) => d.activeUsers > 0);
  // Markers inside the chart's own date range only — a campaign marker
  // outside the visible window would render at the chart edge, confusing
  // rather than informative.
  const dateSet = new Set(data.map((d) => d.date));
  const visibleMarkers = markers.filter((m) => dateSet.has(m.date));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp size={20} className="text-cyan-600" />
        <h3 className="text-lg font-black text-gray-900">משתמשים פעילים לאורך זמן</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        משתמשים עם אימון אמיתי ביום הנתון, כלל-פלטפורמי · {visibleMarkers.length > 0 && 'קווים מקווקווים = קמפיין פוש'}
      </p>
      {!hasData ? (
        <div className="text-center py-16 text-gray-400 text-sm">אין נתוני פעילות בתקופה זו</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              interval={Math.ceil(data.length / 10)}
              tickFormatter={(v) => new Date(v).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
            />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={36} />
            <Tooltip
              contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 12 }}
              labelFormatter={(label) => new Date(label).toLocaleDateString('he-IL')}
              formatter={(value) => [value, 'משתמשים פעילים']}
            />
            {visibleMarkers.map((marker) => (
              <ReferenceLine
                key={`${marker.date}-${marker.label}`}
                x={marker.date}
                stroke={MARKER_COLOR}
                strokeDasharray="4 4"
                label={{ value: marker.label, position: 'top', fontSize: 9, fill: MARKER_COLOR }}
              />
            ))}
            <Line type="monotone" dataKey="activeUsers" stroke="#0891B2" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

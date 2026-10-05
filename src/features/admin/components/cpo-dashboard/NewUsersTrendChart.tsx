'use client';

/**
 * Journey Hub Wave 2 (05.10.2026) — Acquisition tab's real new-users-
 * over-time trend, replacing the old single before/after
 * `weeklyGrowthPercent` ratio with an actual day-by-day series
 * (`growth-metrics` route's `newUsersTrend`, itself derived in-memory
 * from `realUserDocs`' `createdAt` — zero new reads there).
 *
 * Same recharts line-chart shape as `ActiveUsersHeroChart` (grid/axes/
 * tooltip), but that component's title/tooltip copy/dataKey are
 * hardcoded to "active users," and it also carries push-campaign-
 * marker support this chart has no use for — a new, purpose-built
 * sibling rather than forcing an ill-fitting reuse of that one.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { UserPlus } from 'lucide-react';

export interface NewUsersTrendPoint {
  date: string;
  newUsers: number;
}

interface NewUsersTrendChartProps {
  data: NewUsersTrendPoint[];
  loading?: boolean;
}

export default function NewUsersTrendChart({ data, loading }: NewUsersTrendChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="h-6 bg-gray-200 rounded w-56 mb-4 animate-pulse"></div>
        <div className="h-[280px] bg-gray-100 rounded animate-pulse"></div>
      </div>
    );
  }

  const hasData = data.some((d) => d.newUsers > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={20} className="text-cyan-600" />
        <h3 className="text-lg font-black text-gray-900">משתמשים חדשים לאורך זמן</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">הרשמות חדשות ליום, כלל-פלטפורמי (או מסונן — לפי שורת הסינון)</p>
      {!hasData ? (
        <div className="text-center py-16 text-gray-400 text-sm">אין הרשמות חדשות בתקופה זו</div>
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
              formatter={(value) => [value, 'משתמשים חדשים']}
            />
            <Line type="monotone" dataKey="newUsers" stroke="#6366F1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

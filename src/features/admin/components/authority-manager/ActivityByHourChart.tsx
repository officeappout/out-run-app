'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { Clock } from 'lucide-react';
import type { HourlyBucket } from '@/features/admin/services/analytics.service';

interface ActivityByHourChartProps {
  data: HourlyBucket[];
  compareData?: HourlyBucket[] | null;
  title?: string;
  primaryLabel?: string;
  compareLabel?: string;
}

export default function ActivityByHourChart({
  data,
  compareData,
  title = 'פעילות לפי שעה ביום',
  primaryLabel = 'שכונה ראשית',
  compareLabel = 'שכונה להשוואה',
}: ActivityByHourChartProps) {
  const isComparison = !!compareData && compareData.length > 0;

  // Merge primary + compare into a single dataset for grouped bars
  const chartData = data.map((bucket, i) => {
    const base: Record<string, unknown> = {
      label: bucket.label,
      hour: bucket.hour,
    };

    if (isComparison) {
      base.primary = bucket.total;
      base.compare = compareData![i]?.total ?? 0;
    } else {
      base.strength = bucket.strength;
      base.running  = bucket.running;
      base.walking  = bucket.walking;
    }

    return base;
  });

  const maxVal = Math.max(
    ...chartData.map(d => {
      if (isComparison) return Math.max((d.primary as number) || 0, (d.compare as number) || 0);
      return ((d.strength as number) || 0) + ((d.running as number) || 0) + ((d.walking as number) || 0);
    }),
    1,
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-cyan-600" />
        <h3 className="text-lg font-black text-gray-900">{title}</h3>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />

          {/* Background bands: Morning / Evening / Night */}
          <ReferenceArea x1="05:00" x2="09:00" y1={0} y2={maxVal} fill="#FEF3C7" fillOpacity={0.35} />
          <ReferenceArea x1="17:00" x2="21:00" y1={0} y2={maxVal} fill="#DBEAFE" fillOpacity={0.35} />
          <ReferenceArea x1="21:00" x2="23:00" y1={0} y2={maxVal} fill="#E0E7FF" fillOpacity={0.25} />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval={1}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 12 }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                strength: 'כוח', running: 'ריצה', walking: 'הליכה',
                primary: primaryLabel, compare: compareLabel,
              };
              return [value, labels[name] ?? name];
            }}
            labelFormatter={(label) => `שעה: ${label}`}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                strength: 'כוח', running: 'ריצה', walking: 'הליכה',
                primary: primaryLabel, compare: compareLabel,
              };
              return labels[value] ?? value;
            }}
          />

          {isComparison ? (
            <>
              <Bar dataKey="primary" fill="#00AEEF" radius={[4, 4, 0, 0]} />
              <Bar dataKey="compare" fill="#A855F7" radius={[4, 4, 0, 0]} />
            </>
          ) : (
            <>
              <Bar dataKey="strength" stackId="a" fill="#00AEEF" />
              <Bar dataKey="running"  stackId="a" fill="#10B981" />
              <Bar dataKey="walking"  stackId="a" fill="#94A3B8" radius={[4, 4, 0, 0]} />
            </>
          )}
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-center gap-6 mt-3 text-[10px] text-gray-400 font-semibold">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm" style={{ background: '#FEF3C7' }} /> בוקר (05–09)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm" style={{ background: '#DBEAFE' }} /> ערב (17–21)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm" style={{ background: '#E0E7FF' }} /> לילה (21–23)
        </span>
      </div>
    </div>
  );
}

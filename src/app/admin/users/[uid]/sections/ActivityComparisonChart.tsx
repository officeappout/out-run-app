'use client';

import React, { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BRAND_CYAN } from '@/features/content/programs';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { ACTIVITY_KINDS, comparePeriods, percentChange, type ActivityKind, type ActivityPeriod, type PeriodTotals } from './activity-periods';

const PERIODS: Array<{ id: ActivityPeriod; label: string; previous: string }> = [
  { id: 'week', label: 'שבוע אחרון', previous: 'מול השבוע הקודם' },
  { id: 'month', label: 'חודש אחרון', previous: 'מול החודש הקודם' },
  { id: 'year', label: 'שנה אחרונה', previous: 'מול השנה הקודמת' },
];

const KIND_STYLE: Record<ActivityKind, { label: string; color: string }> = {
  running: { label: 'ריצה', color: BRAND_CYAN },
  strength: { label: 'כוח', color: '#F97316' },
  walking: { label: 'הליכה', color: '#10B981' },
};

const TILES: Array<{ key: keyof PeriodTotals; label: string; digits: number }> = [
  { key: 'minutes', label: 'דקות', digits: 0 },
  { key: 'sessions', label: 'אימונים', digits: 0 },
  { key: 'km', label: 'ק״מ', digits: 1 },
  { key: 'sets', label: 'סטים', digits: 0 },
];

const fmt = (n: number, digits: number) => n.toLocaleString('he-IL', { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** אימונים tab: minutes per day / month, stacked by running, strength and walking, for a chosen period (owner 01.11). */
export default function ActivityComparisonChart({ history }: { history: WorkoutHistoryEntry[] }) {
  const [period, setPeriod] = useState<ActivityPeriod>('week');
  const data = useMemo(() => comparePeriods(history, period), [history, period]);
  const meta = PERIODS.find((p) => p.id === period)!;
  const hasData = data.points.some((p) => ACTIVITY_KINDS.some((k) => p[k] > 0));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
          <BarChart3 size={16} className="text-cyan-600" />
          השוואת פעילות לפי תקופה
        </h3>
        <div className="flex bg-gray-100 rounded-lg p-0.5" role="tablist">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${period === p.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {TILES.map((t) => {
          const change = percentChange(data.current[t.key], data.previous[t.key]);
          return (
            <div key={t.key} className="bg-gray-50 rounded-xl p-3">
              <div className="text-[11px] text-gray-500 font-bold">{t.label}</div>
              <div className="font-black text-xl text-gray-900 tabular-nums">{fmt(data.current[t.key], t.digits)}</div>
              <div className="text-[11px] text-gray-500 tabular-nums">
                {change === null ? (
                  <>קודם: {fmt(data.previous[t.key], t.digits)}</>
                ) : (
                  <span className={change >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                    {change >= 0 ? '+' : ''}{change}% {meta.previous}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasData ? (
        <div className="h-56" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="label" reversed tick={{ fontSize: 10, fill: '#6B7280' }} interval="preserveStartEnd" minTickGap={12} />
              <YAxis orientation="right" tick={{ fontSize: 10, fill: '#6B7280' }} allowDecimals={false} />
              <Tooltip
                formatter={(value, name) => [`${value} דק׳`, KIND_STYLE[String(name) as ActivityKind]?.label ?? String(name)]}
                contentStyle={{ direction: 'rtl', fontSize: 12, borderRadius: 8 }}
              />
              <Legend formatter={(name: string) => KIND_STYLE[name as ActivityKind]?.label ?? name} wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
              {ACTIVITY_KINDS.map((k) => (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stackId="minutes"
                  stroke={KIND_STYLE[k].color}
                  fill={KIND_STYLE[k].color}
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-24 flex items-center justify-center text-sm text-gray-400">אין אימונים בתקופה הזו</div>
      )}
      <p className="text-[11px] text-gray-400">דקות אימון לפי סוג. ק״מ נספרים בריצה ובהליכה בלבד.</p>
    </div>
  );
}

'use client';

/**
 * StepsAnalyticsPage — drill-down from the dashboard StepsSummaryCard.
 *
 * Design language mirrors `ExerciseAnalyticsPage` (sticky header, time-range
 * pill selector, stats grid, white chart card, RTL container) for a unified
 * "Apple Health-style" feel. Two intentional differences vs. exercise stats:
 *
 *   1. Time tabs are Day / Week / Month / Year (not 1ח׳ / 3ח׳ / הכל).
 *   2. Recharts `BarChart` (not `AreaChart`) — David's UX rule: circles for
 *      daily-goal completion, bars for historical data.
 *
 * Data source: `useStepsAnalytics` aggregates `dailyActivity` snapshots
 * client-side per range — zero extra Firestore reads when switching tabs.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  ChevronRight,
  Footprints,
  Target,
  TrendingUp,
  Award,
  Flame,
} from 'lucide-react';
import {
  useStepsAnalytics,
  type StepsTimeRange,
} from '../hooks/useStepsAnalytics';

// ── Constants ────────────────────────────────────────────────────────────────

const TIME_RANGES: { key: StepsTimeRange; label: string }[] = [
  { key: 'day', label: 'יום' },
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
  { key: 'year', label: 'שנה' },
];

const PRIMARY = '#00ADEF';
const PRIMARY_DIM = '#7DD3F0';
const GOAL_LINE = '#F59E0B';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString('he-IL');
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Main component ──────────────────────────────────────────────────────────

export default function StepsAnalyticsPage() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<StepsTimeRange>('week');

  const { chartData, stats, loading, error } = useStepsAnalytics(timeRange);

  const isYear = timeRange === 'year';
  const yMax = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 0;
  // Reference line only meaningful for daily ranges (the goal is per-day)
  const showGoalLine = !isYear && stats.dailyGoal > 0;
  const yDomainMax = Math.max(
    Math.ceil((showGoalLine ? Math.max(yMax, stats.dailyGoal) : yMax) * 1.2),
    showGoalLine ? stats.dailyGoal : 100,
  );

  const isEmpty = !loading && chartData.every((d) => d.value === 0);

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC]" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 pt-safe pt-3 pb-3 bg-white/90 backdrop-blur-sm border-b border-gray-100">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-600 active:bg-gray-100 transition-colors"
            aria-label="חזור"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              ניתוח פעילות
            </p>
            <h1 className="text-[15px] font-black text-gray-900 truncate leading-tight">
              צעדים
            </h1>
          </div>
          <div className="w-9 h-9 flex items-center justify-center rounded-xl text-primary">
            <Footprints className="w-5 h-5 -scale-x-100" />
          </div>
        </div>

        <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
          {/* ── Time range selector ── */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {TIME_RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={[
                  'flex-1 py-1.5 text-xs font-black rounded-lg transition-all',
                  timeRange === key
                    ? 'bg-white text-gray-900 shadow-subtle'
                    : 'text-gray-500',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Stats grid ── */}
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-3 h-[72px] animate-pulse border border-gray-100"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label={isYear ? 'סה״כ' : 'ממוצע יומי'}
                value={fmtCompact(isYear ? stats.totalSteps : stats.averageDaily)}
                unit="צעדים"
                icon={<TrendingUp className="w-3.5 h-3.5 text-[#00ADEF]" />}
                accent="blue"
              />
              <StatCard
                label="שיא"
                value={stats.bestDay > 0 ? fmtCompact(stats.bestDay) : '—'}
                unit="צעדים"
                icon={<Award className="w-3.5 h-3.5 text-amber-400" />}
                accent="amber"
              />
              <StatCard
                label="ימים ביעד"
                value={String(stats.daysAtGoal)}
                unit={`/ ${stats.daysWithData}`}
                icon={<Flame className="w-3.5 h-3.5 text-emerald-500" />}
                accent="green"
              />
            </div>
          )}

          {/* ── Goal pill ── */}
          {!loading && stats.dailyGoal > 0 && (
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-xl px-3 py-1.5">
                <Target className="w-3.5 h-3.5" />
                <span className="text-xs font-black">
                  יעד יומי: {fmtNumber(stats.dailyGoal)} צעדים
                </span>
              </div>
            </div>
          )}

          {/* ── Bar chart ── */}
          <div className="bg-white rounded-2xl p-4 shadow-subtle border border-gray-100">
            {loading ? (
              <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
            ) : error ? (
              <ErrorState />
            ) : isEmpty ? (
              <EmptyState range={timeRange} />
            ) : (
              <>
                <div style={{ width: '100%', minWidth: 0, height: 228 }} dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 4, left: -8, bottom: 0 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 6"
                        stroke="#F1F5F9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: '#9CA3AF' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: '#9CA3AF' }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        domain={[0, yDomainMax]}
                        tickFormatter={(v: number) => fmtCompact(v)}
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
                        formatter={(value: number) => [
                          `${fmtNumber(value)} צעדים`,
                          '',
                        ]}
                        labelFormatter={(label) => String(label)}
                        cursor={{ fill: 'rgba(0, 173, 239, 0.08)' }}
                      />

                      {showGoalLine && (
                        <ReferenceLine
                          y={stats.dailyGoal}
                          stroke={GOAL_LINE}
                          strokeDasharray="6 3"
                          strokeWidth={1.5}
                          label={{
                            value: `יעד ${fmtCompact(stats.dailyGoal)}`,
                            position: 'insideTopRight',
                            fontSize: 9,
                            fill: GOAL_LINE,
                            fontWeight: 700,
                          }}
                        />
                      )}

                      <Bar
                        dataKey="value"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={isYear ? 22 : 18}
                      >
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`bar-${index}`}
                            fill={entry.goalMet ? PRIMARY : PRIMARY_DIM}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-between mt-2 px-0.5">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ background: PRIMARY }}
                      />
                      <span className="text-[10px] font-bold text-gray-500">
                        יעד הושג
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ background: PRIMARY_DIM }}
                      />
                      <span className="text-[10px] font-bold text-gray-400">
                        מתחת ליעד
                      </span>
                    </div>
                  </div>
                  {showGoalLine && (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-5 border-t border-dashed"
                        style={{ borderColor: GOAL_LINE }}
                      />
                      <span className="text-[10px] font-bold text-gray-400">
                        יעד יומי
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="h-4" />
        </div>
      </motion.div>
    </div>
  );
}

// ── StatCard (mirrors ExerciseAnalyticsPage StatCard) ───────────────────────

type AccentColor = 'amber' | 'blue' | 'green' | 'gray';

const ACCENT_TEXT: Record<AccentColor, string> = {
  amber: 'text-amber-500',
  blue: 'text-[#00ADEF]',
  green: 'text-emerald-500',
  gray: 'text-gray-800',
};

const ACCENT_BG: Record<AccentColor, string> = {
  amber: 'bg-amber-50 border-amber-100',
  blue: 'bg-blue-50 border-blue-100',
  green: 'bg-emerald-50 border-emerald-100',
  gray: 'bg-white border-gray-100',
};

interface StatCardProps {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  accent: AccentColor;
}

function StatCard({ label, value, unit, icon, accent }: StatCardProps) {
  return (
    <div
      className={[
        'rounded-2xl p-3 flex flex-col gap-1.5 border',
        ACCENT_BG[accent],
      ].join(' ')}
    >
      <div className="flex items-center gap-1 min-w-0">
        {icon}
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide truncate">
          {label}
        </span>
      </div>
      <p
        className={[
          'text-[17px] font-black tabular-nums leading-none',
          ACCENT_TEXT[accent],
        ].join(' ')}
      >
        {value}
        {unit && (
          <span className="text-[9px] font-bold text-gray-400 ms-0.5">{unit}</span>
        )}
      </p>
    </div>
  );
}

// ── Empty / error states ────────────────────────────────────────────────────

function EmptyState({ range }: { range: StepsTimeRange }) {
  const labelByRange: Record<StepsTimeRange, string> = {
    day: 'היום',
    week: 'בשבוע האחרון',
    month: 'בחודש האחרון',
    year: 'בשנה האחרונה',
  };
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <Footprints className="w-10 h-10 text-gray-200 -scale-x-100" />
      <p className="text-sm font-black text-gray-500">
        אין נתוני צעדים {labelByRange[range]}
      </p>
      <p className="text-xs text-gray-400">
        הצעדים יופיעו כאן ברגע שהמכשיר יסנכרן
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <TrendingUp className="w-10 h-10 text-gray-200" />
      <p className="text-sm font-black text-gray-500">שגיאה בטעינת הנתונים</p>
      <p className="text-xs text-gray-400">נסה שוב מאוחר יותר</p>
    </div>
  );
}

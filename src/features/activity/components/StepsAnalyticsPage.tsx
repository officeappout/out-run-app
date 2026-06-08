'use client';

/**
 * StepsAnalyticsPage — drill-down from the dashboard StepsSummaryCard.
 *
 * Design language mirrors ExerciseAnalyticsPage (sticky header, time-range
 * pill selector, stats grid, white chart card, RTL container) for a unified
 * Apple Health-style feel.
 *
 * Permission gate: when running on a native device and health permissions have
 * not yet been granted, the chart is replaced by a Connect to Health screen
 * that drives the full disclosure → OS permission flow inline.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  ShieldCheck,
  HeartPulse,
} from 'lucide-react';
import {
  useStepsAnalytics,
  type StepsTimeRange,
  type StepsChartPoint,
} from '../hooks/useStepsAnalytics';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import { healthBridgeSyncNow } from '@/lib/healthBridge/init';
import CircularProgress from '@/components/CircularProgress';
import { STEPS_COLOR } from '@/config/health-goals';
// ── Constants ────────────────────────────────────────────────────────────────

const TIME_RANGES: { key: StepsTimeRange; label: string }[] = [
  { key: 'day', label: 'יום' },
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
  { key: 'year', label: 'שנה' },
];

const PRIMARY = STEPS_COLOR;     // #00C07A — canonical steps green (goal met)
const PRIMARY_DIM = '#9BE3CD';   // lighter steps green (below goal)
const GOAL_LINE = '#F59E0B';     // amber dashed goal reference (semantic, unchanged)
const PREF_KEY_PERMISSIONS = 'outrun.healthBridge.permissionsGranted';

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

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

// ── Main component ──────────────────────────────────────────────────────────

export default function StepsAnalyticsPage() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<StepsTimeRange>('week');

  // Optimistic default (true) prevents a flash of the gate for already-granted
  // users. The async Preferences read corrects to false in one tick if needed.
  const [permCheckDone, setPermCheckDone] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(true);

  useEffect(() => {
    if (!isNativeApp()) {
      setHasPermissions(true);
      setPermCheckDone(true);
      return;
    }
    (async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value } = await Preferences.get({ key: PREF_KEY_PERMISSIONS });
        setHasPermissions(value === '1');
      } catch {
        setHasPermissions(true);
      } finally {
        setPermCheckDone(true);
      }
    })();
  }, []);

  const handlePermissionsGranted = useCallback(() => {
    setHasPermissions(true);
    void healthBridgeSyncNow('manual');
  }, []);

  const { triggerHealthPermission, disclosureProps, isRequesting } = useHealthWithDisclosure({
    onGranted: handlePermissionsGranted,
  });

  const { chartData, stats, loading, error } = useStepsAnalytics(timeRange);

  const isYear = timeRange === 'year';
  const yMax = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 0;
  const showGoalLine = !isYear && stats.dailyGoal > 0;
  const yDomainMax = Math.max(
    Math.ceil((showGoalLine ? Math.max(yMax, stats.dailyGoal) : yMax) * 1.2),
    showGoalLine ? stats.dailyGoal : 100,
  );

  const isEmpty = !loading && chartData.every((d) => d.value === 0);

  // Hero ring reflects the selected range:
  //   day   → today's steps vs daily goal, labelled "היום"
  //   week/month/year → average daily vs daily goal, labelled "ממוצע"
  const ringValue = timeRange === 'day' ? stats.todaySteps : stats.averageDaily;
  const ringLabel = timeRange === 'day' ? 'היום' : 'ממוצע';
  const ringPercentage =
    stats.dailyGoal > 0
      ? Math.min(100, Math.round((ringValue / stats.dailyGoal) * 100))
      : 0;


  // Index of the single best-day bar (non-year ranges only) → gets a ★.
  const bestDayIndex =
    !isYear && stats.bestDay > 0
      ? chartData.findIndex((d) => d.value === stats.bestDay)
      : -1;

  const renderBestDayStar = (props: {
    x?: number;
    y?: number;
    width?: number;
    index?: number;
  }) => {
    const { x = 0, y = 0, width = 0, index } = props;
    if (index !== bestDayIndex) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fontSize={14}
        fill={GOAL_LINE}
      >
        ★
      </text>
    );
  };

  // ── "Connect Health" empty-state (no data / bridge off) ──────────────────
  // Uses hasPermissions (read from Capacitor Preferences on mount) so the
  // teaser renders correctly on first load without SettingsModal being opened.

  // Stable per-mount mock series (3,000–9,000 steps × 7 days) for the blurred
  // teaser shown behind the connect CTA. useMemo([]) so it doesn't reshuffle.
  const mockChartData = useMemo<StepsChartPoint[]>(() => {
    const labels = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const value = 3000 + Math.floor(Math.random() * 6000);
      return {
        label: `${labels[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`,
        value,
        goalMet: value >= 8000,
      };
    });
  }, []);

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
          <div className="w-9 h-9 flex items-center justify-center rounded-xl text-[#00C07A]">
            <Footprints className="w-5 h-5 -scale-x-100" />
          </div>
        </div>

        {/* ── Body: permission gate OR chart ── */}
        {permCheckDone && !hasPermissions ? (
          <>
            <HealthConnectGate
              onConnect={triggerHealthPermission}
              isRequesting={isRequesting}
            />
            <HealthConnectDisclosureModal {...disclosureProps} />
          </>
        ) : (
          <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
            {/* Time range selector — above ring, underline style matching home tabs */}
            <div className="flex border-b border-gray-100">
              {TIME_RANGES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTimeRange(key)}
                  className={[
                    'flex-1 py-2.5 text-sm font-bold transition-colors',
                    timeRange === key
                      ? 'text-[#00C07A] border-b-2 border-[#00C07A] -mb-px'
                      : 'text-gray-400',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Hero ring — reflects selected range */}
            {loading ? (
              <div className="flex justify-center py-2">
                <div className="w-40 h-40 rounded-full bg-gray-100 animate-pulse" />
              </div>
            ) : (
              <div className="flex justify-center py-1">
                <CircularProgress
                  percentage={ringPercentage}
                  size={160}
                  strokeWidth={12}
                  colorClass="text-[#00C07A]"
                >
                  <div className="flex flex-col items-center leading-none">
                    <span className="text-[12px] font-black text-[#00C07A] mb-1">{ringLabel}</span>
                    <span
                      className="text-[36px] font-black text-gray-900 tabular-nums"
                      dir="ltr"
                    >
                      {fmtNumber(ringValue)}
                    </span>
                    <span className="text-[12px] font-semibold text-gray-400 mt-1.5">
                      מתוך {fmtNumber(stats.dailyGoal)} צעדים
                    </span>
                  </div>
                </CircularProgress>
              </div>
            )}

            {/* Stats grid */}
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
                  icon={<TrendingUp className="w-3.5 h-3.5 text-[#00C07A]" />}
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

            {/* Goal pill */}
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

            {/* Bar chart */}
            <div className="bg-white rounded-2xl p-4 shadow-subtle border border-gray-100">
              {loading ? (
                <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
              ) : error ? (
                <ErrorState />
              ) : isEmpty ? (
                hasPermissions ? (
                  <EmptyState range={timeRange} />
                ) : (
                  <div className="relative">
                    {/* Decorative blurred mock chart behind the CTA */}
                    <div
                      className="pointer-events-none select-none"
                      style={{ filter: 'blur(4px)' }}
                      aria-hidden="true"
                    >
                      <div style={{ width: '100%', minWidth: 0, height: 228 }} dir="ltr">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={mockChartData}
                            margin={{ top: 10, right: 4, left: -8, bottom: 0 }}
                            barCategoryGap="20%"
                          >
                            <CartesianGrid strokeDasharray="3 6" stroke="#F1F5F9" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 9, fill: '#9CA3AF' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 9, fill: '#9CA3AF' }}
                              axisLine={false}
                              tickLine={false}
                              width={36}
                              tickFormatter={(v: number) => fmtCompact(v)}
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={18}>
                              {mockChartData.map((entry, index) => (
                                <Cell
                                  key={`mock-${index}`}
                                  fill={entry.goalMet ? PRIMARY : PRIMARY_DIM}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* CTA overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4">
                      <p className="text-[13px] font-black text-gray-800 max-w-[240px] leading-snug">
                        חבר/י את נתוני הבריאות כדי לראות את הצעדים האמיתיים שלך
                      </p>
                      <button
                        type="button"
                        onClick={triggerHealthPermission}
                        className="inline-flex items-center gap-2 px-7 py-2 text-black text-sm font-semibold rounded-full shadow-md shadow-cyan-400/25 transition-all duration-200 hover:brightness-105 active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' }}
                      >
                        <HeartPulse className="w-4 h-4" />
                        התחבר לאפליקציית הבריאות
                      </button>
                    </div>
                  </div>
                )
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
                          cursor={{ fill: 'rgba(0, 192, 122, 0.08)' }}
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
                          label={renderBestDayStar}
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

            <HealthConnectDisclosureModal {...disclosureProps} />
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────

type AccentColor = 'amber' | 'blue' | 'green' | 'gray';

const ACCENT_TEXT: Record<AccentColor, string> = {
  amber: 'text-amber-500',
  blue: 'text-[#00C07A]',
  green: 'text-emerald-500',
  gray: 'text-gray-800',
};

const ACCENT_BG: Record<AccentColor, string> = {
  amber: 'bg-amber-50 border-amber-100',
  blue: 'bg-[#EAFBF4] border-[#CBF2E4]',
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

// ── Health Connect Gate ──────────────────────────────────────────────────────

interface HealthConnectGateProps {
  onConnect: () => void;
  isRequesting: boolean;
}

function HealthConnectGate({ onConnect, isRequesting }: HealthConnectGateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center px-8 py-20 text-center gap-6"
      dir="rtl"
    >
      <div className="relative">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #E0F7EF 0%, #EAFBF4 100%)',
            boxShadow: '0 0 0 12px rgba(0,192,122,0.08)',
          }}
        >
          <Footprints className="w-10 h-10 text-[#00C07A] -scale-x-100" aria-hidden="true" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md">
          <ShieldCheck className="w-[18px] h-[18px] text-emerald-500" aria-hidden="true" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-black text-gray-900">חבר/י נתוני בריאות</h2>
        <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
          כדי לצפות בהיסטוריית הצעדים שלך, OUT צריכה גישה לנתוני הבריאות מהמכשיר שלך.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {['צעדים יומיים', 'קלוריות פעילות', 'דקות אימון'].map((label) => (
          <span
            key={label}
            className="text-[11px] font-bold text-[#00C07A] bg-[#EAFBF4] border border-[#CBF2E4] rounded-full px-3 py-1"
          >
            {label}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={onConnect}
        disabled={isRequesting}
        className="w-full max-w-xs bg-[#00C07A] hover:bg-[#00A86A] active:scale-[0.98] disabled:opacity-60 text-white font-black py-4 rounded-2xl shadow-lg shadow-[#00C07A]/25 transition-all text-[15px]"
      >
        {isRequesting ? 'מחכה לאישור...' : 'חבר/י נתוני בריאות'}
      </button>

      <p className="text-[11px] text-gray-400 leading-relaxed max-w-[260px]">
        הנתונים משמשים אך ורק להצגה אישית ולא מועברים לצדדים שלישיים
      </p>
    </motion.div>
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

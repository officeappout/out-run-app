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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
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
  TrendingUp,
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
const HEBREW_DAYS_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

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

// ── Carousel constants ───────────────────────────────────────────────────────
const RING_SIZE = 200;
const RING_GAP  = 24;
const STRIDE    = RING_SIZE + RING_GAP; // 224px

// ── StepsRing ─────────────────────────────────────────────────────────────────
// Gradient-stroked ring with optional overrun arc. Each instance receives a
// unique gradId so SVG gradient IDs don't collide when 3 rings are in the DOM.
interface StepsRingProps {
  /** Raw ratio × 100; can exceed 100 when steps > goal. */
  percentage: number;
  size?: number;
  strokeWidth?: number;
  /** Must be unique per mounted instance to avoid SVG gradient ID collisions. */
  gradId: string;
  children?: React.ReactNode;
}

function StepsRing({ percentage, size = 160, strokeWidth = 12, gradId, children }: StepsRingProps) {
  const clamped  = Math.min(100, Math.max(0, percentage));
  const overflow = Math.max(0, percentage - 100);
  const cx   = size / 2;
  const r    = cx - strokeWidth / 2;
  const circ = 2 * Math.PI * r;
  const mainOffset  = circ - (clamped / 100) * circ;
  const overOffset  = circ - (Math.min(100, overflow) / 100) * circ;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradId} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#00C07A" />
            <stop offset="50%"  stopColor="#00D4AA" />
            <stop offset="100%" stopColor="#00E8E0" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="transparent" stroke="#F1F5F9" strokeWidth={strokeWidth} />
        {/* Progress arc */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="transparent"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={mainOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
        {/* Overrun arc — same gradient at reduced opacity */}
        {overflow > 0 && (
          <circle
            cx={cx} cy={cx} r={r}
            fill="transparent"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circ}
            strokeDashoffset={overOffset}
            strokeLinecap="round"
            opacity={0.35}
            style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function StepsAnalyticsPage() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<StepsTimeRange>('week');
  // Day-tab: how many days back from today (0 = today, 6 = 6 days ago)
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);

  // Optimistic default (true) — loading skeleton covers the async gap on native.
  const [hasPermissions, setHasPermissions] = useState(true);

  useEffect(() => {
    if (!isNativeApp()) return; // web: no native permissions needed, keep true
    (async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value } = await Preferences.get({ key: PREF_KEY_PERMISSIONS });
        setHasPermissions(value === '1');
      } catch {
        // On error keep true — don't block the UI
      }
    })();
  }, []);

  const handlePermissionsGranted = useCallback(() => {
    setHasPermissions(true);
    void healthBridgeSyncNow('manual');
  }, []);

  const { openDisclosure, disclosureProps } = useHealthWithDisclosure({
    onGranted: handlePermissionsGranted,
  });

  const { snapshots, chartData, stats, loading, error } = useStepsAnalytics(timeRange);

  const isDay = timeRange === 'day';
  const isYear = timeRange === 'year';

  // Reset day offset when leaving the day tab
  useEffect(() => {
    if (!isDay) setSelectedDayOffset(0);
  }, [isDay]);

  // ── Gesture-driven carousel (day tab) ─────────────────────────────────────
  // dragX tracks real-time finger offset from the initial touch point.
  // All ring scale/opacity/x values are derived from it via useTransform.
  // On release, dragX springs back to 0 after committing the day change.
  // NOTE: all hooks must be called unconditionally (even on non-day tabs).
  const dragX = useMotionValue(0);
  const pointerStartX = useRef<number | null>(null);

  // Scale — right drag (dragX > 0) = older = left ring grows into center
  const centerScale   = useTransform(dragX, [-STRIDE, 0, STRIDE], [0.55, 1.0,  0.55]);
  const leftScale     = useTransform(dragX, [-STRIDE, 0, STRIDE], [0.35, 0.55, 1.0 ]);
  const rightScale    = useTransform(dragX, [-STRIDE, 0, STRIDE], [1.0,  0.55, 0.35]);

  // Opacity
  const centerOpacity = useTransform(dragX, [-STRIDE, 0, STRIDE], [0.35, 1.0,  0.35]);
  const leftOpacity   = useTransform(dragX, [-STRIDE, 0, STRIDE], [0.0,  0.35, 1.0 ]);
  const rightOpacity  = useTransform(dragX, [-STRIDE, 0, STRIDE], [1.0,  0.35, 0.0 ]);

  // X positions — add dragX so right drag (dragX > 0) pulls left ring toward center
  const leftX   = useTransform(dragX, (v) => -STRIDE - RING_SIZE / 2 + v);
  const centerX = useTransform(dragX, (v) => -RING_SIZE / 2 + v);
  const rightX  = useTransform(dragX, (v) =>  STRIDE - RING_SIZE / 2 + v);

  const handleCarouselPointerDown = useCallback((e: React.PointerEvent) => {
    pointerStartX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleCarouselPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerStartX.current === null) return;
    dragX.set(e.clientX - pointerStartX.current);
  }, [dragX]);

  const handleCarouselCommit = useCallback(() => {
    if (pointerStartX.current === null) return;
    const delta = dragX.get();
    pointerStartX.current = null;
    // right drag (delta > 0) = older day; left drag (delta < 0) = newer day
    if (delta > 25) setSelectedDayOffset((p) => Math.min(p + 1, Math.max(0, snapshots.length - 1)));
    else if (delta < -25) setSelectedDayOffset((p) => Math.max(p - 1, 0));
    // Reset dragX on the next frame — after React re-renders with the new selectedDayOffset.
    // Instant reset (no spring) avoids a double-animation conflict where the new ring positions
    // and a running spring both update x simultaneously, causing a visible jump.
    requestAnimationFrame(() => dragX.set(0));
  }, [dragX, snapshots.length]);

  const yMax = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 0;
  const showGoalLine = !isYear && stats.dailyGoal > 0;
  const yDomainMax = Math.max(
    Math.ceil((showGoalLine ? Math.max(yMax, stats.dailyGoal) : yMax) * 1.2),
    showGoalLine ? stats.dailyGoal : 100,
  );

  const isEmpty = !loading && chartData.every((d) => d.value === 0);

  // ── Day tab: selected-day navigation ─────────────────────────────────────
  const MAX_DAY_OFFSET = Math.max(0, snapshots.length - 1);
  const selectedDaySnap = snapshots[snapshots.length - 1 - selectedDayOffset];
  const selectedDaySteps = selectedDaySnap?.steps ?? 0;
  const selectedDayGoal = selectedDaySnap?.stepsGoal ?? stats.dailyGoal;

  const dayRingLabel =
    selectedDayOffset === 0 ? 'היום'
    : selectedDayOffset === 1 ? 'אתמול'
    : selectedDaySnap?.date
      ? (() => {
          const d = new Date(selectedDaySnap.date + 'T00:00:00');
          return `${d.getDate()}/${d.getMonth() + 1}`;
        })()
      : `לפני ${selectedDayOffset}`;

  // 7-day area chart data — always last 7 snapshots; selected day gets a larger dot
  const dayAreaData = useMemo(() => {
    const last7 = snapshots.slice(-7);
    return last7.map((s, i, arr) => {
      const d = s.date ? new Date(s.date + 'T00:00:00') : new Date();
      return {
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        dayName: HEBREW_DAYS_SHORT[d.getDay()],
        value: s.steps,
        isSelected: i === arr.length - 1 - selectedDayOffset,
      };
    });
  }, [snapshots, selectedDayOffset]);

  // ── Active ring values (overridden per day when isDay) ────────────────────
  const activeRingValue = isDay ? selectedDaySteps : stats.averageDaily;
  const activeRingLabel = isDay ? dayRingLabel : 'ממוצע';
  const activeRingGoal = isDay ? selectedDayGoal : stats.dailyGoal;
  const activeRingPercentage =
    activeRingGoal > 0
      ? Math.min(100, Math.round((activeRingValue / activeRingGoal) * 100))
      : 0;


  // legacy alias (used by km pill)
  const ringValue = activeRingValue;

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
        <div
          className="sticky top-0 z-10 flex items-center gap-2 px-4 pb-3 bg-white/90 backdrop-blur-sm border-b border-gray-100"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        >
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
          {/* TEMPORARY — health-sync debug panel entry point. Remove once the
              90-day-backfill investigation (Aug 2026) is confirmed fixed
              on-device; see src/app/debug/health-sync/page.tsx. */}
          <button
            type="button"
            onClick={() => router.push('/debug/health-sync')}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-300 active:bg-gray-100 transition-colors text-base"
            aria-label="מידע טכני לאבחון"
          >
            🔧
          </button>
          <div className="w-9 h-9 flex items-center justify-center rounded-xl text-[#00C07A]">
            <Footprints className="w-5 h-5 -scale-x-100" />
          </div>
        </div>

        {/* ── Body ── */}
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

            {/* Hero ring */}
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-40 h-40 rounded-full bg-gray-100 animate-pulse" />
              </div>
            ) : isDay ? (
              /* ── Day tab: gesture-driven carousel ──
                 useMotionValue(dragX) drives all transforms in real-time.
                 Pointer events update dragX directly — no Framer Motion drag prop
                 so the container itself never moves. On release: commit day change
                 + spring dragX back to 0. Stable slot keys (left/center/right)
                 so rings never unmount during swipe. */
              <div
                className="-mx-4 overflow-hidden relative select-none touch-pan-y"
                style={{ height: RING_SIZE + 56 }}
                onPointerDown={handleCarouselPointerDown}
                onPointerMove={handleCarouselPointerMove}
                onPointerUp={handleCarouselCommit}
                onPointerCancel={() => {
                  pointerStartX.current = null;
                  requestAnimationFrame(() => dragX.set(0));
                }}
              >
                {/* ── Left slot — older day (selectedDayOffset + 1) ── */}
                {(() => {
                  const offset = selectedDayOffset + 1;
                  const snap   = snapshots[snapshots.length - 1 - offset] ?? null;
                  const steps  = snap?.steps ?? 0;
                  const goal   = snap?.stepsGoal ?? stats.dailyGoal;
                  const pct    = goal > 0 ? (steps / goal) * 100 : 0;
                  const inRange = offset <= MAX_DAY_OFFSET;
                  return (
                    <motion.div
                      className="absolute"
                      style={{
                        top: '50%', left: '50%',
                        x: leftX, y: -RING_SIZE / 2,
                        scale: leftScale,
                        opacity: inRange ? leftOpacity : 0,
                      }}
                    >
                      <StepsRing percentage={pct} size={RING_SIZE} strokeWidth={10} gradId="stepsGrad-left">
                        <div className="flex flex-col items-center leading-none pointer-events-none">
                          <span className="text-[9px] font-bold text-gray-400">
                            {offset === 1 ? 'אתמול' : snap?.date
                              ? (() => { const d = new Date(snap.date + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; })()
                              : `לפני ${offset}`}
                          </span>
                          <span className="text-[22px] font-black text-gray-700 tabular-nums" dir="ltr">
                            {fmtNumber(steps)}
                          </span>
                        </div>
                      </StepsRing>
                    </motion.div>
                  );
                })()}

                {/* ── Center slot — current day (selectedDayOffset) ── */}
                {(() => {
                  const offset = selectedDayOffset;
                  const snap   = snapshots[snapshots.length - 1 - offset] ?? null;
                  const steps  = snap?.steps ?? 0;
                  const goal   = snap?.stepsGoal ?? stats.dailyGoal;
                  const pct    = goal > 0 ? (steps / goal) * 100 : 0;
                  const label  =
                    offset === 0 ? 'היום'
                    : offset === 1 ? 'אתמול'
                    : snap?.date
                      ? (() => { const d = new Date(snap.date + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; })()
                      : `לפני ${offset}`;
                  return (
                    <motion.div
                      className="absolute"
                      style={{
                        top: '50%', left: '50%',
                        x: centerX, y: -RING_SIZE / 2,
                        scale: centerScale,
                        opacity: centerOpacity,
                      }}
                    >
                      <StepsRing percentage={pct} size={RING_SIZE} strokeWidth={14} gradId="stepsGrad-center">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={selectedDayOffset}
                            initial={{ opacity: 0, scale: 0.85, y: 10 }}
                            animate={{ opacity: 1, scale: 1,    y: 0  }}
                            exit={{    opacity: 0, scale: 0.85, y: -10 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col items-center leading-none"
                          >
                            <span className="text-[12px] font-black text-[#00C07A] mb-1">{label}</span>
                            <span className="text-[36px] font-black text-gray-900 tabular-nums" dir="ltr">
                              {fmtNumber(steps)}
                            </span>
                            <span className="text-[12px] font-semibold text-gray-400 mt-1.5">
                              מתוך {fmtNumber(goal)} צעדים
                            </span>
                          </motion.div>
                        </AnimatePresence>
                      </StepsRing>
                    </motion.div>
                  );
                })()}

                {/* ── Right slot — newer day (selectedDayOffset - 1) ── */}
                {(() => {
                  const offset  = selectedDayOffset - 1;
                  const snap    = offset >= 0 ? (snapshots[snapshots.length - 1 - offset] ?? null) : null;
                  const steps   = snap?.steps ?? 0;
                  const goal    = snap?.stepsGoal ?? stats.dailyGoal;
                  const pct     = goal > 0 ? (steps / goal) * 100 : 0;
                  const inRange = offset >= 0;
                  return (
                    <motion.div
                      className="absolute"
                      style={{
                        top: '50%', left: '50%',
                        x: rightX, y: -RING_SIZE / 2,
                        scale: rightScale,
                        opacity: inRange ? rightOpacity : 0,
                      }}
                    >
                      <StepsRing percentage={pct} size={RING_SIZE} strokeWidth={10} gradId="stepsGrad-right">
                        {inRange && (
                          <div className="flex flex-col items-center leading-none pointer-events-none">
                            <span className="text-[9px] font-bold text-gray-400">
                              {offset === 0 ? 'היום' : offset === 1 ? 'אתמול'
                                : snap?.date
                                  ? (() => { const d = new Date(snap.date + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; })()
                                  : `לפני ${offset}`}
                            </span>
                            <span className="text-[22px] font-black text-gray-700 tabular-nums" dir="ltr">
                              {fmtNumber(steps)}
                            </span>
                          </div>
                        )}
                      </StepsRing>
                    </motion.div>
                  );
                })()}
              </div>
            ) : (
              /* ── Week / month / year: single gradient ring ── */
              <div className="flex justify-center py-4">
                <StepsRing
                  percentage={activeRingPercentage}
                  size={RING_SIZE}
                  strokeWidth={12}
                  gradId="stepsGrad-single"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={timeRange}
                      initial={{ opacity: 0, scale: 0.85, y: 10 }}
                      animate={{ opacity: 1, scale: 1,    y: 0  }}
                      exit={{    opacity: 0, scale: 0.85, y: -10 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="flex flex-col items-center leading-none"
                    >
                      <span className="text-[12px] font-black text-[#00C07A] mb-1">{activeRingLabel}</span>
                      <span className="text-[36px] font-black text-gray-900 tabular-nums" dir="ltr">
                        {fmtNumber(activeRingValue)}
                      </span>
                      <span className="text-[12px] font-semibold text-gray-400 mt-1.5">
                        מתוך {fmtNumber(activeRingGoal)} צעדים
                      </span>
                    </motion.div>
                  </AnimatePresence>
                </StepsRing>
              </div>
            )}

            {/* Stat pills */}
            {loading ? (
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white rounded-xl h-14 animate-pulse border border-gray-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {/* ממוצע יומי / today */}
                <div className="bg-white rounded-xl p-2 text-center border border-gray-100 shadow-subtle">
                  <p className="text-[13px] font-black text-gray-900 leading-none tabular-nums" dir="ltr">
                    {fmtCompact(isDay ? selectedDaySteps : isYear ? stats.totalSteps : stats.averageDaily)}
                  </p>
                  <p className="text-[9px] font-semibold text-gray-400 mt-0.5 leading-none">צעדים</p>
                  <p className="text-[8px] font-bold text-gray-400 mt-1 leading-none">
                    {isDay ? activeRingLabel : isYear ? 'סה״כ' : 'ממוצע'}
                  </p>
                </div>
                {/* שיא */}
                <div className="bg-white rounded-xl p-2 text-center border border-gray-100 shadow-subtle">
                  <p className="text-[13px] font-black text-gray-900 leading-none tabular-nums" dir="ltr">
                    {stats.bestDay > 0 ? fmtCompact(stats.bestDay) : '—'}
                  </p>
                  <p className="text-[9px] font-semibold text-gray-400 mt-0.5 leading-none">צעדים</p>
                  <p className="text-[8px] font-bold text-gray-400 mt-1 leading-none">שיא</p>
                </div>
                {/* ימים ביעד */}
                <div className="bg-white rounded-xl p-2 text-center border border-gray-100 shadow-subtle">
                  <p className="text-[13px] font-black text-gray-900 leading-none tabular-nums" dir="ltr">
                    {stats.daysAtGoal}
                    <span className="text-[10px] font-semibold text-gray-400">/{stats.daysWithData}</span>
                  </p>
                  <p className="text-[9px] font-semibold text-gray-400 mt-0.5 leading-none">ימים</p>
                  <p className="text-[8px] font-bold text-gray-400 mt-1 leading-none">ביעד</p>
                </div>
                {/* רצף */}
                <div className="bg-white rounded-xl p-2 text-center border border-gray-100 shadow-subtle">
                  <p className="text-[13px] font-black text-gray-900 leading-none tabular-nums" dir="ltr">
                    {stats.streak}
                  </p>
                  <p className="text-[9px] font-semibold text-gray-400 mt-0.5 leading-none">ימים</p>
                  <p className="text-[8px] font-bold text-gray-400 mt-1 leading-none">רצף 🔥</p>
                </div>
                {/* ק"מ */}
                <div className="bg-white rounded-xl p-2 text-center border border-gray-100 shadow-subtle">
                  <p className="text-[13px] font-black text-gray-900 leading-none tabular-nums" dir="ltr">
                    {((isDay ? selectedDaySteps : ringValue) / 1300).toFixed(1)}
                  </p>
                  <p className="text-[9px] font-semibold text-gray-400 mt-0.5 leading-none">ק״מ</p>
                  <p className="text-[8px] font-bold text-gray-400 mt-1 leading-none">מרחק</p>
                </div>
              </div>
            )}

            {/* Chart — area for day tab, bars for week/month/year */}
            <div className="bg-white rounded-2xl p-4 shadow-subtle border border-gray-100 outline-none focus-within:outline-none" style={{ WebkitTapHighlightColor: 'transparent' }}>
              {loading ? (
                <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
              ) : error ? (
                <ErrorState />
              ) : isDay ? (
                /* ── Day tab: 7-day area chart ── */
                <>
                  {/* Day-name selectors above chart — tap = same as tapping dot */}
                  <div className="flex border-b border-gray-100 mb-1" dir="rtl">
                    {[...dayAreaData].reverse().map((pt, ri) => {
                      const fwdIndex = dayAreaData.length - 1 - ri;
                      const offset = dayAreaData.length - 1 - fwdIndex;
                      return (
                        <button
                          key={ri}
                          type="button"
                          onClick={() => setSelectedDayOffset(offset)}
                          className={[
                            'flex-1 py-1.5 text-xs font-bold transition-colors outline-none',
                            pt.isSelected
                              ? 'text-[#00C07A] border-b-2 border-[#00C07A] -mb-px'
                              : 'text-gray-400',
                          ].join(' ')}
                        >
                          {pt.dayName}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ width: '100%' }} dir="ltr">
                    <ResponsiveContainer width="100%" height={150}>
                      <AreaChart data={dayAreaData} margin={{ top: 10, right: 4, left: -24, bottom: 0 }}>
                        <defs>
                          <linearGradient id="stepsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00C07A" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="#00C07A" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 6" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="label" hide />
                        <YAxis
                          tick={{ fontSize: 9, fill: '#9CA3AF' }}
                          axisLine={false}
                          tickLine={false}
                          width={36}
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
                          formatter={(value: number) => [`${fmtNumber(value)} צעדים`, '']}
                          labelFormatter={(_, payload) => {
                            const idx = payload?.[0]?.payload ? dayAreaData.findIndex(p => p === payload[0].payload) : -1;
                            const pt = idx >= 0 ? dayAreaData[idx] : null;
                            if (!pt) return '';
                            const offset = dayAreaData.length - 1 - idx;
                            if (offset === 0) return 'היום';
                            if (offset === 1) return 'אתמול';
                            const dayNamesFull = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
                            const d = new Date();
                            d.setDate(d.getDate() - offset);
                            return `יום ${dayNamesFull[d.getDay()]}`;
                          }}
                          cursor={{ stroke: 'rgba(0,192,122,0.15)', strokeWidth: 1 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#00C07A"
                          strokeWidth={2}
                          fill="url(#stepsAreaGrad)"
                          dot={(dotProps: { cx: number; cy: number; index: number }) => {
                            const pt = dayAreaData[dotProps.index];
                            const sel = pt?.isSelected;
                            return (
                              <circle
                                key={`dot-${dotProps.index}`}
                                cx={dotProps.cx}
                                cy={dotProps.cy}
                                r={sel ? 6 : 3}
                                fill="white"
                                stroke="#00C07A"
                                strokeWidth={sel ? 2.5 : 1.5}
                                style={{ cursor: 'pointer', outline: 'none' }}
                                tabIndex={-1}
                                onClick={() =>
                                  setSelectedDayOffset(dayAreaData.length - 1 - dotProps.index)
                                }
                              />
                            );
                          }}
                          activeDot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (isEmpty || !hasPermissions) ? (
                  <div className="relative">
                    {/* Decorative blurred mock chart behind the CTA */}
                    <div
                      className="pointer-events-none select-none"
                      style={{ filter: 'blur(4px)' }}
                      aria-hidden="true"
                    >
                      <div style={{ width: '100%', minWidth: 0 }} dir="ltr">
                        <ResponsiveContainer width="100%" height={228}>
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
                        onClick={openDisclosure}
                        className="inline-flex items-center gap-2 px-7 py-2 text-black text-sm font-semibold rounded-full shadow-md shadow-cyan-400/25 transition-all duration-200 hover:brightness-105 active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' }}
                      >
                        <HeartPulse className="w-4 h-4" />
                        התחבר לאפליקציית הבריאות
                      </button>
                    </div>
                  </div>
              ) : (
                <>
                  <div style={{ width: '100%', minWidth: 0 }} dir="ltr">
                    <ResponsiveContainer width="100%" height={228}>
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

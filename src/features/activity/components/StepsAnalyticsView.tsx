'use client';

/**
 * StepsAnalyticsView — presentational body of the Steps Analytics page.
 *
 * Hook-free with respect to data: everything it shows comes in through props
 * from `StepsAnalyticsPage` (the container that owns routing, the health
 * permission flow and `useStepsAnalytics`). Split out so the design-v2 preview
 * route can render the page from fixtures.
 *
 * Design language v2 (glass): a soft steps-green / cyan tinted backdrop with
 * floating glass cards (`Card variant="glass"`). The cards are siblings — no
 * blurred layer is nested in another. The sticky header is deliberately NOT
 * glass (a solid translucent bar, no backdrop-filter) so the page never blurs
 * a blurred card scrolling under it — the cheaper of the two options.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useReducedMotion,
} from 'framer-motion';
import {
  ChevronRight,
  Footprints,
  TrendingUp,
  HeartPulse,
  Trophy,
  Target,
  Flame,
  Route,
  CalendarDays,
  Check,
  type LucideIcon,
} from 'lucide-react';
import {
  BarChart,
  Button,
  Card,
  DeltaBadge,
  IconTile,
  StatNumber,
  EASE_V2,
  type BarDatum,
  type IconTileTone,
} from '@/components/ui/v2';
import {
  bucketTooltipLabel,
  currentBucketKey,
  sameDayLastWeekSteps,
  type StepsTimeRange,
  type StepsChartPoint,
  type StepsAnalyticsStats,
} from '../lib/steps-analytics.logic';
import type { DailyStepsSnapshot } from '../services/activity-history.service';
import { STEPS_COLOR } from '@/config/health-goals';

// ── Constants ────────────────────────────────────────────────────────────────

const TIME_RANGES: { key: StepsTimeRange; label: string }[] = [
  { key: 'day', label: 'יום' },
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
  { key: 'year', label: 'שנה' },
];

const HEBREW_DAYS_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

/** Soft tinted backdrop the glass cards float over (steps green + v2 cyan). */
const PAGE_BACKDROP =
  'radial-gradient(120% 55% at 100% 0%, rgba(0,192,122,0.20) 0%, rgba(0,192,122,0) 60%),' +
  'radial-gradient(90% 45% at 0% 18%, rgba(0,186,247,0.16) 0%, rgba(0,186,247,0) 62%),' +
  'radial-gradient(110% 50% at 50% 100%, rgba(12,242,227,0.12) 0%, rgba(12,242,227,0) 65%),' +
  'linear-gradient(180deg, #f2fbf7 0%, #f6fbfd 55%, #f3fafb 100%)';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString('he-IL');
}

function shortDate(dateKey: string | undefined | null): string | null {
  if (!dateKey) return null;
  const d = new Date(dateKey + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()}/${d.getMonth() + 1}`;
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
        <circle cx={cx} cy={cx} r={r} fill="transparent" stroke="rgba(0,192,122,0.12)" strokeWidth={strokeWidth} />
        {/* Progress arc */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="transparent"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={mainOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.23, 1, 0.32, 1)' }}
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
            style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.23, 1, 0.32, 1)' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ── GoalProgressBar ──────────────────────────────────────────────────────────
// Steps-green bar toward the daily goal. The fill animates with scaleX
// (transform only); the overrun past 100% is not drawn — the copy says it.
function GoalProgressBar({ steps, goal }: { steps: number; goal: number }) {
  const reduce = useReducedMotion();
  const ratio = goal > 0 ? Math.min(1, Math.max(0, steps / goal)) : 0;
  const pct = goal > 0 ? Math.round((steps / goal) * 100) : 0;
  const reached = goal > 0 && steps >= goal;
  return (
    <div className="space-y-2">
      <div
        className="h-3 rounded-full bg-activity-steps/15 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, pct)}
        aria-label="התקדמות ליעד היומי"
      >
        <motion.div
          className="h-full w-full rounded-full origin-right"
          style={{ background: 'linear-gradient(270deg, #00C07A 0%, #00D4AA 70%, #00E8E0 100%)' }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: ratio }}
          transition={{ duration: 0.9, ease: EASE_V2 }}
        />
      </div>
      <div className="flex items-center justify-between text-[12px] font-semibold text-v2-muted">
        <span className="inline-flex items-center gap-1">
          {reached ? (
            <>
              <Check className="w-3.5 h-3.5 text-activity-steps" strokeWidth={3} aria-hidden />
              <span className="font-extrabold text-[#00865a]">היעד הושג</span>
            </>
          ) : (
            <span>
              <span className="font-extrabold text-v2-ink tabular-nums" dir="ltr">{pct}%</span> מהיעד
            </span>
          )}
        </span>
        <span>
          יעד <span className="tabular-nums" dir="ltr">{fmtNumber(goal)}</span>
        </span>
      </div>
    </div>
  );
}

// ── StatTile — one secondary stat as its own glass card ──────────────────────
interface StatTileProps {
  icon: LucideIcon;
  tone?: IconTileTone;
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  format?: (v: number) => string;
  className?: string;
}

function StatTile({ icon, tone = 'steps', label, value, unit, decimals, format, className = '' }: StatTileProps) {
  return (
    <Card variant="glass" padding="sm" className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        <IconTile icon={icon} tone={tone} size="sm" />
        <span className="text-[12px] font-bold text-v2-muted truncate">{label}</span>
      </div>
      <StatNumber value={value} unit={unit} decimals={decimals} format={format} size="sm" countUp />
    </Card>
  );
}

export interface StepsAnalyticsViewProps {
  timeRange: StepsTimeRange;
  onTimeRangeChange: (range: StepsTimeRange) => void;
  snapshots: DailyStepsSnapshot[];
  chartData: StepsChartPoint[];
  stats: StepsAnalyticsStats;
  loading: boolean;
  error: boolean;
  /** False on native until the OS health permission is granted. */
  hasPermissions: boolean;
  /** Opens the Health Connect / HealthKit disclosure flow. */
  onConnect: () => void;
  onBack: () => void;
  /** Rendered at the end of the body (the disclosure modal). */
  footer?: React.ReactNode;
}

export default function StepsAnalyticsView({
  timeRange,
  onTimeRangeChange: setTimeRange,
  snapshots,
  chartData,
  stats,
  loading,
  error,
  hasPermissions,
  onConnect: openDisclosure,
  onBack,
  footer,
}: StepsAnalyticsViewProps) {
  // Day-tab: how many days back from today (0 = today, 6 = 6 days ago)
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);

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

  const showGoalLine = !isYear && stats.dailyGoal > 0;

  const isEmpty = !loading && chartData.every((d) => d.value === 0);

  // ── Day tab: selected-day navigation ─────────────────────────────────────
  const MAX_DAY_OFFSET = Math.max(0, snapshots.length - 1);
  const selectedDaySnap = snapshots[snapshots.length - 1 - selectedDayOffset];
  const selectedDaySteps = selectedDaySnap?.steps ?? 0;

  const dayRingLabel =
    selectedDayOffset === 0 ? 'היום'
    : selectedDayOffset === 1 ? 'אתמול'
    : shortDate(selectedDaySnap?.date) ?? `לפני ${selectedDayOffset}`;

  // 7-day chart data for the day tab — always the last 7 snapshots.
  const dayWeekData = useMemo(() => {
    const last7 = snapshots.slice(-7);
    return last7.map((s, i, arr) => {
      const d = s.date ? new Date(s.date + 'T00:00:00') : new Date();
      return {
        key: s.date,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        dayName: HEBREW_DAYS_SHORT[d.getDay()],
        value: s.steps,
        isSelected: i === arr.length - 1 - selectedDayOffset,
      };
    });
  }, [snapshots, selectedDayOffset]);

  // ── Hero values ───────────────────────────────────────────────────────────
  // Day tab → the selected day (carousel); other tabs → today (latest snapshot).
  const todaySnap = snapshots[snapshots.length - 1];
  const todaySteps = todaySnap?.steps ?? 0;
  const todayGoal = todaySnap?.stepsGoal ?? stats.dailyGoal;
  const heroDateKey = isDay ? selectedDaySnap?.date : todaySnap?.date;
  const heroSteps = isDay ? selectedDaySteps : todaySteps;
  // Same weekday last week — looked up by date in the already-loaded history.
  // null (not loaded / no doc that day) → DeltaBadge hides itself.
  const lastWeekSameDay = sameDayLastWeekSteps(snapshots, heroDateKey);

  // Distance pill: prefer the real synced distanceMeters (HealthKit
  // distanceWalkingRunning / Health Connect DistanceRecord) over the old
  // steps-based estimate (~1300 steps/km) whenever real data exists for
  // this window. Falls back silently to the estimate for users/days with
  // no synced distance yet (pre-sync history, Android <14, etc).
  const ringValue = isDay ? selectedDaySteps : stats.averageDaily;
  const realDistanceKm = isDay
    ? (selectedDaySnap?.distanceMeters ?? 0) / 1000
    : stats.daysWithData > 0
      ? (stats.totalDistanceMeters / stats.daysWithData) / 1000
      : 0;
  const hasRealDistance = isDay
    ? (selectedDaySnap?.distanceMeters ?? 0) > 0
    : stats.totalDistanceMeters > 0;
  const distanceKm = hasRealDistance ? realDistanceKm : ringValue / 1300;

  // ── Chart (v2 BarChart) ───────────────────────────────────────────────────
  const todayKey = currentBucketKey(timeRange);
  const barData: BarDatum[] = useMemo(
    () => chartData.map((d) => ({ key: d.key, label: d.label, value: d.value })),
    [chartData],
  );
  // Month view: 30 bars are too narrow for per-bar labels (the primitive
  // truncates them to one character) — show a date tick every 7 days instead,
  // anchored on today, positioned over the bar centres (time runs left → right,
  // oldest first, like the pre-v2 charts and the day carousel).
  const isMonth = timeRange === 'month';
  const monthTicks = useMemo(() => {
    if (!isMonth || chartData.length === 0) return [];
    const n = chartData.length;
    const ticks: { key: string; label: string; leftPct: number }[] = [];
    for (let i = n - 1; i >= 0; i -= 7) {
      const d = new Date(chartData[i].key + 'T00:00:00');
      if (Number.isNaN(d.getTime())) continue;
      ticks.push({ key: chartData[i].key, label: `${d.getDate()}/${d.getMonth() + 1}`, leftPct: ((i + 0.5) / n) * 100 });
    }
    return ticks;
  }, [isMonth, chartData]);
  const dayBarData: BarDatum[] = useMemo(
    () => dayWeekData.map((d) => ({ key: d.key, label: d.label, value: d.value })),
    [dayWeekData],
  );

  const renderTooltip = (d: BarDatum) => (
    <div className="text-center">
      <div className="text-[18px] font-black tabular-nums tracking-[-0.02em] text-v2-ink leading-tight" dir="ltr">
        {fmtNumber(d.value)}
      </div>
      <div className="text-[10px] font-bold text-v2-muted leading-tight">צעדים</div>
      <div className="mt-0.5 text-[11px] font-semibold text-v2-ink-2 leading-tight">
        {bucketTooltipLabel(d.key)}
      </div>
    </div>
  );

  // Stable per-mount mock series (3,000–9,000 steps × 7 days) for the blurred
  // teaser shown behind the connect CTA. useMemo([]) so it doesn't reshuffle.
  const mockBarData = useMemo<BarDatum[]>(() => {
    const labels = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        key: `mock-${i}`,
        label: `${labels[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`,
        value: 3000 + Math.floor(Math.random() * 6000),
      };
    });
  }, []);

  const firstStatLabel = isDay ? dayRingLabel : isYear ? 'סה״כ' : 'ממוצע יומי';
  const firstStatValue = isDay ? selectedDaySteps : isYear ? stats.totalSteps : stats.averageDaily;

  return (
    <div className="min-h-[100dvh]" dir="rtl" style={{ background: PAGE_BACKDROP }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE_V2 }}
      >
        {/* ── Header — solid translucent bar, no backdrop-filter (see file doc) ── */}
        <div
          className="sticky top-0 z-10 flex items-center gap-2 px-4 pb-3 bg-[#f4fbf8]/95 shadow-[0_1px_0_rgba(14,27,42,0.06)]"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        >
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-v2-ink shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
            aria-label="חזור"
          >
            <ChevronRight className="w-5 h-5" strokeWidth={2.4} />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-[11px] font-extrabold text-[#00865a]">ניתוח פעילות</p>
            <h1 className="text-[17px] font-black text-v2-ink truncate leading-tight">
              <span className="tracking-v2-tight">צעדים</span>
            </h1>
          </div>
          <IconTile icon={Footprints} tone="steps" size="md" className="[&>svg]:-scale-x-100" />
        </div>

        {/* Debug entry point removed from production UI (Aug 2026, backfill
            confirmed fixed on-device) — the /debug/health-sync route itself
            still exists (src/app/debug/health-sync/page.tsx) and is reachable
            directly if ever needed again; just no visible link to it now. */}

        {/* ── Body ── */}
        <div className="px-4 pt-3 pb-4 space-y-3 max-w-lg mx-auto">
          {/* Time range selector — segmented pill */}
          <div
            role="tablist"
            aria-label="טווח זמן"
            className="flex p-1 rounded-full bg-white/70 shadow-v2-ring"
          >
            {TIME_RANGES.map(({ key, label }) => {
              const active = timeRange === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTimeRange(key)}
                  className={[
                    'relative flex-1 h-9 rounded-full text-[14px] font-extrabold transition-colors duration-200 ease-v2',
                    active ? 'text-white' : 'text-v2-muted',
                  ].join(' ')}
                >
                  {active && (
                    <motion.span
                      layoutId="steps-range-pill"
                      className="absolute inset-0 rounded-full bg-v2-ink"
                      transition={{ duration: 0.32, ease: EASE_V2 }}
                    />
                  )}
                  <span className="relative">{label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Hero ── */}
          {loading ? (
            <Card variant="glass" padding="lg" className="space-y-4">
              <div className="h-4 w-24 rounded-full bg-v2-hairline animate-pulse" />
              <div className="h-14 w-48 rounded-v2-tile bg-v2-hairline animate-pulse" />
              <div className="h-3 w-full rounded-full bg-v2-hairline animate-pulse" />
            </Card>
          ) : isDay ? (
            /* ── Day tab: gesture-driven carousel ──
               useMotionValue(dragX) drives all transforms in real-time.
               Pointer events update dragX directly — no Framer Motion drag prop
               so the container itself never moves. On release: commit day change
               + spring dragX back to 0. Stable slot keys (left/center/right)
               so rings never unmount during swipe. */
            <Card variant="glass" padding="none" className="overflow-hidden">
              <div
                className="overflow-hidden relative select-none touch-pan-y"
                style={{ height: RING_SIZE + 40 }}
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
                          <span className="text-[11px] font-bold text-v2-muted">
                            {offset === 1 ? 'אתמול' : shortDate(snap?.date) ?? `לפני ${offset}`}
                          </span>
                          <span className="text-[24px] font-black text-v2-ink-2 tabular-nums" dir="ltr">
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
                    : shortDate(snap?.date) ?? `לפני ${offset}`;
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
                            transition={{ duration: 0.2, ease: EASE_V2 }}
                            className="flex flex-col items-center leading-none"
                          >
                            <span className="text-[12px] font-extrabold text-[#00865a] mb-1.5">{label}</span>
                            <StatNumber value={steps} size="lg" countUp align="center" />
                            <span className="text-[12px] font-semibold text-v2-muted mt-1.5">
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
                            <span className="text-[11px] font-bold text-v2-muted">
                              {offset === 0 ? 'היום' : offset === 1 ? 'אתמול' : shortDate(snap?.date) ?? `לפני ${offset}`}
                            </span>
                            <span className="text-[24px] font-black text-v2-ink-2 tabular-nums" dir="ltr">
                              {fmtNumber(steps)}
                            </span>
                          </div>
                        )}
                      </StepsRing>
                    </motion.div>
                  );
                })()}
              </div>
              <div className="flex justify-center pb-4 -mt-1 min-h-[24px]">
                <DeltaBadge current={heroSteps} previous={lastWeekSameDay} suffix="מול שבוע שעבר" />
              </div>
            </Card>
          ) : (
            /* ── Week / month / year: today's steps ── */
            <Card variant="glass" padding="lg" className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <IconTile icon={Footprints} tone="steps" size="md" className="[&>svg]:-scale-x-100" />
                  <span className="text-[14px] font-extrabold text-[#00865a]">היום</span>
                </div>
                <DeltaBadge current={todaySteps} previous={lastWeekSameDay} suffix="מול שבוע שעבר" />
              </div>
              <StatNumber value={todaySteps} unit="צעדים" size="hero" countUp />
              <GoalProgressBar steps={todaySteps} goal={todayGoal} />
            </Card>
          )}

          {/* ── Secondary stats ── */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[88px] rounded-v2-card bg-white/60 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={CalendarDays} label={firstStatLabel} value={firstStatValue} unit="צעדים" />
              <StatTile
                icon={Trophy}
                label="שיא"
                value={stats.bestDay}
                unit={stats.bestDay > 0 ? 'צעדים' : undefined}
                format={stats.bestDay > 0 ? undefined : () => '—'}
              />
              <StatTile
                icon={Target}
                label="ימים ביעד"
                value={stats.daysAtGoal}
                format={(v) => `${Math.round(v)}/${stats.daysWithData}`}
              />
              <StatTile icon={Flame} tone="neutral" label="רצף" value={stats.streak} unit="ימים" />
              {/* ק"מ — real synced distance when available, steps-estimate fallback otherwise */}
              <StatTile
                icon={Route}
                tone="neutral"
                label="מרחק"
                value={distanceKm}
                decimals={1}
                unit="ק״מ"
                className="col-span-2 !flex-row items-center justify-between"
              />
            </div>
          )}

          {/* ── Chart ── */}
          <Card variant="glass" padding="md" className="outline-none" style={{ WebkitTapHighlightColor: 'transparent' }}>
            {loading ? (
              <div className="h-56 rounded-v2-tile bg-v2-hairline/60 animate-pulse" />
            ) : error ? (
              <ErrorState />
            ) : isDay ? (
              /* ── Day tab: the last 7 days, selected day highlighted ── */
              <>
                {/* Day-name selectors — tap = select that day in the carousel */}
                <div className="flex gap-1 mb-3" dir="rtl">
                  {[...dayWeekData].reverse().map((pt, ri) => {
                    const fwdIndex = dayWeekData.length - 1 - ri;
                    const offset = dayWeekData.length - 1 - fwdIndex;
                    return (
                      <button
                        key={ri}
                        type="button"
                        onClick={() => setSelectedDayOffset(offset)}
                        aria-pressed={pt.isSelected}
                        className={[
                          'flex-1 h-8 rounded-full text-[13px] font-extrabold transition-colors duration-200 ease-v2 outline-none',
                          pt.isSelected
                            ? 'bg-activity-steps text-white'
                            : 'text-v2-muted bg-v2-surface',
                        ].join(' ')}
                      >
                        {pt.dayName}
                      </button>
                    );
                  })}
                </div>
                {stats.dailyGoal > 0 && (
                  <div className="flex justify-end mb-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-v2-muted">
                      <span className="w-4 border-t-[1.5px] border-dashed border-v2-ink/30" />
                      יעד יומי <span className="tabular-nums" dir="ltr">{fmtNumber(stats.dailyGoal)}</span>
                    </span>
                  </div>
                )}
                <BarChart
                  data={dayBarData}
                  goal={stats.dailyGoal > 0 ? stats.dailyGoal : null}
                  highlightKey={selectedDaySnap?.date ?? null}
                  color={STEPS_COLOR}
                  dir="ltr"
                  height={170}
                  datasetKey="day"
                  renderTooltip={renderTooltip}
                  ariaLabel="צעדים בשבעת הימים האחרונים"
                />
              </>
            ) : (isEmpty || !hasPermissions) ? (
              <div className="relative">
                {/* Decorative blurred mock chart behind the CTA (CSS filter, not backdrop) */}
                <div
                  className="pointer-events-none select-none"
                  style={{ filter: 'blur(4px)' }}
                  aria-hidden="true"
                >
                  <BarChart data={mockBarData} color={STEPS_COLOR} height={228} datasetKey="mock" />
                </div>

                {/* CTA overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-4">
                  <IconTile icon={HeartPulse} tone="steps" size="lg" />
                  <p className="text-[15px] font-black text-v2-ink max-w-[250px] leading-snug">
                    חבר/י את נתוני הבריאות כדי לראות את הצעדים האמיתיים שלך
                  </p>
                  <Button variant="primary" size="md" onClick={openDisclosure} className="gap-2">
                    <HeartPulse className="w-4 h-4" strokeWidth={2.4} aria-hidden />
                    התחבר לאפליקציית הבריאות
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[14px] font-extrabold text-v2-ink">
                    {isYear ? 'צעדים לפי חודש' : 'צעדים לפי יום'}
                  </span>
                  {showGoalLine && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-v2-muted">
                      <span className="w-4 border-t-[1.5px] border-dashed border-v2-ink/30" />
                      יעד יומי <span className="tabular-nums" dir="ltr">{fmtNumber(stats.dailyGoal)}</span>
                    </span>
                  )}
                </div>
                <BarChart
                  data={barData}
                  goal={showGoalLine ? stats.dailyGoal : null}
                  highlightKey={todayKey}
                  color={STEPS_COLOR}
                  dir="ltr"
                  height={220}
                  labelEvery={isYear ? 2 : undefined}
                  className={isMonth ? '[&>div:nth-child(2)]:invisible' : ''}
                  datasetKey={timeRange}
                  renderTooltip={renderTooltip}
                  ariaLabel={isYear ? 'צעדים לפי חודש' : 'צעדים לפי יום'}
                />
                {isMonth && monthTicks.length > 0 && (
                  <div className="relative h-4 -mt-[18px]" aria-hidden>
                    {monthTicks.map((t) => (
                      <span
                        key={t.key}
                        className={`absolute top-0 -translate-x-1/2 text-[10px] leading-4 tabular-nums whitespace-nowrap ${
                          t.key === todayKey ? 'font-black text-v2-ink' : 'font-semibold text-v2-muted'
                        }`}
                        style={{ left: `${t.leftPct}%` }}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[11px] font-semibold text-v2-muted text-center">
                  הקש/י על עמודה לפרטים
                </p>
              </>
            )}
          </Card>

          <div className="h-4" />

          {footer}
        </div>
      </motion.div>
    </div>
  );
}

// ── Error state ─────────────────────────────────────────────────────────────

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
      <IconTile icon={TrendingUp} tone="neutral" size="lg" />
      <p className="text-[15px] font-black text-v2-ink">שגיאה בטעינת הנתונים</p>
      <p className="text-[13px] font-semibold text-v2-muted">נסה שוב מאוחר יותר</p>
    </div>
  );
}

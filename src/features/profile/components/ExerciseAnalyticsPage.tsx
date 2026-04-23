'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Settings2,
  TrendingUp,
  Award,
  Zap,
  Target,
  Pencil,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { X } from 'lucide-react';
import VerticalWheelPicker from '@/features/workout-engine/players/strength/playlist/VerticalWheelPicker';
import {
  useExerciseAnalytics,
  type TimeRange,
  type Metric,
} from '../hooks/useExerciseAnalytics';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  exerciseId: string;
  userId: string;
  /** Name pre-populated from the URL query string for instant display before data loads. */
  exerciseNameHint?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtShortDate(dateMs: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'numeric',
  }).format(new Date(dateMs));
}

function fmtLongDate(dateMs: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateMs));
}

function fmtImprovement(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: '1m', label: '1ח׳' },
  { key: '3m', label: '3ח׳' },
  { key: 'all', label: 'הכל' },
];

const METRIC_OPTS: { key: Metric; label: string }[] = [
  { key: 'maxReps', label: 'שיא חזרות' },
  { key: 'totalVolume', label: 'נפח כולל' },
];

/** Number wheel values for the goal picker — 1 to 100. */
const GOAL_RANGE = Array.from({ length: 100 }, (_, i) => i + 1);

// ── Main component ───────────────────────────────────────────────────────────

export default function ExerciseAnalyticsPage({ exerciseId, exerciseNameHint }: Props) {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [metric, setMetric] = useState<Metric>('maxReps');
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);

  const {
    analytics,
    filteredSessions,
    loading,
    error,
    effectiveTarget,
    customGoal,
    saveGoal,
    savingGoal,
  } = useExerciseAnalytics(exerciseId, timeRange);

  // Use the name hint for instant display; update once real data arrives
  const exerciseName =
    analytics?.sessions[0]?.exerciseName ?? exerciseNameHint ?? exerciseId;

  // Build chart data from filtered sessions
  const chartData = filteredSessions.map((s) => ({
    label: fmtShortDate(s.dateMs),
    value: metric === 'maxReps' ? s.maxReps : s.totalVolume,
  }));

  const metricUnit = metric === 'maxReps' ? 'חזרות' : 'חז׳ (נפח)';
  const yMax = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 10;

  // Ensure the Y domain always fits the reference line
  const yDomainMax =
    effectiveTarget != null && metric === 'maxReps'
      ? Math.ceil(Math.max(yMax, effectiveTarget) * 1.28)
      : Math.ceil(yMax * 1.28);

  const isFirstSession =
    !loading && analytics !== null && analytics.sessions.length === 1;
  const isEmptyRange =
    !loading && analytics !== null && analytics.sessions.length > 1 && filteredSessions.length === 0;

  const improvementPct = analytics?.improvementPct ?? null;
  const improvementPositive =
    improvementPct === null
      ? undefined
      : improvementPct > 0
      ? true
      : improvementPct < 0
      ? false
      : undefined;

  // Suggested starting value for the picker:
  // existing custom goal → PB + 2 → 10
  const pickerInitialValue =
    customGoal ??
    (analytics && analytics.personalBest > 0
      ? Math.min(analytics.personalBest + 2, 100)
      : 10);

  const handleSaveGoal = useCallback(
    async (value: number) => {
      setGoalPickerOpen(false);
      await saveGoal(value);
    },
    [saveGoal],
  );

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
              ניתוח ביצועים
            </p>
            <h1 className="text-[15px] font-black text-gray-900 truncate leading-tight">
              {exerciseName}
            </h1>
          </div>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 active:bg-gray-100 transition-colors"
            aria-label="הגדרות"
          >
            <Settings2 className="w-5 h-5" />
          </button>
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

          {/* ── Stats row ── */}
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-3 h-[72px] animate-pulse border border-gray-100"
                />
              ))}
            </div>
          ) : analytics && (
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="שיא אישי"
                value={analytics.personalBest > 0 ? String(analytics.personalBest) : '—'}
                unit="חז׳"
                icon={<Award className="w-3.5 h-3.5 text-amber-400" />}
                accent="amber"
              />
              <StatCard
                label="נפח כולל"
                value={
                  analytics.cumulativeVolume > 0
                    ? analytics.cumulativeVolume >= 1000
                      ? `${(analytics.cumulativeVolume / 1000).toFixed(1)}k`
                      : String(analytics.cumulativeVolume)
                    : '—'
                }
                unit="חז׳"
                icon={<TrendingUp className="w-3.5 h-3.5 text-[#00ADEF]" />}
                accent="blue"
              />
              <StatCard
                label="שיפור"
                value={fmtImprovement(improvementPct)}
                unit=""
                icon={<Zap className="w-3.5 h-3.5 text-purple-400" />}
                accent={
                  improvementPositive === true
                    ? 'green'
                    : improvementPositive === false
                    ? 'red'
                    : 'gray'
                }
              />
            </div>
          )}

          {/* ── Goal pill / Add-goal button ── */}
          {!loading && (
            <div className="flex items-center justify-end">
              {effectiveTarget != null ? (
                /* Existing goal pill — tap to edit */
                <button
                  onClick={() => setGoalPickerOpen(true)}
                  className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-xl px-3 py-1.5 active:scale-95 transition-transform"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span className="text-xs font-black">יעד: {effectiveTarget} חז׳</span>
                  <Pencil className="w-3 h-3 opacity-60" />
                </button>
              ) : (
                /* No goal yet — invite user to set one */
                <button
                  onClick={() => setGoalPickerOpen(true)}
                  className="flex items-center gap-1.5 bg-white border border-dashed border-gray-300 text-gray-500 rounded-xl px-3 py-1.5 active:scale-95 transition-transform"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="text-xs font-black">הוסף יעד</span>
                </button>
              )}
            </div>
          )}

          {/* ── Metric toggle ── */}
          <div className="flex gap-2">
            {METRIC_OPTS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={[
                  'flex-1 py-2 text-xs font-black rounded-xl border transition-all',
                  metric === key
                    ? 'bg-[#00ADEF] text-white border-[#00ADEF] shadow-subtle'
                    : 'bg-white text-gray-500 border-gray-200',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Full area chart ── */}
          <div className="bg-white rounded-2xl p-4 shadow-subtle border border-gray-100">
            {loading ? (
              <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
            ) : isFirstSession ? (
              <FirstSessionEmptyState exerciseName={exerciseName} />
            ) : isEmptyRange ? (
              <EmptyRangeState />
            ) : error ? (
              <ErrorState />
            ) : (
              <>
                <div style={{ width: '100%', minWidth: 0, height: 228 }} dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 4, left: -12, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id={`analyticsGrad_${exerciseId}`}
                          x1="0" y1="0" x2="0" y2="1"
                        >
                          <stop offset="0%" stopColor="#00ADEF" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#00ADEF" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>

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
                        width={32}
                        domain={[0, yDomainMax]}
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
                        formatter={(value: number) => [`${value} ${metricUnit}`, '']}
                        labelFormatter={(label) => String(label)}
                        cursor={{
                          stroke: '#00ADEF',
                          strokeWidth: 1,
                          strokeDasharray: '4 4',
                        }}
                      />

                      {/* Target reference line — only when a real target exists
                          and the user is viewing the maxReps metric */}
                      {effectiveTarget != null && effectiveTarget > 0 && metric === 'maxReps' && (
                        <ReferenceLine
                          y={effectiveTarget}
                          stroke="#F59E0B"
                          strokeDasharray="6 3"
                          strokeWidth={1.5}
                          label={{
                            value: `יעד ${effectiveTarget}`,
                            position: 'insideTopRight',
                            fontSize: 9,
                            fill: '#F59E0B',
                            fontWeight: 700,
                          }}
                        />
                      )}

                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#00ADEF"
                        strokeWidth={2.5}
                        fill={`url(#analyticsGrad_${exerciseId})`}
                        dot={{ r: 4, fill: '#fff', stroke: '#00ADEF', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: '#00ADEF', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Chart legend */}
                <div className="flex items-center justify-between mt-2 px-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#00ADEF]" />
                    <span className="text-[10px] font-bold text-gray-500">
                      {metric === 'maxReps' ? 'שיא חזרות' : 'נפח כולל'}
                    </span>
                  </div>
                  {effectiveTarget != null && effectiveTarget > 0 && metric === 'maxReps' && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 border-t border-dashed border-amber-400" />
                      <span className="text-[10px] font-bold text-gray-400">
                        יעד ({effectiveTarget} חז׳)
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Full session history log ── */}
          {!loading && filteredSessions.length > 0 && (
            <div className="bg-white rounded-2xl shadow-subtle border border-gray-100 overflow-hidden">
              {/* Log header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <h2 className="text-sm font-black text-gray-900">היסטוריה מלאה</h2>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 rounded-lg px-2 py-0.5">
                  {filteredSessions.length} אימונים
                </span>
              </div>

              {/* Column labels */}
              <div className="flex items-center px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                <span className="flex-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  תאריך
                </span>
                <span className="w-24 text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  סטים × חזרות
                </span>
                <span className="w-12 text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  שינוי
                </span>
              </div>

              {/* Rows — newest first */}
              <div className="divide-y divide-gray-50">
                {[...filteredSessions].reverse().map((session, i, arr) => {
                  const prevSession: RichExerciseSession | undefined = arr[i + 1];
                  const metricVal =
                    metric === 'maxReps' ? session.maxReps : session.totalVolume;
                  const prevVal = prevSession
                    ? metric === 'maxReps'
                      ? prevSession.maxReps
                      : prevSession.totalVolume
                    : null;
                  const delta = prevVal !== null ? metricVal - prevVal : null;

                  return (
                    <SessionRow
                      key={session.dateMs}
                      session={session}
                      delta={delta}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom padding for nav bar */}
          <div className="h-4" />
        </div>
      </motion.div>

      {/* ── Goal picker modal ── */}
      <GoalPickerModal
        isOpen={goalPickerOpen}
        currentGoal={effectiveTarget}
        initialValue={pickerInitialValue}
        saving={savingGoal}
        onClose={() => setGoalPickerOpen(false)}
        onSave={handleSaveGoal}
      />
    </div>
  );
}

// ── GoalPickerModal ───────────────────────────────────────────────────────────

interface GoalPickerModalProps {
  isOpen: boolean;
  currentGoal: number | null;
  initialValue: number;
  saving: boolean;
  onClose: () => void;
  onSave: (value: number) => void;
}

function GoalPickerModal({
  isOpen,
  currentGoal,
  initialValue,
  saving,
  onClose,
  onSave,
}: GoalPickerModalProps) {
  const [selected, setSelected] = useState(initialValue);

  // Sync picker when the modal re-opens with a new context
  React.useEffect(() => {
    if (isOpen) setSelected(initialValue);
  }, [isOpen, initialValue]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="goal-picker-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.25)' }}
          onClick={onClose}
        >
          <motion.div
            key="goal-picker-card"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="bg-white rounded-2xl w-full max-w-xs shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Header */}
            <div className="p-5 pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-4 h-4 text-amber-400" />
                    <h2 className="text-base font-black text-gray-900">
                      {currentGoal != null ? 'עדכן יעד' : 'הגדר יעד אישי'}
                    </h2>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {currentGoal != null
                      ? `יעד נוכחי: ${currentGoal} חזרות`
                      : 'בחר כמה חזרות תרצה להגיע'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
            </div>

            {/* Wheel picker */}
            <div className="px-5 py-6 flex items-center justify-center">
              <VerticalWheelPicker
                values={GOAL_RANGE}
                selectedValue={selected}
                onChange={setSelected}
                label="חזרות"
              />
            </div>

            {/* Save button */}
            <div className="px-5 pb-5 pt-0">
              <button
                onClick={() => onSave(selected)}
                disabled={saving}
                className="w-full h-12 rounded-full font-black text-white text-sm flex items-center justify-center active:scale-[0.97] transition-transform disabled:opacity-60"
                style={{
                  background: 'linear-gradient(to left, #00C9F2, #00AEEF)',
                }}
              >
                {saving ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'שמירה'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────

type AccentColor = 'amber' | 'blue' | 'green' | 'red' | 'gray';

const ACCENT_TEXT: Record<AccentColor, string> = {
  amber: 'text-amber-500',
  blue: 'text-[#00ADEF]',
  green: 'text-emerald-500',
  red: 'text-red-400',
  gray: 'text-gray-800',
};

const ACCENT_BG: Record<AccentColor, string> = {
  amber: 'bg-amber-50 border-amber-100',
  blue: 'bg-blue-50 border-blue-100',
  green: 'bg-emerald-50 border-emerald-100',
  red: 'bg-red-50 border-red-100',
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

// ── SessionRow ────────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: RichExerciseSession;
  delta: number | null;
}

function SessionRow({ session, delta }: SessionRowProps) {
  const reps = session.reps ?? [];
  const setsLabel =
    reps.length > 0 ? `${reps.length} × ${reps.join('/')}` : `${session.maxReps}`;

  return (
    <div className="flex items-center px-4 py-3 gap-2" dir="rtl">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-gray-800 truncate">
          {fmtLongDate(session.dateMs)}
        </p>
      </div>
      <div className="w-24 text-center" dir="ltr">
        <span className="text-xs font-bold text-gray-600 tabular-nums">{setsLabel}</span>
      </div>
      <div className="w-12 flex justify-center">
        {delta !== null ? <DeltaBadge delta={delta} /> : null}
      </div>
    </div>
  );
}

// ── DeltaBadge ────────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="text-[10px] font-black text-gray-400 bg-gray-100 rounded-lg px-2 py-0.5">
        =
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      className={[
        'text-[10px] font-black rounded-lg px-2 py-0.5 tabular-nums',
        positive ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50',
      ].join(' ')}
      dir="ltr"
    >
      {positive ? '+' : ''}
      {delta}
    </span>
  );
}

// ── Empty / error states ──────────────────────────────────────────────────────

function FirstSessionEmptyState({ exerciseName }: { exerciseName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2 px-4">
      <span className="text-4xl" role="img" aria-label="ניצחון">
        🎉
      </span>
      <p className="text-sm font-black text-gray-800">הצעד הראשון נרשם!</p>
      <p className="text-xs text-gray-400 max-w-[220px] leading-relaxed">
        הנתון הראשון שלך ב{exerciseName} נשמר. סיים עוד אימון כדי לראות את הגרף מתחיל לחיות.
      </p>
    </div>
  );
}

function EmptyRangeState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <TrendingUp className="w-10 h-10 text-gray-200" />
      <p className="text-sm font-black text-gray-500">אין נתונים בטווח הזמן הזה</p>
      <p className="text-xs text-gray-400">נסה טווח ארוך יותר</p>
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

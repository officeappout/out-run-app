'use client';

/**
 * DashboardModeWidgets
 *
 * Two 2x2 widget grids that render under "BLOCK 4" of the profile dashboard.
 * Variant is chosen by the parent based on `useDashboardMode()`:
 *   - StrengthWidgets  → DEFAULT / PERFORMANCE modes
 *   - RunningWidgets   → RUNNING / HYBRID modes
 *
 * All values come from already-loaded sources (Zustand stores or the
 * `workouts` array passed from the parent). NO new Firestore calls.
 */

import React, { useMemo } from 'react';
import { Footprints, Gauge, Activity, Route } from 'lucide-react';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { useDailyActivity } from '@/features/activity';
import { useProgramProgress } from '@/features/home/hooks/useProgramProgress';
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import CircularProgress from '@/components/CircularProgress';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

interface WidgetProps {
  Icon: React.ElementType;
  iconColor: string;
  label: string;
  value: string;
  /** When provided renders a thin progress bar under the value (0-100). */
  progressPct?: number;
  /** Subtitle line under the value (e.g. "מתוך 150 דק׳"). */
  sub?: string;
}

function WidgetCard({ Icon, iconColor, label, value, progressPct, sub }: WidgetProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-[11px] font-bold text-gray-500">{label}</span>
      </div>

      <span className="text-2xl font-black text-gray-900 leading-none tabular-nums">
        {value}
      </span>

      {sub && (
        <span className="text-[10px] text-gray-400 leading-tight">{sub}</span>
      )}

      {typeof progressPct === 'number' && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
          <div
            className="h-full rounded-full bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-black text-gray-800 mb-2.5 px-1">{children}</h3>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STRENGTH WIDGETS — DEFAULT / PERFORMANCE modes
// ─────────────────────────────────────────────────────────────────────────────

interface StrengthWidgetsProps {
  workouts: WorkoutHistoryEntry[];
}

const HEBREW_DOMAIN_LABEL: Record<string, string> = {
  push: 'דחיפה',
  pushing: 'דחיפה',
  pull: 'משיכה',
  pulling: 'משיכה',
  legs: 'רגליים',
  lower_body: 'רגליים',
  core: 'בטן',
  abs: 'בטן',
  upper_body: 'פלג עליון',
  full_body: 'כל הגוף',
};

const WEEKDAY_LABELS_SUN_FIRST = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export function StrengthWidgets({}: StrengthWidgetsProps) {
  const strength = useWeeklyVolumeStore((s) => s.strength);
  const activeMinutes = useWeeklyVolumeStore((s) => s.activeMinutes);
  const sessionLogs = useWeeklyVolumeStore((s) => s.sessionLogs);
  // Same program-level data ProgramsSection (Skills tab) already reads —
  // existing hook, existing source, no new fetch.
  const progressData = useProgramProgress();

  // Distinct domains the user trained this week (e.g. push / pull / legs).
  const domainList = useMemo(() => {
    const entries = Object.entries(strength.domainSetsCompleted ?? {})
      .filter(([, count]) => count > 0);
    return entries.map(([key]) => HEBREW_DOMAIN_LABEL[key.toLowerCase()] ?? key);
  }, [strength.domainSetsCompleted]);

  const minutesPct = activeMinutes.weeklyGoal > 0
    ? Math.round((activeMinutes.totalMinutes / activeMinutes.weeklyGoal) * 100)
    : 0;

  // Daily load strip (Sun..Sat) — client-side aggregation of this week's
  // already-loaded sessionLogs (same recovery exclusion the volume budget
  // above already applies). No new metric/fetch, just a different view of
  // data this store already holds.
  const dailyLoad = useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0];
    for (const log of sessionLogs) {
      if (log.isRecovery) continue;
      const day = new Date(log.completedAt).getDay();
      days[day] += log.setsCompleted;
    }
    return days;
  }, [sessionLogs]);
  const maxDailyLoad = Math.max(1, ...dailyLoad);

  const hasPR = !!progressData && !progressData.programNameLoading && progressData.currentLevel > 0;

  return (
    <div>
      <SectionLabel>השבוע שלך</SectionLabel>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        {/* Ring + 2 tiles — degrades gracefully at 0 (empty ring, "0" tiles
            with a friendly sub-label) instead of 4 separate broken-looking
            squares. */}
        <div className="flex items-center gap-4">
          <CircularProgress
            percentage={minutesPct}
            size={72}
            strokeWidth={7}
            colorClass="text-[#00ADEF]"
          >
            <div className="flex flex-col items-center">
              <span className="text-sm font-black text-gray-900 leading-none tabular-nums">
                {activeMinutes.totalMinutes}
              </span>
              <span className="text-[8px] text-gray-400 mt-0.5 whitespace-nowrap">
                מתוך {activeMinutes.weeklyGoal}&apos;
              </span>
            </div>
          </CircularProgress>

          <div className="flex-1 grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-xl p-2.5">
              <span className="text-lg font-black text-gray-900 leading-none tabular-nums block">
                {strength.totalSetsCompleted}
              </span>
              <span className="text-[10px] font-bold text-gray-500">סטים השבוע</span>
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5">
              <span className="text-lg font-black text-gray-900 leading-none tabular-nums block">
                {domainList.length}
              </span>
              <span className="text-[10px] font-bold text-gray-500 truncate block">
                {domainList.length > 0 ? domainList.slice(0, 2).join(' · ') : 'קבוצות שרירים'}
              </span>
            </div>
          </div>
        </div>

        {/* Weekly load strip */}
        <div className="mt-4">
          <p className="text-[10px] font-bold text-gray-400 mb-1.5">עומס יומי</p>
          <div className="flex items-end gap-1.5" style={{ height: 32 }}>
            {WEEKDAY_LABELS_SUN_FIRST.map((label, i) => (
              <div key={label} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
                <div
                  className="w-full rounded-sm bg-gradient-to-t from-[#00ADEF] to-[#5BC2F2]"
                  style={{
                    height: `${Math.max(10, (dailyLoad[i] / maxDailyLoad) * 100)}%`,
                    opacity: dailyLoad[i] > 0 ? 1 : 0.15,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-1">
            {WEEKDAY_LABELS_SUN_FIRST.map((label) => (
              <span key={label} className="flex-1 text-center text-[9px] text-gray-300 font-bold">
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Personal-record footer — reuses the same master-program data
            ProgramsSection already shows in the Skills tab. */}
        <div className="mt-3 pt-3 border-t border-gray-100 text-center">
          {hasPR ? (
            <p className="text-xs font-bold text-gray-600">
              🏅 שיא · {progressData!.programName} · רמה {progressData!.currentLevel}
            </p>
          ) : (
            <p className="text-xs font-medium text-gray-400">עוד לא נקבע שיא — תתחיל להתאמן 💪</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNNING WIDGETS — RUNNING / HYBRID modes
// ─────────────────────────────────────────────────────────────────────────────

interface RunningWidgetsProps {
  workouts: WorkoutHistoryEntry[];
}

const STEPS_GOAL_FALLBACK = DAILY_STEP_GOAL;

/** Format pace as M:SS — input is decimal minutes per km. */
function formatPace(minPerKm: number): string {
  if (!isFinite(minPerKm) || minPerKm <= 0) return '—';
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function RunningWidgets({ workouts }: RunningWidgetsProps) {
  const running = useWeeklyVolumeStore((s) => s.running);
  const { stepsToday, todayActivity } = useDailyActivity();

  // Average pace this week = totalDuration (min) / totalDistance (km)
  // — both come from useWeeklyVolumeStore so no new fetches are required.
  const avgPaceMinPerKm = running.totalDistance > 0
    ? running.totalDuration / running.totalDistance
    : 0;

  // Long run: longest single 'running' session in the (already-loaded)
  // workouts array. distance is stored in km on WorkoutHistoryEntry.
  const longRunKm = useMemo(() => {
    const runs = workouts.filter((w) => w.workoutType === 'running');
    if (runs.length === 0) return 0;
    return runs.reduce((mx, w) => (w.distance > mx ? w.distance : mx), 0);
  }, [workouts]);

  const stepsGoal = todayActivity?.stepsGoal && todayActivity.stepsGoal > 0
    ? todayActivity.stepsGoal
    : STEPS_GOAL_FALLBACK;

  const kmPct = running.weeklyTargetDistance > 0
    ? Math.round((running.totalDistance / running.weeklyTargetDistance) * 100)
    : 0;
  const stepsPct = Math.round((stepsToday / stepsGoal) * 100);

  return (
    <div>
      <SectionLabel>ריצה</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <WidgetCard
          Icon={Route}
          iconColor="text-[#00ADEF]"
          label='ק"מ השבוע'
          value={
            running.weeklyTargetDistance > 0
              ? `${running.totalDistance.toFixed(1)} / ${running.weeklyTargetDistance.toFixed(0)}`
              : `${running.totalDistance.toFixed(1)}`
          }
          sub='ק"מ'
          progressPct={kmPct}
        />

        <WidgetCard
          Icon={Gauge}
          iconColor="text-emerald-500"
          label="קצב ממוצע"
          value={formatPace(avgPaceMinPerKm)}
          sub='דק׳ לק"מ'
        />

        <WidgetCard
          Icon={Footprints}
          iconColor="text-amber-500"
          label="צעדים היום"
          value={stepsToday.toLocaleString()}
          sub={`מתוך ${stepsGoal.toLocaleString()}`}
          progressPct={stepsPct}
        />

        <WidgetCard
          Icon={Activity}
          iconColor="text-purple-500"
          label="ריצה ארוכה"
          value={longRunKm > 0 ? `${longRunKm.toFixed(1)}` : '—'}
          sub={longRunKm > 0 ? 'ק"מ' : 'אין נתונים עדיין'}
        />
      </div>
    </div>
  );
}

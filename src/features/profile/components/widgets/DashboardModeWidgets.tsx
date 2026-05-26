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
import { Dumbbell, Trophy, Clock, Layers, Footprints, Gauge, Activity, Route } from 'lucide-react';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { useDailyActivity } from '@/features/activity';
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

export function StrengthWidgets({ workouts }: StrengthWidgetsProps) {
  const strength = useWeeklyVolumeStore((s) => s.strength);
  const activeMinutes = useWeeklyVolumeStore((s) => s.activeMinutes);

  // Top PR proxy: the strength workout with the most setsCompleted in the
  // last 50 sessions. We deliberately do NOT fabricate per-exercise PRs
  // since `WorkoutHistoryEntry` doesn't expose them. Falls back to '—'.
  const topPR = useMemo(() => {
    const strengthWorkouts = workouts.filter((w) => w.workoutType === 'strength');
    if (strengthWorkouts.length === 0) return null;
    const best = strengthWorkouts.reduce((acc, w) => {
      const sets = w.setsCompleted ?? 0;
      return sets > acc ? sets : acc;
    }, 0);
    return best > 0 ? best : null;
  }, [workouts]);

  // Distinct domains the user trained this week (e.g. push / pull / legs).
  const domainList = useMemo(() => {
    const entries = Object.entries(strength.domainSetsCompleted ?? {})
      .filter(([, count]) => count > 0);
    return entries.map(([key]) => HEBREW_DOMAIN_LABEL[key.toLowerCase()] ?? key);
  }, [strength.domainSetsCompleted]);

  const volumePct = strength.weeklyBudget > 0
    ? Math.round((strength.totalSetsCompleted / strength.weeklyBudget) * 100)
    : 0;
  const minutesPct = activeMinutes.weeklyGoal > 0
    ? Math.round((activeMinutes.totalMinutes / activeMinutes.weeklyGoal) * 100)
    : 0;

  return (
    <div>
      <SectionLabel>כוח</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <WidgetCard
          Icon={Dumbbell}
          iconColor="text-purple-500"
          label="נפח שבועי"
          value={
            strength.weeklyBudget > 0
              ? `${strength.totalSetsCompleted} / ${strength.weeklyBudget}`
              : `${strength.totalSetsCompleted}`
          }
          sub="סטים השבוע"
          progressPct={volumePct}
        />

        <WidgetCard
          Icon={Trophy}
          iconColor="text-amber-500"
          label="שיא אישי"
          value={topPR != null ? `${topPR}` : '—'}
          sub={topPR != null ? 'סטים בסשן אחד' : 'אין נתונים עדיין'}
        />

        <WidgetCard
          Icon={Clock}
          iconColor="text-emerald-500"
          label="זמן פעיל"
          value={`${activeMinutes.totalMinutes}`}
          sub={`מתוך ${activeMinutes.weeklyGoal} דק׳`}
          progressPct={minutesPct}
        />

        <WidgetCard
          Icon={Layers}
          iconColor="text-[#00ADEF]"
          label="קבוצות שרירים"
          value={`${domainList.length}`}
          sub={
            domainList.length > 0
              ? domainList.slice(0, 3).join(' · ')
              : 'התחל אימון'
          }
        />
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

const STEPS_GOAL_FALLBACK = 10_000;

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

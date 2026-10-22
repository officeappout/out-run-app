'use client';

/**
 * Planner v2 (enable_week_builder_v1) — the month strip's data for a few months, read once
 * per open (and on refreshKey):
 *   - the months' userSchedule docs (one batched `in` read, 30 dates a chunk),
 *   - the finished workouts from the first day through today (≤ 200, the Progress tab's
 *     own service — combined workouts come as their parts),
 *   - the dailyActivity docs from the first day through today (≤ 100: minutes + steps).
 * Planned sessions are layered like every other planner surface (advisor materializePlanned
 * + detectMissed). Read-only; nothing is hydrated or written.
 */
import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { DAILY_STEP_GOAL } from '@/features/activity/config/health-goals.config';
import { getScheduleEntriesForDates } from '@/features/user/scheduling/services/userSchedule.service';
import { getDailyActivityRange, getWorkoutsWindow } from '@/features/progression-hub/v2/services/progress-data.service';
import type { ProgressDay, ProgressWorkout } from '@/features/progression-hub/v2/utils/progress-model';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import { detectMissed, materializePlanned } from '@/features/schedule/advisor';
import { localDateKey } from '@/features/schedule/advisor/adapters/client';
import type { AdvisorProfile, AdvisorScheduleDay, AdvisorWorkout } from '@/features/schedule/advisor/types';
import { buildMonthSections, dateKeyOf, type PlannedLike, type PlannerMonthSection } from '../lib/monthCells';

export interface PlannerMonthsData {
  status: 'idle' | 'loading' | 'ready' | 'error';
  sections: PlannerMonthSection[];
  workoutsByDate: Record<string, ProgressWorkout[]>;
  daysByDate: Record<string, ProgressDay>;
  stepGoal: number;
  todayKey: string;
}

const MAX_WORKOUTS = 200;
const MAX_DAYS = 100;

export function usePlannerMonths(
  userId: string | null | undefined,
  months: ReadonlyArray<{ year: number; month: number }>,
  refreshKey = 0,
  enabled = true,
): PlannerMonthsData {
  const profile = useUserStore((s) => s.profile);
  const runsByType = useHomeV2();
  const stepGoal = useActivityStore((s) => s.resolvedStepGoal ?? (s.today?.stepsGoal || null)) ?? DAILY_STEP_GOAL;
  const todayKey = localDateKey(new Date());
  const monthsKey = months.map((m) => `${m.year}-${m.month}`).join(',');
  const keys = useMemo(() => {
    const out: string[] = [];
    for (const { year, month } of months) {
      const n = new Date(year, month + 1, 0).getDate();
      for (let d = 1; d <= n; d++) out.push(dateKeyOf(year, month, d));
    }
    return out;
    // monthsKey carries the months' identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsKey]);

  const [state, setState] = useState<PlannerMonthsData>({ status: 'idle', sections: [], workoutsByDate: {}, daysByDate: {}, stepGoal, todayKey });

  useEffect(() => {
    if (!enabled || !userId || !profile || keys.length === 0) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: s.sections.length ? s.status : 'loading' }));
    const first = keys[0];
    const pastEnd = keys[keys.length - 1] < todayKey ? keys[keys.length - 1] : todayKey;
    const hasPast = first <= todayKey;
    const start = new Date(`${first}T00:00:00`);
    const end = new Date(`${pastEnd}T00:00:00`);
    end.setDate(end.getDate() + 1);
    Promise.all([
      getScheduleEntriesForDates(userId, keys),
      hasPast ? getWorkoutsWindow(userId, start, end, MAX_WORKOUTS) : Promise.resolve([] as ProgressWorkout[]),
      hasPast ? getDailyActivityRange(userId, first, pastEnd, MAX_DAYS) : Promise.resolve([] as ProgressDay[]),
    ])
      .then(([entries, workouts, days]) => {
        if (cancelled) return;
        if (!entries) {
          setState((s) => ({ ...s, status: 'error' }));
          return;
        }
        const workoutsByDate: Record<string, ProgressWorkout[]> = {};
        for (const w of workouts) (workoutsByDate[localDateKey(w.date)] ??= []).push(w);
        const daysByDate: Record<string, ProgressDay> = {};
        for (const d of days) daysByDate[d.date] = d;
        const scheduleDays: AdvisorScheduleDay[] = Object.entries(entries).map(([date, list]) => ({ date, entries: [...list] }));
        const advisorWorkouts: AdvisorWorkout[] = workouts.map((w) => ({ date: localDateKey(w.date), kind: w.kind, minutes: w.minutes }));
        const planned: PlannedLike[] = detectMissed(
          materializePlanned(profile as unknown as AdvisorProfile, keys, scheduleDays, resolveToSlug, { runsByType }),
          advisorWorkouts,
          todayKey,
        ).map((p) => ({ date: p.date, kind: p.kind, status: p.status, runCategory: p.runDay?.category ?? null }));
        const sections = buildMonthSections({ months, todayKey, planned, workoutsByDate, daysByDate, stepGoal });
        setState({ status: 'ready', sections, workoutsByDate, daysByDate, stepGoal, todayKey });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
    // months ride on `keys`; profile identity changes on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId, profile, keys, refreshKey, runsByType, todayKey, stepGoal]);

  return state;
}

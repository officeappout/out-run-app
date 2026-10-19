'use client';

/**
 * Today's planned run, materialized — for the reverse entry (board M-6j:
 * a route opened in Discover asks "does today's run fit here?").
 *
 * Today's entry: resolveRunningDayState (the home card's rule), pending only.
 * The workout: the same three point reads + materializeWorkout (+ calm
 * return) the planned-run map layer does, memoized per session by
 * workout · week · pace profile — bounded, read once.
 * null while loading, on a rest day, or on any failure.
 */

import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveRunningDayState, type RunningScheduleEntry } from '@/lib/running-day-resolution';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import type { PaceProfile } from '@/features/workout-engine/core/types/running.types';
import type RunWorkout from '../../types/run-workout.type';

export interface TodayPlannedRun {
  workout: RunWorkout;
  workoutId: string;
  week: number;
  day: number;
  templateCategory: string | null;
}

const memo = new Map<string, Promise<{ workout: RunWorkout; templateCategory: string | null } | null>>();

async function loadToday(workoutId: string, week: number, paceProfile: PaceProfile, programId: string | null) {
  const [{ getRunWorkoutTemplate, getPaceMapConfig, getRunProgramTemplate }, { materializeWorkout, computeZones }, calm, { readLiveFlag }] =
    await Promise.all([
      import('@/features/workout-engine/core/services/running-admin.service'),
      import('@/features/workout-engine/core/services/running-engine.service'),
      import('@/lib/calm-return'),
      import('@/lib/feature-flag-live'),
    ]);
  const [template, paceMapConfig, program] = await Promise.all([
    getRunWorkoutTemplate(workoutId.replace(/_w\d+$/, '')),
    getPaceMapConfig(),
    programId ? getRunProgramTemplate(programId) : Promise.resolve(null),
  ]);
  if (!template) return null;
  let workout = materializeWorkout(template, week, program?.progressionRules ?? [], paceProfile, paceMapConfig);
  // Calm return: the same lighter run the home card / map layer show (flag off → unchanged).
  const profile = useUserStore.getState().profile;
  if (readLiveFlag('enableCalmReturnV1') && profile) {
    const now = new Date();
    const c = calm.resolveCalmReturn({ daysAway: calm.getDaysAway(profile, now), episode: profile.calmReturn, now });
    if (c.isLightened) {
      workout = calm.calmRunWorkout(workout, c.load, {
        easyPace: paceProfile.basePace > 0
          ? (({ minPace, maxPace }) => ({ min: minPace, max: maxPace }))(computeZones(paceProfile.basePace, paceProfile.profileType, paceMapConfig).easy)
          : null,
        easyLabel: calm.calmCopy(null).easyRunLabel,
      });
    }
  }
  return { workout, templateCategory: template.category ?? null };
}

export function useTodayPlannedRun(enabled: boolean): TodayPlannedRun | null {
  const running = useUserStore((s) => s.profile?.running);
  const entry = useMemo(() => {
    if (!enabled || !running?.activeProgram?.schedule?.length) return null;
    const week = resolveRunningCurrentWeek(running.activeProgram.startDate, running.activeProgram.currentWeek) ?? 1;
    const state = resolveRunningDayState(
      running.scheduleDays ?? [],
      running.activeProgram.schedule as unknown as RunningScheduleEntry[],
      week,
      new Date(),
      running.activeProgram.startDate as Date | string | number | undefined,
    );
    const e = state.isRunDay ? state.todayEntry : undefined;
    if (!e?.workoutId || (e.status && e.status !== 'pending')) return null;
    return { workoutId: e.workoutId, week: e.week, day: e.day };
  }, [enabled, running]);

  const paceProfile = running?.paceProfile ?? null;
  const programId = running?.activeProgram?.programId ?? null;
  const [run, setRun] = useState<TodayPlannedRun | null>(null);

  useEffect(() => {
    if (!entry || !paceProfile) { setRun(null); return; }
    const key = `${entry.workoutId}|${entry.week}|${paceProfile.basePace}|${paceProfile.profileType}|${programId ?? ''}`;
    let p = memo.get(key);
    if (!p) {
      p = loadToday(entry.workoutId, entry.week, paceProfile, programId).catch(() => {
        memo.delete(key);
        return null;
      });
      memo.set(key, p);
    }
    let alive = true;
    p.then((res) => {
      if (alive) setRun(res ? { ...entry, ...res } : null);
    });
    return () => { alive = false; };
  }, [entry, paceProfile, programId]);

  return run;
}

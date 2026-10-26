'use client';

/**
 * What the place engine needs to know about the user (PlaceUserContext),
 * from what the app already holds: today's plan (usePlannedDay — one read of
 * today's userSchedule doc), today's planned run (useTodayPlannedRun —
 * memoized per session), the persona, the weekly strength budget and the
 * easy pace. `enabled` false → nothing is read.
 */

import { useMemo } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { usePlannedDay } from '@/features/home/hooks/usePlannedDay';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';
import { readStoredWalkingGoal } from '@/features/schedule/walking/walkingGoal';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { useTodayPlannedRun, type TodayPlannedRun } from '@/features/workout-engine/players/running/components/overview-v2/useTodayPlannedRun';
import { useRunPaceContext } from '@/features/workout-engine/players/running/components/overview-v2/useRunOverviewModel';
import { buildWorkoutRouteNeeds, isRunAfterDark } from '@/features/workout-engine/players/running/lib/route-fit';
import type { PlacePersona, PlaceUserContext } from '@/features/workout-engine/place-fit';

const PERSONA: Record<string, PlacePersona> = { health: 'walk', strength: 'strength', run: 'run', hybrid: 'hybrid' };

export interface PlaceUserContextResult {
  ctx: PlaceUserContext | null;
  /** Today's materialized run (to start it on a route). */
  todayRun: TodayPlannedRun | null;
}

export function usePlaceUserContext(enabled: boolean, origin: { lat: number; lng: number } | null): PlaceUserContextResult {
  const profile = useUserStore((s) => s.profile);
  const weeklyBudget = useWeeklyVolumeStore((s) => s.strength.weeklyBudget);
  const totalSetsCompleted = useWeeklyVolumeStore((s) => s.strength.totalSetsCompleted);
  const hasStrengthPlan = (profile?.progression?.activePrograms?.length ?? 0) > 0;
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const { plan, loading } = usePlannedDay(profile, enabled ? todayISO : null, enabled, hasStrengthPlan);
  const todayRun = useTodayPlannedRun(enabled);
  const pace = useRunPaceContext();
  const lat = origin?.lat;
  const lng = origin?.lng;

  const ctx = useMemo<PlaceUserContext | null>(() => {
    if (!enabled || !profile || loading) return null;
    const items = plan?.items ?? [];
    const strengthItem = items.find((i) => i.kind === 'strength' && !i.completed);
    const walkItem = items.find((i) => i.kind === 'walk' && !i.completed);
    let run: PlaceUserContext['today']['run'] = null;
    if (todayRun) {
      try {
        const needs = buildWorkoutRouteNeeds(
          { blocks: todayRun.workout.blocks, category: todayRun.workout.category, templateCategory: todayRun.templateCategory },
          pace.ctx,
          { startAt: new Date(), origin: lat != null && lng != null ? { lat, lng } : null },
        );
        run = { workoutId: todayRun.workoutId, week: todayRun.week, day: todayRun.day, title: todayRun.workout.title ?? null, needs };
      } catch {
        run = null;
      }
    }
    const easy = pace.ctx.zones?.easy;
    const easyPace = easy ? Math.round((easy.minPace + easy.maxPace) / 2) : pace.ctx.basePace > 0 ? Math.round(pace.ctx.basePace * 1.15) : null;
    const track = (profile.lifestyle as { primaryTrack?: string } | undefined)?.primaryTrack;
    return {
      persona: (track && PERSONA[track]) || null,
      today: {
        strength: strengthItem ? { title: strengthItem.title || null } : null,
        run,
        walk: walkItem ? { title: walkItem.title || null, minutes: null } : null,
      },
      hasStrengthPlan,
      hasRunPlan: !!profile.running?.activeProgram?.schedule?.length,
      hasWalkPlan: !!walkItem || !!readStoredWalkingGoal((profile.lifestyle as { walkingGoal?: unknown } | undefined)?.walkingGoal),
      weeklyStrength: { weeklyBudget, totalSetsCompleted },
      easyPaceSecPerKm: easyPace,
      afterDark: run ? run.needs.afterDark : lat != null && lng != null && isRunAfterDark(new Date(), 30, { lat, lng }),
    };
  }, [enabled, profile, loading, plan, todayRun, pace.ctx, lat, lng, hasStrengthPlan, weeklyBudget, totalSetsCompleted]);

  return { ctx, todayRun };
}

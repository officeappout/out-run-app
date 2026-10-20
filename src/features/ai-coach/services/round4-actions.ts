'use client';

/**
 * Kelly round 4 — what a tap does (flag ai_coach_round4): open an aerobic card on the map, open a
 * park, replay a tour, start the running questionnaire. Each target is rebuilt HERE from validated
 * fields (never a stored link), through the app's existing flows:
 *
 *   walk / easy run   lib/planned-run.ts stash → /map?openRun=walking|running (the free run /
 *                     walk drawer, pre-filled with the goal, route extras and the strength split)
 *   program run       today's entry of the user's running program (the home card's rule:
 *                     resolveRunningDayState; by slot type under enable_home_v2, like home)
 *                     → plannedRunMapUrl (the planned-run overview on
 *                     the map with "הצע לי מסלול"); no run today → the free run drawer
 *   park              /map?openPark=<id>
 *   tour              tour-replay request → the tour's screen
 *   questionnaire     resolveOnboardingEntryHref(profile, 'RUNNING')
 */
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { stashPendingPlannedRun, type PlannedRunSettings } from '@/lib/planned-run';
import type { AerobicCardView } from '@/lib/ai/coach/round4/types';
import { STRENGTH_STOPS_AEROBIC_SHARE } from '@/lib/ai/coach/round4/aerobic-plan';
import type { CoachActionSpec } from '@/lib/ai/coach/action-chips';
import { requestTourReplay } from '@/features/user/onboarding/services/tour-replay';

type Push = (href: string) => void;

export function plannedRunFromCard(card: AerobicCardView): PlannedRunSettings {
  return {
    goal: card.goal,
    route: { includeStrength: card.strengthStops, surface: 'road' },
    ...(card.strengthStops ? { hybrid: { aerobicShare: STRENGTH_STOPS_AEROBIC_SHARE } } : {}),
  };
}

export function freeAerobicHref(activity: 'running' | 'walking'): string {
  return `/map?openRun=${activity}`;
}

export interface ProgramRunOptions {
  /** enable_home_v2 for this user (runsByTypeFor) — today's run by slot type, the run home shows. */
  runsByType?: boolean;
}

export async function todayProgramRunHref(profile: UserFullProfile | null, opts: ProgramRunOptions = {}): Promise<string | null> {
  const running = profile?.running;
  const program = running?.activeProgram;
  if (!program?.schedule?.length) return null;
  try {
    const [{ resolveRunningDayState }, { resolveRunningCurrentWeek }, { plannedRunMapUrl }, { runPlacementOf }] = await Promise.all([
      import('@/lib/running-day-resolution'),
      import('@/features/workout-engine/shared/utils/running-current-week.utils'),
      import('@/features/workout-engine/players/running/utils/run-overview/run-overview-url'),
      import('@/features/schedule/utils/runWeekByType'),
    ]);
    const week = resolveRunningCurrentWeek(program.startDate, program.currentWeek) ?? 1;
    const state = resolveRunningDayState(
      running?.scheduleDays ?? [],
      program.schedule as unknown as Parameters<typeof resolveRunningDayState>[1],
      week,
      new Date(),
      program.startDate as Date | string | number | undefined,
      opts.runsByType ? { byType: true, ...runPlacementOf(running) } : undefined,
    );
    const e = state.isRunDay ? state.todayEntry : undefined;
    if (!e?.workoutId || (e.status && e.status !== 'pending')) return null;
    return plannedRunMapUrl({ workoutId: e.workoutId, week: e.week, day: e.day, suggest: true });
  } catch {
    return null;
  }
}

export async function openAerobicCard(card: AerobicCardView, profile: UserFullProfile | null, push: Push, opts: ProgramRunOptions = {}): Promise<void> {
  if (card.kind === 'program_run') {
    const href = await todayProgramRunHref(profile, opts);
    if (href) return push(href);
  }
  const activity = card.kind === 'walk' ? 'walking' : 'running';
  stashPendingPlannedRun(activity, plannedRunFromCard(card));
  push(freeAerobicHref(activity));
}

export function parkHref(parkId: string): string {
  return `/map?openPark=${encodeURIComponent(parkId)}`;
}

/** A round 4 chip that isn't a plain link / message. true = handled. */
export async function runRound4Chip(spec: CoachActionSpec, profile: UserFullProfile | null, push: Push): Promise<boolean> {
  if (spec.tour) {
    push(requestTourReplay(spec.tour.id, spec.tour.step));
    return true;
  }
  if (spec.aerobicMap) {
    push(freeAerobicHref(spec.aerobicMap));
    return true;
  }
  if (spec.onboarding === 'RUNNING') {
    const { resolveOnboardingEntryHref } = await import('@/features/user/onboarding/utils/onboarding-entry');
    push(resolveOnboardingEntryHref(profile, 'RUNNING'));
    return true;
  }
  return false;
}

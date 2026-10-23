/**
 * Home progress slot (enable_home_progress_slot_v1, boards PG-1) — pure decisions.
 *
 *  - which plan slide sits next to the strength program card: the running plan
 *    (running.activeProgram with a schedule), else the walking plan
 *    (lifestyle.walkingGoal, written by the walking signup), else none — then the
 *    carousel shows the strength card alone, never an empty slide;
 *  - the plan ring's percent; the walking ring's percent;
 *  - where each card opens (one place, so the progress hub's routes change here).
 */
import { resolveProgressionMapDestination } from '@/lib/progression-map-config';
import {
  runningPlanProgress,
  type RunningPlanProgress,
} from '@/features/progression-hub/v2/utils/running-plan-progress';
import { readStoredWalkingGoal } from '@/features/schedule/walking/walkingGoal';

/** The progress hub (bottom-nav "התקדמות"). */
export const PROGRESS_HREF = '/progress';
/** The progress hub's deeper pages (enable_progress_hub_v2). */
export const PROGRESS_RUN_HREF = '/progress/run';
export const PROGRESS_STRENGTH_HREF = '/progress/strength';

export type PlanSlide =
  | { kind: 'run'; plan: RunningPlanProgress; pct: number }
  | { kind: 'walk'; targetWeeklyMinutes: number }
  | null;

interface ProfileLike {
  running?: unknown;
  lifestyle?: { walkingGoal?: unknown } | null;
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/** Completed sessions out of the whole plan, 0–100. */
export function planPercent(plan: Pick<RunningPlanProgress, 'done' | 'total'>): number {
  return plan.total > 0 ? clampPct((plan.done / plan.total) * 100) : 0;
}

/** This week's walking minutes against the plan's weekly target, 0–100. */
export function walkPercent(minutes: number, targetWeeklyMinutes: number): number {
  return targetWeeklyMinutes > 0 ? clampPct((minutes / targetWeeklyMinutes) * 100) : 0;
}

export function resolvePlanSlide(profile: ProfileLike | null | undefined): PlanSlide {
  if (!profile) return null;
  const plan = runningPlanProgress(profile.running as Parameters<typeof runningPlanProgress>[0]);
  if (plan) return { kind: 'run', plan, pct: planPercent(plan) };
  const walk = readStoredWalkingGoal(profile.lifestyle?.walkingGoal);
  if (walk) return { kind: 'walk', targetWeeklyMinutes: walk.targetWeeklyMinutes };
  return null;
}

/** Strength card → its progression map when the program has one, else the hub's strength page. */
export function strengthCardHref(programId: string | null | undefined): string {
  return (programId && resolveProgressionMapDestination(programId)) || PROGRESS_STRENGTH_HREF;
}

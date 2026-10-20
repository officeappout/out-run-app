/**
 * The stored walking goal (enable_home_v2, owner 20.10.2026) — pure.
 *
 * ONE optional, additive profile field, `lifestyle.walkingGoal = { goal,
 * targetWeeklyMinutes }`, written only by the flag-gated walking signup
 * (walkSave.service). The weekly top-up (walkTopUp.ts) grows the walks toward
 * that target — inside the WHO band (150–300′) — instead of stopping at 150′.
 * Missing / junk → null, and the top-up keeps its 150′ ceiling.
 */
import { WALK_PLAN_CONFIG, type WalkPlanConfig } from './walkPlan.config';
import type { WalkGoal, WalkPlan } from './walkPlan.types';

export interface StoredWalkingGoal {
  goal: WalkGoal;
  targetWeeklyMinutes: number;
}

const GOALS: readonly WalkGoal[] = ['weight_loss', 'health', 'steps', 'belly'];

/** What the signup stores: the picked goal + the plan's weekly target (WHO band). */
export function walkingGoalToStore(goal: WalkGoal, plan: Pick<WalkPlan, 'targetWeeklyMinutes'>, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): StoredWalkingGoal {
  return { goal, targetWeeklyMinutes: clampToWho(plan.targetWeeklyMinutes, cfg) };
}

/** profile.lifestyle.walkingGoal → a valid value, or null (missing / junk). */
export function readStoredWalkingGoal(raw: unknown): StoredWalkingGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const { goal, targetWeeklyMinutes } = raw as { goal?: unknown; targetWeeklyMinutes?: unknown };
  if (typeof goal !== 'string' || !(GOALS as readonly string[]).includes(goal)) return null;
  if (typeof targetWeeklyMinutes !== 'number' || !Number.isFinite(targetWeeklyMinutes) || targetWeeklyMinutes <= 0) return null;
  return { goal: goal as WalkGoal, targetWeeklyMinutes };
}

/**
 * The weekly-minutes ceiling the top-up grows toward: the stored target clamped to
 * the WHO band (150–300′); no target → the WHO minimum (150′, today's behaviour).
 */
export function topUpCeilingMinutes(target: number | null | undefined, cfg: WalkPlanConfig = WALK_PLAN_CONFIG): number {
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return cfg.who.minWeeklyMinutes;
  return clampToWho(target, cfg);
}

function clampToWho(n: number, cfg: WalkPlanConfig): number {
  return Math.max(cfg.who.minWeeklyMinutes, Math.min(cfg.who.maxWeeklyMinutes, Math.round(n / 5) * 5));
}

/**
 * Budget light mode for the map's hybrid sessions (enable_budget_light_mode) — pure.
 *
 *   route stops / smart "הליכה + כוח" — with the flag ON a spent strength budget no longer
 *     turns the strength stops into a core tabata (applySpentBudgetCoreDefault): the stops
 *     stay strength, every bolt's stations are trimmed to the light set cap, and the easy
 *     bolt is pre-selected. Flag OFF → exactly applySpentBudgetCoreDefault, as before.
 *   full park — goes through generateHomeWorkoutTrio, which applies the same policy
 *     (budget-light/trio-gate.ts); the caller only passes the strength snapshot.
 */

import { applySpentBudgetCoreDefault, type WeeklyStrengthBudgetState } from './weekly-budget-gate';
import {
  NORMAL_DECISION, resolveBudgetLightMode, type BudgetLightDecision, type StrengthBudgetSnapshot,
} from '../budget-light/policy';
import { capMainSets, mainWorkSets } from '../budget-light/cap-sets';
import type { HybridPlan } from './compose-hybrid-session.service';

export type SpentStopsReason = 'not_spent' | 'core_not_runnable' | 'defaulted_to_core' | 'light_strength';

export function planSpentBudgetStops<S extends { activityType?: string }>(args: {
  enabled: boolean;
  stops: S[];
  strength: WeeklyStrengthBudgetState | null | undefined;
  snapshot: StrengthBudgetSnapshot | null | undefined;
  userProgramLevels: ReadonlyMap<string, unknown> | null | undefined;
}): { stops: S[]; reason: SpentStopsReason; decision: BudgetLightDecision } {
  if (!args.enabled) {
    const legacy = applySpentBudgetCoreDefault(args.stops, args.strength, args.userProgramLevels);
    return { ...legacy, decision: NORMAL_DECISION };
  }
  const decision = resolveBudgetLightMode({ enabled: true, entry: 'recommended', snapshot: args.snapshot });
  return { stops: args.stops, reason: decision.mode === 'light' ? 'light_strength' : 'not_spent', decision };
}

/**
 * Trim a hybrid plan's strength stations so the whole session stays under `setsCap` main sets
 * (shared evenly between the stations, never below 1 per exercise). Station time scales with
 * the sets removed. Returns the same plan when nothing changes.
 */
export function capHybridPlanSets(plan: HybridPlan, setsCap: number | null): HybridPlan {
  if (!(setsCap && setsCap > 0)) return plan;
  const stations = plan.segments.filter((g) => g.kind === 'strength' && g.content?.exercises?.length);
  if (stations.length === 0) return plan;
  const total = stations.reduce((sum, g) => sum + mainWorkSets(g.content!.exercises), 0);
  if (total <= setsCap) return plan;
  const perStation = Math.max(1, Math.ceil(setsCap / stations.length));

  let strengthSecDelta = 0;
  const segments = plan.segments.map((g) => {
    if (g.kind !== 'strength' || !g.content?.exercises?.length) return g;
    const before = mainWorkSets(g.content.exercises);
    if (before <= perStation) return g;
    const exercises = capMainSets(g.content.exercises, perStation);
    const after = mainWorkSets(exercises);
    if (after === before) return g;
    const ratio = after / before;
    const oldSec = g.content.estimatedDurationSec;
    const estimatedDurationSec = Math.round(oldSec * ratio);
    strengthSecDelta += estimatedDurationSec - oldSec;
    return {
      ...g,
      content: {
        ...g.content,
        exercises,
        estimatedDurationSec,
        totalPlannedSets: Math.max(0, g.content.totalPlannedSets - (before - after)),
      },
      durationSec: estimatedDurationSec,
      estCalories: Math.round(g.estCalories * ratio),
    };
  });
  if (strengthSecDelta === 0) return plan;
  const calDelta = segments.reduce((s, g, i) => s + (g.estCalories - plan.segments[i].estCalories), 0);
  return {
    ...plan,
    segments,
    totals: {
      ...plan.totals,
      strengthMin: Math.max(0, Math.round(plan.totals.strengthMin + strengthSecDelta / 60)),
      estCalories: Math.max(0, plan.totals.estCalories + calDelta),
    },
    meta: { ...plan.meta, log: [...plan.meta.log, `budget_light: stations capped to ${perStation} sets each (cap ${setsCap})`] },
  };
}

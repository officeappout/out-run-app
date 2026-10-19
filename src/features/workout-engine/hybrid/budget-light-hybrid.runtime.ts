/**
 * Budget light mode for hybrid sessions — the runtime half (live flag + the device's weekly
 * volume store). Loaded lazily by start-hybrid-session.ts; the decisions are pure
 * (budget-light-hybrid.ts, budget-light/).
 */

import { getCurrentWeekStart, useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { isBudgetLightModeEnabled } from '../budget-light/flag';
import { snapshotFromVolumeStore, trainingDaysOf } from '../budget-light/snapshot';
import { budgetLightText, copyGenderOf } from '../budget-light/copy';
import type { BudgetLightDecision, StrengthBudgetSnapshot } from '../budget-light/policy';

export { planSpentBudgetStops, capHybridPlanSets } from './budget-light-hybrid';

type ProfileLite = Parameters<typeof trainingDaysOf>[0] & Parameters<typeof copyGenderOf>[0];

export function readHybridBudgetLight(profile: unknown): { enabled: boolean; snapshot: StrengthBudgetSnapshot | null } {
  const enabled = isBudgetLightModeEnabled();
  if (!enabled) return { enabled, snapshot: null };
  const state = useWeeklyVolumeStore.getState();
  // Last week's totals are not this week's budget → unknown (same guard as useHybridSituation).
  if (state.weekStartDate !== getCurrentWeekStart()) return { enabled, snapshot: null };
  return { enabled, snapshot: snapshotFromVolumeStore(state, new Date(), trainingDaysOf(profile as ProfileLite)) };
}

export function budgetLightNoteFor(decision: BudgetLightDecision, profile: unknown): string | undefined {
  if (decision.mode !== 'light' || !decision.reasonKey) return undefined;
  return budgetLightText(decision.reasonKey, 'description', copyGenderOf(profile as ProfileLite));
}

/**
 * Strength weekly-budget divisor (schedule advisor phase A, bug #9).
 *
 * The strength generator spreads a weekly set budget over "schedule days"
 * (home-workout.service.ts: `ceil(weekly / scheduleDays)`; SplitDecisionService's split
 * matrix row). Both read `lifestyle.scheduleDays.length` — a strength∪running union (the
 * running bridge folds its days in, parking-lot "lifestyle.scheduleDays מצטבר") with two
 * different empty-defaults (3 in home-workout, 2 in SplitDecision). A hybrid 3+3 user's
 * strength budget was therefore spread over 6 days: each strength day got half its volume.
 *
 * With SCHEDULE_ADVISOR_BUDGET_V1 on, the divisor is the STRENGTH day count — the same
 * count the advisor / weaver use (countStrengthTemplateDays through the one strength
 * vocabulary). No strength day in the template → the legacy value, unchanged.
 * Off → the legacy value, byte for byte.
 */
import { SCHEDULE_ADVISOR_BUDGET_V1 } from '@/config/feature-flags';
import { countStrengthTemplateDays, type ResolveSlug } from '../engine/strengthVocabulary';

export interface BudgetDivisorProfile {
  lifestyle?: {
    scheduleDays?: string[] | null;
    recurringTemplate?: Partial<Record<string, string[] | undefined>> | null;
  } | null;
}

/** localStorage['OUT_SCHEDULE_ADVISOR_BUDGET'] (one device) / env OUT_SCHEDULE_ADVISOR_BUDGET_V1 (node bench) override the constant. */
export function isScheduleAdvisorBudgetEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('OUT_SCHEDULE_ADVISOR_BUDGET');
      if (ls === '0' || ls === 'false') return false;
      if (ls === '1' || ls === 'true') return true;
    } catch {
      /* private mode — ignore */
    }
  } else if (typeof process !== 'undefined') {
    const env = process.env?.OUT_SCHEDULE_ADVISOR_BUDGET_V1;
    if (env === '1' || env === 'true') return true;
    if (env === '0' || env === 'false') return false;
  }
  return SCHEDULE_ADVISOR_BUDGET_V1;
}

/**
 * @param legacyEmptyDefault what the call site used when scheduleDays is empty (3 or 2).
 * @param enabled defaults to isScheduleAdvisorBudgetEnabled(); tests pass it explicitly.
 */
export function resolveStrengthBudgetDays(
  profile: BudgetDivisorProfile | null | undefined,
  legacyEmptyDefault: number,
  opts: { resolveSlug?: ResolveSlug; enabled?: boolean } = {},
): number {
  const legacy = (profile?.lifestyle?.scheduleDays?.length ?? 0) || legacyEmptyDefault;
  const enabled = opts.enabled ?? isScheduleAdvisorBudgetEnabled();
  if (!enabled) return legacy;
  const strengthDays = countStrengthTemplateDays(profile?.lifestyle?.recurringTemplate ?? undefined, opts.resolveSlug);
  return strengthDays && strengthDays > 0 ? strengthDays : legacy;
}

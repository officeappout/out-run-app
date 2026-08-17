/**
 * build-home-user-context — the home surface's UserContext builder, mirroring
 * build-map-user-context.ts (§11.5). Built for C3 (step-deficit rest-day walking card,
 * 15.08.2026) — the first home-surface caller of the rec-engine contract.
 *
 * Same honesty rule as the map builder: populates what's genuinely available on the home
 * screen today; leaves the rest as the documented "PENDING <gate>" defaults from
 * user-context.types.ts rather than fabricating values nothing here actually knows:
 * - `domainLevels: {}`, `weeklyPerformance` default, `venue`/`transitState`/
 *   `activitySignal`: null — identical reasoning to buildMapUserContext, not re-derived here.
 * - `recoveryState.isDetrainingLocked: false` — same reasoning already documented in
 *   buildMapUserContext.ts: real detection lives in periodization.service.ts, not
 *   trivially available from a bare profile object; defaults to "not locked" (neutral,
 *   matches recoveryMatch's no-op-when-false). `daysInactive` IS wired for real below
 *   (17.08.2026) — `calculateDaysInactive` is pure and already canonical elsewhere in the
 *   engine (WorkoutGenerator.ts/workout-budgeting.utils.ts's INACTIVITY_THRESHOLD_DAYS), so
 *   there was no reason to leave it stubbed the way isDetrainingLocked still is.
 * - `todayGoal` (17.08.2026, David-approved — plan §ה.2 flags the rest/training threshold
 *   itself as still product-undecided): sync-only, `isTodayTrainingDay` alone — the exact
 *   same schedule-derived signal `useDailyStrengthTarget.ts`'s ring already uses for its own
 *   rest-day closure, and the engine's own Planning-layer concept (`isScheduledRestDay`,
 *   Workout_Engine_Truth.md LAW 26). Deliberately does NOT resolve today's actual completion
 *   state (e.g. "already hit target, so it's active_recovery now") — that would require an
 *   async resolveActiveProgramBudget call inside what is currently a synchronous builder
 *   that must stay in sync with buildMapUserContext's shape (see IMPORTANT note below); a
 *   real product/architecture decision, not something to fold in quietly here.
 *   TODO(todayGoal): missing run/walk signal on the home surface — a scheduled RUNNING day
 *   should resolve to `'run'`, not the hardcoded `'strength'` below. No signal for this
 *   exists at this call site yet (same gap this file already flagged before 17.08.2026 for
 *   the always-null case). Not a blocker for this step; IS a blocker before
 *   HOME_DAILY_GOAL_V1 goes live in production, since a running-day user would otherwise be
 *   told their goal is 'strength'.
 * - `availableTimeMin` — home has no "selected duration" for a rest-day walk either;
 *   reuses HYBRID_PRESETS.walk_balanced.defaultTimeBudgetMin, the same fallback
 *   buildMapUserContext uses, rather than inventing a second default number.
 *
 * IMPORTANT — preserve when building combined (strength+aerobic) suggestions later
 * (David, 15.08.2026): this builder, and the routeGenerator it feeds, must stay the ONE
 * shared computation regardless of which surface renders it. If a future generator returns
 * a combined suggestion (e.g. part-strength + part-aerobic to serve both a strength and a
 * step goal with one route), home and map must consume the SAME Suggestion — not two
 * mechanisms that can drift apart. Today's C3 hook bypasses runSuggestionEngine's
 * ranking/Suggestion-wrapping for a pragmatic reason (a single always-eligible generator
 * doesn't need ranking against others), NOT because the context itself should diverge
 * between surfaces. Keep this builder in sync with buildMapUserContext's shape/defaults.
 */

import type { UserContext, GeoLocation, UserContextSurface } from '../types/user-context.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { HYBRID_PRESETS } from '../../hybrid/hybrid-slots';
import { buildStepContext } from './build-step-context';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { detectTimeOfDay, detectWorkdayState } from '../../services/workout-metadata.service';
import { calculateDaysInactive } from '../../services/user-profile.utils';
import { isTodayTrainingDay } from '@/features/home/utils/dailyStrengthTarget';

export interface BuildHomeUserContextInput {
  profile: UserFullProfile;
  location: GeoLocation | null;
  /** Defaults to 'home' — the only caller before step 6 of the home-generator-v2 plan
   *  (the post_workout suggestion carousel, home/page.tsx). Same computation either way,
   *  per this file's own header comment: surfaces must never diverge on the underlying
   *  context, only on this one tag. */
  surface?: UserContextSurface;
}

export function buildHomeUserContext({
  profile,
  location,
  surface = 'home',
}: BuildHomeUserContextInput): UserContext {
  const stepContext = buildStepContext(useActivityStore.getState().today);

  return {
    userId: profile.id,
    baseLevel: profile.progression?.globalLevel ?? 1,
    domainLevels: {},
    weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
    recoveryState: { isDetrainingLocked: false, daysInactive: calculateDaysInactive(profile) },
    todayGoal: isTodayTrainingDay(
      profile.lifestyle?.scheduleDays,
      profile.lifestyle?.recurringTemplate as Record<string, string[] | undefined> | undefined,
    )
      ? 'strength'
      : 'active_recovery',
    stepGoal: stepContext.stepGoal,
    stepsToday: stepContext.stepsToday,
    stepsRemaining: stepContext.stepsRemaining,
    availableTimeMin: HYBRID_PRESETS.walk_balanced.defaultTimeBudgetMin,
    preferences: {},
    questionnaires: {},
    location,
    timeOfDay: detectTimeOfDay(),
    surface,
    venue: null,
    transitState: null,
    workdayState: detectWorkdayState(),
    activitySignal: null,
  };
}

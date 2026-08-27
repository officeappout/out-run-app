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
import { summarizeTodayStrengthVolume } from '@/features/home/utils/todayStrengthVolume';
import { useWeeklyVolumeStore } from '../store/useWeeklyVolumeStore';
import { buildUserProgramLevels } from '../../services/level-resolution.utils';
import { getDefaultVolumeTarget } from '../../services/lead-program.service';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';

const FULL_BODY_DOMAINS = ['push', 'pull', 'legs', 'core'] as const;

/**
 * todayCompletedDomains (17.8 build-plan Section 1/Step 0, 25.08.2026) — see this field's own
 * doc comment on UserContext for the full "cheap approximation, ranking-only" rationale.
 *
 * Deliberately synchronous, matching this whole builder's contract: buildUserProgramLevels is
 * called with an EMPTY masterProgramIds set (normally sourced from getCachedPrograms(), an
 * async call) rather than the real one — safe here because that set is only used to EXCLUDE
 * master-program entries (e.g. 'full_body') from the returned map, and none of push/pull/legs/
 * core is ever itself a master-program id, so the 4 keys this function actually reads are
 * unaffected by the omission. getDefaultVolumeTarget(level) is the same synchronous fallback
 * resolveAggregateFullBodyBudget itself already falls back to when no program-specific
 * Firestore override applies — not a new heuristic invented for this.
 *
 * `date` (Section 0 date-awareness fix, 27.08.2026): threaded through to
 * summarizeTodayStrengthVolume's own OPTIONAL dateISO param — that primitive already supported
 * a target date, this builder just never passed one. Without this, a future-day suggestion's
 * `alreadyTrained` ranking factor would read TODAY's completed sets instead of the viewed day's
 * (always empty for a real future day) — David's explicit call: "already trained" must reflect
 * the day being viewed, not get confused with today's completed sets.
 */
function resolveTodayCompletedDomains(profile: UserFullProfile, date?: Date): string[] {
  const dateISO = date ? toISODate(date) : undefined;
  const { byDomain } = summarizeTodayStrengthVolume(useWeeklyVolumeStore.getState().sessionLogs, dateISO);
  const { levels: userProgramLevels } = buildUserProgramLevels(profile, new Set(), '[HomeContext]');
  const scheduleDays = (profile.lifestyle?.scheduleDays?.length ?? 0) || 3;

  return FULL_BODY_DOMAINS.filter((domain) => {
    const level = userProgramLevels.get(domain);
    if (level == null) return false; // never assessed — absent=absent, no invented target
    const dailyApprox = Math.ceil(getDefaultVolumeTarget(level) / scheduleDays);
    const completed = byDomain[domain] ?? 0;
    return completed >= dailyApprox;
  });
}

export interface BuildHomeUserContextInput {
  profile: UserFullProfile;
  location: GeoLocation | null;
  /** Defaults to 'home' — the only caller before step 6 of the home-generator-v2 plan
   *  (the post_workout suggestion carousel, home/page.tsx). Same computation either way,
   *  per this file's own header comment: surfaces must never diverge on the underlying
   *  context, only on this one tag. */
  surface?: UserContextSurface;
  /**
   * 17.8 build-plan, Stage 4 (25.08.2026): the day being VIEWED, not necessarily today —
   * home/page.tsx's own selectedDate (week-strip / planner day-tap) can be a past or future
   * day. Defaults to real `new Date()` (isTodayTrainingDay's own default) for every existing
   * caller that doesn't pass one — byte-identical there. Affects `todayGoal` and (Section 0
   * date-awareness fix, 27.08.2026) `todayCompletedDomains` below; every other field here
   * (steps, recoveryState.daysInactive, etc.) stays real-now-relative on purpose — e.g.
   * daysInactive genuinely means "days since your last real workout as of right now," not "as
   * of the day you happen to be looking at."
   */
  date?: Date;
}

export function buildHomeUserContext({
  profile,
  location,
  surface = 'home',
  date,
}: BuildHomeUserContextInput): UserContext {
  const stepContext = buildStepContext(useActivityStore.getState().today);

  return {
    userId: profile.id,
    baseLevel: profile.progression?.globalLevel ?? 1,
    domainLevels: {},
    weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
    recoveryState: { isDetrainingLocked: false, daysInactive: calculateDaysInactive(profile) },
    todayCompletedDomains: resolveTodayCompletedDomains(profile, date),
    todayGoal: isTodayTrainingDay(
      profile.lifestyle?.scheduleDays,
      profile.lifestyle?.recurringTemplate as Record<string, string[] | undefined> | undefined,
      date,
    )
      ? 'strength'
      : 'recovery',
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

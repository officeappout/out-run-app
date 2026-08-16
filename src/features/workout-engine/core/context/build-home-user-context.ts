/**
 * build-home-user-context — the home surface's UserContext builder, mirroring
 * build-map-user-context.ts (§11.5). Built for C3 (step-deficit rest-day walking card,
 * 15.08.2026) — the first home-surface caller of the rec-engine contract.
 *
 * Same honesty rule as the map builder: populates what's genuinely available on the home
 * screen today; leaves the rest as the documented "PENDING <gate>" defaults from
 * user-context.types.ts rather than fabricating values nothing here actually knows:
 * - `domainLevels: {}`, `weeklyPerformance`/`recoveryState` defaults, `venue`/`transitState`/
 *   `activitySignal`: null — identical reasoning to buildMapUserContext, not re-derived here.
 * - `todayGoal: null` — home has no run/walk selector at this call site (unlike map's
 *   `slotActivity` toggle); no real signal exists to populate this honestly.
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
    recoveryState: { isDetrainingLocked: false, daysInactive: 0 },
    todayGoal: null,
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

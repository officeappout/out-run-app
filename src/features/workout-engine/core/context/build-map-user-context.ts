/**
 * build-map-user-context — the map surface's UserContext builder (plan §11.5, §"סבב 9").
 *
 * Populates what's genuinely available on the map screen today; leaves the rest honest
 * defaults rather than fabricating values nothing on this surface actually knows:
 * - `domainLevels: {}` — real resolution exists (`resolveHybridUserLevels`,
 *   `buildUserProgramLevels`) but nothing in the current ranker reads `domainLevels` yet;
 *   not worth pulling in that resolution machinery for an unused field.
 * - `recoveryState.isDetrainingLocked: false` — real detection lives in
 *   `periodization.service.ts`, not trivially available from a bare profile object on this
 *   screen; defaults to "not locked" (neutral, matches `recoveryMatch`'s no-op-when-false).
 * - `availableTimeMin` — the map has no single "selected duration" today; the real
 *   per-slot value only exists as `slot.timeBudgetMin`, resolved inside HybridSlotCarousel
 *   at tap time (`DiscoverLayer.tsx:681` etc.), AFTER a slot is chosen — not before ranking.
 *   Defaults to `HYBRID_PRESETS.walk_balanced.defaultTimeBudgetMin`; each map generator's own
 *   `presetToIntent` call re-derives the real per-preset default/override at compose time
 *   regardless, so this only affects the RANKING pass, not what actually gets built.
 * - `todayGoal` — intentionally `null` unless `slotActivity==='running'` maps it to `'run'`.
 *   `slotActivity` (walk/run toggle) is an aerobic-mode preference, not a domain goal
 *   declaration — mapping 'walking' to `'strength'` would be inventing a goal signal the map
 *   screen doesn't actually have.
 */

import type { UserContext } from '../types/user-context.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { AerobicKind } from '../../hybrid/compose-hybrid-session.service';
import { HYBRID_PRESETS } from '../../hybrid/hybrid-slots';
import { buildStepContext } from './build-step-context';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { detectTimeOfDay, detectWorkdayState } from '../../services/workout-metadata.service';

export interface BuildMapUserContextInput {
  profile: UserFullProfile;
  userLocation: { lat: number; lng: number };
  slotActivity: AerobicKind;
}

export function buildMapUserContext({
  profile,
  userLocation,
  slotActivity,
}: BuildMapUserContextInput): UserContext {
  const stepContext = buildStepContext(useActivityStore.getState().today);

  return {
    userId: profile.id,
    baseLevel: profile.progression?.globalLevel ?? 1,
    domainLevels: {},
    weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
    recoveryState: { isDetrainingLocked: false, daysInactive: 0 },
    // Map surface doesn't compute this (17.8 build-plan Section 1/Step 0 was scoped to home) —
    // [] is a safe, neutral default: alreadyTrained() (rank-suggestions.ts) simply no-ops when
    // empty, same as today's map ranking behavior before this factor existed.
    todayCompletedDomains: [],
    todayGoal: slotActivity === 'running' ? 'run' : null,
    stepGoal: stepContext.stepGoal,
    stepsToday: stepContext.stepsToday,
    stepsRemaining: stepContext.stepsRemaining,
    availableTimeMin: HYBRID_PRESETS.walk_balanced.defaultTimeBudgetMin,
    preferences: {},
    questionnaires: {},
    location: userLocation,
    timeOfDay: detectTimeOfDay(),
    surface: 'map',
    venue: null,
    transitState: null,
    workdayState: detectWorkdayState(),
    activitySignal: null,
  };
}

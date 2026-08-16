/**
 * partial-completion.generator — post_workout Generator (home-generator-v2 follow-ups,
 * Task 2, David-approved 16.08.2026).
 *
 * Suggests completing today's strength session in whichever domain (push/pull/legs/core)
 * has the largest real gap between the daily per-domain budget
 * (resolveAggregateFullBodyBudget, lead-program.service.ts — real ProgramLevelSettings at
 * the user's actual per-domain level, already live in home-workout.service.ts's normal
 * generation path) and what was actually completed today
 * (todayStrengthVolume.byDomain, from real session logs). This is what differentiates it
 * from complementary-short (hardcoded to 'core', gated on stepsRemaining only) —
 * domain-aware, targeting the real gap.
 *
 * Sync/async split (David-confirmed): `eligible()` is synchronous by the Generator
 * contract, but the real domain-gap comparison needs resolveAggregateFullBodyBudget — an
 * async Firestore-backed call. So eligible() only does the cheap, synchronous half
 * (today's total sets not yet at plan), and generate() does the real per-domain
 * comparison, returning null if it turns out no domain actually has a positive gap (a
 * legitimate "eligible-looking but nothing to suggest" case — e.g. today's sets were all
 * "extra" beyond any single domain's target). Matches the Generator contract's own
 * "returns null when generation legitimately produces nothing."
 *
 * Domain guard (David, 16.08.2026): only compares domains where userProgramLevels.has(domain)
 * is true. buildUserProgramLevels (level-resolution.utils.ts) implements "absent=absent" —
 * a domain with no real assessed level is never added to its returned map — so this excludes
 * any domain resolveAggregateFullBodyBudget would otherwise silently default to level 1 for.
 * Filtered on the CALLER side, per instruction — resolveAggregateFullBodyBudget itself is
 * untouched.
 *
 * Tie-break: fixed domain order (push > pull > legs > core), first domain hit with the
 * largest gap wins — per David's explicit instruction, not a data-driven priority.
 *
 * `userProgramLevels`/`allPrograms` are built the SAME way _buildSharedPipeline does
 * (home-workout.service.ts) — buildUserProgramLevels(profile, masterProgramIds, ...),
 * masterProgramIds from allPrograms.filter(isMaster). Deliberately uses the RAW profile,
 * not that pipeline's "effectiveProfile" — that transformation only reshapes
 * progression.activePrograms for a WorkoutBuilderSheet-specific "leading master program"
 * selection concept this background generator has no equivalent of.
 * buildUserProgramLevels's real per-domain level data comes from
 * profile.progression.domains/tracks either way, unaffected by that transformation.
 *
 * Cache-keyed-by-suggestion-id (mirrors recovery-follow-up.generator.ts, Task 1): the
 * resolved domain + real GeneratedWorkout are cached together so "start"
 * (pick-post-workout-suggestion.ts) reuses the SAME result instead of re-running the whole
 * domain-gap computation (which could theoretically resolve a different domain if state
 * changed between ranking and the tap) — a re-derive only happens on a genuine cache miss.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { MovementPattern } from '@/features/content/programs/core/program.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { generateHomeWorkoutTrio } from '../../services/home-workout.service';
import { resolveAggregateFullBodyBudget } from '../../services/lead-program.service';
import { getCachedPrograms } from '../../services/program-hierarchy.utils';
import { buildUserProgramLevels } from '../../services/level-resolution.utils';
import { summarizeTodayStrengthVolume } from '@/features/home/utils/todayStrengthVolume';
import { useWeeklyVolumeStore } from '../store/useWeeklyVolumeStore';

const DOMAIN_ORDER: readonly MovementPattern[] = ['push', 'pull', 'legs', 'core'];
const DOMAIN_LABELS: Record<MovementPattern, string> = {
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  core: 'ליבה',
};

const PARTIAL_COMPLETION_CACHE_CAP = 10;
const partialCompletionCache = new Map<string, GeneratedWorkout>();

function cachePartialCompletionWorkout(suggestionId: string, workout: GeneratedWorkout): void {
  if (partialCompletionCache.size >= PARTIAL_COMPLETION_CACHE_CAP) {
    const oldestKey = partialCompletionCache.keys().next().value;
    if (oldestKey !== undefined) partialCompletionCache.delete(oldestKey);
  }
  partialCompletionCache.set(suggestionId, workout);
}

/** Read-only lookup — pick-post-workout-suggestion.ts's start-adapter uses this before
 *  falling back to a full re-derive. Returns undefined on a genuine cache miss. */
export function getCachedPartialCompletionWorkout(suggestionId: string): GeneratedWorkout | undefined {
  return partialCompletionCache.get(suggestionId);
}

async function resolveWorstDomainGap(
  profile: UserFullProfile,
): Promise<{ domain: MovementPattern; gap: number } | null> {
  const { byDomain } = summarizeTodayStrengthVolume(useWeeklyVolumeStore.getState().sessionLogs);

  const allPrograms = await getCachedPrograms();
  const masterProgramIds = new Set(allPrograms.filter((p) => p.isMaster).map((p) => p.id));
  const { levels: userProgramLevels } = buildUserProgramLevels(
    profile,
    masterProgramIds,
    '[PartialCompletion]',
  );
  const scheduleDays = (profile.lifestyle?.scheduleDays?.length ?? 0) || 3;

  const { domainBudgets } = await resolveAggregateFullBodyBudget(
    scheduleDays,
    userProgramLevels,
    allPrograms,
  );

  let worstDomain: MovementPattern | null = null;
  let worstGap = 0;
  for (const domain of DOMAIN_ORDER) {
    if (!userProgramLevels.has(domain)) continue; // absent=absent guard — no invented level-1
    const entry = domainBudgets.find((e) => e.domain === domain);
    if (!entry) continue;
    const gap = entry.daily - (byDomain[domain] ?? 0);
    if (gap > worstGap) {
      worstGap = gap;
      worstDomain = domain;
    }
  }

  return worstDomain ? { domain: worstDomain, gap: worstGap } : null;
}

export async function buildPartialCompletionWorkout(
  profile: UserFullProfile,
  domain: MovementPattern,
): Promise<GeneratedWorkout | null> {
  const trio = await generateHomeWorkoutTrio({
    userProfile: profile,
    requiredDomains: [domain],
    strictDomains: true,
    generateSingleOption: true,
    targetOptionIndex: 1,
    skipCycleRestart: true,
  });
  const { workout } = trio.options[1].result;
  if (workout.needsAssessment) return null;
  return workout;
}

/** Full resolve-domain + build, for callers (the "start" cache-miss fallback) that only
 *  need the final workout, not the intermediate domain choice. */
export async function buildPartialCompletionWorkoutFresh(
  profile: UserFullProfile,
): Promise<GeneratedWorkout | null> {
  const worst = await resolveWorstDomainGap(profile);
  if (!worst) return null;
  return buildPartialCompletionWorkout(profile, worst.domain);
}

export const partialCompletionGenerator: Generator = {
  id: 'partial-completion',
  name: 'השלמת אימון',
  surfaces: ['post_workout'],

  eligible: () => {
    const { setsCompleted, setsPlanned } = summarizeTodayStrengthVolume(
      useWeeklyVolumeStore.getState().sessionLogs,
    );
    return setsCompleted < setsPlanned && useUserStore.getState().profile !== null;
  },

  generate: async (): Promise<Suggestion | null> => {
    const profile = useUserStore.getState().profile;
    if (!profile) return null;

    const worst = await resolveWorstDomainGap(profile);
    if (!worst) return null;

    const workout = await buildPartialCompletionWorkout(profile, worst.domain);
    if (!workout) return null;

    const id = `partial-completion-${Date.now()}`;
    cachePartialCompletionWorkout(id, workout);

    return {
      id,
      type: 'post_workout',
      generatorId: 'partial-completion',
      title: workout.title,
      subtitle: `להשלים ${DOMAIN_LABELS[worst.domain]} להיום`,
      structure: {
        segments: workout.exercises.length,
        durationMin: workout.estimatedDuration,
      },
      methodsUsed: [],
      difficulty: workout.difficulty,
      goalTags: ['strength', worst.domain],
      surfaceEligibility: ['post_workout'],
      requiresLocation: false,
      score: 0,
      scoreBreakdown: {
        goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
        recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0,
      },
    };
  },
};

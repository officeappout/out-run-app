/**
 * The recommended split for a SAVED profile (enable_home_v2, owner 20.10.2026, decision 8).
 *
 * The same policy the signup card shows (resolveRecommendation), fed only from what the
 * profile already holds — no sessionStorage, no store — so the workout generator and the
 * week preview can ask "which split is this user on?" at any time. Pure.
 *
 * availableDays = the strength days the user actually scheduled, so the answer never
 * promises more sessions than the week holds (and health_cap still caps routine /
 * health users at 3 full-body). Users who train hard skills → null: the skill split
 * logic is untouched.
 */
import { ageFromDob } from './signals';
import { buildPolicySignals, collectGoalIds, strengthLevelOf } from './fromProfile';
import { resolveRecommendation } from './resolve';
import type { SessionType } from '@/features/workout-engine/services/split-decision/split-decision.types';

type Leveled = { currentLevel?: number; level?: number } | null | undefined;

/** The profile fields this reads (UserFullProfile satisfies it). */
export interface SplitProfileSlice {
  core?: { mainGoal?: unknown; birthDate?: unknown } | null;
  personas?: ReadonlyArray<{ id?: string } | null | undefined> | null;
  selectedGoals?: ReadonlyArray<string> | null;
  onboardingAnswers?: { allGoals?: ReadonlyArray<string> | null } | null;
  running?: { isUnlocked?: unknown } | null;
  progression?: {
    tracks?: Record<string, Leveled> | null;
    domains?: Record<string, Leveled> | null;
    skillFocusIds?: ReadonlyArray<string> | null;
  } | null;
}

/** Hard skills (handstand excluded — it is practised almost daily, not a split driver). */
export function hardSkillCountOf(skillFocusIds: ReadonlyArray<string> | null | undefined): number {
  return (skillFocusIds ?? []).filter((s) => typeof s === 'string' && !s.toLowerCase().includes('handstand')).length;
}

export function recommendedSplitOfProfile(
  profile: SplitProfileSlice | null | undefined,
  strengthDays: number,
  now: Date = new Date(),
): SessionType | null {
  if (!profile || !(strengthDays > 0)) return null;
  if (hardSkillCountOf(profile.progression?.skillFocusIds) > 0) return null;
  try {
    const birth = profile.core?.birthDate;
    const signals = buildPolicySignals({
      tracks: profile.running?.isUnlocked ? 'both' : 'strength',
      strengthLevel: strengthLevelOf(profile.progression),
      run: null,
      goalIds: collectGoalIds({
        mainGoal: profile.core?.mainGoal,
        profileGoalIds: [...(profile.selectedGoals ?? []), ...(profile.onboardingAnswers?.allGoals ?? [])],
      }),
      personaIds: (profile.personas ?? []).map((p) => p?.id).filter((id): id is string => !!id),
      age: ageFromDob(typeof birth === 'string' ? birth : null, now),
      hardSkillCount: 0,
      availableDays: strengthDays,
    });
    return resolveRecommendation(signals).strength?.split ?? null;
  } catch {
    return null;
  }
}

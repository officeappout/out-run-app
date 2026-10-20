/**
 * Add track (enable_home_v2, J3 / J4) — the recommendation policy's counts for a user who
 * will train both tracks, and the Shabbat check. Pure.
 */
import { buildPolicySignals, resolveRecommendation, strengthLevelOf } from '@/features/schedule/recommendation-policy';
import type { WeaverInputProfile } from '@/features/schedule/engine/weaverInput';
import type { PolicyInputs } from './policy-inputs';

const SATURDAY_LETTER = 'ש';

/** The user marked Saturday as a training day somewhere in what is stored. */
export function profileMarksSaturday(profile: { lifestyle?: { scheduleDays?: string[] | null } | null; running?: { scheduleDays?: string[] | null } | null } | null | undefined): boolean {
  return [...(profile?.lifestyle?.scheduleDays ?? []), ...(profile?.running?.scheduleDays ?? [])].includes(SATURDAY_LETTER);
}

/** Policy counts for a user who will train both tracks (null when the policy fails). */
export function addTrackPolicyCounts(
  profile: WeaverInputProfile,
  runAnswers: Record<string, unknown> | null,
  inputs: PolicyInputs,
): { strength: number; runs: number } | null {
  try {
    const running = profile.running;
    const rec = resolveRecommendation(
      buildPolicySignals({
        tracks: 'both',
        strengthLevel: strengthLevelOf(profile.progression),
        run: runAnswers ?? { profileType: running?.paceProfile?.profileType, abilityTier: running?.onboardingData?.currentAbility?.abilityTier },
        goalIds: inputs.goalIds,
        personaIds: inputs.personaIds,
        age: inputs.age,
        targetDistance: typeof runAnswers?.targetDistance === 'string' ? runAnswers.targetDistance : running?.generatedProgramTemplate?.targetDistance ?? null,
      }),
    );
    return rec.strength && rec.running ? { strength: rec.strength.frequency, runs: rec.running.frequency } : null;
  } catch {
    return null;
  }
}

/**
 * Calm return → the strength generator's SessionPolicy (pure).
 *
 * While CALM_RETURN_V1 is on, the home pipeline no longer feeds the raw inactivity gap to
 * resolveSessionPolicy (−40% at 4–7 days, a forced deload at 8–21, a cycle restart at 21+
 * with "התעלמת X ימים" cues). It takes the plain cycle policy and lays the tiered calm load
 * on top (src/lib/calm-return/policy.ts): −20% / −30% / −40% sets, difficulty ≤ 2, no
 * cycle restart (program position kept), and a numberless "גרסה קלה לחזרה" cue.
 */
import type { CalmLoad } from '@/lib/calm-return/policy';
import type { SessionPolicy } from './periodization.service';

export function applyCalmReturnToPolicy(cyclePolicy: SessionPolicy, load: CalmLoad, label: string): SessionPolicy {
  const lightens = load.strengthVolumeReduction > 0 || load.strengthMaxDifficulty < 3;
  if (!lightens) return { ...cyclePolicy, shouldRestartCycle: false };

  // A deload week stays a deload (−50% is already lighter than any return tier).
  const isDeload = cyclePolicy.reason === 'deload';
  const reduction = Math.max(load.strengthVolumeReduction, isDeload ? 0.5 : 0);

  return {
    ...cyclePolicy,
    // No peak overload while coming back: the reduction replaces the cycle's volume step
    // (calculateVolumeAdjustment skips the periodization branch when an override is set).
    volumeMultiplier: isDeload ? cyclePolicy.volumeMultiplier : 1.0,
    deltaOverride: isDeload ? cyclePolicy.deltaOverride : undefined,
    protocolMultiplier: Math.min(1, cyclePolicy.protocolMultiplier),
    detrainingLock: load.strengthMaxDifficulty < 3,
    volumeReductionOverride: reduction > 0 ? reduction : undefined,
    coachCue: label,
    defaultFocusIndex: isDeload ? 0 : 1,
    shouldRestartCycle: false,
    reason: isDeload ? 'deload' : 'detraining',
  };
}

/** The automatic trio never offers more than the calm load's max difficulty. */
export function capDifficultyForCalmReturn<D extends 1 | 2 | 3>(
  difficulty: D,
  load: CalmLoad | null | undefined,
  isExplicitChoice: boolean,
): D {
  if (!load || isExplicitChoice) return difficulty;
  return (Math.min(difficulty, load.strengthMaxDifficulty) as D);
}

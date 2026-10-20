/**
 * The running experience level the schedule rules use (RUN-04's cap, engine v2's run
 * streak cap). Its own module so both the weaver input and the by-type run mapper
 * (utils/runWeekByType) can import it without importing each other.
 */
import type { RunningExperienceLevel } from './runningRules';

export interface RunningLevelProfile {
  paceProfile?: { profileType?: number } | null;
  onboardingData?: { currentAbility?: { abilityTier?: string } | null } | null;
}

/**
 * Bug #10: the running level used to be hardcoded 'intermediate' (RUN-04's consecutive-
 * days cap). Mapping, from running.types.ts's own RunnerProfileType doc:
 *   3 (beginner / returning, couch_to_5k)            → 'beginner'
 *   1 (fast improver, basePace under 6:00/km)        → 'advanced'
 *   2 (slow improver) / 4 (maintenance)              → 'intermediate'
 * No paceProfile: the onboarding ability tier ('none' / '5_15' → beginner); otherwise
 * 'intermediate' — exactly today's value, so an unknown runner sees no change.
 */
export function resolveRunningLevel(running: RunningLevelProfile | null | undefined): RunningExperienceLevel {
  const t = running?.paceProfile?.profileType;
  if (t === 3) return 'beginner';
  if (t === 1) return 'advanced';
  if (t === 2 || t === 4) return 'intermediate';
  const tier = running?.onboardingData?.currentAbility?.abilityTier;
  if (tier === 'none' || tier === '5_15') return 'beginner';
  return 'intermediate';
}

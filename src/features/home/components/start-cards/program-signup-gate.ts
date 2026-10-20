import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import type { WorkoutActivityType } from '@/features/user/onboarding/utils/required-setup';
import type { OnboardingEntryOptions } from '@/features/user/onboarding/utils/onboarding-entry';
import type { ProgramTrackNavigate } from './entry-tap';

/** Home's JIT workout-start gate (useRequiredSetup().interceptWorkoutStart). */
export type WorkoutStartGate = (
  onProceed: () => void,
  activityType?: WorkoutActivityType,
  onCancel?: () => void,
) => unknown;

/**
 * How a home program card (start slide / "add a track" card) opens its signup flow.
 *
 * enable_home_v2 (owner 20.10.2026, bug fix): the tap goes STRAIGHT into the track's flow
 * (strength → program-path …, running/walking → dynamic …). The tap opens a questionnaire,
 * not a workout, so the JIT health-declaration gate must not run here: it put the
 * declaration in front of the whole flow (the user saw the health screen instead of the
 * questionnaire). Every signup flow already asks for it once, at its own step — after the
 * questionnaire, before the first save (/onboarding-new/health: strength after the
 * assessment result, running after the plan summary; silent skip when already signed).
 *
 * Flag off: unchanged — the gate runs with the track as the activity type (the program
 * slide never renders without the flag anyway).
 */
export function programSignupNavigate(v2: boolean, gate: WorkoutStartGate): ProgramTrackNavigate {
  if (v2) return (_track: ProgramTrack, navigate: () => void) => navigate();
  return (track, navigate, cancel) => {
    gate(navigate, track, cancel);
  };
}

/**
 * The home v2 program cards' entry options (stable object for hook deps): straight into the
 * track's questionnaire — name / gender / birth date are asked right before the flow's
 * first save instead of in front of it (onboardingEntryHref, useDeferredIdentity).
 */
export const PROGRAM_CARD_ENTRY: OnboardingEntryOptions = Object.freeze({ deferIdentity: true });

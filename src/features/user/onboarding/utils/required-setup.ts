/**
 * Pure requirement check behind the JIT workout-start gate (useRequiredSetup).
 * Extracted from the hook so the "never ask for the health declaration twice"
 * sequences can be unit-tested without React.
 */
import type { UserFullProfile } from '../../core/types/user.types';
import type { OnboardingStepId } from '../types';
import { hasAcceptedHealthDeclaration } from '@/lib/health-declaration';
import { hasKnownIdentity } from '@/lib/identity';

export interface MissingRequirement {
  id: string;
  label: string;
  /** 'IDENTITY' is rendered inline by JITSetupModal (never routed to /onboarding-new/setup). */
  step: OnboardingStepId | 'IDENTITY';
  /** Hard block = user MUST complete before proceeding */
  isHardBlock: boolean;
}

/**
 * What kind of workout is the user about to start?
 * Drives requirement filtering — currently only used to skip the
 * equipment prompt for runners and for program sign-up entries.
 *
 * `'program-signup'`: the tap opens a track's onboarding (home start /
 * "add track" cards), not a workout — only the health declaration gates it;
 * the equipment prompt waits for the first real strength workout start.
 */
export type WorkoutActivityType = 'running' | 'strength' | 'program-signup' | 'unknown';

export interface RequirementOptions {
  /**
   * enable_jit_identity_v1 — ask for name / gender / birth date (the identity
   * screen) BEFORE the health declaration when the profile doesn't have all
   * three, so the declaration is signed with the user's real name. Off (the
   * default) = the old list, byte-identical.
   */
  requireIdentity?: boolean;
}

export function getMissingRequirements(
  profile: UserFullProfile | null | undefined,
  activityType: WorkoutActivityType = 'unknown',
  options: RequirementOptions = {},
): MissingRequirement[] {
  if (!profile) return [];

  const missing: MissingRequirement[] = [];

  // Identity — HARD BLOCK, and FIRST: the health declaration below is signed
  // with this name and uses this gender for its copy. Asked only when the
  // health declaration still has to be signed — a user who already signed
  // isn't stopped for identity here (that's not this gate's job).
  if (
    options.requireIdentity &&
    !hasKnownIdentity(profile.core) &&
    !hasAcceptedHealthDeclaration(profile)
  ) {
    missing.push({
      id: 'identity',
      label: 'פרטים אישיים',
      step: 'IDENTITY',
      isHardBlock: true,
    });
  }

  // Health Declaration — HARD BLOCK (the only requirement that
  // gates workout start, regardless of activity type).
  if (!hasAcceptedHealthDeclaration(profile)) {
    missing.push({
      id: 'health',
      label: 'הצהרת בריאות',
      step: 'HEALTH_DECLARATION',
      isHardBlock: true,
    });
  }

  // Equipment — SOFT BLOCK (user can skip; workout falls back to
  // bodyweight). DELIBERATELY skipped for running so runners aren't
  // asked to declare pull-up bars when they're about to log km.
  const skipsEquipment = activityType === 'running' || activityType === 'program-signup';
  const hasEquipment =
    (profile.equipment?.home?.length ?? 0) > 0 ||
    (profile.equipment?.outdoor?.length ?? 0) > 0 ||
    (profile.equipment?.office?.length ?? 0) > 0;

  if (!hasEquipment && !skipsEquipment) {
    missing.push({
      id: 'equipment',
      label: 'ציוד אימון',
      step: 'EQUIPMENT',
      isHardBlock: false,
    });
  }

  return missing;
}

/**
 * cancelJIT's transition: the modal closes with nothing pending, and the
 * caller's onCancel (if any) is returned so it runs once, after the close —
 * e.g. a home start card releases its loading spinner.
 */
export function closeJitWithoutProceeding<S extends { onCancel?: (() => void) | null }>(
  state: S,
): { next: { isModalOpen: false; requirements: MissingRequirement[]; onComplete: null; onCancel: null }; notify: (() => void) | null } {
  return {
    next: { isModalOpen: false, requirements: [], onComplete: null, onCancel: null },
    notify: state.onCancel ?? null,
  };
}

/**
 * Pure requirement check behind the JIT workout-start gate (useRequiredSetup).
 * Extracted from the hook so the "never ask for the health declaration twice"
 * sequences can be unit-tested without React.
 */
import type { UserFullProfile } from '../../core/types/user.types';
import type { OnboardingStepId } from '../types';
import { hasAcceptedHealthDeclaration } from '@/lib/health-declaration';

export interface MissingRequirement {
  id: string;
  label: string;
  step: OnboardingStepId;
  /** Hard block = user MUST complete before proceeding */
  isHardBlock: boolean;
}

/**
 * What kind of workout is the user about to start?
 * Drives requirement filtering — currently only used to skip the
 * equipment prompt for runners.
 */
export type WorkoutActivityType = 'running' | 'strength' | 'unknown';

export function getMissingRequirements(
  profile: UserFullProfile | null | undefined,
  activityType: WorkoutActivityType = 'unknown',
): MissingRequirement[] {
  if (!profile) return [];

  const missing: MissingRequirement[] = [];

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
  const isRunning = activityType === 'running';
  const hasEquipment =
    (profile.equipment?.home?.length ?? 0) > 0 ||
    (profile.equipment?.outdoor?.length ?? 0) > 0 ||
    (profile.equipment?.office?.length ?? 0) > 0;

  if (!hasEquipment && !isRunning) {
    missing.push({
      id: 'equipment',
      label: 'ציוד אימון',
      step: 'EQUIPMENT',
      isHardBlock: false,
    });
  }

  return missing;
}

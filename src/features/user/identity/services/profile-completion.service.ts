'use client';

/**
 * Profile Completion Service
 *
 * Calculates the user's profile completion percentage (0-100).
 *
 * Weight allocation:
 *
 *   BASIC INFO (30%)                     — filled by both tracks
 *     A. Name           =  5%
 *     B. DOB            =  5%
 *     C. Weight         =  5%
 *     D. Location       =  5%
 *     E. Health Decl    =  5%
 *     F. Account        =  0%  (delayed — post-first-workout)
 *     G. GPS Access     =  5%
 *
 *   STRENGTH TRACK (35%)                 — always counted
 *     G. Goals          = 10%
 *     H. Persona        = 10%
 *     I. Schedule       = 10%
 *     J. Equipment      =  5%
 *
 *   RUNNING TRACK (35%)                  — counted only when enableRunningPrograms = true
 *     K. Running Plan   = 20%
 *     L. Running Pace   = 15%
 *   ─────────────────────────────────────
 *   When running is disabled: 100% = Basic (30) + Strength (35) × normalised to 100.
 *   The weights are re-normalised so a strength-only user can always reach 100%.
 */

import type { UserFullProfile } from '../../core/types/user.types';
import type { OnboardingStepId } from '../../onboarding/types';

// ============================================================================
// TYPES
// ============================================================================

export interface CompletionItem {
  id: string;
  label: string;
  completed: boolean;
  weight: number;
  /** Which bucket this item belongs to */
  bucket: 'basic' | 'strength' | 'running';
  step?: OnboardingStepId;
}

export interface CompletionResult {
  /** 0-100 percentage */
  percentage: number;
  /** All tracked items (filtered by active flags) */
  items: CompletionItem[];
  /** Only the incomplete items */
  pending: CompletionItem[];
  /** True when percentage === 100 */
  isVerified: boolean;
}

// ============================================================================
// CALCULATOR
// ============================================================================

/**
 * @param profile               The full user profile.
 * @param enableRunningPrograms When false, running-track items are excluded from
 *                              both numerator and denominator, so a strength-only
 *                              user can reach 100%.
 */
export function calculateProfileCompletion(
  profile: UserFullProfile | null,
  enableRunningPrograms = true,
): CompletionResult {
  if (!profile) {
    return { percentage: 0, items: [], pending: [], isVerified: false };
  }

  const allItems: CompletionItem[] = [
    // ── BASIC INFO (30%) ──────────────────────────────────────────────
    {
      id: 'name',
      label: 'שם מלא',
      completed: !!profile.core?.name && profile.core.name.trim().length > 0,
      weight: 5,
      bucket: 'basic',
      step: 'PERSONAL_STATS',
    },
    {
      id: 'dob',
      label: 'תאריך לידה',
      completed: !!profile.core?.birthDate,
      weight: 5,
      bucket: 'basic',
      step: 'PERSONAL_STATS',
    },
    {
      id: 'weight',
      label: 'משקל',
      completed: !!profile.core?.weight && profile.core.weight > 0,
      weight: 5,
      bucket: 'basic',
      step: 'PERSONAL_STATS',
    },
    {
      id: 'location',
      label: 'מיקום ועיר',
      completed:
        !!profile.core?.authorityId ||
        !!((profile as any).affiliations && Object.keys((profile as any).affiliations).length > 0),
      weight: 5,
      bucket: 'basic',
      step: 'LOCATION',
    },
    {
      id: 'health',
      label: 'הצהרת בריאות',
      completed:
        !!(profile as any)?.healthDeclarationAccepted ||
        !!(profile.health as any)?.healthDeclarationAccepted,
      weight: 5,
      bucket: 'basic',
      step: 'HEALTH_DECLARATION',
    },
    {
      id: 'gpsAccess',
      label: 'אפשר גישה ל-GPS',
      completed: !!(profile as any)?.core?.gpsEnabled,
      weight: 5,
      bucket: 'basic',
      step: 'GPS_PERMISSION' as OnboardingStepId,
    },
    {
      id: 'account',
      label: 'חשבון מאובטח',
      completed: !!profile.core?.email,
      weight: 0,
      bucket: 'basic',
      step: 'ACCOUNT_SECURE',
    },

    // ── STRENGTH TRACK (35%) ──────────────────────────────────────────
    {
      id: 'goals',
      label: 'התאמת תוכנית כוח',
      completed: !!(
        profile.progression?.domains && Object.keys(profile.progression.domains).length > 0
      ),
      weight: 10,
      bucket: 'strength',
      step: 'PERSONA',
    },
    {
      id: 'persona',
      label: 'סגנון חיים',
      completed: !!profile.personaId,
      weight: 10,
      bucket: 'strength',
      step: 'PERSONA',
    },
    {
      id: 'schedule',
      label: 'לוח אימונים',
      completed: !!(
        profile.lifestyle?.scheduleDays && profile.lifestyle.scheduleDays.length > 0
      ),
      weight: 10,
      bucket: 'strength',
      step: 'SCHEDULE',
    },
    {
      id: 'equipment',
      label: 'ציוד אימון',
      completed:
        (profile.equipment?.home?.length ?? 0) > 0 ||
        (profile.equipment?.outdoor?.length ?? 0) > 0,
      weight: 5,
      bucket: 'strength',
      step: 'EQUIPMENT',
    },

    // ── RUNNING TRACK (35%) ───────────────────────────────────────────
    {
      id: 'runningPlan',
      label: 'תוכנית ריצה',
      completed:
        !!(profile.running?.activeProgram) ||
        !!(profile.running as any)?.generatedProgramTemplate,
      weight: 20,
      bucket: 'running',
    },
    {
      id: 'runningPace',
      label: 'קצב ריצה אישי',
      completed: !!(profile.running?.paceProfile?.basePace),
      weight: 15,
      bucket: 'running',
    },
  ];

  // Filter items based on active flags
  const items = enableRunningPrograms
    ? allItems
    : allItems.filter((i) => i.bucket !== 'running');

  // When running is excluded, re-normalise so the max possible = 100
  // Basic (30) + Strength (35) = 65 raw → scale factor = 100/65
  const rawMax = items.reduce((sum, i) => sum + i.weight, 0);
  const scaleFactor = rawMax > 0 ? 100 / rawMax : 1;

  const rawScore = items
    .filter((i) => i.completed)
    .reduce((sum, i) => sum + i.weight, 0);

  const percentage = Math.min(Math.round(rawScore * scaleFactor), 100);
  const pending = items.filter((i) => !i.completed);

  return {
    percentage,
    items,
    pending,
    isVerified: percentage >= 100,
  };
}

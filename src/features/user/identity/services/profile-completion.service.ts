'use client';

/**
 * Profile Completion Service
 *
 * Calculates the user's profile completion percentage (0-100).
 * 12 fields across 3 buckets. When progress = 100% the user
 * earns the "Verified" badge (blue check).
 *
 * Weight allocation (dual-track model):
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
 *   STRENGTH TRACK (35%)                 — filled by strength onboarding
 *     G. Goals          = 10%
 *     H. Persona        = 10%
 *     I. Schedule       = 10%
 *     J. Equipment      =  5%
 *
 *   RUNNING TRACK (35%)                  — filled by running onboarding
 *     K. Running Plan   = 20%
 *     L. Running Pace   = 15%
 *   ─────────────────────────────────────
 *   Total               = 100%
 *
 * Completing only one track yields ~65% (30 + 35).
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
  /** All tracked items */
  items: CompletionItem[];
  /** Only the incomplete items */
  pending: CompletionItem[];
  /** True when percentage === 100 */
  isVerified: boolean;
}

// ============================================================================
// CALCULATOR
// ============================================================================

export function calculateProfileCompletion(profile: UserFullProfile | null): CompletionResult {
  if (!profile) {
    return { percentage: 0, items: [], pending: [], isVerified: false };
  }

  const items: CompletionItem[] = [
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
      completed: !!profile.core?.authorityId ||
                 !!((profile as any).affiliations && Object.keys((profile as any).affiliations).length > 0),
      weight: 5,
      bucket: 'basic',
      step: 'LOCATION',
    },
    {
      id: 'health',
      label: 'הצהרת בריאות',
      completed: !!(profile as any)?.healthDeclarationAccepted ||
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
      completed: !!(profile.progression?.domains && Object.keys(profile.progression.domains).length > 0),
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
      completed: !!(profile.lifestyle?.scheduleDays && profile.lifestyle.scheduleDays.length > 0),
      weight: 10,
      bucket: 'strength',
      step: 'SCHEDULE',
    },
    {
      id: 'equipment',
      label: 'ציוד אימון',
      completed: (profile.equipment?.home?.length ?? 0) > 0 ||
                 (profile.equipment?.outdoor?.length ?? 0) > 0,
      weight: 5,
      bucket: 'strength',
      step: 'EQUIPMENT',
    },

    // ── RUNNING TRACK (35%) ───────────────────────────────────────────
    {
      id: 'runningPlan',
      label: 'תוכנית ריצה',
      completed: !!(profile.running?.activeProgram) ||
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

  const percentage = items
    .filter((i) => i.completed)
    .reduce((sum, i) => sum + i.weight, 0);

  const pending = items.filter((i) => !i.completed);

  return {
    percentage: Math.min(percentage, 100),
    items,
    pending,
    isVerified: percentage >= 100,
  };
}

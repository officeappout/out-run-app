'use client';

/**
 * Profile Completion Service
 * 
 * Calculates the user's profile completion percentage (0-100).
 * All 10 fields count towards 100%.  When progress = 100% the user
 * earns the "Verified" badge (blue check).
 * 
 * Weight allocation:
 *   A. Name        =  5%
 *   B. DOB         =  5%
 *   C. Weight      = 10%
 *   D. Goals       = 10%
 *   E. Persona     = 10%
 *   F. Schedule    = 15%
 *   G. Location    = 10%
 *   H. Equipment   = 15%
 *   I. Health Decl = 10%
 *   J. Account     = 10%
 *   ─────────────────
 *   Total          = 100%
 */

import type { UserFullProfile } from '../../core/types/user.types';
import type { OnboardingStepId } from '../../onboarding/types';

// ============================================================================
// TYPES
// ============================================================================

export interface CompletionItem {
  id: string;
  label: string;        // Hebrew UI label
  completed: boolean;
  weight: number;        // Percentage points towards 100%
  step?: OnboardingStepId; // Wizard step to redirect to for completion
}

export interface CompletionResult {
  /** 0-100 percentage */
  percentage: number;
  /** Sorted list of all tracked items (completed first, then pending) */
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
    // A. Name (5%)
    {
      id: 'name',
      label: 'שם מלא',
      completed: !!profile.core?.name && profile.core.name.trim().length > 0,
      weight: 5,
      step: 'PERSONAL_STATS',
    },
    // B. DOB (5%)
    {
      id: 'dob',
      label: 'תאריך לידה',
      completed: !!profile.core?.birthDate,
      weight: 5,
      step: 'PERSONAL_STATS',
    },
    // C. Weight (10%)
    {
      id: 'weight',
      label: 'משקל',
      completed: !!profile.core?.weight && profile.core.weight > 0,
      weight: 10,
      step: 'PERSONAL_STATS',
    },
    // D. Goals (10%)
    {
      id: 'goals',
      label: 'מטרות ותוכנית',
      completed: !!(profile.progression?.domains && Object.keys(profile.progression.domains).length > 0),
      weight: 10,
      step: 'PERSONA',
    },
    // E. Persona (10%)
    {
      id: 'persona',
      label: 'סגנון חיים',
      completed: !!profile.personaId,
      weight: 10,
      step: 'PERSONA',
    },
    // F. Schedule (15%)
    {
      id: 'schedule',
      label: 'לוח אימונים',
      completed: !!(profile.lifestyle?.scheduleDays && profile.lifestyle.scheduleDays.length > 0),
      weight: 15,
      step: 'SCHEDULE',
    },
    // G. Location (10%) — authorityId OR affiliations count
    {
      id: 'location',
      label: 'מיקום ועיר',
      completed: !!profile.core?.authorityId ||
                 !!((profile as any).affiliations && Object.keys((profile as any).affiliations).length > 0),
      weight: 10,
      step: 'LOCATION',
    },
    // H. Equipment (15%)
    {
      id: 'equipment',
      label: 'ציוד אימון',
      completed: (profile.equipment?.home?.length ?? 0) > 0 ||
                 (profile.equipment?.outdoor?.length ?? 0) > 0,
      weight: 15,
      step: 'EQUIPMENT',
    },
    // I. Health Declaration (10%)
    {
      id: 'health',
      label: 'הצהרת בריאות',
      completed: !!(profile as any)?.healthDeclarationAccepted ||
                 !!(profile.health as any)?.healthDeclarationAccepted,
      weight: 10,
      step: 'HEALTH_DECLARATION',
    },
    // J. Account (10%)
    {
      id: 'account',
      label: 'חשבון מאובטח',
      completed: !!profile.core?.email,
      weight: 10,
      step: 'ACCOUNT_SECURE',
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

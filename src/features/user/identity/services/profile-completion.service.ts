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
 *   STRENGTH TRACK (35%)         — counted only when the user has a strength track
 *     G. Goals          = 10%
 *     H. Persona        = 10%
 *     I. Schedule       = 10%
 *     J. Equipment      =  5%
 *
 *   RUNNING TRACK (35%)          — counted only when enableRunningPrograms = true
 *                                  AND the user has a running track
 *     K. Running Plan   = 20%
 *     L. Running Pace   = 15%
 *   ─────────────────────────────────────
 *   Track ownership (does this specific user have a strength/running track at
 *   all) is symmetric and independent of which track is excluded — a
 *   running-only user never sees the strength bucket, a strength-only user
 *   never sees the running bucket, and a user with both sees both. The
 *   weights are re-normalised (see rawMax/scaleFactor below) so each
 *   population can always reach 100% on exactly what applies to them —
 *   never held to items they have no track for and no way to complete.
 */

import type { UserFullProfile } from '../../core/types/user.types';
import type { OnboardingStepId } from '../../onboarding/types';
import { hasAcceptedHealthDeclaration } from '@/lib/health-declaration';
import { hasStrengthTrack, hasRunningTrack } from '@/lib/track-ownership';

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
  /**
   * Full-path override for items whose JIT completion isn't an OnboardingWizard
   * step — e.g. the running items below, since `/onboarding-new/setup` has no
   * running screens wired into its step machine at all. When set, callers should
   * navigate here directly (after seeding `gateway_track`) instead of building a
   * `/onboarding-new/setup?step=...` URL from `step`.
   */
  jitPath?: string;
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
        // Explicit authority picked in onboarding
        !!profile.core?.authorityId ||
        // Modern path: city affiliation written by addAffiliation() / persistResolvedCity()
        !!(profile.core?.affiliations?.some((a) => a.type === 'city')) ||
        // Legacy path: top-level affiliations object (old schema)
        !!((profile as any).affiliations && Object.keys((profile as any).affiliations).length > 0),
      weight: 5,
      bucket: 'basic',
      step: 'LOCATION',
    },
    {
      id: 'health',
      label: 'הצהרת בריאות',
      completed: hasAcceptedHealthDeclaration(profile as any),
      weight: 5,
      bucket: 'basic',
      step: 'HEALTH_DECLARATION',
    },
    {
      id: 'gpsAccess',
      label: 'אפשר גישה ל-GPS',
      completed: !!profile.core?.gpsEnabled,
      weight: 5,
      bucket: 'basic',
      step: 'GPS_PERMISSION' as OnboardingStepId,
    },
    {
      id: 'account',
      label: 'חשבון מאובטח',
      // A user is "secured" when ANY of the following is true:
      //   1. core.email is set (classic email-based account)
      //   2. accountStatus === 'secured' (written by onboarding ACCOUNT_SECURE step
      //      or by the post-sign-in Firestore sync in auth.service.ts)
      //   3. core.isAnonymous === false — any non-anonymous Firebase Auth user
      //      (Apple Sign-In, Google Sign-In) has a real persistent identity
      //      regardless of whether we stored their email locally.
      completed:
        !!profile.core?.email ||
        (profile as any)?.accountStatus === 'secured' ||
        (profile.core as any)?.isAnonymous === false,
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
      completed: !!profile.personas?.length,
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
      jitPath: '/onboarding-new/dynamic',
    },
    {
      id: 'runningPace',
      label: 'קצב ריצה אישי',
      completed: !!(profile.running?.paceProfile?.basePace),
      weight: 15,
      bucket: 'running',
      jitPath: '/onboarding-new/dynamic',
    },
  ];

  // Track ownership — src/lib/track-ownership.ts (shared, matches
  // home/page.tsx's hasStrengthProgram verbatim). This file previously had
  // its own inline hasStrengthTrack (domains non-empty, no NON_STRENGTH
  // exclusion) -- misclassified a pure runner as strength-track-having,
  // since progression.domains.running is a real, live key. Now a consumer
  // of the shared, correct predicate instead.
  const userHasStrengthTrack = hasStrengthTrack(profile);
  const userHasRunningTrack = hasRunningTrack(profile);

  // Filter items based on active flags AND per-user track ownership — a
  // bucket only counts (numerator or denominator) for a user who actually
  // has that track. Symmetric in both directions; weights themselves are
  // untouched, only membership in `items` changes.
  const items = allItems.filter((i) => {
    if (i.bucket === 'running') return enableRunningPrograms && userHasRunningTrack;
    if (i.bucket === 'strength') return userHasStrengthTrack;
    return true;
  });

  // Whatever buckets survived the filter above, re-normalise so the max
  // possible always = 100 — e.g. Basic (30) + Strength (35) = 65 raw for a
  // strength-only user → scale factor 100/65; Basic (30) alone = 30 raw for
  // a user with neither track yet → scale factor 100/30.
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

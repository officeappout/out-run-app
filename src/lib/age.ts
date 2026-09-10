/**
 * Age-group computation shared across server routes, Firestore rules helpers,
 * and client heartbeat code.
 *
 * Safe default: unknown birthDate → 'minor'.
 * This matches the Firestore rule sentinel (.get('ageGroup', 'minor')) so that
 * missing or not-yet-backfilled users are always treated as minors, never adults.
 */
export type AgeGroup = 'minor' | 'adult';

export function computeAgeGroup(birthDate?: Date | string | { toDate: () => Date } | null): AgeGroup {
  if (!birthDate) return 'minor';
  // A live client-side Firestore snapshot's core.birthDate is a Timestamp
  // instance, not a Date/string — duck-typed here (rather than importing
  // the Timestamp class) so this stays usable from both Admin SDK routes
  // (real Date, per complete-profile/route.ts) and client hooks reading
  // useUserStore's profile snapshot directly.
  const bd =
    typeof birthDate === 'object' && 'toDate' in birthDate && typeof birthDate.toDate === 'function'
      ? birthDate.toDate()
      : new Date(birthDate as Date | string);
  if (isNaN(bd.getTime())) return 'minor';
  const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}

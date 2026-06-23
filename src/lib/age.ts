/**
 * Age-group computation shared across server routes, Firestore rules helpers,
 * and client heartbeat code.
 *
 * Safe default: unknown birthDate → 'minor'.
 * This matches the Firestore rule sentinel (.get('ageGroup', 'minor')) so that
 * missing or not-yet-backfilled users are always treated as minors, never adults.
 */
export type AgeGroup = 'minor' | 'adult';

export function computeAgeGroup(birthDate?: Date | string | null): AgeGroup {
  if (!birthDate) return 'minor';
  const bd = new Date(birthDate);
  if (isNaN(bd.getTime())) return 'minor';
  const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}

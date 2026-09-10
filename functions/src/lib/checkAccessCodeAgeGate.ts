/**
 * checkAccessCodeAgeGate.ts — SPEC-04 Wave C (POLICY-01, 10.09.2026)
 *
 * validateAccessCode.ts writes core.tenantId/unitId/tenantType with only an
 * auth check — completely independent of /api/user/complete-profile's own
 * under-14 age gate. Extracted as a pure function (mirrors
 * resolveAuthorTenantUnit.ts's own reasoning: unit-testable without a real
 * Firestore/Cloud-Functions harness) so the actual protective logic has its
 * own focused test, not just an integration-shaped one.
 *
 * Two real bypasses this closes (see the caller's own comment for the full
 * investigation): a user who redeems a code before ever completing identity
 * has core.birthDate missing entirely — not merely unverified, since that
 * field can ONLY be set by complete-profile/route.ts (locked via
 * firestore.rules' noLockedCoreFieldsChanged) — and the anonymous
 * "Explore Map" guest path, which never collects a birthDate at all. Both
 * fail closed: missing birthDate is "not verified", not "assume adult".
 */

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const UNDER_AGE_FLOOR_YEARS = 14;

export type AccessCodeAgeGateResult =
  | { allowed: true }
  | { allowed: false; reason: 'no-birthdate' | 'under-minimum-age' };

/**
 * `birthDateRaw` is whatever `users/{uid}.core.birthDate` holds — a
 * Firestore Timestamp in real usage (duck-typed via `.toDate()`, matching
 * this codebase's other Timestamp-unwrapping call sites), `undefined`/`null`
 * if the identity step was never completed.
 */
export function checkAccessCodeAgeGate(birthDateRaw: unknown): AccessCodeAgeGateResult {
  const birthDate =
    birthDateRaw && typeof (birthDateRaw as any).toDate === 'function'
      ? (birthDateRaw as any).toDate()
      : birthDateRaw instanceof Date
        ? birthDateRaw
        : null;

  if (!birthDate || isNaN(birthDate.getTime())) {
    return { allowed: false, reason: 'no-birthdate' };
  }

  const ageYears = (Date.now() - birthDate.getTime()) / MS_PER_YEAR;
  if (ageYears < UNDER_AGE_FLOOR_YEARS) {
    return { allowed: false, reason: 'under-minimum-age' };
  }

  return { allowed: true };
}

/**
 * adminInviteLookupOutcome.ts — SPEC-02 SEC-16
 *
 * check-email/route.ts's catch returns `{ role: null }` with HTTP 500 on
 * an unexpected server error — indistinguishable, before this fix, from a
 * clean 200 response that legitimately found no invitation. A real admin
 * hitting a transient failure was told "email not found in the system,
 * contact the administrator" instead of "try again."
 *
 * `ok: false` covers both a non-2xx HTTP response and a fetch-level
 * failure (network error) — both mean "we could not determine whether an
 * invitation exists," never "no invitation exists." Extracted here (not
 * inline in passwordless-auth.service.ts) because that module transitively
 * imports AppMap.tsx (a JSX component), which this repo's node-only,
 * no-jsdom vitest config cannot parse — a plain, zero-dependency module is
 * required for this decision to be unit-testable at all.
 */

export type AdminRole = 'super_admin' | 'system_admin' | 'authority_manager';

export function resolveInviteLookupOutcome(
  ok: boolean,
  role: AdminRole | null,
): { role: AdminRole | null; checkFailed: boolean } {
  if (!ok) return { role: null, checkFailed: true };
  return { role, checkFailed: false };
}

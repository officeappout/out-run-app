import { authorityTypeToTenantType } from '@/features/admin/config/tenantLabels';
import type { Authority } from '@/types/admin-types';

/**
 * §13.38 (27.09.2026) — decides whether a CANDIDATE authority (from
 * localStorage or the caller's own role) may be auto-loaded given the
 * page's URL ?type= context.
 *
 * Kept pure and dependency-light (no Firestore/React imports) so it stays
 * unit-testable — team/page.tsx does the actual getAuthority() fetch and
 * passes the result in. See __tests__/authorityUrlContextGuard.test.ts.
 *
 * Fail-closed: a candidate that could not be resolved (null) is treated as
 * a mismatch, never as "no constraint."
 */
export function shouldAutoLoadAuthority(candidate: Authority | null, urlType: string): boolean {
  if (!urlType) return true; // no explicit context in the URL → no constraint
  if (!candidate) return false;
  return authorityTypeToTenantType(candidate) === urlType;
}

/**
 * Pure decision for admin/dashboard/page.tsx's super-admin authority
 * resolution — extracted for testability (no React/Firebase imports,
 * so unlike the page itself, this is directly unit-testable).
 *
 * 06.10.2026 (David's bug report) — `getAllAuthorities(undefined, true)`
 * filters server-side to `parentAuthorityId === null`, and Firestore's
 * `== null` query never matches a document where the field is simply
 * ABSENT (confirmed directly against production: every military_unit
 * authority has no parentAuthorityId field at all). A saved brigade id
 * would never be found in that list, so the OLD code silently fell
 * through to `allAuths[0]` — an unrelated authority, alphabetically
 * first — instead of the real saved one. The fix: when the saved id
 * isn't in the (filtered) list, a direct by-id lookup is the real
 * fallback, checked BEFORE defaulting to allAuths[0].
 */
export function resolveSuperAdminAuthorityTarget<T extends { id: string }>(
  allAuths: T[],
  savedId: string | null,
  directLookupResult: T | null,
): T | undefined {
  const fromList = savedId ? allAuths.find((a) => a.id === savedId) : undefined;
  if (fromList) return fromList;
  if (savedId && directLookupResult) return directLookupResult;
  return allAuths[0];
}

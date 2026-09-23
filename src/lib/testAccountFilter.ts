/**
 * testAccountFilter.ts — single source of truth for "does this user doc
 * count as a real resident," used by every place that counts/aggregates
 * `users` for a number shown to an admin or authority manager.
 *
 * Two independent flags, both excluded:
 *   core.isMockData — the Sderot demo seed (10 docs, deliberate demo data,
 *                      never touched by the test-account marking below).
 *   core.isTestData — marked 23.09.2026 by scripts/mark-test-accounts.ts
 *                      (606 docs: dev/test installs, identified by
 *                      criteria approved with David — see
 *                      .claude/plans/... and that script's own header).
 *
 * Framework-agnostic (no Firebase import) so it works identically against
 * a client-SDK doc.data().core or an Admin-SDK snap.data().core — same
 * plain object shape either way.
 */

export interface TestAccountFlags {
  isMockData?: unknown;
  isTestData?: unknown;
}

export function isTestOrMockUser(core: TestAccountFlags | null | undefined): boolean {
  if (!core) return false;
  return core.isMockData === true || core.isTestData === true;
}

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

import { isDemoUser } from './demo';

export interface TestAccountFlags {
  isMockData?: unknown;
  isTestData?: unknown;
  /** Demo-world stamp (src/lib/demo.ts isDemoCore). */
  demo?: unknown;
}

export function isTestOrMockUser(core: TestAccountFlags | null | undefined): boolean {
  if (!core) return false;
  return core.isMockData === true || core.isTestData === true;
}

// ── Demo world (demo-users-design.md PR 2, owner-approved 20.10.2026) ────────


/**
 * A demo-world resident: the legacy demo flag (core.isMockData) or the new
 * demo identity (uid `demo_*` / core.demo, src/lib/demo.ts).
 */
export function isDemoResident(core: TestAccountFlags | null | undefined, uid?: string): boolean {
  return core?.isMockData === true || isDemoUser(uid, core);
}

/**
 * The one rule for every authority / unit / org dashboard number:
 *   - test accounts (core.isTestData) never count;
 *   - demo residents count ONLY on a demo authority / tenant's own dashboard;
 *   - everyone else counts.
 * On a real authority (authorityIsDemo false) this is exactly
 * isTestOrMockUser() plus the demo uid / stamp — so real numbers don't move.
 */
export function isExcludedResident(
  core: TestAccountFlags | null | undefined,
  opts: { authorityIsDemo: boolean; uid?: string },
): boolean {
  if (core?.isTestData === true) return true;
  if (isDemoResident(core, opts.uid)) return !opts.authorityIsDemo;
  return false;
}

/** Global (platform-wide) admin KPIs: test, legacy mock and demo never count. */
export function isExcludedFromGlobalKpis(core: TestAccountFlags | null | undefined, uid?: string): boolean {
  return isTestOrMockUser(core) || isDemoUser(uid, core);
}

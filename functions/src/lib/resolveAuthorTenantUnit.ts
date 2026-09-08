/**
 * resolveAuthorTenantUnit.ts — SPEC-02 SEC-09
 *
 * Resolves tenantId/unitId for a leaderboard-shard write from the
 * author's OWN protected profile (users/{uid}.core) instead of trusting
 * fields on the document that triggered the write — those are
 * client-writable and unverified by firestore.rules (onFeedPostCreate's
 * old bug: feed_posts' create rule only constrains `authorUid`, nothing
 * else on the document). Mirrors onWorkoutCreate's existing inline
 * pattern in leaderboard.ts; extracted here (only for the newly-fixed
 * caller, onFeedPostCreate — onWorkoutCreate's own copy is untouched,
 * out of SEC-09's scope) so it's unit-testable with a mocked reader
 * instead of needing a real Firestore/emulator connection.
 */

export interface DocReader {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  };
}

export async function resolveAuthorTenantUnit(
  db: DocReader,
  uid: string,
): Promise<{ tenantId: string; unitId: string }> {
  let tenantId = '_global';
  let unitId = '_all';
  try {
    const userSnap = await db.doc(`users/${uid}`).get();
    const core = (userSnap.exists ? userSnap.data()?.core : undefined) as
      | { tenantId?: string; unitId?: string }
      | undefined;
    if (core?.tenantId) tenantId = core.tenantId;
    if (core?.unitId) unitId = core.unitId;
  } catch {
    // Missing/unreadable profile -> harmless _global/_all bucket, same as
    // onWorkoutCreate's existing fallback behavior.
  }
  return { tenantId, unitId };
}

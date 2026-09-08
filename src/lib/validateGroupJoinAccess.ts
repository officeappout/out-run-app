/**
 * validateGroupJoinAccess.ts — SPEC-02 (SEC-13 / SPEC-1 t3)
 *
 * Server-side validation for joining a group by direct groupId (used by
 * /api/social/group-membership before it calls joinEngine's 'direct'
 * target). Extracted into its own pure-logic module — no firebase-admin
 * import — so it can be unit-tested with a mocked reader instead of a
 * real Admin SDK / emulator connection (this repo's convention: pure
 * logic lives in plain .ts modules kept independent of framework-only
 * guards like firebase-admin.ts's `import 'server-only'`).
 *
 * Mirrors firestore.rules' own checks for a client-SDK join
 * (groupInviteCode() / blockedByGroupPersonaGate()) — the whole reason
 * this exists is that joinEngine's 'direct' target bypasses those rules
 * via Admin SDK, so this route has to re-apply the same checks itself.
 */

export interface DocReader {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  };
}

export type GroupJoinValidation =
  | { ok: true }
  | { ok: false; error: 'group-not-found' | 'group-inactive' | 'invalid-code' | 'persona-mismatch' };

export async function validateDirectGroupJoin(
  db: DocReader,
  groupId: string,
  uid: string,
  code?: string,
): Promise<GroupJoinValidation> {
  const groupSnap = await db.doc(`community_groups/${groupId}`).get();
  if (!groupSnap.exists) return { ok: false, error: 'group-not-found' };
  const group = groupSnap.data() ?? {};
  if (group.isActive === false) return { ok: false, error: 'group-inactive' };

  const isCreator = group.createdBy === uid;
  if (!isCreator && group.isPublic !== true) {
    // Non-public (includes isLocked institutional groups) requires the
    // real invite code — same source of truth as firestore.rules'
    // groupInviteCode() (SPEC-01 task 2 / SPEC-02 Wave 0).
    const inviteSnap = await db.doc(`community_groups/${groupId}/private/invite`).get();
    const realCode = inviteSnap.exists ? (inviteSnap.data()?.code as string | undefined) : undefined;
    if (!code || !realCode || code.trim().toUpperCase() !== realCode) {
      return { ok: false, error: 'invalid-code' };
    }
  }

  // Reserve/persona-gated group — mirrors firestore.rules'
  // blockedByGroupPersonaGate() (community_groups_reserve/{groupId}
  // existing + military_declarations/{uid}.status == 'reserve').
  const reserveSnap = await db.doc(`community_groups_reserve/${groupId}`).get();
  if (reserveSnap.exists) {
    const declSnap = await db.doc(`military_declarations/${uid}`).get();
    if (declSnap.data()?.status !== 'reserve') {
      return { ok: false, error: 'persona-mismatch' };
    }
  }

  return { ok: true };
}

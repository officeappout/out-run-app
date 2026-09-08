/**
 * resolveAdminDisplayName.ts — SPEC-02 F-06
 *
 * logAuditAction used to trust `data.adminName` straight from the client
 * payload as the audit trail's human-readable actor name — request.auth
 * gates WHO can call it (must resolve to an admin), but placed no
 * constraint on WHAT NAME they claimed while doing so. A malicious admin
 * could perform a real action under their own (unforgeable) `adminId`
 * while writing an arbitrary `adminName` — e.g. someone else's real
 * name — muddying the audit trail for anyone reading it without
 * cross-referencing `adminId` by hand.
 *
 * Fix: derive the display name server-side from the caller's own
 * protected profile (`users/{uid}.core.name`), the same field nearly
 * every real client caller was already reading to populate `adminName`
 * in the first place (grep across src/app/admin/**, src/features/admin/**
 * confirms `profile?.core?.name || user.displayName || 'Admin'` is the
 * dominant pattern) — so this preserves the displayed value for every
 * legitimate caller today while making it impossible to claim a name
 * that isn't the caller's own.
 */

export interface DocReader {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  };
}

export async function resolveAdminDisplayName(
  db: DocReader,
  uid: string,
  tokenEmail: string | undefined,
): Promise<string> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const core = (snap.exists ? snap.data()?.core : undefined) as { name?: string } | undefined;
    if (typeof core?.name === 'string' && core.name.trim().length > 0) {
      return core.name.trim().slice(0, 200);
    }
  } catch {
    // Missing/unreadable profile -> fall through to token email / uid.
  }
  return typeof tokenEmail === 'string' && tokenEmail.trim().length > 0 ? tokenEmail : uid;
}

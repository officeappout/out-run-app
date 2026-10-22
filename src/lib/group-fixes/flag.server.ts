/**
 * enable_group_fixes_v1 on the server: the real panel value, OR the caller's
 * own users/{uid}.core.isSuperAdmin (the same super-admin preview the client
 * hook gives). Fail-closed: a missing doc / key or a read error answers false.
 *
 * Reads system_config/feature_flags directly (no `server-only` import) so
 * joinEngine — which emulator suites import under vitest — can use it.
 */
import type { Firestore } from 'firebase-admin/firestore';

export const GROUP_FIXES_FLAG = 'enable_group_fixes_v1';

export function isSuperAdminDoc(userData: Record<string, unknown> | undefined): boolean {
  const core = userData?.core as { isSuperAdmin?: unknown } | undefined;
  return core?.isSuperAdmin === true;
}

export async function groupFixesOn(db: Firestore, userData?: Record<string, unknown>): Promise<boolean> {
  if (isSuperAdminDoc(userData)) return true;
  try {
    const snap = await db.collection('system_config').doc('feature_flags').get();
    return snap.exists && snap.data()?.[GROUP_FIXES_FLAG] === true;
  } catch (err) {
    console.warn(`[group-fixes] ${GROUP_FIXES_FLAG} read failed — off`, err);
    return false;
  }
}

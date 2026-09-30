/**
 * Resolves whether `uid` is a manager of some authority, via
 * `authorities.managerIds` — server-side only (Admin SDK), never trusts a
 * client-supplied claim.
 *
 * Extracted 30.09.2026 (00-MASTER-PLAN.md §13.58, parks Stage 4 prep): this
 * exact query existed independently in two places —
 * `firebase-admin.ts`'s `computeAdminScope` (classification: does this uid
 * get tagged `scope: 'authority_manager'`?) and
 * `park-write.service.ts`'s `resolveParkWriteCaller` (authorization: which
 * authority does this uid get write access to?) — each documenting the
 * other as its mirror rather than sharing code. A third, near-identical
 * copy would have been needed for contribution-approval scope resolution.
 * David's condition for this extraction: fully transparent — both existing
 * call sites keep their exact prior behavior, proven by their own test
 * suites passing unchanged.
 */
import type { Firestore } from 'firebase-admin/firestore';

export interface AuthorityManagerScope {
  authorityId: string;
}

/**
 * Returns the FIRST matching authority only (`.limit(1)`) — matches both
 * prior implementations exactly. A uid present in more than one authority's
 * `managerIds` resolves to whichever Firestore returns first, unchanged
 * from before this extraction.
 */
export async function resolveAuthorityManagerScope(
  db: Firestore,
  uid: string,
): Promise<AuthorityManagerScope | null> {
  const managerSnap = await db
    .collection('authorities')
    .where('managerIds', 'array-contains', uid)
    .limit(1)
    .get();
  if (managerSnap.empty) return null;
  return { authorityId: managerSnap.docs[0].id };
}

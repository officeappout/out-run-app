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
 *
 * `requestedAuthorityId` (21.10.2026, demo viewer PR 5): the authority the
 * panel is SHOWING. Honoured only when that authority's own doc lists `uid`
 * in managerIds (one by-id read) — a manager of several authorities (the
 * owner's demo viewer manages 3 demo cities + 3 demo units) then gets the
 * numbers of the city on screen, not of whichever doc came first. Anything
 * else (absent, malformed, not a manager of it) falls back to the exact
 * prior behaviour, so a client-supplied id can never widen access.
 */
export async function resolveAuthorityManagerScope(
  db: Firestore,
  uid: string,
  requestedAuthorityId?: string | null,
): Promise<AuthorityManagerScope | null> {
  if (typeof requestedAuthorityId === 'string' && requestedAuthorityId && requestedAuthorityId.length <= 200 && !requestedAuthorityId.includes('/')) {
    try {
      const snap = await db.collection('authorities').doc(requestedAuthorityId).get();
      const managers = snap.exists ? (snap.data()?.managerIds as unknown) : undefined;
      if (Array.isArray(managers) && managers.includes(uid)) return { authorityId: requestedAuthorityId };
    } catch {
      /* fall through to the default resolution */
    }
  }
  const managerSnap = await db
    .collection('authorities')
    .where('managerIds', 'array-contains', uid)
    .limit(1)
    .get();
  if (managerSnap.empty) return null;
  return { authorityId: managerSnap.docs[0].id };
}

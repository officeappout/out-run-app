/**
 * Partner finder — which community_groups to listen to (architecture audit,
 * 19.10.2026). Pure: no Firebase import; usePartnerData turns the specs into
 * queries.
 *
 * Was ONE listener on every active group in the country (isActive == true,
 * no limit, no area), re-materialized on every change anywhere. Now:
 *   - 'authority': the groups of the user's own authority (profile
 *     core.authorityId), newest first, capped — the partner finder only
 *     shows sessions near the user anyway;
 *   - 'fallback': a user with no authority yet gets the newest active groups,
 *     capped (bounded, instead of all of them);
 *   - 'mine': the user's own groups by id (chunks of 30, Firestore's `in`
 *     cap), so a group they belong to in another authority — or past the cap —
 *     still shows. isActive is checked client-side for these
 *     (isPartnerGroupVisible), so an inactive one just doesn't render.
 * Index: community_groups authorityId ASC + isActive ASC + createdAt DESC
 * (firestore.indexes.json); the fallback uses isActive ASC + createdAt DESC.
 */

export const PARTNER_GROUPS_AUTHORITY_LIMIT = 200;
export const PARTNER_GROUPS_FALLBACK_LIMIT = 100;
const IN_CAP = 30;

export type PartnerGroupQuerySpec =
  | { kind: 'authority'; authorityId: string; limit: number }
  | { kind: 'fallback'; limit: number }
  | { kind: 'mine'; ids: string[] };

export function partnerGroupQuerySpecs(authorityId: string | null | undefined, myGroupIds: readonly string[]): PartnerGroupQuerySpec[] {
  const specs: PartnerGroupQuerySpec[] = authorityId
    ? [{ kind: 'authority', authorityId, limit: PARTNER_GROUPS_AUTHORITY_LIMIT }]
    : [{ kind: 'fallback', limit: PARTNER_GROUPS_FALLBACK_LIMIT }];
  const ids = Array.from(new Set(myGroupIds.filter((id) => typeof id === 'string' && id.length > 0)));
  for (let i = 0; i < ids.length; i += IN_CAP) specs.push({ kind: 'mine', ids: ids.slice(i, i + IN_CAP) });
  return specs;
}

/**
 * Should this group's slots be materialized for this user? Active only, and
 * private groups (isPublic === false) only for their members — the same
 * hybrid visibility rule as before; groups without isPublic (legacy) count as
 * public.
 */
export function isPartnerGroupVisible(
  id: string,
  data: { isActive?: unknown; isPublic?: unknown },
  memberSet: ReadonlySet<string>,
): boolean {
  if (data.isActive !== true) return false;
  if (data.isPublic === false && !memberSet.has(id)) return false;
  return true;
}

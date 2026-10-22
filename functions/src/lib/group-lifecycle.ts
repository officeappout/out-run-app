/**
 * Group lifecycle predicates (group audit P1-5, 22.10.2026) — pure, unit-tested.
 *
 * "Inactive" meant two different things and the code treated them as one:
 *   - PENDING: created with minimumMembers > 1 and not yet reached (createGroup
 *     writes isActive = minimumMembers <= 1), never activated;
 *   - DEACTIVATED: an admin switched the group off (community-groups overview
 *     toggle) or moderation removed it (moderationState 'removed').
 * Before: onGroupMemberWrite re-activated a DEACTIVATED group on any member
 * write (re-joins, role changes — even a moderation-removed one), and
 * deleteZombieGroups hard-deleted every inactive group older than 24 h —
 * including every deactivated one. Now only a PENDING group is auto-activated
 * (and stamped activatedAt) or swept.
 */

type GroupDoc = Record<string, unknown> | undefined;

/** Never activated, still waiting for its minimum — the only "zombie" candidate. */
export function isPendingActivation(group: GroupDoc): boolean {
  if (!group || group.isActive !== false) return false;
  if (group.moderationState === 'removed') return false;
  if (group.activatedAt != null) return false;
  if (group.type === 'ephemeral') return false;
  const min = typeof group.minimumMembers === 'number' ? group.minimumMembers : 1;
  return min > 1;
}

/** onGroupMemberWrite: flip isActive on only for a pending group that reached its minimum. */
export function shouldAutoActivate(group: GroupDoc, memberCount: number): boolean {
  if (!isPendingActivation(group)) return false;
  const min = typeof group?.minimumMembers === 'number' ? group.minimumMembers : 1;
  return memberCount >= min;
}

/** deleteZombieGroups: a pending group nobody completed within the grace window. */
export function isZombieGroup(group: GroupDoc): boolean {
  if (!isPendingActivation(group)) return false;
  // Legacy guard: groups activated before activatedAt existed carry no stamp.
  // One that ever reached its minimum is not a zombie, whatever isActive says.
  const min = typeof group?.minimumMembers === 'number' ? group.minimumMembers : 1;
  const count = typeof group?.memberCount === 'number' ? group.memberCount : 0;
  return count < min;
}

/** Ephemeral run-invite groups never feed group boards or group pushes (P1-13 / P1-14). */
export function isEphemeralGroup(group: GroupDoc): boolean {
  return group?.type === 'ephemeral';
}

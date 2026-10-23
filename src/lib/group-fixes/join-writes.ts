/**
 * Pure decisions behind joinEngine's group-fixes writes (unit-tested).
 *
 *  - memberRoleField: the `role` key of the member write. A re-join NEVER
 *    rewrites the role (the old unconditional role:'member' + merge demoted
 *    admins / leaders) — that part is a plain bug fix, not flag-gated. With
 *    enable_group_fixes_v1 the group's designated leader (leaderUserId) joins
 *    as / is promoted to 'admin'.
 *  - shouldSyncGroupChat: the joiner goes into chats/group_{groupId} with the
 *    membership (fixes on; never for ephemeral run groups — they have no chat).
 *  - attendanceCountDelta: a session-token join adds 1 to currentCount only
 *    when the uid is not already an attendee (fixes on).
 */

export type MemberRole = 'member' | 'admin';

export function memberRoleField(input: {
  alreadyMember: boolean;
  existingRole?: unknown;
  isDesignatedLeader: boolean;
  fixesOn: boolean;
}): { role?: MemberRole } {
  const promote = input.fixesOn && input.isDesignatedLeader;
  if (!input.alreadyMember) return { role: promote ? 'admin' : 'member' };
  if (promote && input.existingRole !== 'admin') return { role: 'admin' };
  return {};
}

export function shouldSyncGroupChat(input: { fixesOn: boolean; groupType?: unknown }): boolean {
  return input.fixesOn && input.groupType !== 'ephemeral';
}

export function attendanceCountDelta(input: { fixesOn: boolean; attendees?: unknown; uid: string }): number {
  if (!input.fixesOn) return 0;
  const list = Array.isArray(input.attendees) ? input.attendees : [];
  return list.includes(input.uid) ? 0 : 1;
}

export function groupChatId(groupId: string): string {
  return `group_${groupId}`;
}

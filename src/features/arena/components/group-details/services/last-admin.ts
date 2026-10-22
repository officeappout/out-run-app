/**
 * Leave guard (enable_group_fixes_v1): the last admin — the creator counts as
 * one — may not leave a group that would be left without anyone to run it.
 * They hand over first (make another member admin) or the group is deleted
 * from the management sheet. Pure, unit-tested.
 */
export function isLastGroupAdmin(input: {
  userId: string | undefined;
  createdBy?: string;
  members: { uid: string; role?: string }[];
}): boolean {
  const { userId, createdBy, members } = input;
  if (!userId) return false;
  const admins = new Set(members.filter((m) => m.role === 'admin').map((m) => m.uid));
  if (createdBy && members.some((m) => m.uid === createdBy)) admins.add(createdBy);
  if (createdBy === userId) admins.add(userId);
  return admins.has(userId) && admins.size === 1;
}

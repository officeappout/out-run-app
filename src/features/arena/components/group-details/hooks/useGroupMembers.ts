'use client';

import { useState, useEffect, useCallback } from 'react';
import { getGroupMembers, makeGroupAdmin, removeGroupAdmin, removeGroupMember } from '@/features/arena/services/group.service';
import type { GroupMember } from '@/types/community.types';

/**
 * The member list (one read per open) + owner/admin moderation: promote /
 * demote, and remove-with-confirmation.
 */
export function useGroupMembers(isOpen: boolean, groupId: string) {
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [activeActionUid, setActiveActionUid] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null); // uid with in-flight action

  useEffect(() => {
    if (!isOpen || !groupId) { setGroupMembers([]); return; }
    let cancelled = false;
    setMembersLoading(true);
    getGroupMembers(groupId).then((members) => {
      if (!cancelled) setGroupMembers(members);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setMembersLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, groupId]);

  const handleToggleAdmin = useCallback(async (member: GroupMember) => {
    if (!groupId || actionPending) return;
    setActionPending(member.uid);
    try {
      if (member.role === 'member') {
        await makeGroupAdmin(groupId, member.uid);
        setGroupMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, role: 'admin' } : m));
      } else {
        await removeGroupAdmin(groupId, member.uid);
        setGroupMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, role: 'member' } : m));
      }
      setActiveActionUid(null);
    } catch (err) {
      console.error('[GroupDetailsDrawer] toggle admin failed:', err);
    } finally {
      setActionPending(null);
    }
  }, [groupId, actionPending]);

  const handleRemoveMember = useCallback(async (member: GroupMember) => {
    if (!groupId || actionPending) return;
    setConfirmRemove(member);
    setActiveActionUid(null);
  }, [groupId, actionPending]);

  const confirmRemoveMember = async () => {
    if (!groupId || !confirmRemove) return;
    setRemovingUid(confirmRemove.uid);
    try {
      await removeGroupMember(groupId, confirmRemove.uid);
      setGroupMembers((prev) => prev.filter((m) => m.uid !== confirmRemove.uid));
      setConfirmRemove(null);
    } catch (err) {
      console.error('[GroupDetailsDrawer] remove member failed:', err);
    } finally {
      setRemovingUid(null);
    }
  };

  return {
    groupMembers,
    membersLoading,
    confirmRemove,
    setConfirmRemove,
    removingUid,
    activeActionUid,
    setActiveActionUid,
    actionPending,
    handleToggleAdmin,
    handleRemoveMember,
    confirmRemoveMember,
  };
}

import { useCallback } from 'react';
import type { useRouter } from 'next/navigation';
import { joinGroup, leaveGroup } from '@/features/arena/services/group.service';
import { joinEvent } from '@/features/admin/services/community.service';
import { addCommunitySessionsToPlanner } from '@/features/user/scheduling/services/communitySchedule.service';
import type { CommunityEvent, CommunityGroup } from '@/types/community.types';
import { eventJoinSuccess, groupJoinSuccess } from '../_lib/community-logic';
import type { CommunityOverlaysState } from './useCommunityOverlays';

/**
 * Join / leave / planner / group-created handlers and the guarded "create
 * community" entry point.
 */
export function useCommunityJoinActions({
  overlays,
  userId,
  userName,
  photoURL,
  groups,
  events,
  profileId,
  profileName,
  refreshProfile,
  router,
}: {
  overlays: CommunityOverlaysState;
  userId: string | undefined;
  userName: string;
  photoURL: string | null | undefined;
  groups: CommunityGroup[];
  events: CommunityEvent[];
  profileId: string | undefined;
  profileName: string | undefined;
  refreshProfile: () => Promise<unknown>;
  router: ReturnType<typeof useRouter>;
}) {
  const {
    selectedGroup,
    setSelectedGroup,
    selectedEvent,
    setSelectedEvent,
    setJoinedGroupIds,
    setJoinedEventIds,
    setJoiningId,
    successData,
    setSuccessData,
    editGroupId,
    setEditGroupId,
    setWizardOpen,
  } = overlays;

  // ── Join handlers ────────────────────────────────────────────────────────
  const handleJoinGroup = useCallback(async (groupId: string) => {
    if (!userId) return;
    setJoiningId(groupId);
    try {
      await joinGroup(groupId, userId, userName, { addToPlanner: false });
      setJoinedGroupIds((prev) => new Set([...Array.from(prev), groupId]));
      const group = groups.find((g) => g.id === groupId) ?? selectedGroup;
      setSelectedGroup(null);
      if (group) {
        setSuccessData(groupJoinSuccess(group));
      }
    } catch (err) {
      console.error('[CommunityPage] joinGroup failed:', err);
    } finally {
      setJoiningId(null);
    }
  }, [userId, userName, groups, selectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps -- state setters are stable

  const handleJoinEvent = useCallback(async (eventId: string) => {
    if (!userId) return;
    setJoiningId(eventId);
    try {
      await joinEvent(eventId, userId, userName, photoURL ?? undefined);
      setJoinedEventIds((prev) => new Set([...Array.from(prev), eventId]));
      const event = events.find((e) => e.id === eventId) ?? selectedEvent;
      setSelectedEvent(null);
      if (event) {
        setSuccessData(eventJoinSuccess(event));
      }
    } catch (err) {
      console.error('[CommunityPage] joinEvent failed:', err);
    } finally {
      setJoiningId(null);
    }
  }, [userId, userName, photoURL, events, selectedEvent]); // eslint-disable-line react-hooks/exhaustive-deps -- state setters are stable

  const handleLeaveGroup = useCallback(async (groupId: string) => {
    if (!userId) return;
    try {
      await leaveGroup(groupId, userId);
      setJoinedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    } catch (err) {
      console.error('[CommunityPage] leaveGroup failed:', err);
    }
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps -- state setters are stable

  const handlePlannerPref = useCallback(
    (addToPlanner: boolean) => {
      if (!addToPlanner || !userId || !successData?.groupId || !successData.scheduleSlots?.length) return;
      addCommunitySessionsToPlanner(
        userId,
        successData.groupId,
        successData.name,
        successData.category ?? 'other',
        successData.scheduleSlots,
      ).catch((err) => console.warn('[CommunityPage] planner sync failed:', err));
    },
    [userId, successData],
  );

  const handleGroupCreated = useCallback(
    async (groupId: string) => {
      setWizardOpen(false);
      setEditGroupId(null);
      if (!editGroupId) {
        // New group: immediately mark as joined in local state
        setJoinedGroupIds((prev) => new Set([...Array.from(prev), groupId]));
      }
      try { await refreshProfile(); } catch { /* non-fatal */ }
    },
    [refreshProfile, editGroupId], // eslint-disable-line react-hooks/exhaustive-deps -- state setters are stable
  );

  // ── Guarded "create community" entry point ────────────────────────────────
  // Intercepts the tap before the wizard mounts so the user never fills in
  // multiple steps only to be interrupted on submission.
  const handleCreatePress = useCallback(() => {
    if (!profileId || !profileName) {
      router.push('/onboarding-new/profile?context=profile-only');
      return;
    }
    setWizardOpen(true);
  }, [profileId, profileName, router]); // eslint-disable-line react-hooks/exhaustive-deps -- state setters are stable

  return {
    handleJoinGroup,
    handleJoinEvent,
    handleLeaveGroup,
    handlePlannerPref,
    handleGroupCreated,
    handleCreatePress,
  };
}

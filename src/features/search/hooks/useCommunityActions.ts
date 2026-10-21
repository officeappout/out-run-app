'use client';

/**
 * Join / leave / details for groups and events inside unified search — the same services and
 * success flow today's search tabs use (joinGroup, joinEvent, PostJoinSuccessDrawer, planner
 * sync), so joining from either screen behaves identically.
 */
import { useCallback, useEffect, useState } from 'react';
import { useUserStore } from '@/features/user';
import { joinGroup, leaveGroup } from '@/features/arena/services/group.service';
import { joinEvent } from '@/features/admin/services/community.service';
import { addCommunitySessionsToPlanner } from '@/features/user/scheduling/services/communitySchedule.service';
import type { CommunityEvent, CommunityGroup, ScheduleSlot } from '@/types/community.types';

const GROUP_VERB: Record<string, string> = { walking: 'ילך', running: 'ירוץ', yoga: 'יתאמן', calisthenics: 'יתאמן', cycling: 'ירכב', other: 'יתאמן' }; // i18n-allow-hebrew: verb fragment composed by arena PostJoinSuccessDrawer (outside this folder), wave 2I
const EVENT_VERB: Record<string, string> = { race: 'ירוץ', fitness_day: 'יתאמן', workshop: 'ישתתף', community_meetup: 'ישתתף', other: 'יתאמן' }; // i18n-allow-hebrew: verb fragment composed by arena PostJoinSuccessDrawer (outside this folder), wave 2I

export interface JoinSuccess {
  name: string;
  verb: string;
  groupId?: string;
  scheduleSlots?: ScheduleSlot[];
  category?: string;
  address?: string;
}

export function useCommunityActions() {
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id ?? null;
  const userName = profile?.core?.name ?? 'משתמש'; // i18n-allow-hebrew: fallback member name written to Firestore (joinGroup / joinEvent), data
  const photoURL = profile?.core?.photoURL;

  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [success, setSuccess] = useState<JoinSuccess | null>(null);

  const savedIds = profile?.social?.groupIds;
  useEffect(() => {
    if (!savedIds?.length) return;
    setJoinedGroupIds((prev) => {
      const merged = new Set(prev);
      for (const id of savedIds) merged.add(id);
      return merged.size !== prev.size ? merged : prev;
    });
  }, [savedIds]);

  const joinGroupById = useCallback(async (group: CommunityGroup) => {
    if (!userId) return;
    setJoiningId(group.id);
    try {
      await joinGroup(group.id, userId, userName, { addToPlanner: false });
      setJoinedGroupIds((prev) => new Set(Array.from(prev).concat(group.id)));
      setSelectedGroup(null);
      const slots = group.scheduleSlots?.length ? group.scheduleSlots : group.schedule ? [group.schedule] : [];
      setSuccess({ name: group.name, verb: GROUP_VERB[group.category] ?? 'יתאמן', groupId: group.id, scheduleSlots: slots, category: group.category, address: group.meetingLocation?.address }); // i18n-allow-hebrew: verb fragment composed by arena PostJoinSuccessDrawer (outside this folder), wave 2I
    } catch (err) {
      console.error('[unified-search] joinGroup failed:', err);
    } finally {
      setJoiningId(null);
    }
  }, [userId, userName]);

  const leaveGroupById = useCallback(async (groupId: string) => {
    if (!userId) return;
    try {
      await leaveGroup(groupId, userId);
      setJoinedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    } catch (err) {
      console.error('[unified-search] leaveGroup failed:', err);
    }
  }, [userId]);

  const joinEventById = useCallback(async (event: CommunityEvent) => {
    if (!userId) return;
    setJoiningId(event.id);
    try {
      await joinEvent(event.id, userId, userName, photoURL ?? undefined);
      setJoinedEventIds((prev) => new Set(Array.from(prev).concat(event.id)));
      setSelectedEvent(null);
      setSuccess({ name: event.name, verb: EVENT_VERB[event.category] ?? 'יתאמן' }); // i18n-allow-hebrew: verb fragment composed by arena PostJoinSuccessDrawer (outside this folder), wave 2I
    } catch (err) {
      console.error('[unified-search] joinEvent failed:', err);
    } finally {
      setJoiningId(null);
    }
  }, [userId, userName, photoURL]);

  const onPlannerPref = useCallback((addToPlanner: boolean) => {
    if (!addToPlanner || !userId || !success?.groupId || !success.scheduleSlots?.length) return;
    addCommunitySessionsToPlanner(userId, success.groupId, success.name, success.category ?? 'other', success.scheduleSlots)
      .catch((err) => console.warn('[unified-search] planner sync failed:', err));
  }, [userId, success]);

  return {
    selectedGroup, setSelectedGroup,
    selectedEvent, setSelectedEvent,
    joinedGroupIds, joinedEventIds, joiningId,
    success, setSuccess,
    joinGroup: joinGroupById, leaveGroup: leaveGroupById, joinEvent: joinEventById,
    onPlannerPref,
  };
}

export type CommunityActions = ReturnType<typeof useCommunityActions>;

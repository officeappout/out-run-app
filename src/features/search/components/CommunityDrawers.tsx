'use client';

/** The group / event details + post-join drawers (the same components today's search mounts). */
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';
import SessionDrawer from '@/features/arena/components/SessionDrawer';
import PostJoinSuccessDrawer from '@/features/arena/components/PostJoinSuccessDrawer';
import { useCommunitySessionBanner } from '@/features/arena/hooks/useCommunitySessionBanner';
import type { CommunityActions } from '../hooks/useCommunityActions';

export default function CommunityDrawers({ actions }: { actions: CommunityActions }) {
  const { sessions } = useCommunitySessionBanner();
  const a = actions;
  return (
    <>
      <GroupDetailsDrawer
        isOpen={!!a.selectedGroup}
        onClose={() => a.setSelectedGroup(null)}
        group={a.selectedGroup}
        onJoin={(id: string) => { if (a.selectedGroup?.id === id) void a.joinGroup(a.selectedGroup); }}
        onLeave={(id: string) => void a.leaveGroup(id)}
        isJoined={a.selectedGroup ? a.joinedGroupIds.has(a.selectedGroup.id) : false}
        joining={a.selectedGroup ? a.joiningId === a.selectedGroup.id : false}
        liveSession={sessions.find((s) => s.groupId === a.selectedGroup?.id)}
      />
      <SessionDrawer
        isOpen={!!a.selectedEvent}
        onClose={() => a.setSelectedEvent(null)}
        event={a.selectedEvent}
        onJoin={(id: string) => { if (a.selectedEvent?.id === id) void a.joinEvent(a.selectedEvent); }}
        isJoined={a.selectedEvent ? a.joinedEventIds.has(a.selectedEvent.id) : false}
        joining={a.selectedEvent ? a.joiningId === a.selectedEvent.id : false}
      />
      <PostJoinSuccessDrawer
        isOpen={!!a.success}
        onClose={() => a.setSuccess(null)}
        name={a.success?.name ?? ''}
        verb={a.success?.verb ?? 'יתאמן'}
        scheduleSlots={a.success?.scheduleSlots}
        category={a.success?.category}
        address={a.success?.address}
        onPlannerPref={a.onPlannerPref}
      />
    </>
  );
}

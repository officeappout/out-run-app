'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { BoardSheet, ScopePointsContent } from '@/features/arena/components/LeagueBoardSheets';
import {
  GroupDetailsDrawer, SessionDrawer, PostJoinSuccessDrawer, CreateGroupWizard, PlannedActivityComposeSheet,
} from '@/app/community/CommunityOverlays';
import type { CommunityOverlaysState } from '../_hooks/useCommunityOverlays';
import type { useCommunityJoinActions } from '../_hooks/useCommunityJoinActions';

/**
 * Drawers mounted globally for the page so deep links work in either tab:
 * group details, session, post-join success, the create-group wizard, and
 * (Home v2) the scope-points sheet + the group-walk compose sheet.
 */
export function CommunityDrawers({
  overlays,
  actions,
  userId,
  openChat,
  enableHomeV2,
  scopePointsOpen,
  setScopePointsOpen,
  groupWalkOpen,
  setGroupWalkOpen,
}: {
  overlays: CommunityOverlaysState;
  actions: ReturnType<typeof useCommunityJoinActions>;
  userId: string | undefined;
  openChat: () => void;
  enableHomeV2: boolean;
  scopePointsOpen: boolean;
  setScopePointsOpen: (open: boolean) => void;
  groupWalkOpen: boolean;
  setGroupWalkOpen: (open: boolean) => void;
}) {
  const {
    selectedGroup,
    setSelectedGroup,
    selectedEvent,
    setSelectedEvent,
    joinedGroupIds,
    joinedEventIds,
    joiningId,
    successData,
    setSuccessData,
    wizardOpen,
    setWizardOpen,
    editGroupId,
    setEditGroupId,
  } = overlays;
  const t = useT(community);
  const { handleJoinGroup, handleLeaveGroup, handleJoinEvent, handlePlannerPref, handleGroupCreated } = actions;

  return (
    <>
      <GroupDetailsDrawer
        isOpen={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
        group={selectedGroup}
        onJoin={handleJoinGroup}
        onLeave={handleLeaveGroup}
        isJoined={selectedGroup ? (joinedGroupIds.has(selectedGroup.id) || selectedGroup.createdBy === userId) : false}
        joining={selectedGroup ? joiningId === selectedGroup.id : false}
        onOpenChat={() => { setSelectedGroup(null); openChat(); }}
        onEdit={(id) => { setSelectedGroup(null); setEditGroupId(id); setWizardOpen(true); }}
      />

      <SessionDrawer
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
        onJoin={handleJoinEvent}
        isJoined={selectedEvent ? joinedEventIds.has(selectedEvent.id) : false}
        joining={selectedEvent ? joiningId === selectedEvent.id : false}
      />

      <PostJoinSuccessDrawer
        isOpen={!!successData}
        onClose={() => setSuccessData(null)}
        name={successData?.name ?? ''}
        verb={successData?.verb ?? 'יתאמן'}
        onOpenChat={() => { setSuccessData(null); openChat(); }}
        scheduleSlots={successData?.scheduleSlots}
        category={successData?.category}
        address={successData?.address}
        onPlannerPref={handlePlannerPref}
      />

      <CreateGroupWizard
        isOpen={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditGroupId(null); }}
        onSuccess={handleGroupCreated}
        editGroupId={editGroupId ?? undefined}
      />

      {enableHomeV2 && (
        <>
          <BoardSheet isOpen={scopePointsOpen} onClose={() => setScopePointsOpen(false)} title={t('communityPage.scopePoints.title')}>
            <ScopePointsContent />
          </BoardSheet>
          <PlannedActivityComposeSheet
            isOpen={groupWalkOpen}
            onClose={() => setGroupWalkOpen(false)}
            initialType="walking"
          />
        </>
      )}
    </>
  );
}

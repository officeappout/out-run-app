'use client';

/**
 * GroupDetailsDrawer — the group page bottom sheet.
 *
 * This file only composes: data access lives in ./group-details/hooks (and
 * ./group-details/services), pure logic in ./group-details/utils (tested),
 * and every block of the page is a render-only section in
 * ./group-details/sections. The order of the hook calls below is
 * load-bearing — it is the order the effects ran in when this was a single
 * file (scroll chain → invite code → GPS courtesy prompt → next-session
 * attendance → week-tab reset → member list → fallback live session); keep it.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Dumbbell, Flag, Target } from 'lucide-react';
import GroupSheetFrame from './group-details/GroupSheetFrame';
import type { CommunityGroup, EventRegistration, LiveSessionPhase } from '@/types/community.types';
import type { UpcomingSession } from '@/features/arena/hooks/useCommunitySessionBanner';
import { useGroupLiveSession } from '@/features/arena/hooks/useGroupLiveSession';
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import GroupLeagueStatsBoard from './GroupLeagueStatsBoard';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { computeNextSession as computeNextSessionBooking } from '@/features/arena/services/booking.service';
import { useToast } from '@/components/ui/Toast';
import { stashPendingPlannedRun } from '@/lib/planned-run';
import { PEEK_Y_PX, canDropInTo, haversineKm, isLiveSessionPhase, resolveGroupSlots } from './group-details/utils/group-details-logic';
import { deriveGroupPageView } from './group-details/utils/group-page-view';
import { useGroupSheetMotion } from './group-details/hooks/useGroupSheetMotion';
import { useGroupInviteCode } from './group-details/hooks/useGroupInviteCode';
import { useNextSessionBooking } from './group-details/hooks/useNextSessionBooking';
import { useWeekSessions } from './group-details/hooks/useWeekSessions';
import { useGroupMembers } from './group-details/hooks/useGroupMembers';
import { useGroupJoinActions } from './group-details/hooks/useGroupJoinActions';
import {
  GroupHero, GroupLiveBanner, GroupTitleTags, NextSessionCard, FullScheduleList, DropInJoinPrompt, WhoIsComingSection,
  GroupMemberList, GroupLocationCard, GroupChipList, GroupRulesCard, GroupOrganizerActions, StartScheduledRunButton,
  GroupShareRow, InviteCodePanel, GroupMembershipActions, RegistrationLinkButton, GroupJoinSection, GroupDrawerOverlays,
} from './group-details/sections';

interface GroupDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  group: CommunityGroup | null;
  members?: EventRegistration[];
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void | Promise<void>;
  isJoined?: boolean;
  joining?: boolean;
  socialUnlocked?: boolean;
  onOpenChat?: () => void;
  /** Called with groupId when creator taps 'ערוך קהילה'. Only shown to the creator. */
  onEdit?: (groupId: string) => void;
  /** Live session from useCommunitySessionBanner — shows a phase banner at the top of the drawer */
  liveSession?: UpcomingSession;
  /** DEV only — fires when the dev phase override changes in the banner, so parent card badge updates too */
  onLivePhaseChange?: (groupId: string, phase: LiveSessionPhase | null) => void;
}

export default function GroupDetailsDrawer({
  isOpen,
  onClose,
  group,
  members: _members,
  onJoin,
  onLeave,
  isJoined,
  joining,
  socialUnlocked: _socialUnlocked = true,
  onOpenChat,
  onEdit,
  liveSession,
  onLivePhaseChange,
}: GroupDetailsDrawerProps) {
  // ── ALL hooks MUST be at the top, before any conditional return ──
  const [navOpen, setNavOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // GPS comes from the shared store (driven by useGPS); no local watcher here.
  const userCoords = useGPSStore((s) => s.coords);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Sheet gesture state
  const { y, opacity, dragControls, scrollRef } = useGroupSheetMotion(isOpen, onClose);
  const { showToast } = useToast();
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  // Home v2 (enable_home_v2): the design-lab group page.
  const v2 = useFeatureFlags(!!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin).flags.enableHomeV2;
  const userId = profile?.id ?? '';
  const userName = profile?.core?.name || 'משתמש';
  const userPhoto = profile?.core?.photoURL ?? null;

  const fetchedInviteCode = useGroupInviteCode(isOpen, group, isJoined, userId);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleMgrOpen, setScheduleMgrOpen] = useState(false);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  // Premium UX: when the drawer opens without a fix, courtesy-prompt for GPS
  // so the user can see nearby sessions — but only if they haven't denied us.
  useEffect(() => {
    if (!isOpen) return;
    useGPSStore.getState().requestPermissionIfAllowed();
  }, [isOpen]);

  const handleLocationClick = useCallback(
    (lat: number, lng: number) => {
      if (!userCoords) { setNavOpen(true); return; }
      const km = haversineKm(userCoords.lat, userCoords.lng, lat, lng);
      if (km <= 2) {
        onClose();
        window.location.href = `/map?lat=${lat}&lng=${lng}`;
      } else {
        setNavOpen(true);
      }
    },
    [userCoords, onClose],
  );

  // Pre-compute slot data (safe even when group is null)
  const allSlots = resolveGroupSlots(group);
  const nextSessionData = computeNextSessionBooking(allSlots);
  const nextSlot = nextSessionData?.slot ?? null;

  const groupId = group?.id ?? '';
  const nsd = nextSessionData?.date ?? '';
  const nst = nextSessionData?.time ?? '';

  const { attendance, isBooked, isWaitlisted, bookingLoading, handleBookSession } = useNextSessionBooking({
    isOpen, groupId, nsd, nst, nextSlot, userId, userName, userPhoto,
  });
  const { whoTab, setWhoTab, weekSessions, weekLoading, loadWeekSessions } = useWeekSessions(groupId, group);
  const members = useGroupMembers(isOpen, groupId);

  // ── Non-member live session — fires when drawer is open and no parent liveSession ──
  const fallbackLiveSession = useGroupLiveSession(group, isOpen && !liveSession);
  const effectiveLiveSession = liveSession ?? fallbackLiveSession;

  const join = useGroupJoinActions({ group, userId, userName, userPhoto, effectiveLiveSession, onJoin, onLeave, onClose, showToast });

  // ── Early return AFTER all hooks ──────────────────────────────
  if (!group) return null;

  const isCreator = userId === group.createdBy;
  const isCurrentUserAdmin = isCreator || members.groupMembers.some((m) => m.uid === userId && m.role === 'admin');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userAuthorityId = (profile as any)?.core?.authorityId ?? null;
  const canDropIn = canDropInTo(group, userAuthorityId);

  const view = deriveGroupPageView(group, nextSlot, nextSessionData, attendance?.currentCount, process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
  const { catConfig, destLat, destLng, destAddress, scheduledRunActivity } = view;

  // v2 (enable_home_v2): a scheduled solo run gets a start action that opens
  // the free-run drawer pre-filled with the settings saved with it
  // (`plannedRun` on the group doc; re-validated, invalid → plain defaults).
  const showStartScheduledRun = v2 && !!scheduledRunActivity && (!!isJoined || isCreator);
  const handleStartScheduledRun = () => {
    if (!scheduledRunActivity) return;
    stashPendingPlannedRun(scheduledRunActivity, (group as { plannedRun?: unknown }).plannedRun);
    onClose();
    router.push(`/map?openRun=${scheduledRunActivity}`);
  };

  const closeScheduleMgr = () => { setScheduleMgrOpen(false); setEditingSlotIndex(null); };

  return (
    <>
      <GroupSheetFrame
        isOpen={isOpen}
        onClose={onClose}
        v2={v2}
        y={y}
        opacity={opacity}
        dragControls={dragControls}
        peekY={PEEK_Y_PX}
        ariaLabel={group.name}
      >
        <GroupHero v2={v2} name={group.name} coverImage={view.coverImage} catConfig={catConfig} dragControls={dragControls} onClose={onClose} />

        {/* ── Scrollable content ─────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-8 space-y-5" dir="rtl">
          {effectiveLiveSession && isLiveSessionPhase(effectiveLiveSession.phase) && (
            <GroupLiveBanner
              session={effectiveLiveSession}
              isJoined={isJoined}
              canDropIn={canDropIn}
              isCityOnly={group.isCityOnly}
              destAddress={destAddress}
              onClose={onClose}
              onDropIn={join.handleDropIn}
              onLivePhaseChange={onLivePhaseChange}
            />
          )}

          <GroupTitleTags v2={v2} name={group.name} tags={view.effectiveTags} />

          {nextSessionData && !(liveSession && isLiveSessionPhase(liveSession.phase)) && (
            <NextSessionCard
              v2={v2}
              nextSessionData={nextSessionData}
              nextSlot={nextSlot}
              categoryLabel={catConfig.label}
              spotsLeft={view.spotsLeft}
              isFull={view.isFull}
              effectivePrice={view.effectivePrice}
              isJoined={isJoined}
              bookingLoading={bookingLoading}
              isBooked={isBooked}
              isWaitlisted={isWaitlisted}
              onBook={handleBookSession}
              hasMultipleSlots={allSlots.length > 1}
              scheduleOpen={scheduleOpen}
              onToggleSchedule={() => setScheduleOpen(!scheduleOpen)}
            />
          )}

          {scheduleOpen && allSlots.length > 1 && (
            <FullScheduleList v2={v2} group={group} slots={allSlots} nextSlot={nextSlot} destAddress={destAddress} />
          )}

          {join.showJoinPrompt && (
            <DropInJoinPrompt joining={join.joiningGroup} onJoin={join.handleJoinFromPrompt} onDismiss={() => join.setShowJoinPrompt(false)} />
          )}

          {allSlots.length > 0 && (
            <WhoIsComingSection
              v2={v2}
              whoTab={whoTab}
              onSelectNext={() => setWhoTab('next')}
              onSelectWeek={() => { setWhoTab('week'); loadWeekSessions(); }}
              nextSessionData={nextSessionData}
              attendance={attendance}
              weekLoading={weekLoading}
              weekSessions={weekSessions}
            />
          )}

          {/* Description — fully visible, no clamp */}
          {group.description && (
            <p className={v2 ? 'text-[14px] font-semibold leading-relaxed text-v2-ink-2' : 'text-sm text-gray-600 dark:text-gray-400 leading-relaxed'}>
              {group.description}
            </p>
          )}

          {/* ── v2: the group's league this week — points, steps points, km ── */}
          {v2 && (isJoined || isCreator) && <GroupLeagueStatsBoard groupId={group.id} timeWindow="weekly" />}

          {(isJoined || isCreator) && (
            <GroupMemberList
              v2={v2}
              members={members.groupMembers}
              loading={members.membersLoading}
              createdBy={group.createdBy}
              userId={userId}
              isCreator={isCreator}
              isCurrentUserAdmin={isCurrentUserAdmin}
              activeActionUid={members.activeActionUid}
              onToggleActions={members.setActiveActionUid}
              actionPending={members.actionPending}
              onToggleAdmin={members.handleToggleAdmin}
              onRemove={members.handleRemoveMember}
            />
          )}

          <GroupLocationCard
            hasCoords={view.hasCoords}
            destLat={destLat}
            destLng={destLng}
            destAddress={destAddress}
            staticMapUrl={view.staticMapUrl}
            isMilitaryGroup={view.isMilitaryGroup}
            onOpen={handleLocationClick}
          />

          {/* Target Muscles (slot override → group default) */}
          {view.effectiveMuscles.length > 0 && (
            <GroupChipList
              v2={v2}
              icon={<Target className="w-3.5 h-3.5 text-cyan-500" />}
              title="קבוצות שרירים"
              items={view.effectiveMuscles}
              tone="cyan"
            />
          )}

          {/* Equipment (slot override → group default) */}
          {view.effectiveEquipment.length > 0 && (
            <GroupChipList
              v2={v2}
              icon={<Dumbbell className="w-3.5 h-3.5 text-emerald-500" />}
              title="ציוד נדרש"
              items={view.effectiveEquipment}
              tone="emerald"
            />
          )}

          {/* Price (slot override → group default) */}
          {view.hasPrice && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-4 h-4 text-amber-500" />
              <span className="font-bold text-gray-700 dark:text-gray-300">₪{view.effectivePrice}</span>
            </div>
          )}

          {group.rules ? <GroupRulesCard v2={v2} rules={group.rules} /> : null}

          <GroupOrganizerActions
            group={group}
            onEdit={onEdit && userId === group.createdBy ? () => { onEdit(group.id); onClose(); } : null}
            canManageSchedule={isCurrentUserAdmin && group.hasMeetups !== false && (group.scheduleSlots?.length ?? 0) > 0}
            scheduleMgrOpen={scheduleMgrOpen}
            editingSlotIndex={editingSlotIndex}
            onOpenScheduleMgr={() => { setScheduleMgrOpen(true); setEditingSlotIndex(null); }}
            onEditSlot={setEditingSlotIndex}
            onCloseScheduleMgr={closeScheduleMgr}
            showToast={showToast}
          />

          {showStartScheduledRun && <StartScheduledRunButton activity={scheduledRunActivity} onStart={handleStartScheduledRun} />}

          <GroupShareRow
            groupId={group.id}
            groupName={group.name}
            categoryLabel={catConfig.label}
            inviteCode={fetchedInviteCode}
            calendarUrl={view.calendarUrl}
          />

          {/* Invite code — private group members / creator; null code = not
              loaded yet or the rule denied the read → no panel. */}
          {!group.isPublic && (isJoined || isCreator) && fetchedInviteCode && (
            <InviteCodePanel code={fetchedInviteCode} groupName={group.name} inviteCopied={inviteCopied} setInviteCopied={setInviteCopied} />
          )}

          {isJoined && (
            <GroupMembershipActions
              startCtaShown={showStartScheduledRun}
              onOpenChat={onOpenChat ?? onClose}
              canLeave={!!onLeave}
              confirmLeave={join.confirmLeave}
              onAskLeave={() => join.setConfirmLeave(true)}
              onCancelLeave={() => join.setConfirmLeave(false)}
              leaving={!!join.leavingId}
              onConfirmLeave={join.handleConfirmLeave}
            />
          )}

          {group.registrationLink && <RegistrationLinkButton href={group.registrationLink} />}

          {!isJoined && onJoin && (
            <GroupJoinSection
              v2={v2}
              group={group}
              codeUnlocked={join.codeUnlocked}
              onAccessCodeSuccess={join.handleAccessCodeSuccess}
              inviteCodeMode={join.inviteCodeMode}
              onEnterInviteMode={() => join.setInviteCodeMode(true)}
              inviteInput={join.inviteInput}
              onInviteInputChange={join.handleInviteInputChange}
              inviteError={join.inviteError}
              inviteSubmitting={join.inviteSubmitting}
              onInviteSubmit={join.handleInviteCodeSubmit}
              onInviteCancel={join.cancelInviteMode}
              joining={joining}
              onJoin={() => onJoin(group.id)}
            />
          )}

          {/* Report link */}
          <button
            onClick={() => setReportOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-500 transition-colors"
          >
            <Flag className="w-3 h-3" />
            דיווח על תוכן לא ראוי
          </button>
        </div>
      </GroupSheetFrame>

      <GroupDrawerOverlays
        groupId={group.id}
        groupName={group.name}
        userId={userId}
        confirmRemove={members.confirmRemove}
        removing={!!members.removingUid}
        onCancelRemove={() => members.setConfirmRemove(null)}
        onConfirmRemove={members.confirmRemoveMember}
        navOpen={navOpen}
        onCloseNav={() => setNavOpen(false)}
        destLat={destLat}
        destLng={destLng}
        destAddress={destAddress}
        reportOpen={reportOpen}
        onCloseReport={() => setReportOpen(false)}
      />
    </>
  );
}

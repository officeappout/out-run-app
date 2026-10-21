'use client';

import { useState } from 'react';
import { bookSession } from '@/features/arena/services/booking.service';
import { setMyAttendeeStatus } from '@/features/arena/services/session-phase.service';
import { joinGroup } from '@/features/arena/services/group.service';
import type { UpcomingSession } from '@/features/arena/hooks/useCommunitySessionBanner';
import type { CommunityGroup } from '@/types/community.types';
import type { AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface UseGroupJoinActionsArgs {
  group: CommunityGroup | null;
  userId: string;
  userName: string;
  userPhoto: string | null;
  effectiveLiveSession: UpcomingSession | null | undefined;
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void | Promise<void>;
  onClose: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

/**
 * Joining paths that start inside the drawer: live-session drop-in (+ the
 * "join the group?" prompt after it), the private-group invite code, and
 * leaving with confirmation. (No hooks besides state — no effects.)
 */
export function useGroupJoinActions({ group, userId, userName, userPhoto, effectiveLiveSession, onJoin, onLeave, onClose, showToast }: UseGroupJoinActionsArgs) {
  const t = useT(community);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [codeUnlocked, setCodeUnlocked] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteError, setInviteError] = useState(false);
  const [inviteCodeMode, setInviteCodeMode] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [dropInLoading,  setDropInLoading]  = useState(false);
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const [joiningGroup,   setJoiningGroup]   = useState(false);

  const handleDropIn = async () => {
    if (!userId || !effectiveLiveSession || dropInLoading) return;
    setDropInLoading(true);
    try {
      await bookSession(
        group!.id, effectiveLiveSession.date, effectiveLiveSession.time,
        userId, userName, userPhoto,
        effectiveLiveSession.slot.maxParticipants,
        effectiveLiveSession.slot.workoutGoal,
      );
      await setMyAttendeeStatus(
        userId, group!.id,
        effectiveLiveSession.date, effectiveLiveSession.time,
        'here',
      );
      setShowJoinPrompt(true);
    } catch (err) {
      console.error('[GroupDetailsDrawer] handleDropIn:', err);
    } finally {
      setDropInLoading(false);
    }
  };

  const handleJoinFromPrompt = async () => {
    if (!userId || !group || joiningGroup) return;
    setJoiningGroup(true);
    try {
      await joinGroup(group.id, userId, userName);
      setShowJoinPrompt(false);
      onJoin?.(group.id);
    } catch (err) {
      console.error('[GroupDetailsDrawer] handleJoinFromPrompt:', err);
    } finally {
      setJoiningGroup(false);
    }
  };

  // SPEC-02 SEC-13: joining a locked group goes through joinGroup's
  // providedCode path, which validates the real code server-side
  // (/api/social/group-membership) before writing anything — never a
  // client-side compare (the member write without the code was always
  // denied by firestore.rules).
  const handleInviteCodeSubmit = async () => {
    if (!userId || !group || inviteSubmitting || !inviteInput.trim()) return;
    setInviteSubmitting(true);
    setInviteError(false);
    try {
      await joinGroup(group.id, userId, userName, { providedCode: inviteInput });
      setInviteCodeMode(false);
      setInviteInput('');
      onJoin?.(group.id);
    } catch {
      setInviteError(true);
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleConfirmLeave = async () => {
    if (!onLeave || !group) return;
    setLeavingId(group.id);
    try {
      await onLeave(group.id);
      setConfirmLeave(false);
      onClose();
    } catch {
      // handled upstream
    } finally {
      setLeavingId(null);
    }
  };

  const handleAccessCodeSuccess = (result: AccessCodeResult) => {
    if (!group || !onJoin) return;
    // SEC#1: the redeemed code must belong to THIS group's authority/tenant
    // (authorities/{id} ≡ tenants/{id}), or any valid tenant code would
    // unlock any locked group. Defense-in-depth — the members/{uid} rule is
    // the hard gate; this fails with an honest message instead of a silent
    // PERMISSION_DENIED (fail-open when authorityId is absent — the server
    // rule still backstops that edge case).
    if (group.authorityId && result.tenantId !== group.authorityId) {
      showToast('error', t('group.join.toast.wrongTenant'));
      return;
    }
    setCodeUnlocked(true);
    showToast('success', t('group.join.toast.welcome', { name: group.name }));
    onJoin(group.id);
  };

  const handleInviteInputChange = (value: string) => { setInviteInput(value.toUpperCase()); setInviteError(false); };
  const cancelInviteMode = () => { setInviteCodeMode(false); setInviteInput(''); setInviteError(false); };

  return {
    handleAccessCodeSuccess, handleInviteInputChange, cancelInviteMode,
    confirmLeave, setConfirmLeave, leavingId, handleConfirmLeave,
    codeUnlocked, setCodeUnlocked,
    inviteInput, setInviteInput, inviteError, setInviteError, inviteCodeMode, setInviteCodeMode, inviteSubmitting, handleInviteCodeSubmit,
    dropInLoading, showJoinPrompt, setShowJoinPrompt, joiningGroup, handleDropIn, handleJoinFromPrompt,
  };
}

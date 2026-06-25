'use client';

/**
 * InviteRunButton — floating "הזמן חבר" button for FreeRunActive.
 *
 * Visible in BOTH idle (pre-start) and active (mid-run) states so the host
 * can share an invite at any point. Positioned top-right at z-[51], above the
 * story bar (z-50) and well clear of WorkoutControlCluster (bottom).
 *
 * Fresh invite flow:
 *   1. Call createRunInvite(activityType) → API creates ephemeral group + triple-write
 *   2. Call startGroupSession() → host enters mode:'group' presence immediately
 *   3. navigator.share() or WhatsApp fallback
 *
 * Re-invite flow (host already in a group session):
 *   1. Call createRunInvite(activityType) → API issues new token for existing session
 *   2. startGroupSession() is NOT called (session already active)
 *   3. share()
 */

import { useState } from 'react';
import { UserPlus, Loader2 } from 'lucide-react';
import { createRunInvite } from '@/lib/workoutInvite';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { auth } from '@/lib/firebase';

interface InviteRunButtonProps {
  activityType?: 'running' | 'walking';
}

export default function InviteRunButton({ activityType = 'running' }: InviteRunButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleInvite = async () => {
    if (busy) return;
    setBusy(true);

    try {
      const { token: _token, shareUrl, groupId, attendanceId, isNewGroup } =
        await createRunInvite(activityType);

      // If this is a fresh invite (not re-invite), wire up the host's own
      // group session context so usePresenceLayer flips to mode:'group' now.
      // For re-invites the session is already active — skip to avoid reset.
      if (isNewGroup) {
        const user   = auth.currentUser;
        const uid    = user?.uid ?? '';
        const name   = user?.displayName ?? 'אני';
        const profiles = uid ? { [uid]: { name } } : {};
        useSharedSession
          .getState()
          .startGroupSession(groupId, attendanceId, uid ? [uid] : [], profiles, '');
      }

      // Share — native sheet first, WhatsApp fallback
      const text =
        activityType === 'walking'
          ? `בוא/י ללכת איתי עכשיו 🚶 ${shareUrl}`
          : `בוא/י לרוץ איתי עכשיו 🏃 ${shareUrl}`;

      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text }).catch(() => {
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch (err) {
      console.error('[InviteRunButton] invite failed:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleInvite}
      disabled={busy}
      aria-label="הזמן חבר לאימון"
      className="pointer-events-auto absolute flex items-center justify-center rounded-full active:scale-90 transition-transform disabled:opacity-60"
      style={{
        top:    'calc(env(safe-area-inset-top, 0px) + 12px)',
        right:  '12px',
        width:  44,
        height: 44,
        zIndex: 51,
        background:    'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      }}
    >
      {busy
        ? <Loader2 size={18} className="text-white animate-spin" />
        : <UserPlus size={18} className="text-white" strokeWidth={2} />
      }
    </button>
  );
}

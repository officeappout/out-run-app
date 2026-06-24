'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Users, Calendar, Clock } from 'lucide-react';
import {
  validateSessionInvitation,
  consumeSessionInvitation,
  type GroupInvitationDoc,
} from '@/features/arena/services/group-invitation.service';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { onAuthStateChange } from '@/lib/auth.service';

export default function SessionTokenPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === 'string' ? params.token : '';

  const [invitation, setInvitation] = useState<GroupInvitationDoc | null>(null);
  const [error, setError] = useState<'not_found' | 'expired' | 'max_uses_reached' | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token) { setError('not_found'); setLoading(false); return; }

    localStorage.setItem('pending_session_token', token);

    validateSessionInvitation(token)
      .then((result) => {
        if (result.valid) {
          setInvitation(result.doc);
        } else {
          setError(result.reason);
        }
      })
      .catch(() => setError('not_found'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = () => {
    if (!invitation || joining) return;
    setJoining(true);

    const unsub = onAuthStateChange(async (user) => {
      unsub();

      if (!user) {
        // Not signed in — localStorage key is already set; gateway will consume it post-auth
        router.push('/gateway');
        return;
      }

      try {
        const { groupId, attendanceId } = await consumeSessionInvitation(token, user.uid, {
          name: user.displayName ?? 'משתמש',
          ...(user.photoURL ? { photoURL: user.photoURL } : {}),
        });

        localStorage.removeItem('pending_session_token');

        // Set up group session context — onSnapshot will populate memberIds/profiles.
        // user_memberships is now confirmed written (consumeSessionInvitation succeeded),
        // so we can immediately ungate the presence query via setMembershipReady().
        useSharedSession.getState().joinViaDeepLink(
          groupId,
          attendanceId,
          [],
          {},
          invitation.groupName,
        );
        useSharedSession.getState().setMembershipReady();

        // Navigate to community page and open group drawer via ?groupId= deep-link support.
        // From the drawer the user sees the live session banner and can tap "הצטרף לאימון".
        router.push(`/community?groupId=${groupId}`);
      } catch (err) {
        console.error('[SessionTokenPage] consume failed:', err);
        if (err instanceof Error && err.message === 'invitation-expired') {
          setError('expired');
        } else {
          setError('not_found');
        }
        setJoining(false);
      }
    });
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  // ── Error states ─────────────────────────────────────────────────────────────
  if (error || !invitation) {
    const msg =
      error === 'expired' || error === 'max_uses_reached'
        ? 'הקישור פג תוקף'
        : 'הקישור אינו תקף';
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 px-6" dir="rtl">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <h1 className="text-white text-xl font-bold text-center">{msg}</h1>
        <p className="text-white/60 text-sm text-center">
          בקש מהמארח לשלוח קישור חדש
        </p>
        <button
          onClick={() => router.push('/map')}
          className="mt-4 bg-white text-black font-semibold rounded-2xl px-8 py-3 text-sm"
        >
          פתח את Out
        </button>
      </div>
    );
  }

  // ── Session preview ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col" dir="rtl">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center text-4xl">
          🏃
        </div>
        <div>
          <h1 className="text-white text-2xl font-black mb-1">{invitation.groupName}</h1>
          <p className="text-white/60 text-sm">הוזמנת להצטרף לאימון</p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <div className="flex items-center gap-3 bg-white/8 rounded-xl px-4 py-3">
            <Calendar className="w-4 h-4 text-white/60 flex-shrink-0" />
            <span className="text-white text-sm">{invitation.sessionDate}</span>
          </div>
          <div className="flex items-center gap-3 bg-white/8 rounded-xl px-4 py-3">
            <Clock className="w-4 h-4 text-white/60 flex-shrink-0" />
            <span className="text-white text-sm">{invitation.sessionTime}</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-12 pt-4">
        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full rounded-2xl py-4 text-black font-black text-lg disabled:opacity-50"
          style={{ background: '#FFFFFF' }}
        >
          {joining ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'הצטרפ/י לאימון'}
        </button>
      </div>
    </div>
  );
}

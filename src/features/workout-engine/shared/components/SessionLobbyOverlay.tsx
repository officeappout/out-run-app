'use client';

import { useEffect, useRef, useState } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { bookSession } from '@/features/arena/services/booking.service';
import { AnimatePresence, motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import {
  createSessionInvitation,
  type SessionMeta,
} from '@/features/arena/services/group-invitation.service';
import { setSessionPhase } from '@/features/arena/services/session-phase.service';

interface SessionLobbyOverlayProps {
  onStartFreeRun: () => void;
}

const COUNTDOWN_SECS = 3;

// Parse "YYYY-MM-DD_HH-mm" → { date: "YYYY-MM-DD", time: "HH:mm" }
function parseAttendanceId(id: string): { date: string; time: string } {
  const [date, timePart] = id.split('_');
  const time = (timePart ?? '').replace('-', ':');
  return { date: date ?? '', time };
}

export default function SessionLobbyOverlay({ onStartFreeRun }: SessionLobbyOverlayProps) {
  const profile = useUserStore((s) => s.profile);
  const uid = (profile as any)?.id as string | undefined;

  const { groupId, groupName, attendanceId, attendeeProfiles, phase } = useSharedSession();

  const [isHost, setIsHost] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const tokenCreatedRef = useRef(false);

  // Determine if this user is the group creator (host)
  useEffect(() => {
    if (!groupId || !uid) return;
    getDoc(doc(db, 'community_groups', groupId)).then((snap) => {
      if (!snap.exists()) return;
      const createdBy = snap.data().createdBy as string | undefined;
      setIsHost(createdBy === uid);
    });
  }, [groupId, uid]);

  // Host: create session invitation token once
  useEffect(() => {
    if (!isHost || !groupId || !attendanceId || tokenCreatedRef.current) return;
    tokenCreatedRef.current = true;

    const { date, time } = parseAttendanceId(attendanceId);
    const meta: SessionMeta = {
      sessionDate: date,
      sessionTime: time,
      groupName: groupName ?? '',
    };

    createSessionInvitation(groupId, attendanceId, uid!, meta)
      .then(({ url }) => setShareUrl(url))
      .catch((err) => console.warn('[SessionLobby] token creation failed:', err));
  }, [isHost, groupId, attendanceId, groupName, uid]);

  // Phase transition: lobby → active — start countdown
  useEffect(() => {
    if (phase !== 'active') return;
    setCountdown(COUNTDOWN_SECS);
  }, [phase]);

  // Countdown tick
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Handle host Start action
  const handleStart = async () => {
    if (!groupId || !attendanceId || !uid || starting) return;
    setStarting(true);
    try {
      const { date, time } = parseAttendanceId(attendanceId);
      // Ensure attendance doc exists before updateDoc in setSessionPhase.
      // bookSession is idempotent — safe to call even if the user already booked.
      await bookSession(groupId, date, time, uid, (profile as any)?.core?.name ?? '', (profile as any)?.core?.photoURL ?? null);
      await setSessionPhase(groupId, date, time, 'active', uid);
      // onSnapshot will fire → phase → 'active' → countdown begins
    } catch (err) {
      console.error('[SessionLobby] setSessionPhase failed:', err);
      setStarting(false);
    }
  };

  // Share link via navigator.share with WhatsApp fallback
  const handleShare = () => {
    if (!shareUrl) return;
    const text = `הצטרפו לאימון עם ${groupName ?? 'הקבוצה שלי'} ב-Out!`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: text, url: shareUrl }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`, '_blank');
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`, '_blank');
    }
  };

  // Roster: all members from attendeeProfiles
  const roster = Object.entries(attendeeProfiles).slice(0, 8);

  // Active phase: show "Start FreeRun" CTA (countdown or button)
  if (phase === 'active') {
    return (
      <div
        className="absolute inset-0 z-[60] flex flex-col items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.75)', direction: 'rtl' }}
      >
        <div className="text-center">
          {countdown !== null && countdown > 0 ? (
            <>
              <div className="text-7xl font-black text-white mb-2">{countdown}</div>
              <p className="text-white text-lg font-semibold">הקבוצה מתחילה!</p>
            </>
          ) : (
            <>
              <p className="text-white text-xl font-bold mb-6">🏃 בואו נרוץ!</p>
              <button
                onClick={onStartFreeRun}
                className="bg-white text-black font-black text-lg rounded-2xl px-10 py-4"
              >
                התחל ריצה
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Lobby phase
  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.80)', direction: 'rtl' }}
    >
      {/* Header */}
      <div className="px-5 pt-16 pb-4">
        <p className="text-white text-xs font-semibold tracking-widest uppercase opacity-60 mb-1">
          לובי
        </p>
        <h2 className="text-white text-2xl font-black">{groupName}</h2>
        <p className="text-white/60 text-sm mt-1">ממתינים להתחלה...</p>
      </div>

      {/* Roster */}
      <div className="flex-1 px-5 overflow-y-auto">
        <div className="flex flex-col gap-3">
          {roster.map(([memberId, p]) => (
            <div key={memberId} className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                aria-label={p.name}
              >
                {p.name.charAt(0)}
              </div>
              <span className="text-white font-medium text-sm">{p.name}</span>
              {memberId === uid && (
                <span className="text-white/50 text-xs">(את/ה)</span>
              )}
            </div>
          ))}
          {roster.length === 0 && (
            <p className="text-white/40 text-sm">אין משתתפים עדיין</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 pb-12 pt-4 flex flex-col gap-3">
        {isHost ? (
          <>
            {shareUrl && (
              <button
                onClick={handleShare}
                className="w-full rounded-2xl py-3 text-white font-semibold text-sm"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                שלח קישור הצטרפות 🔗
              </button>
            )}
            <button
              onClick={handleStart}
              disabled={starting}
              className="w-full rounded-2xl py-4 text-black font-black text-lg disabled:opacity-50"
              style={{ background: '#FFFFFF' }}
            >
              {starting ? '...' : 'התחל אימון'}
            </button>
          </>
        ) : (
          <div
            className="w-full rounded-2xl py-4 text-center text-white/60 text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            ממתינים שהמנהל יתחיל...
          </div>
        )}
      </div>
    </div>
  );
}

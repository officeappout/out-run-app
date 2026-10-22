'use client';

import { useState, useEffect, useCallback } from 'react';
import { bookSession, cancelBooking, leaveWaitlist, getSessionAttendance } from '@/features/arena/services/booking.service';
import type { ScheduleSlot, SessionAttendance } from '@/types/community.types';

interface UseNextSessionBookingArgs {
  isOpen: boolean;
  groupId: string;
  /** Next session date (YYYY-MM-DD), '' when none. */
  nsd: string;
  /** Next session time (HH:MM), '' when none. */
  nst: string;
  nextSlot: ScheduleSlot | null;
  userId: string;
  userName: string;
  userPhoto: string | null;
  /** enable_group_fixes_v1: transactional RSVP, re-read count, errors surfaced. */
  groupFixes?: boolean;
  /** Called (fixes on) when a book / cancel / waitlist action fails. */
  onError?: () => void;
}

/**
 * The next session's attendance (one read per open/session change) and the
 * viewer's book / waitlist / cancel toggle, with optimistic count updates.
 */
export function useNextSessionBooking({ isOpen, groupId, nsd, nst, nextSlot, userId, userName, userPhoto, groupFixes = false, onError }: UseNextSessionBookingArgs) {
  const [bookingLoading, setBookingLoading] = useState(false);
  const [attendance, setAttendance] = useState<SessionAttendance | null>(null);
  const [isBooked, setIsBooked] = useState(false);
  const [isWaitlisted, setIsWaitlisted] = useState(false);

  useEffect(() => {
    if (!isOpen || !groupId || !nsd || !nst) {
      setAttendance(null);
      setIsBooked(false);
      setIsWaitlisted(false);
      return;
    }
    let cancelled = false;
    getSessionAttendance(groupId, nsd, nst).then((data) => {
      if (cancelled) return;
      setAttendance(data);
      setIsBooked(data?.attendees?.includes(userId) ?? false);
      setIsWaitlisted(data?.waitlist?.includes(userId) ?? false);
    });
    return () => { cancelled = true; };
  }, [isOpen, groupId, nsd, nst, userId]);

  const handleBookSession = useCallback(async () => {
    if (!userId || !groupId || !nsd || !nst || bookingLoading) return;
    setBookingLoading(true);
    try {
      if (isBooked) {
        await cancelBooking(groupId, nsd, nst, userId);
        setIsBooked(false);
        setAttendance((prev) =>
          prev ? { ...prev, currentCount: Math.max(0, prev.currentCount - 1), attendees: prev.attendees.filter((a) => a !== userId) } : null,
        );
      } else if (isWaitlisted) {
        await leaveWaitlist(groupId, nsd, nst, userId);
        setIsWaitlisted(false);
        setAttendance((prev) =>
          prev ? { ...prev, waitlist: (prev.waitlist ?? []).filter((w) => w !== userId) } : null,
        );
      } else {
        const slotArgs = [nextSlot?.maxParticipants, nextSlot?.workoutGoal] as const;
        // Flag off: the exact legacy 8-argument call (parity-pinned).
        const result = groupFixes
          ? await bookSession(groupId, nsd, nst, userId, userName, userPhoto, ...slotArgs, { transactional: true })
          : await bookSession(groupId, nsd, nst, userId, userName, userPhoto, ...slotArgs);
        if (!result.success && groupFixes) onError?.();
        if (result.success) {
          if (result.waitlisted) {
            setIsWaitlisted(true);
            setAttendance((prev) =>
              prev
                ? { ...prev, waitlist: [...(prev.waitlist ?? []), userId] }
                : { groupId, date: nsd, time: nst, attendees: [], currentCount: 0, waitlist: [userId] },
            );
          } else {
            setIsBooked(true);
            setAttendance((prev) =>
              prev
                ? { ...prev, currentCount: prev.currentCount + 1, attendees: [...prev.attendees, userId] }
                : { groupId, date: nsd, time: nst, attendees: [userId], currentCount: 1 },
            );
          }
        }
      }
      // Fixes on: the optimistic count is replaced by the real doc (other
      // members' RSVPs, joins via a session link).
      if (groupFixes) {
        const fresh = await getSessionAttendance(groupId, nsd, nst);
        if (fresh) setAttendance(fresh);
      }
    } catch (err) {
      console.error('[GroupDetailsDrawer] booking failed:', err);
      if (groupFixes) onError?.();
    } finally {
      setBookingLoading(false);
    }
  }, [userId, userName, userPhoto, groupId, nsd, nst, bookingLoading, isBooked, isWaitlisted, nextSlot, groupFixes, onError]);

  return { attendance, isBooked, isWaitlisted, bookingLoading, handleBookSession };
}

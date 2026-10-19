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
}

/**
 * The next session's attendance (one read per open/session change) and the
 * viewer's book / waitlist / cancel toggle, with optimistic count updates.
 */
export function useNextSessionBooking({ isOpen, groupId, nsd, nst, nextSlot, userId, userName, userPhoto }: UseNextSessionBookingArgs) {
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
        const result = await bookSession(
          groupId, nsd, nst,
          userId, userName, userPhoto,
          nextSlot?.maxParticipants,
          nextSlot?.workoutGoal,
        );
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
    } catch (err) {
      console.error('[GroupDetailsDrawer] booking failed:', err);
    } finally {
      setBookingLoading(false);
    }
  }, [userId, userName, userPhoto, groupId, nsd, nst, bookingLoading, isBooked, isWaitlisted, nextSlot]);

  return { attendance, isBooked, isWaitlisted, bookingLoading, handleBookSession };
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSessionAttendance } from '@/features/arena/services/booking.service';
import type { CommunityGroup, ScheduleSlot, SessionAttendance } from '@/types/community.types';
import { computeWeekSessions } from '../utils/group-details-logic';

export type WhoTab = 'next' | 'week';
export type WeekSession = { date: string; time: string; slot: ScheduleSlot; attendance: SessionAttendance | null };

/**
 * "מי מגיע" tabs. The week tab lazy-loads each of the week's sessions'
 * attendance once (on first open of the tab); everything resets when the
 * group changes.
 */
export function useWeekSessions(groupId: string, group: CommunityGroup | null) {
  const [whoTab, setWhoTab] = useState<WhoTab>('next');
  const [weekSessions, setWeekSessions] = useState<WeekSession[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekLoaded, setWeekLoaded] = useState(false);

  // Reset "מי מגיע" week state when the group changes
  useEffect(() => {
    setWhoTab('next');
    setWeekSessions([]);
    setWeekLoaded(false);
  }, [groupId]);

  const loadWeekSessions = useCallback(async () => {
    if (!groupId || weekLoaded || weekLoading) return;
    const slots = group?.scheduleSlots?.length
      ? group.scheduleSlots
      : group?.schedule ? [group.schedule] : [];
    const sessions = computeWeekSessions(slots);
    setWeekLoading(true);
    try {
      const withAttendance = await Promise.all(
        sessions.map(async (s) => ({
          ...s,
          attendance: await getSessionAttendance(groupId, s.date, s.time).catch(() => null),
        })),
      );
      setWeekSessions(withAttendance);
    } finally {
      setWeekLoaded(true);
      setWeekLoading(false);
    }
  }, [groupId, group, weekLoaded, weekLoading]);

  return { whoTab, setWhoTab, weekSessions, weekLoading, loadWeekSessions };
}
